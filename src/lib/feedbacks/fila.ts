// FILA DE TRABALHO do CRM e do RFM (José, 23/10/2026: "deixa o funcionamento mais inteligente e
// dinâmico"). Diz QUEM atender primeiro e O QUE FAZER AGORA com cada cliente. Puro (sem banco):
// testado em __tests__/fila.test.ts; as telas só desenham.
//
// CRM (pós-serviço): a ligação boa é entre 3 e 7 dias depois do faturamento. Antes disso espera;
// depois de 15 dias perde força. Valor da OS e cliente insatisfeito sobem na fila.
// RFM (cliente que sumiu): prioridade (Urgente/Normal/Inativo) e há quanto tempo foi o último serviço.
// Para os dois: quem não atendeu volta no dia seguinte; depois de 3 tentativas, vai pelo WhatsApp.
import type { FeedbackRegistro } from "./types";

export type Acao = "ligar" | "whatsapp" | "retentar" | "aguardar" | "concluido";

export interface ItemFila {
  registro: FeedbackRegistro;
  /** maior = atender antes */
  pontos: number;
  acao: Acao;
  /** frase curta do que fazer ("Ligar hoje", "Tentar de novo amanhã"…) */
  oQueFazer: string;
  /** por que está nessa posição (para o "?" e o título) */
  porque: string;
  /** dias desde o serviço/faturamento (CRM) ou desde o último serviço (RFM) */
  dias: number | null;
  /** ISO YYYY-MM-DD a partir de quando faz sentido agir (aguardar) */
  aPartirDe: string | null;
}

const DIA = 86_400_000;
const diaISO = (t: number) => new Date(t).toISOString().slice(0, 10);
function diasEntre(deIso: string | null | undefined, agora: number): number | null {
  if (!deIso) return null;
  const t = Date.parse(deIso.length === 10 ? `${deIso}T12:00:00` : deIso);
  return Number.isFinite(t) ? Math.floor((agora - t) / DIA) : null;
}

export const CRM_DIA_INICIO = 3
export const CRM_DIA_FIM_IDEAL = 7
export const CRM_DIA_LIMITE = 15
export const MAX_TENTATIVAS_LIGACAO = 3

/** Registro do CRM ligado a uma OS faturada (sql/feedbacks-crm-automatico.sql). */
type ComOS = FeedbackRegistro & { faturado_em?: string | null; os_valor?: number | null }

export function avaliar(r: ComOS, agora: number = Date.now()): ItemFila {
  const fechado = r.status_atendimento === "concluido" || r.status_atendimento === "arquivado";
  const tent = Array.isArray(r.tentativas) ? r.tentativas : [];
  const ultimaTent = tent.length ? Math.max(...tent.map((t) => Date.parse(t.data)).filter(Number.isFinite)) : null;
  const tentouHoje = ultimaTent != null && agora - ultimaTent < 20 * 3600_000;
  const isCrm = r.tipo === "crm";
  const ref = isCrm ? (r.faturado_em || r.data_servico) : r.ultimo_servico;
  const dias = diasEntre(ref, agora);

  if (fechado) {
    return { registro: r, pontos: -1, acao: "concluido", oQueFazer: r.status_atendimento === "arquivado" ? "Arquivado" : "Concluído", porque: "", dias, aPartirDe: null };
  }

  let pontos = 0;
  const motivos: string[] = [];

  // combinado para outro dia
  const prox = r.proximo_contato_em;
  if (prox && prox > diaISO(agora)) {
    return { registro: r, pontos: 5, acao: "aguardar", oQueFazer: `Retornar em ${prox.split("-").reverse().join("/")}`, porque: "o cliente pediu para falar outro dia", dias, aPartirDe: prox };
  }

  if (isCrm) {
    if (dias != null && dias < CRM_DIA_INICIO) {
      const em = diaISO(Date.parse(ref!.length === 10 ? `${ref}T12:00:00` : ref!) + CRM_DIA_INICIO * DIA);
      return { registro: r, pontos: 10, acao: "aguardar", oQueFazer: `Ligar a partir de ${em.split("-").reverse().join("/")}`, porque: `o serviço foi há ${dias} dia(s): o cliente ainda está usando a máquina`, dias, aPartirDe: em };
    }
    if (dias == null) { pontos += 40; motivos.push("sem data do serviço") }
    else if (dias <= CRM_DIA_FIM_IDEAL) { pontos += 100; motivos.push(`serviço há ${dias} dias — melhor momento para ligar`) }
    else if (dias <= CRM_DIA_LIMITE) { pontos += 100 - (dias - CRM_DIA_FIM_IDEAL) * 6; motivos.push(`serviço há ${dias} dias — está passando do ponto`) }
    else { pontos += 20; motivos.push(`serviço há ${dias} dias — atrasado`) }
    const valor = Number(r.os_valor) || 0;
    if (valor > 0) { const extra = Math.min(40, Math.round(Math.log10(valor) * 10)); pontos += extra; if (valor >= 2000) motivos.push("serviço de valor alto") }
    if (r.status_cliente === "Insatisfeito") { pontos += 80; motivos.push("cliente insatisfeito") }
  } else {
    const prio = r.prioridade === "Urgente" ? 90 : r.prioridade === "Normal" ? 50 : r.prioridade === "Inativo" ? 15 : 40;
    pontos += prio; motivos.push(`prioridade ${String(r.prioridade || "sem prioridade").toLowerCase()}`);
    if (dias != null) { pontos += Math.min(40, Math.round(dias / 30) * 4); motivos.push(`último serviço há ${Math.round(dias / 30)} mês(es)`) }
  }

  if (!r.telefone && !r.email) { pontos -= 30; motivos.push("sem telefone nem e-mail") }

  // tentativas sem resposta
  if (tentouHoje) {
    return { registro: r, pontos: pontos - 60, acao: "retentar", oQueFazer: "Tentar de novo amanhã", porque: `já tentou hoje (${tent.length} tentativa(s))`, dias, aPartirDe: diaISO(agora + DIA) };
  }
  if (tent.length >= MAX_TENTATIVAS_LIGACAO || r.status_atendimento === "sem_resposta") {
    return { registro: r, pontos: pontos - 20, acao: "whatsapp", oQueFazer: "Mandar mensagem no WhatsApp", porque: `${tent.length} tentativa(s) de ligação sem resposta`, dias, aPartirDe: null };
  }
  if (tent.length > 0) motivos.push(`${tent.length} tentativa(s) antes`);
  return { registro: r, pontos, acao: "ligar", oQueFazer: tent.length ? "Ligar de novo" : "Ligar hoje", porque: motivos.join(" · "), dias, aPartirDe: null };
}

/** Ordem da fila: primeiro o que dá para fazer agora (ligar/WhatsApp), pelos pontos; depois o que espera. */
export function montarFila(rows: FeedbackRegistro[], agora: number = Date.now()): ItemFila[] {
  const peso: Record<Acao, number> = { ligar: 0, whatsapp: 0, retentar: 1, aguardar: 2, concluido: 3 };
  return rows.map((r) => avaliar(r as ComOS, agora)).sort((a, b) => peso[a.acao] - peso[b.acao] || b.pontos - a.pontos);
}

/** Texto pronto para a pesquisa no WhatsApp (o vendedor/atendente revisa antes de mandar). */
export function mensagemPesquisa(r: FeedbackRegistro): string {
  const nome = (r.nome || "").split(/[\s(]/)[0];
  const primeiro = nome ? nome.charAt(0).toUpperCase() + nome.slice(1).toLowerCase() : "";
  const maquina = r.trator ? ` no seu ${r.trator.split("·")[0].trim()}` : "";
  const tec = r.tecnico ? ` com o técnico ${r.tecnico.split(/\s*(\/\/|,)\s*/)[0]}` : "";
  if (r.tipo === "rfm") return `Olá${primeiro ? `, ${primeiro}` : ""}! Aqui é da Nova Tratores. Faz um tempo que não vemos sua máquina por aqui — está tudo certo com ela? Se precisar de revisão ou de alguma peça, é só responder esta mensagem.`;
  return `Olá${primeiro ? `, ${primeiro}` : ""}! Aqui é da Nova Tratores. Queremos saber como foi o serviço${maquina}${tec}. De 0 a 10, que nota você dá? E tem algo que podemos melhorar?`;
}

/** Link do WhatsApp com a mensagem (telefone do Brasil; sem telefone, null). */
export function linkWhatsApp(telefone: string | null | undefined, texto: string): string | null {
  let d = String(telefone || "").replace(/\D/g, "");
  if (d.length < 10) return null;
  if (!d.startsWith("55")) d = `55${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}

/** Nota baixa ou cliente insatisfeito: precisa avisar o gerente do pós-vendas. */
export function precisaAlerta(r: Pick<FeedbackRegistro, "nota" | "status_cliente">): boolean {
  return (r.nota != null && r.nota <= 6) || r.status_cliente === "Insatisfeito";
}
