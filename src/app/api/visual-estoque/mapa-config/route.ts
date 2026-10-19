import { NextRequest, NextResponse } from "next/server";
import { carregarMapaConfig, salvarMapaConfig, type ZonasConfig } from "@/lib/visual-estoque/mapa-config";
import { protegerRota } from "@/lib/ajustes/permissao-server";

// Só a tela Pátio chama (ler e salvar as zonas): pode('consulta-estoque', 'patio').
const ACESSO = [{ modulo: "consulta-estoque", acao: "patio" }];

function normalizarId(raw: string | null): "default" | "frota" {
  return raw === "frota" ? "frota" : "default";
}

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
  try {
    const id = normalizarId(req.nextUrl.searchParams.get("id"));
    return NextResponse.json(await carregarMapaConfig(id));
  } catch {
    return NextResponse.json({});
  }
}

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
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
