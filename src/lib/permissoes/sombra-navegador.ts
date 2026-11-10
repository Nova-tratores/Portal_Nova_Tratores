'use client'
// =============================================================================
// Permissões v2 NAS TELAS (Fase 4.2 sombra → 4.3 a v2 decide, 10/11/2026).
//
// O usePermissoes pergunta à v2 (view permissoes_efetivas: cada um lê só as suas)
// e à regra antiga (portal_permissoes). Quem decide vem de GET /api/permissoes/modo
// (env PERM_V2_TELAS): 'on' = a v2, 'sombra' = a antiga. A outra é anotada. Cada combinação (dia, tela, página, antiga, v2) vai UMA vez
// por aba — pode()/temAcesso() rodam a cada render e não podem gerar tráfego.
// O lote desce para /api/permissoes/sombra-navegador e cai na mesma perm_sombra
// das rotas, com rota "tela:<página>".
// =============================================================================
import { supabase } from '@/lib/supabase'
import { authHeaders } from '@/lib/auth/client'
import { decidirV2, rotuloChecagem, telasDaChecagem, type Checagem, type ModoV2 } from './sombra'

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

let modoCache: Promise<ModoV2> | null = null
/** Modo das telas. Falha de rede/login = 'sombra' (a regra antiga decide) e tenta de novo depois. */
export function lerModoTelas(): Promise<ModoV2> {
  modoCache ??= (async () => {
    try {
      const r = await fetch('/api/permissoes/modo', { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (r.ok && (j.telas === 'on' || j.telas === 'sombra' || j.telas === 'off')) return j.telas as ModoV2
    } catch { /* cai no padrão seguro */ }
    modoCache = null
    return 'sombra' as ModoV2
  })()
  return modoCache
}

type Item = { tela_id: string; rota: string; antigo: boolean; v2: boolean; decidiu: 'antigo' | 'v2' }
const vistos = new Set<string>()
let fila: Item[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let ouvindoSaida = false

function dia(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

// Cabeçalho de login guardado de antemão: na saída da página (pagehide) não dá
// tempo de esperar o authHeaders() — o fetch nunca saía e o lote se perdia.
let cabecalhos: Record<string, string> | null = null
function renovarCabecalhos(): void {
  authHeaders().then((h) => { cabecalhos = h as Record<string, string> }).catch(() => {})
}

function enviar(lote: Item[], headers: Record<string, string>): Promise<unknown> {
  return fetch('/api/permissoes/sombra-navegador', {
    method: 'POST', keepalive: true,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ itens: lote }),
  }).catch(() => { /* sombra é melhor-esforço */ })
}

async function descarregar(): Promise<void> {
  timer = null
  if (!fila.length) return
  const lote = fila.slice(0, 200)
  fila = fila.slice(200)
  try {
    const h = (await authHeaders()) as Record<string, string>
    cabecalhos = h
    await enviar(lote, h)
  } catch { /* sombra é melhor-esforço */ }
  if (fila.length) timer = setTimeout(() => { void descarregar() }, 5_000)
}

/** Saída da página: manda tudo na hora, sem esperar nada assíncrono. */
function descarregarNaSaida(): void {
  if (!fila.length || !cabecalhos) return
  if (timer) { clearTimeout(timer); timer = null }
  while (fila.length) { void enviar(fila.slice(0, 200), cabecalhos); fila = fila.slice(200) }
}

/**
 * Decide uma checagem feita na tela e anota a comparação. Com `modo === 'on'` a v2
 * decide — salvo admin/dev (sempre pode: um admin trancado não conseguiria
 * consertar), v2 ainda não carregada ou tela fora do catálogo (a v2 negaria para
 * todos): nesses casos vale a antiga. Nunca lança.
 */
export function decidirNaTela(c: Checagem, antigo: boolean, v2: DadosV2 | null, ehAdmin: boolean, modo: ModoV2 | null): boolean {
  if (!v2 || modo === 'off' || typeof window === 'undefined') return antigo
  const telas = telasDaChecagem(c)
  if (!telas.every((t) => t === '@admin' || v2.catalogo.has(t))) return antigo
  const decisaoV2 = decidirV2(c, v2.efetivas, ehAdmin)
  const decidiu: 'antigo' | 'v2' = modo === 'on' && !ehAdmin ? 'v2' : 'antigo'
  anotar(c, antigo, decisaoV2, decidiu)
  return decidiu === 'v2' ? decisaoV2 : antigo
}

function anotar(c: Checagem, antigo: boolean, decisaoV2: boolean, decidiu: 'antigo' | 'v2'): void {
  if (window.self !== window.top) return // painéis da tela dividida repetiriam
  const tela_id = rotuloChecagem(c)
  const rota = window.location.pathname
  const chave = [dia(), tela_id, rota, antigo, decisaoV2, decidiu].join('\u0001')
  if (vistos.has(chave)) return
  vistos.add(chave)
  fila.push({ tela_id, rota, antigo, v2: decisaoV2, decidiu })
  if (!ouvindoSaida) {
    ouvindoSaida = true
    renovarCabecalhos()
    setInterval(renovarCabecalhos, 10 * 60_000) // o token do login vence em 1 h
    window.addEventListener('pagehide', descarregarNaSaida)
  }
  timer ??= setTimeout(() => { void descarregar() }, 30_000)
}
