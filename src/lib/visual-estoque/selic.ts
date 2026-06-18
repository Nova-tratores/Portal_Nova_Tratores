import { supabaseVE } from "./supabase";

interface SelicRow {
  data: string;
  taxa: number;
  fator: number;
}

let selicCache: SelicRow[] | null = null;

export async function carregarSelicCache(): Promise<SelicRow[]> {
  if (selicCache) return selicCache;
  const all: SelicRow[] = [];
  let from = 0;
  const PAGE = 1000;
  let hasMore = true;
  while (hasMore) {
    const { data } = await supabaseVE
      .from("selic_cache")
      .select("data, taxa, fator")
      .order("data", { ascending: true })
      .range(from, from + PAGE - 1);
    if (data && data.length > 0) {
      all.push(...data);
      if (data.length < PAGE) hasMore = false;
      else from += PAGE;
    } else {
      hasMore = false;
    }
  }
  selicCache = all;
  return all;
}

export function calcularSelicAcumulada(
  cache: SelicRow[],
  dataInclusaoStr: string
): { selicAcumulada: number; diasUteis: number } {
  if (!dataInclusaoStr || cache.length === 0) return { selicAcumulada: 0, diasUteis: 0 };

  const de = dataInclusaoStr.slice(0, 10);
  const hoje = new Date().toISOString().slice(0, 10);

  let acumulado = 1;
  let dias = 0;
  for (const row of cache) {
    if (row.data >= de && row.data <= hoje) {
      acumulado *= row.fator || 1 + (row.taxa || 0) / 100;
      dias++;
    }
  }
  return { selicAcumulada: acumulado - 1, diasUteis: dias };
}

export function calcularDiasCorridos(dataInclusaoStr: string): number {
  if (!dataInclusaoStr) return 0;
  const d = new Date(dataInclusaoStr);
  const agora = new Date();
  return Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 86400000));
}
