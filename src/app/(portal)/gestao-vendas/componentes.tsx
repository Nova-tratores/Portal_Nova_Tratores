'use client'
// Peças de UI compartilhadas pelas telas do Gestão de Vendas.

import { useEffect, useRef, useState } from 'react'

export function ErroCard({ msg }: { msg: string }) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
      <p className="text-sm font-medium text-red-800">Erro ao consultar</p>
      <p className="mt-0.5 font-mono text-xs text-red-700">{msg}</p>
    </div>
  )
}

// Cabeçalho vermelho dos relatórios imprimíveis (padrão do relatório da diretoria)
export function CabecalhoRelatorio({
  titulo,
  mesAno,
  direita,
}: {
  titulo: string
  mesAno: string
  direita?: React.ReactNode
}) {
  return (
    <header
      className="flex items-center justify-between bg-red-700 px-6 py-4 text-white"
      style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      <div className="text-base font-semibold uppercase tracking-wide">
        {mesAno} <span className="opacity-60">|</span> {titulo}
      </div>
      {direita && <div className="text-right text-xs opacity-90">{direita}</div>}
    </header>
  )
}

// Filtro multi-seleção com busca (dropdown de checkboxes)
export function MultiSelectFiltro({
  label,
  values,
  onChange,
  opcoes,
  getLabel,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  opcoes: string[]
  getLabel?: (v: string) => string
}) {
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const rotular = getLabel ?? ((v: string) => v)

  useEffect(() => {
    if (!open) return
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [open])

  function toggle(v: string) {
    if (values.includes(v)) onChange(values.filter((x) => x !== v))
    else onChange([...values, v])
  }

  const display =
    values.length === 0
      ? '— nenhum —'
      : values.length === opcoes.length
        ? '— todos —'
        : values.length === 1
          ? rotular(values[0])
          : `${values.length} selecionados`

  const opcoesFiltradas = busca.trim()
    ? opcoes.filter((o) => rotular(o).toLowerCase().includes(busca.toLowerCase()))
    : opcoes

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-w-[160px] max-w-[240px] items-center justify-between gap-1 rounded border border-gray-300 bg-white px-2 py-1 text-left text-xs"
        title={values.length > 0 ? values.map(rotular).join(', ') : undefined}
      >
        <span className="truncate">
          <span className="text-gray-500">{label}:</span>{' '}
          <span className={values.length > 0 ? 'font-medium' : 'text-gray-500'}>{display}</span>
        </span>
        <span className="shrink-0 text-gray-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 flex max-h-80 w-80 flex-col overflow-hidden rounded border border-gray-200 bg-white shadow-md">
          <input
            type="text"
            placeholder="Buscar…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="border-b border-gray-200 px-2 py-1.5 text-xs focus:outline-none"
            autoFocus
          />
          <div className="flex-1 overflow-auto p-1">
            {opcoesFiltradas.length === 0 ? (
              <p className="px-2 py-1 text-xs text-gray-500">Sem resultados.</p>
            ) : (
              opcoesFiltradas.map((o) => (
                <label
                  key={o}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-gray-100"
                >
                  <input
                    type="checkbox"
                    checked={values.includes(o)}
                    onChange={() => toggle(o)}
                    className="h-3 w-3 shrink-0"
                  />
                  <span className="truncate" title={rotular(o)}>
                    {rotular(o)}
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="flex border-t border-gray-200">
            <button
              type="button"
              onClick={() => onChange([...opcoes])}
              className="flex-1 px-3 py-1.5 text-left text-xs text-gray-500 hover:text-gray-800"
            >
              Marcar todos
            </button>
            {values.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="flex-1 px-3 py-1.5 text-left text-xs text-gray-500 hover:text-gray-800"
              >
                Limpar ({values.length})
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function SecaoRelatorio({
  titulo,
  sub,
  children,
}: {
  titulo: string
  sub?: string
  children: React.ReactNode
}) {
  return (
    <section style={{ breakInside: 'avoid' }}>
      <h2
        className="flex items-center justify-between bg-red-100 px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-red-900"
        style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
      >
        <span>{titulo}</span>
        {sub && <span className="text-xs font-normal opacity-70">{sub}</span>}
      </h2>
      <div className="overflow-x-auto">{children}</div>
    </section>
  )
}
