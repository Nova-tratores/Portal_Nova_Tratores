// Acessos do site: contas a partir de site_eventos (puro, testado em __tests__/acessos.test.ts).
// "Se saiu, o que aconteceu" (José, 10/11/2026) = a jornada de cada visita (páginas na ordem, cliques,
// tempo) e a página onde as pessoas mais saem sem chamar no WhatsApp.

export interface EventoSite {
  em: string
  tipo: 'pagina' | 'clique' | 'saida'
  visitante: string
  sessao: string
  caminho: string
  titulo?: string | null
  origem?: string | null
  utm?: string | null
  aparelho?: string | null
  evento?: string | null
  rotulo?: string | null
  tempo_s?: number | null
  rolou?: number | null
}

export interface Visita {
  sessao: string
  visitante: string
  inicio: string
  fim: string
  aparelho: string
  origem: string
  paginas: { caminho: string; titulo: string; tempo_s: number; rolou: number }[]
  cliques: { evento: string; rotulo: string; caminho: string }[]
  tempo_s: number
  /** chamou no WhatsApp/telefone ou mandou o simulador para a proposta */
  converteu: boolean
  saiuEm: string
}

const CONVERSAO = /whatsapp|telefone|simulador|proposta/i

/** De onde veio, em português curto: Google, Instagram, Facebook, WhatsApp, Direto, ou o domínio. */
export function nomeOrigem(origem?: string | null, utm?: string | null): string {
  const u = (utm || '').toLowerCase()
  if (u.includes('google')) return 'Google (anúncio)'
  if (u.includes('facebook') || u.includes('instagram') || u.includes('meta')) return 'Meta (anúncio)'
  if (u) return u
  if (!origem) return 'Direto'
  let host = origem
  try { host = new URL(origem).host } catch { /* já é host */ }
  host = host.replace(/^www\.|^m\.|^l\./, '')
  if (/google\./.test(host)) return 'Google'
  if (/instagram/.test(host)) return 'Instagram'
  if (/facebook|fb\.com/.test(host)) return 'Facebook'
  if (/whatsapp|wa\.me/.test(host)) return 'WhatsApp'
  if (/youtube/.test(host)) return 'YouTube'
  if (/bing\./.test(host)) return 'Bing'
  return host
}

/** Junta os eventos por visita (sessão), em ordem. */
export function montarVisitas(eventos: EventoSite[]): Visita[] {
  const porSessao = new Map<string, EventoSite[]>()
  for (const e of eventos) {
    const l = porSessao.get(e.sessao)
    if (l) l.push(e); else porSessao.set(e.sessao, [e])
  }
  const visitas: Visita[] = []
  for (const [sessao, evs] of porSessao) {
    evs.sort((a, b) => a.em.localeCompare(b.em))
    const paginas: Visita['paginas'] = []
    const cliques: Visita['cliques'] = []
    let origem = '', aparelho = ''
    for (const e of evs) {
      if (e.tipo === 'pagina') {
        paginas.push({ caminho: e.caminho, titulo: e.titulo || e.caminho, tempo_s: 0, rolou: 0 })
        if (!origem) origem = nomeOrigem(e.origem, e.utm)
        if (!aparelho && e.aparelho) aparelho = e.aparelho
      } else if (e.tipo === 'saida') {
        // a saída vale para a última abertura da mesma página
        for (let i = paginas.length - 1; i >= 0; i--) {
          if (paginas[i].caminho === e.caminho) {
            paginas[i].tempo_s += Math.max(0, Math.min(e.tempo_s || 0, 3600))
            paginas[i].rolou = Math.max(paginas[i].rolou, e.rolou || 0)
            break
          }
        }
      } else if (e.tipo === 'clique') {
        cliques.push({ evento: e.evento || 'clique', rotulo: e.rotulo || '', caminho: e.caminho })
      }
    }
    if (!paginas.length) continue
    visitas.push({
      sessao, visitante: evs[0].visitante, inicio: evs[0].em, fim: evs[evs.length - 1].em,
      aparelho: aparelho || 'computador', origem: origem || 'Direto', paginas, cliques,
      tempo_s: paginas.reduce((s, p) => s + p.tempo_s, 0),
      converteu: cliques.some((c) => CONVERSAO.test(c.evento)),
      saiuEm: paginas[paginas.length - 1].caminho,
    })
  }
  return visitas.sort((a, b) => b.inicio.localeCompare(a.inicio))
}

export interface Resumo {
  visitantes: number
  visitas: number
  paginas: number
  conversoes: number
  taxaConversao: number
  tempoMedio_s: number
  celularPct: number
  /** visitas de uma página só, sem clique */
  rejeicaoPct: number
  porDia: { dia: string; visitas: number; conversoes: number }[]
  topPaginas: { caminho: string; titulo: string; aberturas: number; tempoMedio_s: number; rolouMedio: number }[]
  origens: { nome: string; visitas: number; conversoes: number }[]
  saidas: { caminho: string; titulo: string; saidas: number; semConversao: number }[]
  cliques: { evento: string; total: number }[]
  /** Peças (José, 10/11): termos buscados e peças pedidas pelo WhatsApp (site e catálogo 3D). */
  buscasPecas: { termo: string; total: number }[]
  pecasPedidas: { codigo: string; total: number }[]
  /** Barra de busca de Tratores e Implementos (José, 11/11): o que digitaram e em qual página. */
  buscasProdutos: { termo: string; onde: 'Tratores' | 'Implementos'; total: number }[]
  aberturas3d: number
}

const diaBR = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

export function resumir(visitas: Visita[]): Resumo {
  const n = visitas.length
  const conversoes = visitas.filter((v) => v.converteu).length
  const visitantes = new Set(visitas.map((v) => v.visitante)).size
  const comTempo = visitas.filter((v) => v.tempo_s > 0)

  const dias = new Map<string, { visitas: number; conversoes: number }>()
  const pags = new Map<string, { titulo: string; aberturas: number; tempo: number; comTempo: number; rolou: number }>()
  const origens = new Map<string, { visitas: number; conversoes: number }>()
  const saidas = new Map<string, { titulo: string; saidas: number; semConversao: number }>()
  const cliques = new Map<string, number>()

  const buscas = new Map<string, number>()
  const pedidas = new Map<string, number>()
  const buscasProd = new Map<string, number>()
  let aberturas3d = 0
  for (const v of visitas) {
    for (const c of v.cliques) {
      if (c.evento === 'busca_pecas' && c.rotulo) { const t = c.rotulo.toLowerCase(); buscas.set(t, (buscas.get(t) || 0) + 1) }
      if ((c.evento === 'pecas_whatsapp' || c.evento === 'pecas3d_whatsapp') && c.rotulo) pedidas.set(c.rotulo, (pedidas.get(c.rotulo) || 0) + 1)
      if (c.evento === 'pecas_abrir_3d') aberturas3d++
      if ((c.evento === 'busca_tratores' || c.evento === 'busca_implementos') && c.rotulo) {
        const k = `${c.evento === 'busca_tratores' ? 'Tratores' : 'Implementos'}|${c.rotulo.toLowerCase()}`
        buscasProd.set(k, (buscasProd.get(k) || 0) + 1)
      }
    }
    const d = dias.get(diaBR(v.inicio)) || { visitas: 0, conversoes: 0 }
    d.visitas++; if (v.converteu) d.conversoes++
    dias.set(diaBR(v.inicio), d)
    const o = origens.get(v.origem) || { visitas: 0, conversoes: 0 }
    o.visitas++; if (v.converteu) o.conversoes++
    origens.set(v.origem, o)
    for (const p of v.paginas) {
      const x = pags.get(p.caminho) || { titulo: p.titulo, aberturas: 0, tempo: 0, comTempo: 0, rolou: 0 }
      x.aberturas++
      if (p.tempo_s > 0) { x.tempo += p.tempo_s; x.comTempo++; x.rolou += p.rolou }
      pags.set(p.caminho, x)
    }
    const ult = v.paginas[v.paginas.length - 1]
    const s = saidas.get(ult.caminho) || { titulo: ult.titulo, saidas: 0, semConversao: 0 }
    s.saidas++; if (!v.converteu) s.semConversao++
    saidas.set(ult.caminho, s)
    for (const c of v.cliques) cliques.set(c.evento, (cliques.get(c.evento) || 0) + 1)
  }

  return {
    visitantes, visitas: n, paginas: visitas.reduce((s, v) => s + v.paginas.length, 0),
    conversoes, taxaConversao: n ? conversoes / n : 0,
    tempoMedio_s: comTempo.length ? Math.round(comTempo.reduce((s, v) => s + v.tempo_s, 0) / comTempo.length) : 0,
    celularPct: n ? visitas.filter((v) => v.aparelho === 'celular').length / n : 0,
    rejeicaoPct: n ? visitas.filter((v) => v.paginas.length === 1 && !v.cliques.length).length / n : 0,
    porDia: [...dias].map(([dia, x]) => ({ dia, ...x })).sort((a, b) => a.dia.localeCompare(b.dia)),
    topPaginas: [...pags].map(([caminho, x]) => ({
      caminho, titulo: x.titulo, aberturas: x.aberturas,
      tempoMedio_s: x.comTempo ? Math.round(x.tempo / x.comTempo) : 0,
      rolouMedio: x.comTempo ? Math.round(x.rolou / x.comTempo) : 0,
    })).sort((a, b) => b.aberturas - a.aberturas).slice(0, 15),
    origens: [...origens].map(([nome, x]) => ({ nome, ...x })).sort((a, b) => b.visitas - a.visitas),
    saidas: [...saidas].map(([caminho, x]) => ({ caminho, ...x })).sort((a, b) => b.semConversao - a.semConversao).slice(0, 10),
    cliques: [...cliques].map(([evento, total]) => ({ evento, total })).sort((a, b) => b.total - a.total),
    buscasProdutos: [...buscasProd].map(([k, total]) => { const [onde, termo] = k.split('|'); return { termo, onde: onde as 'Tratores' | 'Implementos', total } }).sort((a, b) => b.total - a.total).slice(0, 15),
    buscasPecas: [...buscas].map(([termo, total]) => ({ termo, total })).sort((a, b) => b.total - a.total).slice(0, 15),
    pecasPedidas: [...pedidas].map(([codigo, total]) => ({ codigo, total })).sort((a, b) => b.total - a.total).slice(0, 15),
    aberturas3d,
  }
}
