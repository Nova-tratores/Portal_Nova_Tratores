'use client'
// Só monta o painel depois da 1ª vez que ele abre e o mantém montado (a animação de fechar continua igual).
// Junto com next/dynamic, o código do painel nem é baixado enquanto ninguém abre (03/11/2026: memória do portal).
import { useState, type ReactNode } from 'react'

export default function MontaAoAbrir({ open, children }: { open: boolean; children: ReactNode }) {
  const [jaAbriu, setJaAbriu] = useState(open)
  if (open && !jaAbriu) setJaAbriu(true)
  return jaAbriu ? <>{children}</> : null
}
