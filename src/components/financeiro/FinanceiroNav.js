'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useIsMobile } from '@/hooks/useIsMobile'
import FinanceiroTopoNovo from './FinanceiroTopoNovo'
import {
  Columns3, BarChart3, Receipt, Users,
  FileText, DollarSign, AlertTriangle, Search, Wallet, FileSignature
} from 'lucide-react'

const ICONS = {
  kanban: Columns3,
  dashboard: BarChart3,
  pagar: Receipt,
  receber: DollarSign,
  rh: Users,
  vencidos: AlertTriangle,
  rastreio: Search,
  notas: FileText,
  caixa: Wallet,
  recibos: FileSignature,
}

// Aba Painel fora da faixa para todo mundo (José, 05/11/2026): as páginas home-* seguem no ar,
// abertas pelos links de card (sino, e-mail, requisições: ?id=); /financeiro entra pelo Kanban
const LINKS_FINANCEIRO = [
  // Kanban vira Recebimentos (José, 06/11/2026): acompanha cada venda faturada da nota até o dinheiro entrar
  { label: 'Recebimentos', href: '/financeiro/kanban-financeiro', icon: 'kanban' },
  { label: 'Despesas', href: '/financeiro/historico-pagar', icon: 'pagar' },
  { label: 'Rastreio', href: '/financeiro/rastreio', icon: 'rastreio' },
  // Vencidos fora da faixa do Financeiro (José, 04/11/2026): o Caixa › Vencidos mostra tudo que o Omie diz
  // estar atrasado; Pós-Vendas e Peças seguem com a aba (cobrança dos cards deles). A tela segue no endereço.
  { label: 'Relatorio', href: '/financeiro/relatorio-pagar', icon: 'dashboard' },
  // Caixa (Calendário, Vencidos, Curva de Saldo, Fluxo do DRE em outra interface; substituiu a Agenda em 04/11/2026):
  // só Dev e Financeiro (as rotas do DRE também barram)
  { label: 'Caixa', href: '/financeiro/caixa/calendario', icon: 'caixa', soDevFinanceiro: true, prefixo: '/financeiro/caixa' },
]

const LINKS_POSVENDAS = [
  { label: 'Recebimentos', href: '/financeiro/kanban', icon: 'kanban' },
  { label: 'Despesas', href: '/financeiro/historico-pagar', icon: 'pagar' },
  { label: 'Vencidos', href: '/financeiro/vencidos', icon: 'vencidos' },
]

const LINKS_PECAS = [
  { label: 'Recebimentos', href: '/financeiro/kanban-pecas', icon: 'kanban' },
  { label: 'Despesas', href: '/financeiro/historico-pagar', icon: 'pagar' },
  { label: 'Vencidos', href: '/financeiro/vencidos', icon: 'vencidos' },
]

const LINK_NOTAS = { label: 'Notas fiscais', href: '/financeiro/notas', icon: 'notas' }
// Recibos de pagamento (03/11/2026): todas as funções do Financeiro (o balcão de peças também emite)
const LINK_RECIBOS = { label: 'Recibos', href: '/financeiro/recibos', icon: 'recibos' }
// `children` é um slot opcional à direita das guias. O default explícito é o
// que permite chamar <FinanceiroNav /> de uma tela .tsx sem o TS exigir a prop
// (este arquivo é .js, então o tipo é inferido da assinatura).
export default function FinanceiroNav({ children = null }) {
  const pathname = usePathname()
  const { userProfile } = useAuth()
  const [vencidosCount, setVencidosCount] = useState(0)
  const isMobile = useIsMobile()

  const { pode, isDev } = usePermissoes(userProfile?.id)

  const funcao = userProfile?.funcao
  const linksFuncao = funcao === 'Financeiro' ? LINKS_FINANCEIRO
    : funcao === 'Peças' ? LINKS_PECAS
    : LINKS_POSVENDAS
  // Notas fiscais (cache PDF + XML) vale pela PERMISSÃO, não pela função
  const comNotas = [...(pode('financeiro', 'notas') ? [...linksFuncao, LINK_NOTAS] : linksFuncao), LINK_RECIBOS]
  // Caixa (grupo Financeiro): só Dev ou função Financeiro; Dev de outra função também vê a aba
  const podeCaixa = isDev || funcao === 'Financeiro'
  const linkCaixa = LINKS_FINANCEIRO.find(l => l.soDevFinanceiro)
  // Caixa logo depois do Kanban; aba Despesas fora da faixa (José, 30/10/2026), a tela segue no endereço dela
  const semCaixa = comNotas.filter(l => !l.soDevFinanceiro && l.icon !== 'pagar')
  const posKanban = semCaixa.findIndex(l => l.icon === 'kanban') + 1
  const comCaixa = podeCaixa ? [...semCaixa.slice(0, posKanban), linkCaixa, ...semCaixa.slice(posKanban)] : semCaixa
  // Quem tem o Caixa (Dev incluso) não vê a aba Vencidos: está no Caixa › Vencidos (José, 05/11/2026).
  // Vencidos sempre por último
  const semVencidosDup = podeCaixa ? comCaixa.filter(l => l.icon !== 'vencidos') : comCaixa
  const links = [...semVencidosDup.filter(l => l.icon !== 'vencidos'), ...semVencidosDup.filter(l => l.icon === 'vencidos')]

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

  // Topo novo (José, 06/11/2026): empresa pela logo + abas do Financeiro novo, para quem tem o Caixa
  if (podeCaixa) return <FinanceiroTopoNovo comNotas={pode('financeiro', 'notas')}>{children}</FinanceiroTopoNovo>

  return (
    <div className="fin-band-verde" style={{
      position: 'sticky', top: '84px', zIndex: 30,
      background: 'linear-gradient(135deg, #D8F0B2, #A9D47D)',
      boxShadow: '0 1px 4px var(--portal-shadow)',
      padding: isMobile ? '0 12px' : '0 24px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'flex-end',
        // Celular: as guias ocupam a linha toda (rolam por dentro) e os botões
        // do slot sobem pra uma linha própria acima delas, quebrando se precisar.
        height: isMobile ? 'auto' : '56px', minHeight: isMobile ? '48px' : undefined,
        flexWrap: isMobile ? 'wrap' : 'nowrap', gap: isMobile ? '6px' : '8px',
      }}>
        {/* Nav — guias estilo Chrome, ancoradas na base da faixa verde.
            className fin-tabs-nav: exceção à regra ".portal-dark nav" que
            pintava um card escuro POR CIMA da faixa verde no modo escuro. */}
        <nav className="fin-tabs-nav" style={{
          display: 'flex', alignItems: 'flex-end', gap: '3px',
          flex: isMobile ? '1 1 100%' : 1, overflowX: 'auto', minWidth: 0, WebkitOverflowScrolling: 'touch',
          paddingTop: isMobile ? '6px' : undefined,
        }}>
          {links.map(link => {
            const isActive = pathname === link.href || (!!link.prefixo && pathname?.startsWith(link.prefixo))
            const Icon = ICONS[link.icon]
            const isVencidosTab = link.icon === 'vencidos'
            const hasVencidos = isVencidosTab && vencidosCount > 0

            return (
              <Link key={link.href} href={link.href} style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: isMobile ? '10px 12px' : '11px 20px', borderRadius: '11px 11px 0 0',
                fontSize: isMobile ? '13px' : '15px', flexShrink: 0, fontWeight: isActive ? '600' : '500',
                // Guias: fechadas com letra PRETA; a ATIVA é BRANCA com letra preta,
                // "colada" no conteúdo como nas outras faixas (José, 15/10/2026 — antes preta)
                // #fefefe/#111111: o modo escuro não remapeia essas duas
                color: '#111111',
                background: isActive ? '#fefefe' : 'rgba(255,255,255,0.45)',
                boxShadow: isActive ? '0 -2px 6px rgba(0,0,0,0.15)' : 'none',
                textDecoration: 'none', transition: 'all 0.15s',
                whiteSpace: 'nowrap',
                position: 'relative',
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
          <div style={isMobile
            ? { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', width: '100%', minWidth: 0, order: -1, paddingTop: '8px' }
            : { display: 'flex', alignItems: 'center', alignSelf: 'center', gap: '8px', flexShrink: 0 }}>
            {children}
          </div>
        )}
      </div>

    </div>
  )
}
