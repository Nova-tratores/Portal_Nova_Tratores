'use client'
// War Room — gestão da LISTA de acesso (núcleo/membro). Só admin. Espelha o
// padrão da config da SC. Escrita via PUT /api/war-room/membros (service role).
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { UserPlus, Shield, User as UserIcon, Trash2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { authHeaders } from '@/lib/auth/client'
import UserSelect from '@/components/tickets/UserSelect'

interface Membro {
  user_id: string
  nivel: 'nucleo' | 'membro'
  ativo: boolean
  nome: string
  avatar_url: string | null
  usuario_ativo: boolean
}

const card: React.CSSProperties = { background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#eee)', borderRadius: 12, padding: 16 }
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)' }
const btnPrim: React.CSSProperties = { ...btn, background: '#b91c1c', color: '#fff', border: '1px solid #b91c1c' }

export default function WarRoomConfigPage() {
  const { userProfile } = useAuth()
  const { isAdmin, loading } = usePermissoes(userProfile?.id)
  const [membros, setMembros] = useState<Membro[]>([])
  const [novoId, setNovoId] = useState('')
  const [novoNivel, setNovoNivel] = useState<'nucleo' | 'membro'>('membro')
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)

  const carregar = useCallback(async () => {
    const r = await fetch('/api/war-room/membros', { headers: await authHeaders(), cache: 'no-store' })
    const j = await r.json()
    if (r.ok) setMembros(j.membros || [])
  }, [])
  useEffect(() => { if (isAdmin) carregar() }, [isAdmin, carregar])

  if (!loading && userProfile && !isAdmin) return <SemPermissao />

  const salvar = async (user_id: string, nivel: 'nucleo' | 'membro', ativo: boolean) => {
    setBusy(true); setErro('')
    try {
      const r = await fetch('/api/war-room/membros', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ user_id, nivel, ativo }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Falha')
      setNovoId(''); await carregar()
    } catch (e) { setErro((e as Error).message) } finally { setBusy(false) }
  }

  const ativos = membros.filter((m) => m.ativo)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Membros do War Room</h1>
        <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>
          Acesso por <strong>lista explícita</strong> — nunca por cargo. <strong>Núcleo</strong> vê tudo (caixa, ponte, definições, ata). <strong>Membro</strong> vê o plano e sentinelas reduzidos (sem valores de caixa). Desativar não apaga o histórico.
        </div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><UserPlus size={16} /> Adicionar / promover</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: 220 }}><UserSelect value={novoId} onChange={setNovoId} placeholder="Escolher usuário" excluir={ativos.map((m) => m.user_id)} /></div>
          <select value={novoNivel} onChange={(e) => setNovoNivel(e.target.value as 'nucleo' | 'membro')} style={{ ...btn, cursor: 'pointer' }}>
            <option value="membro">Membro</option>
            <option value="nucleo">Núcleo</option>
          </select>
          <button style={btnPrim} disabled={busy || !novoId} onClick={() => salvar(novoId, novoNivel, true)}>Adicionar</button>
        </div>
        {erro && <div style={{ fontSize: 13, color: '#dc2626', marginTop: 8 }}>{erro}</div>}
      </div>

      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Lista atual</div>
        {ativos.length === 0 && <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Ninguém na lista ainda.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ativos.map((m) => (
            <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid var(--portal-border,#f0f0f0)' }}>
              {m.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={m.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover' }} />
                : <span style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--portal-border,#e5e7eb)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><UserIcon size={14} /></span>}
              <span style={{ flex: 1, fontSize: 14 }}>{m.nome}{!m.usuario_ativo && <span style={{ fontSize: 11, color: '#dc2626' }}> (inativo)</span>}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: m.nivel === 'nucleo' ? '#b91c1c' : '#6b7280' }}>
                {m.nivel === 'nucleo' ? <Shield size={13} /> : <UserIcon size={13} />} {m.nivel}
              </span>
              {m.nivel === 'membro'
                ? <button style={btn} disabled={busy} onClick={() => salvar(m.user_id, 'nucleo', true)}>→ Núcleo</button>
                : <button style={btn} disabled={busy} onClick={() => salvar(m.user_id, 'membro', true)}>→ Membro</button>}
              <button style={{ ...btn, color: '#dc2626' }} disabled={busy} onClick={() => salvar(m.user_id, m.nivel, false)} title="Remover (mantém histórico)"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
