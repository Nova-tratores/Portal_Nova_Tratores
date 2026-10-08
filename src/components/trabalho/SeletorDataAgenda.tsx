'use client'
// CENTRAL DE TRABALHO — seletor de data com a agenda da pessoa.
// Dia que já tem ticket/tarefa marcado fica ÂMBAR (com a quantidade); dá para
// escolher mesmo assim — só avisa embaixo o que já tem naquele dia.
// Dados: GET /api/trabalho/agenda?user=<id> → ocupados { 'AAAA-MM-DD': nomes[] }.
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { fimDeSemana } from '@/lib/trabalho/agenda'

type Ocupados = Record<string, string[]>
// cache por pessoa (1 min): abrir/fechar o seletor não refaz a consulta
const cache = new Map<string, { em: number; dados: Ocupados }>()

async function carregarOcupados(user: string): Promise<Ocupados> {
  const c = cache.get(user)
  if (c && Date.now() - c.em < 60_000) return c.dados
  const res = await fetch(`/api/trabalho/agenda?duracao=1${user ? `&user=${user}` : ''}`, { headers: await authHeaders(), cache: 'no-store' })
  if (!res.ok) throw new Error('agenda')
  const j = await res.json()
  const dados: Ocupados = j.ocupados || {}
  cache.set(user, { em: Date.now(), dados })
  return dados
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const br = (s: string) => s.split('-').reverse().join('/')
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export default function SeletorDataAgenda({
  value, onChange, userId, min, permitirVazio, textoVazio = 'Sem data', rotulo, ignorar, alinhar = 'esquerda', diasUteis,
}: {
  value: string
  onChange: (v: string) => void
  /** De quem é a agenda (vazio = minha). */
  userId?: string | null
  min?: string
  /** Mostra "limpar" (ex.: prazo vazio = contínuo). */
  permitirVazio?: boolean
  textoVazio?: string
  rotulo?: string
  /** Lado em que o calendário abre (direita = encostado na borda direita do campo). */
  alinhar?: 'esquerda' | 'direita'
  /** Só dia útil: sábado e domingo ficam travados (datas de ticket). */
  diasUteis?: boolean
  /** Nome a não contar como ocupado (o próprio ticket que está sendo editado). */
  ignorar?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [ocupados, setOcupados] = useState<Ocupados | null>(null)
  const [falhou, setFalhou] = useState(false)
  const base = value ? new Date(value + 'T12:00:00') : new Date()
  const [mes, setMes] = useState({ a: base.getFullYear(), m: base.getMonth() })
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let vivo = true
    carregarOcupados(userId || '')
      .then((d) => { if (vivo) { setOcupados(d); setFalhou(false) } })
      .catch(() => { if (vivo) setFalhou(true) })
    return () => { vivo = false }
  }, [userId])

  // fecha clicando fora
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])

  const doDia = (d: string) => (ocupados?.[d] || []).filter((n) => !ignorar || n !== ignorar)
  const hoje = iso(new Date())
  const semanas = useMemo(() => {
    const primeiro = new Date(mes.a, mes.m, 1)
    const desloc = (primeiro.getDay() + 6) % 7 // segunda primeiro
    const dias: (string | null)[] = Array(desloc).fill(null)
    const total = new Date(mes.a, mes.m + 1, 0).getDate()
    for (let i = 1; i <= total; i++) dias.push(iso(new Date(mes.a, mes.m, i)))
    while (dias.length % 7) dias.push(null)
    return dias
  }, [mes])
  const andar = (n: number) => setMes(({ a, m }) => { const d = new Date(a, m + n, 1); return { a: d.getFullYear(), m: d.getMonth() } })

  const noValor = value ? doDia(value) : []

  return (
    <div ref={caixa} style={{ position: 'relative' }}>
      {rotulo && <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text-muted,#888)', marginBottom: 3 }}>{rotulo}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => setAberto((v) => !v)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px', borderRadius: 8, fontSize: 13, cursor: 'pointer', textAlign: 'left',
            border: `1px solid ${noValor.length ? '#f59e0b' : 'var(--portal-border,#e5e7eb)'}`,
            background: noValor.length ? 'rgba(245,158,11,.10)' : 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)',
          }}>
          <CalendarDays size={14} style={{ opacity: .6 }} />
          {value ? br(value) : <span style={{ color: 'var(--portal-text-muted,#999)' }}>{textoVazio}</span>}
        </button>
        {permitirVazio && value && (
          <button type="button" onClick={() => onChange('')} title="Limpar data" aria-label="Limpar data"
            style={{ display: 'flex', alignItems: 'center', padding: '0 9px', borderRadius: 8, cursor: 'pointer', border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', color: 'var(--portal-text-muted,#888)' }}>
            <X size={13} />
          </button>
        )}
      </div>

      {diasUteis && value && fimDeSemana(value) && (
        <div style={{ marginTop: 5, fontSize: 11.5, color: '#dc2626', fontWeight: 600 }}>Ticket não pode ficar no fim de semana — escolha um dia útil.</div>
      )}

      {noValor.length > 0 && (
        <div style={{ marginTop: 5, fontSize: 11.5, color: '#b45309', lineHeight: 1.4 }}>
          ⚠ Já tem {noValor.length === 1 ? 'algo marcado' : `${noValor.length} coisas marcadas`} neste dia: {noValor.slice(0, 3).join(' · ')}{noValor.length > 3 ? '…' : ''}
        </div>
      )}

      {aberto && (
        <div style={{
          position: 'absolute', zIndex: 50, top: '100%', ...(alinhar === 'direita' ? { right: 0 } : { left: 0 }), marginTop: 4, width: 264, padding: 10, borderRadius: 12,
          background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)', boxShadow: '0 12px 32px rgba(0,0,0,.18)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <button type="button" onClick={() => andar(-1)} aria-label="Mês anterior" style={navBtn}><ChevronLeft size={15} /></button>
            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--portal-text,#111)' }}>{MESES[mes.m]} {mes.a}</span>
            <button type="button" onClick={() => andar(1)} aria-label="Próximo mês" style={navBtn}><ChevronRight size={15} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, fontSize: 10.5, fontWeight: 700, color: 'var(--portal-text-muted,#999)', textAlign: 'center', marginBottom: 2 }}>
            {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((d, i) => <span key={i}>{d}</span>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {semanas.map((d, i) => {
              if (!d) return <span key={i} />
              const n = doDia(d).length
              const sel = d === value
              const fds = i % 7 >= 5
              const bloqueado = (!!min && d < min) || (!!diasUteis && fds)
              return (
                <button key={d} type="button" disabled={bloqueado}
                  title={n ? doDia(d).join('\n') : undefined}
                  onClick={() => { onChange(d); setAberto(false) }}
                  style={{
                    position: 'relative', height: 32, borderRadius: 7, fontSize: 12.5, fontWeight: sel || d === hoje ? 800 : 500,
                    cursor: bloqueado ? 'not-allowed' : 'pointer', opacity: bloqueado ? .35 : 1,
                    border: d === hoje && !sel ? '1px solid var(--portal-text-muted,#999)' : '1px solid transparent',
                    background: sel ? '#dc2626' : n ? 'rgba(245,158,11,.22)' : 'transparent',
                    color: sel ? '#fff' : n ? '#92400e' : fds ? 'var(--portal-text-muted,#aaa)' : 'var(--portal-text,#111)',
                  }}>
                  {Number(d.slice(8))}
                  {n > 0 && (
                    <span style={{ position: 'absolute', top: 1, right: 2, fontSize: 8.5, fontWeight: 800, color: sel ? '#fff' : '#b45309' }}>{n}</span>
                  )}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 10.5, color: 'var(--portal-text-muted,#888)' }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: 'rgba(245,158,11,.35)' }} />
            {diasUteis ? 'Sábado e domingo não entram · ' : ''}{falhou ? 'Não deu para ver a agenda agora' : ocupados ? 'Dia com algo já marcado (pode escolher mesmo assim)' : 'Olhando a agenda…'}
          </div>
        </div>
      )}
    </div>
  )
}

const navBtn: React.CSSProperties = {
  display: 'flex', padding: 5, borderRadius: 7, cursor: 'pointer',
  border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', color: 'var(--portal-text-secondary,#555)',
}
