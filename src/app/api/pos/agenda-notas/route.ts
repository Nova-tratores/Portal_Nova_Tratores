import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { protegerRota } from "@/lib/ajustes/permissao-server";

const TBL = "agenda_notas";

/** GET — busca notas de um range de datas */
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "pos" }, { modulo: "mecanicos" }, { modulo: "painel-mecanicos" }]);
  if (g.resposta) return g.resposta;
  const { searchParams } = new URL(req.url);
  const datas = searchParams.get("datas"); // comma-separated: 2026-04-01,2026-04-02,...

  if (!datas) return NextResponse.json([]);

  const listaD = datas.split(",").map((d) => d.trim()).filter(Boolean);
  const { data: rows, error } = await supabase
    .from(TBL)
    .select("*")
    .in("data", listaD);

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(rows || []);
}

/** POST — upsert nota (tecnico_nome + data) */
export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "pos" }, { modulo: "mecanicos" }, { modulo: "painel-mecanicos" }]);
  if (g.resposta) return g.resposta;
  const { tecnico_nome, data, nota } = await req.json();

  if (!tecnico_nome || !data) {
    return NextResponse.json({ erro: "tecnico_nome e data obrigatórios" }, { status: 400 });
  }

  const { data: row, error } = await supabase
    .from(TBL)
    .upsert(
      { tecnico_nome, data, nota: nota || "", updated_at: new Date().toISOString() },
      { onConflict: "tecnico_nome,data" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(row);
}
