// Leitura completa de consultas do PostgREST.
//
// O PostgREST corta toda resposta em 1000 linhas. `paginar` pede de 1000 em
// 1000 até acabar. A consulta PRECISA ter ordem estável (ex.: `.order('id')`):
// sem ela o `.range()` repete ou pula linhas na virada da página.
//
// `emLotes` resolve o problema irmão: `.in('id', ids)` com milhares de ids
// estoura o tamanho da URL — divide em pedaços.

type Resposta<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function paginar<T>(
  consulta: (de: number, ate: number) => Resposta<T>,
  opts: { lote?: number; max?: number } = {},
): Promise<{ data: T[]; error: { message: string } | null }> {
  const lote = opts.lote ?? 1000;
  const max = opts.max ?? 100_000;
  const out: T[] = [];
  for (let off = 0; off < max; off += lote) {
    const { data, error } = await consulta(off, off + lote - 1);
    if (error) return { data: out, error };
    out.push(...(data || []));
    if (!data || data.length < lote) break;
  }
  return { data: out, error: null };
}

export async function emLotes<T, I>(
  ids: I[],
  consulta: (pedaco: I[]) => Resposta<T>,
  tamanho = 200,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += tamanho) {
    const { data, error } = await consulta(ids.slice(i, i + tamanho));
    if (error) return { data: out, error };
    out.push(...(data || []));
  }
  return { data: out, error: null };
}
