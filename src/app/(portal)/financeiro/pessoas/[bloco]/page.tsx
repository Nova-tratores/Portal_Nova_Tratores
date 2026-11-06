// Uma aba do módulo Pessoas: a tela está no layout (PessoasCaixa lê o bloco do endereço); aqui só barra endereço errado.
import { notFound } from 'next/navigation'
import { BLOCOS_PESSOAS } from '@/lib/financeiro/pessoas'

export default async function PessoasBlocoPage({ params }: { params: Promise<{ bloco: string }> }) {
  const { bloco } = await params
  if (!BLOCOS_PESSOAS.some((b) => b.slug === bloco)) notFound()
  return null
}
