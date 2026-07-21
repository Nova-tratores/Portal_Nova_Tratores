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
import AjudaTela from '@/components/dre-financeiro/AjudaTela'
import { useDreConta } from '@/lib/dre-financeiro/format'
import { AJUDA } from '@/lib/dre-financeiro/ajuda'

// Cor verde do grupo "financeiro" do portal (usada no titulo + seletor de conta).
const VERDE = '#10B981'

// Paleta por cor -> { bg (claro), fg (texto), on (solido, estado ativo) }.
// Equivalentes hex das classes bg-<cor>-100/text-<cor>-800 do header.ejs da fonte.
const CORES = {
  sky:     { bg: '#e0f2fe', fg: '#075985', on: '#0284c7' },
  orange:  { bg: '#ffedd5', fg: '#9a3412', on: '#ea580c' },
  red:     { bg: '#fee2e2', fg: '#991b1b', on: '#dc2626' },
  violet:  { bg: '#ede9fe', fg: '#5b21b6', on: '#7c3aed' },
  cyan:    { bg: '#cffafe', fg: '#155e75', on: '#0891b2' },
  lime:    { bg: '#ecfccb', fg: '#3f6212', on: '#65a30d' },
  amber:   { bg: '#fef3c7', fg: '#92400e', on: '#d97706' },
  indigo:  { bg: '#e0e7ff', fg: '#3730a3', on: '#4f46e5' },
  fuchsia: { bg: '#fae8ff', fg: '#86198f', on: '#c026d3' },
  blue:    { bg: '#dbeafe', fg: '#1e40af', on: '#2563eb' },
  emerald: { bg: '#d1fae5', fg: '#065f46', on: '#059669' },
  pink:    { bg: '#fce7f3', fg: '#9d174d', on: '#db2777' },
  green:   { bg: '#dcfce7', fg: '#166534', on: '#16a34a' },
  slate:   { bg: '#f1f5f9', fg: '#334155', on: '#475569' },
  teal:    { bg: '#ccfbf1', fg: '#115e59', on: '#0d9488' },
  rose:    { bg: '#ffe4e6', fg: '#9f1239', on: '#e11d48' },
}

// As telas do modulo agrupadas por categoria (espelha o header.ejs da fonte).
// label do grupo = null => sem cabecalho/sem separador (Home).
const GRUPOS = [
  { label: null, itens: [
    { href: '/dre-financeiro',               label: 'Home',            icon: '🏠', cor: 'sky' },
  ]},
  { label: 'Caixa & Venc.', itens: [
    { href: '/dre-financeiro/calendario',    label: 'Calendário',      icon: '📅', cor: 'orange' },
    { href: '/dre-financeiro/vencidos',      label: 'Vencidos',        icon: '⚠️', cor: 'red' },
    { href: '/dre-financeiro/curva-saldo',   label: 'Curva de Saldo',  icon: '📉', cor: 'violet' },
    { href: '/dre-financeiro/fluxo',         label: 'Fluxo',           icon: '🌊', cor: 'cyan' },
    // Movimentações CC fica FORA da sub-nav de propósito: acesso só pelo link
    // direto /dre-financeiro/movimentos (gate de permissão continua no layout).
  ]},
  { label: 'Prazos & Efic.', itens: [
    { href: '/dre-financeiro/ciclo-caixa',   label: 'Ciclo de Caixa',  icon: '🔄', cor: 'lime' },
    { href: '/dre-financeiro/aderencia',     label: 'Pontualidade',    icon: '⏱️', cor: 'amber' },
  ]},
  { label: 'Resultado', itens: [
    { href: '/dre-financeiro/dre',           label: 'DRE',             icon: '📋', cor: 'indigo' },
    { href: '/dre-financeiro/analise-dre',   label: 'Análise DRE',     icon: '🔬', cor: 'fuchsia' },
    { href: '/dre-financeiro/composicao',    label: 'Composição',      icon: '🧩', cor: 'blue' },
  ]},
  { label: 'Patrimônio', itens: [
    { href: '/dre-financeiro/patrimonio',    label: 'Patrimônio',      icon: '💰', cor: 'emerald' },
    { href: '/dre-financeiro/rentabilidade', label: 'Rentabilidade',   icon: '📊', cor: 'pink' },
    { href: '/dre-financeiro/lucratividade', label: 'Lucratividade',   icon: '📈', cor: 'green' },
    { href: '/dre-financeiro/margens',       label: 'Margens',         icon: '🧮', cor: 'slate' },
    { href: '/visual-estoque/patio',         label: 'Estoque Pátio ↗', icon: '🏗️', cor: 'emerald' },
  ]},
  { label: 'Comercial', itens: [
    { href: '/dre-financeiro/vendas-modelo', label: 'Vendas/Modelo',   icon: '🏷️', cor: 'teal' },
    { href: '/dre-financeiro/clientes',      label: 'Clientes',        icon: '👥', cor: 'rose' },
  ]},
  { label: 'Qualidade', itens: [
    { href: '/dre-financeiro/monitor',       label: 'Monitor',         icon: '🛡️', cor: 'red' },
  ]},
]

export default function DreFinanceiroLayout({ children }) {
  const { userProfile, loading } = useAuth()
  const { temAcesso, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta, setConta, contas } = useDreConta()
  const pathname = usePathname()

  // Pode ver uma TELA do DRE? Quem tem 'financeiro' (ou admin) vê todas;
  // senão, vê só as telas liberadas via 'dre:<slug>' ('dre' puro = todas).
  // Home e links externos (Estoque Pátio ↗) são sempre visíveis.
  const podeVerTela = (href) => {
    if (href === '/dre-financeiro') return true
    if (!href.startsWith('/dre-financeiro/')) return true
    const slug = href.slice('/dre-financeiro/'.length)
    return temAcesso('financeiro') || pode('dre', slug)
  }

  // Enquanto carrega auth/permissoes.
  if (loading || loadingPerm) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <p style={{ color: '#a3a3a3', fontSize: '13px' }}>Carregando...</p>
      </div>
    )
  }

  // Gate de acesso ao módulo: precisa de 'financeiro' OU de alguma tela do 'dre'.
  if (userProfile && !temAcesso('financeiro') && !temAcesso('dre')) {
    return <SemPermissao />
  }

  // Gate por TELA (cobre acesso direto por URL — inclusive telas sem gate
  // próprio, como 'clientes'). Home (/dre-financeiro) é sempre liberada.
  if (userProfile && !podeVerTela(pathname)) {
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
            {/* "?" com a explicacao da ABA ATUAL (texto em lib/dre-financeiro/ajuda.js) */}
            <AjudaTela pathname={pathname} />
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

        {/* Linha 2: sub-navegacao agrupada por categoria (espelha o header.ejs da fonte) */}
        <nav style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {GRUPOS.map((grupo, gi) => {
            // Esconde itens sem permissão; se o grupo ficar vazio, some inteiro.
            const itens = grupo.itens.filter((item) => podeVerTela(item.href))
            if (itens.length === 0) return null
            return (
            <div
              key={grupo.label || `g${gi}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
                borderLeft: grupo.label ? '1px solid #e2e8f0' : 'none',
                paddingLeft: grupo.label ? '8px' : 0,
              }}
            >
              {grupo.label && (
                <span style={{
                  fontSize: '10px', fontWeight: 700, color: '#94a3b8',
                  textTransform: 'uppercase', letterSpacing: '.5px',
                }}>
                  {grupo.label}
                </span>
              )}
              {itens.map((item) => {
                const ativo = pathname === item.href
                const c = CORES[item.cor]
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={AJUDA[item.href]?.resumo}
                    style={{
                      padding: '5px 11px', borderRadius: '8px', fontSize: '13px',
                      fontWeight: ativo ? 700 : 500, textDecoration: 'none', transition: '0.15s',
                      whiteSpace: 'nowrap',
                      background: ativo ? c.on : c.bg,
                      color: ativo ? '#fff' : c.fg,
                    }}
                  >
                    {item.icon} {item.label}
                  </Link>
                )
              })}
            </div>
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
