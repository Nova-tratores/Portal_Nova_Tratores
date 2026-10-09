// Cache em memória (processo do Railway, longevo) do resumo mensal de vendas
// usado pelo histórico/grade do Dashboard de Vendas. A RPC leva ~1 s; o espelho
// só muda quando o sync grava (a cada 30 min pelo cron), então 5 min de cache
// não esconde nada relevante — e gravarPedidos limpa o cache na hora.
// Módulo separado para vendas-sync e dashboard-listas não se importarem em círculo.

const TTL_MS = 5 * 60_000;

interface Entrada<T> { valor: Promise<T>; ate: number }
const g = globalThis as unknown as { __resumoVendasCache?: Map<string, Entrada<unknown>> };
const cache = (g.__resumoVendasCache ??= new Map());

/** Devolve do cache ou calcula; chamadas simultâneas com a mesma chave dividem a mesma consulta. */
export function comCacheResumo<T>(chave: string, calcular: () => Promise<T>): Promise<T> {
  const agora = Date.now();
  const e = cache.get(chave) as Entrada<T> | undefined;
  if (e && e.ate > agora) return e.valor;
  const valor = calcular();
  cache.set(chave, { valor, ate: agora + TTL_MS });
  // Erro não fica guardado: a próxima chamada tenta de novo.
  valor.catch(() => { if (cache.get(chave)?.valor === valor) cache.delete(chave); });
  return valor;
}

export function invalidarResumoVendas(): void {
  cache.clear();
}
