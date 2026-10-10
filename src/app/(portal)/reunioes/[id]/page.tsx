'use client'
export const dynamic = 'force-dynamic'
import { use } from 'react'
import ReuniaoDetalhe from '@/components/reunioes/ReuniaoDetalhe'

export default function ReuniaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <ReuniaoDetalhe id={id} />
}
