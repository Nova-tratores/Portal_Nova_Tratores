'use client'
// Doca de atalhos da DASHBOARD (José, 20/10/2026): os botões redondos do canto ficam
// lado a lado aqui dentro e nunca um em cima do outro. Só existe na dashboard.
//  - Agenda (para todos): compromissos de hoje + novo compromisso + abrir a Agenda.
//  - Central de Trabalho: o atalho do PainelDoDia entra aqui por portal (id DOCA_ID).
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, X, Plus, ArrowUpRight, Clock } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

export const DOCA_ID = 'atalhos-dashboard'

interface ItemHoje { id: string; titulo: string; inicio: string; fim: string; diaInteiro: boolean; pessoas: string[]; local?: string | null }

const AZUL = '#1a73e8'
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

function AtalhoAgenda() {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [itens, setItens] = useState<ItemHoje[] | null>(null)

  useEffect(() => {
    let vivo = true
    const carregar = async () => {
      try {
        const r = await fetch('/api/agenda?modo=coletiva&de=' + hojeSP() + '&ate=' + hojeSP(), { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!vivo || !r.ok) return
        const eu = String(j.eu || '')
        const agora = Date.now() // só o que ainda não terminou
        const meus = ((j.itens || []) as ItemHoje[])
          .filter((i) => (i.pessoas || []).includes(eu) && (i.diaInteiro || new Date(i.fim).getTime() > agora))
          .sort((a, b) => Number(b.diaInteiro) - Number(a.diaInteiro) || a.inicio.localeCompare(b.inicio))
        setItens(meus)
      } catch { /* atalho continua, só sem a lista */ }
    }
    void carregar()
    const t = setInterval(carregar, 2 * 60_000)
    return () => { vivo = false; clearInterval(t) }
  }, [])

  const proximos = itens || []
  return (
    <div style={{ position: 'relative', pointerEvents: 'auto' }}>
      {aberto && (
        <div style={{ position: 'absolute', right: 0, bottom: 70, width: 300, maxWidth: 'calc(100vw - 44px)', background: 'var(--portal-bg-card,#fff)', border: '1px solid var(--portal-border,#f0f0f0)', borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,.18)', overflow: 'hidden' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--portal-border,#f0f0f0)', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--portal-text,#111)' }}>
            <CalendarDays size={16} color={AZUL} /> Minha agenda de hoje
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {itens === null && <div style={{ padding: '14px', fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}>Carregando…</div>}
            {itens !== null && proximos.length === 0 && <div style={{ padding: '14px', fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}>Nada mais marcado para hoje.</div>}
            {proximos.slice(0, 6).map((i) => (
              <button key={i.id} onClick={() => { setAberto(false); router.push('/agenda') }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', border: 'none', background: 'transparent', padding: '9px 14px', cursor: 'pointer', textAlign: 'left', color: 'var(--portal-text,#111)' }}>
                <span style={{ flex: 'none', minWidth: 46, fontSize: 12, fontWeight: 800, color: AZUL, paddingTop: 1 }}>{i.diaInteiro ? 'dia todo' : hora(i.inicio)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.titulo}</span>
                  {(i.local || !i.diaInteiro) && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--portal-text-muted,#888)' }}><Clock size={11} /> {i.diaInteiro ? '' : `${hora(i.inicio)}–${hora(i.fim)}`}{i.local ? ` · ${i.local}` : ''}</span>}
                </span>
              </button>
            ))}
          </div>
          {[
            { ic: <Plus size={16} />, txt: 'Novo compromisso', acao: () => router.push('/agenda?criar=1') },
            { ic: <ArrowUpRight size={16} />, txt: 'Abrir a Agenda', acao: () => router.push('/agenda') },
          ].map((o) => (
            <button key={o.txt} onClick={() => { setAberto(false); o.acao() }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', borderTop: '1px solid var(--portal-border,#f0f0f0)', background: 'transparent', padding: '11px 14px', fontSize: 13.5, cursor: 'pointer', textAlign: 'left', color: 'var(--portal-text,#111)' }}>
              {o.ic} {o.txt}
            </button>
          ))}
        </div>
      )}
      <button onClick={() => setAberto((a) => !a)} aria-label="Agenda" title="Agenda"
        style={{ width: 58, height: 58, borderRadius: '50%', border: 'none', background: AZUL, color: '#fefefe', cursor: 'pointer', boxShadow: '0 8px 24px rgba(26,115,232,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {aberto ? <X size={24} /> : <CalendarDays size={24} />}
        {!aberto && proximos.length > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 22, height: 22, padding: '0 6px', borderRadius: 11, background: '#fefefe', color: AZUL, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${AZUL}` }}>{proximos.length}</span>
        )}
      </button>
    </div>
  )
}

function hojeSP(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

/** A doca: canto de baixo à direita, botões lado a lado (o mais novo à esquerda). */
export default function AtalhosDashboard() {
  return (
    <div id={DOCA_ID} className="print-hidden"
      style={{ position: 'fixed', right: 22, bottom: 'calc(22px + env(safe-area-inset-bottom, 0px))', zIndex: 900, display: 'flex', flexDirection: 'row-reverse', alignItems: 'flex-end', gap: 12, pointerEvents: 'none' }}>
      {/* a Central de Trabalho entra aqui (primeira à direita) pelo PainelDoDia */}
      <AtalhoAgenda />
    </div>
  )
}
