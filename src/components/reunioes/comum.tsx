'use client'
// Reuniões — peças e estilos compartilhados pelas telas.
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { ReuniaoEtapa } from '@/lib/reunioes/regras'
import { ETAPA_INFO } from '@/lib/reunioes/regras'

export async function chamar<T = Record<string, unknown>>(url: string, init?: { method?: string; json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method || (init?.json !== undefined ? 'POST' : 'GET'),
    headers: { ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(await authHeaders()) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
    cache: 'no-store',
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) {
    const e = new Error(j.error || `Falha (${res.status})`) as Error & { status?: number; pendentes?: string[] }
    e.status = res.status; e.pendentes = j.pendentes
    throw e
  }
  return j as T
}

export const cartao: React.CSSProperties = {
  background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 14, padding: 16,
  boxShadow: '0 2px 8px rgba(0,0,0,.04)',
}
export const campo: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
  border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)', outline: 'none',
}
export const rotulo: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--portal-text-secondary,#555)', textTransform: 'uppercase', letterSpacing: .3 }
export const botao = (cor = '#dc2626', grande = false): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: grande ? '12px 16px' : '8px 14px', borderRadius: 10, border: 'none',
  background: cor, color: '#fff', fontSize: grande ? 15 : 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', minHeight: grande ? 46 : 36,
})
export const botaoClaro = (grande = false): React.CSSProperties => ({
  ...botao('var(--portal-surface,#fff)', grande), color: 'var(--portal-text,#111)', border: '1px solid var(--portal-border,#e5e7eb)',
})
export const chip = (cor: string, fundo: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: cor, background: fundo, whiteSpace: 'nowrap',
})

export const br = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—')
export const brCurto = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—')
export const horaDe = (ts: string | null | undefined) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '')
export const diaDe = (ts: string | null | undefined) => (ts ? new Date(ts).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }) : '')
export const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
export const primeiroNome = (n?: string | null) => (n || '—').split(' ')[0]

export function EtapaChip({ etapa }: { etapa: ReuniaoEtapa }) {
  const i = ETAPA_INFO[etapa]
  return <span style={chip(i.cor, i.fundo)}><span style={{ width: 7, height: 7, borderRadius: '50%', background: i.cor }} /> {i.label}</span>
}

/** Overlay de modal no padrão dos Quadros. */
export function Modal({ titulo, onFechar, children, largura = 560 }: { titulo: string; onFechar: () => void; children: React.ReactNode; largura?: number }) {
  return (
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 1400, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: largura, maxHeight: '92vh', overflowY: 'auto', background: 'var(--portal-surface,#fff)', borderRadius: 14, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--portal-text,#111)' }}>{titulo}</h2>
          <button onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 20, color: 'var(--portal-text-muted,#888)', lineHeight: 1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Cronômetro simples (mm:ss), fica vermelho quando passa do limite. */
export function Timer({ limiteMin, ativo, chave }: { limiteMin: number; ativo: boolean; chave: string }) {
  return <TimerInner key={chave} limiteMin={limiteMin} ativo={ativo} />
}
function TimerInner({ limiteMin, ativo }: { limiteMin: number; ativo: boolean }) {
  const [seg, setSeg] = useState(0)
  useEffect(() => {
    if (!ativo) return
    const t = setInterval(() => setSeg((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [ativo])
  const passou = seg > limiteMin * 60
  const mm = String(Math.floor(seg / 60)).padStart(2, '0'); const ss = String(seg % 60).padStart(2, '0')
  return (
    <span title={`Sugerido: ${limiteMin} min`} style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 800, fontSize: 14, padding: '3px 10px', borderRadius: 999, color: passou ? '#dc2626' : 'var(--portal-text-secondary,#555)', background: passou ? 'rgba(220,38,38,.1)' : 'var(--portal-bg,#f3f4f6)' }}>
      ⏱ {mm}:{ss} <span style={{ fontWeight: 500, opacity: .7 }}>/ {limiteMin} min</span>
    </span>
  )
}
