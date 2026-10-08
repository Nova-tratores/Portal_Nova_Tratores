'use client'
// Carimbo do PDF da proposta, por vendedor: nome, cargo e telefone (só texto —
// sem imagem de assinatura, decisão de 14/09/2026: a linha fica pra assinar no
// papel). Fica dentro do bloco "Vendedores" de /gestao-vendas/ajustes-venda.

import { useEffect, useMemo, useState } from 'react'
import type { Vendedor } from '@/lib/gestao-vendas/tipos'
import { salvarCarimboVendedorApi } from '@/app/(portal)/gestao-vendas/hooks'

type Campos = { carimbo_nome: string; carimbo_cargo: string; carimbo_telefone: string }

const camposDe = (v: Vendedor): Campos => ({
  carimbo_nome: v.carimbo_nome ?? '',
  carimbo_cargo: v.carimbo_cargo ?? '',
  carimbo_telefone: v.carimbo_telefone ?? '',
})

export const carimboCompleto = (v: Vendedor): boolean => !!(v.carimbo_nome ?? '').trim()

function LinhaVendedor({ v, onChange }: { v: Vendedor; onChange: (vs: Vendedor[]) => void }) {
  const [campos, setCampos] = useState<Campos>(() => camposDe(v))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  // Após salvar, a lista volta do servidor: realinha os campos sem perder a mensagem.
  useEffect(() => { setCampos(camposDe(v)) }, [v.carimbo_nome, v.carimbo_cargo, v.carimbo_telefone]) // eslint-disable-line react-hooks/exhaustive-deps

  const sujo = useMemo(() => {
    const o = camposDe(v)
    return o.carimbo_nome !== campos.carimbo_nome || o.carimbo_cargo !== campos.carimbo_cargo || o.carimbo_telefone !== campos.carimbo_telefone
  }, [v, campos])

  const completo = carimboCompleto(v)

  async function salvar() {
    if (busy || !sujo) return
    setBusy(true); setErro(null); setMsg(null)
    try {
      const { vendedores } = await salvarCarimboVendedorApi(v.id, campos)
      onChange(vendedores)
      setMsg('Carimbo salvo.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const input = 'h-9 sm:h-7 w-full rounded border border-gray-300 bg-white px-2 text-xs text-gray-900 focus:border-red-500 focus:outline-none'

  return (
    <tr className="border-t border-gray-100 align-middle">
      <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-xs">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${completo ? 'bg-green-500' : 'bg-amber-400'}`} title={completo ? 'Pronto pro PDF' : 'Falta o nome do carimbo — o PDF da proposta vai recusar'} />
          <span className="truncate font-medium text-gray-800" title={v.nome}>{v.nome}</span>
        </div>
      </td>
      <td className="px-2 py-1.5"><input className={input} value={campos.carimbo_nome} placeholder="Nome no carimbo" onChange={(e) => setCampos({ ...campos, carimbo_nome: e.target.value })} /></td>
      <td className="px-2 py-1.5"><input className={input} value={campos.carimbo_cargo} placeholder="Departamento Comercial" onChange={(e) => setCampos({ ...campos, carimbo_cargo: e.target.value })} /></td>
      <td className="px-2 py-1.5"><input className={input} value={campos.carimbo_telefone} placeholder="(14) 9 0000-0000" onChange={(e) => setCampos({ ...campos, carimbo_telefone: e.target.value })} /></td>
      <td className="px-2 py-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={salvar}
            disabled={busy || !sujo}
            className="h-9 sm:h-7 rounded-md bg-red-600 px-3 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
          >
            {busy ? '…' : 'Salvar'}
          </button>
          {msg && <span className="text-[11px] text-green-700">{msg}</span>}
          {erro && <span className="text-[11px] text-red-600">{erro}</span>}
        </div>
      </td>
    </tr>
  )
}

export default function CarimboVendedores({ vendedores, onChange }: { vendedores: Vendedor[]; onChange: (vs: Vendedor[]) => void }) {
  const pendentes = vendedores.filter((v) => !carimboCompleto(v)).length
  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs sm:text-[11px] text-gray-500">
        <span>Carimbo do PDF da proposta: nome, cargo e telefone que saem embaixo da linha de assinatura do vendedor.</span>
        {pendentes > 0 && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700">{pendentes} vendedor(es) sem nome de carimbo — o PDF da proposta recusa gerar pra eles.</span>}
      </div>
      <div className="overflow-x-auto rounded border border-gray-100">
        <table className="w-full min-w-[720px] text-left">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-2 py-1.5 font-medium">Vendedor</th>
              <th className="px-2 py-1.5 font-medium">Nome no carimbo</th>
              <th className="px-2 py-1.5 font-medium">Cargo</th>
              <th className="px-2 py-1.5 font-medium">Telefone</th>
              <th className="px-2 py-1.5 font-medium" />
            </tr>
          </thead>
          <tbody>
            {vendedores.map((v) => <LinhaVendedor key={v.id} v={v} onChange={onChange} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
