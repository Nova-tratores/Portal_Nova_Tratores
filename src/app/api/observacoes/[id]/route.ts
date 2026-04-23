import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json();
  const { texto, status, tipo, userName } = body;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof texto === 'string') update.texto = texto;
  if (typeof tipo === 'string') update.tipo = tipo;
  if (status === 'resolvida') {
    update.status = 'resolvida';
    update.resolvido_por_nome = userName || null;
    update.resolvido_em = new Date().toISOString();
  } else if (status === 'ativa') {
    update.status = 'ativa';
    update.resolvido_por_nome = null;
    update.resolvido_em = null;
  }

  const { data, error } = await supabase
    .from('trator_observacoes')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Erro ao atualizar observação:', error.message);
    return NextResponse.json({ error: 'Falha ao atualizar observação.' }, { status: 500 });
  }

  return NextResponse.json({ observacao: data });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { error } = await supabase.from('trator_observacoes').delete().eq('id', id);

  if (error) {
    console.error('Erro ao deletar observação:', error.message);
    return NextResponse.json({ error: 'Falha ao deletar observação.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
