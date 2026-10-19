import { NextRequest, NextResponse } from "next/server";
import { buscarMargens } from "@/lib/visual-estoque/margens";
import { protegerRota } from "@/lib/ajustes/permissao-server";

// Tela /visual-estoque/margens: pode('consulta-estoque', 'margens').
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "consulta-estoque", acao: "margens" }]);
  if (g.resposta) return g.resposta;
  const conta = req.nextUrl.searchParams.get("conta") || undefined;
  try {
    const produtos = await buscarMargens(conta);
    return NextResponse.json(produtos);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
