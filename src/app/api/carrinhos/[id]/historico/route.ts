import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

// POST /api/carrinhos/:id/historico  { acao, detalhe, quem }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const b = await req.json();
    if (!b?.acao) return NextResponse.json({ error: "acao obrigatória" }, { status: 400 });
    await supabase.from("carrinho_historico").insert({
      carrinho_id: id, quem: b?.quem ? String(b.quem) : "—",
      acao: String(b.acao), detalhe: String(b?.detalhe || ""),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e && typeof e === "object" ? JSON.stringify(e) : "erro") }, { status: 500 });
  }
}
