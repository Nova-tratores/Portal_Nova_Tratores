'use client'
// Nav interno do Gestão de Vendas + seletores de empresa e competência.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useGv } from './GvProvider'
import { EMPRESAS_GV } from '@/lib/gestao-vendas/tipos'
import { nomeMes } from '@/lib/gestao-vendas/calculos'

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
        <select
          value={conta}
          onChange={(e) => setConta(e.target.value as 'NOVA' | 'CASTRO')}
          className={selectClass}
          aria-label="Empresa"
        >
          {EMPRESAS_GV.map((e) => (
            <option key={e.value} value={e.value}>
              {e.label}
            </option>
          ))}
        </select>
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
