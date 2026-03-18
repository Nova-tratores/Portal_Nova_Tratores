import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

export async function supabaseFetchAll<T>(table: string): Promise<T[]> {
  let all: T[] = [];
  let from = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data } = await supabase
      .from(table)
      .select("*")
      .range(from, from + pageSize - 1);
    if (data && data.length > 0) {
      all = all.concat(data as T[]);
      if (data.length < pageSize) hasMore = false;
      else from += pageSize;
    } else {
      hasMore = false;
    }
  }
  return all;
}
