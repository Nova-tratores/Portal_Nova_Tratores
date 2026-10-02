// Performance dos atendentes (tela /feedbacks/relatorios) — PURO, sem I/O.
//
// Duas fontes, uma pessoa:
//  - feedback_registros.atendente_nome → atendimentos trabalhados (CRM/RFM)
//  - feedback_chamada                  → ligações do cockpit (tempo, desfecho,
//                                        humor, qualidade)
// O nome é normalizado (trim + espaços duplos) porque o banco tem
// "Vinicius Correa " e "Vinicius Correa" como se fossem duas pessoas.

import type { FeedbackRegistro, TipoFeedback } from "../types";
import { DESFECHOS, type Desfecho } from "./chamada";

export interface ChamadaResumo {
  atendente_nome: string;
  iniciada_em: string;
  encerrada_em: string | null;
  duracao_seg: number | null;
  desfecho: Desfecho | null;
  humor_cliente: number | null;
  qualidade_conversa: number | null;
  feedback_id: number | null;
  cliente_key: string | null;
}

export type PresetPeriodo = "hoje" | "ontem" | "7d" | "30d" | "mes" | "mes_anterior" | "tudo" | "custom";

export const PRESETS_PERIODO: { valor: PresetPeriodo; rotulo: string }[] = [
  { valor: "hoje", rotulo: "Hoje" },
  { valor: "ontem", rotulo: "Ontem" },
  { valor: "7d", rotulo: "Últimos 7 dias" },
  { valor: "30d", rotulo: "Últimos 30 dias" },
  { valor: "mes", rotulo: "Este mês" },
  { valor: "mes_anterior", rotulo: "Mês anterior" },
  { valor: "tudo", rotulo: "Tudo" },
  { valor: "custom", rotulo: "Período…" },
];

/** Intervalo em YYYY-MM-DD LOCAL, inclusivo nas duas pontas; null = sem limite. */
export interface Periodo { de: string | null; ate: string | null }

/** Date → YYYY-MM-DD no fuso local (o `toISOString` daria o dia em UTC). */
export function dataLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** timestamptz / "YYYY-MM-DD" → dia local. "YYYY-MM-DD" puro é lido como local (não UTC). */
export function diaDe(iso: string | null | undefined): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dataLocal(d);
}

export function periodoDoPreset(preset: PresetPeriodo, hoje: Date = new Date(), custom?: Periodo): Periodo {
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  const mais = (dias: number) => { const d = new Date(h); d.setDate(d.getDate() + dias); return dataLocal(d); };
  switch (preset) {
    case "hoje": return { de: dataLocal(h), ate: dataLocal(h) };
    case "ontem": return { de: mais(-1), ate: mais(-1) };
    case "7d": return { de: mais(-6), ate: dataLocal(h) };
    case "30d": return { de: mais(-29), ate: dataLocal(h) };
    case "mes": return { de: dataLocal(new Date(h.getFullYear(), h.getMonth(), 1)), ate: dataLocal(h) };
    case "mes_anterior": {
      const ini = new Date(h.getFullYear(), h.getMonth() - 1, 1);
      const fim = new Date(h.getFullYear(), h.getMonth(), 0);
      return { de: dataLocal(ini), ate: dataLocal(fim) };
    }
    case "tudo": return { de: null, ate: null };
    case "custom": return { de: custom?.de || null, ate: custom?.ate || null };
  }
}

export function dentroDoPeriodo(dia: string, p: Periodo): boolean {
  if (!dia) return false;
  if (p.de && dia < p.de) return false;
  if (p.ate && dia > p.ate) return false;
  return true;
}

export function normalizarAtendente(nome: string | null | undefined): string {
  return (nome || "").replace(/\s+/g, " ").trim();
}

/** Data que representa o atendimento: quando concluiu, senão quando abriu, senão a data de contato/criação. */
export function diaDoRegistro(r: FeedbackRegistro): string {
  return diaDe(r.concluido_em || r.aberto_em || r.data_contato || r.criado_em);
}

export interface StatsAtendimentos {
  total: number;
  concluidos: number;
  semResposta: number;
  emAberto: number;
  gerouServico: number; // "serviço confirmado" preenchido
  positiva: number;     // CRM: satisfeito / NPS sim
  negativa: number;     // CRM: insatisfeito / NPS não
  pctConclusao: number;
}

export interface StatsLigacoes {
  total: number;          // encerradas no período
  abertas: number;        // em andamento agora (qualquer data)
  tempoTotalSeg: number;
  tempoMedioSeg: number | null;
  desfechos: Record<Desfecho, number>;
  contatoEfetivo: number; // total − sem_resposta − numero_errado
  taxaContato: number | null;   // % contatoEfetivo / total
  conversoes: number;     // servico_agendado + vendeu
  taxaConversao: number | null; // % conversoes / contatoEfetivo
  humorMedio: number | null;
  qualidadeMedia: number | null;
}

export interface PerformanceAtendente {
  atendente: string;
  atendimentos: StatsAtendimentos;
  ligacoes: StatsLigacoes;
}

function desfechosZerados(): Record<Desfecho, number> {
  return Object.fromEntries(DESFECHOS.map((d) => [d.valor, 0])) as Record<Desfecho, number>;
}

function novo(atendente: string): PerformanceAtendente {
  return {
    atendente,
    atendimentos: { total: 0, concluidos: 0, semResposta: 0, emAberto: 0, gerouServico: 0, positiva: 0, negativa: 0, pctConclusao: 0 },
    ligacoes: { total: 0, abertas: 0, tempoTotalSeg: 0, tempoMedioSeg: null, desfechos: desfechosZerados(), contatoEfetivo: 0, taxaContato: null, conversoes: 0, taxaConversao: null, humorMedio: null, qualidadeMedia: null },
  };
}

const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);
const media = (xs: number[]): number | null => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null);

/** Ordem do ranking: quem converteu mais (serviço agendado + venda), depois concluídos, ligações, atendimentos. */
export function compararPerformance(a: PerformanceAtendente, b: PerformanceAtendente): number {
  return (
    b.ligacoes.conversoes - a.ligacoes.conversoes ||
    b.atendimentos.concluidos - a.atendimentos.concluidos ||
    b.ligacoes.total - a.ligacoes.total ||
    b.atendimentos.total - a.atendimentos.total ||
    a.atendente.localeCompare(b.atendente)
  );
}

export function agregarPerformance(
  registros: FeedbackRegistro[],
  chamadas: ChamadaResumo[],
  periodo: Periodo,
  fonte: "todos" | TipoFeedback = "todos"
): PerformanceAtendente[] {
  const map = new Map<string, PerformanceAtendente>();
  const humores = new Map<string, number[]>();
  const qualidades = new Map<string, number[]>();
  const pegar = (nome: string) => {
    let s = map.get(nome);
    if (!s) { s = novo(nome); map.set(nome, s); }
    return s;
  };

  for (const r of registros) {
    if (fonte !== "todos" && r.tipo !== fonte) continue;
    const nome = normalizarAtendente(r.atendente_nome);
    if (!nome) continue;
    if (!dentroDoPeriodo(diaDoRegistro(r), periodo)) continue;
    const a = pegar(nome).atendimentos;
    a.total++;
    if (r.status_atendimento === "concluido") a.concluidos++;
    else if (r.status_atendimento === "sem_resposta") a.semResposta++;
    else a.emAberto++;
    if ((r.revisao_confirmada || "").trim()) a.gerouServico++;
    if (r.tipo === "crm" && r.status_atendimento === "concluido") {
      if (r.status_cliente === "Satisfeito" || r.nps === "Sim") a.positiva++;
      else if (r.status_cliente === "Insatisfeito" || r.nps === "Não") a.negativa++;
    }
  }

  for (const c of chamadas) {
    const nome = normalizarAtendente(c.atendente_nome);
    if (!nome) continue;
    if (!c.encerrada_em) { pegar(nome).ligacoes.abertas++; continue; }
    if (!dentroDoPeriodo(diaDe(c.iniciada_em), periodo)) continue;
    const l = pegar(nome).ligacoes;
    l.total++;
    l.tempoTotalSeg += Math.max(0, c.duracao_seg ?? 0);
    if (c.desfecho && c.desfecho in l.desfechos) l.desfechos[c.desfecho]++;
    if (typeof c.humor_cliente === "number") { const xs = humores.get(nome) ?? []; xs.push(c.humor_cliente); humores.set(nome, xs); }
    if (typeof c.qualidade_conversa === "number") { const xs = qualidades.get(nome) ?? []; xs.push(c.qualidade_conversa); qualidades.set(nome, xs); }
  }

  for (const s of map.values()) {
    const a = s.atendimentos;
    a.pctConclusao = pct(a.concluidos, a.total) ?? 0;
    const l = s.ligacoes;
    l.contatoEfetivo = l.total - l.desfechos.sem_resposta - l.desfechos.numero_errado;
    l.conversoes = l.desfechos.servico_agendado + l.desfechos.vendeu;
    l.taxaContato = pct(l.contatoEfetivo, l.total);
    l.taxaConversao = pct(l.conversoes, l.contatoEfetivo);
    l.tempoMedioSeg = l.total > 0 ? Math.round(l.tempoTotalSeg / l.total) : null;
    l.humorMedio = media(humores.get(s.atendente) ?? []);
    l.qualidadeMedia = media(qualidades.get(s.atendente) ?? []);
  }

  return Array.from(map.values()).sort(compararPerformance);
}

/** Linha "Equipe" com a soma de todos (médias ponderadas pelas contagens). */
export function totalPerformance(lista: PerformanceAtendente[]): PerformanceAtendente {
  const t = novo("Equipe");
  let humorSoma = 0, humorN = 0, qualSoma = 0, qualN = 0;
  for (const s of lista) {
    for (const k of Object.keys(t.atendimentos) as (keyof StatsAtendimentos)[]) if (k !== "pctConclusao") t.atendimentos[k] += s.atendimentos[k];
    t.ligacoes.total += s.ligacoes.total;
    t.ligacoes.abertas += s.ligacoes.abertas;
    t.ligacoes.tempoTotalSeg += s.ligacoes.tempoTotalSeg;
    for (const d of DESFECHOS) t.ligacoes.desfechos[d.valor] += s.ligacoes.desfechos[d.valor];
    if (s.ligacoes.humorMedio != null) { humorSoma += s.ligacoes.humorMedio * s.ligacoes.total; humorN += s.ligacoes.total; }
    if (s.ligacoes.qualidadeMedia != null) { qualSoma += s.ligacoes.qualidadeMedia * s.ligacoes.total; qualN += s.ligacoes.total; }
  }
  t.atendimentos.pctConclusao = pct(t.atendimentos.concluidos, t.atendimentos.total) ?? 0;
  const l = t.ligacoes;
  l.contatoEfetivo = l.total - l.desfechos.sem_resposta - l.desfechos.numero_errado;
  l.conversoes = l.desfechos.servico_agendado + l.desfechos.vendeu;
  l.taxaContato = pct(l.contatoEfetivo, l.total);
  l.taxaConversao = pct(l.conversoes, l.contatoEfetivo);
  l.tempoMedioSeg = l.total > 0 ? Math.round(l.tempoTotalSeg / l.total) : null;
  l.humorMedio = humorN ? Math.round((humorSoma / humorN) * 10) / 10 : null;
  l.qualidadeMedia = qualN ? Math.round((qualSoma / qualN) * 10) / 10 : null;
  return t;
}

export interface LinhaDia {
  dia: string; // YYYY-MM-DD
  porAtendente: Record<string, { atendimentos: number; ligacoes: number }>;
  atendimentos: number;
  ligacoes: number;
}

/** Dia a dia do período (só dias com algo), mais recente primeiro. */
export function porDia(
  registros: FeedbackRegistro[],
  chamadas: ChamadaResumo[],
  periodo: Periodo,
  fonte: "todos" | TipoFeedback = "todos"
): LinhaDia[] {
  const map = new Map<string, LinhaDia>();
  const linha = (dia: string) => {
    let l = map.get(dia);
    if (!l) { l = { dia, porAtendente: {}, atendimentos: 0, ligacoes: 0 }; map.set(dia, l); }
    return l;
  };
  const cel = (l: LinhaDia, nome: string) => (l.porAtendente[nome] ??= { atendimentos: 0, ligacoes: 0 });
  for (const r of registros) {
    if (fonte !== "todos" && r.tipo !== fonte) continue;
    const nome = normalizarAtendente(r.atendente_nome);
    const dia = diaDoRegistro(r);
    if (!nome || !dentroDoPeriodo(dia, periodo)) continue;
    const l = linha(dia); l.atendimentos++; cel(l, nome).atendimentos++;
  }
  for (const c of chamadas) {
    const nome = normalizarAtendente(c.atendente_nome);
    const dia = diaDe(c.iniciada_em);
    if (!nome || !c.encerrada_em || !dentroDoPeriodo(dia, periodo)) continue;
    const l = linha(dia); l.ligacoes++; cel(l, nome).ligacoes++;
  }
  return Array.from(map.values()).sort((a, b) => b.dia.localeCompare(a.dia));
}

export const CSV_PERFORMANCE_CABECALHO = [
  "Atendente", "Atendimentos", "Concluídos", "Sem resposta", "Em aberto", "% Conclusão", "Gerou serviço", "Positiva CRM", "Negativa CRM",
  "Ligações", "Tempo total (s)", "Tempo médio (s)", "Contato efetivo", "% Contato", "Serviço agendado", "Vendeu", "Retornar", "Recusou", "Sem resposta (lig.)", "Número errado",
  "Conversões", "% Conversão", "Humor médio", "Qualidade média",
];

export function linhaCSVPerformance(s: PerformanceAtendente): (string | number)[] {
  const a = s.atendimentos, l = s.ligacoes;
  return [
    s.atendente, a.total, a.concluidos, a.semResposta, a.emAberto, a.pctConclusao, a.gerouServico, a.positiva, a.negativa,
    l.total, l.tempoTotalSeg, l.tempoMedioSeg ?? "", l.contatoEfetivo, l.taxaContato ?? "", l.desfechos.servico_agendado, l.desfechos.vendeu, l.desfechos.retornar, l.desfechos.recusou, l.desfechos.sem_resposta, l.desfechos.numero_errado,
    l.conversoes, l.taxaConversao ?? "", l.humorMedio ?? "", l.qualidadeMedia ?? "",
  ];
}
