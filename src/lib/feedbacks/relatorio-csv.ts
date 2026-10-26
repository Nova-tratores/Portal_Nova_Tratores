// CSV dos atendimentos e dos atendentes (vinha da antiga tela /feedbacks/relatorios, 23/10/2026 foi
// para o Painel). Excel pt-BR: separador ";", BOM UTF-8, quebras \r\n; telefone/código/data como
// TEXTO (="..."), para o Excel não virar notação científica nem "####".
import type { FeedbackRegistro } from "./types";

const SEP = ";";

export function escapeCSV(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s.includes(SEP) || s.includes('"') || s.includes("\n") || s.includes("\r") ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Data ISO (YYYY-MM-DD…) → DD/MM/AAAA; se não parecer data, devolve como está. */
export function fmtDataCSV(d: string | null | undefined): string {
  if (!d) return "";
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
}

/** Uma linha só por célula. */
export function limpar(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[\r\n]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

function txtExcel(v: unknown): string {
  const s = limpar(v);
  return s ? `="${s}"` : "";
}

export function montarCSV(cabecalho: string[], linhas: (string | number)[][]): string {
  return "﻿" + [cabecalho, ...linhas].map((row) => row.map(escapeCSV).join(SEP)).join("\r\n");
}

export function csvRegistros(rows: FeedbackRegistro[]): string {
  const cab = [
    "Tipo", "Cliente", "Telefone", "Trator", "Técnico", "Cód. Omie", "Data do contato", "Serviço", "Data do serviço", "Satisfação", "Nota", "Feedback", "NPS", "Melhoria",
    "Último serviço", "Motivo", "Prioridade", "Ação", "Sem resposta", "Revisão confirmada", "Atendente", "Status", "Criado em",
  ];
  const linhas = rows.map((r) => [
    r.tipo === "crm" ? "Pós-serviço (CRM)" : "Reativação (RFM)", limpar(r.nome), txtExcel(r.telefone), limpar(r.trator), limpar(r.tecnico), txtExcel(r.codigo_omie),
    txtExcel(fmtDataCSV(r.data_contato)), limpar(r.servico), txtExcel(fmtDataCSV(r.data_servico)), limpar(r.status_cliente), r.nota ?? "", limpar(r.feedback), limpar(r.nps),
    limpar(r.melhoria), txtExcel(fmtDataCSV(r.ultimo_servico)), limpar(r.motivo), limpar(r.prioridade), limpar(r.acao), r.sem_resposta ? "Sim" : "Não",
    txtExcel(fmtDataCSV(r.revisao_confirmada)), limpar(r.atendente_nome), limpar((r.status_atendimento || "").replace(/_/g, " ")), txtExcel(fmtDataCSV(r.criado_em)),
  ]);
  return montarCSV(cab, linhas);
}

function baixar(conteudo: string, nome: string) {
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}

export function baixarCsvRegistros(rows: FeedbackRegistro[], nome: string) {
  baixar(csvRegistros(rows), nome);
}

export function baixarCsvAtendentes<T>(lista: T[], rotuloPeriodo: string, cabecalho: string[], linha: (s: T) => (string | number)[]) {
  const linhas = lista.map((s) => [rotuloPeriodo, ...linha(s).map((v, k) => (k === 0 ? limpar(v) : v))]);
  baixar(montarCSV(["Período", ...cabecalho], linhas), `relatorio-atendentes-${new Date().toISOString().slice(0, 10)}.csv`);
}
