// ════════════════════════════════════════════════════════════════════
// Cliente Supabase server-side do Cronograma (service role).
// ⚠️ Uso EXCLUSIVO server-side — nunca importar em componente client.
// Use sempre .schema('cronograma') nas chamadas (o schema não é o public).
// Aceita os dois conjuntos de nomes de env, como o módulo dre-financeiro.
// ════════════════════════════════════════════════════════════════════

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

/** Cliente admin (service role) para o recálculo autoritativo. */
export function cronogramaAdmin(): SupabaseClient {
  const key = service || anon;
  if (!url || !key) {
    throw new Error('[cronograma] Supabase URL/key ausentes — configure .env.local');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
