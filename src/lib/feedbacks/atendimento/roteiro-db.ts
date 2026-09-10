// Roteiros + config de retorno + humores recentes (SERVIDOR, service role).
// Degrada para vazio/padrão se a migration sql/create-feedback-roteiro.sql
// ainda não tiver sido aplicada (tabela/linha ausentes).

import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import type { Script } from "./roteiro";
import { CONFIG_RETORNO_PADRAO, lerConfigRetorno, type ConfigRetorno } from "./retorno";

let avisouSemTabela = false;

export async function listarScripts(): Promise<Script[]> {
  const { data, error } = await sb
    .from("feedback_script")
    .select("id, regra, etapa, titulo, template, ordem, versao")
    .eq("ativo", true)
    .order("etapa")
    .order("ordem")
    .order("id");
  if (error) {
    if (!avisouSemTabela) {
      avisouSemTabela = true;
      console.warn("[atendimento] feedback_script indisponível (migration create-feedback-roteiro.sql?):", error.message);
    }
    return [];
  }
  return (data || []) as Script[];
}

export async function configRetorno(): Promise<ConfigRetorno> {
  const { data, error } = await sb.from("feedback_config_regras").select("parametros").eq("regra", "retorno").maybeSingle();
  if (error || !data) return CONFIG_RETORNO_PADRAO;
  return lerConfigRetorno((data as { parametros?: Record<string, unknown> }).parametros);
}

/** Humores das últimas ligações encerradas do cliente (mais recente primeiro). */
export async function humoresRecentes(clienteKey: string, limite = 5): Promise<number[]> {
  const { data, error } = await sb
    .from("feedback_chamada")
    .select("humor_cliente")
    .eq("cliente_key", clienteKey)
    .not("encerrada_em", "is", null)
    .not("humor_cliente", "is", null)
    .order("encerrada_em", { ascending: false })
    .limit(limite);
  if (error) return [];
  return (data || []).map((r) => Number((r as { humor_cliente: number }).humor_cliente)).filter((n) => Number.isFinite(n));
}
