import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET — listar lembretes de um trator
export async function GET(req: NextRequest) {
  const tratorId = req.nextUrl.searchParams.get("trator_id");
  if (!tratorId) return NextResponse.json({ error: "trator_id obrigatório" }, { status: 400 });

  const { data, error } = await supabase
    .from("revisao_lembretes")
    .select("*")
    .eq("trator_id", tratorId)
    .order("data_hora", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lembretes: data || [] });
}

// POST — criar lembrete
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { trator_id, user_id, user_nome, data_hora, mensagem, created_by } = body;

  if (!trator_id || !user_id || !user_nome || !data_hora) {
    return NextResponse.json({ error: "Campos obrigatórios: trator_id, user_id, user_nome, data_hora" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("revisao_lembretes")
    .insert({ trator_id, user_id, user_nome, data_hora, mensagem: mensagem || null, created_by: created_by || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ lembrete: data });
}

// DELETE — remover lembrete
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { error } = await supabase.from("revisao_lembretes").delete().eq("id", parseInt(id));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
