'use client'
// Administração: quem recebe os avisos do Tratorilson — alerta das perguntas
// dele, "precisa de atendimento" e "mensagem nova no NovaZap" (com o robô
// desligado). Devs recebem sempre; aqui se escolhe quem recebe a mais.
import { useEffect, useState } from 'react'
import { Bot, Check } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

interface UsuarioPortal { nome: string; email: string; avatar_url?: string }

export default function AvisosTratorilson() {
  const [usuarios, setUsuarios] = useState<UsuarioPortal[]>([])
  const [escolhidos, setEscolhidos] = useState<string[]>([])
  const [salvo, setSalvo] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    authHeaders()
      .then((headers) => fetch('/api/tratorilson/notificados', { headers, cache: 'no-store' }))
      .then((r) => r.json())
      .then((j: { usuarios?: UsuarioPortal[]; notificados?: { email?: string }[]; aviso?: string }) => {
        if (!vivo) return
        if (Array.isArray(j.usuarios)) setUsuarios(j.usuarios)
        if (Array.isArray(j.notificados)) {
          const lista = j.notificados.map((n) => String(n.email || '').toLowerCase())
          setEscolhidos(lista); setSalvo(lista)
        }
        if (j.aviso) setErro(j.aviso)
      })
      .catch(() => { if (vivo) setErro('Falha ao carregar') })
    return () => { vivo = false }
  }, [])

  const alternar = (email: string) => {
    const e = email.toLowerCase()
    setEscolhidos((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e])
  }
  const salvar = async () => {
    setSalvando(true); setErro('')
    try {
      const lista = usuarios.filter((u) => escolhidos.includes(u.email.toLowerCase())).map((u) => ({ email: u.email, nome: u.nome }))
      const r = await fetch('/api/tratorilson/notificados', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ notificados: lista }),
      })
      if (!r.ok) setErro('Não salvou: ' + ((await r.json().catch(() => ({}))).error || r.status))
      else setSalvo(escolhidos)
    } catch { setErro('Falha de conexão.') }
    setSalvando(false)
  }
  const mudou = escolhidos.length !== salvo.length || escolhidos.some((e) => !salvo.includes(e))

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Bot size={16} color="#ef4444" />
        <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text-secondary)', margin: 0 }}>Quem recebe os avisos do Tratorilson</h3>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', background: 'rgba(239,68,68,.12)', padding: '2px 10px', borderRadius: 10 }}>{escolhidos.length}</span>
      </div>
      <p style={{ fontSize: 12, color: '#a3a3a3', margin: '0 0 12px' }}>
        Perguntas que ele faz à equipe, clientes que precisam de atendimento e, com o robô desligado no NovaZap, o aviso de mensagem nova. Os Devs recebem sempre; marque quem mais deve receber.
      </p>
      {erro && <div style={{ marginBottom: 10, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
      <div style={{ borderRadius: 16, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', padding: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {usuarios.map((u) => {
            const on = escolhidos.includes(u.email.toLowerCase())
            return (
              <button key={u.email} onClick={() => alternar(u.email)} title={u.email}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px 6px 6px', borderRadius: 20, cursor: 'pointer',
                  border: `1px solid ${on ? '#ef4444' : 'var(--portal-border)'}`, background: on ? 'rgba(239,68,68,.12)' : 'transparent',
                  color: 'var(--portal-text)', fontSize: 12, fontWeight: on ? 700 : 500,
                }}>
                {u.avatar_url
                  ? <img src={u.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                  : <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--portal-bg-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>{u.nome.slice(0, 1)}</span>}
                {u.nome}
                {on && <Check size={13} color="#ef4444" />}
              </button>
            )
          })}
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={salvar} disabled={!mudou || salvando}
            style={{
              padding: '8px 16px', borderRadius: 9, border: 'none', fontSize: 13, fontWeight: 700,
              background: mudou ? '#ef4444' : 'var(--portal-bg-secondary)', color: mudou ? '#fff' : '#a3a3a3',
              cursor: mudou && !salvando ? 'pointer' : 'default',
            }}>
            {salvando ? 'Salvando…' : mudou ? 'Salvar' : 'Salvo'}
          </button>
        </div>
      </div>
    </div>
  )
}
