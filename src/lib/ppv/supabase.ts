// =============================================
// HELPER DE FETCH PARA SUPABASE (SERVER-SIDE)
// =============================================

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("SUPABASE_URL não configurada no .env.local");
  return url;
}

function getSupabaseKey(): string {
  const key = process.env.SUPABASE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("SUPABASE_KEY não configurada no .env.local");
  return key;
}

export async function supabaseFetch<T = unknown>(
  endpoint: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  payload?: unknown
): Promise<T> {
  const cleanEndpoint = endpoint.replace(/ /g, "%20");
  const url = `${getSupabaseUrl()}/rest/v1/${cleanEndpoint}`;
  const key = getSupabaseKey();

  const headers: Record<string, string> = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const options: RequestInit = { method, headers, cache: "no-store" };
  if (payload) options.body = JSON.stringify(payload);

  const response = await fetch(url, options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Erro Supabase (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : ([] as unknown as T);
}

export function getValorInsensivel(
  objeto: Record<string, unknown>,
  ...nomesPossiveis: string[]
): unknown {
  if (!objeto) return null;
  const chavesReais = Object.keys(objeto);
  for (const nomeAlvo of nomesPossiveis) {
    if (objeto[nomeAlvo] !== undefined && objeto[nomeAlvo] !== null)
      return objeto[nomeAlvo];
    const chaveEncontrada = chavesReais.find(
      (k) => k.toLowerCase() === nomeAlvo.toLowerCase()
    );
    if (chaveEncontrada && objeto[chaveEncontrada] !== null)
      return objeto[chaveEncontrada];
  }
  return null;
}

export function formatarDataBR(
  valor: string,
  comHora: boolean = false
): string {
  if (!valor) return "";
  const d = new Date(valor);
  if (isNaN(d.getTime())) return String(valor);
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  if (!comHora) return `${dia}/${mes}/${ano}`;
  return `${dia}/${mes}/${ano} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
