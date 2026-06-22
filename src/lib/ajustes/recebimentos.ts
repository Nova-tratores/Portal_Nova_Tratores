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

// conta_omie nas tabelas recebimento_* e MINUSCULO ('nova'/'castro'); a Conta do
// modulo /ajustes e MAIUSCULA. Esta ponte e obrigatoria p/ casar com recebimento_meta.
function contaLow(c: Conta): string {
  return String(c).toLowerCase();
}

/** Grava log interno (Supabase) de uma acao desta tela. Best-effort, nao bloqueia. */
export function logEntradaReceb(row: {
  conta: Conta;
  idReceb?: number | string | null;
  numeroNFe?: string | null;
  tipo?: string | null;
  acao: 'dar_entrada' | 'correcao_cmc';
  userId?: string | null;
  userNome?: string | null;
  payload?: any;
  resultado?: any;
}): void {
  supabase
    .from('recebimento_entrada_log')
    .insert({
      conta_omie: contaLow(row.conta),
      id_receb: row.idReceb != null && row.idReceb !== '' ? Number(row.idReceb) || null : null,
      numero_nfe: row.numeroNFe ?? null,
      tipo: row.tipo ?? null,
      acao: row.acao,
      user_id: row.userId ?? null,
      user_nome: row.userNome ?? null,
      payload: row.payload ?? null,
      resultado: row.resultado ?? null,
    })
    .then(({ error }: any) => {
      if (error) console.warn('[receb] recebimento_entrada_log:', error.message);
    });
}

/**
 * Transferencia: grava o responsavel (usuario real do Portal) de um recebimento
 * em recebimento_meta (upsert por conta_omie,id_receb). userId null = desatribui.
 */
export async function setResponsavelReceb(
  conta: Conta,
  idReceb: number,
  userId: string | null,
  userNome: string | null,
): Promise<void> {
  if (!idReceb || !Number.isFinite(idReceb)) throw new Error('idReceb invalido');
  const { error } = await supabase
    .from('recebimento_meta')
    .upsert(
      {
        conta_omie: contaLow(conta),
        id_receb: idReceb,
        responsavel_user_id: userId,
        responsavel: userNome,
      },
      { onConflict: 'conta_omie,id_receb' },
    );
  if (error) throw new Error(error.message);
}

/**
 * Enriquece (uncached) cada recebimento com o responsavel resolvido:
 *  - atribuicao manual (recebimento_meta.responsavel_user_id), se houver;
 *  - senao o padrao do mapa tipo->usuario (recebimento_tipo_responsavel).
 * Marca responsavelAutomatico = true quando veio do mapa por tipo.
 */
export async function enriquecerResponsaveis(conta: Conta, recebimentos: any[]): Promise<void> {
  if (!Array.isArray(recebimentos) || recebimentos.length === 0) return;
  const low = contaLow(conta);

  // mapa padrao tipo -> { userId, nome }
  const mapaTipo: Record<string, { userId: string | null; nome: string | null }> = {};
  {
    const { data } = await supabase
      .from('recebimento_tipo_responsavel')
      .select('tipo,responsavel_user_id,responsavel_nome')
      .eq('conta_omie', low);
    (data || []).forEach((m: any) => {
      mapaTipo[m.tipo] = { userId: m.responsavel_user_id || null, nome: m.responsavel_nome || null };
    });
  }

  // atribuicoes manuais por id_receb
  const ids = recebimentos.map((r) => Number(r.idReceb)).filter((n) => Number.isFinite(n) && n > 0);
  const manual: Record<number, { userId: string | null; nome: string | null }> = {};
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase
      .from('recebimento_meta')
      .select('id_receb,responsavel_user_id,responsavel')
      .eq('conta_omie', low)
      .in('id_receb', ids.slice(i, i + 300));
    (data || []).forEach((m: any) => {
      if (m.responsavel_user_id) manual[m.id_receb] = { userId: m.responsavel_user_id, nome: m.responsavel || null };
    });
  }

  for (const r of recebimentos) {
    const id = Number(r.idReceb);
    const m = Number.isFinite(id) ? manual[id] : undefined;
    if (m && m.userId) {
      r.responsavelUserId = m.userId;
      r.responsavelNome = m.nome;
      r.responsavelAutomatico = false;
    } else {
      const padrao = (r.tipo && mapaTipo[r.tipo]) || null;
      r.responsavelUserId = padrao ? padrao.userId : null;
      r.responsavelNome = padrao ? padrao.nome : null;
      r.responsavelAutomatico = !!(padrao && padrao.userId);
    }
  }
}

/** Flags de "custo de estoque" do recebimento (env RECEBIMENTO_CUSTO_ESTOQUE). */
export function montarCustoEstoque(): Record<string, 'S' | 'N'> {
  const lista = String(process.env.RECEBIMENTO_CUSTO_ESTOQUE || 'ICMS,ICMS_ST,IPI,PIS,COFINS')
    .toUpperCase()
    .split(/[,\s]+/)
    .filter(Boolean);
  const has = (k: string): 'S' | 'N' => (lista.includes(k) ? 'S' : 'N');
  // OBS: 'OUTRAS' nao tem tag valida no itensCustoEstoque do Omie
  // (cOutrasDespCusto e' rejeitada). Opcoes validas: ICMS, ICMS_ST, IPI, PIS, COFINS, FRETE, SEGURO.
  return {
    cIcmsCusto: has('ICMS'),
    cIcmsStCusto: has('ICMS_ST'),
    cIpiCusto: has('IPI'),
    cPisCusto: has('PIS'),
    cCofinsCusto: has('COFINS'),
    cFreteCusto: has('FRETE'),
    cSeguroCusto: has('SEGURO'),
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
  userId?: string | null;   // financeiro_usu.id de quem deu entrada (log interno)
  userNome?: string | null;
  tipo?: string | null;     // tipo do recebimento (log interno)
  numeroNFe?: string | null;
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

  // log interno nosso (Supabase) da entrada
  logEntradaReceb({
    conta,
    idReceb,
    numeroNFe: b.numeroNFe ?? null,
    tipo: b.tipo ?? null,
    acao: 'dar_entrada',
    userId: b.userId ?? null,
    userNome: b.userNome ?? b.criadoPor ?? null,
    payload: {
      chaveNFe,
      naoGerarFinanceiro: b.naoGerarFinanceiro,
      naoGerarMovEstoque: b.naoGerarMovEstoque,
      cfops: itensIn.map((i) => ({ s: i.nSequencia, c: i.cfopEntrada })),
    },
    resultado: { idReceb: r.idReceb, descStatus: r.descStatus, ajustado: !!alterado },
  });

  return { ok: true, idReceb: r.idReceb, descStatus: r.descStatus, ajustado: !!alterado };
}
