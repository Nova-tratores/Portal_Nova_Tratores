// Desenho da fábrica para as peças do site (José, 10/11/2026: fotos das peças → "Desenho da fábrica").
// Liga o código em estoque ao catálogo de peças do portal (catalogo_pecas → catalogo_figuras): a vista explodida
// do conjunto e o número da peça nela (hotspot). O site mostra o desenho com o número destacado. Não é foto.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import type { PecaSite } from './pecas'

export interface Desenho { img: string; fig: string; ref: string; x: number; y: number; conjunto: string }

/** "RP-006023100C91" e "006023100C91" viram a mesma chave. */
export const chaveCodigo = (c: string) => (c || '').toUpperCase().replace(/^R[PA]-/, '').replace(/[^A-Z0-9]/g, '')

type LinhaPeca = { code: string; figura_id: string; reference: string }
type Figura = { id: string; name: string; image_url: string | null; hotspots: { x: number; y: number; reference: string }[] | null }

export async function anexarDesenhos(pecas: PecaSite[]): Promise<Map<string, Desenho>> {
  const resultado = new Map<string, Desenho>()
  // código como está no catálogo (sem RP-/RA-, só letras e números) → códigos da loja
  const porChave = new Map<string, string[]>()
  for (const p of pecas) {
    if (p.grupo !== 'mahindra') continue
    const k = chaveCodigo(p.codigo)
    if (k.length < 4) continue
    porChave.set(k, [...(porChave.get(k) || []), p.codigo])
  }
  const chaves = [...porChave.keys()]
  const achadas: LinhaPeca[] = []
  for (let i = 0; i < chaves.length; i += 40) {
    const { data, error } = await sb.from('catalogo_pecas').select('code, figura_id, reference').in('code', chaves.slice(i, i + 40))
    if (error) { console.warn('[site/desenhos] catalogo_pecas:', error.message); continue }
    achadas.push(...((data || []) as LinhaPeca[]))
  }
  if (!achadas.length) return resultado

  const ids = [...new Set(achadas.map((a) => a.figura_id))]
  const figuras = new Map<string, Figura>()
  for (let i = 0; i < ids.length; i += 40) {
    const { data, error } = await sb.from('catalogo_figuras').select('id, name, image_url, hotspots').in('id', ids.slice(i, i + 40))
    if (error) { console.warn('[site/desenhos] catalogo_figuras:', error.message); continue }
    for (const f of (data || []) as Figura[]) figuras.set(f.id, f)
  }

  for (const a of achadas) {
    const k = chaveCodigo(a.code)
    const lojas = porChave.get(k)
    if (!lojas || resultado.has(lojas[0])) continue
    const f = figuras.get(a.figura_id)
    const h = f?.hotspots?.find((x) => String(x.reference) === String(a.reference))
    if (!f?.image_url || !h) continue
    const d: Desenho = { img: f.image_url, fig: f.id, ref: String(a.reference), x: h.x, y: h.y, conjunto: nomeBonito(f.name) }
    for (const c of lojas) resultado.set(c, d)
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
