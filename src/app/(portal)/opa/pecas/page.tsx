'use client'
// Peças Não Identificadas — visão do portal (aba do Opa). Substitui a planilha.
import { useBase } from '@/components/opa/pecas/comum'
import { Moldura } from '@/components/opa/pecas/Moldura'
import VisaoGeral from '@/components/opa/pecas/VisaoGeral'

export default function PecasNaoIdentificadasPage() {
  const base = useBase()
  return (
    <Moldura podeGerir={base.podeGerir}>
      <VisaoGeral base={base} />
    </Moldura>
  )
}
