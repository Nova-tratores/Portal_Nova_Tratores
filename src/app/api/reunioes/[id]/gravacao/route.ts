// REUNIÕES — transmissão ao vivo: gravação no bucket do Supabase + perguntas de quem assiste (José, 17/11/2026).
// POST { acao: 'url_envio', inicio, parte }            → { bucket, key, token }  envio assinado p/ o PC da sala subir a parte direto no Storage
// POST { acao: 'registrar', key, inicio, fim, bytes }  → guarda a parte em tickets.payload.gravacoes
// POST { acao: 'pergunta', texto }                     → pergunta escrita de quem assiste (evento da reunião)
// POST { acao: 'ingresso' }                           → { ingresso, nome }  prova de login p/ entrar na transmissão (30 min)
// POST { acao: 'conferir', ingresso }                → { usuario_id, nome }  o PC da sala confere antes de aceitar
// POST { acao: 'apagar', key }                        → só Dev: apaga a parte do bucket e da lista (fica no histórico)
// GET  ?key=…[&baixar=1]                              → { url }  URL assinada p/ tocar ou BAIXAR (1 h); só até 60 dias
import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets, registrarEvento } from '@/lib/tickets/server'
import { podeConduzir } from '@/lib/reunioes/regras'
import { carregarReuniao, podeVerReuniao } from '@/lib/reunioes/server'
import { BUCKET_GRAVACOES, DIAS_GUARDA, chaveGravacao, garantirBucket, type GravacaoParte } from '@/lib/reunioes/gravacoes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

// Ingresso da transmissão: só quem está logado e pode ver a reunião entra (José, 17/11/2026).
// O canal de sinais do tempo real é aberto; o PC da sala só liga para quem traz um ingresso válido.
const segredo = () => process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.CRON_SECRET || ''
const assinar = (corpo: string) => createHmac('sha256', segredo()).update(corpo).digest('base64url')
function emitirIngresso(reuniaoId: string, userId: string) {
  const corpo = Buffer.from(JSON.stringify({ r: reuniaoId, u: userId, exp: Date.now() + 30 * 60_000 })).toString('base64url')
  return `${corpo}.${assinar(corpo)}`
}
function lerIngresso(ingresso: string, reuniaoId: string): string | null {
  const [corpo, sig] = String(ingresso || '').split('.')
  if (!corpo || !sig || !segredo()) return null
  const esperado = Buffer.from(assinar(corpo)); const veio = Buffer.from(sig)
  if (esperado.length !== veio.length || !timingSafeEqual(esperado, veio)) return null
  try {
    const j = JSON.parse(Buffer.from(corpo, 'base64url').toString()) as { r: string; u: string; exp: number }
    return j.r === reuniaoId && j.exp > Date.now() ? j.u : null
  } catch { return null }
}
async function nomeDe(userId: string) {
  const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', userId).maybeSingle()
  return (data as { nome?: string } | null)?.nome || 'Alguém'
}

async function base(req: NextRequest, id: string) {
  const auth = await autenticar(req)
  if (!auth) return { resp: erro('Não autenticado', 401) }
  if (!temModuloTickets(auth)) return { resp: erro('Sem permissão', 403) }
  const r = await carregarReuniao(id)
  if (!r || !(await podeVerReuniao(r, auth))) return { resp: erro('Reunião não encontrada', 404) }
  return { auth, r }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = await base(req, id)
  if ('resp' in b) return b.resp
  const key = req.nextUrl.searchParams.get('key') || ''
  const lista = ((b.r.ticket.payload as { gravacoes?: GravacaoParte[] } | null)?.gravacoes || [])
  const g = lista.find((x) => x.key === key)
  if (!g) return erro('Gravação não encontrada', 404)
  if (Date.now() - new Date(g.inicio).getTime() > DIAS_GUARDA * 86400_000) return erro(`A gravação passou de ${DIAS_GUARDA} dias e foi apagada.`, 410)
  const baixar = req.nextUrl.searchParams.get('baixar') === '1'
  const nomeArq = `reuniao-${b.r.ticket.numero}-${g.inicio.slice(0, 10)}-parte${g.parte}.webm`
  const { data, error } = await supabaseAdmin.storage.from(BUCKET_GRAVACOES).createSignedUrl(key, 3600, baixar ? { download: nomeArq } : undefined)
  if (error || !data) return erro(error?.message || 'Não deu para abrir a gravação', 500)
  return NextResponse.json({ url: data.signedUrl })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = await base(req, id)
  if ('resp' in b) return b.resp
  const { auth, r } = b
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const acao = String(body.acao || '')
  const transmite = podeConduzir(r.presencas, auth.userId, auth.isAdmin) || r.presencas.some((p) => p.usuario_id === auth.userId)

  if (acao === 'pergunta') {
    const texto = String(body.texto || '').trim().slice(0, 1000)
    if (!texto) return erro('Escreva a pergunta.')
    await registrarEvento(id, auth.userId, 'comentario', { texto, ao_vivo: true })   // tipo fixo no banco (CHECK): vai como comentário marcado
    return NextResponse.json({ ok: true })
  }

  // quem pode ver a reunião (já passou pelo login e por podeVerReuniao) ganha o ingresso
  if (acao === 'ingresso') return NextResponse.json({ ingresso: emitirIngresso(id, auth.userId), nome: await nomeDe(auth.userId) })

  // apagar gravação: só Dev (José, 17/11/2026)
  if (acao === 'apagar') {
    if (!auth.isDev) return erro('Só quem é Dev apaga gravação.', 403)
    const key = String(body.key || '')
    if (!key.startsWith(`${id}/`)) return erro('Arquivo inválido')
    const { error: e1 } = await supabaseAdmin.storage.from(BUCKET_GRAVACOES).remove([key])
    if (e1) return erro(e1.message, 500)
    const { data: t } = await supabaseAdmin.from('tickets').select('payload').eq('id', id).single()
    const payload = { ...((t?.payload as Record<string, unknown>) || {}) }
    const antes = (payload.gravacoes as GravacaoParte[]) || []
    const g = antes.find((x) => x.key === key)
    payload.gravacoes = antes.filter((x) => x.key !== key)
    const { error: e2 } = await supabaseAdmin.from('tickets').update({ payload }).eq('id', id)
    if (e2) return erro(e2.message, 500)
    await registrarEvento(id, auth.userId, 'edicao', { campo: 'gravacao_apagada', key, parte: g?.parte ?? null, inicio: g?.inicio ?? null, bytes: g?.bytes ?? null })
    return NextResponse.json({ ok: true })
  }

  if (!transmite) return erro('Só quem participa da reunião grava.', 403)

  if (acao === 'conferir') {
    const u = lerIngresso(String(body.ingresso || ''), id)
    if (!u) return erro('Ingresso inválido ou vencido', 403)
    return NextResponse.json({ usuario_id: u, nome: await nomeDe(u) })
  }
  if (r.ticket.reuniao_etapa === 'cancelada') return erro('Reunião cancelada.', 409)

  if (acao === 'url_envio') {
    const inicio = String(body.inicio || '')
    const parte = Math.max(1, Math.min(200, Math.round(Number(body.parte) || 1)))
    if (!/^\d{4}-\d{2}-\d{2}T/.test(inicio)) return erro('inicio inválido')
    const key = chaveGravacao(id, inicio, parte)
    try { await garantirBucket() } catch (e) { return erro((e as Error).message, 503) }
    const { data, error } = await supabaseAdmin.storage.from(BUCKET_GRAVACOES).createSignedUploadUrl(key, { upsert: true })
    if (error || !data) return erro(error?.message || 'Não deu para preparar o envio', 500)
    return NextResponse.json({ bucket: BUCKET_GRAVACOES, key, token: data.token })
  }

  if (acao === 'registrar') {
    const key = String(body.key || '')
    if (!key.startsWith(`${id}/`) || !key.endsWith('.webm')) return erro('Arquivo inválido')
    const nova: GravacaoParte = {
      key, inicio: String(body.inicio || ''), fim: String(body.fim || new Date().toISOString()),
      bytes: Math.max(0, Number(body.bytes) || 0), parte: Math.max(1, Number(body.parte) || 1), por: auth.userId,
    }
    // relê o payload na hora (a ata é salva enquanto se digita) para não apagar o que mudou
    const { data: t } = await supabaseAdmin.from('tickets').select('payload').eq('id', id).single()
    const payload = { ...((t?.payload as Record<string, unknown>) || {}) }
    const lista = ((payload.gravacoes as GravacaoParte[]) || []).filter((g) => g.key !== key)
    payload.gravacoes = [...lista, nova].sort((a, b2) => a.key.localeCompare(b2.key))
    const { error } = await supabaseAdmin.from('tickets').update({ payload }).eq('id', id)
    if (error) return erro(error.message, 500)
    if (nova.parte === 1) await registrarEvento(id, auth.userId, 'edicao', { campo: 'gravacao', key })
    return NextResponse.json({ ok: true })
  }

  return erro('Ação desconhecida')
}
