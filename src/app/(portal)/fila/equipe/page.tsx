'use client'
// EQUIPE — aba da Central (melhorias 1.4): a carga de cada pessoa, só números, com filtro por setor.
// Ver components/trabalho/MinhaFila.tsx (aba "equipe") e EquipeLista.tsx.
export const dynamic = 'force-dynamic'

import MinhaFila from '@/components/trabalho/MinhaFila'

export default function EquipePage() {
  return <MinhaFila layout="foco" abaFixa="equipe" />
}
