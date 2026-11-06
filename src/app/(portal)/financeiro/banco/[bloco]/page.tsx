// Uma aba da área Banco: a tela está no layout; aqui só barra endereço errado.
import { notFound } from 'next/navigation'
import { BLOCOS_BANCO } from '@/lib/financeiro/modulosContas'

export default async function BancoBlocoPage({ params }: { params: Promise<{ bloco: string }> }) {
  const { bloco } = await params
  if (bloco !== 'contas-correntes' && !BLOCOS_BANCO.some((b) => b.slug === bloco)) notFound()
  return null
}
