// Adaptador do client Supabase para o módulo DRE Financeiro.
//
// O dashboard original (financeiro-omie-dashboard) usava as envs
// SUPABASE_URL / SUPABASE_KEY / SUPABASE_SERVICE_KEY. No portal as envs têm
// outros nomes (NEXT_PUBLIC_SUPABASE_URL / ..._ANON_KEY / SUPABASE_SERVICE_ROLE_KEY).
// Este arquivo aceita os dois conjuntos de nomes (portal tem prioridade) para
// que omie-api.js / monitors.js sejam usados verbatim, sem alteração.
//
// ⚠️ Uso EXCLUSIVO server-side (usa a service role key). Nunca importar em
//    componentes client.
const { createClient } = require('@supabase/supabase-js');

const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL;

const anon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY;

const service =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!url || !anon) {
  console.warn('[dre-financeiro/supabase] URL/ANON ausentes - configure .env.local');
}

const supabase = (url && anon)
  ? createClient(url, anon, { auth: { persistSession: false } })
  : null;

const supabaseAdmin = (url && service)
  ? createClient(url, service, { auth: { persistSession: false } })
  : supabase;

module.exports = { supabase, supabaseAdmin };
