import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

// POST /api/orcamentos/[id]/vincular  body: { ordem_servico: string | null }
// Vincula (ou desvincula, com null) um orçamento a uma OS.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const ordemServico = body.ordem_servico ? String(body.ordem_servico).trim() : null;

  const { error } = await supabase
    .from("orcamentos")
    .update({ ordem_servico: ordemServico, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[orcamentos vincular]", error.message);
    return NextResponse.json({ error: "Falha ao vincular o orçamento." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
