'use client'
// Álcool × Gasolina — para cada veículo flex da frota, compara o consumo
// (km/l) e o custo por km em cada combustível e diz qual compensa.
// Clique no veículo abre TODOS os abastecimentos dele (a "prova" do
// veredito: data, combustível, km/l, e o que foi descartado e por quê).
// Vendidos/arquivados ficam de fora por padrão (toggle pra mostrar).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { authHeaders } from '@/lib/auth/client'
import type { VeiculoFlex } from '@/lib/abastecimento/flex'

type VeiculoFlexAnotado = VeiculoFlex & { ativo?: boolean; status_frota?: string | null }

interface DetalheRow {
  data: string
  combustivel: 'etanol' | 'gasolina'
  litros: number
  valor: number
  preco_litro: number | null
  hodometro_anterior: number | null
  hodometro: number | null
  km: number | null
  kml: number | null
  valido: boolean
  motivo: 'ok' | 'sem_hodometro' | 'kml_implausivel'
  posto: string | null
  motorista: string | null
}

const fmtRS = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmt1 = (v: number | null | undefined) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtData = (iso: string) => {
  try { return new Date(iso).toLocaleDateString('pt-BR') } catch { return iso }
}

const PERIODOS = [
  { meses: 6, label: '6 meses' },
  { meses: 12, label: '12 meses' },
  { meses: 24, label: '24 meses' },
]

const MOTIVO_LABEL: Record<string, string> = {
  sem_hodometro: 'sem hodômetro confiável',
  kml_implausivel: 'km/l implausível (3–30)',
}

function dataDe(meses: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - meses)
  return d.toISOString().slice(0, 10)
}

export default function FlexPage() {
  const [meses, setMeses] = useState(12)
  const [veiculos, setVeiculos] = useState<VeiculoFlexAnotado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [mostrarInativos, setMostrarInativos] = useState(false)
  // detalhe expandido: uma placa por vez, com cache por placa (zera ao trocar o período)
  const [expandida, setExpandida] = useState<string | null>(null)
  const [detalhes, setDetalhes] = useState<Record<string, DetalheRow[]>>({})
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)

  useEffect(() => {
    let cancelled = false
    setCarregando(true)
    setErro(null)
    setExpandida(null)
    setDetalhes({})
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

  const abrirDetalhe = async (placa: string) => {
    if (expandida === placa) { setExpandida(null); return }
    setExpandida(placa)
    if (detalhes[placa]) return
    setCarregandoDetalhe(true)
    try {
      const r = await fetch(
        `/api/abastecimento/flex?de=${dataDe(meses)}&placa=${encodeURIComponent(placa)}&detalhe=1`,
        { headers: await authHeaders() },
      )
      const d = await r.json()
      if (!d.error) setDetalhes((prev) => ({ ...prev, [placa]: d.detalhe || [] }))
    } catch { /* linha fica com "não carregou" */ }
    setCarregandoDetalhe(false)
  }

  const foraDaFrota = veiculos.filter((v) => v.ativo === false)
  const visiveis = mostrarInativos ? veiculos : veiculos.filter((v) => v.ativo !== false)

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

      <p className="mb-2 text-xs text-gray-400">
        km/l = hodômetro digitado pelo motorista ÷ litros. Leituras implausíveis (fora de 3–30 km/l)
        são descartadas; o veredito só sai com pelo menos 2 abastecimentos válidos em CADA
        combustível. Quem decide é o <strong>custo por km</strong>.{' '}
        <strong>Clique no veículo</strong> pra ver todos os abastecimentos que sustentam o veredito.
      </p>

      {foraDaFrota.length > 0 && (
        <label className="mb-3 inline-flex cursor-pointer items-center gap-2 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={mostrarInativos}
            onChange={() => setMostrarInativos((v) => !v)}
            className="accent-red-600"
          />
          mostrar vendidos/arquivados ({foraDaFrota.length})
        </label>
      )}

      {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}
      {carregando ? (
        <p className="text-sm text-gray-500">Carregando…</p>
      ) : visiveis.length === 0 ? (
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
              {visiveis.map((v) => (
                <FragmentoVeiculo
                  key={v.placa}
                  v={v}
                  aberta={expandida === v.placa}
                  onToggle={() => abrirDetalhe(v.placa)}
                  detalhe={detalhes[v.placa]}
                  carregandoDetalhe={carregandoDetalhe && expandida === v.placa}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function FragmentoVeiculo({ v, aberta, onToggle, detalhe, carregandoDetalhe }: {
  v: VeiculoFlexAnotado
  aberta: boolean
  onToggle: () => void
  detalhe?: DetalheRow[]
  carregandoDetalhe: boolean
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        title="Clique pra ver todos os abastecimentos deste veículo"
        className={`cursor-pointer border-t border-gray-100 hover:bg-gray-50 ${aberta ? 'bg-gray-50' : ''} ${v.ativo === false ? 'opacity-60' : ''}`}
      >
        <td className="px-3 py-1.5">
          <span className={`mr-1 inline-block text-[9px] text-gray-400 transition-transform ${aberta ? 'rotate-90' : ''}`}>▶</span>
          <span className="font-semibold tabular-nums">{v.placa}</span>
          {v.modelo && <span className="ml-1.5 text-gray-500">{v.modelo}</span>}
          {v.status_frota === 'vendido' && (
            <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-700">VENDIDO</span>
          )}
          {v.status_frota === 'arquivado' && (
            <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">ARQUIVADO</span>
          )}
        </td>
        <Lado lado={v.etanol} borda />
        <Lado lado={v.gasolina} borda />
        <td className="border-l border-gray-200 px-3 py-1.5 text-center">
          <Veredito v={v} />
        </td>
      </tr>
      {aberta && (
        <tr className="border-t border-gray-100 bg-gray-50/60">
          <td colSpan={10} className="px-4 pb-3 pt-1">
            {carregandoDetalhe && !detalhe ? (
              <p className="py-2 text-xs text-gray-400">Carregando abastecimentos…</p>
            ) : !detalhe || detalhe.length === 0 ? (
              <p className="py-2 text-xs text-gray-400">Não consegui carregar os abastecimentos.</p>
            ) : (
              <DetalheAbastecimentos linhas={detalhe} />
            )}
          </td>
        </tr>
      )}
    </>
  )
}

function DetalheAbastecimentos({ linhas }: { linhas: DetalheRow[] }) {
  const periodo = (comb: 'etanol' | 'gasolina') => {
    const datas = linhas.filter((l) => l.combustivel === comb).map((l) => l.data).sort()
    if (datas.length === 0) return null
    return `${fmtData(datas[0])} → ${fmtData(datas[datas.length - 1])}`
  }
  const pE = periodo('etanol')
  const pG = periodo('gasolina')
  return (
    <div>
      <p className="mb-1.5 text-[10px] text-gray-500">
        {linhas.length} abastecimento(s) no período —{' '}
        {pE && <>etanol testado de <strong>{pE}</strong></>}
        {pE && pG && ' · '}
        {pG && <>gasolina de <strong>{pG}</strong></>}. Linha apagada = descartada da conta (o motivo está na coluna).
      </p>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase text-gray-400">
            <th className="py-1 pr-2 text-left font-medium">Data</th>
            <th className="py-1 pr-2 text-left font-medium">Combustível</th>
            <th className="py-1 pr-2 text-right font-medium">Litros</th>
            <th className="py-1 pr-2 text-right font-medium">R$/l</th>
            <th className="py-1 pr-2 text-right font-medium">Valor</th>
            <th className="py-1 pr-2 text-right font-medium">Hodômetro</th>
            <th className="py-1 pr-2 text-right font-medium">km</th>
            <th className="py-1 pr-2 text-right font-medium">km/l</th>
            <th className="py-1 pr-2 text-left font-medium">Na conta?</th>
            <th className="py-1 pr-2 text-left font-medium">Posto</th>
            <th className="py-1 text-left font-medium">Motorista</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className={`border-t border-gray-100 ${l.valido ? '' : 'text-gray-400'}`}>
              <td className="py-1 pr-2 tabular-nums">{fmtData(l.data)}</td>
              <td className="py-1 pr-2">
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${l.combustivel === 'etanol' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                  {l.combustivel === 'etanol' ? 'ETANOL' : 'GASOLINA'}
                </span>
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">{fmt1(l.litros)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{fmtRS(l.preco_litro)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">{fmtRS(l.valor)}</td>
              <td className="py-1 pr-2 text-right tabular-nums">
                {l.hodometro_anterior != null && l.hodometro != null
                  ? `${l.hodometro_anterior.toLocaleString('pt-BR')} → ${l.hodometro.toLocaleString('pt-BR')}`
                  : '—'}
              </td>
              <td className="py-1 pr-2 text-right tabular-nums">{l.km != null ? Math.round(l.km).toLocaleString('pt-BR') : '—'}</td>
              <td className="py-1 pr-2 text-right font-medium tabular-nums">{fmt1(l.kml)}</td>
              <td className="py-1 pr-2">
                {l.valido ? (
                  <span className="font-semibold text-green-700">✓ conta</span>
                ) : (
                  <span title={MOTIVO_LABEL[l.motivo] || l.motivo} className="text-yellow-600">✗ {MOTIVO_LABEL[l.motivo] || 'descartado'}</span>
                )}
              </td>
              <td className="max-w-[140px] truncate py-1 pr-2">{l.posto || '—'}</td>
              <td className="max-w-[140px] truncate py-1">{l.motorista || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
