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

  if (!['em_analise', 'bo_tecnico'].includes(garantia.status)) {
    return NextResponse.json(
      { error: 'O checklist só pode ser editado durante a análise da garantia.' },
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
      // Ao trocar de montadora, zera respostas antigas
      update.checklist_respostas = {};
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

  return NextResponse.json({ garantia: data });
}
