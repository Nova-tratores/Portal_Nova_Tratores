// Endpoint de recomputação das oportunidades (R1..R4).
//
// Auth (tema 1 da auditoria, 19/10/2026):
//   - Bearer CRON_SECRET / x-cron-secret (workflow feedbacks-oportunidades-recomputar.yml)
//   - usuário logado com pode('feedbacks', 'oportunidades') (botão da tela)
//   x-railway-cron / x-sync-manual não valem mais (qualquer um forjava).
//
// Query string `?regra=R2_sem_os` permite recomputar uma regra só (útil
// quando o usuário altera parâmetros no modal de configuração).

import { NextRequest, NextResponse } from "next/server";
import { recomputar } from "@/lib/feedbacks/oportunidades";
import type { RegraOportunidade } from "@/lib/feedbacks/types";
import { protegerRotaOuInterna } from "@/lib/auth/chamada-interna";

const REGRAS_VALIDAS: RegraOportunidade[] = [
  "R1_revisao", "R2_sem_os", "R3_upsell", "R4_followup", "R5_pecas", "R6_fora_garantia", "R7_garantia_risco", "R8_cadastro",
];

function parseRegraFiltro(req: NextRequest): RegraOportunidade | undefined {
  const r = new URL(req.url).searchParams.get("regra");
  if (!r) return undefined;
  if (!REGRAS_VALIDAS.includes(r as RegraOportunidade)) return undefined;
  return r as RegraOportunidade;
}

const ACESSO = [{ modulo: "feedbacks", acao: "oportunidades" }];

export async function POST(req: NextRequest) {
  const g = await protegerRotaOuInterna(req, ACESSO);
  if (g.resposta) return g.resposta;
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
  const g = await protegerRotaOuInterna(req, ACESSO);
  if (g.resposta) return g.resposta;
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
