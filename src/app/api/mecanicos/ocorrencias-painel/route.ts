// Radar de Ocorrências do pós-vendas (José, 16/10/2026).
// GET ?mes=YYYY-MM → ocorrências do mês (com as defesas), escudo de 100 pontos por técnico,
//   motivos, série de 6 meses e TODAS as defesas aguardando julgamento (de qualquer mês).
// POST {justificativaId, aprovada} → julga a defesa (antes só o RH julgava). Aceita = os pontos
//   deixam de contar (descontar_comissao=false); recusada = seguem valendo. Avisa o técnico no
//   app e no portal, como o RH fazia.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { mesSP, ocorrenciasPainelComCache, esquecerOcorrenciasPainel } from '@/lib/mecanicos/ocorrencias-painel-vivo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (guarda.resposta) return guarda.resposta
  const q = req.nextUrl.searchParams.get('mes') || ''
  const mes = /^\d{4}-\d{2}$/.test(q) ? q : mesSP()
  try {
    // responde na hora com o último resultado guardado; refaz por trás se passou de 2 min
    const { dados } = await ocorrenciasPainelComCache(mes, req.nextUrl.searchParams.get('forcar') === '1')
    return NextResponse.json({
      ...dados,
      podeJulgar: guarda.user.isAdmin || guarda.user.modulos.includes('mecanicos') || guarda.user.modulos.includes('mecanicos:atualizar_ocorrencia'),
    })
  } catch (e) {
    console.error('[mecanicos/ocorrencias-painel]', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Falha ao carregar as ocorrências' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos', acao: 'atualizar_ocorrencia' }])
  if (guarda.resposta) return guarda.resposta
  const body = await req.json().catch(() => ({}))
  const id = Number(body?.justificativaId)
  const aprovada = body?.aprovada === true
  if (!Number.isFinite(id) || id <= 0 || typeof body?.aprovada !== 'boolean') {
    return NextResponse.json({ error: 'Informe a defesa e a decisão.' }, { status: 400 })
  }
  const { data: just, error } = await sb.from('tecnico_justificativas').select('id, tecnico_nome, status').eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!just) return NextResponse.json({ error: 'Defesa não encontrada.' }, { status: 404 })
  if (just.status !== 'pendente') return NextResponse.json({ error: 'Essa defesa já foi julgada.' }, { status: 409 })

  const quem = `${autorDe(guarda.user)} (Pós-Vendas)`
  // só julga se ainda estiver pendente (dois julgando ao mesmo tempo: o segundo recebe 409)
  const { data: feito, error: e2 } = await sb.from('tecnico_justificativas')
    .update({ status: aprovada ? 'aprovada' : 'recusada', descontar_comissao: !aprovada, data_avaliacao: new Date().toISOString(), avaliado_por: quem })
    .eq('id', id).eq('status', 'pendente').select('id')
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
  if (!feito?.length) return NextResponse.json({ error: 'Essa defesa já foi julgada.' }, { status: 409 })
  await esquecerOcorrenciasPainel().catch(() => {})

  // avisa o técnico (app + portal) — nunca derruba o julgamento
  try {
    await sb.from('mecanico_notificacoes').insert({
      tecnico_nome: just.tecnico_nome, tipo: 'execucao',
      titulo: `Justificativa ${aprovada ? 'aceita' : 'recusada'}`,
      descricao: aprovada ? 'Sua justificativa foi aceita — os pontos da ocorrência não contam mais.' : 'Sua justificativa foi recusada — os pontos continuam valendo.',
      link: '/ocorrencias', lida: false,
    })
    const { data: donos } = await sb.from('portal_permissoes').select('user_id').ilike('mecanico_tecnico_nome', String(just.tecnico_nome).replace(/[%_*]/g, '')).limit(1)
    if (donos?.[0]?.user_id) {
      await sb.from('portal_notificacoes').insert({
        user_id: donos[0].user_id, tipo: 'pos',
        titulo: `Justificativa ${aprovada ? 'aceita' : 'recusada'} (Pós-Vendas)`,
        descricao: aprovada ? 'Sua defesa foi aceita — os pontos da ocorrência foram anulados.' : 'Sua defesa foi recusada — os pontos continuam valendo.',
        link: '/meu-painel',
      })
    }
  } catch { /* best-effort */ }
  return NextResponse.json({ ok: true })
}
