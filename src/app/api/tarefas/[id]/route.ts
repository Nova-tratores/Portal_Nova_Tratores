import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const TBL = 'portal_tarefas'

// Prazo é um DIA. Só a data ('AAAA-MM-DD') vira meio-dia de Brasília — o
// new Date('AAAA-MM-DD') era 00:00 UTC = dia ANTERIOR em -03:00.
function prazoParaGravar(prazo: unknown): string | null {
  if (!prazo) return null
  const s = String(prazo)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T12:00:00-03:00'
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (body.done !== undefined) {
      update.concluida = body.done
      update.concluida_em = body.done ? new Date().toISOString() : null
    }
    if (body.titulo !== undefined) update.titulo = body.titulo
    if (body.descricao !== undefined) update.descricao = body.descricao
    if (body.prioridade !== undefined) update.prioridade = body.prioridade
    if (body.prazo !== undefined) update.prazo = prazoParaGravar(body.prazo)
    if (body.atribuido_a !== undefined) update.atribuido_a = body.atribuido_a || null

    const { data, error } = await supabase
      .from(TBL)
      .update(update)
      .eq('id', parseInt(id))
      .select()
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json(data)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
