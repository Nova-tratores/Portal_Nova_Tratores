// Fotos das Peças Não Identificadas: compressão no celular, upload para o
// bucket PRIVADO `pni-fotos` (pasta do próprio usuário) e leitura por signed URL.
// Cada foto sobe em dois tamanhos: a grande (lado maior 1600px) e a miniatura
// (`_mini`, 360px) usada na lista e no PDF. A miniatura é só conveniência —
// se faltar, a tela cai para a grande.

import { supabase } from '@/lib/supabase'

export const BUCKET = 'pni-fotos'
const LADO_GRANDE = 1600
const LADO_MINI = 360

export function caminhoMini(path: string): string {
  return path.replace(/\.jpg$/i, '_mini.jpg')
}

async function carregarImagem(file: Blob): Promise<{ img: CanvasImageSource; w: number; h: number; liberar: () => void }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
    return { img: bmp, w: bmp.width, h: bmp.height, liberar: () => bmp.close() }
  } catch {
    const url = URL.createObjectURL(file)
    const img = new Image()
    await new Promise<void>((ok, erro) => {
      img.onload = () => ok()
      img.onerror = () => erro(new Error('Não foi possível ler a foto.'))
      img.src = url
    })
    return { img, w: img.naturalWidth, h: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) }
  }
}

function paraJpeg(fonte: { img: CanvasImageSource; w: number; h: number }, ladoMax: number, qualidade: number): Promise<Blob> {
  const escala = Math.min(1, ladoMax / Math.max(fonte.w, fonte.h))
  const w = Math.max(1, Math.round(fonte.w * escala))
  const h = Math.max(1, Math.round(fonte.h * escala))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Navegador sem suporte a canvas.'))
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(fonte.img, 0, 0, w, h)
  return new Promise((ok, erro) =>
    canvas.toBlob((b) => (b ? ok(b) : erro(new Error('Falha ao comprimir a foto.'))), 'image/jpeg', qualidade))
}

export async function comprimir(file: Blob): Promise<{ grande: Blob; mini: Blob }> {
  const fonte = await carregarImagem(file)
  try {
    const grande = await paraJpeg(fonte, LADO_GRANDE, 0.8)
    const mini = await paraJpeg(fonte, LADO_MINI, 0.7)
    return { grande, mini }
  } finally {
    fonte.liberar()
  }
}

/** Sobe as duas versões e devolve o caminho da grande (o que vai para a RPC). */
/** Apaga uma foto (e a miniatura) do storage — usado ao trocar. Falha silenciosa. */
export async function apagarFoto(path: string): Promise<void> {
  if (!path) return
  await supabase.storage.from(BUCKET).remove([path, caminhoMini(path)]).catch(() => null)
}

export async function enviarFoto(userId: string, fotos: { grande: Blob; mini: Blob }): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const opts = { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' }
  const { error } = await supabase.storage.from(BUCKET).upload(path, fotos.grande, opts)
  if (error) throw new Error(mensagemErro(error))
  // miniatura: falhou, segue (a tela usa a grande)
  await supabase.storage.from(BUCKET).upload(caminhoMini(path), fotos.mini, opts).catch(() => null)
  return path
}

// ── Signed URLs com cache ───────────────────────────────────────────

const VALIDADE_S = 60 * 60
const cache = new Map<string, { url: string; expira: number }>()

/** URLs assinadas para os caminhos (com cache de ~50 min). Caminho sem URL fica fora do mapa. */
export async function urlsAssinadas(paths: string[]): Promise<Record<string, string>> {
  const agora = Date.now()
  const r: Record<string, string> = {}
  const faltam: string[] = []
  for (const p of new Set(paths)) {
    const c = cache.get(p)
    if (c && c.expira > agora) r[p] = c.url
    else faltam.push(p)
  }
  for (let i = 0; i < faltam.length; i += 100) {
    const lote = faltam.slice(i, i + 100)
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(lote, VALIDADE_S)
    for (const d of data || []) {
      if (d.signedUrl && d.path) {
        r[d.path] = d.signedUrl
        cache.set(d.path, { url: d.signedUrl, expira: agora + (VALIDADE_S - 600) * 1000 })
      }
    }
  }
  return r
}

/** Miniaturas (com fallback para a foto grande quando a mini não existe). */
export async function urlsMiniaturas(paths: string[]): Promise<Record<string, string>> {
  const minis = await urlsAssinadas(paths.map(caminhoMini))
  const semMini = paths.filter((p) => !minis[caminhoMini(p)])
  const grandes = semMini.length ? await urlsAssinadas(semMini) : {}
  const r: Record<string, string> = {}
  for (const p of paths) {
    const u = minis[caminhoMini(p)] || grandes[p]
    if (u) r[p] = u
  }
  return r
}

// ── Erros ───────────────────────────────────────────────────────────

/** Mensagem pronta para a tela: falha de rede vira aviso de conexão. */
export function mensagemErro(e: unknown): string {
  const msg = typeof e === 'string' ? e
    : (e && typeof e === 'object' && 'message' in e && typeof (e as { message: unknown }).message === 'string')
      ? (e as { message: string }).message : ''
  if (!msg || /failed to fetch|networkerror|network request failed|load failed|fetch failed|timeout|aborted/i.test(msg)) {
    return 'Sem conexão com o servidor. Confira o Wi-Fi e tente de novo.'
  }
  return msg
}
