// Config da SC — pessoas fixas por etapa + limiares do gatilho de bloqueio.
// GET  lê a config (qualquer usuário do módulo tickets, p/ a UI saber o papel).
// PUT  grava (só admin) — upsert na linha singleton (id=true).
import { NextRequest, NextResponse } from 'next/server'
import { autenticar, exigirAdmin } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'
import { carregarConfigCompras } from '@/lib/tickets/compras-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const config = await carregarConfigCompras()
  return NextResponse.json({ config })
}

async function usuarioAtivo(id: string): Promise<boolean> {
  if (!id) return true // vazio = "não designado", permitido
  const { data } = await supabaseAdmin.from('financeiro_usu').select('ativo').eq('id', id).maybeSingle()
  return !!data && data.ativo !== false
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export async function PUT(req: NextRequest) {
  const auth = await exigirAdmin(req)
  if (!auth) return NextResponse.json({ error: 'Só administradores configuram a SC.' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const diretoria = String(body.diretoria_id || '').trim() || null
  const financeiro = String(body.financeiro_id || '').trim() || null
  const comprador = String(body.comprador_id || '').trim() || null

  for (const [rotulo, id] of [['Diretoria', diretoria], ['Financeiro', financeiro], ['Comprador', comprador]] as const) {
    if (id && !(await usuarioAtivo(id))) return NextResponse.json({ error: `${rotulo}: usuário inválido ou inativo` }, { status: 400 })
  }

  const { error } = await supabaseAdmin.from('tickets_compras_config').upsert({
    id: true,
    diretoria_id: diretoria,
    financeiro_id: financeiro,
    comprador_id: comprador,
    valor_limite_bloqueio: num(body.valor_limite_bloqueio),
    qtd_excesso_estoque: num(body.qtd_excesso_estoque),
    atualizado_em: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const config = await carregarConfigCompras()
  return NextResponse.json({ ok: true, config })
}
