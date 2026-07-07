'use client'
// Relatório Geral da Loja — pedidos FATURADO do mês (Nova + Castro combinadas),
// agregados por cliente/empresa/vendedor/categoria/máquina/família/produto,
// com filtros multi-seleção. Imprimível.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useGv } from '../../GvProvider'
import { cmcDoPedido, pedidoAtivo, useGvPedidos } from '../../hooks'
import {
  agregadoVazio,
  categoriaMaquina,
  classificarCmcRatio,
  fecharMargem,
  formatBRL,
  formatPercent,
  nomeMes,
  ordenar,
  totalizar,
  type Agregado,
  type ItemOrdenado,
} from '@/lib/gestao-vendas/calculos'
import {
  nomeEmpresaGV,
  type PedidoVendaItemEnriquecido,
  type PedidoVendaRelatorio,
} from '@/lib/gestao-vendas/tipos'
import { CabecalhoRelatorio, ErroCard, SecaoRelatorio } from '../../componentes'

const LIMITE_CLIENTES = 30
const LIMITE_PRODUTOS = 60

function agregarPedidosPor(
  pedidos: PedidoVendaRelatorio[],
  fnChave: (p: PedidoVendaRelatorio) => string | null | undefined,
  filtraItens: (it: PedidoVendaItemEnriquecido) => boolean,
  filtroItemAtivo: boolean,
): Map<string, Agregado> {
  const m = new Map<string, Agregado>()
  for (const p of pedidos) {
    const k = fnChave(p)
    if (!k) continue
    const cur = m.get(k) ?? agregadoVazio()
    cur.qtd += 1
    if (!filtroItemAtivo) {
      cur.custo += cmcDoPedido(p)
      cur.venda += p.valor_total ?? 0
    } else {
      for (const it of p.itens_enriquecidos ?? []) {
        if (!filtraItens(it)) continue
        cur.custo += Number(it.custo_unitario ?? 0) * Number(it.quantidade ?? 0)
        cur.venda += Number(it.valor_total ?? 0)
      }
    }
    m.set(k, cur)
  }
  return fecharMargem(m)
}

function agregarItensPor(
  pedidos: PedidoVendaRelatorio[],
  fnChave: (it: PedidoVendaItemEnriquecido) => string | null | undefined,
  filtraItens: (it: PedidoVendaItemEnriquecido) => boolean,
): Map<string, Agregado> {
  const m = new Map<string, Agregado>()
  for (const p of pedidos) {
    for (const it of p.itens_enriquecidos ?? []) {
      if (!filtraItens(it)) continue
      const k = fnChave(it)
      if (!k) continue
      const cur = m.get(k) ?? agregadoVazio()
      cur.qtd += 1
      cur.custo += Number(it.custo_unitario ?? 0) * Number(it.quantidade ?? 0)
      cur.venda += Number(it.valor_total ?? 0)
      m.set(k, cur)
    }
  }
  return fecharMargem(m)
}

export default function GvRelatorioGeralPage() {
  const { mes, ano } = useGv()
  const { pedidos, loading, error } = useGvPedidos()

  const ativos = useMemo(() => pedidos.filter(pedidoAtivo), [pedidos])

  const [filtroEmpresas, setFiltroEmpresas] = useState<string[]>([])
  const [filtroFamilias, setFiltroFamilias] = useState<string[]>([])
  const [filtroCategorias, setFiltroCategorias] = useState<string[]>([])
  const [filtroVendedores, setFiltroVendedores] = useState<string[]>([])

  const opcoes = useMemo(() => {
    const empresas = new Set<string>()
    const familias = new Set<string>()
    const categorias = new Set<string>()
    const vendedores = new Set<string>()
    for (const p of ativos) {
      if (p.empresa) empresas.add(p.empresa.toUpperCase())
      if (p.categoria) categorias.add(p.categoria)
      if (p.vendedor) vendedores.add(p.vendedor)
      for (const it of p.itens_enriquecidos ?? []) {
        if (it.familia) familias.add(it.familia)
      }
    }
    const sort = (a: string, b: string) => a.localeCompare(b, 'pt-BR')
    return {
      empresas: [...empresas].sort(sort),
      familias: [...familias].sort(sort),
      categorias: [...categorias].sort(sort),
      vendedores: [...vendedores].sort(sort),
    }
  }, [ativos])

  const pedidosFiltrados = useMemo(() => {
    return ativos.filter((p) => {
      if (filtroEmpresas.length && !filtroEmpresas.includes((p.empresa ?? '').toUpperCase())) return false
      if (filtroVendedores.length && !filtroVendedores.includes(p.vendedor ?? '')) return false
      if (filtroCategorias.length && !filtroCategorias.includes(p.categoria ?? '')) return false
      if (filtroFamilias.length) {
        const tem = (p.itens_enriquecidos ?? []).some((it) => filtroFamilias.includes(it.familia ?? ''))
        if (!tem) return false
      }
      return true
    })
  }, [ativos, filtroEmpresas, filtroVendedores, filtroCategorias, filtroFamilias])

  const filtroItemAtivo = filtroFamilias.length > 0
  const aggs = useMemo(() => {
    const filtraItens = filtroItemAtivo
      ? (it: PedidoVendaItemEnriquecido) => filtroFamilias.includes(it.familia ?? '')
      : () => true
    return {
      porCliente: agregarPedidosPor(pedidosFiltrados, (p) => p.cliente, filtraItens, filtroItemAtivo),
      porEmpresa: agregarPedidosPor(pedidosFiltrados, (p) => nomeEmpresaGV(p.empresa) || null, filtraItens, filtroItemAtivo),
      porVendedor: agregarPedidosPor(pedidosFiltrados, (p) => p.vendedor, filtraItens, filtroItemAtivo),
      porCategoria: agregarPedidosPor(pedidosFiltrados, (p) => p.categoria, filtraItens, filtroItemAtivo),
      porMaquina: agregarItensPor(pedidosFiltrados, (it) => categoriaMaquina(it.familia), filtraItens),
      porFamilia: agregarItensPor(pedidosFiltrados, (it) => it.familia, filtraItens),
      porProduto: agregarItensPor(pedidosFiltrados, (it) => it.descricao, filtraItens),
    }
  }, [pedidosFiltrados, filtroFamilias, filtroItemAtivo])

  const filtrosAtivos =
    filtroEmpresas.length > 0 ||
    filtroFamilias.length > 0 ||
    filtroCategorias.length > 0 ||
    filtroVendedores.length > 0

  const filtrosResumo = [
    filtroEmpresas.length > 0 && `Empresa(s): ${filtroEmpresas.map((e) => nomeEmpresaGV(e)).join(', ')}`,
    filtroVendedores.length > 0 && `Vendedor(es): ${filtroVendedores.join(', ')}`,
    filtroCategorias.length > 0 && `Categoria(s): ${filtroCategorias.join(', ')}`,
    filtroFamilias.length > 0 && `Família(s): ${filtroFamilias.join(', ')}`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/gestao-vendas/relatorios" className="text-sm text-gray-500 hover:text-gray-800">
          ← Voltar aos relatórios
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          Imprimir
        </button>
      </div>

      {error && <ErroCard msg={error} />}
      {loading ? (
        <p className="px-2 text-sm text-gray-500">Carregando dados…</p>
      ) : ativos.length === 0 ? (
        <p className="px-2 text-sm text-gray-500">
          Sem pedidos faturados para {nomeMes(mes)} / {ano}.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-sm print:hidden">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Filtrar:</span>
            <MultiSelectFiltro label="Empresa" values={filtroEmpresas} onChange={setFiltroEmpresas} opcoes={opcoes.empresas} getLabel={(v) => nomeEmpresaGV(v)} />
            <MultiSelectFiltro label="Família" values={filtroFamilias} onChange={setFiltroFamilias} opcoes={opcoes.familias} />
            <MultiSelectFiltro label="Categoria" values={filtroCategorias} onChange={setFiltroCategorias} opcoes={opcoes.categorias} />
            <MultiSelectFiltro label="Vendedor" values={filtroVendedores} onChange={setFiltroVendedores} opcoes={opcoes.vendedores} />
            {filtrosAtivos && (
              <button
                type="button"
                onClick={() => {
                  setFiltroEmpresas([])
                  setFiltroFamilias([])
                  setFiltroCategorias([])
                  setFiltroVendedores([])
                }}
                className="text-xs text-gray-500 hover:text-gray-800"
              >
                ✕ Limpar tudo
              </button>
            )}
            <span className="ml-auto text-xs text-gray-500">
              {pedidosFiltrados.length} / {ativos.length} pedido(s) faturado(s)
            </span>
          </div>

          <CabecalhoRelatorio
            titulo="Informações Gerais Resumidas"
            mesAno={`${nomeMes(mes)} | ${ano}`}
            direita={
              <>
                {pedidosFiltrados.length} pedido(s) faturado(s){' '}
                {filtrosAtivos ? `(filtrados de ${ativos.length})` : ''}
                <br />
                Nova Tratores + Castro Peças combinadas
              </>
            }
          />

          {filtrosAtivos && (
            <div
              className="border-l-4 border-yellow-400 bg-yellow-50 px-3 py-2 text-xs"
              style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
            >
              <span className="font-medium">Filtros aplicados:</span> {filtrosResumo}
            </div>
          )}

          <SecaoRelatorio titulo="Ranking de Clientes por Total de Venda" sub={`Top ${LIMITE_CLIENTES}`}>
            <TabelaAgregada itens={ordenar(aggs.porCliente).slice(0, LIMITE_CLIENTES)} />
          </SecaoRelatorio>
          <SecaoRelatorio titulo="Resultado por Empresa">
            <TabelaAgregada itens={ordenar(aggs.porEmpresa)} />
          </SecaoRelatorio>
          <SecaoRelatorio titulo="Resultado por Vendedor">
            <TabelaAgregada itens={ordenar(aggs.porVendedor)} />
          </SecaoRelatorio>
          <SecaoRelatorio titulo="Resultado por Categoria">
            <TabelaAgregada itens={ordenar(aggs.porCategoria)} />
          </SecaoRelatorio>
          <SecaoRelatorio titulo="Resultado por Tipo de Máquina" sub="heurística por família">
            <TabelaAgregada itens={ordenar(aggs.porMaquina)} />
          </SecaoRelatorio>
          <SecaoRelatorio titulo="Resultado por Família de Produto">
            <TabelaAgregada itens={ordenar(aggs.porFamilia)} />
          </SecaoRelatorio>
          <SecaoRelatorio titulo="Detalhamento por Produto" sub={`Top ${LIMITE_PRODUTOS} por venda`}>
            <TabelaAgregada itens={ordenar(aggs.porProduto).slice(0, LIMITE_PRODUTOS)} />
          </SecaoRelatorio>
        </>
      )}
    </div>
  )
}

function MultiSelectFiltro({
  label,
  values,
  onChange,
  opcoes,
  getLabel,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  opcoes: string[]
  getLabel?: (v: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const rotular = getLabel ?? ((v: string) => v)

  useEffect(() => {
    if (!open) return
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [open])

  function toggle(v: string) {
    if (values.includes(v)) onChange(values.filter((x) => x !== v))
    else onChange([...values, v])
  }

  const display =
    values.length === 0 ? '— todos —' : values.length === 1 ? rotular(values[0]) : `${values.length} selecionados`

  const opcoesFiltradas = busca.trim()
    ? opcoes.filter((o) => rotular(o).toLowerCase().includes(busca.toLowerCase()))
    : opcoes

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-[170px] max-w-[240px] items-center justify-between gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-left text-xs"
        title={values.length > 0 ? values.map(rotular).join(', ') : undefined}
      >
        <span className="truncate">
          <span className="text-gray-500">{label}:</span>{' '}
          <span className={values.length > 0 ? 'font-medium' : 'text-gray-500'}>{display}</span>
        </span>
        <span className="shrink-0 text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 flex max-h-80 w-80 flex-col overflow-hidden rounded border border-gray-200 bg-white shadow-md">
          <input
            type="text"
            placeholder="Buscar…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="border-b border-gray-200 px-2 py-1.5 text-xs focus:outline-none"
            autoFocus
          />
          <div className="flex-1 overflow-auto p-1">
            {opcoesFiltradas.length === 0 ? (
              <p className="px-2 py-1 text-xs text-gray-500">Sem resultados.</p>
            ) : (
              opcoesFiltradas.map((o) => (
                <label
                  key={o}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-gray-100"
                >
                  <input
                    type="checkbox"
                    checked={values.includes(o)}
                    onChange={() => toggle(o)}
                    className="h-3 w-3 shrink-0"
                  />
                  <span className="truncate" title={rotular(o)}>
                    {rotular(o)}
                  </span>
                </label>
              ))
            )}
          </div>
          {values.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="border-t border-gray-200 px-3 py-1.5 text-left text-xs text-gray-500 hover:text-gray-800"
            >
              Limpar seleção ({values.length})
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function TabelaAgregada({ itens }: { itens: ItemOrdenado[] }) {
  const total = totalizar(itens)
  if (itens.length === 0) {
    return <p className="px-3 py-2 text-xs text-gray-500">Sem dados.</p>
  }
  return (
    <table className="w-full text-xs">
      <thead className="bg-gray-50 text-[10px] uppercase text-gray-500">
        <tr>
          <th className="px-3 py-1.5 text-left font-medium">Item</th>
          <th className="px-3 py-1.5 text-right font-medium">Qtd</th>
          <th className="px-3 py-1.5 text-right font-medium">Custo</th>
          <th className="px-3 py-1.5 text-right font-medium">Venda</th>
          <th className="px-3 py-1.5 text-right font-medium">V − C</th>
          <th className="px-3 py-1.5 text-right font-medium">Margem</th>
        </tr>
      </thead>
      <tbody>
        {itens.map((item, i) => (
          <LinhaTabela key={item.chave + i} item={item} />
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
          <td className="px-3 py-1.5">Total</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{total.qtd}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(total.custo)}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(total.venda)}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(total.vMenosC)}</td>
          <td className="px-3 py-1.5 text-right tabular-nums">{formatPercent(total.margem, 0)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

function LinhaTabela({ item }: { item: ItemOrdenado }): ReactNode {
  const { chave, agregado } = item
  const cor = classificarCmcRatio(agregado.margem)
  const corCls =
    cor === 'verde' ? 'text-green-700' : cor === 'amarelo' ? 'text-yellow-700' : 'text-red-700'
  return (
    <tr className="border-t border-gray-100">
      <td className="max-w-[400px] truncate px-3 py-1" title={chave}>
        {chave}
      </td>
      <td className="px-3 py-1 text-right tabular-nums">{agregado.qtd}</td>
      <td className="px-3 py-1 text-right tabular-nums">{formatBRL(agregado.custo)}</td>
      <td className="px-3 py-1 text-right tabular-nums">{formatBRL(agregado.venda)}</td>
      <td className="px-3 py-1 text-right tabular-nums">{formatBRL(agregado.vMenosC)}</td>
      <td className={`px-3 py-1 text-right tabular-nums ${corCls}`}>{formatPercent(agregado.margem, 0)}</td>
    </tr>
  )
}
