'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  LayoutDashboard, Columns3, BarChart3, History, Receipt, Users,
  PlusCircle, FileText, DollarSign, UserCog, AlertTriangle
} from 'lucide-react'

const ICONS = {
  painel: LayoutDashboard,
  kanban: Columns3,
  dashboard: BarChart3,
  pagar: Receipt,
  receber: DollarSign,
  rh: Users,
  vencidos: AlertTriangle,
}

const LINKS_FINANCEIRO = [
  { label: 'Painel', href: '/financeiro/home-financeiro', icon: 'painel' },
  { label: 'Kanban', href: '/financeiro/kanban-financeiro', icon: 'kanban' },
  { label: 'Despesas', href: '/financeiro/historico-pagar', icon: 'pagar' },
  { label: 'Relatorio', href: '/financeiro/relatorio-pagar', icon: 'dashboard' },
]

const LINKS_POSVENDAS = [
  { label: 'Painel', href: '/financeiro/home-posvendas', icon: 'painel' },
  { label: 'Kanban', href: '/financeiro/kanban', icon: 'kanban' },
  { label: 'Despesas', href: '/financeiro/historico-pagar', icon: 'pagar' },
]

const LINKS_PECAS = [
  { label: 'Painel', href: '/financeiro/home-pecas', icon: 'painel' },
  { label: 'Kanban', href: '/financeiro/kanban-pecas', icon: 'kanban' },
  { label: 'Despesas', href: '/financeiro/historico-pagar', icon: 'pagar' },
]

export default function FinanceiroNav({ children }) {
  const pathname = usePathname()
  const { userProfile } = useAuth()
  const [vencidosCount, setVencidosCount] = useState(0)

  const funcao = userProfile?.funcao
  const links = funcao === 'Financeiro' ? LINKS_FINANCEIRO
    : funcao === 'Peças' ? LINKS_PECAS
    : LINKS_POSVENDAS

  // Contar vencidos para badge
  useEffect(() => {
    const contarVencidos = async () => {
      try {
        const { data } = await supabase
          .from('Chamado_NF')
          .select('id, vencimento_boleto, forma_pagamento, status')
          .in('status', ['vencido', 'aguardando_vencimento'])
        const hoje = new Date(); hoje.setHours(0,0,0,0)
        const count = (data || []).filter(c => {
          if (c.status === 'vencido') return true
          if (c.status === 'aguardando_vencimento' && c.vencimento_boleto) {
            const venc = new Date(c.vencimento_boleto); venc.setHours(0,0,0,0)
            return venc < hoje
          }
          return false
        }).length
        setVencidosCount(count)
      } catch {}
    }
    contarVencidos()
    const channel = supabase
      .channel('nav_vencidos_count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Chamado_NF' }, () => contarVencidos())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <div style={{
      position: 'sticky', top: '84px', zIndex: 30,
      background: 'var(--portal-header-bg)', borderBottom: '1px solid var(--portal-border)',
      boxShadow: '0 1px 4px var(--portal-shadow)',
      padding: '0 24px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        height: '56px', gap: '8px',
      }}>
        {/* Nav tabs */}
        <nav style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          flex: 1, overflowX: 'auto',
        }}>
          {links.map(link => {
            const isActive = pathname === link.href
            const Icon = ICONS[link.icon]
            const isVencidosTab = link.icon === 'vencidos'
            const hasVencidos = isVencidosTab && vencidosCount > 0

            return (
              <Link key={link.href} href={link.href} style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '9px 18px', borderRadius: '8px',
                fontSize: '15px', fontWeight: isActive ? '600' : '500',
                color: isActive ? '#dc2626' : hasVencidos ? '#ef4444' : 'var(--portal-text-secondary)',
                background: isActive ? 'var(--portal-bg-hover)' : hasVencidos ? 'rgba(239,68,68,0.06)' : 'transparent',
                textDecoration: 'none', transition: 'all 0.15s',
                whiteSpace: 'nowrap',
                position: 'relative',
                animation: hasVencidos && !isActive ? 'pulse-vencido 2s ease-in-out infinite' : 'none',
              }}>
                <Icon size={17} strokeWidth={isActive ? 2.5 : 2} />
                {link.label}
                {hasVencidos && (
                  <span style={{
                    background: '#ef4444', color: '#fff',
                    fontSize: '10px', fontWeight: '700',
                    padding: '1px 6px', borderRadius: '10px',
                    minWidth: '18px', textAlign: 'center',
                    lineHeight: '16px',
                  }}>
                    {vencidosCount}
                  </span>
                )}
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

      <style>{`
        @keyframes pulse-vencido {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  )
}
