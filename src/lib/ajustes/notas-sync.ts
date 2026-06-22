/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Sync das notas fiscais de SAÍDA do Omie -> Supabase (portal_nt_notas_saida).
// Espelha NF-e de produto (ListarNF tpNF=1) + NFS-e de serviço (ListarNFSEs)
// para que a busca por cliente/numero seja instantanea (le do Supabase).
//
//  - backfill:    janela ampla (default desde 2010) -> popula todo o historico.
//  - incremental: janela movel curta (default ultimos 90 dias) -> pega notas
//                 novas e mudancas de status (cancelamento) recentes.
//
// Cada pagina do Omie e' upsertada na hora (nao acumula tudo em memoria).
// PDF continua sob demanda no Omie (nCodNF) - aqui so guardamos os metadados.
// ============================================================================

import type { Conta } from './conta';
import { getContasOmie } from './conta';
import { paginarOmie, normalizarNFSaida, normalizarNFSe } from './omie';
import { fmtBR, hoje, addDias } from './dates';
import { supabase } from './supabase';

const TABELA = 'portal_nt_notas_saida';

// Omie devolve data como "DD/MM/YYYY" (as vezes com hora) -> "YYYY-MM-DD".
function toISODate(br: any): string | null {
  if (!br) return null;
  const m = String(br).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function linhaNota(conta: Conta, tipo: 'produto' | 'servico', n: any, agoraISO: string): any | null {
  if (n == null || n.nCodNF == null || n.nCodNF === '') return null; // sem PK -> ignora
  const nCod = Number(n.nCodNF);
  if (!Number.isFinite(nCod)) return null;
  const numStr = n.numero != null ? String(n.numero) : null;
  const numInt = numStr ? (parseInt(numStr.replace(/\D/g, ''), 10) || null) : null;
  return {
    conta_omie: conta,
    tipo,
    n_cod_nf: nCod,
    numero: numStr,
    numero_int: numInt,
    serie: n.serie != null ? String(n.serie) : null,
    chave_nfe: n.chaveNFe || null,
    data_emissao: toISODate(n.dataEmissao),
    valor_nf: Number(n.valorNF) || 0,
    cancelada: !!n.cancelada,
    cliente_codigo: n.clienteCodigo != null ? (Number(n.clienteCodigo) || null) : null,
    cliente_nome: n.clienteNome || null,
    cliente_doc: n.clienteDoc ? String(n.clienteDoc).replace(/\D/g, '') : null,
    qtde_itens: Array.isArray(n.itens) ? n.itens.length : 0,
    updated_at: agoraISO,
  };
}

// Upserta uma pagina ja normalizada (dedup por n_cod_nf p/ nao conflitar no lote).
async function upsertPagina(linhas: any[]): Promise<number> {
  const validas = linhas.filter(Boolean);
  if (!validas.length) return 0;
  const porChave = new Map<string, any>();
  for (const l of validas) porChave.set(`${l.tipo}:${l.n_cod_nf}`, l);
  const lote = [...porChave.values()];
  const { error } = await supabase.from(TABELA).upsert(lote, { onConflict: 'conta_omie,tipo,n_cod_nf' });
  if (error) throw new Error(`upsert ${TABELA}: ${error.message}`);
  return lote.length;
}

export interface SyncNotasOpts {
  modo?: 'backfill' | 'incremental';
  desdeBR?: string; // DD/MM/YYYY (sobrescreve a janela)
  ateBR?: string;
  onProgress?: (m: string) => void;
}

/** Sincroniza NF-e + NFS-e de UMA conta para o Supabase. Retorna contadores.
 *  NF-e e NFS-e rodam isolados: uma falha de rede num NAO impede o outro
 *  (os erros vao em `erros[]`), pra um blip nao deixar buraco no espelho. */
export async function syncNotasSaida(conta: Conta, opts: SyncNotasOpts = {}): Promise<{ conta: Conta; produto: number; servico: number; total: number; erros: string[] }> {
  const modo = opts.modo || 'incremental';
  const ateBR = opts.ateBR || fmtBR(hoje());
  const desdeBR = opts.desdeBR || (modo === 'backfill' ? '01/01/2010' : fmtBR(addDias(hoje(), -90)));
  const agoraISO = new Date().toISOString();
  const log = opts.onProgress || (() => {});
  const erros: string[] = [];
  log(`[${conta}] sync ${modo} ${desdeBR} -> ${ateBR}`);

  // 1. NF-e de produto (/produtos/nfconsultar/ ListarNF tpNF=1)
  let produto = 0;
  try {
    await paginarOmie('/produtos/nfconsultar/', 'ListarNF', {
      tpNF: 1, apenas_importado_api: 'N', dEmiInicial: desdeBR, dEmiFinal: ateBR,
    }, conta, {
      paginaKey: 'pagina', regKey: 'registros_por_pagina', regValue: 100,
      totalKeys: ['total_de_paginas', 'nTotPaginas', 'nTotalPaginas'],
      listaKeys: ['nfCadastro', 'nf_cadastro', 'nota_fiscal', 'lista', 'cadastros'],
      debugTag: 'ListarNF',
      onPagina: async (lista: any[], pag: number, tot: number) => {
        const linhas = lista.map((nf) => linhaNota(conta, 'produto', normalizarNFSaida(nf), agoraISO));
        produto += await upsertPagina(linhas);
        log(`[${conta}] NF-e pag ${pag}/${tot || '?'} -> ${produto} acumulado`);
      },
    });
  } catch (e: any) {
    erros.push(`NF-e: ${e.faultstring || e.message}`);
    log(`[${conta}] NF-e FALHOU: ${e.faultstring || e.message}`);
  }

  // 2. NFS-e de servico (/servicos/nfse/ ListarNFSEs)
  let servico = 0;
  try {
    await paginarOmie('/servicos/nfse/', 'ListarNFSEs', {
      dEmiInicial: desdeBR, dEmiFinal: ateBR,
    }, conta, {
      paginaKey: 'nPagina', regKey: 'nRegPorPagina', regValue: 100,
      totalKeys: ['nTotPaginas', 'total_de_paginas', 'nTotalPaginas'],
      listaKeys: ['nfseEncontradas', 'nfseLista', 'nfse_encontradas', 'lista', 'cadastros'],
      debugTag: 'ListarNFSEs',
      onPagina: async (lista: any[], pag: number, tot: number) => {
        const linhas = lista.map((nf) => linhaNota(conta, 'servico', normalizarNFSe(nf), agoraISO));
        servico += await upsertPagina(linhas);
        log(`[${conta}] NFS-e pag ${pag}/${tot || '?'} -> ${servico} acumulado`);
      },
    });
  } catch (e: any) {
    erros.push(`NFS-e: ${e.faultstring || e.message}`);
    log(`[${conta}] NFS-e FALHOU: ${e.faultstring || e.message}`);
  }

  // 3. Atualiza controle de sync (so marca ultimo_backfill se NAO houve erro)
  const { count } = await supabase.from(TABELA).select('*', { count: 'exact', head: true }).eq('conta_omie', conta);
  const patch: any = { conta_omie: conta, ultimo_sync: agoraISO, total_notas: count ?? null, updated_at: agoraISO };
  if (modo === 'backfill' && erros.length === 0) patch.ultimo_backfill = agoraISO;
  await supabase.from('portal_nt_notas_saida_sync').upsert(patch, { onConflict: 'conta_omie' });

  log(`[${conta}] concluido: ${produto} NF-e + ${servico} NFS-e${erros.length ? ` (com ${erros.length} erro(s))` : ''}`);
  return { conta, produto, servico, total: produto + servico, erros };
}

/** Sincroniza todas as contas (NOVA + CASTRO). */
export async function syncNotasTodasContas(opts: SyncNotasOpts = {}): Promise<any[]> {
  const out: any[] = [];
  for (const c of getContasOmie()) {
    try {
      out.push(await syncNotasSaida(c.id, opts));
    } catch (e: any) {
      out.push({ conta: c.id, erro: e.faultstring || e.message });
    }
  }
  return out;
}
