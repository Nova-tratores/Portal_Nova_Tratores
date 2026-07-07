// Cálculos puros do Gestão de Vendas: margem, comissão, agregações e
// consolidação por vendedor. Sem dependência de React/Supabase (usável no
// cliente e no servidor).

import type { AjusteVenda, CampoCusto, CustoMensalVendedor, VendaItem } from './tipos'
import { CAMPOS_CUSTO } from './tipos'

// ---------- fórmulas por venda ----------
//   custo_total    = cmc_total + custos_extras + desconto
//   valor_comissao = valor_venda * comissao_pct / 100
//   margem_loja    = valor_venda - valor_comissao - custo_total

export type CalculoInput = {
  valor_venda: number
  cmc_total: number
  custos_extras: number
  desconto: number
  comissao_pct: number
}

export type CalculoResultado = {
  valor_comissao: number
  custo_total: number
  venda_liquida: number
  margem_bruta_valor: number
  margem_bruta_pct: number
  margem_loja_valor: number
  margem_loja_pct: number
  cmc_ratio: number
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function calcular(input: CalculoInput): CalculoResultado {
  const { valor_venda, cmc_total, custos_extras, desconto, comissao_pct } = input
  const valor_comissao = round2(valor_venda * (comissao_pct / 100))
  const custo_total = round2(cmc_total + custos_extras + desconto)
  const venda_liquida = round2(valor_venda - valor_comissao)
  const margem_bruta_valor = round2(valor_venda - cmc_total)
  const margem_bruta_pct = valor_venda === 0 ? 0 : margem_bruta_valor / valor_venda
  const margem_loja_valor = round2(valor_venda - valor_comissao - custo_total)
  const margem_loja_pct = valor_venda === 0 ? 0 : margem_loja_valor / valor_venda
  const cmc_ratio = valor_venda === 0 ? 0 : cmc_total / valor_venda
  return {
    valor_comissao,
    custo_total,
    venda_liquida,
    margem_bruta_valor,
    margem_bruta_pct,
    margem_loja_valor,
    margem_loja_pct,
    cmc_ratio,
  }
}

export type CorMargem = 'verde' | 'amarelo' | 'vermelho'

// Regra de cor sobre CMC/Venda: < 0,80 vermelho · 0,80–0,89 amarelo · ≥ 0,90 verde.
export function classificarCmcRatio(ratio: number): CorMargem {
  if (ratio < 0.8) return 'vermelho'
  if (ratio < 0.9) return 'amarelo'
  return 'verde'
}

// Chave composta usada em comissao_ajustes_vendas.venda_id: "pedido|cliente|id_item"
export function vendaIdFor(opts: {
  numero_pedido: string | null
  codigo_cliente: string | null
  id: number
}): string {
  return `${opts.numero_pedido ?? ''}|${opts.codigo_cliente ?? ''}|${opts.id}`
}

// "DD/MM/YYYY" → "YYYY-MM-DD" (data_venda é date)
export function dataBrParaIso(s: string | null | undefined): string | null {
  if (!s) return null
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

// ---------- agregações genéricas ----------

export type Agregado = {
  qtd: number
  custo: number
  venda: number
  vMenosC: number
  margem: number // custo / venda
}

const ZERO: Agregado = { qtd: 0, custo: 0, venda: 0, vMenosC: 0, margem: 0 }

export function agregadoVazio(): Agregado {
  return { ...ZERO }
}

export function fecharMargem(m: Map<string, Agregado>): Map<string, Agregado> {
  for (const a of m.values()) {
    a.vMenosC = a.venda - a.custo
    a.margem = a.venda === 0 ? 0 : a.custo / a.venda
  }
  return m
}

export function agregarPor<V extends VendaItem>(
  vendas: V[],
  fn: (v: V) => string | null | undefined,
): Map<string, Agregado> {
  const map = new Map<string, Agregado>()
  for (const v of vendas) {
    const k = fn(v)
    if (k == null || k === '') continue
    const cmc = (v.cmc_unitario ?? 0) * v.quantidade
    const atual = map.get(k) ?? { ...ZERO }
    atual.qtd += 1
    atual.custo += cmc
    atual.venda += v.valor_total
    map.set(k, atual)
  }
  return fecharMargem(map)
}

export type ItemOrdenado = { chave: string; agregado: Agregado }

export function ordenar(map: Map<string, Agregado>, por: keyof Agregado = 'venda'): ItemOrdenado[] {
  const arr = [...map.entries()].map(([chave, agregado]) => ({ chave, agregado }))
  arr.sort((a, b) => b.agregado[por] - a.agregado[por])
  return arr
}

export function totalizar(items: ItemOrdenado[]): Agregado {
  const t: Agregado = { ...ZERO }
  for (const i of items) {
    t.qtd += i.agregado.qtd
    t.custo += i.agregado.custo
    t.venda += i.agregado.venda
  }
  t.vMenosC = t.venda - t.custo
  t.margem = t.venda === 0 ? 0 : t.custo / t.venda
  return t
}

// Tratores / Implementos / Outros pela família (heurística)
export function categoriaMaquina(familia: string | null | undefined): 'Tratores' | 'Implementos' | 'Outros' {
  if (!familia) return 'Outros'
  const f = familia.toLowerCase()
  if (f.includes('trator')) return 'Tratores'
  if (
    f.includes('carreta') ||
    f.includes('implemento') ||
    f.includes('pulverizador') ||
    f.includes('plantadeira') ||
    f.includes('adubadora') ||
    f.includes('colhe')
  )
    return 'Implementos'
  return 'Outros'
}

// ---------- consolidação por vendedor ----------

export const SEM_VENDEDOR = 'Sem vendedor'

export type LinhaAjuste = {
  venda: VendaItem & { cliente_nome: string | null }
  venda_id_chave: string
  ajuste: AjusteVenda | null
}

export function vendedorDaLinha(l: LinhaAjuste): string {
  return l.ajuste?.vendedor?.trim() || l.venda.vendedor?.trim() || SEM_VENDEDOR
}

export function totalCusto(r: CustoMensalVendedor | null | undefined): number {
  if (!r) return 0
  return CAMPOS_CUSTO.reduce((s, c: CampoCusto) => s + (r[c] ?? 0), 0)
}

export type ResultadoVendedor = {
  vendedor: string
  qtd: number
  venda: number
  cmc: number
  custosExtras: number
  descontos: number
  comissao: number
  margemLoja: number
  custoMensal: number
  lucroLiquido: number
}

export function consolidarPorVendedor(
  linhas: LinhaAjuste[],
  custos: CustoMensalVendedor[],
): ResultadoVendedor[] {
  const map = new Map<string, ResultadoVendedor>()

  const pega = (nome: string): ResultadoVendedor => {
    let r = map.get(nome)
    if (!r) {
      r = {
        vendedor: nome,
        qtd: 0,
        venda: 0,
        cmc: 0,
        custosExtras: 0,
        descontos: 0,
        comissao: 0,
        margemLoja: 0,
        custoMensal: 0,
        lucroLiquido: 0,
      }
      map.set(nome, r)
    }
    return r
  }

  for (const l of linhas) {
    const r = pega(vendedorDaLinha(l))
    const cmcTotal = (l.venda.cmc_unitario ?? 0) * l.venda.quantidade
    const aj = l.ajuste
    const calc = calcular({
      valor_venda: l.venda.valor_total,
      cmc_total: cmcTotal,
      custos_extras: aj?.custos_extras ?? 0,
      desconto: aj?.desconto ?? 0,
      comissao_pct: aj?.comissao_override_pct ?? aj?.comissao_pct ?? 0,
    })
    r.qtd += 1
    r.venda += l.venda.valor_total
    r.cmc += cmcTotal
    r.custosExtras += aj?.custos_extras ?? 0
    r.descontos += aj?.desconto ?? 0
    r.comissao += calc.valor_comissao
    r.margemLoja += calc.margem_loja_valor
  }

  // custo fixo entra mesmo sem venda no mês; soma (com "Todas as Lojas"
  // o mesmo vendedor pode ter registro nas duas contas)
  for (const c of custos) {
    const custo = totalCusto(c)
    if (custo === 0 && !map.has(c.nome)) continue
    pega(c.nome).custoMensal += custo
  }

  for (const r of map.values()) r.lucroLiquido = r.margemLoja - r.custoMensal
  return [...map.values()].sort((a, b) => b.venda - a.venda)
}

export function totalResultado(rs: ResultadoVendedor[]): ResultadoVendedor {
  const t: ResultadoVendedor = {
    vendedor: 'Total',
    qtd: 0,
    venda: 0,
    cmc: 0,
    custosExtras: 0,
    descontos: 0,
    comissao: 0,
    margemLoja: 0,
    custoMensal: 0,
    lucroLiquido: 0,
  }
  for (const r of rs) {
    t.qtd += r.qtd
    t.venda += r.venda
    t.cmc += r.cmc
    t.custosExtras += r.custosExtras
    t.descontos += r.descontos
    t.comissao += r.comissao
    t.margemLoja += r.margemLoja
    t.custoMensal += r.custoMensal
    t.lucroLiquido += r.lucroLiquido
  }
  return t
}

// ---------- formatação ----------

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatBRL(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return brl.format(0)
  return brl.format(value)
}

export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return '0,00%'
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function nomeMes(mes: number): string {
  return MESES[mes - 1] ?? ''
}

export function formatCompetencia(mes: number, ano: number): string {
  return `${nomeMes(mes)} / ${ano}`
}
