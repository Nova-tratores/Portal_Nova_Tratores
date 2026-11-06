// A Agenda de pagamentos (29/10/2026) virou o Caixa › Calendário (José, 04/11/2026): o endereço antigo leva para lá.
import { redirect } from 'next/navigation'

export default function AgendaPage() {
  redirect('/financeiro/caixa/calendario')
}
