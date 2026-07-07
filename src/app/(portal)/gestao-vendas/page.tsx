'use client'
// Dashboard do Gestão de Vendas: KPIs do mês + faturamento por vendedor e por
// família (série única → uma cor só, sem legenda) + top 10 vendas.

import { useMemo } from 'react'
import Link from 'next/link'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useGv } from './GvProvider'
import { useGvFamilias, useGvMes, type FamiliaCard } from './hooks'
import {
  agregarPor,
  formatBRL,
  formatCompetencia,
  formatPercent,
  ordenar,
} from '@/lib/gestao-vendas/calculos'
import { nomeEmpresaGV } from '@/lib/gestao-vendas/tipos'
import { ErroCard } from './componentes'

const COR_SERIE = '#2a78d6'
const COR_GRID = '#e1e0d9'
const COR_EIXO = '#898781'
const TOP_N = 10

type LinhaChart = { nome: string; venda: number }

function brlCompacto(v: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(v)
}

export default function GvDashboardPage() {
  const { mes, ano, conta } = useGv()
  const { vendas, loading, error } = useGvMes()
  const { dados: familiasCards, loading: loadingFam, error: errorFam } = useGvFamilias()

  const totalFaturado = vendas.reduce((s, v) => s + (v.valor_total ?? 0), 0)
  const totalCmc = vendas.reduce((s, v) => s + (v.cmc_unitario ?? 0) * (v.quantidade ?? 0), 0)
  const totalVendaMenosCusto = totalFaturado - totalCmc
  const margemPct = totalFaturado === 0 ? 0 : totalVendaMenosCusto / totalFaturado
  const maiorVenda = vendas.reduce((max, v) => Math.max(max, v.valor_total ?? 0), 0)

  const porVendedor = useMemo<LinhaChart[]>(() => {
    const m = agregarPor(vendas, (v) => v.vendedor?.trim() || 'Sem vendedor')
    return ordenar(m)
      .slice(0, TOP_N)
      .map((i) => ({ nome: i.chave, venda: i.agregado.venda }))
  }, [vendas])

  const topVendas = vendas.slice(0, 10)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestão de Vendas</h1>
        <p className="text-sm text-gray-500">
          {nomeEmpresaGV(conta)} — {formatCompetencia(mes, ano)}
        </p>
      </div>

      {error && <ErroCard msg={error} />}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KPI titulo="Total Faturado" valor={loading ? '…' : formatBRL(totalFaturado)} />
        <KPI
          titulo="Venda − Custo"
          valor={loading ? '…' : formatBRL(totalVendaMenosCusto)}
          sub={loading ? undefined : `CMC: ${formatBRL(totalCmc)} · ${formatPercent(margemPct, 0)} sobre a venda`}
        />
        <KPI titulo="Itens vendidos" valor={loading ? '…' : String(vendas.length)} />
        <KPI titulo="Maior venda" valor={loading ? '…' : formatBRL(maiorVenda)} />
      </div>

      {/* Cards por família (mesma visão do dashboard de estoque) */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-gray-900">Resultado por Família</h2>
          <span className="text-xs text-gray-500">
            comparativos: mês anterior e mesmo mês do ano anterior
          </span>
        </div>
        {errorFam && <ErroCard msg={errorFam} />}
        {loadingFam ? (
          <p className="text-sm text-gray-500">Carregando famílias…</p>
        ) : !familiasCards || familiasCards.familias.length === 0 ? (
          <p className="text-sm text-gray-500">Sem dados de família no período.</p>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {familiasCards.familias.map((f) => (
              <CardFamilia key={f.nome} f={f} />
            ))}
            <CardFamilia f={familiasCards.total} destaque />
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <GraficoBarras titulo="Faturamento por Vendedor" sub={`Top ${TOP_N}`} dados={porVendedor} loading={loading} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">Maiores vendas do mês</h2>
          <p className="text-xs text-gray-500">
            Top 10 por valor.{' '}
            <Link href="/gestao-vendas/vendas" className="underline underline-offset-2 hover:text-gray-800">
              Ver todas
            </Link>
          </p>
        </div>
        {loading ? (
          <p className="px-4 py-3 text-sm text-gray-500">Carregando…</p>
        ) : topVendas.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">Sem vendas para essa empresa/competência.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Pedido</th>
                  <th className="px-4 py-2 font-medium">Descrição</th>
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Vendedor</th>
                  <th className="px-4 py-2 text-right font-medium">Valor</th>
                </tr>
              </thead>
              <tbody>
                {topVendas.map((v) => (
                  <tr key={v.id} className="border-t border-gray-100">
                    <td className="px-4 py-2 tabular-nums text-gray-500">{v.numero_pedido ?? '—'}</td>
                    <td className="max-w-[280px] truncate px-4 py-2" title={v.descricao ?? ''}>
                      {v.descricao ?? '—'}
                    </td>
                    <td className="max-w-[220px] truncate px-4 py-2" title={v.cliente_nome ?? v.codigo_cliente ?? ''}>
                      {v.cliente_nome ?? <span className="text-gray-400">#{v.codigo_cliente ?? '—'}</span>}
                    </td>
                    <td className="px-4 py-2">{v.vendedor ?? '—'}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{formatBRL(v.valor_total)}</td>
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

// variação % vs referência (null quando não há base de comparação)
function calcVar(atual: number, ref: number): number | null {
  if (!ref) return null
  return (atual - ref) / Math.abs(ref)
}

function CardFamilia({ f, destaque }: { f: FamiliaCard; destaque?: boolean }) {
  const varM = calcVar(f.venda, f.vendaMesAnt)
  const varA = calcVar(f.venda, f.vendaAnoAnt)
  const vMenosC = f.venda - f.cmc
  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        destaque ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'
      }`}
    >
      <p className="mb-1.5 truncate text-[11px] font-bold uppercase tracking-wide text-gray-500" title={f.nome}>
        {f.nome}
      </p>
      <p className="text-xl font-bold text-red-600">{formatBRL(f.venda)}</p>
      <p className="mt-1 text-[11px] text-gray-500">
        {f.qtd} item(ns) · V−C: <span className={vMenosC < 0 ? 'font-semibold text-red-600' : 'font-semibold text-gray-700'}>{formatBRL(vMenosC)}</span>
      </p>
      <div className="mt-2 flex gap-3 text-[11px]">
        <Variacao rotulo="Mês ant" valor={varM} />
        <Variacao rotulo="Ano ant" valor={varA} />
      </div>
    </div>
  )
}

function Variacao({ rotulo, valor }: { rotulo: string; valor: number | null }) {
  if (valor == null) return <span className="text-gray-400">{rotulo}: —</span>
  const pct = new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    maximumFractionDigits: 0,
    signDisplay: 'always',
  }).format(valor)
  return <span className={valor >= 0 ? 'text-green-600' : 'text-red-600'}>{rotulo}: {pct}</span>
}

function KPI({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className="mt-0.5 text-xl font-bold text-gray-900">{valor}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

function GraficoBarras({
  titulo,
  sub,
  dados,
  loading,
}: {
  titulo: string
  sub: string
  dados: LinhaChart[]
  loading: boolean
}) {
  const altura = Math.max(220, dados.length * 34 + 40)
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h2 className="text-base font-semibold text-gray-900">{titulo}</h2>
        <p className="text-xs text-gray-500">{sub}</p>
      </div>
      <div className="p-3">
        {loading ? (
          <p className="text-sm text-gray-500">Carregando…</p>
        ) : dados.length === 0 ? (
          <p className="text-sm text-gray-500">Sem dados.</p>
        ) : (
          <ResponsiveContainer width="100%" height={altura}>
            <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 56, top: 4 }}>
              <CartesianGrid horizontal={false} stroke={COR_GRID} />
              <XAxis
                type="number"
                tickFormatter={brlCompacto}
                tick={{ fontSize: 11, fill: COR_EIXO }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="nome"
                width={150}
                tick={{ fontSize: 11, fill: '#52514e' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value) => [formatBRL(Number(value)), 'Venda']}
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                contentStyle={{ fontSize: 12, borderRadius: 6 }}
              />
              <Bar
                dataKey="venda"
                fill={COR_SERIE}
                radius={[0, 4, 4, 0]}
                barSize={18}
                label={{
                  position: 'right',
                  fontSize: 10,
                  fill: '#52514e',
                  formatter: (v: unknown) => (typeof v === 'number' ? brlCompacto(v) : ''),
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
