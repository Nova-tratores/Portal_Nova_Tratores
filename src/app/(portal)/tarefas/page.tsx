'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import {
  ClipboardCheck, Plus, Calendar, AlertTriangle, CheckCircle2,
  Clock, X, User, Flag, ChevronDown, Search, Loader2
} from 'lucide-react'

interface VikunjaUser {
  id: number
  username: string
  name: string
}

interface Tarefa {
  id: number
  title: string
  description: string
  due_date: string
  priority: number
  done: boolean
  done_at: string
  assignees: VikunjaUser[] | null
  created_by: VikunjaUser
  created: string
  updated: string
  computed_status: 'pendente' | 'atrasada' | 'concluida'
}

const PRIORITY_MAP: Record<number, { label: string; color: string; bg: string }> = {
  0: { label: 'Sem prioridade', color: '#a3a3a3', bg: '#f5f5f5' },
  1: { label: 'Baixa', color: '#3b82f6', bg: '#eff6ff' },
  2: { label: 'Normal', color: '#f59e0b', bg: '#fffbeb' },
  3: { label: 'Alta', color: '#f97316', bg: '#fff7ed' },
  4: { label: 'Urgente', color: '#ef4444', bg: '#fef2f2' },
  5: { label: 'Crítica', color: '#dc2626', bg: '#fef2f2' },
}

const STATUS_MAP = {
  pendente: { label: 'Pendente', color: '#f59e0b', bg: '#fffbeb', icon: Clock },
  atrasada: { label: 'Atrasada', color: '#ef4444', bg: '#fef2f2', icon: AlertTriangle },
  concluida: { label: 'Concluída', color: '#10b981', bg: '#f0fdf4', icon: CheckCircle2 },
}

function formatDate(d: string) {
  if (!d || d.startsWith('0001')) return ''
  return new Date(d).toLocaleDateString('pt-BR')
}

function formatDateRelative(d: string) {
  if (!d || d.startsWith('0001')) return 'Sem prazo'
  const date = new Date(d)
  const now = new Date()
  const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return `${Math.abs(diff)} dia(s) atrás`
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  return `${diff} dias`
}

export default function TarefasPage() {
  const { userProfile, loading: authLoading } = useAuth()
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [vikunjaUsers, setVikunjaUsers] = useState<VikunjaUser[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'minhas' | 'enviadas'>('minhas')
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [meuVikunjaId, setMeuVikunjaId] = useState<number | null>(null)
  const [showConcluidas, setShowConcluidas] = useState(false)

  // Carregar usuários do Vikunja e detectar o meu ID
  useEffect(() => {
    if (!userProfile) return
    fetch('/api/tarefas/users')
      .then(r => r.json())
      .then((users: VikunjaUser[]) => {
        setVikunjaUsers(users)
        // Tentar mapear por nome similar
        const nome = userProfile.nome?.toLowerCase() || ''
        const match = users.find(u =>
          u.username.toLowerCase() === nome ||
          u.name?.toLowerCase() === nome ||
          u.username.toLowerCase().includes(nome.split(' ')[0]?.toLowerCase()) ||
          nome.includes(u.username.toLowerCase())
        )
        if (match) setMeuVikunjaId(match.id)
      })
      .catch(console.error)
  }, [userProfile])

  const carregarTarefas = useCallback(async () => {
    if (meuVikunjaId === null) return
    setLoading(true)
    try {
      const res = await fetch(`/api/tarefas?filter=${tab}&vikunjaUserId=${meuVikunjaId}`)
      const data = await res.json()
      setTarefas(Array.isArray(data) ? data : [])
    } catch (err) {
      console.error('Erro ao carregar tarefas:', err)
    } finally {
      setLoading(false)
    }
  }, [tab, meuVikunjaId])

  useEffect(() => { carregarTarefas() }, [carregarTarefas])

  // Refresh ao voltar para a aba
  useRefreshOnFocus(carregarTarefas);

  const marcarConcluida = async (id: number, done: boolean) => {
    try {
      await fetch(`/api/tarefas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done }),
      })
      carregarTarefas()
    } catch (err) {
      console.error(err)
    }
  }

  const tarefasFiltradas = tarefas.filter(t => {
    if (!showConcluidas && t.computed_status === 'concluida') return false
    if (search) {
      const s = search.toLowerCase()
      return t.title.toLowerCase().includes(s) ||
        t.description?.toLowerCase().includes(s) ||
        t.assignees?.some(a => a.username.toLowerCase().includes(s))
    }
    return true
  })

  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
      <Loader2 size={24} color="#dc2626" style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  )

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', color: '#1a1a1a' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: '84px', zIndex: 30,
        background: '#fff', borderBottom: '1px solid #f0f0f0',
        padding: '16px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '16px', flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ClipboardCheck size={22} color="#dc2626" />
            <h1 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Tarefas</h1>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', background: '#f5f5f5', borderRadius: '10px', padding: '3px' }}>
            {(['minhas', 'enviadas'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '8px 20px', borderRadius: '8px', border: 'none',
                background: tab === t ? '#dc2626' : 'transparent',
                color: tab === t ? '#fff' : '#737373',
                fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                transition: 'all 0.2s'
              }}>
                {t === 'minhas' ? 'Minhas Tarefas' : 'Tarefas Enviadas'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Search */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: '#f5f5f5', borderRadius: '10px', padding: '8px 14px'
          }}>
            <Search size={16} color="#a3a3a3" />
            <input
              type="text" placeholder="Buscar tarefa..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                border: 'none', background: 'none', outline: 'none',
                fontSize: '13px', color: '#1a1a1a', width: '160px'
              }}
            />
          </div>

          {/* Toggle concluídas */}
          <button onClick={() => setShowConcluidas(!showConcluidas)} style={{
            padding: '8px 14px', borderRadius: '8px', border: '1px solid #e5e5e5',
            background: showConcluidas ? '#f0fdf4' : '#fff',
            color: showConcluidas ? '#10b981' : '#737373',
            fontSize: '12px', fontWeight: '500', cursor: 'pointer'
          }}>
            <CheckCircle2 size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Concluídas
          </button>

          {/* Botão criar */}
          <button onClick={() => setShowCreate(true)} style={{
            padding: '10px 20px', borderRadius: '10px', border: 'none',
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 12px rgba(220,38,38,0.25)'
          }}>
            <Plus size={18} /> Nova Tarefa
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '24px 32px', maxWidth: '1100px', margin: '0 auto' }}>
        {meuVikunjaId === null && !loading && (
          <div style={{
            padding: '24px', background: '#fffbeb', border: '1px solid #fde68a',
            borderRadius: '12px', marginBottom: '20px', fontSize: '14px', color: '#92400e'
          }}>
            <AlertTriangle size={16} style={{ verticalAlign: 'middle', marginRight: '8px' }} />
            Seu usuário do portal não foi vinculado ao Vikunja. Tarefas podem não aparecer corretamente.
          </div>
        )}

        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#a3a3a3' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ fontSize: '14px' }}>Carregando tarefas...</p>
          </div>
        ) : tarefasFiltradas.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <ClipboardCheck size={48} color="#e5e5e5" style={{ margin: '0 auto 16px', display: 'block' }} />
            <p style={{ color: '#a3a3a3', fontSize: '15px' }}>
              {search ? 'Nenhuma tarefa encontrada' : tab === 'minhas' ? 'Nenhuma tarefa atribuída a você' : 'Você ainda não enviou tarefas'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {tarefasFiltradas.map(t => (
              <TarefaCard
                key={t.id}
                tarefa={t}
                onToggleDone={() => marcarConcluida(t.id, !t.done)}
                showAssignee={tab === 'enviadas'}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal Criar */}
      {showCreate && (
        <CriarTarefaModal
          vikunjaUsers={vikunjaUsers}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); carregarTarefas() }}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ==================== TAREFA CARD ====================

function TarefaCard({ tarefa, onToggleDone, showAssignee }: {
  tarefa: Tarefa
  onToggleDone: () => void
  showAssignee: boolean
}) {
  const status = STATUS_MAP[tarefa.computed_status]
  const priority = PRIORITY_MAP[tarefa.priority] || PRIORITY_MAP[0]
  const StatusIcon = status.icon
  const hasDueDate = tarefa.due_date && !tarefa.due_date.startsWith('0001')

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '16px',
      padding: '18px 24px', background: '#fff',
      border: `1px solid ${tarefa.computed_status === 'atrasada' ? '#fecaca' : '#f0f0f0'}`,
      borderRadius: '14px',
      borderLeft: `4px solid ${status.color}`,
      transition: 'all 0.15s',
      opacity: tarefa.done ? 0.6 : 1
    }}>
      {/* Checkbox */}
      <button onClick={onToggleDone} style={{
        width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
        border: tarefa.done ? 'none' : `2px solid ${status.color}`,
        background: tarefa.done ? status.color : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s'
      }}>
        {tarefa.done && <CheckCircle2 size={16} color="#fff" />}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '15px', fontWeight: '500', color: '#1a1a1a',
            textDecoration: tarefa.done ? 'line-through' : 'none'
          }}>
            {tarefa.title}
          </span>
          {tarefa.priority > 0 && (
            <span style={{
              fontSize: '10px', fontWeight: '600', color: priority.color,
              background: priority.bg, padding: '2px 8px', borderRadius: '6px',
              textTransform: 'uppercase'
            }}>
              {priority.label}
            </span>
          )}
        </div>

        {tarefa.description && (
          <p style={{
            fontSize: '13px', color: '#737373', margin: '2px 0 0 0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: '500px'
          }}>
            {tarefa.description.replace(/<[^>]+>/g, '').slice(0, 120)}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '8px', flexWrap: 'wrap' }}>
          {/* Status */}
          <span style={{
            fontSize: '11px', fontWeight: '600', color: status.color,
            background: status.bg, padding: '3px 10px', borderRadius: '6px',
            display: 'inline-flex', alignItems: 'center', gap: '4px'
          }}>
            <StatusIcon size={12} /> {status.label}
          </span>

          {/* Due date */}
          {hasDueDate && (
            <span style={{
              fontSize: '12px', color: tarefa.computed_status === 'atrasada' ? '#ef4444' : '#737373',
              display: 'inline-flex', alignItems: 'center', gap: '4px'
            }}>
              <Calendar size={12} />
              {formatDate(tarefa.due_date)} ({formatDateRelative(tarefa.due_date)})
            </span>
          )}

          {/* Assignee */}
          {showAssignee && tarefa.assignees?.length ? (
            <span style={{
              fontSize: '12px', color: '#3b82f6',
              display: 'inline-flex', alignItems: 'center', gap: '4px'
            }}>
              <User size={12} />
              {tarefa.assignees.map(a => a.username).join(', ')}
            </span>
          ) : null}

          {/* Criador */}
          {!showAssignee && tarefa.created_by && (
            <span style={{
              fontSize: '12px', color: '#a3a3a3',
              display: 'inline-flex', alignItems: 'center', gap: '4px'
            }}>
              <User size={12} />
              Enviada por {tarefa.created_by.username}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ==================== CRIAR TAREFA MODAL ====================

function CriarTarefaModal({ vikunjaUsers, onClose, onCreated }: {
  vikunjaUsers: VikunjaUser[]
  onClose: () => void
  onCreated: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState(2)
  const [assigneeId, setAssigneeId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/tarefas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description,
          due_date: dueDate || undefined,
          priority,
          assignee_vikunja_id: assigneeId,
        }),
      })
      if (!res.ok) throw new Error('Erro ao criar tarefa')
      onCreated()
    } catch (err) {
      alert('Erro ao criar tarefa')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)'
      }} />
      <div style={{
        position: 'relative', background: '#fff', borderRadius: '20px',
        width: '100%', maxWidth: '520px', padding: '32px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        maxHeight: '90vh', overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', margin: 0 }}>Nova Tarefa</h2>
          <button onClick={onClose} style={{
            background: '#f5f5f5', border: 'none', borderRadius: '10px',
            padding: '8px', cursor: 'pointer', display: 'flex'
          }}><X size={18} color="#737373" /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Título */}
          <div>
            <label style={labelSt}>Título</label>
            <input
              type="text" required value={title} onChange={e => setTitle(e.target.value)}
              placeholder="O que precisa ser feito?"
              style={inputSt}
            />
          </div>

          {/* Descrição */}
          <div>
            <label style={labelSt}>Descrição (opcional)</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Detalhes da tarefa..."
              rows={3}
              style={{ ...inputSt, resize: 'none', minHeight: '80px' }}
            />
          </div>

          {/* Atribuir para */}
          <div>
            <label style={labelSt}>Atribuir para</label>
            <div style={{ position: 'relative' }}>
              <User size={16} color="#a3a3a3" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <select
                value={assigneeId ?? ''} onChange={e => setAssigneeId(e.target.value ? parseInt(e.target.value) : null)}
                style={{ ...inputSt, paddingLeft: '40px', appearance: 'none', cursor: 'pointer' }}
              >
                <option value="">Selecionar usuário...</option>
                {vikunjaUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.username}{u.name ? ` (${u.name})` : ''}</option>
                ))}
              </select>
              <ChevronDown size={16} color="#a3a3a3" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* Data */}
            <div>
              <label style={labelSt}>Prazo</label>
              <div style={{ position: 'relative' }}>
                <Calendar size={16} color="#a3a3a3" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
                  style={{ ...inputSt, paddingLeft: '40px' }}
                />
              </div>
            </div>

            {/* Prioridade */}
            <div>
              <label style={labelSt}>Prioridade</label>
              <div style={{ position: 'relative' }}>
                <Flag size={16} color="#a3a3a3" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <select
                  value={priority} onChange={e => setPriority(parseInt(e.target.value))}
                  style={{ ...inputSt, paddingLeft: '40px', appearance: 'none', cursor: 'pointer' }}
                >
                  <option value={0}>Sem prioridade</option>
                  <option value={1}>Baixa</option>
                  <option value={2}>Normal</option>
                  <option value={3}>Alta</option>
                  <option value={4}>Urgente</option>
                  <option value={5}>Crítica</option>
                </select>
                <ChevronDown size={16} color="#a3a3a3" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              </div>
            </div>
          </div>

          <button type="submit" disabled={saving || !title.trim()} style={{
            padding: '14px', borderRadius: '12px', border: 'none',
            background: saving ? '#e5e5e5' : 'linear-gradient(135deg, #dc2626, #b91c1c)',
            color: saving ? '#a3a3a3' : '#fff',
            fontSize: '14px', fontWeight: '600', cursor: saving ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            boxShadow: saving ? 'none' : '0 4px 12px rgba(220,38,38,0.25)',
            transition: 'all 0.2s'
          }}>
            {saving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Criando...</> : <><Plus size={18} /> Criar Tarefa</>}
          </button>
        </form>
      </div>
    </div>
  )
}

// Estilos
const labelSt: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: '600', color: '#737373',
  marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px'
}
const inputSt: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: '10px',
  border: '1px solid #e5e5e5', outline: 'none', background: '#fafafa',
  color: '#1a1a1a', fontSize: '14px', fontFamily: 'Montserrat, sans-serif',
  transition: '0.2s', boxSizing: 'border-box'
}
