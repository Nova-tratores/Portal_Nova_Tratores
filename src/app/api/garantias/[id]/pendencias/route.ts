import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_GAR_PEND, TBL_GAR_ANEXOS } from '@/lib/garantias/constants';
import { registrarEvento, notificarTecnico } from '@/lib/garantias/server';

// GET /api/garantias/[id]/pendencias
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabase
    .from(TBL_GAR_PEND)
    .select('*')
    .eq('garantia_id', id)
    .order('created_at');
  if (error) return NextResponse.json({ error: 'Falha ao listar pendências.' }, { status: 500 });
  return NextResponse.json({ pendencias: data || [] });
}

// POST /api/garantias/[id]/pendencias — garantista abre B.O. ou pendência da fábrica
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const tipo = body.tipo === 'info_fabrica' ? 'info_fabrica' : 'bo';
  const descricao = String(body.descricao || '').trim();
  if (!descricao) {
    return NextResponse.json({ error: 'Descreva o que está faltando.' }, { status: 400 });
  }

  const { data: g } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, numero, status, id_ordem, tecnico_nome')
    .eq('id', id)
    .maybeSingle();
  if (!g) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  // B.O. exige garantia em análise; pendência da fábrica exige garantia na
  // fábrica (peças ou ressarcimento, no fluxo em duas etapas)
  if (tipo === 'bo' && g.status !== 'em_analise') {
    return NextResponse.json({ error: 'B.O. só pode ser aberto durante a análise.' }, { status: 400 });
  }
  if (tipo === 'info_fabrica' && !['enviada', 'ressarcimento_fabrica'].includes(g.status)) {
    return NextResponse.json(
      { error: 'Pendência da fábrica só pode ser aberta quando a garantia está na fábrica.' },
      { status: 400 }
    );
  }

  // Apenas uma pendência aberta por vez
  const { data: aberta } = await supabase
    .from(TBL_GAR_PEND)
    .select('id')
    .eq('garantia_id', id)
    .eq('status', 'aberta')
    .limit(1);
  if (aberta && aberta.length > 0) {
    return NextResponse.json({ error: 'Já existe uma pendência aberta para esta garantia.' }, { status: 409 });
  }

  const { data: pendencia, error } = await supabase
    .from(TBL_GAR_PEND)
    .insert({
      garantia_id: id,
      tipo,
      descricao,
      exige_visita: !!body.exige_visita,
      criado_por: body.criado_por || 'Garantista',
      // Para onde a garantia volta quando a pendência for respondida
      // (info_fabrica aberta no ressarcimento volta pra ressarcimento_fabrica)
      status_retorno: tipo === 'bo' ? 'em_analise' : g.status,
    })
    .select()
    .single();
  if (error) {
    console.error('Erro ao criar pendência:', error.message);
    return NextResponse.json({ error: 'Falha ao criar pendência.' }, { status: 500 });
  }

  // Vincula anexos enviados pelo garantista junto com o pedido
  if (Array.isArray(body.anexo_ids) && body.anexo_ids.length > 0) {
    await supabase
      .from(TBL_GAR_ANEXOS)
      .update({ pendencia_id: pendencia.id, categoria: 'pendencia_pedido' })
      .in('id', body.anexo_ids);
  }

  const novoStatus = tipo === 'bo' ? 'bo_tecnico' : 'info_pendente';
  await supabase
    .from(TBL_GARANTIAS)
    .update({ status: novoStatus, updated_at: new Date().toISOString() })
    .eq('id', id);

  await registrarEvento(id, {
    tipo: tipo === 'bo' ? 'bo_aberta' : 'info_pendente',
    statusAnterior: g.status,
    statusNovo: novoStatus,
    ator: body.criado_por || 'Garantista',
    detalhe: descricao,
  });
  await notificarTecnico(g.tecnico_nome, {
    titulo:
      tipo === 'bo'
        ? `Garantia ${g.numero} devolvida (B.O.)`
        : `Fábrica solicitou informações — ${g.numero}`,
    descricao: descricao.slice(0, 140),
  });

  return NextResponse.json({ pendencia, status: novoStatus });
}
