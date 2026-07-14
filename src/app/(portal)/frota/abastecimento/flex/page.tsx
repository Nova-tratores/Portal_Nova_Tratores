'use client'
// Álcool × Gasolina — para cada veículo flex da frota, compara o consumo
// (km/l) e o custo por km em cada combustível e diz qual compensa.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { authHeaders } from '@/lib/auth/client'
import type { VeiculoFlex } from '@/lib/abastecimento/flex'

const fmtRS = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmt1 = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const PERIODOS = [
  { meses: 6, label: '6 meses' },
  { meses: 12, label: '12 meses' },
  { meses: 24, label: '24 meses' },
]

function dataDe(meses: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - meses)
  return d.toISOString().slice(0, 10)
}

export default function FlexPage() {
  const [meses, setMeses] = useState(12)
  const [veiculos, setVeiculos] = useState<VeiculoFlex[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setCarregando(true)
    setErro(null)
    // A rota agora exige login (antes respondia pra qualquer um na internet).
    ;(async () => {
      try {
        const r = await fetch(`/api/abastecimento/flex?de=${dataDe(meses)}`, {
          headers: await authHeaders(),
        })
        const d = await r.json()
        if (cancelled) return
        if (d.error) setErro(d.error)
        else setVeiculos(d.veiculos || [])
        setCarregando(false)
      } catch (e) {
        if (cancelled) return
        setErro(String(e))
        setCarregando(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [meses])

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Álcool × Gasolina</h1>
          <p className="text-sm text-gray-500">
            Qual combustível compensa em cada veículo flex, pelos números reais da frota.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-red-600">
            {PERIODOS.map((p, i) => (
              <button
                key={p.meses}
                type="button"
                onClick={() => setMeses(p.meses)}
                className={`px-3 py-1 text-xs font-semibold ${i > 0 ? 'border-l border-red-600' : ''} ${
                  meses === p.meses ? 'bg-red-600 text-white' : 'bg-white text-red-700 hover:bg-red-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Link href="/frota/abastecimento" className="text-sm text-gray-500 hover:text-gray-800">
            ← Abastecimento
          </Link>
        </div>
      </div>

      <p className="mb-4 text-xs text-gray-400">
        km/l = hodômetro digitado pelo motorista ÷ litros. Leituras implausíveis (fora de 3–30 km/l)
        são descartadas; o veredito só sai com pelo menos 2 abastecimentos válidos em CADA
        combustível. Quem decide é o <strong>custo por km</strong>.
      </p>

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}
      {carregando ? (
        <p className="text-sm text-gray-500">Carregando…</p>
      ) : veiculos.length === 0 ? (
        <p className="text-sm text-gray-500">
          Nenhum veículo abasteceu com os dois combustíveis no período.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-[10px] uppercase text-gray-500">
                <th className="px-3 py-2 text-left font-medium" rowSpan={2}>Veículo</th>
                <th className="border-l border-gray-200 px-3 py-1.5 text-center font-semibold text-green-700" colSpan={4}>
                  Etanol
                </th>
                <th className="border-l border-gray-200 px-3 py-1.5 text-center font-semibold text-orange-700" colSpan={4}>
                  Gasolina
                </th>
                <th className="border-l border-gray-200 px-3 py-2 text-center font-medium" rowSpan={2}>
                  Compensa
                </th>
              </tr>
              <tr className="bg-gray-50 text-[10px] uppercase text-gray-500">
                <th className="border-l border-gray-200 px-2 py-1 text-right font-medium">Abast.</th>
                <th className="px-2 py-1 text-right font-medium">R$/l</th>
                <th className="px-2 py-1 text-right font-medium">km/l</th>
                <th className="px-2 py-1 text-right font-medium">R$/km</th>
                <th className="border-l border-gray-200 px-2 py-1 text-right font-medium">Abast.</th>
                <th className="px-2 py-1 text-right font-medium">R$/l</th>
                <th className="px-2 py-1 text-right font-medium">km/l</th>
                <th className="px-2 py-1 text-right font-medium">R$/km</th>
              </tr>
            </thead>
            <tbody>
              {veiculos.map((v) => (
                <tr key={v.placa} className="border-t border-gray-100">
                  <td className="px-3 py-1.5">
                    <span className="font-semibold tabular-nums">{v.placa}</span>
                    {v.modelo && <span className="ml-1.5 text-gray-500">{v.modelo}</span>}
                  </td>
                  <Lado lado={v.etanol} borda />
                  <Lado lado={v.gasolina} borda />
                  <td className="border-l border-gray-200 px-3 py-1.5 text-center">
                    <Veredito v={v} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Lado({ lado, borda }: { lado: VeiculoFlex['etanol']; borda?: boolean }) {
  const poucos = lado.validos < 2
  return (
    <>
      <td className={`px-2 py-1.5 text-right tabular-nums text-gray-500 ${borda ? 'border-l border-gray-200' : ''}`}>
        {lado.abastecimentos}
        {poucos && lado.abastecimentos > 0 && (
          <span title={`só ${lado.validos} com km/l aproveitável`} className="text-yellow-600"> *</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{fmtRS(lado.precoMedioLitro)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums">{fmt1(lado.kmPorLitro)}</td>
      <td className="px-2 py-1.5 text-right font-medium tabular-nums">{fmtRS(lado.custoPorKm)}</td>
    </>
  )
}

function Veredito({ v }: { v: VeiculoFlex }) {
  if (!v.veredito) {
    return <span className="text-[10px] text-gray-400">amostra insuficiente</span>
  }
  const pct = v.economiaPct != null && v.economiaPct > 0
    ? ` (−${Math.round(v.economiaPct * 100)}%/km)`
    : ''
  if (v.veredito === 'empate') {
    return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">EMPATE</span>
  }
  return v.veredito === 'etanol' ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-800">
      ETANOL{pct}
    </span>
  ) : (
    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-800">
      GASOLINA{pct}
    </span>
  )
}
