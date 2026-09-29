'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BarChart3, Sprout, Link2, MapPin, Target } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { authHeaders } from '@/lib/auth/client'
import PlanoCarAba from '@/components/dashboard-agro/PlanoCarAba'
import VinculosSugeridos from '@/components/dashboard-agro/VinculosSugeridos'
import MapaCar from '@/components/dashboard-agro/MapaCar'
import ProspeccaoCar from '@/components/dashboard-agro/ProspeccaoCar'

// Dashboard Agro: duas guias.
//  - Dashboard: o app externo no Railway (iframe) — fica sempre montado, só
//    escondido, para não recarregar a cada troca de guia. O endereço vem de
//    /api/agro/dashboard-token, com um token assinado de curta duração: o app
//    externo só entrega a página para quem chegou por aqui.
//  - Inteligência por CAR: o planejamento do módulo (lib pura lib/agro/plano-car.ts).
//  - Mapa: imóveis (CAR) do município coloridos por cultura + visitas do CRM.
//  - Vínculos: sugestões CAR↔cliente pelas visitas do CRM (aceitar/rejeitar).
//  - Prospecção: lista por score + ficha do imóvel (validar cultura, vincular cliente, exportar).
// Deep-link: /dashboard-agro?tab=car | ?tab=prospeccao | ?tab=mapa | ?tab=vinculos
type Aba = 'dashboard' | 'car' | 'prospeccao' | 'mapa' | 'vinculos'
const ALTURA_FAIXA = 52

const GUIAS: { id: Aba; label: string; icon: React.ReactNode; selo?: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={15} /> },
  { id: 'car', label: 'Inteligência por CAR', icon: <Sprout size={15} />, selo: 'PLANO' },
  { id: 'prospeccao', label: 'Prospecção', icon: <Target size={15} />, selo: 'NOVO' },
  { id: 'mapa', label: 'Mapa dos imóveis', icon: <MapPin size={15} /> },
  { id: 'vinculos', label: 'Vínculos', icon: <Link2 size={15} />, selo: 'SUGESTÕES' },
]
const ABAS: Aba[] = ['dashboard', 'car', 'prospeccao', 'mapa', 'vinculos']

export default function DashboardAgroPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabInicial = searchParams?.get('tab') as Aba | null
  const [aba, setAba] = useState<Aba>(tabInicial && ABAS.includes(tabInicial) ? tabInicial : 'dashboard')

  // endereço do iframe (com token). null = ainda pedindo; erro = não veio.
  const [iframeUrl, setIframeUrl] = useState<string | null>(null)
  const [erroIframe, setErroIframe] = useState<string | null>(null)
  const podeVer = !loading && !!userProfile && temAcesso('dashboard-agro')

  const pedirEndereco = useCallback(async () => {
    setErroIframe(null)
    try {
      const r = await fetch('/api/agro/dashboard-token', { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j?.url) throw new Error(j?.error || `HTTP ${r.status}`)
      setIframeUrl(String(j.url))
    } catch (e) {
      setErroIframe(e instanceof Error ? e.message : 'Falha ao abrir o painel')
    }
  }, [])

  // pede UMA vez, quando a permissão está confirmada (o token só vale na carga da página)
  useEffect(() => {
    if (podeVer && !iframeUrl && !erroIframe) pedirEndereco()
  }, [podeVer, iframeUrl, erroIframe, pedirEndereco])

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
        {iframeUrl ? (
          <iframe
            src={iframeUrl}
            title="Dashboard Agro"
            referrerPolicy="no-referrer"
            style={{ width: '100%', height: '100%', border: 'none', display: aba === 'dashboard' ? 'block' : 'none' }}
          />
        ) : aba === 'dashboard' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'var(--portal-bg)', color: 'var(--portal-text,#111111)', fontSize: 14 }}>
            {erroIframe ? (
              <>
                <div>Não foi possível abrir o painel: {erroIframe}</div>
                <button type="button" onClick={pedirEndereco} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#111111', fontWeight: 700, cursor: 'pointer' }}>Tentar de novo</button>
              </>
            ) : (
              <div style={{ color: 'var(--portal-text-muted,#6b7280)' }}>Abrindo o painel…</div>
            )}
          </div>
        )}
        {aba === 'car' && (
          <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', background: 'var(--portal-bg)' }}>
            <PlanoCarAba />
          </div>
        )}
        {aba === 'prospeccao' && (
          <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', background: 'var(--portal-bg)' }}>
            <ProspeccaoCar />
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
