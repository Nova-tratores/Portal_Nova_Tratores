'use client'
// Índice dos relatórios imprimíveis do Gestão de Vendas.

import Link from 'next/link'
import { useGv } from '../GvProvider'
import { formatCompetencia } from '@/lib/gestao-vendas/calculos'

const RELATORIOS = [
  {
    titulo: 'Geral da Loja',
    descricao: 'Pedidos faturados: clientes, empresas, máquinas, famílias e categorias (Nova + Castro).',
    rota: '/gestao-vendas/relatorios/geral',
  },
  {
    titulo: 'Por Vendedor (Matriz)',
    descricao: 'Matriz custos × vendedores e cálculo de lucro líquido.',
    rota: '/gestao-vendas/relatorios/vendedores',
  },
  {
    titulo: 'Individual por Vendedor',
    descricao: 'Uma página por vendedor com clientes, produtos e custo total.',
    rota: '/gestao-vendas/relatorios/individual',
  },
]

export default function GvRelatoriosPage() {
  const { mes, ano } = useGv()
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        <p className="text-sm text-gray-500">Imprimíveis para diretoria — {formatCompetencia(mes, ano)}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {RELATORIOS.map((rel) => (
          <Link
            key={rel.rota}
            href={rel.rota}
            className="rounded-lg border border-gray-200 bg-white px-4 py-3 no-underline transition-colors hover:bg-gray-50"
          >
            <p className="font-semibold text-gray-900">{rel.titulo}</p>
            <p className="mt-1 text-xs text-gray-500">{rel.descricao}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
