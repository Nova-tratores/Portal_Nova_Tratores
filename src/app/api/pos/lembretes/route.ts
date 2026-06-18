import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_LEMBRETES } from "@/lib/pos/constants";

// GET /api/pos/lembretes — lista todos ou filtra por chave de cliente / cnpj
export async function GET(req: NextRequest) {
  const cliente = req.nextUrl.searchParams.get("cliente");
  const nome = req.nextUrl.searchParams.get("nome");
  const cnpj = req.nextUrl.searchParams.get("cnpj");
  const todos = req.nextUrl.searchParams.get("todos"); // inclui concluidos

  if (cnpj) {
    const { data, error } = await supabase
      .from(TBL_LEMBRETES)
      .select("*")
      .ilike("cliente_cnpj_cpf", `%${cnpj.replace(/\D/g, "")}%`)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }

  if (cliente) {
    let q = supabase
      .from(TBL_LEMBRETES)
      .select("*")
      .filter("cliente_chaves", "cs", `{${cliente}}`)
      .order("created_at", { ascending: false });

    if (!todos) q = q.eq("ativo", true).eq("concluido", false);

    const { data, error } = await q;
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
    return NextResponse.json(data || []);
  }

  if (nome) {
    let q = supabase
      .from(TBL_LEMBRETES)
      .select("*")
      .ilike("cliente_nomes", `%${nome}%`)
      .order("created_at", { ascending: false });

    if (!todos) q = q.eq("ativo", true).eq("concluido", false);

    const { data, error } = await q;
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
  const { cliente_chaves, cliente_nomes, lembrete, criado_por, cliente_cnpj_cpf } = body;

  if (!cliente_chaves?.length || !lembrete?.trim()) {
    return NextResponse.json({ erro: "Selecione ao menos um cliente e preencha o lembrete." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from(TBL_LEMBRETES)
    .insert({
      cliente_chaves,
      cliente_nomes,
      cliente_cnpj_cpf: cliente_cnpj_cpf || "",
      lembrete: lembrete.trim(),
      criado_por: criado_por || "Sistema",
      ativo: true,
      concluido: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}
