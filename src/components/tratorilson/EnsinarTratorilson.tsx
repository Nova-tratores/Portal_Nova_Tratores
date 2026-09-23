'use client'
// MODO ENSINO do Tratorilson (só Dev): chat pra ensinar regras + a lista da
// memória (única — vale no chat do portal E no atendimento do NovaZap/WhatsApp).
import { useCallback, useEffect, useRef, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import { GraduationCap, Loader2, Send, Pencil, Check, X, Power } from 'lucide-react'

interface Msg { role: 'user' | 'assistant'; content: string }
interface Memoria { id: number; conteudo: string; escopo: string; modulo?: string; ativo: boolean; criado_por?: string | null }

const MODULO_ROTULO: Record<string, string> = {
  geral: 'Geral',
  chatwoot: 'WhatsApp / NovaZap',
  revisoes: 'Revisões e orçamentos',
  pos: 'Pós-Vendas (OS)',
  ppv: 'Peças (PPV)',
  requisicoes: 'Requisições',
  financeiro: 'Financeiro',
}

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

  // ── Perguntas do Tratorilson (situações novas do zap) + quem recebe o alerta ──
  interface Pergunta { id: number; criado_em: string; contato_nome?: string; contato_telefone?: string; pergunta: string; contexto?: string; status: string; resposta?: string; respondido_por?: string }
  interface UsuarioPortal { nome: string; email: string; avatar_url?: string }
  const [perguntas, setPerguntas] = useState<Pergunta[]>([])
  const [respostaPerg, setRespostaPerg] = useState<Record<number, string>>({})
  const [usuarios, setUsuarios] = useState<UsuarioPortal[]>([])
  const [notificados, setNotificados] = useState<string[]>([])
  const [salvandoNotif, setSalvandoNotif] = useState(false)
  const [avisoPerg, setAvisoPerg] = useState('')

  const carregarPerguntas = useCallback(async () => {
    try {
      const r = await fetch('/api/tratorilson/perguntas', { headers: { ...(await authHeaders()) } })
      const j = await r.json()
      if (Array.isArray(j.perguntas)) setPerguntas(j.perguntas)
      if (j.aviso) setAvisoPerg(j.aviso)
    } catch { /* offline */ }
  }, [])
  const carregarNotificados = useCallback(async () => {
    try {
      const r = await fetch('/api/tratorilson/notificados', { headers: { ...(await authHeaders()) } })
      const j = await r.json()
      if (Array.isArray(j.usuarios)) setUsuarios(j.usuarios)
      if (Array.isArray(j.notificados)) setNotificados(j.notificados.map((n: any) => String(n.email || '').toLowerCase()))
    } catch { /* offline */ }
  }, [])
  useEffect(() => { carregarPerguntas(); carregarNotificados() }, [carregarPerguntas, carregarNotificados])

  const alternarNotificado = (email: string) => {
    const e = email.toLowerCase()
    setNotificados((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : (prev.length >= 5 ? prev : [...prev, e]))
  }
  const salvarNotificados = async () => {
    setSalvandoNotif(true)
    try {
      const lista = usuarios.filter((u) => notificados.includes(u.email.toLowerCase())).map((u) => ({ email: u.email, nome: u.nome }))
      const r = await fetch('/api/tratorilson/notificados', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ notificados: lista }),
      })
      if (!r.ok) alert('Não salvou: ' + ((await r.json()).error || r.status))
    } catch { alert('Falha de conexão.') }
    setSalvandoNotif(false)
  }
  const responderPergunta = async (id: number) => {
    const resposta = (respostaPerg[id] || '').trim()
    if (!resposta) return
    try {
      const r = await fetch('/api/tratorilson/perguntas', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id, resposta }),
      })
      const j = await r.json()
      if (r.status === 409) alert(`Alguém respondeu primeiro${j.por ? ` (${j.por})` : ''}.`)
      else if (!r.ok) { alert('Não deu: ' + (j.error || r.status)); return }
      setRespostaPerg((m) => ({ ...m, [id]: '' }))
      carregarPerguntas(); carregarMemorias()
    } catch { alert('Falha de conexão.') }
  }
  const fecharPergunta = async (id: number) => {
    if (!confirm('Fechar esta pergunta SEM responder? Ele continua sem saber lidar com essa situação.')) return
    try {
      await fetch('/api/tratorilson/perguntas', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id }),
      })
      carregarPerguntas()
    } catch { /* silencioso */ }
  }

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

  // ── filtros por MÓDULO (botões) + SUBMÓDULO ("ppv/catalogo" → Catálogo dentro de Peças)
  const [modSel, setModSel] = useState('todas')
  const [subSel, setSubSel] = useState('')
  const baseDe = (m: Memoria) => String(m.modulo || 'geral').split('/')[0]
  const subDe = (m: Memoria) => String(m.modulo || 'geral').split('/').slice(1).join('/')
  const submodulos = [...new Set(visiveis.filter((m) => baseDe(m) === modSel).map(subDe).filter(Boolean))].sort()
  const filtradas = visiveis.filter((m) =>
    modSel === 'todas' ? true : baseDe(m) === modSel && (subSel === '' || subDe(m) === subSel))
  const btnMod = (on: boolean): React.CSSProperties => ({
    border: on ? 'none' : '1px solid var(--portal-border)', borderRadius: 8, padding: '5px 12px',
    fontSize: 12, fontWeight: 700, cursor: 'pointer',
    background: on ? '#7c3aed' : 'var(--portal-bg-card)', color: on ? '#fff' : 'var(--portal-text-secondary)',
  })
  const btnSub = (on: boolean): React.CSSProperties => ({
    border: on ? 'none' : '1px solid var(--portal-border)', borderRadius: 20, padding: '3px 11px',
    fontSize: 11.5, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
    background: on ? '#a78bfa' : 'var(--portal-bg-card)', color: on ? '#fff' : 'var(--portal-text-secondary)',
  })

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
          {/* Botões de MÓDULO (e submódulos dentro do módulo escolhido) */}
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--portal-border)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <button onClick={() => { setModSel('todas'); setSubSel('') }} style={btnMod(modSel === 'todas')}>Todas ({visiveis.length})</button>
            {Object.keys(MODULO_ROTULO).filter((mod) => visiveis.some((m) => baseDe(m) === mod)).map((mod) => (
              <button key={mod} onClick={() => { setModSel(mod); setSubSel('') }} style={btnMod(modSel === mod)}>
                {MODULO_ROTULO[mod]} ({visiveis.filter((m) => baseDe(m) === mod).length})
              </button>
            ))}
          </div>
          {modSel !== 'todas' && submodulos.length > 0 && (
            <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--portal-border)', display: 'flex', flexWrap: 'wrap', gap: 6, background: 'var(--portal-bg-secondary)' }}>
              <button onClick={() => setSubSel('')} style={btnSub(subSel === '')}>Tudo</button>
              {submodulos.map((sub) => (
                <button key={sub} onClick={() => setSubSel(sub)} style={btnSub(subSel === sub)}>
                  {sub.replace(/-/g, ' ')} ({visiveis.filter((m) => baseDe(m) === modSel && subDe(m) === sub).length})
                </button>
              ))}
            </div>
          )}
          <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aviso && <div style={{ fontSize: 12.5, color: '#d97706', padding: '8px 10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8 }}>{aviso}</div>}
            {filtradas.length === 0 && !aviso && (
              <div style={{ fontSize: 13, color: 'var(--portal-text-muted)', textAlign: 'center', padding: 24 }}>Nenhuma regra aqui ainda — ensina no chat que ela entra no módulo certo.</div>
            )}
            {filtradas.map((m) => {
              const info = ESCOPO_INFO[m.escopo] || ESCOPO_INFO.geral
              return (
                <div key={m.id} style={{ border: '1px solid var(--portal-border)', borderRadius: 10, padding: '9px 11px', opacity: m.ativo ? 1 : 0.55, background: 'var(--portal-bg-card)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)' }}>#{m.id}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 800, background: info.bg, color: info.cor, borderRadius: 6, padding: '2px 8px' }}>{info.rot}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, background: '#f3e8ff', color: '#7c3aed', borderRadius: 6, padding: '2px 8px', textTransform: 'capitalize' }}>{String(m.modulo || 'geral').replace('/', ' › ').replace(/-/g, ' ')}</span>
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

      {/* ── PERGUNTAS do Tratorilson: situações novas que ele não soube lidar ── */}
      <div style={{ borderTop: '1px solid var(--portal-border)', padding: '16px 18px' }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--portal-text)', marginBottom: 4 }}>
          Perguntas do Tratorilson
          {perguntas.filter((p) => p.status === 'aberta').length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 800, background: '#fee2e2', color: '#b91c1c', borderRadius: 999, padding: '2px 9px' }}>
              {perguntas.filter((p) => p.status === 'aberta').length} em aberto
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginBottom: 10 }}>
          Quando ele NÃO SABE lidar com uma situação no WhatsApp, ele pergunta aqui (e no alerta central dos notificados). A resposta vira regra na memória.
        </div>
        {avisoPerg && <div style={{ fontSize: 12, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '7px 10px', marginBottom: 10 }}>{avisoPerg}</div>}
        {perguntas.length === 0 && !avisoPerg && <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>Nenhuma pergunta até agora.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {perguntas.filter((p) => p.status === 'aberta').map((p) => (
            <div key={p.id} style={{ border: '1px solid var(--portal-border)', borderLeft: '4px solid #7c3aed', borderRadius: 10, padding: '10px 14px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text)' }}>
                {p.contato_nome || 'Contato'}{p.contato_telefone ? ` · ${p.contato_telefone}` : ''}
                <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, background: '#f3e8ff', color: '#7c3aed', borderRadius: 6, padding: '1px 7px' }}>ABERTA</span>
              </div>
              {p.contexto && <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', marginTop: 2 }}>Cliente disse: “{p.contexto}”</div>}
              <div style={{ fontSize: 13, color: 'var(--portal-text)', marginTop: 6, lineHeight: 1.5 }}>🤖 {p.pergunta}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-start' }}>
                <textarea value={respostaPerg[p.id] || ''} onChange={(e) => setRespostaPerg((m) => ({ ...m, [p.id]: e.target.value }))}
                  placeholder="Explica o que ele deve fazer/responder…" rows={2}
                  style={{ flex: 1, boxSizing: 'border-box', fontSize: 12.5, padding: 8, borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', fontFamily: 'inherit', resize: 'vertical' }} />
                <button onClick={() => responderPergunta(p.id)} disabled={!(respostaPerg[p.id] || '').trim()}
                  style={{ border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: '#7c3aed', color: '#fff', opacity: (respostaPerg[p.id] || '').trim() ? 1 : 0.5 }}>Ensinar</button>
                <button onClick={() => fecharPergunta(p.id)} title="Fechar sem responder"
                  style={{ border: '1px solid var(--portal-border)', borderRadius: 8, padding: '8px 10px', fontSize: 12, cursor: 'pointer', background: 'var(--portal-bg-card)', color: 'var(--portal-text-muted)' }}>✕</button>
              </div>
            </div>
          ))}
          {perguntas.filter((p) => p.status !== 'aberta').slice(0, 8).map((p) => (
            <div key={p.id} style={{ border: '1px solid var(--portal-border)', borderRadius: 10, padding: '8px 14px', opacity: 0.75 }}>
              <div style={{ fontSize: 12, color: 'var(--portal-text)' }}>
                🤖 {p.pergunta}
                <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 800, background: p.status === 'respondida' ? '#dcfce7' : 'var(--portal-bg-secondary)', color: p.status === 'respondida' ? '#15803d' : 'var(--portal-text-muted)', borderRadius: 6, padding: '1px 7px' }}>{p.status === 'respondida' ? 'RESPONDIDA' : 'FECHADA'}</span>
              </div>
              {p.resposta && <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginTop: 3 }}>↳ {p.resposta} <span style={{ color: 'var(--portal-text-faint)' }}>— {p.respondido_por}</span></div>}
            </div>
          ))}
        </div>
      </div>

      {/* ── Quem recebe o alerta central das perguntas (até 5) ── */}
      <div style={{ borderTop: '1px solid var(--portal-border)', padding: '16px 18px' }}>
        <div style={{ fontWeight: 800, fontSize: 14, color: 'var(--portal-text)', marginBottom: 4 }}>Quem recebe as perguntas <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--portal-text-muted)' }}>— escolha até 5 usuários ({notificados.length}/5)</span></div>
        <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginBottom: 10 }}>
          Estes usuários veem o alerta no meio da tela quando o Tratorilson pergunta. O primeiro que responder fecha pra todos. Sem ninguém escolhido, os admins recebem.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
          {usuarios.map((u) => {
            const on = notificados.includes(u.email.toLowerCase())
            return (
              <button key={u.email} onClick={() => alternarNotificado(u.email)}
                title={u.email}
                style={{ display: 'flex', alignItems: 'center', gap: 6, border: on ? 'none' : '1px solid var(--portal-border)', borderRadius: 20, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: on ? '#7c3aed' : 'var(--portal-bg-card)', color: on ? '#fff' : 'var(--portal-text-secondary)' }}>
                {u.avatar_url ? <img src={u.avatar_url} alt="" style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} /> : null}
                {u.nome || u.email}
              </button>
            )
          })}
        </div>
        <button onClick={salvarNotificados} disabled={salvandoNotif}
          style={{ marginTop: 12, border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', background: '#7c3aed', color: '#fff', opacity: salvandoNotif ? 0.6 : 1 }}>
          {salvandoNotif ? 'Salvando…' : 'Salvar notificados'}
        </button>
      </div>
    </div>
  )
}
