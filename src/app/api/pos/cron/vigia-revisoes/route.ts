// Cron diário do Vigia de revisões (GitHub Actions → pos-vigia-revisoes.yml).
// Varre as OS dos últimos 60 dias (+ as já marcadas) e recalcula a pendência
// Mahindra de cada uma. Autenticação por CRON_SECRET, fail-closed.
import { NextRequest, NextResponse } from "next/server";
import { varrerRevisoes } from "@/lib/pos/vigia-revisoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CRON_SECRET = process.env.CRON_SECRET || "";

function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const alt = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("secret") || "";
  return !!CRON_SECRET && (auth === `Bearer ${CRON_SECRET}` || alt === CRON_SECRET);
}

async function executar(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const dias = Number(req.nextUrl.searchParams.get("dias") || "") || undefined;
    const resultado = await varrerRevisoes({ dias });
    const { itens, ...resumo } = resultado;
    return NextResponse.json({ sucesso: true, resumo, pendentes: itens.map((i) => ({ os: i.id, chassis: i.chassis, detalhes: i.detalhes })), timestamp: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ sucesso: false, erro: (e as Error).message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return executar(req); }
export async function POST(req: NextRequest) { return executar(req); }
