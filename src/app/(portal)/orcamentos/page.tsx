'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import OrcamentoEditor from '@/components/orcamentos/OrcamentoEditor'
import OrcamentoLista from '@/components/orcamentos/OrcamentoLista'

export default function OrcamentosPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const [view, setView] = useState<'lista' | 'novo' | 'editar'>('lista')
  const [editarId, setEditarId] = useState<number | null>(null)

  if (loading) return null
  if (!temAcesso('orcamentos')) return <SemPermissao />

  if (view === 'lista') {
    return (
      <OrcamentoLista
        onNovo={() => { setEditarId(null); setView('novo') }}
        onEditar={(id) => { setEditarId(id); setView('editar') }}
      />
    )
  }

  return (
    <OrcamentoEditor
      userName={userProfile?.nome || ''}
      editarId={view === 'editar' ? editarId : null}
      onVoltar={() => { setEditarId(null); setView('lista') }}
    />
  )
}
