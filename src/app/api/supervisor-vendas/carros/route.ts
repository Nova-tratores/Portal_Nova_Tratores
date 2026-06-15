import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// CRUD do vínculo carro ↔ pessoa (usuário do portal OU vendedor)
export async function GET() {
  const { data, error } = await supabase
    .from("comercial_veiculos")
    .select("*")
    .eq("ativo", true)
    .order("pessoa_nome", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data || []);
}

export async function POST(req: NextRequest) {
  try {
    const { placa, descricao, adesao_id, vinculo_tipo, pessoa_id, pessoa_nome } = await req.json();
    if (!placa || !pessoa_id) {
      return NextResponse.json({ error: "placa e pessoa são obrigatórios" }, { status: 400 });
    }
    const { error } = await supabase.from("comercial_veiculos").upsert({
      placa,
      descricao: descricao || null,
      adesao_id: adesao_id || null,
      vinculo_tipo: vinculo_tipo === "vendedor" ? "vendedor" : "portal",
      pessoa_id: String(pessoa_id),
      pessoa_nome: pessoa_nome || "",
      ativo: true,
    }, { onConflict: "placa" });
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
