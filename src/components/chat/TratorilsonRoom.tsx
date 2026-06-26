'use client'
import React, { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowLeft, Trash2 } from 'lucide-react'

// Conversa do Tratorilson (IA) embutida no painel de Mensagens — usa a mesma
// API do assistente flutuante (/api/assistente/chat + /api/assistente/executar).
const MASCOTE_IMG = (process.env.NEXT_PUBLIC_SUPABASE_URL || '') + '/storage/v1/object/public/catalogo/mascote2-removebg-preview.png'

interface Msg { role: 'user' | 'assistant'; content: string; proposta?: any; feito?: boolean; abrirUrl?: string; moderacao?: boolean }
const SAUDACAO: Msg = { role: 'assistant', content: 'Opa, tudo bem? Eu sou o Tratorilson, da Nova Tratores.\nTô aqui pra te dar uma mão com o portal — peças, catálogo, ordens, PPV, orçamentos, requisições... É só me dizer o que você precisa.' }
const SUGESTOES = ['Buscar uma peça', 'Criar um orçamento', 'Ver requisições', 'Histórico de um cliente']

// Markdown leve: **negrito**, `código`, [texto](url) — preservando quebras de linha
function renderConteudo(text: string): Array<string | React.ReactElement> {
  const out: Array<string | React.ReactElement> = []
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g
  let last = 0, k = 0, m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) out.push(<strong key={k++} style={{ fontWeight: 800 }}>{m[1]}</strong>)
    else if (m[2] !== undefined) out.push(<code key={k++} style={{ background: '#f1f5f9', color: '#dc2626', padding: '1px 6px', borderRadius: 5, fontSize: '0.92em', fontWeight: 700 }}>{m[2]}</code>)
    else {
      const url = m[4], blank = url.startsWith('/api/') || url.startsWith('http')
      out.push(<a key={k++} href={url} target={blank ? '_blank' : '_self'} rel="noreferrer" style={{ color: '#dc2626', fontWeight: 700, textDecoration: 'underline' }}>{m[3]}</a>)
    }
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

interface Props { userName?: string; userId?: string; isAdmin?: boolean; modulos?: string[]; onBack?: () => void }

export default function TratorilsonRoom({ userName = '', userId = '', isAdmin = false, modulos = [], onBack }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([SAUDACAO])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [mascoteErro, setMascoteErro] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, loading])
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 150) }, [])

  const enviar = useCallback(async (e?: React.FormEvent, textoDireto?: string) => {
    e?.preventDefault()
    const texto = (textoDireto ?? input).trim()
    if (!texto || loading) return
    const base = msgs
    const novas = [...msgs, { role: 'user' as const, content: texto }]
    setMsgs(novas); setInput(''); setLoading(true)
    try {
      const r = await fetch('/api/assistente/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: novas.filter((m) => m !== SAUDACAO), userName, userId, isAdmin, modulos }),
      })
      const j = await r.json()
      if (j.bloqueado) setMsgs([...base, { role: 'assistant', content: j.reply, moderacao: true }])
      else setMsgs((m) => [...m, { role: 'assistant', content: j.reply || 'Não consegui responder agora.', proposta: j.proposta }])
    } catch {
      setMsgs((m) => [...m, { role: 'assistant', content: 'Deu ruim na conexão. Tenta de novo?' }])
    }
    setLoading(false)
  }, [input, loading, msgs, userName, userId, isAdmin, modulos])

  const confirmarProposta = useCallback(async (idx: number, proposta: any) => {
    setLoading(true)
    setMsgs((ms) => ms.map((m, i) => (i === idx ? { ...m, feito: true } : m)))
    // OS e Requisição imprimem direto: pré-abre a aba JÁ no clique (preserva o gesto) e depois aponta pro print
    const win = (proposta?.tipo === 'os' || proposta?.tipo === 'requisicao') ? window.open('', '_blank') : null
    try {
      const r = await fetch('/api/assistente/executar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proposta, userName }) })
      const j = await r.json()
      if (r.ok) { const L: any = { orcamento: 'Orçamento', ppv: 'PPV', os: 'OS', requisicao: 'Requisição' }; const extra = j.ppv ? ` PPV ${j.ppv} vinculado gerado.` : ''; setMsgs((ms) => [...ms, { role: 'assistant', content: `Pronto! ${L[proposta.tipo] || ''} ${j.numero || ''} criado.${extra}`, abrirUrl: j.abrirUrl }]); if (win) { if (j.abrirUrl) win.location.href = location.origin + j.abrirUrl; else win.close() } }
      else { if (win) win.close(); setMsgs((ms) => [...ms, { role: 'assistant', content: `Não consegui criar: ${j.error || 'erro'}` }]) }
    } catch { if (win) win.close(); setMsgs((ms) => [...ms, { role: 'assistant', content: 'Erro de conexão ao criar.' }]) }
    setLoading(false)
  }, [userName])

  const cancelarProposta = useCallback((idx: number) => {
    setMsgs((ms) => ms.map((m, i) => (i === idx ? { ...m, feito: true } : m)).concat([{ role: 'assistant', content: 'Beleza, cancelei. Quer ajustar alguma coisa?' }]))
  }, [])

  const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f5f5f0' }} className="chat-room">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', background: 'var(--portal-bg-card)', borderBottom: '1px solid var(--portal-border)', flexShrink: 0 }}>
        {onBack && (
          <button onClick={onBack} title="Voltar" style={{ background: 'none', border: 'none', color: 'var(--portal-text-secondary)', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '6px' }}>
            <ArrowLeft size={20} />
          </button>
        )}
        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'linear-gradient(135deg, #ef4444, #b91c1c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
          {!mascoteErro ? <img src={MASCOTE_IMG} alt="Tratorilson" onError={() => setMascoteErro(true)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <i className="fas fa-robot" style={{ color: '#fff' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '14px', fontWeight: '700', color: 'var(--portal-text)' }}>Tratorilson</p>
          <p style={{ fontSize: '11px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> Assistente de IA · online
          </p>
        </div>
        <button onClick={() => { setMsgs([SAUDACAO]); setInput('') }} title="Limpar conversa" style={{ background: 'none', border: 'none', color: 'var(--portal-text-muted)', cursor: 'pointer', padding: '4px', display: 'flex' }}>
          <Trash2 size={18} />
        </button>
      </div>

      {/* Mensagens */}
      <div ref={bodyRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>
            <div style={{
              maxWidth: '78%', padding: '10px 14px', borderRadius: 16, fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap',
              background: m.moderacao ? '#fffbeb' : m.role === 'user' ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'var(--portal-bg-card)',
              color: m.moderacao ? '#92400e' : m.role === 'user' ? '#fff' : 'var(--portal-text)',
              border: m.moderacao ? '1px solid #fcd34d' : m.role === 'user' ? 'none' : '1px solid var(--portal-border)',
              boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              borderBottomRightRadius: m.role === 'user' ? 5 : 16, borderBottomLeftRadius: m.role === 'user' ? 16 : 5,
            }}>
              {m.moderacao && <i className="fas fa-triangle-exclamation" style={{ marginRight: 7, color: '#d97706' }} />}
              {m.role === 'assistant' ? renderConteudo(m.content) : m.content}
            </div>

            {m.abrirUrl && (
              <a href={m.abrirUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 11, background: 'linear-gradient(135deg, #0ea5a4, #0d9488)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}><i className="fas fa-up-right-from-square" /> Abrir / Imprimir</a>
            )}

            {m.proposta && !m.feito && (
              <div style={{ width: '92%', border: '1px solid #fecaca', borderRadius: 15, overflow: 'hidden', background: 'var(--portal-bg-card)', boxShadow: '0 6px 18px rgba(15,23,42,0.08)' }}>
                <div style={{ padding: '11px 14px', background: 'linear-gradient(135deg, #fef2f2, #fee2e2)', borderBottom: '1px solid #fee2e2', fontSize: 13, fontWeight: 800, color: '#991b1b', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className="fas fa-file-circle-plus" />
                  Criar {({ orcamento: 'Orçamento', ppv: 'PPV', os: 'OS', requisicao: 'Requisição' } as any)[m.proposta.tipo] || ''}{m.proposta.cliente?.nome ? ' — ' + m.proposta.cliente.nome : ''}
                </div>
                {m.proposta.itens ? (
                  <>
                    <div style={{ maxHeight: 180, overflow: 'auto' }}>
                      {(m.proposta.itens || []).map((it: any, k: number) => (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid #f5f7fa', fontSize: 12.5 }}>
                          <code style={{ fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>{it.codigo}</code>
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.descricao}</span>
                          <span style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{it.quantidade}× {brl(it.preco)}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #eef0f3', fontSize: 13 }}>
                      <span style={{ color: '#64748b' }}>Total</span><b>{brl(m.proposta.total)}</b>
                    </div>
                  </>
                ) : (
                  <div style={{ maxHeight: 220, overflow: 'auto' }}>
                    {(m.proposta.resumo || []).map((f: any, k: number) => (
                      <div key={k} style={{ display: 'flex', gap: 8, padding: '8px 14px', borderBottom: '1px solid #f5f7fa', fontSize: 12.5 }}>
                        <span style={{ color: '#94a3b8', minWidth: 80, fontWeight: 700 }}>{f.label}</span>
                        <span style={{ flex: 1 }}>{f.valor}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, padding: 12 }}>
                  <button onClick={() => cancelarProposta(i)} style={{ flex: 1, padding: '10px', borderRadius: 11, border: '1px solid #e2e8f0', background: 'var(--portal-bg-card)', color: '#475569', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
                  <button onClick={() => confirmarProposta(i, m.proposta)} disabled={loading} style={{ flex: 1.4, padding: '10px', borderRadius: 11, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 13, opacity: loading ? 0.6 : 1 }}>Confirmar e criar</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {msgs.length === 1 && !loading && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
            {SUGESTOES.map((s) => (
              <button key={s} onClick={() => enviar(undefined, s)} style={{ border: '1px solid #fecaca', background: 'var(--portal-bg-card)', color: '#b91c1c', padding: '8px 13px', borderRadius: 14, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{s}</button>
            ))}
          </div>
        )}
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '12px 16px', borderRadius: 16, borderBottomLeftRadius: 5, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="trt-dot" style={{ animationDelay: '0s' }} />
              <span className="trt-dot" style={{ animationDelay: '.18s' }} />
              <span className="trt-dot" style={{ animationDelay: '.36s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={enviar} style={{ display: 'flex', gap: 9, padding: '12px 16px', borderTop: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', flexShrink: 0 }}>
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escreva sua mensagem…" style={{ flex: 1, padding: '12px 16px', borderRadius: 14, border: '1px solid var(--portal-border)', fontSize: 14, outline: 'none', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)' }} />
        <button type="submit" disabled={loading || !input.trim()} style={{ width: 48, height: 48, borderRadius: 14, border: 'none', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: '#fff', cursor: 'pointer', fontSize: 16, opacity: loading || !input.trim() ? 0.45 : 1, flexShrink: 0 }}><i className="fas fa-paper-plane" /></button>
      </form>

      <style>{`
        @keyframes trtDot { 0%, 60%, 100% { transform: translateY(0); opacity: .4; } 30% { transform: translateY(-4px); opacity: 1; } }
        .trt-dot { width: 7px; height: 7px; border-radius: 50%; background: #dc2626; display: inline-block; animation: trtDot 1.2s infinite; }
      `}</style>
    </div>
  )
}
