'use client'
// Janela Mecânicos = Centro do Pós-Vendas (José, 16/10/2026): Painel dos técnicos, Faturamento
// ao vivo, Ocorrências e Tratorilson. A tela antiga (ranking, cards dos técnicos, alertas e
// vínculo de veículo) foi removida a pedido do José — está no histórico do git se precisar.
// A aba fica na URL (?aba=painel|mecanicos|podio) — cada uma tem o seu endereço (José, 20/10/2026).
import { Suspense } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import CentroPosVendas, { type AbaCPV } from '@/components/mecanicos/CentroPosVendas'
import { useUrlMec } from '@/components/mecanicos/useUrlMec'

const DA_URL: Record<string, AbaCPV> = { painel: 'painel', mecanicos: 'ocorrencias', ocorrencias: 'ocorrencias', podio: 'podio' }
const PARA_URL: Record<AbaCPV, string> = { painel: 'painel', ocorrencias: 'mecanicos', podio: 'podio' }

function Tela() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const { pegar, mudar } = useUrlMec()
  const aba = DA_URL[pegar('aba') || ''] || 'painel'
  if (!loading && userProfile && !temAcesso('mecanicos')) return <SemPermissao />
  // trocar de aba fecha a ficha e as janelas abertas (cada endereço mostra uma coisa só)
  return <CentroPosVendas aba={aba} onAba={(a) => mudar({ aba: PARA_URL[a], tecnico: null, secao: null, mes: null, janela: a === 'ocorrencias' ? pegar('janela') : null })} />
}

export default function MecanicosPage() {
  return <Suspense fallback={null}><Tela /></Suspense>
}
