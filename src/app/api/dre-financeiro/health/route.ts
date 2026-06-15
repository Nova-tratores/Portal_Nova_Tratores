// =============================================================================
// API: health - port FIEL de GET /health do server.js (linhas 4732-4738).
// Healthcheck simples do modulo: ok + se o supabase esta configurado + a lista
// de ids das contas Omie disponiveis.
// =============================================================================
import { NextResponse } from 'next/server'
import { getContasOmie } from '@/lib/dre-financeiro/omie-api'
import { supabase } from '@/lib/dre-financeiro/supabase'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    ok: true,
    supabase: !!supabase,
    contas: getContasOmie().map((c: any) => c.id)
  })
}
