'use client'
// Integrantes do quadro. Todos veem a lista; só quem criou (ou admin)
// inclui e remove. Quem criou não sai.
import { useState } from 'react'
import { X, Users, User as UserIcon, Crown } from 'lucide-react'
import type { UsuarioMin } from '@/lib/tickets/constantes'
import UserSelect from '../UserSelect'

interface Props {
  membros: string[]
  criadoPor: string
  usuarios: Record<string, UsuarioMin>
  podeGerenciar: boolean
  onFechar: () => void
  onAcao: (payload: Record<string, unknown>) => Promise<boolean>
}

export default function PainelIntegrantes({ membros, criadoPor, usuarios, podeGerenciar, onFechar, onAcao }: Props) {
  const [escolhendo, setEscolhendo] = useState('')
  const [agindo, setAgindo] = useState(false)
  const lista = [...new Set([criadoPor, ...membros])]
    .sort((a, b) => (a === criadoPor ? -1 : b === criadoPor ? 1 : (usuarios[a]?.nome || '').localeCompare(usuarios[b]?.nome || '', 'pt-BR')))

  const rodar = async (p: Record<string, unknown>) => {
    setAgindo(true)
    try { await onAcao(p) } finally { setAgindo(false) }
  }

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, maxHeight: '85vh', overflowY: 'auto', background: 'var(--portal-surface,#fff)', borderRadius: 14, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--portal-text,#111)' }}>
            <Users size={17} color="#dc2626" /> Integrantes ({lista.length})
          </h3>
          <button onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}><X size={20} /></button>
        </div>

        {podeGerenciar && (
          <div style={{ marginBottom: 14 }}>
            <UserSelect value={escolhendo} autoFocus={false} placeholder="Adicionar integrante..." excluir={lista}
              onChange={(id) => { setEscolhendo(''); rodar({ acao: 'integrante_add', user_ids: [id] }) }} />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {lista.map((id) => (
            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', fontSize: 14, color: 'var(--portal-text,#111)' }}>
              {usuarios[id]?.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={usuarios[id]!.avatar_url!} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                : <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--portal-bg,#f3f4f6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><UserIcon size={14} style={{ opacity: .6 }} /></span>}
              <span style={{ flex: 1, minWidth: 0 }}>
                {usuarios[id]?.nome || 'Usuário'}
                {id === criadoPor && <span style={{ marginLeft: 6, display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color: '#d97706' }}><Crown size={11} /> criou o quadro</span>}
              </span>
              {podeGerenciar && id !== criadoPor && (
                <button disabled={agindo} title="Remover do quadro"
                  onClick={() => { if (window.confirm(`Remover ${usuarios[id]?.nome || 'esta pessoa'} do quadro?`)) rodar({ acao: 'integrante_remover', user_id: id }) }}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#aaa)', display: 'flex' }}><X size={15} /></button>
              )}
            </div>
          ))}
        </div>
        {!podeGerenciar && (
          <p style={{ margin: '12px 0 0', fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}>Só quem criou o quadro inclui ou remove integrantes.</p>
        )}
      </div>
    </div>
  )
}
