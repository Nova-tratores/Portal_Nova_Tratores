'use client'
// MINHA FILA (/central) — a tela aprovada pelo José em 27/11/2026 ("eu quero igual ao protótipo"):
// fazendo agora + fila (lista ou kanban), cor do mês, números do mês, Faxina em janela, "+ Novo".
// Ver components/trabalho/FilaPrototipo.tsx. (A tela antiga, MinhaFila, segue servindo Esperando e Equipe.)
export const dynamic = 'force-dynamic'

import FilaPrototipo from '@/components/trabalho/FilaPrototipo'

export default function FilaPage() {
  return <FilaPrototipo />
}
