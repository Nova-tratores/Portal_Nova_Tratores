'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui'
import SemPermissao from '@/components/SemPermissao'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import {
  ClipboardCheck, Plus, Calendar, AlertTriangle, CheckCircle2,
  Clock, X, User, Flag, ChevronDown, Search, Loader2
} from 'lucide-react'

interface PortalUser {
  id: string
  nome: string
  avatar_url: string
  ativo?: boolean
}

interface Tarefa {
  id: number
  titulo: string
  descricao: string
  prazo: string | null
  prioridade: number
  concluida: boolean
  concluida_em: string | null
  criado_por: string
  atribuido_a: string | null
  created_at: string
  updated_at: string
  criador: PortalUser | null
  atribuido: PortalUser | null
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

function formatDate(d: string | null) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('pt-BR')
}

function formatDateRelative(d: string | null) {
  if (!d) return 'Sem prazo'
  const date = new Date(d)
  const now = new Date()
  const diff = Math.ceil((date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return `${Math.abs(diff)} dia(s) atrás`
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  return `${diff} dias`
}

function TarefasPageInner() {
  const { userProfile } = useAuth()
  const { pode, isAdmin } = usePermissoes(userProfile?.id)
  const podeCriar = pode('tarefas', 'criar')
  const podeConcluir = pode('tarefas', 'concluir')
  const [allTarefas, setAllTarefas] = useState<Tarefa[]>([])
  const [users, setUsers] = useState<PortalUser[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'minhas' | 'enviadas' | 'orfas'>('minhas')
  const [showCreate, setShowCreate] = useState(false)
  const [search, setSearch] = useState('')
  const [showConcluidas, setShowConcluidas] = useState(false)
  const [tarefaAberta, setTarefaAberta] = useState<Tarefa | null>(null)

  const carregarTudo = useCallback(async () => {
    if (!userProfile?.id) return
    setLoading(true)
    try {
      const [tarefasRes, usersRes] = await Promise.all([
        fetch(`/api/tarefas?filter=todas&userId=${userProfile.id}`),
        fetch('/api/tarefas/users'),
      ])
      const [tarefas, usersData] = await Promise.all([
        tarefasRes.json(),
        usersRes.json(),
      ])
      setAllTarefas(Array.isArray(tarefas) ? tarefas : [])
      if (Array.isArray(usersData)) setUsers(usersData)
    } catch (err) {
      console.error('Erro ao carregar tarefas:', err)
    } finally {
      setLoading(false)
    }
  }, [userProfile?.id])

  useEffect(() => { carregarTudo() }, [carregarTudo])
  useRefreshOnFocus(carregarTudo)

  // Filtragem 100% client-side
  const tarefasFiltradas = useMemo(() => {
    let filtered = allTarefas

    if (tab === 'orfas') {
      // tarefas ABERTAS de usuário INATIVO ou SEM responsável (rede de segurança do admin)
      filtered = filtered.filter(t => !t.concluida && (t.atribuido_a == null || t.atribuido?.ativo === false))
    } else if (userProfile?.id) {
      if (tab === 'minhas') {
        filtered = filtered.filter(t => t.atribuido_a === userProfile.id)
      } else if (tab === 'enviadas') {
        filtered = filtered.filter(t => t.criado_por === userProfile.id)
      }
    }

    if (!showConcluidas) {
      filtered = filtered.filter(t => t.computed_status !== 'concluida')
    }

    if (search) {
      const s = search.toLowerCase()
      filtered = filtered.filter(t =>
        t.titulo.toLowerCase().includes(s) ||
        t.descricao?.toLowerCase().includes(s) ||
        t.atribuido?.nome?.toLowerCase().includes(s) ||
        t.criador?.nome?.toLowerCase().includes(s)
      )
    }

    return filtered
  }, [allTarefas, userProfile?.id, tab, showConcluidas, search])

  // Marcar concluída com update otimista
  const marcarConcluida = async (id: number, done: boolean) => {
    if (!podeConcluir) return
    setAllTarefas(prev => prev.map(t => {
      if (t.id !== id) return t
      const now = new Date()
      const computed_status = done ? 'concluida' as const
        : (t.prazo && new Date(t.prazo) < now) ? 'atrasada' as const : 'pendente' as const
      return { ...t, concluida: done, computed_status, concluida_em: done ? now.toISOString() : null }
    }))

    try {
      await fetch(`/api/tarefas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done }),
      })
    } catch (err) {
      console.error(err)
      carregarTudo()
    }
  }

  // nº de tarefas órfãs (abertas de usuário inativo ou sem responsável) — badge da aba
  const totalOrfas = useMemo(
    () => allTarefas.filter(t => !t.concluida && (t.atribuido_a == null || t.atribuido?.ativo === false)).length,
    [allTarefas],
  )
  // reatribui UMA tarefa (usa o PATCH que já aceita atribuido_a)
  const reatribuir = async (id: number, para: string) => {
    if (!para) return
    setAllTarefas(prev => prev.map(t => (t.id === id ? { ...t, atribuido_a: para, atribuido: users.find(u => u.id === para) || t.atribuido } : t)))
    try {
      await fetch(`/api/tarefas/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ atribuido_a: para }) })
    } catch (err) { console.error(err); carregarTudo() }
  }

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

          <div style={{ display: 'flex', background: '#f5f5f5', borderRadius: '10px', padding: '3px' }}>
            {(['minhas', 'enviadas', ...(isAdmin ? ['orfas'] as const : [])] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '8px 20px', borderRadius: '8px', border: 'none',
                background: tab === t ? (t === 'orfas' ? '#b45309' : '#dc2626') : 'transparent',
                color: tab === t ? '#fff' : '#737373',
                fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                transition: 'all 0.2s'
              }}>
                {t === 'minhas' ? 'Minhas Tarefas' : t === 'enviadas' ? 'Tarefas Enviadas' : `Órfãs${totalOrfas ? ` (${totalOrfas})` : ''}`}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
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

          <button onClick={() => setShowConcluidas(!showConcluidas)} style={{
            padding: '8px 14px', borderRadius: '8px', border: '1px solid #e5e5e5',
            background: showConcluidas ? '#f0fdf4' : '#fff',
            color: showConcluidas ? '#10b981' : '#737373',
            fontSize: '12px', fontWeight: '500', cursor: 'pointer'
          }}>
            <CheckCircle2 size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Concluídas
          </button>

          <button onClick={() => setShowCreate(true)} {...gateBtn(podeCriar)} style={{
            padding: '10px 20px', borderRadius: '10px', border: 'none',
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 12px rgba(220,38,38,0.25)',
            ...estiloSemPermissao(podeCriar)
          }}>
            <Plus size={18} /> Nova Tarefa
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '24px 32px', maxWidth: '1100px', margin: '0 auto' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#a3a3a3' }}>
            <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
            <p style={{ fontSize: '14px' }}>Carregando tarefas...</p>
          </div>
        ) : tarefasFiltradas.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <ClipboardCheck size={48} color="#e5e5e5" style={{ margin: '0 auto 16px', display: 'block' }} />
            <p style={{ color: '#a3a3a3', fontSize: '15px' }}>
              {search ? 'Nenhuma tarefa encontrada' : tab === 'minhas' ? 'Nenhuma tarefa atribuída a você' : tab === 'orfas' ? 'Nenhuma tarefa órfã 🎉' : 'Você ainda não enviou tarefas'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {tarefasFiltradas.map(t => (
              <div key={t.id}>
                <TarefaCard
                  tarefa={t}
                  onToggleDone={() => marcarConcluida(t.id, !t.concluida)}
                  showAssignee={tab === 'enviadas' || tab === 'orfas'}
                  onClick={() => setTarefaAberta(t)}
                />
                {tab === 'orfas' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
                    <span>{t.atribuido_a == null ? 'sem responsável' : `responsável inativo: ${t.atribuido?.nome || '—'}`} · reatribuir para</span>
                    <select defaultValue="" onChange={(e) => reatribuir(t.id, e.target.value)}
                      style={{ fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 6, padding: '3px 6px', background: '#fff' }}>
                      <option value="">(escolher)</option>
                      {users.filter(u => u.ativo !== false).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {tarefaAberta && (
        <div style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={() => setTarefaAberta(null)} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(6px)' }} />
          <div style={{ position:'relative', background:'#fff', borderRadius:'20px', width:'100%', maxWidth:'600px', padding:'36px', boxShadow:'0 20px 60px rgba(0,0,0,0.15)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'24px' }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap', marginBottom:'8px' }}>
                  <span style={{ fontSize:'11px', fontWeight:'600', color: STATUS_MAP[tarefaAberta.computed_status].color, background: STATUS_MAP[tarefaAberta.computed_status].bg, padding:'4px 12px', borderRadius:'8px', textTransform:'uppercase', display:'inline-flex', alignItems:'center', gap:'4px' }}>
                    {(() => { const I = STATUS_MAP[tarefaAberta.computed_status].icon; return <I size={12} />; })()}
                    {STATUS_MAP[tarefaAberta.computed_status].label}
                  </span>
                  {tarefaAberta.prioridade > 0 && (() => {
                    const p = PRIORITY_MAP[tarefaAberta.prioridade] || PRIORITY_MAP[0]
                    return <span style={{ fontSize:'11px', fontWeight:'600', color:p.color, background:p.bg, padding:'4px 12px', borderRadius:'8px', textTransform:'uppercase' }}>{p.label}</span>
                  })()}
                </div>
                <h2 style={{ fontSize:'20px', fontWeight:'600', margin:0, color:'#1a1a1a', lineHeight:'1.4' }}>{tarefaAberta.titulo}</h2>
              </div>
              <button onClick={() => setTarefaAberta(null)} style={{ background:'#f5f5f5', border:'none', borderRadius:'10px', padding:'8px', cursor:'pointer', display:'flex', flexShrink:0, marginLeft:'16px' }}>
                <X size={18} color="#737373" />
              </button>
            </div>

            {tarefaAberta.descricao && (
              <div style={{ background:'#fafafa', border:'1px solid #f0f0f0', borderRadius:'12px', padding:'20px', marginBottom:'24px' }}>
                <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#a3a3a3', marginBottom:'10px', textTransform:'uppercase', letterSpacing:'0.5px' }}>Descrição</label>
                <p style={{ fontSize:'14px', color:'#374151', lineHeight:'1.8', margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>{tarefaAberta.descricao}</p>
              </div>
            )}

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px' }}>
              {tarefaAberta.criador && (
                <div style={{ background:'#fafafa', borderRadius:'10px', padding:'14px' }}>
                  <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#a3a3a3', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.5px' }}>Criada por</label>
                  <span style={{ fontSize:'14px', color:'#1a1a1a', display:'flex', alignItems:'center', gap:'6px' }}><User size={14} color="#3b82f6" />{tarefaAberta.criador.nome}</span>
                </div>
              )}
              {tarefaAberta.atribuido && (
                <div style={{ background:'#fafafa', borderRadius:'10px', padding:'14px' }}>
                  <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#a3a3a3', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.5px' }}>Atribuída a</label>
                  <span style={{ fontSize:'14px', color:'#1a1a1a', display:'flex', alignItems:'center', gap:'6px' }}><User size={14} color="#10b981" />{tarefaAberta.atribuido.nome}</span>
                </div>
              )}
              {tarefaAberta.prazo && (
                <div style={{ background:'#fafafa', borderRadius:'10px', padding:'14px' }}>
                  <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#a3a3a3', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.5px' }}>Prazo</label>
                  <span style={{ fontSize:'14px', color: tarefaAberta.computed_status === 'atrasada' ? '#ef4444' : '#1a1a1a', display:'flex', alignItems:'center', gap:'6px' }}><Calendar size={14} />{formatDate(tarefaAberta.prazo)} ({formatDateRelative(tarefaAberta.prazo)})</span>
                </div>
              )}
              <div style={{ background:'#fafafa', borderRadius:'10px', padding:'14px' }}>
                <label style={{ display:'block', fontSize:'11px', fontWeight:'600', color:'#a3a3a3', marginBottom:'6px', textTransform:'uppercase', letterSpacing:'0.5px' }}>Criada em</label>
                <span style={{ fontSize:'14px', color:'#1a1a1a' }}>{formatDate(tarefaAberta.created_at)}</span>
              </div>
            </div>

            <div style={{ marginTop:'24px', display:'flex', justifyContent:'center' }}>
              <button onClick={() => { marcarConcluida(tarefaAberta.id, !tarefaAberta.concluida); setTarefaAberta(null); }} style={{
                padding:'12px 28px', borderRadius:'12px', border:'none',
                background: tarefaAberta.concluida ? '#f59e0b' : '#10b981',
                color:'#fff', fontSize:'14px', fontWeight:'600', cursor:'pointer',
                display:'flex', alignItems:'center', gap:'8px',
                boxShadow: `0 4px 12px ${tarefaAberta.concluida ? 'rgba(245,158,11,0.25)' : 'rgba(16,185,129,0.25)'}`,
                transition:'all 0.2s'
              }}>
                <CheckCircle2 size={16} /> {tarefaAberta.concluida ? 'Reabrir Tarefa' : 'Marcar como Concluída'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <CriarTarefaModal
          users={users}
          criadorId={userProfile?.id || ''}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); carregarTudo() }}
        />
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

// ==================== TAREFA CARD ====================

function TarefaCard({ tarefa, onToggleDone, showAssignee, onClick }: {
  tarefa: Tarefa
  onToggleDone: () => void
  showAssignee: boolean
  onClick: () => void
}) {
  const status = STATUS_MAP[tarefa.computed_status]
  const priority = PRIORITY_MAP[tarefa.prioridade] || PRIORITY_MAP[0]
  const StatusIcon = status.icon

  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: '16px',
      padding: '18px 24px', background: '#fff',
      border: `1px solid ${tarefa.computed_status === 'atrasada' ? '#fecaca' : '#f0f0f0'}`,
      borderRadius: '14px',
      borderLeft: `4px solid ${status.color}`,
      transition: 'all 0.15s',
      opacity: tarefa.concluida ? 0.6 : 1,
      cursor: 'pointer'
    }}>
      <button onClick={e => { e.stopPropagation(); onToggleDone(); }} style={{
        width: '28px', height: '28px', borderRadius: '8px', flexShrink: 0,
        border: tarefa.concluida ? 'none' : `2px solid ${status.color}`,
        background: tarefa.concluida ? status.color : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.2s'
      }}>
        {tarefa.concluida && <CheckCircle2 size={16} color="#fff" />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '15px', fontWeight: '500', color: '#1a1a1a',
            textDecoration: tarefa.concluida ? 'line-through' : 'none'
          }}>
            {tarefa.titulo}
          </span>
          {tarefa.prioridade > 0 && (
            <span style={{
              fontSize: '10px', fontWeight: '600', color: priority.color,
              background: priority.bg, padding: '2px 8px', borderRadius: '6px',
              textTransform: 'uppercase'
            }}>
              {priority.label}
            </span>
          )}
        </div>

        {tarefa.descricao && (
          <p style={{
            fontSize: '13px', color: '#737373', margin: '2px 0 0 0',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: '500px'
          }}>
            {tarefa.descricao.slice(0, 120)}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '8px', flexWrap: 'wrap' }}>
          <span style={{
            fontSize: '11px', fontWeight: '600', color: status.color,
            background: status.bg, padding: '3px 10px', borderRadius: '6px',
            display: 'inline-flex', alignItems: 'center', gap: '4px'
          }}>
            <StatusIcon size={12} /> {status.label}
          </span>

          {tarefa.prazo && (
            <span style={{
              fontSize: '12px', color: tarefa.computed_status === 'atrasada' ? '#ef4444' : '#737373',
              display: 'inline-flex', alignItems: 'center', gap: '4px'
            }}>
              <Calendar size={12} />
              {formatDate(tarefa.prazo)} ({formatDateRelative(tarefa.prazo)})
            </span>
          )}

          {showAssignee && tarefa.atribuido && (
            <span style={{
              fontSize: '12px', color: '#3b82f6',
              display: 'inline-flex', alignItems: 'center', gap: '4px'
            }}>
              <User size={12} />
              {tarefa.atribuido.nome}
            </span>
          )}

          {!showAssignee && tarefa.criador && (
            <span style={{
              fontSize: '12px', color: '#a3a3a3',
              display: 'inline-flex', alignItems: 'center', gap: '4px'
            }}>
              <User size={12} />
              Enviada por {tarefa.criador.nome}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ==================== CRIAR TAREFA MODAL ====================

function CriarTarefaModal({ users, criadorId, onClose, onCreated }: {
  users: PortalUser[]
  criadorId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [prazo, setPrazo] = useState('')
  const [prioridade, setPrioridade] = useState(2)
  const [atribuidoA, setAtribuidoA] = useState<string>('')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!titulo.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/tarefas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: titulo.trim(),
          descricao,
          prazo: prazo || undefined,
          prioridade,
          criado_por: criadorId,
          atribuido_a: atribuidoA || undefined,
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
          <div>
            <label style={labelSt}>Título</label>
            <input
              type="text" required value={titulo} onChange={e => setTitulo(e.target.value)}
              placeholder="O que precisa ser feito?"
              style={inputSt}
            />
          </div>

          <div>
            <label style={labelSt}>Descrição (opcional)</label>
            <textarea
              value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="Detalhes da tarefa..."
              rows={3}
              style={{ ...inputSt, resize: 'none', minHeight: '80px' }}
            />
          </div>

          <div>
            <label style={labelSt}>Atribuir para</label>
            <div style={{ position: 'relative' }}>
              <User size={16} color="#a3a3a3" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
              <select
                value={atribuidoA} onChange={e => setAtribuidoA(e.target.value)}
                style={{ ...inputSt, paddingLeft: '40px', appearance: 'none', cursor: 'pointer' }}
              >
                <option value="">Selecionar usuário...</option>
                {users.map(u => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
              <ChevronDown size={16} color="#a3a3a3" style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <label style={labelSt}>Prazo</label>
              <div style={{ position: 'relative' }}>
                <Calendar size={16} color="#a3a3a3" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="date" value={prazo} onChange={e => setPrazo(e.target.value)}
                  style={{ ...inputSt, paddingLeft: '40px' }}
                />
              </div>
            </div>

            <div>
              <label style={labelSt}>Prioridade</label>
              <div style={{ position: 'relative' }}>
                <Flag size={16} color="#a3a3a3" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                <select
                  value={prioridade} onChange={e => setPrioridade(parseInt(e.target.value))}
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

          <button type="submit" disabled={saving || !titulo.trim()} style={{
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

// ==================== PAGE WRAPPER ====================

export default function TarefasPage() {
  const { userProfile, loading: authLoading } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)

  if (authLoading || loadingPerm) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
      <Loader2 size={24} color="#dc2626" style={{ animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )

  if (userProfile && !temAcesso('tarefas')) return <SemPermissao />

  return <TarefasPageInner />
}
