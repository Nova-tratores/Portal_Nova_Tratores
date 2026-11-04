// Conferência diária card × Omie, no SERVIDOR (tarefa 'financeiro-conferencia', 05:45, 29/10/2026).
// Lê Chamado_NF e o contas_receber já sincronizado (não chama o Omie) e avisa o sino do
// Financeiro. Não mexe em nada. Regras puras em conferencia.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { COLUNAS_TITULO, hojeBR, somaDias } from "@/lib/financeiro/fases-automaticas";
import { conferir, textoConferencia, type CardConf, type TituloConf } from "@/lib/financeiro/conferencia";
import { LINK_SETOR, notificarSetor } from "@/lib/financeiro/vigia-server";

export const DIAS_CONFERENCIA = 60;

const COLUNAS_CARD_CONF = "id, status, tarefa, forma_pagamento, vencimento_boleto, grupo_pai_id, nom_cliente, num_nf_peca, num_nf_servico, omie_empresa, valor_servico, grupo_valor_original, qtd_parcelas, setor_destino";

async function paginar<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const todos: T[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) throw new Error(error.message);
    todos.push(...(data || []));
    if (!data || data.length < 1000) return todos;
  }
}

/** Lê, confere e devolve os achados (sem avisar). */
export async function lerConferencia(sb: SupabaseClient, hoje = hojeBR()) {
  const desde = somaDias(hoje, -DIAS_CONFERENCIA);
  const titulos = await paginar<TituloConf>((de, ate) => sb.from("contas_receber").select(`${COLUNAS_TITULO}, descricao_categoria`)
    .gte("data_emissao", desde).neq("status_titulo", "CANCELADO")
    .in("raw->>codigo_tipo_documento", ["NFE", "NFS"]).order("id").range(de, ate) as never);
  const cards = await paginar<CardConf>((de, ate) => sb.from("Chamado_NF").select(COLUNAS_CARD_CONF).order("id").range(de, ate) as never);
  return { desde, titulos: titulos.length, cards: cards.length, achados: conferir(cards, titulos) };
}

export async function rodarConferencia(sb: SupabaseClient): Promise<{ resumo: string }> {
  const hoje = hojeBR();
  const r = await lerConferencia(sb, hoje);
  const conta = (t: string) => r.achados.filter((a) => a.tipo === t).length;
  const resumo = `${r.titulos} títulos (desde ${r.desde}) × ${r.cards} cards · sem card ${conta("sem_card")} · não casa ${conta("nao_casa")} · valor ${conta("valor")} · vencimento ${conta("vencimento")}`;
  if (!r.achados.length) return { resumo: `${resumo} · tudo batendo` };
  const n = await notificarSetor(sb, "financeiro", `Conferência card × Omie ${hoje.slice(8, 10)}/${hoje.slice(5, 7)} — ${r.achados.length} diferença(s)`,
    textoConferencia(r.achados), LINK_SETOR.financeiro);
  return { resumo: `${resumo} · ${n} pessoa(s) avisada(s)` };
}
