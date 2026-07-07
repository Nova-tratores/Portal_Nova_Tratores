'use client'
// Peças de UI compartilhadas pelas telas do Gestão de Vendas.

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
