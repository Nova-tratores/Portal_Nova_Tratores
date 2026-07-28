import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_ANEXOS, BUCKET_GARANTIAS } from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';
import { baixarUrl, sanitizeFileName } from '@/lib/garantias/email';

// NF de venda do equipamento — localizada pelo CHASSI da garantia.
// Caminho: chassi → portal_nt_projetos_chassis (projeto/empresa) →
// portal_nt_clientes_os / portal_nt_clientes_pv com link_nf (mesma agregação
// do módulo Clientes em /api/clientes/projeto).

interface CandidatoNF {
  tipo: 'NF-e' | 'NFS-e';
  origem: string;
  numero: string;
  link: string;
  valor: number;
  data: string;
  empresa: string;
  projeto: string;
}

// GET /api/garantias/[id]/nf-venda — lista candidatos de NF pelo chassi
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, chassis')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  const chassi = String(g.chassis || '').trim();
  if (!chassi) {
    return NextResponse.json(
      { error: 'Garantia sem chassi — preencha o chassi para buscar a NF de venda.' },
      { status: 400 }
    );
  }

  // Chassi → projeto/empresa (match parcial: chassi da garantia pode vir com
  // modelo colado ou caixa diferente)
  const { data: vinculos } = await supabase
    .from('portal_nt_projetos_chassis')
    .select('projeto, empresa, chassis')
    .ilike('chassis', `%${chassi.slice(-8)}%`);

  const pares = [...new Map((vinculos || []).map((v) => [`${v.projeto}|${v.empresa}`, v])).values()];
  if (pares.length === 0) {
    return NextResponse.json({ candidatos: [], aviso: 'Nenhum projeto encontrado para este chassi.' });
  }

  const candidatos: CandidatoNF[] = [];
  for (const par of pares.slice(0, 4)) {
    // OS do projeto com NF
    const { data: osDoProj } = await supabase
      .from('portal_nt_clientes_os')
      .select('num_os, num_pedido_cli, empresa, data_previsao, data_faturamento, valor_total, faturada, cancelada, num_nf, link_nf')
      .eq('empresa', par.empresa)
      .eq('projeto', par.projeto)
      .order('data_previsao', { ascending: false })
      .limit(200);

    for (const os of osDoProj || []) {
      if (os.faturada && !os.cancelada && os.link_nf) {
        candidatos.push({
          tipo: 'NFS-e',
          origem: `Ordem de Serviço ${os.num_os}`,
          numero: os.num_nf || '',
          link: os.link_nf,
          valor: Number(os.valor_total) || 0,
          data: os.data_faturamento || os.data_previsao || '',
          empresa: par.empresa,
          projeto: par.projeto,
        });
      }
    }

    // PVs vinculados (num_pedido_cli pode vir "CASTRO 4090", "3167(CASTRO)"...)
    const pedidoPares = (osDoProj || [])
      .map((o) => {
        const txt = String(o.num_pedido_cli || '');
        const num = (txt.match(/\d+/g) || []).join('');
        const emp = /castro/i.test(txt) ? 'Castro Pecas' : (o.empresa || par.empresa);
        return { num, emp };
      })
      .filter((p) => p.num);
    const numPedidos = [...new Set(pedidoPares.map((p) => p.num))];
    if (numPedidos.length > 0) {
      const { data: pvs } = await supabase
        .from('portal_nt_clientes_pv')
        .select('num_pedido, empresa, data_previsao, valor_total, faturado, cancelado, numero_nf, link_nf')
        .in('num_pedido', numPedidos);
      const querer = new Set(pedidoPares.map((p) => `${p.num}|${p.emp}`));
      for (const pv of pvs || []) {
        if (!querer.has(`${pv.num_pedido}|${pv.empresa}`)) continue;
        if (pv.faturado && !pv.cancelado && pv.link_nf) {
          candidatos.push({
            tipo: 'NF-e',
            origem: `Pedido de Venda ${pv.num_pedido}`,
            numero: pv.numero_nf || '',
            link: pv.link_nf,
            valor: Number(pv.valor_total) || 0,
            data: pv.data_previsao || '',
            empresa: pv.empresa,
            projeto: par.projeto,
          });
        }
      }
    }
  }

  // NF-e de Pedido de Venda primeiro (é a venda do equipamento); depois maior valor
  candidatos.sort((a, b) => {
    if (a.tipo !== b.tipo) return a.tipo === 'NF-e' ? -1 : 1;
    return (b.valor || 0) - (a.valor || 0);
  });

  return NextResponse.json({ candidatos });
}

// POST /api/garantias/[id]/nf-venda — baixa a NF escolhida e anexa na garantia
// body: { link, numero?, ator }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const link = String(body.link || '').trim();
  const ator = body.ator || 'Garantista';
  if (!link) return NextResponse.json({ error: 'Informe o link da NF.' }, { status: 400 });

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  // Baixa e guarda no bucket (o link externo da Omie pode expirar)
  const buf = await baixarUrl(link);
  if (!buf) {
    return NextResponse.json(
      { error: 'Não consegui baixar a NF por esse link — anexe o PDF manualmente.' },
      { status: 400 }
    );
  }
  // link_nf de NFS-e frequentemente aponta pro PORTAL (HTML), não pro PDF —
  // mesma checagem de magic bytes usada em clientes/anexar e sync-nfs.
  const ehPdf = buf.length >= 100 && buf.slice(0, 5).toString('latin1').startsWith('%PDF');
  if (!ehPdf) {
    return NextResponse.json(
      { error: 'Esse link não devolve um PDF (provável portal da NFS-e) — baixe a nota e anexe o PDF manualmente.' },
      { status: 400 }
    );
  }

  const numero = String(body.numero || '').trim();
  const nomeArquivo = sanitizeFileName(`NF_venda${numero ? `_${numero}` : ''}_${g.numero}.pdf`);
  const storagePath = `${id}/nf_venda/${Date.now()}_${nomeArquivo}`;
  const { error: upErr } = await supabase.storage
    .from(BUCKET_GARANTIAS)
    .upload(storagePath, buf, { contentType: 'application/pdf', upsert: true });
  if (upErr) {
    console.error('Erro no upload da NF de venda:', upErr.message);
    return NextResponse.json({ error: 'Falha ao salvar a NF no storage.' }, { status: 500 });
  }
  const { data: pub } = supabase.storage.from(BUCKET_GARANTIAS).getPublicUrl(storagePath);

  const { data: anexo, error: insErr } = await supabase
    .from(TBL_GAR_ANEXOS)
    .insert({
      garantia_id: id,
      categoria: 'nf_venda',
      url: pub.publicUrl,
      nome_arquivo: nomeArquivo,
      content_type: 'application/pdf',
      enviado_por: ator,
    })
    .select()
    .single();
  if (insErr) {
    console.error('Erro ao registrar NF de venda:', insErr.message);
    return NextResponse.json({ error: 'Falha ao registrar a NF de venda.' }, { status: 500 });
  }

  await registrarEvento(id, {
    tipo: 'nf_venda_anexada',
    ator,
    detalhe: `NF de venda anexada${numero ? ` (nº ${numero})` : ''} — busca pelo chassi`,
  });

  return NextResponse.json({ ok: true, url: pub.publicUrl, nome: nomeArquivo, anexo });
}
