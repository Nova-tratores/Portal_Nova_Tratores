// Lista/Relação/Painel do Pedido de Máquinas — parte PURA. Client-safe.
import { faseInfo, FASES_PEDIDO_MAQUINA } from './regras';

export interface PedidoLista {
  id: number;
  id_pedido: string;
  status: string;
  status_desde: string | null;
  empresa: string;
  cliente: string | null;
  cliente_documento: string | null;
  vendedor_id: number | null;
  vendedor_nome: string | null;
  proposta_id: number | null;
  valor_total: number;
  previsao_faturamento: string | null;
  pedido_omie: string | null;
  nf_numero: string | null;
  faturado_omie_em: string | null;
  criado_em: string;
  criado_por: string | null;
  maquinas: string[];
  chassis: string[];
}

export interface Agregado { chave: string; label: string; n: number; valor: number; ids: string[] }

const semAcento = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function brl(v: number): string {
  return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = String(iso).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—';
}

export function diasNaFase(p: Pick<PedidoLista, 'status_desde'>, agora = Date.now()): number | null {
  if (!p.status_desde) return null;
  const t = Date.parse(p.status_desde);
  return Number.isFinite(t) ? Math.max(0, Math.floor((agora - t) / 86400000)) : null;
}

export function casaBusca(p: PedidoLista, termo: string): boolean {
  const t = semAcento(termo).trim();
  if (!t) return true;
  const digitos = t.replace(/\D/g, '');
  const texto = semAcento([p.id_pedido, p.cliente, p.vendedor_nome, p.pedido_omie, p.nf_numero, p.proposta_id ? `proposta ${p.proposta_id}` : '', ...p.maquinas, ...p.chassis].join(' '));
  if (texto.includes(t)) return true;
  return digitos.length >= 4 && String(p.cliente_documento || '').includes(digitos);
}

export type ColunaRel = 'id_pedido' | 'fase' | 'cliente' | 'maquinas' | 'vendedor' | 'valor' | 'proposta' | 'omie' | 'nf' | 'criado' | 'previsao';

export const COLUNAS_REL: { k: ColunaRel; label: string; num?: boolean }[] = [
  { k: 'id_pedido', label: 'Pedido' },
  { k: 'fase', label: 'Fase' },
  { k: 'cliente', label: 'Cliente' },
  { k: 'maquinas', label: 'Máquinas' },
  { k: 'vendedor', label: 'Vendedor' },
  { k: 'valor', label: 'Valor', num: true },
  { k: 'proposta', label: 'Proposta' },
  { k: 'omie', label: 'Pedido Omie' },
  { k: 'nf', label: 'NF-e' },
  { k: 'criado', label: 'Criado em' },
  { k: 'previsao', label: 'Prev. faturamento' },
];

export function textoColuna(p: PedidoLista, k: ColunaRel): string {
  switch (k) {
    case 'id_pedido': return p.id_pedido;
    case 'fase': return faseInfo(p.status).rotulo;
    case 'cliente': return p.cliente || '';
    case 'maquinas': return p.maquinas.join(', ');
    case 'vendedor': return p.vendedor_nome || '';
    case 'valor': return brl(p.valor_total);
    case 'proposta': return p.proposta_id ? `#${p.proposta_id}` : '';
    case 'omie': return p.pedido_omie || '';
    case 'nf': return p.nf_numero || '';
    case 'criado': return dataCurta(p.criado_em);
    case 'previsao': return dataCurta(p.previsao_faturamento);
  }
}

function valorOrdem(p: PedidoLista, k: ColunaRel): string | number {
  if (k === 'valor') return p.valor_total;
  if (k === 'criado') return p.criado_em || '';
  if (k === 'previsao') return p.previsao_faturamento || '';
  if (k === 'fase') return FASES_PEDIDO_MAQUINA.findIndex((f) => f.id === p.status);
  return semAcento(textoColuna(p, k));
}

export function filtrarRel(lista: PedidoLista[], filtros: Partial<Record<ColunaRel, string>>, busca: string): PedidoLista[] {
  const ativos = Object.entries(filtros).filter(([, v]) => v && v.trim()) as [ColunaRel, string][];
  return lista.filter((p) => casaBusca(p, busca) && ativos.every(([k, v]) => semAcento(textoColuna(p, k)).includes(semAcento(v).trim())));
}

export function ordenarRel(lista: PedidoLista[], k: ColunaRel, dir: 'asc' | 'desc'): PedidoLista[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...lista].sort((a, b) => {
    const x = valorOrdem(a, k), y = valorOrdem(b, k);
    return (x < y ? -1 : x > y ? 1 : 0) * m;
  });
}

export function totais(lista: PedidoLista[]) {
  const abertos = lista.filter((p) => !['faturado', 'cancelado'].includes(p.status));
  const faturados = lista.filter((p) => p.status === 'faturado');
  const soma = (l: PedidoLista[]) => l.reduce((s, p) => s + (Number(p.valor_total) || 0), 0);
  return {
    n: lista.length, valor: soma(lista.filter((p) => p.status !== 'cancelado')),
    abertos: abertos.length, valorAbertos: soma(abertos),
    faturados: faturados.length, valorFaturados: soma(faturados),
    comProposta: lista.filter((p) => p.proposta_id).length,
  };
}

export function agregar(lista: PedidoLista[], chaveDe: (p: PedidoLista) => string, labelDe: (c: string) => string = (c) => c, ordem: 'valor' | 'chave' = 'valor'): Agregado[] {
  const m = new Map<string, Agregado>();
  for (const p of lista) {
    const c = chaveDe(p);
    const a = m.get(c) || { chave: c, label: labelDe(c), n: 0, valor: 0, ids: [] };
    a.n += 1; a.valor += Number(p.valor_total) || 0; a.ids.push(p.id_pedido);
    m.set(c, a);
  }
  const arr = [...m.values()];
  return ordem === 'chave' ? arr.sort((a, b) => (a.chave < b.chave ? -1 : 1)) : arr.sort((a, b) => b.valor - a.valor);
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const rotuloMes = (c: string) => (/^\d{4}-\d{2}$/.test(c) ? `${MESES[Number(c.slice(5, 7)) - 1]}/${c.slice(2, 4)}` : 'Sem data');

export function csv(lista: PedidoLista[]): string {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const cab = COLUNAS_REL.map((c) => c.label).join(';');
  const linhas = lista.map((p) => COLUNAS_REL.map((c) => esc(c.k === 'valor' ? String(p.valor_total).replace('.', ',') : textoColuna(p, c.k))).join(';'));
  return '﻿' + [cab, ...linhas].join('\n');
}
