// Uma aba da área Contas do mês: a tela está no layout; aqui só barra endereço errado.
import { notFound } from 'next/navigation'
import { BLOCOS_CONTAS_MES } from '@/lib/financeiro/modulosContas'

export default async function ContasDoMesBlocoPage({ params }: { params: Promise<{ bloco: string }> }) {
  const { bloco } = await params
  if (!BLOCOS_CONTAS_MES.some((b) => b.slug === bloco)) notFound()
  return null
}
