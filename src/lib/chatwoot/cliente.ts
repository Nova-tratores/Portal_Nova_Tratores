// Cliente HTTP mínimo da API do NovaZap (Chatwoot). Só I/O: nada de regra de
// negócio aqui (ver parsers.ts e contatos-cliente.ts).
//
// Endpoints usados (verificados no fork Nova-tratores/ChatWoot, 09/2026):
//  - GET /search/contacts?q=&page=   → busca que o fork estendeu para também
//    casar `custom_attributes::text` (ILIKE sem acento). É o ÚNICO caminho
//    que encontra contato por `cliente_ref`: o /contacts/filter por atributo
//    customizado devolve 422 porque não existe CustomAttributeDefinition para
//    essas chaves, e o /contacts/search não olha os atributos.
//  - GET /contacts/:id/conversations → conversas do contato, já ordenadas por
//    last_activity_at desc (limite 20, sem paginação). Payload pesado (traz
//    mensagens) — quem chama só usa o primeiro item.
//  - GET /inboxes                    → nomes das caixas (cache 30 min).

import { baseApiConta, CHATWOOT_API_TOKEN } from "./config";

export interface ChatwootHttpError extends Error {
  http?: number;
}

export interface ContatoBruto {
  id: number;
  name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  thumbnail?: string | null;
  last_activity_at?: number | string | null;
  custom_attributes?: Record<string, unknown> | null;
}

export interface ConversaBruta {
  id: number; // = display_id no parcial de conversa
  status?: string | null;
  last_activity_at?: number | null; // unix segundos
  inbox_id?: number | null;
  unread_count?: number | null;
  meta?: { assignee?: { name?: string | null } | null } | null;
}

export const TIMEOUT_BUSCA_MS = 6000;
export const TIMEOUT_CONVERSAS_MS = 4000;

export async function chatwootGet<T>(path: string, timeoutMs = TIMEOUT_BUSCA_MS, signal?: AbortSignal): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(`${baseApiConta()}${path}`, {
      headers: { api_access_token: CHATWOOT_API_TOKEN, Accept: "application/json" },
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const e = new Error(`NovaZap respondeu ${res.status} em ${path}`) as ChatwootHttpError;
      e.http = res.status;
      throw e;
    }
    return (await res.json()) as T;
  } catch (e) {
    if ((e as Error).name === "AbortError") {
      const t = new Error(`NovaZap não respondeu em ${timeoutMs} ms (${path})`) as ChatwootHttpError;
      t.http = 504;
      throw t;
    }
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Busca do fork: `{payload:{contacts:[...]}}`, 15 por página. */
export async function buscarContatosPorTexto(q: string, page = 1, signal?: AbortSignal): Promise<ContatoBruto[]> {
  const r = await chatwootGet<{ payload?: { contacts?: ContatoBruto[] } }>(
    `/search/contacts?q=${encodeURIComponent(q)}&page=${page}`,
    TIMEOUT_BUSCA_MS,
    signal
  );
  return r?.payload?.contacts ?? [];
}

/** Conversas do contato (ordem last_activity_at desc). */
export async function listarConversasContato(contactId: number, signal?: AbortSignal): Promise<ConversaBruta[]> {
  const r = await chatwootGet<{ payload?: ConversaBruta[] }>(
    `/contacts/${contactId}/conversations`,
    TIMEOUT_CONVERSAS_MS,
    signal
  );
  return r?.payload ?? [];
}

// Nomes das caixas de entrada — mudam raramente; cache de 30 min por processo.
const CACHE_INBOX_MS = 30 * 60 * 1000;
let cacheInboxes: { em: number; dados: Map<number, string> } | null = null;

export async function listarInboxes(signal?: AbortSignal): Promise<Map<number, string>> {
  if (cacheInboxes && Date.now() - cacheInboxes.em < CACHE_INBOX_MS) return cacheInboxes.dados;
  const r = await chatwootGet<{ payload?: { id: number; name?: string | null }[] }>("/inboxes", TIMEOUT_CONVERSAS_MS, signal);
  const dados = new Map<number, string>();
  for (const i of r?.payload ?? []) if (i?.id != null) dados.set(Number(i.id), String(i.name || `Caixa ${i.id}`));
  cacheInboxes = { em: Date.now(), dados };
  return dados;
}
