import { NextRequest, NextResponse } from "next/server";
import { buscarNotasEntrada } from "@/lib/visual-estoque/notas-entrada";

export async function GET(req: NextRequest) {
  const conta = req.nextUrl.searchParams.get("conta") || undefined;
  try {
    const notas = await buscarNotasEntrada(conta);
    return NextResponse.json(notas);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
