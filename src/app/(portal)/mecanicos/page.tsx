'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { supabase } from '@/lib/supabase'
import {
  Users, ArrowLeft, Wrench,
  AlertTriangle, CheckCircle, XCircle, Plus,
  ChevronDown, ChevronLeft, ChevronRight, Package, FileText, ShoppingCart, AlertOctagon,
  Trophy, Calendar, BarChart3, TrendingUp, TrendingDown, Minus
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
  relatorio_status: string
  relatorio_data_envio: string
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

interface AlertaOrdem {
  os_num: string
  data: string
  status: string
  faturada: boolean
  cliente: string
  cidade_cliente: string
  horas: string
  km: string
  valor: string
  relatorio_tecnico: string
  diagnostico_tecnico: string
  servico_solicitado: string
  ppvs: PPV[]
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
  carryover?: boolean
  ordem?: AlertaOrdem | null
}

interface MecanicoDetalhe extends Mecanico {
  mes: string
  ordens: Ordem[]
  ocorrencias: Ocorrencia[]
  requisicoes: Requisicao[]
  alertas: Alerta[]
  gps: { kmMes: number; dias: number; dirigindoMin: number; paradoForaMin: number }
  veiculo: { placa: string; descricao: string } | null
  data_entrada: string | null
}

interface GPSDia {
  km: number
  horasFora: number
  horasDirigindo: number
  horasParado: number
  placa: string
}

const TIPO_CORES: Record<string, { bg: string; text: string; label: string }> = {
  atraso: { bg: '#FEF3C7', text: '#92400E', label: 'Atraso' },
  falta: { bg: '#FEE2E2', text: '#991B1B', label: 'Falta' },
  advertencia: { bg: '#FFE4E6', text: '#BE123C', label: 'Advertencia' },
  elogio: { bg: '#D1FAE5', text: '#065F46', label: 'Elogio' },
  observacao: { bg: '#E0E7FF', text: '#3730A3', label: 'Observacao' },
  geral: { bg: '#F1F5F9', text: '#475569', label: 'Geral' },
}

const normNome = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const calcHorasServicoDia = (eventos: any[]): number => {
  if (!eventos || eventos.length === 0) return 0
  let horas = 0
  let ultimaSaida: Date | null = null
  for (const ev of eventos) {
    if (ev.tipo === 'saida_loja') {
      ultimaSaida = new Date(ev.horario)
    } else if (ev.tipo === 'retorno_loja' && ultimaSaida) {
      const diffMin = (new Date(ev.horario).getTime() - ultimaSaida.getTime()) / 60000
      if (diffMin > 30) horas += diffMin / 60
      ultimaSaida = null
    }
  }
  if (ultimaSaida && eventos.length > 0) {
    const diffMin = (new Date(eventos[eventos.length - 1].horario).getTime() - ultimaSaida.getTime()) / 60000
    if (diffMin > 30) horas += diffMin / 60
  }
  return horas
}

export default function MecanicosPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const searchParams = useSearchParams()
  const router = useRouter()

  if (!loadingPerm && userProfile && !temAcesso('mecanicos')) return <SemPermissao />

  const tecnicoParam = searchParams.get('tecnico')

  const [mecanicos, setMecanicos] = useState<Mecanico[]>([])
  const [resumoGeral, setResumoGeral] = useState<{ receitaTotal: number; despesaTotal: number; despesaOperacional: number; custoRH: number; qtdOS: number; qtdPV: number; ranking: { nome: string; valor: number; qtd: number }[] } | null>(null)
  const [detalhe, setDetalhe] = useState<MecanicoDetalhe | null>(null)
  const [loading, setLoading] = useState(true)
  const [secao, setSecao] = useState<'servicos' | 'relatorio' | 'requisicoes' | 'alertas' | 'ocorrencias'>('servicos')
  const [expandedOs, setExpandedOs] = useState<Set<string>>(new Set())
  const [showNovaOcorrencia, setShowNovaOcorrencia] = useState(false)
  const [novaOc, setNovaOc] = useState({ tipo: 'geral', titulo: '', descricao: '' })
  const [salvando, setSalvando] = useState(false)
  const [expandedAlerta, setExpandedAlerta] = useState<number | null>(null)
  const [mesesAnteriores, setMesesAnteriores] = useState<Record<string, MecanicoDetalhe | 'loading'>>({})
  const [mesExpandido, setMesExpandido] = useState<string | null>(null)

  // Relatório GPS
  const [relGPS, setRelGPS] = useState<Record<string, GPSDia>>({})
  const [relLoading, setRelLoading] = useState(false)
  const [relOrdemAberta, setRelOrdemAberta] = useState<string | null>(null)
  const [relCarregado, setRelCarregado] = useState(false)

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
    fetch('/api/mecanicos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'sync_alertas' }) }).catch(() => {})
  }, [])

  const carregarDetalhe = useCallback(async (nome: string) => {
    setLoading(true)
    setMesesAnteriores({})
    setMesExpandido(null)
    setRelCarregado(false)
    setRelGPS({})
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

  const carregarRelatorio = useCallback(async (tecNome: string, mes: string) => {
    if (relCarregado) return
    setRelLoading(true)
    try {
      const [y, m] = mes.split('-').map(Number)
      const primeiro = `${mes}-01`
      const ultimo = `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`

      const [gpsRes, resumoRes] = await Promise.all([
        supabase.from('GPS_Viagens').select('tecnico_nome, data, km_total, eventos, placa').gte('data', primeiro).lte('data', ultimo),
        supabase.from('resumo_diario_tecnico').select('tecnico_nome, data, horas_dirigindo').gte('data', primeiro).lte('data', ultimo),
      ])

      const resumoMap: Record<string, number> = {}
      for (const r of (resumoRes.data || [])) {
        resumoMap[`${normNome(r.tecnico_nome)}|${r.data}`] = parseFloat(r.horas_dirigindo) || 0
      }

      const gpsByDate: Record<string, GPSDia> = {}
      const tecNorm = normNome(tecNome)
      const tecFirst = tecNorm.split(/\s+/)[0]

      for (const g of (gpsRes.data || [])) {
        const gNorm = normNome(g.tecnico_nome)
        const gFirst = gNorm.split(/\s+/)[0]
        if (gFirst !== tecFirst) continue

        const horasFora = calcHorasServicoDia(g.eventos)
        const rKey = `${gNorm}|${g.data}`
        const dirigindo = resumoMap[rKey] || 0
        const parado = Math.max(0, horasFora - dirigindo)

        gpsByDate[g.data] = {
          km: parseFloat(g.km_total) || 0,
          horasFora,
          horasDirigindo: dirigindo,
          horasParado: parado,
          placa: g.placa || '',
        }
      }

      setRelGPS(gpsByDate)
      setRelCarregado(true)
    } catch (e) {
      console.error('Erro ao carregar relatorio GPS:', e)
    }
    setRelLoading(false)
  }, [relCarregado])

  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (tecnicoParam) {
      carregarDetalhe(tecnicoParam)
    } else {
      carregarLista()
    }
  }, [tecnicoParam, carregarDetalhe, carregarLista])

  useEffect(() => {
    pollRef.current = setInterval(() => {
      if (tecnicoParam) {
        carregarDetalhe(tecnicoParam).then(() => setLastSync(new Date()))
      } else {
        carregarLista().then(() => setLastSync(new Date()))
      }
    }, 30000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [tecnicoParam, carregarDetalhe, carregarLista])

  useEffect(() => {
    const channel = supabase
      .channel('mecanicos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checkin_diario' }, () => {
        if (tecnicoParam) carregarDetalhe(tecnicoParam)
        else carregarLista()
        setLastSync(new Date())
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mecanico_alertas' }, () => {
        if (tecnicoParam) carregarDetalhe(tecnicoParam)
        else carregarLista()
        setLastSync(new Date())
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mecanico_ocorrencias' }, () => {
        if (tecnicoParam) carregarDetalhe(tecnicoParam)
        else carregarLista()
        setLastSync(new Date())
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'GPS_Viagens' }, () => {
        if (tecnicoParam) carregarDetalhe(tecnicoParam)
        setLastSync(new Date())
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('connected')
        else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') setRealtimeStatus('disconnected')
      })

    return () => { supabase.removeChannel(channel) }
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

  const justificarAlertaMesAnterior = async (id: number, comentario: string, mes: string) => {
    try {
      await fetch('/api/mecanicos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'justificar_alerta', id, admin_comentario: comentario, admin_nome: userProfile?.nome || 'portal' }),
      })
      if (detalhe) {
        const res = await fetch(`/api/mecanicos?nome=${encodeURIComponent(detalhe.tecnico_nome)}&mes=${mes}`)
        if (res.ok) {
          const data = await res.json()
          setMesesAnteriores(prev => ({ ...prev, [mes]: data }))
        }
      }
    } catch (e) { console.error(e) }
  }

  const alertaParaOcorrenciaMesAnterior = async (id: number, mes: string) => {
    try {
      await fetch('/api/mecanicos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'alerta_para_ocorrencia', id, admin_nome: userProfile?.nome || 'portal' }),
      })
      if (detalhe) {
        const res = await fetch(`/api/mecanicos?nome=${encodeURIComponent(detalhe.tecnico_nome)}&mes=${mes}`)
        if (res.ok) {
          const data = await res.json()
          setMesesAnteriores(prev => ({ ...prev, [mes]: data }))
        }
      }
    } catch (e) { console.error(e) }
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
    const ocPendentes = detalhe.ocorrencias.filter(o => o.pontos === 0 || o.pontos === 1).length

    const secoes = [
      { id: 'servicos' as const, icon: <Wrench size={15} />, label: 'Servicos', count: detalhe.ordens.length, color: '#2563EB', badge: 0 },
      { id: 'relatorio' as const, icon: <BarChart3 size={15} />, label: 'Relatorio', count: detalhe.ordens.length, color: '#0891B2', badge: 0 },
      { id: 'requisicoes' as const, icon: <ShoppingCart size={15} />, label: 'Requisicoes', count: detalhe.requisicoes.length, color: '#7C3AED', badge: 0 },
      { id: 'alertas' as const, icon: <AlertOctagon size={15} />, label: 'Alertas', count: detalhe.alertas.length, color: '#DC2626', badge: detalhe.alertas.filter(a => a.status === 'pendente').length },
      { id: 'ocorrencias' as const, icon: <AlertTriangle size={15} />, label: 'Ocorrencias', count: detalhe.ocorrencias.length, color: '#B45309', badge: ocPendentes },
    ]

    return (
      <div style={{ padding: '28px 24px', maxWidth: 1200, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid #F1F5F9' }}>
          <button onClick={voltarLista} style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <ArrowLeft size={16} color="#6B7280" />
          </button>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
            {detalhe.avatar_url ? (
              <img src={detalhe.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <Users size={20} color="#fff" />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: 0 }}>{detalhe.nome}</h1>
            <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>{detalhe.tecnico_nome} · {detalhe.funcao || detalhe.mecanico_role} · {detalhe.gps.kmMes} km · {detalhe.gps.dirigindoMin >= 60 ? `${Math.floor(detalhe.gps.dirigindoMin / 60)}h dirigindo` : `${detalhe.gps.dirigindoMin || 0}min`}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <SyncBadge status={realtimeStatus} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#F0F9FF', borderRadius: 6, padding: '5px 10px' }}>
              <Calendar size={13} color="#2563EB" />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2563EB', textTransform: 'capitalize' }}>{mesLabel(getMesAtual())}</span>
            </div>
          </div>
        </div>

        {/* Perfil */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 20, padding: '14px 0' }}>
          {detalhe.data_entrada && <InfoPill label="Entrada" value={new Date(detalhe.data_entrada).toLocaleDateString('pt-BR')} />}
          {detalhe.funcao && <InfoPill label="Funcao" value={detalhe.funcao} />}
          {detalhe.email && <InfoPill label="Email" value={detalhe.email} />}
          <InfoPill label="KM Rodado" value={`${detalhe.gps.kmMes} km`} />
          <InfoPill label="Dirigindo" value={detalhe.gps.dirigindoMin >= 60 ? `${Math.floor(detalhe.gps.dirigindoMin / 60)}h${detalhe.gps.dirigindoMin % 60 > 0 ? String(detalhe.gps.dirigindoMin % 60).padStart(2, '0') + 'min' : ''}` : `${detalhe.gps.dirigindoMin || 0}min`} color="#059669" />
          <InfoPill label="Parado Fora" value={detalhe.gps.paradoForaMin >= 60 ? `${Math.floor(detalhe.gps.paradoForaMin / 60)}h${detalhe.gps.paradoForaMin % 60 > 0 ? String(detalhe.gps.paradoForaMin % 60).padStart(2, '0') + 'min' : ''}` : `${detalhe.gps.paradoForaMin || 0}min`} color="#D97706" />
          <InfoPill label="Dias GPS" value={`${detalhe.gps.dias} dias`} />
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '1px solid #E5E7EB', overflowX: 'auto' }}>
          {secoes.map(s => {
            const active = secao === s.id
            return (
              <button key={s.id} onClick={() => {
                setSecao(s.id)
                if (s.id === 'relatorio' && detalhe && !relCarregado) {
                  carregarRelatorio(detalhe.tecnico_nome, detalhe.mes || getMesAtual())
                }
              }} style={{
                padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                borderBottom: active ? `2px solid ${s.color}` : '2px solid transparent',
                color: active ? s.color : '#6B7280',
                fontWeight: active ? 700 : 500, fontSize: 13,
                transition: 'all .15s',
              }}>
                {s.icon}
                {s.label}
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                  background: active ? `${s.color}12` : '#F3F4F6',
                  color: active ? s.color : '#9CA3AF',
                }}>{s.count}</span>
                {(s.badge || 0) > 0 && (
                  <span style={{ minWidth: 17, height: 17, borderRadius: 9, background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{s.badge}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Secao: Servicos */}
        {secao === 'servicos' && (
          <div>
            {detalhe.ordens.length === 0 ? (
              <EmptyState text="Nenhuma OS no mes" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {detalhe.ordens.map(o => {
                  const isOpen = expandedOs.has(o.os_num)
                  const temPecas = o.ppvs.some(p => p.produtos.length > 0)
                  const temRelTec = !!o.relatorio_tecnico?.trim()
                  const temDiag = !!o.diagnostico_tecnico?.trim()
                  const relEnviado = o.relatorio_status === 'enviado'
                  const relRascunho = o.relatorio_status === 'rascunho'
                  const semRelatorio = !temRelTec && !relRascunho
                  const diasAtrasoRel = (() => {
                    if (!relEnviado || !o.relatorio_data_envio || !o.data) return 0
                    const dOs = new Date(o.data + 'T00:00:00')
                    const dEnv = new Date(o.relatorio_data_envio.slice(0, 10) + 'T00:00:00')
                    return Math.floor((dEnv.getTime() - dOs.getTime()) / 86400000)
                  })()
                  const diasSemRel = (() => {
                    if (!semRelatorio || !o.data) return 0
                    const dOs = new Date(o.data + 'T00:00:00')
                    const hoje = new Date()
                    hoje.setHours(0, 0, 0, 0)
                    return Math.floor((hoje.getTime() - dOs.getTime()) / 86400000)
                  })()
                  return (
                    <div key={o.os_num} style={{ background: semRelatorio ? '#FFFBEB' : '#fff', border: `1px solid ${isOpen ? '#BFDBFE' : semRelatorio ? '#FDE68A' : '#E5E7EB'}`, borderRadius: 8, overflow: 'hidden', transition: 'border-color .15s' }}>
                      <div onClick={() => toggleOs(o.os_num)} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', gap: 8, userSelect: 'none', flexWrap: 'wrap' }}>
                        <ChevronDown size={14} color="#9CA3AF" style={{ transition: 'transform .15s', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)', flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, color: '#2563EB', fontSize: 13 }}>OS {o.os_num}</span>
                        <span style={{ fontSize: 12, color: '#9CA3AF' }}>{o.data ? o.data.split('-').reverse().join('/') : '-'}</span>
                        {o.cliente && <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{o.cliente}</span>}
                        {!o.cliente && o.cidade && <span style={{ fontSize: 12, color: '#6B7280' }}>{o.cidade}</span>}
                        {o.interno && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#EFF6FF', color: '#2563EB', fontWeight: 600 }}>INT</span>}
                        {!o.faturada && <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: o.status === 'Executada' ? '#FEF3C7' : o.status === 'Faturando' ? '#EEF2FF' : '#F3F4F6', color: o.status === 'Executada' ? '#92400E' : o.status === 'Faturando' ? '#4338CA' : '#6B7280', fontWeight: 600 }}>{o.status}</span>}
                        {relEnviado && diasAtrasoRel <= 1 && (
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#ECFDF5', color: '#059669', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <CheckCircle size={10} /> Rel. {o.relatorio_data_envio ? o.relatorio_data_envio.slice(0, 10).split('-').reverse().join('/') : 'enviado'}
                          </span>
                        )}
                        {relEnviado && diasAtrasoRel > 1 && (
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#FEF3C7', color: '#92400E', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <AlertTriangle size={10} /> Rel. {diasAtrasoRel}d atraso
                          </span>
                        )}
                        {relRascunho && (
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#FEF3C7', color: '#92400E', fontWeight: 600 }}>Rascunho</span>
                        )}
                        {semRelatorio && (
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: '#FEF2F2', color: '#DC2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <XCircle size={10} /> Sem relatorio{diasSemRel > 1 ? ` (${diasSemRel}d)` : ''}
                          </span>
                        )}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 12 }}>
                          <span style={{ color: '#059669', fontWeight: 600 }}>{(parseFloat(o.horas) || 0).toFixed(1)}h</span>
                          <span style={{ color: '#D97706', fontWeight: 600 }}>{(parseFloat(o.km) || 0).toFixed(0)} km</span>
                          <span style={{ color: '#7C3AED', fontWeight: 600 }}>R$ {(parseFloat(o.valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                        {temPecas && <Package size={13} color="#EA580C" style={{ flexShrink: 0 }} />}
                      </div>
                      {isOpen && (
                        <div style={{ borderTop: '1px solid #F3F4F6', padding: '14px' }}>
                          {o.cliente && (
                            <div style={{ marginBottom: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                              <div><span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>CLIENTE: </span><span style={{ fontSize: 13, color: '#111827', fontWeight: 500 }}>{o.cliente}</span></div>
                              {o.cidade_cliente && <div><span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>CIDADE: </span><span style={{ fontSize: 13, color: '#374151' }}>{o.cidade_cliente}</span></div>}
                            </div>
                          )}
                          {o.servico_solicitado?.trim() && (
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 3 }}>Servico Solicitado</div>
                              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{o.servico_solicitado}</div>
                            </div>
                          )}
                          {temDiag && (
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 3 }}>Diagnostico do Tecnico</div>
                              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, background: '#FFFBEB', borderRadius: 6, padding: 10, border: '1px solid #FDE68A' }}>{o.diagnostico_tecnico}</div>
                            </div>
                          )}
                          {temPecas && (
                            <div style={{ marginBottom: 12 }}>
                              {o.ppvs.map(ppv => ppv.produtos.length > 0 && (
                                <div key={ppv.id} style={{ marginBottom: 8 }}>
                                  <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Package size={11} /> {ppv.id}
                                    {ppv.pedido_omie && <span style={{ color: '#2563EB', fontWeight: 600 }}>| Pedido Omie: {ppv.pedido_omie}</span>}
                                    <span style={{ padding: '1px 6px', borderRadius: 4, background: ppv.status === 'Concluída' ? '#ECFDF5' : ppv.status === 'Cancelada' ? '#FEF2F2' : '#FFFBEB', color: ppv.status === 'Concluída' ? '#059669' : ppv.status === 'Cancelada' ? '#DC2626' : '#D97706', fontSize: 10 }}>{ppv.status}</span>
                                  </div>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead>
                                      <tr style={{ background: '#F9FAFB' }}>
                                        <th style={{ ...thStyle, fontSize: 10, padding: '5px 10px' }}>Codigo</th>
                                        <th style={{ ...thStyle, fontSize: 10, padding: '5px 10px' }}>Descricao</th>
                                        <th style={{ ...thStyle, fontSize: 10, padding: '5px 10px', textAlign: 'center' }}>Saida</th>
                                        <th style={{ ...thStyle, fontSize: 10, padding: '5px 10px', textAlign: 'center' }}>Devolvido</th>
                                        <th style={{ ...thStyle, fontSize: 10, padding: '5px 10px', textAlign: 'center' }}>Ficou</th>
                                        <th style={{ ...thStyle, fontSize: 10, padding: '5px 10px', textAlign: 'right' }}>Preco</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {ppv.produtos.map((prod, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                          <td style={{ padding: '5px 10px', color: '#6B7280', fontFamily: 'monospace', fontSize: 11 }}>{prod.codigo}</td>
                                          <td style={{ padding: '5px 10px', color: '#374151', maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prod.descricao}</td>
                                          <td style={{ padding: '5px 10px', textAlign: 'center', fontWeight: 600 }}>{prod.qtd}</td>
                                          <td style={{ padding: '5px 10px', textAlign: 'center', fontWeight: 600, color: prod.devolvido > 0 ? '#DC2626' : '#D1D5DB' }}>{prod.devolvido > 0 ? prod.devolvido : '-'}</td>
                                          <td style={{ padding: '5px 10px', textAlign: 'center', fontWeight: 600, color: '#059669' }}>{prod.qtd - prod.devolvido}</td>
                                          <td style={{ padding: '5px 10px', textAlign: 'right', color: '#6B7280' }}>R$ {prod.preco.toFixed(2)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ))}
                            </div>
                          )}
                          {temRelTec && (
                            <div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                                <FileText size={11} /> Relatorio do Tecnico
                              </div>
                              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, background: '#F0FDF4', borderRadius: 6, padding: 10, border: '1px solid #BBF7D0', whiteSpace: 'pre-wrap' }}>{o.relatorio_tecnico}</div>
                            </div>
                          )}
                          {!temPecas && !temRelTec && !temDiag && !o.servico_solicitado?.trim() && (
                            <div style={{ fontSize: 13, color: '#9CA3AF', textAlign: 'center', padding: 10 }}>Sem detalhes adicionais</div>
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

        {/* Secao: Relatorio Mensal (GPS x OS) */}
        {secao === 'relatorio' && (
          <div>
            {relLoading ? (
              <div style={{ textAlign: 'center', padding: 50, color: '#9CA3AF', fontSize: 13 }}>Carregando dados GPS...</div>
            ) : detalhe.ordens.length === 0 ? (
              <EmptyState text="Nenhuma OS no mes para gerar relatorio" />
            ) : (() => {
              const ordens = detalhe.ordens
              let gpsSomaKm = 0, gpsSomaDirigindo = 0, gpsSomaParado = 0, gpsSomaFora = 0
              const diasUsados = new Set<string>()

              const ordensComGPS = ordens.map(o => {
                const gd = o.data ? relGPS[o.data] : null
                if (gd && o.data && !diasUsados.has(o.data)) {
                  diasUsados.add(o.data)
                  gpsSomaKm += gd.km
                  gpsSomaDirigindo += gd.horasDirigindo
                  gpsSomaParado += gd.horasParado
                  gpsSomaFora += gd.horasFora
                }
                return { ...o, gps: gd }
              })

              const totalHoras = ordens.reduce((s, o) => s + (parseFloat(o.horas) || 0), 0)
              const totalKm = ordens.reduce((s, o) => s + (parseFloat(o.km) || 0), 0)
              const totalValor = ordens.reduce((s, o) => s + (parseFloat(o.valor) || 0), 0)
              const hasGPS = diasUsados.size > 0
              const divKm = hasGPS ? totalKm - gpsSomaKm : 0
              const divHoras = hasGPS ? totalHoras - gpsSomaFora : 0
              const temDivMes = hasGPS && (Math.abs(divKm) > 50 || Math.abs(divHoras) > 5)

              return (
                <div>
                  {/* Resumo divergencia mensal */}
                  {hasGPS && (
                    <div style={{ marginBottom: 16, padding: '14px 18px', borderRadius: 8, background: temDivMes ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${temDivMes ? '#FECACA' : '#BBF7D0'}`, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {temDivMes ? <TrendingDown size={16} color="#DC2626" /> : <CheckCircle size={16} color="#059669" />}
                        <span style={{ fontSize: 13, fontWeight: 700, color: temDivMes ? '#991B1B' : '#065F46' }}>
                          {temDivMes ? 'Divergencia mensal detectada' : 'Sem divergencia mensal'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                        <span style={{ color: Math.abs(divKm) > 50 ? '#DC2626' : '#059669', fontWeight: 700 }}>KM: {divKm >= 0 ? '+' : ''}{divKm.toFixed(0)} km</span>
                        <span style={{ color: Math.abs(divHoras) > 5 ? '#DC2626' : '#059669', fontWeight: 700 }}>Horas: {divHoras >= 0 ? '+' : ''}{divHoras.toFixed(1)}h</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#6B7280', marginLeft: 'auto' }}>{diasUsados.size} dias GPS</div>
                    </div>
                  )}

                  {/* Tabela OS x GPS */}
                  <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#F9FAFB' }}>
                          <th style={thStyle}>OS</th>
                          <th style={thStyle}>Data</th>
                          <th style={thStyle}>Cliente</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Horas</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>KM</th>
                          <th style={{ ...thStyle, textAlign: 'right' }}>Valor</th>
                          <th style={{ ...thStyle, textAlign: 'right', color: '#0891B2' }}>GPS KM</th>
                          <th style={{ ...thStyle, textAlign: 'right', color: '#0891B2' }}>GPS Fora</th>
                          <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ordensComGPS.map(o => {
                          const gd = o.gps
                          const osKm = parseFloat(o.km) || 0
                          const osH = parseFloat(o.horas) || 0
                          const divK = gd ? osKm - gd.km : 0
                          const divH = gd ? osH - gd.horasFora : 0
                          const temDiv = gd && (Math.abs(divK) > 20 || Math.abs(divH) > 2)
                          const isOpen = relOrdemAberta === o.os_num
                          return (
                            <React.Fragment key={o.os_num}>
                              <tr onClick={() => setRelOrdemAberta(isOpen ? null : o.os_num)} style={{ cursor: 'pointer', background: isOpen ? '#F0F9FF' : 'transparent', transition: 'background .1s' }}>
                                <td style={{ ...tdStyle, fontWeight: 700, color: '#2563EB', whiteSpace: 'nowrap' }}>
                                  {o.os_num}
                                  {o.interno && <span style={{ marginLeft: 4, fontSize: 9, padding: '1px 4px', borderRadius: 3, background: '#EFF6FF', color: '#2563EB' }}>INT</span>}
                                </td>
                                <td style={{ ...tdStyle, color: '#6B7280', whiteSpace: 'nowrap', fontSize: 12 }}>{o.data ? o.data.split('-').reverse().join('/') : '-'}</td>
                                <td style={{ ...tdStyle, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.cliente || o.cidade || '-'}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#059669' }}>{osH.toFixed(1)}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#D97706' }}>{osKm.toFixed(0)}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#7C3AED' }}>{(parseFloat(o.valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#0891B2' }}>{gd ? gd.km.toFixed(0) : '-'}</td>
                                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, fontFamily: 'monospace', color: '#0891B2' }}>{gd ? gd.horasFora.toFixed(1) + 'h' : '-'}</td>
                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                  {gd ? (
                                    temDiv ? <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#FEF2F2', color: '#DC2626', fontWeight: 700 }}>DIVERGE</span>
                                    : <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: '#F0FDF4', color: '#059669', fontWeight: 700 }}>OK</span>
                                  ) : <span style={{ fontSize: 10, color: '#D1D5DB' }}>-</span>}
                                </td>
                              </tr>
                              {isOpen && gd && (
                                <tr><td colSpan={9} style={{ padding: 0, borderBottom: '1px solid #E5E7EB' }}>
                                  <div style={{ padding: '14px 18px', background: '#F9FAFB' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
                                      <MiniStat label="Dirigindo" value={`${gd.horasDirigindo.toFixed(1)}h`} color="#0891B2" />
                                      <MiniStat label="Parado Cliente" value={`${gd.horasParado.toFixed(1)}h`} color="#7C3AED" />
                                      <MiniStat label="KM GPS" value={`${gd.km.toFixed(0)}`} color="#EA580C" />
                                      <MiniStat label="Fora da Loja" value={`${gd.horasFora.toFixed(1)}h`} color="#374151" />
                                      {gd.placa && <MiniStat label="Placa" value={gd.placa} color="#374151" />}
                                    </div>
                                    <div style={{ padding: '10px 14px', borderRadius: 6, background: temDiv ? '#FEF2F2' : '#F0FDF4', border: `1px solid ${temDiv ? '#FECACA' : '#BBF7D0'}` }}>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: temDiv ? '#991B1B' : '#065F46', marginBottom: 6 }}>{temDiv ? 'Divergencia encontrada' : 'Valores compativeis'}</div>
                                      <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
                                        <span style={{ color: Math.abs(divK) > 20 ? '#DC2626' : '#059669' }}>KM: {osKm.toFixed(0)} vs {gd.km.toFixed(0)} ({divK >= 0 ? '+' : ''}{divK.toFixed(0)})</span>
                                        <span style={{ color: Math.abs(divH) > 2 ? '#DC2626' : '#059669' }}>Horas: {osH.toFixed(1)} vs {gd.horasFora.toFixed(1)} ({divH >= 0 ? '+' : ''}{divH.toFixed(1)}h)</span>
                                      </div>
                                    </div>
                                  </div>
                                </td></tr>
                              )}
                            </React.Fragment>
                          )
                        })}
                        {/* Total Tecnico */}
                        <tr style={{ background: '#F9FAFB' }}>
                          <td colSpan={3} style={{ ...tdStyle, fontWeight: 700 }}>Total ({ordens.length} OS)</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#059669' }}>{totalHoras.toFixed(1)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#D97706' }}>{totalKm.toFixed(0)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#7C3AED' }}>{totalValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#0891B2' }}>{hasGPS ? gpsSomaKm.toFixed(0) : '-'}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: '#0891B2' }}>{hasGPS ? gpsSomaFora.toFixed(1) + 'h' : '-'}</td>
                          <td />
                        </tr>
                        {hasGPS && (
                          <tr style={{ background: temDivMes ? '#FEF2F2' : '#F0FDF4' }}>
                            <td colSpan={3} style={{ ...tdStyle, fontWeight: 700, color: temDivMes ? '#991B1B' : '#065F46' }}>{temDivMes ? 'DIVERGENCIA MENSAL' : 'SEM DIVERGENCIA'}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: Math.abs(divHoras) > 5 ? '#DC2626' : '#059669' }}>{divHoras >= 0 ? '+' : ''}{divHoras.toFixed(1)}h</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', color: Math.abs(divKm) > 50 ? '#DC2626' : '#059669' }}>{divKm >= 0 ? '+' : ''}{divKm.toFixed(0)}</td>
                            <td colSpan={4} />
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {!hasGPS && (
                    <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 6, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 12, color: '#92400E' }}>
                      Sem dados GPS disponiveis para comparacao neste mes. Verifique se o GPS esta ativo para este tecnico.
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Secao: Requisicoes */}
        {secao === 'requisicoes' && (
          <div>
            {detalhe.requisicoes.length === 0 ? (
              <EmptyState text="Nenhuma requisicao encontrada" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {detalhe.requisicoes.map(r => {
                  const statusColor = r.status.includes('Cancelad') ? '#991B1B' : r.status.includes('Fechado') || r.status.includes('Conclu') ? '#059669' : '#D97706'
                  const statusBg = r.status.includes('Cancelad') ? '#FEF2F2' : r.status.includes('Fechado') || r.status.includes('Conclu') ? '#ECFDF5' : '#FFFBEB'
                  return (
                    <div key={r.id_pedido} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, color: '#7C3AED', fontSize: 13 }}>{r.id_pedido}</span>
                      {r.Id_Os && <span style={{ fontSize: 12, color: '#2563EB', fontWeight: 500 }}>{r.Id_Os}</span>}
                      <span style={{ fontSize: 12, color: '#9CA3AF' }}>{r.data || '-'}</span>
                      <span style={{ padding: '1px 8px', borderRadius: 4, background: statusBg, color: statusColor, fontSize: 10, fontWeight: 600 }}>{r.status}</span>
                      {r.pedido_omie && <span style={{ fontSize: 11, color: '#9CA3AF' }}>Omie: {r.pedido_omie}</span>}
                      <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#111827', fontSize: 13 }}>R$ {(r.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
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
              <EmptyState text="Nenhum alerta no mes" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detalhe.alertas.map(a => {
                  const isAtraso = a.tipo === 'atraso_relatorio'
                  const isAtrasoEntrega = a.tipo === 'atraso_entrega_relatorio'
                  const isDivKm = a.tipo === 'divergencia_km'
                  const isPendente = a.status === 'pendente'
                  const isExpanded = expandedAlerta === a.id
                  const statusLabel = a.status === 'justificada' ? 'Justificada' : a.status === 'ocorrencia' ? 'Virou Ocorrencia' : 'Pendente'
                  const statusBg = a.status === 'justificada' ? '#ECFDF5' : a.status === 'ocorrencia' ? '#EFF6FF' : '#FFFBEB'
                  const statusColor = a.status === 'justificada' ? '#059669' : a.status === 'ocorrencia' ? '#2563EB' : '#D97706'
                  const tipoBg = isAtraso ? '#FEF2F2' : isAtrasoEntrega ? '#FFFBEB' : '#FEF2F2'
                  const tipoColor = isAtraso ? '#DC2626' : isAtrasoEntrega ? '#D97706' : '#DC2626'
                  const tipoLabel = isAtraso ? 'Sem Relatorio' : isAtrasoEntrega ? 'Entrega Atrasada' : 'Divergencia KM'
                  const ord = a.ordem
                  return (
                    <div key={a.id} style={{ background: '#fff', border: `1px solid ${isPendente ? (isAtraso ? '#FECACA' : '#FDE68A') : '#E5E7EB'}`, borderRadius: 8, overflow: 'hidden', opacity: isPendente ? 1 : 0.7, transition: 'all .15s' }}>
                      <div onClick={() => setExpandedAlerta(isExpanded ? null : a.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', cursor: 'pointer', flexWrap: 'wrap', userSelect: 'none' }}>
                        <ChevronDown size={13} color="#9CA3AF" style={{ transition: 'transform .15s', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', flexShrink: 0 }} />
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: tipoBg, color: tipoColor }}>
                          {tipoLabel}
                        </span>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: statusBg, color: statusColor }}>{statusLabel}</span>
                        {a.carryover && <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: '#7C3AED', color: '#fff' }}>MES ANTERIOR</span>}
                        {ord && <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 600 }}>OS {ord.os_num}</span>}
                        {ord?.cliente && <span style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>{ord.cliente}</span>}
                        <span style={{ fontSize: 12, fontWeight: 500, color: '#9CA3AF', flex: 1, textAlign: 'right' }}>{a.data_referencia ? a.data_referencia.split('-').reverse().join('/') : ''}</span>
                      </div>
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid #F3F4F6', padding: 14 }}>
                          <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 6, background: isDivKm ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${isDivKm ? '#FECACA' : '#FDE68A'}` }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 3 }}>{a.descricao}</div>
                            {a.detalhes && <div style={{ fontSize: 12, color: '#6B7280' }}>{a.detalhes}</div>}
                          </div>
                          {ord && (
                            <div style={{ marginBottom: 14, border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
                              <div style={{ padding: '8px 12px', background: '#F9FAFB', borderBottom: '1px solid #F3F4F6', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Wrench size={13} color="#2563EB" />
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#2563EB' }}>OS {ord.os_num}</span>
                                <span style={{ fontSize: 11, color: '#9CA3AF' }}>{ord.data ? ord.data.split('-').reverse().join('/') : '-'}</span>
                                <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, background: ord.faturada ? '#ECFDF5' : '#FFFBEB', color: ord.faturada ? '#059669' : '#D97706' }}>
                                  {ord.faturada ? 'Faturada' : ord.status}
                                </span>
                              </div>
                              <div style={{ padding: 12 }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: ord.cliente ? 12 : 0 }}>
                                  {ord.cliente && <div style={{ gridColumn: 'span 2' }}><div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>Cliente</div><div style={{ fontSize: 12, color: '#111827', fontWeight: 600, marginTop: 1 }}>{ord.cliente}</div></div>}
                                  {ord.cidade_cliente && <div><div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>Cidade</div><div style={{ fontSize: 12, color: '#374151', fontWeight: 500, marginTop: 1 }}>{ord.cidade_cliente}</div></div>}
                                  <div><div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>Horas</div><div style={{ fontSize: 12, color: '#059669', fontWeight: 600, marginTop: 1 }}>{(parseFloat(ord.horas) || 0).toFixed(1)}h</div></div>
                                  <div><div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>KM</div><div style={{ fontSize: 12, color: '#D97706', fontWeight: 600, marginTop: 1 }}>{(parseFloat(ord.km) || 0).toFixed(0)} km</div></div>
                                  <div><div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>Valor</div><div style={{ fontSize: 12, color: '#7C3AED', fontWeight: 600, marginTop: 1 }}>R$ {(parseFloat(ord.valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div></div>
                                </div>
                                {ord.servico_solicitado?.trim() && <div style={{ marginTop: 10 }}><div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', marginBottom: 3 }}>Servico Solicitado</div><div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5 }}>{ord.servico_solicitado}</div></div>}
                                {ord.diagnostico_tecnico?.trim() && <div style={{ marginTop: 10 }}><div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', marginBottom: 3 }}>Diagnostico</div><div style={{ fontSize: 12, color: '#374151', lineHeight: 1.5, background: '#FFFBEB', borderRadius: 6, padding: 8, border: '1px solid #FDE68A' }}>{ord.diagnostico_tecnico}</div></div>}
                                {ord.relatorio_tecnico?.trim() && <div style={{ marginTop: 10 }}><div style={{ fontSize: 10, fontWeight: 600, color: '#059669', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}><FileText size={10} /> Relatorio do Tecnico</div><div style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, background: '#F0FDF4', borderRadius: 6, padding: 8, border: '1px solid #BBF7D0', whiteSpace: 'pre-wrap' }}>{ord.relatorio_tecnico}</div></div>}
                                {ord.ppvs?.some(p => p.produtos.length > 0) && (
                                  <div style={{ marginTop: 10 }}>
                                    {ord.ppvs.filter(p => p.produtos.length > 0).map(ppv => (
                                      <div key={ppv.id}>
                                        <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                                          <Package size={10} /> PPV {ppv.id}
                                          {ppv.pedido_omie && <span style={{ color: '#2563EB' }}>| Omie: {ppv.pedido_omie}</span>}
                                          <span style={{ padding: '1px 5px', borderRadius: 3, background: ppv.status === 'Concluída' ? '#ECFDF5' : '#FFFBEB', color: ppv.status === 'Concluída' ? '#059669' : '#D97706', fontSize: 9 }}>{ppv.status}</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                          {ppv.produtos.map((prod, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 6px', background: '#F9FAFB', borderRadius: 4, fontSize: 11 }}>
                                              <span style={{ fontFamily: 'monospace', color: '#6B7280', minWidth: 60 }}>{prod.codigo}</span>
                                              <span style={{ flex: 1, color: '#374151' }}>{prod.descricao}</span>
                                              <span style={{ fontWeight: 600, color: '#111827' }}>{prod.qtd - prod.devolvido}x</span>
                                              <span style={{ color: '#6B7280' }}>R$ {prod.preco.toFixed(2)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 12 }}>
                            {a.data_referencia && <div><div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>Data Referencia</div><div style={{ fontSize: 12, color: '#111827', fontWeight: 500, marginTop: 1 }}>{a.data_referencia.split('-').reverse().join('/')}</div></div>}
                            {a.created_at && <div><div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>Detectado em</div><div style={{ fontSize: 12, color: '#111827', fontWeight: 500, marginTop: 1 }}>{new Date(a.created_at).toLocaleString('pt-BR')}</div></div>}
                            {a.carryover && <div><div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>Origem</div><div style={{ fontSize: 12, color: '#7C3AED', fontWeight: 600, marginTop: 1 }}>Mes anterior</div></div>}
                          </div>
                          {a.admin_comentario && (
                            <div style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', marginBottom: 3 }}>Resolucao</div>
                              <div style={{ fontSize: 12, color: '#059669', background: '#F0FDF4', borderRadius: 6, padding: 8, border: '1px solid #BBF7D0' }}>
                                <strong>{a.admin_nome || 'Admin'}:</strong> {a.admin_comentario}
                                {a.resolvido_em && <span style={{ display: 'block', fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>Resolvido em {new Date(a.resolvido_em).toLocaleString('pt-BR')}</span>}
                              </div>
                            </div>
                          )}
                          {isPendente && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={(e) => { e.stopPropagation(); const motivo = prompt('Motivo da justificativa:'); if (motivo !== null) justificarAlerta(a.id, motivo) }} style={btnOutline('#059669')}>
                                <CheckCircle size={12} /> Justificar
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); alertaParaOcorrencia(a.id) }} style={btnOutline('#DC2626')}>
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
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <button onClick={() => setShowNovaOcorrencia(!showNovaOcorrencia)} style={{
                padding: '7px 14px', borderRadius: 6, border: 'none', background: '#2563EB', color: '#fff',
                fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5
              }}>
                <Plus size={13} /> Nova Ocorrencia
              </button>
            </div>
            {showNovaOcorrencia && (
              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: 16, marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                  <select value={novaOc.tipo} onChange={e => setNovaOc({ ...novaOc, tipo: e.target.value })} style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12 }}>
                    {Object.entries(TIPO_CORES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <input value={novaOc.titulo} onChange={e => setNovaOc({ ...novaOc, titulo: e.target.value })} placeholder="Titulo da ocorrencia" style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12 }} />
                </div>
                <textarea value={novaOc.descricao} onChange={e => setNovaOc({ ...novaOc, descricao: e.target.value })} placeholder="Descricao (opcional)" rows={3} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 12, resize: 'vertical', boxSizing: 'border-box' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 10 }}>
                  <button onClick={() => setShowNovaOcorrencia(false)} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
                  <button onClick={criarOcorrencia} disabled={salvando || !novaOc.titulo.trim()} style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: '#2563EB', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: salvando ? 0.6 : 1 }}>
                    {salvando ? 'Salvando...' : 'Criar'}
                  </button>
                </div>
              </div>
            )}
            {detalhe.ocorrencias.length === 0 ? (
              <EmptyState text="Nenhuma ocorrencia registrada" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {detalhe.ocorrencias.map(oc => {
                  const tipo = TIPO_CORES[oc.tipo] || TIPO_CORES.geral
                  const statusLabel = oc.pontos === 2 ? 'justificada' : oc.pontos === 1 ? 'resolvida' : oc.pontos === -1 ? 'cancelada' : 'pendente'
                  const stColors: Record<string, { bg: string; text: string }> = {
                    pendente: { bg: '#FFFBEB', text: '#D97706' },
                    resolvida: { bg: '#ECFDF5', text: '#059669' },
                    cancelada: { bg: '#F3F4F6', text: '#6B7280' },
                    justificada: { bg: '#EFF6FF', text: '#2563EB' },
                  }
                  const st = stColors[statusLabel] || stColors.pendente
                  return (
                    <div key={oc.id} style={{ background: statusLabel === 'justificada' ? '#FAFBFC' : '#fff', border: '1px solid #E5E7EB', borderRadius: 8, padding: 14, opacity: statusLabel === 'justificada' ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, background: tipo.bg, color: tipo.text, fontSize: 10, fontWeight: 600 }}>{tipo.label}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 4, background: st.bg, color: st.text, fontSize: 10, fontWeight: 600 }}>{statusLabel === 'justificada' ? 'justificada (fora da ficha)' : statusLabel}</span>
                        <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' }}>{new Date(oc.created_at).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#111827', marginBottom: 3 }}>{oc.descricao}</div>
                      {statusLabel === 'pendente' && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button onClick={() => atualizarOcorrencia(oc.id, 'resolvida')} style={btnOutline('#059669')}><CheckCircle size={11} /> Resolver</button>
                          <button onClick={() => { const motivo = prompt('Justificativa (sai da ficha do tecnico):'); if (motivo !== null) atualizarOcorrencia(oc.id, 'justificada') }} style={btnOutline('#2563EB')}><FileText size={11} /> Justificar</button>
                          <button onClick={() => atualizarOcorrencia(oc.id, 'cancelada')} style={btnOutline('#6B7280')}><XCircle size={11} /> Cancelar</button>
                        </div>
                      )}
                      {statusLabel === 'resolvida' && (
                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                          <button onClick={() => { const motivo = prompt('Justificativa (sai da ficha do tecnico):'); if (motivo !== null) atualizarOcorrencia(oc.id, 'justificada') }} style={btnOutline('#2563EB')}><FileText size={11} /> Justificar (tirar da ficha)</button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Meses anteriores */}
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#9CA3AF', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={13} /> Meses Anteriores
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {getMesesAnteriores().map(mes => {
              const isExpanded = mesExpandido === mes
              const dados = mesesAnteriores[mes]
              const isLoading = dados === 'loading'
              const mesData = (dados && dados !== 'loading') ? dados as MecanicoDetalhe : null
              return (
                <div key={mes} style={{ background: '#fff', border: `1px solid ${isExpanded ? '#BFDBFE' : '#E5E7EB'}`, borderRadius: 8, overflow: 'hidden', transition: 'border-color .15s' }}>
                  <div onClick={() => carregarMesAnterior(detalhe.tecnico_nome, mes)} style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}>
                    <ChevronDown size={14} color="#9CA3AF" style={{ transition: 'transform .15s', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', marginRight: 8, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', textTransform: 'capitalize', flex: 1 }}>{mesLabel(mes)}</span>
                    {isLoading && <span style={{ fontSize: 12, color: '#9CA3AF' }}>Carregando...</span>}
                    {mesData && (
                      <div style={{ display: 'flex', gap: 10, fontSize: 11, fontWeight: 600 }}>
                        <span style={{ color: '#2563EB' }}>{mesData.ordens.length} OS</span>
                        <span style={{ color: '#7C3AED' }}>{mesData.requisicoes.length} Req</span>
                        <span style={{ color: '#DC2626' }}>{mesData.alertas.length} Alertas</span>
                        <span style={{ color: '#D97706' }}>{mesData.ocorrencias.length} Oc</span>
                      </div>
                    )}
                  </div>
                  {isExpanded && mesData && (
                    <div style={{ borderTop: '1px solid #F3F4F6', padding: '14px 16px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
                        <MiniCard label="Ordens" value={mesData.ordens.length} bg="#EFF6FF" color="#2563EB" />
                        <MiniCard label="Requisicoes" value={mesData.requisicoes.length} bg="#F5F3FF" color="#7C3AED" />
                        <MiniCard label="Alertas" value={mesData.alertas.length} bg="#FEF2F2" color="#DC2626" />
                        <MiniCard label="Ocorrencias" value={mesData.ocorrencias.length} bg="#FFFBEB" color="#D97706" />
                      </div>
                      <div style={{ display: 'flex', gap: 14, marginBottom: 14, fontSize: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, color: '#2563EB' }}>{mesData.gps.kmMes} km</span>
                        <span style={{ fontWeight: 600, color: '#059669' }}>{mesData.gps.dirigindoMin >= 60 ? `${Math.floor(mesData.gps.dirigindoMin / 60)}h dirigindo` : `${mesData.gps.dirigindoMin || 0}min dirigindo`}</span>
                        <span style={{ fontWeight: 600, color: '#D97706' }}>{mesData.gps.paradoForaMin >= 60 ? `${Math.floor(mesData.gps.paradoForaMin / 60)}h parado fora` : `${mesData.gps.paradoForaMin || 0}min parado fora`}</span>
                        <span style={{ color: '#9CA3AF' }}>{mesData.gps.dias} dias</span>
                      </div>
                      {mesData.ordens.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#2563EB', marginBottom: 4, textTransform: 'uppercase' }}>Ordens de Servico ({mesData.ordens.length})</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {mesData.ordens.map(o => (
                              <div key={o.os_num} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#F9FAFB', borderRadius: 6, fontSize: 12, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600, color: '#2563EB', minWidth: 55 }}>OS {o.os_num}</span>
                                <span style={{ color: '#374151', flex: 1 }}>{o.cliente || o.cidade || '-'}</span>
                                <span style={{ color: '#059669', fontWeight: 600 }}>{(parseFloat(o.horas) || 0).toFixed(1)}h</span>
                                <span style={{ color: '#D97706', fontWeight: 600 }}>{(parseFloat(o.km) || 0).toFixed(0)} km</span>
                                <span style={{ color: '#7C3AED', fontWeight: 600 }}>R$ {(parseFloat(o.valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {mesData.alertas.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#DC2626', marginBottom: 4, textTransform: 'uppercase' }}>Alertas ({mesData.alertas.length}) {mesData.alertas.filter((a: any) => a.status === 'pendente').length > 0 && <span style={{ color: '#D97706' }}>· {mesData.alertas.filter((a: any) => a.status === 'pendente').length} pendentes</span>}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {mesData.alertas.map((a: any) => (
                              <div key={a.id} style={{ background: a.status === 'pendente' ? '#FEF2F2' : '#FAFBFC', border: `1px solid ${a.status === 'pendente' ? '#FECACA' : '#E5E7EB'}`, borderRadius: 6, padding: '8px 12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                                  <span style={{ padding: '1px 6px', borderRadius: 3, background: a.tipo === 'atraso_relatorio' ? '#FFFBEB' : '#FEF2F2', color: a.tipo === 'atraso_relatorio' ? '#D97706' : '#DC2626', fontSize: 10, fontWeight: 600 }}>{a.tipo === 'atraso_relatorio' ? 'Atraso' : 'Div. KM'}</span>
                                  {a.ordem && <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 600 }}>OS {a.ordem.os_num}</span>}
                                  {a.ordem?.cliente && <span style={{ fontSize: 11, color: '#374151', fontWeight: 500 }}>{a.ordem.cliente}</span>}
                                  <span style={{ color: '#9CA3AF', flex: 1, fontSize: 11 }}>{a.descricao}</span>
                                  <span style={{ padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600, background: a.status === 'justificada' ? '#ECFDF5' : a.status === 'ocorrencia' ? '#EFF6FF' : '#FFFBEB', color: a.status === 'justificada' ? '#059669' : a.status === 'ocorrencia' ? '#2563EB' : '#D97706' }}>{a.status}</span>
                                </div>
                                {a.ordem && (
                                  <div style={{ display: 'flex', gap: 10, fontSize: 11, marginBottom: 6, padding: '4px 8px', background: '#fff', borderRadius: 4, border: '1px solid #F3F4F6' }}>
                                    {a.ordem.cidade_cliente && <span style={{ color: '#374151' }}>{a.ordem.cidade_cliente}</span>}
                                    <span style={{ color: '#059669', fontWeight: 600 }}>{(parseFloat(a.ordem.horas) || 0).toFixed(1)}h</span>
                                    <span style={{ color: '#D97706', fontWeight: 600 }}>{(parseFloat(a.ordem.km) || 0).toFixed(0)} km</span>
                                    <span style={{ color: '#7C3AED', fontWeight: 600 }}>R$ {(parseFloat(a.ordem.valor) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    <span style={{ padding: '1px 5px', borderRadius: 3, background: a.ordem.faturada ? '#ECFDF5' : '#FFFBEB', color: a.ordem.faturada ? '#059669' : '#D97706', fontSize: 10, fontWeight: 600 }}>{a.ordem.faturada ? 'Faturada' : a.ordem.status}</span>
                                    {a.ordem.relatorio_tecnico ? <span style={{ color: '#059669', fontWeight: 500 }}>Com relatorio</span> : <span style={{ color: '#DC2626', fontWeight: 500 }}>Sem relatorio</span>}
                                  </div>
                                )}
                                {a.admin_comentario && (
                                  <div style={{ fontSize: 11, color: '#059669', background: '#F0FDF4', borderRadius: 4, padding: '4px 8px', marginBottom: 4 }}>
                                    <strong>{a.admin_nome || 'Admin'}:</strong> {a.admin_comentario}
                                  </div>
                                )}
                                {a.status === 'pendente' && (
                                  <div style={{ display: 'flex', gap: 6 }}>
                                    <button onClick={() => { const motivo = prompt('Motivo da justificativa:'); if (motivo !== null) justificarAlertaMesAnterior(a.id, motivo, mes) }} style={btnOutline('#059669', true)}><CheckCircle size={11} /> Justificar</button>
                                    <button onClick={() => alertaParaOcorrenciaMesAnterior(a.id, mes)} style={btnOutline('#DC2626', true)}><AlertTriangle size={11} /> Virar Ocorrencia</button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {mesData.ocorrencias.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#D97706', marginBottom: 4, textTransform: 'uppercase' }}>Ocorrencias ({mesData.ocorrencias.length})</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {mesData.ocorrencias.map((oc: any) => (
                              <div key={oc.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#FFFBEB', borderRadius: 6, fontSize: 12, flexWrap: 'wrap' }}>
                                <span style={{ padding: '1px 6px', borderRadius: 3, background: '#FEF3C7', color: '#D97706', fontSize: 10, fontWeight: 600 }}>{oc.tipo}</span>
                                <span style={{ color: '#374151', flex: 1 }}>{oc.descricao}</span>
                                <span style={{ fontSize: 11, color: '#9CA3AF' }}>{oc.data_referencia ? oc.data_referencia.split('-').reverse().join('/') : ''}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {mesData.requisicoes.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#7C3AED', marginBottom: 4, textTransform: 'uppercase' }}>Requisicoes ({mesData.requisicoes.length})</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {mesData.requisicoes.map((r: any) => (
                              <div key={r.id_pedido} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#F5F3FF', borderRadius: 6, fontSize: 12, flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600, color: '#7C3AED' }}>{r.id_pedido}</span>
                                {r.Id_Os && <span style={{ fontSize: 11, color: '#2563EB' }}>{r.Id_Os}</span>}
                                <span style={{ flex: 1 }} />
                                <span style={{ fontWeight: 600, color: '#111827' }}>R$ {(r.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {mesData.ordens.length === 0 && mesData.requisicoes.length === 0 && mesData.alertas.length === 0 && mesData.ocorrencias.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 16, color: '#9CA3AF', fontSize: 12 }}>Nenhum registro neste mes</div>
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
    <div style={{ padding: '28px 24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Users size={18} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: '#111827', margin: 0 }}>Janela Mecanicos</h1>
          <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>Tecnicos, ocorrencias e desempenho</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <SyncBadge status={realtimeStatus} />
          {lastSync && (
            <span style={{ fontSize: 10, color: '#9CA3AF' }}>
              {lastSync.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Resumo Geral */}
      {!loading && resumoGeral && (() => {
        const r = resumoGeral
        const fmtBRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
        const saldo = r.receitaTotal - r.despesaTotal
        return (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10, marginBottom: 14 }}>
              <div style={{ background: '#fff', borderRadius: 8, padding: '14px 16px', border: '1px solid #E5E7EB', borderLeft: '3px solid #059669' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#6B7280' }}>Receita Oficina</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#059669', marginTop: 2 }}>{fmtBRL(r.receitaTotal)}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{r.qtdOS} OS + {r.qtdPV} PV</div>
              </div>
              <div style={{ background: '#fff', borderRadius: 8, padding: '14px 16px', border: '1px solid #E5E7EB', borderLeft: '3px solid #DC2626' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#6B7280' }}>Despesa Total</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#DC2626', marginTop: 2 }}>{fmtBRL(r.despesaTotal)}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Operacional + RH</div>
              </div>
              <div style={{ background: '#fff', borderRadius: 8, padding: '14px 16px', border: '1px solid #E5E7EB', borderLeft: `3px solid ${saldo >= 0 ? '#0891B2' : '#D97706'}` }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: '#6B7280' }}>Saldo Oficina</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: saldo >= 0 ? '#0891B2' : '#D97706', marginTop: 2 }}>{fmtBRL(saldo)}</div>
                <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Receita - Despesa</div>
              </div>
            </div>

            {r.ranking.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #F3F4F6' }}>
                  <Trophy size={14} color="#D97706" />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Ranking Faturamento OS</span>
                </div>
                {r.ranking.map((rk, i) => {
                  const maxVal = r.ranking[0]?.valor || 1
                  const pct = (rk.valor / maxVal) * 100
                  return (
                    <div key={i} style={{ padding: '7px 14px', borderTop: i > 0 ? '1px solid #F9FAFB' : 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: i < 3 ? '#D97706' : '#D1D5DB', minWidth: 20 }}>{i + 1}o</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 500, color: '#374151' }}>{rk.nome}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{fmtBRL(rk.valor)}</span>
                        </div>
                        <div style={{ height: 4, borderRadius: 2, background: '#F3F4F6', overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 2, background: i < 3 ? '#2563EB' : '#D1D5DB', width: `${pct}%`, transition: 'width .3s' }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 10, color: '#9CA3AF', minWidth: 30, textAlign: 'right' }}>{rk.qtd} OS</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF', fontSize: 13 }}>Carregando...</div>
      ) : mecanicos.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF' }}>
          <p style={{ fontSize: 14, marginBottom: 6 }}>Nenhum mecanico cadastrado</p>
          <p style={{ fontSize: 12 }}>Configure os mecanicos em Admin {'->'} Permissoes com role &quot;tecnico&quot;</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {mecanicos.map(m => {
            const initials = m.nome.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
            const pendentes = m.alertas_pendentes + m.ocorrencias_pendentes
            return (
              <div key={m.id} onClick={() => abrirMecanico(m.tecnico_nome)} style={{
                display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8,
                padding: '12px 14px', transition: 'all .15s', position: 'relative',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#BFDBFE'; e.currentTarget.style.boxShadow = '0 1px 6px rgba(37,99,235,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = 'none' }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                  background: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{initials}</span>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome}</div>
                  <div style={{ display: 'flex', gap: 8, fontSize: 11, color: '#6B7280', marginTop: 2 }}>
                    <span style={{ fontWeight: 600, color: '#2563EB' }}>{m.stats.total} OS</span>
                    <span>{m.stats.horas.toFixed(0)}h</span>
                    <span>{m.stats.km.toFixed(0)} km</span>
                  </div>
                </div>
                {pendentes > 0 && (
                  <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: '#EF4444', color: '#fff', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', flexShrink: 0 }}>
                    {pendentes}
                  </span>
                )}
                <ChevronRight size={14} color="#D1D5DB" style={{ flexShrink: 0 }} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Helper Components ──

function SyncBadge({ status }: { status: string }) {
  const connected = status === 'connected'
  const connecting = status === 'connecting'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, background: connected ? '#F0FDF4' : connecting ? '#FFFBEB' : '#FEF2F2', border: `1px solid ${connected ? '#BBF7D0' : connecting ? '#FDE68A' : '#FECACA'}` }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#059669' : connecting ? '#D97706' : '#DC2626' }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: connected ? '#059669' : connecting ? '#D97706' : '#DC2626' }}>
        {connected ? 'SYNC' : connecting ? '...' : 'OFF'}
      </span>
    </div>
  )
}

function InfoPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ fontSize: 13, color: color || '#111827', fontWeight: 600, marginTop: 1 }}>{value}</div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ textAlign: 'center', padding: 36, color: '#9CA3AF', fontSize: 13, background: '#FAFBFC', border: '1px solid #F3F4F6', borderRadius: 8 }}>{text}</div>
  )
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#9CA3AF' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color, marginTop: 1 }}>{value}</div>
    </div>
  )
}

function MiniCard({ label, value, bg, color }: { label: string; value: number; bg: string; color: string }) {
  return (
    <div style={{ background: bg, borderRadius: 6, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: `${color}80`, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  )
}

function btnOutline(color: string, small?: boolean): React.CSSProperties {
  return {
    padding: small ? '4px 10px' : '5px 12px',
    borderRadius: 5,
    border: `1px solid ${color}40`,
    background: `${color}08`,
    color,
    fontSize: small ? 11 : 12,
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  }
}

const thStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#6B7280', textAlign: 'left', padding: '8px 12px', borderBottom: '1px solid #E5E7EB' }
const tdStyle: React.CSSProperties = { fontSize: 13, padding: '8px 12px', color: '#374151', borderBottom: '1px solid #F3F4F6' }
