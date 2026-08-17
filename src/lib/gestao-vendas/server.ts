// Acesso a dados do Gestão de Vendas no SERVIDOR (service role — ignora RLS).
// As rotas de API validam login+permissão antes de chamar estas funções.

import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { resolverClientesViaOmie } from './clientes-omie'
import type { Autenticado } from '@/lib/auth/server'
import type {
  AjusteVenda,
  CustoMensalVendedor,
  PedidoVendaRelatorio,
  VendaEnriquecida,
  VendaItem,
  Vendedor,
} from './tipos'

// Permissão do módulo: admin, 'gestao-vendas' ou qualquer granular 'gestao-vendas:*'
export function podeGestaoVendas(auth: Autenticado): boolean {
  return (
    auth.isAdmin ||
    auth.modulos.includes('gestao-vendas') ||
    auth.modulos.some((m) => m.startsWith('gestao-vendas:'))
  )
}

// PostgREST corta em 1000 linhas por resposta — pagina com .range() até esgotar.
const PAGE = 1000

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    const rows = data ?? []
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}

const CHUNK = 200

export async function buscarVendasEnriquecidas(
  mes: number,
  ano: number,
  conta: string, // 'NOVA' | 'CASTRO' | 'TODAS'
): Promise<VendaEnriquecida[]> {
  const todas = conta === 'TODAS'
  const vendas = await fetchAll<VendaItem>((from, to) => {
    let q = supabaseAdmin
      .from('vendas_itens')
      .select('*')
      .eq('mes', mes)
      .eq('ano', ano)
    if (!todas) q = q.ilike('conta_omie', conta)
    return q
      .order('valor_total', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to)
  })

  // lookups nas tabelas master (nomes de cliente, família real, categoria, vendedor do pedido)
  const codCli = [...new Set(vendas.map((v) => v.codigo_cliente).filter((c): c is string => !!c && /^\d+$/.test(c)))].map(Number)
  const codProd = [...new Set(vendas.map((v) => v.codigo_produto).filter((c): c is string => !!c && /^\d+$/.test(c)))].map(Number)
  const codCat = [...new Set(vendas.map((v) => v.codigo_categoria).filter((c): c is string => !!c))]
  const numPedidos = [...new Set(vendas.map((v) => v.numero_pedido).filter((n): n is string => !!n))]

  // clientes com chave conta-aware (o mesmo código Omie pode existir nas duas contas)
  const clientes = new Map<string, string>()
  // fallback: cadastro sincronizado ativamente (a tabela `clientes` anda desatualizada
  // e não traz clientes recém-criados → apareciam como #código na tela)
  const clientesCadastro = new Map<string, string>()
  // último recurso persistido: nomes já resolvidos via Omie (gv_clientes_omie_cache)
  const clientesCache = new Map<string, string>() // conta|cod → nome (só os com nome)
  const clientesJaConsultados = new Set<string>() // conta|cod já vistos no cache (mesmo NULL)
  const familias = new Map<string, string | null>()
  const categorias = new Map<string, string>()

  // empresa da tabela portal_nt_clientes_cadastro_omie → conta (NOVA/CASTRO)
  const empresaParaConta = (e: string | null | undefined): string => {
    const s = (e ?? '').toUpperCase()
    if (s.includes('NOVA')) return 'NOVA'
    if (s.includes('CASTRO')) return 'CASTRO'
    return s
  }

  const buscas: PromiseLike<void>[] = []

  for (let i = 0; i < codCli.length; i += CHUNK) {
    const slice = codCli.slice(i, i + CHUNK)
    buscas.push(
      (todas
        ? supabaseAdmin
            .from('clientes')
            .select('codigo_cliente_omie, razao_social, nome_fantasia, conta_omie')
            .in('codigo_cliente_omie', slice)
        : supabaseAdmin
            .from('clientes')
            .select('codigo_cliente_omie, razao_social, nome_fantasia, conta_omie')
            .in('codigo_cliente_omie', slice)
            .ilike('conta_omie', conta)
      ).then(({ data, error }) => {
        if (error) throw new Error(`clientes: ${error.message}`)
        for (const c of data ?? []) {
          const nome = c.razao_social ?? c.nome_fantasia
          if (nome) clientes.set(`${(c.conta_omie ?? '').toUpperCase()}|${c.codigo_cliente_omie}`, nome)
        }
      }),
    )
  }

  for (let i = 0; i < codCli.length; i += CHUNK) {
    const slice = codCli.slice(i, i + CHUNK)
    buscas.push(
      supabaseAdmin
        .from('portal_nt_clientes_cadastro_omie')
        .select('cod_cli, empresa, razao_social, nome_fantasia')
        .in('cod_cli', slice)
        .then(({ data, error }) => {
          if (error) throw new Error(`portal_nt_clientes_cadastro_omie: ${error.message}`)
          for (const c of data ?? []) {
            const nome = c.razao_social || c.nome_fantasia
            if (nome) clientesCadastro.set(`${empresaParaConta(c.empresa)}|${c.cod_cli}`, nome)
          }
        }),
    )
  }

  // cache Omie (best-effort: se a migration não estiver aplicada, ignora e segue)
  for (let i = 0; i < codCli.length; i += CHUNK) {
    const slice = codCli.slice(i, i + CHUNK)
    buscas.push(
      supabaseAdmin
        .from('gv_clientes_omie_cache')
        .select('cod_cli, conta, nome')
        .in('cod_cli', slice)
        .then(({ data, error }) => {
          if (error) return // tabela ausente / erro → cache indisponível, não quebra
          for (const c of data ?? []) {
            const chave = `${(c.conta ?? '').toUpperCase()}|${c.cod_cli}`
            clientesJaConsultados.add(chave)
            if (c.nome) clientesCache.set(chave, c.nome)
          }
        }),
    )
  }

  for (let i = 0; i < codProd.length; i += CHUNK) {
    const slice = codProd.slice(i, i + CHUNK)
    buscas.push(
      supabaseAdmin
        .from('produtos')
        .select('codigo_produto, familia_nome')
        .in('codigo_produto', slice)
        .then(({ data, error }) => {
          if (error) throw new Error(`produtos: ${error.message}`)
          for (const p of data ?? []) familias.set(String(p.codigo_produto), p.familia_nome)
        }),
    )
  }

  for (let i = 0; i < codCat.length; i += CHUNK) {
    const slice = codCat.slice(i, i + CHUNK)
    buscas.push(
      supabaseAdmin
        .from('cache_categorias_relatorio')
        .select('codigo, descricao')
        .in('codigo', slice)
        .then(({ data, error }) => {
          if (error) throw new Error(`cache_categorias_relatorio: ${error.message}`)
          for (const c of data ?? []) {
            if (c.descricao) categorias.set(c.codigo, c.descricao)
          }
        }),
    )
  }

  // vendas_itens.vendedor vem vazio do sync — o nome do vendedor vive em
  // pedidos_venda_relatorio (por numero_venda + empresa)
  const vendedorPorPedido = new Map<string, string>()
  for (let i = 0; i < numPedidos.length; i += CHUNK) {
    const slice = numPedidos.slice(i, i + CHUNK)
    buscas.push(
      supabaseAdmin
        .from('pedidos_venda_relatorio')
        .select('numero_venda, empresa, vendedor')
        .in('numero_venda', slice)
        .then(({ data, error }) => {
          if (error) throw new Error(`pedidos_venda_relatorio: ${error.message}`)
          for (const p of data ?? []) {
            if (p.vendedor) vendedorPorPedido.set(`${(p.empresa ?? '').toUpperCase()}|${p.numero_venda}`, p.vendedor)
          }
        }),
    )
  }

  await Promise.all(buscas)

  const chaveCliente = (v: VendaItem): string | null =>
    v.codigo_cliente && /^\d+$/.test(v.codigo_cliente)
      ? `${(v.conta_omie ?? '').toUpperCase()}|${Number(v.codigo_cliente)}`
      : null

  // resolução em cascata p/ não cair no #código interno da Omie:
  // 1º master `clientes` · 2º cadastro sincronizado (traz clientes recentes)
  // · 3º cache Omie persistido · 4º nome denormalizado na própria venda
  const nomeCliente = (v: VendaItem): string | null => {
    const chave = chaveCliente(v)
    return (
      (chave ? clientes.get(chave) : null) ??
      (chave ? clientesCadastro.get(chave) : null) ??
      (chave ? clientesCache.get(chave) : null) ??
      (v.nome_cliente?.trim() || null)
    )
  }

  // ÚLTIMO recurso: os que sobraram sem nome (e nunca consultados no cache) vão
  // à Omie (best-effort, com teto/tempo). O resultado alimenta o mesmo Map e
  // fica cacheado em gv_clientes_omie_cache pros próximos carregamentos.
  const naoResolvidos = new Map<string, { conta: string; codigo: number }>()
  for (const v of vendas) {
    const chave = chaveCliente(v)
    if (!chave || clientesJaConsultados.has(chave) || nomeCliente(v)) continue
    naoResolvidos.set(chave, {
      conta: (v.conta_omie ?? '').toUpperCase(),
      codigo: Number(v.codigo_cliente),
    })
  }
  if (naoResolvidos.size > 0) {
    try {
      const resolvidos = await resolverClientesViaOmie([...naoResolvidos.values()])
      for (const [k, nome] of resolvidos) clientesCache.set(k, nome)
    } catch {
      // best-effort: se a Omie falhar, mantém o #código
    }
  }

  return vendas.map((v) => ({
    ...v,
    vendedor:
      v.vendedor?.trim() ||
      (v.numero_pedido
        ? vendedorPorPedido.get(`${(v.conta_omie ?? '').toUpperCase()}|${v.numero_pedido}`) ?? null
        : null),
    cliente_nome: nomeCliente(v),
    produto_familia_real: v.codigo_produto ? familias.get(v.codigo_produto) ?? null : null,
    categoria_descricao: v.codigo_categoria ? categorias.get(v.codigo_categoria) ?? null : null,
  }))
}

export async function buscarAjustes(mes: number, ano: number, conta: string): Promise<AjusteVenda[]> {
  return fetchAll<AjusteVenda>((from, to) => {
    let q = supabaseAdmin
      .from('comissao_ajustes_vendas')
      .select('*')
      .eq('mes', mes)
      .eq('ano', ano)
    if (conta !== 'TODAS') q = q.ilike('conta_omie', conta)
    return q.order('id', { ascending: true }).range(from, to)
  })
}

export async function buscarVendedoresAtivos(): Promise<Vendedor[]> {
  const { data, error } = await supabaseAdmin
    .from('vendedores')
    .select('id, nome, email, ativo, codigo')
    .eq('ativo', true)
    .order('codigo', { ascending: true, nullsFirst: false })
  if (error) throw new Error(`vendedores: ${error.message}`)
  return data ?? []
}

export async function buscarCustos(mes: number, ano: number, conta: string): Promise<CustoMensalVendedor[]> {
  return fetchAll<CustoMensalVendedor>((from, to) => {
    let q = supabaseAdmin
      .from('comissao_custos_vendedor')
      .select('*')
      .eq('mes', mes)
      .eq('ano', ano)
    if (conta !== 'TODAS') q = q.ilike('conta_omie', conta)
    return q.order('nome', { ascending: true }).range(from, to)
  })
}

export async function buscarPedidosRelatorio(mes: number, ano: number): Promise<PedidoVendaRelatorio[]> {
  const mesStr = String(mes).padStart(2, '0')
  return fetchAll<PedidoVendaRelatorio>((from, to) =>
    supabaseAdmin
      .from('pedidos_venda_relatorio')
      .select('*')
      .eq('etapa', 'FATURADO')
      .like('data_emissao', `*/${mesStr}/${ano}`) // data_emissao é texto "DD/MM/YYYY"
      .order('valor_total', { ascending: false })
      .order('id', { ascending: true })
      .range(from, to),
  )
}

// ---------- cards por família (dashboard) ----------
// Agrega venda/CMC por família no mês, com comparativos de mês anterior e
// mesmo mês do ano anterior (mesma visão do dashboard de estoque).

export type FamiliaCard = {
  nome: string
  venda: number
  cmc: number
  qtd: number
  vendaMesAnt: number
  vendaAnoAnt: number
}

type LinhaMin = {
  familia: string | null
  codigo_produto: string | null
  valor_total: number
  quantidade: number
  cmc_unitario: number | null
  conta_omie: string
}

async function buscarVendasMin(mes: number, ano: number, conta: string): Promise<LinhaMin[]> {
  return fetchAll<LinhaMin>((from, to) => {
    let q = supabaseAdmin
      .from('vendas_itens')
      .select('familia, codigo_produto, valor_total, quantidade, cmc_unitario, conta_omie')
      .eq('mes', mes)
      .eq('ano', ano)
    if (conta !== 'TODAS') q = q.ilike('conta_omie', conta)
    return q.order('id', { ascending: true }).range(from, to)
  })
}

export async function agregadoPorFamilia(
  mes: number,
  ano: number,
  conta: string,
): Promise<{ familias: FamiliaCard[]; total: FamiliaCard }> {
  const ant = mes === 1 ? { mes: 12, ano: ano - 1 } : { mes: mes - 1, ano }
  const [atual, mesAnt, anoAnt] = await Promise.all([
    buscarVendasMin(mes, ano, conta),
    buscarVendasMin(ant.mes, ant.ano, conta),
    buscarVendasMin(mes, ano - 1, conta),
  ])

  // família real via master de produtos (o campo familia da venda pode vir vazio)
  const codProds = [
    ...new Set(
      [...atual, ...mesAnt, ...anoAnt]
        .map((v) => v.codigo_produto)
        .filter((c): c is string => !!c && /^\d+$/.test(c)),
    ),
  ].map(Number)
  const familiaProduto = new Map<string, string | null>()
  for (let i = 0; i < codProds.length; i += CHUNK) {
    const slice = codProds.slice(i, i + CHUNK)
    const { data, error } = await supabaseAdmin
      .from('produtos')
      .select('codigo_produto, familia_nome')
      .in('codigo_produto', slice)
    if (error) throw new Error(`produtos: ${error.message}`)
    for (const p of data ?? []) familiaProduto.set(String(p.codigo_produto), p.familia_nome)
  }

  const familiaDe = (v: LinhaMin): string | null =>
    (v.codigo_produto ? familiaProduto.get(v.codigo_produto) : null) ?? v.familia ?? null

  const cards = new Map<string, FamiliaCard>()
  const pega = (nome: string): FamiliaCard => {
    let c = cards.get(nome)
    if (!c) {
      c = { nome, venda: 0, cmc: 0, qtd: 0, vendaMesAnt: 0, vendaAnoAnt: 0 }
      cards.set(nome, c)
    }
    return c
  }

  const total: FamiliaCard = { nome: 'Total Geral', venda: 0, cmc: 0, qtd: 0, vendaMesAnt: 0, vendaAnoAnt: 0 }

  for (const v of atual) {
    total.venda += v.valor_total
    total.cmc += (v.cmc_unitario ?? 0) * v.quantidade
    total.qtd += 1
    const f = familiaDe(v)
    if (!f) continue // itens sem família só entram no total
    const c = pega(f)
    c.venda += v.valor_total
    c.cmc += (v.cmc_unitario ?? 0) * v.quantidade
    c.qtd += 1
  }
  for (const v of mesAnt) {
    total.vendaMesAnt += v.valor_total
    const f = familiaDe(v)
    if (f) pega(f).vendaMesAnt += v.valor_total
  }
  for (const v of anoAnt) {
    total.vendaAnoAnt += v.valor_total
    const f = familiaDe(v)
    if (f) pega(f).vendaAnoAnt += v.valor_total
  }

  // só famílias com movimento em algum dos períodos, maiores primeiro
  const familias = [...cards.values()]
    .filter((c) => c.venda !== 0 || c.vendaMesAnt !== 0 || c.vendaAnoAnt !== 0)
    .sort((a, b) => b.venda - a.venda)

  return { familias, total }
}

export function parseCompetencia(url: URL): { mes: number; ano: number; conta: string } | null {
  const mes = Number(url.searchParams.get('mes'))
  const ano = Number(url.searchParams.get('ano'))
  const conta = (url.searchParams.get('conta') || 'NOVA').toUpperCase()
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return null
  if (conta !== 'NOVA' && conta !== 'CASTRO' && conta !== 'TODAS') return null
  return { mes, ano, conta }
}
