// Endpoint de recomputação das oportunidades (R1..R4).
//
// Auth segue o mesmo padrão de /api/pos/sync:
//   - Bearer CRON_SECRET (cron Railway)
//   - x-railway-cron: true (Railway internal)
//   - x-sync-manual: true (botão manual no frontend)
//
// Query string `?regra=R2_sem_os` permite recomputar uma regra só (útil
// quando o usuário altera parâmetros no modal de configuração).

import { NextRequest, NextResponse } from "next/server";
import { recomputar } from "@/lib/feedbacks/oportunidades";
import type { RegraOportunidade } from "@/lib/feedbacks/types";

const CRON_SECRET = process.env.CRON_SECRET || "";

const REGRAS_VALIDAS: RegraOportunidade[] = [
  "R1_revisao", "R2_sem_os", "R3_upsell", "R4_followup",
];

function parseRegraFiltro(req: NextRequest): RegraOportunidade | undefined {
  const r = new URL(req.url).searchParams.get("regra");
  if (!r) return undefined;
  if (!REGRAS_VALIDAS.includes(r as RegraOportunidade)) return undefined;
  return r as RegraOportunidade;
}

function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const isCron = CRON_SECRET && auth === `Bearer ${CRON_SECRET}`;
  const isInternal = req.headers.get("x-railway-cron") === "true";
  const isManual = req.headers.get("x-sync-manual") === "true";
  return Boolean(isCron || isInternal || isManual);
}

export async function POST(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    const resumo = await recomputar(parseRegraFiltro(req));
    return NextResponse.json({
      sucesso: true,
      resumo,
      ms: Date.now() - t0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { sucesso: false, erro: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  if (!autorizado(req)) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }
  const t0 = Date.now();
  try {
    const resumo = await recomputar(parseRegraFiltro(req));
    return NextResponse.json({
      sucesso: true,
      resumo,
      ms: Date.now() - t0,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { sucesso: false, erro: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
