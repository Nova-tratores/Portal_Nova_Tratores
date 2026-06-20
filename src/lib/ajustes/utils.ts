// Helpers comuns do módulo Ajustes.

/** Pausa por `ms` milissegundos (usado em retries/throttle da Omie). */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Converte para número, tratando null/undefined/NaN como 0. */
export function num(v: unknown): number {
  return Number(v == null ? 0 : v) || 0;
}
