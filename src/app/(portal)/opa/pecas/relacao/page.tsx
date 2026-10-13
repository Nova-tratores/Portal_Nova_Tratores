'use client'
// Peças S/Estoque — Relação com o cadastro (módulo 'opa-pecas'): o "Código já
// existente" de cada peça bate com algum produto cadastrado? Exporta CSV/PDF.
import { useBase } from '@/components/opa/pecas/comum'
import { Moldura } from '@/components/opa/pecas/Moldura'
import Relacao from '@/components/opa/pecas/Relacao'
import SemPermissao from '@/components/SemPermissao'

export default function Pagina() {
  const base = useBase()
  return (
    <Moldura podeGerir={base.podeGerir}>
      {base.carregando ? null : base.podeGerir ? <Relacao base={base} /> : <SemPermissao />}
    </Moldura>
  )
}
