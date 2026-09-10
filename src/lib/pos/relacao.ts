// =============================================
// RELAÇÃO DE ORDENS DE SERVIÇO (modo "Relação" e aba Dashboard da tela /pos)
// Definições PURAS (sem servidor), irmãs de lib/ppv/relacao.ts — reaproveita de
// lá os helpers de data/período/agregação. Aqui ficam só as colunas, as fases
// e o filtro específicos da OS (KanbanCard de lib/pos/types.ts).
// =============================================
import type { KanbanCard } from "./types";
import { PHASES } from "./constants";
import {
  dataMs, fmtDataCurta, fmtBRL, chaveMes, rotuloMes, hexToRgb, ehTokenPeriodo, passaPeriodo, rotuloPeriodo,
  agregarPor, type Agregado,
} from "@/lib/ppv/relacao";

export { OPCOES_PERIODO, passaPeriodo, rotuloPeriodo, ehTokenPeriodo, fmtBRL, fmtDataCurta, dataMs, chaveMes, rotuloMes, topComOutros, type Agregado } from "@/lib/ppv/relacao";

// Colunas da relação (k = chave do sort/filtro por coluna; label = cabeçalho da tela, PDF e CSV).
export const COLS_RELACAO_OS = [
  { k: "id", label: "Nº" },
  { k: "cliente", label: "Cliente" },
  { k: "tecnico", label: "Técnico" },
  { k: "tipoServico", label: "Tipo" },
  { k: "data", label: "Data" },
  { k: "valor", label: "Valor" },
  { k: "status", label: "Fase" },
  { k: "dataFase", label: "Na fase desde" },
  { k: "previsaoExecucao", label: "Prev. execução" },
  { k: "dataFimServico", label: "Fim do serviço" },
  { k: "previsaoFaturamento", label: "Prev. faturamento" },
  { k: "ordemOmie", label: "Ordem Omie" },
  { k: "ppvId", label: "PPV" },
  { k: "projeto", label: "Projeto / máquina" },
  { k: "servSolicitado", label: "Solicitação" },
] as const;
export type ColOSKey = (typeof COLS_RELACAO_OS)[number]["k"];

/** Colunas de DATA: o filtro do cabeçalho vira um seletor de período. */
export const COLS_DATA_OS: ColOSKey[] = ["data", "dataFase", "previsaoExecucao", "dataFimServico", "previsaoFaturamento"];

/** Fases que contam como "Pendente" (tudo menos Concluída e Cancelada). */
export const FASES_PENDENTES_OS: string[] = PHASES.filter((f) => f !== "Concluída" && f !== "Cancelada");
export const FASE_PENDENTE_OS = "Pendente";

export function estaPendente(o: Pick<KanbanCard, "status">): boolean {
  return o.status !== "Concluída" && o.status !== "Cancelada";
}

/** `valor` do card vem como "1234,56" (string BR sem milhar) — ou número. */
export function valorOS(o: Pick<KanbanCard, "valor">): number {
  const v = o.valor as unknown;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = parseFloat(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
}

/** Rótulo curto de cada fase (mesmo do PhaseAccordion) + cores (selo na tela, legenda no PDF). */
export interface FaseOS { nome: string; label: string; bg: string; text: string }
const FASES_DEF: Record<string, { label: string; bg: string; text: string }> = {
  "Orçamento": { label: "Orçamento", bg: "#FFFBEB", text: "#B45309" },
  "Orçamento enviado para o cliente e aguardando": { label: "Orç. enviado", bg: "#FFF7ED", text: "#C2410C" },
  "Orçamento Aprovado": { label: "Orç. aprovado", bg: "#DCFCE7", text: "#15803D" },
  "Execução": { label: "Execução", bg: "#EFF6FF", text: "#1D4ED8" },
  "Execução (Realizando Diagnóstico)": { label: "Diagnóstico", bg: "#F0F9FF", text: "#0369A1" },
  "Execução aguardando peças (em transporte)": { label: "Aguard. peças", bg: "#F5F3FF", text: "#6D28D9" },
  "Relatório Atualizado": { label: "Rel. atualizado", bg: "#E0F2FE", text: "#0369A1" },
  "Executada": { label: "Executada", bg: "#EDE9FE", text: "#6D28D9" },
  "Executada aguardando comercial": { label: "Aguard. comercial", bg: "#FAF5FF", text: "#7C3AED" },
  "Aguardando outros": { label: "Aguard. outros", bg: "#FEFCE8", text: "#CA8A04" },
  "Aguardando ordem Técnico": { label: "Aguard. técnico", bg: "#FFF7ED", text: "#D97706" },
  "Relatório Concluído": { label: "Rel. concluído", bg: "#ECFEFF", text: "#0891B2" },
  "Enviar Omie": { label: "Enviar Omie", bg: "#FFEDD5", text: "#C2410C" },
  "Enviado Para Omie": { label: "Enviado Omie", bg: "#FFF3E6", text: "#C2570A" },
  "Preenchido Garantia": { label: "Preench. garantia", bg: "#FCE7F3", text: "#BE185D" },
  "Concluída": { label: "Concluída", bg: "#ECFDF5", text: "#047857" },
  "Cancelada": { label: "Cancelada", bg: "#FEF2F2", text: "#B91C1C" },
};
export const FASES_OS: FaseOS[] = PHASES.map((nome) => ({ nome, ...(FASES_DEF[nome] || { label: nome, bg: "#F1F5F9", text: "#334155" }) }));
export function faseOS(status: string): FaseOS {
  return FASES_OS.find((f) => f.nome === status) || { nome: status, label: status || "—", bg: "#F1F5F9", text: "#334155" };
}
export function rotuloFaseOS(status: string): string { return faseOS(status).label; }

/** Cores da fase em RGB (jspdf) — fill/text = selo; linha = tom claro na linha inteira. */
export interface FasePdfOS { nome: string; label: string; fill: [number, number, number]; text: [number, number, number]; linha: [number, number, number] }
export const FASES_PDF_OS: FasePdfOS[] = FASES_OS.map((f) => ({ nome: f.nome, label: f.label, fill: hexToRgb(f.bg), text: hexToRgb(f.text), linha: hexToRgb(f.bg) }));

/** Texto exibido em cada coluna — serve pro filtro do cabeçalho, pro PDF e pro CSV (bate com a tela). */
export function colTextoOS(o: KanbanCard, k: ColOSKey): string {
  switch (k) {
    case "id": return String(o.id || "").replace(/^OS-?/i, "");
    case "cliente": return o.cliente || "Sem cliente";
    case "tecnico": return o.tecnico || "";
    case "tipoServico": return o.tipoServico || "";
    case "data": return fmtDataCurta(o.data);
    case "valor": return fmtBRL(valorOS(o));
    case "status": return rotuloFaseOS(o.status);
    case "dataFase": return fmtDataCurta(o.dataFase);
    case "previsaoExecucao": return fmtDataCurta(o.previsaoExecucao);
    case "dataFimServico": return fmtDataCurta(o.dataFimServico);
    case "previsaoFaturamento": return fmtDataCurta(o.previsaoFaturamento);
    case "ordemOmie": return o.ordemOmie || "";
    case "ppvId": return o.ppvId || "";
    case "projeto": return o.projeto || "";
    case "servSolicitado": return o.servSolicitado === "-" ? "" : (o.servSolicitado || "");
    default: return "";
  }
}

/** Valor cru da coluna de data (pra aplicar o token de período). */
function dataCruaOS(o: KanbanCard, k: ColOSKey): string {
  switch (k) {
    case "data": return o.data;
    case "dataFase": return o.dataFase;
    case "previsaoExecucao": return o.previsaoExecucao;
    case "dataFimServico": return o.dataFimServico;
    case "previsaoFaturamento": return o.previsaoFaturamento;
    default: return "";
  }
}

// ---------- Filtro / ordenação ----------
export interface FiltrosOS {
  busca?: string;
  status?: string;            // fase exata ou FASE_PENDENTE_OS ("" = todas)
  tecnico?: string;           // filtro do header (nome exato, comparado normalizado)
  filtrosCol?: Partial<Record<ColOSKey, string>>;
  hoje?: Date;
}
export interface OrdemOS { key: ColOSKey; dir: "asc" | "desc" }

const norm = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export function filtrarOS(lista: KanbanCard[], f: FiltrosOS): KanbanCard[] {
  const q = (f.busca || "").trim().toLowerCase();
  const cols = f.filtrosCol || {};
  const hoje = f.hoje || new Date();
  const tec = norm(f.tecnico || "");
  return lista.filter((o) => {
    if (f.status === FASE_PENDENTE_OS) { if (!estaPendente(o)) return false; }
    else if (f.status && o.status !== f.status) return false;
    if (tec && norm(o.tecnico) !== tec) return false;
    if (q) {
      const campos = [o.id, o.cliente, o.tecnico, o.ordemOmie, o.ppvId, o.servSolicitado, o.projeto, o.tipoServico, rotuloFaseOS(o.status), fmtBRL(valorOS(o)), String(o.valor ?? "")];
      if (!campos.some((v) => String(v || "").toLowerCase().includes(q))) return false;
    }
    for (const [k, v] of Object.entries(cols)) {
      const raw = String(v || "").trim();
      if (!raw) continue;
      const key = k as ColOSKey;
      if (COLS_DATA_OS.includes(key) && ehTokenPeriodo(raw)) {
        if (!passaPeriodo(dataCruaOS(o, key), raw, hoje)) return false;
        continue;
      }
      const q2 = raw.toLowerCase();
      if (key === "status") {
        if (q2 === FASE_PENDENTE_OS.toLowerCase()) { if (!estaPendente(o)) return false; continue; }
        if (rotuloFaseOS(o.status).toLowerCase() !== q2 && o.status.toLowerCase() !== q2) return false;
        continue;
      }
      if (key === "tipoServico") { if ((o.tipoServico || "").toLowerCase() !== q2) return false; continue; }
      let alvo = colTextoOS(o, key).toLowerCase();
      if (key === "valor") alvo += ` ${String(o.valor ?? "").toLowerCase()}`;
      if (key === "id") alvo += ` ${String(o.id || "").toLowerCase()}`;
      if (!alvo.includes(q2)) return false;
    }
    return true;
  });
}

const SORT_GET: Record<ColOSKey, (o: KanbanCard) => number | string> = {
  id: (o) => Number(String(o.id || "").replace(/\D/g, "")) || 0,
  cliente: (o) => (o.cliente || "").toLowerCase(),
  tecnico: (o) => (o.tecnico || "").toLowerCase(),
  tipoServico: (o) => (o.tipoServico || "").toLowerCase(),
  data: (o) => dataMs(o.data),
  valor: (o) => valorOS(o),
  status: (o) => PHASES.indexOf(o.status),
  dataFase: (o) => dataMs(o.dataFase),
  previsaoExecucao: (o) => dataMs(o.previsaoExecucao),
  dataFimServico: (o) => dataMs(o.dataFimServico),
  previsaoFaturamento: (o) => dataMs(o.previsaoFaturamento),
  ordemOmie: (o) => Number(o.ordemOmie) || (o.ordemOmie || "").toLowerCase(),
  ppvId: (o) => Number(String(o.ppvId || "").replace(/\D/g, "")) || 0,
  projeto: (o) => (o.projeto || "").toLowerCase(),
  servSolicitado: (o) => (o.servSolicitado || "").toLowerCase(),
};

export function ordenarOS(lista: KanbanCard[], ordem: OrdemOS): KanbanCard[] {
  const get = SORT_GET[ordem.key] || (() => 0);
  return [...lista].sort((a, b) => {
    const va = get(a), vb = get(b);
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
    return ordem.dir === "asc" ? cmp : -cmp;
  });
}

/** Resumo legível dos filtros ativos (sub-header do PDF). */
export function resumoFiltrosOS(f: FiltrosOS, ordem?: OrdemOS): string[] {
  const r: string[] = [];
  if ((f.busca || "").trim()) r.push(`Busca: "${(f.busca || "").trim()}"`);
  if (f.tecnico) r.push(`Técnico: ${f.tecnico}`);
  if (f.status === FASE_PENDENTE_OS) r.push("Fase: Pendente (menos Concluída/Cancelada)");
  else if (f.status) r.push(`Fase: ${rotuloFaseOS(f.status)}`);
  for (const col of COLS_RELACAO_OS) {
    const v = String(f.filtrosCol?.[col.k] || "").trim();
    if (!v) continue;
    if (COLS_DATA_OS.includes(col.k) && ehTokenPeriodo(v)) { const rot = rotuloPeriodo(v); if (rot && rot !== "A partir de…") r.push(`${col.label}: ${rot}`); }
    else if (col.k === "status" && v.toLowerCase() === FASE_PENDENTE_OS.toLowerCase()) r.push("Fase: Pendente (menos Concluída/Cancelada)");
    else r.push(`${col.label}: "${v}"`);
  }
  if (ordem) { const c = COLS_RELACAO_OS.find((x) => x.k === ordem.key); if (c) r.push(`Ordenado por ${c.label} ${ordem.dir === "asc" ? "(A-Z)" : "(Z-A)"}`); }
  return r;
}

/** Totais (cards da tela, rodapé do PDF). */
export function totaisOS(lista: KanbanCard[]) {
  const t = { n: 0, valor: 0, pendentesN: 0, pendentesV: 0, concluidasN: 0, concluidasV: 0, canceladasN: 0, atrasadasN: 0, horas: 0, km: 0 };
  for (const o of lista) {
    const v = valorOS(o);
    t.n++; t.valor += v;
    if (estaPendente(o)) { t.pendentesN++; t.pendentesV += v; }
    if (o.status === "Concluída") { t.concluidasN++; t.concluidasV += v; }
    if (o.status === "Cancelada") t.canceladasN++;
    if ((o.diasAtraso || 0) > 0 && estaPendente(o)) t.atrasadasN++;
    t.horas += Number(o.qtdHoras) || 0;
    t.km += Number(o.qtdKm) || 0;
  }
  return t;
}

// ---------- Agregações do Dashboard ----------
const agOS = (lista: KanbanCard[], chaveDe: (o: KanbanCard) => string, labelDe?: (c: string) => string, ordem?: "valor" | "n" | "chave") =>
  agregarPor(lista.map((o) => ({ ...o, valor: valorOS(o) })) as unknown as Parameters<typeof agregarPor>[0], chaveDe as unknown as Parameters<typeof agregarPor>[1], labelDe, ordem);

export function porMesDataOS(lista: KanbanCard[]): Agregado[] {
  return agOS(lista, (o) => chaveMes(o.data) || "0000-00", (c) => (c === "0000-00" ? "Sem data" : rotuloMes(c)), "chave");
}
export function porMesPrevisaoOS(lista: KanbanCard[]): Agregado[] {
  return agOS(lista, (o) => chaveMes(o.previsaoFaturamento) || "zzzz", (c) => (c === "zzzz" ? "Sem previsão" : rotuloMes(c)), "chave");
}
export function porMesFimOS(lista: KanbanCard[]): Agregado[] {
  return agOS(lista, (o) => chaveMes(o.dataFimServico) || "zzzz", (c) => (c === "zzzz" ? "Sem fim" : rotuloMes(c)), "chave");
}
export function porTecnicoOS(lista: KanbanCard[]): Agregado[] {
  return agOS(lista, (o) => (o.tecnico || "").trim() || "(sem técnico)");
}
export function porClienteOS(lista: KanbanCard[]): Agregado[] {
  return agOS(lista, (o) => (o.cliente || "").trim() || "(sem cliente)");
}
export function porTipoOS(lista: KanbanCard[]): Agregado[] {
  return agOS(lista, (o) => (o.tipoServico || "").trim() || "(sem tipo)");
}
export function porFaseOS(lista: KanbanCard[]): Agregado[] {
  const arr = agOS(lista, (o) => o.status || "", (c) => rotuloFaseOS(c), "chave");
  return arr.sort((a, b) => PHASES.indexOf(a.chave) - PHASES.indexOf(b.chave));
}

/** CSV (BOM + ';' + CRLF, Excel-BR) da relação, como está na tela. */
export function gerarCSVOS(lista: KanbanCard[]): string {
  const sep = ";";
  const cell = (v: string) => (/[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const head = [...COLS_RELACAO_OS.map((c) => c.label), "Valor (número)", "Horas", "Km", "Dias de atraso"].join(sep);
  const linhas = lista.map((o) => [
    ...COLS_RELACAO_OS.map((c) => cell(colTextoOS(o, c.k))),
    valorOS(o).toFixed(2).replace(".", ","),
    String(Number(o.qtdHoras) || 0).replace(".", ","),
    String(Number(o.qtdKm) || 0).replace(".", ","),
    String(o.diasAtraso || 0),
  ].join(sep));
  return "﻿" + [head, ...linhas].join("\r\n") + "\r\n";
}
