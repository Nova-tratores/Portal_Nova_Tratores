'use client'
// Layout do módulo Gestão de Vendas (port do app externo gestao-vendas).
// Gate de permissão no cliente (UX) — a proteção real está nas rotas
// /api/gestao-vendas/* (login + permissão validados no servidor).

import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { GvProvider } from './GvProvider'
import GvNav from './GvNav'

export default function GestaoVendasLayout({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)

  if (loading) {
    return <p className="p-6 text-sm text-gray-500">Carregando permissões…</p>
  }

  if (!temAcesso('gestao-vendas')) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3">
          <p className="font-medium text-red-800">Sem acesso ao Gestão de Vendas</p>
          <p className="mt-1 text-sm text-red-700">
            Este módulo contém margens, comissões e custos por vendedor. Peça a um
            administrador para conceder a permissão <code>gestao-vendas</code> na Administração.
          </p>
        </div>
      </div>
    )
  }

  return (
    <GvProvider>
      <GvNav />
      <div className="p-4">{children}</div>
    </GvProvider>
  )
}
