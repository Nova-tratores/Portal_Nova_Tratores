'use client'
// Página do ticket (links de notificação, "Abrir em página"). O conteúdo é o
// mesmo da janela que abre ao clicar no cartão: components/tickets/TicketDetalhe.
export const dynamic = 'force-dynamic'

import { use } from 'react'
import TicketDetalhe from '@/components/tickets/TicketDetalhe'

export default function TicketDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <TicketDetalhe id={id} />
}
