// =============================================================================
// MARKETING & EVENTOS — custos. Lib PURA (sem I/O), testada com vitest.
//
// Alimenta a aba Custos, o cálculo de ROI, o PDF de contrapartida e o CSV — uma
// lógica, vários consumidores (mesmo desenho de lib/ppv/relacao.ts).
// =============================================================================
import { CATEGORIAS_CUSTO, rotulo, type Custo } from './tipos';

/**
 * "1.550,00" | "1550,00" | "1550" | "1550.00" | 1550 -> 1550
 *
 * MESMA REGRA do parseValorBR de lib/requisicoes/autorizacao.ts, reescrita aqui
 * porque aquele arquivo instancia o cliente Supabase do navegador no topo e
 * esta lib precisa ficar pura (roda no vitest e no pdfkit).
 * O teste em __tests__/custos.test.ts trava os dois formatos que já causaram
 * bug de 100x no repo: "1.234,56" (BR) e "800.00" (US).
 */
export function parseValorMisto(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (s === '') return 0;
  if (s.includes(',')) {
    // BR: ponto é milhar, vírgula é decimal.
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // Numérico/americano: ponto é decimal.
  return parseFloat(s) || 0;
}

/**
 * Quanto este custo pesa na ação. O rateio existe para a nota que cobre duas
 * ações (ex.: um lote de brindes usado em duas feiras).
 */
export function valorRateado(c: Pick<Custo, 'valor' | 'rateio_percent'>): number {
  const bruto = parseValorMisto(c.valor);
  const pct = Number(c.rateio_percent);
  const fator = Number.isFinite(pct) && pct > 0 ? Math.min(pct, 100) / 100 : 1;
  return bruto * fator;
}

export interface TotaisCusto {
  confirmado: number;   // o que entra no ROI
  previsto: number;     // ainda não confirmado
  cancelado: number;    // fora de tudo, só pra conferência
  total: number;        // confirmado + previsto
  porCategoria: Record<string, number>;  // só confirmado
  porOrigem: Record<string, number>;     // só confirmado
  divergentes: number;  // vínculos cujo valor da origem mudou
}

/**
 * Custo cancelado NÃO soma em lugar nenhum. Previsto soma só no `previsto` —
 * o ROI usa `confirmado`, senão a feira parece mais cara do que foi.
 */
export function totaisCusto(custos: Custo[]): TotaisCusto {
  const t: TotaisCusto = {
    confirmado: 0, previsto: 0, cancelado: 0, total: 0,
    porCategoria: {}, porOrigem: {}, divergentes: 0,
  };

  for (const c of custos) {
    const v = valorRateado(c);
    if (c.status === 'cancelado') { t.cancelado += v; continue; }
    if (c.status === 'previsto') { t.previsto += v; continue; }

    t.confirmado += v;
    t.porCategoria[c.categoria] = (t.porCategoria[c.categoria] ?? 0) + v;
    t.porOrigem[c.origem] = (t.porOrigem[c.origem] ?? 0) + v;
    if (divergente(c)) t.divergentes += 1;
  }

  t.total = t.confirmado + t.previsto;
  return t;
}

/**
 * O documento de origem mudou de valor depois que o custo foi lançado?
 * A tela mostra um selo; o total NÃO muda sozinho — `valor` é snapshot, senão
 * o ROI de uma feira encerrada mudaria quando alguém edita uma requisição
 * antiga meses depois.
 */
export function divergente(c: Pick<Custo, 'valor' | 'valor_fonte'>): boolean {
  if (c.valor_fonte === null || c.valor_fonte === undefined) return false;
  return Math.abs(parseValorMisto(c.valor) - parseValorMisto(c.valor_fonte)) >= 0.01;
}

/** Categorias com valor, da maior pra menor — a quebra do PDF e do gráfico. */
export function rankingCategorias(
  porCategoria: Record<string, number>,
): { id: string; label: string; valor: number; percent: number }[] {
  const total = Object.values(porCategoria).reduce((s, v) => s + v, 0);
  return Object.entries(porCategoria)
    .filter(([, v]) => v !== 0)
    .map(([id, valor]) => ({
      id,
      label: rotulo(CATEGORIAS_CUSTO, id),
      valor,
      percent: total > 0 ? (valor / total) * 100 : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}

/** R$ 1.234,56 — usado na tela, no CSV e no PDF. */
export function brl(v: number | null | undefined): string {
  const n = Number(v ?? 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
