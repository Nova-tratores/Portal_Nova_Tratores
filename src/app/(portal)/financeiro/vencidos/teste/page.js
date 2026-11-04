'use client'
// Página de TESTE da Vencidos nova (29/10/2026) — o José compara com /financeiro/vencidos antes de trocar.
import Link from 'next/link'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import VencidosNovo from '@/components/financeiro/VencidosNovo'

export default function VencidosTeste() {
  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg-secondary)' }}>
      <FinanceiroNav />
      <div style={{ margin: '14px 24px 0', padding: '10px 14px', borderRadius: 12, fontSize: 13, color: '#1e40af',
        background: 'color-mix(in srgb, #2563eb 8%, var(--surface, #fefefe))', border: '1px solid color-mix(in srgb, #2563eb 20%, transparent)' }}>
        Versão nova em teste. A atual continua em <Link href="/financeiro/vencidos" style={{ color: '#2563eb' }}>Vencidos</Link> até você escolher.
      </div>
      <VencidosNovo />
    </div>
  )
}
