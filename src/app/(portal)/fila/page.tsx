'use client'
// MINHA FILA — objetivo do dia e da semana, pedidos para aceitar e a carga da equipe.
// Ver components/trabalho/MinhaFila.tsx.
export const dynamic = 'force-dynamic'

import MinhaFila from '@/components/trabalho/MinhaFila'

// Desenho escolhido pelo José na página de teste em 24/11/2026: Opção 2 · Foco.
export default function FilaPage() {
  return <MinhaFila layout="foco" />
}
