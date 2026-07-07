'use client'
// Relatório Matriz por Vendedor — vendas × custos × comissão → lucro líquido.

import { useMemo } from 'react'
import Link from 'next/link'
import { useGv } from '../../GvProvider'
import { useGvCustos, useGvMes } from '../../hooks'
import {
  consolidarPorVendedor,
  formatBRL,
  formatPercent,
  nomeMes,
  totalResultado,
  type ResultadoVendedor,
} from '@/lib/gestao-vendas/calculos'
import { CAMPOS_CUSTO, nomeEmpresaGV, type CampoCusto } from '@/lib/gestao-vendas/tipos'
import { CabecalhoRelatorio, ErroCard } from '../../componentes'

const ROTULOS_CUSTO: Record<CampoCusto, string> = {
  salario: 'Salário',
  encargos: 'Encargos',
  custos_extras: 'Custos extras (fixos)',
  carro_aluguel: 'Carro (aluguel)',
  combustivel: 'Combustível',
  manutencao: 'Manutenção',
}

export default function GvRelatorioVendedoresPage() {
  const { mes, ano, conta } = useGv()
  const { linhas, loading, error } = useGvMes()
  const { custos, loading: loadingCustos } = useGvCustos()

  const resultados = useMemo(() => consolidarPorVendedor(linhas, custos), [linhas, custos])
  const total = useMemo(() => totalResultado(resultados), [resultados])
  const mapCustos = useMemo(() => new Map(custos.map((c) => [c.nome, c])), [custos])

  const carregando = loading || loadingCustos

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

      <CabecalhoRelatorio
        titulo="Resultado por Vendedor"
        mesAno={`${nomeMes(mes)} | ${ano}`}
        direita={
          <>
            {nomeEmpresaGV(conta)}
            <br />
            {total.qtd} venda(s) no mês
          </>
        }
      />

      {error && <ErroCard msg={error} />}

      {carregando ? (
        <p className="px-2 text-sm text-gray-500">Carregando dados…</p>
      ) : resultados.length === 0 ? (
        <p className="px-2 text-sm text-gray-500">
          Sem vendas para {nomeEmpresaGV(conta)} em {nomeMes(mes)} / {ano}.
        </p>
      ) : (
        <div className="overflow-x-auto" style={{ breakInside: 'avoid' }}>
          <table className="w-full text-xs">
            <thead>
              <tr
                className="bg-red-100 text-[10px] uppercase text-red-900"
                style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
              >
                <th className="min-w-[170px] px-3 py-2 text-left font-semibold">Indicador</th>
                {resultados.map((r) => (
                  <th key={r.vendedor} className="min-w-[110px] px-3 py-2 text-right font-semibold">
                    {r.vendedor}
                  </th>
                ))}
                <th className="min-w-[110px] border-l border-red-200 px-3 py-2 text-right font-semibold">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              <Linha rotulo="Nº de vendas" rs={resultados} total={total} pega={(r) => String(r.qtd)} />
              <Linha rotulo="Venda total" rs={resultados} total={total} pega={(r) => formatBRL(r.venda)} destaque />
              <Linha rotulo="CMC (custo mercadoria)" rs={resultados} total={total} pega={(r) => formatBRL(r.cmc)} />
              <Linha rotulo="Custos extras (por venda)" rs={resultados} total={total} pega={(r) => formatBRL(r.custosExtras)} />
              <Linha rotulo="Descontos" rs={resultados} total={total} pega={(r) => formatBRL(r.descontos)} />
              <Linha rotulo="Comissão" rs={resultados} total={total} pega={(r) => formatBRL(r.comissao)} />
              <Linha
                rotulo="Margem da loja"
                rs={resultados}
                total={total}
                pega={(r) => formatBRL(r.margemLoja)}
                corPorValor={(r) => r.margemLoja}
                destaque
              />

              <tr className="bg-gray-100">
                <td
                  colSpan={resultados.length + 2}
                  className="px-3 py-1.5 text-[10px] font-semibold uppercase text-gray-500"
                >
                  Custos mensais do vendedor
                </td>
              </tr>
              {CAMPOS_CUSTO.map((campo) => (
                <tr key={campo} className="border-t border-gray-100">
                  <td className="px-3 py-1 text-gray-500">{ROTULOS_CUSTO[campo]}</td>
                  {resultados.map((r) => (
                    <td key={r.vendedor} className="px-3 py-1 text-right tabular-nums text-gray-500">
                      {formatBRL(mapCustos.get(r.vendedor)?.[campo] ?? 0)}
                    </td>
                  ))}
                  <td className="border-l border-gray-200 px-3 py-1 text-right tabular-nums text-gray-500">
                    {formatBRL(resultados.reduce((s, r) => s + (mapCustos.get(r.vendedor)?.[campo] ?? 0), 0))}
                  </td>
                </tr>
              ))}
              <Linha rotulo="Custo mensal total" rs={resultados} total={total} pega={(r) => formatBRL(r.custoMensal)} />
              <Linha
                rotulo="LUCRO LÍQUIDO"
                rs={resultados}
                total={total}
                pega={(r) => formatBRL(r.lucroLiquido)}
                corPorValor={(r) => r.lucroLiquido}
                destaque
                borda
              />
              <Linha
                rotulo="Lucro / Venda"
                rs={resultados}
                total={total}
                pega={(r) => (r.venda === 0 ? '—' : formatPercent(r.lucroLiquido / r.venda, 1))}
              />
            </tbody>
          </table>
        </div>
      )}

      <p className="px-1 text-[10px] text-gray-400">
        Margem da loja = venda − comissão − (CMC + custos extras + descontos). Lucro líquido = margem
        da loja − custos mensais do vendedor. Vendas sem vendedor atribuído aparecem em &quot;Sem
        vendedor&quot; — atribua em Ajustes por Venda.
      </p>
    </div>
  )
}

function Linha({
  rotulo,
  rs,
  total,
  pega,
  corPorValor,
  destaque,
  borda,
}: {
  rotulo: string
  rs: ResultadoVendedor[]
  total: ResultadoVendedor
  pega: (r: ResultadoVendedor) => string
  corPorValor?: (r: ResultadoVendedor) => number
  destaque?: boolean
  borda?: boolean
}) {
  const cls = (r: ResultadoVendedor) => (corPorValor && corPorValor(r) < 0 ? 'text-red-600' : '')
  return (
    <tr
      className={`border-t border-gray-100 ${destaque ? 'bg-gray-50 font-semibold' : ''} ${borda ? 'border-t-2 border-gray-300' : ''}`}
    >
      <td className="px-3 py-1.5">{rotulo}</td>
      {rs.map((r) => (
        <td key={r.vendedor} className={`px-3 py-1.5 text-right tabular-nums ${cls(r)}`}>
          {pega(r)}
        </td>
      ))}
      <td className={`border-l border-gray-200 px-3 py-1.5 text-right tabular-nums ${cls(total)}`}>
        {pega(total)}
      </td>
    </tr>
  )
}
