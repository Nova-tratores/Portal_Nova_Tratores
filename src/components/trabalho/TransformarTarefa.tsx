'use client'
// Tarefa solta que cresceu (Central de Trabalho):
//  * Transformar → vira ticket (no bloco escolhido — obrigatório: ticket sem
//    bloco não anda) e, se quiser, etapa no
//    cronograma do quadro — os dois ficam ligados.
//  * Incluir num ticket → vira passo de um ticket que já existe.
import { useEffect, useState } from 'react'
import { ArrowRightLeft, ListPlus, Ticket as TicketIcon, Loader2 } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

interface Props {
  tarefa: { id: number; ticket_id?: string | null; papel_no_ticket?: string | null }
  onFeito: (msg: string, ticketId?: string) => void
  onAbrirTicket?: (ticketId: string) => void
}

type Modo = null | 'transformar' | 'incluir'

const campo: React.CSSProperties = { width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)', fontSize: 13.5 }
const botao = (cor?: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, border: cor ? 'none' : '1px solid var(--portal-border,#e5e7eb)', background: cor || 'var(--portal-surface,#fff)', color: cor ? '#fff' : 'var(--portal-text,#111)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' })

export default function TransformarTarefa({ tarefa, onFeito, onAbrirTicket }: Props) {
  const [modo, setModo] = useState<Modo>(null)
  const [quadros, setQuadros] = useState<{ id: string; nome: string; pode_trabalhar: boolean }[]>([])
  const [tickets, setTickets] = useState<{ id: string; numero: number; titulo: string }[]>([])
  const [quadroId, setQuadroId] = useState('')
  const [comCrono, setComCrono] = useState(true)
  const [duracao, setDuracao] = useState(2)
  const [ticketId, setTicketId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (modo === 'transformar' && !quadros.length) {
      (async () => {
        const res = await fetch('/api/tickets/quadros', { headers: await authHeaders() })
        const json = await res.json().catch(() => ({}))
        setQuadros((json.quadros || []).filter((q: { pode_trabalhar: boolean }) => q.pode_trabalhar))
      })()
    }
    if (modo === 'incluir' && !tickets.length) {
      (async () => {
        const h = await authHeaders()
        const visoes = ['fila', 'pedidos', 'acompanhando']
        const listas = await Promise.all(visoes.map((v) => fetch(`/api/tickets?visao=${v}`, { headers: h }).then((r) => r.json()).catch(() => ({}))))
        const vistos = new Map<string, { id: string; numero: number; titulo: string }>()
        for (const l of listas) for (const t of l.tickets || []) if (t.tipo !== 'compras') vistos.set(t.id, { id: t.id, numero: t.numero, titulo: t.titulo })
        setTickets([...vistos.values()].sort((a, b) => b.numero - a.numero))
      })()
    }
  }, [modo, quadros.length, tickets.length])

  if (tarefa.ticket_id) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13.5, color: 'var(--portal-text-secondary,#555)' }}>
        <TicketIcon size={15} color="#dc2626" />
        {tarefa.papel_no_ticket === 'origem' ? 'Esta tarefa virou um ticket.' : 'Esta tarefa é um passo de um ticket.'}
        {onAbrirTicket && <button style={botao()} onClick={() => onAbrirTicket(tarefa.ticket_id!)}>Abrir o ticket</button>}
      </div>
    )
  }

  const enviar = async (corpo: Record<string, unknown>) => {
    setSalvando(true); setErro('')
    try {
      const res = await fetch('/api/trabalho/tarefas', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ tarefa_id: tarefa.id, ...corpo }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(json.error || 'Falha'); return }
      if (corpo.acao === 'incluir') onFeito('Tarefa incluída no ticket.', json.ticket_id)
      else onFeito(`Virou o ticket #${json.ticket?.numero}${json.noCronograma ? ' e entrou no cronograma' : ''}.${json.avisoCronograma ? ' ' + json.avisoCronograma : ''}`, json.ticket?.id)
    } catch { setErro('Falha de conexão — tente de novo.') } finally { setSalvando(false) }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button style={botao(modo === 'transformar' ? '#dc2626' : undefined)} onClick={() => setModo(modo === 'transformar' ? null : 'transformar')}><ArrowRightLeft size={15} /> Transformar</button>
        <button style={botao(modo === 'incluir' ? '#dc2626' : undefined)} onClick={() => setModo(modo === 'incluir' ? null : 'incluir')}><ListPlus size={15} /> Incluir num ticket</button>
      </div>
      {modo === 'transformar' && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fafafa)', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5 }}>
          <b>Transformar em ticket</b>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>Bloco
            <select value={quadroId} onChange={(e) => setQuadroId(e.target.value)} style={campo}>
              <option value="" disabled>Escolha o bloco…</option>
              {quadros.map((q) => <option key={q.id} value={q.id}>{q.nome}</option>)}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: quadroId ? 1 : .5 }}>
            <input type="checkbox" checked={comCrono && !!quadroId} disabled={!quadroId} onChange={(e) => setComCrono(e.target.checked)} />
            Também pôr no cronograma do bloco, com
            <input type="number" min={1} max={365} value={duracao} disabled={!quadroId} onChange={(e) => setDuracao(Number(e.target.value) || 1)} style={{ ...campo, width: 64 }} /> dias
          </label>
          <small style={{ color: 'var(--portal-text-muted,#888)' }}>O responsável é quem recebeu a tarefa; ele confirma o ticket. O ticket e a etapa ficam ligados.</small>
          <div><button style={{ ...botao('#dc2626'), opacity: salvando || !quadroId ? .6 : 1 }} disabled={salvando || !quadroId} title={!quadroId ? 'Escolha um bloco' : undefined} onClick={() => { if (!quadroId) { setErro('Escolha um bloco.'); return } enviar({ acao: 'transformar', quadro_id: quadroId, cronograma: comCrono && !!quadroId, duracao }) }}>{salvando ? <Loader2 size={15} className="spin" /> : <ArrowRightLeft size={15} />} Transformar</button></div>
        </div>
      )}
      {modo === 'incluir' && (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 10, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fafafa)', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5 }}>
          <b>Incluir como passo de um ticket</b>
          <select value={ticketId} onChange={(e) => setTicketId(e.target.value)} style={campo}>
            <option value="">Escolha o ticket…</option>
            {tickets.map((t) => <option key={t.id} value={t.id}>#{t.numero} — {t.titulo}</option>)}
          </select>
          <small style={{ color: 'var(--portal-text-muted,#888)' }}>A tarefa passa a aparecer dentro do ticket, na lista de tarefas dele.</small>
          <div><button style={botao('#dc2626')} disabled={salvando || !ticketId} onClick={() => enviar({ acao: 'incluir', ticket_id: ticketId })}>{salvando ? <Loader2 size={15} className="spin" /> : <ListPlus size={15} />} Incluir</button></div>
        </div>
      )}
      {erro && <div style={{ marginTop: 8, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
    </div>
  )
}
