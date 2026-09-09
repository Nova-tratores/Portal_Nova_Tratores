'use client'
// Vendas por Modelo como sistema proprio do grupo Comercial (modulo
// 'vendas-modelo' no Admin). E a MESMA tela de /dre-financeiro/vendas-modelo:
// o componente compartilhado, na variante 'comercial', aplica o gate do modulo
// (aceitando tambem quem tem o DRE) e desenha a sua propria faixa com o
// seletor de conta NOVA/CASTRO/TODAS, ja que fora do layout do DRE nao ha um.
import VendasModelo from '@/components/dre-financeiro/VendasModelo'

export default function VendasModeloComercialPage() {
  return <VendasModelo variante="comercial" />
}
