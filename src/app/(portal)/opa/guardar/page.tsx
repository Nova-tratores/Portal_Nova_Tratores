'use client'
// Opa → Guardar peças: as peças RECEBIDAS (nota de entrada) que ainda não têm Prateleira /
// Andar / Caixa. É o mesmo painel "A alocar" de /ajustes/caracteristicas, em tela inteira e
// pensado para o celular no estoque — quem guarda e etiqueta as peças (hoje o Felipe
// Augusto) trabalha no Opa o dia todo. Informou o lugar → grava na Omie, a demanda fecha
// sozinha e a etiqueta vai para a fila com cópias = quantidade recebida.
// Acesso: quem tem Características ou Localização física (a rota confere).
import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { authHeaders } from '@/lib/auth/client'
import { Moldura } from '@/components/opa/pecas/Moldura'
import PainelAlocacao, { useAlocacao } from '@/components/ajustes/PainelAlocacao'
import { chaveProd, type Pos, type ProdutoLoc } from '@/lib/ajustes/posicao'

const POS_KEYS = { prat: '#PRATELEIRA', andar: '#ANDAR', caixa: '#CAIXA' } as const

export default function GuardarPecasPage() {
  const { userProfile } = useAuth()
  const { pode, loading } = usePermissoes(userProfile?.id)
  const permitido = pode('ajustes', 'caracteristicas') || pode('ajustes', 'localizacao')
  const { lista, carregando, erro, recarregar } = useAlocacao(!loading && permitido)
  const [posicoes, setPosicoes] = useState<ProdutoLoc[]>([])

  // só as peças já locadas: sugestões de posição e aviso de lugar ocupado
  useEffect(() => {
    if (loading || !permitido) return
    let vivo = true
    authHeaders()
      .then((h) => fetch('/api/pecas/alocacao?posicoes=1', { headers: { ...h } }))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d && Array.isArray(d.posicoes)) setPosicoes(d.posicoes) })
      .catch(() => { /* sem sugestões: dá para alocar mesmo assim */ })
    return () => { vivo = false }
  }, [loading, permitido])

  // reflete a posição nova sem recarregar tudo (e solta quem foi tirado do lugar)
  const aoGravar = useCallback((alvo: ProdutoLoc, pos: Pos, liberados: ProdutoLoc[]) => {
    const liberar = new Set(liberados.map(chaveProd))
    setPosicoes((prev) => {
      const resto = prev.filter((p) => p.empresa !== alvo.empresa || String(p.codigo_produto) !== String(alvo.codigo_produto))
        .map((p) => (liberar.has(chaveProd(p)) ? { ...p, caracteristicas: {} } : p))
      return [...resto, { ...alvo, caracteristicas: { [POS_KEYS.prat]: pos.prat, [POS_KEYS.andar]: pos.andar, [POS_KEYS.caixa]: pos.caixa } }]
    })
    window.dispatchEvent(new Event('opa-mudou')) // atualiza a contagem da guia
  }, [])

  if (loading) return null
  if (userProfile && !permitido) return <SemPermissao />

  return (
    <Moldura podeGerir={false}>
      <PainelAlocacao
        modo="pagina"
        lista={lista}
        carregando={carregando}
        erro={erro}
        recarregar={recarregar}
        produtos={posicoes}
        onFechar={() => undefined}
        onLocacaoGravada={aoGravar}
      />
    </Moldura>
  )
}
