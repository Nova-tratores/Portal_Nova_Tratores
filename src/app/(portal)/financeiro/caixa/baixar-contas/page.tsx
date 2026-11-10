'use client'
// Caixa › Baixar contas (saiu do Ajustes em 09/11/2026; /ajustes/baixa-contas redireciona para cá).
// Permissão de sempre: ajustes:baixa-contas (a tela checa por dentro).
import TelaContas from '@/components/financeiro/contas/TelaContas'
import BaixaContas from '@/components/financeiro/contas/BaixaContas'

export default function CaixaBaixarContasPage() {
  return <TelaContas><BaixaContas /></TelaContas>
}
