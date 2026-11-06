// Aba Caixa: abre no Calendário (o lugar da antiga Agenda).
import { redirect } from 'next/navigation'

export default function CaixaPage() {
  redirect('/financeiro/caixa/calendario')
}
