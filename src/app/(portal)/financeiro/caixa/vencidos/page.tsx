'use client'
// Vencidos do Caixa: mesma rota do DRE (/api/dre-financeiro/vencidos), interface NewPortal.
import CaixaTela from '@/components/financeiro/caixa/CaixaTela'
import VencidosCaixa from '@/components/financeiro/caixa/VencidosCaixa'

export default function CaixaVencidosPage() {
  return <CaixaTela aba="vencidos"><VencidosCaixa /></CaixaTela>
}
