import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { protegerRota, autorDe } from "@/lib/ajustes/permissao-server";

// Observação por produto (compartilhada entre /estoque e o popup do PPV).
// GET  ?codigo=XXX          -> { observacao }
// POST { codigo, observacao } -> upsert (grava/atualiza; autor = login)
//
// Telas: /estoque (temAcesso("estoque")) e o popup do produto no /ppv e na OS do /pos.
const ACESSO = [{ modulo: "estoque" }, { modulo: "ppv" }, { modulo: "pos" }];

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
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
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
  try {
    const body = await req.json();
    const codigo = String(body?.codigo || "").trim();
    const observacao = String(body?.observacao ?? "");
    const atualizadoPor = autorDe(g.user); // do login, nunca do corpo
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
