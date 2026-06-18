'use client'
// Layout do modulo DRE Financeiro (port do financeiro-omie-dashboard).
// Envolve todas as telas do modulo: aplica o gate de permissao 'financeiro',
// renderiza o seletor de CONTA (NOVA/CASTRO/TODAS) compartilhado via useDreConta
// e a sub-navegacao horizontal com as 17 telas. Inspirado no header.ejs da fonte.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta } from '@/lib/dre-financeiro/format'

// Cor verde do grupo "financeiro" do portal.
const VERDE = '#10B981'

// As 17 telas do modulo (espelha as rotas/menu do header.ejs da fonte).
const NAV = [
  { href: '/dre-financeiro',                label: 'Home' },
  { href: '/dre-financeiro/dre',            label: 'DRE' },
  { href: '/dre-financeiro/analise-dre',    label: 'Analise DRE' },
  { href: '/dre-financeiro/fluxo',          label: 'Fluxo' },
  { href: '/dre-financeiro/patrimonio',     label: 'Patrimonio' },
  { href: '/dre-financeiro/ciclo-caixa',    label: 'Ciclo de Caixa' },
  { href: '/dre-financeiro/vencidos',       label: 'Vencidos' },
  { href: '/dre-financeiro/calendario',     label: 'Calendario' },
  { href: '/dre-financeiro/composicao',     label: 'Composicao' },
  { href: '/dre-financeiro/curva-saldo',    label: 'Curva de Saldo' },
  { href: '/dre-financeiro/lucratividade',  label: 'Lucratividade' },
  { href: '/dre-financeiro/rentabilidade',  label: 'Rentabilidade' },
  { href: '/dre-financeiro/margens',        label: 'Margens' },
  { href: '/dre-financeiro/vendas-modelo',  label: 'Vendas por Modelo' },
  { href: '/dre-financeiro/clientes',       label: 'Clientes' },
  { href: '/dre-financeiro/aderencia',      label: 'Aderencia' },
  { href: '/dre-financeiro/monitor',        label: 'Monitor' },
]

export default function DreFinanceiroLayout({ children }) {
  const { userProfile, loading } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta, setConta, contas } = useDreConta()
  const pathname = usePathname()

  // Enquanto carrega auth/permissoes.
  if (loading || loadingPerm) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <p style={{ color: '#a3a3a3', fontSize: '13px' }}>Carregando...</p>
      </div>
    )
  }

  // Gate de permissao do modulo 'financeiro'.
  if (userProfile && !temAcesso('financeiro')) {
    return <SemPermissao />
  }

  return (
    <div style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Barra do modulo: titulo + seletor de conta + sub-nav */}
      <div style={{
        background: '#fff', borderBottom: '1px solid #e2e8f0',
        position: 'sticky', top: 0, zIndex: 20,
        padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px'
      }}>
        {/* Linha 1: titulo + seletor de conta */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: VERDE, display: 'inline-block' }} />
            <span style={{ fontWeight: 700, fontSize: '16px', color: '#1e293b' }}>DRE Financeiro</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px', color: '#64748b' }}>Conta</span>
            <div style={{ display: 'inline-flex', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${VERDE}` }}>
              {contas.map((c, i) => {
                const ativo = conta === c.slug
                return (
                  <button
                    key={c.slug}
                    type="button"
                    onClick={() => setConta(c.slug)}
                    style={{
                      padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                      border: 'none', borderLeft: i === 0 ? 'none' : `1px solid ${VERDE}`,
                      background: ativo ? VERDE : '#fff',
                      color: ativo ? '#fff' : '#047857',
                      transition: '0.15s'
                    }}
                  >
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Linha 2: sub-navegacao das 17 telas */}
        <nav style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {NAV.map((item) => {
            const ativo = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: '5px 11px', borderRadius: '8px', fontSize: '13px', fontWeight: ativo ? 700 : 500,
                  textDecoration: 'none', transition: '0.15s',
                  background: ativo ? VERDE : '#ecfdf5',
                  color: ativo ? '#fff' : '#047857'
                }}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Conteudo da tela */}
      <div style={{ padding: '16px' }}>
        {children}
      </div>
    </div>
  )
}
