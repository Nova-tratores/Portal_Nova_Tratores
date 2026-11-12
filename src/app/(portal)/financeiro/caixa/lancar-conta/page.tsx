'use client'
// Caixa › Lançar conta (12/11/2026): cria a conta a pagar e lança no Omie na mesma hora; também lança os
// rascunhos que vieram das Requisições. Permissão: financeiro:lancar-conta (explícita, como as outras abas).
import TelaContas from '@/components/financeiro/contas/TelaContas'
import LancarConta from '@/components/financeiro/lancar/LancarConta'

export default function CaixaLancarContaPage() {
  return <TelaContas><LancarConta /></TelaContas>
}
