'use client'
// Ajustes por Venda — atribui vendedor e configura custos extras, desconto e
// % de comissão por item. Save no blur → POST /api/gestao-vendas/ajustes
// (o servidor recalcula comissão/margem e grava com status 'ajustado').

import { useEffect, useMemo, useState } from 'react'
import { useGv } from '../GvProvider'
import { salvarAjusteApi, useGvMes } from '../hooks'
import {
  calcular,
  classificarCmcRatio,
  formatBRL,
  formatCompetencia,
  formatPercent,
  type LinhaAjuste,
} from '@/lib/gestao-vendas/calculos'
import { nomeEmpresaGV, type Vendedor } from '@/lib/gestao-vendas/tipos'
import { ErroCard } from '../componentes'

type Edits = {
  vendedor?: string | null
  custos_extras?: number
  desconto?: number
  comissao_override_pct?: number | null
}

export default function GvAjustesPage() {
  const { mes, ano, conta } = useGv()
  const { linhas, vendedores, loading, error, aplicarAjusteSalvo } = useGvMes()

  const totais = useMemo(() => {
    let venda = 0, cmc = 0, extra = 0, desc = 0, comm = 0, mLoja = 0
    for (const l of linhas) {
      const cmcTotal = (l.venda.cmc_unitario ?? 0) * l.venda.quantidade
      const aj = l.ajuste
      const c = calcular({
        valor_venda: l.venda.valor_total,
        cmc_total: cmcTotal,
        custos_extras: aj?.custos_extras ?? 0,
        desconto: aj?.desconto ?? 0,
        comissao_pct: aj?.comissao_override_pct ?? aj?.comissao_pct ?? 0,
      })
      venda += l.venda.valor_total
      cmc += cmcTotal
      extra += aj?.custos_extras ?? 0
      desc += aj?.desconto ?? 0
      comm += c.valor_comissao
      mLoja += c.margem_loja_valor
    }
    return { venda, cmc, extra, desc, comm, mLoja }
  }, [linhas])

  async function salvar(linha: LinhaAjuste, edits: Edits): Promise<{ ok: boolean; error?: string }> {
    const venda = linha.venda
    const aj = linha.ajuste
    try {
      const salvo = await salvarAjusteApi(conta, {
        id: aj?.id ?? null,
        venda_id: linha.venda_id_chave,
        data_pedido: venda.data_pedido,
        mes: venda.mes,
        ano: venda.ano,
        cliente: venda.cliente_nome ?? venda.codigo_cliente,
        familia: venda.familia,
        categoria: venda.codigo_categoria,
        departamento: venda.departamento,
        produto_descricao: venda.descricao,
        valor_venda: venda.valor_total,
        cmc_total: (venda.cmc_unitario ?? 0) * venda.quantidade,
        vendedor: edits.vendedor !== undefined ? edits.vendedor : aj?.vendedor ?? null,
        custos_extras: edits.custos_extras ?? aj?.custos_extras ?? 0,
        desconto: edits.desconto ?? aj?.desconto ?? 0,
        comissao_override_pct:
          edits.comissao_override_pct !== undefined
            ? edits.comissao_override_pct
            : aj?.comissao_override_pct ?? null,
        comissao_pct_base: aj?.comissao_pct ?? 0,
      })
      aplicarAjusteSalvo(salvo)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Ajustes por Venda</h1>
        <p className="text-sm text-gray-500">
          {nomeEmpresaGV(conta)} — {formatCompetencia(mes, ano)} — {linhas.length} venda(s).
          Save acontece ao sair do campo (blur). Cor da margem: &lt;80% vermelho · 80–89% amarelo ·
          ≥90% verde (CMC/Venda).
        </p>
      </div>

      {error && <ErroCard msg={error} />}

      <div className="rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <p className="px-4 py-3 text-sm text-gray-500">Carregando…</p>
        ) : linhas.length === 0 ? (
          <p className="px-4 py-3 text-sm text-gray-500">Sem vendas para essa empresa/competência.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="px-2 py-2 font-medium">Pedido</th>
                  <th className="px-2 py-2 font-medium">Produto</th>
                  <th className="px-2 py-2 font-medium">Cliente</th>
                  <th className="min-w-[140px] px-2 py-2 font-medium">Vendedor</th>
                  <th className="px-2 py-2 text-right font-medium">CMC</th>
                  <th className="px-2 py-2 text-right font-medium">Venda</th>
                  <th className="px-2 py-2 text-right font-medium">V−C</th>
                  <th className="px-2 py-2 text-right font-medium">Mrg%</th>
                  <th className="px-2 py-2 text-right font-medium">Extra</th>
                  <th className="px-2 py-2 text-right font-medium">Desc</th>
                  <th className="px-2 py-2 text-right font-medium">%C</th>
                  <th className="px-2 py-2 text-right font-medium">Comissão</th>
                  <th className="px-2 py-2 text-right font-medium">Mrg Loja</th>
                  <th className="px-2 py-2 font-medium">St</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <LinhaRow key={l.venda.id} linha={l} vendedores={vendedores} onSave={(e) => salvar(l, e)} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-medium">
                  <td className="px-2 py-2" colSpan={4}>Total ({linhas.length} vendas)</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totais.cmc)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totais.venda)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totais.venda - totais.cmc)}</td>
                  <td />
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totais.extra)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totais.desc)}</td>
                  <td />
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totais.comm)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{formatBRL(totais.mLoja)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const inputClass =
  'h-7 rounded-md border border-gray-300 bg-white px-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-red-500'

function LinhaRow({
  linha,
  vendedores,
  onSave,
}: {
  linha: LinhaAjuste
  vendedores: Vendedor[]
  onSave: (edits: Edits) => Promise<{ ok: boolean; error?: string }>
}) {
  const { venda, ajuste } = linha
  const clienteNome = venda.cliente_nome
  const cmcTotal = (venda.cmc_unitario ?? 0) * venda.quantidade

  const [vendedor, setVendedor] = useState(ajuste?.vendedor ?? '')
  const [custosExtras, setCustosExtras] = useState(String(ajuste?.custos_extras ?? 0))
  const [desconto, setDesconto] = useState(String(ajuste?.desconto ?? 0))
  const [commPct, setCommPct] = useState(String(ajuste?.comissao_override_pct ?? ajuste?.comissao_pct ?? 0))
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    setVendedor(ajuste?.vendedor ?? '')
    setCustosExtras(String(ajuste?.custos_extras ?? 0))
    setDesconto(String(ajuste?.desconto ?? 0))
    setCommPct(String(ajuste?.comissao_override_pct ?? ajuste?.comissao_pct ?? 0))
  }, [ajuste])

  const calc = useMemo(
    () =>
      calcular({
        valor_venda: venda.valor_total,
        cmc_total: cmcTotal,
        custos_extras: parseFloat(custosExtras) || 0,
        desconto: parseFloat(desconto) || 0,
        comissao_pct: parseFloat(commPct) || 0,
      }),
    [venda.valor_total, cmcTotal, custosExtras, desconto, commPct],
  )

  const cor = classificarCmcRatio(calc.cmc_ratio)
  const corClass =
    cor === 'verde' ? 'text-green-600' : cor === 'amarelo' ? 'text-yellow-600' : 'text-red-600'

  const status = ajuste?.status ?? 'sem'
  const statusBadge =
    status === 'ajustado'
      ? 'bg-green-100 text-green-800'
      : status === 'pendente'
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-gray-100 text-gray-500'

  const avisoMargemNegativa = calc.margem_loja_valor < 0 && calc.valor_comissao > 0

  async function save(edits: Edits) {
    setSaving(true)
    setSaveError(null)
    const result = await onSave(edits)
    setSaving(false)
    if (!result.ok) setSaveError(result.error ?? 'erro')
  }

  return (
    <tr
      className={`border-t border-gray-100 ${saving ? 'opacity-60' : ''} ${avisoMargemNegativa ? 'bg-red-50' : ''}`}
      title={avisoMargemNegativa ? '⚠ Margem negativa com comissão > 0' : undefined}
    >
      <td className="px-2 py-1 tabular-nums text-gray-500">{venda.numero_pedido ?? '—'}</td>
      <td className="max-w-[200px] truncate px-2 py-1" title={venda.descricao ?? ''}>
        {venda.descricao ?? '—'}
      </td>
      <td className="max-w-[160px] truncate px-2 py-1" title={clienteNome ?? venda.codigo_cliente ?? ''}>
        {clienteNome ?? <span className="text-gray-400">#{venda.codigo_cliente}</span>}
      </td>
      <td className="px-2 py-1">
        <select
          value={vendedor}
          onChange={(e) => setVendedor(e.target.value)}
          onBlur={(e) => {
            if ((ajuste?.vendedor ?? '') !== e.target.value) save({ vendedor: e.target.value || null })
          }}
          className="h-7 w-full rounded-md border border-gray-300 bg-white px-1 text-xs"
        >
          <option value="">— escolher —</option>
          {vendedores.map((v) => (
            <option key={v.id} value={v.nome}>
              {v.codigo != null ? `${v.codigo} — ${v.nome}` : v.nome}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-1 text-right tabular-nums text-gray-500">
        {venda.cmc_unitario == null ? '—' : formatBRL(cmcTotal)}
      </td>
      <td className="px-2 py-1 text-right tabular-nums">{formatBRL(venda.valor_total)}</td>
      <td className="px-2 py-1 text-right tabular-nums">{formatBRL(calc.margem_bruta_valor)}</td>
      <td className={`px-2 py-1 text-right tabular-nums ${corClass}`}>
        {formatPercent(calc.margem_bruta_pct, 0)}
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.01"
          value={custosExtras}
          onChange={(e) => setCustosExtras(e.target.value)}
          onBlur={(e) => {
            if (String(ajuste?.custos_extras ?? 0) !== e.target.value)
              save({ custos_extras: Number(e.target.value) || 0 })
          }}
          className={`${inputClass} w-20`}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.01"
          value={desconto}
          onChange={(e) => setDesconto(e.target.value)}
          onBlur={(e) => {
            if (String(ajuste?.desconto ?? 0) !== e.target.value)
              save({ desconto: Number(e.target.value) || 0 })
          }}
          className={`${inputClass} w-20`}
        />
      </td>
      <td className="px-1 py-1">
        <input
          type="number"
          step="0.01"
          value={commPct}
          onChange={(e) => setCommPct(e.target.value)}
          onBlur={(e) => {
            const original = String(ajuste?.comissao_override_pct ?? ajuste?.comissao_pct ?? 0)
            if (original !== e.target.value)
              save({ comissao_override_pct: e.target.value === '' ? null : Number(e.target.value) })
          }}
          className={`${inputClass} w-14`}
        />
      </td>
      <td className="px-2 py-1 text-right tabular-nums">{formatBRL(calc.valor_comissao)}</td>
      <td
        className={`px-2 py-1 text-right font-medium tabular-nums ${calc.margem_loja_valor < 0 ? 'text-red-600' : ''}`}
      >
        {formatBRL(calc.margem_loja_valor)}
      </td>
      <td className="px-2 py-1">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadge}`}>
          {status === 'sem' ? '—' : status}
        </span>
        {saveError && (
          <div className="max-w-[80px] truncate text-[10px] text-red-600" title={saveError}>
            erro
          </div>
        )}
      </td>
    </tr>
  )
}
