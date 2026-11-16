// Envio de foto do módulo Site (foto de máquina ou arte de promoção) para o Storage público site-produtos.
// Recebe multipart: arquivo (jpg/png/webp, até 8 MB) + pasta (slug da máquina ou "promocoes"). Devolve a URL pública.
import { NextResponse } from 'next/server'
import { guardarSite, sb } from '@/lib/site/server'

export const runtime = 'nodejs'

const TIPOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

const VIDEOS: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov' }
const telaDa = (pasta: string) => (pasta === 'promocoes' ? 'promocoes' : pasta === 'posts' ? 'conteudo' : pasta === 'campanhas' ? 'campanhas' : 'catalogo') as 'promocoes' | 'conteudo' | 'catalogo' | 'campanhas'

/** Vídeo (TikTok/Shorts/Reels, 12/11): pesado demais para passar pelo portal. Recebe JSON { pasta, tipo, tamanho } e
 *  devolve um endereço assinado para o navegador mandar o arquivo direto para o Storage (PUT), mais a URL pública. */
async function enderecoDeVideo(req: Request) {
  const b = (await req.json().catch(() => null)) as { pasta?: string; tipo?: string; tamanho?: number } | null
  const pasta = String(b?.pasta || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 100) || 'avulsas'
  const tela = telaDa(pasta)
  const g = await guardarSite(req, tela, true)
  if (g.resposta) return g.resposta
  const u = g.user
  if (!(u.isAdmin || u.modulos.includes('site') || u.modulos.includes(`site:${tela}:editar`))) return NextResponse.json({ ok: false, erro: 'sem permissão para enviar vídeo' }, { status: 403 })
  const ext = VIDEOS[String(b?.tipo || '')]
  if (!ext) return NextResponse.json({ ok: false, erro: 'Use vídeo MP4 ou MOV' }, { status: 400 })
  if (Number(b?.tamanho || 0) > 300 * 1024 * 1024) return NextResponse.json({ ok: false, erro: 'Vídeo acima de 300 MB: exporte menor (1080×1920, até 60 s)' }, { status: 400 })
  const caminho = `${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
  const { data, error } = await sb.storage.from('site-produtos').createSignedUploadUrl(caminho)
  if (error || !data) return NextResponse.json({ ok: false, erro: /mime|size|bucket/i.test(error?.message || '') ? 'Rode sql/site-redes.sql no projeto do portal (libera vídeo na pasta).' : error?.message || 'erro' }, { status: 500 })
  return NextResponse.json({ ok: true, envio: data.signedUrl, url: sb.storage.from('site-produtos').getPublicUrl(caminho).data.publicUrl })
}

export async function POST(req: Request) {
  if ((req.headers.get('content-type') || '').includes('application/json')) return enderecoDeVideo(req)
  const form = await req.formData().catch(() => null)
  const pasta = String(form?.get('pasta') || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 100) || 'avulsas'
  const g = await guardarSite(req, telaDa(pasta), true)
  if (g.resposta) return g.resposta
  const u = g.user
  const acao = `site:${telaDa(pasta)}:editar`
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
