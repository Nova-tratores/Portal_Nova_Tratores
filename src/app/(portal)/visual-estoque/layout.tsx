'use client'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import EstResponsiveStyles from '@/components/estoque/ResponsiveStyles'
import { LayoutDashboard, ShoppingBag, MapPin, AlertTriangle, Percent, FileInput, Send } from 'lucide-react'

const tabs = [
  { href: '/visual-estoque', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/visual-estoque/showroom', label: 'Showroom', icon: ShoppingBag },
  { href: '/visual-estoque/patio', label: 'Pátio', icon: MapPin },
  // A aba Frota foi absorvida pelo módulo Frota (/frota)
  { href: '/visual-estoque/remessas', label: 'Remessas', icon: Send },
  { href: '/visual-estoque/notas-entrada', label: 'Notas de Entrada', icon: FileInput },
  { href: '/visual-estoque/margens', label: 'Margens', icon: Percent },
  { href: '/visual-estoque/alertas', label: 'Alertas', icon: AlertTriangle },
]

export default function VisualEstoqueLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { userProfile } = useAuth()
  const { pode } = usePermissoes(userProfile?.id)

  // Celular/tablet: a faixa de abas rola de lado — traz a aba ativa para a vista.
  useEffect(() => {
    const el = document.querySelector('.vest-tabs a[data-ativa="1"]') as HTMLElement | null
    const faixa = el?.parentElement
    if (el && faixa && faixa.scrollWidth > faixa.clientWidth) faixa.scrollLeft += el.getBoundingClientRect().left - faixa.getBoundingClientRect().left - (faixa.clientWidth - el.offsetWidth) / 2
  }, [pathname])

  // Esconde da sub-nav as telas que o usuário não pode ver. A Home
  // (/visual-estoque) é sempre visível; as sub-telas seguem pode('consulta-estoque', slug).
  const podeVerTela = (href: string) => {
    if (href === '/visual-estoque') return true
    return pode('consulta-estoque', href.slice('/visual-estoque/'.length))
  }

  return (
    <div style={{ minHeight: 'calc(100vh - var(--portal-header-h))' }}>
      <EstResponsiveStyles />
      <div className="vest-tabs" style={{
        display: 'flex', gap: 6, padding: '16px 32px 0',
        borderBottom: '1px solid var(--portal-border, #e5e5e5)',
        background: 'var(--portal-bg, #fafafa)',
      }}>
        {tabs.filter(t => podeVerTela(t.href)).map(t => {
          const active = pathname === t.href
          return (
            <Link key={t.href} href={t.href} data-ativa={active ? '1' : undefined} style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 20px', fontSize: 13, fontWeight: active ? 700 : 500,
              color: active ? '#dc2626' : 'var(--portal-text-secondary, #737373)',
              borderBottom: active ? '3px solid #dc2626' : '3px solid transparent',
              textDecoration: 'none', transition: '0.15s',
              marginBottom: -1,
            }}>
              <t.icon size={16} /> {t.label}
            </Link>
          )
        })}
      </div>
      {children}
    </div>
  )
}
