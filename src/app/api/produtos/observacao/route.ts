import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

// Observação por produto (compartilhada entre /estoque e o popup do PPV).
// GET  ?codigo=XXX          -> { observacao }
// POST { codigo, observacao } -> upsert (grava/atualiza)

export async function GET(req: NextRequest) {
  const codigo = (req.nextUrl.searchParams.get("codigo") || "").trim();
  if (!codigo) return NextResponse.json({ observacao: "" });
  try {
    const { data, error } = await supabase
      .from("produto_observacoes")
      .select("observacao")
      .eq("codigo", codigo)
      .maybeSingle();
    if (error) throw error;
    return NextResponse.json({ observacao: data?.observacao || "" });
  } catch (e) {
    return NextResponse.json({ observacao: "", error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const codigo = String(body?.codigo || "").trim();
    const observacao = String(body?.observacao ?? "");
    const atualizadoPor = body?.atualizadoPor ? String(body.atualizadoPor) : null;
    if (!codigo) return NextResponse.json({ error: "codigo é obrigatório" }, { status: 400 });

    const { error } = await supabase
      .from("produto_observacoes")
      .upsert(
        { codigo, observacao, atualizado_em: new Date().toISOString(), atualizado_por: atualizadoPor },
        { onConflict: "codigo" }
      );
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
