'use client'
// Pipeline (kanban) das Solicitações de Compras — colunas por etapa do trilho,
// com contador de dias parado para identificar gargalos (ADR-005/006: a visão
// temporal da SC é o pipeline por etapa, não Gantt).
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Clock, RefreshCw, Settings, ShoppingCart, User as UserIcon, AlertTriangle } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { authHeaders } from '@/lib/auth/client'
import { diasParado, type Ticket, type UsuarioMin } from '@/lib/tickets/constantes'
import { SC_ETAPA_INFO, SC_ETAPAS_ATIVAS, type PayloadSC, type ScEtapa } from '@/lib/tickets/compras'
import FormSC from '@/components/tickets/FormSC'

const COLUNAS: ScEtapa[] = [...SC_ETAPAS_ATIVAS, 'vendedor'] // ativas + "devolvidas ao vendedor"

function moeda(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ComprasPipelinePage() {
  const router = useRouter()
  const { userProfile } = useAuth()
  const { isAdmin } = usePermissoes(userProfile?.id)

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [usuarios, setUsuarios] = useState<Record<string, UsuarioMin>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [modalNovo, setModalNovo] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const res = await fetch('/api/tickets?visao=compras', { headers: await authHeaders() })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao carregar'); setTickets([]); return }
      setTickets(json.tickets || [])
      setUsuarios(json.usuarios || {})
    } catch {
      setErro('Falha de conexão')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  const porEtapa = useMemo(() => {
    const mapa: Record<string, Ticket[]> = {}
    for (const c of COLUNAS) mapa[c] = []
    for (const t of tickets) {
      const e = t.sc_etapa || ''
      if (mapa[e]) mapa[e].push(t)
    }
    return mapa
  }, [tickets])

  const concluidas = useMemo(() => tickets.filter((t) => t.sc_etapa === 'concluida' || t.sc_etapa === 'cancelada'), [tickets])

  const nome = (id: string) => usuarios[id]?.nome || '—'

  return (
    <div style={{ padding: 20, maxWidth: 1280, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 800, color: 'var(--portal-text,#111)', margin: 0 }}>
          <ShoppingCart size={19} color="#dc2626" /> Solicitações de Compras
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button onClick={() => router.push('/tickets/compras/config')} title="Configurar responsáveis das etapas"
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text-secondary,#555)', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
              <Settings size={15} /> Configurar
            </button>
          )}
          <button onClick={() => carregar()} title="Atualizar"
            style={{ display: 'flex', alignItems: 'center', padding: 9, borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}>
            <RefreshCw size={15} />
          </button>
          <button onClick={() => setModalNovo(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={16} /> Nova SC
          </button>
        </div>
      </div>

      {erro && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          {erro}
        </div>
      )}

      {carregando ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text-muted,#888)', fontSize: 14 }}>Carregando pipeline...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLUNAS.length}, minmax(220px, 1fr))`, gap: 12, overflowX: 'auto' }}>
            {COLUNAS.map((etapa) => {
              const info = SC_ETAPA_INFO[etapa]
              const lista = porEtapa[etapa] || []
              return (
                <div key={etapa} style={{ background: 'var(--portal-bg,#f9fafb)', borderRadius: 12, padding: 10, minWidth: 220 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 4px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: info.cor }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: info.cor }} /> {info.label}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)' }}>{lista.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {lista.length === 0 && (
                      <div style={{ padding: '18px 8px', textAlign: 'center', fontSize: 12, color: 'var(--portal-text-muted,#aaa)' }}>—</div>
                    )}
                    {lista.map((t) => {
                      const p = (t.payload || {}) as PayloadSC
                      const dias = diasParado(t.ultima_atividade_em)
                      return (
                        <button key={t.id} onClick={() => router.push(`/tickets/${t.id}`)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left', padding: 11, borderRadius: 10, cursor: 'pointer',
                            border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)',
                          }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 5 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--portal-text-muted,#999)' }}>#{t.numero}</span>
                            <span title="Dias sem movimento" style={{
                              display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700,
                              color: dias >= 5 ? '#dc2626' : dias >= 2 ? '#d97706' : 'var(--portal-text-muted,#999)',
                            }}>
                              <Clock size={11} /> {dias === 0 ? 'hoje' : `${dias}d`}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text,#111)', marginBottom: 4, lineHeight: 1.3 }}>
                            {p.produto || t.titulo}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, color: 'var(--portal-text-muted,#888)' }}>
                            {p.cliente_destino && <span>{p.cliente_destino}</span>}
                            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <span>{moeda(p.valor_total)}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><UserIcon size={11} /> {nome(t.responsavel_id)}</span>
                            </span>
                            {p.bloqueio && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#d97706', fontWeight: 700 }}>
                                <AlertTriangle size={11} /> sinalizada
                              </span>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {concluidas.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 8 }}>
                Encerradas recentemente
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {concluidas.slice(0, 20).map((t) => {
                  const p = (t.payload || {}) as PayloadSC
                  const info = SC_ETAPA_INFO[(t.sc_etapa || 'concluida') as ScEtapa]
                  return (
                    <button key={t.id} onClick={() => router.push(`/tickets/${t.id}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', fontSize: 12.5 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: info.cor }} />
                      <span style={{ fontWeight: 700, color: 'var(--portal-text,#111)' }}>#{t.numero}</span>
                      <span style={{ color: 'var(--portal-text-muted,#888)' }}>{p.produto || t.titulo}</span>
                      <span style={{ color: info.cor, fontWeight: 700 }}>{info.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {modalNovo && (
        <FormSC onFechar={() => setModalNovo(false)} onCriado={(id) => { setModalNovo(false); router.push(`/tickets/${id}`) }} />
      )}
    </div>
  )
}
