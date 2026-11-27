'use client'
// ESPERANDO OUTROS — aba da Central (José, 26/11/2026): o que eu pedi para outras pessoas.
// Saiu da coluna da Minha fila. Pedido sem aceite há mais de 1 dia pulsa.
// Ver components/trabalho/MinhaFila.tsx (aba "esperando").
export const dynamic = 'force-dynamic'

import MinhaFila from '@/components/trabalho/MinhaFila'

export default function EsperandoPage() {
  return <MinhaFila layout="foco" abaFixa="esperando" />
}
