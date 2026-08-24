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

  // As datas da Selic (row.data) são ISO (YYYY-MM-DD). data_inclusao vem em
  // DD/MM/YYYY, então normalizamos para ISO antes de comparar como string —
  // senão a comparação falhava e o custo de capital saía sempre 0.
  const d = parseDataInclusao(dataInclusaoStr);
  if (!d) return { selicAcumulada: 0, diasUteis: 0 };
  const de = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

// data_inclusao vem do Omie como texto em DD/MM/YYYY (ex.: "26/02/2025"), NÃO
// em ISO. `new Date("26/02/2025")` dá Invalid Date (ou troca dia/mês quando o
// dia é <= 12), por isso os dias saíam em branco/errados. Este parser aceita
// DD/MM/YYYY e também ISO (YYYY-MM-DD...) por segurança.
export function parseDataInclusao(str: string): Date | null {
  if (!str) return null;
  const s = str.trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); // DD/MM/YYYY
  if (br) return new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // YYYY-MM-DD
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function calcularDiasCorridos(dataInclusaoStr: string): number {
  const d = parseDataInclusao(dataInclusaoStr);
  if (!d) return 0;
  const agora = new Date();
  return Math.max(0, Math.floor((agora.getTime() - d.getTime()) / 86400000));
}
