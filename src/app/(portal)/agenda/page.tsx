'use client'
// AGENDA COLETIVA (estilo Google Agenda) — todos os usuários por setor + reuniões, sala,
// prazos de tickets e a agenda dos técnicos (OS do POS + Lousa). Ver components/agenda.
export const dynamic = 'force-dynamic'

import CalendarioGoogle from '@/components/agenda/CalendarioGoogle'

export default function AgendaPage() {
  return <CalendarioGoogle modo="coletiva" />
}
