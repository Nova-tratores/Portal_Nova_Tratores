import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PECAS } from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';
import { formatarTextosSG } from '@/lib/garantias/sg-textos';

// POST /api/garantias/[id]/formatar-textos — roda o Tratorilson sob demanda:
// formata Reclamação/Diagnóstico/Ação/Observações a partir do relato cru da OS
// e salva em checklist_respostas.sg_* (mesmas chaves usadas pela SG Mahindra e
// pelo e-mail de solicitação/RAT do fluxo Ipacol).
// body: { ator?, forcar?: boolean }  — forcar=true regenera mesmo já preenchido.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ator = body.ator || 'Garantista';
  const forcar = body.forcar === true;

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, id_ordem, modelo, checklist_respostas, status')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });
  if (g.status === 'aprovada' || g.status === 'rejeitada') {
    return NextResponse.json({ error: 'Garantia já finalizada.' }, { status: 400 });
  }

  const respostas = ((g.checklist_respostas as Record<string, unknown>) || {});
  const jaTem =
    String(respostas['sg_reclamacao'] || '').trim() ||
    String(respostas['sg_diagnostico'] || '').trim() ||
    String(respostas['sg_acao_tomada'] || '').trim();
  if (jaTem && !forcar) {
    return NextResponse.json({
      ok: true,
      jaExistia: true,
      textos: {
        reclamacao: respostas['sg_reclamacao'] || '',
        diagnostico: respostas['sg_diagnostico'] || '',
        acao_tomada: respostas['sg_acao_tomada'] || '',
        observacoes: respostas['sg_observacoes'] || '',
      },
    });
  }

  const [osRes, tecRes, pecasRes, reqsRes] = await Promise.all([
    supabase
      .from('Ordem_Servico')
      .select('Serv_Solicitado')
      .eq('Id_Ordem', g.id_ordem)
      .maybeSingle(),
    supabase
      .from('Ordem_Servico_Tecnicos')
      .select('Motivo, ServicoRealizado')
      .eq('Ordem_Servico', g.id_ordem)
      .maybeSingle(),
    supabase.from(TBL_GAR_PECAS).select('descricao, cod_produto').eq('garantia_id', id),
    supabase
      .from('Requisicao')
      .select('id, titulo')
      .eq('ordem_servico', g.id_ordem)
      .not('status', 'in', '("lixeira","cancelada")'),
  ]);

  const pecas = (pecasRes.data || []) as { descricao: string; cod_produto: string | null }[];
  const reqs = (reqsRes.data || []) as { id: number; titulo: string | null }[];
  // Só entram como "serviços de terceiros" as requisições CASADAS com as peças
  // da garantia (cod REQ-<id> ou descrição igual/contida) — igual ao enviar-sg.
  // Senão a Requisição automática de Alimentação da OS contamina o relato.
  const norm = (s: string) => s.trim().toLowerCase();
  const reqIdsDasPecas = new Set(
    pecas
      .map((p) => String(p.cod_produto || '').match(/^REQ-(\d+)/i)?.[1])
      .filter(Boolean)
      .map((n) => Number(n)),
  );
  const descricoesPecas = pecas.map((p) => norm(String(p.descricao || ''))).filter(Boolean);
  const servicosTerceiros = reqs
    .filter((r) => {
      if (reqIdsDasPecas.has(r.id)) return true;
      const t = norm(String(r.titulo || ''));
      if (!t) return false;
      return descricoesPecas.some((d) => d === t || d.includes(t) || t.includes(d));
    })
    .map((r) => String(r.titulo || '').trim())
    .filter(Boolean);

  try {
    const textos = await formatarTextosSG({
      reclamacaoBruta: osRes.data?.Serv_Solicitado || null,
      diagnosticoBruto: tecRes.data?.Motivo || null,
      acaoBruta: tecRes.data?.ServicoRealizado || null,
      pecas: pecas
        .filter((p) => !String(p.cod_produto || '').startsWith('REQ-'))
        .map((p) => String(p.descricao || '').trim())
        .filter(Boolean),
      servicosTerceiros,
      modelo: g.modelo,
    });

    await supabase
      .from(TBL_GARANTIAS)
      .update({
        checklist_respostas: {
          ...respostas,
          sg_reclamacao: textos.reclamacao,
          sg_diagnostico: textos.diagnostico,
          sg_acao_tomada: textos.acao_tomada,
          sg_observacoes: textos.observacoes || '',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    await registrarEvento(id, {
      tipo: 'sg_textos_formatados',
      ator,
      detalhe: forcar
        ? 'Textos regenerados pelo Tratorilson a pedido do garantista.'
        : 'Textos formatados pelo Tratorilson (revisáveis antes do envio).',
    });

    return NextResponse.json({ ok: true, textos });
  } catch (e) {
    console.warn('[garantias] Tratorilson indisponível:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: 'O Tratorilson não conseguiu formatar agora — edite os textos manualmente ou tente de novo.' },
      { status: 502 }
    );
  }
}
