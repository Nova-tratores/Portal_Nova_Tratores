'use client'
// Agenda coletiva — aba da Central de Trabalho. A agenda é de TODOS os logados (a barra da
// Central só aparece para quem tem o módulo; quem não tem vê só a agenda).
import { ESTILO_CENTRAL_VN } from '@/components/trabalho/visualCentral'

export default function AgendaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ct-vn" style={{ background: 'var(--portal-bg)' }}>
      {/* estilo NewPortal da Central também para quem não tem a barra (José, 04/11/2026) */}
      <style>{ESTILO_CENTRAL_VN}</style>
      {children}
    </div>
  )
}
