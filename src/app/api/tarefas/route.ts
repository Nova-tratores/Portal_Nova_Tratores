import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const TBL = 'portal_tarefas'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const filter = searchParams.get('filter') || 'todas'
    const userId = searchParams.get('userId') // UUID do portal

    const { data, error } = await supabase
      .from(TBL)
      .select(`
        *,
        criador:financeiro_usu!portal_tarefas_criado_por_fkey(id, nome, avatar_url),
        atribuido:financeiro_usu!portal_tarefas_atribuido_a_fkey(id, nome, avatar_url, ativo)
      `)
      .order('created_at', { ascending: false })

    if (error) throw new Error(error.message)

    let tasks = data || []

    if (userId && filter === 'minhas') {
      tasks = tasks.filter(t => t.atribuido_a === userId)
    } else if (userId && filter === 'enviadas') {
      tasks = tasks.filter(t => t.criado_por === userId)
    }

    // Enriquecer com status calculado
    const now = new Date()
    const enriched = tasks.map(t => {
      let computed_status = 'pendente'
      if (t.concluida) computed_status = 'concluida'
      else if (t.prazo && new Date(t.prazo) < now) computed_status = 'atrasada'
      return { ...t, computed_status }
    })

    // Ordenar: atrasadas primeiro, depois pendentes por prazo
    enriched.sort((a, b) => {
      const order: Record<string, number> = { atrasada: 0, pendente: 1, concluida: 2 }
      const diff = (order[a.computed_status] ?? 1) - (order[b.computed_status] ?? 1)
      if (diff !== 0) return diff
      const aDate = a.prazo || '9999'
      const bDate = b.prazo || '9999'
      return aDate.localeCompare(bDate)
    })

    return NextResponse.json(enriched)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { titulo, descricao, prazo, prioridade, criado_por, atribuido_a } = body

    if (!titulo?.trim()) {
      return NextResponse.json({ error: 'Título obrigatório' }, { status: 400 })
    }
    if (!criado_por) {
      return NextResponse.json({ error: 'Usuário criador obrigatório' }, { status: 400 })
    }

    const insert: Record<string, unknown> = {
      titulo: titulo.trim(),
      descricao: descricao || '',
      prioridade: prioridade || 0,
      criado_por,
      atribuido_a: atribuido_a || null,
    }
    if (prazo) insert.prazo = new Date(prazo).toISOString()

    const { data, error } = await supabase.from(TBL).insert(insert).select().single()
    if (error) throw new Error(error.message)

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
