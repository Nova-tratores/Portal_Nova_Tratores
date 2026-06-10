'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard, ShoppingBag, MapPin, AlertTriangle } from 'lucide-react'

const tabs = [
  { href: '/visual-estoque', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/visual-estoque/showroom', label: 'Showroom', icon: ShoppingBag },
  { href: '/visual-estoque/patio', label: 'Pátio', icon: MapPin },
  { href: '/visual-estoque/alertas', label: 'Alertas', icon: AlertTriangle },
]

export default function VisualEstoqueLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div style={{ minHeight: 'calc(100vh - 84px)' }}>
      <div style={{
        display: 'flex', gap: 6, padding: '16px 32px 0',
        borderBottom: '1px solid var(--portal-border, #e5e5e5)',
        background: 'var(--portal-bg, #fafafa)',
      }}>
        {tabs.map(t => {
          const active = pathname === t.href
          return (
            <Link key={t.href} href={t.href} style={{
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
