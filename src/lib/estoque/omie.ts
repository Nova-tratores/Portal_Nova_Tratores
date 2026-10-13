// Cliente Omie multi-conta do módulo Estoque.
// Desde 13/10/2026 é uma casca sobre a PORTA ÚNICA (src/lib/omie/porta.ts): freio,
// fila com prioridade, disjuntor de bloqueio e regra de gravação sem reenvio moram lá.
// Aqui fica só a assinatura antiga (conta NOVA/CASTRO explícita, devolve o JSON mesmo
// com faultstring de negócio) para não mexer nos ~30 arquivos que usam este cliente.

import { getCredentials, type Conta, CONTA_DEFAULT } from './conta';
import { omie, bloqueioRestanteMs, type Prioridade } from '@/lib/omie/porta';

export { OmieBloqueioError } from '@/lib/omie/porta';

// Cap de espera para chamadas de UI: nunca segurar uma request HTTP do usuário
// por minutos quando a Omie está bloqueada. Loops de background passam um
// maxWait/retries maior.
const OMIE_MAX_WAIT_MS = 30_000;
const OMIE_DEFAULT_RETRIES = 1;

/** ms restantes de bloqueio para (conta, método); 0 = livre. */
export function omieBloqueioRestanteMs(conta: Conta, call: string): number {
  try {
    return bloqueioRestanteMs(getCredentials(conta).appKey, call);
  } catch {
    return 0; // conta sem credencial: a chamada vai falhar com a mensagem certa
  }
}

export interface OmieRequestOpts {
  conta?: Conta;
  retries?: number;
  maxWaitMs?: number;
  prioridade?: Prioridade;
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
  const { appKey, appSecret } = getCredentials(conta);
  return omie<T>({ appKey, appSecret, rotulo: conta }, endpoint, call, params, {
    tentativas: opts.retries ?? OMIE_DEFAULT_RETRIES,
    maxEsperaMs: opts.maxWaitMs ?? OMIE_MAX_WAIT_MS,
    prioridade: opts.prioridade,
    lancarFault: false,
  });
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
