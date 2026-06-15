'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useRouter } from 'next/navigation'
import SemPermissao from '@/components/SemPermissao'
import { supabase } from '@/lib/supabase'
import {
  ChevronLeft, ChevronRight, Plus, X, Trash2, Search,
  CheckCircle, XCircle, Package, Bell, User, Calendar, Wrench,
  Ban, Sun, LogOut, Warehouse, Settings, UserPlus
} from 'lucide-react'

interface LousaEntry {
  id: string
  data: string
  cliente_cnpj: string | null
  cliente_nome: string
  descricao: string | null
  criado_por_id: string
  criado_por_nome: string
  cor: string
  created_at: string
  tecnico_nome: string | null
  periodo: string | null
  tipo?: string | null
  tecnico_acompanhante?: string | null
  temOsAberta?: boolean
  ordensAbertas?: { id_ordem: string; status: string }[]
  temPedidoPPV?: boolean
}

type TipoMarca = 'servico' | 'faltou' | 'feriado' | 'oficina' | 'saida'
const TIPO_CONFIG: Record<TipoMarca, { label: string; cor: string; bg: string; icon: typeof Wrench }> = {
  servico: { label: 'Serviço', cor: '#3b82f6', bg: '#eff6ff', icon: Wrench },
  faltou:  { label: 'Faltou', cor: '#dc2626', bg: '#fef2f2', icon: Ban },
  feriado: { label: 'Feriado', cor: '#f59e0b', bg: '#fffbeb', icon: Sun },
  oficina: { label: 'Oficina', cor: '#0d9488', bg: '#f0fdfa', icon: Warehouse },
  saida:   { label: 'Saída antecipada', cor: '#8b5cf6', bg: '#faf5ff', icon: LogOut },
}

interface Cliente { cnpj_cpf: string; nome_fantasia: string; razao_social: string; cidade: string }
interface Usuario { id: string; nome: string; funcao: string }
interface Tecnico { user_id: string; tecnico_nome: string; mecanico_role: string }

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const CORES = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1']

const TECH_PALETTES = [
  { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', avatar: '#3b82f6' },
  { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534', avatar: '#22c55e' },
  { bg: '#fffbeb', border: '#fde68a', text: '#92400e', avatar: '#f59e0b' },
  { bg: '#faf5ff', border: '#d8b4fe', text: '#6b21a8', avatar: '#a855f7' },
  { bg: '#fdf2f8', border: '#fbcfe8', text: '#9d174d', avatar: '#ec4899' },
  { bg: '#ecfeff', border: '#a5f3fc', text: '#155e75', avatar: '#06b6d4' },
  { bg: '#fff7ed', border: '#fed7aa', text: '#9a3412', avatar: '#f97316' },
  { bg: '#eef2ff', border: '#c7d2fe', text: '#3730a3', avatar: '#6366f1' },
  { bg: '#fef2f2', border: '#fecaca', text: '#991b1b', avatar: '#ef4444' },
  { bg: '#f0fdfa', border: '#99f6e4', text: '#115e59', avatar: '#14b8a6' },
]

function getSegunda(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function fmtDateBR(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function fmtSemana(seg: Date): string {
  const sab = addDays(seg, 5)
  return `${fmtDateBR(seg)} — ${fmtDateBR(sab)}`
}

export default function LousaPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading: pLoading } = usePermissoes(userProfile?.id)
  const router = useRouter()

  const [semana, setSemana] = useState(() => getSegunda(new Date()))
  const [entradas, setEntradas] = useState<LousaEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([])

  const [modalOpen, setModalOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<LousaEntry | null>(null)
  const [modalDia, setModalDia] = useState('')
  const [modalTecnico, setModalTecnico] = useState('')
  const [modalPeriodo, setModalPeriodo] = useState<'manha' | 'tarde' | 'dia'>('manha')
  const [modalTipo, setModalTipo] = useState<TipoMarca>('servico')
  const [modalAcompanhante, setModalAcompanhante] = useState('')

  const [configOpen, setConfigOpen] = useState(false)
  const [configUser, setConfigUser] = useState<{ id: string; nome: string } | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loadingConfig, setLoadingConfig] = useState(false)

  const [formCliente, setFormCliente] = useState<Cliente | null>(null)
  const [formClienteSearch, setFormClienteSearch] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formCor, setFormCor] = useState('#3b82f6')
  const [clienteResults, setClienteResults] = useState<Cliente[]>([])
  const [searchingClientes, setSearchingClientes] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showClienteDropdown, setShowClienteDropdown] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const sabado = useMemo(() => addDays(semana, 5), [semana])

  const carregarEntradas = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/pos/lousa?inicio=${fmtDate(semana)}&fim=${fmtDate(sabado)}`)
    const data = await res.json()
    setEntradas(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [semana, sabado])

  useEffect(() => { carregarEntradas() }, [carregarEntradas])

  useEffect(() => {
    Promise.all([
      supabase.from('portal_permissoes')
        .select('user_id, mecanico_role, mecanico_tecnico_nome')
        .not('mecanico_role', 'is', null)
        .not('mecanico_tecnico_nome', 'is', null),
      supabase.from('financeiro_usu').select('id').eq('ativo', true),
    ]).then(([{ data }, { data: ativos }]) => {
      const idsAtivos = new Set(((ativos || []) as any[]).map(u => u.id))
      const lista = ((data || []) as any[])
        .filter(t => t.mecanico_role === 'tecnico' && idsAtivos.has(t.user_id))
        .map(t => ({ user_id: t.user_id, tecnico_nome: t.mecanico_tecnico_nome, mecanico_role: t.mecanico_role }))
        .sort((a, b) => a.tecnico_nome.localeCompare(b.tecnico_nome))
      setTecnicos(lista)
    })
  }, [])

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowClienteDropdown(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  const buscarClientes = useCallback((q: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (q.length < 2) { setClienteResults([]); return }
    searchTimeout.current = setTimeout(async () => {
      setSearchingClientes(true)
      const res = await fetch(`/api/pos/lousa?modo=clientes&q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setClienteResults(Array.isArray(data) ? data : [])
      setSearchingClientes(false)
      setShowClienteDropdown(true)
    }, 300)
  }, [])

  // Grade: tecnico × dia × periodo
  const grade = useMemo(() => {
    const mapa: Record<string, Record<string, { manha: LousaEntry[]; tarde: LousaEntry[] }>> = {}
    const allKeys = [...tecnicos.map(t => t.tecnico_nome), '_sem_tecnico']
    allKeys.forEach(key => {
      mapa[key] = {}
      for (let i = 0; i < 6; i++) {
        const dia = fmtDate(addDays(semana, i))
        mapa[key][dia] = { manha: [], tarde: [] }
      }
    })
    const pushEntry = (cell: { manha: LousaEntry[]; tarde: LousaEntry[] }, e: LousaEntry) => {
      // "dia" inteiro aparece nos dois períodos
      if (e.periodo === 'dia') { cell.manha.push(e); cell.tarde.push(e) }
      else if (e.periodo === 'tarde') cell.tarde.push(e)
      else cell.manha.push(e)
    }
    entradas.forEach(e => {
      const tec = e.tecnico_nome || '_sem_tecnico'
      const target = mapa[tec]?.[e.data] ? mapa[tec][e.data] : mapa['_sem_tecnico']?.[e.data]
      if (target) pushEntry(target, e)
      // Técnico acompanhante: aparece também na linha dele
      if (e.tecnico_acompanhante && mapa[e.tecnico_acompanhante]?.[e.data]) {
        pushEntry(mapa[e.tecnico_acompanhante][e.data], e)
      }
    })
    return mapa
  }, [entradas, semana, tecnicos])

  const temSemTecnico = useMemo(() => {
    return entradas.some(e => !e.tecnico_nome)
  }, [entradas])

  const hoje = fmtDate(new Date())

  const abrirNovaEntrada = (tecnico: string, dia: string, periodo: 'manha' | 'tarde') => {
    setEditEntry(null)
    setModalDia(dia)
    setModalTecnico(tecnico === '_sem_tecnico' ? '' : tecnico)
    setModalPeriodo(periodo)
    setModalTipo('servico')
    setModalAcompanhante('')
    setFormCliente(null)
    setFormClienteSearch('')
    setFormDesc('')
    setFormCor('#3b82f6')
    setModalOpen(true)
  }

  const abrirEdicao = (entry: LousaEntry) => {
    setEditEntry(entry)
    setModalDia(entry.data)
    setModalTecnico(entry.tecnico_nome || '')
    setModalPeriodo(entry.periodo === 'tarde' ? 'tarde' : entry.periodo === 'dia' ? 'dia' : 'manha')
    setModalTipo((entry.tipo as TipoMarca) || 'servico')
    setModalAcompanhante(entry.tecnico_acompanhante || '')
    setFormCliente(entry.cliente_cnpj ? { cnpj_cpf: entry.cliente_cnpj, nome_fantasia: entry.cliente_nome, razao_social: '', cidade: '' } : null)
    setFormClienteSearch(entry.cliente_nome)
    setFormDesc(entry.descricao || '')
    setFormCor(entry.cor || '#3b82f6')
    setModalOpen(true)
  }

  // Validação de salvamento conforme o tipo
  const podeSalvar = modalTipo === 'servico'
    ? !!formClienteSearch.trim()
    : modalTipo === 'faltou'
      ? !!formDesc.trim()   // faltou exige motivo
      : true                // feriado e saída não exigem nada

  const salvar = async () => {
    if (!podeSalvar || !userProfile) return
    setSaving(true)
    const isServico = modalTipo === 'servico'
    const payload: any = {
      data: modalDia,
      tipo: modalTipo,
      cliente_cnpj: isServico ? (formCliente?.cnpj_cpf || null) : null,
      cliente_nome: isServico ? (formCliente?.nome_fantasia || formClienteSearch.trim()) : TIPO_CONFIG[modalTipo].label,
      descricao: formDesc.trim() || null,
      cor: isServico ? formCor : TIPO_CONFIG[modalTipo].cor,
      tecnico_nome: modalTecnico || null,
      periodo: modalPeriodo,
      tecnico_acompanhante: isServico && modalAcompanhante && modalAcompanhante !== modalTecnico ? modalAcompanhante : null,
    }
    let res: Response
    if (editEntry) {
      payload.id = editEntry.id
      res = await fetch('/api/pos/lousa', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      payload.criado_por_id = userProfile.id
      payload.criado_por_nome = userProfile.nome || 'Usuário'
      res = await fetch('/api/pos/lousa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(`Erro ao salvar: ${err.error || res.statusText}`)
      return
    }
    setModalOpen(false)
    carregarEntradas()
  }

  const excluir = async (id: string) => {
    await fetch(`/api/pos/lousa?id=${id}`, { method: 'DELETE' })
    carregarEntradas()
  }

  const abrirConfig = async () => {
    setConfigOpen(true)
    setLoadingConfig(true)
    const [configRes, usersRes] = await Promise.all([
      fetch('/api/pos/lousa?modo=config'),
      fetch('/api/pos/lousa?modo=usuarios'),
    ])
    const cfg = await configRes.json()
    const usrs = await usersRes.json()
    setConfigUser(cfg.notificar_user_id ? { id: cfg.notificar_user_id, nome: cfg.notificar_user_nome || '' } : null)
    setUsuarios(Array.isArray(usrs) ? usrs : [])
    setLoadingConfig(false)
  }

  const salvarConfig = async () => {
    await fetch('/api/pos/lousa', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo: 'config', notificar_user_id: configUser?.id || null, notificar_user_nome: configUser?.nome || null }),
    })
    setConfigOpen(false)
  }

  if (!pLoading && userProfile && !temAcesso('lousa')) return <SemPermissao />

  const COL_TEMPLATE = '230px repeat(12, minmax(0, 1fr))'

  const renderTechRow = (tecNome: string, tecIdx: number, isUnassigned?: boolean) => {
    const palette = isUnassigned
      ? { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280', avatar: '#9ca3af' }
      : TECH_PALETTES[tecIdx % TECH_PALETTES.length]

    return (
      <div key={tecNome} style={{ display: 'grid', gridTemplateColumns: COL_TEMPLATE, borderBottom: '1px solid #e5e7eb' }}>
        {/* Nome do técnico */}
        <div
          onClick={() => !isUnassigned && router.push(`/mecanicos?tecnico=${encodeURIComponent(tecNome)}`)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px',
            background: palette.bg,
            borderRight: `3px solid ${palette.avatar}`,
            cursor: isUnassigned ? 'default' : 'pointer',
            minHeight: 74,
          }}
        >
          <div style={{
            width: 40, height: 40, borderRadius: 9, flexShrink: 0,
            background: palette.avatar,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: '#fff',
          }}>
            {isUnassigned ? '?' : tecNome.charAt(0).toUpperCase()}
          </div>
          <span style={{
            fontSize: 15, fontWeight: 700, color: palette.text,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {isUnassigned ? 'Sem Técnico' : tecNome}
          </span>
        </div>

        {/* Células: 6 dias × 2 períodos */}
        {Array.from({ length: 6 }, (_, dayIdx) => {
          const dia = fmtDate(addDays(semana, dayIdx))
          const isHoje = dia === hoje
          return (['manha', 'tarde'] as const).map(per => {
            const items = grade[tecNome]?.[dia]?.[per] || []
            const isManha = per === 'manha'
            return (
              <div
                key={`${dia}-${per}`}
                onClick={() => abrirNovaEntrada(tecNome, dia, per)}
                style={{
                  padding: 4,
                  borderLeft: isManha ? '2px solid #cbd5e1' : '1px dashed #e5e7eb',
                  background: isHoje ? `${palette.bg}` : items.length > 0 ? `${palette.bg}88` : 'transparent',
                  cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', gap: 3,
                  minHeight: 84,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!items.length) e.currentTarget.style.background = palette.bg }}
                onMouseLeave={e => { if (!items.length && !isHoje) e.currentTarget.style.background = 'transparent' }}
              >
                {items.map(entry => {
                  const tipoMarca = (entry.tipo as TipoMarca) || 'servico'
                  const isServico = tipoMarca === 'servico'
                  const cfgMarca = TIPO_CONFIG[tipoMarca] || TIPO_CONFIG.servico
                  const IconMarca = cfgMarca.icon
                  // Quem vai junto, relativo à linha atual
                  const companheiro = entry.tecnico_acompanhante
                    ? (tecNome === entry.tecnico_acompanhante ? (entry.tecnico_nome || 'Sem técnico') : entry.tecnico_acompanhante)
                    : null
                  return (
                  <div
                    key={entry.id}
                    onClick={e => { e.stopPropagation(); abrirEdicao(entry) }}
                    style={{
                      padding: '7px 9px', borderRadius: 7,
                      borderLeft: `4px solid ${entry.cor || '#3b82f6'}`,
                      background: isServico ? '#fff' : cfgMarca.bg,
                      fontSize: 13,
                      boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                      cursor: 'pointer',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                      {isServico
                        ? (entry.temOsAberta
                            ? <CheckCircle size={13} color="#059669" />
                            : <XCircle size={13} color="#dc2626" />)
                        : <IconMarca size={13} color={cfgMarca.cor} />}
                      {isServico && entry.temPedidoPPV && <Package size={13} color="#d97706" />}
                      <button
                        onClick={ev => { ev.stopPropagation(); excluir(entry.id) }}
                        style={{
                          marginLeft: 'auto', width: 22, height: 22, borderRadius: 5,
                          border: 'none', background: 'transparent', color: '#d1d5db',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          padding: 0,
                        }}
                        onMouseEnter={ev => { ev.currentTarget.style.color = '#dc2626' }}
                        onMouseLeave={ev => { ev.currentTarget.style.color = '#d1d5db' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: isServico ? '#1a1a1a' : cfgMarca.cor, lineHeight: 1.3, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                      <span>{isServico ? entry.cliente_nome : cfgMarca.label}</span>
                      {entry.periodo === 'dia' && (
                        <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: '#0369a1', background: '#e0f2fe', padding: '1px 6px', borderRadius: 5 }}>
                          DIA TODO
                        </span>
                      )}
                      {companheiro && (
                        <span title={`Vai junto com ${companheiro}`} style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.3, color: '#7c3aed', background: '#f3e8ff', padding: '1px 6px', borderRadius: 5, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <UserPlus size={9} /> com {companheiro.split(' ')[0]}
                        </span>
                      )}
                    </div>
                    {entry.descricao && (
                      <div style={{
                        color: '#1f2937', fontSize: 13, fontWeight: 600, lineHeight: 1.4, marginTop: 3,
                        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        wordBreak: 'break-word',
                      }}>
                        {entry.descricao}
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            )
          })
        })}
      </div>
    )
  }

  return (
    <div style={{ padding: '8px 12px 80px' }}>
      {/* Grade */}
      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Carregando agenda...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
        <div style={{ border: '1px solid #d1d5db', borderRadius: 12, overflow: 'hidden', background: '#fff', minWidth: 1180 }}>

          {/* Cabeçalho: dias */}
          <div style={{ display: 'grid', gridTemplateColumns: COL_TEMPLATE, borderBottom: '1px solid #d1d5db' }}>
            <div style={{
              padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 6,
              background: 'linear-gradient(135deg, #1e293b, #334155)',
              borderRight: '1px solid #475569',
            }}>
              <Wrench size={17} color="#fff" />
              <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Técnicos</span>
              <span style={{ fontSize: 12, fontWeight: 700, background: 'rgba(255,255,255,0.2)', color: '#fff', padding: '3px 8px', borderRadius: 5, marginLeft: 'auto' }}>
                {tecnicos.length}
              </span>
            </div>
            {DIAS_SEMANA.map((nome, i) => {
              const dia = fmtDate(addDays(semana, i))
              const isHoje = dia === hoje
              return (
                <div key={dia} style={{
                  gridColumn: 'span 2', textAlign: 'center', padding: '8px 4px',
                  background: isHoje ? '#eff6ff' : '#f1f5f9',
                  borderLeft: '2px solid #94a3b8',
                }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: isHoje ? '#2563eb' : '#1e293b' }}>
                    {nome}
                  </div>
                  <div style={{ fontSize: 13, color: isHoje ? '#3b82f6' : '#9ca3af', fontWeight: 500 }}>
                    {fmtDateBR(addDays(semana, i))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Sub-cabeçalho: períodos */}
          <div style={{ display: 'grid', gridTemplateColumns: COL_TEMPLATE, borderBottom: '2px solid #d1d5db' }}>
            <div style={{ background: '#1e293b', borderRight: '1px solid #475569', padding: '4px 10px' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, fontWeight: 600 }}>HORÁRIOS</div>
            </div>
            {DIAS_SEMANA.map((_, i) => {
              const dia = fmtDate(addDays(semana, i))
              const isHoje = dia === hoje
              return [
                <div key={`${dia}-m`} style={{
                  textAlign: 'center', padding: '7px 2px', fontSize: 13, fontWeight: 700,
                  color: '#6b7280', background: isHoje ? '#eff6ff' : '#f8fafc',
                  borderLeft: '2px solid #94a3b8', letterSpacing: 0.5,
                }}>
                  <span style={{ color: isHoje ? '#2563eb' : '#6b7280' }}>MANHÃ</span>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>7:30 — 11:30</div>
                </div>,
                <div key={`${dia}-t`} style={{
                  textAlign: 'center', padding: '7px 2px', fontSize: 13, fontWeight: 700,
                  color: '#6b7280', background: isHoje ? '#eff6ff' : '#f8fafc',
                  borderLeft: '1px dashed #e5e7eb', letterSpacing: 0.5,
                }}>
                  <span style={{ color: isHoje ? '#2563eb' : '#6b7280' }}>TARDE</span>
                  <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>12:30 — 17:30</div>
                </div>,
              ]
            })}
          </div>

          {/* Linhas dos técnicos */}
          {tecnicos.map((tec, idx) => renderTechRow(tec.tecnico_nome, idx))}

          {/* Linha "Sem Técnico" se houver entradas sem técnico */}
          {temSemTecnico && renderTechRow('_sem_tecnico', tecnicos.length, true)}

          {tecnicos.length === 0 && !temSemTecnico && (
            <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
              Nenhum técnico cadastrado
            </div>
          )}
        </div>
        </div>
      )}

      {/* ===== Modal Nova/Editar Entrada ===== */}
      {modalOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
            zIndex: 55000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            background: 'var(--portal-bg-card, #fff)', borderRadius: 20, width: 520, maxWidth: '95vw',
            padding: 32, boxShadow: '0 25px 60px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)', margin: 0 }}>
                {editEntry ? 'Editar marcação' : 'Nova marcação'}
              </h3>
              <button onClick={() => setModalOpen(false)} style={{
                background: 'var(--portal-bg-secondary, #f5f5f5)', border: 'none', borderRadius: 10,
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--portal-text-secondary, #666)',
              }}>
                <X size={18} />
              </button>
            </div>

            {/* Tipo de marcação */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: 1, display: 'block', marginBottom: 6 }}>TIPO</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
                {(Object.keys(TIPO_CONFIG) as TipoMarca[]).map(t => {
                  const cfg = TIPO_CONFIG[t]
                  const Icon = cfg.icon
                  const ativo = modalTipo === t
                  return (
                    <button
                      key={t}
                      onClick={() => setModalTipo(t)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                        padding: '10px 4px', borderRadius: 10, cursor: 'pointer',
                        border: ativo ? `2px solid ${cfg.cor}` : '1px solid var(--portal-border, #e5e5e5)',
                        background: ativo ? cfg.bg : 'var(--portal-bg-card, #fff)',
                        color: ativo ? cfg.cor : 'var(--portal-text-secondary, #666)',
                        fontSize: 11, fontWeight: 700, transition: 'all 0.15s', lineHeight: 1.1, textAlign: 'center',
                      }}
                    >
                      <Icon size={16} />
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Técnico e Período — lado a lado */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: 1, display: 'block', marginBottom: 6 }}>TÉCNICO</label>
                <select
                  value={modalTecnico}
                  onChange={e => setModalTecnico(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10,
                    border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 13,
                    background: 'var(--portal-bg-card, #fff)', color: 'var(--portal-text, #1a1a1a)',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Sem técnico</option>
                  {tecnicos.map(t => <option key={t.user_id} value={t.tecnico_nome}>{t.tecnico_nome}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: 1, display: 'block', marginBottom: 6 }}>PERÍODO</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['manha', 'tarde', 'dia'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => setModalPeriodo(p)}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 10, fontSize: 12, fontWeight: 600,
                        border: modalPeriodo === p ? '2px solid #3b82f6' : '1px solid var(--portal-border, #e5e5e5)',
                        background: modalPeriodo === p ? '#eff6ff' : 'var(--portal-bg-card, #fff)',
                        color: modalPeriodo === p ? '#2563eb' : 'var(--portal-text-secondary, #666)',
                        cursor: 'pointer',
                      }}
                    >
                      {p === 'manha' ? 'Manhã' : p === 'tarde' ? 'Tarde' : 'Dia inteiro'}
                      <div style={{ fontSize: 9, fontWeight: 500, color: '#9ca3af', marginTop: 2 }}>
                        {p === 'manha' ? '7:30 — 11:30' : p === 'tarde' ? '12:30 — 17:30' : '7:30 — 17:30'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Técnico acompanhante (só para serviço) — vai junto com outro técnico */}
            {modalTipo === 'servico' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                  <UserPlus size={13} /> VAI JUNTO COM (opcional)
                </label>
                <select
                  value={modalAcompanhante}
                  onChange={e => setModalAcompanhante(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10,
                    border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 13,
                    background: 'var(--portal-bg-card, #fff)', color: 'var(--portal-text, #1a1a1a)',
                    boxSizing: 'border-box',
                  }}
                >
                  <option value="">Ninguém</option>
                  {tecnicos.filter(t => t.tecnico_nome !== modalTecnico).map(t => (
                    <option key={t.user_id} value={t.tecnico_nome}>{t.tecnico_nome}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Data */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: 1, display: 'block', marginBottom: 6 }}>DATA</label>
              <input type="date" value={modalDia} onChange={e => setModalDia(e.target.value)} style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 14,
                background: 'var(--portal-bg-card, #fff)', color: 'var(--portal-text, #1a1a1a)',
                boxSizing: 'border-box',
              }} />
            </div>

            {/* Cliente (só para serviço) */}
            {modalTipo === 'servico' && (
            <div style={{ marginBottom: 16, position: 'relative' }} ref={dropdownRef}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: 1, display: 'block', marginBottom: 6 }}>CLIENTE</label>
              <div style={{ position: 'relative' }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                <input
                  value={formClienteSearch}
                  onChange={e => {
                    setFormClienteSearch(e.target.value)
                    setFormCliente(null)
                    buscarClientes(e.target.value)
                  }}
                  onFocus={() => { if (clienteResults.length > 0) setShowClienteDropdown(true) }}
                  placeholder="Buscar por nome, CNPJ..."
                  style={{
                    width: '100%', padding: '10px 14px 10px 36px', borderRadius: 10,
                    border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 14,
                    background: 'var(--portal-bg-card, #fff)', color: 'var(--portal-text, #1a1a1a)',
                    boxSizing: 'border-box',
                  }}
                />
                {formCliente && (
                  <span style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    fontSize: 9, fontWeight: 700, color: '#059669', background: '#ECFDF5',
                    padding: '3px 8px', borderRadius: 6,
                  }}>
                    Vinculado
                  </span>
                )}
              </div>
              {showClienteDropdown && clienteResults.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: 'var(--portal-bg-card, #fff)', borderRadius: 12,
                  border: '1px solid var(--portal-border, #e5e5e5)',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
                  maxHeight: 200, overflowY: 'auto', marginTop: 4,
                }}>
                  {clienteResults.map((c, i) => (
                    <div
                      key={c.cnpj_cpf + i}
                      onClick={() => {
                        setFormCliente(c)
                        setFormClienteSearch(c.nome_fantasia || c.razao_social)
                        setShowClienteDropdown(false)
                      }}
                      style={{
                        padding: '10px 14px', cursor: 'pointer',
                        borderBottom: i < clienteResults.length - 1 ? '1px solid var(--portal-border, #f0f0f0)' : 'none',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--portal-bg-hover, #fafafa)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text, #1a1a1a)' }}>
                        {c.nome_fantasia || c.razao_social}
                      </div>
                      <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>
                        {c.cnpj_cpf} {c.cidade ? `• ${c.cidade}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {searchingClientes && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: 'var(--portal-bg-card, #fff)', borderRadius: 12,
                  border: '1px solid var(--portal-border, #e5e5e5)',
                  padding: '16px', textAlign: 'center', color: '#9CA3AF', fontSize: 12, marginTop: 4,
                }}>
                  Buscando...
                </div>
              )}
            </div>
            )}

            {/* Descrição / Motivo (oculto para feriado) */}
            {modalTipo !== 'feriado' && (
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: 1, display: 'block', marginBottom: 6 }}>
                {modalTipo === 'faltou' ? 'MOTIVO' : modalTipo === 'saida' ? 'HORÁRIO / MOTIVO (opcional)' : modalTipo === 'oficina' ? 'O QUE VAI FAZER (opcional)' : 'DESCRIÇÃO'}
              </label>
              <textarea
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                placeholder={modalTipo === 'faltou' ? 'Por que faltou?' : modalTipo === 'saida' ? 'Ex: saiu 15h por consulta...' : modalTipo === 'oficina' ? 'Ex: manutenção interna, organização...' : 'Descreva o serviço...'}
                rows={3}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 14,
                  background: 'var(--portal-bg-card, #fff)', color: 'var(--portal-text, #1a1a1a)',
                  resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>
            )}

            {/* Cor (só para serviço) */}
            {modalTipo === 'servico' && (
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: 1, display: 'block', marginBottom: 6 }}>COR</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {CORES.map(c => (
                  <button
                    key={c}
                    onClick={() => setFormCor(c)}
                    style={{
                      width: 32, height: 32, borderRadius: 8, border: formCor === c ? '3px solid var(--portal-text, #1a1a1a)' : '2px solid transparent',
                      background: c, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  />
                ))}
              </div>
            </div>
            )}

            {/* Botões */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalOpen(false)} style={{
                padding: '12px 24px', borderRadius: 12, border: '1px solid var(--portal-border, #e5e5e5)',
                background: 'var(--portal-bg-card, #fff)', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', color: 'var(--portal-text-secondary, #666)',
              }}>
                Cancelar
              </button>
              <button onClick={salvar} disabled={!podeSalvar || saving} style={{
                padding: '12px 24px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: !podeSalvar || saving ? 0.5 : 1,
                boxShadow: '0 4px 12px rgba(59,130,246,0.25)',
              }}>
                {saving ? 'Salvando...' : editEntry ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal Configuração Notificação ===== */}
      {configOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setConfigOpen(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
            zIndex: 55000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            background: 'var(--portal-bg-card, #fff)', borderRadius: 20, width: 460, maxWidth: '95vw',
            padding: 32, boxShadow: '0 25px 60px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Bell size={22} color="#fff" />
                </div>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)', margin: 0 }}>Notificação PPV</h3>
                  <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>Aviso diário às 16h quando há peças</p>
                </div>
              </div>
              <button onClick={() => setConfigOpen(false)} style={{
                background: 'var(--portal-bg-secondary, #f5f5f5)', border: 'none', borderRadius: 10,
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--portal-text-secondary, #666)',
              }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: 13, color: 'var(--portal-text-secondary, #666)', lineHeight: 1.6, marginBottom: 20 }}>
              Escolha quem vai receber a notificação quando alguma OS da lousa tiver pedido de peças (PPV).
              A notificação é enviada todos os dias às 16h.
            </p>

            {loadingConfig ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Carregando...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto', marginBottom: 20 }}>
                <button
                  onClick={() => setConfigUser(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12,
                    border: !configUser ? '2px solid #3b82f6' : '1px solid var(--portal-border, #e5e5e5)',
                    background: !configUser ? '#EFF6FF' : 'var(--portal-bg-card, #fff)',
                    cursor: 'pointer', width: '100%', textAlign: 'left' as const,
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'var(--portal-bg-secondary, #f5f5f5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <X size={16} color="#9CA3AF" />
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text, #1a1a1a)' }}>Nenhum (desativado)</span>
                </button>

                {usuarios.map(u => {
                  const isSelected = configUser?.id === u.id
                  return (
                    <button
                      key={u.id}
                      onClick={() => setConfigUser({ id: u.id, nome: u.nome })}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12,
                        border: isSelected ? '2px solid #3b82f6' : '1px solid var(--portal-border, #e5e5e5)',
                        background: isSelected ? '#EFF6FF' : 'var(--portal-bg-card, #fff)',
                        cursor: 'pointer', width: '100%', textAlign: 'left' as const,
                      }}
                    >
                      <div style={{
                        width: 36, height: 36, borderRadius: 10,
                        background: isSelected ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : 'var(--portal-bg-secondary, #f5f5f5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <User size={16} color={isSelected ? '#fff' : '#9CA3AF'} />
                      </div>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: isSelected ? 700 : 500, color: 'var(--portal-text, #1a1a1a)', display: 'block' }}>
                          {u.nome}
                        </span>
                        <span style={{ fontSize: 11, color: '#9CA3AF' }}>{u.funcao}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfigOpen(false)} style={{
                padding: '12px 24px', borderRadius: 12, border: '1px solid var(--portal-border, #e5e5e5)',
                background: 'var(--portal-bg-card, #fff)', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', color: 'var(--portal-text-secondary, #666)',
              }}>
                Cancelar
              </button>
              <button onClick={salvarConfig} style={{
                padding: '12px 24px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(245,158,11,0.25)',
              }}>
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Barra flutuante: semana + engrenagem ===== */}
      <div style={{
        position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)',
        zIndex: 1000, display: 'flex', alignItems: 'center', gap: 8,
        background: 'var(--portal-bg-card, #fff)', border: '1px solid var(--portal-border, #e5e7eb)',
        borderRadius: 999, padding: '7px 10px', boxShadow: '0 8px 28px rgba(0,0,0,0.16)',
      }}>
        <button onClick={() => setSemana(addDays(semana, -7))} title="Semana anterior" style={{
          width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--portal-bg-secondary, #f5f5f5)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569',
        }}>
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => setSemana(getSegunda(new Date()))} title="Voltar para esta semana" style={{
          padding: '7px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
          background: '#EFF6FF', color: '#2563eb', fontSize: 13, fontWeight: 700,
          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
        }}>
          <Calendar size={14} /> {fmtSemana(semana)}
        </button>
        <button onClick={() => setSemana(addDays(semana, 7))} title="Próxima semana" style={{
          width: 34, height: 34, borderRadius: '50%', border: 'none', background: 'var(--portal-bg-secondary, #f5f5f5)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569',
        }}>
          <ChevronRight size={18} />
        </button>
        <div style={{ width: 1, height: 22, background: 'var(--portal-border, #e5e7eb)', margin: '0 2px' }} />
        <button onClick={abrirConfig} title="Configurar notificação de peças (PPV)" style={{
          width: 38, height: 38, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #475569, #1e293b)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 3px 10px rgba(30,41,59,0.3)',
        }}>
          <Settings size={18} />
        </button>
      </div>
    </div>
  )
}
