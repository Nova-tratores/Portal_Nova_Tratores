'use client'
// POPs — ler procedimento publicado é de todo usuário logado (o menu mostra para todos).
// Quem cria/edita/aprova é decidido por área nas rotas /api/pops/*.
import { Suspense } from 'react'
import PopsNav from '@/components/pops/PopsNav'

export default function PopsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', background: 'var(--portal-bg)' }}>
      <Suspense fallback={null}><PopsNav /></Suspense>
      {children}
    </div>
  )
}
