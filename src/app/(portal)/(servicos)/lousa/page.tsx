'use client'
// LOUSA VIRTUAL — agenda dos técnicos: calendário estilo Google Agenda só com os técnicos
// (Lousa + OS do POS), o mesmo componente da Agenda coletiva. O "Quadro clássico" saiu
// a pedido do José (16/10/2026); o componente antigo segue em components/lousa/LousaClassica.
export const dynamic = 'force-dynamic'

import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import CalendarioGoogle from '@/components/agenda/CalendarioGoogle'

export default function LousaPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  if (!loading && userProfile && !temAcesso('lousa')) return <SemPermissao />
  return <CalendarioGoogle modo="tecnicos" titulo="Lousa" />
}
