'use client'
// Calendário do Caixa: mesmas rotas do Calendário do DRE, interface NewPortal (no lugar da antiga Agenda).
import CaixaTela from '@/components/financeiro/caixa/CaixaTela'
import CalendarioCaixa from '@/components/financeiro/caixa/CalendarioCaixa'

export default function CaixaCalendarioPage() {
  return <CaixaTela aba="calendario"><CalendarioCaixa /></CaixaTela>
}
