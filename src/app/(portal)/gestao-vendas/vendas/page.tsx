'use client'
// Vendas do Mês — as DUAS lojas de uma vez, com filtros (loja, família, busca)
// e cabeçalhos ordenáveis (clique alterna A→Z / Z→A).
// Padrão: as duas lojas marcadas e todas as famílias EXCETO peças e máquinas
// (famílias com "peça"/"trator"/"máquina" no nome começam desmarcadas).

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useGv } from '../GvProvider'
import { useGvMes } from '../hooks'
import { dataBrParaIso, formatBRL, formatCompetencia } from '@/lib/gestao-vendas/calculos'
import { nomeEmpresaGV, type VendaEnriquecida } from '@/lib/gestao-vendas/tipos'
import { ErroCard, MultiSelectFiltro } from '../componentes'

const SEM_FAMILIA = 'Sem família'
const FAMILIA_EXCLUIDA_PADRAO = /pe[çc]a|trator|m[áa]quina/i

function familiaDe(v: VendaEnriquecida): string {
  return v.produto_familia_real ?? v.familia ?? SEM_FAMILIA
}

type ColKey =
  | 'empresa'
  | 'pedido'
  | 'data'
  | 'descricao'
  | 'familia'
  | 'cliente'
  | 'vendedor'
  | 'qtd'
  | 'valor'
  | 'cmc'

type Sort = { col: ColKey; dir: 'asc' | 'desc' }

const COLUNAS: { key: ColKey; rotulo: string; numerica?: boolean }[] = [
  { key: 'empresa', rotulo: 'Loja' },
  { key: 'pedido', rotulo: 'Pedido' },
  { key: 'data', rotulo: 'Data' },
  { key: 'descricao', rotulo: 'Descrição' },
  { key: 'familia', rotulo: 'Família' },
  { key: 'cliente', rotulo: 'Cliente' },
  { key: 'vendedor', rotulo: 'Vendedor' },
  { key: 'qtd', rotulo: 'Qtd', numerica: true },
  { key: 'valor', rotulo: 'Valor', numerica: true },
  { key: 'cmc', rotulo: 'CMC un.', numerica: true },
]

function valorColuna(v: VendaEnriquecida, col: ColKey): string | number {
  switch (col) {
    case 'empresa': return (v.conta_omie ?? '').toUpperCase()
    case 'pedido': return v.numero_pedido ?? ''
    case 'data': return dataBrParaIso(v.data_pedido) ?? '' // ISO ordena certo como texto
    case 'descricao': return v.descricao ?? ''
    case 'familia': return familiaDe(v)
    case 'cliente': return v.cliente_nome ?? `#${v.codigo_cliente ?? ''}`
    case 'vendedor': return v.vendedor ?? ''
    case 'qtd': return v.quantidade ?? 0
    case 'valor': return v.valor_total ?? 0
    case 'cmc': return v.cmc_unitario ?? -1
  }
}

export default function GvVendasPage() {
  const { mes, ano } = useGv()
  const { vendas, loading, error } = useGvMes('TODAS')

  // ---------- filtros ----------
  const [lojas, setLojas] = useState<string[]>(['NOVA', 'CASTRO'])
  const [familias, setFamilias] = useState<string[]>([])
  const [busca, setBusca] = useState('')
  // famílias disponíveis mudam por competência; re-aplica o padrão quando muda
  const [chaveFamilias, setChaveFamilias] = useState('')

  const opcoesFamilias = useMemo(() => {
    const set = new Set<string>()
    for (const v of vendas) set.add(familiaDe(v))
    return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [vendas])

  useEffect(() => {
    if (loading) return
    const chave = `${mes}-${ano}-${opcoesFamilias.join('|')}`
    if (chave === chaveFamilias) return
    setChaveFamilias(chave)
    setFamilias(opcoesFamilias.filter((f) => !FAMILIA_EXCLUIDA_PADRAO.test(f)))
  }, [loading, mes, ano, opcoesFamilias, chaveFamilias])

  const filtradas = useMemo(() => {
    const b = busca.trim().toLowerCase()
    return vendas.filter((v) => {
      if (!lojas.includes((v.conta_omie ?? '').toUpperCase())) return false
      if (!familias.includes(familiaDe(v))) return false
      if (b) {
        const alvo =
          `${v.numero_pedido ?? ''} ${v.descricao ?? ''} ${v.cliente_nome ?? ''} ${v.codigo_cliente ?? ''} ${v.vendedor ?? ''}`.toLowerCase()
        if (!alvo.includes(b)) return false
      }
      return true
    })
  }, [vendas, lojas, familias, busca])

  // ---------- ordenação ----------
  const [sort, setSort] = useState<Sort>({ col: 'valor', dir: 'desc' })

  function clicarColuna(col: ColKey) {
    setSort((s) =>
      s.col === col
        ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: COLUNAS.find((c) => c.key === col)?.numerica ? 'desc' : 'asc' },
    )
  }

  const ordenadas = useMemo(() => {
    const arr = [...filtradas]
    const mult = sort.dir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const va = valorColuna(a, sort.col)
      const vb = valorColuna(b, sort.col)
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * mult
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * mult
    })
    return arr
  }, [filtradas, sort])

  // ---------- KPIs (sobre o filtrado) ----------
  const totalFaturado = filtradas.reduce((s, v) => s + (v.valor_total ?? 0), 0)
  const totalCmc = filtradas.reduce((s, v) => s + (v.cmc_unitario ?? 0) * (v.quantidade ?? 0), 0)

  const filtroAtivo =
    lojas.length !== 2 || familias.length !== opcoesFamilias.length || busca.trim() !== ''

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vendas do Mês</h1>
        <p className="text-sm text-gray-500">
          As duas lojas — {formatCompetencia(mes, ano)}. Por padrão, famílias de peças e máquinas
          começam desmarcadas no filtro.
        </p>
      </div>

      {error && <ErroCard msg={error} />}

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-md bg-gray-100 px-3 py-2 text-sm">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Filtrar:</span>
        <MultiSelectFiltro
          label="Loja"
          values={lojas}
          onChange={setLojas}
          opcoes={['NOVA', 'CASTRO']}
          getLabel={(v) => nomeEmpresaGV(v)}
        />
        <MultiSelectFiltro
          label="Família"
          values={familias}
          onChange={setFamilias}
          opcoes={opcoesFamilias}
        />
        <input
          type="text"
          placeholder="Buscar pedido, produto, cliente, vendedor…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-64 rounded border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-red-500"
        />
        {filtroAtivo && (
          <button
            type="button"
            onClick={() => {
              setLojas(['NOVA', 'CASTRO'])
              setFamilias(opcoesFamilias.filter((f) => !FAMILIA_EXCLUIDA_PADRAO.test(f)))
              setBusca('')
            }}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            ✕ Restaurar padrão
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500">
          {filtradas.length} / {vendas.length} item(ns)
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KPI titulo="Itens (filtro)" valor={loading ? '…' : String(filtradas.length)} />
        <KPI titulo="Total Faturado" valor={loading ? '…' : formatBRL(totalFaturado)} />
        <KPI titulo="Total CMC" valor={loading ? '…' : formatBRL(totalCmc)} />
        <KPI titulo="Venda − Custo" valor={loading ? '…' : formatBRL(totalFaturado - totalCmc)} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Itens ({ordenadas.length})</h2>
          <p className="text-xs text-gray-500">
            Clique no cabeçalho para ordenar (A→Z / Z→A). Vendedor vazio? Atribua em{' '}
            <Link href="/gestao-vendas/ajustes-venda" className="underline underline-offset-2">
              Ajustes por Venda
            </Link>
            .
          </p>
        </div>
        {loading ? (
          <p className="px-4 py-3 text-sm text-gray-500">Carregando…</p>
        ) : ordenadas.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">
            Nada a mostrar — confira os filtros acima (ou o sync do mês ainda não rodou).
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  {COLUNAS.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => clicarColuna(c.key)}
                      className={`cursor-pointer select-none px-3 py-2 font-medium hover:text-gray-800 ${
                        c.numerica ? 'text-right' : ''
                      }`}
                      title="Clique para ordenar"
                    >
                      {c.rotulo}
                      <span className="ml-0.5 inline-block w-3 text-[9px]">
                        {sort.col === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordenadas.map((v) => (
                  <tr key={`${v.conta_omie}-${v.id}`} className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-500">
                      {nomeEmpresaGV(v.conta_omie)}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums text-gray-500">{v.numero_pedido ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{v.data_pedido ?? '—'}</td>
                    <td className="max-w-[260px] truncate px-3 py-1.5" title={v.descricao ?? ''}>
                      {v.descricao ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">{familiaDe(v)}</td>
                    <td
                      className="max-w-[220px] truncate px-3 py-1.5"
                      title={v.cliente_nome ?? v.codigo_cliente ?? ''}
                    >
                      {v.cliente_nome ?? <span className="text-gray-400">#{v.codigo_cliente ?? '—'}</span>}
                    </td>
                    <td className="px-3 py-1.5">{v.vendedor ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{v.quantidade}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatBRL(v.valor_total)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">
                      {v.cmc_unitario == null ? '—' : formatBRL(v.cmc_unitario)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function KPI({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className="mt-0.5 text-xl font-bold text-gray-900">{valor}</p>
    </div>
  )
}
