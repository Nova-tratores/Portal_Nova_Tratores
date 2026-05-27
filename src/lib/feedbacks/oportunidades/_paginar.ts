// Helper de paginação para PostgREST/Supabase.
//
// PostgREST limita a 1000 linhas por padrão. Tabelas como `tratores`,
// `Ordem_Servico` e `Clientes` no Portal já passam disso, então qualquer
// `.select()` simples trunca silenciosamente e o algoritmo fica cego.
//
// Uso:
//   const tratores = await lerTudo<{ Cliente: string }>((from, to) =>
//     supabase.from("tratores").select("Cliente").range(from, to)
//   );

export async function lerTudo<T>(
  executar: (from: number, to: number) => Promise<{ data: T[] | null; error: unknown }>,
  batchSize = 1000
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += batchSize) {
    const to = from + batchSize - 1;
    const { data, error } = await executar(from, to);
    if (error) {
      const e = error as { message?: string };
      throw new Error(e.message || String(error));
    }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < batchSize) break;
    // hard stop pra evitar loop infinito em caso de bug
    if (from > 100_000) break;
  }
  return out;
}
