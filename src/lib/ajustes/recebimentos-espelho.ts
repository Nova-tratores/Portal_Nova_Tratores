/* eslint-disable @typescript-eslint/no-explicit-any */
// Lista da tela única /estoque/recebimentos, lida do ESPELHO recebimentos_nfe
// (atualizado a cada 10 min pelo sync rápido das notas dos últimos 45 dias e à
// noite pelo sync completo). Nada aqui chama a Omie — só `atualizarDaOmie`.
//
// conta_omie no espelho e em recebimento_meta é MINÚSCULA.

import type { Conta } from './conta';
import { supabase } from './supabase';
import { getConfig } from './config';
import { enriquecerResponsaveis } from './recebimentos';
import { prepararRecebimento, recebimentoDoEspelho, semZerosEsq } from './recebimento-regras';
import { paginar, emLotes } from '@/lib/db/paginar';
import { sincronizarRecebimentosRecentes } from '@/lib/estoque/recebimentos';

const COLS =
  'id_receb,chave_nfe,numero_nfe,serie_nfe,emissao_nfe,etapa,status,id_fornecedor,fornecedor,fornecedor_razao,fornecedor_cnpj,total_nfe,maquinas,produtos,conta_omie,natureza:dados_raw->cabec->>cNaturezaOperacao';

// Tela única /estoque/recebimentos: quem tinha "Recebimentos" ou "Recebimentos (Omie)" entra.
export const ACESSO_RECEBIMENTOS = [
  { modulo: 'estoque', acao: 'recebimentos' },
  { modulo: 'ajustes', acao: 'recebimentos' },
  { modulo: 'estoque', acao: 'recebimentos-omie' },
];

export type StatusLista = 'pendentes' | 'concluidos';

async function linhasComRecebidoEm(q: (cols: string) => any): Promise<{ data: any[]; error: any }> {
  // recebido_em vem da migration pecas-alocacao-pendencias (aplicada); se faltar, lê sem.
  const r = await q(COLS + ',recebido_em');
  if (r.error && /recebido_em/.test(r.error.message || '')) return q(COLS);
  return r;
}

/** Monta as notas da lista (sinal, tipo, responsável) a partir das linhas do espelho. */
async function montar(conta: Conta, linhas: any[]): Promise<any[]> {
  const low = conta.toLowerCase();
  const ids = linhas.map((l) => Number(l.id_receb)).filter(Number.isFinite);
  const { data: metas } = await emLotes(ids, (pedaco) =>
    supabase.from('recebimento_meta').select('id_receb,tipo,tipo_manual').eq('conta_omie', low).in('id_receb', pedaco),
  );
  const tipoManual = new Map<number, string>();
  for (const m of (metas || []) as any[]) if (m.tipo_manual && m.tipo) tipoManual.set(Number(m.id_receb), m.tipo);
  const cfg = getConfig();
  const recs = linhas.map((l) => ({
    ...prepararRecebimento(recebimentoDoEspelho(l), cfg, tipoManual.get(Number(l.id_receb)) || null),
    recebidoEm: l.recebido_em || null,
  }));
  await enriquecerResponsaveis(conta, recs);
  return recs;
}

export async function listarRecebimentosEspelho(conta: Conta, status: StatusLista): Promise<{ recebimentos: any[]; atualizadoEm: string | null }> {
  const low = conta.toLowerCase();
  let linhas: any[];
  if (status === 'pendentes') {
    const { data, error } = await paginar((de, ate) =>
      linhasComRecebidoEm((cols) =>
        supabase.from('recebimentos_nfe').select(cols).eq('conta_omie', low).eq('status', 'Faturada').order('id_receb', { ascending: false }).range(de, ate),
      ),
    );
    if (error) throw new Error(error.message);
    linhas = data;
  } else {
    const r = await linhasComRecebidoEm((cols) =>
      supabase.from('recebimentos_nfe').select(cols).eq('conta_omie', low).eq('status', 'Recebida').order('id_receb', { ascending: false }).limit(300),
    );
    if (r.error) throw new Error(r.error.message);
    linhas = r.data || [];
  }
  const recebimentos = await montar(conta, linhas);
  return { recebimentos, atualizadoEm: await ultimaAtualizacao(low) };
}

/** Hora da última rodada do sync (rápido ou completo) que terminou bem. */
async function ultimaAtualizacao(low: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('cron_runs')
      .select('finalizado_em,job')
      .in('job', ['pecas-alocacao-rapido', 'estoque-sync-recebimentos'])
      .eq('status', 'ok')
      .order('finalizado_em', { ascending: false })
      .limit(1);
    void low;
    return (data && data[0] && (data[0] as any).finalizado_em) || null;
  } catch {
    return null;
  }
}

/**
 * "Não achei a nota": procura em QUALQUER situação (já recebida, cancelada…) pelo
 * número (sem zeros à esquerda) ou pela chave. Devolve a situação de cada uma.
 */
export async function procurarNoEspelho(conta: Conta, termo: string): Promise<any[]> {
  const low = conta.toLowerCase();
  const dig = String(termo || '').replace(/\D/g, '');
  if (!dig) return [];
  let q = supabase.from('recebimentos_nfe').select(COLS).eq('conta_omie', low).limit(50);
  if (dig.length === 44) q = q.eq('chave_nfe', dig);
  else q = q.like('numero_nfe', `%${semZerosEsq(dig)}`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const linhas = ((data || []) as any[]).filter((l) =>
    dig.length === 44 || semZerosEsq(String(l.numero_nfe || '').replace(/\D/g, '')) === semZerosEsq(dig),
  );
  const recs = await montar(conta, linhas);
  return recs.map((r, i) => ({ ...r, situacao: linhas[i].status || null }));
}

/** Relê na Omie as notas emitidas nos últimos 45 dias (~30 s por empresa). */
export async function atualizarDaOmie(conta: Conta) {
  return sincronizarRecebimentosRecentes(conta, 45);
}
