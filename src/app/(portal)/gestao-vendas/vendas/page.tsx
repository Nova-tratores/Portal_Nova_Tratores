'use client'
// Vendas do Mês — itens de vendas_itens com totais (sync Omie acontece fora daqui).

import Link from 'next/link'
import { useGv } from '../GvProvider'
import { useGvMes } from '../hooks'
import { formatBRL, formatCompetencia } from '@/lib/gestao-vendas/calculos'
import { nomeEmpresaGV } from '@/lib/gestao-vendas/tipos'
import { ErroCard } from '../componentes'

export default function GvVendasPage() {
  const { mes, ano, conta } = useGv()
  const { vendas, loading, error } = useGvMes()

  const totalFaturado = vendas.reduce((s, v) => s + (v.valor_total ?? 0), 0)
  const totalCmc = vendas.reduce((s, v) => s + (v.cmc_unitario ?? 0) * (v.quantidade ?? 0), 0)
  const ultima = vendas.length
    ? vendas.reduce((max, v) => (v.created_at > max ? v.created_at : max), vendas[0].created_at)
    : null

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Vendas do Mês</h1>
        <p className="text-sm text-gray-500">
          {nomeEmpresaGV(conta)} — {formatCompetencia(mes, ano)}
          {ultima && (
            <> · última importação: {new Date(ultima).toLocaleString('pt-BR')}</>
          )}
        </p>
      </div>

      {error && <ErroCard msg={error} />}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <KPI titulo="Itens importados" valor={loading ? '…' : String(vendas.length)} />
        <KPI titulo="Total Faturado" valor={loading ? '…' : formatBRL(totalFaturado)} />
        <KPI titulo="Total CMC" valor={loading ? '…' : formatBRL(totalCmc)} />
        <KPI titulo="Venda − Custo" valor={loading ? '…' : formatBRL(totalFaturado - totalCmc)} />
      </div>

      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-900">
            Itens ({vendas.length})
          </h2>
          <p className="text-xs text-gray-500">
            Ordenado por valor. Vendedor vazio? Atribua em{' '}
            <Link href="/gestao-vendas/ajustes-venda" className="underline underline-offset-2">
              Ajustes por Venda
            </Link>
            .
          </p>
        </div>
        {loading ? (
          <p className="px-4 py-3 text-sm text-gray-500">Carregando…</p>
        ) : vendas.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">
            Sem vendas importadas para essa empresa/competência. Verifique se o sync rodou.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2 font-medium">Pedido</th>
                  <th className="px-3 py-2 font-medium">Data</th>
                  <th className="px-3 py-2 font-medium">Descrição</th>
                  <th className="px-3 py-2 font-medium">Família</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Vendedor</th>
                  <th className="px-3 py-2 text-right font-medium">Qtd</th>
                  <th className="px-3 py-2 text-right font-medium">Valor</th>
                  <th className="px-3 py-2 text-right font-medium">CMC un.</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map((v) => (
                  <tr key={v.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 tabular-nums text-gray-500">{v.numero_pedido ?? '—'}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">{v.data_pedido ?? '—'}</td>
                    <td className="max-w-[260px] truncate px-3 py-1.5" title={v.descricao ?? ''}>
                      {v.descricao ?? '—'}
                    </td>
                    <td className="px-3 py-1.5">{v.produto_familia_real ?? v.familia ?? '—'}</td>
                    <td className="max-w-[220px] truncate px-3 py-1.5" title={v.cliente_nome ?? v.codigo_cliente ?? ''}>
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
