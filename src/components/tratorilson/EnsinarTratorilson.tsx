'use client'
// MODO ENSINO do Tratorilson (só Dev): chat pra ensinar regras + a lista da
// memória (única — vale no chat do portal E no atendimento do NovaZap/WhatsApp).
import { useCallback, useEffect, useRef, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import { GraduationCap, Loader2, Send, Pencil, Check, X, Power } from 'lucide-react'

interface Msg { role: 'user' | 'assistant'; content: string }
interface Memoria { id: number; conteudo: string; escopo: string; ativo: boolean; criado_por?: string | null }

const ESCOPO_INFO: Record<string, { rot: string; bg: string; cor: string }> = {
  geral: { rot: 'Portal + WhatsApp', bg: '#dcfce7', cor: '#15803d' },
  portal: { rot: 'Só portal', bg: '#dbeafe', cor: '#1d4ed8' },
  clientes: { rot: 'Só WhatsApp', bg: '#ffedd5', cor: '#c2410c' },
}

const SAUDACAO: Msg = {
  role: 'assistant',
  content: 'Modo ensino ligado. Me explica o que você quer que eu passe a fazer (ou a saber) que eu gravo na memória — vale pra mim aqui no portal e no atendimento dos clientes no WhatsApp. Também posso listar, corrigir ou esquecer regras.',
}

export default function EnsinarTratorilson({ userName }: { userName?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([SAUDACAO])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [memorias, setMemorias] = useState<Memoria[]>([])
  const [aviso, setAviso] = useState('')
  const [editando, setEditando] = useState<number | null>(null)
  const [editTexto, setEditTexto] = useState('')
  const [mostrarInativas, setMostrarInativas] = useState(false)
  const fimRef = useRef<HTMLDivElement>(null)

  const carregarMemorias = useCallback(async () => {
    try {
      const r = await fetch('/api/assistente/ensinar', { headers: { ...(await authHeaders()) } })
      const j = await r.json()
      if (Array.isArray(j.memorias)) setMemorias(j.memorias)
      setAviso(j.aviso || '')
    } catch { /* offline */ }
  }, [])
  useEffect(() => { carregarMemorias() }, [carregarMemorias])

  useEffect(() => { fimRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const enviar = async () => {
    const t = texto.trim()
    if (!t || enviando) return
    const novas: Msg[] = [...msgs, { role: 'user', content: t }]
    setMsgs(novas); setTexto(''); setEnviando(true)
    try {
      const r = await fetch('/api/assistente/ensinar', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ messages: novas, userName }),
      })
      const j = await r.json()
      setMsgs((prev) => [...prev, { role: 'assistant', content: j.reply || j.error || 'Sem resposta.' }])
      carregarMemorias()
    } catch {
      setMsgs((prev) => [...prev, { role: 'assistant', content: 'Falha de conexão — tenta de novo.' }])
    } finally { setEnviando(false) }
  }

  const patch = async (id: number, body: Record<string, unknown>) => {
    try {
      const r = await fetch('/api/assistente/ensinar', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id, ...body }),
      })
      if ((await r.json()).ok) carregarMemorias()
    } catch { /* silencioso */ }
  }

  const visiveis = memorias.filter((m) => mostrarInativas || m.ativo)

  const card: React.CSSProperties = { background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 14 }

  return (
    <div style={{ ...card, marginTop: 16, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--portal-border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,#7c3aed,#4c1d95)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <GraduationCap size={18} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--portal-text)' }}>Ensinar o Tratorilson <span style={{ fontSize: 11, fontWeight: 700, color: '#7c3aed', background: '#f3e8ff', borderRadius: 6, padding: '2px 8px', marginLeft: 6 }}>SÓ DEV</span></div>
          <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Memória única: o que ele aprende aqui vale no chat do portal E no atendimento dos clientes no WhatsApp.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.2fr) minmax(300px, 1fr)', gap: 0 }}>
        {/* Chat de ensino */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--portal-border)', minHeight: 420, maxHeight: 560 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%',
                background: m.role === 'user' ? '#7c3aed' : 'var(--portal-bg-secondary)',
                color: m.role === 'user' ? '#fff' : 'var(--portal-text)',
                borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                padding: '9px 13px', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap',
              }}>{m.content}</div>
            ))}
            {enviando && <div style={{ alignSelf: 'flex-start', color: 'var(--portal-text-muted)', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={13} className="spin" /> pensando…</div>}
            <div ref={fimRef} />
          </div>
          <div style={{ borderTop: '1px solid var(--portal-border)', padding: 12, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={texto} onChange={(e) => setTexto(e.target.value)} rows={2}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
              placeholder="Ensina alguma coisa… (Enter envia, Shift+Enter quebra linha)"
              style={{ flex: 1, resize: 'none', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', fontSize: 13.5, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <button onClick={enviar} disabled={enviando || !texto.trim()}
              style={{ width: 42, height: 42, borderRadius: 10, border: 'none', background: enviando || !texto.trim() ? 'var(--portal-text-faint)' : '#7c3aed', color: '#fff', cursor: enviando || !texto.trim() ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {enviando ? <Loader2 size={17} className="spin" /> : <Send size={17} />}
            </button>
          </div>
        </div>

        {/* Memória */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 420, maxHeight: 560 }}>
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--portal-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Memória ({memorias.filter((m) => m.ativo).length})</span>
            <span style={{ flex: 1 }} />
            <label style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
              <input type="checkbox" checked={mostrarInativas} onChange={(e) => setMostrarInativas(e.target.checked)} /> mostrar esquecidas
            </label>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aviso && <div style={{ fontSize: 12.5, color: '#d97706', padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>{aviso}</div>}
            {visiveis.length === 0 && !aviso && (
              <div style={{ fontSize: 13, color: 'var(--portal-text-muted)', textAlign: 'center', padding: 24 }}>Nenhuma regra ainda — ensina a primeira ali no chat.</div>
            )}
            {visiveis.map((m) => {
              const info = ESCOPO_INFO[m.escopo] || ESCOPO_INFO.geral
              return (
                <div key={m.id} style={{ border: '1px solid var(--portal-border)', borderRadius: 10, padding: '9px 11px', opacity: m.ativo ? 1 : 0.55, background: 'var(--portal-bg-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>#{m.id}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 800, background: info.bg, color: info.cor, borderRadius: 6, padding: '2px 8px' }}>{info.rot}</span>
                    {!m.ativo && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#dc2626' }}>esquecida</span>}
                    <span style={{ flex: 1 }} />
                    {editando === m.id ? (
                      <>
                        <button title="Salvar" onClick={() => { patch(m.id, { conteudo: editTexto }); setEditando(null) }} style={{ background: 'none', border: 'none', color: '#16a34a', cursor: 'pointer', padding: 2 }}><Check size={14} /></button>
                        <button title="Cancelar" onClick={() => setEditando(null)} style={{ background: 'none', border: 'none', color: 'var(--portal-text-muted)', cursor: 'pointer', padding: 2 }}><X size={14} /></button>
                      </>
                    ) : (
                      <>
                        <button title="Editar" onClick={() => { setEditando(m.id); setEditTexto(m.conteudo) }} style={{ background: 'none', border: 'none', color: 'var(--portal-text-muted)', cursor: 'pointer', padding: 2 }}><Pencil size={13} /></button>
                        <button title={m.ativo ? 'Esquecer (desativar)' : 'Reativar'} onClick={() => patch(m.id, { ativo: !m.ativo })} style={{ background: 'none', border: 'none', color: m.ativo ? '#dc2626' : '#16a34a', cursor: 'pointer', padding: 2 }}><Power size={13} /></button>
                      </>
                    )}
                  </div>
                  {editando === m.id ? (
                    <textarea value={editTexto} onChange={(e) => setEditTexto(e.target.value)} rows={3}
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: 8, borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', fontFamily: 'inherit', resize: 'vertical' }} />
                  ) : (
                    <div style={{ fontSize: 12.5, color: 'var(--portal-text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{m.conteudo}</div>
                  )}
                  {m.criado_por && <div style={{ fontSize: 10.5, color: 'var(--portal-text-faint)', marginTop: 4 }}>por {m.criado_por}</div>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
