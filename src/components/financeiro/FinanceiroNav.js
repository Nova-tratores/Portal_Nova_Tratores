'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutDashboard, Columns3, BarChart3, History, Receipt, Users,
  PlusCircle, FileText, DollarSign, UserCog, Settings
} from 'lucide-react'

const ICONS = {
  painel: LayoutDashboard,
  kanban: Columns3,
  dashboard: BarChart3,
  pagar: Receipt,
  receber: DollarSign,
  rh: Users,
  config: Settings,
}

const LINKS_FINANCEIRO = [
  { label: 'Painel', href: '/financeiro/home-financeiro', icon: 'painel' },
  { label: 'Kanban', href: '/financeiro/kanban-financeiro', icon: 'kanban' },
  { label: 'Dashboard', href: '/financeiro/dashboard', icon: 'dashboard' },
  { label: 'Hist. Pagar', href: '/financeiro/historico-pagar', icon: 'pagar' },
  { label: 'Hist. Receber', href: '/financeiro/historico-receber', icon: 'receber' },
  { label: 'Hist. RH', href: '/financeiro/historico-rh', icon: 'rh' },
  { label: 'Relatório', href: '/financeiro/relatorio-pagar', icon: 'dashboard' },
  { label: 'Config', href: '/financeiro/configuracoes', icon: 'config' },
]

const LINKS_POSVENDAS = [
  { label: 'Painel', href: '/financeiro/home-posvendas', icon: 'painel' },
  { label: 'Kanban', href: '/financeiro/kanban', icon: 'kanban' },
  { label: 'Dashboard', href: '/financeiro/dashboard', icon: 'dashboard' },
  { label: 'Hist. Pagar', href: '/financeiro/historico-pagar', icon: 'pagar' },
  { label: 'Hist. Receber', href: '/financeiro/historico-receber', icon: 'receber' },
  { label: 'Hist. RH', href: '/financeiro/historico-rh', icon: 'rh' },
  { label: 'Config', href: '/financeiro/configuracoes', icon: 'config' },
]

export default function FinanceiroNav({ children }) {
  const pathname = usePathname()
  const { userProfile } = useAuth()

  const isFinanceiro = userProfile?.funcao === 'Financeiro'
  const links = isFinanceiro ? LINKS_FINANCEIRO : LINKS_POSVENDAS

  return (
    <div style={{
      position: 'sticky', top: '72px', zIndex: 30,
      background: '#fff', borderBottom: '1px solid #f0f0f0',
      boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      padding: '0 24px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        height: '48px', gap: '6px',
      }}>
        {/* Nav tabs — tudo junto, sem título separado */}
        <nav style={{
          display: 'flex', alignItems: 'center', gap: '2px',
          flex: 1, overflowX: 'auto',
        }}>
          {links.map(link => {
            const isActive = pathname === link.href
            const Icon = ICONS[link.icon]
            return (
              <Link key={link.href} href={link.href} style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 12px', borderRadius: '7px',
                fontSize: '12px', fontWeight: isActive ? '700' : '500',
                color: isActive ? '#dc2626' : '#737373',
                background: isActive ? '#fef2f2' : 'transparent',
                textDecoration: 'none', transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}>
                <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* Action buttons (slot) */}
        {children && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {children}
          </div>
        )}
      </div>
    </div>
  )
}
