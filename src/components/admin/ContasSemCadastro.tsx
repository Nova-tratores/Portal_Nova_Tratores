'use client'
// Administração: logins que existem no Supabase Auth mas NÃO têm cadastro no
// Portal. Aparecem aqui sozinhos, para o admin cadastrar ou apagar o login.
import { useCallback, useEffect, useState } from 'react'
import { KeyRound, UserPlus, Trash2 } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

interface Conta { id: string; email: string; criado_em: string; ultimo_acesso: string | null; uso: string | null }
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : 'nunca')

export default function ContasSemCadastro({ versao, onCadastrar }: { versao: number; onCadastrar: (email: string) => void }) {
  const [contas, setContas] = useState<Conta[] | null>(null)
  const [erro, setErro] = useState('')
  const [apagando, setApagando] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/contas-sem-cadastro', { headers: await authHeaders(), cache: 'no-store' })
      const j = await res.json()
      if (!res.ok) { setErro(j.error || 'Falha ao listar'); return }
      setContas(j.contas); setErro('')
    } catch { setErro('Falha ao listar') }
  }, [])
  useEffect(() => { carregar() }, [carregar, versao])

  const apagar = async (c: Conta) => {
    setApagando(c.id); setErro('')
    try {
      const res = await fetch('/api/admin/contas-sem-cadastro', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ user_id: c.id }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) setErro(`${c.email}: ${j.error || 'falha ao apagar'}`)
      setConfirmar(null)
      await carregar()
    } finally { setApagando(null) }
  }

  if (!contas || (contas.length === 0 && !erro)) return null
  const btn = (cor: string, fundo: string, borda: string): React.CSSProperties => ({ padding: '7px 12px', borderRadius: 9, border: `1px solid ${borda}`, background: fundo, color: cor, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 })

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <KeyRound size={16} color="#d97706" />
        <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text-secondary)', margin: 0 }}>Logins sem cadastro no Portal</h3>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#d97706', background: 'rgba(217,119,6,.12)', padding: '2px 10px', borderRadius: 10 }}>{contas.length}</span>
      </div>
      <p style={{ fontSize: 12, color: '#a3a3a3', margin: '0 0 12px' }}>
        Estas contas conseguem fazer login, mas não têm cadastro aqui. Cadastre quem deve usar o Portal ou apague o login. Contas usadas no CRM ficam marcadas e não podem ser apagadas por aqui.
      </p>
      {erro && <div style={{ marginBottom: 10, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
      <div style={{ borderRadius: 16, overflow: 'hidden', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)' }}>
        {contas.map((c) => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--portal-border)', flexWrap: 'wrap', opacity: apagando === c.id ? .5 : 1 }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text)', margin: 0 }}>
                {c.email}
                {c.uso && <span style={{ fontSize: 10, fontWeight: 700, color: '#0369a1', background: 'rgba(3,105,161,.1)', padding: '1px 7px', borderRadius: 5, marginLeft: 6 }}>{c.uso}</span>}
              </p>
              <p style={{ fontSize: 11, color: '#a3a3a3', margin: 0 }}>criada em {data(c.criado_em)} · último login {data(c.ultimo_acesso)}</p>
            </div>
            <button onClick={() => onCadastrar(c.email)} style={btn('#16a34a', '#f0fdf4', '#bbf7d0')}><UserPlus size={14} /> Cadastrar no Portal</button>
            {!c.uso && (confirmar === c.id ? (
              <>
                <span style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>Apagar de vez?</span>
                <button onClick={() => apagar(c)} disabled={apagando === c.id} style={btn('#fff', '#dc2626', '#dc2626')}>Sim, apagar</button>
                <button onClick={() => setConfirmar(null)} style={btn('var(--portal-text-secondary)', 'transparent', 'var(--portal-border)')}>Não</button>
              </>
            ) : (
              <button onClick={() => setConfirmar(c.id)} style={btn('#dc2626', '#fef2f2', '#fecaca')}><Trash2 size={14} /> Apagar login</button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
