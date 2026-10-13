'use client'
// Patrimônio Loja (aba do Opa): o que a loja tem — lista com busca e filtros.
import Lista from '@/components/opa/patrimonio/Lista'
import PaginaPatrimonio from '@/components/opa/patrimonio/Pagina'

export default function PatrimonioPage() {
  return <PaginaPatrimonio>{(base) => <Lista base={base} />}</PaginaPatrimonio>
}
