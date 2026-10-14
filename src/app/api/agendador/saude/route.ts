// Saúde do agendador — para o vigia externo (workflow do GitHub, Etapa 4 do plano
// docs/omie-fila-agendador-plano.md). Público e sem dados sensíveis: só diz se o
// laço bateu nos últimos 10 min. 503 = parado (o workflow falha e avisa).
// GET /api/agendador/saude -> { ok, batida_em, ha_segundos }
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LIMITE_S = 10 * 60

export async function GET() {
  const { data, error } = await supabaseAdmin.from('agendador_estado').select('batida_em').eq('id', 1).maybeSingle()
  if (error) return NextResponse.json({ ok: false, erro: 'sem tabela agendador_estado' }, { status: 503 })
  const ha = data?.batida_em ? Math.round((Date.now() - new Date(data.batida_em).getTime()) / 1000) : null
  const ok = ha != null && ha <= LIMITE_S
  return NextResponse.json({ ok, batida_em: data?.batida_em ?? null, ha_segundos: ha }, { status: ok ? 200 : 503 })
}
