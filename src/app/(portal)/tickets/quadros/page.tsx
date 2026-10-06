'use client'
// Quadros de tickets (estilo Trello): os quadros que você enxerga + criar novo.
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, LayoutGrid, Lock, Globe, Users, RefreshCw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import { authHeaders } from '@/lib/auth/client'
import type { QuadroResumo } from '@/lib/tickets/quadros'
import type { UsuarioMin } from '@/lib/tickets/constantes'
import FormQuadro from '@/components/tickets/quadros/FormQuadro'

export default function QuadrosPage() {
  const router = useRouter()
  const { userProfile } = useAuth()
  const isMobile = useIsMobile()
  const [quadros, setQuadros] = useState<QuadroResumo[]>([])
  const [usuarios, setUsuarios] = useState<Record<string, UsuarioMin>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [arquivados, setArquivados] = useState(false)
  const [novo, setNovo] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const res = await fetch(`/api/tickets/quadros${arquivados ? '?arquivados=1' : ''}`, { headers: await authHeaders() })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao carregar'); return }
      setQuadros(json.quadros || [])
      setUsuarios(json.usuarios || {})
      setAviso(json.migracaoFaltando ? json.error : '')
    } catch {
      setErro('Falha de conexão')
    } finally {
      setCarregando(false)
    }
  }, [arquivados])

  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  return (
    <div style={{ padding: isMobile ? '14px 12px' : 20, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--portal-text,#111)' }}>
            <LayoutGrid size={20} color="#dc2626" /> Quadros
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>
            Organize tickets por equipe ou projeto, com as colunas que fizerem sentido para vocês.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-muted,#888)', cursor: 'pointer' }}>
            <input type="checkbox" checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} /> Mostrar arquivados
          </label>
          <button onClick={carregar} title="Atualizar"
            style={{ display: 'flex', padding: 8, borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}>
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setNovo(true)} disabled={!!aviso}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: aviso ? .5 : 1 }}>
            <Plus size={16} /> Novo quadro
          </button>
        </div>
      </div>

      {aviso && <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(217,119,6,.1)', color: '#b45309', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{aviso}</div>}
      {erro && <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{erro}</div>}

      {carregando ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text-muted,#888)' }}>Carregando quadros...</div>
      ) : quadros.length === 0 && !aviso ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', borderRadius: 12, border: '1px dashed var(--portal-border,#ddd)', color: 'var(--portal-text-muted,#888)' }}>
          <LayoutGrid size={32} style={{ opacity: .35, marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>Nenhum quadro ainda.</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Crie o primeiro e convide quem trabalha com você.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 14 }}>
          {quadros.map((q) => (
            <button key={q.id} onClick={() => router.push(`/tickets/quadros/${q.id}`)}
              style={{
                display: 'flex', flexDirection: 'column', textAlign: 'left', borderRadius: 12, overflow: 'hidden', cursor: 'pointer', padding: 0,
                border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', opacity: q.arquivado ? .6 : 1,
              }}>
              <div style={{ height: 8, background: q.cor }} />
              <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 800, color: 'var(--portal-text,#111)' }}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.nome}</span>
                  {q.visibilidade === 'privado' ? <Lock size={13} style={{ opacity: .5 }} /> : <Globe size={13} style={{ opacity: .5 }} />}
                </div>
                {q.descricao && <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{q.descricao}</div>}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: 'var(--portal-text-muted,#888)', marginTop: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Users size={12} /> {q.membros.length}</span>
                  <span>{q.tickets_abertos} aberto{q.tickets_abertos === 1 ? '' : 's'}</span>
                  {q.arquivado && <span style={{ fontWeight: 700 }}>arquivado</span>}
                  {!q.pode_trabalhar && !q.arquivado && <span>só leitura</span>}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted,#aaa)' }}>criado por {usuarios[q.criado_por]?.nome || '—'}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {novo && (
        <FormQuadro usuarios={usuarios} onFechar={() => setNovo(false)}
          onSalvo={(q) => { setNovo(false); router.push(`/tickets/quadros/${q.id}`) }} />
      )}
    </div>
  )
}
