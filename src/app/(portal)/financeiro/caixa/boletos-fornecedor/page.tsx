'use client'
// Caixa › Boletos de fornecedor (saiu do Ajustes em 09/11/2026; /ajustes/boletos-fornecedor redireciona para cá).
// Permissão de sempre: ajustes:boletos-fornecedor, ou correção/baixa de contas só para ver (a tela checa por dentro).
import TelaContas from '@/components/financeiro/contas/TelaContas'
import BoletosFornecedor from '@/components/financeiro/contas/BoletosFornecedor'

export default function CaixaBoletosFornecedorPage() {
  return <TelaContas><BoletosFornecedor /></TelaContas>
}
