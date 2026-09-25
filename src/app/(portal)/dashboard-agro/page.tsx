'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BarChart3, Sprout, Link2, MapPin } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import PlanoCarAba from '@/components/dashboard-agro/PlanoCarAba'
import VinculosSugeridos from '@/components/dashboard-agro/VinculosSugeridos'
import MapaCar from '@/components/dashboard-agro/MapaCar'

// Dashboard Agro: duas guias.
//  - Dashboard: o app externo no Railway (iframe) — fica sempre montado, só
//    escondido, para não recarregar a cada troca de guia.
//  - Inteligência por CAR: o planejamento do módulo (lib pura lib/agro/plano-car.ts).
//  - Mapa: imóveis (CAR) do município coloridos por cultura + visitas do CRM.
//  - Vínculos: sugestões CAR↔cliente pelas visitas do CRM (aceitar/rejeitar).
// Deep-link: /dashboard-agro?tab=car | ?tab=mapa | ?tab=vinculos
type Aba = 'dashboard' | 'car' | 'mapa' | 'vinculos'
const IFRAME_URL = 'https://dashboard-agro-sp-production.up.railway.app/'
const ALTURA_FAIXA = 52

const GUIAS: { id: Aba; label: string; icon: React.ReactNode; selo?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={15} /> },
  { id: 'car', label: 'Inteligência por CAR', icon: <Sprout size={15} />, selo: 'PLANO' },
  { id: 'mapa', label: 'Mapa dos imóveis', icon: <MapPin size={15} />, selo: 'NOVO' },
  { id: 'vinculos', label: 'Vínculos', icon: <Link2 size={15} />, selo: 'SUGESTÕES' },
]
const ABAS: Aba[] = ['dashboard', 'car', 'mapa', 'vinculos']

export default function DashboardAgroPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabInicial = searchParams?.get('tab') as Aba | null
  const [aba, setAba] = useState<Aba>(tabInicial && ABAS.includes(tabInicial) ? tabInicial : 'dashboard')

  if (!loading && userProfile && !temAcesso('dashboard-agro')) return <SemPermissao />

  const trocar = (nova: Aba) => {
    setAba(nova)
    router.replace(nova === 'dashboard' ? '/dashboard-agro' : `/dashboard-agro?tab=${nova}`)
  }

  return (
    <div style={{ width: '100%', height: 'calc(100vh - 84px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Faixa verde com guias estilo Chrome (mesmo desenho do FrotaNav) */}
      <div
        style={{
          display: 'flex', alignItems: 'flex-end', gap: 3, padding: '10px 24px 0',
          height: ALTURA_FAIXA, boxSizing: 'border-box', flexShrink: 0,
          background: 'linear-gradient(135deg, #22c55e, #15803d)',
          overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          boxShadow: '0 1px 4px var(--portal-shadow)',
        }}
      >
        {GUIAS.map((g) => {
          const ativo = aba === g.id
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => trocar(g.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '11px 20px', fontSize: 14, fontWeight: ativo ? 700 : 500,
                color: '#111111', // fonte PRETA sempre (#111827 é remapeado pra branco no escuro)
                // #fefefe: branco "de verdade" que o modo escuro NÃO converte (o #fff vira card escuro)
                background: ativo ? '#fefefe' : 'rgba(255,255,255,0.30)',
                border: 'none', borderRadius: '11px 11px 0 0', cursor: 'pointer',
                boxShadow: ativo ? '0 -2px 6px rgba(0,0,0,0.15)' : 'none',
                transition: '0.15s', whiteSpace: 'nowrap',
              }}
            >
              {g.icon} {g.label}
              {g.selo && (
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: .5, padding: '2px 6px', borderRadius: 999,
                  background: ativo ? 'rgba(22,163,74,0.16)' : 'rgba(0,0,0,0.12)', color: '#111111',
                }}>{g.selo}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Conteúdo */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <iframe
          src={IFRAME_URL}
          title="Dashboard Agro"
          style={{ width: '100%', height: '100%', border: 'none', display: aba === 'dashboard' ? 'block' : 'none' }}
        />
        {aba === 'car' && (
          <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', background: 'var(--portal-bg)' }}>
            <PlanoCarAba />
          </div>
        )}
        {aba === 'mapa' && (
          <div style={{ position: 'absolute', inset: 0, background: 'var(--portal-bg)' }}>
            <MapaCar />
          </div>
        )}
        {aba === 'vinculos' && (
          <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', background: 'var(--portal-bg)' }}>
            <VinculosSugeridos />
          </div>
        )}
      </div>
    </div>
  )
}
