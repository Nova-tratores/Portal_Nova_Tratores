// =============================================================================
// Banco de fotos (26/11/2026): guarda uma foto e pede as etiquetas ao Claude.
// Foto grande: até 2048 px, JPG 85 (boa para post). Miniatura: 480 px, WebP (para a grade carregar rápido).
// Storage: site-produtos/banco-fotos/ (pasta pública que o portal já usa para fotos do site).
// =============================================================================
import sharp from 'sharp'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { iaPronta, lerFoto, type Leitura } from './ia'

const BALDE = 'site-produtos'
export const MSG_SQL = 'Banco de fotos não ativado: rode sql/marketing-banco-fotos.sql no projeto do portal (citrhumdkfivdzbmayde).'
export const faltaTabela = (m: string) => /mkt_fotos|does not exist|schema cache/i.test(m)

export type Origem = { origem: 'envio' } | { origem: 'youtube'; origem_id: string; origem_titulo: string; segundo: number }

/** Deixa a foto em pé (EXIF), tira dados do celular e gera grande + miniatura. */
async function preparar(bytes: Buffer) {
  const base = sharp(bytes, { failOn: 'none' }).rotate()
  const grande = await base.clone().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer({ resolveWithObject: true })
  const mini = await base.clone().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer()
  return { grande: grande.data, mini, largura: grande.info.width, altura: grande.info.height }
}

/** Foto em JPEG menor só para a IA ler (gasta menos que a foto inteira). */
export const paraLer = (bytes: Buffer) => sharp(bytes, { failOn: 'none' }).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()

/**
 * Guarda a foto. `leitura` já pronta (quadro de vídeo lido antes) evita ler duas vezes.
 * Sem leitura e com a IA ligada, lê depois de guardar; se a IA falhar, a foto fica com ia_status 'erro' (dá para refazer).
 */
export async function salvarFoto(bytes: Buffer, origem: Origem, por: string, leitura?: Leitura) {
  const p = await preparar(bytes)
  const nome = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const pasta = origem.origem === 'youtube' ? `banco-fotos/yt-${origem.origem_id}` : 'banco-fotos/envio'
  const caminho = `${pasta}/${nome}.jpg`
  const up = async (c: string, b: Buffer, tipo: string) => {
    const { error } = await sb.storage.from(BALDE).upload(c, b, { contentType: tipo, cacheControl: '31536000', upsert: false })
    if (error) throw new Error(error.message)
    return sb.storage.from(BALDE).getPublicUrl(c).data.publicUrl
  }
  const url = await up(caminho, p.grande, 'image/jpeg')
  const miniatura = await up(`${pasta}/${nome}-mini.webp`, p.mini, 'image/webp')

  const { data, error } = await sb.from('mkt_fotos').insert({
    url, miniatura, caminho, largura: p.largura, altura: p.altura, ...origem, criado_por: por,
    ...(leitura ? dadosDaLeitura(leitura) : {}),
  }).select('*').single()
  if (error) {
    await sb.storage.from(BALDE).remove([caminho, caminho.replace(/\.jpg$/, '-mini.webp')])
    throw new Error(faltaTabela(error.message) ? MSG_SQL : error.message)
  }
  if (!leitura && iaPronta()) return etiquetar(data.id as string, url)
  return data
}

const dadosDaLeitura = (l: Leitura) => ({ descricao: l.descricao, etiquetas: l.etiquetas, modelo: l.modelo, nota: l.nota, ia_status: 'ok', ia_erro: null })

/** (Re)faz as etiquetas de uma foto já guardada. */
export async function etiquetar(id: string, url: string) {
  let mudanca: Record<string, unknown>
  try { mudanca = dadosDaLeitura(await lerFoto({ url })) }
  catch (e) { mudanca = { ia_status: 'erro', ia_erro: (e as Error).message.slice(0, 300) } }
  const { data } = await sb.from('mkt_fotos').update({ ...mudanca, atualizado_em: new Date().toISOString() }).eq('id', id).select('*').single()
  return data
}

/** Apaga a foto do banco e do Storage. */
export async function apagarFoto(id: string) {
  const { data } = await sb.from('mkt_fotos').select('caminho').eq('id', id).maybeSingle()
  const c = (data as { caminho?: string } | null)?.caminho
  if (c) await sb.storage.from(BALDE).remove([c, c.replace(/\.jpg$/, '-mini.webp')])
  const { error } = await sb.from('mkt_fotos').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
