'use client'
import { STATUS_INFO, type TicketStatus } from '@/lib/tickets/constantes'

export default function StatusBadge({ status, tamanho = 12 }: { status: TicketStatus; tamanho?: number }) {
  const info = STATUS_INFO[status] || STATUS_INFO.aberto
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '3px 10px', borderRadius: 999, fontSize: tamanho, fontWeight: 700,
      color: info.cor, background: info.fundo, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: info.cor }} />
      {info.label}
    </span>
  )
}
