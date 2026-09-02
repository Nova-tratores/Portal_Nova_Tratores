// Cliente Omie multi-conta do módulo Estoque.
// Portado de omieRequest (server.js:164-211) — detecção de bloqueio
// ("consumo indevido"/"API bloqueada"), backoff exponencial e cap de espera.
//
// IMPORTANTE: NÃO reusar src/lib/pos/omie.ts (single-account, só trata 429).
// Aqui a conta é passada EXPLICITAMENTE (em vez de getCurrentContaOrDefault()).

import { getCredentials, type Conta, CONTA_DEFAULT } from './conta';
import { sleep } from './utils';

const OMIE_BASE = 'https://app.omie.com.br/api/v1';

// Cap de espera para chamadas de UI: nunca segurar uma request HTTP do usuário
// por minutos quando a Omie está bloqueada. Loops de background passam um
// maxWait/retries maior.
const OMIE_MAX_WAIT_MS = 30_000;
const OMIE_DEFAULT_RETRIES = 1;

// ── Rate limiter GLOBAL (token-bucket simplão) ────────────────────────────────
// A Omie limita por IP+AppKey+Método: 4 req/s por método, 960/min por IP. Como a
// chave é compartilhada por TODOS os syncs + ações manuais na mesma instância
// Railway, um portão global de vazão evita rajadas concorrentes que a Omie pune.
// ~3 req/s (folga sob o teto de 4/s). Reserva de slot é atômica (JS single-thread).
const OMIE_MIN_GAP_MS = 300;
let proximoSlot = 0;
async function aguardarSlotGlobal(): Promise<void> {
  const agora = Date.now();
  const inicio = Math.max(agora, proximoSlot);
  proximoSlot = inicio + OMIE_MIN_GAP_MS;
  const espera = inicio - agora;
  if (espera > 0) await sleep(espera);
}

// ── Circuit breaker por conta+método ──────────────────────────────────────────
// Ao receber "API bloqueada por consumo indevido", a Omie penaliza por ~30 min e
// CADA nova chamada durante o bloqueio PRORROGA a penalidade. Então: NÃO reenviar.
// Marcamos o método bloqueado até o horário indicado e falhamos rápido as próximas
// chamadas (sem tocar a Omie) — protege syncs E ações manuais que dividem a chave.
const bloqueios = new Map<string, number>(); // `${conta}|${call}` → epoch ms até quando bloqueado
const chaveBloqueio = (conta: Conta, call: string) => `${conta}|${call}`;

/** ms restantes de bloqueio para (conta, método); 0 = livre. */
export function omieBloqueioRestanteMs(conta: Conta, call: string): number {
  const ate = bloqueios.get(chaveBloqueio(conta, call)) ?? 0;
  const rest = ate - Date.now();
  return rest > 0 ? rest : 0;
}

export class OmieBloqueioError extends Error {
  readonly bloqueio = true;
  constructor(message: string, readonly conta: Conta, readonly call: string, readonly aguardarSegundos: number) {
    super(message);
    this.name = 'OmieBloqueioError';
  }
}

export interface OmieRequestOpts {
  conta?: Conta;
  retries?: number;
  maxWaitMs?: number;
}

/** Resposta crua da Omie (pode conter faultstring de erro de negócio). */
export type OmieResponse = Record<string, unknown> & { faultstring?: string; faultcode?: string };

export async function omieRequest<T = OmieResponse>(
  endpoint: string,
  call: string,
  params: Record<string, unknown>,
  opts: OmieRequestOpts = {},
): Promise<T> {
  const conta = opts.conta ?? CONTA_DEFAULT;
  const retries = opts.retries ?? OMIE_DEFAULT_RETRIES;
  const maxWait = opts.maxWaitMs ?? OMIE_MAX_WAIT_MS;
  const { appKey, appSecret } = getCredentials(conta);
  const url = endpoint.startsWith('http') ? endpoint : OMIE_BASE + endpoint;
  const body = { app_key: appKey, app_secret: appSecret, call, param: [params] };

  // Circuit breaker: se este método/conta está em bloqueio conhecido, falha rápido
  // sem chamar a Omie (não alimenta o contador de erros que prorroga a penalidade).
  const restanteMs = omieBloqueioRestanteMs(conta, call);
  if (restanteMs > 0) {
    const seg = Math.ceil(restanteMs / 1000);
    throw new OmieBloqueioError(`Omie bloqueada [${conta}/${call}] — aguardando ~${seg}s (circuit breaker)`, conta, call, seg);
  }

  let ultimaFault: string | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) await sleep(2000 * attempt);
      await aguardarSlotGlobal();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as OmieResponse;
      const fs = data.faultstring;
      if (fs) {
        ultimaFault = fs;
        // BLOQUEIO por consumo indevido: ABORTA (não retenta) + arma o circuit breaker.
        if (fs.includes('consumo indevido') || fs.includes('API bloqueada')) {
          const mSeg = fs.match(/(\d+)\s*segundos?/i);
          const mMin = fs.match(/(\d+)\s*minutos?/i);
          const segundos = mSeg ? parseInt(mSeg[1], 10) : mMin ? parseInt(mMin[1], 10) * 60 : 1800;
          bloqueios.set(chaveBloqueio(conta, call), Date.now() + (segundos + 15) * 1000);
          throw new OmieBloqueioError(`Omie API: ${fs}`, conta, call, segundos);
        }
        // Transitórios (rate soft / redundante): backoff curto e retenta.
        if (/too many requests|\blimite\b|redundant/i.test(fs)) {
          await sleep(Math.min(5000 * (attempt + 1), maxWait));
          continue;
        }
      }
      // Sucesso (ou erro de negócio): limpa bloqueio residual deste método.
      if (bloqueios.has(chaveBloqueio(conta, call))) bloqueios.delete(chaveBloqueio(conta, call));
      return data as T;
    } catch (e) {
      if (e instanceof OmieBloqueioError) throw e; // não retenta bloqueio
      if (attempt === retries) throw e;
      await sleep(2000 * (attempt + 1));
    }
  }
  throw new Error(
    `omieRequest ${call} [${conta}] esgotou ${retries} retries (última faultstring: ${ultimaFault ?? 'desconhecida'})`,
  );
}

// --- Endpoints de produto/estoque usados pelo piloto ---

export interface OmieProduto extends OmieResponse {
  codigo_produto: number;
  codigo: string;
  descricao: string;
  descricao_familia?: string;
  marca?: string;
  valor_unitario?: number;
  ncm?: string;
  ean?: string;
  unidade?: string;
  tipoItem?: string;
  peso_bruto?: number;
  peso_liq?: number;
  altura?: number;
  largura?: number;
  profundidade?: number;
  obs_internas?: string;
}

export interface OmieEstoque extends OmieResponse {
  cmc?: number;
  saldo?: number;
  fisico?: number;
  pendente?: number;
  reservado?: number;
  estoque_minimo?: number;
}

export function consultarProduto(codigo: string, conta?: Conta): Promise<OmieProduto> {
  return omieRequest<OmieProduto>('/geral/produtos/', 'ConsultarProduto', { codigo }, { conta });
}

export function consultarEstoque(idProd: number, conta?: Conta): Promise<OmieEstoque> {
  return omieRequest<OmieEstoque>(
    '/estoque/consulta/',
    'PosicaoEstoque',
    { id_prod: idProd, codigo_local_estoque: 0, cod_int: '' },
    { conta },
  );
}

/** Posição de estoque numa data específica (usado pelo histórico de CMC). */
export function consultarEstoqueNaData(idProd: number, data: string, conta?: Conta): Promise<OmieEstoque> {
  return omieRequest<OmieEstoque>(
    '/estoque/consulta/',
    'PosicaoEstoque',
    { id_prod: idProd, codigo_local_estoque: 0, data },
    { conta },
  );
}

export interface OmieCaracteristica {
  cNomeCaract: string;
  cConteudo: string;
}

export async function listarCaractProduto(nCodProd: number, conta?: Conta): Promise<OmieCaracteristica[]> {
  try {
    const r = await omieRequest<{ listaCaracteristicas?: OmieCaracteristica[] }>(
      '/geral/prodcaract/',
      'ListarCaractProduto',
      { nPagina: 1, nRegPorPagina: 50, nCodProd },
      { conta },
    );
    return r.listaCaracteristicas || [];
  } catch {
    return [];
  }
}

export function getTipoProduto(caracteristicas: OmieCaracteristica[]): string | null {
  if (!Array.isArray(caracteristicas)) return null;
  const tipoCaract = caracteristicas.find(
    (c) => c.cNomeCaract && c.cNomeCaract.trim().toLowerCase().replace(':', '') === 'tipo',
  );
  return tipoCaract ? tipoCaract.cConteudo : null;
}
