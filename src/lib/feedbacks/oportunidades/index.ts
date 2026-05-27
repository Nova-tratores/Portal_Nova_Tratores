// Orquestrador das 4 regras de Oportunidade.
//
// Carrega parâmetros configuráveis de feedback_config_regras, roda cada regra,
// faz upsert em feedback_oportunidades com onConflict natural (regra,
// codigo_omie_norm, chassis_norm) e marca como 'expirada' as oportunidades
// 'aberta' que não vieram nesta recomputação.

import { supabase } from "@/lib/supabase";
import { computarR1 } from "./r1-revisao";
import { computarR2 } from "./r2-sem-os";
import { computarR3 } from "./r3-upsell";
import { computarR4 } from "./r4-followup";
import type { PrioridadeOportunidade, RegraOportunidade } from "../types";

// Shape comum produzido por todas as regras. Não inclui `status` para que o
// upsert preserve o status existente quando a oportunidade já estava em
// 'atendida' ou 'dispensada'.
interface OportunidadeInput {
  regra: RegraOportunidade;
  codigo_omie: string | null;
  cliente_nome: string;
  trator: string | null;
  chassis: string | null;
  detalhes: Record<string, unknown>;
  prioridade: PrioridadeOportunidade;
}

interface ResumoRegra {
  computadas: number;
  inseridas_ou_atualizadas: number;
  expiradas: number;
  erro?: string;
}

type Params = Record<string, unknown>;

export async function recomputar(
  regraFiltro?: RegraOportunidade
): Promise<Record<string, ResumoRegra>> {
  const params = await carregarParametros();
  const resumo: Record<string, ResumoRegra> = {};

  const tarefas: Array<{ regra: RegraOportunidade; fn: () => Promise<OportunidadeInput[]> }> = [
    { regra: "R1_revisao",  fn: async () => (await computarR1((params.R1_revisao  as Params) || {})) as unknown as OportunidadeInput[] },
    { regra: "R2_sem_os",   fn: async () => (await computarR2((params.R2_sem_os   as Params) || {})) as unknown as OportunidadeInput[] },
    { regra: "R3_upsell",   fn: async () => (await computarR3((params.R3_upsell   as Params) || {})) as unknown as OportunidadeInput[] },
    { regra: "R4_followup", fn: async () => (await computarR4((params.R4_followup as Params) || {})) as unknown as OportunidadeInput[] },
  ];

  for (const { regra, fn } of tarefas) {
    if (regraFiltro && regraFiltro !== regra) continue;
    try {
      const oportunidades = await fn();
      const upsertResult = await aplicarUpsert(regra, oportunidades);
      const expiradas = await expirarAusentes(regra, oportunidades);
      resumo[regra] = {
        computadas: oportunidades.length,
        inseridas_ou_atualizadas: upsertResult,
        expiradas,
      };
    } catch (e) {
      resumo[regra] = {
        computadas: 0,
        inseridas_ou_atualizadas: 0,
        expiradas: 0,
        erro: e instanceof Error ? e.message : String(e),
      };
    }
  }

  return resumo;
}

async function carregarParametros(): Promise<Record<string, unknown>> {
  const { data } = await supabase.from("feedback_config_regras").select("regra, parametros");
  const map: Record<string, unknown> = {};
  for (const r of (data || []) as Array<{ regra: string; parametros: unknown }>) {
    map[r.regra] = r.parametros;
  }
  return map;
}

// Faz upsert de cada oportunidade. A constraint UNIQUE (regra, codigo_omie_norm,
// chassis_norm) garante que se a mesma oportunidade já existe, ela é atualizada
// no lugar — preservando status (atendida/dispensada) e adicionando novos
// dados em `detalhes`. O status não é tocado aqui — só `detalhes`,
// `computado_em`, `prioridade`.
async function aplicarUpsert(
  regra: RegraOportunidade,
  oportunidades: OportunidadeInput[]
): Promise<number> {
  if (!oportunidades.length) return 0;

  const linhas = oportunidades.map((o) => ({
    ...o,
    computado_em: new Date().toISOString(),
    // status default = 'aberta' (a coluna tem default no schema); para registros
    // já existentes o ON CONFLICT preserva o status atual (DO UPDATE não inclui
    // status na lista de colunas atualizadas — pois usamos upsert sem ignoreDuplicates).
  }));

  // Trick: usa upsert com onConflict + ignoreDuplicates=false; o supabase-js
  // gera ON CONFLICT DO UPDATE SET col=EXCLUDED.col em todas as colunas do
  // payload. Por isso NÃO incluímos 'status' no payload, mantendo o valor
  // existente no banco.
  const { error } = await supabase
    .from("feedback_oportunidades")
    .upsert(linhas, {
      onConflict: "regra,codigo_omie_norm,chassis_norm",
      ignoreDuplicates: false,
    });
  if (error) throw error;
  return linhas.length;
}

// Marca como 'expirada' as oportunidades 'aberta' desta regra que não vieram
// na recomputação atual.
async function expirarAusentes(
  regra: RegraOportunidade,
  oportunidadesAtuais: OportunidadeInput[]
): Promise<number> {
  const chavesAtuais = new Set(
    oportunidadesAtuais.map((o) => `${o.regra}|${o.codigo_omie || ""}|${o.chassis || ""}`)
  );

  // Buscar todas as oportunidades 'aberta' da regra
  const { data, error } = await supabase
    .from("feedback_oportunidades")
    .select("id, codigo_omie, chassis")
    .eq("regra", regra)
    .eq("status", "aberta");
  if (error) throw error;

  const expirar: number[] = [];
  for (const r of (data || []) as Array<{ id: number; codigo_omie: string | null; chassis: string | null }>) {
    const k = `${regra}|${r.codigo_omie || ""}|${r.chassis || ""}`;
    if (!chavesAtuais.has(k)) expirar.push(r.id);
  }
  if (!expirar.length) return 0;

  const { error: errUpd } = await supabase
    .from("feedback_oportunidades")
    .update({ status: "expirada" })
    .in("id", expirar);
  if (errUpd) throw errUpd;

  return expirar.length;
}
