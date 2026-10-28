// CRM AUTOMÁTICO (José, 23/10/2026): toda OS faturada vira uma ligação de satisfação no
// /feedbacks/crm, já preenchida, a partir de D+3 do faturamento. O CRM tinha 5 linhas
// manuais em toda a história para ~85 OS faturadas por mês.
//
// PURO (sem banco): lê a linha de `portal_nt_clientes_os`, decide se a OS entra e monta o
// payload do insert em `feedback_registros`. Quem lê/grava é crm-automatico-server.ts.
// Testes em __tests__/crm-automatico.test.ts.
import { TAG_NAO_CONTATAR, clienteKey } from "./types";
import { CRM_DIA_INICIO, CRM_DIA_LIMITE } from "./fila";

/** Janela: a OS entra entre D+3 e D+15 do faturamento (mesma régua da fila do CRM). */
export const CRM_AUTO_DIAS_MIN = CRM_DIA_INICIO;
export const CRM_AUTO_DIAS_MAX = CRM_DIA_LIMITE;
/** Uma ligação por cliente a cada 30 dias, mesmo com várias OS. */
export const CRM_AUTO_INTERVALO_CLIENTE_DIAS = 30;
/** OS de R$ 0,00/R$ 0,01 (lançamento técnico) não vira ligação. */
export const CRM_AUTO_VALOR_MIN = 1;
/** Contrato que não é serviço vendido ao cliente. */
export const CRM_AUTO_CONTRATO_FORA = /cortesia|interno|interna/i;
export const ORIGEM_AUTO_OS = "os_faturada";
export const SERVICO_MAX = 300;

export type ContaOmie = "NOVA" | "CASTRO";

/** Colunas lidas de `portal_nt_clientes_os`. */
export interface LinhaOS {
  num_os: string | number | null;
  cod_os?: number | string | null;
  empresa: string | null;
  cod_cli: number | string | null;
  cliente_nome: string | null;
  data_faturamento: string | null;
  valor_total: number | string | null;
  faturada: boolean | null;
  cancelada: boolean | null;
  vendedor: string | null;
  contrato: string | null;
  descricao: string | null;
}

export interface OSParseada {
  conta: ContaOmie | null;
  numOs: string;
  osRef: string | null;
  codCli: string | null;
  nome: string;
  faturadoEm: string | null;
  valor: number;
  faturada: boolean;
  cancelada: boolean;
  contrato: string;
  tecnico: string | null;
  trator: string | null;
  servico: string | null;
}

export interface Contato { telefone: string | null; email: string | null }

/** Payload do insert em feedback_registros. */
export interface CrmInsert {
  tipo: "crm";
  nome: string;
  codigo_omie: string;
  telefone: string | null;
  email: string | null;
  trator: string | null;
  tecnico: string | null;
  servico: string | null;
  data_servico: string | null;
  status_atendimento: "aberto";
  atendente_id: null;
  atendente_nome: null;
  aberto_em: null;
  origem_dados: string;
  os_ref: string;
  os_valor: number;
  faturado_em: string;
  origem_auto: string;
  tentativas: [];
  sem_resposta: false;
}

// ── datas (dia civil, sem hora) ─────────────────────────────────────────────
const DIA = 86_400_000;
const tDia = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
export function somarDias(iso: string, n: number): string {
  return new Date(tDia(iso) + n * DIA).toISOString().slice(0, 10);
}
export function diasEntreDatas(de: string, ate: string): number {
  return Math.round((tDia(ate) - tDia(de)) / DIA);
}
/** Hoje no fuso de Brasília (YYYY-MM-DD). */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}
/** Datas de faturamento que entram hoje (inclusive). */
export function janelaCrmAuto(hoje: string): { de: string; ate: string } {
  return { de: somarDias(hoje, -CRM_AUTO_DIAS_MAX), ate: somarDias(hoje, -CRM_AUTO_DIAS_MIN) };
}

// ── leitura da OS ───────────────────────────────────────────────────────────
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const limpo = (s: string | null | undefined) => String(s ?? "").replace(/\s+/g, " ").trim();

export function contaDaEmpresa(empresa: string | null | undefined): ContaOmie | null {
  const e = semAcento(String(empresa || ""));
  if (e.includes("castro")) return "CASTRO";
  if (e.includes("nova")) return "NOVA";
  return null;
}

/** "Técnicos: José Antonio // Fernando Leonel" → "José Antonio // Fernando Leonel". */
export function tecnicosDaOS(vendedor: string | null | undefined): string | null {
  const s = String(vendedor || "").replace(/^\s*t[eé]cnicos?\s*:\s*/i, "");
  const nomes = s.split(/\s*(?:\/\/|;)\s*/).map(limpo).filter(Boolean);
  return nomes.length ? nomes.join(" // ") : null;
}

type CampoDesc = "modelo" | "chassi" | "horimetro" | "solicitacao" | "realizado";
function chaveDoTrecho(rotulo: string): CampoDesc | null {
  const r = semAcento(rotulo).trim();
  if (r === "modelo") return "modelo";
  if (r === "chassis" || r === "chassi") return "chassi";
  if (r.startsWith("horimetro")) return "horimetro";
  if (r.startsWith("solicitacao")) return "solicitacao";
  if (r.startsWith("servico realizado")) return "realizado";
  return null;
}

/** "Modelo: 86110|Chassis: NP7T…|Horimetro: 3077,7||Solicitação do cliente: …|Serviço Realizado: …" */
export function lerDescricao(descricao: string | null | undefined): Partial<Record<CampoDesc, string>> {
  const out: Partial<Record<CampoDesc, string>> = {};
  let atual: CampoDesc | null = null;
  for (const parte of String(descricao || "").split("|")) {
    if (!parte.trim()) continue;
    const i = parte.indexOf(":");
    const chave = i > 0 ? chaveDoTrecho(parte.slice(0, i)) : null;
    if (chave) { atual = chave; out[chave] = limpo(parte.slice(i + 1)); continue; }
    // trecho sem rótulo conhecido: continuação do campo anterior (texto com "|")
    if (atual) out[atual] = limpo(`${out[atual] || ""} ${parte}`);
  }
  return out;
}

export function tratorDaOS(d: Partial<Record<CampoDesc, string>>): string | null {
  const modelo = limpo(d.modelo);
  const chassi = limpo(d.chassi).replace(/\s/g, "");
  const partes = [modelo ? modelo : "", chassi ? `Chassi ${chassi.slice(-7)}` : ""].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

export function servicoDaOS(d: Partial<Record<CampoDesc, string>>): string | null {
  const s = limpo(d.realizado) || limpo(d.solicitacao);
  if (!s) return null;
  return s.length > SERVICO_MAX ? `${s.slice(0, SERVICO_MAX - 1).trimEnd()}…` : s;
}

function numero(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").trim();
  if (!s) return 0;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) ? n : 0;
}

export function parseOS(l: LinhaOS): OSParseada {
  const conta = contaDaEmpresa(l.empresa);
  const numOs = limpo(String(l.num_os ?? ""));
  const desc = lerDescricao(l.descricao);
  const cod = l.cod_cli == null || String(l.cod_cli).trim() === "" ? null : String(l.cod_cli).trim();
  return {
    conta,
    numOs,
    osRef: conta && numOs ? `${conta}:${numOs}` : null,
    codCli: cod,
    nome: limpo(l.cliente_nome),
    faturadoEm: l.data_faturamento ? String(l.data_faturamento).slice(0, 10) : null,
    valor: numero(l.valor_total),
    faturada: l.faturada === true,
    cancelada: l.cancelada === true,
    contrato: limpo(l.contrato),
    tecnico: tecnicosDaOS(l.vendedor),
    trator: tratorDaOS(desc),
    servico: servicoDaOS(desc),
  };
}

// ── elegibilidade ───────────────────────────────────────────────────────────
export type MotivoPulo =
  | "empresa_desconhecida" | "sem_cliente" | "nao_faturada" | "cancelada" | "valor_baixo"
  | "contrato_cortesia_interno" | "sem_data" | "cedo" | "tarde"
  | "nao_contatar" | "os_ja_no_crm" | "cliente_ligado_30d" | "mesmo_cliente_no_lote" | "os_repetida";

/** Regras da própria OS (sem olhar o banco). null = entra. */
export function motivoInelegivel(os: OSParseada, hoje: string): MotivoPulo | null {
  if (!os.conta || !os.osRef) return "empresa_desconhecida";
  if (!os.codCli) return "sem_cliente";
  if (!os.faturada) return "nao_faturada";
  if (os.cancelada) return "cancelada";
  if (!(os.valor > CRM_AUTO_VALOR_MIN)) return "valor_baixo";
  if (CRM_AUTO_CONTRATO_FORA.test(os.contrato)) return "contrato_cortesia_interno";
  if (!os.faturadoEm) return "sem_data";
  const dias = diasEntreDatas(os.faturadoEm, hoje);
  if (dias < CRM_AUTO_DIAS_MIN) return "cedo";
  if (dias > CRM_AUTO_DIAS_MAX) return "tarde";
  return null;
}

/** Tags de feedback_clientes_info (array ou string JSON). */
export function temTagNaoContatar(tags: unknown): boolean {
  let lista: unknown = tags;
  if (typeof tags === "string") { try { lista = JSON.parse(tags) } catch { lista = [tags] } }
  return Array.isArray(lista) && lista.some((t) => String(t).trim() === TAG_NAO_CONTATAR);
}

/** "() 18997728045" → "18997728045"; sem dígito → null. */
export function limparTelefone(t: string | null | undefined): string | null {
  const s = limpo(String(t ?? "").replace(/\(\s*\)/g, ""));
  return /\d/.test(s) ? s : null;
}

export const chaveContato = (conta: ContaOmie, codCli: string) => `${conta}:${codCli}`;

export function payloadCrm(os: OSParseada, contato: Contato | null | undefined): CrmInsert {
  return {
    tipo: "crm",
    nome: os.nome || `Cliente ${os.codCli}`,
    codigo_omie: String(os.codCli),
    telefone: limparTelefone(contato?.telefone),
    email: limpo(contato?.email) || null,
    trator: os.trator,
    tecnico: os.tecnico,
    servico: os.servico,
    data_servico: os.faturadoEm,
    status_atendimento: "aberto",
    atendente_id: null,
    atendente_nome: null,
    aberto_em: null,
    origem_dados: `Omie ${os.conta}`,
    os_ref: os.osRef!,
    os_valor: os.valor,
    faturado_em: os.faturadoEm!,
    origem_auto: ORIGEM_AUTO_OS,
    tentativas: [],
    sem_resposta: false,
  };
}

export interface EntradaLote {
  linhas: LinhaOS[];
  hoje: string;
  /** cliente_key (omie_<cod> / nome_<NOME>) com a tag "Não contatar" */
  naoContatar: Set<string>;
  /** os_ref que já têm registro em feedback_registros */
  osRefsExistentes: Set<string>;
  /** codigo_omie com registro CRM criado nos últimos 30 dias */
  clientesRecentes: Set<string>;
  /** contato por chaveContato(conta, cod) ou, na falta, por cod */
  contatos: Map<string, Contato>;
}

export interface ResultadoLote {
  candidatas: number;
  payloads: CrmInsert[];
  puladas: Partial<Record<MotivoPulo, number>>;
}

/** Decide o lote do dia. Por cliente fica a OS faturada mais recente (empate: a de maior valor). */
export function montarLote(e: EntradaLote): ResultadoLote {
  const puladas: Partial<Record<MotivoPulo, number>> = {};
  const pular = (m: MotivoPulo) => { puladas[m] = (puladas[m] || 0) + 1 };
  const vistas = new Set<string>();
  const elegiveis: OSParseada[] = [];

  for (const l of e.linhas) {
    const os = parseOS(l);
    const m = motivoInelegivel(os, e.hoje);
    if (m) { pular(m); continue; }
    if (vistas.has(os.osRef!)) { pular("os_repetida"); continue; }
    vistas.add(os.osRef!);
    if (e.osRefsExistentes.has(os.osRef!)) { pular("os_ja_no_crm"); continue; }
    if (e.naoContatar.has(clienteKey(os.codCli, os.nome)) || e.naoContatar.has(clienteKey(null, os.nome))) { pular("nao_contatar"); continue; }
    if (e.clientesRecentes.has(os.codCli!)) { pular("cliente_ligado_30d"); continue; }
    elegiveis.push(os);
  }

  elegiveis.sort((a, b) => (b.faturadoEm! < a.faturadoEm! ? -1 : b.faturadoEm! > a.faturadoEm! ? 1 : b.valor - a.valor));
  const clientes = new Set<string>();
  const payloads: CrmInsert[] = [];
  for (const os of elegiveis) {
    if (clientes.has(os.codCli!)) { pular("mesmo_cliente_no_lote"); continue; }
    clientes.add(os.codCli!);
    const contato = e.contatos.get(chaveContato(os.conta!, os.codCli!)) ?? e.contatos.get(os.codCli!);
    payloads.push(payloadCrm(os, contato));
  }
  return { candidatas: e.linhas.length, payloads, puladas };
}

// ── alerta do cliente insatisfeito (rota /api/feedbacks/crm/alerta) ──────────
export function cortarTexto(s: string, n: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

/** "Nota 3 · Insatisfeito · Técnico: Fulano — “o que o cliente disse”" (≤ 200). */
export function descricaoAlertaCrm(r: { nota: number | null; status_cliente: string | null; tecnico: string | null; feedback: string | null }): string {
  const partes = [
    r.nota != null ? `Nota ${r.nota}` : "",
    r.status_cliente ? String(r.status_cliente) : "",
    r.tecnico ? `Técnico: ${r.tecnico}` : "",
  ].filter(Boolean);
  const disse = r.feedback && r.feedback.trim() ? `“${r.feedback.trim()}”` : "";
  return cortarTexto([partes.join(" · "), disse].filter(Boolean).join(" — "), 200);
}
