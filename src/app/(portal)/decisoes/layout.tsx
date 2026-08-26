'use client'
import { usePathname, useRouter } from 'next/navigation'
import { ShoppingCart, BarChart3 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'

export default function DecisoesLayout({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const pathname = usePathname()
  const router = useRouter()

  if (!loading && userProfile && !temAcesso('decisoes')) return <SemPermissao />

  const abas = [
    { href: '/decisoes', label: 'Solicitações de Compras', icone: <ShoppingCart size={16} />, ativo: pathname === '/decisoes' || pathname.startsWith('/decisoes/') && pathname !== '/decisoes/placar' },
    { href: '/decisoes/placar', label: 'Placar por decisor', icone: <BarChart3 size={16} />, ativo: pathname === '/decisoes/placar' },
  ]

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg)' }}>
      <nav style={{ display: 'flex', gap: 4, padding: '0 16px', borderBottom: '1px solid var(--portal-border,#eee)', background: 'var(--portal-surface,#fff)' }}>
        {abas.map((a) => (
          <button key={a.href} onClick={() => router.push(a.href)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px', border: 'none',
              background: 'transparent', cursor: 'pointer',
              fontSize: 14, fontWeight: 600,
              color: a.ativo ? '#7c3aed' : 'var(--portal-text-muted,#888)',
              borderBottom: a.ativo ? '2px solid #7c3aed' : '2px solid transparent',
            }}>
            {a.icone} {a.label}
          </button>
        ))}
      </nav>
      {children}
    </div>
  )
}
