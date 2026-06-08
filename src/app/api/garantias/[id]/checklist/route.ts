import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_GARANTIAS, TBL_MONTADORAS } from '@/lib/garantias/constants';
import { registrarEvento } from '@/lib/garantias/server';

// PATCH /api/garantias/[id]/checklist
// Salva montadora, respostas do checklist e valores do garantista.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const { data: garantia } = await supabase
    .from(TBL_GARANTIAS)
    .select('id, status, montadora_id, checklist_snapshot')
    .eq('id', id)
    .maybeSingle();
  if (!garantia) return NextResponse.json({ error: 'Garantia não encontrada.' }, { status: 404 });

  // Garantias finalizadas (aprovada/rejeitada) só permitem AJUSTAR a montadora,
  // pra corrigir caso o garantista tenha esquecido — relatórios atualizam,
  // mas o resto do snapshot/respostas/valores fica intacto.
  const finalizada = garantia.status === 'aprovada' || garantia.status === 'rejeitada';
  if (finalizada) {
    const camposPermitidos = ['montadora_id', 'garantista_nome'];
    const camposEnviados = Object.keys(body).filter(k => k !== undefined && body[k] !== undefined);
    const bloqueados = camposEnviados.filter(k => !camposPermitidos.includes(k));
    if (bloqueados.length > 0) {
      return NextResponse.json(
        { error: `Garantia já finalizada. Só dá pra ajustar a montadora aqui. Bloqueado: ${bloqueados.join(', ')}.` },
        { status: 400 }
      );
    }
  } else if (!['em_analise', 'bo_tecnico', 'enviada', 'info_pendente'].includes(garantia.status)) {
    return NextResponse.json(
      { error: 'O checklist só pode ser editado durante a análise ou aguardando fábrica.' },
      { status: 400 }
    );
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  // Troca/definição da montadora -> congela o snapshot do checklist
  if (body.montadora_id !== undefined && body.montadora_id !== garantia.montadora_id) {
    update.montadora_id = body.montadora_id || null;
    if (body.montadora_id) {
      const { data: mont } = await supabase
        .from(TBL_MONTADORAS)
        .select('checklist_def')
        .eq('id', body.montadora_id)
        .maybeSingle();
      update.checklist_snapshot = mont?.checklist_def || [];
      // Ao trocar de montadora, zera respostas antigas — exceto em finalizadas,
      // onde preservamos o histórico (garantista só quer corrigir a montadora).
      if (!finalizada) update.checklist_respostas = {};
    } else {
      update.checklist_snapshot = null;
    }
  }

  if (body.checklist_respostas !== undefined && update.checklist_respostas === undefined) {
    update.checklist_respostas = body.checklist_respostas || {};
  }
  if (body.garantista_horas !== undefined) {
    update.garantista_horas = body.garantista_horas === '' ? null : Number(body.garantista_horas);
  }
  if (body.garantista_km !== undefined) {
    update.garantista_km = body.garantista_km === '' ? null : Number(body.garantista_km);
  }
  if (body.garantista_obs !== undefined) update.garantista_obs = body.garantista_obs || null;
  if (body.garantista_nome !== undefined) update.garantista_nome = body.garantista_nome || null;

  const { data, error } = await supabase
    .from(TBL_GARANTIAS)
    .update(update)
    .eq('id', id)
    .select('*, montadora:garantia_montadoras(*)')
    .single();

  if (error) {
    console.error('Erro ao salvar checklist:', error.message);
    return NextResponse.json({ error: 'Falha ao salvar o checklist.' }, { status: 500 });
  }

  await registrarEvento(id, {
    tipo: 'checklist_salvo',
    ator: body.garantista_nome || 'Garantista',
    detalhe: 'Checklist atualizado',
  });

  // Quando a montadora muda (ou é definida pela primeira vez), sincroniza
  // o nCodProj da OS no Omie pra "{Montadora}-pgo". Best-effort — só
  // dispara se a OS já estiver no Omie e houver projeto correspondente.
  if (
    body.montadora_id !== undefined &&
    body.montadora_id !== garantia.montadora_id &&
    body.montadora_id
  ) {
    try {
      const { sincronizarProjetoMontadoraNoOmie } = await import('@/lib/garantias/omie-faturamento');
      const montadora = (data as { id_ordem?: string; montadora?: { nome?: string } }).montadora;
      const idOrdem = (data as { id_ordem?: string }).id_ordem || '';
      if (montadora?.nome && idOrdem) {
        const resp = await sincronizarProjetoMontadoraNoOmie({ idOrdem, montadoraNome: montadora.nome });
        await registrarEvento(id, {
          tipo: resp.ok ? 'omie_projeto_sincronizado' : 'omie_projeto_erro',
          ator: body.garantista_nome || 'Garantista',
          detalhe: resp.ok
            ? `Projeto da OS no Omie atualizado pra ${montadora.nome}-pgo.`
            : `Falha ao atualizar projeto no Omie: ${resp.motivo}`,
        });
      }
    } catch (err) {
      console.warn('[garantias] sincronizar projeto Omie falhou:', err);
    }
  }

  return NextResponse.json({ garantia: data });
}
