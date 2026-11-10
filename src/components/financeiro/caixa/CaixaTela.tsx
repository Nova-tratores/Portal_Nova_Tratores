'use client'
// Telas do antigo Caixa do Financeiro (José, 04/11/2026): Calendário, Vencidos e Baixar contas, com as rotas
// /api/dre-financeiro/* (a conta fica só lá); aqui muda só o visual, no estilo NewPortal.
// 06/11/2026: viraram abas da área Caixa do topo novo (FinanceiroTopoNovo + areasFinanceiro), então
// as abas de dentro saíram. 10/11/2026: cada aba vale pela SUA chave no Admin (financeiro:<aba>, areasFinanceiro
// permDaAba; explícitas — o módulo Financeiro inteiro não dá). Antes: só Dev e função Financeiro.
import type { ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { usePathname } from 'next/navigation'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import { abaDoEndereco, podeAba, temAlgumaAba } from '@/components/financeiro/areasFinanceiro'

export type AbaCaixa = 'hoje' | 'compras' | 'pessoas' | 'contas-do-mes' | 'banco' | 'calendario' | 'vencidos' | 'baixar-contas'

export default function CaixaTela({ children }: { aba: AbaCaixa; children: ReactNode }) {
  const { userProfile, loading: carregandoAuth } = useAuth()
  const { pode: podeAcao, loading: carregandoPerm } = usePermissoes(userProfile?.id)
  const pathname = usePathname() || ''
  // a aba aberta (/financeiro/pessoas/folha → financeiro:pessoas-folha); fora de uma aba (ex.: /financeiro/caixa,
  // que redireciona), basta ter alguma aba
  const aba = abaDoEndereco(pathname)
  const pode = aba ? podeAba(aba, podeAcao) : temAlgumaAba(podeAcao)

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg-secondary)' }}>
      <FinanceiroNav />
      <style>{ESTILO_CAIXA_TELA}</style>
      <div style={{ padding: 'clamp(12px, 2vw, 28px)', display: 'flex', flexDirection: 'column', gap: 12, color: 'var(--portal-text, #0f172a)' }}>
        {carregandoAuth || carregandoPerm ? <div style={{ padding: 40, textAlign: 'center' }}>Carregando…</div>
          : !pode ? <div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a esta tela do Financeiro. Peça a liberação no Admin (módulo Financeiro{aba ? ` › ${aba.nome}` : ''}).</div>
            : children}
      </div>
    </div>
  )
}

const ESTILO_CAIXA_TELA = `
a[href="/ajustes"] { display: none } /* o "← Ajustes" do Baixar contas: aqui a volta é pela faixa do Financeiro */
`
