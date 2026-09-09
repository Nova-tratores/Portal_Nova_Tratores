'use client'
// Vendas por Modelo dentro do DRE Financeiro. O corpo da tela vive em
// components/dre-financeiro/VendasModelo.js, compartilhado com /vendas-modelo
// (sistema proprio do grupo Comercial).
import VendasModelo from '@/components/dre-financeiro/VendasModelo'

export default function VendasModeloDrePage() {
  return <VendasModelo variante="dre" />
}
