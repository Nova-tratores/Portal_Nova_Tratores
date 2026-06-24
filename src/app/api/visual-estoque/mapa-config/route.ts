import { NextRequest, NextResponse } from "next/server";
import { carregarMapaConfig, salvarMapaConfig, type ZonasConfig } from "@/lib/visual-estoque/mapa-config";

function normalizarId(raw: string | null): "default" | "frota" {
  return raw === "frota" ? "frota" : "default";
}

export async function GET(req: NextRequest) {
  try {
    const id = normalizarId(req.nextUrl.searchParams.get("id"));
    return NextResponse.json(await carregarMapaConfig(id));
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: NextRequest) {
  try {
    const id = normalizarId(req.nextUrl.searchParams.get("id"));
    const zonas = (await req.json()) as ZonasConfig;
    await salvarMapaConfig(id, zonas);
    return NextResponse.json({ sucesso: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
