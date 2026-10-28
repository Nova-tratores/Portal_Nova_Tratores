'use client'
// Planta Viva — guarda do módulo `planta` (admin vê sempre). A rota /api/planta corta de
// novo no servidor: o financeiro vem lacrado para quem não é admin.
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import PlantaViva from '@/components/planta/PlantaViva'

export default function PlantaPage() {
  const { userProfile } = useAuth()
  const { temAcesso, isAdmin, loading } = usePermissoes(userProfile?.id)
  if (!loading && userProfile && !isAdmin && !temAcesso('planta')) return <SemPermissao />
  return <PlantaViva />
}
