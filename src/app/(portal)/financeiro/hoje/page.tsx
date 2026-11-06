'use client'
// Aba Hoje do Financeiro novo (06/11/2026): o que vence hoje, o que está vencido e o que entrou e saiu hoje.
import CaixaTela from '@/components/financeiro/caixa/CaixaTela'
import HojeCaixa from '@/components/financeiro/caixa/HojeCaixa'

export default function FinanceiroHojePage() {
  return <CaixaTela aba="hoje"><HojeCaixa /></CaixaTela>
}
