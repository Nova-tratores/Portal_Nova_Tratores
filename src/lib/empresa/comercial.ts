// Dados do Comercial para a tela do diretor (/empresa → Comercial), José 11/11:
// "vendas de tratores e implementos (do vendas por modelo), esse estoque, propostas comerciais, estatísticas e vendedores".
//
// • Vendas: vendas_itens dos últimos 12 meses, sem peças nem requisição e sem pedidos cancelados/devolvidos
//   (vendas_pedidos_invalidos — o mesmo filtro do Vendas por Modelo). Diferença do Vendas por Modelo: lá só entra
//   produto com `produtos.modelo` preenchido, e 7 tratores novos de 2026 estão sem modelo (ficavam de fora).
//   Aqui entram todos; sem modelo, o nome sai da descrição.
// • Vendedor do pedido: pedidos_venda_relatorio (vendas_itens.vendedor vem vazio do sync), igual à Gestão de Vendas.
// • Estoque: produtos com estoque > 0 (mesma tabela do Visual Estoque), máquinas só (sem peças/requisição), a custo (CMC).
// • Propostas: v_formulario (tela /propostas), sem as apagadas.
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export type TipoMaq = 'trator' | 'implemento' | 'precisao'
export interface VendaMaq { mes: string; tipo: TipoMaq; modelo: string; familia: string; qtd: number; valor: number; custo: number; vendedor: string | null; cliente: string | null; pedido: string | null; conta: string }
export interface EstoqueMaq { descricao: string; modelo: string; familia: string; tipo: TipoMaq; qtd: number; valor: number; dias: number; conta: string }
export interface PropostaCm { id: number; cliente: string; cidade: string; equipamento: string; tipo: string | null; valor: number; fase: string; aberta: boolean; vendida: boolean; perdida: boolean; diasNaFase: number; vendedor: string | null; criadaEm: string; fechadaEm: string | null; motivoPerda: string | null }
// meta de venda de máquinas do vendedor (R$/mês), definida pelo diretor na própria tela (José, 11/11: "pode deixar para definir ali").
// Vale do mês em que foi gravada em diante, até ser trocada. metasProntas=false → falta rodar sql/empresa-metas-vendedor.sql
export interface MetaVendedor { vendedor: string; mes: string; valor: number; alteradoPor: string | null; alteradoEm: string | null }
// meses = os últimos 12 (gráficos e contas do mês); vendas = desde jan/ANO_INICIO (Vendas por modelo por ano, José 11/11)
export interface DadosComercial { meses: string[]; anos: number[]; vendas: VendaMaq[]; estoque: EstoqueMaq[]; propostas: PropostaCm[]; vendedores: string[]; metas: MetaVendedor[]; metasProntas: boolean; geradoEm: string }

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const ehPeca = (f: string) => /^pe[c]a/.test(semAcento(f)) || /requisi/.test(semAcento(f)) || f.includes('####')
export const tipoDaFamilia = (f: string): TipoMaq => (/trator/.test(semAcento(f)) ? 'trator' : /precis/.test(semAcento(f)) ? 'precisao' : 'implemento')

// nome curto quando o produto não tem modelo: trator Mahindra pelo número do modelo; o resto pela descrição limpa
export function modeloDaDescricao(desc: string, tipo: TipoMaq): string {
  const d = String(desc || '').toUpperCase()
  // só Mahindra pelo número (ano "2021", "1987" não é modelo); usado de outra marca fica com a descrição
  if (tipo === 'trator' && (/MAHINDRA/.test(d) || /^(JIVO|[4-9]\d{3}E?)\b/.test(d))) {
    const m = d.match(/\b(JIVO|(?!19\d\d|20\d\d)\d{4}E?)\b/)
    if (m) return `Mahindra ${m[1]}${/\bCAB/.test(d) ? ' Cabinado' : ''}`
  }
  return d.replace(/&QUOT;/g, '"').replace(/&AMP;/g, '&').replace(/^(VEICULO NOVO|USAD[OA]|NOVO)\s+/, '').replace(/\s*(CHASSI|S[EÉ]RIE|SERIE|CERT\.|NRO|N[º°]).*$/, '').replace(/\s+/g, ' ').trim().slice(0, 48) || '(sem nome)'
}

// trator: sempre pelo número do modelo na descrição (o cadastro mistura "6075E CAB" e vazio); o resto pelo cadastro
export function nomeModelo(cad: string | null | undefined, desc: string, tipo: TipoMaq): string {
  if (tipo === 'trator') { const d = modeloDaDescricao(desc, tipo); if (/^Mahindra /.test(d)) return d }
  return cad?.trim() || modeloDaDescricao(desc, tipo)
}

/** primeiro ano com vendas no banco (vendas_itens começa em 2022) */
const ANO_INICIO = 2022
const PAGE = 1000
async function todas<T>(build: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = []
  for (let de = 0; ; de += PAGE) {
    const { data, error } = await build(de, de + PAGE - 1)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if ((data || []).length < PAGE) break
  }
  return out
}
const valorBR = (v: unknown) => {
  if (typeof v === 'number') return v
  // texto da proposta: "134.500,00", "13.000", "282.437,00  10% PEDIDO MAIS 3 PAGAMENTOS" → pega o 1º número
  const m = String(v ?? '').match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/)
  return m ? Number(m[0].replace(/\./g, '').replace(',', '.')) || 0 : 0
}
// "DOUGRAS MOGRS DE JESUS BOMFIM" → "Dougras Bomfim"; "(Cód: 0)" (sem vendedor no Omie) → null
export function nomeVendedor(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim()
  if (!s || /^\(c[oó]d/i.test(s)) return null
  const p = s.split(/\s+/).filter((x) => !/^(de|da|do|dos|das|e)$/i.test(x))
  const t = (x: string) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()
  return p.length > 1 ? `${t(p[0])} ${t(p[p.length - 1])}` : t(p[0])
}
const diasDesde = (d: string | null | undefined) => {
  if (!d) return 0
  const m = String(d).match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  const t = m ? new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00`).getTime() : new Date(d).getTime()
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 864e5)) : 0
}

type LinhaVenda = { codigo_produto: string | null; descricao: string | null; valor_total: number; quantidade: number; cmc_unitario: number | null; mes: number; ano: number; familia: string | null; conta_omie: string | null; numero_pedido: string | null; nome_cliente: string | null }

export async function montarComercial(nMeses = 12): Promise<DadosComercial> {
  const hoje = new Date()
  const meses: Array<{ ano: number; mes: number }> = []
  for (let i = nMeses - 1; i >= 0; i--) { const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); meses.push({ ano: d.getFullYear(), mes: d.getMonth() + 1 }) }

  const [linhas, invalidos, produtosEst, props, motivos, cadVend, metasR] = await Promise.all([
    todas<LinhaVenda>((de, ate) => supabaseAdmin.from('vendas_itens')
      .select('codigo_produto,descricao,valor_total,quantidade,cmc_unitario,mes,ano,familia,conta_omie,numero_pedido,nome_cliente')
      .gte('ano', ANO_INICIO).order('id', { ascending: true }).range(de, ate)),
    supabaseAdmin.from('vendas_pedidos_invalidos').select('numero_pedido,conta_omie').then(({ data }) => new Set((data || []).map((r) => `${String(r.conta_omie || '').toLowerCase()}|${r.numero_pedido}`))),
    todas<{ descricao: string; modelo: string | null; familia_nome: string | null; estoque: number; cmc: number; data_inclusao: string | null; conta_omie: string }>((de, ate) => supabaseAdmin.from('produtos')
      .select('descricao,modelo,familia_nome,estoque,cmc,data_inclusao,conta_omie,codigo_produto').gt('estoque', 0).eq('arquivado', false)
      .order('codigo_produto', { ascending: true }).range(de, ate)),
    todas<Record<string, unknown>>((de, ate) => supabaseAdmin.from('v_formulario')
      .select('id,Cliente,Cidade,Marca,Modelo,tipo,Valor_Total,status_ui,em_aberto,dias_na_fase,vendedor_nome,criado_em,fechado_em,motivo_perda_id,deleted_at')
      .is('deleted_at', null).order('id', { ascending: true }).range(de, ate)),
    supabaseAdmin.from('motivo_perda').select('id,nome').then(({ data }) => new Map((data || []).map((m) => [m.id as number, m.nome as string]))),
    // vendedores oficiais (com código) e ativos — os que podem ter meta
    supabaseAdmin.from('vendedores').select('nome,codigo,ativo').eq('ativo', true).not('codigo', 'is', null).then(({ data }) => (data || []).map((v) => nomeVendedor(v.nome as string)).filter((n): n is string => !!n)),
    lerMetas(),
  ])

  // família e modelo pelo cadastro de produtos (a família da venda pode vir vazia)
  const cods = [...new Set(linhas.map((l) => l.codigo_produto).filter((c): c is string => !!c && /^\d+$/.test(c)))]
  const prod = new Map<string, { modelo: string | null; familia: string | null }>()
  for (let i = 0; i < cods.length; i += 300) {
    const { data, error } = await supabaseAdmin.from('produtos').select('codigo_produto,modelo,familia_nome').in('codigo_produto', cods.slice(i, i + 300).map(Number))
    if (error) throw new Error(`produtos: ${error.message}`)
    for (const p of data || []) prod.set(String(p.codigo_produto), { modelo: p.modelo ? String(p.modelo).trim() : null, familia: p.familia_nome ? String(p.familia_nome).trim() : null })
  }

  const maq = linhas.filter((l) => {
    if (invalidos.has(`${String(l.conta_omie || '').toLowerCase()}|${l.numero_pedido}`)) return false
    const f = prod.get(String(l.codigo_produto))?.familia || l.familia || ''
    return !!f && !ehPeca(f)
  })

  // vendedor de cada pedido
  const pedidos = [...new Set(maq.map((l) => l.numero_pedido).filter((n): n is string => !!n))]
  const vendedorDe = new Map<string, string>(), clienteDe = new Map<string, string>(), cancelado = new Set<string>()
  for (let i = 0; i < pedidos.length; i += 200) {
    const { data } = await supabaseAdmin.from('pedidos_venda_relatorio').select('numero_venda,empresa,vendedor,cliente,cancelada,devolvido').in('numero_venda', pedidos.slice(i, i + 200))
    for (const p of data || []) {
      const k = `${String(p.empresa || '').toUpperCase()}|${p.numero_venda}`
      if (p.vendedor) vendedorDe.set(k, String(p.vendedor).trim())
      if (p.cliente) clienteDe.set(k, String(p.cliente).trim())
      if (p.cancelada === 'SIM' || p.devolvido === 'SIM') cancelado.add(k)
    }
  }

  const vendas: VendaMaq[] = maq.filter((l) => !cancelado.has(`${String(l.conta_omie || '').toUpperCase()}|${l.numero_pedido}`)).map((l) => {
    const p = prod.get(String(l.codigo_produto))
    const familia = p?.familia || l.familia || ''
    const tipo = tipoDaFamilia(familia)
    const conta = String(l.conta_omie || '').toUpperCase()
    return {
      mes: `${l.ano}-${String(l.mes).padStart(2, '0')}`, tipo, familia,
      modelo: nomeModelo(p?.modelo, l.descricao || '', tipo),
      qtd: Number(l.quantidade) || 0, valor: Number(l.valor_total) || 0, custo: (Number(l.cmc_unitario) || 0) * (Number(l.quantidade) || 0),
      vendedor: l.numero_pedido ? nomeVendedor(vendedorDe.get(`${conta}|${l.numero_pedido}`)) : null,
      cliente: l.nome_cliente?.trim() || (l.numero_pedido ? clienteDe.get(`${conta}|${l.numero_pedido}`) : null) || null, pedido: l.numero_pedido, conta,
    }
  })

  const estoque: EstoqueMaq[] = produtosEst
    .filter((p) => p.familia_nome && !ehPeca(p.familia_nome))
    .map((p) => {
      const tipo = tipoDaFamilia(p.familia_nome!)
      return { descricao: p.descricao, modelo: nomeModelo(p.modelo, p.descricao, tipo), familia: p.familia_nome!, tipo, qtd: Number(p.estoque) || 0, valor: (Number(p.estoque) || 0) * (Number(p.cmc) || 0), dias: diasDesde(p.data_inclusao), conta: String(p.conta_omie || '').toUpperCase() }
    })
    .filter((e) => e.valor >= 1000) // cabo, suporte e afins de GPS não são máquina parada

  const propostas: PropostaCm[] = props.map((r) => {
    const fase = String(r.status_ui || '').trim()
    const f = semAcento(fase)
    const vendida = /conclu/.test(f) && /vendid/.test(f) && !/nao vendid/.test(f)
    const perdida = /nao vendid/.test(f)
    return {
      id: Number(r.id), cliente: String(r.Cliente || '').trim() || '(sem nome)', cidade: String(r.Cidade || '').trim(),
      equipamento: [r.Marca, r.Modelo].map((x) => String(x || '').trim()).filter(Boolean).join(' '),
      tipo: (r.tipo as string) || null, valor: valorBR(r.Valor_Total), fase, aberta: !!r.em_aberto, vendida, perdida,
      diasNaFase: Number(r.dias_na_fase) || 0, vendedor: nomeVendedor(r.vendedor_nome as string),
      criadaEm: String(r.criado_em || ''), fechadaEm: (r.fechado_em as string) || null,
      motivoPerda: r.motivo_perda_id ? motivos.get(Number(r.motivo_perda_id)) || null : null,
    }
  })

  const anos = Array.from({ length: hoje.getFullYear() - ANO_INICIO + 1 }, (_, i) => hoje.getFullYear() - i)
  return { meses: meses.map((m) => `${m.ano}-${String(m.mes).padStart(2, '0')}`), anos, vendas, estoque, propostas, vendedores: [...new Set(cadVend)].filter((n) => !/teste/i.test(n)), ...metasR, geradoEm: new Date().toISOString() }
}

/** Metas sempre lidas na hora (uma consulta leve), mesmo quando o resto vem da tabela gravada — senão a meta
 *  recém-definida só apareceria na próxima rodada do robô. metasProntas=false → a tabela ainda não existe. */
export async function lerMetas(): Promise<{ metas: MetaVendedor[]; metasProntas: boolean }> {
  const { data, error } = await supabaseAdmin.from('empresa_metas_vendedor').select('vendedor,mes,valor,alterado_por,alterado_em').order('mes', { ascending: true })
  return {
    metas: (data || []).map((m) => ({ vendedor: String(m.vendedor), mes: String(m.mes), valor: Number(m.valor) || 0, alteradoPor: (m.alterado_por as string) || null, alteradoEm: (m.alterado_em as string) || null })),
    metasProntas: !error,
  }
}
