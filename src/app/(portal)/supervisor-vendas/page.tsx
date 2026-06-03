'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import {
  BarChart3, Users, MapPin, AlertTriangle, Eye, ShoppingCart,
  RefreshCw, TrendingUp, Calendar, Clock, ChevronRight
} from 'lucide-react'
import dynamic from 'next/dynamic'

const MapaVisitas = dynamic(() => import('@/components/supervisor/MapaVisitas'), { ssr: false })
import ModalVisita from '@/components/supervisor/ModalVisita'

type Tab = 'geral' | 'vendedores' | 'visitas' | 'mapa' | 'pos-vendas' | 'alertas'

export default function SupervisorVendasPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const [tab, setTab] = useState<Tab>('geral')
  const [kpis, setKpis] = useState<any>(null)
  const [vendedores, setVendedores] = useState<any[]>([])
  const [visitas, setVisitas] = useState<any[]>([])
  const [alertas, setAlertas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroPosVendas, setFiltroPosVendas] = useState<'pendentes' | 'resolvidos' | 'todos'>('pendentes')
  const [visitasMapa, setVisitasMapa] = useState<any[]>([])
  const [visitaSelecionada, setVisitaSelecionada] = useState<any>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'geral') {
        const res = await fetch('/api/supervisor-vendas?acao=kpis')
        if (res.ok) setKpis(await res.json())
      } else if (tab === 'vendedores') {
        const res = await fetch('/api/supervisor-vendas?acao=vendedores')
        if (res.ok) setVendedores(await res.json())
      } else if (tab === 'visitas') {
        let url = '/api/supervisor-vendas?acao=visitas'
        if (filtroVendedor) url += `&vendedor_id=${filtroVendedor}`
        if (filtroTipo) url += `&tipo=${filtroTipo}`
        const res = await fetch(url)
        if (res.ok) setVisitas(await res.json())
      } else if (tab === 'pos-vendas') {
        const res = await fetch('/api/supervisor-vendas?acao=visitas&pos_vendas=true')
        if (res.ok) setVisitas(await res.json())
      } else if (tab === 'mapa') {
        let url = '/api/supervisor-vendas?acao=visitas'
        if (filtroVendedor) url += `&vendedor_id=${filtroVendedor}`
        if (filtroTipo) url += `&tipo=${filtroTipo}`
        const res = await fetch(url)
        if (res.ok) setVisitasMapa((await res.json()).filter((v: any) => v.latitude && v.longitude))
      } else if (tab === 'alertas') {
        const res = await fetch('/api/supervisor-vendas?acao=alertas')
        if (res.ok) setAlertas(await res.json())
      }
    } catch { /* */ }
    setLoading(false)
  }, [tab, filtroVendedor, filtroTipo])

  useEffect(() => { carregar() }, [carregar])

  // Carregar vendedores pra filtro
  const [vendedoresLista, setVendedoresLista] = useState<any[]>([])
  useEffect(() => {
    fetch('/api/supervisor-vendas?acao=vendedores').then(r => r.json()).then(d => setVendedoresLista(d || [])).catch(() => {})
  }, [])

  const resolverPosVendas = async (id: string, resolvido: boolean) => {
    await fetch(`/api/supervisor-vendas?acao=pos_vendas_resolver&id=${id}&resolvido=${resolvido}`)
    carregar()
  }

  if (!loadingPerm && userProfile && !temAcesso('supervisor-vendas')) return <SemPermissao />

  const fmtBRL = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0 })}`
  const fmtData = (iso: string) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'
  const diasDesde = (iso: string | null) => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 999

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'geral', label: 'Visão Geral', icon: <BarChart3 size={16} /> },
    { id: 'vendedores', label: 'Vendedores', icon: <Users size={16} /> },
    { id: 'visitas', label: 'Visitas', icon: <Eye size={16} /> },
    { id: 'mapa', label: 'Mapa', icon: <MapPin size={16} /> },
    { id: 'pos-vendas', label: 'Pós Vendas', icon: <ShoppingCart size={16} /> },
    { id: 'alertas', label: 'Alertas', icon: <AlertTriangle size={16} /> },
  ]

  const tipoCores: Record<string, { bg: string; text: string }> = {
    presencial: { bg: '#DBEAFE', text: '#1E40AF' },
    mensagem: { bg: '#D1FAE5', text: '#065F46' },
    telefonema: { bg: '#FEF3C7', text: '#92400E' },
    email: { bg: '#F5F3FF', text: '#6D28D9' },
  }

  return (
    <div style={{ padding: '24px 32px', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #dc2626, #991b1b)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <TrendingUp size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>Supervisor Vendas</h1>
            <p style={{ fontSize: 13, color: 'var(--portal-text-muted)', margin: 0 }}>Gestão de vendedores, visitas e negócios</p>
          </div>
        </div>
        <button onClick={carregar} style={{
          padding: '8px 16px', borderRadius: 10, border: '1px solid var(--portal-border)',
          background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)',
          fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
        }}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--portal-bg-secondary)', padding: 4, borderRadius: 12, width: 'fit-content', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8,
            background: tab === t.id ? 'var(--portal-bg-card)' : 'transparent',
            border: tab === t.id ? '1px solid var(--portal-border)' : '1px solid transparent',
            boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
            color: tab === t.id ? '#dc2626' : 'var(--portal-text-secondary)',
            fontSize: 13, fontWeight: tab === t.id ? 600 : 500, cursor: 'pointer', transition: 'all .2s'
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>Carregando...</div>
      ) : (
        <>
          {/* VISÃO GERAL */}
          {tab === 'geral' && kpis && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {[
                { label: 'Visitas Hoje', value: kpis.visitasHoje, bg: '#1D4ED8' },
                { label: 'Visitas Semana', value: kpis.visitasSemana, bg: '#2563EB' },
                { label: 'Visitas Mês', value: kpis.visitasMes, bg: '#3B82F6' },
                { label: 'Pipeline', value: fmtBRL(kpis.pipeline), bg: '#059669' },
                { label: 'Fechados no Mês', value: kpis.negociosFechadosMes, bg: '#047857' },
                { label: 'Retroativas', value: kpis.visitasRetroativas, bg: kpis.visitasRetroativas > 0 ? '#D97706' : '#94A3B8' },
                { label: 'Pós Vendas Pendentes', value: kpis.posVendasPendentes, bg: kpis.posVendasPendentes > 0 ? '#EA580C' : '#94A3B8' },
                { label: 'Total Negócios', value: kpis.totalNegocios, bg: '#475569' },
              ].map(c => (
                <div key={c.label} style={{ background: c.bg, color: '#fff', borderRadius: 14, padding: '20px 22px' }}>
                  <div style={{ fontSize: 28, fontWeight: 800 }}>{c.value}</div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{c.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* VENDEDORES */}
          {tab === 'vendedores' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
              {vendedores.map((v: any) => {
                const dias = diasDesde(v.ultimaVisita)
                return (
                  <div key={v.id} onClick={() => { setFiltroVendedor(v.id); setTab('visitas') }}
                    style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 14, padding: '18px 20px', cursor: 'pointer', transition: 'all .2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#fecaca' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--portal-text)' }}>{v.nome}</span>
                      {dias > 3 && <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', padding: '2px 8px', borderRadius: 6 }}>{dias}d inativo</span>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                      <div><div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>SEMANA</div><div style={{ fontSize: 18, fontWeight: 800, color: '#2563EB' }}>{v.visitasSemana}</div></div>
                      <div><div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>TOTAL</div><div style={{ fontSize: 18, fontWeight: 800, color: 'var(--portal-text)' }}>{v.totalVisitas}</div></div>
                      <div><div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>PIPELINE</div><div style={{ fontSize: 14, fontWeight: 700, color: '#059669' }}>{v.pipeline > 1000 ? `${(v.pipeline/1000).toFixed(0)}k` : fmtBRL(v.pipeline)}</div></div>
                    </div>
                    {v.retroativas > 0 && <div style={{ marginTop: 8, fontSize: 11, color: '#D97706', fontWeight: 600 }}>{v.retroativas} retroativas</div>}
                  </div>
                )
              })}
            </div>
          )}

          {/* VISITAS */}
          {tab === 'visitas' && (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', fontSize: 13, background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }}>
                  <option value="">Todos vendedores</option>
                  {vendedoresLista.map((v: any) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
                <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', fontSize: 13, background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }}>
                  <option value="">Todos tipos</option>
                  <option value="presencial">Presencial</option>
                  <option value="mensagem">Mensagem</option>
                  <option value="telefonema">Telefonema</option>
                  <option value="email">E-mail</option>
                </select>
                <span style={{ fontSize: 13, color: '#94A3B8', alignSelf: 'center' }}>{visitas.length} visitas</span>
              </div>
              <div style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 14, overflow: 'hidden' }}>
                {visitas.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Nenhuma visita encontrada</div>
                ) : visitas.slice(0, 50).map((v: any, i: number) => {
                  const tc = tipoCores[v.tipo] || { bg: '#F1F5F9', text: '#475569' }
                  return (
                    <div key={v.id || i} onClick={() => setVisitaSelecionada(v)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '1px solid #f5f5f5', flexWrap: 'wrap', cursor: 'pointer', transition: 'background .15s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#FAFAFA' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '' }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#2563EB', minWidth: 100 }}>{v.vendedor_nome}</span>
                      <span style={{ fontSize: 12, color: '#64748B', minWidth: 120 }}>{fmtData(v.data_visita)}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 6, background: tc.bg, color: tc.text }}>{v.tipo}</span>
                      <span style={{ fontSize: 13, color: 'var(--portal-text)', flex: 1 }}>{v.cliente_nome || '-'} {v.propriedade_nome ? `· ${v.propriedade_nome}` : ''}</span>
                      {v.retroativa && <span style={{ fontSize: 10, fontWeight: 700, color: '#D97706', background: '#FEF3C7', padding: '2px 6px', borderRadius: 4 }}>Retroativa</span>}
                      {v.acionar_pos_vendas && <span style={{ fontSize: 10, fontWeight: 700, color: '#EA580C', background: '#FFF7ED', padding: '2px 6px', borderRadius: 4 }}>Pós Venda</span>}
                      {v.tipo === 'presencial' && !v.latitude && <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', background: '#FEF2F2', padding: '2px 6px', borderRadius: 4 }}>Sem GPS</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* MAPA */}
          {tab === 'mapa' && (
            <div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', fontSize: 13, background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }}>
                  <option value="">Todos vendedores</option>
                  {vendedoresLista.map((v: any) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                </select>
                <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', fontSize: 13, background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }}>
                  <option value="">Todos tipos</option>
                  <option value="presencial">Presencial</option>
                  <option value="mensagem">Mensagem</option>
                  <option value="telefonema">Telefonema</option>
                  <option value="email">E-mail</option>
                </select>
                <span style={{ fontSize: 13, color: '#94A3B8' }}>{visitasMapa.length} visitas com GPS</span>
              </div>
              <div id="supervisor-mapa" style={{ width: '100%', height: 'calc(100vh - 280px)', minHeight: 400, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--portal-border)' }}>
                <MapaVisitas visitas={visitasMapa} tipoCores={tipoCores} fmtData={fmtData} onVisitaClick={(v: any) => setVisitaSelecionada(v)} />
              </div>
            </div>
          )}

          {/* PÓS VENDAS */}
          {tab === 'pos-vendas' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['pendentes', 'resolvidos', 'todos'] as const).map(f => (
                  <button key={f} onClick={() => setFiltroPosVendas(f)} style={{
                    padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: filtroPosVendas === f ? '#dc2626' : 'var(--portal-bg-secondary)',
                    color: filtroPosVendas === f ? '#fff' : 'var(--portal-text-secondary)',
                  }}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {visitas
                  .filter((v: any) => filtroPosVendas === 'todos' ? true : filtroPosVendas === 'pendentes' ? !v.pos_vendas_resolvido : v.pos_vendas_resolvido)
                  .map((v: any) => (
                    <div key={v.id} style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, padding: '14px 18px', opacity: v.pos_vendas_resolvido ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)' }}>{v.cliente_nome}</span>
                          <span style={{ fontSize: 12, color: '#64748B', marginLeft: 8 }}>{v.vendedor_nome} · {fmtData(v.data_visita)}</span>
                        </div>
                        <button onClick={() => resolverPosVendas(v.id, !v.pos_vendas_resolvido)} style={{
                          padding: '4px 12px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                          background: v.pos_vendas_resolvido ? '#FEF3C7' : '#D1FAE5',
                          color: v.pos_vendas_resolvido ? '#92400E' : '#065F46',
                        }}>
                          {v.pos_vendas_resolvido ? 'Reabrir' : 'Resolver'}
                        </button>
                      </div>
                      {v.resumo && <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>{v.resumo}</p>}
                    </div>
                  ))}
                {visitas.filter((v: any) => filtroPosVendas === 'todos' ? true : filtroPosVendas === 'pendentes' ? !v.pos_vendas_resolvido : v.pos_vendas_resolvido).length === 0 && (
                  <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Nenhum item</div>
                )}
              </div>
            </div>
          )}

          {/* ALERTAS */}
          {tab === 'alertas' && (
            <div>
              {alertas.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 14 }}>Nenhum alerta no momento</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {['alta', 'media'].map(sev => {
                    const items = alertas.filter((a: any) => a.severidade === sev)
                    if (items.length === 0) return null
                    const corBorder = sev === 'alta' ? '#DC2626' : '#D97706'
                    const corBg = sev === 'alta' ? '#FEF2F2' : '#FFFBEB'
                    return (
                      <div key={sev}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: corBorder, marginBottom: 6, textTransform: 'uppercase' }}>
                          {sev === 'alta' ? 'Alta Severidade' : 'Média Severidade'} ({items.length})
                        </div>
                        {items.map((a: any, i: number) => (
                          <div key={i} style={{ background: corBg, borderLeft: `3px solid ${corBorder}`, borderRadius: 8, padding: '10px 16px', marginBottom: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)' }}>{a.vendedor}</span>
                              <span style={{ fontSize: 11, color: '#64748B' }}>{a.data ? fmtData(a.data) : ''}</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: corBorder, marginLeft: 'auto' }}>{a.tipo === 'sem_gps' ? 'Sem GPS' : a.tipo === 'retroativa' ? 'Retroativa' : 'Inativo'}</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{a.descricao}</div>
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {visitaSelecionada && <ModalVisita visita={visitaSelecionada} onClose={() => setVisitaSelecionada(null)} />}
    </div>
  )
}
