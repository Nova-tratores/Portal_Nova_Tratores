// Vigia de card parado do Financeiro, no SERVIDOR (tarefa 'financeiro-vigia', 08:00 dias úteis,
// 29/10/2026). Só lê e avisa no sino — não mexe em card nenhum. Regras puras em vigia.ts.
import type { SupabaseClient } from "@supabase/supabase-js";
import { podeNotificar } from "@/lib/notif/prefs";
import { colunaFaltando, hojeBR, podeRecobrar, ROBO_FASES_NOME, somaDias } from "@/lib/financeiro/fases-automaticas";
import {
  cardsParados, FASES_VIGIADAS, linhaRobo, linhaSemana, linhasParados, maisRecente,
  type CardVigia, type SetorVigia,
} from "@/lib/financeiro/vigia";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Quem recebe o aviso de cada setor (financeiro_usu.funcao). */
const FUNCAO: Record<SetorVigia, RegExp> = {
  financeiro: /^financeiro/i,
  posvendas: /p[oó]s[\s-]*vendas?/i,
  pecas: /^pe[cç]as/i,
};
export const LINK_SETOR: Record<SetorVigia, string> = {
  financeiro: "/financeiro/kanban-financeiro",
  posvendas: "/financeiro/home-posvendas",
  pecas: "/financeiro/home-pecas",
};
const NOME_SETOR: Record<SetorVigia, string> = { financeiro: "Financeiro", posvendas: "Pós-Vendas", pecas: "Peças" };

/**
 * Sino para todos os ativos da função do setor (respeitando o silenciar do módulo Financeiro).
 * Não repete o mesmo título para a mesma pessoa no mesmo dia ("Rodar agora" duas vezes).
 */
export async function notificarSetor(sb: SupabaseClient, setor: SetorVigia, titulo: string, descricao: string, link: string): Promise<number> {
  const { data: usus } = await sb.from("financeiro_usu").select("id, funcao").eq("ativo", true);
  let ids = ((usus || []) as { id: string; funcao: string | null }[]).filter((u) => FUNCAO[setor].test(String(u.funcao || "").trim())).map((u) => u.id);
  if (!ids.length) return 0;
  const { data: prefs } = await sb.from("portal_permissoes").select("user_id, categoria, notif_silenciado").in("user_id", ids);
  const pref = new Map(((prefs || []) as any[]).map((p) => [p.user_id, p]));
  ids = ids.filter((id) => podeNotificar("financeiro", pref.get(id)?.notif_silenciado, pref.get(id)?.categoria));
  const inicioDoDia = `${hojeBR()}T00:00:00-03:00`;
  const { data: ja } = await sb.from("portal_notificacoes").select("user_id").eq("titulo", titulo.slice(0, 200)).gte("created_at", inicioDoDia).in("user_id", ids);
  const jaTem = new Set(((ja || []) as any[]).map((r) => r.user_id));
  ids = ids.filter((id) => !jaTem.has(id));
  if (!ids.length) return 0;
  const { error } = await sb.from("portal_notificacoes").insert(ids.map((user_id) => ({
    user_id, tipo: "financeiro", titulo: titulo.slice(0, 200), descricao: descricao.slice(0, 1000), link,
  })));
  if (error) throw new Error(`portal_notificacoes: ${error.message}`);
  return ids.length;
}

/** Último instante em audit_log por card (criação ou mudança de fase). */
async function ultimoMovimento(sb: SupabaseClient, ids: number[]): Promise<Map<number, string>> {
  const m = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await sb.from("audit_log").select("entidade_id, created_at")
      .eq("entidade", "Chamado_NF").in("acao", ["criar", "mover_status"]).in("entidade_id", ids.slice(i, i + 150).map(String))
      .order("created_at", { ascending: false }).limit(5000);
    for (const r of (data || []) as any[]) { const id = Number(r.entidade_id); if (!m.has(id)) m.set(id, r.created_at); }
  }
  return m;
}

/** Último e-mail enviado (boleto/lembrete/cobrança) por card — conta como "recobrança" no Vencido. */
async function ultimoEmail(sb: SupabaseClient, ids: number[]): Promise<Map<number, string>> {
  const m = new Map<number, string>();
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await sb.from("financeiro_emails").select("chamado_id, criado_em")
      .eq("direcao", "enviado").in("chamado_id", ids.slice(i, i + 150)).order("criado_em", { ascending: false }).limit(5000);
    for (const r of (data || []) as any[]) { const id = Number(r.chamado_id); if (!m.has(id)) m.set(id, r.criado_em); }
  }
  return m;
}

export async function rodarVigia(sb: SupabaseClient, agora = new Date()): Promise<{ resumo: string }> {
  const hoje = hojeBR(agora);
  const base = "id, status, tarefa, forma_pagamento, vencimento_boleto, setor_destino, nom_cliente, data_entrada_vencido, grupo_pai_id, anexo_boleto, anexo_boleto2, anexo_boleto_p1, anexo_boleto_p2, anexo_boleto_p3, anexo_boleto_p4, anexo_boleto_p5";
  // status_changed_at só existe com sql/financeiro-status-changed-at.sql; sem ela (42703), segue sem
  let { data, error }: { data: any[] | null; error: any } = await sb.from("Chamado_NF").select(`${base}, status_changed_at`).in("status", FASES_VIGIADAS).is("grupo_pai_id", null);
  if (colunaFaltando(error)) ({ data, error } = await sb.from("Chamado_NF").select(base).in("status", FASES_VIGIADAS).is("grupo_pai_id", null));
  if (error) throw new Error(`Chamado_NF: ${error.message}`);
  const lidos = (data || []) as any[];
  const ids = lidos.map((c) => Number(c.id));
  const [movs, emails] = await Promise.all([ultimoMovimento(sb, ids), ultimoEmail(sb, ids)]);
  const cards: CardVigia[] = lidos.map((c) => {
    const ref = c.status_changed_at || movs.get(c.id) || null;
    const desde = c.status === "vencido" ? maisRecente(ref, c.data_entrada_vencido, emails.get(c.id)) : ref;
    return {
      id: c.id, status: c.status, setor_destino: c.setor_destino, nom_cliente: c.nom_cliente, desde,
      venceuSemBoleto: c.status === "gerar_boleto" && !!c.vencimento_boleto && String(c.vencimento_boleto).slice(0, 10) < hoje,
      recobravel: c.status === "vencido" ? podeRecobrar(c, hoje).ok : undefined,
    };
  });
  const { porSetor, semData } = cardsParados(cards, hoje);
  const dataBR = `${hoje.slice(8, 10)}/${hoje.slice(5, 7)}`;
  const avisados: string[] = [];

  // Financeiro: sempre (resumo das 08:00), com o robô de fases e o total da semana
  const desde24h = new Date(agora.getTime() - 24 * 3_600_000).toISOString();
  const { data: robo } = await sb.from("audit_log").select("detalhes").eq("user_nome", ROBO_FASES_NOME).gte("created_at", desde24h).limit(2000);
  const movimentos = ((robo || []) as any[]).map((r) => ({ de: String(r.detalhes?.de || "?"), para: String(r.detalhes?.para || "?") }));
  const { data: semana } = await sb.from("contas_receber").select("conta_omie, valor_documento, status_titulo")
    .gte("data_vencimento", hoje).lte("data_vencimento", somaDias(hoje, 6)).not("status_titulo", "in", "(RECEBIDO,CANCELADO)").limit(5000);
  const fin = porSetor.financeiro;
  const linhasFin = [
    fin.length ? linhasParados(fin).join("\n") : "Nenhum card parado em Gerar boleto.",
    linhaRobo(movimentos),
    linhaSemana((semana || []) as any[]),
  ];
  const nFin = await notificarSetor(sb, "financeiro", `Resumo do Financeiro ${dataBR}${fin.length ? ` — ${fin.length} parado(s)` : ""}`, linhasFin.join("\n"), LINK_SETOR.financeiro);
  avisados.push(`Financeiro ${fin.length} parado(s) → ${nFin} pessoa(s)`);

  for (const setor of ["posvendas", "pecas"] as SetorVigia[]) {
    const itens = porSetor[setor];
    if (!itens.length) continue;
    const n = await notificarSetor(sb, setor, `Cards parados no Financeiro (${NOME_SETOR[setor]}) ${dataBR} — ${itens.length}`, linhasParados(itens).join("\n"), LINK_SETOR[setor]);
    avisados.push(`${NOME_SETOR[setor]} ${itens.length} parado(s) → ${n} pessoa(s)`);
  }
  return { resumo: `${cards.length} olhados${semData ? ` (${semData} sem data)` : ""} · ${avisados.join(" · ")}` };
}
