// REUNIÕES — transmissão ao vivo: gravação no bucket do Supabase + perguntas de quem assiste (José, 17/11/2026).
// POST { acao: 'url_envio', inicio, parte }            → { bucket, key, token }  envio assinado p/ o PC da sala subir a parte direto no Storage
// POST { acao: 'registrar', key, inicio, fim, bytes }  → guarda a parte em tickets.payload.gravacoes
// POST { acao: 'pergunta', texto }                     → pergunta escrita de quem assiste (evento da reunião)
// GET  ?key=…                                          → { url }  URL assinada p/ tocar (1 h); só até 60 dias
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets, registrarEvento } from '@/lib/tickets/server'
import { podeConduzir } from '@/lib/reunioes/regras'
import { carregarReuniao, podeVerReuniao } from '@/lib/reunioes/server'
import { BUCKET_GRAVACOES, DIAS_GUARDA, chaveGravacao, garantirBucket, type GravacaoParte } from '@/lib/reunioes/gravacoes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const erro = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status })

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
  const { data, error } = await supabaseAdmin.storage.from(BUCKET_GRAVACOES).createSignedUrl(key, 3600)
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

  if (!transmite) return erro('Só quem participa da reunião grava.', 403)
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
