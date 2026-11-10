// Catálogo de peças do portal → dados das peças do site (José, 10/11/2026):
//  - desenho da fábrica (vista explodida + nº da peça) para as Mahindra — usado quando a peça ainda não tem foto;
//  - "Serve em": modelos de trator/implemento em que a peça aparece no catálogo (catalogo_pecas.modelo).
// Calculado em lote e guardado em memória pela rota (6 h): o catálogo quase não muda e assim não pesa no banco.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import type { PecaSite } from './pecas'
import { nomeModelo } from './modelos'

export interface Desenho { img: string; fig: string; ref: string; x: number; y: number; conjunto: string }
export interface DoCatalogo { desenho: Desenho | null; modelos: string[] }

/** "RP-006023100C91" e "006023100C91" viram a mesma chave. */
export const chaveCodigo = (c: string) => (c || '').toUpperCase().replace(/^R[PA]-/, '').replace(/[^A-Z0-9]/g, '')

type LinhaPeca = { code: string; figura_id: string; reference: string; modelo: string | null }
type Figura = { id: string; name: string; image_url: string | null; hotspots: { x: number; y: number; reference: string }[] | null }

export async function lerCatalogo(pecas: PecaSite[]): Promise<Map<string, DoCatalogo>> {
  const resultado = new Map<string, DoCatalogo>()
  const porChave = new Map<string, PecaSite[]>()
  for (const p of pecas) {
    const k = chaveCodigo(p.codigo)
    if (k.length < 4) continue
    porChave.set(k, [...(porChave.get(k) || []), p])
  }
  const chaves = [...porChave.keys()]
  const achadas: LinhaPeca[] = []
  for (let i = 0; i < chaves.length; i += 60) {
    const { data, error } = await sb.from('catalogo_pecas').select('code, figura_id, reference, modelo').in('code', chaves.slice(i, i + 60))
    if (error) { console.warn('[site/catalogo] catalogo_pecas:', error.message); continue }
    achadas.push(...((data || []) as LinhaPeca[]))
  }
  if (!achadas.length) return resultado

  // nomes dos modelos (catalogo_modelos: slug/nome)
  const { data: mods } = await sb.from('catalogo_modelos').select('slug, nome')
  const nomeDe = new Map<string, string>()
  for (const m of (mods || []) as { slug: string; nome: string }[]) { nomeDe.set(m.slug.toLowerCase(), m.nome); nomeDe.set(m.nome.toLowerCase(), m.nome) }

  // desenhos só para as Mahindra
  const idsMahindra = [...new Set(achadas.filter((a) => porChave.get(chaveCodigo(a.code))?.some((p) => p.grupo === 'mahindra')).map((a) => a.figura_id))]
  const figuras = new Map<string, Figura>()
  for (let i = 0; i < idsMahindra.length; i += 60) {
    const { data, error } = await sb.from('catalogo_figuras').select('id, name, image_url, hotspots').in('id', idsMahindra.slice(i, i + 60))
    if (error) { console.warn('[site/catalogo] catalogo_figuras:', error.message); continue }
    for (const f of (data || []) as Figura[]) figuras.set(f.id, f)
  }

  for (const a of achadas) {
    const lojas = porChave.get(chaveCodigo(a.code))
    if (!lojas) continue
    for (const p of lojas) {
      const atual = resultado.get(p.codigo) || { desenho: null, modelos: [] }
      if (a.modelo) {
        const nome = nomeModelo(nomeDe.get(a.modelo.toLowerCase()) || a.modelo)
        if (nome && !atual.modelos.includes(nome) && atual.modelos.length < 3) atual.modelos.push(nome)
      }
      if (!atual.desenho && p.grupo === 'mahindra') {
        const f = figuras.get(a.figura_id)
        const h = f?.hotspots?.find((x) => String(x.reference) === String(a.reference))
        if (f?.image_url && h) atual.desenho = { img: f.image_url, fig: f.id, ref: String(a.reference), x: h.x, y: h.y, conjunto: nomeBonito(f.name) }
      }
      resultado.set(p.codigo, atual)
    }
  }
  return resultado
}

/** "SISTEMA DE EXAUSTÃO" → "Sistema de exaustão" */
function nomeBonito(n: string): string {
  const s = (n || '').trim()
  if (s !== s.toUpperCase()) return s
  const minus = s.toLowerCase()
  return minus.charAt(0).toUpperCase() + minus.slice(1)
}

/** Fotos das peças (bucket público "site-pecas", arquivo <chave>.webp). Uma listagem por vez, sem tocar nas tabelas. */
export async function lerFotos(): Promise<Set<string>> {
  const nomes = new Set<string>()
  for (let de = 0; de < 20_000; de += 1000) {
    const { data, error } = await sb.storage.from('site-pecas').list('', { limit: 1000, offset: de })
    if (error) { console.warn('[site/fotos]', error.message); break }
    for (const f of data || []) if (f.name.endsWith('.webp')) nomes.add(f.name.slice(0, -5))
    if (!data || data.length < 1000) break
  }
  return nomes
}
