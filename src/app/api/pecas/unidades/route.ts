// Rastreio de peças por unidade — criação em lote (na impressão da etiqueta)
// e listagem da fila. Escrita SÓ aqui (service role); ver sql/create-peca-unidades.sql.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabase } from '@/lib/pos/supabase';
import { exigirPermissao } from '@/lib/ajustes/permissao-server';
import { exigirSessao } from '@/lib/pecas/unidades-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const httpDe = (e: unknown) => (e as { http?: number })?.http || 500;

interface EtiquetaPayload {
  conta_omie: string;
  codigo: string;
  descricao?: string;
  locacao?: string;
  alt_conta_omie?: string;
  alt_codigo?: string;
  alt_descricao?: string;
  alt_locacao?: string;
}

// POST { etiquetas: EtiquetaPayload[] } — UMA por etiqueta física (cópias já
// expandidas no cliente). Responde { lote_id, unidades: [{id, numero}] } NA
// MESMA ORDEM do request (o cliente casa QR ↔ etiqueta por índice).
export async function POST(req: NextRequest) {
  try {
    const quem = await exigirPermissao(req, 'ppv', 'etiquetas');
    const body = await req.json().catch(() => ({}));
    const etiquetas: EtiquetaPayload[] = Array.isArray(body.etiquetas) ? body.etiquetas : [];

    if (etiquetas.length === 0) return NextResponse.json({ error: 'Nenhuma etiqueta enviada.' }, { status: 400 });
    if (etiquetas.length > 200) return NextResponse.json({ error: 'Máximo de 200 etiquetas por impressão.' }, { status: 400 });
    for (const e of etiquetas) {
      if (!String(e.codigo || '').trim() || !String(e.conta_omie || '').trim()) {
        return NextResponse.json({ error: 'Etiqueta sem código ou empresa.' }, { status: 400 });
      }
    }

    const loteId = randomUUID();
    const linhas = etiquetas.map((e) => ({
      lote_id: loteId,
      conta_omie: String(e.conta_omie).trim().toUpperCase(),
      codigo: String(e.codigo).trim(),
      descricao: String(e.descricao || '').trim(),
      locacao: String(e.locacao || '').trim(),
      alt_conta_omie: e.alt_conta_omie ? String(e.alt_conta_omie).trim().toUpperCase() : null,
      alt_codigo: e.alt_codigo ? String(e.alt_codigo).trim() : null,
      alt_descricao: e.alt_descricao ? String(e.alt_descricao).trim() : null,
      alt_locacao: e.alt_locacao ? String(e.alt_locacao).trim() : null,
      status: 'estoque',
      criado_por: quem.id,
      criado_por_nome: quem.nome || quem.email || '',
    }));

    // devolve também o codigo pra o cliente CONFERIR o pareamento etiqueta↔QR
    // por índice (se a ordem do RETURNING um dia mudar, a impressão aborta em
    // vez de colar o QR da peça errada)
    const { data: criadas, error } = await supabase
      .from('peca_unidades')
      .insert(linhas)
      .select('id, numero, codigo');
    if (error || !criadas) {
      return NextResponse.json({ error: `Falha ao registrar unidades: ${error?.message}` }, { status: 500 });
    }

    await supabase.from('peca_unidade_eventos').insert(
      criadas.map((u: any) => ({
        unidade_id: u.id,
        autor_id: quem.id,
        autor_nome: quem.nome || quem.email || '',
        tipo: 'criacao',
        de_status: null,
        para_status: 'estoque',
        payload: { lote_id: loteId },
      })),
    );

    return NextResponse.json({ lote_id: loteId, unidades: criadas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: httpDe(e) });
  }
}

// GET — fila/listagem. Filtros: status (CSV), q (numero/codigo/descricao),
// destino_os, destino_ppv, limit/offset. ?count=1 devolve só a contagem.
// Consulta POR OS (?destino_os=) ou POR PPV (?destino_ppv=) só exige sessão —
// os cards "Peças rastreadas" (OSDrawer/PPVDrawer) e a tela de liberação são
// usados por gente sem o módulo ppv completo. A fila completa passa com ppv
// puro OU o granular rastreio_liberar (sem a ação, quem tem SÓ
// 'ppv:rastreio_liberar' levava 403 numa tela feita pra ele).
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const status = (sp.get('status') || '').split(',').map((s) => s.trim()).filter(Boolean);
    const q = (sp.get('q') || '').trim().replace(/[,()]/g, ' ').trim();
    const destinoOs = (sp.get('destino_os') || '').trim();
    const destinoPpv = (sp.get('destino_ppv') || '').trim();
    // branch decidido pelos valores TRIMADOS — com o cru, ?destino_ppv=%20
    // passava só com sessão e o filtro (vazio) devolvia a fila inteira
    if (destinoOs || destinoPpv) {
      await exigirSessao(req);
    } else {
      await exigirPermissao(req, 'ppv', 'rastreio_liberar');
    }
    const soCount = sp.get('count') === '1';
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '100', 10) || 100, 1), 200);
    const offset = Math.max(parseInt(sp.get('offset') || '0', 10) || 0, 0);

    let qy = supabase
      .from('peca_unidades')
      .select(soCount ? 'id' : '*', { count: 'exact', head: soCount });
    if (status.length) qy = qy.in('status', status);
    if (destinoOs) qy = qy.eq('destino_os', destinoOs);
    if (destinoPpv) qy = qy.eq('destino_ppv', destinoPpv);
    if (q) qy = qy.or(`numero.ilike.%${q}%,codigo.ilike.%${q}%,descricao.ilike.%${q}%,alt_codigo.ilike.%${q}%,retirado_por_nome.ilike.%${q}%`);

    const { data, error, count } = await qy
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (soCount) return NextResponse.json({ total: count || 0 });
    return NextResponse.json({ unidades: data || [], total: count ?? (data || []).length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: httpDe(e) });
  }
}

// DELETE ?lote_id= — ROLLBACK de impressão que falhou (QR não gerou / janela
// fechou): apaga só unidades do lote ainda intocadas ('estoque'). Sem isso, a
// falha deixava órfãs que duplicavam a cada nova tentativa.
export async function DELETE(req: NextRequest) {
  try {
    await exigirPermissao(req, 'ppv', 'etiquetas');
    const loteId = (req.nextUrl.searchParams.get('lote_id') || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(loteId)) {
      return NextResponse.json({ error: 'lote_id inválido.' }, { status: 400 });
    }
    const { data, error } = await supabase
      .from('peca_unidades')
      .delete()
      .eq('lote_id', loteId)
      .eq('status', 'estoque')
      .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ removidas: (data || []).length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'erro' }, { status: httpDe(e) });
  }
}
