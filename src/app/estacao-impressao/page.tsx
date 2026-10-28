import type { Metadata } from 'next'
import EstacaoImpressao from '@/components/etiquetas/EstacaoImpressao'

// Fora do (portal): sem cabeçalho, menu, avisos nem Tratorilson — é a página que
// fica aberta o tempo todo no Chrome do PC da térmica. O login é o do portal.
export const metadata: Metadata = { title: 'Estação de impressão · ROGERIA', robots: { index: false, follow: false } }

export default function Page() {
  return <EstacaoImpressao />
}
