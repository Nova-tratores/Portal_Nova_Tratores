'use client'
// Grade de horários da sala (estilo Google Agenda): colunas = dias, linhas = horas.
// Clique num horário vazio = reserva de 1 h; arrastar para baixo = escolhe o intervalo.
import { useRef, useState } from 'react'
import { GRADE_INICIO, GRADE_FIM, posicaoNaGrade, minutoDoY, reservasDoDia, localDe, hhmm, minutos, type Reserva } from '@/lib/salas/regras'

const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export default function AgendaSemana({ dias, reservas, eu, agora, pxPorHora = 48, onNovo, onAbrir }: {
  dias: string[]
  reservas: Reserva[]
  eu: string
  agora: { dia: string; hora: string }
  pxPorHora?: number
  onNovo: (dia: string, inicioMin: number, fimMin: number) => void
  onAbrir: (r: Reserva) => void
}) {
  const horas = Array.from({ length: GRADE_FIM - GRADE_INICIO }, (_, i) => GRADE_INICIO + i)
  const altura = (GRADE_FIM - GRADE_INICIO) * pxPorHora
  const [sel, setSel] = useState<{ dia: string; a: number; b: number } | null>(null)
  const arrastando = useRef(false)
  const agoraMin = minutos(agora.hora)
  const yDe = (e: React.PointerEvent<HTMLDivElement>) => e.clientY - e.currentTarget.getBoundingClientRect().top
  const passado = (dia: string, min: number) => dia < agora.dia || (dia === agora.dia && min < agoraMin - (agoraMin % 15))

  const inicio = (dia: string, e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-reserva]')) return
    const m = minutoDoY(yDe(e), pxPorHora)
    if (passado(dia, m)) return
    arrastando.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    setSel({ dia, a: m, b: m + 15 })
  }
  const mover = (dia: string, e: React.PointerEvent<HTMLDivElement>) => {
    if (!arrastando.current || !sel || sel.dia !== dia) return
    const m = minutoDoY(yDe(e), pxPorHora) + 15
    setSel({ ...sel, b: Math.max(sel.a + 15, Math.min(m, GRADE_FIM * 60)) })
  }
  const soltar = () => {
    if (!arrastando.current || !sel) return
    arrastando.current = false
    const curto = sel.b - sel.a <= 15
    onNovo(sel.dia, sel.a, curto ? Math.min(sel.a + 60, GRADE_FIM * 60) : sel.b)   // clique simples = 1 h
    setSel(null)
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: `52px repeat(${dias.length}, minmax(0, 1fr))`, border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 12, overflow: 'hidden', background: 'var(--portal-surface,#fff)' }}>
      {/* cabeçalho */}
      <div style={{ borderBottom: '1px solid var(--portal-border,#e5e7eb)' }} />
      {dias.map((d) => {
        const hoje = d === agora.dia
        return (
          <div key={d} style={{ padding: '8px 4px', textAlign: 'center', borderBottom: '1px solid var(--portal-border,#e5e7eb)', borderLeft: '1px solid var(--portal-border,#f0f0f0)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: hoje ? '#0891b2' : 'var(--portal-text-muted,#888)' }}>{SEMANA[new Date(d + 'T12:00:00Z').getUTCDay()]}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', marginTop: 2, fontSize: 16, fontWeight: 800, background: hoje ? '#0891b2' : 'transparent', color: hoje ? '#fff' : 'var(--portal-text,#111)' }}>{Number(d.slice(8, 10))}</div>
          </div>
        )
      })}

      {/* coluna das horas */}
      <div style={{ position: 'relative', height: altura }}>
        {horas.map((h) => (
          <div key={h} style={{ position: 'absolute', top: (h - GRADE_INICIO) * pxPorHora - 7, right: 6, fontSize: 11, color: 'var(--portal-text-muted,#999)' }}>{h > GRADE_INICIO ? `${String(h).padStart(2, '0')}:00` : ''}</div>
        ))}
      </div>

      {/* dias */}
      {dias.map((d) => (
        <div key={d} onPointerDown={(e) => inicio(d, e)} onPointerMove={(e) => mover(d, e)} onPointerUp={soltar} onPointerCancel={() => { arrastando.current = false; setSel(null) }}
          style={{ position: 'relative', height: altura, borderLeft: '1px solid var(--portal-border,#f0f0f0)', cursor: 'cell', touchAction: 'pan-y', userSelect: 'none',
            backgroundImage: `repeating-linear-gradient(to bottom, var(--portal-border,#eef0f2) 0, var(--portal-border,#eef0f2) 1px, transparent 1px, transparent ${pxPorHora}px)` }}>
          {/* passado esmaecido */}
          {d <= agora.dia && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: d < agora.dia ? altura : Math.max(0, Math.min(altura, ((agoraMin - GRADE_INICIO * 60) / 60) * pxPorHora)), background: 'rgba(148,163,184,.12)', pointerEvents: 'none' }} />
          )}
          {/* linha do agora */}
          {d === agora.dia && agoraMin > GRADE_INICIO * 60 && agoraMin < GRADE_FIM * 60 && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: ((agoraMin - GRADE_INICIO * 60) / 60) * pxPorHora, height: 2, background: '#dc2626', zIndex: 3, pointerEvents: 'none' }}>
              <span style={{ position: 'absolute', left: -4, top: -4, width: 10, height: 10, borderRadius: '50%', background: '#dc2626' }} />
            </div>
          )}
          {/* seleção em andamento */}
          {sel && sel.dia === d && (
            <div style={{ position: 'absolute', left: 3, right: 3, top: ((sel.a - GRADE_INICIO * 60) / 60) * pxPorHora, height: ((sel.b - sel.a) / 60) * pxPorHora, borderRadius: 6, background: 'rgba(8,145,178,.25)', border: '2px dashed #0891b2', zIndex: 2, fontSize: 11, fontWeight: 800, color: '#0e7490', padding: '2px 6px', pointerEvents: 'none' }}>
              {hhmm(sel.a)}–{hhmm(sel.b)}
            </div>
          )}
          {/* reservas */}
          {reservasDoDia(reservas, d).map((r) => {
            const { top, altura: h } = posicaoNaGrade(r.inicio, r.fim, pxPorHora)
            const minha = r.responsavel_id === eu || r.criado_por === eu
            const cor = r.cor || (r.reuniao_id ? '#7c3aed' : '#0891b2')
            return (
              <button key={r.id} data-reserva onClick={() => onAbrir(r)} title={`${localDe(r.inicio).hora}–${localDe(r.fim).hora} · ${r.titulo}${r.responsavel_nome ? ` · ${r.responsavel_nome}` : ''}`}
                style={{ position: 'absolute', left: 3, right: 3, top, height: h, zIndex: 2, overflow: 'hidden', textAlign: 'left', cursor: 'pointer', borderRadius: 6, padding: '3px 6px',
                  border: `1px solid ${cor}`, borderLeft: `4px solid ${cor}`, background: minha ? cor : `${cor}22`, color: minha ? '#fff' : 'var(--portal-text,#111)' }}>
                {h < pxPorHora * 0.8 ? (
                  // bloco curto (até ~45 min): horário e título numa linha só
                  <div style={{ fontSize: 11.5, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <b>{localDe(r.inicio).hora}</b> {r.reuniao_id ? '📋 ' : ''}<b>{r.titulo}</b>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, opacity: .9 }}>{localDe(r.inicio).hora}–{localDe(r.fim).hora}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, lineHeight: 1.2 }}>{r.reuniao_id ? '📋 ' : ''}{r.titulo}</div>
                    {h >= pxPorHora * 1.4 && <div style={{ fontSize: 11, opacity: .85 }}>{(r.responsavel_nome || '').split(' ')[0]}</div>}
                  </>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
