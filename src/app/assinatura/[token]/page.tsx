// PÚBLICO: a pessoa da equipe grava a assinatura dela pelo celular (link do WhatsApp gerado na Administração).
// Fora de (portal): sem login. Diferente de /assinar (assinatura do CLIENTE na OS).
import type { Metadata } from 'next'
import AssinaturaPeloLink from '@/components/assinatura/AssinaturaPeloLink'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Sua assinatura — Nova Tratores', robots: { index: false, follow: false } }

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <AssinaturaPeloLink token={token} />
}
