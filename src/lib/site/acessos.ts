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
  campanha?: string | null
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
  /** utm_campaign do link (anúncio, post…), vazio sem campanha */
  campanha: string
  paginas: { caminho: string; titulo: string; tempo_s: number; rolou: number }[]
  cliques: { evento: string; rotulo: string; caminho: string }[]
  tempo_s: number
  /** chamou no WhatsApp/telefone ou mandou o simulador para a proposta */
  converteu: boolean
  saiuEm: string
}

const CONVERSAO = /whatsapp|telefone|simulador|proposta/i

/** Páginas fixas do site; qualquer outro /slug/ na raiz é página de produto (trator-… ou implemento). */
const PAGINAS_FIXAS = new Set(['avaliar-usado', 'contato', 'credito', 'garantia', 'implementos', 'oficina', 'pecas-genuinas-mahindra',
  'politica-de-privacidade', 'pos-venda', 'trator-ideal', 'tratores', '404'])
const semSufixo = (t: string) => t.replace(/ — Nova Tratores.*$/, '').trim()

/** Página de produto → tipo e nome (pelo título da página); null nas outras páginas. */
export function produtoDaPagina(caminho: string, titulo?: string | null): { tipo: 'Trator' | 'Implemento'; slug: string; nome: string } | null {
  const m = /^\/([a-z0-9-]+)\/?$/.exec(caminho)
  if (!m || PAGINAS_FIXAS.has(m[1]) || m[1].startsWith('teste-')) return null
  const slug = m[1]
  const nome = titulo && semSufixo(titulo) ? semSufixo(titulo) : slug.replace(/-/g, ' ')
  return { tipo: slug.startsWith('trator-') ? 'Trator' : 'Implemento', slug, nome }
}

/** Para que a pessoa chamou, pelo botão tocado (null = não é contato). */
export function assuntoDoContato(evento: string): string | null {
  if (!CONVERSAO.test(evento)) return null
  if (/pecas/.test(evento)) return 'Peças'
  if (/posvenda|garantia/.test(evento)) return 'Pós-venda e oficina'
  if (/usado/.test(evento)) return 'Vender o usado'
  if (/simulador|proposta/.test(evento)) return 'Financiamento'
  if (/trator_ideal/.test(evento)) return 'Qual trator serve'
  if (/demonstracao/.test(evento)) return 'Demonstração'
  if (/telefone/.test(evento)) return 'Ligou'
  return 'Comprar máquina (WhatsApp)'
}

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

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
    let origem = '', aparelho = '', campanha = ''
    for (const e of evs) {
      if (e.tipo === 'pagina') {
        paginas.push({ caminho: e.caminho, titulo: e.titulo || e.caminho, tempo_s: 0, rolou: 0 })
        if (!origem) origem = nomeOrigem(e.origem, e.utm)
        if (!aparelho && e.aparelho) aparelho = e.aparelho
        if (!campanha && e.campanha) campanha = e.campanha
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
      aparelho: aparelho || 'computador', origem: origem || 'Direto', campanha, paginas, cliques,
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
  /** página por onde a visita entrou */
  entradas: { caminho: string; titulo: string; visitas: number; conversoes: number }[]
  /** tratores e implementos abertos: quantas visitas viram e quantas dessas chamaram */
  produtos: { tipo: 'Trator' | 'Implemento'; slug: string; nome: string; visitas: number; conversoes: number }[]
  /** visitas que chamaram, por assunto (uma visita pode ter mais de um) */
  assuntos: { assunto: string; visitas: number }[]
  /** caminho até o contato */
  funil: { entraram: number; viramMaquina: number; viramPreco: number; chamaram: number }
  porHora: { hora: number; visitas: number }[]
  porSemana: { dia: string; visitas: number; conversoes: number }[]
  aparelhos: { aparelho: string; visitas: number; conversoes: number }[]
  /** aparelhos que vieram mais de uma vez no período */
  voltaram: number
  campanhas: { nome: string; visitas: number; conversoes: number }[]
  /** buscas em Tratores/Implementos que não acharam nada */
  buscasSemResultado: { termo: string; onde: string; total: number }[]
  pecasNaoAchou: number
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
  let aberturas3d = 0, pecasNaoAchou = 0
  const entradas = new Map<string, { titulo: string; visitas: number; conversoes: number }>()
  const produtos = new Map<string, { tipo: 'Trator' | 'Implemento'; nome: string; visitas: number; conversoes: number }>()
  const assuntos = new Map<string, number>()
  const funil = { entraram: n, viramMaquina: 0, viramPreco: 0, chamaram: conversoes }
  const porHora = Array.from({ length: 24 }, (_, hora) => ({ hora, visitas: 0 }))
  const porSemana = DIAS_SEMANA.map((dia) => ({ dia, visitas: 0, conversoes: 0 }))
  const aparelhos = new Map<string, { visitas: number; conversoes: number }>()
  const campanhas = new Map<string, { visitas: number; conversoes: number }>()
  const semResultado = new Map<string, number>()
  const vezes = new Map<string, number>()
  const soma = <T extends { visitas: number; conversoes: number }>(m: Map<string, T>, k: string, novo: () => T, conv: boolean) => {
    const x = m.get(k) || novo(); x.visitas++; if (conv) x.conversoes++; m.set(k, x)
  }
  for (const v of visitas) {
    vezes.set(v.visitante, (vezes.get(v.visitante) || 0) + 1)
    const p0 = v.paginas[0]
    soma(entradas, p0.caminho, () => ({ titulo: semSufixo(p0.titulo), visitas: 0, conversoes: 0 }), v.converteu)
    const vistos = new Map<string, NonNullable<ReturnType<typeof produtoDaPagina>>>()
    for (const p of v.paginas) { const pr = produtoDaPagina(p.caminho, p.titulo); if (pr) vistos.set(pr.slug, pr) }
    for (const pr of vistos.values()) soma(produtos, pr.slug, () => ({ tipo: pr.tipo, nome: pr.nome, visitas: 0, conversoes: 0 }), v.converteu)
    if (vistos.size || v.paginas.some((p) => /^\/(tratores|implementos)\//.test(p.caminho))) funil.viramMaquina++
    if (v.paginas.some((p) => p.caminho.startsWith('/credito')) || v.cliques.some((c) => c.evento.startsWith('simulador'))) funil.viramPreco++
    for (const a of new Set(v.cliques.map((c) => assuntoDoContato(c.evento)).filter((a): a is string => !!a))) assuntos.set(a, (assuntos.get(a) || 0) + 1)
    const hora = Number(new Date(v.inicio).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }))
    porHora[hora % 24].visitas++
    const ds = porSemana[new Date(diaBR(v.inicio) + 'T12:00:00Z').getUTCDay()]
    ds.visitas++; if (v.converteu) ds.conversoes++
    soma(aparelhos, v.aparelho, () => ({ visitas: 0, conversoes: 0 }), v.converteu)
    if (v.campanha) soma(campanhas, v.campanha, () => ({ visitas: 0, conversoes: 0 }), v.converteu)
    for (const c of v.cliques) {
      if (c.evento === 'busca_pecas' && c.rotulo) { const t = c.rotulo.toLowerCase(); buscas.set(t, (buscas.get(t) || 0) + 1) }
      if ((c.evento === 'pecas_whatsapp' || c.evento === 'pecas3d_whatsapp') && c.rotulo) pedidas.set(c.rotulo, (pedidas.get(c.rotulo) || 0) + 1)
      if (c.evento === 'pecas_abrir_3d') aberturas3d++
      if (c.evento === 'pecas_nao_achou') pecasNaoAchou++
      if (c.evento.startsWith('busca_sem_resultado_') && c.rotulo) {
        const k = `${c.evento.endsWith('tratores') ? 'Tratores' : 'Implementos'}|${c.rotulo.toLowerCase()}`
        semResultado.set(k, (semResultado.get(k) || 0) + 1)
      }
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
    })).sort((a, b) => b.aberturas - a.aberturas).slice(0, 30),
    origens: [...origens].map(([nome, x]) => ({ nome, ...x })).sort((a, b) => b.visitas - a.visitas),
    saidas: [...saidas].map(([caminho, x]) => ({ caminho, ...x })).sort((a, b) => b.semConversao - a.semConversao).slice(0, 30),
    cliques: [...cliques].map(([evento, total]) => ({ evento, total })).sort((a, b) => b.total - a.total),
    buscasProdutos: [...buscasProd].map(([k, total]) => { const [onde, termo] = k.split('|'); return { termo, onde: onde as 'Tratores' | 'Implementos', total } }).sort((a, b) => b.total - a.total).slice(0, 30),
    buscasPecas: [...buscas].map(([termo, total]) => ({ termo, total })).sort((a, b) => b.total - a.total).slice(0, 30),
    pecasPedidas: [...pedidas].map(([codigo, total]) => ({ codigo, total })).sort((a, b) => b.total - a.total).slice(0, 30),
    aberturas3d,
    entradas: [...entradas].map(([caminho, x]) => ({ caminho, ...x })).sort((a, b) => b.visitas - a.visitas).slice(0, 30),
    produtos: [...produtos].map(([slug, x]) => ({ slug, ...x })).sort((a, b) => b.visitas - a.visitas || b.conversoes - a.conversoes),
    assuntos: [...assuntos].map(([assunto, visitas]) => ({ assunto, visitas })).sort((a, b) => b.visitas - a.visitas),
    funil, porHora, porSemana,
    aparelhos: [...aparelhos].map(([aparelho, x]) => ({ aparelho, ...x })).sort((a, b) => b.visitas - a.visitas),
    voltaram: [...vezes.values()].filter((k) => k > 1).length,
    campanhas: [...campanhas].map(([nome, x]) => ({ nome, ...x })).sort((a, b) => b.visitas - a.visitas),
    buscasSemResultado: [...semResultado].map(([k, total]) => { const [onde, termo] = k.split('|'); return { termo, onde, total } }).sort((a, b) => b.total - a.total).slice(0, 30),
    pecasNaoAchou,
  }
}
