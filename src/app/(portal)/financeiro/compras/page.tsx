'use client'
// Aba Compras do Financeiro novo (06/11/2026): ainda em montagem; mostra os blocos que vão entrar.
import EmMontagem, { type Bloco } from '@/components/financeiro/EmMontagem'

const BLOCOS: Bloco[] = [
  { codigo: 'C1', nome: 'Mercadoria para revenda', detalhe: 'peças e produtos para vender' },
  { codigo: 'C2', nome: 'Tratores Mahindra', detalhe: 'parcelas dos tratores do estoque' },
  { codigo: 'C3', nome: 'Uso e consumo', detalhe: 'o que a empresa gasta no dia a dia' },
  { codigo: 'C4', nome: 'Frete', detalhe: 'transporte de compras e de máquinas' },
  { codigo: 'C5', nome: 'Serviço de terceiros', detalhe: 'serviços contratados de fora' },
  { codigo: 'C6', nome: 'Devolução ao cliente', detalhe: 'dinheiro devolvido em vendas desfeitas' },
]

export default function FinanceiroComprasPage() {
  return <EmMontagem titulo="Compras" resumo="Tudo o que a empresa compra, do pedido ao pagamento, com o boleto junto." blocos={BLOCOS} />
}
