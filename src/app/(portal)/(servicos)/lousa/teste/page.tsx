'use client'
// PÁGINA DE TESTE da Lousa no formato do quadro branco da oficina (José, 20/10/2026).
// Opção 1 = duas semanas como na parede · 2 = uma semana com cartões maiores · 3 = lousa de verdade.
// Dados reais (OS + Lousa); o arrastar só SIMULA — a Lousa de verdade (/lousa) não mudou.
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import QuadroLousa, { type VarianteQuadro } from '@/components/lousa/QuadroLousa'

const OPCOES: { n: number; v: VarianteQuadro; nome: string; resumo: string }[] = [
  { n: 1, v: 'parede', nome: 'Quadro da parede', resumo: 'Duas semanas lado a lado, como no quadro da oficina: técnicos nas linhas, segunda a sábado nas colunas, linha vermelha separando as semanas e a faixa vermelha com as pendentes embaixo.' },
  { n: 2, v: 'semana', nome: 'Uma semana grande', resumo: 'O mesmo quadro com uma semana só e cartões maiores, mostrando também o que o cliente pediu.' },
  { n: 3, v: 'lousa', nome: 'Lousa de verdade', resumo: 'O visual do quadro branco: moldura, linhas azuis de fita, faixa vermelha e letra de pincel.' },
]

export default function LousaTestePage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const [n, setN] = useState(1)
  if (!loading && userProfile && !temAcesso('lousa')) return <SemPermissao />
  const op = OPCOES[n - 1]
  return (
    <div style={{ padding: '14px 18px 40px', display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--portal-border)', overflowX: 'auto' }}>
        {OPCOES.map((o) => (
          <button key={o.n} onClick={() => setN(o.n)}
            style={{ padding: '9px 16px', border: 'none', borderRadius: '10px 10px 0 0', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap',
              background: n === o.n ? 'var(--portal-bg-card)' : 'transparent', color: n === o.n ? 'var(--portal-text)' : 'var(--portal-text-secondary)',
              boxShadow: n === o.n ? '0 -1px 0 var(--portal-border) inset, 1px 0 0 var(--portal-border), -1px 0 0 var(--portal-border)' : 'none' }}>
            Opção {o.n} · {o.nome}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', lineHeight: 1.5 }}>
        <b style={{ color: 'var(--portal-text)' }}>Opção {op.n} — {op.nome}.</b> {op.resumo}{' '}
        Arraste um cartão para outro dia ou técnico, ou para baixo da faixa vermelha, para ver o que mudaria na OS.
      </div>
      <QuadroLousa key={op.v} variante={op.v} />
    </div>
  )
}
