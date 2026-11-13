// Peças da tela do diretor (/empresa → Peças). José, 12/11/2026: "agora as peças, coisas parecidas com o Comercial e o
// Pós-Vendas". Mesmas fontes do Dashboard de Vendas (nada novo):
//   • vendas  → vendas_itens (família Peças), sem pedido inválido/cancelado/devolvido; custo = cmc_unitario × quantidade
//   • canal   → categoria do pedido (pedidos_venda_relatorio): Balcão, Oficina (peças nas OS), Revisões, junto com máquina
//   • estoque → produtos (família Peças, estoque > 0) × última venda de cada código
// Gravado em empresa_painel (area 'pecas') pelo robô empresa-snapshot; a tela só lê.
import { supabaseAdmin } from '@/lib/server/supabase-admin'

const ANOS_ATRAS = 3, QTD_MESES_PED = 13
const r2 = (n: number) => Math.round(n * 100) / 100
const ehPeca = (f: string | null | undefined) => /pe[çc]a/i.test(String(f || ''))

export type Canal = 'Balcão' | 'Oficina' | 'Revisões' | 'Com máquina' | 'Outros'
export const CANAIS: Canal[] = ['Balcão', 'Oficina', 'Revisões', 'Com máquina', 'Outros']
function canalDe(cat: string | null | undefined): Canal {
  const c = String(cat || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/balc/.test(c)) return 'Balcão'
  if (/revis/.test(c)) return 'Revisões'
  if (/serv|manut|montag|oficina/.test(c)) return 'Oficina'
  if (/trator|implement|maquina/.test(c)) return 'Com máquina'
  return 'Outros'
}

export interface SomaPc { venda: number; custo: number; n: number }
export interface MesPc { mes: string; parcial: boolean; venda: number; custo: number; pedidos: number; porCanal: Record<Canal, SomaPc>; porConta: Record<string, SomaPc>; tipos: TipoPc[] }
/** tipo de peça (Filtros, Lubrificante…) no mês; `pecas` só nos últimos 13 meses, com o estoque de hoje de cada código */
export interface TipoPc { tipo: string; venda: number; custo: number; qtd: number; n: number; pecas?: Array<{ codigo: string; descricao: string; conta: string; qtd: number; venda: number; custo: number; estoque: number; cmc: number }> }
export interface PedidoPc { numero: string; conta: string; data: string; cliente: string; vendedor: string; canal: Canal; categoria: string; venda: number; custo: number; itens: number }
export interface ParadaPc { codigo: string; descricao: string; conta: string; estoque: number; cmc: number; valor: number; ultimaVenda: string | null }
export interface EstoquePc { valor: number; itens: number; faixas: Array<{ nome: string; valor: number; itens: number }>; paradas: ParadaPc[] }
export interface DadosPecas { hoje: string; meses: MesPc[]; pedidos: PedidoPc[]; estoque: EstoquePc; geradoEm: string }

async function todas<T>(build: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await build(de, de + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  return out
}
const dataIso = (br: string | null | undefined) => { const m = String(br || '').match(/^(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : '' }
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const vazio = (): SomaPc => ({ venda: 0, custo: 0, n: 0 })

type Linha = { codigo_produto: string | null; descricao: string | null; valor_total: number; quantidade: number; cmc_unitario: number | null; tipo: string | null; mes: number; ano: number; familia: string | null; conta_omie: string | null; numero_pedido: string | null; nome_cliente: string | null; data_faturamento: string | null; codigo_cliente: string | null }

export async function montarPecas(): Promise<DadosPecas> {
  const hoje = hojeSP(), anoIni = Number(hoje.slice(0, 4)) - ANOS_ATRAS
  const [linhas0, invalidos, pedRel, estoque] = await Promise.all([
    todas<Linha>((de, ate) => supabaseAdmin.from('vendas_itens')
      .select('codigo_produto,descricao,valor_total,quantidade,cmc_unitario,mes,ano,familia,conta_omie,numero_pedido,nome_cliente,data_faturamento,codigo_cliente,tipo')
      .gte('ano', anoIni).ilike('familia', '%pe%as%').order('id', { ascending: true }).range(de, ate)),
    supabaseAdmin.from('vendas_pedidos_invalidos').select('numero_pedido,conta_omie').then(({ data }) => new Set((data || []).map((r) => `${String(r.conta_omie || '').toUpperCase()}|${r.numero_pedido}`))),
    todas<{ numero_venda: string; empresa: string; cliente: string | null; vendedor: string | null; categoria: string | null; cancelada: string | null; devolvido: string | null }>((de, ate) => supabaseAdmin.from('pedidos_venda_relatorio')
      .select('numero_venda,empresa,cliente,vendedor,categoria,cancelada,devolvido').order('id', { ascending: true }).range(de, ate)),
    todas<{ codigo_produto: number; descricao: string | null; familia_nome: string | null; estoque: number; cmc: number; conta_omie: string }>((de, ate) => supabaseAdmin.from('produtos')
      .select('codigo_produto,descricao,familia_nome,estoque,cmc,conta_omie').gt('estoque', 0).eq('arquivado', false).ilike('familia_nome', '%pe%as%')
      .order('codigo_produto', { ascending: true }).range(de, ate)),
  ])
  const ped = new Map(pedRel.map((p) => [`${String(p.empresa || '').toUpperCase()}|${p.numero_venda}`, p]))
  const linhas = linhas0.filter((l) => {
    if (!ehPeca(l.familia)) return false
    const k = `${String(l.conta_omie || '').toUpperCase()}|${l.numero_pedido}`
    if (invalidos.has(k)) return false
    const p = ped.get(k)
    return !(p && (p.cancelada === 'SIM' || p.devolvido === 'SIM'))
  })

  // ── por mês ──
  const nMeses = ANOS_ATRAS * 12 + Number(hoje.slice(5, 7))
  const chaves: string[] = []
  for (let i = nMeses - 1; i >= 0; i--) { const d = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1 - i, 1); chaves.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
  const mesAtual = hoje.slice(0, 7)
  // estoque de hoje de cada código (para a janela do tipo: "mostra os produtos com valor, quantidade no estoque")
  const estoqueDe = new Map(estoque.map((x) => [`${String(x.conta_omie || 'NOVA').toUpperCase()}|${x.codigo_produto}`, { estoque: Number(x.estoque) || 0, cmc: Number(x.cmc) || 0 }]))
  const mesesMap = new Map<string, MesPc & { _ped: Set<string>; _top: Map<string, { tipo: string; codigo: string; descricao: string; conta: string; qtd: number; venda: number; custo: number }> }>()
  for (const k of chaves) mesesMap.set(k, { mes: k, parcial: k === mesAtual, venda: 0, custo: 0, pedidos: 0, porCanal: Object.fromEntries(CANAIS.map((c) => [c, vazio()])) as Record<Canal, SomaPc>, porConta: {}, tipos: [], _ped: new Set(), _top: new Map() })
  const pedidosMap = new Map<string, PedidoPc>()
  const ultimaVenda = new Map<string, string>()
  const codCliDe = new Map<string, string>() // pedido → código do cliente no Omie (para achar o nome quando o relatório ainda não tem)
  const iniPed = chaves[Math.max(0, chaves.length - QTD_MESES_PED)]
  for (const l of linhas) {
    const conta = String(l.conta_omie || 'NOVA').toUpperCase()
    const k = `${l.ano}-${String(l.mes).padStart(2, '0')}`
    const venda = Number(l.valor_total) || 0, custo = (Number(l.cmc_unitario) || 0) * (Number(l.quantidade) || 0)
    const data = dataIso(l.data_faturamento) || `${k}-01`
    const cod = String(l.codigo_produto || '')
    if (cod && data > (ultimaVenda.get(`${conta}|${cod}`) || '')) ultimaVenda.set(`${conta}|${cod}`, data)
    const m = mesesMap.get(k)
    if (!m) continue
    const pk = `${conta}|${l.numero_pedido}`, p = ped.get(pk)
    const canal = canalDe(p?.categoria)
    m.venda += venda; m.custo += custo
    m.porCanal[canal].venda += venda; m.porCanal[canal].custo += custo
    const pc = m.porConta[conta] || (m.porConta[conta] = vazio()); pc.venda += venda; pc.custo += custo
    if (!m._ped.has(pk)) { m._ped.add(pk); m.pedidos++; m.porCanal[canal].n++; pc.n++ }
    const tk = `${conta}|${cod}`
    const t = m._top.get(tk) || { tipo: tipoDe(l.tipo, l.descricao), codigo: cod, descricao: String(l.descricao || cod).trim(), conta, qtd: 0, venda: 0, custo: 0 }
    t.qtd += Number(l.quantidade) || 0; t.venda += venda; t.custo += custo; m._top.set(tk, t)
    if (k >= iniPed && l.numero_pedido) {
      const x = pedidosMap.get(pk) || { numero: String(l.numero_pedido), conta, data, cliente: String(l.nome_cliente || p?.cliente || '').trim(), vendedor: limparVend(p?.vendedor), canal, categoria: String(p?.categoria || '').replace(/^[\d.\s#@]+/, '').trim(), venda: 0, custo: 0, itens: 0 }
      x.venda += venda; x.custo += custo; x.itens++; if (data > x.data) x.data = data
      pedidosMap.set(pk, x)
      if (!x.cliente && l.codigo_cliente) codCliDe.set(pk, String(l.codigo_cliente))
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- _ped só servia para contar os pedidos
  const meses: MesPc[] = [...mesesMap.values()].map(({ _ped, _top, ...m }) => ({
    ...m, venda: r2(m.venda), custo: r2(m.custo),
    porCanal: Object.fromEntries(Object.entries(m.porCanal).map(([c, s]) => [c, { venda: r2(s.venda), custo: r2(s.custo), n: s.n }])) as Record<Canal, SomaPc>,
    porConta: Object.fromEntries(Object.entries(m.porConta).map(([c, s]) => [c, { venda: r2(s.venda), custo: r2(s.custo), n: s.n }])),
    tipos: tiposDoMes([..._top.values()], m.mes >= iniPed, estoqueDe),
  }))
  // pedidos novos ainda sem linha no relatório: nome pelo cadastro de clientes (mesmo caminho da Gestão de Vendas)
  const cods = [...new Set(codCliDe.values())]
  const nomeCli = new Map<string, string>()
  for (let i = 0; i < cods.length; i += 200) {
    const fatia = cods.slice(i, i + 200)
    const [a, b] = await Promise.all([
      supabaseAdmin.from('clientes').select('codigo_cliente_omie, razao_social, nome_fantasia').in('codigo_cliente_omie', fatia),
      supabaseAdmin.from('portal_nt_clientes_cadastro_omie').select('cod_cli, razao_social, nome_fantasia').in('cod_cli', fatia),
    ])
    for (const c of b.data || []) { const n = c.razao_social || c.nome_fantasia; if (n) nomeCli.set(String(c.cod_cli), String(n).trim()) }
    for (const c of a.data || []) { const n = c.razao_social || c.nome_fantasia; if (n) nomeCli.set(String(c.codigo_cliente_omie), String(n).trim()) }
  }
  for (const [pk, cod] of codCliDe) { const x = pedidosMap.get(pk); if (x && !x.cliente) x.cliente = nomeCli.get(cod) || '' }
  const pedidos = [...pedidosMap.values()].map((p) => ({ ...p, venda: r2(p.venda), custo: r2(p.custo) })).sort((a, b) => b.data.localeCompare(a.data))

  // ── estoque de peças × última venda ──
  const dias = (d: string | null) => (d ? Math.round((Date.parse(hoje) - Date.parse(d)) / 86_400_000) : null)
  const est = estoque.map((p) => {
    const conta = String(p.conta_omie || 'NOVA').toUpperCase(), u = ultimaVenda.get(`${conta}|${p.codigo_produto}`) || null
    return { codigo: String(p.codigo_produto), descricao: String(p.descricao || '').trim(), conta, estoque: Number(p.estoque) || 0, cmc: Number(p.cmc) || 0, valor: r2((Number(p.estoque) || 0) * (Number(p.cmc) || 0)), ultimaVenda: u }
  }).filter((p) => p.valor > 0)
  const FAIXAS: Array<[string, (d: number | null) => boolean]> = [
    ['Vendeu nos últimos 90 dias', (d) => d != null && d <= 90],
    ['Sem vender de 3 a 12 meses', (d) => d != null && d > 90 && d <= 365],
    ['Sem vender há mais de 1 ano', (d) => d != null && d > 365],
    [`Não vendeu desde ${anoIni}`, (d) => d == null],
  ]
  const estoqueOut: EstoquePc = {
    valor: r2(est.reduce((a, p) => a + p.valor, 0)), itens: est.length,
    faixas: FAIXAS.map(([nome, f]) => { const l = est.filter((p) => f(dias(p.ultimaVenda))); return { nome, valor: r2(l.reduce((a, p) => a + p.valor, 0)), itens: l.length } }),
    paradas: est.filter((p) => { const d = dias(p.ultimaVenda); return d == null || d > 90 }).sort((a, b) => b.valor - a.valor).slice(0, 300),
  }
  return { hoje, meses, pedidos, estoque: estoqueOut, geradoEm: new Date().toISOString() }
}

/** tipo da peça: o campo tipo da venda (Filtros, Lubrificante…); vazio → pela descrição; junta singular/plural */
const JUNTA: Record<string, string> = { Rolamento: 'Rolamentos', Correia: 'Correias', 'Braços e engates': 'Braços e Engates' }
const PALAVRAS: Array<[RegExp, string]> = [
  [/\bfiltr/i, 'Filtros'], [/\b(oleo|óleo|graxa|lubrif|fluido|hidro|hidra|15w|10w|85w|80w|20w|atf)/i, 'Lubrificante'], [/\brolament/i, 'Rolamentos'],
  [/\bretent/i, 'Retentor'], [/\b(correia)/i, 'Correias'], [/\b(faca|lamina|lâmina)/i, 'Facas e lâminas'], [/\b(bomba)/i, 'Bombas'], [/\b(junta)/i, 'Juntas'],
  [/\b(mangueira|mangote)/i, 'Mangueira'], [/\b(parafuso|porca|arruela)/i, 'Parafusos'], [/\b(bobina|solenoide|sensor|chicote|lampada|lâmpada|farol|rele|relé|interruptor)/i, 'Elétrica e iluminação'],
  [/\b(disco)/i, 'Discos agrícolas'], [/\b(embreag)/i, 'Embreagem'], [/\b(freio|lona)/i, 'Freio'], [/\b(pneu|camara|câmara)/i, 'Pneus e Bandas'], [/\b(bico)/i, 'Bicos'],
]
function tipoDe(tipo: string | null | undefined, descricao: string | null | undefined): string {
  const t = String(tipo || '').trim()
  if (t) return JUNTA[t] || t
  const d = String(descricao || '')
  for (const [re, nome] of PALAVRAS) if (re.test(d)) return nome
  return 'Outras peças'
}
function tiposDoMes(itens: Array<{ tipo: string; codigo: string; descricao: string; conta: string; qtd: number; venda: number; custo: number }>, comPecas: boolean, estoqueDe: Map<string, { estoque: number; cmc: number }>): TipoPc[] {
  const m = new Map<string, TipoPc>()
  for (const i of itens) {
    const x = m.get(i.tipo) || { tipo: i.tipo, venda: 0, custo: 0, qtd: 0, n: 0, ...(comPecas ? { pecas: [] } : {}) }
    x.venda += i.venda; x.custo += i.custo; x.qtd += i.qtd; x.n++
    if (comPecas) { const e = estoqueDe.get(`${i.conta}|${i.codigo}`); x.pecas!.push({ codigo: i.codigo, descricao: i.descricao, conta: i.conta, qtd: r2(i.qtd), venda: r2(i.venda), custo: r2(i.custo), estoque: e?.estoque || 0, cmc: e?.cmc || 0 }) }
    m.set(i.tipo, x)
  }
  return [...m.values()].map((x) => ({ ...x, venda: r2(x.venda), custo: r2(x.custo), qtd: r2(x.qtd), ...(x.pecas ? { pecas: x.pecas.sort((a, b) => b.venda - a.venda).slice(0, 60) } : {}) })).sort((a, b) => b.venda - a.venda)
}

function limparVend(v: string | null | undefined): string {
  const s = String(v || '').replace(/\(C[óo]d:\s*\d+\)/i, '').trim()
  return s
}
