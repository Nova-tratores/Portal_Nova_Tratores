// "Minha área" (puro): função do usuário → regras da fila que são dele.
// A tabela vem de feedback_config_regras (regra='areas'); match por
// "contém", sem acento e sem caixa. Sem match → todas as regras.

import type { RegraOportunidade } from "@/lib/feedbacks/types";

export type Areas = Record<string, RegraOportunidade[]>;

export const AREAS_PADRAO: Areas = {
  "Peças": ["R5_pecas", "R8_cadastro"],
  "Pós-Vendas": ["R1_revisao", "R2_sem_os", "R4_followup", "R6_fora_garantia", "R7_garantia_risco", "R8_cadastro"],
  "Serviço": ["R1_revisao", "R2_sem_os", "R4_followup", "R6_fora_garantia", "R7_garantia_risco"],
  "Comercial": ["R3_upsell", "R5_pecas"],
  "Vendas": ["R3_upsell", "R5_pecas"],
};

export const TODAS_REGRAS: RegraOportunidade[] = ["R1_revisao", "R2_sem_os", "R3_upsell", "R4_followup", "R5_pecas", "R6_fora_garantia", "R7_garantia_risco", "R8_cadastro"];

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

export function lerAreas(parametros: unknown): Areas {
  if (!parametros || typeof parametros !== "object") return AREAS_PADRAO;
  const out: Areas = {};
  for (const [k, v] of Object.entries(parametros as Record<string, unknown>)) {
    if (Array.isArray(v)) out[k] = v.filter((r): r is RegraOportunidade => typeof r === "string" && (TODAS_REGRAS as string[]).includes(r));
  }
  return Object.keys(out).length ? out : AREAS_PADRAO;
}

/**
 * Regras da área do usuário. `null` = sem área definida (mostrar tudo).
 * Quando mais de uma chave casa ("Pós-Vendas" contém "Vendas"), vence a MAIS
 * ESPECÍFICA (chave mais longa) — o JSONB do banco reordena as chaves, então
 * a ordem de inserção não é confiável.
 */
export function regrasDaFuncao(funcao: string | null | undefined, areas: Areas = AREAS_PADRAO): { area: string; regras: RegraOportunidade[] } | null {
  const f = semAcento(String(funcao ?? ""));
  if (!f) return null;
  let melhor: { area: string; regras: RegraOportunidade[]; peso: number } | null = null;
  for (const [area, regras] of Object.entries(areas)) {
    const a = semAcento(area);
    if (!a) continue;
    const casa = f.includes(a) || a.includes(f);
    if (casa && (!melhor || a.length > melhor.peso)) melhor = { area, regras, peso: a.length };
  }
  return melhor ? { area: melhor.area, regras: melhor.regras } : null;
}
