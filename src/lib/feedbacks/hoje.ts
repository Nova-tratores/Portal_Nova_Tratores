// TELA "HOJE" do módulo Feedbacks (José, 23/10/2026 — "Caminho B"): uma fila só, POR CLIENTE, que
// junta tudo o que pede contato com ele — atendimento CRM/RFM aberto (feedback_registros),
// oportunidade do robô (feedback_oportunidades, R1–R8), revisão Mahindra prevista
// (previsao-revisao) e retorno combinado (proximo_contato_em). Cada cliente aparece UMA vez, com os
// motivos como selos, e uma pontuação única que diz quem atender primeiro e por quê.
// PURO (sem banco): testado em __tests__/hoje.test.ts; a tela só desenha.
//
// Régua (pontos de cada motivo — maior = atender antes):
//   Pós-serviço (CRM)  → a régua do CRM (fila.ts/avaliar): 3–7 dias = 100, valor da OS até +40,
//                        insatisfeito +80, passou de 15 dias = 20. Peso cheio.
//   Reativação (RFM)   → a régua do RFM (prioridade + tempo sem vir) + 30 porque alguém já abriu o atendimento.
//   Revisão Mahindra   → atrasada 80–140 (cai com o atraso; urgente só até 45 dias) · vence em 30 dias 90–120 ·
//                        parou de fazer na loja 20–45.
//   Retorno combinado  → a data chegou: +70 em cima do motivo (vencido há 2+ dias = urgente).
//   Robô: R1 revisão de garantia 110 · R7 garantia em risco 100 (130 se vence em 30 dias) ·
//         R4 retorno de pós-venda 80 · R2 sem serviço 40–60 · R3 pode comprar mais 30 ·
//         R5 peças 15–25 · R6 fora de garantia 15 (implemento 10) · R8 cadastro 12 (6 se antigo).
//   Vários motivos no mesmo cliente: o mais forte vale inteiro e cada um dos outros soma METADE,
//   até +80. Sem telefone: −30. Peças (R5), fora de garantia (R6) e cadastro (R8) nunca são urgentes.
//   Tentou hoje → volta amanhã. Retorno combinado para outro dia → o cliente espera até lá.
import { avaliar, type Acao } from "./fila";
import { normNome, type ItemRevisao } from "./previsao-revisao";
import { clienteKey, TAG_NAO_CONTATAR, type FeedbackRegistro, type Oportunidade, type RegraOportunidade, type Tentativa } from "./types";

// ─── constantes da régua (a aba "Robô" mostra estes valores) ─────────────────
export const COTA_PADRAO = 25;
export const TETO_BONUS = 80;
export const FRACAO_EXTRA = 0.5;
/** RFM: atendimento já aberto por alguém (soma em cima da régua do RFM). */
export const BONUS_RFM_ABERTO = 30;
/** Revisão atrasada há mais que isto deixa de ser urgente (está virando "parou de fazer na loja"). */
export const DIAS_URGENTE_REVISAO = 45;
export const BONUS_RETORNO = 70;
export const PENALIDADE_SEM_TELEFONE = 30;
export const PESO_REGRA: Record<RegraOportunidade, number> = {
  R1_revisao: 110, R7_garantia_risco: 100, R4_followup: 80, R2_sem_os: 40, R3_upsell: 30, R5_pecas: 15, R6_fora_garantia: 15, R8_cadastro: 12,
};
/** Regras que nunca viram "urgente" (são muitas e de valor baixo por cliente). */
export const REGRAS_SEM_URGENTE: RegraOportunidade[] = ["R5_pecas", "R6_fora_garantia", "R8_cadastro", "R3_upsell"];

// ─── grupos (os chips de filtro da tela) ─────────────────────────────────────
export type Grupo = "pos_servico" | "reativacao" | "revisoes" | "pecas" | "cadastro" | "retornos";
export const GRUPOS: { k: Grupo; rot: string; ico: string; cor: string; ajuda: string }[] = [
  { k: "pos_servico", rot: "Pós-serviço", ico: "fa-screwdriver-wrench", cor: "#dc2626", ajuda: "OS faturada há poucos dias: perguntar como ficou (nota, indicaria, o que melhorar)." },
  { k: "reativacao", rot: "Reativação", ico: "fa-user-clock", cor: "#6366f1", ajuda: "Cliente que sumiu (RFM), sem serviço há tempo, que pode comprar mais ou com máquina fora da garantia." },
  { k: "revisoes", rot: "Revisões", ico: "fa-tractor", cor: "#0f766e", ajuda: "Revisão Mahindra atrasada ou vencendo pelo horímetro estimado, e cheque de garantia." },
  { k: "pecas", rot: "Peças", ico: "fa-gears", cor: "#8b5cf6", ajuda: "Cliente que comprava peça e parou de comprar." },
  { k: "cadastro", rot: "Cadastro", ico: "fa-address-card", cor: "#64748b", ajuda: "Falta telefone ou e-mail no cadastro." },
  { k: "retornos", rot: "Retornos combinados", ico: "fa-calendar-check", cor: "#d97706", ajuda: "O cliente pediu para falar numa data." },
];
export const GRUPO_DA_REGRA: Record<RegraOportunidade, Grupo> = {
  R1_revisao: "revisoes", R7_garantia_risco: "revisoes", R4_followup: "pos_servico", R2_sem_os: "reativacao",
  R3_upsell: "reativacao", R6_fora_garantia: "reativacao", R5_pecas: "pecas", R8_cadastro: "cadastro",
};

// ─── tipos ───────────────────────────────────────────────────────────────────
export type Fonte = "registro" | "oportunidade" | "revisao";

export interface Motivo {
  /** "reg:123" | "op:456" | "rev:789" */
  id: string;
  fonte: Fonte;
  grupo: Grupo;
  regra: RegraOportunidade | null;
  /** selo curto: "Pós-serviço da OS 5395", "Revisão 900 h vence dia 30/10"… */
  selo: string;
  /** frase do porquê deste motivo */
  porque: string;
  /** pontos deste motivo HOJE (0 quando está esperando) */
  pontos: number;
  urgente: boolean;
  /** situação do motivo sozinho */
  acao: Acao;
  aPartirDe: string | null;
  /** retorno combinado (YYYY-MM-DD) */
  retorno: string | null;
  tentativas: Tentativa[];
  tecnico: string | null;
  registro?: FeedbackRegistro;
  oportunidade?: Oportunidade;
  revisao?: ItemRevisao;
}

export interface PontoExplicado { rot: string; pts: number }

export interface ClienteHoje {
  key: string;
  nome: string;
  codigo_omie: string | null;
  telefone: string | null;
  email: string | null;
  cidade: string | null;
  tags: string[];
  /** motivos em aberto, do mais forte para o mais fraco */
  motivos: Motivo[];
  pontos: number;
  explicacao: PontoExplicado[];
  acao: Acao;
  oQueFazer: string;
  aPartirDe: string | null;
  urgente: boolean;
  grupos: Grupo[];
  regras: RegraOportunidade[];
  tecnicos: string[];
  tentativas: Tentativa[];
  emLigacaoCom: string | null;
}

export interface EntradaHoje {
  registros: FeedbackRegistro[];
  oportunidades: Oportunidade[];
  revisoes: ItemRevisao[];
  /** cadastro Omie por código (telefone, e-mail, cidade) */
  cadastro?: Record<string, { telefone: string | null; email: string | null; cidade: string | null }>;
  /** tags por cliente_key (feedback_clientes_info) */
  tags?: Record<string, string[]>;
  /** ligação aberta agora, por cliente_key */
  emLigacao?: Record<string, string>;
  /** tentativas feitas nesta tela (simulação) por cliente_key */
  tentativasLocais?: Record<string, Tentativa[]>;
}

// ─── datas ───────────────────────────────────────────────────────────────────
const DIA = 86_400_000;
export const hojeSP = (agora: number = Date.now()) => new Date(agora).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const tsDia = (iso: string) => Date.parse(`${iso.slice(0, 10)}T12:00:00-03:00`);
export const diasAte = (iso: string, agora: number = Date.now()) => Math.round((tsDia(iso) - tsDia(hojeSP(agora))) / DIA);
export const fmtDia = (iso: string | null | undefined) => { if (!iso) return "—"; const d = iso.slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}/${d[1]}` : iso; };
const numOS = (ref: string | null | undefined) => (ref ? String(ref).split(":").pop() : null);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const tentouHoje = (t: Tentativa[], agora: number) => t.some((x) => { const d = Date.parse(x.data); return Number.isFinite(d) && agora - d < 20 * 3600_000; });

// ─── um motivo por fonte ─────────────────────────────────────────────────────

const ABERTOS = new Set(["aberto", "em_andamento", "sem_resposta"]);

/** Atendimento CRM/RFM aberto → motivo. Usa a régua de fila.ts (sem a penalidade de telefone, que vai no cliente). */
export function motivoDoRegistro(r: FeedbackRegistro, agora: number = Date.now()): Motivo | null {
  if (!ABERTOS.has(r.status_atendimento)) return null;
  const hoje = hojeSP(agora);
  const it = avaliar({ ...r, telefone: r.telefone || "-" }, agora);
  const crm = r.tipo === "crm";
  const retorno = r.proximo_contato_em || null;
  const tent = Array.isArray(r.tentativas) ? r.tentativas : [];
  const os = numOS(r.os_ref);
  let selo = crm ? (os ? `Pós-serviço da OS ${os}` : `Pós-serviço${r.servico ? `: ${r.servico}` : ""}`) : `Reativação${it.dias != null && it.dias >= 60 ? `: ${Math.round(it.dias / 30)} meses sem vir` : ""}`;
  const ativo = it.acao === "ligar" || it.acao === "whatsapp";
  let pontos = ativo ? Math.max(1, Math.round(crm ? it.pontos : it.pontos + BONUS_RFM_ABERTO)) : 0;
  let porque = crm || !ativo ? it.porque : `${it.porque} · atendimento já aberto`;
  let urgente = crm && (r.status_cliente === "Insatisfeito" || (r.nota != null && r.nota <= 6));
  if (retorno && retorno <= hoje && ativo) {
    const atraso = -diasAte(retorno, agora);
    pontos += BONUS_RETORNO;
    porque = `retorno combinado para ${fmtDia(retorno)}${atraso > 0 ? ` (passou há ${atraso} dia${atraso > 1 ? "s" : ""})` : " (é hoje)"}${porque ? ` · ${porque}` : ""}`;
    selo = `Retorno combinado ${fmtDia(retorno)} · ${selo}`;
    if (atraso >= 2) urgente = true;
  } else if (retorno && retorno > hoje) {
    selo = `Retorno combinado ${fmtDia(retorno)} · ${selo}`;
  }
  return {
    id: `reg:${r.id}`, fonte: "registro", grupo: crm ? "pos_servico" : "reativacao", regra: null, selo, porque, pontos, urgente,
    acao: it.acao, aPartirDe: it.aPartirDe, retorno, tentativas: tent, tecnico: r.tecnico || null, registro: r,
  };
}

/** Oportunidade aberta do robô → motivo (peso fixo por regra, com ajustes pelos detalhes). */
export function motivoDaOportunidade(op: Oportunidade, agora: number = Date.now()): Motivo | null {
  if (op.status !== "aberta") return null;
  const d = (op.detalhes || {}) as Record<string, unknown>;
  let pontos = PESO_REGRA[op.regra];
  let urgente = false;
  let selo: string;
  let porque: string;
  switch (op.regra) {
    case "R1_revisao": {
      const alvo = String(d.revisao_alvo || "").trim();
      selo = `Revisão de garantia${alvo ? ` ${alvo}` : ""}`;
      porque = "revisão da garantia vencendo: agendar";
      if (op.prioridade === "Urgente") { pontos += 20; urgente = true; }
      break;
    }
    case "R7_garantia_risco": {
      const lim = typeof d.data_limite === "string" ? d.data_limite.slice(0, 10) : null;
      const dias = lim ? diasAte(lim, agora) : null;
      const cheque = String(d.cheque_rotulo || d.cheque_alvo || "").trim();
      // José, 28/10/2026: só "Garantia: cheque…" confundia — o título diz o que o cliente tem que fazer
      selo = `Fazer a revisão ${cheque ? `de ${cheque.replace(/^revis[ãa]o\s*(de\s*)?/i, "")} ` : ""}${lim ? `até ${fmtDia(lim)} ` : ""}para não perder a garantia`;
      porque = lim
        ? `${dias != null && dias >= 0 ? (dias === 0 ? "o prazo acaba hoje" : `faltam ${dias} dia(s)`) : "o prazo já passou"}: sem essa revisão (cheque) a Mahindra corta a garantia do trator`
        : "sem essa revisão (cheque) a Mahindra corta a garantia do trator";
      if (dias != null && dias <= 30) { pontos = 130; urgente = true; }
      break;
    }
    case "R4_followup":
      selo = "Retorno de pós-venda"; porque = "confirmar se o serviço anterior ficou bom"; break;
    case "R2_sem_os": {
      const dias = num(d.dias_sem_atividade);
      pontos += dias ? Math.min(20, Math.round(dias / 30)) : 0;
      selo = dias ? `Sem serviço há ${dias >= 60 ? `${Math.round(dias / 30)} meses` : `${dias} dias`}` : "Sem serviço há tempo";
      porque = "máquina sem serviço na loja: perguntar como está e oferecer revisão";
      break;
    }
    case "R3_upsell": {
      const m = num(d.meses_sem_pedido);
      selo = m ? `Pode comprar mais: ${m} meses sem pedido` : "Pode comprar mais";
      porque = "cliente esfriou: sondar implemento ou máquina nova";
      break;
    }
    case "R5_pecas": {
      const m = num(d.meses_sem_pedido);
      pontos += m ? Math.min(10, Math.round(m / 2)) : 0;
      selo = m ? `Peças: ${m} meses sem comprar` : "Peças: parou de comprar";
      porque = "oferecer peças de reposição ou kit de manutenção (peso baixo)";
      break;
    }
    case "R6_fora_garantia": {
      const impl = String(d.tipo || "").toLowerCase().startsWith("impl");
      if (impl) pontos = 10;
      selo = impl ? "Implemento fora da garantia" : "Trator fora da garantia";
      porque = "oferecer revisão paga ou plano de manutenção (peso baixo)";
      break;
    }
    case "R8_cadastro": {
      const f = Array.isArray(d.faltando) ? (d.faltando as string[]).map((x) => (x.startsWith("email") ? "e-mail" : x)).filter((x, i, a) => a.indexOf(x) === i) : [];
      if (op.prioridade === "Baixa") pontos = 6;
      selo = f.length ? `Cadastro: falta ${f.join(" e ")}` : "Cadastro incompleto";
      porque = "confirmar os dados na ligação e corrigir o cadastro (peso baixo)";
      break;
    }
  }
  if (REGRAS_SEM_URGENTE.includes(op.regra)) urgente = false;
  return {
    id: `op:${op.id}`, fonte: "oportunidade", grupo: GRUPO_DA_REGRA[op.regra], regra: op.regra, selo, porque, pontos, urgente,
    acao: "ligar", aPartirDe: null, retorno: null, tentativas: [], tecnico: null, oportunidade: op,
  };
}

/** Revisão prevista (lib/feedbacks/previsao-revisao) → motivo. Próximas (mais de 30 dias) e sem entrega ficam de fora. */
export function motivoDaRevisao(it: ItemRevisao, agora: number = Date.now()): Motivo | null {
  const p = it.trator.previsao, c = it.contato;
  if (c.status !== "aberto") return null;
  if (p.situacao === "sem_entrega") return null;
  if (p.situacao === "proxima" && !c.proximo_contato_em && !c.tentativas.length) return null;
  const hoje = hojeSP(agora);
  const rev = `${p.revisaoOferta.toLocaleString("pt-BR")} h`;
  const dias = p.dias ?? 0;
  let selo: string, pontos = 0, urgente = false;
  if (p.situacao === "atrasada") { selo = `Revisão ${rev} atrasada há ${-dias} dia${-dias === 1 ? "" : "s"}`; pontos = 140 - Math.min(60, Math.round(-dias / 2)); urgente = -dias <= DIAS_URGENTE_REVISAO; }
  else if (p.situacao === "vence_30") { selo = `Revisão ${rev} vence dia ${fmtDia(p.dataPrevista)}`; pontos = 120 - Math.min(30, dias); }
  else if (p.situacao === "parou") {
    const diasUlt = p.ultimaLeitura ? Math.max(0, -diasAte(p.ultimaLeitura.data, agora)) : 3650;
    selo = `Revisão ${rev} · parou de fazer na loja`; pontos = 45 - Math.min(25, Math.round(diasUlt / 30));
  } else selo = `Revisão ${rev} em ${fmtDia(p.dataPrevista)}`;
  if (p.confianca === "alta" && pontos > 0) pontos += 10;
  const ativo = it.acao === "ligar" || it.acao === "whatsapp";
  let porque = it.porque || p.explicacao;
  const retorno = c.proximo_contato_em || null;
  if (retorno && retorno <= hoje && ativo) {
    const atraso = -diasAte(retorno, agora);
    pontos += BONUS_RETORNO;
    porque = `retorno combinado para ${fmtDia(retorno)} · ${porque}`;
    selo = `Retorno combinado ${fmtDia(retorno)} · ${selo}`;
    if (atraso >= 2) urgente = true;
  } else if (retorno && retorno > hoje) selo = `Retorno combinado ${fmtDia(retorno)} · ${selo}`;
  return {
    id: `rev:${it.trator.id}`, fonte: "revisao", grupo: "revisoes", regra: null, selo, porque, pontos: ativo ? Math.max(1, pontos) : 0, urgente: ativo && urgente,
    acao: it.acao, aPartirDe: it.aPartirDe, retorno, tentativas: c.tentativas, tecnico: null, revisao: it,
  };
}

// ─── juntar por cliente ──────────────────────────────────────────────────────

interface Bruto { codigo: string | null; nome: string; telefone: string | null; email: string | null; motivo: Motivo }

function brutos(e: EntradaHoje, agora: number): Bruto[] {
  const out: Bruto[] = [];
  for (const r of e.registros) { const m = motivoDoRegistro(r, agora); if (m) out.push({ codigo: r.codigo_omie, nome: r.nome, telefone: r.telefone, email: r.email, motivo: m }); }
  for (const op of e.oportunidades) { const m = motivoDaOportunidade(op, agora); if (m) out.push({ codigo: op.codigo_omie, nome: op.cliente_nome, telefone: null, email: null, motivo: m }); }
  for (const it of e.revisoes) { const m = motivoDaRevisao(it, agora); if (m) out.push({ codigo: it.trator.codigo_omie, nome: it.trator.cliente, telefone: it.trator.telefone, email: null, motivo: m }); }
  return out;
}

const PESO_ACAO: Record<Acao, number> = { ligar: 0, whatsapp: 0, retentar: 1, aguardar: 2, concluido: 3 };

/** Pontos do cliente: o motivo mais forte inteiro + metade de cada um dos outros (até +80) − sem telefone. */
export function pontuar(motivos: Motivo[], semTelefone: boolean): { pontos: number; explicacao: PontoExplicado[] } {
  const ativos = motivos.filter((m) => m.pontos > 0).sort((a, b) => b.pontos - a.pontos);
  const explicacao: PontoExplicado[] = [];
  if (!ativos.length) return { pontos: 0, explicacao };
  explicacao.push({ rot: `${ativos[0].selo}: ${ativos[0].porque}`, pts: ativos[0].pontos });
  const extra = ativos.slice(1).reduce((s, m) => s + m.pontos * FRACAO_EXTRA, 0);
  const bonus = Math.round(Math.min(TETO_BONUS, extra));
  if (ativos.length > 1) explicacao.push({ rot: `mais ${ativos.length - 1} motivo(s) no mesmo cliente (metade de cada${extra > TETO_BONUS ? `, teto de ${TETO_BONUS}` : ""})`, pts: bonus });
  let pontos = ativos[0].pontos + bonus;
  if (semTelefone) { pontos -= PENALIDADE_SEM_TELEFONE; explicacao.push({ rot: "sem telefone no cadastro", pts: -PENALIDADE_SEM_TELEFONE }); }
  // quem tem motivo aberto nunca fica com zero ou negativo: vai para o fim, mas continua na fila
  return { pontos: Math.max(1, pontos), explicacao };
}

/** Une as fontes num cliente só (código Omie; sem código, o nome normalizado casa com quem tem). */
/** "FERNANDO LEONEL // X" → "Fernando Leonel"; sem letra de nome (anotação, "###") → null. */
export function nomeTecnico(bruto: string | null | undefined): string | null {
  const t = (bruto || "").split(/\s*(?:\/\/|,)\s*/)[0].trim();
  if (!t || /[#*!?]/.test(t) || !/^[\p{L} .'-]+$/u.test(t)) return null;
  const minus = new Set(["da", "de", "do", "das", "dos", "e"]);
  return t.toLowerCase().split(/\s+/).map((p, i) => (i > 0 && minus.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
}

export function montarClientes(e: EntradaHoje, agora: number = Date.now()): ClienteHoje[] {
  const hoje = hojeSP(agora);
  const lista = brutos(e, agora);
  const porNome = new Map<string, string>();
  const mapa = new Map<string, ClienteHoje>();
  // 1º quem tem código (a chave boa), depois quem só tem nome
  lista.sort((a, b) => (a.codigo ? 0 : 1) - (b.codigo ? 0 : 1));
  for (const b of lista) {
    const nn = normNome(b.nome);
    const key = b.codigo ? clienteKey(b.codigo, b.nome) : (porNome.get(nn) ?? clienteKey(null, b.nome));
    if (nn && !porNome.has(nn)) porNome.set(nn, key);
    let c = mapa.get(key);
    if (!c) {
      const cad = b.codigo ? e.cadastro?.[b.codigo] : undefined;
      c = {
        key, nome: b.nome.trim(), codigo_omie: b.codigo, telefone: cad?.telefone || null, email: cad?.email || null, cidade: cad?.cidade || null,
        tags: e.tags?.[key] || [], motivos: [], pontos: 0, explicacao: [], acao: "ligar", oQueFazer: "", aPartirDe: null, urgente: false,
        grupos: [], regras: [], tecnicos: [], tentativas: [], emLigacaoCom: e.emLigacao?.[key] ?? null,
      };
      mapa.set(key, c);
    }
    if (!c.telefone && b.telefone) c.telefone = b.telefone;
    if (!c.email && b.email) c.email = b.email;
    if (!c.codigo_omie && b.codigo) c.codigo_omie = b.codigo;
    c.motivos.push(b.motivo);
  }

  const out: ClienteHoje[] = [];
  for (const c of mapa.values()) {
    if (c.tags.includes(TAG_NAO_CONTATAR)) continue;
    c.motivos.sort((a, b) => b.pontos - a.pontos || PESO_ACAO[a.acao] - PESO_ACAO[b.acao]);
    const grupos = new Set<Grupo>(c.motivos.map((m) => m.grupo));
    if (c.motivos.some((m) => m.retorno)) grupos.add("retornos");
    c.grupos = [...grupos];
    c.regras = [...new Set(c.motivos.map((m) => m.regra).filter((r): r is RegraOportunidade => !!r))];
    // técnico que fez o último serviço (filtro "Todos os técnicos"): "FERNANDO LEONEL" e "Fernando Leonel"
    // viram um só e anotação da OS ("# # # FINALIZEI SEM ATENÇÃO # # #") não é técnico
    c.tecnicos = [...new Set(c.motivos.map((m) => nomeTecnico(m.tecnico)).filter((t): t is string => !!t))];
    c.tentativas = [...c.motivos.flatMap((m) => m.tentativas), ...(e.tentativasLocais?.[c.key] || [])].sort((a, b) => b.data.localeCompare(a.data));
    const { pontos, explicacao } = pontuar(c.motivos, !c.telefone);
    c.pontos = pontos; c.explicacao = explicacao;
    c.urgente = c.motivos.some((m) => m.urgente && m.pontos > 0);

    const futuros = c.motivos.map((m) => m.retorno).filter((r): r is string => !!r && r > hoje).sort();
    const ativos = c.motivos.filter((m) => m.pontos > 0);
    const principal = ativos[0];
    if (futuros.length) {
      c.acao = "aguardar"; c.aPartirDe = futuros[0]; c.oQueFazer = `Retornar em ${fmtDia(futuros[0])} (o cliente pediu)`; c.urgente = false;
    } else if (tentouHoje(c.tentativas, agora)) {
      c.acao = "retentar"; c.aPartirDe = hojeSP(agora + DIA); c.oQueFazer = "Tentar de novo amanhã"; c.urgente = false;
    } else if (principal) {
      c.acao = c.motivos.some((m) => m.acao === "whatsapp" && m.pontos > 0) ? "whatsapp" : "ligar";
      c.oQueFazer = c.acao === "whatsapp" ? "Mandar mensagem no WhatsApp (3 ligações sem resposta)" : `Ligar · ${principal.selo}`;
      if (c.acao === "whatsapp") { c.pontos = Math.max(1, c.pontos - 20); c.explicacao.push({ rot: "3 ligações sem resposta: vai pelo WhatsApp", pts: -20 }); }
    } else {
      const quando = c.motivos.map((m) => m.aPartirDe).filter((x): x is string => !!x).sort()[0] ?? null;
      c.acao = c.motivos.some((m) => m.acao === "retentar") ? "retentar" : "aguardar";
      c.aPartirDe = quando; c.oQueFazer = quando ? `Ligar a partir de ${fmtDia(quando)}` : "Esperar"; c.urgente = false;
    }
    out.push(c);
  }
  return out.sort((a, b) => PESO_ACAO[a.acao] - PESO_ACAO[b.acao] || b.pontos - a.pontos || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Clientes "Não contatar" que ficaram fora (para o aviso da tela). */
export function contarNaoContatar(e: EntradaHoje): number {
  const ks = new Set<string>();
  for (const [k, t] of Object.entries(e.tags || {})) if (t.includes(TAG_NAO_CONTATAR)) ks.add(k);
  return ks.size;
}

export const ehAgora = (c: Pick<ClienteHoje, "acao">) => c.acao === "ligar" || c.acao === "whatsapp";

/** Separa a cota do dia: os N melhores que dá para atender agora; o resto vai para "Depois"; quem espera, "Esperando". */
export function cotaDoDia(clientes: ClienteHoje[], cota: number = COTA_PADRAO): { hoje: ClienteHoje[]; depois: ClienteHoje[]; esperando: ClienteHoje[] } {
  const agora = clientes.filter(ehAgora).sort((a, b) => b.pontos - a.pontos);
  const n = Math.max(1, Math.round(cota));
  return { hoje: agora.slice(0, n), depois: agora.slice(n), esperando: clientes.filter((c) => !ehAgora(c)) };
}

// ─── desfecho: o que fecha de cada vez ───────────────────────────────────────

/** Desfechos do cockpit (sql/create-feedback-chamada.sql) + "só a pesquisa" (pós-serviço sem nada a oferecer). */
export type DesfechoHoje = "servico_agendado" | "vendeu" | "retornar" | "recusou" | "sem_resposta" | "numero_errado" | "whatsapp" | "so_pesquisa";
export const DESFECHOS_FALOU: { k: DesfechoHoje; rot: string; ico: string; cor: string; ajuda: string }[] = [
  { k: "servico_agendado", rot: "Serviço agendado", ico: "fa-calendar-check", cor: "#16a34a", ajuda: "Marcou revisão ou serviço." },
  { k: "vendeu", rot: "Vendeu", ico: "fa-sack-dollar", cor: "#0f766e", ajuda: "Fechou peça, implemento ou máquina." },
  { k: "retornar", rot: "Retornar depois", ico: "fa-calendar-days", cor: "#d97706", ajuda: "Pediu para falar em outra data." },
  { k: "recusou", rot: "Recusou", ico: "fa-circle-xmark", cor: "#dc2626", ajuda: "Não quer agora (diga o motivo)." },
  { k: "so_pesquisa", rot: "Só a pesquisa", ico: "fa-comment", cor: "#475569", ajuda: "Respondeu o pós-serviço; nada mais a tratar agora." },
];

export type Efeito = "fecha" | "retorno" | "tentativa" | "mantem";
export interface ItemPlano { motivo: Motivo; efeito: Efeito; /** marcado por padrão na lista "vai fechar" */ padrao: boolean; frase: string }

const ehPos = (m: Motivo) => (m.fonte === "registro" && m.registro?.tipo === "crm") || m.regra === "R4_followup";

/** Quais regras cada desfecho fecha "porque faz sentido" (as outras aparecem desmarcadas, dá para marcar). */
const FECHA_POR_DESFECHO: Record<"servico_agendado" | "vendeu" | "recusou", (m: Motivo) => boolean> = {
  servico_agendado: (m) => m.fonte === "revisao" || (m.fonte === "registro" && m.registro?.tipo === "rfm") || ["R1_revisao", "R7_garantia_risco", "R2_sem_os", "R6_fora_garantia", "R4_followup"].includes(m.regra || ""),
  vendeu: (m) => (m.fonte === "registro" && m.registro?.tipo === "rfm") || ["R5_pecas", "R3_upsell", "R4_followup"].includes(m.regra || ""),
  recusou: (m) => m.regra !== "R8_cadastro",
};

/**
 * O que um desfecho faz com cada motivo do cliente. `pesquisa` = o pós-serviço foi respondido (nota
 * ou como ficou): sem ela, o pós-serviço não fecha. A tela mostra a lista antes de confirmar e deixa
 * marcar/desmarcar os "fecha".
 */
export function planoDesfecho(c: Pick<ClienteHoje, "motivos">, desfecho: DesfechoHoje, pesquisa: boolean): ItemPlano[] {
  return c.motivos.map((m): ItemPlano => {
    const temRegistroOuRev = m.fonte !== "oportunidade";
    if (desfecho === "sem_resposta" || desfecho === "whatsapp" || desfecho === "numero_errado") {
      const canal = desfecho === "whatsapp" ? "mensagem no WhatsApp" : desfecho === "numero_errado" ? "número errado" : "ligação sem resposta";
      return temRegistroOuRev
        ? { motivo: m, efeito: "tentativa", padrao: true, frase: `anota a tentativa (${canal})` }
        : { motivo: m, efeito: "mantem", padrao: false, frase: desfecho === "numero_errado" && m.regra === "R8_cadastro" ? "continua aberto: corrigir o telefone no cadastro" : "continua aberto (o robô não guarda tentativa)" };
    }
    if (ehPos(m)) {
      if (m.fonte === "registro") {
        if (pesquisa) return { motivo: m, efeito: "fecha", padrao: true, frase: "conclui com a pesquisa (nota, como ficou, indicaria)" };
        if (desfecho === "retornar") return { motivo: m, efeito: "retorno", padrao: true, frase: "guarda a data do retorno" };
        return { motivo: m, efeito: "mantem", padrao: false, frase: "continua aberto: falta a nota ou como o cliente ficou" };
      }
      if (desfecho === "retornar") return { motivo: m, efeito: "mantem", padrao: false, frase: "continua aberto até o retorno" };
      return { motivo: m, efeito: "fecha", padrao: true, frase: "marca o retorno de pós-venda como atendido" };
    }
    if (desfecho === "so_pesquisa") return { motivo: m, efeito: "fecha", padrao: false, frase: m.fonte === "oportunidade" ? "marcar como atendido (se tratou)" : "concluir (se tratou)" };
    if (desfecho === "retornar") {
      return temRegistroOuRev
        ? { motivo: m, efeito: "retorno", padrao: true, frase: "guarda a data do retorno" }
        : { motivo: m, efeito: "mantem", padrao: false, frase: "continua aberto (o cliente espera até o retorno)" };
    }
    const faz = FECHA_POR_DESFECHO[desfecho](m);
    const frase = m.fonte === "oportunidade" ? "marca como atendido"
      : m.fonte === "revisao" ? (desfecho === "servico_agendado" ? "revisão agendada" : "não quer a revisão agora")
      : "conclui o atendimento";
    return { motivo: m, efeito: "fecha", padrao: faz, frase: faz ? frase : `${frase} (marque se também tratou)` };
  });
}

/** Nota baixa ou insatisfeito na pesquisa → avisar o gerente (POST /api/feedbacks/crm/alerta). */
export { precisaAlerta } from "./fila";

// ─── números do topo e do painel ─────────────────────────────────────────────

export interface Contadores { paraHoje: number; feitosHoje: number; semResposta: number; retornos: number; notasBaixas: number }

export function contadores(
  clientes: ClienteHoje[], cota: number,
  extra: { registros: FeedbackRegistro[]; feitosHojeKeys: Set<string> },
  agora: number = Date.now(),
): Contadores {
  const hoje = hojeSP(agora);
  const limite30 = hojeSP(agora - 30 * DIA);
  const { hoje: lista } = cotaDoDia(clientes, cota);
  return {
    paraHoje: lista.length,
    feitosHoje: extra.feitosHojeKeys.size,
    semResposta: clientes.filter((c) => c.acao === "whatsapp" || c.motivos.some((m) => m.registro?.status_atendimento === "sem_resposta")).length,
    retornos: clientes.filter((c) => c.motivos.some((m) => m.retorno && m.retorno <= hoje)).length,
    notasBaixas: extra.registros.filter((r) => r.tipo === "crm" && (r.concluido_em || r.data_contato || "").slice(0, 10) >= limite30 && ((r.nota != null && r.nota <= 6) || r.status_cliente === "Insatisfeito")).length,
  };
}

/** Clientes que tiveram algo fechado hoje (atendimento concluído, oportunidade atendida, revisão resolvida). */
export function feitosHoje(e: { registros: FeedbackRegistro[]; oportunidades: Oportunidade[]; revisoes: ItemRevisao[] }, agora: number = Date.now()): Set<string> {
  const hoje = hojeSP(agora);
  const dia = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }) : "");
  const out = new Set<string>();
  for (const r of e.registros) if ((r.status_atendimento === "concluido" || r.status_atendimento === "arquivado") && dia(r.concluido_em) === hoje) out.add(clienteKey(r.codigo_omie, r.nome));
  for (const o of e.oportunidades) if ((o.status === "atendida" && dia(o.atendida_em) === hoje)) out.add(clienteKey(o.codigo_omie, o.cliente_nome));
  for (const it of e.revisoes) if (it.contato.status !== "aberto" && dia(it.contato.concluido_em) === hoje) out.add(clienteKey(it.trator.codigo_omie, it.trator.cliente));
  return out;
}

/** Distribuição para o relatório e a aba Robô: quantos clientes por grupo, urgentes, por faixa de pontos. */
export function distribuicao(clientes: ClienteHoje[]) {
  const porGrupo: Record<Grupo, number> = { pos_servico: 0, reativacao: 0, revisoes: 0, pecas: 0, cadastro: 0, retornos: 0 };
  const faixas: Record<string, number> = { "200+": 0, "100–199": 0, "50–99": 0, "20–49": 0, "1–19": 0, "esperando": 0 };
  for (const c of clientes) {
    for (const g of c.grupos) porGrupo[g]++;
    if (!ehAgora(c)) faixas.esperando++;
    else if (c.pontos >= 200) faixas["200+"]++;
    else if (c.pontos >= 100) faixas["100–199"]++;
    else if (c.pontos >= 50) faixas["50–99"]++;
    else if (c.pontos >= 20) faixas["20–49"]++;
    else faixas["1–19"]++;
  }
  return { porGrupo, faixas, urgentes: clientes.filter((c) => c.urgente).length, varios: clientes.filter((c) => c.motivos.length > 1).length };
}

// ─── revisão vencida × vai vencer (José, 26/10/2026: "separa as que venceu com que vai vencer") ──

export type EstadoRevisaoCliente = "vencida" | "vai_vencer";
export const ROTULO_ESTADO_REVISAO: Record<EstadoRevisaoCliente, { titulo: string; ajuda: string; cor: string; ico: string }> = {
  vencida: { titulo: "Revisão vencida", ajuda: "já passou do horímetro da revisão ou parou de fazer na loja", cor: "#dc2626", ico: "fa-triangle-exclamation" },
  vai_vencer: { titulo: "Revisão vai vencer", ajuda: "vence nos próximos dias pela média de uso", cor: "#d97706", ico: "fa-hourglass-half" },
};

/** Pior situação de revisão do cliente: vencida (atrasada ou parou) > vai vencer (vence em 30 dias ou próxima). null = sem revisão. */
export function estadoRevisaoCliente(c: Pick<ClienteHoje, "motivos">): EstadoRevisaoCliente | null {
  const sits = c.motivos.map((m) => m.revisao?.trator.previsao.situacao).filter(Boolean);
  if (sits.some((s) => s === "atrasada" || s === "parou")) return "vencida";
  if (sits.some((s) => s === "vence_30" || s === "proxima")) return "vai_vencer";
  return null;
}

/** A lista do dia em blocos, na ordem: vencidas, vão vencer, outros motivos (cada bloco mantém a ordem dos pontos). */
export function separarPorRevisao<T extends Pick<ClienteHoje, "motivos">>(lista: T[]): { vencida: T[]; vai_vencer: T[]; outros: T[] } {
  const out = { vencida: [] as T[], vai_vencer: [] as T[], outros: [] as T[] };
  for (const c of lista) out[estadoRevisaoCliente(c) ?? "outros"].push(c);
  return out;
}
