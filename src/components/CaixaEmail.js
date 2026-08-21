'use client'
// Caixa de e-mail no HEADER do portal (ao lado do sininho): cada usuário vê
// a PRÓPRIA caixa de entrada (o e-mail que configurou no envio de boletos).
// Respostas a e-mails que a gente enviou vêm DESTACADAS em verde, com o
// atalho pro card do financeiro. Só aparece pra quem tem e-mail configurado.
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { authHeaders } from '@/lib/auth/client'
import { Mail, Reply, RefreshCw, ExternalLink } from 'lucide-react'

const fmtData = (iso) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const hoje = new Date()
    const mesmoDia = d.toDateString() === hoje.toDateString()
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    return mesmoDia ? hm : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hm}`
  } catch { return '' }
}

export default function CaixaEmail() {
  const [temConfig, setTemConfig] = useState(false)
  const [conta, setConta] = useState('')
  const [open, setOpen] = useState(false)
  const [emails, setEmails] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [badge, setBadge] = useState(0)
  const [aberto, setAberto] = useState(null)          // uid expandido
  const [corpo, setCorpo] = useState({})              // uid → texto
  const boxRef = useRef(null)
  const router = useRouter()

  // Só mostra o botão pra quem configurou o e-mail de envio
  useEffect(() => {
    let ativo = true
    ;(async () => {
      try {
        const r = await fetch('/api/financeiro/config-envio', { headers: { ...(await authHeaders()) } })
        const c = await r.json()
        if (ativo && c && !c.error && c.email_envio) { setTemConfig(true); setConta(c.email_envio) }
      } catch { /* sem config */ }
    })()
    return () => { ativo = false }
  }, [])

  // Badge leve (respostas não lidas aos MEUS envios) — a cada 3 min
  const carregarBadge = useCallback(async () => {
    try {
      const r = await fetch('/api/financeiro/caixa-email?badge=1', { headers: { ...(await authHeaders()) } })
      const j = await r.json()
      if (typeof j.naoLidas === 'number') setBadge(j.naoLidas)
    } catch { /* offline */ }
  }, [])
  useEffect(() => {
    if (!temConfig) return
    carregarBadge()
    const t = setInterval(carregarBadge, 180000)
    return () => clearInterval(t)
  }, [temConfig, carregarBadge])

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    const fn = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  const carregarCaixa = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const r = await fetch('/api/financeiro/caixa-email', { headers: { ...(await authHeaders()) } })
      const j = await r.json()
      if (j.error) setErro(j.error)
      else if (Array.isArray(j.emails)) { setEmails(j.emails); if (j.conta) setConta(j.conta) }
    } catch { setErro('Falha de conexão.') }
    setCarregando(false)
  }, [])

  const abrirPainel = () => {
    const novo = !open
    setOpen(novo)
    if (novo) { carregarCaixa() }
  }

  const expandir = async (em) => {
    if (aberto === em.uid) { setAberto(null); return }
    setAberto(em.uid)
    if (!corpo[em.uid]) {
      try {
        const r = await fetch(`/api/financeiro/caixa-email?uid=${em.uid}`, { headers: { ...(await authHeaders()) } })
        const j = await r.json()
        setCorpo((c) => ({ ...c, [em.uid]: j.texto || j.error || '(sem texto)' }))
      } catch { setCorpo((c) => ({ ...c, [em.uid]: 'Falha ao carregar.' })) }
    }
  }

  if (!temConfig) return null

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        onClick={abrirPainel}
        title={`Sua caixa de e-mail (${conta})`}
        style={{
          position: 'relative', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)',
          color: open ? '#16a34a' : 'var(--portal-text-secondary)', cursor: 'pointer', padding: '11px', borderRadius: '12px',
          display: 'flex', alignItems: 'center', transition: 'all 0.2s'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-hover)'; e.currentTarget.style.color = '#16a34a' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--portal-bg-secondary)'; if (!open) e.currentTarget.style.color = 'var(--portal-text-secondary)' }}
      >
        <Mail size={20} />
        {badge > 0 && (
          <span style={{
            position: 'absolute', top: '-5px', right: '-5px', minWidth: 18, height: 18, borderRadius: 9,
            background: '#16a34a', color: '#fff', fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', border: '2px solid var(--portal-header-bg)'
          }}>{badge > 99 ? '99+' : badge}</span>
        )}
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 52, right: 0, width: 440, maxWidth: '94vw', maxHeight: '72vh', overflowY: 'auto', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', padding: 12, zIndex: 3000 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 10px' }}>
            <Mail size={15} style={{ color: '#16a34a' }} />
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: 13.5, color: 'var(--portal-text)', display: 'block' }}>Sua caixa de entrada</b>
              <span style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', wordBreak: 'break-all' }}>{conta}</span>
            </div>
            <button onClick={carregarCaixa} disabled={carregando} title="Atualizar"
              style={{ marginLeft: 'auto', background: 'transparent', border: '1px solid var(--portal-border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', color: 'var(--portal-text-secondary)', display: 'flex' }}>
              <RefreshCw size={14} className={carregando ? 'spin-envio' : ''} />
            </button>
          </div>

          {carregando && emails.length === 0 ? (
            <div style={{ padding: 26, textAlign: 'center', color: 'var(--portal-text-secondary)', fontSize: 13 }}>
              Conectando na sua caixa…
            </div>
          ) : erro ? (
            <div style={{ padding: 18, textAlign: 'center', color: '#dc2626', fontSize: 13 }}>{erro}</div>
          ) : emails.length === 0 ? (
            <div style={{ padding: 22, textAlign: 'center', color: 'var(--portal-text-secondary)', fontSize: 13 }}>Caixa vazia.</div>
          ) : emails.map((em) => (
            <div key={em.uid}
              style={{
                borderTop: '1px solid var(--portal-border)', padding: '9px 8px',
                background: em.ehResposta ? 'rgba(22,163,74,0.10)' : 'transparent',
                borderLeft: em.ehResposta ? '4px solid #16a34a' : '4px solid transparent',
                borderRadius: em.ehResposta ? 8 : 0,
              }}>
              <div onClick={() => expandir(em)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  {em.ehResposta && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 800, color: '#fff', background: '#16a34a', borderRadius: 6, padding: '2px 8px' }}>
                      <Reply size={10} /> RESPOSTA A ENVIO
                    </span>
                  )}
                  <b style={{ fontSize: 13, color: 'var(--portal-text)', fontWeight: em.naoLida ? 800 : 600 }}>
                    {em.naoLida && <span style={{ color: '#16a34a' }}>● </span>}{em.deNome || em.de}
                  </b>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--portal-text-secondary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtData(em.data)}</span>
                </div>
                <div style={{ fontSize: 12.5, color: em.naoLida ? 'var(--portal-text)' : 'var(--portal-text-secondary)', fontWeight: em.naoLida ? 700 : 400, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {em.assunto}
                </div>
                {em.ehResposta && em.cliente && (
                  <div style={{ fontSize: 11.5, color: '#16a34a', fontWeight: 700, marginTop: 2 }}>Cliente: {em.cliente}</div>
                )}
              </div>
              {aberto === em.uid && (
                <div style={{ marginTop: 8 }}>
                  <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, margin: 0, padding: '10px 12px', background: 'var(--portal-bg-secondary)', borderRadius: 8, color: 'var(--portal-text)', maxHeight: 260, overflowY: 'auto' }}>
                    {corpo[em.uid] || 'Carregando…'}
                  </pre>
                  {em.chamadoId != null && (
                    <button
                      onClick={() => { setOpen(false); router.push(`/financeiro/home-financeiro?id=${em.chamadoId}&tipo=boleto`) }}
                      style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 12.5, fontWeight: 700 }}>
                      <ExternalLink size={13} /> Abrir o card no financeiro
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
