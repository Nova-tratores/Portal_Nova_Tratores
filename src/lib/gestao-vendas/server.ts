// Acesso a dados do Gestão de Vendas no SERVIDOR (service role — ignora RLS).
// As rotas de API validam login+permissão antes de chamar estas funções.

import { supabaseAdmin } from '@/lib/server/supabase-admin'
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

  // lookups nas tabelas master (nomes de cliente, família real, categoria)
  const codCli = [...new Set(vendas.map((v) => v.codigo_cliente).filter((c): c is string => !!c && /^\d+$/.test(c)))].map(Number)
  const codProd = [...new Set(vendas.map((v) => v.codigo_produto).filter((c): c is string => !!c && /^\d+$/.test(c)))].map(Number)
  const codCat = [...new Set(vendas.map((v) => v.codigo_categoria).filter((c): c is string => !!c))]

  // clientes com chave conta-aware (o mesmo código Omie pode existir nas duas contas)
  const clientes = new Map<string, string>()
  const familias = new Map<string, string | null>()
  const categorias = new Map<string, string>()

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

  await Promise.all(buscas)

  return vendas.map((v) => ({
    ...v,
    cliente_nome: v.codigo_cliente
      ? clientes.get(`${(v.conta_omie ?? '').toUpperCase()}|${Number(v.codigo_cliente)}`) ?? null
      : null,
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
  return fetchAll<CustoMensalVendedor>((from, to) =>
    supabaseAdmin
      .from('comissao_custos_vendedor')
      .select('*')
      .eq('mes', mes)
      .eq('ano', ano)
      .ilike('conta_omie', conta)
      .order('nome', { ascending: true })
      .range(from, to),
  )
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

export function parseCompetencia(url: URL): { mes: number; ano: number; conta: string } | null {
  const mes = Number(url.searchParams.get('mes'))
  const ano = Number(url.searchParams.get('ano'))
  const conta = (url.searchParams.get('conta') || 'NOVA').toUpperCase()
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null
  if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) return null
  if (conta !== 'NOVA' && conta !== 'CASTRO' && conta !== 'TODAS') return null
  return { mes, ano, conta }
}
