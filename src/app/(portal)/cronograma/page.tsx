'use client'
// CENTRAL DE TRABALHO — Cronograma GERAL: tudo que eu posso ver, em ordem de
// dia (prazo), cada ticket na cor do seu bloco. Atrasados primeiro, sem data
// por último. Os antigos "projetos" saíram: quem organiza agora são os blocos.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { GanttChartSquare, RefreshCw, SquareCheck, AlertTriangle } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { Ticket } from '@/lib/tickets/constantes'
import StatusBadge from '@/components/tickets/StatusBadge'
import TicketModal from '@/components/tickets/TicketModal'

interface Dados {
  tickets: Ticket[]
  quadros: Record<string, { id: string; nome: string; cor: string }>
  usuarios: Record<string, { id: string; nome: string }>
  passos: Record<string, { feitas: number; total: number }>
  eu: string
}
type Filtro = 'tudo' | 'faco' | 'pedi'

const SEM_BLOCO = '__sem__'
const COR_SEM_BLOCO = '#9ca3af'
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const somaDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const rotuloDia = (iso: string, hoje: string) => {
  const d = new Date(iso + 'T12:00:00')
  const base = `${DIAS[d.getDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  if (iso === hoje) return `Hoje · ${base}`
  if (iso === somaDias(hoje, 1)) return `Amanhã · ${base}`
  return base
}

export default function CronogramaGeralPage() {
  const isMobile = useIsMobile()
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('tudo')
  const [ocultos, setOcultos] = useState<Set<string>>(new Set())
  const [ticketAberto, setTicketAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const res = await fetch('/api/trabalho/cronograma-geral', { headers: await authHeaders(), cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao carregar'); return }
      setDados(json)
    } catch { setErro('Falha de conexão') }
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    const f = () => carregar()
    window.addEventListener('central-trabalho-mudou', f)
    window.addEventListener('focus', f)
    return () => { window.removeEventListener('central-trabalho-mudou', f); window.removeEventListener('focus', f) }
  }, [carregar])

  const hoje = hojeISO()
  const blocoDe = (t: Ticket) => (t.quadro_id && dados?.quadros[t.quadro_id] ? t.quadro_id : SEM_BLOCO)
  const corDe = (t: Ticket) => (t.quadro_id && dados?.quadros[t.quadro_id]?.cor) || COR_SEM_BLOCO

  // Legenda = só os blocos que aparecem na lista
  const legenda = useMemo(() => {
    if (!dados) return []
    const ids = [...new Set(dados.tickets.map(blocoDe))]
    return ids.map((id) => id === SEM_BLOCO
      ? { id, nome: 'Sem bloco', cor: COR_SEM_BLOCO }
      : { id, nome: dados.quadros[id].nome, cor: dados.quadros[id].cor })
      .sort((a, b) => (a.id === SEM_BLOCO ? 1 : b.id === SEM_BLOCO ? -1 : a.nome.localeCompare(b.nome, 'pt-BR')))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados])

  const visiveis = useMemo(() => (dados?.tickets || []).filter((t) => {
    if (filtro === 'faco' && t.responsavel_id !== dados!.eu) return false
    if (filtro === 'pedi' && t.solicitante_id !== dados!.eu) return false
    return !ocultos.has(blocoDe(t))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dados, filtro, ocultos])

  const grupos = useMemo(() => {
    const atrasados = visiveis.filter((t) => t.prazo && t.prazo < hoje)
    const porDia = new Map<string, Ticket[]>()
    for (const t of visiveis) if (t.prazo && t.prazo >= hoje) porDia.set(t.prazo, [...(porDia.get(t.prazo) || []), t])
    const semData = visiveis.filter((t) => !t.prazo)
    return { atrasados, dias: [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)), semData }
  }, [visiveis, hoje])

  // Faixa das próximas 2 semanas (bolinhas na cor do bloco)
  const faixa = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const dia = somaDias(hoje, i)
    return { dia, tickets: visiveis.filter((t) => t.prazo === dia) }
  }), [visiveis, hoje])

  const alternarBloco = (id: string) => setOcultos((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const pilula = (ativo: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: ativo ? '2px solid #dc2626' : '1px solid var(--portal-border,#e5e7eb)',
    background: ativo ? 'rgba(220,38,38,.08)' : 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)',
  })

  const linha = (t: Ticket) => {
    const q = t.quadro_id ? dados!.quadros[t.quadro_id] : null
    const p = dados!.passos[t.id]
    const eu = dados!.eu
    const quem = t.responsavel_id === eu
      ? (t.solicitante_id === eu ? 'eu mesmo' : `de ${dados!.usuarios[t.solicitante_id]?.nome || '—'}`)
      : `${dados!.usuarios[t.responsavel_id]?.nome || '—'} faz`
    return (
      <button key={t.id} onClick={() => setTicketAberto(t.id)}
        style={{ display: 'flex', alignItems: 'stretch', width: '100%', textAlign: 'left', padding: 0, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)' }}>
        <span style={{ width: 6, flex: 'none', background: corDe(t) }} />
        <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '9px 12px' }}>
          <span style={{ flex: '1 1 220px', minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{t.numero} {t.titulo}</span>
            <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>
              {quem}{q ? <> · <span style={{ color: q.cor, fontWeight: 700 }}>{q.nome}</span></> : null}
              {p && p.total > 0 ? <> · <SquareCheck size={11} style={{ verticalAlign: -1 }} /> {p.feitas}/{p.total}</> : null}
            </span>
          </span>
          <StatusBadge status={t.status} tamanho={11.5} />
        </span>
      </button>
    )
  }
  const grupo = (titulo: React.ReactNode, lista: Ticket[], id?: string, cor?: string) => (
    <section key={id} id={id} style={{ marginTop: 18, scrollMarginTop: 90 }}>
      <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px', fontSize: 13.5, fontWeight: 800, textTransform: 'capitalize', color: cor || 'var(--portal-text,#111)' }}>
        {titulo} <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted,#888)', textTransform: 'none' }}>{lista.length}</span>
      </h3>
      <div style={{ display: 'grid', gap: 6 }}>{lista.map(linha)}</div>
    </section>
  )

  return (
    <div style={{ padding: isMobile ? '14px 12px' : 20, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--portal-text,#111)' }}>
            <GanttChartSquare size={20} color="#dc2626" /> Cronograma
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Tudo que você pode ver, por dia, na cor de cada bloco.</p>
        </div>
        <button onClick={carregar} title="Atualizar" style={{ display: 'flex', padding: 8, borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}>
          <RefreshCw size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        {([['tudo', 'Tudo'], ['faco', 'Que eu faço'], ['pedi', 'Que eu pedi']] as [Filtro, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setFiltro(v)} style={pilula(filtro === v)}>{l}</button>
        ))}
      </div>
      {legenda.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {legenda.map((b) => {
            const off = ocultos.has(b.id)
            return (
              <button key={b.id} onClick={() => alternarBloco(b.id)} title={off ? 'Mostrar' : 'Esconder'}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)', opacity: off ? .4 : 1, textDecoration: off ? 'line-through' : undefined }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: b.cor }} /> {b.nome}
              </button>
            )
          })}
        </div>
      )}

      {erro && <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600, marginTop: 12 }}>{erro}</div>}

      {!dados ? (
        !erro && <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text-muted,#888)' }}>Carregando...</div>
      ) : (
        <>
          {/* Próximas 2 semanas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, minmax(48px, 1fr))', gap: 4, marginTop: 16, overflowX: 'auto', paddingBottom: 4 }}>
            {faixa.map(({ dia, tickets }) => {
              const d = new Date(dia + 'T12:00:00')
              const fimDeSemana = d.getDay() === 0 || d.getDay() === 6
              return (
                <button key={dia} onClick={() => tickets.length && document.getElementById(`dia-${dia}`)?.scrollIntoView({ behavior: 'smooth' })}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '6px 2px', borderRadius: 8, cursor: tickets.length ? 'pointer' : 'default',
                    border: dia === hoje ? '2px solid #dc2626' : '1px solid var(--portal-border,#e5e7eb)',
                    background: fimDeSemana ? 'var(--portal-bg,#f7f7f7)' : 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)' }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted,#888)' }}>{DIAS[d.getDay()]}</span>
                  <span style={{ fontSize: 14, fontWeight: 800 }}>{dia.slice(8, 10)}</span>
                  <span style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 2, minHeight: 8, maxWidth: 40 }}>
                    {tickets.slice(0, 6).map((t) => <span key={t.id} style={{ width: 7, height: 7, borderRadius: '50%', background: corDe(t) }} />)}
                    {tickets.length > 6 && <span style={{ fontSize: 9, fontWeight: 800 }}>+{tickets.length - 6}</span>}
                  </span>
                </button>
              )
            })}
          </div>

          {visiveis.length === 0 ? (
            <div style={{ marginTop: 20, padding: '40px 20px', textAlign: 'center', borderRadius: 12, border: '1px dashed var(--portal-border,#ddd)', color: 'var(--portal-text-muted,#888)', fontSize: 14 }}>
              Nada em aberto por aqui.
            </div>
          ) : (
            <>
              {grupos.atrasados.length > 0 && grupo(<><AlertTriangle size={15} /> Atrasados</>, grupos.atrasados, 'atrasados', '#dc2626')}
              {grupos.dias.map(([dia, lista]) => grupo(rotuloDia(dia, hoje), lista, `dia-${dia}`))}
              {grupos.semData.length > 0 && grupo('Sem data', grupos.semData, 'sem-data', 'var(--portal-text-muted,#888)')}
            </>
          )}
        </>
      )}

      {ticketAberto && <TicketModal id={ticketAberto} onFechar={() => setTicketAberto(null)} onMudou={carregar} />}
    </div>
  )
}
