'use client'
// Admin → celular (WhatsApp) do usuário (José, 24/11/2026). Usado nos avisos pelo Chatwoot:
// pedido de autorização e convite de reunião. Sem número, a pessoa só recebe o e-mail.
import { useState } from 'react'
import { X, Smartphone } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

/** "5515999991234" → "(15) 99999-1234" */
export function celularBonito(c: string | null | undefined): string {
  const d = String(c || '').replace(/\D/g, '').replace(/^55/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return c || ''
}

export default function CelularModal({ usuario, onFechar, onSalvo }: {
  usuario: { id: string; nome?: string; celular?: string | null }
  onFechar: () => void
  onSalvo: (celular: string | null) => void
}) {
  const [numero, setNumero] = useState(celularBonito(usuario.celular))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const salvar = async () => {
    setSalvando(true); setErro('')
    try {
      const res = await fetch('/api/admin/usuario-celular', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ user_id: usuario.id, celular: numero }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(out.error || 'Não deu para salvar.'); return }
      onSalvo(out.celular ?? null); onFechar()
    } catch { setErro('Erro ao conectar com o servidor.') } finally { setSalvando(false) }
  }

  const campo: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 15, boxSizing: 'border-box' }

  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--portal-bg-card)', color: 'var(--portal-text)', borderRadius: 14, width: '100%', maxWidth: 400, padding: 22, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 16 }}><Smartphone size={18} /> Celular (WhatsApp)</div>
          <button onClick={onFechar} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--portal-text-secondary)' }}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', marginBottom: 12 }}>
          {usuario.nome && <><b style={{ color: 'var(--portal-text)' }}>{usuario.nome}</b><br /></>}
          Recebe por aqui os avisos do portal pelo WhatsApp (pedido de autorização, convite de reunião).
        </div>
        <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="(15) 99999-1234" inputMode="tel" autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') salvar() }} style={campo} />
        <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 4 }}>Deixe vazio para apagar.</div>
        {erro && <div style={{ fontSize: 13, color: '#dc2626', marginTop: 8 }}>{erro}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button onClick={onFechar} style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text)', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: salvando ? '#9ca3af' : '#16a34a', color: '#fefefe', fontWeight: 600, cursor: salvando ? 'default' : 'pointer' }}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
