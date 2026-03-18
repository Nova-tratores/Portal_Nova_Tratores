import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_LEMBRETES } from "@/lib/pos/constants";

// PATCH /api/pos/lembretes/[id] — atualizar lembrete
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.lembrete !== undefined) updates.lembrete = body.lembrete.trim();
  if (body.cliente_chaves !== undefined) updates.cliente_chaves = body.cliente_chaves;
  if (body.cliente_nomes !== undefined) updates.cliente_nomes = body.cliente_nomes;
  if (body.ativo !== undefined) updates.ativo = body.ativo;

  const { data, error } = await supabase
    .from(TBL_LEMBRETES)
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// DELETE /api/pos/lembretes/[id] — excluir lembrete
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { error } = await supabase
    .from(TBL_LEMBRETES)
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json({ sucesso: true });
}
