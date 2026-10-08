'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Edit3, Save, X,
  Calendar, Clock, MapPin, User
} from 'lucide-react'

interface Tecnico {
  user_id: string
  tecnico_nome: string
  mecanico_role: 'tecnico' | 'observador'
}

interface AgendaItem {
  id: number
  tecnico_nome: string
  id_ordem: string | null
  data_agendada: string
  turno: string
  hora_inicio: string | null
  hora_fim: string | null
  descricao: string | null
  endereco: string | null
  cliente: string | null
  status: string
  created_at: string
}

interface OSBasic {
  Id_Ordem: string
  Os_Cliente: string
  Endereco_Cliente: string
  Os_Tecnico: string
  Os_Tecnico2: string
}

const TURNOS = {
  manha: { label: 'Manhã', color: '#F59E0B' },
  tarde: { label: 'Tarde', color: '#3B82F6' },
  integral: { label: 'Integral', color: '#10B981' },
}

const STATUS_COLORS: Record<string, string> = {
  agendado: '#3B82F6',
  em_andamento: '#F59E0B',
  concluido: '#10B981',
  cancelado: '#EF4444',
}

export default function AgendaTecnicosPage() {
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([])
  const [agenda, setAgenda] = useState<AgendaItem[]>([])
  const [osList, setOsList] = useState<OSBasic[]>([])
  const [loading, setLoading] = useState(true)
  const [semanaOffset, setSemanaOffset] = useState(0)
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState<AgendaItem | null>(null)
  const [filtroTecnico, setFiltroTecnico] = useState('')

  // Form state
  const [formTecnico, setFormTecnico] = useState('')
  const [formOrdem, setFormOrdem] = useState('')
  const [formData, setFormData] = useState('')
  const [formTurno, setFormTurno] = useState('manha')
  const [formHoraInicio, setFormHoraInicio] = useState('')
  const [formHoraFim, setFormHoraFim] = useState('')
  const [formDescricao, setFormDescricao] = useState('')
  const [formCliente, setFormCliente] = useState('')
  const [formEndereco, setFormEndereco] = useState('')
  const [saving, setSaving] = useState(false)

  const semana = useMemo(() => {
    const hoje = new Date()
    hoje.setDate(hoje.getDate() + semanaOffset * 7)
    const seg = new Date(hoje)
    seg.setDate(hoje.getDate() - hoje.getDay() + 1)
    const dias: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(seg)
      d.setDate(seg.getDate() + i)
      dias.push(d.toISOString().split('T')[0])
    }
    return dias
  }, [semanaOffset])

  useEffect(() => {
    const carregarBase = async () => {
      const [{ data: tecs }, { data: os }] = await Promise.all([
        supabase.from('portal_permissoes').select('user_id, mecanico_role, mecanico_tecnico_nome').not('mecanico_role', 'is', null).not('mecanico_tecnico_nome', 'is', null),
        supabase.from('Ordem_Servico').select('Id_Ordem, Os_Cliente, Endereco_Cliente, Os_Tecnico, Os_Tecnico2').not('Status', 'in', '("Concluída","Cancelada")').order('Id_Ordem', { ascending: false }),
      ])
      setTecnicos(
        ((tecs || []) as any[]).map(t => ({
          user_id: t.user_id,
          tecnico_nome: t.mecanico_tecnico_nome,
          mecanico_role: t.mecanico_role,
        })).sort((a, b) => a.tecnico_nome.localeCompare(b.tecnico_nome))
      )
      setOsList((os as OSBasic[]) || [])
    }
    carregarBase()
  }, [])

  useEffect(() => {
    const carregar = async () => {
      setLoading(true)
      const { data } = await supabase
        .from('agenda_tecnico')
        .select('*')
        .gte('data_agendada', semana[0])
        .lte('data_agendada', semana[6])
        .order('data_agendada')
        .order('hora_inicio')
      setAgenda((data as AgendaItem[]) || [])
      setLoading(false)
    }
    carregar()
  }, [semana])

  const diasNomes = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
  const hojeStr = new Date().toISOString().split('T')[0]

  const tecnicosFiltrados = filtroTecnico
    ? tecnicos.filter((t) => t.tecnico_nome === filtroTecnico)
    : tecnicos

  const resetForm = () => {
    setFormTecnico('')
    setFormOrdem('')
    setFormData('')
    setFormTurno('manha')
    setFormHoraInicio('')
    setFormHoraFim('')
    setFormDescricao('')
    setFormCliente('')
    setFormEndereco('')
    setEditItem(null)
    setShowForm(false)
  }

  const openNewForm = (tecnico?: string, data?: string) => {
    resetForm()
    if (tecnico) setFormTecnico(tecnico)
    if (data) setFormData(data)
    setShowForm(true)
  }

  const openEditForm = (item: AgendaItem) => {
    setEditItem(item)
    setFormTecnico(item.tecnico_nome)
    setFormOrdem(item.id_ordem || '')
    setFormData(item.data_agendada)
    setFormTurno(item.turno)
    setFormHoraInicio(item.hora_inicio || '')
    setFormHoraFim(item.hora_fim || '')
    setFormDescricao(item.descricao || '')
    setFormCliente(item.cliente || '')
    setFormEndereco(item.endereco || '')
    setShowForm(true)
  }

  const salvar = async () => {
    if (!formTecnico || !formData) {
      alert('Selecione o técnico e a data.')
      return
    }
    setSaving(true)

    const osInfo = formOrdem ? osList.find((o) => o.Id_Ordem === formOrdem) : null
    const payload = {
      tecnico_nome: formTecnico,
      id_ordem: formOrdem || null,
      data_agendada: formData,
      turno: formTurno,
      hora_inicio: formHoraInicio || null,
      hora_fim: formHoraFim || null,
      descricao: formDescricao || null,
      endereco: osInfo ? osInfo.Endereco_Cliente : (formEndereco || null),
      cliente: osInfo ? osInfo.Os_Cliente : (formCliente || null),
      status: 'agendado',
    }

    if (editItem) {
      await supabase.from('agenda_tecnico').update(payload).eq('id', editItem.id)
    } else {
      await supabase.from('agenda_tecnico').insert(payload)
      // Notify technician
      await supabase.from('mecanico_notificacoes').insert({
        tecnico_nome: formTecnico,
        tipo: 'agenda',
        titulo: 'Novo agendamento',
        descricao: `Serviço agendado para ${new Date(formData + 'T12:00:00').toLocaleDateString('pt-BR')}${formOrdem ? ` - OS ${formOrdem}` : ''}`,
        link: formOrdem ? `/os/${formOrdem}` : '/agenda',
        lida: false,
      })
    }

    // Refresh
    const { data } = await supabase
      .from('agenda_tecnico')
      .select('*')
      .gte('data_agendada', semana[0])
      .lte('data_agendada', semana[6])
      .order('data_agendada')
      .order('hora_inicio')
    setAgenda((data as AgendaItem[]) || [])
    setSaving(false)
    resetForm()
  }

  const excluir = async (itemId: number) => {
    if (!confirm('Excluir este agendamento?')) return
    await supabase.from('agenda_tecnico').delete().eq('id', itemId)
    setAgenda((prev) => prev.filter((a) => a.id !== itemId))
  }

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#1E3A5F', margin: 0 }}>
          <Calendar size={22} style={{ verticalAlign: 'middle', marginRight: 8 }} />
          Agenda dos Técnicos
        </h1>
        <button onClick={() => openNewForm()} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 10,
          padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          <Plus size={16} /> Agendar
        </button>
      </div>

      {/* Week nav + filter */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: '#fff', borderRadius: 10, padding: '6px 12px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        }}>
          <button onClick={() => setSemanaOffset((s) => s - 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <ChevronLeft size={18} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 140, textAlign: 'center' }}>
            {new Date(semana[0] + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} - {new Date(semana[6] + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <button onClick={() => setSemanaOffset((s) => s + 1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <ChevronRight size={18} />
          </button>
          {semanaOffset !== 0 && (
            <button onClick={() => setSemanaOffset(0)} style={{ background: '#EFF6FF', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: '#1E3A5F', cursor: 'pointer' }}>
              Hoje
            </button>
          )}
        </div>

        <select
          value={filtroTecnico}
          onChange={(e) => setFiltroTecnico(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }}
        >
          <option value="">Todos os técnicos</option>
          {tecnicos.map((t) => (
            <option key={t.user_id} value={t.tecnico_nome}>{t.tecnico_nome}</option>
          ))}
        </select>
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9CA3AF' }}>Carregando...</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ width: 120, padding: '10px 8px', fontSize: 12, fontWeight: 600, color: '#6B7280', textAlign: 'left', borderBottom: '2px solid #E5E7EB' }}>
                  Técnico
                </th>
                {semana.map((dia, i) => {
                  const isHoje = dia === hojeStr
                  return (
                    <th key={dia} style={{
                      padding: '10px 4px', fontSize: 12, fontWeight: 600,
                      textAlign: 'center', borderBottom: '2px solid #E5E7EB',
                      background: isHoje ? '#EFF6FF' : 'transparent',
                      color: isHoje ? '#1E3A5F' : '#6B7280',
                    }}>
                      <div>{diasNomes[i]}</div>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>
                        {new Date(dia + 'T12:00:00').getDate()}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {tecnicosFiltrados.map((tec) => (
                <tr key={tec.user_id}>
                  <td style={{
                    padding: '8px', fontSize: 12, fontWeight: 600, color: '#1F2937',
                    borderBottom: '1px solid #F3F4F6', verticalAlign: 'top',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={14} color="#6B7280" />
                      {tec.tecnico_nome}
                    </div>
                  </td>
                  {semana.map((dia) => {
                    const isHoje = dia === hojeStr
                    const items = agenda.filter(
                      (a) => a.tecnico_nome === tec.tecnico_nome && a.data_agendada === dia
                    )
                    return (
                      <td key={dia} style={{
                        padding: 4, borderBottom: '1px solid #F3F4F6',
                        verticalAlign: 'top', background: isHoje ? '#F0F9FF' : 'transparent',
                        minWidth: 90,
                      }}>
                        {items.map((item) => {
                          const turno = TURNOS[item.turno as keyof typeof TURNOS]
                          return (
                            <div key={item.id} style={{
                              background: '#fff', borderRadius: 6, padding: '6px 8px',
                              marginBottom: 4, fontSize: 11, lineHeight: 1.4,
                              borderLeft: `3px solid ${STATUS_COLORS[item.status] || '#9CA3AF'}`,
                              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
                              cursor: 'pointer', position: 'relative',
                            }}
                            onClick={() => openEditForm(item)}
                            >
                              {item.id_ordem ? (
                                <div style={{ fontWeight: 700, color: '#1E3A5F' }}>{item.id_ordem}</div>
                              ) : (
                                <div style={{ fontWeight: 700, color: '#D97706', fontSize: 10, letterSpacing: '0.3px' }}>MANUAL</div>
                              )}
                              {item.cliente && (
                                <div style={{ color: '#374151', fontWeight: 500 }}>{item.cliente}</div>
                              )}
                              {!item.id_ordem && item.descricao && (
                                <div style={{ color: '#6B7280', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 120 }} title={item.descricao}>{item.descricao}</div>
                              )}
                              <div style={{ color: turno?.color, fontWeight: 600 }}>
                                {turno?.label}
                                {item.hora_inicio ? ` ${item.hora_inicio}` : ''}
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); excluir(item.id) }}
                                style={{
                                  position: 'absolute', top: 2, right: 2,
                                  background: 'none', border: 'none', cursor: 'pointer',
                                  padding: 2, opacity: 0.4,
                                }}
                                title="Excluir"
                              >
                                <Trash2 size={10} color="#EF4444" />
                              </button>
                            </div>
                          )
                        })}
                        <button
                          onClick={() => openNewForm(tec.tecnico_nome, dia)}
                          style={{
                            width: '100%', padding: 4, border: '1px dashed #D1D5DB',
                            borderRadius: 4, background: 'transparent', cursor: 'pointer',
                            fontSize: 11, color: '#9CA3AF', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: 2,
                          }}
                        >
                          <Plus size={10} />
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
        }}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 'clamp(16px, 4vw, 24px)', width: '100%', maxWidth: 480,
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1E3A5F', margin: 0 }}>
                {editItem ? 'Editar Agendamento' : 'Novo Agendamento'}
              </h2>
              <button onClick={resetForm} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} color="#6B7280" />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Técnico *</label>
                <select value={formTecnico} onChange={(e) => setFormTecnico(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }}>
                  <option value="">Selecione...</option>
                  {tecnicos.map((t) => (
                    <option key={t.user_id} value={t.tecnico_nome}>{t.tecnico_nome}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>OS Vinculada</label>
                <select value={formOrdem} onChange={(e) => { setFormOrdem(e.target.value); if (e.target.value) { setFormCliente(''); setFormEndereco('') } }} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }}>
                  <option value="">Nenhuma (serviço manual)</option>
                  {osList.map((os) => (
                    <option key={os.Id_Ordem} value={os.Id_Ordem}>
                      {os.Id_Ordem} - {os.Os_Cliente}
                    </option>
                  ))}
                </select>
              </div>

              {/* Campos manuais quando não há OS vinculada */}
              {!formOrdem && (
                <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#D97706', letterSpacing: '0.5px', textTransform: 'uppercase' as const }}>Serviço Manual</div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Cliente</label>
                    <input type="text" value={formCliente} onChange={(e) => setFormCliente(e.target.value)} placeholder="Nome do cliente..." style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Endereço</label>
                    <input type="text" value={formEndereco} onChange={(e) => setFormEndereco(e.target.value)} placeholder="Endereço do serviço..." style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box' }} />
                  </div>
                </div>
              )}

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Data *</label>
                <input type="date" value={formData} onChange={(e) => setFormData(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Turno</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {Object.entries(TURNOS).map(([key, val]) => (
                    <button
                      key={key}
                      onClick={() => setFormTurno(key)}
                      style={{
                        flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                        border: `2px solid ${formTurno === key ? val.color : '#E5E7EB'}`,
                        background: formTurno === key ? val.color + '15' : '#fff',
                        color: formTurno === key ? val.color : '#6B7280',
                        cursor: 'pointer',
                      }}
                    >
                      {val.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Hora Início</label>
                  <input type="time" value={formHoraInicio} onChange={(e) => setFormHoraInicio(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Hora Fim</label>
                  <input type="time" value={formHoraFim} onChange={(e) => setFormHoraFim(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13 }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' }}>Descrição</label>
                <textarea
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  placeholder="Detalhes do serviço..."
                  rows={2}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, resize: 'vertical' }}
                />
              </div>

              <button
                onClick={salvar}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 10,
                  padding: '12px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                <Save size={16} />
                {saving ? 'Salvando...' : editItem ? 'Atualizar' : 'Agendar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
