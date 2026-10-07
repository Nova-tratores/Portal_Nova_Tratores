'use client'
// CENTRAL DE TRABALHO — Nova tarefa. Toda tarefa mora DENTRO de um ticket
// (um que eu criei, pra mim ou pra outra pessoa, ou que eu recebi) e aparece
// na caixa "Tarefas deste ticket". Não existe mais tarefa solta.
import { useEffect, useMemo, useState } from 'react'
import { X, SquareCheck, Search, Plus } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { useAuth } from '@/hooks/useAuth'
import type { Ticket } from '@/lib/tickets/constantes'
import UserSelect from '@/components/tickets/UserSelect'

const VERDE = '#16a34a'
const br = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)

export default function FormTarefa({ onFechar, onCriada, onNovoTicket, ticketInicial }: {
  onFechar: () => void
  onCriada: (ticketId: string) => void
  /** Sem ticket nenhum: atalho pra criar um. */
  onNovoTicket: () => void
  ticketInicial?: string
}) {
  const { userProfile } = useAuth()
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [quadros, setQuadros] = useState<Record<string, { nome: string; cor: string }>>({})
  const [usuarios, setUsuarios] = useState<Record<string, { nome: string }>>({})
  const [busca, setBusca] = useState('')
  const [ticketId, setTicketId] = useState(ticketInicial || '')
  const [titulo, setTitulo] = useState('')
  const [resp, setResp] = useState('')
  const [prazo, setPrazo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { if (userProfile?.id && !resp) setResp(userProfile.id) }, [userProfile?.id, resp])
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const res = await fetch('/api/trabalho/central', { headers: await authHeaders() })
        const json = await res.json()
        if (!vivo) return
        if (!res.ok) { setErro(json.error || 'Falha ao carregar seus tickets'); setTickets([]); return }
        setTickets(json.paraTarefa || []); setQuadros(json.quadros || {}); setUsuarios(json.usuarios || {})
      } catch { if (vivo) { setErro('Falha de conexão'); setTickets([]) } }
    })()
    return () => { vivo = false }
  }, [])

  const eu = userProfile?.id
  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return (tickets || []).filter((t) => !q || t.titulo.toLowerCase().includes(q) || String(t.numero).includes(q.replace('#', '')))
  }, [tickets, busca])

  const salvar = async () => {
    setErro('')
    if (!ticketId) { setErro('Escolha o ticket da tarefa.'); return }
    if (!titulo.trim()) { setErro('Escreva a tarefa.'); return }
    setSalvando(true)
    try {
      const res = await fetch(`/api/tickets/${ticketId}/tarefas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ titulo: titulo.trim(), atribuido_a: resp || null, prazo: prazo || null }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(json.error || 'Falha ao criar a tarefa'); return }
      onCriada(ticketId)
    } catch { setErro('Falha de conexão') } finally { setSalvando(false) }
  }

  const campo: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)', outline: 'none' }
  const rotulo: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--portal-text-secondary,#555)', textTransform: 'uppercase', letterSpacing: .4 }

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onFechar() }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ft-t" style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: 'var(--portal-surface,#fff)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,.3)' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--portal-border,#eee)' }}>
          <h2 id="ft-t" style={{ margin: 0, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--portal-text,#111)' }}><SquareCheck size={18} color={VERDE} /> Nova tarefa</h2>
          <button onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}><X size={18} /></button>
        </header>

        <div style={{ padding: 18, overflowY: 'auto', display: 'grid', gap: 14 }}>
          <div>
            <span style={rotulo}>Em qual ticket?</span>
            {tickets === null ? (
              <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Carregando seus tickets...</div>
            ) : tickets.length === 0 ? (
              <div style={{ padding: 14, borderRadius: 10, border: '1px dashed var(--portal-border,#ddd)', fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
                Toda tarefa fica dentro de um ticket, e você não tem nenhum em aberto.
                <button onClick={onNovoTicket} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '8px 12px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  <Plus size={14} /> Criar um ticket
                </button>
              </div>
            ) : (
              <>
                <div style={{ position: 'relative', marginBottom: 6 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: 11, opacity: .5 }} />
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título ou número" style={{ ...campo, paddingLeft: 30 }} />
                </div>
                <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 10 }}>
                  {filtrados.map((t) => {
                    const q = t.quadro_id ? quadros[t.quadro_id] : null
                    const ativo = t.id === ticketId
                    const papel = t.responsavel_id === eu ? (t.solicitante_id === eu ? 'para mim' : `de ${usuarios[t.solicitante_id]?.nome || '—'}`) : `para ${usuarios[t.responsavel_id]?.nome || '—'}`
                    return (
                      <button key={t.id} type="button" onClick={() => setTicketId(t.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--portal-border,#f0f0f0)', cursor: 'pointer', background: ativo ? 'rgba(22,163,74,.1)' : 'transparent', color: 'var(--portal-text,#111)' }}>
                        <span style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: q?.cor || 'var(--portal-border,#d4d4d4)', flex: 'none' }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{t.numero} {t.titulo}</span>
                          <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>{papel}{q ? ` · ${q.nome}` : ''}{t.prazo ? ` · até ${br(t.prazo)}` : ''}</span>
                        </span>
                        {ativo && <SquareCheck size={16} color={VERDE} />}
                      </button>
                    )
                  })}
                  {filtrados.length === 0 && <div style={{ padding: 12, fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Nenhum ticket com essa busca.</div>}
                </div>
              </>
            )}
          </div>

          <div>
            <label style={rotulo} htmlFor="ft-titulo">Tarefa</label>
            <input id="ft-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} placeholder="Ex.: pedir orçamento do vidro" style={campo}
              onKeyDown={(e) => { if (e.key === 'Enter') salvar() }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 160px', gap: 10 }}>
            <div>
              <span style={rotulo}>Quem faz</span>
              <UserSelect value={resp} onChange={(id) => setResp(id)} placeholder="Responsável" />
            </div>
            <div>
              <label style={rotulo} htmlFor="ft-prazo">Prazo</label>
              <input id="ft-prazo" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} style={campo} />
            </div>
          </div>
          {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        </div>

        <footer style={{ padding: '12px 18px', borderTop: '1px solid var(--portal-border,#eee)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onFechar} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text,#111)', fontWeight: 600 }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando || !ticketId || !titulo.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: VERDE, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: salvando || !ticketId || !titulo.trim() ? .6 : 1 }}>
            <Plus size={15} /> {salvando ? 'Criando...' : 'Criar tarefa'}
          </button>
        </footer>
      </div>
    </div>
  )
}
