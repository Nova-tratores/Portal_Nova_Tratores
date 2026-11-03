'use client'
// Contas recorrentes não lançadas no Omie (03/11/2026, opção 1). Responsável: Mariano (lib/financeiro/recorrentes.ts).
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import RecorrentesNovo from '@/components/financeiro/RecorrentesNovo'

export default function Recorrentes() {
  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg-secondary)' }}>
      <FinanceiroNav />
      <RecorrentesNovo />
    </div>
  )
}
