import { NextRequest, NextResponse } from "next/server";
import { buscarRemessas, buscarMovimentacao, buscarOutrasEntradas } from "@/lib/visual-estoque/remessas";

// Leitura unificada das 3 abas via ?modo=remessas|demonstracao|outras-entradas.
export async function GET(req: NextRequest) {
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
