'use client'
// Janela Mecânicos = Centro do Pós-Vendas (José, 16/10/2026): Painel dos técnicos, Faturamento
// ao vivo, Ocorrências e Tratorilson. A tela antiga (ranking, cards dos técnicos, alertas e
// vínculo de veículo) foi removida a pedido do José — está no histórico do git se precisar.
import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import CentroPosVendas, { type AbaCPV } from '@/components/mecanicos/CentroPosVendas'

export default function MecanicosPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const [aba, setAba] = useState<AbaCPV>('painel')
  if (!loading && userProfile && !temAcesso('mecanicos')) return <SemPermissao />
  return <CentroPosVendas aba={aba} onAba={setAba} />
}
