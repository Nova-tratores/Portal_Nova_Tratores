// =============================================================================
// API: monitor/anomalia/[id]/status - port FIEL de
// POST /api/monitor/anomalia/:id/status do server.js (linhas 4241-4255).
// Marca uma anomalia como resolvida ou ignorada (ou reabre) manualmente.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: Ctx) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const { id: idRaw } = await context.params
    const id = parseInt(idRaw, 10)
    // status pode vir no corpo (req.body.status) ou na query (?status=).
    let bodyStatus = ''
    try {
      const body: any = await request.json()
      bodyStatus = body?.status || ''
    } catch (_) { bodyStatus = '' }
    const novo = String(bodyStatus || request.nextUrl.searchParams.get('status') || '').toLowerCase()
    if (!['aberta', 'resolvida', 'ignorada'].includes(novo)) {
      return NextResponse.json({ erro: 'status invalido (aberta|resolvida|ignorada)' }, { status: 400 })
    }
    const patch = { status: novo, resolvido_em: novo === 'aberta' ? null : new Date().toISOString() }
    const { error } = await supabase.from('qa_anomalias').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, id, status: novo })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
