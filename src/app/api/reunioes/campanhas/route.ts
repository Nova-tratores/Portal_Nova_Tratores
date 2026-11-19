// REUNIÕES — campanhas de marketing para ligar um assunto da pauta (18/11/2026).
// GET /api/reunioes/campanhas -> { campanhas: { id, nome, data_inicio, data_fim }[] }
// Rota própria (e não /api/marketing/acoes) porque quem está na reunião pode não ter o
// módulo Controle Marketing: aqui sai só o nome e as datas, nada de custo ou lead.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const { data, error } = await supabaseAdmin
    .from('mkt_acoes')
    .select('id, nome, data_inicio, data_fim')
    .is('deleted_at', null)
    .order('data_inicio', { ascending: true, nullsFirst: false })
    .order('criado_em', { ascending: true })
  // sem o módulo de marketing no banco: só não mostra o seletor
  if (error) return NextResponse.json({ campanhas: [] })
  return NextResponse.json({ campanhas: data ?? [] })
}
