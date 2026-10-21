// Porta única da Omie: TODA chamada à API da Omie deve passar por `omie()`.
// Plano: docs/omie-fila-agendador-plano.md (Etapa 1).
//
// Por que existe: a Omie limita 4 req/s e 240/min por IP + chave + método e TRAVA a
// chave por ~30 min depois de 10 erros (cada erro durante a trava prorroga). O portal
// inteiro sai do mesmo IP do Railway com as mesmas chaves; sem uma porta única, cada
// módulo freava (ou não) por conta própria e um somava erros sobre o outro.
//
// O que ela faz:
//  - Fila com PRIORIDADE por chave: 'pessoa' (alguém esperando na tela) passa na frente
//    de 'rapido' (agendadores curtos), que passa na frente de 'pesado' (syncs longos).
//    A prioridade vem do contexto (`comPrioridade`) — o `comCronRun` marca 'pesado'.
//  - Freio: intervalo mínimo por (chave, método), por chave e no IP inteiro, e no
//    máximo N chamadas simultâneas por chave.
//  - Disjuntor: bloqueio por consumo indevido trava (chave, método) até a hora que a
//    Omie informar; chave recusada ("chave inválida / aplicativo suspenso") para a
//    CHAVE inteira por 5 min. Durante a trava, falha na hora sem tocar a Omie.
//  - Gravação NUNCA repete às cegas: só repete quando a Omie recusou ANTES de processar
//    (too many requests, HTTP 429) ou quando a conexão nem chegou a abrir. "Consumo
//    redundante" em gravação = uma chamada igual acabou de chegar → estado desconhecido. Timeout/resposta quebrada em gravação vira
//    `OmieIncertoError` — quem chamou decide (ex.: consultar antes de refazer).
//  - Corpo 100% ASCII (acentos como \uXXXX): a Omie descarta não-ASCII cru.
//  - Contadores em memória (`estadoPorta`) para o painel.
//
// O portal roda em UMA instância no Railway; a fila em memória basta para o freio.

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';

const OMIE_BASE = 'https://app.omie.com.br/api/v1';

// ── Tipos públicos ─────────────────────────────────────────────────────────────

export type Prioridade = 'pessoa' | 'rapido' | 'pesado';
const PESO: Record<Prioridade, number> = { pessoa: 0, rapido: 1, pesado: 2 };

export interface CredencialOmie {
  appKey: string;
  appSecret: string;
  /** Nome legível da conta (NOVA, CASTRO, "Nova Tratores"…) — só para mensagens e painel. */
  rotulo: string;
}

export interface OpcoesOmie {
  /** Sobrescreve a prioridade do contexto. */
  prioridade?: Prioridade;
  /** Força leitura/gravação; sem isso, decide pelo nome do método. */
  gravacao?: boolean;
  /** Repetições em erro transitório/rede (só leitura, ou gravação recusada antes de processar). Padrão 2. */
  tentativas?: number;
  /** Teto da espera entre repetições. Padrão 30 s. */
  maxEsperaMs?: number;
  /** Tempo máximo de uma chamada. Padrão 120 s. */
  timeoutMs?: number;
  /** true (padrão): erro de negócio (faultstring) vira `OmieFaultError`. false: devolve o JSON com faultstring. */
  lancarFault?: boolean;
}

export type OmieResposta = Record<string, unknown> & { faultstring?: string; faultcode?: string };

// ── Erros ──────────────────────────────────────────────────────────────────────
// Todos carregam `faultstring` quando a Omie mandou uma, para compatibilidade com o
// código antigo que testava `e.faultstring` / `e.bloqueio` / `e.aguardarSegundos`.

export class OmieFaultError extends Error {
  constructor(message: string, readonly faultstring: string, readonly conta: string, readonly call: string) {
    super(message);
    this.name = 'OmieFaultError';
  }
}

export class OmieBloqueioError extends Error {
  readonly bloqueio = true;
  faultstring?: string;
  constructor(message: string, readonly conta: string, readonly call: string, readonly aguardarSegundos: number) {
    super(message);
    this.name = 'OmieBloqueioError';
  }
}

/** A Omie recusou a CHAVE (inválida ou aplicativo suspenso). Também é bloqueio: não insistir. */
export class OmieChaveRecusadaError extends OmieBloqueioError {
  constructor(message: string, conta: string, call: string, aguardarSegundos: number) {
    super(message, conta, call, aguardarSegundos);
    this.name = 'OmieChaveRecusadaError';
  }
}

/** Gravação sem resposta clara: pode ter sido feita na Omie. NÃO refazer sem consultar. */
export class OmieIncertoError extends Error {
  readonly incerto = true;
  constructor(message: string, readonly conta: string, readonly call: string) {
    super(message);
    this.name = 'OmieIncertoError';
  }
}

// ── Classificação de métodos e respostas (puras, exportadas para teste) ────────

const RE_GRAVACAO = /^(Incluir|Alterar|Excluir|Faturar|Cancelar|Concluir|Reverter|Devolver|Upsert|Associar|Lancar|Trocar|Efetuar|Duplicar|Gerar|Enviar|Estornar|Desfazer)/;

/** Cada módulo escreve a empresa de um jeito (NOVA, "Nova Tratores", "Castro Peças"…): o painel junta em NOVA/CASTRO. */
export function rotuloCanonico(r: string): string {
  if (/castro/i.test(r)) return 'CASTRO';
  if (/nova/i.test(r)) return 'NOVA';
  return (r || '?').toUpperCase();
}

export function ehGravacao(call: string): boolean {
  return RE_GRAVACAO.test(call);
}

export function ehBloqueio(fault: string): boolean {
  return /api bloqueada|consumo indevido/i.test(fault);
}

export function ehChaveRecusada(fault: string): boolean {
  // Mensagem da Omie: "A chave de acesso está inválida ou o aplicativo está suspenso".
  // Cuidado: "chave de acesso da NF-e inválida" é erro de NOTA, não da chave da API.
  return /chave de acesso est[aá] inv[aá]lida ou o aplicativo|aplicativo est[aá] suspenso|app_key.{0,20}inv[aá]lid/i.test(fault);
}

/** Limite de velocidade: a Omie recusou ANTES de processar — seguro repetir até gravação. */
export function ehLimiteVelocidade(fault: string): boolean {
  return /too many requests/i.test(fault);
}

/**
 * Chamada igual repetida ("consumo redundante") ou do mesmo método em andamento.
 * Em LEITURA, é só esperar e repetir. Em GRAVAÇÃO quer dizer que uma chamada igual
 * acabou de chegar — pode ter sido processada: não é recusa limpa (regra do
 * faturamento de OS, docs/pos-faturar-os-plano.md).
 */
export function ehConcorrencia(fault: string): boolean {
  return /redundant|consumo redundante/i.test(fault)
    || /j[aá] existe uma requisi/i.test(fault)
    || /requisi[cç][aã]o desse m[ée]todo/i.test(fault);
}

/** Engasgo do servidor da Omie: repetir só em leitura (em gravação não dá pra saber se fez). */
export function ehEngasgo(fault: string): boolean {
  return /soap-error|broken response|tente novamente|tentar novamente/i.test(fault);
}

/** Segundos de espera informados na mensagem de bloqueio (padrão 30 min). */
export function segundosDoBloqueio(fault: string): number {
  const mSeg = fault.match(/(\d+)\s*segundos?/i);
  if (mSeg) return parseInt(mSeg[1], 10);
  const mMin = fault.match(/(\d+)\s*minutos?/i);
  if (mMin) return parseInt(mMin[1], 10) * 60;
  return 1800;
}

/** Segundos que a Omie pede para esperar num "Aguarde N segundos" (consumo redundante); 0 se não disser. */
export function segundosParaAguardar(fault: string): number {
  const m = /aguarde\s+(\d+)\s+segundo/i.exec(fault);
  return m ? parseInt(m[1], 10) : 0;
}

/** JSON com todo codepoint ≥ U+0080 escapado como \uXXXX (a Omie descarta não-ASCII cru). */
export function corpoAscii(obj: unknown): string {
  return JSON.stringify(obj).replace(/[\u0080-￿]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
}

/** Falha de conexão que garante que o pedido NÃO chegou à Omie. */
function conexaoNaoAbriu(e: unknown): boolean {
  const cod = (e as { cause?: { code?: string } })?.cause?.code || (e as { code?: string })?.code || '';
  return ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED'].includes(cod);
}

// ── Contexto de prioridade ─────────────────────────────────────────────────────

const contexto = new AsyncLocalStorage<{ prioridade: Prioridade }>();

/** Roda `fn` com a prioridade dada para toda chamada à Omie feita dentro dela (inclusive em segundo plano). */
export function comPrioridade<T>(prioridade: Prioridade, fn: () => T): T {
  return contexto.run({ prioridade }, fn);
}

export function prioridadeAtual(): Prioridade {
  return contexto.getStore()?.prioridade ?? 'pessoa';
}

/**
 * Prioridade de uma chamada sem contexto: requisição que chegou com a senha dos robôs
 * (Bearer CRON_SECRET / x-cron-secret — GitHub Actions e o agendador) é robô = 'pesado',
 * mesmo que a rota não use `comCronRun`. Antes, essas rotas (DRE, NFS-e, remessas…)
 * entravam como 'pessoa' e disputavam a vez com quem estava faturando.
 */
async function prioridadeDaChamada(): Promise<Prioridade> {
  const doContexto = contexto.getStore()?.prioridade;
  if (doContexto) return doContexto;
  const segredo = process.env.CRON_SECRET || '';
  if (!segredo || process.env.VITEST) return 'pessoa';
  try {
    const { headers } = await import('next/headers');
    const h = await headers();
    const robo = (h.get('authorization') || '').trim() === `Bearer ${segredo}` || (h.get('x-cron-secret') || '').trim() === segredo;
    return robo ? 'pesado' : 'pessoa';
  } catch {
    return 'pessoa'; // fora de uma requisição (setInterval, script)
  }
}

// ── Estado global (sobrevive ao HMR do dev) ────────────────────────────────────

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
export const LIMITES = {
  /** Entre duas chamadas do MESMO método na mesma chave (4/s e 240/min → 300 ms dá ~200/min). */
  gapMetodoMs: num(process.env.OMIE_GAP_METODO_MS, 300),
  /** Entre duas chamadas quaisquer da mesma chave. */
  gapChaveMs: num(process.env.OMIE_GAP_CHAVE_MS, 200),
  /** Entre duas chamadas quaisquer saindo do servidor (todas as chaves). */
  gapGlobalMs: num(process.env.OMIE_GAP_GLOBAL_MS, 80),
  /** Chamadas em voo ao mesmo tempo por chave. */
  maxSimultaneasChave: num(process.env.OMIE_MAX_SIMULTANEAS, 4),
  /** Gravações (Incluir/Alterar/Faturar…) em voo ao mesmo tempo por chave — o Omie pede que NÃO sejam
   *  simultâneas (orientação do suporte, 21/10/2026): uma de cada vez, as leituras seguem em paralelo. */
  maxGravacoesChave: num(process.env.OMIE_MAX_GRAVACOES, 1),
  /** Espera máxima padrão quando o Omie pede "aguarde N s" (consumo redundante é liberado em ~60 s). */
  maxEsperaPadraoMs: num(process.env.OMIE_MAX_ESPERA_MS, 65_000),
  /** Pausa da chave inteira depois de "chave inválida / aplicativo suspenso". */
  pausaChaveRecusadaMs: num(process.env.OMIE_PAUSA_CHAVE_MS, 5 * 60_000),
};

interface Espera { chave: string; metodo: string; peso: number; seq: number; gravacao: boolean; liberar: () => void }
interface Contador { ok: number; erro: number; bloqueio: number; incerto: number; ms: number }
interface EstadoInterno {
  fila: Espera[];
  seq: number;
  timer: ReturnType<typeof setTimeout> | null;
  proxGlobal: number;
  proxChave: Map<string, number>;
  proxMetodo: Map<string, number>;
  emVoo: Map<string, number>;
  /** gravações em voo por chave (no máximo LIMITES.maxGravacoesChave) */
  gravando?: Map<string, number>;
  bloqueios: Map<string, { ate: number; motivo: string }>; // `${chave}|${metodo}` ou `${chave}|*`
  rotulos: Map<string, string>;
  /** minuto (epoch/60000) → `${rotulo}|${metodo}|${prioridade}` → contador; guarda 60 min. */
  minutos: Map<number, Map<string, Contador>>;
  /** pausas dos robôs abertas NESTE processo (id → até quando) */
  pausas?: Map<string, number>;
  /** maior "até" das pausas no banco (abertas pelo outro processo — web × worker) */
  pausaExternaAte?: number;
  pausaLidaEm?: number;
}

const G = globalThis as unknown as { __omiePorta?: EstadoInterno };
function estado(): EstadoInterno {
  if (!G.__omiePorta) {
    G.__omiePorta = {
      fila: [], seq: 0, timer: null, proxGlobal: 0,
      proxChave: new Map(), proxMetodo: new Map(), emVoo: new Map(),
      bloqueios: new Map(), rotulos: new Map(), minutos: new Map(),
    };
  }
  return G.__omiePorta;
}

/** Só para testes. */
export function _reiniciarPorta(): void {
  const s = G.__omiePorta;
  if (s?.timer) clearTimeout(s.timer);
  G.__omiePorta = undefined;
}

const idChave = (appKey: string) => createHash('sha256').update(appKey).digest('hex').slice(0, 12);

// ── Disjuntor ──────────────────────────────────────────────────────────────────

/** ms restantes de bloqueio para (chave, método) — inclui a pausa da chave inteira; 0 = livre. */
export function bloqueioRestanteMs(appKey: string, call: string): number {
  const s = estado();
  const k = idChave(appKey);
  const agora = Date.now();
  const ate = Math.max(s.bloqueios.get(`${k}|${call}`)?.ate ?? 0, s.bloqueios.get(`${k}|*`)?.ate ?? 0);
  return ate > agora ? ate - agora : 0;
}

function armarBloqueio(chave: string, metodo: string, ms: number, motivo: string) {
  estado().bloqueios.set(`${chave}|${metodo}`, { ate: Date.now() + ms, motivo });
}

// ── Fila e freio ───────────────────────────────────────────────────────────────

function bombear() {
  const s = estado();
  s.timer = null;
  if (!s.fila.length) return;
  s.fila.sort((a, b) => a.peso - b.peso || a.seq - b.seq);
  let proxima = Infinity;
  let pausados = false;
  const pausa = pausaAte(s);
  for (let i = 0; i < s.fila.length; i++) {
    const e = s.fila[i];
    const agora = Date.now();
    if (e.peso > 0 && pausa > agora) { pausados = true; proxima = Math.min(proxima, agora + 2_000, pausa); continue; } // robô espera o faturamento
    if ((s.emVoo.get(e.chave) ?? 0) >= LIMITES.maxSimultaneasChave) continue; // reabre quando alguém terminar
    if (e.gravacao && ((s.gravando ??= new Map()).get(e.chave) ?? 0) >= LIMITES.maxGravacoesChave) continue; // uma gravação por vez
    const livre = Math.max(s.proxGlobal, s.proxChave.get(e.chave) ?? 0, s.proxMetodo.get(`${e.chave}|${e.metodo}`) ?? 0);
    if (livre > agora) { proxima = Math.min(proxima, livre); continue; }
    s.proxGlobal = agora + LIMITES.gapGlobalMs;
    s.proxChave.set(e.chave, agora + LIMITES.gapChaveMs);
    s.proxMetodo.set(`${e.chave}|${e.metodo}`, agora + LIMITES.gapMetodoMs);
    s.emVoo.set(e.chave, (s.emVoo.get(e.chave) ?? 0) + 1);
    if (e.gravacao) (s.gravando ??= new Map()).set(e.chave, (s.gravando.get(e.chave) ?? 0) + 1);
    s.fila.splice(i, 1);
    i--;
    e.liberar();
    proxima = Math.min(proxima, s.proxGlobal); // o global acabou de andar
  }
  if (pausados) void lerPausaExterna(); // o faturamento do outro processo pode ter acabado
  if (s.fila.length && Number.isFinite(proxima) && !s.timer) s.timer = setTimeout(bombear, Math.max(0, proxima - Date.now()));
}

function pedirVaga(chave: string, metodo: string, prioridade: Prioridade, gravacao = false): Promise<() => void> {
  const s = estado();
  return new Promise((resolve) => {
    let devolvida = false;
    const devolver = () => {
      if (devolvida) return;
      devolvida = true;
      s.emVoo.set(chave, Math.max(0, (s.emVoo.get(chave) ?? 1) - 1));
      if (gravacao) (s.gravando ??= new Map()).set(chave, Math.max(0, (s.gravando.get(chave) ?? 1) - 1));
      if (!s.timer) s.timer = setTimeout(bombear, 0);
    };
    s.fila.push({ chave, metodo, peso: PESO[prioridade], seq: s.seq++, gravacao, liberar: () => resolve(devolver) });
    if (s.timer) clearTimeout(s.timer);
    s.timer = setTimeout(bombear, 0);
  });
}

// ── Pausa dos robôs durante o faturamento ──────────────────────────────────────
// José, 21/10/2026: "se precisar, para tudo para realizar o faturamento". Enquanto um
// faturamento (ou o "atualizar o Omie igual ao portal") roda, as chamadas de robô
// ('rapido' e 'pesado') ficam PARADAS na fila — não falham, só esperam — e o Omie fica
// livre para o faturamento. Vale para o web E o worker (tabela omie_pausa_robos; sem a
// tabela, só no próprio processo). Cada pausa expira sozinha em 10 min se o processo cair.

const PAUSA_MS = 10 * 60_000;
const PAUSA_MAX_MS = 30 * 60_000; // nem um faturamento travado segura os robôs mais que isso

type FontePausa = { lerAte(): Promise<number>; gravar(id: string, ate: number | null, motivo: string): Promise<void> };
async function fontePausa(): Promise<FontePausa | null> {
  if (process.env.VITEST) return null;
  try { return (await import('./pausa-robos')).FONTE_PAUSA; } catch { return null; }
}

function pausaAte(s: EstadoInterno = estado()): number {
  let ate = s.pausaExternaAte ?? 0;
  for (const v of s.pausas?.values() ?? []) ate = Math.max(ate, v);
  return ate;
}

let lendoPausa: Promise<void> | null = null;
/** Relê a pausa do banco (no máximo a cada 3 s). */
function lerPausaExterna(): Promise<void> {
  const s = estado();
  if (lendoPausa) return lendoPausa;
  if (Date.now() - (s.pausaLidaEm ?? 0) < 3_000) return Promise.resolve();
  s.pausaLidaEm = Date.now();
  lendoPausa = (async () => {
    const fonte = await fontePausa();
    if (!fonte) return;
    try { s.pausaExternaAte = await fonte.lerAte(); } catch { /* sem a tabela: vale só a pausa local */ }
  })().finally(() => {
    lendoPausa = null;
    if (!s.timer) s.timer = setTimeout(bombear, 0);
  });
  return lendoPausa;
}

/** Os robôs estão parados agora (por um faturamento neste processo ou no outro)? */
export function robosPausados(): boolean {
  return pausaAte() > Date.now();
}

/**
 * Roda `fn` (faturar / atualizar o Omie) com os robôs parados. Tudo dentro de `fn` vai
 * como 'pessoa' — mesmo se quem chamou for um robô (senão ele esperaria a própria pausa).
 */
export async function comRobosPausados<T>(motivo: string, fn: () => Promise<T>): Promise<T> {
  const s = estado();
  const id = `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const inicio = Date.now();
  const fonte = await fontePausa();
  const marcar = async () => {
    const ate = Math.min(Date.now() + PAUSA_MS, inicio + PAUSA_MAX_MS);
    (s.pausas ??= new Map()).set(id, ate);
    await fonte?.gravar(id, ate, motivo).catch(() => {});
  };
  await Promise.race([marcar(), new Promise((r) => setTimeout(r, 2_000))]); // o banco não segura o faturamento
  const renovar = setInterval(() => { if (Date.now() - inicio < PAUSA_MAX_MS) void marcar(); }, 3 * 60_000);
  try {
    return await comPrioridade('pessoa', fn);
  } finally {
    clearInterval(renovar);
    s.pausas?.delete(id);
    void fonte?.gravar(id, null, motivo).catch(() => {});
    if (!s.timer) s.timer = setTimeout(bombear, 0);
  }
}

// ── Contadores ─────────────────────────────────────────────────────────────────

function contar(rotulo: string, metodo: string, prioridade: Prioridade, campo: 'ok' | 'erro' | 'bloqueio' | 'incerto', ms: number) {
  const s = estado();
  const minuto = Math.floor(Date.now() / 60_000);
  let m = s.minutos.get(minuto);
  if (!m) {
    m = new Map();
    s.minutos.set(minuto, m);
    for (const k of s.minutos.keys()) if (k < minuto - 60) s.minutos.delete(k);
  }
  const k = `${rotulo}|${metodo}|${prioridade}`;
  const c = m.get(k) ?? { ok: 0, erro: 0, bloqueio: 0, incerto: 0, ms: 0 };
  c[campo]++;
  c.ms += ms;
  m.set(k, c);
}

// ── A chamada ──────────────────────────────────────────────────────────────────

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function omie<T = OmieResposta>(
  cred: CredencialOmie,
  endpoint: string,
  call: string,
  param: Record<string, unknown>,
  opcoes: OpcoesOmie = {},
): Promise<T> {
  if (!cred.appKey || !cred.appSecret) throw new Error(`Credenciais Omie não configuradas (${cred.rotulo})`);
  const chave = idChave(cred.appKey);
  const rotulo = rotuloCanonico(cred.rotulo);
  estado().rotulos.set(chave, rotulo);
  const prioridade = opcoes.prioridade ?? await prioridadeDaChamada();
  if (prioridade !== 'pessoa') await lerPausaExterna();
  const gravacao = opcoes.gravacao ?? ehGravacao(call);
  const tentativas = Math.max(0, opcoes.tentativas ?? 2);
  const maxEspera = opcoes.maxEsperaMs ?? LIMITES.maxEsperaPadraoMs;
  const timeoutMs = opcoes.timeoutMs ?? 120_000;
  const lancarFault = opcoes.lancarFault ?? true;
  const url = endpoint.startsWith('http') ? endpoint : OMIE_BASE + endpoint;
  const corpo = corpoAscii({ call, app_key: cred.appKey, app_secret: cred.appSecret, param: [param] });
  const onde = `[${rotulo}/${call}]`;

  for (let tentativa = 0; ; tentativa++) {
    const restante = bloqueioRestanteMs(cred.appKey, call);
    if (restante > 0) {
      const seg = Math.ceil(restante / 1000);
      const motivo = (estado().bloqueios.get(`${chave}|*`)?.ate ?? 0) > Date.now() ? 'chave recusada pela Omie' : 'Omie bloqueada';
      contar(rotulo, call, prioridade, 'bloqueio', 0);
      throw new OmieBloqueioError(`${motivo} ${onde} — aguardando ~${seg}s`, rotulo, call, seg);
    }

    const devolver = await pedirVaga(chave, call, prioridade, gravacao);
    const t0 = Date.now();
    let data: OmieResposta;
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: corpo, signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }
      // HTTP 429: a Omie recusou ANTES de processar — seguro repetir, até gravação.
      if (res.status === 429) throw Object.assign(new Error(`Omie recusou por excesso de chamadas (HTTP 429) ${onde}`), { recusa429: true });
      const texto = await res.text();
      try {
        data = JSON.parse(texto) as OmieResposta;
      } catch {
        throw Object.assign(new Error(`Omie respondeu algo que não é JSON (HTTP ${res.status}) ${onde}`), { respostaQuebrada: true });
      }
    } catch (e) {
      devolver();
      const ms = Date.now() - t0;
      const recusou = (e as { recusa429?: boolean })?.recusa429 === true;
      // Gravação: só repete se a conexão nem abriu ou a Omie recusou (429). Qualquer outra falha = estado desconhecido.
      if (gravacao && !conexaoNaoAbriu(e) && !recusou) {
        contar(rotulo, call, prioridade, 'incerto', ms);
        const oQue = (e as Error)?.name === 'AbortError' ? `sem resposta em ${Math.round(timeoutMs / 1000)}s` : (e as Error)?.message || 'falha de rede';
        throw new OmieIncertoError(`Gravação na Omie sem resposta clara ${onde}: ${oQue}. Pode ter sido feita — confira antes de refazer.`, rotulo, call);
      }
      contar(rotulo, call, prioridade, 'erro', ms);
      if (tentativa < tentativas) { await dormir(Math.min((recusou ? 15000 : 3000) * (tentativa + 1), maxEspera)); continue; }
      throw e;
    }
    devolver();
    const ms = Date.now() - t0;

    // A Omie tem dois formatos de erro: {faultstring} e {status:'error', message}.
    const fault = data.faultstring
      ? String(data.faultstring)
      : data.status === 'error' ? String(data.message || 'erro Omie sem mensagem') : '';

    if (!fault) {
      const s = estado();
      s.bloqueios.delete(`${chave}|${call}`);
      contar(rotulo, call, prioridade, 'ok', ms);
      return data as T;
    }

    if (ehChaveRecusada(fault)) {
      armarBloqueio(chave, '*', LIMITES.pausaChaveRecusadaMs, fault);
      contar(rotulo, call, prioridade, 'bloqueio', ms);
      const e = new OmieChaveRecusadaError(`Omie API: ${fault}`, rotulo, call, Math.round(LIMITES.pausaChaveRecusadaMs / 1000));
      e.faultstring = fault;
      throw e;
    }
    if (ehBloqueio(fault)) {
      const seg = segundosDoBloqueio(fault);
      armarBloqueio(chave, call, (seg + 15) * 1000, fault);
      contar(rotulo, call, prioridade, 'bloqueio', ms);
      const e = new OmieBloqueioError(`Omie API: ${fault}`, rotulo, call, seg);
      e.faultstring = fault;
      throw e;
    }
    const repetivel = ehLimiteVelocidade(fault) || (!gravacao && (ehConcorrencia(fault) || ehEngasgo(fault)));
    if (repetivel && tentativa < tentativas) {
      contar(rotulo, call, prioridade, 'erro', ms);
      // Se a Omie disse quanto esperar ("Aguarde N segundos"), espera isso + 1 s.
      await dormir(Math.min(Math.max(5000 * (tentativa + 1), (segundosParaAguardar(fault) + 1) * 1000), maxEspera));
      continue;
    }
    if (gravacao && (ehConcorrencia(fault) || ehEngasgo(fault))) {
      contar(rotulo, call, prioridade, 'incerto', ms);
      throw new OmieIncertoError(`Gravação na Omie sem resposta clara ${onde}: ${fault}. Pode ter sido feita — confira antes de refazer.`, rotulo, call);
    }

    // Esgotou as repetições de um erro transitório: é falha, nunca "resposta" (senão um
    // sync leria o JSON com erro como fim da lista).
    if (repetivel) {
      contar(rotulo, call, prioridade, 'erro', ms);
      throw new OmieFaultError(`Omie API (depois de ${tentativa + 1} tentativas): ${fault}`, fault, rotulo, call);
    }
    // Erro de negócio (cadastro inválido, "não existem registros"…): a Omie respondeu
    // normalmente, então não conta como falha da porta.
    contar(rotulo, call, prioridade, 'ok', ms);
    if (!lancarFault) return data as T;
    throw new OmieFaultError(`Omie API: ${fault}`, fault, rotulo, call);
  }
}

// ── Painel ─────────────────────────────────────────────────────────────────────

export interface EstadoPorta {
  fila: Record<Prioridade, number>;
  emVoo: Array<{ conta: string; chamadas: number }>;
  bloqueios: Array<{ conta: string; metodo: string; ate: string; motivo: string }>;
  ultimoMinuto: Array<{ conta: string; metodo: string; prioridade: Prioridade } & Contador>;
  ultimaHora: Array<{ conta: string; prioridade: Prioridade } & Contador>;
  limites: typeof LIMITES;
}

export function estadoPorta(): EstadoPorta {
  const s = estado();
  const agora = Date.now();
  const rot = (k: string) => s.rotulos.get(k) ?? k;
  const fila: Record<Prioridade, number> = { pessoa: 0, rapido: 0, pesado: 0 };
  for (const e of s.fila) fila[(Object.keys(PESO) as Prioridade[]).find((p) => PESO[p] === e.peso) ?? 'pessoa']++;

  const bloqueios = [...s.bloqueios.entries()]
    .filter(([, b]) => b.ate > agora)
    .map(([k, b]) => { const [c, m] = k.split('|'); return { conta: rot(c), metodo: m === '*' ? '(chave inteira)' : m, ate: new Date(b.ate).toISOString(), motivo: b.motivo }; });

  const minuto = Math.floor(agora / 60_000);
  const ultimoMinuto: EstadoPorta['ultimoMinuto'] = [];
  for (const mm of [minuto - 1, minuto]) {
    for (const [k, c] of s.minutos.get(mm) ?? []) {
      const [conta, metodo, prioridade] = k.split('|') as [string, string, Prioridade];
      ultimoMinuto.push({ conta, metodo, prioridade, ...c });
    }
  }
  const hora = new Map<string, Contador>();
  for (const [mm, m] of s.minutos) {
    if (mm < minuto - 60) continue;
    for (const [k, c] of m) {
      const [conta, , prioridade] = k.split('|');
      const kk = `${conta}|${prioridade}`;
      const t = hora.get(kk) ?? { ok: 0, erro: 0, bloqueio: 0, incerto: 0, ms: 0 };
      t.ok += c.ok; t.erro += c.erro; t.bloqueio += c.bloqueio; t.incerto += c.incerto; t.ms += c.ms;
      hora.set(kk, t);
    }
  }
  return {
    fila,
    emVoo: [...s.emVoo.entries()].filter(([, n]) => n > 0).map(([k, n]) => ({ conta: rot(k), chamadas: n })),
    bloqueios,
    ultimoMinuto,
    ultimaHora: [...hora.entries()].map(([k, c]) => { const [conta, prioridade] = k.split('|') as [string, Prioridade]; return { conta, prioridade, ...c }; }),
    limites: LIMITES,
  };
}
