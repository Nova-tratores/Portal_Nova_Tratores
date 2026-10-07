// Fecha um card "Precisa de atendimento" (tratorilson_solicitacoes tipo 'humano')
// decidindo o que acontece com a MEMÓRIA do Tratorilson:
//   POST { id, acao:'atualizar', resposta }  → a resposta vira REGRA na memória
//        (da próxima vez ele mesmo responde) e o card é concluído
//   POST { id, acao:'dispensar', motivo }    → concluído SEM ensinar; aparece na
//        aba "Dispensadas sem atualizar" (dá para atualizar depois)
// Também serve para atualizar depois um card já dispensado.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { gravarRegra } from '@/lib/assistente/memoria'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!auth.isAdmin && !auth.modulos.some((m) => m === 'pos' || m.startsWith('pos:'))) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const id = Number(body?.id)
  const acao = String(body?.acao || '')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
  const quem = auth.email || auth.userId
  const agora = new Date().toISOString()

  const { data: card, error } = await supabaseAdmin.from('tratorilson_solicitacoes').select('id, resumo, contato_nome, memoria').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: 'Rode sql/tratorilson-solicitacoes.sql (v3).' }, { status: 503 })
  if (!card) return NextResponse.json({ error: 'Card não encontrado' }, { status: 404 })
  if (card.memoria === 'atualizada') return NextResponse.json({ error: 'A memória deste card já foi atualizada.' }, { status: 409 })

  const fechar = { fase: 'concluida', status: 'atendida', atendida_por: quem, atendida_em: agora, memoria_por: quem, memoria_em: agora }

  if (acao === 'atualizar') {
    const resposta = String(body?.resposta || '').trim().slice(0, 1500)
    if (resposta.length < 5) return NextResponse.json({ error: 'Escreva o que o Tratorilson deve responder.' }, { status: 400 })
    const situacao = String(card.resumo || '').replace(/^Cliente sem resposta há [^:]+:\s*/, '').slice(0, 350)
    const conteudo = `Situação ensinada pela equipe do pós-vendas. Quando um cliente escrever algo como: ${situacao} — faça/responda assim: ${resposta}`
    const regraId = await gravarRegra(conteudo, 'clientes', `atendimento-zap:${quem}`, 'chatwoot')
    if (!regraId) return NextResponse.json({ error: 'Não consegui gravar na memória do Tratorilson.' }, { status: 500 })
    const { error: e2 } = await supabaseAdmin.from('tratorilson_solicitacoes')
      .update({ ...fechar, memoria: 'atualizada', memoria_resposta: resposta, memoria_regra_id: regraId, dispensa_motivo: null }).eq('id', id)
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
    return NextResponse.json({ ok: true, regraId })
  }

  if (acao === 'dispensar') {
    const motivo = String(body?.motivo || '').trim().slice(0, 500)
    if (motivo.length < 3) return NextResponse.json({ error: 'Diga por que não vai atualizar a memória.' }, { status: 400 })
    const { error: e2 } = await supabaseAdmin.from('tratorilson_solicitacoes')
      .update({ ...fechar, memoria: 'dispensada', dispensa_motivo: motivo }).eq('id', id)
    if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })
}
