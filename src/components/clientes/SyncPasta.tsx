'use client'
// Timer da sincronização da Pasta Clientes com o Omie (rodada de 5 em 5 min que
// baixa as notas e cria os cards do financeiro). GET /api/clientes/sync-status.
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'

export interface StatusSync {
  ativo: boolean; quando: string; intervaloMin: number
  rodandoDesde: string | null
  ultima: { em: string; status: string } | null
  proxima: string | null
}

export function useSyncPasta(): { st: StatusSync | null; agora: number } {
  const [st, setSt] = useState<StatusSync | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    let vivo = true
    const ler = async () => {
      try {
        const r = await fetch('/api/clientes/sync-status', { headers: await authHeaders() })
        if (r.ok && vivo) setSt(await r.json())
      } catch { /* fica o último */ }
    }
    void ler()
    const t1 = setInterval(ler, 30_000)
    const t2 = setInterval(() => setAgora(Date.now()), 1000)
    return () => { vivo = false; clearInterval(t1); clearInterval(t2) }
  }, [])
  return { st, agora }
}

const mmss = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const ha = (ms: number) => { const m = Math.round(ms / 60_000); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : `há ${Math.floor(m / 60)} h` }

/** Texto curto da próxima rodada: "em 3:12 (14:35)", "rodando agora", "pausada". */
export function textoProxima(st: StatusSync | null, agora: number): string {
  if (!st) return 'na próxima sincronização'
  if (st.rodandoDesde) return 'na sincronização que está rodando agora'
  if (!st.ativo || !st.proxima) return 'quando a sincronização voltar (está pausada)'
  const falta = new Date(st.proxima).getTime() - agora
  return falta <= 0 ? 'na sincronização que começa agora' : `na próxima sincronização — às ${hora(st.proxima)} (em ${mmss(falta)})`
}

/** Selo do topo da Pasta: última e próxima sincronização com o Omie. */
export function RelogioSync({ st, agora }: { st: StatusSync | null; agora: number }) {
  if (!st) return null
  const rodando = !!st.rodandoDesde
  const falta = st.proxima ? new Date(st.proxima).getTime() - agora : null
  const erro = st.ultima && st.ultima.status !== 'ok' && st.ultima.status !== 'pulado'
  const pct = falta !== null && st.intervaloMin ? Math.min(100, Math.max(0, 100 - (falta / (st.intervaloMin * 60_000)) * 100)) : 0
  return (
    <div title={`Sincronização com o Omie (${st.quando}): baixa OS, pedidos e notas e envia ao financeiro as OS com as notas completas.${st.ultima ? `\nÚltima: ${hora(st.ultima.em)} (${st.ultima.status})` : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 9, height: 42, padding: '0 13px', borderRadius: 12, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', boxShadow: '0 1px 2px rgba(16,24,40,0.05)', fontSize: 12, color: 'var(--portal-text-secondary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ position: 'relative', width: 22, height: 22, borderRadius: '50%', background: `conic-gradient(${rodando ? '#16A34A' : '#0891B2'} ${rodando ? 100 : pct}%, #E2E8F0 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--portal-bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: rodando ? '#16A34A' : '#0891B2' }}>
          <i className={`fas ${rodando ? 'fa-rotate fa-spin' : 'fa-clock'}`} />
        </span>
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <b style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>
          {rodando ? 'Sincronizando…' : !st.ativo ? 'Sync pausado' : falta !== null ? `Próximo sync em ${mmss(falta)}` : 'Sync'}
        </b>
        <span style={{ fontSize: 11, color: erro ? '#B91C1C' : 'var(--portal-text-muted)' }}>
          {st.ultima ? `último ${ha(agora - new Date(st.ultima.em).getTime())}${erro ? ' · com erro' : ''}` : 'sem registro'}
        </span>
      </span>
    </div>
  )
}
