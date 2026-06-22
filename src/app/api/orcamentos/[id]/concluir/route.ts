import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

// POST /api/orcamentos/[id]/concluir
// Marca o orçamento como concluído (status='concluido').
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabase
    .from("orcamentos")
    .update({ status: "concluido", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[orcamentos concluir]", error.message);
    return NextResponse.json({ error: "Falha ao concluir o orçamento." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
