'use client'
// Caixa de e-mail no HEADER do portal (ao lado do sininho): cada usuário vê
// a PRÓPRIA caixa de entrada (o e-mail que configurou no envio de boletos).
// - Badge verde = e-mails NÃO LIDOS na caixa (checado a cada 3 min)
// - Respostas a e-mails que enviamos vêm DESTACADAS com atalho pro card
// - Clicar numa mensagem abre um MODAL com o corpo renderizado, os ANEXOS
//   pra baixar e um campo pra RESPONDER dali mesmo (mesma conversa).
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { authHeaders } from '@/lib/auth/client'
import { Mail, Reply, RefreshCw, ExternalLink, Paperclip, X, Send, Check, CheckCheck } from 'lucide-react'

const fmtData = (iso, comAno) => {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const hoje = new Date()
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    if (!comAno && d.toDateString() === hoje.toDateString()) return hm
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}${comAno ? `/${d.getFullYear()}` : ''} ${hm}`
  } catch { return '' }
}

const fmtTamanho = (b) => {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

export default function CaixaEmail() {
  const [temConfig, setTemConfig] = useState(false)
  const [conta, setConta] = useState('')
  const [open, setOpen] = useState(false)
  const [emails, setEmails] = useState([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [badge, setBadge] = useState(0)
  const boxRef = useRef(null)
  const router = useRouter()

  // Modal de leitura
  const [msgAberta, setMsgAberta] = useState(null)   // item da lista
  const [detalhe, setDetalhe] = useState(null)       // corpo + anexos
  const [carregandoMsg, setCarregandoMsg] = useState(false)
  const [resposta, setResposta] = useState('')
  const [enviandoResp, setEnviandoResp] = useState(false)
  const [respOk, setRespOk] = useState('')
  const [baixandoAnexo, setBaixandoAnexo] = useState(null)

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

  // Badge: NÃO LIDOS da caixa (STATUS via IMAP, leve) — a cada 3 min
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

  useEffect(() => {
    if (!open) return
    const fn = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [open])

  const carregarCaixa = useCallback(async (fresh) => {
    setCarregando(true); setErro('')
    try {
      const r = await fetch(`/api/financeiro/caixa-email${fresh ? '?fresh=1' : ''}`, { headers: { ...(await authHeaders()) } })
      const j = await r.json()
      if (j.error) setErro(j.error)
      else if (Array.isArray(j.emails)) { setEmails(j.emails); if (j.conta) setConta(j.conta) }
    } catch { setErro('Falha de conexão.') }
    setCarregando(false)
    carregarBadge()
  }, [carregarBadge])

  // Pré-carrega a lista logo que o portal abre → clicar no envelope é instantâneo
  useEffect(() => {
    if (!temConfig) return
    const t = setTimeout(() => carregarCaixa(false), 2500)
    return () => clearTimeout(t)
  }, [temConfig, carregarCaixa])

  const abrirPainel = () => {
    const novo = !open
    setOpen(novo)
    if (novo) carregarCaixa(false) // cache de 30s no servidor: resposta imediata
  }

  const abrirMensagem = async (em) => {
    setMsgAberta(em); setDetalhe(null); setResposta(''); setRespOk(''); setCarregandoMsg(true)
    try {
      const r = await fetch(`/api/financeiro/caixa-email?uid=${em.uid}`, { headers: { ...(await authHeaders()) } })
      const j = await r.json()
      if (j.error) setErro(j.error)
      else setDetalhe(j)
    } catch { /* mantém modal com erro */ }
    setCarregandoMsg(false)
  }

  const baixarAnexo = async (a) => {
    if (!msgAberta) return
    setBaixandoAnexo(a.i)
    try {
      const r = await fetch(`/api/financeiro/caixa-email?uid=${msgAberta.uid}&anexo=${a.i}`, { headers: { ...(await authHeaders()) } })
      if (!r.ok) throw new Error()
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const el = document.createElement('a')
      el.href = url; el.download = a.nome || 'anexo'; el.click()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch { alert('Falha ao baixar o anexo.') }
    setBaixandoAnexo(null)
  }

  // Marca como lida (seta o "lido" direto no seu e-mail via IMAP)
  const [marcando, setMarcando] = useState(false)
  const marcarLida = async (uid) => {
    if (marcando) return
    setMarcando(true)
    try {
      const r = await fetch('/api/financeiro/caixa-email', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(uid ? { uid } : { todas: true }),
      })
      const j = await r.json()
      if (j.ok) {
        setEmails((prev) => prev.map((e) => (uid ? e.uid === uid : true) ? { ...e, naoLida: false } : e))
        if (msgAberta && (!uid || msgAberta.uid === uid)) setMsgAberta((m) => m ? { ...m, naoLida: false } : m)
        carregarBadge()
      } else if (j.error) alert(j.error)
    } catch { alert('Falha ao marcar como lida.') }
    setMarcando(false)
  }

  const responder = async () => {
    if (!msgAberta || !resposta.trim() || enviandoResp) return
    setEnviandoResp(true); setRespOk('')
    try {
      const r = await fetch('/api/financeiro/caixa-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ uid: msgAberta.uid, texto: resposta.trim() }),
      })
      const j = await r.json()
      if (!r.ok || j.error) alert(j.error || 'Falha ao enviar a resposta.')
      else { setRespOk(`Resposta enviada para ${j.para}.`); setResposta('') }
    } catch { alert('Falha de conexão ao enviar.') }
    setEnviandoResp(false)
  }

  if (!temConfig) return null

  const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: 'var(--portal-text)', fontSize: 12.5, fontWeight: 600 }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        onClick={abrirPainel}
        title={`Sua caixa de e-mail (${conta})${badge > 0 ? ` — ${badge} não lido${badge > 1 ? 's' : ''}` : ''}`}
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

      {/* ── LISTA (dropdown) ── */}
      {open && (
        <div style={{ position: 'absolute', top: 52, right: 0, width: 440, maxWidth: '94vw', maxHeight: '72vh', overflowY: 'auto', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', padding: 12, zIndex: 3000 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 10px' }}>
            <Mail size={15} style={{ color: '#16a34a' }} />
            <div style={{ minWidth: 0 }}>
              <b style={{ fontSize: 13.5, color: 'var(--portal-text)', display: 'block' }}>Sua caixa de entrada</b>
              <span style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', wordBreak: 'break-all' }}>{conta}</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {(badge > 0 || emails.some((e) => e.naoLida)) && (
                <button onClick={() => marcarLida(null)} disabled={marcando} title="Marcar TODAS como lidas"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid #16a34a', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', color: '#16a34a', fontSize: 11.5, fontWeight: 700 }}>
                  <CheckCheck size={13} /> {marcando ? '...' : 'todas lidas'}
                </button>
              )}
              <button onClick={() => carregarCaixa(true)} disabled={carregando} title="Atualizar agora (busca direto na caixa)"
                style={{ background: 'transparent', border: '1px solid var(--portal-border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', color: 'var(--portal-text-secondary)', display: 'flex' }}>
                <RefreshCw size={14} className={carregando ? 'spin-envio' : ''} />
              </button>
            </div>
          </div>

          {carregando && emails.length === 0 ? (
            <div style={{ padding: 26, textAlign: 'center', color: 'var(--portal-text-secondary)', fontSize: 13 }}>Conectando na sua caixa…</div>
          ) : erro && emails.length === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', color: '#dc2626', fontSize: 13 }}>{erro}</div>
          ) : emails.length === 0 ? (
            <div style={{ padding: 22, textAlign: 'center', color: 'var(--portal-text-secondary)', fontSize: 13 }}>Caixa vazia.</div>
          ) : emails.map((em) => (
            <div key={em.uid}
              onClick={() => abrirMensagem(em)}
              style={{
                borderTop: '1px solid var(--portal-border)', padding: '9px 8px', cursor: 'pointer',
                background: em.ehResposta ? 'rgba(22,163,74,0.10)' : 'transparent',
                borderLeft: em.ehResposta ? '4px solid #16a34a' : '4px solid transparent',
                borderRadius: em.ehResposta ? 8 : 0,
              }}>
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
          ))}
        </div>
      )}

      {/* ── MODAL DE LEITURA (corpo renderizado + anexos + responder) ── */}
      {msgAberta && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setMsgAberta(null) }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 16, width: 760, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
            {/* Cabeçalho */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--portal-border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                {msgAberta.ehResposta && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 800, color: '#fff', background: '#16a34a', borderRadius: 6, padding: '2px 9px', marginBottom: 6 }}>
                    <Reply size={11} /> RESPOSTA A UM ENVIO NOSSO{msgAberta.cliente ? ` — ${msgAberta.cliente}` : ''}
                  </span>
                )}
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--portal-text)', lineHeight: 1.3, wordBreak: 'break-word' }}>{msgAberta.assunto}</div>
                <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', marginTop: 4 }}>
                  De: <b style={{ color: 'var(--portal-text)' }}>{msgAberta.deNome ? `${msgAberta.deNome} <${msgAberta.de}>` : msgAberta.de}</b> · {fmtData(msgAberta.data, true)}
                </div>
              </div>
              {msgAberta.naoLida && (
                <button onClick={() => marcarLida(msgAberta.uid)} disabled={marcando} title="Marcar como lida (no seu e-mail também)"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#16a34a', border: 'none', borderRadius: 9, padding: '0 13px', height: 34, cursor: 'pointer', color: '#fff', fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>
                  <Check size={15} /> {marcando ? '...' : 'Marcar como lida'}
                </button>
              )}
              <button onClick={() => setMsgAberta(null)} style={{ background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 9, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--portal-text-secondary)', flexShrink: 0 }}>
                <X size={17} />
              </button>
            </div>

            {/* Corpo */}
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
              {carregandoMsg ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-secondary)', fontSize: 13 }}>Carregando a mensagem…</div>
              ) : !detalhe ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#dc2626', fontSize: 13 }}>Não consegui carregar esta mensagem.</div>
              ) : (
                <>
                  {/* Anexos */}
                  {detalhe.anexos?.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      {detalhe.anexos.map((a) => (
                        <button key={a.i} onClick={() => baixarAnexo(a)} disabled={baixandoAnexo === a.i} style={chip} title={`Baixar (${fmtTamanho(a.tamanho)})`}>
                          {baixandoAnexo === a.i ? <RefreshCw size={13} className="spin-envio" /> : <Paperclip size={13} />}
                          {a.nome} <span style={{ color: 'var(--portal-text-secondary)', fontWeight: 400 }}>{fmtTamanho(a.tamanho)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* HTML renderizado num iframe isolado (sem scripts); texto puro como fallback */}
                  {detalhe.html ? (
                    <iframe
                      title="email"
                      sandbox=""
                      srcDoc={detalhe.html}
                      style={{ width: '100%', height: '48vh', border: '1px solid var(--portal-border)', borderRadius: 10, background: '#ffffff' }}
                    />
                  ) : (
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13.5, margin: 0, padding: '12px 14px', background: 'var(--portal-bg-secondary)', borderRadius: 10, color: 'var(--portal-text)' }}>{detalhe.texto || '(sem conteúdo)'}</pre>
                  )}
                  {(detalhe.chamadoId ?? msgAberta.chamadoId) != null && (
                    <button
                      onClick={() => { setMsgAberta(null); setOpen(false); router.push(`/financeiro/home-financeiro?id=${detalhe.chamadoId ?? msgAberta.chamadoId}&tipo=boleto`) }}
                      style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                      <ExternalLink size={14} /> Abrir o card no financeiro
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Responder */}
            <div style={{ borderTop: '1px solid var(--portal-border)', padding: '12px 16px' }}>
              {respOk && <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16a34a', marginBottom: 8 }}>✓ {respOk}</div>}
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <textarea
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  placeholder={`Responder para ${msgAberta.de}…`}
                  rows={2}
                  style={{ flex: 1, resize: 'vertical', minHeight: 44, maxHeight: 160, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', fontSize: 13.5, boxSizing: 'border-box' }}
                />
                <button onClick={responder} disabled={enviandoResp || !resposta.trim()}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: enviandoResp || !resposta.trim() ? 'var(--portal-text-faint)' : '#16a34a', color: '#fff', border: 'none', borderRadius: 10, padding: '11px 18px', cursor: enviandoResp || !resposta.trim() ? 'default' : 'pointer', fontSize: 13.5, fontWeight: 700, flexShrink: 0 }}>
                  {enviandoResp ? <RefreshCw size={15} className="spin-envio" /> : <Send size={15} />} {enviandoResp ? 'Enviando…' : 'Responder'}
                </button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--portal-text-secondary)', marginTop: 6 }}>
                A resposta sai pelo seu e-mail ({conta}) e continua na mesma conversa.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
