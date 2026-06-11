'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import {
  ChevronLeft, ChevronRight, Plus, X, Trash2, Search,
  CheckCircle, XCircle, Package, Bell, Settings, User, Calendar
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
  temOsAberta?: boolean
  ordensAbertas?: { id_ordem: string; status: string }[]
  temPedidoPPV?: boolean
}

interface Cliente {
  cnpj_cpf: string
  nome_fantasia: string
  razao_social: string
  cidade: string
}

interface Usuario {
  id: string
  nome: string
  funcao: string
}

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const CORES = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#6366f1']

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
  const [semana, setSemana] = useState(() => getSegunda(new Date()))
  const [entradas, setEntradas] = useState<LousaEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<LousaEntry | null>(null)
  const [modalDia, setModalDia] = useState('')
  const [configOpen, setConfigOpen] = useState(false)
  const [configUser, setConfigUser] = useState<{ id: string; nome: string } | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [loadingConfig, setLoadingConfig] = useState(false)

  // Form state
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

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowClienteDropdown(false)
      }
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

  const abrirNovaEntrada = (dia: string) => {
    setEditEntry(null)
    setModalDia(dia)
    setFormCliente(null)
    setFormClienteSearch('')
    setFormDesc('')
    setFormCor('#3b82f6')
    setModalOpen(true)
  }

  const abrirEdicao = (entry: LousaEntry) => {
    setEditEntry(entry)
    setModalDia(entry.data)
    setFormCliente(entry.cliente_cnpj ? { cnpj_cpf: entry.cliente_cnpj, nome_fantasia: entry.cliente_nome, razao_social: '', cidade: '' } : null)
    setFormClienteSearch(entry.cliente_nome)
    setFormDesc(entry.descricao || '')
    setFormCor(entry.cor || '#3b82f6')
    setModalOpen(true)
  }

  const salvar = async () => {
    if (!formClienteSearch.trim() || !userProfile) return
    setSaving(true)

    const payload: any = {
      data: modalDia,
      cliente_cnpj: formCliente?.cnpj_cpf || null,
      cliente_nome: formCliente?.nome_fantasia || formClienteSearch.trim(),
      descricao: formDesc.trim() || null,
      cor: formCor,
    }

    if (editEntry) {
      payload.id = editEntry.id
      await fetch('/api/pos/lousa', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    } else {
      payload.criado_por_id = userProfile.id
      payload.criado_por_nome = userProfile.nome || 'Usuário'
      await fetch('/api/pos/lousa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }

    setSaving(false)
    setModalOpen(false)
    carregarEntradas()
  }

  const excluir = async (id: string) => {
    await fetch(`/api/pos/lousa?id=${id}`, { method: 'DELETE' })
    carregarEntradas()
  }

  // Config modal
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
      body: JSON.stringify({
        modo: 'config',
        notificar_user_id: configUser?.id || null,
        notificar_user_nome: configUser?.nome || null,
      }),
    })
    setConfigOpen(false)
  }

  // Agrupar entradas por dia
  const entradasPorDia = useMemo(() => {
    const mapa: Record<string, LousaEntry[]> = {}
    for (let i = 0; i < 6; i++) {
      const dia = fmtDate(addDays(semana, i))
      mapa[dia] = entradas.filter(e => e.data === dia)
    }
    return mapa
  }, [entradas, semana])

  const hoje = fmtDate(new Date())

  if (!pLoading && userProfile && !temAcesso('lousa')) return <SemPermissao />

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--portal-text, #1a1a1a)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Calendar size={22} color="#3b82f6" /> Lousa Virtual
          </h1>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: '4px 0 0' }}>Agenda semanal de serviços</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={abrirConfig} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10,
            border: '1px solid var(--portal-border, #e5e5e5)', background: 'var(--portal-bg-card, #fff)',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', color: 'var(--portal-text-secondary, #666)',
          }}>
            <Bell size={15} /> Notificação
          </button>
        </div>
      </div>

      {/* Navegação da semana */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20,
        padding: '12px 0',
      }}>
        <button onClick={() => setSemana(addDays(semana, -7))} style={{
          width: 36, height: 36, borderRadius: 10, border: '1px solid var(--portal-border, #e5e5e5)',
          background: 'var(--portal-bg-card, #fff)', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text-secondary, #666)',
        }}>
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => setSemana(getSegunda(new Date()))} style={{
          padding: '8px 20px', borderRadius: 10, border: '1px solid #3b82f6',
          background: '#EFF6FF', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#3b82f6',
        }}>
          Hoje
        </button>
        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)', minWidth: 180, textAlign: 'center' }}>
          {fmtSemana(semana)}
        </span>
        <button onClick={() => setSemana(addDays(semana, 7))} style={{
          width: 36, height: 36, borderRadius: 10, border: '1px solid var(--portal-border, #e5e5e5)',
          background: 'var(--portal-bg-card, #fff)', cursor: 'pointer', display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: 'var(--portal-text-secondary, #666)',
        }}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Grid semanal */}
      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Carregando agenda...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, minHeight: 500 }}>
          {DIAS_SEMANA.map((nome, i) => {
            const dia = fmtDate(addDays(semana, i))
            const isHoje = dia === hoje
            const items = entradasPorDia[dia] || []

            return (
              <div key={dia} style={{
                borderRadius: 14, overflow: 'hidden',
                border: isHoje ? '2px solid #3b82f6' : '1px solid var(--portal-border, #e5e5e5)',
                background: 'var(--portal-bg-card, #fff)',
                display: 'flex', flexDirection: 'column',
                boxShadow: isHoje ? '0 0 20px rgba(59,130,246,0.12)' : 'none',
              }}>
                {/* Cabeçalho do dia */}
                <div style={{
                  padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: '1px solid var(--portal-border, #e5e5e5)',
                  background: isHoje ? '#EFF6FF' : 'var(--portal-bg-hover, #fafafa)',
                }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: isHoje ? '#3b82f6' : 'var(--portal-text, #1a1a1a)' }}>
                      {nome}
                    </span>
                    <span style={{
                      fontSize: 11, color: isHoje ? '#3b82f6' : '#9CA3AF', marginLeft: 8, fontWeight: 500,
                    }}>
                      {fmtDateBR(addDays(semana, i))}
                    </span>
                  </div>
                  <button onClick={() => abrirNovaEntrada(dia)} style={{
                    width: 26, height: 26, borderRadius: 8, border: 'none',
                    background: isHoje ? '#3b82f6' : 'var(--portal-bg-secondary, #f5f5f5)',
                    color: isHoje ? '#fff' : '#9CA3AF', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Plus size={14} />
                  </button>
                </div>

                {/* Entradas do dia */}
                <div style={{ flex: 1, padding: 8, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.length === 0 && (
                    <div style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#D1D5DB', fontSize: 12, fontStyle: 'italic', padding: 20,
                    }}>
                      Sem serviços
                    </div>
                  )}
                  {items.map(entry => (
                    <div
                      key={entry.id}
                      onClick={() => abrirEdicao(entry)}
                      style={{
                        padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                        borderLeft: `4px solid ${entry.cor || '#3b82f6'}`,
                        background: 'var(--portal-bg-hover, #fafafa)',
                        transition: 'all 0.15s',
                        position: 'relative',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--portal-bg-secondary, #f0f0f0)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--portal-bg-hover, #fafafa)' }}
                    >
                      {/* Indicadores OS e PPV */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                        {entry.temOsAberta ? (
                          <span title="OS aberta" style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: 9, fontWeight: 700, color: '#059669', background: '#ECFDF5',
                            padding: '2px 6px', borderRadius: 6,
                          }}>
                            <CheckCircle size={10} /> OS
                          </span>
                        ) : (
                          <span title="Sem OS aberta" style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: 9, fontWeight: 700, color: '#DC2626', background: '#FEF2F2',
                            padding: '2px 6px', borderRadius: 6,
                          }}>
                            <XCircle size={10} /> Sem OS
                          </span>
                        )}
                        {entry.temPedidoPPV && (
                          <span title="Pedido de peças (PPV)" style={{
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            fontSize: 9, fontWeight: 700, color: '#D97706', background: '#FFFBEB',
                            padding: '2px 6px', borderRadius: 6,
                          }}>
                            <Package size={10} /> PPV
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)', marginBottom: 2, lineHeight: 1.3 }}>
                        {entry.cliente_nome}
                      </div>

                      {entry.descricao && (
                        <div style={{
                          fontSize: 11, color: 'var(--portal-text-secondary, #666)',
                          lineHeight: 1.4, marginBottom: 4,
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any,
                        }}>
                          {entry.descricao}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 9, color: '#9CA3AF', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <User size={9} /> {entry.criado_por_nome.split(' ')[0]}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); excluir(entry.id) }}
                          style={{
                            width: 20, height: 20, borderRadius: 6, border: 'none',
                            background: 'transparent', color: '#D1D5DB', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.background = '#FEF2F2' }}
                          onMouseLeave={e => { e.currentTarget.style.color = '#D1D5DB'; e.currentTarget.style.background = 'transparent' }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
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
            background: 'var(--portal-bg-card, #fff)', borderRadius: 20, width: 500, maxWidth: '95vw',
            padding: 32, boxShadow: '0 25px 60px rgba(0,0,0,0.15)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)', margin: 0 }}>
                {editEntry ? 'Editar Serviço' : 'Novo Serviço'}
              </h3>
              <button onClick={() => setModalOpen(false)} style={{
                background: 'var(--portal-bg-secondary, #f5f5f5)', border: 'none', borderRadius: 10,
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--portal-text-secondary, #666)',
              }}>
                <X size={18} />
              </button>
            </div>

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

            {/* Cliente */}
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

              {/* Dropdown de resultados */}
              {showClienteDropdown && clienteResults.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: 'var(--portal-bg-card, #fff)', borderRadius: 12,
                  border: '1px solid var(--portal-border, #e5e5e5)',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
                  maxHeight: 240, overflowY: 'auto', marginTop: 4,
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

            {/* Descrição */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: 1, display: 'block', marginBottom: 6 }}>DESCRIÇÃO</label>
              <textarea
                value={formDesc}
                onChange={e => setFormDesc(e.target.value)}
                placeholder="Descreva o serviço..."
                rows={3}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 14,
                  background: 'var(--portal-bg-card, #fff)', color: 'var(--portal-text, #1a1a1a)',
                  resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Cor */}
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

            {/* Botões */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setModalOpen(false)} style={{
                padding: '12px 24px', borderRadius: 12, border: '1px solid var(--portal-border, #e5e5e5)',
                background: 'var(--portal-bg-card, #fff)', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', color: 'var(--portal-text-secondary, #666)',
              }}>
                Cancelar
              </button>
              <button onClick={salvar} disabled={!formClienteSearch.trim() || saving} style={{
                padding: '12px 24px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
                opacity: !formClienteSearch.trim() || saving ? 0.5 : 1,
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
                {/* Opção nenhum */}
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
    </div>
  )
}
