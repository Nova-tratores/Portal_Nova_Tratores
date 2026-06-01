'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import {
  Users, ArrowLeft, Wrench,
  AlertTriangle, CheckCircle, XCircle, Plus,
  ChevronDown, ChevronLeft, ChevronRight, Package, FileText, ShoppingCart, AlertOctagon,
  Trophy, Calendar
} from 'lucide-react'

interface Mecanico {
  id: string
  nome: string
  email: string
  funcao: string
  avatar_url: string | null
  mecanico_role: string
  tecnico_nome: string
  stats: { total: number; horas: number; km: number; valor: number }
  ocorrencias_pendentes: number
  alertas_pendentes: number
}

interface Ocorrencia {
  id: number
  tecnico_nome: string
  tipo: string
  descricao: string
  pontos: number
  data_referencia: string
  id_ordem: string | null
  id_alerta: string | null
  admin_nome: string | null
  created_at: string
}

interface Produto {
  codigo: string
  descricao: string
  qtd: number
  preco: number
  devolvido: number
}

interface PPV {
  id: string
  pedido_omie: string
  status: string
  produtos: Produto[]
}

interface Ordem {
  os_num: string
  cod_int: string
  data: string
  horas: string
  km: string
  valor: string
  status: string
  faturada: boolean
  interno: boolean
  cidade: string
  empresa: string
  cliente: string
  cidade_cliente: string
  relatorio: string
  servico_solicitado: string
  relatorio_tecnico: string
  diagnostico_tecnico: string
  obs: string
  ppvs: PPV[]
}

interface Requisicao {
  id_pedido: string
  Id_Os: string
  status: string
  data: string
  pedido_omie: string
  valor_total: number
  Tipo_Pedido: string
}

interface Alerta {
  id: number
  tecnico_nome: string
  tipo: string
  severidade: string
  data_referencia: string
  descricao: string
  detalhes: string
  id_ordem: string
  status: string
  admin_nome: string
  admin_comentario: string
  resolvido_em: string
  created_at: string
}

interface MecanicoDetalhe extends Mecanico {
  mes: string
  ordens: Ordem[]
  ocorrencias: Ocorrencia[]
  requisicoes: Requisicao[]
  alertas: Alerta[]
  gps: { kmMes: number; dias: number }
  veiculo: { placa: string; descricao: string } | null
  data_entrada: string | null
}

const TIPO_CORES: Record<string, { bg: string; text: string; label: string }> = {
  atraso: { bg: '#FEF3C7', text: '#92400E', label: 'Atraso' },
  falta: { bg: '#FEE2E2', text: '#991B1B', label: 'Falta' },
  advertencia: { bg: '#FFE4E6', text: '#BE123C', label: 'Advertencia' },
  elogio: { bg: '#D1FAE5', text: '#065F46', label: 'Elogio' },
  observacao: { bg: '#E0E7FF', text: '#3730A3', label: 'Observacao' },
  geral: { bg: '#F1F5F9', text: '#475569', label: 'Geral' },
}

const STATUS_CORES: Record<string, { bg: string; text: string }> = {
  pendente: { bg: '#FEF3C7', text: '#92400E' },
  resolvida: { bg: '#D1FAE5', text: '#065F46' },
  cancelada: { bg: '#F1F5F9', text: '#64748B' },
}

export default function MecanicosPage() {
  const { userProfile } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()

  const tecnicoParam = searchParams.get('tecnico')

  const [mecanicos, setMecanicos] = useState<Mecanico[]>([])
  const [resumoGeral, setResumoGeral] = useState<{ receitaTotal: number; despesaTotal: number; despesaOperacional: number; custoRH: number; qtdOS: number; qtdPV: number; ranking: { nome: string; valor: number; qtd: number }[] } | null>(null)
  const [detalhe, setDetalhe] = useState<MecanicoDetalhe | null>(null)
  const [loading, setLoading] = useState(true)
  const [secao, setSecao] = useState<'servicos' | 'requisicoes' | 'alertas' | 'ocorrencias'>('servicos')
  const [expandedOs, setExpandedOs] = useState<Set<string>>(new Set())
  const [showNovaOcorrencia, setShowNovaOcorrencia] = useState(false)
  const [novaOc, setNovaOc] = useState({ tipo: 'geral', titulo: '', descricao: '' })
  const [salvando, setSalvando] = useState(false)
  const [expandedAlerta, setExpandedAlerta] = useState<number | null>(null)
  const [mesesAnteriores, setMesesAnteriores] = useState<Record<string, MecanicoDetalhe | 'loading'>>({})
  const [mesExpandido, setMesExpandido] = useState<string | null>(null)

  const getMesAtual = () => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  const mesLabel = (mes: string) => {
    const [y, m] = mes.split('-').map(Number)
    return new Date(y, m - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }

  const getMesesAnteriores = () => {
    const meses: string[] = []
    const now = new Date()
    for (let i = 1; i <= 5; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return meses
  }

  const carregarMesAnterior = async (nome: string, mes: string) => {
    if (mesesAnteriores[mes] && mesesAnteriores[mes] !== 'loading') {
      setMesExpandido(mesExpandido === mes ? null : mes)
      return
    }
    setMesExpandido(mes)
    setMesesAnteriores(prev => ({ ...prev, [mes]: 'loading' }))
    try {
      const res = await fetch(`/api/mecanicos?nome=${encodeURIComponent(nome)}&mes=${mes}`)
      if (res.ok) {
        const data = await res.json()
        setMesesAnteriores(prev => ({ ...prev, [mes]: data }))
      }
    } catch (e) {
      console.error(e)
      setMesesAnteriores(prev => { const n = { ...prev }; delete n[mes]; return n })
      setMesExpandido(null)
    }
  }

  const carregarLista = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/mecanicos')
      if (!res.ok) throw new Error('Erro ao carregar')
      const data = await res.json()
      if (data && data.mecanicos) {
        setMecanicos(data.mecanicos)
        setResumoGeral(data.resumo || null)
      } else {
        setMecanicos(Array.isArray(data) ? data : [])
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [])

  const carregarDetalhe = useCallback(async (nome: string) => {
    setLoading(true)
    setMesesAnteriores({})
    setMesExpandido(null)
    try {
      const res = await fetch(`/api/mecanicos?nome=${encodeURIComponent(nome)}`)
      if (!res.ok) throw new Error('Erro ao carregar')
      const data = await res.json()
      setDetalhe(data)
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (tecnicoParam) {
      carregarDetalhe(tecnicoParam)
    } else {
      carregarLista()
    }
  }, [tecnicoParam, carregarDetalhe, carregarLista])

  const abrirMecanico = (nome: string) => {
    router.push(`/mecanicos?tecnico=${encodeURIComponent(nome)}`)
  }

  const voltarLista = () => {
    setDetalhe(null)
    router.push('/mecanicos')
  }

  const criarOcorrencia = async () => {
    if (!detalhe || !novaOc.titulo.trim()) return
    setSalvando(true)
    try {
      await fetch('/api/mecanicos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'criar_ocorrencia',
          tecnico_nome: detalhe.tecnico_nome,
          tipo: novaOc.tipo,
          titulo: novaOc.titulo,
          descricao: novaOc.descricao,
          criado_por: userProfile?.nome || 'portal',
        }),
      })
      setNovaOc({ tipo: 'geral', titulo: '', descricao: '' })
      setShowNovaOcorrencia(false)
      carregarDetalhe(detalhe.tecnico_nome)
    } catch (e) {
      console.error(e)
    }
    setSalvando(false)
  }

  const justificarAlerta = async (id: number, comentario: string) => {
    try {
      await fetch('/api/mecanicos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'justificar_alerta', id, admin_comentario: comentario, admin_nome: userProfile?.nome || 'portal' }),
      })
      if (detalhe) carregarDetalhe(detalhe.tecnico_nome)
    } catch (e) {
      console.error(e)
    }
  }

  const alertaParaOcorrencia = async (id: number) => {
    try {
      await fetch('/api/mecanicos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'alerta_para_ocorrencia', id, admin_nome: userProfile?.nome || 'portal' }),
      })
      if (detalhe) carregarDetalhe(detalhe.tecnico_nome)
    } catch (e) {
      console.error(e)
    }
  }

  const atualizarOcorrencia = async (id: number, status: string) => {
    try {
      await fetch('/api/mecanicos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'atualizar_ocorrencia', id, status }),
      })
      if (detalhe) carregarDetalhe(detalhe.tecnico_nome)
    } catch (e) {
      console.error(e)
    }
  }

  const toggleOs = (osNum: string) => {
    setExpandedOs(prev => {
      const next = new Set(prev)
      if (next.has(osNum)) next.delete(osNum)
      else next.add(osNum)
      return next
    })
  }

  // ── DETALHE DO MECANICO ──
  if (detalhe) {
    const totalPecas = detalhe.ordens.reduce((acc, o) => acc + o.ppvs.reduce((a, p) => a + p.produtos.length, 0), 0)
    const ocPendentes = detalhe.ocorrencias.filter(o => o.pontos === 0).length

    const secoes = [
      { id: 'servicos' as const, icon: <Wrench size={22} />, label: 'Servicos', count: detalhe.ordens.length, color: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' },
      { id: 'requisicoes' as const, icon: <ShoppingCart size={22} />, label: 'Requisicoes', count: detalhe.requisicoes.length, color: '#7C3AED', gradient: 'linear-gradient(135deg, #7C3AED, #6D28D9)' },
      { id: 'alertas' as const, icon: <AlertOctagon size={22} />, label: 'Alertas', count: detalhe.alertas.length, color: '#DC2626', gradient: 'linear-gradient(135deg, #DC2626, #B91C1C)', badge: detalhe.alertas.filter(a => a.status === 'pendente').length },
      { id: 'ocorrencias' as const, icon: <AlertTriangle size={22} />, label: 'Ocorrencias', count: detalhe.ocorrencias.length, color: '#B45309', gradient: 'linear-gradient(135deg, #B45309, #92400E)', badge: ocPendentes },
    ]

    return (
      <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <button onClick={voltarLista} style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #E2E8F0', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <ArrowLeft size={18} color="#64748B" />
          </button>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {detalhe.avatar_url ? (
              <img src={detalhe.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Users size={22} color="#fff" />
            )}
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1E293B', margin: 0 }}>{detalhe.nome}</h1>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>{detalhe.tecnico_nome} - {detalhe.funcao || detalhe.mecanico_role} | GPS: {detalhe.gps.kmMes} km em {detalhe.gps.dias} dias</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#EFF6FF', borderRadius: 8, padding: '6px 14px' }}>
            <Calendar size={14} color="#3b82f6" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', textTransform: 'capitalize' }}>{mesLabel(getMesAtual())}</span>
          </div>
        </div>

        {/* Perfil do tecnico */}
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 20 }}>
          {detalhe.data_entrada && (
            <div><span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Entrada</span><div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600, marginTop: 2 }}>{new Date(detalhe.data_entrada).toLocaleDateString('pt-BR')}</div></div>
          )}
          {detalhe.funcao && (
            <div><span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Funcao</span><div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600, marginTop: 2 }}>{detalhe.funcao}</div></div>
          )}
          {detalhe.email && (
            <div><span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Email</span><div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600, marginTop: 2 }}>{detalhe.email}</div></div>
          )}
<div><span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>GPS Mes</span><div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600, marginTop: 2 }}>{detalhe.gps.kmMes} km | {detalhe.gps.dias} dias</div></div>
        </div>

        {/* Navegação por seções */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
          {secoes.map(s => {
            const isActive = secao === s.id
            return (
              <div key={s.id} onClick={() => setSecao(s.id)} style={{
                padding: '14px 16px', borderRadius: 12, cursor: 'pointer', transition: 'all .2s',
                background: isActive ? s.gradient : '#fff',
                border: isActive ? 'none' : '1px solid #E2E8F0',
                boxShadow: isActive ? `0 4px 16px ${s.color}30` : '0 1px 3px rgba(0,0,0,0.04)',
                position: 'relative',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: isActive ? 'rgba(255,255,255,0.2)' : `${s.color}10`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isActive ? '#fff' : s.color,
                  }}>
                    {s.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isActive ? 'rgba(255,255,255,0.8)' : '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: isActive ? '#fff' : '#1E293B', lineHeight: 1.1 }}>{s.count}</div>
                  </div>
                </div>
                {(s.badge || 0) > 0 && (
                  <span style={{ position: 'absolute', top: 8, right: 8, minWidth: 20, height: 20, borderRadius: 10, background: isActive ? '#fff' : '#EF4444', color: isActive ? s.color : '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' }}>{s.badge}</span>
                )}
              </div>
            )
          })}
        </div>

        {/* Secao: Servicos (OS accordion) */}
        {secao === 'servicos' && (
          <div>
            {detalhe.ordens.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8', fontSize: 14, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10 }}>Nenhuma OS no mes</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detalhe.ordens.map(o => {
                  const isOpen = expandedOs.has(o.os_num)
                  const temPecas = o.ppvs.some(p => p.produtos.length > 0)
                  const temRelTec = !!o.relatorio_tecnico?.trim()
                  const temDiag = !!o.diagnostico_tecnico?.trim()
                  return (
                    <div key={o.os_num} style={{ background: '#fff', border: `1px solid ${isOpen ? '#3b82f6' : '#E2E8F0'}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color .2s' }}>
                      <div onClick={() => toggleOs(o.os_num)} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', gap: 10, userSelect: 'none', flexWrap: 'wrap' }}>
                        <ChevronDown size={16} color="#64748B" style={{ transition: 'transform .2s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, color: '#2563EB', fontSize: 14 }}>OS {o.os_num}</span>
                        <span style={{ fontSize: 12, color: '#64748B' }}>{o.data ? o.data.split('-').reverse().join('/') : '-'}</span>
                        {o.cliente && <span style={{ fontSize: 12, color: '#1E293B', fontWeight: 600 }}>{o.cliente}</span>}
                        {!o.cliente && o.cidade && <span style={{ fontSize: 12, color: '#334155' }}>{o.cidade}</span>}
                        {o.interno && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#DBEAFE', color: '#1E40AF', fontWeight: 700 }}>INT</span>}
                        {!o.faturada && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: o.status === 'Executada' ? '#FEF3C7' : o.status === 'Faturando' ? '#E0E7FF' : '#F1F5F9', color: o.status === 'Executada' ? '#92400E' : o.status === 'Faturando' ? '#3730A3' : '#64748B', fontWeight: 700 }}>{o.status}</span>}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 12 }}>
                          <span style={{ color: '#047857', fontWeight: 700 }}>{(parseFloat(o.horas) || 0).toFixed(1)}h</span>
                          <span style={{ color: '#B45309', fontWeight: 700 }}>{(parseFloat(o.km) || 0).toFixed(0)} km</span>
                          <span style={{ color: '#7C3AED', fontWeight: 700 }}>R$ {(parseFloat(o.valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {temPecas && <Package size={14} color="#EA580C" style={{ flexShrink: 0 }} />}
                        {temRelTec && <FileText size={14} color="#047857" style={{ flexShrink: 0 }} />}
                      </div>
                      {isOpen && (
                        <div style={{ borderTop: '1px solid #E2E8F0', padding: '16px' }}>
                          {/* Cliente e cidade */}
                          {o.cliente && (
                            <div style={{ marginBottom: 14, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                              <div><span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8' }}>CLIENTE: </span><span style={{ fontSize: 13, color: '#1E293B', fontWeight: 600 }}>{o.cliente}</span></div>
                              {o.cidade_cliente && <div><span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8' }}>CIDADE: </span><span style={{ fontSize: 13, color: '#334155' }}>{o.cidade_cliente}</span></div>}
                            </div>
                          )}

                          {/* Servico solicitado */}
                          {o.servico_solicitado?.trim() && (
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 }}>Servico Solicitado</div>
                              <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5 }}>{o.servico_solicitado}</div>
                            </div>
                          )}

                          {/* Diagnostico do tecnico (do app) */}
                          {temDiag && (
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 }}>Diagnostico do Tecnico</div>
                              <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, background: '#FFF7ED', borderRadius: 8, padding: 10, border: '1px solid #FED7AA' }}>{o.diagnostico_tecnico}</div>
                            </div>
                          )}

                          {/* Pecas (PPV) */}
                          {temPecas && (
                            <div style={{ marginBottom: 14 }}>
                              {o.ppvs.map(ppv => ppv.produtos.length > 0 && (
                                <div key={ppv.id} style={{ marginBottom: 10 }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Package size={12} /> {ppv.id}
                                    {ppv.pedido_omie && <span style={{ color: '#2563EB', fontWeight: 700 }}>| Pedido Omie: {ppv.pedido_omie}</span>}
                                    <span style={{ padding: '2px 8px', borderRadius: 4, background: ppv.status === 'Concluída' ? '#D1FAE5' : ppv.status === 'Cancelada' ? '#FEE2E2' : '#FEF3C7', color: ppv.status === 'Concluída' ? '#065F46' : ppv.status === 'Cancelada' ? '#991B1B' : '#92400E', fontSize: 10 }}>{ppv.status}</span>
                                  </div>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                      <tr style={{ background: '#F8FAFC' }}>
                                        <th style={{ ...thStyle, fontSize: 11, padding: '6px 10px' }}>Codigo</th>
                                        <th style={{ ...thStyle, fontSize: 11, padding: '6px 10px' }}>Descricao</th>
                                        <th style={{ ...thStyle, fontSize: 11, padding: '6px 10px', textAlign: 'center' }}>Saida</th>
                                        <th style={{ ...thStyle, fontSize: 11, padding: '6px 10px', textAlign: 'center' }}>Devolvido</th>
                                        <th style={{ ...thStyle, fontSize: 11, padding: '6px 10px', textAlign: 'center' }}>Ficou</th>
                                        <th style={{ ...thStyle, fontSize: 11, padding: '6px 10px', textAlign: 'right' }}>Preco</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {ppv.produtos.map((prod, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                          <td style={{ padding: '6px 10px', color: '#64748B', fontFamily: 'monospace' }}>{prod.codigo}</td>
                                          <td style={{ padding: '6px 10px', color: '#334155', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prod.descricao}</td>
                                          <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600 }}>{prod.qtd}</td>
                                          <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 600, color: prod.devolvido > 0 ? '#DC2626' : '#94A3B8' }}>{prod.devolvido > 0 ? prod.devolvido : '-'}</td>
                                          <td style={{ padding: '6px 10px', textAlign: 'center', fontWeight: 700, color: '#047857' }}>{prod.qtd - prod.devolvido}</td>
                                          <td style={{ padding: '6px 10px', textAlign: 'right', color: '#64748B' }}>R$ {prod.preco.toFixed(2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Relatorio do tecnico (do app mecanico) */}
                          {temRelTec && (
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <FileText size={12} /> Relatorio do Tecnico
                              </div>
                              <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, background: '#F0FDF4', borderRadius: 8, padding: 12, border: '1px solid #BBF7D0', whiteSpace: 'pre-wrap' }}>{o.relatorio_tecnico}</div>
                            </div>
                          )}

                          {!temPecas && !temRelTec && !temDiag && !o.servico_solicitado?.trim() && (
                            <div style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', padding: 12 }}>Sem detalhes adicionais</div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Secao: Requisicoes */}
        {secao === 'requisicoes' && (
          <div>
            {detalhe.requisicoes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8', fontSize: 14, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10 }}>Nenhuma requisicao encontrada</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detalhe.requisicoes.map(r => {
                  const statusColor = r.status.includes('Cancelad') ? '#991B1B' : r.status.includes('Fechado') || r.status.includes('Conclu') ? '#065F46' : '#92400E'
                  const statusBg = r.status.includes('Cancelad') ? '#FEE2E2' : r.status.includes('Fechado') || r.status.includes('Conclu') ? '#D1FAE5' : '#FEF3C7'
                  return (
                    <div key={r.id_pedido} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#7C3AED', fontSize: 14 }}>{r.id_pedido}</span>
                      {r.Id_Os && <span style={{ fontSize: 12, color: '#2563EB', fontWeight: 600 }}>{r.Id_Os}</span>}
                      <span style={{ fontSize: 12, color: '#64748B' }}>{r.data || '-'}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 4, background: statusBg, color: statusColor, fontSize: 10, fontWeight: 700 }}>{r.status}</span>
                      {r.pedido_omie && <span style={{ fontSize: 11, color: '#64748B' }}>Omie: {r.pedido_omie}</span>}
                      <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#1E293B', fontSize: 13 }}>R$ {(r.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Secao: Alertas */}
        {secao === 'alertas' && (
          <div>
            {detalhe.alertas.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8', fontSize: 14, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10 }}>Nenhum alerta no mes</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detalhe.alertas.map(a => {
                  const isAtraso = a.tipo === 'atraso_relatorio'
                  const isPendente = a.status === 'pendente'
                  const isExpanded = expandedAlerta === a.id
                  const statusLabel = a.status === 'justificada' ? 'Justificada' : a.status === 'ocorrencia' ? 'Virou Ocorrencia' : 'Pendente'
                  const statusBg = a.status === 'justificada' ? '#D1FAE5' : a.status === 'ocorrencia' ? '#DBEAFE' : '#FEF3C7'
                  const statusColor = a.status === 'justificada' ? '#065F46' : a.status === 'ocorrencia' ? '#1E40AF' : '#92400E'
                  return (
                    <div key={a.id} style={{ background: '#fff', border: `1px solid ${isPendente ? (isAtraso ? '#FED7AA' : '#FECACA') : '#E2E8F0'}`, borderRadius: 10, overflow: 'hidden', opacity: isPendente ? 1 : 0.75, transition: 'all .2s' }}>
                      {/* Header clicavel */}
                      <div onClick={() => setExpandedAlerta(isExpanded ? null : a.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 16, cursor: 'pointer', flexWrap: 'wrap', userSelect: 'none' }}>
                        <ChevronDown size={14} color="#64748B" style={{ transition: 'transform .2s', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', flexShrink: 0 }} />
                        <span style={{
                          padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: isAtraso ? '#FFF7ED' : '#FEF2F2',
                          color: isAtraso ? '#C2410C' : '#DC2626',
                        }}>
                          {isAtraso ? 'Atraso Relatorio' : 'Divergencia KM'}
                        </span>
                        <span style={{ padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: statusBg, color: statusColor }}>{statusLabel}</span>
                        {a.id_ordem && <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 600 }}>{a.id_ordem}</span>}
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', flex: 1 }}>{a.descricao}</span>
                        <span style={{ fontSize: 12, color: '#94A3B8' }}>{a.data_referencia ? a.data_referencia.split('-').reverse().join('/') : ''}</span>
                      </div>

                      {/* Detalhes expandidos */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid #E2E8F0', padding: 16 }}>
                          {/* O que aconteceu */}
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 }}>O que aconteceu</div>
                            <div style={{ fontSize: 14, color: '#1E293B', lineHeight: 1.5 }}>{a.descricao}</div>
                          </div>

                          {/* Detalhes extras */}
                          {a.detalhes && (
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 }}>Detalhes</div>
                              <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.5, background: '#F8FAFC', borderRadius: 8, padding: 10, border: '1px solid #E2E8F0', whiteSpace: 'pre-wrap' }}>{a.detalhes}</div>
                            </div>
                          )}

                          {/* Quando */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 14 }}>
                            {a.data_referencia && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Data da OS</div>
                                <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600, marginTop: 2 }}>{a.data_referencia.split('-').reverse().join('/')}</div>
                              </div>
                            )}
                            {a.id_ordem && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Ordem</div>
                                <div style={{ fontSize: 13, color: '#2563EB', fontWeight: 600, marginTop: 2 }}>{a.id_ordem}</div>
                              </div>
                            )}
                            {a.created_at && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Detectado em</div>
                                <div style={{ fontSize: 13, color: '#1E293B', fontWeight: 600, marginTop: 2 }}>{new Date(a.created_at).toLocaleString('pt-BR')}</div>
                              </div>
                            )}
                            {a.severidade && (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase' }}>Severidade</div>
                                <div style={{ fontSize: 13, color: a.severidade === 'alta' ? '#DC2626' : a.severidade === 'media' ? '#B45309' : '#64748B', fontWeight: 700, marginTop: 2, textTransform: 'capitalize' }}>{a.severidade}</div>
                              </div>
                            )}
                          </div>

                          {/* Resolucao */}
                          {a.admin_comentario && (
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 4 }}>Resolucao</div>
                              <div style={{ fontSize: 13, color: '#047857', background: '#F0FDF4', borderRadius: 8, padding: 10, border: '1px solid #BBF7D0' }}>
                                <strong>{a.admin_nome || 'Admin'}:</strong> {a.admin_comentario}
                                {a.resolvido_em && <span style={{ display: 'block', fontSize: 11, color: '#94A3B8', marginTop: 4 }}>Resolvido em {new Date(a.resolvido_em).toLocaleString('pt-BR')}</span>}
                              </div>
                            </div>
                          )}

                          {/* Acoes */}
                          {isPendente && (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={(e) => { e.stopPropagation(); const motivo = prompt('Motivo da justificativa:'); if (motivo !== null) justificarAlerta(a.id, motivo) }} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #10b981', background: '#ECFDF5', color: '#065F46', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <CheckCircle size={12} /> Justificar
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); alertaParaOcorrencia(a.id) }} style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #DC2626', background: '#FEF2F2', color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                <AlertTriangle size={12} /> Virar Ocorrencia
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Secao: Ocorrencias */}
        {secao === 'ocorrencias' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
              <button onClick={() => setShowNovaOcorrencia(!showNovaOcorrencia)} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
              }}>
                <Plus size={14} /> Nova Ocorrencia
              </button>
            </div>

            {showNovaOcorrencia && (
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                  <select value={novaOc.tipo} onChange={e => setNovaOc({ ...novaOc, tipo: e.target.value })} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13 }}>
                    {Object.entries(TIPO_CORES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <input value={novaOc.titulo} onChange={e => setNovaOc({ ...novaOc, titulo: e.target.value })} placeholder="Titulo da ocorrencia" style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13 }} />
                </div>
                <textarea value={novaOc.descricao} onChange={e => setNovaOc({ ...novaOc, descricao: e.target.value })} placeholder="Descricao (opcional)" rows={3} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                  <button onClick={() => setShowNovaOcorrencia(false)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #E2E8F0', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={criarOcorrencia} disabled={salvando || !novaOc.titulo.trim()} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: salvando ? 0.6 : 1 }}>
                    {salvando ? 'Salvando...' : 'Criar'}
                  </button>
                </div>
              </div>
            )}

            {detalhe.ocorrencias.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8', fontSize: 14, background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10 }}>Nenhuma ocorrencia registrada</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detalhe.ocorrencias.map(oc => {
                  const tipo = TIPO_CORES[oc.tipo] || TIPO_CORES.geral
                  const statusLabel = oc.pontos === 1 ? 'resolvida' : oc.pontos === -1 ? 'cancelada' : 'pendente'
                  const st = STATUS_CORES[statusLabel] || STATUS_CORES.pendente
                  return (
                    <div key={oc.id} style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ padding: '3px 10px', borderRadius: 6, background: tipo.bg, color: tipo.text, fontSize: 11, fontWeight: 700 }}>{tipo.label}</span>
                        <span style={{ padding: '3px 10px', borderRadius: 6, background: st.bg, color: st.text, fontSize: 11, fontWeight: 700 }}>{statusLabel}</span>
                        <span style={{ fontSize: 12, color: '#94A3B8', marginLeft: 'auto' }}>{new Date(oc.created_at).toLocaleDateString('pt-BR')}{oc.admin_nome ? ` - ${oc.admin_nome}` : ''}</span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', marginBottom: 4 }}>{oc.descricao}</div>
                      {statusLabel === 'pendente' && (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => atualizarOcorrencia(oc.id, 'resolvida')} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #10b981', background: '#ECFDF5', color: '#065F46', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle size={12} /> Resolver
                          </button>
                          <button onClick={() => atualizarOcorrencia(oc.id, 'cancelada')} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#fff', color: '#64748B', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <XCircle size={12} /> Cancelar
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Meses anteriores em cascata */}
        <div style={{ marginTop: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#94A3B8', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={14} /> Meses Anteriores
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {getMesesAnteriores().map(mes => {
              const isExpanded = mesExpandido === mes
              const dados = mesesAnteriores[mes]
              const isLoading = dados === 'loading'
              const mesData = (dados && dados !== 'loading') ? dados as MecanicoDetalhe : null

              return (
                <div key={mes} style={{ background: '#fff', border: `1px solid ${isExpanded ? '#3b82f6' : '#E2E8F0'}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color .2s' }}>
                  <div
                    onClick={() => carregarMesAnterior(detalhe.tecnico_nome, mes)}
                    style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', cursor: 'pointer', userSelect: 'none' }}
                  >
                    <ChevronDown size={16} color="#64748B" style={{ transition: 'transform .2s', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', marginRight: 10, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', textTransform: 'capitalize', flex: 1 }}>{mesLabel(mes)}</span>
                    {isLoading && <span style={{ fontSize: 12, color: '#94A3B8' }}>Carregando...</span>}
                    {mesData && (
                      <div style={{ display: 'flex', gap: 12, fontSize: 12, fontWeight: 700 }}>
                        <span style={{ color: '#3b82f6' }}>{mesData.ordens.length} OS</span>
                        <span style={{ color: '#7C3AED' }}>{mesData.requisicoes.length} Req</span>
                        <span style={{ color: '#DC2626' }}>{mesData.alertas.length} Alertas</span>
                        <span style={{ color: '#B45309' }}>{mesData.ocorrencias.length} Oc</span>
                      </div>
                    )}
                  </div>

                  {isExpanded && mesData && (
                    <div style={{ borderTop: '1px solid #E2E8F0', padding: '16px 18px' }}>
                      {/* Resumo do mês */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
                        <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#93C5FD', textTransform: 'uppercase' }}>Ordens</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#1D4ED8' }}>{mesData.ordens.length}</div>
                        </div>
                        <div style={{ background: '#F5F3FF', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#C4B5FD', textTransform: 'uppercase' }}>Requisicoes</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#6D28D9' }}>{mesData.requisicoes.length}</div>
                        </div>
                        <div style={{ background: '#FEF2F2', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#FCA5A5', textTransform: 'uppercase' }}>Alertas</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#DC2626' }}>{mesData.alertas.length}</div>
                        </div>
                        <div style={{ background: '#FFF7ED', borderRadius: 8, padding: '10px 12px' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: '#FDBA74', textTransform: 'uppercase' }}>Ocorrencias</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#C2410C' }}>{mesData.ocorrencias.length}</div>
                        </div>
                      </div>

                      {/* GPS resumo */}
                      <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13 }}>
                        <span style={{ fontWeight: 700, color: '#1D4ED8' }}>GPS: {mesData.gps.kmMes} km</span>
                        <span style={{ color: '#64748B' }}>{mesData.gps.dias} dias rastreados</span>
                      </div>

                      {/* Lista de OS compacta */}
                      {mesData.ordens.length > 0 && (
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', marginBottom: 6, textTransform: 'uppercase' }}>Ordens de Servico</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {mesData.ordens.slice(0, 10).map(o => (
                              <div key={o.os_num} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#F8FAFC', borderRadius: 8, fontSize: 12 }}>
                                <span style={{ fontWeight: 700, color: '#2563EB', minWidth: 60 }}>OS {o.os_num}</span>
                                <span style={{ color: '#1E293B', flex: 1 }}>{o.cliente || o.cidade || '-'}</span>
                                <span style={{ color: '#047857', fontWeight: 700 }}>{(parseFloat(o.horas) || 0).toFixed(1)}h</span>
                                <span style={{ color: '#B45309', fontWeight: 700 }}>{(parseFloat(o.km) || 0).toFixed(0)} km</span>
                                <span style={{ color: '#7C3AED', fontWeight: 700 }}>R$ {(parseFloat(o.valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                            ))}
                            {mesData.ordens.length > 10 && (
                              <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: 8 }}>+ {mesData.ordens.length - 10} ordens</div>
                            )}
                          </div>
                        </div>
                      )}

                      {mesData.ordens.length === 0 && mesData.requisicoes.length === 0 && mesData.alertas.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 20, color: '#94A3B8', fontSize: 13 }}>Nenhum registro neste mes</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </div>
    )
  }

  // ── LISTA DE MECANICOS ──
  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={20} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E293B', margin: 0 }}>Janela Mecanico</h1>
          <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>Tecnicos da oficina, ocorrencias e desempenho</p>
        </div>
      </div>

      {/* Resumo Geral da Oficina */}
      {!loading && resumoGeral && (() => {
        const r = resumoGeral
        const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
        const saldo = r.receitaTotal - r.despesaTotal
        return (
          <div style={{ marginBottom: 24 }}>
            {/* Cards resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 16 }}>
              <div style={{ background: 'linear-gradient(135deg, #059669, #047857)', borderRadius: 10, padding: 14, color: '#fff' }}>
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>Receita Oficina</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtBRL(r.receitaTotal)}</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{r.qtdOS} OS + {r.qtdPV} PV</div>
              </div>
              <div style={{ background: 'linear-gradient(135deg, #DC2626, #B91C1C)', borderRadius: 10, padding: 14, color: '#fff' }}>
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>Despesa Total</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtBRL(r.despesaTotal)}</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Operacional + RH</div>
              </div>
              <div style={{ background: saldo >= 0 ? 'linear-gradient(135deg, #0891B2, #0E7490)' : 'linear-gradient(135deg, #B45309, #92400E)', borderRadius: 10, padding: 14, color: '#fff' }}>
                <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>Saldo Oficina</div>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{fmtBRL(saldo)}</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Receita - Despesa</div>
              </div>
            </div>

            {/* Ranking */}
            {r.ranking.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', background: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Trophy size={16} color="#B45309" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Ranking Faturamento OS - Mes</span>
                </div>
                {r.ranking.map((rk, i) => {
                  const maxVal = r.ranking[0]?.valor || 1
                  const pct = (rk.valor / maxVal) * 100
                  return (
                    <div key={i} style={{ padding: '8px 14px', borderTop: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: i < 3 ? '#B45309' : '#94A3B8', minWidth: 22 }}>{i + 1}o</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>{rk.nome}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>{fmtBRL(rk.valor)}</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: '#F1F5F9', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 3, background: i < 3 ? '#3b82f6' : '#CBD5E1', width: `${pct}%` }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 11, color: '#94A3B8', minWidth: 36, textAlign: 'right' }}>{rk.qtd} OS</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>Carregando...</div>
      ) : mecanicos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>
          <p style={{ fontSize: 15, marginBottom: 8 }}>Nenhum mecanico cadastrado</p>
          <p style={{ fontSize: 13 }}>Configure os mecanicos em Admin {'->'} Permissoes com role &quot;tecnico&quot;</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'center' }}>
          {mecanicos.map(m => {
            const initials = m.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
            return (
              <div key={m.id} onClick={() => abrirMecanico(m.tecnico_nome)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer',
                width: 120, textAlign: 'center', position: 'relative'
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden', transition: 'all .2s', border: '3px solid #E2E8F0',
                  boxShadow: '0 2px 8px rgba(59,130,246,0.15)'
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.transform = 'scale(1.08)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.transform = 'scale(1)' }}
                >
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ color: '#fff', fontWeight: 800, fontSize: 20 }}>{initials}</span>
                  )}
                </div>
                {(m.alertas_pendentes > 0 || m.ocorrencias_pendentes > 0) && (
                  <div style={{ position: 'absolute', top: -2, right: 10, width: 22, height: 22, borderRadius: '50%', background: '#EF4444', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
                    {m.alertas_pendentes + m.ocorrencias_pendentes}
                  </div>
                )}
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1E293B', lineHeight: 1.2, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome.split(' ').slice(0, 2).join(' ')}</div>
                <div style={{ display: 'flex', gap: 8, fontSize: 11, fontWeight: 700 }}>
                  <span style={{ color: '#3b82f6' }}>{m.stats.total} OS</span>
                  <span style={{ color: '#047857' }}>{m.stats.horas.toFixed(0)}h</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: 10, padding: 14, textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4, color }}>{icon}<span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8' }}>{label}</span></div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
    </div>
  )
}

const thStyle: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid #E2E8F0' }
const tdStyle: React.CSSProperties = { fontSize: 13, padding: '10px 14px', color: '#334155' }
