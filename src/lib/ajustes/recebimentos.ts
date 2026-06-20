/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Recebimentos de NF-e pendentes (impacto no CMC) + dar entrada (concluir).
// Portado de server.js (obterRecebimentosPendentes, /api/dar-entrada-recebimento).
//
// NOTA: a sugestão automática de categoria/departamento (sugerirCatDeptoRecebimento)
// depende da infra de categorias/contas — fica para a Fase 3. Aqui o "dar entrada"
// aceita codCategoria/codDepartamento opcionais vindos do front, mas não sugere.
// ============================================================================

import type { Conta } from './conta';
import { supabase } from './supabase';
import * as cache from './cache';
import { getConfig } from './config';
import { analisarRecebimentosPendentes } from './analise';
import { alterarRecebimentoItens, concluirRecebimento } from './omie';

/** Flags de "custo de estoque" do recebimento (env RECEBIMENTO_CUSTO_ESTOQUE). */
export function montarCustoEstoque(): Record<string, 'S' | 'N'> {
  const lista = String(process.env.RECEBIMENTO_CUSTO_ESTOQUE || 'ICMS,ICMS_ST,IPI,PIS,COFINS')
    .toUpperCase()
    .split(/[,\s]+/)
    .filter(Boolean);
  const has = (k: string): 'S' | 'N' => (lista.includes(k) ? 'S' : 'N');
  return {
    cIcmsCusto: has('ICMS'),
    cIcmsStCusto: has('ICMS_ST'),
    cIpiCusto: has('IPI'),
    cPisCusto: has('PIS'),
    cCofinsCusto: has('COFINS'),
    cFreteCusto: has('FRETE'),
    cSeguroCusto: has('SEGURO'),
    cOutrasDespCusto: has('OUTRAS'),
  };
}

/** Recebimentos pendentes (com cache) + projeção de impacto no CMC. */
export async function obterRecebimentosPendentes(
  conta: Conta,
  dataDeBR: string,
  dataAteBR: string,
  force = false,
  ttlSeg?: number,
): Promise<any> {
  const chave = `pendentes:${conta}:${dataDeBR}:${dataAteBR}`;
  if (!force) {
    const hit = cache.get<any>(chave);
    if (hit) return { ...hit.valor, fonte: 'cache', cachedEm: hit.gravadoEm };
  }
  const payload = await analisarRecebimentosPendentes(conta, {
    dataDeBR,
    dataAteBR,
    onProgress: (m: string) => console.log(`[pendentes ${conta}] ${m}`),
  });
  cache.set(chave, payload, ttlSeg || getConfig().cacheTtlSeg);
  return { ...payload, fonte: 'omie' };
}

export interface DarEntradaArgs {
  conta: Conta;
  idReceb?: number | string | null;
  chaveNFe?: string | null;
  itens?: Array<{ nSequencia: number | string; cAcao?: string; cfopEntrada?: string }>;
  naoGerarFinanceiro?: boolean;
  naoGerarMovEstoque?: boolean;
  codCategoria?: string | null;
  codDepartamento?: string | null;
  criadoPor?: string;
}

/**
 * Dá entrada (conclui) um recebimento de NF-e. SEMPRE chama AlterarRecebimento
 * quando há itens (para forçar nosso set de "custo de estoque"), depois ConcluirRecebimento.
 * Portado de /api/dar-entrada-recebimento (server.js:1491).
 */
export async function darEntradaRecebimento(b: DarEntradaArgs): Promise<any> {
  const conta = b.conta;
  const idReceb = b.idReceb ?? null;
  const chaveNFe = b.chaveNFe ?? null;
  if (idReceb == null && !chaveNFe) throw new Error('informe idReceb ou chaveNFe');

  let alterado: any = null;
  const itensIn = Array.isArray(b.itens) ? b.itens : [];
  const custoEstoque = montarCustoEstoque();
  const codCategoria = b.codCategoria != null ? String(b.codCategoria) : null;
  const codDepartamento = b.codDepartamento != null ? String(b.codDepartamento) : null;

  if (itensIn.length > 0) {
    const itensEditar = itensIn.map((it) => ({
      nSequencia: it.nSequencia,
      cAcao: it.cAcao || 'EDITAR',
      cCFOPEntrada: it.cfopEntrada || undefined,
      cNaoGerarFinanceiro: b.naoGerarFinanceiro != null ? (b.naoGerarFinanceiro ? 'S' : 'N') : undefined,
      cNaoGerarMovEstoque: b.naoGerarMovEstoque != null ? (b.naoGerarMovEstoque ? 'S' : 'N') : undefined,
      cCodCategoria: codCategoria || undefined,
      cCodDepartamento: codDepartamento || undefined,
      custoEstoque,
    }));
    alterado = await alterarRecebimentoItens(conta, { idReceb, chaveNFe, itens: itensEditar });
  }

  const r = await concluirRecebimento(conta, { idReceb, chaveNFe });
  cache.invalidatePrefix(`analise:${conta}:`);
  cache.invalidatePrefix(`pendentes:${conta}:`);

  supabase
    .from('cmc_sync_log')
    .insert({
      conta_omie: conta,
      fim: new Date().toISOString(),
      status: 'recebimento_concluido',
      parametros: {
        idReceb,
        chaveNFe,
        naoGerarFinanceiro: b.naoGerarFinanceiro,
        naoGerarMovEstoque: b.naoGerarMovEstoque,
        cfops: itensIn.map((i) => ({ s: i.nSequencia, c: i.cfopEntrada })),
        respAlterar: alterado,
        respConcluir: r.rawResponse,
      },
    })
    .then(({ error }: any) => {
      if (error) console.warn('[cmc] cmc_sync_log:', error.message);
    });

  return { ok: true, idReceb: r.idReceb, descStatus: r.descStatus, ajustado: !!alterado };
}
