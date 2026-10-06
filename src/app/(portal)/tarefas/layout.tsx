'use client'
// Tarefas faz parte da CENTRAL DE TRABALHO (Tarefas + Tickets + Cronograma).
import { Suspense } from 'react'
import CentralNav from '@/components/trabalho/CentralNav'

export default function TarefasLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}><CentralNav /></Suspense>
      {children}
    </>
  )
}
