'use client'
// Bloco "E-MAILS DESTE BOLETO" no card do financeiro: linha do tempo dos
// envios (boleto, lembrete de vencimento) e das RESPOSTAS do cliente.
import { useState, useEffect } from 'react'
import { authHeaders } from '@/lib/auth/client'
import { Mail, Send, Reply, ChevronDown, ChevronUp, Clock } from 'lucide-react'

const TIPO_INFO = {
  boleto:   { label: 'Boleto enviado',                  cor: '#2563eb', Icon: Send },
  lembrete: { label: 'Lembrete de vencimento (5 dias)', cor: '#d97706', Icon: Clock },
  resposta: { label: 'RESPOSTA DO CLIENTE',             cor: '#16a34a', Icon: Reply },
}

const fmtData = (iso) => {
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return '' }
}

export default function EmailsDoCard({ chamadoId }) {
  const [emails, setEmails] = useState([])
  const [aberto, setAberto] = useState(null) // id do e-mail expandido
  const [carregou, setCarregou] = useState(false)

  useEffect(() => {
    let ativo = true
    setEmails([]); setCarregou(false); setAberto(null)
    if (!chamadoId) return
    ;(async () => {
      try {
        const r = await fetch(`/api/financeiro/emails?chamadoId=${chamadoId}`, { headers: { ...(await authHeaders()) } })
        const j = await r.json()
        if (ativo && Array.isArray(j.emails)) setEmails(j.emails)
      } catch { /* sem histórico */ }
      if (ativo) setCarregou(true)
    })()
    return () => { ativo = false }
  }, [chamadoId])

  if (!carregou || emails.length === 0) return null

  return (
    <div style={{ background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text-secondary)', letterSpacing: 1, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Mail size={15} /> E-mails deste boleto
      </div>
      {emails.map((e) => {
        const info = TIPO_INFO[e.tipo] || TIPO_INFO.boleto
        const Icon = info.Icon
        const expandido = aberto === e.id
        const ehResposta = e.tipo === 'resposta'
        return (
          <div key={e.id} style={{ background: 'var(--portal-bg-card)', border: `1px solid ${ehResposta ? '#86efac' : 'var(--portal-border)'}`, borderLeft: `4px solid ${info.cor}`, borderRadius: 10, padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Icon size={14} style={{ color: info.cor, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--portal-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmtData(e.criado_em)}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: info.cor }}>{info.label}{e.parcela_n ? ` — ${e.parcela_n}ª parcela` : ''}</span>
              <button onClick={() => setAberto(expandido ? null : e.id)}
                style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'transparent', border: '1px solid var(--portal-border)', borderRadius: 7, padding: '3px 10px', cursor: 'pointer', color: 'var(--portal-text-secondary)', fontSize: 11.5, fontWeight: 700 }}>
                {expandido ? <ChevronUp size={12} /> : <ChevronDown size={12} />} {expandido ? 'fechar' : ehResposta ? 'ler completa' : 'ver e-mail'}
              </button>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', marginTop: 3, wordBreak: 'break-word' }}>
              {ehResposta ? <>De: <b style={{ color: 'var(--portal-text)' }}>{e.de_email || '—'}</b></> : <>Para: {e.destinatarios || '—'}</>}
            </div>
            {ehResposta && !expandido && e.corpo && (
              <div style={{ fontSize: 13, color: 'var(--portal-text)', marginTop: 6, fontStyle: 'italic', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                “{e.corpo.slice(0, 220)}”
              </div>
            )}
            {expandido && (
              ehResposta
                ? <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 13, margin: '8px 0 0', padding: '10px 12px', background: 'var(--portal-bg-secondary)', borderRadius: 8, color: 'var(--portal-text)', maxHeight: 300, overflowY: 'auto' }}>{e.corpo || '(sem texto)'}</pre>
                : <div style={{ margin: '8px 0 0', padding: '10px 12px', background: '#ffffff', borderRadius: 8, border: '1px solid var(--portal-border)', color: '#111111', fontSize: 13, maxHeight: 300, overflowY: 'auto' }}
                    dangerouslySetInnerHTML={{ __html: e.corpo || '' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}
