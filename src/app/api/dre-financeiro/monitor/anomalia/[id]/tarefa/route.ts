// =============================================================================
// API: monitor/anomalia/[id]/tarefa - encaminha uma anomalia do Monitor de
// Qualidade como TAREFA (/tarefas) para alguem corrigir.
//  1. Cria a tarefa em portal_tarefas (mesma forma do POST /api/tarefas).
//  2. Marca a anomalia (qa_anomalias.tarefa_id + tarefa_criada_em) p/ a linha
//     mostrar o selo "enviado para correcao" e evitar reenvio.
// Usa service-role (supabaseAdmin), espelhando o vizinho .../status/route.ts.
// =============================================================================
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: Ctx) {
  if (!supabase) return NextResponse.json({ erro: 'Supabase nao configurado' }, { status: 500 })
  try {
    const { id: idRaw } = await context.params
    const anomaliaId = parseInt(idRaw, 10)
    if (!anomaliaId) return NextResponse.json({ erro: 'id de anomalia invalido' }, { status: 400 })

    const body: any = await request.json().catch(() => ({}))
    const titulo = String(body?.titulo || '').trim()
    const criado_por = body?.criado_por || null
    const atribuido_a = body?.atribuido_a || null
    const descricao = body?.descricao || ''
    const prazo = body?.prazo || null
    if (!titulo) return NextResponse.json({ erro: 'Titulo obrigatorio' }, { status: 400 })
    if (!criado_por) return NextResponse.json({ erro: 'Usuario criador obrigatorio' }, { status: 400 })

    // 1. Cria a tarefa (mesma forma do POST /api/tarefas).
    const insert: any = {
      titulo,
      descricao,
      prioridade: body?.prioridade || 0,
      criado_por,
      atribuido_a: atribuido_a || null,
    }
    if (prazo) insert.prazo = new Date(prazo).toISOString()

    const { data: tarefa, error: errT } = await supabase.from('portal_tarefas')
      .insert(insert).select('id').single()
    if (errT) throw new Error(`criar tarefa: ${errT.message}`)

    // 2. Marca a anomalia como encaminhada para correcao.
    const { error: errA } = await supabase.from('qa_anomalias')
      .update({ tarefa_id: tarefa.id, tarefa_criada_em: new Date().toISOString() })
      .eq('id', anomaliaId)
    if (errA) throw new Error(`marcar anomalia: ${errA.message}`)

    return NextResponse.json({ ok: true, tarefa_id: tarefa.id, anomalia_id: anomaliaId })
  } catch (e: any) {
    return NextResponse.json({ erro: e.message }, { status: 500 })
  }
}
