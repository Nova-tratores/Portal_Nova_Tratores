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
import { useAuth } from '@/hooks/useAuth'
import ConfigEmailEnvioModal from '@/components/financeiro/ConfigEmailEnvioModal'
import { Mail, Reply, RefreshCw, ExternalLink, Paperclip, X, Send, Check, CheckCheck, PenLine } from 'lucide-react'

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
  const { userProfile } = useAuth()
  const [temConfig, setTemConfig] = useState(false)
  const [configOpen, setConfigOpen] = useState(false) // modal "conectar meu e-mail"
  const [conta, setConta] = useState('')
  const [open, setOpen] = useState(false)
  const [emails, setEmails] = useState([])
  const [pasta, setPasta] = useState('inbox') // inbox | enviados | spam
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [badge, setBadge] = useState(0)
  const boxRef = useRef(null)
  const ultimaMsgRef = useRef(null) // rola a conversa direto pra mensagem mais recente
  const router = useRouter()

  // Assinatura das respostas (HTML colado do Gmail)
  const [assinaturaOpen, setAssinaturaOpen] = useState(false)
  const [assinaturaHtml, setAssinaturaHtml] = useState('')
  const [salvandoAss, setSalvandoAss] = useState(false)
  const assEditorRef = useRef(null)

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
        if (ativo && c && !c.error) setAssinaturaHtml(c.assinatura_html || '')
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

  const carregarCaixa = useCallback(async (fresh, qualPasta) => {
    const p = qualPasta || 'inbox'
    setCarregando(true); setErro('')
    try {
      const r = await fetch(`/api/financeiro/caixa-email?pasta=${p}${fresh ? '&fresh=1' : ''}`, { headers: { ...(await authHeaders()) } })
      const j = await r.json()
      if (j.error) setErro(j.error)
      else if (Array.isArray(j.emails)) { setEmails(j.emails); if (j.conta) setConta(j.conta) }
    } catch { setErro('Falha de conexão.') }
    setCarregando(false)
    carregarBadge()
  }, [carregarBadge])

  const trocarPasta = (p) => {
    if (p === pasta) return
    setPasta(p); setEmails([]); setBusca('')
    carregarCaixa(false, p)
  }

  // Pré-carrega a lista logo que o portal abre → clicar no envelope é instantâneo
  useEffect(() => {
    if (!temConfig) return
    const t = setTimeout(() => carregarCaixa(false), 2500)
    return () => clearTimeout(t)
  }, [temConfig, carregarCaixa])

  const abrirPainel = () => {
    // Sem e-mail conectado ainda → abre direto a tela de conectar o dele
    if (!temConfig) { setConfigOpen(true); return }
    const novo = !open
    setOpen(novo)
    if (novo) carregarCaixa(false, pasta) // cache de 30s no servidor: resposta imediata
  }

  const carregarConversa = useCallback(async (em, silencioso) => {
    if (!silencioso) setCarregandoMsg(true)
    try {
      // 1º tenta a CONVERSA inteira (os dois lados, como no Gmail)
      const rt = await fetch(`/api/financeiro/caixa-email?uid=${em.uid}&pasta=${pasta}&thread=1`, { headers: { ...(await authHeaders()) } })
      const jt = await rt.json()
      if (Array.isArray(jt.mensagens) && jt.mensagens.length) { setDetalhe(jt); if (!silencioso) setCarregandoMsg(false); return }
    } catch { /* cai no detalhe simples */ }
    try {
      const r = await fetch(`/api/financeiro/caixa-email?uid=${em.uid}&pasta=${pasta}`, { headers: { ...(await authHeaders()) } })
      const j = await r.json()
      if (j.error) setErro(j.error)
      else setDetalhe(j)
    } catch { /* mantém modal com erro */ }
    if (!silencioso) setCarregandoMsg(false)
  }, [pasta])

  const abrirMensagem = async (em) => {
    setMsgAberta(em); setDetalhe(null); setResposta(''); setRespOk('')
    carregarConversa(em, false)
  }

  // Conversa carregada → vai direto pra mensagem MAIS RECENTE (conversas de
  // vários dias abriam no topo e a novidade ficava lá embaixo, escondida)
  useEffect(() => {
    if (!detalhe?.mensagens?.length) return
    const t = setTimeout(() => { ultimaMsgRef.current?.scrollIntoView({ block: 'start' }) }, 80)
    return () => clearTimeout(t)
  }, [detalhe])

  const baixarAnexo = async (a, deMsg) => {
    if (!msgAberta && !deMsg) return
    setBaixandoAnexo(a.i)
    const uidAlvo = deMsg?.uid ?? msgAberta.uid
    const pastaAlvo = deMsg?.pasta ?? pasta
    try {
      const r = await fetch(`/api/financeiro/caixa-email?uid=${uidAlvo}&anexo=${a.i}&pasta=${pastaAlvo}`, { headers: { ...(await authHeaders()) } })
      if (!r.ok) throw new Error()
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const el = document.createElement('a')
      el.href = url; el.download = a.nome || 'anexo'; el.click()
      setTimeout(() => URL.revokeObjectURL(url), 30000)
    } catch { alert('Falha ao baixar o anexo.') }
    setBaixandoAnexo(null)
  }

  // Editor de assinatura: abre já com o HTML atual (colado do Gmail)
  useEffect(() => {
    if (assinaturaOpen && assEditorRef.current) assEditorRef.current.innerHTML = assinaturaHtml || ''
  }, [assinaturaOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  const salvarAssinatura = async () => {
    setSalvandoAss(true)
    try {
      const html = assEditorRef.current?.innerHTML || ''
      const r = await fetch('/api/financeiro/config-envio', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ assinatura_html: html }),
      })
      const j = await r.json()
      if (j.error) alert(j.error)
      else { setAssinaturaHtml(html); setAssinaturaOpen(false) }
    } catch { alert('Falha ao salvar a assinatura.') }
    setSalvandoAss(false)
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

  // Desvincula o e-mail do portal (apaga a config; envios/histórico ficam)
  const desvincular = async () => {
    if (!confirm(`Desvincular o e-mail ${conta} do portal?\n\nA caixa some do header e o envio de boletos pelo seu e-mail para de funcionar até conectar de novo. (No Google nada muda — a senha de app continua ativa lá.)`)) return
    try {
      const r = await fetch('/api/financeiro/config-envio', { method: 'DELETE', headers: { ...(await authHeaders()) } })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.error) { alert(j.error || 'Falha ao desvincular.'); return }
      setTemConfig(false); setConta(''); setEmails([]); setBadge(0); setOpen(false); setMsgAberta(null)
    } catch { alert('Falha de conexão ao desvincular.') }
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
      else {
        setRespOk(`Resposta enviada para ${j.para}.`); setResposta('')
        // a cópia cai nos Enviados em ~1-2s — recarrega a conversa pra ela aparecer
        const em = msgAberta
        setTimeout(() => { if (em) carregarConversa(em, true) }, 1800)
      }
    } catch { alert('Falha de conexão ao enviar.') }
    setEnviandoResp(false)
  }

  const chip = { display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: 'var(--portal-text)', fontSize: 12.5, fontWeight: 600 }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        onClick={abrirPainel}
        title={temConfig
          ? `Sua caixa de e-mail (${conta})${badge > 0 ? ` — ${badge} não lido${badge > 1 ? 's' : ''}` : ''}`
          : 'Conectar meu e-mail no portal'}
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
        <div style={{ position: 'absolute', top: 52, right: 0, width: 640, maxWidth: '96vw', maxHeight: '80vh', overflowY: 'auto', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.35)', padding: 14, zIndex: 3000, fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px 10px' }}>
            <Mail size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 15, color: 'var(--portal-text)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Seus e-mails</b>
              <span title={conta} style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{conta}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
              {pasta === 'inbox' && (badge > 0 || emails.some((e) => e.naoLida)) && (
                <button onClick={() => marcarLida(null)} disabled={marcando} title="Marcar TODAS como lidas"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', background: 'transparent', border: '1px solid #16a34a', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', color: '#16a34a', fontSize: 11.5, fontWeight: 700 }}>
                  <CheckCheck size={13} /> {marcando ? '...' : 'todas lidas'}
                </button>
              )}
              <button onClick={() => setAssinaturaOpen(true)} title={assinaturaHtml ? 'Editar a assinatura das suas respostas' : 'Configurar assinatura (cola a do Gmail)'}
                style={{ background: 'transparent', border: `1px solid ${assinaturaHtml ? '#16a34a' : 'var(--portal-border)'}`, borderRadius: 8, padding: '5px 9px', cursor: 'pointer', color: assinaturaHtml ? '#16a34a' : 'var(--portal-text-secondary)', display: 'flex' }}>
                <PenLine size={14} />
              </button>
              <button onClick={() => carregarCaixa(true, pasta)} disabled={carregando} title="Atualizar agora (busca direto na caixa)"
                style={{ background: 'transparent', border: '1px solid var(--portal-border)', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', color: 'var(--portal-text-secondary)', display: 'flex' }}>
                <RefreshCw size={14} className={carregando ? 'spin-envio' : ''} />
              </button>
              <button onClick={desvincular} title="Desvincular meu e-mail do portal"
                style={{ background: 'transparent', border: '1px solid #fca5a5', borderRadius: 8, padding: '5px 9px', cursor: 'pointer', color: '#dc2626', display: 'flex' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Abas: Caixa de entrada · Enviados · Spam */}
          <div style={{ display: 'flex', gap: 4, margin: '0 4px 10px', borderBottom: '1px solid var(--portal-border)' }}>
            {[['inbox', 'Caixa de entrada'], ['enviados', 'Enviados'], ['spam', 'Spam']].map(([p, rot]) => {
              const on = pasta === p
              return (
                <button key={p} onClick={() => trocarPasta(p)}
                  style={{
                    background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px 14px',
                    fontSize: 13.5, fontFamily: 'inherit', fontWeight: on ? 700 : 500,
                    color: on ? '#16a34a' : 'var(--portal-text-secondary)',
                    borderBottom: on ? '2.5px solid #16a34a' : '2.5px solid transparent', marginBottom: -1,
                  }}>
                  {rot}{p === 'inbox' && badge > 0 ? ` (${badge})` : ''}
                </button>
              )
            })}
          </div>

          {/* Filtro de pesquisa da caixa (remetente, assunto, cliente) */}
          <div style={{ position: 'relative', margin: '0 4px 8px' }}>
            <i className="fa fa-search" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-secondary)', fontSize: 12 }} />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar na caixa…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 30px', borderRadius: 9, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', fontSize: 13 }}
            />
            {busca && (
              <button onClick={() => setBusca('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', fontSize: 13 }}>✕</button>
            )}
          </div>

          {carregando && emails.length === 0 ? (
            <div style={{ padding: 26, textAlign: 'center', color: 'var(--portal-text-secondary)', fontSize: 13 }}>Conectando na sua caixa…</div>
          ) : erro && emails.length === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', color: '#dc2626', fontSize: 13 }}>{erro}</div>
          ) : emails.length === 0 ? (
            <div style={{ padding: 22, textAlign: 'center', color: 'var(--portal-text-secondary)', fontSize: 13.5 }}>{pasta === 'spam' ? 'Sem spam. 🎉' : pasta === 'enviados' ? 'Nenhum e-mail enviado.' : 'Caixa vazia.'}</div>
          ) : (() => {
            const termos = busca.trim().toLowerCase().split(/\s+/).filter(Boolean)
            const visiveis = termos.length === 0 ? emails : emails.filter((em) => {
              const alvo = `${em.deNome || ''} ${em.de || ''} ${em.paraNome || ''} ${em.para || ''} ${em.assunto || ''} ${em.cliente || ''}`.toLowerCase()
              return termos.every((t) => alvo.includes(t))
            })
            if (visiveis.length === 0) return (
              <div style={{ padding: 22, textAlign: 'center', color: 'var(--portal-text-secondary)', fontSize: 13 }}>Nada encontrado pra “{busca}”.</div>
            )
            return visiveis.map((em) => (
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
                <b style={{ fontSize: 14, color: 'var(--portal-text)', fontWeight: pasta === 'inbox' && em.naoLida ? 800 : 600 }}>
                  {pasta === 'inbox' && em.naoLida && <span style={{ color: '#16a34a' }}>● </span>}
                  {pasta === 'enviados' ? <>Para: {em.paraNome || em.para || '—'}</> : (em.deNome || em.de)}
                </b>
                <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--portal-text-secondary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmtData(em.data)}</span>
              </div>
              <div style={{ fontSize: 13.5, color: pasta === 'inbox' && em.naoLida ? 'var(--portal-text)' : 'var(--portal-text-secondary)', fontWeight: pasta === 'inbox' && em.naoLida ? 700 : 400, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {em.assunto}
              </div>
              {em.ehResposta && em.cliente && (
                <div style={{ fontSize: 11.5, color: '#16a34a', fontWeight: 700, marginTop: 2 }}>Cliente: {em.cliente}</div>
              )}
            </div>
          ))
          })()}
        </div>
      )}

      {/* ── Assinatura das respostas (cola a do Gmail, com logos e tudo) ── */}
      {assinaturaOpen && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setAssinaturaOpen(false) }}
          style={{ position: 'fixed', inset: 0, zIndex: 4500, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 14, width: 620, maxWidth: '96vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.5)', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--portal-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <PenLine size={16} color="#16a34a" />
              <b style={{ fontSize: 15, color: 'var(--portal-text)', flex: 1 }}>Assinatura das respostas</b>
              <button onClick={() => setAssinaturaOpen(false)} style={{ background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--portal-text-secondary)' }}><X size={15} /></button>
            </div>
            <div style={{ padding: 16, overflowY: 'auto' }}>
              <p style={{ fontSize: 13, color: 'var(--portal-text-secondary)', margin: '0 0 10px', lineHeight: 1.5 }}>
                No Gmail, <b>selecione a sua assinatura</b> no final de um e-mail seu (texto + logos), copie (<b>Ctrl+C</b>) e <b>cole aqui</b> (<b>Ctrl+V</b>) — as imagens vêm junto. Ela sai no fim de toda resposta enviada pelo portal.
              </p>
              <div
                ref={assEditorRef}
                contentEditable
                suppressContentEditableWarning
                style={{ minHeight: 160, maxHeight: '46vh', overflowY: 'auto', border: '1.5px dashed var(--portal-border)', borderRadius: 10, padding: '12px 14px', background: '#ffffff', color: '#111', fontSize: 14, outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
                <button onClick={salvarAssinatura} disabled={salvandoAss}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', cursor: salvandoAss ? 'wait' : 'pointer', fontSize: 13.5, fontWeight: 700 }}>
                  {salvandoAss ? <RefreshCw size={14} className="spin-envio" /> : <Check size={15} />} Salvar assinatura
                </button>
                <button onClick={() => { if (assEditorRef.current) assEditorRef.current.innerHTML = '' }}
                  style={{ background: 'transparent', border: '1px solid var(--portal-border)', borderRadius: 9, padding: '9px 14px', cursor: 'pointer', color: 'var(--portal-text-secondary)', fontSize: 13 }}>
                  Limpar
                </button>
                <span style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>Salvar com o campo vazio remove a assinatura.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Conectar o e-mail (quem ainda não configurou) ── */}
      <ConfigEmailEnvioModal
        open={configOpen}
        emailInicial={userProfile?.email || ''}
        onClose={() => setConfigOpen(false)}
        onSaved={async () => {
          setConfigOpen(false)
          try {
            const r = await fetch('/api/financeiro/config-envio', { headers: { ...(await authHeaders()) } })
            const c = await r.json()
            if (c && !c.error && c.email_envio) {
              setTemConfig(true); setConta(c.email_envio)
              setOpen(true); carregarCaixa(true)
            }
          } catch { /* tenta de novo no próximo clique */ }
        }}
      />

      {/* ── MODAL DE LEITURA (corpo renderizado + anexos + responder) ── */}
      {msgAberta && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setMsgAberta(null) }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 16, width: 820, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 80px rgba(0,0,0,0.5)', fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
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
              {pasta === 'inbox' && msgAberta.naoLida && (
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
              ) : detalhe.mensagens ? (
                /* CONVERSA: os dois lados em sequência (recebidas + suas respostas) */
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {detalhe.mensagens.map((m, i) => {
                    const ultima = i === detalhe.mensagens.length - 1
                    return (
                      <div
                        key={`${m.pasta}-${m.uid}`}
                        ref={ultima ? ultimaMsgRef : undefined}
                        style={{
                          border: ultima ? '2px solid #2563eb' : `1.5px solid ${m.enviado ? '#bbf7d0' : 'var(--portal-border)'}`,
                          borderRadius: 12, overflow: 'hidden',
                          background: m.enviado ? 'rgba(22,163,74,0.06)' : 'var(--portal-bg-card)',
                          boxShadow: ultima ? '0 4px 18px rgba(37,99,235,0.18)' : 'none',
                          opacity: ultima ? 1 : 0.82,
                          scrollMarginTop: 8,
                        }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 14px', borderBottom: '1px solid var(--portal-border)', flexWrap: 'wrap' }}>
                          {ultima && <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: '#2563eb', borderRadius: 6, padding: '2px 8px' }}>MAIS RECENTE</span>}
                          {m.enviado && <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: '#16a34a', borderRadius: 6, padding: '2px 8px' }}>VOCÊ</span>}
                          <b style={{ fontSize: 13.5, color: 'var(--portal-text)' }}>{m.enviado ? 'Você' : (m.deNome || m.de)}</b>
                          <span style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>para {m.paraNome || m.para || '—'}</span>
                          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--portal-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmtData(m.data, true)}</span>
                        </div>
                        {m.html ? (
                          <iframe
                            title={`msg-${m.pasta}-${m.uid}`}
                            sandbox="allow-popups allow-popups-to-escape-sandbox"
                            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
                              body{margin:12px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;word-break:break-word;background:#fff}
                              img{max-width:100%;height:auto}
                              table{max-width:100%}
                              a{color:#1a73e8}
                              blockquote{border-left:3px solid #ddd;margin:8px 0;padding-left:10px;color:#555}
                            </style></head><body>${m.html}</body></html>`}
                            style={{ width: '100%', height: ultima ? '40vh' : 220, border: 'none', background: '#ffffff', display: 'block' }}
                          />
                        ) : (
                          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13.5, margin: 0, padding: '12px 14px', color: 'var(--portal-text)' }}>{m.texto || '(sem conteúdo)'}</pre>
                        )}
                        {m.anexos?.length > 0 && (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 14px', borderTop: '1px dashed var(--portal-border)' }}>
                            {m.anexos.map((a) => (
                              <button key={a.i} onClick={() => baixarAnexo(a, m)} disabled={baixandoAnexo === a.i} style={chip} title={`Baixar (${fmtTamanho(a.tamanho)})`}>
                                {baixandoAnexo === a.i ? <RefreshCw size={13} className="spin-envio" /> : <Paperclip size={13} />}
                                {a.nome} <span style={{ color: 'var(--portal-text-secondary)', fontWeight: 400 }}>{fmtTamanho(a.tamanho)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {msgAberta.chamadoId != null && (
                    <button
                      onClick={() => { setMsgAberta(null); setOpen(false); router.push(`/financeiro/home-financeiro?id=${msgAberta.chamadoId}&tipo=boleto`) }}
                      style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                      <ExternalLink size={14} /> Abrir o card no financeiro
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* HTML renderizado num iframe isolado (sem scripts), com
                      visual de leitor de e-mail: fonte padrão, imagens
                      contidas, links abrindo em aba nova. Texto puro = fallback */}
                  {detalhe.html ? (
                    <iframe
                      title="email"
                      sandbox="allow-popups allow-popups-to-escape-sandbox"
                      srcDoc={`<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>
                        body{margin:14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#111;word-break:break-word;background:#fff}
                        img{max-width:100%;height:auto}
                        table{max-width:100%}
                        a{color:#1a73e8}
                        blockquote{border-left:3px solid #ddd;margin:8px 0;padding-left:10px;color:#555}
                      </style></head><body>${detalhe.html}</body></html>`}
                      style={{ width: '100%', height: '52vh', border: '1px solid var(--portal-border)', borderRadius: 10, background: '#ffffff' }}
                    />
                  ) : (
                    <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13.5, margin: 0, padding: '12px 14px', background: 'var(--portal-bg-secondary)', borderRadius: 10, color: 'var(--portal-text)' }}>{detalhe.texto || '(sem conteúdo)'}</pre>
                  )}
                  {/* Anexos — embaixo do corpo, como no Gmail */}
                  {detalhe.anexos?.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--portal-border)' }}>
                      {detalhe.anexos.map((a) => (
                        <button key={a.i} onClick={() => baixarAnexo(a)} disabled={baixandoAnexo === a.i} style={chip} title={`Baixar (${fmtTamanho(a.tamanho)})`}>
                          {baixandoAnexo === a.i ? <RefreshCw size={13} className="spin-envio" /> : <Paperclip size={13} />}
                          {a.nome} <span style={{ color: 'var(--portal-text-secondary)', fontWeight: 400 }}>{fmtTamanho(a.tamanho)}</span>
                        </button>
                      ))}
                    </div>
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

            {/* Responder (só faz sentido na caixa de entrada) */}
            {pasta === 'inbox' && (
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
                A resposta sai pelo seu e-mail ({conta}) e continua na mesma conversa.{assinaturaHtml ? ' Sua assinatura vai junto.' : ''}
              </div>
            </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
