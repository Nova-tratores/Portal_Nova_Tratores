// Ligação do cockpit — parte PURA (sem I/O): catálogo de desfechos, efeitos
// esperados (espelho da RPC feedback_encerrar_chamada, usado pela UI para
// pré-visualizar e validar ANTES de chamar o servidor) e tradução dos erros
// que as RPCs levantam (códigos em CAIXA_ALTA) para HTTP + mensagem de balcão.
//
// A verdade continua no SQL (sql/create-feedback-chamada.sql); se mudar lá,
// mudar aqui e nos testes.

import type { StatusAtendimento } from "@/lib/feedbacks/types";

export type Desfecho = "servico_agendado" | "vendeu" | "retornar" | "recusou" | "sem_resposta" | "numero_errado";

export const PRAZO_RETORNO_PADRAO_DIAS = 30;
export const REGRA_24H_MS = 24 * 60 * 60 * 1000;
export const CONFLITO_CHAMADA_ABERTA_MS = 2 * 60 * 60 * 1000;

export interface DesfechoInfo {
  valor: Desfecho;
  rotulo: string;
  emoji: string;
  ajuda: string;
  precisa_motivo: boolean; // recusou
  precisa_retorno: boolean; // retornar (obrigatório) — sem_resposta tem default
  pede_retorno: boolean; // mostra o campo de data de retorno
  pede_servico: boolean; // servico_agendado: data prevista do serviço
  pede_termometros: boolean; // houve conversa → humor + qualidade obrigatórios (Fase 2)
}

export const DESFECHOS: DesfechoInfo[] = [
  { valor: "servico_agendado", rotulo: "Serviço agendado", emoji: "✅", ajuda: "Cliente marcou revisão/serviço.", precisa_motivo: false, precisa_retorno: false, pede_retorno: false, pede_servico: true, pede_termometros: true },
  { valor: "vendeu",           rotulo: "Vendeu",           emoji: "💰", ajuda: "Fechou peça, implemento ou máquina.", precisa_motivo: false, precisa_retorno: false, pede_retorno: false, pede_servico: false, pede_termometros: true },
  { valor: "retornar",         rotulo: "Retornar depois",  emoji: "🔁", ajuda: "Pediu para ligar em outra data.", precisa_motivo: false, precisa_retorno: true, pede_retorno: true, pede_servico: false, pede_termometros: true },
  { valor: "recusou",          rotulo: "Recusou",          emoji: "❌", ajuda: "Não quer agora — diga o motivo.", precisa_motivo: true, precisa_retorno: false, pede_retorno: false, pede_servico: false, pede_termometros: true },
  { valor: "sem_resposta",     rotulo: "Não atendeu",      emoji: "📵", ajuda: "Caixa postal ou não atendeu.", precisa_motivo: false, precisa_retorno: false, pede_retorno: true, pede_servico: false, pede_termometros: false },
  { valor: "numero_errado",    rotulo: "Número errado",    emoji: "☎️", ajuda: "Telefone não é do cliente.", precisa_motivo: false, precisa_retorno: false, pede_retorno: false, pede_servico: false, pede_termometros: false },
];

export const DESFECHO_POR_VALOR: Record<Desfecho, DesfechoInfo> = Object.fromEntries(DESFECHOS.map((d) => [d.valor, d])) as Record<Desfecho, DesfechoInfo>;

export function ehDesfecho(v: unknown): v is Desfecho {
  return typeof v === "string" && v in DESFECHO_POR_VALOR;
}

export interface PayloadEncerrar {
  desfecho: Desfecho;
  motivo_negativa_id?: number | null;
  motivo_negativa_obs?: string | null;
  proximo_contato_em?: string | null; // YYYY-MM-DD
  servico_previsto_em?: string | null; // YYYY-MM-DD
  notas_encerramento?: string | null;
  telefone_usado?: string | null;
  humor_cliente?: number | null; // fase 2
  qualidade_conversa?: number | null; // fase 2
}

/**
 * Erros de preenchimento, em linguagem de balcão (vazio = pode encerrar).
 * Fase 2: humor do cliente e qualidade da conversa (1–5) são obrigatórios —
 * exceto em `numero_errado` e `sem_resposta`, em que não houve conversa.
 */
export function validarEncerramento(p: Partial<PayloadEncerrar>, opts: { termometros?: boolean } = { termometros: true }): string[] {
  const erros: string[] = [];
  if (!ehDesfecho(p.desfecho)) {
    erros.push("Escolha como terminou a ligação.");
    return erros;
  }
  const d = DESFECHO_POR_VALOR[p.desfecho];
  if (opts.termometros !== false && d.pede_termometros) {
    if (!ehNota(p.humor_cliente)) erros.push("Marque como o cliente estava (humor).");
    if (!ehNota(p.qualidade_conversa)) erros.push("Marque como foi a conversa (qualidade).");
  }
  if (d.precisa_motivo && !p.motivo_negativa_id) erros.push("Diga o motivo da recusa.");
  if (d.precisa_retorno && !ehDataISO(p.proximo_contato_em)) erros.push("Informe a data para ligar de novo.");
  if (p.proximo_contato_em && !ehDataISO(p.proximo_contato_em)) erros.push("Data de retorno inválida.");
  if (p.servico_previsto_em && !ehDataISO(p.servico_previsto_em)) erros.push("Data prevista do serviço inválida.");
  return erros;
}

export function ehNota(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
}

export function ehDataISO(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
}

/** Soma dias a uma data local (YYYY-MM-DD). */
export function somarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + dias);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function hojeISO(agora: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

export interface EfeitosDesfecho {
  status_atendimento: StatusAtendimento;
  proximo_contato_em: string | null;
  oportunidade: "atendida" | "continua_aberta";
  marca_pendencia_cadastral: boolean;
  regra_24h_aplicada: boolean;
}

/**
 * Espelho da tabela de efeitos da RPC (§5 do prompt da Fase 1):
 *  servico_agendado / vendeu / recusou → concluido, oportunidade atendida
 *  retornar → aberto + data obrigatória
 *  sem_resposta → sem_resposta (ou aberto se o registro tem < 24 h) + retorno default +30 d
 *  numero_errado → aberto + tag de pendência cadastral
 */
export function efeitosDoDesfecho(
  desfecho: Desfecho,
  opts: { aberto_em?: string | null; proximo_contato_em?: string | null; agora?: Date } = {}
): EfeitosDesfecho {
  const agora = opts.agora ?? new Date();
  const base: EfeitosDesfecho = { status_atendimento: "concluido", proximo_contato_em: null, oportunidade: "atendida", marca_pendencia_cadastral: false, regra_24h_aplicada: false };
  switch (desfecho) {
    case "servico_agendado":
    case "vendeu":
    case "recusou":
      return base;
    case "retornar":
      return { ...base, status_atendimento: "aberto", proximo_contato_em: opts.proximo_contato_em ?? null, oportunidade: "continua_aberta" };
    case "numero_errado":
      return { ...base, status_atendimento: "aberto", oportunidade: "continua_aberta", marca_pendencia_cadastral: true };
    case "sem_resposta": {
      const abertoEm = opts.aberto_em ? new Date(opts.aberto_em).getTime() : NaN;
      const recente = Number.isFinite(abertoEm) && agora.getTime() - abertoEm < REGRA_24H_MS;
      return {
        ...base,
        status_atendimento: recente ? "aberto" : "sem_resposta",
        proximo_contato_em: opts.proximo_contato_em ?? somarDias(hojeISO(agora), PRAZO_RETORNO_PADRAO_DIAS),
        oportunidade: "continua_aberta",
        regra_24h_aplicada: recente,
      };
    }
  }
}

// -----------------------------------------------------------------------------
// Erros das RPCs → HTTP + mensagem
// -----------------------------------------------------------------------------
export interface ErroRpc { http: number; codigo: string; mensagem: string; detalhe?: string }

const MENSAGENS: Record<string, { http: number; mensagem: string }> = {
  EM_ATENDIMENTO_POR:            { http: 409, mensagem: "Este cliente já está em ligação com outra pessoa." },
  CHAMADA_NAO_ENCONTRADA:        { http: 404, mensagem: "Ligação não encontrada." },
  CHAMADA_DE_OUTRO_ATENDENTE:    { http: 403, mensagem: "Esta ligação é de outra pessoa." },
  JA_ENCERRADA:                  { http: 409, mensagem: "Esta ligação já foi encerrada." },
  JA_ENCERRADA_COM_OUTRO_DESFECHO: { http: 409, mensagem: "Esta ligação já foi encerrada com outro resultado." },
  TEM_NOTAS:                     { http: 409, mensagem: "Há anotações nesta ligação — encerre em vez de cancelar." },
  DESFECHO_INVALIDO:             { http: 400, mensagem: "Escolha como terminou a ligação." },
  MOTIVO_OBRIGATORIO:            { http: 400, mensagem: "Diga o motivo da recusa." },
  PROXIMO_CONTATO_OBRIGATORIO:   { http: 400, mensagem: "Informe a data para ligar de novo." },
  MOTIVO_NAO_ENCONTRADO:         { http: 400, mensagem: "Motivo inválido." },
  REGISTRO_NAO_ENCONTRADO:       { http: 404, mensagem: "Atendimento não encontrado." },
  OPORTUNIDADE_NAO_ENCONTRADA:   { http: 404, mensagem: "Motivo da fila não encontrado." },
  CLIENTE_KEY_OBRIGATORIA:       { http: 400, mensagem: "Cliente não informado." },
  ATENDENTE_OBRIGATORIO:         { http: 401, mensagem: "Sessão sem usuário." },
  CLIENTE_SEM_NOME:              { http: 400, mensagem: "Cliente sem nome no cadastro — abra pelo CRM." },
};

/** `RAISE EXCEPTION 'CODIGO:detalhe'` → {http, codigo, mensagem, detalhe}. Desconhecido → 500. */
export function mapearErroRpc(msg: string | null | undefined): ErroRpc {
  const texto = String(msg ?? "").trim();
  const m = texto.match(/^([A-Z_]+)(?::(.*))?$/);
  if (m && MENSAGENS[m[1]]) {
    const { http, mensagem } = MENSAGENS[m[1]];
    const detalhe = m[2]?.trim() || undefined;
    return { http, codigo: m[1], mensagem: m[1] === "EM_ATENDIMENTO_POR" && detalhe ? `Este cliente já está em ligação com ${detalhe}.` : mensagem, detalhe };
  }
  return { http: 500, codigo: "ERRO", mensagem: "Falha ao gravar a ligação.", detalhe: texto || undefined };
}
