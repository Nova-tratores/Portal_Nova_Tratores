'use client'
// Sala de reunião — um dos módulos da Central de Trabalho (José, 04/11/2026: "joga a sala de reuniões nesse módulo,
// pra ser um dele também"). A agenda da sala é de TODOS os logados; a barra da Central só para quem tem o módulo.
import { Suspense } from 'react'
import CentralNav from '@/components/trabalho/CentralNav'
import { ESTILO_CENTRAL_VN } from '@/components/trabalho/visualCentral'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'

export default function SalasLayout({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const central = !loading && (temAcesso('tickets') || temAcesso('tarefas') || temAcesso('cronograma'))
  return (
    <div className="ct-vn" style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg)' }}>
      <style>{ESTILO_CENTRAL_VN}</style>
      {central && <Suspense fallback={null}><CentralNav /></Suspense>}
      {children}
    </div>
  )
}
