'use client'
// Caixa › Correção de contas (saiu do Ajustes em 09/11/2026; /ajustes/correcao-contas redireciona para cá).
// Permissão de sempre: ajustes:correcao-contas (a tela checa por dentro).
import TelaContas from '@/components/financeiro/contas/TelaContas'
import CorrecaoContas from '@/components/financeiro/contas/CorrecaoContas'

export default function CaixaCorrecaoContasPage() {
  return <TelaContas><CorrecaoContas /></TelaContas>
}
