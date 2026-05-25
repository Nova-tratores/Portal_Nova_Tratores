import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/pos/supabase';
import { TBL_MONTADORAS, TBL_GARANTIAS } from '@/lib/garantias/constants';

// PATCH /api/garantias/montadoras/[id]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.nome !== undefined) update.nome = String(body.nome).trim();
  if (body.checklist_def !== undefined) {
    update.checklist_def = Array.isArray(body.checklist_def) ? body.checklist_def : [];
  }
  if (body.cor !== undefined) update.cor = body.cor || null;
  if (body.logo_url !== undefined) update.logo_url = body.logo_url || null;
  if (body.contato_fabrica !== undefined) update.contato_fabrica = body.contato_fabrica || null;
  if (body.ativo !== undefined) update.ativo = !!body.ativo;
  if (body.email_destinatarios !== undefined) {
    update.email_destinatarios = Array.isArray(body.email_destinatarios) ? body.email_destinatarios : [];
  }
  if (body.tipo_template !== undefined) {
    update.tipo_template = body.tipo_template === 'mahindra' ? 'mahindra' : 'sem_template';
  }
  if (body.auto_enviar_email !== undefined) update.auto_enviar_email = !!body.auto_enviar_email;
  if (body.email_assunto !== undefined) update.email_assunto = body.email_assunto || null;
  if (body.email_corpo !== undefined) update.email_corpo = body.email_corpo || null;

  const { data, error } = await supabase
    .from(TBL_MONTADORAS)
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Já existe uma montadora com esse nome.' }, { status: 409 });
    }
    console.error('Erro ao atualizar montadora:', error.message);
    return NextResponse.json({ error: 'Falha ao atualizar montadora.' }, { status: 500 });
  }
  return NextResponse.json({ montadora: data });
}

// DELETE /api/garantias/montadoras/[id] — bloqueado se houver garantias vinculadas
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { count } = await supabase
    .from(TBL_GARANTIAS)
    .select('id', { count: 'exact', head: true })
    .eq('montadora_id', id);

  if (count && count > 0) {
    return NextResponse.json(
      { error: 'Esta montadora tem garantias vinculadas. Desative-a em vez de excluir.' },
      { status: 409 }
    );
  }

  const { error } = await supabase.from(TBL_MONTADORAS).delete().eq('id', id);
  if (error) {
    console.error('Erro ao excluir montadora:', error.message);
    return NextResponse.json({ error: 'Falha ao excluir montadora.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
