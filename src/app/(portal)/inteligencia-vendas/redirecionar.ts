import { redirect } from 'next/navigation';

/** Endereço antigo de uma aba → página única com ?m=<slug> (o resto do link vai junto). */
export function irParaModuloIV(slug: string, sp: Record<string, string | string[] | undefined>): never {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp || {})) {
    if (k === 'm' || v == null) continue;
    for (const x of Array.isArray(v) ? v : [v]) q.append(k, x);
  }
  q.set('m', slug);
  redirect(`/inteligencia-vendas?${q.toString()}`);
}
