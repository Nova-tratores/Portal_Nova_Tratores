// Contas a pagar das requisições (tabela finan_pagar) conferidas com o Omie (José, 29/10/2026:
// "verifica essa coluna também lá no Omie"). Lê o espelho contas_pagar (sincronizado pelo DRE):
//   - card com omie_cod_lancamento: PAGO no Omie → Concluído (com histórico);
//   - card sem o código (lançado à mão no Omie): procura pelo fornecedor + valor (± R$ 0,50) +
//     vencimento (± 20 dias); achou UM só → liga o card ao lançamento e, se pago, conclui;
//   - CANCELADO no Omie → não mexe, só conta (aparece no resumo).
import type { SupabaseClient } from "@supabase/supabase-js";

export type CardPagar = {
  id: number; fornecedor?: string | null; valor?: number | string | null; data_vencimento?: string | null;
  status: string; omie_cod_lancamento?: string | number | null; omie_empresa?: string | null;
};
export type TituloPagar = {
  codigo_lancamento: number | string; conta_omie?: string | null; nome_fornecedor?: string | null;
  valor_documento?: number | string | null; data_vencimento?: string | null; data_pagamento?: string | null; status_titulo: string;
};
export type AcaoPagar =
  | { id: number; tipo: "concluir"; codigo: string; pagoEm: string | null; vinculou: boolean }
  | { id: number; tipo: "vincular"; codigo: string }
  | { id: number; tipo: "cancelado"; codigo: string };

const FASES = ["financeiro", "aguardando_omie"];
const VAZIAS = new Set(["LTDA", "EIRELI", "COMERCIO", "DOS", "DAS", "DE", "DO", "DA", "ME", "EPP", "E"]);
const palavras = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
  .replace(/[^A-Z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !VAZIAS.has(w));
const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const dias = (a?: string | null, b?: string | null) =>
  a && b ? Math.abs(Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${b.slice(0, 10)}T12:00:00Z`)) / 864e5 : Infinity;

/** Lançamento do Omie que é deste card sem código: mesmo fornecedor (uma palavra em comum), valor e vencimento perto. */
export function candidatosDoCard(c: CardPagar, titulos: TituloPagar[]): TituloPagar[] {
  const v = num(c.valor); if (!v) return [];
  const P = new Set(palavras(c.fornecedor)); if (!P.size) return [];
  return titulos.filter((t) => {
    const tv = num(t.valor_documento);
    return tv != null && Math.abs(tv - v) <= 0.5 && dias(t.data_vencimento, c.data_vencimento) <= 20 &&
      palavras(t.nome_fornecedor).some((w) => P.has(w));
  });
}

/** O que fazer com o card (puro). */
export function decidirPagar(c: CardPagar, porCodigo: Map<string, TituloPagar>, titulos: TituloPagar[]): AcaoPagar | null {
  if (!FASES.includes(c.status)) return null;
  const cod = c.omie_cod_lancamento ? String(c.omie_cod_lancamento) : "";
  if (cod) {
    const t = porCodigo.get(cod); if (!t) return null; // ainda não chegou no espelho
    if (t.status_titulo === "PAGO") return { id: c.id, tipo: "concluir", codigo: cod, pagoEm: t.data_pagamento || null, vinculou: false };
    if (t.status_titulo === "CANCELADO") return { id: c.id, tipo: "cancelado", codigo: cod };
    return null;
  }
  const cands = candidatosDoCard(c, titulos);
  if (cands.length !== 1) return null; // nenhum ou ambíguo: não chuta
  const t = cands[0]; const codigo = String(t.codigo_lancamento);
  if (t.status_titulo === "PAGO") return { id: c.id, tipo: "concluir", codigo, pagoEm: t.data_pagamento || null, vinculou: true };
  if (t.status_titulo === "CANCELADO") return { id: c.id, tipo: "cancelado", codigo };
  return { id: c.id, tipo: "vincular", codigo };
}

const COLS_T = "codigo_lancamento, conta_omie, nome_fornecedor, valor_documento, data_vencimento, data_pagamento, status_titulo";

export async function aplicarPagarOmie(sb: SupabaseClient): Promise<{ olhados: number; acoes: AcaoPagar[]; erros: string[] }> {
  const { data, error } = await sb.from("finan_pagar")
    .select("id, fornecedor, valor, data_vencimento, status, omie_cod_lancamento, omie_empresa").in("status", FASES);
  if (error) throw new Error(`finan_pagar: ${error.message}`);
  const cards = (data || []) as CardPagar[];

  const cods = [...new Set(cards.map((c) => c.omie_cod_lancamento).filter(Boolean).map(String))];
  const porCodigo = new Map<string, TituloPagar>();
  for (let i = 0; i < cods.length; i += 150) {
    const { data: t, error: e } = await sb.from("contas_pagar").select(COLS_T).in("codigo_lancamento", cods.slice(i, i + 150));
    if (e) throw new Error(`contas_pagar: ${e.message}`);
    for (const x of (t || []) as TituloPagar[]) porCodigo.set(String(x.codigo_lancamento), x);
  }
  // sem código: só os títulos com valor de algum card sem código (uma consulta por faixa de vencimento)
  const semCod = cards.filter((c) => !c.omie_cod_lancamento && num(c.valor) && c.data_vencimento);
  const titulos: TituloPagar[] = [];
  if (semCod.length) {
    const datas = semCod.map((c) => String(c.data_vencimento).slice(0, 10)).sort();
    const de = new Date(Date.parse(`${datas[0]}T12:00:00Z`) - 20 * 864e5).toISOString().slice(0, 10);
    const ate = new Date(Date.parse(`${datas[datas.length - 1]}T12:00:00Z`) + 20 * 864e5).toISOString().slice(0, 10);
    for (let off = 0; ; off += 1000) {
      const { data: t, error: e } = await sb.from("contas_pagar").select(COLS_T)
        .gte("data_vencimento", de).lte("data_vencimento", ate).order("codigo_lancamento").range(off, off + 999);
      if (e) throw new Error(`contas_pagar: ${e.message}`);
      titulos.push(...((t || []) as TituloPagar[]));
      if (!t || t.length < 1000) break;
    }
  }
  // um lançamento do Omie não pode ser ligado a dois cards
  const jaLigados = new Set(cods);
  const acoes: AcaoPagar[] = []; const erros: string[] = [];
  for (const c of cards) {
    const a = decidirPagar(c, porCodigo, titulos.filter((t) => !jaLigados.has(String(t.codigo_lancamento))));
    if (!a) continue;
    if (a.tipo === "cancelado") { acoes.push(a); continue; }
    const patch: Record<string, unknown> = a.tipo === "concluir" ? { status: "concluido" } : {};
    if (!c.omie_cod_lancamento) Object.assign(patch, { omie_cod_lancamento: a.codigo, status_envio: "enviado" });
    const { error: e } = await sb.from("finan_pagar").update(patch).eq("id", c.id).eq("status", c.status);
    if (e) { erros.push(`#${c.id}: ${e.message}`); continue; }
    jaLigados.add(a.codigo);
    acoes.push(a);
    await sb.from("audit_log").insert({
      user_id: "00000000-0000-0000-0000-000000000000", user_nome: "Robô (contas a pagar × Omie)",
      sistema: "financeiro", acao: a.tipo === "concluir" ? "mover_status" : "editar", entidade: "finan_pagar", entidade_id: String(c.id),
      entidade_label: `Pagar #${c.id} - ${c.fornecedor || ""}`,
      detalhes: a.tipo === "concluir"
        ? { de: c.status, para: "concluido", acao_desc: `Pago no Omie${a.pagoEm ? ` em ${a.pagoEm.split("-").reverse().join("/")}` : ""} (lançamento ${a.codigo}${a.vinculou ? ", achado pelo fornecedor/valor/vencimento" : ""})`, automatico: true }
        : { campo: "omie_cod_lancamento", valor: a.codigo, acao_desc: "Lançamento achado no Omie pelo fornecedor/valor/vencimento", automatico: true },
    });
  }
  return { olhados: cards.length, acoes, erros };
}

export function resumoPagar(r: { olhados: number; acoes: AcaoPagar[]; erros: string[] }): string {
  const n = (t: AcaoPagar["tipo"]) => r.acoes.filter((a) => a.tipo === t).length;
  return `pagar: ${r.olhados} olhados · ${n("concluir")} concluídos (pagos no Omie) · ${n("vincular")} ligados ao Omie · ${n("cancelado")} cancelados no Omie${r.erros.length ? ` · ${r.erros.length} erros` : ""}`;
}
