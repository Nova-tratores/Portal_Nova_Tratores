import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { protegerRota } from "@/lib/ajustes/permissao-server";

// POST /api/orcamentos/[id]/concluir
// Marca o orçamento como aprovado (status='aprovado') — status reconhecido pelo
// módulo de Orçamentos (aparece como "Aprovado" na lista).
// Quem chama: bloco de orçamentos da OS (pode("pos","editar")); no /orcamentos
// mudar status é pode("orcamentos","status").
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ modulo: "pos", acao: "editar" }, { modulo: "orcamentos", acao: "status" }]);
  if (g.resposta) return g.resposta;
  const { id } = await params;
  const { error } = await supabase
    .from("orcamentos")
    .update({ status: "aprovado", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    console.error("[orcamentos concluir]", error.message);
    return NextResponse.json({ error: "Falha ao concluir o orçamento." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
