'use client'
// Mapa Técnico (Pós-Vendas). Até 16/10/2026 era o app estático
// public/mapa-geral num iframe (chave do banco exposta, metade das funções
// quebradas, rotas sem login). Agora é a MESMA tela do /frota/mapa: carros na
// última posição com a situação, técnico e OS em execução, rota do dia e as
// propriedades rurais (CAR). Acesso: módulo "mapa" (ou Frota).
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import MapaFrotaTela from '@/components/frota/MapaFrotaTela'

export default function MapaGeralPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  if (!loading && userProfile && !temAcesso('mapa') && !temAcesso('frota')) return <SemPermissao />
  return <MapaFrotaTela titulo="Mapa Técnico" />
}
