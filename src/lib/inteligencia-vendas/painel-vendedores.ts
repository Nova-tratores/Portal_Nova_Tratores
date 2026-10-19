// =============================================================================
// INTELIGÊNCIA DE VENDAS — Painel dos vendedores por PERÍODO (molde do Painel
// dos técnicos da Janela Mecânicos). Lib PURA.
//
// O servidor transforma as fontes numa lista de EVENTOS datados por vendedor
// (visita, proposta criada, ganha, perdida, máquina faturada, peças faturadas);
// a tela escolhe o período e soma aqui — trocar de período não vai ao banco.
// =============================================================================
import { dataISO, somarDias } from './normalizar';
import { mesmoVendedor, type FonteNegocioEquipe, type FontePedido, type FonteVisitaEquipe } from './equipe';
import type { FonteProposta } from './tipos';

export type TipoEvento = 'visita' | 'proposta' | 'ganha' | 'perdida' | 'maquina' | 'pecas';
export interface Evento { v: number | null; t: TipoEvento; d: string; valor: number; desc: string }
export type Escala = 'semana' | 'mes' | 'trimestre' | 'ano';

const MAQUINA = /venda de (tratores|implementos)/i;
const PECAS = /revenda de pe[cç]as/i;
const valorBR = (s: unknown): number => {
  if (typeof s === 'number') return s;
  const t = String(s ?? '').trim();
  if (!t) return 0;
  const n = /,\d{1,2}$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function montarEventos(e: {
  vendedores: { id: number; nome: string }[];
  visitas: FonteVisitaEquipe[];
  propostas: (FonteProposta & { vendedor_id?: number | null })[];
  pedidos: FontePedido[];
  negocios?: FonteNegocioEquipe[];
  desde: string;
}): Evento[] {
  const out: Evento[] = [];
  const quem = (id: number | null | undefined, nome: unknown): number | null => {
    if (id != null && e.vendedores.some((v) => v.id === id)) return id;
    const v = nome ? e.vendedores.find((x) => mesmoVendedor(nome, x.nome)) : undefined;
    return v ? v.id : null;
  };
  for (const v of e.visitas) {
    const d = dataISO(v.data_visita);
    if (v.deleted_at || !d || d < e.desde || !e.vendedores.some((x) => x.id === v.vendedor_id)) continue; // só vendedores ativos
    out.push({ v: v.vendedor_id, t: 'visita', d, valor: 0, desc: String(v.propriedade_nome || v.cliente_nome || '') });
  }
  for (const p of e.propostas) {
    if (p.status === 'Lixeira') continue;
    const v = quem(p.vendedor_id, p.vendedor_nome);
    const desc = `${p.Cliente || ''} · ${[p.Marca, p.Modelo].filter(Boolean).join(' ')}`;
    const criada = dataISO(p.criado_em);
    if (criada >= e.desde) out.push({ v, t: 'proposta', d: criada, valor: valorBR(p.Valor_Total), desc });
    if (!p.em_aberto) {
      const d = dataISO(p.fechado_em || p.status_desde);
      if (d >= e.desde) out.push({ v, t: p.status === 'Concluida-Vendido' ? 'ganha' : 'perdida', d, valor: valorBR(p.Valor_Total), desc });
    }
  }
  for (const p of e.pedidos) {
    if (String(p.cancelada).toUpperCase() === 'SIM' || !/FATURADO|ENTREGUE/i.test(String(p.etapa))) continue;
    const t: TipoEvento | null = MAQUINA.test(String(p.categoria)) ? 'maquina' : PECAS.test(String(p.categoria)) ? 'pecas' : null;
    const d = dataISO(p.data_emissao);
    if (!t || !d || d < e.desde) continue;
    out.push({ v: quem(null, p.vendedor), t, d, valor: Number(p.valor_total) || 0, desc: String(p.cliente || '') });
  }
  return out.sort((a, b) => a.d.localeCompare(b.d));
}

// ── períodos ────────────────────────────────────────────────────────────────
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ymd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

/** Período que contém `ref` (ISO). Semana = segunda a domingo. */
export function periodo(escala: Escala, ref: string): { de: string; ate: string; rotulo: string; curto: string } {
  const [y, m] = [Number(ref.slice(0, 4)), Number(ref.slice(5, 7)) - 1];
  if (escala === 'semana') {
    const dow = (new Date(`${ref}T12:00:00Z`).getUTCDay() + 6) % 7;
    const de = somarDias(ref, -dow), ate = somarDias(de, 6);
    const f = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
    return { de, ate, rotulo: `semana ${f(de)} a ${f(ate)}`, curto: f(de) };
  }
  if (escala === 'mes') return { de: ymd(y, m, 1), ate: ymd(y, m + 1, 0), rotulo: `${MESES[m]}/${y}`, curto: `${MESES[m]}/${String(y).slice(2)}` };
  if (escala === 'trimestre') {
    const q = Math.floor(m / 3);
    return { de: ymd(y, q * 3, 1), ate: ymd(y, q * 3 + 3, 0), rotulo: `${q + 1}º trimestre de ${y}`, curto: `T${q + 1}/${String(y).slice(2)}` };
  }
  return { de: ymd(y, 0, 1), ate: ymd(y, 11, 31), rotulo: String(y), curto: String(y) };
}

/** Anda n períodos a partir de ref (devolve uma data dentro do período novo). */
export function andar(escala: Escala, ref: string, n: number): string {
  const p = periodo(escala, ref);
  if (escala === 'semana') return somarDias(p.de, 7 * n);
  const [y, m] = [Number(p.de.slice(0, 4)), Number(p.de.slice(5, 7)) - 1];
  if (escala === 'mes') return ymd(y, m + n, 1);
  if (escala === 'trimestre') return ymd(y, m + 3 * n, 1);
  return ymd(y + n, 0, 1);
}

// ── soma do período ─────────────────────────────────────────────────────────
export interface Soma {
  visitas: number; propostas: number; valorPropostas: number; ganhas: number; perdidas: number;
  maquinas: number; valorMaquinas: number; valorPecas: number;
}
export const SOMA_ZERO: Soma = { visitas: 0, propostas: 0, valorPropostas: 0, ganhas: 0, perdidas: 0, maquinas: 0, valorMaquinas: 0, valorPecas: 0 };

export function somar(eventos: Evento[], de: string, ate: string, v?: number | null): Soma {
  const s = { ...SOMA_ZERO };
  for (const e of eventos) {
    if (e.d < de || e.d > ate) continue;
    if (v !== undefined && e.v !== v) continue;
    if (e.t === 'visita') s.visitas++;
    else if (e.t === 'proposta') { s.propostas++; s.valorPropostas += e.valor; }
    else if (e.t === 'ganha') s.ganhas++;
    else if (e.t === 'perdida') s.perdidas++;
    else if (e.t === 'maquina') { s.maquinas++; s.valorMaquinas += e.valor; }
    else if (e.t === 'pecas') s.valorPecas += e.valor;
  }
  return s;
}

/** Conversão = ganhas ÷ (ganhas + perdidas); null sem nenhuma fechada. */
export const conversao = (s: Soma): number | null => (s.ganhas + s.perdidas ? s.ganhas / (s.ganhas + s.perdidas) : null);

/** Variação contra o período anterior; null quando o anterior é zero. */
export const variacao = (agora: number, antes: number): number | null => (antes ? (agora - antes) / antes : null);

/** Os últimos n períodos (do mais antigo ao atual) com a soma de cada um. */
export function serie(eventos: Evento[], escala: Escala, ref: string, n = 8, v?: number | null) {
  return Array.from({ length: n }, (_, i) => {
    const p = periodo(escala, andar(escala, ref, i - (n - 1)));
    return { ...p, ref: p.de, soma: somar(eventos, p.de, p.ate, v) };
  });
}

/**
 * Período anterior para comparar. Se o atual ainda está em andamento, corta o
 * anterior no MESMO dia (18 dias de outubro × 18 primeiros dias de setembro),
 * senão a setinha mostraria queda só porque o mês não acabou.
 */
export function anteriorComparavel(escala: Escala, ref: string, hoje: string): { de: string; ate: string; mesmoDia: boolean } {
  const p = periodo(escala, ref);
  const a = periodo(escala, andar(escala, ref, -1));
  if (hoje < p.de || hoje > p.ate) return { de: a.de, ate: a.ate, mesmoDia: false };
  const dias = Math.round((Date.parse(hoje) - Date.parse(p.de)) / 86_400_000);
  const ate = somarDias(a.de, dias);
  return { de: a.de, ate: ate < a.ate ? ate : a.ate, mesmoDia: true };
}
