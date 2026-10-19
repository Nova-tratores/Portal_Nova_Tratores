import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { protegerRota, autorDe } from "@/lib/ajustes/permissao-server";

export async function POST(req: NextRequest) {
  // Botão "Desvincular da OS" fica no drawer da OS (/pos)
  const g = await protegerRota(req, [{ modulo: "pos" }]);
  if (g.resposta) return g.resposta;
  const { reqId, justificativa } = await req.json();

  if (!reqId || !justificativa?.trim()) {
    return NextResponse.json({ success: false, erro: "ID e justificativa são obrigatórios." }, { status: 400 });
  }

  const { error } = await supabase
    .from("Requisicao")
    .update({
      ordem_servico: null,
      desvinculado_justificativa: justificativa.trim(),
      desvinculado_por: autorDe(g.user),
      desvinculado_em: new Date().toISOString(),
    })
    .eq("id", reqId);

  if (error) {
    return NextResponse.json({ success: false, erro: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
