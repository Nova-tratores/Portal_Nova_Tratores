/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Notas fiscais de SAÍDA: NF-e de produto (vendas) + NFS-e de serviço.
// Buscar por número ou cliente + abrir PDF (DANFE / NFS-e). Só leitura.
// Portado de server.js (/api/notas/buscar, /api/notas/danfe) + adição de NFS-e.
// ============================================================================

import type { Conta } from './conta';
import { fmtBR, parseAnyDate, hoje, addMeses } from './dates';
import { buscarNotasSaida, obterUrlDanfe, buscarNotasServico, obterUrlNFSePdf, listarClientesResumido } from './omie';
import * as cache from './cache';

export interface BuscarNotasArgs {
  modo?: string; // 'numero' | 'cliente'
  tipo?: string; // 'todas' | 'produto' | 'servico'
  numero?: string;
  numeroAte?: string;
  de?: string;
  ate?: string;
  cliente?: string;
}

// ListarNFSEs filtra um número por vez (sem range); um intervalo vira um loop
// limitado por segurança.
const MAX_NFSE_NUMEROS = 50;

/** Mapa codigo_cliente -> { nome, doc } (cache 30min). Fallback para resolver o
 *  nome quando a NFS-e não trouxer cRazaoDestinatario. */
async function mapaClientes(conta: Conta): Promise<Map<any, any>> {
  const chave = `notas_clientes_map:${conta}`;
  const hit = cache.get<Map<any, any>>(chave);
  if (hit) return hit.valor;
  let arr: any[] = [];
  try {
    arr = await listarClientesResumido(conta);
  } catch (e: any) {
    console.warn('[notas clientes]', e.message);
  }
  const map = new Map<any, any>();
  for (const c of arr || []) {
    const cod = c.codigo_cliente ?? c.nCod ?? c.codigo;
    if (cod == null) continue;
    map.set(Number(cod) || cod, {
      nome: c.razao_social || c.nome_fantasia || c.cnome || c.nome || null,
      doc: c.cnpj_cpf || null,
    });
  }
  cache.set(chave, map, 1800);
  return map;
}

/** Preenche a razão social das NFS-e que não vieram com nome (raro: o
 *  cRazaoDestinatario do ListarNFSEs já costuma resolver tudo). Só paga o fetch
 *  pesado da lista de clientes se realmente faltar algum nome. */
async function preencherNomesNFSe(conta: Conta, notas: any[]): Promise<void> {
  if (!notas.length) return;
  if (!notas.some((n) => !n.clienteNome && n.clienteCodigo != null)) return;
  try {
    const mapa = await mapaClientes(conta);
    for (const n of notas) {
      if (!n.clienteNome && n.clienteCodigo != null) {
        const c = mapa.get(Number(n.clienteCodigo) || n.clienteCodigo);
        if (c) { n.clienteNome = c.nome; if (!n.clienteDoc) n.clienteDoc = c.doc; }
      }
    }
  } catch { /* segue sem nome */ }
}

/** Busca NFS-e por número (ou intervalo). Retorna { notas, truncado }. */
async function buscarNotasServicoPorNumero(conta: Conta, ini: string, fim: string): Promise<{ notas: any[]; truncado: boolean }> {
  const a = parseInt(ini, 10);
  if (!Number.isFinite(a)) return { notas: [], truncado: false };
  const b = parseInt(fim, 10);
  const lo = a, hi = Number.isFinite(b) ? Math.max(a, b) : a;
  const truncado = (hi - lo + 1) > MAX_NFSE_NUMEROS;
  const fimReal = truncado ? lo + MAX_NFSE_NUMEROS - 1 : hi;
  const out: any[] = [];
  for (let n = lo; n <= fimReal; n++) {
    const arr = await buscarNotasServico(conta, { nNumeroNFSe: String(n) });
    out.push(...arr);
  }
  return { notas: out, truncado };
}

/** Busca NF-e de produto e/ou NFS-e de serviço por número (intervalo) ou por
 *  cliente (janela de emissão). tipo = todas | produto | servico. */
export async function buscarNotas(conta: Conta, q: BuscarNotasArgs): Promise<any> {
  const modo = String(q.modo || 'numero').toLowerCase();
  const tipo = String(q.tipo || 'todas').toLowerCase();
  const querProduto = tipo === 'todas' || tipo === 'produto';
  const querServico = tipo === 'todas' || tipo === 'servico';
  let notas: any[] = [];
  let aviso: string | null = null;

  if (modo === 'numero') {
    const numero = String(q.numero || '').trim();
    const numeroAte = String(q.numeroAte || '').trim();
    const ini = numero.replace(/\D/g, '');
    const fim = (numeroAte || numero).replace(/\D/g, '');
    if (!ini) throw new Error('informe o numero da NF');
    const tarefas: Promise<any[]>[] = [];
    if (querProduto) tarefas.push(buscarNotasSaida(conta, { nNFInicial: ini, nNFFinal: fim || ini }));
    if (querServico) tarefas.push(buscarNotasServicoPorNumero(conta, ini, fim || ini).then(async (r) => {
      await preencherNomesNFSe(conta, r.notas);
      if (r.truncado) aviso = `Intervalo de NFS-e limitado aos primeiros ${MAX_NFSE_NUMEROS} numeros.`;
      return r.notas;
    }));
    notas = (await Promise.all(tarefas)).flat();
  } else if (modo === 'cliente') {
    const dtAte = parseAnyDate(q.ate) || hoje();
    const dtDe = parseAnyDate(q.de) || addMeses(dtAte, -2);
    const cliente = String(q.cliente || '').trim();
    const docDigitos = cliente.replace(/\D/g, '');
    const ehDoc = docDigitos.length === 11 || docDigitos.length === 14;
    const deBR = fmtBR(dtDe), ateBR = fmtBR(dtAte);
    const termo = cliente.toLowerCase();
    const tarefas: Promise<any[]>[] = [];
    if (querProduto) {
      const filtros: any = { dEmiInicial: deBR, dEmiFinal: ateBR };
      if (ehDoc) filtros.cnpj_cpf = docDigitos;
      tarefas.push(buscarNotasSaida(conta, filtros).then((arr) =>
        (cliente && !ehDoc)
          ? arr.filter((n) => String(n.clienteNome || '').toLowerCase().includes(termo))
          : arr
      ));
    }
    if (querServico) {
      const filtros: any = { dEmiInicial: deBR, dEmiFinal: ateBR };
      if (ehDoc) {
        if (docDigitos.length === 14) filtros.cCNPJDestinatario = docDigitos;
        else filtros.cCPFDestinatario = docDigitos;
      }
      tarefas.push((async () => {
        let arr = await buscarNotasServico(conta, filtros);
        await preencherNomesNFSe(conta, arr);
        if (cliente && !ehDoc) arr = arr.filter((n) => String(n.clienteNome || '').toLowerCase().includes(termo));
        return arr;
      })());
    }
    notas = (await Promise.all(tarefas)).flat();
  } else {
    throw new Error('modo invalido (use numero ou cliente)');
  }

  // dedup defensivo (tipo + nCodNF) e ordena por data desc, depois numero desc
  const vistos = new Set<string>();
  notas = notas.filter((n) => {
    const k = (n.tipo || 'produto') + ':' + (n.nCodNF ?? n.numero ?? '');
    if (k.endsWith(':')) return true; // sem chave: nao dedup
    if (vistos.has(k)) return false;
    vistos.add(k); return true;
  });
  notas.sort((a, b) => {
    const da = parseAnyDate(a.dataEmissao), db = parseAnyDate(b.dataEmissao);
    if (da && db && da.getTime() !== db.getTime()) return db.getTime() - da.getTime();
    return Number(b.numero || 0) - Number(a.numero || 0);
  });
  const enxuto = notas.map((n) => ({
    tipo: n.tipo || 'produto',
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
  return { conta, contaLabel: conta, total: enxuto.length, notas: enxuto, aviso };
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
