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

// Hoje em America/Sao_Paulo (AAAA-MM-DD).
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
// Dia do prazo: os 10 primeiros caracteres (prazo antigo gravado 00:00 UTC
// guarda o dia escolhido ali; o novo, 12:00 -03:00 = 15:00 UTC, também).
const diaDoPrazo = (prazo: string) => prazo.slice(0, 10)

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

    // Enriquecer com status calculado — atrasada = o DIA do prazo já passou
    // (pelo calendário de Brasília), não a hora.
    const hoje = hojeSP()
    const enriched = tasks.map(t => {
      let computed_status = 'pendente'
      if (t.concluida) computed_status = 'concluida'
      else if (t.prazo && diaDoPrazo(String(t.prazo)) < hoje) computed_status = 'atrasada'
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
    if (prazo) insert.prazo = prazoParaGravar(prazo)

    const { data, error } = await supabase.from(TBL).insert(insert).select().single()
    if (error) throw new Error(error.message)

    return NextResponse.json(data, { status: 201 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
