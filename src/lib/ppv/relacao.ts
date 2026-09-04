// =============================================
// RELAÇÃO DO PPV (modo "Relação" da tela /ppv)
// Definições PURAS (sem servidor) compartilhadas entre: a tabela da tela, o PDF
// do navegador (jspdf), o PDF do servidor (pdfkit), o CSV e o e-mail.
// Espelha o modo lista de /propostas: filtro por coluna (AND), atalhos por fase,
// ordenação clicável e impressão "exatamente como está na tela".
// =============================================
import type { KanbanItem } from "./types";
import { normalizarStatus } from "./utils";
import { STATUS_COLORS, STATUS_OPTIONS, rotuloStatus } from "./constants";

// Colunas da relação (k = chave do sort/filtro por coluna; label = cabeçalho da tela, PDF e CSV).
export const COLS_RELACAO = [
  { k: "id", label: "Nº" },
  { k: "tipo", label: "Tipo" },
  { k: "cliente", label: "Cliente" },
  { k: "tecnico", label: "Técnico" },
  { k: "data", label: "Data" },
  { k: "valor", label: "Valor" },
  { k: "status", label: "Fase" },
  { k: "pedidoOmie", label: "Pedido Omie" },
  { k: "osId", label: "O.S." },
  { k: "nfNumero", label: "NF" },
  { k: "observacao", label: "Observação" },
  { k: "criadoPor", label: "Criado por" },
] as const;
export type ColRelacaoKey = (typeof COLS_RELACAO)[number]["k"];

/** Fases que contam como "em aberto" (tudo menos Faturado e Cancelada). */
export const STATUS_ABERTO_PPV: string[] = STATUS_OPTIONS.map((s) => s.value).filter((v) => v !== "Concluída" && v !== "Cancelada");

export function isRemessa(o: Pick<KanbanItem, "tipo">): boolean {
  const t = String(o.tipo || "");
  return t.toLowerCase().includes("remessa") || t.toUpperCase() === "REM";
}

/** "PPV-0201" → "0201" (o tipo já diz se é PPV ou REM). */
export function numeroPedido(o: Pick<KanbanItem, "id">): string {
  return String(o.id || "").replace(/^(PPV|REM)-?/i, "");
}

export function valorNum(o: Pick<KanbanItem, "valor">): number {
  const n = parseFloat(String(o.valor ?? 0).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function fmtBRL(n: number): string {
  return "R$ " + (Number(n) || 0).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Data do pedido vem como "DD/MM/YYYY HH:mm" (formatarDataBR) ou ISO. Devolve ms pra ordenar. */
export function dataMs(s: string | null | undefined): number {
  const str = String(s || "").trim();
  if (!str) return 0;
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime();
  const t = new Date(str).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Só a data (sem hora): "DD/MM/YYYY". */
export function fmtDataCurta(s: string | null | undefined): string {
  const str = String(s || "").trim();
  if (!str) return "";
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  if (str.includes("-")) { const p = str.split(/[-T ]/); if (p.length >= 3) return `${p[2]}/${p[1]}/${p[0]}`; }
  return str;
}

export function statusNorm(o: Pick<KanbanItem, "status">): string {
  return normalizarStatus(o.status);
}
export function estaAberto(o: Pick<KanbanItem, "status">): boolean {
  return STATUS_ABERTO_PPV.includes(statusNorm(o));
}

/** Texto exibido em cada coluna — serve pro filtro do cabeçalho, pro PDF e pro CSV (bate com a tela). */
export function colTextoRelacao(o: KanbanItem, k: ColRelacaoKey): string {
  switch (k) {
    case "id": return numeroPedido(o);
    case "tipo": return isRemessa(o) ? "REM" : "PPV";
    case "cliente": return o.cliente || "Sem cliente";
    case "tecnico": return o.tecnico || "";
    case "data": return fmtDataCurta(o.data);
    case "valor": return fmtBRL(valorNum(o));
    case "status": return rotuloStatus(statusNorm(o));
    case "pedidoOmie": return o.pedidoOmie || "";
    case "osId": return o.osId || "";
    case "nfNumero": return o.nfNumero || "";
    case "observacao": return o.observacao || "";
    case "criadoPor": return o.criadoPor || o.ultimoUsuario || "";
    default: return "";
  }
}

// ---------- Filtro / ordenação (mesma regra na tela e em quem reproduz a tela) ----------
export interface FiltrosRelacao {
  busca?: string;                 // busca livre (qualquer coluna)
  status?: string;                // fase exata ("" = todas)
  soAbertos?: boolean;            // atalho "Em aberto"
  filtrosCol?: Partial<Record<ColRelacaoKey, string>>; // filtro por coluna (AND)
}
export interface OrdemRelacao { key: ColRelacaoKey; dir: "asc" | "desc" }

export function filtrarRelacao(lista: KanbanItem[], f: FiltrosRelacao): KanbanItem[] {
  const q = (f.busca || "").trim().toLowerCase();
  const cols = f.filtrosCol || {};
  return lista.filter((o) => {
    if (f.status && statusNorm(o) !== f.status) return false;
    if (f.soAbertos && !estaAberto(o)) return false;
    if (q) {
      const campos = [
        o.id, numeroPedido(o), o.cliente, o.tecnico, o.pedidoOmie, o.osId, o.nfNumero, o.observacao,
        rotuloStatus(statusNorm(o)), fmtBRL(valorNum(o)), String(o.valor ?? ""), o.criadoPor,
      ];
      if (!campos.some((v) => String(v || "").toLowerCase().includes(q))) return false;
    }
    for (const [k, v] of Object.entries(cols)) {
      const q2 = String(v || "").trim().toLowerCase();
      if (!q2) continue;
      let alvo = colTextoRelacao(o, k as ColRelacaoKey).toLowerCase();
      if (k === "valor") alvo += ` ${String(o.valor ?? "").toLowerCase()}`;   // "1500" acha "1.500,00"
      if (k === "id") alvo += ` ${String(o.id || "").toLowerCase()}`;        // "ppv-02" também acha
      if (!alvo.includes(q2)) return false;
    }
    return true;
  });
}

const SORT_GET: Record<ColRelacaoKey, (o: KanbanItem) => number | string> = {
  id: (o) => Number(numeroPedido(o)) || 0,
  tipo: (o) => (isRemessa(o) ? 1 : 0),
  cliente: (o) => (o.cliente || "").toLowerCase(),
  tecnico: (o) => (o.tecnico || "").toLowerCase(),
  data: (o) => dataMs(o.data),
  valor: (o) => valorNum(o),
  status: (o) => STATUS_OPTIONS.findIndex((s) => s.value === statusNorm(o)),
  pedidoOmie: (o) => Number(o.pedidoOmie) || (o.pedidoOmie || "").toLowerCase(),
  osId: (o) => Number(o.osId) || (o.osId || "").toLowerCase(),
  nfNumero: (o) => Number(o.nfNumero) || (o.nfNumero || "").toLowerCase(),
  observacao: (o) => (o.observacao || "").toLowerCase(),
  criadoPor: (o) => (o.criadoPor || o.ultimoUsuario || "").toLowerCase(),
};

export function ordenarRelacao(lista: KanbanItem[], ordem: OrdemRelacao): KanbanItem[] {
  const get = SORT_GET[ordem.key] || (() => 0);
  return [...lista].sort((a, b) => {
    const va = get(a), vb = get(b);
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
    return ordem.dir === "asc" ? cmp : -cmp;
  });
}

/** Resumo legível dos filtros ativos (vai no sub-header do PDF e no corpo do e-mail). */
export function resumoFiltrosRelacao(f: FiltrosRelacao & { tipoFilter?: string }, ordem?: OrdemRelacao): string[] {
  const r: string[] = [];
  if ((f.busca || "").trim()) r.push(`Busca: "${(f.busca || "").trim()}"`);
  if (f.tipoFilter === "PEDIDO") r.push("Só PPV (pedidos)");
  if (f.tipoFilter === "REMESSA") r.push("Só REM (remessas)");
  if (f.status) r.push(`Fase: ${rotuloStatus(f.status)}`);
  if (f.soAbertos) r.push("Só em aberto");
  for (const col of COLS_RELACAO) { const v = String(f.filtrosCol?.[col.k] || "").trim(); if (v) r.push(`${col.label}: "${v}"`); }
  if (ordem) { const c = COLS_RELACAO.find((x) => x.k === ordem.key); if (c) r.push(`Ordenado por ${c.label} ${ordem.dir === "asc" ? "(A-Z)" : "(Z-A)"}`); }
  return r;
}

// ---------- Cores das fases (tela → PDF) ----------
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export interface FasePdf { nome: string; label: string; fill: [number, number, number]; text: [number, number, number]; linha: [number, number, number]; fillHex: string; textHex: string }

/** Mesmas cores da tela (STATUS_COLORS) em RGB: fill/text = selo da fase; linha = tom claro na linha inteira. */
export const FASES_PDF: FasePdf[] = STATUS_OPTIONS.map((s) => {
  const c = STATUS_COLORS[s.value] || { text: "#334155", bg: "#F1F5F9" };
  return { nome: s.value, label: s.label, fill: hexToRgb(c.bg), text: hexToRgb(c.text), linha: hexToRgb(c.bg), fillHex: c.bg, textHex: c.text };
});
export function faseDoPedido(o: KanbanItem): FasePdf | null {
  const n = statusNorm(o);
  return FASES_PDF.find((f) => f.nome === n) || null;
}

/** Totais da relação (rodapé do PDF, cards da tela, corpo do e-mail). */
export function totaisRelacao(lista: KanbanItem[]) {
  const t = { n: 0, valor: 0, abertosN: 0, abertosV: 0, faturadosN: 0, faturadosV: 0, remN: 0, remV: 0 };
  for (const o of lista) {
    const v = valorNum(o);
    t.n++; t.valor += v;
    if (estaAberto(o)) { t.abertosN++; t.abertosV += v; }
    if (statusNorm(o) === "Concluída") { t.faturadosN++; t.faturadosV += v; }
    if (isRemessa(o)) { t.remN++; t.remV += v; }
  }
  return t;
}

/** Linhas em texto (mesma ordem/colunas da tela) — usadas pelo PDF e pelo CSV. */
export function linhasRelacao(lista: KanbanItem[]): string[][] {
  return lista.map((o) => COLS_RELACAO.map((c) => colTextoRelacao(o, c.k)));
}

/** CSV (BOM + ';' + CRLF, Excel-BR) da relação, como está na tela. */
export function gerarCSVRelacao(lista: KanbanItem[]): string {
  const sep = ";";
  const cell = (v: string) => (/[";\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const head = [...COLS_RELACAO.map((c) => c.label), "Valor (número)"].join(sep);
  const linhas = lista.map((o) => [
    ...COLS_RELACAO.map((c) => cell(colTextoRelacao(o, c.k))),
    valorNum(o).toFixed(2).replace(".", ","),
  ].join(sep));
  return "﻿" + [head, ...linhas].join("\r\n") + "\r\n";
}
