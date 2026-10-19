import { NextRequest, NextResponse } from "next/server";
import { buscarNotasEntrada } from "@/lib/visual-estoque/notas-entrada";
import { protegerRota } from "@/lib/ajustes/permissao-server";

// Tela /visual-estoque/notas-entrada: pode('consulta-estoque', 'notas-entrada').
export async function GET(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: "consulta-estoque", acao: "notas-entrada" }]);
  if (g.resposta) return g.resposta;
  const conta = req.nextUrl.searchParams.get("conta") || undefined;
  try {
    const notas = await buscarNotasEntrada(conta);
    return NextResponse.json(notas);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
