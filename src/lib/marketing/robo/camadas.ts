// =============================================================================
// Arte em camadas (26/11/2026, José: "entregar o resultado em camada, de forma que qualquer coisa conseguimos editar
// o post lá no módulo de marketing"). O post guarda em site_posts.arte:
//   cena (imagem de fundo pronta) + textos + paleta + posição  →  a imagem final (midia.feed) é só o "achatado".
// Editar texto/cor/posição redesenha em <1 s e sem custo. "Nova cena" pede outra imagem à IA (centavos).
// =============================================================================
import sharp from 'sharp'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { arteDoPost } from './arte'
import { PALETAS, type Camadas, type Paleta } from './paletas'
import { montarCena } from './cena'

export type { Camadas }

const BALDE = 'site-produtos'
const txt = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/** Confere o que veio da tela (nunca confia no navegador). */
export function limparCamadas(b: Partial<Camadas>, base: Camadas): Camadas {
  const paleta = (Object.keys(PALETAS) as Paleta[]).includes(b.paleta as Paleta) ? (b.paleta as Paleta) : base.paleta
  const data = b.data === null ? null : b.data ? { nome: txt(b.data.nome, 40), dia: txt(b.data.dia, 5) } : base.data
  const frase = 'frase' in b ? txt(b.frase, 140) : base.frase
  let destaque = 'destaque' in b ? txt(b.destaque, 80) : base.destaque
  if (destaque && !frase.includes(destaque)) destaque = ''
  return {
    ...base,
    data: data && data.nome ? data : null,
    titulo: 'titulo' in b ? txt(b.titulo, 60) || base.titulo : base.titulo,
    frase, destaque, paleta,
    posicao: b.posicao === 'baixo' ? 'baixo' : b.posicao === 'alto' ? 'alto' : base.posicao,
  }
}

const baixar = async (url: string) => Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(30_000) })).arrayBuffer())

/** Desenha a arte final (JPG 1080×1350) a partir das camadas. */
export async function desenhar(c: Camadas): Promise<Buffer> {
  const fundo = await baixar(c.cena)
  const png = await arteDoPost({
    layout: 'cena', foto: `data:image/jpeg;base64,${fundo.toString('base64')}`,
    data: c.data || undefined, titulo: c.titulo, frase: c.frase, destaque: c.destaque || undefined, paleta: c.paleta, posicao: c.posicao,
  })
  return sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer()
}

async function subir(pasta: string, jpg: Buffer) {
  const caminho = `posts/robo/${pasta}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`
  const up = await sb.storage.from(BALDE).upload(caminho, jpg, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false })
  if (up.error) throw new Error(`guardar a imagem: ${up.error.message}`)
  return sb.storage.from(BALDE).getPublicUrl(caminho).data.publicUrl
}

/** Guarda a cena (PNG da IA) como JPG e devolve a URL. */
export const guardarCena = async (png: Buffer) => subir('cenas', await sharp(png).jpeg({ quality: 90 }).toBuffer())

/** Redesenha, guarda a imagem final e grava as camadas no post. Devolve a nova URL da arte. */
export async function salvarArte(postId: string, c: Camadas, por: string): Promise<string> {
  const url = await subir('artes', await desenhar(c))
  const { data: atual } = await sb.from('site_posts').select('midia').eq('id', postId).maybeSingle()
  const midia = { ...((atual as { midia?: Record<string, string> } | null)?.midia || {}), feed: url }
  const { error } = await sb.from('site_posts').update({ arte: c, midia, atualizado_em: new Date().toISOString(), atualizado_por: por }).eq('id', postId)
  if (error) throw new Error(/arte/.test(error.message) ? 'Rode sql/marketing-arte-camadas.sql no projeto do portal.' : error.message)
  return url
}

/** Pede outra cena à IA (mesmo trator; `pedido` muda o cenário se vier). Não salva: devolve as camadas novas. */
export async function novaCena(c: Camadas, pedido?: string): Promise<Camadas> {
  let base: Buffer | null = null
  if (c.foto_id) {
    const { data } = await sb.from('mkt_fotos').select('url').eq('id', c.foto_id).maybeSingle()
    if (data) base = await baixar((data as { url: string }).url)
  }
  if (!base) throw new Error('Não achei a foto do trator que gerou esta cena (ela foi apagada do Banco de fotos?).')
  const texto = (pedido || '').trim() || c.cena_pedido || 'A realistic Brazilian farm scene in natural light.'
  const png = await montarCena(base, texto)
  return { ...c, cena: await guardarCena(png), cena_pedido: texto.slice(0, 1000) }
}
