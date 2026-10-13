'use client'
// Patrimônio Loja — ficha de um item (id ou código PAT-000001).
import { use } from 'react'
import Ficha from '@/components/opa/patrimonio/Ficha'
import PaginaPatrimonio from '@/components/opa/patrimonio/Pagina'

export default function FichaPatrimonioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  return <PaginaPatrimonio>{(base) => <Ficha base={base} id={decodeURIComponent(id)} />}</PaginaPatrimonio>
}
