// Uma aba da área Compras: a tela está no layout; aqui só barra endereço errado.
import { notFound } from 'next/navigation'
import { BLOCOS_COMPRAS } from '@/lib/financeiro/modulosContas'

export default async function ComprasBlocoPage({ params }: { params: Promise<{ bloco: string }> }) {
  const { bloco } = await params
  if (!BLOCOS_COMPRAS.some((b) => b.slug === bloco)) notFound()
  return null
}
