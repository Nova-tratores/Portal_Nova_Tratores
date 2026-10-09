'use client'
// Peças S/Estoque — Concluídas (setor de peças, módulo 'opa-pecas'): tudo da
// peça, o código definitivo, o QR e a impressão das etiquetas.
import { useBase } from '@/components/opa/pecas/comum'
import Etapa from '@/components/opa/pecas/Etapa'
import { Moldura } from '@/components/opa/pecas/Moldura'
import SemPermissao from '@/components/SemPermissao'

export default function Pagina() {
  const base = useBase()
  return (
    <Moldura podeGerir={base.podeGerir}>
      {base.carregando ? null : base.podeGerir ? <Etapa etapa="concluida" base={base} /> : <SemPermissao />}
    </Moldura>
  )
}
