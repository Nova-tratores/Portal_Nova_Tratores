'use client'
// Custos Mensais — salário, encargos e custos de carro por vendedor.
// Autosave no blur; células zeradas em amarelo; copiar do mês anterior.

import { useEffect, useMemo, useState } from 'react'
import { useGv } from '../GvProvider'
import { useGvCustos, useGvMes } from '../hooks'
import { formatBRL, formatCompetencia, totalCusto } from '@/lib/gestao-vendas/calculos'
import {
  CAMPOS_CUSTO,
  nomeEmpresaGV,
  type CampoCusto,
  type CustoMensalVendedor,
} from '@/lib/gestao-vendas/tipos'
import { ErroCard } from '../componentes'

const ROTULOS: Record<CampoCusto, string> = {
  salario: 'Salário',
  encargos: 'Encargos',
  custos_extras: 'Custos Extras',
  carro_aluguel: 'Carro (aluguel)',
  combustivel: 'Combustível',
  manutencao: 'Manutenção',
}

export default function GvCustosPage() {
  const { mes, ano, conta } = useGv()
  const { custos, loading, error, salvar, copiarMesAnterior } = useGvCustos()
  const { vendedores } = useGvMes()

  const [copiando, setCopiando] = useState(false)
  const [msgCopia, setMsgCopia] = useState<string | null>(null)

  // linhas = vendedores ativos ∪ registros avulsos do mês
  const linhas = useMemo(() => {
    const nomes = new Set<string>()
    for (const v of vendedores) nomes.add(v.nome)
    for (const r of custos) nomes.add(r.nome)
    const mapa = new Map(custos.map((r) => [r.nome, r]))
    return [...nomes]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((nome) => ({ nome, registro: mapa.get(nome) ?? null }))
  }, [vendedores, custos])

  async function copiar() {
    setCopiando(true)
    setMsgCopia(null)
    try {
      const n = await copiarMesAnterior()
      setMsgCopia(
        n === 0
          ? 'Nada a copiar (todos os vendedores já têm registro neste mês).'
          : `${n} registro(s) copiado(s) do mês anterior.`,
      )
    } catch (e) {
      setMsgCopia(`Erro: ${e instanceof Error ? e.message : String(e)}`)
    }
    setCopiando(false)
  }

  const totaisPorCampo = CAMPOS_CUSTO.map((c) =>
    linhas.reduce((s, l) => s + (l.registro?.[c] ?? 0), 0),
  )
  const totalGeral = linhas.reduce((s, l) => s + totalCusto(l.registro), 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Custos Mensais</h1>
          <p className="text-sm text-gray-500">
            {nomeEmpresaGV(conta)} — {formatCompetencia(mes, ano)}. Edite e saia do campo para
            salvar. Células em amarelo estão zeradas.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void copiar()}
          disabled={copiando || loading}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {copiando ? 'Copiando…' : 'Copiar do mês anterior'}
        </button>
      </div>

      {msgCopia && <p className="text-sm text-gray-500">{msgCopia}</p>}
      {error && <ErroCard msg={error} />}

      <div className="rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <p className="px-4 py-3 text-sm text-gray-500">Carregando…</p>
        ) : linhas.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">Nenhum vendedor ativo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="min-w-[160px] px-3 py-2 font-medium">Vendedor</th>
                  {CAMPOS_CUSTO.map((c) => (
                    <th key={c} className="px-2 py-2 text-right font-medium">
                      {ROTULOS[c]}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <LinhaCusto
                    key={l.nome}
                    nome={l.nome}
                    registro={l.registro}
                    onSave={(campo, valor) => salvar(l.nome, { [campo]: valor })}
                  />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-medium">
                  <td className="px-3 py-2">Total ({linhas.length} vendedores)</td>
                  {totaisPorCampo.map((t, i) => (
                    <td key={CAMPOS_CUSTO[i]} className="px-2 py-2 text-right tabular-nums">
                      {formatBRL(t)}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right tabular-nums">{formatBRL(totalGeral)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function LinhaCusto({
  nome,
  registro,
  onSave,
}: {
  nome: string
  registro: CustoMensalVendedor | null
  onSave: (campo: CampoCusto, valor: number) => Promise<unknown>
}) {
  const [valores, setValores] = useState<Record<CampoCusto, string>>(
    () =>
      Object.fromEntries(CAMPOS_CUSTO.map((c) => [c, String(registro?.[c] ?? 0)])) as Record<
        CampoCusto,
        string
      >,
  )
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setValores(
      Object.fromEntries(CAMPOS_CUSTO.map((c) => [c, String(registro?.[c] ?? 0)])) as Record<
        CampoCusto,
        string
      >,
    )
  }, [registro])

  async function blur(campo: CampoCusto, texto: string) {
    const valor = parseFloat(texto) || 0
    if (valor === (registro?.[campo] ?? 0)) return
    setSaving(true)
    setErro(null)
    try {
      await onSave(campo, valor)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
    setSaving(false)
  }

  const total = CAMPOS_CUSTO.reduce((s, c) => s + (parseFloat(valores[c]) || 0), 0)

  return (
    <tr className={`border-t border-gray-100 ${saving ? 'opacity-60' : ''}`}>
      <td className="px-3 py-1 font-medium">
        {nome}
        {erro && (
          <span className="ml-2 text-[10px] text-red-600" title={erro}>
            erro ao salvar
          </span>
        )}
      </td>
      {CAMPOS_CUSTO.map((c) => {
        const zerado = (parseFloat(valores[c]) || 0) === 0
        return (
          <td key={c} className="px-1 py-1">
            <input
              type="number"
              step="0.01"
              min="0"
              value={valores[c]}
              onChange={(e) => setValores((v) => ({ ...v, [c]: e.target.value }))}
              onBlur={(e) => void blur(c, e.target.value)}
              className={`h-7 w-24 rounded-md border border-gray-300 px-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-red-500 ${
                zerado ? 'bg-yellow-50' : 'bg-white'
              }`}
            />
          </td>
        )
      })}
      <td className="px-3 py-1 text-right font-medium tabular-nums">{formatBRL(total)}</td>
    </tr>
  )
}
