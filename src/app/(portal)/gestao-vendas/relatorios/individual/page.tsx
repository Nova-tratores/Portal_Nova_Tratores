'use client'
// Relatório Individual por Vendedor — clientes atendidos + vendas detalhadas.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useGv } from '../../GvProvider'
import { useGvCustos, useGvMes } from '../../hooks'
import {
  SEM_VENDEDOR,
  calcular,
  consolidarPorVendedor,
  formatBRL,
  formatPercent,
  nomeMes,
  vendedorDaLinha,
  type LinhaAjuste,
} from '@/lib/gestao-vendas/calculos'
import { nomeEmpresaGV } from '@/lib/gestao-vendas/tipos'
import { CabecalhoRelatorio, ErroCard, SecaoRelatorio } from '../../componentes'

export default function GvRelatorioIndividualPage() {
  const { mes, ano, conta } = useGv()
  const { linhas, loading, error } = useGvMes()
  const { custos, loading: loadingCustos } = useGvCustos()

  const nomes = useMemo(() => {
    const set = new Set<string>()
    for (const l of linhas) set.add(vendedorDaLinha(l))
    return [...set].sort((a, b) => {
      if (a === SEM_VENDEDOR) return 1
      if (b === SEM_VENDEDOR) return -1
      return a.localeCompare(b, 'pt-BR')
    })
  }, [linhas])

  const [selecionado, setSelecionado] = useState('')
  const vendedor = selecionado || nomes[0] || ''

  const linhasVendedor = useMemo(
    () => linhas.filter((l) => vendedorDaLinha(l) === vendedor),
    [linhas, vendedor],
  )
  const resultado = useMemo(
    () => consolidarPorVendedor(linhasVendedor, custos.filter((c) => c.nome === vendedor)),
    [linhasVendedor, custos, vendedor],
  )[0]

  const porCliente = useMemo(() => {
    const m = new Map<string, { qtd: number; venda: number; cmc: number }>()
    for (const l of linhasVendedor) {
      const nome = l.venda.cliente_nome ?? (l.venda.codigo_cliente ? `#${l.venda.codigo_cliente}` : '—')
      const cur = m.get(nome) ?? { qtd: 0, venda: 0, cmc: 0 }
      cur.qtd += 1
      cur.venda += l.venda.valor_total
      cur.cmc += (l.venda.cmc_unitario ?? 0) * l.venda.quantidade
      m.set(nome, cur)
    }
    return [...m.entries()].sort((a, b) => b[1].venda - a[1].venda)
  }, [linhasVendedor])

  const carregando = loading || loadingCustos

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/gestao-vendas/relatorios" className="text-sm text-gray-500 hover:text-gray-800">
          ← Voltar aos relatórios
        </Link>
        <div className="flex items-center gap-2">
          <select
            value={vendedor}
            onChange={(e) => setSelecionado(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm"
            aria-label="Vendedor"
          >
            {nomes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Imprimir
          </button>
        </div>
      </div>

      <CabecalhoRelatorio
        titulo={`Vendedor: ${vendedor || '—'}`}
        mesAno={`${nomeMes(mes)} | ${ano}`}
        direita={
          <>
            {nomeEmpresaGV(conta)}
            <br />
            {linhasVendedor.length} venda(s) no mês
          </>
        }
      />

      {error && <ErroCard msg={error} />}

      {carregando ? (
        <p className="px-2 text-sm text-gray-500">Carregando dados…</p>
      ) : !vendedor ? (
        <p className="px-2 text-sm text-gray-500">
          Sem vendas para {nomeEmpresaGV(conta)} em {nomeMes(mes)} / {ano}.
        </p>
      ) : (
        <>
          {resultado && (
            <div className="grid gap-2 text-center md:grid-cols-3 lg:grid-cols-6">
              <Resumo titulo="Venda total" valor={formatBRL(resultado.venda)} />
              <Resumo titulo="CMC" valor={formatBRL(resultado.cmc)} />
              <Resumo titulo="Comissão" valor={formatBRL(resultado.comissao)} />
              <Resumo titulo="Margem loja" valor={formatBRL(resultado.margemLoja)} negativo={resultado.margemLoja < 0} />
              <Resumo titulo="Custo mensal" valor={formatBRL(resultado.custoMensal)} />
              <Resumo titulo="Lucro líquido" valor={formatBRL(resultado.lucroLiquido)} negativo={resultado.lucroLiquido < 0} />
            </div>
          )}

          <SecaoRelatorio titulo="Clientes atendidos" sub={`${porCliente.length} cliente(s)`}>
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Cliente</th>
                  <th className="px-3 py-1.5 text-right font-medium">Qtd</th>
                  <th className="px-3 py-1.5 text-right font-medium">Custo</th>
                  <th className="px-3 py-1.5 text-right font-medium">Venda</th>
                  <th className="px-3 py-1.5 text-right font-medium">V − C</th>
                </tr>
              </thead>
              <tbody>
                {porCliente.map(([nome, a]) => (
                  <tr key={nome} className="border-t border-gray-100">
                    <td className="max-w-[360px] truncate px-3 py-1" title={nome}>{nome}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{a.qtd}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{formatBRL(a.cmc)}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{formatBRL(a.venda)}</td>
                    <td className="px-3 py-1 text-right tabular-nums">{formatBRL(a.venda - a.cmc)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SecaoRelatorio>

          <SecaoRelatorio titulo="Vendas do mês" sub="ordenadas por valor">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Pedido</th>
                  <th className="px-3 py-1.5 text-left font-medium">Data</th>
                  <th className="px-3 py-1.5 text-left font-medium">Cliente</th>
                  <th className="px-3 py-1.5 text-left font-medium">Produto</th>
                  <th className="px-3 py-1.5 text-right font-medium">Venda</th>
                  <th className="px-3 py-1.5 text-right font-medium">CMC</th>
                  <th className="px-3 py-1.5 text-right font-medium">%C</th>
                  <th className="px-3 py-1.5 text-right font-medium">Comissão</th>
                </tr>
              </thead>
              <tbody>
                {linhasVendedor.map((l) => (
                  <LinhaVenda key={l.venda.id} linha={l} />
                ))}
              </tbody>
            </table>
          </SecaoRelatorio>
        </>
      )}
    </div>
  )
}

function LinhaVenda({ linha }: { linha: LinhaAjuste }) {
  const { venda, ajuste } = linha
  const cmcTotal = (venda.cmc_unitario ?? 0) * venda.quantidade
  const pct = ajuste?.comissao_override_pct ?? ajuste?.comissao_pct ?? 0
  const calc = calcular({
    valor_venda: venda.valor_total,
    cmc_total: cmcTotal,
    custos_extras: ajuste?.custos_extras ?? 0,
    desconto: ajuste?.desconto ?? 0,
    comissao_pct: pct,
  })
  return (
    <tr className="border-t border-gray-100">
      <td className="px-3 py-1 tabular-nums text-gray-500">{venda.numero_pedido ?? '—'}</td>
      <td className="whitespace-nowrap px-3 py-1">{venda.data_pedido ?? '—'}</td>
      <td className="max-w-[200px] truncate px-3 py-1" title={venda.cliente_nome ?? ''}>
        {venda.cliente_nome ?? (venda.codigo_cliente ? `#${venda.codigo_cliente}` : '—')}
      </td>
      <td className="max-w-[240px] truncate px-3 py-1" title={venda.descricao ?? ''}>
        {venda.descricao ?? '—'}
      </td>
      <td className="px-3 py-1 text-right tabular-nums">{formatBRL(venda.valor_total)}</td>
      <td className="px-3 py-1 text-right tabular-nums text-gray-500">
        {venda.cmc_unitario == null ? '—' : formatBRL(cmcTotal)}
      </td>
      <td className="px-3 py-1 text-right tabular-nums">{formatPercent(pct / 100, 1)}</td>
      <td className="px-3 py-1 text-right tabular-nums">{formatBRL(calc.valor_comissao)}</td>
    </tr>
  )
}

function Resumo({ titulo, valor, negativo }: { titulo: string; valor: string; negativo?: boolean }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2">
      <p className="text-[10px] uppercase text-gray-500">{titulo}</p>
      <p className={`text-sm font-semibold tabular-nums ${negativo ? 'text-red-600' : 'text-gray-900'}`}>
        {valor}
      </p>
    </div>
  )
}
