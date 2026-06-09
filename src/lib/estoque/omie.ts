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

  let ultimaFault: string | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) await sleep(2000 * attempt);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as OmieResponse;
      const fs = data.faultstring;
      if (fs) {
        ultimaFault = fs;
        const matchSegundos = fs.match(/(\d+)\s*segundos/i);
        const ehBloqueio =
          fs.includes('consumo indevido') || fs.includes('API bloqueada') || fs.includes('Too Many Requests');
        if (ehBloqueio && matchSegundos) {
          const segundos = parseInt(matchSegundos[1], 10);
          await sleep(Math.min((segundos + 10) * 1000, maxWait));
          continue;
        }
        if (ehBloqueio) {
          await sleep(Math.min(60_000, maxWait));
          continue;
        }
        if (fs.includes('limite') || fs.includes('Too many requests') || fs.includes('REDUNDANT')) {
          await sleep(Math.min(5000 * (attempt + 1), maxWait));
          continue;
        }
      }
      return data as T;
    } catch (e) {
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
