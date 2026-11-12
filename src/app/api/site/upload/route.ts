// Envio de foto do módulo Site (foto de máquina ou arte de promoção) para o Storage público site-produtos.
// Recebe multipart: arquivo (jpg/png/webp, até 8 MB) + pasta (slug da máquina ou "promocoes"). Devolve a URL pública.
import { NextResponse } from 'next/server'
import { guardarSite, sb } from '@/lib/site/server'

export const runtime = 'nodejs'

const TIPOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null)
  const pasta = String(form?.get('pasta') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 100) || 'avulsas'
  const g = await guardarSite(req, pasta === 'promocoes' ? 'promocoes' : 'catalogo', true)
  if (g.resposta) return g.resposta
  const u = g.user
  const acao = pasta === 'promocoes' ? 'site:promocoes:editar' : 'site:catalogo:editar'
  if (!(u.isAdmin || u.modulos.includes('site') || u.modulos.includes(acao))) return NextResponse.json({ ok: false, erro: 'sem permissão para enviar foto' }, { status: 403 })
  const arq = form?.get('arquivo')
  if (!(arq instanceof File)) return NextResponse.json({ ok: false, erro: 'nenhuma foto enviada' }, { status: 400 })
  const ext = TIPOS[arq.type]
  if (!ext) return NextResponse.json({ ok: false, erro: 'Use foto JPG, PNG ou WebP' }, { status: 400 })
  if (arq.size > 8 * 1024 * 1024) return NextResponse.json({ ok: false, erro: 'Foto acima de 8 MB: diminua antes de enviar' }, { status: 400 })
  const caminho = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
  const { error } = await sb.storage.from('site-produtos').upload(caminho, Buffer.from(await arq.arrayBuffer()), { contentType: arq.type, cacheControl: '31536000', upsert: false })
  if (error) {
    const falta = /bucket|not found/i.test(error.message)
    return NextResponse.json({ ok: false, erro: falta ? 'Rode sql/site-produtos-promocoes.sql no projeto do portal (cria a pasta de fotos).' : error.message }, { status: falta ? 503 : 500 })
  }
  const { data } = sb.storage.from('site-produtos').getPublicUrl(caminho)
  return NextResponse.json({ ok: true, url: data.publicUrl })
}
