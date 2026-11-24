'use client'
// PLANO DE TRABALHO (24/11/2026) — "visualizar o plano de forma prática": uma coluna por dia útil,
// a barra de ocupação do dia (de 4,5 h) e os blocos de cada trabalho na ordem, do tamanho das
// horas, na cor do quadro. Vem do mesmo motor da fila (ResumoFila.plano). Clicar abre o ticket.
import { useState } from 'react'
import { AlarmClock } from 'lucide-react'
import type { ItemResumo, ResumoFila } from '@/lib/trabalho/fila-server'

const SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const nf = (h: number) => String(Math.round(h * 10) / 10).replace('.', ',')
const dow = (iso: string) => new Date(iso + 'T12:00:00Z').getUTCDay()

export default function PlanoSemana({ fila, capacidade = 4.5, reunioesHoje = 0, onAbrir }: {
  fila: ResumoFila
  capacidade?: number
  reunioesHoje?: number
  onAbrir: (id: string) => void
}) {
  const [dias, setDias] = useState(5)
  const porId = new Map<string, ItemResumo>([...fila.hoje, ...fila.semana, ...(fila.listaDepois || [])].map((i) => [i.id, i]))
  const hoje = fila.plano?.[0]?.dia
  const plano = (fila.plano || []).slice(0, dias)

  return (
    <section className="mf-card mf-anim" aria-label="Plano de trabalho">
      <div className="mf-cab" style={{ flexWrap: 'wrap' }}>
        <h2>Plano de trabalho</h2>
        <span>cada dia tem {nf(capacidade)} h para a fila{reunioesHoje ? ` · hoje ${reunioesHoje} reunião(ões)` : ''}</span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'flex', gap: 4, padding: 3, borderRadius: 11, background: 'var(--portal-bg-secondary,#f1f5f9)' }}>
          {[5, 10].map((n) => (
            <button key={n} onClick={() => setDias(n)} aria-pressed={dias === n}
              style={{ height: 30, padding: '0 12px', borderRadius: 9, border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13,
                background: dias === n ? 'var(--portal-surface,#fefefe)' : 'transparent', color: 'var(--portal-text,#0f172a)', boxShadow: dias === n ? '0 1px 3px rgba(15,23,42,.12)' : 'none' }}>
              {n === 5 ? 'Esta semana' : '2 semanas'}
            </button>
          ))}
        </span>
      </div>
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${plano.length}, minmax(150px, 1fr))`, gap: 10, minWidth: plano.length * 160 }}>
          {plano.map(({ dia, itens }) => {
            const usado = itens.reduce((s, x) => s + x.horas, 0)
            const cheio = usado >= capacidade - 0.01
            const ehHoje = dia === hoje
            return (
              <div key={dia} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, paddingBottom: 6, borderBottom: `2px solid ${ehHoje ? '#2563eb' : 'var(--portal-border,#e2e8f0)'}` }}>
                  <span style={{ fontSize: 13, color: ehHoje ? '#2563eb' : 'var(--portal-text-secondary,#475569)' }}>{ehHoje ? 'Hoje' : SEMANA[dow(dia)]}</span>
                  <span style={{ fontSize: 13, color: 'var(--portal-text-muted,#64748b)' }}>{br(dia)}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, color: cheio ? '#b45309' : 'var(--portal-text-muted,#64748b)', fontVariantNumeric: 'tabular-nums' }}>{nf(usado)}/{nf(capacidade)} h</span>
                </div>
                <div className="mf-barra" title={`${nf(usado)} de ${nf(capacidade)} h ocupadas`} style={{ ['--c' as string]: cheio ? '#d97706' : '#2563eb' }}><i style={{ width: `${Math.min(100, (usado / capacidade) * 100)}%` }} /></div>
                {itens.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#94a3b8)', padding: '10px 0', textAlign: 'center', border: '1px dashed var(--portal-border,#e2e8f0)', borderRadius: 10 }}>livre</div>}
                {itens.map((x) => {
                  const i = porId.get(x.id)
                  if (!i) return null
                  const cor = i.quadro?.cor || '#64748b'
                  return (
                    <button key={x.id} onClick={() => onAbrir(x.id)} title={`#${i.numero} ${i.titulo} · ${nf(x.horas)} h neste dia${i.pedidoPor ? ` · pedido de ${i.pedidoPor}` : ''}`}
                      style={{ display: 'flex', flexDirection: 'column', gap: 2, minHeight: Math.max(44, Math.min(120, x.horas * 24)), padding: '7px 9px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', font: 'inherit',
                        border: `1px solid color-mix(in srgb,${cor} 35%,var(--portal-border,#e2e8f0))`, background: `color-mix(in srgb,${cor} 10%,var(--portal-surface,#fefefe))`, color: 'var(--portal-text,#0f172a)' }}>
                      <span style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>#{i.numero} {i.titulo}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--portal-text-secondary,#475569)' }}>
                        {nf(x.horas)} h{i.pedidoPor && <> · {i.pedidoPor.split(' ')[0]}</>}
                        {i.atrasado && <AlarmClock size={12} color="var(--cor-atrasado-texto)" aria-label="atrasado" />}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
