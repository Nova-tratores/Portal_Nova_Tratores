'use client'
// CENTRAL DE TRABALHO — Nova tarefa. Toda tarefa mora DENTRO de um ticket
// (um que eu criei, pra mim ou pra outra pessoa, ou que eu recebi) e aparece
// na caixa "Tarefas deste ticket". Não existe mais tarefa solta.
// Ordem: PARA QUEM → o que é → EM QUAL TICKET. Para outra pessoa só aparecem
// os tickets que vocês têm em comum; se nenhum é do assunto, dá para pedir que
// ela abra um ticket novo (/api/trabalho/pedir-ticket → notificação).
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, SquareCheck, Search, Plus, Send } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { useAuth } from '@/hooks/useAuth'
import type { Ticket } from '@/lib/tickets/constantes'
import UserSelect from '@/components/tickets/UserSelect'
import SeletorDataAgenda from './SeletorDataAgenda'
import { casaBusca } from '@/lib/texto'

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
  const [envolvidos, setEnvolvidos] = useState<Record<string, string[]>>({})
  const [respNome, setRespNome] = useState('')
  const [pedido, setPedido] = useState<'' | 'enviando' | 'enviado'>('')
  const [busca, setBusca] = useState('')
  const [ticketId, setTicketId] = useState(ticketInicial || '')
  const [titulo, setTitulo] = useState('')
  const [resp, setResp] = useState('')
  const [prazo, setPrazo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  // fundo escuro: só fecha se o clique começou E terminou nele (arrastar seleção não fecha)
  const downNoFundo = useRef(false)
  const fecharPeloFundo = () => {
    if (titulo.trim() && !confirm('Descartar o que você escreveu?')) return
    onFechar()
  }

  useEffect(() => { if (userProfile?.id && !resp) setResp(userProfile.id) }, [userProfile?.id, resp])
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const res = await fetch('/api/trabalho/central', { headers: await authHeaders() })
        const json = await res.json()
        if (!vivo) return
        if (!res.ok) { setErro(json.error || 'Falha ao carregar seus tickets'); setTickets([]); return }
        setTickets(json.paraTarefa || []); setQuadros(json.quadros || {}); setUsuarios(json.usuarios || {}); setEnvolvidos(json.envolvidos || {})
      } catch { if (vivo) { setErro('Falha de conexão'); setTickets([]) } }
    })()
    return () => { vivo = false }
  }, [])

  const eu = userProfile?.id
  const paraOutro = !!resp && !!eu && resp !== eu
  const nomeResp = respNome || usuarios[resp]?.nome || 'essa pessoa'
  const primeiro = nomeResp.split(' ')[0]
  // Para outra pessoa: só os tickets em que vocês dois estão.
  const emComum = useMemo(() => (tickets || []).filter((t) => !paraOutro || (envolvidos[t.id] || []).includes(resp)), [tickets, envolvidos, resp, paraOutro])
  const filtrados = useMemo(() => {
    return emComum.filter((t) => casaBusca(busca, t.titulo, `#${t.numero}`))
  }, [emComum, busca])
  // Trocou a pessoa: o ticket escolhido pode não ser mais "em comum".
  const ticketValido = !ticketId || emComum.some((t) => t.id === ticketId)

  const pedirTicket = async () => {
    setErro('')
    if (!titulo.trim()) { setErro('Escreva do que se trata (campo Tarefa) para mandar o pedido.'); return }
    setPedido('enviando')
    try {
      const res = await fetch('/api/trabalho/pedir-ticket', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ para: resp, texto: titulo.trim() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(json.error || 'Não deu para mandar o pedido'); setPedido(''); return }
      setPedido('enviado')
    } catch { setErro('Falha de conexão'); setPedido('') }
  }

  const salvar = async () => {
    setErro('')
    if (!ticketId || !ticketValido) { setErro('Escolha o ticket da tarefa.'); return }
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
    <div onMouseDown={(e) => { downNoFundo.current = e.target === e.currentTarget }}
      onClick={(e) => { if (e.target === e.currentTarget && downNoFundo.current) fecharPeloFundo() }} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="ft-t" style={{ width: '100%', maxWidth: 560, maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: 'var(--portal-surface,#fff)', borderRadius: 14, boxShadow: '0 24px 70px rgba(0,0,0,.3)' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--portal-border,#eee)' }}>
          <h2 id="ft-t" style={{ margin: 0, fontSize: 17, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--portal-text,#111)' }}><SquareCheck size={18} color={VERDE} /> Nova tarefa</h2>
          <button onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#888)', minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, flex: 'none' }}><X size={18} /></button>
        </header>

        <div style={{ padding: 18, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
          <div>
            <span style={rotulo}>Para quem?</span>
            <UserSelect value={resp} onChange={(id, u) => { setResp(id); setRespNome(u?.nome || ''); setPedido('') }} placeholder="Digite o nome da pessoa..." barraBusca />
          </div>

          <div>
            <label style={rotulo} htmlFor="ft-titulo">Tarefa</label>
            <input id="ft-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200} placeholder="Ex.: pedir orçamento do vidro" style={campo}
              onKeyDown={(e) => { if (e.key === 'Enter') salvar() }} />
          </div>

          <div>
            <span style={rotulo}>{paraOutro ? `Tickets que você e ${primeiro} têm em comum` : 'Em qual ticket?'}</span>
            {tickets === null ? (
              <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Carregando seus tickets...</div>
            ) : emComum.length === 0 && !paraOutro ? (
              <div style={{ padding: 14, borderRadius: 10, border: '1px dashed var(--portal-border,#ddd)', fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
                Toda tarefa fica dentro de um ticket, e você não tem nenhum em aberto.
                <button onClick={onNovoTicket} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '8px 12px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                  <Plus size={14} /> Criar um ticket
                </button>
              </div>
            ) : emComum.length === 0 ? (
              <div style={{ padding: 12, borderRadius: 10, border: '1px dashed var(--portal-border,#ddd)', fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
                Vocês não têm nenhum ticket em aberto em comum.
              </div>
            ) : (
              <>
                {emComum.length > 5 && (
                  <div style={{ position: 'relative', marginBottom: 6 }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, top: 11, opacity: .5 }} />
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por título ou número" style={{ ...campo, paddingLeft: 30 }} />
                  </div>
                )}
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

            {/* Assunto diferente: pede para a outra pessoa abrir um ticket novo */}
            {paraOutro && tickets !== null && (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 10, background: 'var(--portal-bg,#f7f7f7)', fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
                {pedido === 'enviado' ? (
                  <b style={{ color: VERDE }}>Pedido enviado. {primeiro} recebe no sino um link que abre o Novo ticket já preenchido.</b>
                ) : (
                  <>
                    <span>{emComum.length ? 'Nenhum é desse assunto?' : 'É um assunto novo?'} Peça para {primeiro} abrir um ticket próprio.</span>
                    <button type="button" onClick={pedirTicket} disabled={pedido === 'enviando'}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--portal-border,#d4d4d4)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                      <Send size={14} /> {pedido === 'enviando' ? 'Enviando...' : `Pedir para ${primeiro} abrir um ticket novo`}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div style={{ maxWidth: 240, width: '100%' }}>
            <span style={rotulo}>Prazo</span>
            {/* agenda de quem vai fazer a tarefa */}
            <SeletorDataAgenda value={prazo} onChange={setPrazo} userId={resp || eu} permitirVazio textoVazio="Sem prazo" />
          </div>
          {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        </div>

        <footer style={{ padding: '12px 18px', borderTop: '1px solid var(--portal-border,#eee)', display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
          <button onClick={onFechar} style={{ padding: '9px 14px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text,#111)', fontWeight: 600 }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando || !ticketId || !ticketValido || !titulo.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: VERDE, color: '#fff', fontWeight: 700, cursor: 'pointer', opacity: salvando || !ticketId || !ticketValido || !titulo.trim() ? .6 : 1 }}>
            <Plus size={15} /> {salvando ? 'Criando...' : 'Criar tarefa'}
          </button>
        </footer>
      </div>
    </div>
  )
}
