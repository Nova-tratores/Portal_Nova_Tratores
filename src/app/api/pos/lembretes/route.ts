import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_LEMBRETES } from "@/lib/pos/constants";

// GET /api/pos/lembretes — lista todos ou filtra por chave de cliente
export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente");

  const nome = req.nextUrl.searchParams.get("nome");

  if (cliente) {
    // Busca lembretes que contenham essa chave de cliente
    const { data, error } = await supabase
      .from(TBL_LEMBRETES)
      .select("*")
      .filter("cliente_chaves", "cs", `{${cliente}}`)
      .eq("ativo", true)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }

  if (nome) {
    // Busca lembretes que contenham o nome do cliente nos nomes associados
    const { data, error } = await supabase
      .from(TBL_LEMBRETES)
      .select("*")
      .ilike("cliente_nomes", `%${nome}%`)
      .eq("ativo", true)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }

  // Lista todos
  const { data, error } = await supabase
    .from(TBL_LEMBRETES)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

// POST /api/pos/lembretes — criar lembrete
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { cliente_chaves, cliente_nomes, lembrete } = body;

  if (!cliente_chaves?.length || !lembrete?.trim()) {
    return NextResponse.json({ erro: "Selecione ao menos um cliente e preencha o lembrete." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(TBL_LEMBRETES)
    .insert({
      cliente_chaves,
      cliente_nomes,
      lembrete: lembrete.trim(),
      ativo: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}
