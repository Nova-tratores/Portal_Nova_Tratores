'use client'
// Nav interno do Gestão de Vendas + seletores de empresa e competência.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useGv, type ContaGv } from './GvProvider'
import { nomeMes } from '@/lib/gestao-vendas/calculos'

// Mesmo estilo do seletor de conta do DRE (botões segmentados)
const LOJAS: { value: ContaGv; label: string }[] = [
  { value: 'NOVA', label: 'NOVA' },
  { value: 'CASTRO', label: 'CASTRO' },
  { value: 'TODAS', label: 'TODAS' },
]

const PAGINAS = [
  { href: '/gestao-vendas', label: 'Dashboard' },
  { href: '/gestao-vendas/vendas', label: 'Vendas do Mês' },
  { href: '/gestao-vendas/ajustes-venda', label: 'Ajustes por Venda' },
  { href: '/gestao-vendas/custos', label: 'Custos Mensais' },
  { href: '/gestao-vendas/relatorios', label: 'Relatórios' },
]

const selectClass =
  'rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500'

export default function GvNav() {
  const pathname = usePathname()
  const { mes, ano, conta, setCompetencia, setConta } = useGv()
  const anoAtual = new Date().getFullYear()
  const anos = Array.from({ length: 6 }, (_, i) => anoAtual - 3 + i)

  return (
    <nav className="print:hidden sticky top-0 z-20 mb-2 flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-4 py-2">
      {PAGINAS.map((p) => {
        const ativo = p.href === '/gestao-vendas' ? pathname === p.href : pathname.startsWith(p.href)
        return (
          <Link
            key={p.href}
            href={p.href}
            className={`whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium no-underline ${
              ativo ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {p.label}
          </Link>
        )
      })}

      <div className="ml-auto flex items-center gap-2">
        <span className="text-[11px] text-gray-500">Loja</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-red-600" role="group" aria-label="Loja">
          {LOJAS.map((e, i) => {
            const ativo = conta === e.value
            return (
              <button
                key={e.value}
                type="button"
                onClick={() => setConta(e.value)}
                className={`px-3 py-1 text-xs font-semibold transition-colors ${
                  i > 0 ? 'border-l border-red-600' : ''
                } ${ativo ? 'bg-red-600 text-white' : 'bg-white text-red-700 hover:bg-red-50'}`}
              >
                {e.label}
              </button>
            )
          })}
        </div>
        <select
          value={mes}
          onChange={(e) => setCompetencia(Number(e.target.value), ano)}
          className={selectClass}
          aria-label="Mês"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {nomeMes(m)}
            </option>
          ))}
        </select>
        <select
          value={ano}
          onChange={(e) => setCompetencia(mes, Number(e.target.value))}
          className={selectClass}
          aria-label="Ano"
        >
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
    </nav>
  )
}
