'use client'
// AGENDA DE PAGAMENTOS: bolinhas dos dias da semana; o dia escolhido mostra o que entra e o que sai no Omie.
// Pedido do José (29/10/2026). Só Dev e Financeiro (a rota GET /api/financeiro/agenda também barra).
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import AgendaOpcoes from '@/components/financeiro/AgendaOpcoes'

export default function AgendaPage() {
  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg-secondary)' }}>
      <FinanceiroNav />
      <AgendaOpcoes opcao={6} />
    </div>
  )
}
