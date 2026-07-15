// Tickets — fila pessoal (plano de trabalho por usuário).
// GET /api/tickets/plano            → { plano: TicketPlanoItem[] }
// PUT /api/tickets/plano            { ordem?: string[], atual?: string | null }
//
// Planejamento PESSOAL: a ordem em que o responsável pretende trabalhar os
// tickets da fila dele e qual está "mexendo agora" (um por vez). NÃO é
// atividade do ticket — não gera evento na timeline, não notifica ninguém
// e não toca em ultima_atividade_em.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'
import { STATUS_FINAIS, type TicketPlanoItem } from '@/lib/tickets/constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function erro(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status })
}

async function lerPlano(userId: string): Promise<TicketPlanoItem[]> {
  const { data } = await supabaseAdmin
    .from('tickets_plano')
    .select('ticket_id, posicao, atual')
    .eq('user_id', userId)
    .order('posicao')
  return (data || []) as TicketPlanoItem[]
}

// Ids de tickets elegíveis ao plano: o usuário é o responsável e o ticket
// não está encerrado (resolvido ainda conta — continua na fila).
async function filtrarElegiveis(ids: string[], userId: string): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const { data } = await supabaseAdmin
    .from('tickets')
    .select('id')
    .in('id', ids)
    .eq('responsavel_id', userId)
    .not('status', 'in', `(${STATUS_FINAIS.join(',')})`)
  return new Set((data || []).map((t) => t.id))
}

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  return NextResponse.json({ plano: await lerPlano(auth.userId) })
}

export async function PUT(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return erro('JSON inválido') }

  const temOrdem = Array.isArray(body.ordem)
  const temAtual = 'atual' in body
  if (!temOrdem && !temAtual) return erro('Nada para alterar')

  const agora = new Date().toISOString()

  // ------------------------------------------------- ordem (substituição total)
  if (temOrdem) {
    const brutos = (body.ordem as unknown[]).map((v) => String(v)).filter(Boolean)
    if (brutos.length > 500) return erro('Ordem grande demais')
    const unicos = [...new Set(brutos)]
    // Ids que saíram da fila (transferido/encerrado entre o load e o PUT)
    // são descartados em silêncio — o resto do plano ainda vale.
    const elegiveis = await filtrarElegiveis(unicos, auth.userId)
    const ordem = unicos.filter((id) => elegiveis.has(id))

    if (ordem.length > 0) {
      // Upsert sem a coluna "atual": o PostgREST só atualiza as colunas
      // presentes no payload, então o "mexendo agora" existente é preservado.
      const linhas = ordem.map((ticket_id, i) => ({
        user_id: auth.userId, ticket_id, posicao: i, updated_at: agora,
      }))
      const { error } = await supabaseAdmin
        .from('tickets_plano')
        .upsert(linhas, { onConflict: 'user_id,ticket_id' })
      if (error) return erro(error.message, 500)
    }

    // Remove do plano o que ficou fora da lista enviada.
    let del = supabaseAdmin.from('tickets_plano').delete().eq('user_id', auth.userId)
    if (ordem.length > 0) del = del.not('ticket_id', 'in', `(${ordem.join(',')})`)
    const { error: errDel } = await del
    if (errDel) return erro(errDel.message, 500)
  }

  // ------------------------------------------------------- "mexendo agora"
  if (temAtual) {
    const atual = body.atual === null ? null : String(body.atual)

    const { error: errClear } = await supabaseAdmin
      .from('tickets_plano')
      .update({ atual: false, updated_at: agora })
      .eq('user_id', auth.userId)
      .eq('atual', true)
    if (errClear) return erro(errClear.message, 500)

    if (atual) {
      const elegiveis = await filtrarElegiveis([atual], auth.userId)
      if (!elegiveis.has(atual)) return erro('Este ticket não está mais na sua fila')
      const { data: existente } = await supabaseAdmin
        .from('tickets_plano')
        .select('ticket_id')
        .eq('user_id', auth.userId)
        .eq('ticket_id', atual)
        .maybeSingle()
      const { error: errSet } = await supabaseAdmin
        .from('tickets_plano')
        .upsert({
          user_id: auth.userId, ticket_id: atual, atual: true, updated_at: agora,
          // Linha nova entra no topo dos posicionados; um PUT de ordem normaliza depois.
          ...(existente ? {} : { posicao: -1 }),
        }, { onConflict: 'user_id,ticket_id' })
      if (errSet) return erro(errSet.message, 500)
    }
  }

  return NextResponse.json({ ok: true, plano: await lerPlano(auth.userId) })
}
