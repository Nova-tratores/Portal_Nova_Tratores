import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { protegerRota, autorDe } from "@/lib/ajustes/permissao-server";

// Carrinhos vivem na aba Catálogo do /ppv (pode("ppv", "catalogo")).
const ACESSO = [{ modulo: "ppv", acao: "catalogo" }];

// POST /api/carrinhos/:id/historico  { acao, detalhe }  (quem = login)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
  const { id } = await params;
  try {
    const b = await req.json();
    if (!b?.acao) return NextResponse.json({ error: "acao obrigatória" }, { status: 400 });
    await supabase.from("carrinho_historico").insert({
      carrinho_id: id, quem: autorDe(g.user),
      acao: String(b.acao), detalhe: String(b?.detalhe || ""),
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : (e && typeof e === "object" ? JSON.stringify(e) : "erro") }, { status: 500 });
  }
}
