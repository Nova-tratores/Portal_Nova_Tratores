'use client'
// CENTRAL DE TRABALHO — qual bloco está aberto na tela agora.
// A página do bloco (/tickets/quadros/[id]) avisa; a barra (CentralNav) lê
// para o "Novo ticket" já sugerir esse bloco (com confirmação).
import { useSyncExternalStore } from 'react'

export interface BlocoAtual { id: string; nome: string; colunaId?: string | null }

let atual: BlocoAtual | null = null
const ouvintes = new Set<() => void>()

export function definirBlocoAtual(b: BlocoAtual | null) {
  if (atual?.id === b?.id && atual?.nome === b?.nome) return
  atual = b
  ouvintes.forEach((f) => f())
}

function assinar(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f) } }

export function useBlocoAtual(): BlocoAtual | null {
  return useSyncExternalStore(assinar, () => atual, () => null)
}
