import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// CRUD da classificação/vínculo de carros (comercial/oficina + pessoa)
// GET            → só comerciais ativos (mapa / lista lateral)
// GET ?todos=1   → todos os classificados (modal de gerenciamento)
export async function GET(req: NextRequest) {
  const todos = req.nextUrl.searchParams.get("todos");
  let q = supabase.from("comercial_veiculos").select("*").order("pessoa_nome", { ascending: true });
  if (!todos) q = q.eq("categoria", "comercial").eq("ativo", true);
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { placa, descricao, adesao_id, vinculo_tipo, pessoa_id, pessoa_nome, categoria, ativo } = body;
    if (!placa) {
      return NextResponse.json({ error: "placa é obrigatória" }, { status: 400 });
    }
    const row: Record<string, unknown> = {
      placa,
      descricao: descricao || null,
      adesao_id: adesao_id || null,
      categoria: categoria === "oficina" ? "oficina" : "comercial",
      ativo: ativo === undefined ? true : !!ativo,
    };
    // Vínculo de pessoa é opcional (pode classificar sem dono)
    if (pessoa_id) {
      row.vinculo_tipo = vinculo_tipo === "vendedor" ? "vendedor" : "portal";
      row.pessoa_id = String(pessoa_id);
      row.pessoa_nome = pessoa_nome || "";
    } else {
      row.pessoa_id = null;
      row.pessoa_nome = pessoa_nome || "";
    }
    const { error } = await supabase.from("comercial_veiculos").upsert(row, { onConflict: "placa" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const placa = req.nextUrl.searchParams.get("placa");
  if (!placa) return NextResponse.json({ error: "placa obrigatória" }, { status: 400 });
  const { error } = await supabase.from("comercial_veiculos").delete().eq("placa", placa);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
