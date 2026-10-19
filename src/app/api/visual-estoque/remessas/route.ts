import { NextRequest, NextResponse } from "next/server";
import { buscarRemessas, buscarMovimentacao, buscarOutrasEntradas } from "@/lib/visual-estoque/remessas";
import { protegerRota } from "@/lib/ajustes/permissao-server";

// Leitura unificada das 3 abas via ?modo=remessas|demonstracao|outras-entradas.
// Tela /visual-estoque/remessas: pode('consulta-estoque', 'remessas').
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "consulta-estoque", acao: "remessas" }]);
  if (g.resposta) return g.resposta;
  const conta = req.nextUrl.searchParams.get("conta") || undefined;
  const modo = req.nextUrl.searchParams.get("modo") || "remessas";
  try {
    if (modo === "demonstracao") {
      const arquivados = req.nextUrl.searchParams.get("arquivados") === "1";
      return NextResponse.json(await buscarMovimentacao(conta, arquivados));
    }
    if (modo === "outras-entradas") {
      return NextResponse.json(await buscarOutrasEntradas(conta));
    }
    return NextResponse.json(await buscarRemessas(conta));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
