'use client'
// Sala de reunião — um dos módulos da Central de Trabalho (José, 04/11/2026: "joga a sala de reuniões nesse módulo,
// pra ser um dele também"). A agenda da sala é de TODOS os logados; a barra da Central só para quem tem o módulo.
import { ESTILO_CENTRAL_VN } from '@/components/trabalho/visualCentral'

export default function SalasLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="ct-vn" style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg)' }}>
      <style>{ESTILO_CENTRAL_VN}</style>
      {/* botões cheios da sala (branco sobre ciano): no escuro um tom mais fundo para dar 4,5:1 */}
      <style>{`:root{--sala-cheio:#0891b2}[data-theme="dark"]{--sala-cheio:#0e7490}`}</style>
      {children}
    </div>
  )
}
