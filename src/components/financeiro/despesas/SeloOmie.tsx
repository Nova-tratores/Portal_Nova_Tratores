'use client'
// Selo da situação no Omie.
//
// Discreto quando está tudo certo, visível quando não está: "No Omie" é um
// tique pequeno, "Fora do Omie" é âmbar neutro (é acervo antigo, não erro) e
// só "Falha no envio" é vermelho — o único estado que pede ação. Se os três
// gritassem, a lista viraria semáforo e ninguém acharia o que importa.

import { AlertTriangle, Check, Minus } from 'lucide-react'
import { ROTULO_OMIE } from '@/lib/financeiro/despesas/omie'
import type { SituacaoOmie } from '@/lib/financeiro/despesas/tipos'

const ESTILO: Record<SituacaoOmie, { fg: string; bg: string; borda: string }> = {
  enviado: { fg: '#15803d', bg: 'rgba(22,163,74,.10)', borda: 'rgba(22,163,74,.28)' },
  erro: { fg: '#b91c1c', bg: 'rgba(220,38,38,.12)', borda: 'rgba(220,38,38,.35)' },
  fora: { fg: '#b45309', bg: 'rgba(217,119,6,.10)', borda: 'rgba(217,119,6,.26)' },
}

const ICONE: Record<SituacaoOmie, typeof Check> = {
  enviado: Check,
  erro: AlertTriangle,
  fora: Minus,
}

export default function SeloOmie({ situacao, codigo, compacto = false }: {
  situacao: SituacaoOmie
  codigo?: string | null
  compacto?: boolean
}) {
  const e = ESTILO[situacao]
  const Icone = ICONE[situacao]
  const titulo = situacao === 'enviado' && codigo
    ? `Lançado no Omie · nº ${codigo}`
    : situacao === 'fora'
      ? 'Ainda não foi lançada no Omie'
      : ROTULO_OMIE[situacao]

  return (
    <span
      title={titulo}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        fontSize: 10.5, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap',
        padding: compacto ? '3px 6px' : '4px 8px', borderRadius: 20,
        color: e.fg, background: e.bg, border: `1px solid ${e.borda}`,
      }}
    >
      <Icone size={11} strokeWidth={3} />
      {!compacto && ROTULO_OMIE[situacao]}
    </span>
  )
}
