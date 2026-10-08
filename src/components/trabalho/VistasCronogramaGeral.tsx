'use client'
// CENTRAL DE TRABALHO — outras formas de ver o Cronograma geral (além da
// Lista por dia): Gantt, Calendário e Kanban. Tudo na cor do bloco.
//  Gantt e Calendário seguem a MESMA regra (noPlano): atrasado em aberto
//  continua no plano até hoje; sem prazo vai para a faixa "Sem data".
//  - Gantt: barra da abertura até o prazo; arrastar o fim muda o prazo.
//  - Calendário: ticket no dia do prazo; arrastar para outro dia muda o prazo
//    (inclusive da faixa "Sem data").
//  - Kanban: fica na página, com o KanbanTickets (mesmo card dos blocos).
import { useCallback, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { FrappeTask } from 'frappe-gantt'
import { STATUS_INFO, type Ticket } from '@/lib/tickets/constantes'
import type { ViewMode } from '@/components/cronograma/GanttView'

const GanttView = dynamic(() => import('@/components/cronograma/GanttView'), { ssr: false })

export type VistaGeral = 'gantt' | 'calendario' | 'kanban'

interface Props {
  vista: VistaGeral
  tickets: Ticket[]
  hoje: string
  corDe: (t: Ticket) => string
  progresso: (t: Ticket) => number | null
  onAbrir: (id: string) => void
  /** Novo 1º dia do trabalho + novo prazo (arrastar no Gantt/Calendário). */
  onMudarDatas: (id: string, inicio: string, prazo: string | null) => void
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const diaDe = (s: string) => new Date(s.slice(0, 10) + 'T12:00:00')
const cartao: React.CSSProperties = { background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 12 }
const muted = 'var(--portal-text-muted,#888)'
const SEMANA_SEG = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']
const SEMANA_LONGA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
// Sábado/domingo (não trabalhamos) e as casas que completam a grade do mês.
const COR_FOLGA = 'rgba(100,116,139,.13)'
const br = (s: string | null) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : 'sem data')
export const ehUrgente = (t: Ticket) => (t.payload as { urgente?: boolean } | null)?.urgente === true

const somaDias = (s: string, n: number) => { const d = diaDe(s); d.setDate(d.getDate() + n); return iso(d) }
const difDias = (a: string, b: string) => Math.round((diaDe(b).getTime() - diaDe(a).getTime()) / 86400000)
/**
 * 1º dia do trabalho (payload.inicio, gravado na criação). Sem ele: o próprio
 * prazo; no contínuo (sem prazo), o dia em que o ticket foi aberto.
 */
const inicioDe = (t: Ticket): string => {
  const i = (t.payload as { inicio?: string } | null)?.inicio
  const valido = !!i && /^\d{4}-\d{2}-\d{2}$/.test(i)
  if (!t.prazo) return valido ? i! : iso(new Date(t.created_at))
  return valido && i! <= t.prazo ? i! : t.prazo
}

/**
 * Onde o ticket está no plano — a MESMA regra nas vistas: do 1º dia do
 * trabalho até o prazo (tarefa de 5 dias = 5 dias); atrasado (ainda em
 * aberto) continua no plano até HOJE. SEM PRAZO = contínuo (prazo
 * indeterminado): aparece todo dia desde o início até alguém concluir.
 */
export function noPlano(t: Ticket, hoje: string): { inicio: string; fim: string; atrasado: boolean; continuo: boolean } {
  const inicio = inicioDe(t)
  if (!t.prazo) return { inicio, fim: inicio > hoje ? inicio : hoje, atrasado: false, continuo: true }
  const atrasado = t.prazo < hoje
  return { inicio, fim: atrasado ? hoje : t.prazo, atrasado, continuo: false }
}

export function SeloUrgente() {
  return <span style={{ display: 'inline-block', padding: '0 6px', borderRadius: 4, fontSize: 10, fontWeight: 800, letterSpacing: .3, color: '#fff', background: '#dc2626' }}>URGENTE</span>
}

export default function VistasCronogramaGeral(p: Props) {
  if (p.vista === 'gantt') return <Gantt {...p} />
  // Kanban: a página usa o KanbanTickets (o mesmo card dos blocos)
  return <Calendario {...p} />
}

// ─────────────────────────────────────────────────────────────── Gantt
function Gantt({ tickets, hoje, corDe, progresso, onAbrir, onMudarDatas }: Props) {
  const [modo, setModo] = useState<ViewMode>('Day')
  const comPrazo = tickets // todos entram (sem prazo = barra contínua até hoje)

  // Uma classe por cor (a frappe só aceita cor via classe CSS).
  const cores = useMemo(() => [...new Set(comPrazo.map(corDe))], [comPrazo, corDe])
  const tasks = useMemo<FrappeTask[]>(() => comPrazo.map((t) => {
    const p = noPlano(t, hoje)
    return {
      id: t.id,
      name: `${ehUrgente(t) ? '🔥 ' : ''}#${t.numero} ${t.titulo}${p.atrasado ? ` (atrasado desde ${br(t.prazo)})` : p.continuo ? ' (contínuo)' : ''}`,
      start: p.inicio,
      end: p.fim,
      progress: progresso(t) ?? 0,
      // UMA classe só: a frappe faz classList.add(custom_class) e espaço ali
      // derruba a página inteira (InvalidCharacterError).
      custom_class: `cg-cor-${cores.indexOf(corDe(t))}${p.atrasado ? '-atrasado' : p.continuo ? '-continuo' : ''}`,
    }
  }), [comPrazo, cores, corDe, progresso, hoje])

  const aoMover = useCallback((id: string, inicio: Date, fim: Date) => {
    const t = comPrazo.find((x) => x.id === id)
    if (!t) return
    const p = noPlano(t, hoje)
    const ni = iso(inicio), nf = iso(fim)
    // Contínuo: só o início muda (continua sem prazo até alguém concluir).
    if (p.continuo) { if (ni !== p.inicio) onMudarDatas(id, ni, null); return }
    if (ni !== p.inicio || nf !== p.fim) onMudarDatas(id, ni, nf)
  }, [comPrazo, onMudarDatas, hoje])

  const botao = (ativo: boolean): React.CSSProperties => ({
    padding: '5px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: ativo ? '1px solid #dc2626' : '1px solid var(--portal-border,#e5e7eb)',
    background: ativo ? 'rgba(220,38,38,.08)' : 'var(--portal-surface,#fff)', color: ativo ? '#dc2626' : 'var(--portal-text,#111)',
  })

  return (
    <div style={{ marginTop: 16 }}>
      <style>{cores.map((c, i) => `.gantt .cg-cor-${i} .bar,.gantt .cg-cor-${i}-atrasado .bar{fill:${c}!important}`
        + `.gantt .cg-cor-${i} .bar-progress,.gantt .cg-cor-${i}-atrasado .bar-progress{fill:${c}!important;filter:brightness(.75)}`
        + `.gantt .cg-cor-${i}-atrasado .bar{stroke:#dc2626!important;stroke-width:2px!important}`
        + `.gantt .cg-cor-${i}-continuo .bar{fill:${c}!important;opacity:.75;stroke:${c}!important;stroke-width:2px!important;stroke-dasharray:6 4}`).join('')
        + '.gantt .bar-label{fill:#fff!important}.gantt .bar-label.big{fill:var(--g-text-dark)!important}'}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {([['Day', 'Dia'], ['Week', 'Semana'], ['Month', 'Mês']] as [ViewMode, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setModo(v)} style={botao(modo === v)}>{l}</button>
        ))}
        <small style={{ marginLeft: 'auto', color: muted }}>
          Barra = do início até o prazo · atrasado vai até hoje (vermelho) · sem prazo = contínuo, tracejado até hoje. Arraste para mudar as datas.
        </small>
      </div>
      {tasks.length === 0 ? (
        <div style={{ ...cartao, padding: 40, textAlign: 'center', color: muted, fontSize: 14 }}>Nada para mostrar no Gantt.</div>
      ) : (
        <div style={{ ...cartao, overflow: 'auto' }}>
          <GanttView tasks={tasks} viewMode={modo} onClick={onAbrir} onDateChange={aoMover} />
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────── Calendário
function Calendario({ tickets, hoje, corDe, onAbrir, onMudarDatas }: Props) {
  const [mes, setMes] = useState(() => { const d = diaDe(hoje); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [arr, setArr] = useState<string | null>(null)
  const [arrDe, setArrDe] = useState<string | null>(null) // dia de onde saiu o arraste
  const [sobre, setSobre] = useState<string | null>(null)
  // Semana seg → dom (sábado e domingo no fim). Só os dias DO mês têm número;
  // as casas que completam a grade (antes do dia 1 / depois do último) ficam
  // na cor de "não trabalhamos", igual ao fim de semana.
  const antes = (mes.getDay() + 6) % 7
  const diasNoMes = new Date(mes.getFullYear(), mes.getMonth() + 1, 0).getDate()
  const depois = (7 - ((antes + diasNoMes) % 7)) % 7
  const dias = Array.from({ length: diasNoMes }, (_, i) => new Date(mes.getFullYear(), mes.getMonth(), i + 1))
  const casaVazia = (key: string) => <div key={key} style={{ minHeight: 96, background: COR_FOLGA, borderRight: '1px solid var(--portal-border,#e5e7eb)', borderBottom: '1px solid var(--portal-border,#e5e7eb)' }} />
  const [aberto, setAberto] = useState<string | null>(null) // dia com "+N" expandido
  // Ticket em CADA dia do trabalho (início → prazo). Atrasado aparece só em
  // hoje (com "desde dd/mm") para não encher o mês de repetição. Contínuo
  // (sem prazo) aparece em todo dia a partir do início, até alguém concluir.
  const porDia = useMemo(() => {
    const m = new Map<string, Ticket[]>()
    const por = (d: string, t: Ticket) => m.set(d, [...(m.get(d) || []), t])
    const ultimo = iso(new Date(mes.getFullYear(), mes.getMonth() + 1, 0))
    const primeiroDoMes = iso(mes)
    for (const t of tickets) {
      const p = noPlano(t, hoje)
      if (p.continuo) {
        for (let d = p.inicio > primeiroDoMes ? p.inicio : primeiroDoMes, i = 0; d <= ultimo && i < 40; d = somaDias(d, 1), i++) por(d, t)
        continue
      }
      if (p.atrasado) { por(hoje, t); continue }
      for (let d = p.inicio, i = 0; d <= p.fim && i < 120; d = somaDias(d, 1), i++) por(d, t)
    }
    for (const l of m.values()) l.sort((a, b) => Number(ehUrgente(b)) - Number(ehUrgente(a)) || (a.prazo || '').localeCompare(b.prazo || ''))
    return m
  }, [tickets, hoje, mes])
  // Soltar num dia: o bloco todo anda junto (mantém a duração). Contínuo:
  // muda só o dia em que começa.
  const soltar = (alvo: string) => {
    const t = tickets.find((x) => x.id === arr)
    const de = arrDe
    setArr(null); setArrDe(null); setSobre(null)
    if (!t) return
    const p = noPlano(t, hoje)
    if (p.continuo) { if (alvo !== p.inicio) onMudarDatas(t.id, alvo, null); return }
    if (!de) return
    const delta = difDias(de, alvo)
    if (!delta) return
    const dur = p.atrasado ? 0 : difDias(p.inicio, p.fim)
    const ni = p.atrasado ? alvo : somaDias(p.inicio, delta)
    onMudarDatas(t.id, ni, somaDias(ni, dur))
  }
  const nav: React.CSSProperties = { display: 'flex', alignItems: 'center', padding: 6, borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text,#111)' }
  return (
    <div style={{ marginTop: 16 }}>
    <div style={{ ...cartao, overflow: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderBottom: '1px solid var(--portal-border,#eee)', flexWrap: 'wrap' }}>
        <button style={nav} aria-label="Mês anterior" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
        <b style={{ minWidth: 160, textAlign: 'center', color: 'var(--portal-text,#111)', textTransform: 'capitalize' }}>{mes.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</b>
        <button style={nav} aria-label="Próximo mês" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
        <small style={{ marginLeft: 'auto', color: muted }}>
          Ticket em todos os dias do trabalho · atrasado fica em hoje (vermelho) · ∞ sem prazo aparece todo dia até concluir · arraste para mudar.
        </small>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))', minWidth: 780 }}>
        {SEMANA_SEG.map((d, i) => (
          // Faixa colorida dos dias da semana (dias úteis em vermelho, sáb/dom em cinza)
          <div key={d} style={{ padding: '7px 8px', fontSize: 12, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', textAlign: 'center', color: '#fff', background: i >= 5 ? '#64748b' : '#dc2626', borderRight: '1px solid rgba(255,255,255,.25)' }}>{SEMANA_LONGA[i]}</div>
        ))}
        {Array.from({ length: antes }, (_, i) => casaVazia(`a${i}`))}
        {dias.map((d) => {
          const k = iso(d)
          const fimDeSemana = d.getDay() === 0 || d.getDay() === 6
          const itens = porDia.get(k) || []
          return (
            <div key={k}
              onDragOver={(e) => { if (!arr) return; e.preventDefault(); if (sobre !== k) setSobre(k) }}
              onDrop={(e) => { e.preventDefault(); soltar(k) }}
              style={{ minHeight: 96, padding: 5, borderRight: '1px solid var(--portal-border,#f1f1f1)', borderBottom: '1px solid var(--portal-border,#f1f1f1)', background: sobre === k ? 'rgba(220,38,38,.07)' : fimDeSemana ? COR_FOLGA : undefined }}>
              <div style={{ fontSize: 11.5, fontWeight: k === hoje ? 800 : 600, color: k === hoje ? '#dc2626' : 'var(--portal-text,#111)', marginBottom: 3 }}><span style={{ display: 'inline-block', minWidth: 30, marginRight: 5, padding: '0 5px', borderRadius: 4, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', textAlign: 'center', color: '#fff', background: k === hoje ? '#dc2626' : fimDeSemana ? '#94a3b8' : '#f87171' }}>{SEMANA_SEG[(d.getDay() + 6) % 7]}</span>{d.getDate()}{k === hoje && ' · hoje'}</div>
              {(aberto === k ? itens : itens.slice(0, 4)).map((t) => {
                const atrasado = !!t.prazo && t.prazo < hoje
                const p = noPlano(t, hoje)
                const total = difDias(p.inicio, p.fim) + 1
                const diaN = difDias(p.inicio, k) + 1
                return (
                  <div key={t.id} draggable
                    onDragStart={() => { setArr(t.id); setArrDe(k) }} onDragEnd={() => { setArr(null); setArrDe(null); setSobre(null) }}
                    onClick={() => onAbrir(t.id)}
                    title={`#${t.numero} ${t.titulo} — ${STATUS_INFO[t.status]?.label || t.status}${atrasado ? ` · atrasado desde ${br(t.prazo)}` : ''}`}
                    style={{ fontSize: 11, fontWeight: 600, padding: '2px 6px', marginBottom: 2, borderRadius: 5, cursor: 'grab', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff', background: corDe(t), outline: atrasado ? '2px solid #dc2626' : undefined, outlineOffset: -2 }}>
                    {ehUrgente(t) && '🔥 '}#{t.numero} {t.titulo}{atrasado ? ` · desde ${br(t.prazo)}` : p.continuo ? ' · ∞' : total > 1 ? ` · dia ${diaN}/${total}` : ''}
                  </div>
                )
              })}
              {itens.length > 4 && (
                <button onClick={() => setAberto(aberto === k ? null : k)}
                  style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#dc2626' }}>
                  {aberto === k ? 'mostrar menos' : `+${itens.length - 4} mais`}
                </button>
              )}
            </div>
          )
        })}
        {Array.from({ length: depois }, (_, i) => casaVazia(`d${i}`))}
      </div>
    </div>
    </div>
  )
}
