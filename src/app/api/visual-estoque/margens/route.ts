import { NextRequest, NextResponse } from "next/server";
import { buscarMargens } from "@/lib/visual-estoque/margens";

export async function GET(req: NextRequest) {
  const conta = req.nextUrl.searchParams.get("conta") || undefined;
  try {
    const produtos = await buscarMargens(conta);
    return NextResponse.json(produtos);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
