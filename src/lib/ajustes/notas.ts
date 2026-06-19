/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Notas fiscais de SAÍDA (vendas): buscar por número ou cliente + DANFE.
// Só leitura. Portado de server.js (/api/notas/buscar, /api/notas/danfe).
// ============================================================================

import type { Conta } from './conta';
import { fmtBR, parseAnyDate, hoje, addMeses } from './dates';
import { buscarNotasSaida, obterUrlDanfe } from './omie';

export interface BuscarNotasArgs {
  modo?: string; // 'numero' | 'cliente'
  numero?: string;
  numeroAte?: string;
  de?: string;
  ate?: string;
  cliente?: string;
}

/** Busca NF-e de saída por número (intervalo) ou por cliente (janela de emissão). */
export async function buscarNotas(conta: Conta, q: BuscarNotasArgs): Promise<any> {
  const modo = String(q.modo || 'numero').toLowerCase();
  let notas: any[] = [];

  if (modo === 'numero') {
    const numero = String(q.numero || '').trim();
    const numeroAte = String(q.numeroAte || '').trim();
    const ini = numero.replace(/\D/g, '');
    const fim = (numeroAte || numero).replace(/\D/g, '');
    if (!ini) throw new Error('informe o numero da NF');
    notas = await buscarNotasSaida(conta, { nNFInicial: ini, nNFFinal: fim || ini });
  } else if (modo === 'cliente') {
    const dtAte = parseAnyDate(q.ate) || hoje();
    const dtDe = parseAnyDate(q.de) || addMeses(dtAte, -2);
    const cliente = String(q.cliente || '').trim();
    const docDigitos = cliente.replace(/\D/g, '');
    const ehDoc = docDigitos.length === 11 || docDigitos.length === 14;
    const filtros: any = { dEmiInicial: fmtBR(dtDe), dEmiFinal: fmtBR(dtAte) };
    if (ehDoc) filtros.cnpj_cpf = docDigitos;
    notas = await buscarNotasSaida(conta, filtros);
    if (cliente && !ehDoc) {
      const termo = cliente.toLowerCase();
      notas = notas.filter((n) => String(n.clienteNome || '').toLowerCase().includes(termo));
    }
  } else {
    throw new Error('modo invalido (use numero ou cliente)');
  }

  notas.sort((a, b) => Number(b.numero || 0) - Number(a.numero || 0));
  const enxuto = notas.map((n) => ({
    numero: n.numero,
    serie: n.serie,
    nCodNF: n.nCodNF,
    chaveNFe: n.chaveNFe,
    dataEmissao: n.dataEmissao,
    valorNF: n.valorNF,
    cancelada: n.cancelada,
    clienteCodigo: n.clienteCodigo,
    clienteNome: n.clienteNome,
    clienteDoc: n.clienteDoc,
    qtdeItens: (n.itens || []).length,
  }));
  return { conta, contaLabel: conta, total: enxuto.length, notas: enxuto };
}

/** URL do DANFE PDF (GetUrlDanfe) a partir do código interno da NF (nCodNF). */
export async function urlDanfe(conta: Conta, nCodNF: number | string): Promise<{ url: string; validadeAte: any }> {
  if (nCodNF == null || nCodNF === '') throw new Error('informe nCodNF');
  const { url, validadeAte } = await obterUrlDanfe(conta, nCodNF);
  return { url, validadeAte };
}
