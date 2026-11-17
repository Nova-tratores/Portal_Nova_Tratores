'use client'
// Meu perfil → "E-mail conectado ao portal". Único lugar para DESCONECTAR o
// e-mail de envio (antes era o X da caixa de e-mail do topo, que as pessoas
// clicavam achando que só fechava a janela — 17/11/2026).
import { useEffect, useState } from 'react'
import { Mail, Unplug } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

export default function EmailConectadoPerfil() {
  const [carregando, setCarregando] = useState(true)
  const [conta, setConta] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    ;(async () => {
      try {
        const r = await fetch('/api/financeiro/config-envio', { headers: { ...(await authHeaders()) } })
        const c = await r.json().catch(() => ({}))
        if (ativo && c && !c.error) setConta(c.email_envio || '')
      } catch { /* sem conexão: mostra "nenhum" */ }
      if (ativo) setCarregando(false)
    })()
    return () => { ativo = false }
  }, [])

  const desconectar = async () => {
    if (!confirm(`Desconectar o e-mail ${conta} do portal?\n\nA caixa de e-mail some do topo e o envio de boletos pelo seu e-mail para de funcionar até conectar de novo. (No Google nada muda: a senha de app continua ativa lá.)`)) return
    setBusy(true); setErro('')
    try {
      const r = await fetch('/api/financeiro/config-envio', { method: 'DELETE', headers: { ...(await authHeaders()) } })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.error) setErro(j.error || 'Não consegui desconectar.')
      else { setConta(''); window.dispatchEvent(new Event('portal-email-desconectado')) }
    } catch { setErro('Falha de conexão ao desconectar.') }
    setBusy(false)
  }

  if (carregando) return null

  return (
    <div style={{ padding: '16px 18px', borderRadius: 16, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)' }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <Mail size={14} /> E-mail conectado ao portal
      </label>
      {conta ? (
        <>
          <p style={{ fontSize: 12, color: 'var(--portal-text-muted)', margin: '0 0 12px', lineHeight: 1.45 }}>
            Os boletos e respostas que você manda pelo portal saem por este e-mail.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ flex: '1 1 180px', minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--portal-text)', wordBreak: 'break-all' }}>{conta}</span>
            <button onClick={desconectar} disabled={busy} style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 40, padding: '0 16px',
              borderRadius: 10, border: '1.5px solid #fca5a5', background: 'transparent', color: '#dc2626',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.5 : 1,
            }}><Unplug size={15} /> {busy ? 'Desconectando…' : 'Desconectar'}</button>
          </div>
        </>
      ) : (
        <p style={{ fontSize: 12.5, color: 'var(--portal-text-muted)', margin: 0, lineHeight: 1.45 }}>
          Nenhum e-mail conectado. Ele é pedido na hora em que você for mandar um boleto ou abrir a caixa de e-mail.
        </p>
      )}
      {erro && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '10px 0 0' }}>{erro}</p>}
    </div>
  )
}
