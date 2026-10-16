'use client'
// Agenda coletiva — aba da Central de Trabalho. A agenda é de TODOS os logados (a barra da
// Central só aparece para quem tem o módulo; quem não tem vê só a agenda).
import { Suspense } from 'react'
import CentralNav from '@/components/trabalho/CentralNav'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'

export default function AgendaLayout({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const central = !loading && (temAcesso('tickets') || temAcesso('tarefas') || temAcesso('cronograma'))
  return (
    <div style={{ background: 'var(--portal-bg)' }}>
      {central && <Suspense fallback={null}><CentralNav /></Suspense>}
      {children}
    </div>
  )
}
