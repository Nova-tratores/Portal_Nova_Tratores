import { NextResponse } from "next/server";
import { buscarFrota } from "@/lib/visual-estoque/frota";

export async function GET() {
  try {
    return NextResponse.json(await buscarFrota());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
