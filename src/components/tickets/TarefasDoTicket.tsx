'use client'
// Tarefas (passos) dentro do ticket — Central de Trabalho.
// Caixa verde no topo do ticket: progresso, lista com responsável e prazo,
// marcar feita, remover (com confirmação na própria linha) e adicionar.
import { useCallback, useEffect, useState } from 'react'
import { SquareCheck, Trash2, User as UserIcon, Plus, Loader2 } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import UserSelect from './UserSelect'

interface Passo { id: number; titulo: string; prazo: string | null; concluida: boolean; atribuido_a: string | null }

const VERDE = '#16a34a'
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export default function TarefasDoTicket({ ticketId, responsavelId, encerrado, onMudou }: {
  ticketId: string; responsavelId: string; encerrado: boolean; onMudou?: () => void
}) {
  const [passos, setPassos] = useState<Passo[] | null>(null)
  const [usuarios, setUsuarios] = useState<Record<string, { nome: string }>>({})
  const [podeMexer, setPodeMexer] = useState(false)
  const [erro, setErro] = useState('')
  const [titulo, setTitulo] = useState('')
  const [resp, setResp] = useState(responsavelId)
  const [nomeResp, setNomeResp] = useState<Record<string, string>>({})
  const [prazo, setPrazo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [removendo, setRemovendo] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/tarefas`, { headers: await authHeaders() })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao carregar as tarefas'); setPassos([]); return }
      setPassos(json.passos || []); setUsuarios(json.usuarios || {}); setPodeMexer(!!json.pode_mexer)
    } catch { setErro('Falha de conexão'); setPassos([]) }
  }, [ticketId])
  useEffect(() => { carregar() }, [carregar])

  const chamar = async (metodo: string, corpo?: Record<string, unknown>, query = '') => {
    setErro('')
    const res = await fetch(`/api/tickets/${ticketId}/tarefas${query}`, {
      method: metodo, headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setErro(json.error || 'Falha'); return false }
    await carregar(); onMudou?.()
    return true
  }

  const adicionar = async () => {
    if (!titulo.trim()) return
    setSalvando(true)
    try { if (await chamar('POST', { titulo, atribuido_a: resp || null, prazo: prazo || null })) { setTitulo(''); setPrazo('') } }
    finally { setSalvando(false) }
  }

  const lista = passos || []
  const feitas = lista.filter((p) => p.concluida).length
  const nome = (id: string | null) => (id && (usuarios[id]?.nome || nomeResp[id])) || '—'

  return (
    <div style={{ marginTop: 14, border: `2px solid ${VERDE}`, borderRadius: 12, padding: '12px 14px', background: 'rgba(22,163,74,.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <b style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 14, color: 'var(--portal-text,#111)' }}><SquareCheck size={16} color={VERDE} /> Tarefas deste ticket</b>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted,#888)' }}>
          {passos === null ? '' : lista.length ? `${feitas} de ${lista.length} feitas` : 'quebre o trabalho em passos'}
        </span>
      </div>
      {lista.length > 0 && (
        <div style={{ height: 6, borderRadius: 3, background: 'var(--portal-border,#e5e7eb)', margin: '8px 0 6px', overflow: 'hidden' }}>
          <div style={{ width: `${Math.round((feitas / lista.length) * 100)}%`, height: '100%', background: VERDE }} />
        </div>
      )}
      {passos === null && <div style={{ padding: 8 }}><Loader2 size={16} className="spin" /></div>}
      {passos !== null && lista.length === 0 && (
        <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}>
          Divida este ticket em passos menores. Cada tarefa tem responsável e prazo, e aparece na lista de Tarefas de quem vai fazer.
        </p>
      )}
      {lista.map((p) => {
        const atrasada = !p.concluida && p.prazo && p.prazo.slice(0, 10) < hojeISO()
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px dashed var(--portal-border,#e5e7eb)', fontSize: 13.5, flexWrap: 'wrap' }}>
            <input type="checkbox" checked={p.concluida} disabled={!podeMexer || encerrado} aria-label={`Feita: ${p.titulo}`}
              onChange={(e) => chamar('PATCH', { tarefa_id: p.id, feita: e.target.checked })} style={{ width: 17, height: 17, accentColor: VERDE }} />
            <span style={{ flex: '1 1 180px', minWidth: 0, color: p.concluida ? 'var(--portal-text-muted,#999)' : 'var(--portal-text,#111)', textDecoration: p.concluida ? 'line-through' : undefined }}>{p.titulo}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--portal-text-muted,#888)' }}><UserIcon size={12} /> {nome(p.atribuido_a)}</span>
            {p.prazo && <span style={{ fontSize: 12, fontWeight: atrasada ? 700 : 400, color: atrasada ? '#dc2626' : 'var(--portal-text-muted,#888)' }}>{fmt(p.prazo)}</span>}
            {podeMexer && !encerrado && (removendo === p.id ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: '#dc2626' }}>
                Remover esta tarefa?
                <button onClick={async () => { setRemovendo(null); await chamar('DELETE', undefined, `?tarefa_id=${p.id}`) }}
                  style={{ padding: '3px 10px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Remover</button>
                <button onClick={() => setRemovendo(null)}
                  style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid var(--portal-border,#ddd)', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-secondary,#555)' }}>Cancelar</button>
              </span>
            ) : (
              <button onClick={() => setRemovendo(p.id)} title="Remover tarefa" aria-label="Remover tarefa"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#aaa)', display: 'flex', padding: 4 }}><Trash2 size={14} /></button>
            ))}
          </div>
        )
      })}
      {podeMexer && !encerrado && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 190px 150px auto', gap: 6, marginTop: 10 }} className="tarefas-ticket-form">
          <input id={`nova-tarefa-${ticketId}`} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={200}
            onKeyDown={(e) => { if (e.key === 'Enter') adicionar() }}
            placeholder="+ Adicionar tarefa a este ticket (ex.: pedir orçamento)"
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)', fontSize: 13, minWidth: 0 }} />
          <UserSelect value={resp} autoFocus={false} placeholder="Responsável"
            onChange={(id, u) => { setResp(id); if (u) setNomeResp((n) => ({ ...n, [id]: u.nome })) }} />
          <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} aria-label="Prazo da tarefa"
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)', fontSize: 13 }} />
          <button onClick={adicionar} disabled={salvando || !titulo.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 12px', borderRadius: 8, border: 'none', background: VERDE, color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', opacity: salvando || !titulo.trim() ? .6 : 1 }}>
            <Plus size={14} /> Adicionar
          </button>
        </div>
      )}
      {erro && <div style={{ marginTop: 8, fontSize: 12.5, fontWeight: 600, color: '#dc2626' }}>{erro}</div>}
      <style>{`@media (max-width: 720px){ .tarefas-ticket-form{ grid-template-columns: 1fr 1fr !important } .tarefas-ticket-form > input:first-child{ grid-column: 1 / -1 } }`}</style>
    </div>
  )
}
