'use client'
// CENTRAL DE TRABALHO — outras formas de ver o Cronograma geral (além da
// Lista por dia): Gantt, Calendário e Kanban. Tudo na cor do bloco.
//  - Gantt: barra do dia em que o ticket foi aberto até o prazo; arrastar o
//    fim muda o prazo.
//  - Calendário: ticket no dia do prazo; arrastar para outro dia muda o prazo.
//  - Kanban: colunas por situação; arrastar muda o status (o servidor valida
//    quem pode — erro volta como aviso).
import { useCallback, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { FrappeTask } from 'frappe-gantt'
import { STATUS_INFO, type Ticket, type TicketStatus } from '@/lib/tickets/constantes'
import type { ViewMode } from '@/components/cronograma/GanttView'

const GanttView = dynamic(() => import('@/components/cronograma/GanttView'), { ssr: false })

export type VistaGeral = 'gantt' | 'calendario' | 'kanban'

interface Props {
  vista: VistaGeral
  tickets: Ticket[]
  hoje: string
  corDe: (t: Ticket) => string
  quem: (t: Ticket) => string
  progresso: (t: Ticket) => number | null
  onAbrir: (id: string) => void
  onMudarPrazo: (id: string, prazo: string) => void
  onMudarStatus: (id: string, para: TicketStatus) => void
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const diaDe = (s: string) => new Date(s.slice(0, 10) + 'T12:00:00')
const dataLocal = (ts: string) => iso(new Date(ts)) // created_at (timestamp) → dia local
const cartao: React.CSSProperties = { background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 12 }
const muted = 'var(--portal-text-muted,#888)'

export default function VistasCronogramaGeral(p: Props) {
  if (p.vista === 'gantt') return <Gantt {...p} />
  if (p.vista === 'calendario') return <Calendario {...p} />
  return <Kanban {...p} />
}

// ─────────────────────────────────────────────────────────────── Gantt
function Gantt({ tickets, hoje, corDe, progresso, onAbrir, onMudarPrazo }: Props) {
  const [modo, setModo] = useState<ViewMode>('Day')
  const comPrazo = useMemo(() => tickets.filter((t) => t.prazo), [tickets])
  const semPrazo = tickets.length - comPrazo.length

  // Uma classe por cor (a frappe só aceita cor via classe CSS).
  const cores = useMemo(() => [...new Set(comPrazo.map(corDe))], [comPrazo, corDe])
  const tasks = useMemo<FrappeTask[]>(() => comPrazo.map((t) => {
    const fim = t.prazo!
    let inicio = dataLocal(t.created_at)
    if (inicio > fim) inicio = fim
    return {
      id: t.id,
      name: `#${t.numero} ${t.titulo}`,
      start: inicio,
      end: fim,
      progress: progresso(t) ?? 0,
      custom_class: `cg-cor-${cores.indexOf(corDe(t))}${fim < hoje ? ' cg-atrasado' : ''}`,
    }
  }), [comPrazo, cores, corDe, progresso, hoje])

  const aoMover = useCallback((id: string, _inicio: Date, fim: Date) => {
    const t = comPrazo.find((x) => x.id === id)
    const novo = iso(fim)
    if (t && novo !== t.prazo) onMudarPrazo(id, novo)
  }, [comPrazo, onMudarPrazo])

  const botao = (ativo: boolean): React.CSSProperties => ({
    padding: '5px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: ativo ? '1px solid #dc2626' : '1px solid var(--portal-border,#e5e7eb)',
    background: ativo ? 'rgba(220,38,38,.08)' : 'var(--portal-surface,#fff)', color: ativo ? '#dc2626' : 'var(--portal-text,#111)',
  })

  return (
    <div style={{ marginTop: 16 }}>
      <style>{cores.map((c, i) => `.gantt .cg-cor-${i} .bar{fill:${c}!important}.gantt .cg-cor-${i} .bar-progress{fill:${c}!important;filter:brightness(.75)}`).join('')
        + '.gantt .cg-atrasado .bar{stroke:#dc2626!important;stroke-width:2px!important}'
        + '.gantt .bar-label{fill:#fff!important}.gantt .bar-label.big{fill:var(--g-text-dark)!important}'}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {([['Day', 'Dia'], ['Week', 'Semana'], ['Month', 'Mês']] as [ViewMode, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setModo(v)} style={botao(modo === v)}>{l}</button>
        ))}
        <small style={{ marginLeft: 'auto', color: muted }}>
          Barra = de quando foi aberto até o prazo. Arraste o fim para mudar o prazo.
          {semPrazo > 0 && <> · {semPrazo} sem data (não aparece{semPrazo > 1 ? 'm' : ''} aqui)</>}
        </small>
      </div>
      {tasks.length === 0 ? (
        <div style={{ ...cartao, padding: 40, textAlign: 'center', color: muted, fontSize: 14 }}>Nenhum ticket com prazo para mostrar no Gantt.</div>
      ) : (
        <div style={{ ...cartao, overflow: 'auto' }}>
          <GanttView tasks={tasks} viewMode={modo} onClick={onAbrir} onDateChange={aoMover} />
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────── Calendário
function Calendario({ tickets, hoje, corDe, onAbrir, onMudarPrazo }: Props) {
  const [mes, setMes] = useState(() => { const d = diaDe(hoje); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [arr, setArr] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const ini = new Date(mes); ini.setDate(1 - ((ini.getDay() + 6) % 7)) // começa na segunda
  const dias = Array.from({ length: 42 }, (_, i) => { const d = new Date(ini); d.setDate(ini.getDate() + i); return d })
  const porDia = useMemo(() => {
    const m = new Map<string, Ticket[]>()
    for (const t of tickets) if (t.prazo) m.set(t.prazo, [...(m.get(t.prazo) || []), t])
    return m
  }, [tickets])
  const semPrazo = tickets.filter((t) => !t.prazo).length
  const soltar = (alvo: string) => {
    const t = tickets.find((x) => x.id === arr)
    setArr(null); setSobre(null)
    if (t && t.prazo !== alvo) onMudarPrazo(t.id, alvo)
  }
  const nav: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: 6, borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text,#111)' }
  return (
    <div style={{ ...cartao, overflow: 'auto', marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--portal-border,#eee)', flexWrap: 'wrap' }}>
        <button style={nav} aria-label="Mês anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
        <b style={{ minWidth: 160, textAlign: 'center', color: 'var(--portal-text,#111)', textTransform: 'capitalize' }}>{mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</b>
        <button style={nav} aria-label="Próximo mês" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
        <small style={{ marginLeft: 'auto', color: muted }}>
          Arraste um ticket para outro dia para mudar o prazo.{semPrazo > 0 && <> · {semPrazo} sem data</>}
        </small>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))', minWidth: 780 }}>
        {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => <div key={d} style={{ padding: '6px 8px', fontSize: 11.5, fontWeight: 700, color: muted, borderBottom: '1px solid var(--portal-border,#eee)' }}>{d}</div>)}
        {dias.map((d) => {
          const k = iso(d)
          const fora = d.getMonth() !== mes.getMonth()
          const itens = porDia.get(k) || []
          return (
            <div key={k}
              onDragOver={(e) => { if (!arr) return; e.preventDefault(); if (sobre !== k) setSobre(k) }}
              onDrop={(e) => { e.preventDefault(); soltar(k) }}
              style={{ minHeight: 96, padding: 5, borderRight: '1px solid var(--portal-border,#f1f1f1)', borderBottom: '1px solid var(--portal-border,#f1f1f1)', background: sobre === k ? 'rgba(220,38,38,.07)' : fora ? 'var(--portal-bg,#fafafa)' : undefined }}>
              <div style={{ fontSize: 11.5, fontWeight: k === hoje ? 800 : 600, color: k === hoje ? '#dc2626' : fora ? 'var(--portal-text-muted,#bbb)' : 'var(--portal-text,#111)', marginBottom: 3 }}>{d.getDate()}</div>
              {itens.slice(0, 4).map((t) => (
                <div key={t.id} draggable
                  onDragStart={() => setArr(t.id)} onDragEnd={() => { setArr(null); setSobre(null) }}
                  onClick={() => onAbrir(t.id)} title={`#${t.numero} ${t.titulo} — ${STATUS_INFO[t.status]?.label || t.status}`}
                  style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', marginBottom: 2, borderRadius: 5, cursor: 'grab', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff', background: corDe(t), outline: k < hoje ? '2px solid #dc2626' : undefined, outlineOffset: -2 }}>
                  #{t.numero} {t.titulo}
                </div>
              ))}
              {itens.length > 4 && <div style={{ fontSize: 10.5, color: muted }}>+{itens.length - 4}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────── Kanban
const COLUNAS: TicketStatus[] = ['aberto', 'em_andamento', 'aguardando_interno', 'aguardando_terceiro']
const br = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : 'sem data')

function Kanban({ tickets, hoje, corDe, quem, progresso, onAbrir, onMudarStatus }: Props) {
  const [arr, setArr] = useState<string | null>(null)
  const [sobre, setSobre] = useState<TicketStatus | null>(null)
  const ordenar = (a: Ticket, b: Ticket) => (a.prazo || '9999').localeCompare(b.prazo || '9999')
  const soltar = (para: TicketStatus) => {
    const t = tickets.find((x) => x.id === arr)
    setArr(null); setSobre(null)
    if (t && t.status !== para) onMudarStatus(t.id, para)
  }
  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 8, marginTop: 16 }}>
      {COLUNAS.map((st) => {
        const info = STATUS_INFO[st]
        const itens = tickets.filter((t) => t.status === st).sort(ordenar)
        return (
          <div key={st}
            onDragOver={(e) => { if (!arr) return; e.preventDefault(); if (sobre !== st) setSobre(st) }}
            onDragLeave={() => setSobre((s) => (s === st ? null : s))}
            onDrop={(e) => { e.preventDefault(); soltar(st) }}
            style={{ flex: '1 0 250px', background: sobre === st ? 'rgba(220,38,38,.07)' : 'var(--portal-bg,#f3f4f6)', borderRadius: 12, padding: 10, minHeight: 120 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 13, fontWeight: 800, color: 'var(--portal-text,#111)' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: info.cor }} /> {info.label}
              <span style={{ marginLeft: 'auto', color: muted }}>{itens.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {itens.map((t) => {
                const pr = progresso(t)
                const atrasado = !!t.prazo && t.prazo < hoje
                return (
                  <button key={t.id} draggable onDragStart={() => setArr(t.id)} onDragEnd={() => { setArr(null); setSobre(null) }}
                    onClick={() => onAbrir(t.id)}
                    style={{ ...cartao, textAlign: 'left', padding: 10, cursor: 'grab', borderLeft: `4px solid ${corDe(t)}`, color: 'var(--portal-text,#111)', opacity: arr === t.id ? .5 : 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>#{t.numero} {t.titulo}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginTop: 5, fontSize: 11.5, color: muted }}>
                      <span style={{ color: atrasado ? '#dc2626' : undefined, fontWeight: atrasado ? 700 : undefined }}>{br(t.prazo)}{atrasado ? ' (atrasado)' : ''}</span>
                      <span>{quem(t)}</span>
                      {pr != null && <span>{pr}%</span>}
                    </div>
                  </button>
                )
              })}
              {itens.length === 0 && <div style={{ fontSize: 12, color: muted, padding: 6 }}>Nada aqui.</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
