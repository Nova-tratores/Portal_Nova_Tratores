'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Ticket as TicketIcon, ShoppingCart } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'

export default function TicketsLayout({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const pathname = usePathname()

  if (!loading && userProfile && !temAcesso('tickets')) return <SemPermissao />

  const emCompras = pathname?.startsWith('/tickets/compras')
  const abas = [
    { href: '/tickets', label: 'Tickets', icone: <TicketIcon size={16} />, ativo: !emCompras },
    { href: '/tickets/compras', label: 'Solicitações de Compras', icone: <ShoppingCart size={16} />, ativo: emCompras },
  ]

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg)' }}>
      <nav style={{ display: 'flex', gap: 4, padding: '0 16px', borderBottom: '1px solid var(--portal-border,#eee)', background: 'var(--portal-surface,#fff)' }}>
        {abas.map((a) => (
          <Link key={a.href} href={a.href} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px',
            fontSize: 14, fontWeight: 600, textDecoration: 'none',
            color: a.ativo ? '#dc2626' : 'var(--portal-text-muted,#888)',
            borderBottom: a.ativo ? '2px solid #dc2626' : '2px solid transparent',
          }}>
            {a.icone} {a.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
