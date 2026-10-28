// Telas do módulo Feedbacks depois do redesenho "Caminho B" (José, 23/10/2026):
//   Hoje (/feedbacks) · Clientes (/feedbacks/clientes) · Painel (/feedbacks/painel) · Robô (/feedbacks/robo).
// As permissões continuam as de sempre (catálogo: feedbacks:atendimento, crm, rfm, clientes, relatorios,
// agenda, oportunidades) — cada tela nova aceita as chaves das telas antigas que ela juntou, para
// ninguém perder acesso. Fonte única para a faixa de abas (FeedbackTabs), o layout e as rotas antigas.
// Puro (sem React), testado em __tests__/telas.test.ts.
import type { Grupo } from "./hoje";

export type AbaFeedbacks = "hoje" | "clientes" | "painel" | "robo";

export interface DefAba {
  id: AbaFeedbacks;
  href: string;
  rotulo: string;
  ico: string;
  /** qualquer uma destas ações de `feedbacks` libera a tela (módulo inteiro libera tudo) */
  acoes: string[];
}

/** Hoje junta a fila do CRM, do RFM, da Agenda e do Atendimento. */
export const ACOES_HOJE = ["crm", "rfm", "atendimento", "agenda"];

export const ABAS_FEEDBACKS: DefAba[] = [
  { id: "hoje", href: "/feedbacks", rotulo: "Hoje", ico: "fa-sun", acoes: ACOES_HOJE },
  { id: "clientes", href: "/feedbacks/clientes", rotulo: "Clientes", ico: "fa-address-book", acoes: ["clientes", "atendimento"] },
  { id: "painel", href: "/feedbacks/painel", rotulo: "Painel", ico: "fa-chart-simple", acoes: ["relatorios"] },
  { id: "robo", href: "/feedbacks/robo", rotulo: "Robô", ico: "fa-robot", acoes: ["oportunidades"] },
];

/**
 * 1º segmento depois de /feedbacks → ações que liberam aquela URL.
 * "" é a própria /feedbacks (Hoje). As rotas antigas só redirecionam, mas o layout confere antes.
 * Segmento fora da lista cai na regra de sempre: pode('feedbacks', segmento).
 */
export const ACOES_DO_SEGMENTO: Record<string, string[]> = {
  "": ACOES_HOJE,
  clientes: ["clientes", "atendimento"],
  painel: ["relatorios"],
  robo: ["oportunidades"],
  // antigas (redirecionam para as novas)
  crm: ["crm"],
  rfm: ["rfm"],
  agenda: ["agenda", ...ACOES_HOJE],
  relatorios: ["relatorios"],
  oportunidades: ["oportunidades"],
  // o cockpit do cliente continua igual
  atendimento: ["atendimento"],
};

export type Pode = (modulo: string, acao?: string) => boolean;

/** Primeiro segmento depois de /feedbacks ("" na raiz). */
export function segmentoDaRota(pathname: string): string {
  const p = (pathname || "").split("?")[0].replace(/\/+$/, "");
  if (p === "/feedbacks") return "";
  if (!p.startsWith("/feedbacks/")) return "";
  return p.slice("/feedbacks/".length).split("/")[0];
}

export function podeSegmento(pode: Pode, segmento: string): boolean {
  const acoes = ACOES_DO_SEGMENTO[segmento];
  if (!acoes) return pode("feedbacks", segmento);
  return acoes.some((a) => pode("feedbacks", a));
}

export function podeAba(pode: Pode, aba: AbaFeedbacks): boolean {
  const def = ABAS_FEEDBACKS.find((a) => a.id === aba);
  return !!def && def.acoes.some((a) => pode("feedbacks", a));
}

export function abasVisiveis(pode: Pode): DefAba[] {
  return ABAS_FEEDBACKS.filter((a) => podeAba(pode, a.id));
}

/** Aba ativa pela URL (as antigas e o cockpit acendem a aba para onde levam). */
export function abaDaRota(pathname: string): AbaFeedbacks | null {
  const s = segmentoDaRota(pathname);
  if (s === "" || s === "crm" || s === "rfm" || s === "agenda" || s === "atendimento") return "hoje";
  if (s === "clientes") return "clientes";
  if (s === "painel" || s === "relatorios") return "painel";
  if (s === "robo" || s === "oportunidades") return "robo";
  return null;
}

// ── filtro de motivo pela URL (?motivo=…) ─────────────────────────────────────
export const MOTIVO_URL: Record<string, Grupo> = {
  pos: "pos_servico",
  rfm: "reativacao",
  revisao: "revisoes",
  pecas: "pecas",
  cadastro: "cadastro",
  retorno: "retornos",
};

/** "?motivo=pos,retorno" → grupos válidos (ignora o que não conhece). */
export function gruposDaUrl(valor: string | null | undefined): Grupo[] {
  if (!valor) return [];
  const out: Grupo[] = [];
  for (const p of valor.split(",")) {
    const g = MOTIVO_URL[p.trim().toLowerCase()];
    if (g && !out.includes(g)) out.push(g);
  }
  return out;
}

export function urlDoGrupo(g: Grupo): string {
  const k = Object.entries(MOTIVO_URL).find(([, v]) => v === g)?.[0];
  return k ? `/feedbacks?motivo=${k}` : "/feedbacks";
}

// ── rotas antigas → novas ────────────────────────────────────────────────────
type Params = Record<string, string | string[] | undefined>;

function juntar(base: string, extra: Params, manter: string[]): string {
  const sp = new URLSearchParams();
  const [caminho, q] = base.split("?");
  if (q) new URLSearchParams(q).forEach((v, k) => sp.set(k, v));
  for (const k of manter) {
    const v = extra[k];
    const s = Array.isArray(v) ? v[0] : v;
    if (s) sp.set(k, s);
  }
  const str = sp.toString();
  return str ? `${caminho}?${str}` : caminho;
}

/**
 * Para onde vai cada rota antiga. `params` são os da URL antiga: o `?id=` (aviso de nota baixa do
 * sino aponta para /feedbacks/crm?id=N) e o `?cliente=` seguem junto.
 */
export function destinoAntigo(antiga: "crm" | "rfm" | "agenda" | "atendimento" | "relatorios" | "oportunidades", params: Params = {}): string {
  switch (antiga) {
    case "crm": return juntar("/feedbacks?motivo=pos", params, ["id", "cliente"]);
    case "rfm": return juntar("/feedbacks?motivo=rfm", params, ["id", "cliente"]);
    case "agenda": return juntar("/feedbacks?motivo=retorno", params, ["cliente"]);
    case "atendimento": return juntar("/feedbacks", params, ["cliente", "ok"]);
    case "relatorios": return "/feedbacks/painel";
    case "oportunidades": return juntar("/feedbacks/robo", params, ["regra"]);
  }
}
