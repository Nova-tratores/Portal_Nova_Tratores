// ESTIMATIVA DE TEMPO (24/11/2026) — manual + automática, com a previsão de término na hora.
// GET /api/trabalho/estimativa?ticket=<id>
//   -> { atual: horas já estimadas | null, sugestao: { horas, tamanho, motivo, base } | null,
//        tamanhos: [{ id, rotulo, horas, dica, termina }], capacidade }
// "termina" = último dia do ticket se ele tiver aquele tamanho, encaixado na fila de quem faz.
// A sugestão olha os tickets que essa pessoa já terminou (parecidos pesam mais), com o tempo
// REAL do Modo Agora quando existe. Gravar continua pela /api/tickets/[id]/acoes (editar dias × horas_dia).
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

export async function GET(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return erro('Não autenticado', 401)
  if (!temModuloTickets(auth)) return erro('Sem permissão', 403)
  const id = req.nextUrl.searchParams.get('ticket') || ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return erro('Ticket inválido')
  const { data: t } = await supabaseAdmin.from('tickets').select('id, titulo, categoria, quadro_id, responsavel_id, solicitante_id, payload').eq('id', id).maybeSingle()
  if (!t) return erro('Ticket não encontrado', 404)
  if (t.responsavel_id !== auth.userId && t.solicitante_id !== auth.userId && !auth.isAdmin) return erro('Sem permissão', 403)
  const dono = t.responsavel_id as string

  // Histórico de quem FAZ: o que terminou (até 150), com o estimado e o real.
  const { data: feitos } = await supabaseAdmin.from('tickets').select('id, titulo, categoria, quadro_id, payload')
    .eq('responsavel_id', dono).in('status', ['resolvido', 'fechado']).neq('id', id).order('updated_at', { ascending: false }).limit(150)
  const ids = (feitos || []).map((f) => f.id as string)
  const real = new Map<string, number>()
  if (ids.length) {
    const { data: tempos, error } = await supabaseAdmin.from('tickets_tempo').select('ticket_id, inicio, fim').in('ticket_id', ids).not('fim', 'is', null)
    if (!error) for (const l of (tempos || []) as { ticket_id: string; inicio: string; fim: string }[]) {
      real.set(l.ticket_id, (real.get(l.ticket_id) || 0) + (Date.parse(l.fim) - Date.parse(l.inicio)) / 3600000)
    }
  }
  const est = (p: unknown) => { const x = (p || {}) as { dias?: number; horas_dia?: number }; return x.horas_dia ? (x.dias || 1) * x.horas_dia : null }
  const historico: Feito[] = (feitos || []).map((f) => ({
    titulo: f.titulo as string, categoria: f.categoria as string | null, quadro_id: f.quadro_id as string | null,
    estimado: est(f.payload), real: (real.get(f.id as string) || 0) >= 0.25 ? Math.round(real.get(f.id as string)! * 2) / 2 : null,
  }))
  const sugestao = sugerirHoras({ titulo: t.titulo as string, categoria: t.categoria as string | null, quadro_id: t.quadro_id as string | null }, historico)

  const totais = [...new Set([...TAMANHOS.map((x) => x.horas), ...(sugestao ? [sugestao.horas] : [])])]
  const termina = await previsoesDoTicket(dono, id, totais)
  return NextResponse.json({
    atual: est(t.payload),
    capacidade: CAPACIDADE_PADRAO,
    sugestao: sugestao ? { ...sugestao, termina: termina[String(sugestao.horas)] || '' } : null,
    tamanhos: TAMANHOS.map((x) => ({ ...x, termina: termina[String(x.horas)] || '' })),
  })
}
