/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Notas fiscais de SAÍDA: NF-e de produto (vendas) + NFS-e de serviço.
// A BUSCA le do Supabase (portal_nt_notas_saida, populado por notas-sync.ts) ->
// instantanea. O PDF (DANFE / NFS-e) continua sob demanda no Omie via nCodNF.
// ============================================================================

import type { Conta } from './conta';
import { obterUrlDanfe, obterUrlNFSePdf } from './omie';
import { supabase } from './supabase';

const TABELA = 'portal_nt_notas_saida';
const LIMITE = 1000; // teto de linhas por busca (evita payload gigante)

export interface BuscarNotasArgs {
  modo?: string;          // 'numero' | 'cliente'
  tipo?: string;          // 'todas' | 'produto' | 'servico'
  numero?: string;
  numeroAte?: string;
  de?: string;
  ate?: string;
  cliente?: string;       // texto livre (nome ou CNPJ/CPF)
  clienteCodigo?: string; // codigo do cliente (do autocomplete) -> filtro exato
}

// "YYYY-MM-DD" (data do Supabase) -> "DD/MM/YYYY" (exibicao, igual ao Omie).
function fmtDataBR(iso: any): string | null {
  if (!iso) return null;
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso);
}

// "YYYY-MM-DD" a partir de um input de data (ISO ou DD/MM/YYYY).
function paraISO(s?: string): string | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

const COLS = 'tipo,numero,serie,n_cod_nf,chave_nfe,data_emissao,valor_nf,cancelada,cliente_codigo,cliente_nome,cliente_doc,qtde_itens';

function mapRow(r: any) {
  return {
    tipo: r.tipo,
    numero: r.numero,
    serie: r.serie,
    nCodNF: r.n_cod_nf,
    chaveNFe: r.chave_nfe,
    dataEmissao: fmtDataBR(r.data_emissao),
    valorNF: Number(r.valor_nf) || 0,
    cancelada: !!r.cancelada,
    clienteCodigo: r.cliente_codigo,
    clienteNome: r.cliente_nome,
    clienteDoc: r.cliente_doc,
    qtdeItens: r.qtde_itens || 0,
  };
}

/** Busca notas no Supabase por número (intervalo) ou por cliente
 *  (código exato do autocomplete / CNPJ-CPF / nome). tipo = todas|produto|servico. */
export async function buscarNotas(conta: Conta, q: BuscarNotasArgs): Promise<any> {
  const modo = String(q.modo || 'numero').toLowerCase();
  const tipo = String(q.tipo || 'todas').toLowerCase();

  let query: any = supabase.from(TABELA).select(COLS).eq('conta_omie', conta);
  if (tipo === 'produto' || tipo === 'servico') query = query.eq('tipo', tipo);

  let aviso: string | null = null;

  if (modo === 'numero') {
    const ini = String(q.numero || '').replace(/\D/g, '');
    const fim = (String(q.numeroAte || '').replace(/\D/g, '')) || ini;
    if (!ini) throw new Error('informe o numero da NF');
    const lo = parseInt(ini, 10);
    const hi = parseInt(fim, 10) || lo;
    query = query.gte('numero_int', Math.min(lo, hi)).lte('numero_int', Math.max(lo, hi));
    query = query.order('numero_int', { ascending: false }).order('data_emissao', { ascending: false });
  } else if (modo === 'cliente') {
    const codigo = String(q.clienteCodigo || '').replace(/\D/g, '');
    const cliente = String(q.cliente || '').trim();
    const docDigitos = cliente.replace(/\D/g, '');
    const ehDoc = docDigitos.length === 11 || docDigitos.length === 14;
    // Janela de datas: só aplica quando NÃO é um cliente específico (codigo/doc),
    // pra um cliente selecionado trazemos todo o historico dele.
    const aplicarJanela = !codigo && !ehDoc;

    if (codigo) {
      query = query.eq('cliente_codigo', Number(codigo));
    } else if (ehDoc) {
      query = query.eq('cliente_doc', docDigitos);
    } else if (cliente) {
      query = query.ilike('cliente_nome', `%${cliente}%`);
    }
    if (aplicarJanela) {
      const deISO = paraISO(q.de);
      const ateISO = paraISO(q.ate);
      if (deISO) query = query.gte('data_emissao', deISO);
      if (ateISO) query = query.lte('data_emissao', ateISO);
    }
    query = query.order('data_emissao', { ascending: false }).order('numero_int', { ascending: false });
  } else {
    throw new Error('modo invalido (use numero ou cliente)');
  }

  query = query.limit(LIMITE);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const notas = (data || []).map(mapRow);
  if (notas.length >= LIMITE) aviso = `Mostrando os primeiros ${LIMITE} resultados. Refine a busca (numero, cliente ou periodo).`;

  return { conta, contaLabel: conta, total: notas.length, notas, aviso };
}

/** URL do PDF a partir do código interno (nCodNF). tipo=servico -> NFS-e
 *  (ObterNFSe); senão DANFE de NF-e (GetUrlDanfe). */
export async function urlDanfe(conta: Conta, nCodNF: number | string, tipo = 'produto'): Promise<{ url: string; validadeAte: any }> {
  if (nCodNF == null || nCodNF === '') throw new Error('informe nCodNF');
  const { url, validadeAte } = String(tipo).toLowerCase() === 'servico'
    ? await obterUrlNFSePdf(conta, nCodNF)
    : await obterUrlDanfe(conta, nCodNF);
  return { url, validadeAte };
}
