'use client'
// War Room — guarda de módulo (temAcesso('war-room')) + barra de navegação.
// Padrão idêntico ao /tickets.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Crosshair, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'

export default function WarRoomLayout({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth()
  const { temAcesso, isAdmin, loading } = usePermissoes(userProfile?.id)
  const pathname = usePathname()

  if (!loading && userProfile && !temAcesso('war-room')) return <SemPermissao />

  const emConfig = pathname?.startsWith('/war-room/config')
  const abas = [
    { href: '/war-room', label: 'War Room', icone: <Crosshair size={16} />, ativo: !emConfig, mostrar: true },
    { href: '/war-room/config', label: 'Membros', icone: <Users size={16} />, ativo: emConfig, mostrar: isAdmin },
  ].filter((a) => a.mostrar)

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg)' }}>
      <nav style={{ display: 'flex', gap: 4, padding: '0 16px', borderBottom: '1px solid var(--portal-border,#eee)', background: 'var(--portal-surface,#fff)' }}>
        {abas.map((a) => (
          <Link key={a.href} href={a.href} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px',
            fontSize: 14, fontWeight: 600, textDecoration: 'none',
            color: a.ativo ? '#b91c1c' : 'var(--portal-text-muted,#888)',
            borderBottom: a.ativo ? '2px solid #b91c1c' : '2px solid transparent',
          }}>
            {a.icone} {a.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
