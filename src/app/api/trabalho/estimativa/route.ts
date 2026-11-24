// ESTIMATIVA DE TEMPO (24/11/2026) — manual + automática, com a previsão de início e término.
// GET /api/trabalho/estimativa?ticket=<id>                    -> ticket que já existe
// GET /api/trabalho/estimativa?user=<id>&titulo=..&categoria=..  -> pedido que ainda vai ser criado
//   -> { atual, capacidade, naFrente, comeca, sugestao: {horas, tamanho, motivo, termina} | null,
//        tamanhos: [{ id, rotulo, horas, dica, termina }] }
// Pedido novo (ou sem lugar na fila) entra NO FIM da fila de quem faz; "naFrente" = quantos
// trabalhos estão antes dele, "comeca" = o dia em que ele começa. A sugestão olha o que essa
// pessoa já terminou (parecidos pesam mais), com o tempo REAL do Modo Agora quando existe.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'
import { TAMANHOS, sugerirHoras, type Feito } from '@/lib/trabalho/estimativa'
import { previsoesDoTicket } from '@/lib/trabalho/fila-server'
import { CAPACIDADE_PADRAO } from '@/lib/trabalho/fila'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })
const uuid = (x: unknown) => /^[0-9a-f-]{36}$/i.test(String(x || ''))
const est = (p: unknown) => { const x = (p || {}) as { dias?: number; horas_dia?: number }; return x.horas_dia ? (x.dias || 1) * x.horas_dia : null }

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  const sp = req.nextUrl.searchParams
  const id = sp.get('ticket')

  let dono: string, alvo: { titulo: string; categoria: string | null; quadro_id: string | null }, atual: number | null = null
  if (id) {
    if (!uuid(id)) return erro('Ticket inválido')
    const { data: t } = await supabaseAdmin.from('tickets').select('id, titulo, categoria, quadro_id, responsavel_id, solicitante_id, payload').eq('id', id).maybeSingle()
    if (!t) return erro('Ticket não encontrado', 404)
    if (t.responsavel_id !== auth.userId && t.solicitante_id !== auth.userId && !auth.isAdmin) return erro('Sem permissão', 403)
    dono = t.responsavel_id as string
    alvo = { titulo: t.titulo as string, categoria: t.categoria as string | null, quadro_id: t.quadro_id as string | null }
    atual = est(t.payload)
  } else {
    // Pedido que ainda vai ser criado: qualquer um da Central pode ver a previsão (só datas e horas).
    const user = sp.get('user')
    if (!uuid(user)) return erro('Escolha a pessoa')
    dono = String(user)
    alvo = { titulo: (sp.get('titulo') || '').slice(0, 200), categoria: sp.get('categoria') || null, quadro_id: null }
  }

  // Histórico de quem FAZ: o que terminou (até 150), com o estimado e o real.
  let q = supabaseAdmin.from('tickets').select('id, titulo, categoria, quadro_id, payload')
    .eq('responsavel_id', dono).in('status', ['resolvido', 'fechado']).order('updated_at', { ascending: false }).limit(150)
  if (id) q = q.neq('id', id)
  const { data: feitos } = await q
  const ids = (feitos || []).map((f) => f.id as string)
  const real = new Map<string, number>()
  if (ids.length) {
    const { data: tempos, error } = await supabaseAdmin.from('tickets_tempo').select('ticket_id, inicio, fim').in('ticket_id', ids).not('fim', 'is', null)
    if (!error) for (const l of (tempos || []) as { ticket_id: string; inicio: string; fim: string }[]) {
      real.set(l.ticket_id, (real.get(l.ticket_id) || 0) + (Date.parse(l.fim) - Date.parse(l.inicio)) / 3600000)
    }
  }
  const historico: Feito[] = (feitos || []).map((f) => ({
    titulo: f.titulo as string, categoria: f.categoria as string | null, quadro_id: f.quadro_id as string | null,
    estimado: est(f.payload), real: (real.get(f.id as string) || 0) >= 0.25 ? Math.round(real.get(f.id as string)! * 2) / 2 : null,
  }))
  const sugestao = alvo.titulo.trim() ? sugerirHoras(alvo, historico) : null

  const totais = [...new Set([...TAMANHOS.map((x) => x.horas), ...(sugestao ? [sugestao.horas] : [])])]
  const prev = await previsoesDoTicket(dono, id, totais)
  const primeiro = prev[String(TAMANHOS[0].horas)]
  return NextResponse.json({
    atual,
    capacidade: CAPACIDADE_PADRAO,
    naFrente: primeiro?.naFrente ?? 0,
    comeca: primeiro?.inicio || '',
    sugestao: sugestao ? { ...sugestao, termina: prev[String(sugestao.horas)]?.fim || '' } : null,
    tamanhos: TAMANHOS.map((x) => ({ ...x, termina: prev[String(x.horas)]?.fim || '' })),
  })
}
