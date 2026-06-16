// =============================================================================
// API: health - port FIEL de GET /health do server.js (linhas 4732-4738).
// Healthcheck do modulo: ok + supabase + contas Omie.
// + DIAGNOSTICO TEMPORARIO da service key (remover depois): testa leitura admin
//   vs anon em contas_pagar p/ confirmar se a SUPABASE_SERVICE_ROLE_KEY surte
//   efeito em producao (ignora RLS).
// =============================================================================
import { NextResponse } from 'next/server'
import { getContasOmie } from '@/lib/dre-financeiro/omie-api'
import { supabase, supabaseAdmin } from '@/lib/dre-financeiro/supabase'

export const dynamic = 'force-dynamic'

async function contaTabela(client: any) {
  if (!client) return { count: null, error: 'client null' }
  try {
    const { count, error } = await client
      .from('contas_pagar')
      .select('*', { count: 'exact', head: true })
    return { count: count ?? null, error: error ? error.message : null }
  } catch (e: any) {
    return { count: null, error: e?.message || String(e) }
  }
}

export async function GET() {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  const [adminRead, anonRead] = await Promise.all([
    contaTabela(supabaseAdmin),
    contaTabela(supabase),
  ])
  return NextResponse.json({
    ok: true,
    supabase: !!supabase,
    contas: getContasOmie().map((c: any) => c.id),
    diag: {
      service_key_present: !!k,
      service_key_len: k.length,
      service_key_tail: k ? k.slice(-6) : null,
      admin_contas_pagar: adminRead,
      anon_contas_pagar: anonRead,
    },
  })
}
