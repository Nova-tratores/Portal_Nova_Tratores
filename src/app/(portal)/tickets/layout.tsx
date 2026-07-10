'use client'
import { Ticket as TicketIcon, ShoppingCart } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)

  if (!loading && userProfile && !temAcesso('tickets')) return <SemPermissao />

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg)' }}>
      <nav style={{ display: 'flex', gap: 4, padding: '0 16px', borderBottom: '1px solid var(--portal-border,#eee)', background: 'var(--portal-surface,#fff)' }}>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px',
          fontSize: 14, fontWeight: 600, color: '#dc2626', borderBottom: '2px solid #dc2626',
        }}>
          <TicketIcon size={16} /> Tickets
        </span>
        {/* ADR-007: a área de Compras existe na navegação desde a v1, desabilitada,
            comunicando a chegada do workflow de Solicitação de Compras (v2). */}
        <span
          title="Solicitações de Compras: workflow com alçadas (vendedor → diretor → financeiro → comprador). Em construção."
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px',
            fontSize: 14, fontWeight: 600, color: 'var(--portal-text-muted,#aaa)',
            borderBottom: '2px solid transparent', cursor: 'not-allowed', userSelect: 'none',
          }}
        >
          <ShoppingCart size={16} /> Solicitações de Compras
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: .5, padding: '2px 7px', borderRadius: 999,
            background: 'rgba(107,114,128,.14)', color: 'var(--portal-text-muted,#888)',
          }}>EM BREVE</span>
        </span>
      </nav>
      {children}
    </div>
  )
}
