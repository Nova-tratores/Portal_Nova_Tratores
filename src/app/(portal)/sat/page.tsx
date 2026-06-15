'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useAuditLog } from '@/hooks/useAuditLog'
import { supabase } from '@/lib/supabase'
import {
  Plus, X, Search, Clock, User, Calendar, Check, Play, Ban, CheckCircle2,
  Headset, MapPin, AlertTriangle, Building2,
} from 'lucide-react'

interface Sat {
  id: string
  cliente_nome: string
  cliente_endereco: string | null
  cliente_cnpj: string | null
  tipo: string
  descricao: string | null
  status: string
  data_limite: string | null
  criado_por: string | null
  criado_por_nome: string | null
  concluido_por_nome: string | null
  concluido_at: string | null
  cancelado_por_nome: string | null
  cancelado_at: string | null
  created_at: string
}
interface ClienteResult { id: number; cnpj: string; nome: string; endereco: string; cidade: string }
type TipoSat = 'manutencao' | 'revisao' | 'entrega' | 'orcamento'

const TIPO_SAT: Record<TipoSat, { label: string; cor: string; bg: string }> = {
  manutencao: { label: 'Manutenção', cor: '#0EA5E9', bg: '#e0f2fe' },
  revisao:    { label: 'Revisão', cor: '#f59e0b', bg: '#fef3c7' },
  entrega:    { label: 'Entrega técnica', cor: '#10B981', bg: '#d1fae5' },
  orcamento:  { label: 'Orçamento', cor: '#8B5CF6', bg: '#ede9fe' },
}
const COLUNAS = [
  { key: 'aberto', label: 'Aberto', cor: '#dc2626' },
  { key: 'andamento', label: 'Em andamento', cor: '#f59e0b' },
  { key: 'concluido', label: 'Concluído', cor: '#10B981' },
]

function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtData(d: string) {
  const [y, m, dia] = d.split('-')
  return `${dia}/${m}/${y}`
}
const hojeStr = () => new Date().toISOString().slice(0, 10)

export default function SatPage() {
  const { userProfile } = useAuth()
  const { permissoes, isAdmin } = usePermissoes(userProfile?.id)
  const { log: auditLog } = useAuditLog()
  const isPos = permissoes?.categoria === 'Pós Vendas' || isAdmin

  const [sats, setSats] = useState<Sat[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [detalhe, setDetalhe] = useState<Sat | null>(null)
  const [showCancelados, setShowCancelados] = useState(false)

  // Form
  const [clienteSel, setClienteSel] = useState<ClienteResult | null>(null)
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<ClienteResult[]>([])
  const [buscando, setBuscando] = useState(false)
  const [showDrop, setShowDrop] = useState(false)
  const [tipo, setTipo] = useState<TipoSat>('manutencao')
  const [dataLimite, setDataLimite] = useState('')
  const [descricao, setDescricao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const buscaTimeout = useRef<ReturnType<typeof setTimeout>>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('portal_sats').select('*').order('created_at', { ascending: false })
    setSats((data as Sat[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    const ch = supabase.channel('sats_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portal_sats' }, () => carregar())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [carregar])

  useEffect(() => {
    const handle = (e: MouseEvent) => { if (dropRef.current && !dropRef.current.contains(e.target as Node)) setShowDrop(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const buscarClientes = (q: string) => {
    if (buscaTimeout.current) clearTimeout(buscaTimeout.current)
    if (q.trim().length < 2) { setResultados([]); return }
    buscaTimeout.current = setTimeout(async () => {
      setBuscando(true)
      const res = await fetch(`/api/sat/clientes?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResultados(Array.isArray(data) ? data : [])
      setBuscando(false)
      setShowDrop(true)
    }, 300)
  }

  const resetForm = () => {
    setClienteSel(null); setBusca(''); setResultados([]); setTipo('manutencao'); setDataLimite(''); setDescricao('')
  }

  const criarSat = async () => {
    if (!clienteSel || !userProfile) return
    setEnviando(true)
    const { error } = await supabase.from('portal_sats').insert({
      cliente_nome: clienteSel.nome,
      cliente_endereco: clienteSel.endereco || null,
      cliente_cnpj: clienteSel.cnpj || null,
      tipo,
      descricao: descricao.trim() || null,
      data_limite: dataLimite || null,
      criado_por: userProfile.id,
      criado_por_nome: userProfile.nome || 'Usuário',
      status: 'aberto',
    })
    setEnviando(false)
    if (error) { alert(`Erro ao criar SAT: ${error.message}`); return }
    auditLog({ sistema: 'sat', acao: 'criar', entidade: 'sat', entidade_label: `SAT ${TIPO_SAT[tipo].label} — ${clienteSel.nome}` })
    resetForm(); setShowModal(false); carregar()
  }

  const moverStatus = async (sat: Sat, novo: string) => {
    await supabase.from('portal_sats').update({ status: novo }).eq('id', sat.id)
    setDetalhe(d => d && d.id === sat.id ? { ...d, status: novo } : d)
    carregar()
  }

  const concluir = async (sat: Sat) => {
    if (!userProfile) return
    await supabase.rpc('concluir_sat', { p_id: sat.id, p_user_id: userProfile.id, p_user_nome: userProfile.nome || 'Usuário' })
    auditLog({ sistema: 'sat', acao: 'concluir', entidade: 'sat', entidade_id: sat.id, entidade_label: `SAT — ${sat.cliente_nome}` })
    setDetalhe(null); carregar()
  }

  const cancelar = async (sat: Sat) => {
    if (!userProfile) return
    if (!confirm('Cancelar este SAT?')) return
    await supabase.from('portal_sats').update({
      status: 'cancelado', cancelado_por_nome: userProfile.nome || 'Usuário', cancelado_at: new Date().toISOString(),
    }).eq('id', sat.id)
    auditLog({ sistema: 'sat', acao: 'cancelar', entidade: 'sat', entidade_id: sat.id, entidade_label: `SAT — ${sat.cliente_nome}` })
    setDetalhe(null); carregar()
  }

  const cancelados = sats.filter(s => s.status === 'cancelado')
  const isAtrasado = (s: Sat) => s.data_limite && s.data_limite < hojeStr() && (s.status === 'aberto' || s.status === 'andamento')

  const INP: React.CSSProperties = { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E4E4E7', fontSize: 14, boxSizing: 'border-box', background: '#FAFAFA', outline: 'none', color: '#18181B' }

  if (loading && sats.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80, color: '#9CA3AF', gap: 10 }}>
      <Clock size={16} style={{ animation: 'spin 1s linear infinite' }} /> <span>Carregando SATs...</span>
    </div>
  )

  // Card do Kanban
  const renderCard = (sat: Sat) => {
    const t = TIPO_SAT[sat.tipo as TipoSat] || TIPO_SAT.manutencao
    const atrasado = isAtrasado(sat)
    return (
      <div key={sat.id} onClick={() => setDetalhe(sat)} style={{
        background: 'var(--portal-bg-card, #fff)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
        border: `1px solid ${atrasado ? '#FCA5A5' : 'var(--portal-border, #ececec)'}`,
        borderLeft: `4px solid ${t.cor}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: t.cor, background: t.bg, padding: '3px 8px', borderRadius: 5 }}>{t.label}</span>
          {atrasado && <span style={{ fontSize: 10, fontWeight: 800, color: '#dc2626', background: '#fee2e2', padding: '3px 8px', borderRadius: 5, display: 'flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={10} /> ATRASADO</span>}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)', marginBottom: 4 }}>{sat.cliente_nome}</div>
        {sat.cliente_endereco && (
          <div style={{ fontSize: 11, color: 'var(--portal-text-muted, #9ca3af)', display: 'flex', alignItems: 'flex-start', gap: 4, marginBottom: 8, lineHeight: 1.4 }}>
            <MapPin size={11} style={{ flexShrink: 0, marginTop: 1 }} /> {sat.cliente_endereco}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: 'var(--portal-text-muted, #9ca3af)' }}>
          {sat.data_limite && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: atrasado ? '#dc2626' : 'inherit', fontWeight: atrasado ? 700 : 500 }}>
              <Calendar size={11} /> {fmtData(sat.data_limite)}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><User size={11} /> {sat.criado_por_nome?.split(' ')[0]}</span>
        </div>
        {isPos && sat.status !== 'concluido' && sat.status !== 'cancelado' && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            {sat.status === 'aberto' && (
              <button onClick={e => { e.stopPropagation(); moverStatus(sat, 'andamento') }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '7px', borderRadius: 8, border: 'none', background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <Play size={12} /> Iniciar
              </button>
            )}
            <button onClick={e => { e.stopPropagation(); concluir(sat) }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '7px', borderRadius: 8, border: 'none', background: '#10B981', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Check size={12} /> Concluir
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #0EA5E9, #0369A1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Headset size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--portal-text, #1a1a1a)', margin: 0 }}>SAT Digital</h1>
            <p style={{ fontSize: 13, color: 'var(--portal-text-secondary, #737373)', margin: 0 }}>Solicitações de atendimento técnico</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setShowCancelados(v => !v)} style={{
            padding: '9px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            border: '1px solid var(--portal-border, #e5e5e5)', background: showCancelados ? '#fef2f2' : 'var(--portal-bg-card, #fff)',
            color: showCancelados ? '#dc2626' : 'var(--portal-text-secondary, #666)',
          }}>
            Cancelados ({cancelados.length})
          </button>
          <button onClick={() => setShowModal(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 10,
            background: 'linear-gradient(135deg, #0EA5E9, #0369A1)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
            <Plus size={16} /> Novo SAT
          </button>
        </div>
      </div>

      {/* Kanban */}
      <div style={{ display: 'grid', gridTemplateColumns: showCancelados ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: 16, alignItems: 'start' }}>
        {COLUNAS.map(col => {
          const itens = sats.filter(s => s.status === col.key)
          return (
            <div key={col.key} style={{ background: 'var(--portal-bg-secondary, #f7f7f8)', borderRadius: 14, padding: 12, minHeight: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '0 4px' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: col.cor }} />
                <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text, #1a1a1a)' }}>{col.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: col.cor, background: 'var(--portal-bg-card, #fff)', padding: '2px 9px', borderRadius: 10, marginLeft: 'auto' }}>{itens.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {itens.length === 0
                  ? <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--portal-text-muted, #b8b8b8)', fontSize: 12 }}>Nenhum SAT</div>
                  : itens.map(renderCard)}
              </div>
            </div>
          )
        })}

        {showCancelados && (
          <div style={{ background: 'var(--portal-bg-secondary, #f7f7f8)', borderRadius: 14, padding: 12, minHeight: 200 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '0 4px' }}>
              <Ban size={13} color="#9ca3af" />
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text-secondary, #6b7280)' }}>Cancelados</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', background: 'var(--portal-bg-card, #fff)', padding: '2px 9px', borderRadius: 10, marginLeft: 'auto' }}>{cancelados.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cancelados.length === 0
                ? <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--portal-text-muted, #b8b8b8)', fontSize: 12 }}>Nenhum cancelado</div>
                : cancelados.map(s => (
                  <div key={s.id} onClick={() => setDetalhe(s)} style={{ background: 'var(--portal-bg-card, #fff)', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', border: '1px solid var(--portal-border, #ececec)', opacity: 0.7 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)', textDecoration: 'line-through' }}>{s.cliente_nome}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Cancelado por {s.cancelado_por_nome}</div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== Modal Detalhe ===== */}
      {detalhe && (() => {
        const t = TIPO_SAT[detalhe.tipo as TipoSat] || TIPO_SAT.manutencao
        return (
          <div onClick={e => { if (e.target === e.currentTarget) setDetalhe(null) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: 'var(--portal-bg-card, #fff)', borderRadius: 18, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', padding: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: t.cor, background: t.bg, padding: '4px 10px', borderRadius: 6 }}>{t.label}</span>
                <button onClick={() => setDetalhe(null)} style={{ background: 'var(--portal-bg-secondary, #f5f5f5)', border: 'none', borderRadius: 9, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Building2 size={18} color={t.cor} />
                <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--portal-text, #1a1a1a)' }}>{detalhe.cliente_nome}</span>
              </div>
              {detalhe.cliente_endereco && (
                <div style={{ fontSize: 13, color: 'var(--portal-text-secondary, #666)', display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 16, lineHeight: 1.5 }}>
                  <MapPin size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {detalhe.cliente_endereco}
                </div>
              )}

              {detalhe.descricao && (
                <div style={{ background: 'var(--portal-bg-secondary, #fafafa)', borderRadius: 10, padding: '12px 14px', fontSize: 14, color: 'var(--portal-text-secondary, #444)', lineHeight: 1.6, marginBottom: 16, whiteSpace: 'pre-wrap' }}>{detalhe.descricao}</div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <User size={15} color="#9ca3af" />
                  <div>
                    <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, letterSpacing: 0.5 }}>CRIADO POR</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text, #1a1a1a)' }}>{detalhe.criado_por_nome}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Clock size={15} color="#9ca3af" />
                  <div>
                    <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, letterSpacing: 0.5 }}>CRIADO EM</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text, #1a1a1a)' }}>{fmtDataHora(detalhe.created_at)}</div>
                  </div>
                </div>
                {detalhe.data_limite && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Calendar size={15} color={isAtrasado(detalhe) ? '#dc2626' : '#9ca3af'} />
                    <div>
                      <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 700, letterSpacing: 0.5 }}>DATA LIMITE</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isAtrasado(detalhe) ? '#dc2626' : 'var(--portal-text, #1a1a1a)' }}>{fmtData(detalhe.data_limite)}</div>
                    </div>
                  </div>
                )}
              </div>

              {detalhe.status === 'concluido' && (
                <div style={{ background: '#d1fae5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#065f46', fontSize: 13, fontWeight: 600 }}>
                  <CheckCircle2 size={16} /> Concluído por {detalhe.concluido_por_nome}{detalhe.concluido_at ? ` em ${fmtDataHora(detalhe.concluido_at)}` : ''}
                </div>
              )}
              {detalhe.status === 'cancelado' && (
                <div style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: '#991b1b', fontSize: 13, fontWeight: 600 }}>
                  <Ban size={16} /> Cancelado por {detalhe.cancelado_por_nome}{detalhe.cancelado_at ? ` em ${fmtDataHora(detalhe.cancelado_at)}` : ''}
                </div>
              )}

              {/* Ações (Pós-Vendas) */}
              {isPos && detalhe.status !== 'concluido' && detalhe.status !== 'cancelado' && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  {detalhe.status === 'aberto' && (
                    <button onClick={() => moverStatus(detalhe, 'andamento')} style={{ flex: 1, minWidth: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 11, border: 'none', background: '#fef3c7', color: '#92400e', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                      <Play size={16} /> Iniciar
                    </button>
                  )}
                  <button onClick={() => concluir(detalhe)} style={{ flex: 1, minWidth: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, borderRadius: 11, border: 'none', background: '#10B981', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    <Check size={16} /> Concluir
                  </button>
                  <button onClick={() => cancelar(detalhe)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '12px 18px', borderRadius: 11, border: '1px solid #fecaca', background: 'var(--portal-bg-card, #fff)', color: '#dc2626', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    <Ban size={16} /> Cancelar
                  </button>
                </div>
              )}
              {!isPos && detalhe.status !== 'concluido' && detalhe.status !== 'cancelado' && (
                <div style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center' }}>Apenas o Pós-Vendas pode concluir ou cancelar.</div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ===== Modal Novo SAT ===== */}
      {showModal && (
        <div onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: 'var(--portal-bg-card, #fff)', borderRadius: 18, width: 560, maxWidth: '95vw', maxHeight: '92vh', overflow: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text, #1a1a1a)', margin: 0 }}>Novo SAT</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'var(--portal-bg-secondary, #f5f5f5)', border: 'none', borderRadius: 9, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
            </div>

            {/* Cliente */}
            <div style={{ marginBottom: 16, position: 'relative' }} ref={dropRef}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>CLIENTE</label>
              {clienteSel ? (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 10, background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                  <Building2 size={18} color="#0369a1" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0c4a6e' }}>{clienteSel.nome}</div>
                    {clienteSel.endereco && <div style={{ fontSize: 12, color: '#0369a1', marginTop: 2 }}>{clienteSel.endereco}</div>}
                  </div>
                  <button onClick={() => { setClienteSel(null); setBusca('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0369a1', padding: 2 }}><X size={16} /></button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                  <input value={busca} onChange={e => { setBusca(e.target.value); buscarClientes(e.target.value) }} onFocus={() => { if (resultados.length) setShowDrop(true) }} placeholder="Buscar cliente por nome ou CNPJ..." style={{ ...INP, paddingLeft: 36 }} />
                  {showDrop && (resultados.length > 0 || buscando) && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'var(--portal-bg-card, #fff)', borderRadius: 12, border: '1px solid var(--portal-border, #e5e5e5)', boxShadow: '0 12px 32px rgba(0,0,0,0.12)', maxHeight: 260, overflowY: 'auto', marginTop: 4 }}>
                      {buscando ? (
                        <div style={{ padding: 16, textAlign: 'center', color: '#9CA3AF', fontSize: 12 }}>Buscando...</div>
                      ) : resultados.map((c, i) => (
                        <div key={c.id + '-' + i} onClick={() => { setClienteSel(c); setShowDrop(false) }} style={{ padding: '11px 14px', cursor: 'pointer', borderBottom: i < resultados.length - 1 ? '1px solid var(--portal-border, #f0f0f0)' : 'none' }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--portal-bg-hover, #fafafa)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text, #1a1a1a)' }}>{c.nome}</div>
                          <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{c.endereco || c.cidade}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tipo */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>TIPO</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                {(Object.keys(TIPO_SAT) as TipoSat[]).map(k => {
                  const cfg = TIPO_SAT[k]
                  const ativo = tipo === k
                  return (
                    <button key={k} onClick={() => setTipo(k)} style={{
                      padding: '12px 6px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, lineHeight: 1.2, textAlign: 'center',
                      border: ativo ? `2px solid ${cfg.cor}` : '1px solid var(--portal-border, #e5e5e5)',
                      background: ativo ? cfg.bg : 'var(--portal-bg-card, #fff)', color: ativo ? cfg.cor : 'var(--portal-text-secondary, #666)',
                    }}>{cfg.label}</button>
                  )
                })}
              </div>
            </div>

            {/* Data limite */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>DATA LIMITE</label>
              <input type="date" value={dataLimite} min={hojeStr()} onChange={e => setDataLimite(e.target.value)} style={INP} />
            </div>

            {/* Descrição */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>OBSERVAÇÃO (opcional)</label>
              <textarea value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Detalhes do atendimento..." rows={3} style={{ ...INP, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowModal(false)} style={{ flex: 1, padding: 13, borderRadius: 11, fontSize: 14, fontWeight: 700, background: 'var(--portal-bg-secondary, #f0f0f0)', color: 'var(--portal-text-secondary, #555)', border: 'none', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={criarSat} disabled={enviando || !clienteSel} style={{ flex: 1, padding: 13, borderRadius: 11, fontSize: 14, fontWeight: 700, background: 'linear-gradient(135deg, #0EA5E9, #0369A1)', color: '#fff', border: 'none', cursor: 'pointer', opacity: (enviando || !clienteSel) ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Headset size={16} /> {enviando ? 'Abrindo...' : 'Abrir SAT'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
