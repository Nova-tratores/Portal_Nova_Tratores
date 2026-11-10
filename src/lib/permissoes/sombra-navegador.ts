'use client'
// =============================================================================
// Permissões v2 — modo sombra NAS TELAS (Fase 4.2, 10/11/2026).
//
// O usePermissoes continua decidindo pela regra antiga (portal_permissoes). Em
// paralelo ele pergunta à v2 (view permissoes_efetivas: cada um lê só as suas) e
// anota a comparação. Cada combinação (dia, tela, página, antiga, v2) vai UMA vez
// por aba — pode()/temAcesso() rodam a cada render e não podem gerar tráfego.
// O lote desce para /api/permissoes/sombra-navegador e cai na mesma perm_sombra
// das rotas, com rota "tela:<página>".
// =============================================================================
import { supabase } from '@/lib/supabase'
import { authHeaders } from '@/lib/auth/client'
import { decidirV2, rotuloChecagem, telasDaChecagem, type Checagem } from './sombra'

export interface DadosV2 { efetivas: Set<string>; catalogo: Set<string> }

const leituras = new Map<string, Promise<DadosV2 | null>>()
let catalogoCache: Promise<Set<string> | null> | null = null

function lerCatalogo(): Promise<Set<string> | null> {
  catalogoCache ??= (async () => {
    const { data, error } = await supabase.from('perm_telas').select('id').limit(5000)
    if (error || !data) { catalogoCache = null; return null }
    return new Set((data as { id: string }[]).map((r) => r.id))
  })()
  return catalogoCache
}

/** Telas efetivas (nível ≥ ver) do próprio usuário + catálogo. null = v2 indisponível. */
export function lerV2(userId: string, forcar = false): Promise<DadosV2 | null> {
  if (forcar) leituras.delete(userId)
  let p = leituras.get(userId)
  if (!p) {
    p = (async () => {
      const [{ data, error }, catalogo] = await Promise.all([
        supabase.from('permissoes_efetivas').select('tela_id').eq('user_id', userId).limit(5000),
        lerCatalogo(),
      ])
      if (error || !data || !catalogo) { leituras.delete(userId); return null }
      return { efetivas: new Set((data as { tela_id: string }[]).map((r) => r.tela_id)), catalogo }
    })()
    leituras.set(userId, p)
  }
  return p
}

type Item = { tela_id: string; rota: string; antigo: boolean; v2: boolean }
const vistos = new Set<string>()
let fila: Item[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let ouvindoSaida = false

function dia(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

async function descarregar(): Promise<void> {
  timer = null
  if (!fila.length) return
  const lote = fila.slice(0, 200)
  fila = fila.slice(200)
  try {
    await fetch('/api/permissoes/sombra-navegador', {
      method: 'POST', keepalive: true,
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ itens: lote }),
    })
  } catch { /* sombra é melhor-esforço */ }
  if (fila.length) timer = setTimeout(() => { void descarregar() }, 5_000)
}

/**
 * Compara a decisão antiga com a da v2 para uma checagem feita na tela. Nunca
 * muda a decisão. Ignora tela fora do catálogo (a v2 negaria para todos).
 */
export function compararNaTela(c: Checagem, antigo: boolean, v2: DadosV2 | null, ehAdmin: boolean): void {
  if (!v2 || typeof window === 'undefined') return
  if (window.self !== window.top) return // painéis da tela dividida repetiriam
  const telas = telasDaChecagem(c)
  if (!telas.every((t) => t === '@admin' || v2.catalogo.has(t))) return
  const decisaoV2 = decidirV2(c, v2.efetivas, ehAdmin)
  const tela_id = rotuloChecagem(c)
  const rota = window.location.pathname
  const chave = [dia(), tela_id, rota, antigo, decisaoV2].join('\u0001')
  if (vistos.has(chave)) return
  vistos.add(chave)
  fila.push({ tela_id, rota, antigo, v2: decisaoV2 })
  if (!ouvindoSaida) {
    ouvindoSaida = true
    window.addEventListener('pagehide', () => { void descarregar() })
  }
  timer ??= setTimeout(() => { void descarregar() }, 30_000)
}
