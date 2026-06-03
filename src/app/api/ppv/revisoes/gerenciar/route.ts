import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

function parseProdutos(row: Record<string, unknown>) {
  const produtos: { codigo: string; quantidade: number }[] = [];
  for (let i = 1; i <= 15; i++) {
    const cod = String(row[`Cod_Prod_${i}`] || "").trim();
    const qtd = parseFloat(String(row[`Qtd${i}`] || 0)) || 0;
    if (cod && cod.toUpperCase() !== "NULL" && cod.length > 1) {
      produtos.push({ codigo: cod, quantidade: qtd || 1 });
    }
  }
  return produtos;
}

function buildColumns(produtos: { codigo: string; quantidade: number }[]) {
  const cols: Record<string, unknown> = {};
  for (let i = 1; i <= 15; i++) {
    const p = produtos[i - 1];
    cols[`Cod_Prod_${i}`] = p ? p.codigo : null;
    cols[`Qtd${i}`] = p ? p.quantidade : null;
  }
  return cols;
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("revisoes")
      .select("*")
      .order("Trator")
      .order("Horas");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      Trator: row.Trator || "",
      Cod_Trator: row.Cod_Trator || "",
      Horas: row.Horas || "",
      tipo: (row as any).tipo || "revisao",
      produtos: parseProdutos(row),
    }));

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { Trator, Cod_Trator, Horas, produtos, tipo } = await req.json();
    if (!Trator || !Horas) return NextResponse.json({ error: "Trator e Horas obrigatórios" }, { status: 400 });

    const row = { Trator, Cod_Trator: Cod_Trator || "", Horas, tipo: tipo || "revisao", ...buildColumns(produtos || []) };
    const { data, error } = await supabase.from("revisoes").insert([row]).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, Trator, Cod_Trator, Horas, produtos, tipo } = await req.json();
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const row = { Trator, Cod_Trator: Cod_Trator || "", Horas, tipo: tipo || "revisao", ...buildColumns(produtos || []) };
    const { error } = await supabase.from("revisoes").update(row).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const { error } = await supabase.from("revisoes").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
