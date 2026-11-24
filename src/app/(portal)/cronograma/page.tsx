'use client'
// CENTRAL DE TRABALHO — "Todos" (antes Cronograma geral): todos os pedidos que eu posso ver, em
// Lista · Kanban · Gantt · Calendário (melhorias 1.4, 24/11/2026: um seletor só, escolha guardada).
// A Fila de UMA pessoa continua aqui por link (/cronograma?fila=<id>, "ver a fila de Fulano").
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GanttChartSquare, RefreshCw, CalendarDays, Columns3, List, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import SeloAtrasado from '@/components/tickets/SeloAtrasado'
import { STATUS_INFO } from '@/lib/tickets/constantes'
import FilaTrabalho from '@/components/trabalho/FilaTrabalho'
import { authHeaders } from '@/lib/auth/client'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { Ticket, TicketStatus, UsuarioMin } from '@/lib/tickets/constantes'
import TicketModal from '@/components/tickets/TicketModal'
import VistasCronogramaGeral, { type VistaGeral, ehUrgente, SeloUrgente } from '@/components/trabalho/VistasCronogramaGeral'
import KanbanTickets from '@/components/tickets/KanbanTickets'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'

interface Dados {
  tickets: Ticket[]
  quadros: Record<string, { id: string; nome: string; cor: string }>
  usuarios: Record<string, UsuarioMin>
  passos: Record<string, { feitas: number; total: number }>
  eu: string
}
type Filtro = 'tudo' | 'faco' | 'pedi'
type Vista = VistaGeral | 'fila' | 'lista'
const VISTAS: [Vista, string, React.ReactNode][] = [
  ['lista', 'Lista', <List key="l" size={15} />],
  ['kanban', 'Kanban', <Columns3 key="k" size={15} />],
  ['gantt', 'Gantt', <GanttChartSquare key="g" size={15} />],
  ['calendario', 'Calendário', <CalendarDays key="c" size={15} />],
]
const brD = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

const COR_SEM_BLOCO = '#9ca3af'
const visiveisBase = (dados: Dados | null, filtro: Filtro) => (dados?.tickets || []).filter((t) => {
  if (filtro === 'faco' && t.responsavel_id !== dados!.eu) return false
  if (filtro === 'pedi' && t.solicitante_id !== dados!.eu) return false
  return true
})
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

export default function CronogramaGeralPage() {
  const isMobile = useIsMobile()
  const { userProfile } = useAuth()
  const { isAdmin } = usePermissoes(userProfile?.id)
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('tudo')
  const [ticketAberto, setTicketAberto] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>('lista')
  const [versao, setVersao] = useState(0) // recarrega a Fila quando algo muda no ticket aberto
  const [filaDe, setFilaDe] = useState<string | null>(null)
  useEffect(() => {
    // /cronograma?fila=<pessoa> (botão "Ver agenda de Fulano" no ticket) abre a Fila dela.
    const sp = new URLSearchParams(window.location.search)
    const fila = sp.get('fila')
    if (fila && /^[0-9a-f-]{36}$/i.test(fila)) {
      setFilaDe(fila); setVista('fila')
      window.history.replaceState(null, '', window.location.pathname)
      return
    }
    try { const v = localStorage.getItem('cronograma-geral-vista'); if (v && VISTAS.some(([x]) => x === v)) setVista(v as Vista) } catch { /* sem storage */ }
  }, [])
  const trocarVista = (v: Vista) => { setVista(v); try { localStorage.setItem('cronograma-geral-vista', v) } catch { /* sem storage */ } }

  // manterErro: recarga depois de uma ação recusada — o aviso do servidor
  // continua na tela (antes o setErro('') do começo apagava na hora).
  // seq: resposta velha (foco + ação ao mesmo tempo) não sobrescreve a nova.
  const seq = useRef(0)
  const carregar = useCallback(async (manterErro = false) => {
    const n = ++seq.current
    try {
      const res = await fetch('/api/trabalho/cronograma-geral', { headers: await authHeaders(), cache: 'no-store' })
      const json = await res.json()
      if (n !== seq.current) return
      if (!res.ok) { setErro(json.error || 'Falha ao carregar'); return }
      setDados(json)
      if (!manterErro) setErro('')
    } catch { if (n === seq.current) setErro('Falha de conexão') }
  }, [])
  useEffect(() => { carregar() }, [carregar])
  const dadosRef = useRef<Dados | null>(null)
  useEffect(() => { dadosRef.current = dados }, [dados])
  useEffect(() => {
    const f = () => carregar(true)
    window.addEventListener('central-trabalho-mudou', f)
    window.addEventListener('focus', f)
    return () => { window.removeEventListener('central-trabalho-mudou', f); window.removeEventListener('focus', f) }
  }, [carregar])

  const hoje = hojeISO()
  const corDe = useCallback((t: Ticket) => (t.quadro_id && dados?.quadros[t.quadro_id]?.cor) || COR_SEM_BLOCO, [dados])
  const progresso = useCallback((t: Ticket) => {
    const p = dados?.passos[t.id]
    return p && p.total > 0 ? Math.round((p.feitas / p.total) * 100) : null
  }, [dados])

  // Arrastar no Gantt/Calendário (prazo) e no Kanban (status): otimista, pela
  // mesma rota dos botões do ticket (evento na timeline + notificação). O
  // servidor decide quem pode; recusou = volta como estava + aviso.
  const acaoTicket = useCallback(async (id: string, corpo: Record<string, unknown>, patch: (t: Ticket) => Partial<Ticket>) => {
    const antes = dadosRef.current?.tickets.find((t) => t.id === id)
    seq.current++ // recarga já a caminho traria o estado velho
    setDados((d) => d && { ...d, tickets: d.tickets.map((t) => (t.id === id ? { ...t, ...patch(t) } : t)) })
    let ok = false
    try {
      const res = await fetch(`/api/tickets/${id}/acoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(corpo),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Não deu para mudar')
      ok = true
    } catch (e) {
      // Volta como estava e deixa o motivo do servidor à vista.
      if (antes) { const a = antes; setDados((d) => d && { ...d, tickets: d.tickets.map((t) => (t.id === id ? a : t)) }) }
      setErro(e instanceof TypeError ? 'Falha de conexão — nada mudou' : e instanceof Error ? e.message : 'Não deu para mudar')
    }
    if (ok) setErro('')
    carregar(!ok)
  }, [carregar])
  const mudarDatas = useCallback((id: string, inicio: string, prazo: string | null) =>
    acaoTicket(id, { acao: 'editar', prazo, inicio }, (t) => ({ prazo, payload: { ...(t.payload || {}), inicio } })), [acaoTicket])
  const mudarStatus = useCallback((id: string, para: TicketStatus) => acaoTicket(id, { acao: 'status', para }, () => ({ status: para })), [acaoTicket])
  // Resolvido (esperando o pedinte confirmar) só aparece no Kanban.
  const noPlanoVisiveis = useMemo(() => visiveisBase(dados, filtro).filter((t) => t.status !== 'resolvido'), [dados, filtro])

  const visiveis = useMemo(() => visiveisBase(dados, filtro), [dados, filtro])

  const pilula = (ativo: boolean): React.CSSProperties => ({
    padding: isMobile ? '8px 12px' : '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: ativo ? '2px solid #dc2626' : '1px solid var(--portal-border,#e5e7eb)',
    background: ativo ? 'rgba(220,38,38,.08)' : 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)',
  })

  return (
    <div style={{ padding: 'clamp(12px,2vw,28px)' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {/* Na Fila os filtros não valem: é a fila de UMA pessoa */}
        {vista !== 'fila' && ([['tudo', 'Tudo'], ['faco', 'Que eu faço'], ['pedi', 'Que eu pedi']] as [Filtro, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setFiltro(v)} style={pilula(filtro === v)}>{l}</button>
        ))}
        <div role="group" aria-label="Forma de ver o cronograma" style={{ display: 'flex', flexWrap: 'wrap', maxWidth: '100%', gap: 4, marginLeft: isMobile ? 0 : 'auto', padding: 3, borderRadius: 10, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)' }}>
          {VISTAS.map(([v, txt, ic]) => (
            <button key={v} aria-pressed={vista === v} onClick={() => trocarVista(v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: isMobile ? '8px 10px' : '5px 10px', borderRadius: 7, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: vista === v ? 'rgba(220,38,38,.1)' : 'transparent', color: vista === v ? '#dc2626' : 'var(--portal-text-muted,#666)' }}>
              {ic} {txt}
            </button>
          ))}
        </div>
        {isAdmin && <Link href="/tickets?aba=gerencial" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, fontSize: 13, textDecoration: 'none', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text-secondary,#475569)' }}><BarChart3 size={14} /> Visão geral</Link>}
        <button onClick={() => carregar()} title="Atualizar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: isMobile ? 36 : undefined, minHeight: isMobile ? 36 : undefined, padding: 8, borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {erro && <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600, marginTop: 12 }}>{erro}</div>}

      {vista === 'fila' ? (
        <FilaTrabalho key={filaDe || 'eu'} onAbrir={setTicketAberto} versao={versao} userInicial={filaDe} />
      ) : !dados ? (
        !erro && <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text-muted,#888)' }}>Carregando...</div>
      ) : visiveis.length === 0 ? (
        <div style={{ marginTop: 20, padding: '40px 20px', textAlign: 'center', borderRadius: 12, border: '1px dashed var(--portal-border,#ddd)', color: 'var(--portal-text-muted,#888)', fontSize: 14 }}>
          Nada em aberto por aqui.
        </div>
      ) : (
        vista === 'lista' ? (
          // Lista: atrasados em cima, depois pelo prazo. Linha = título · quem faz · prazo · situação.
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...visiveis].sort((a, b) => Number(!!b.prazo && b.prazo < hoje) - Number(!!a.prazo && a.prazo < hoje) || (a.prazo || '9').localeCompare(b.prazo || '9')).map((t) => {
              const atrasado = !!t.prazo && t.prazo < hoje
              const st = STATUS_INFO[t.status]
              return (
                <button key={t.id} onClick={() => setTicketAberto(t.id)}
                  style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 170px 150px 130px', gap: 10, alignItems: 'center', padding: '10px 14px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', font: 'inherit',
                    border: '1px solid var(--portal-border,#e2e8f0)', background: 'var(--portal-surface,#fefefe)', color: 'var(--portal-text,#0f172a)' }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14.5, fontWeight: 500 }}>#{t.numero} {t.titulo}</span>
                  <span style={{ fontSize: 13, color: 'var(--portal-text-secondary,#475569)' }}>faz: {(dados.usuarios[t.responsavel_id]?.nome || '—').split(' ')[0]}</span>
                  <span>{atrasado ? <SeloAtrasado>desde {brD(t.prazo!)}</SeloAtrasado> : <span style={{ fontSize: 13, color: 'var(--portal-text-muted,#64748b)' }}>{t.prazo ? `prazo ${brD(t.prazo)}` : 'contínuo'}</span>}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary,#475569)' }}>{st?.label || t.status}</span>
                </button>
              )
            })}
          </div>
        ) : vista === 'kanban' ? (
          <div style={{ marginTop: 16 }}>
            <KanbanTickets tickets={visiveis} usuarios={dados.usuarios} visao="acompanhando" encerrados={false}
              meuId={dados.eu} isAdmin={isAdmin} atualId={null} onMarcarAtual={() => {}}
              onMudarStatus={mudarStatus} onAbrir={setTicketAberto} corDe={corDe}
              extra={(t) => {
                const q = t.quadro_id ? dados.quadros[t.quadro_id] : null
                if (!ehUrgente(t) && !q && t.prazo) return null
                return (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 11, fontWeight: 700 }}>
                    {ehUrgente(t) && <SeloUrgente />}
                    {q && <span style={{ color: q.cor }}>{q.nome}</span>}
                    {!t.prazo && <span style={{ color: '#0369a1' }}>∞ contínuo</span>}
                  </span>
                )
              }} />
          </div>
        ) : (
          <VistasCronogramaGeral vista={vista as VistaGeral} tickets={noPlanoVisiveis} hoje={hoje} corDe={corDe} progresso={progresso}
            onAbrir={setTicketAberto} onMudarDatas={mudarDatas} usuarios={dados?.usuarios} />
        )
      )}

      {ticketAberto && <TicketModal id={ticketAberto} onFechar={() => { setTicketAberto(null); carregar(true) }} onMudou={() => { carregar(); setVersao((v) => v + 1) }} />}
    </div>
  )
}
