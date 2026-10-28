// Aba "Painel" (gerente) da tela Hoje do módulo Feedbacks (José, 23/10/2026): quem está em ligação
// agora, feitos hoje por pessoa, notas baixas para tratar, coisas paradas e conversão da semana.
// PURO (sem banco): a página passa o que leu de /api/feedbacks/crm/hoje (ou os dados de exemplo).
import type { Desfecho } from "./atendimento/chamada";
import { normalizarAtendente } from "./atendimento/performance";
import { hojeSP } from "./hoje";
import type { FeedbackRegistro, Oportunidade } from "./types";

export interface ChamadaHoje {
  id: string;
  atendente_id: string | null;
  atendente_nome: string | null;
  cliente_key: string | null;
  feedback_id: number | null;
  oportunidade_id: number | null;
  iniciada_em: string;
  encerrada_em: string | null;
  duracao_seg: number | null;
  desfecho: Desfecho | null;
  humor_cliente: number | null;
  qualidade_conversa: number | null;
}

export const LIGACAO_ESQUECIDA_MS = 2 * 3600_000;
export const DIAS_PARADO = 15;
const DIA = 86_400_000;
const diaSP = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) : "");

export interface EmLigacao { id: string; atendente: string; cliente_key: string | null; desde: string; minutos: number; esquecida: boolean }
export interface FeitoPessoa { pessoa: string; ligacoes: number; concluidos: number; oportunidades: number; total: number }
export interface NotaBaixa { id: number; nome: string; nota: number | null; status: string | null; quando: string; feedback: string | null; atendente: string | null; codigo_omie: string | null }
export interface Parado { tipo: "registro" | "ligacao"; id: string; titulo: string; detalhe: string; dias: number }
export interface Conversao { pessoa: string; ligacoes: number; contato: number; conversoes: number; taxa: number | null }

export interface Painel {
  emLigacao: EmLigacao[];
  feitosHoje: FeitoPessoa[];
  notasBaixas: NotaBaixa[];
  parados: Parado[];
  semana: { total: Conversao; porPessoa: Conversao[]; porDesfecho: Record<string, number> };
}

const ABERTOS = new Set(["aberto", "em_andamento", "sem_resposta"]);

export function montarPainel(
  e: { registros: FeedbackRegistro[]; oportunidades: Oportunidade[]; chamadas: ChamadaHoje[]; nomes: Record<string, string> },
  agora: number = Date.now(),
): Painel {
  const hoje = hojeSP(agora);
  const nome = (n: string | null | undefined) => normalizarAtendente(n) || "Sem nome";

  const emLigacao = e.chamadas.filter((c) => !c.encerrada_em).map((c): EmLigacao => {
    const ms = Math.max(0, agora - Date.parse(c.iniciada_em));
    return { id: c.id, atendente: nome(c.atendente_nome), cliente_key: c.cliente_key, desde: c.iniciada_em, minutos: Math.round(ms / 60_000), esquecida: ms > LIGACAO_ESQUECIDA_MS };
  }).sort((a, b) => a.desde.localeCompare(b.desde));

  const pess = new Map<string, FeitoPessoa>();
  const pega = (p: string) => { let x = pess.get(p); if (!x) { x = { pessoa: p, ligacoes: 0, concluidos: 0, oportunidades: 0, total: 0 }; pess.set(p, x); } return x; };
  for (const c of e.chamadas) if (c.encerrada_em && diaSP(c.encerrada_em) === hoje) pega(nome(c.atendente_nome)).ligacoes++;
  for (const r of e.registros) if (r.status_atendimento === "concluido" && diaSP(r.concluido_em) === hoje) pega(nome(r.atendente_nome)).concluidos++;
  for (const o of e.oportunidades) if (o.status === "atendida" && diaSP(o.atendida_em) === hoje) pega(nome(o.atendida_por ? e.nomes[o.atendida_por] : null)).oportunidades++;
  const feitosHoje = [...pess.values()].map((x) => ({ ...x, total: x.ligacoes + x.concluidos + x.oportunidades })).sort((a, b) => b.total - a.total || a.pessoa.localeCompare(b.pessoa, "pt-BR"));

  const limite30 = hojeSP(agora - 30 * DIA);
  const notasBaixas = e.registros
    .filter((r) => r.tipo === "crm" && ((r.nota != null && r.nota <= 6) || r.status_cliente === "Insatisfeito"))
    .map((r) => ({ r, quando: (r.concluido_em || r.data_contato || r.atualizado_em || "").slice(0, 10) }))
    .filter((x) => x.quando >= limite30)
    .sort((a, b) => b.quando.localeCompare(a.quando))
    .map(({ r, quando }): NotaBaixa => ({ id: r.id, nome: r.nome, nota: r.nota, status: r.status_cliente, quando, feedback: r.feedback, atendente: r.atendente_nome, codigo_omie: r.codigo_omie }));

  const parados: Parado[] = [];
  for (const r of e.registros) {
    if (!ABERTOS.has(r.status_atendimento)) continue;
    if (r.proximo_contato_em && r.proximo_contato_em > hoje) continue; // esperando o combinado: não está parado
    const t = Date.parse(r.atualizado_em || r.criado_em || "");
    if (!Number.isFinite(t)) continue;
    const dias = Math.floor((agora - t) / DIA);
    if (dias > DIAS_PARADO) parados.push({ tipo: "registro", id: `reg:${r.id}`, titulo: r.nome, detalhe: `${r.tipo.toUpperCase()} ${r.id < 0 ? "de exemplo" : `#${r.id}`} sem movimento${r.atendente_nome ? ` · com ${nome(r.atendente_nome)}` : ""}`, dias });
  }
  for (const l of emLigacao) if (l.esquecida) parados.push({ tipo: "ligacao", id: `cha:${l.id}`, titulo: `Ligação aberta de ${l.atendente}`, detalhe: `aberta há ${l.minutos >= 120 ? `${Math.floor(l.minutos / 60)} h` : `${l.minutos} min`} — esqueceram de encerrar?`, dias: Math.floor(l.minutos / 1440) });
  parados.sort((a, b) => (a.tipo === b.tipo ? b.dias - a.dias : a.tipo === "ligacao" ? -1 : 1));

  const desde7 = agora - 7 * DIA;
  const conv = new Map<string, Conversao>();
  const porDesfecho: Record<string, number> = {};
  const total: Conversao = { pessoa: "Equipe", ligacoes: 0, contato: 0, conversoes: 0, taxa: null };
  for (const c of e.chamadas) {
    if (!c.encerrada_em || Date.parse(c.iniciada_em) < desde7) continue;
    const p = nome(c.atendente_nome);
    let x = conv.get(p); if (!x) { x = { pessoa: p, ligacoes: 0, contato: 0, conversoes: 0, taxa: null }; conv.set(p, x); }
    const contato = c.desfecho !== "sem_resposta" && c.desfecho !== "numero_errado";
    const vendeu = c.desfecho === "servico_agendado" || c.desfecho === "vendeu";
    for (const y of [x, total]) { y.ligacoes++; if (contato) y.contato++; if (vendeu) y.conversoes++; }
    if (c.desfecho) porDesfecho[c.desfecho] = (porDesfecho[c.desfecho] || 0) + 1;
  }
  const taxa = (y: Conversao) => ({ ...y, taxa: y.contato ? Math.round((y.conversoes / y.contato) * 100) : null });
  return {
    emLigacao, feitosHoje, notasBaixas, parados,
    semana: { total: taxa(total), porPessoa: [...conv.values()].map(taxa).sort((a, b) => b.conversoes - a.conversoes || b.ligacoes - a.ligacoes), porDesfecho },
  };
}
