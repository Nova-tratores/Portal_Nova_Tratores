// Cache em memória simples com TTL. Suficiente para deploy single-instance
// (Railway). Reiniciar o processo zera o cache — aceitável para este projeto.
// Portado de src/cache.js. (Estado dos JOBS de background NÃO usa isto: vai pro
// Supabase via lib/ajustes/jobs.ts — ver decisão "worker-ready" no plano.)

interface Entry {
  valor: unknown;
  expira: number; // epoch ms
  gravadoEm: string; // ISO
}

const store = new Map<string, Entry>();

export function set(key: string, valor: unknown, ttlSeg: number): void {
  store.set(key, {
    valor,
    expira: Date.now() + Math.max(1, ttlSeg) * 1000,
    gravadoEm: new Date().toISOString(),
  });
}

/** Retorna { valor, gravadoEm } se válido, ou null se ausente/expirado. */
export function get<T = unknown>(key: string): { valor: T; gravadoEm: string } | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() > e.expira) {
    store.delete(key);
    return null;
  }
  return { valor: e.valor as T, gravadoEm: e.gravadoEm };
}

export function invalidate(key: string): void {
  store.delete(key);
}

export function invalidatePrefix(prefixo: string): number {
  let n = 0;
  for (const k of store.keys()) {
    if (k.startsWith(prefixo)) {
      store.delete(k);
      n++;
    }
  }
  return n;
}

export function stats(): { tamanho: number; chaves: string[] } {
  return { tamanho: store.size, chaves: [...store.keys()] };
}
