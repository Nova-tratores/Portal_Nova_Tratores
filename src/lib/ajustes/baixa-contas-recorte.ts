// Recortes rápidos da tela /ajustes/baixa-contas, por data de PREVISÃO (é a
// data que o card "Pagar/Receber hoje" da Omie usa; sem previsão, vencimento).
// Puro, para ser testado sem React.

export type Recorte = 'atrasados' | 'ate_hoje' | 'mes' | 'todos';

export const RECORTES: Array<{ id: Recorte; rotulo: string; dica: string }> = [
  { id: 'atrasados', rotulo: 'Atrasados', dica: 'previsão antes de hoje' },
  { id: 'ate_hoje', rotulo: 'Até hoje', dica: 'previsão até hoje — o mesmo recorte do card "Pagar/Receber hoje" da Omie' },
  { id: 'mes', rotulo: 'Este mês', dica: 'previsão até o fim do mês atual' },
  { id: 'todos', rotulo: 'Todos', dica: 'tudo que está em aberto, inclusive parcelas futuras' },
];

export const RECORTE_PADRAO: Recorte = 'ate_hoje';

export function ehRecorte(v: unknown): v is Recorte {
  return RECORTES.some((r) => r.id === v);
}

/** Data de referência do título para os recortes: previsão, senão vencimento. */
export function dataRecorte(t: { previsao?: string | null; vencimento?: string | null }): string {
  return String(t.previsao || t.vencimento || '').slice(0, 10);
}

/** ISO local (YYYY-MM-DD) de hoje e do último dia do mês de `hoje`. */
export function fimDoMes(hojeISO: string): string {
  const [y, m] = hojeISO.split('-').map((n) => parseInt(n, 10));
  const ultimo = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(ultimo).padStart(2, '0')}`;
}

export function passaRecorte(t: { previsao?: string | null; vencimento?: string | null }, recorte: Recorte, hojeISO: string): boolean {
  if (recorte === 'todos') return true;
  const d = dataRecorte(t);
  if (!d) return false; // sem nenhuma data só aparece em "todos" (tratado acima)
  if (recorte === 'atrasados') return d < hojeISO;
  if (recorte === 'ate_hoje') return d <= hojeISO;
  return d <= fimDoMes(hojeISO); // mes
}

export function aplicarRecorte<T extends { previsao?: string | null; vencimento?: string | null }>(titulos: T[], recorte: Recorte, hojeISO: string): T[] {
  return titulos.filter((t) => passaRecorte(t, recorte, hojeISO));
}

/** Contagem e soma do valor em aberto de um conjunto de títulos. */
export function resumir(titulos: Array<{ valorAberto?: number | null }>): { n: number; total: number } {
  return { n: titulos.length, total: titulos.reduce((s, t) => s + (Number(t.valorAberto) || 0), 0) };
}
