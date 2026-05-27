'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  Shield, Users, Check, X, Search, ChevronDown,
  User as UserIcon, Lock, Unlock, Wrench, UserPlus, Eye, EyeOff
} from 'lucide-react'

const MODULOS = [
  { id: 'financeiro', label: 'Financeiro', color: '#dc2626' },
  { id: 'requisicoes', label: 'Requisições', color: '#ef4444' },
  { id: 'revisoes', label: 'Revisões', color: '#b91c1c' },
  { id: 'pos', label: 'Pós-Vendas', color: '#dc2626' },
  { id: 'ppv', label: 'Peças (PPV)', color: '#ef4444' },
  { id: 'garantias', label: 'Garantias', color: '#0ea5e9' },
  { id: 'propostas', label: 'Propostas', color: '#991b1b' },
  { id: 'orcamentos', label: 'Orçamentos', color: '#ef4444' },
  { id: 'tarefas', label: 'Tarefas', color: '#dc2626' },
  { id: 'atividades', label: 'Atividades', color: '#dc2626' },
  { id: 'mecanicos', label: 'Janela Mecanico', color: '#1d4ed8' },
  { id: 'painel-mecanicos', label: 'Painel Mecânicos (legado)', color: '#94a3b8' },
  { id: 'mapa', label: 'Mapeamento Tecnico', color: '#b91c1c' },
  { id: 'fotos-tecnicos', label: 'Fotos Técnicos', color: '#dc2626' },
  { id: 'estoque', label: 'Visual Estoque', color: '#991b1b' },
  { id: 'visual-estoque', label: 'Consulta Omie', color: '#7f1d1d' },
  { id: 'avisos', label: 'Avisos', color: '#dc2626' },
  { id: 'dashboard-agro', label: 'Dashboard Agro', color: '#16a34a' },
  { id: 'dre', label: 'DRE Financeiro', color: '#dc2626' },
  { id: 'back-nova', label: 'Back Nova', color: '#dc2626' },
]

const CATEGORIAS = ['Pós Vendas', 'Peças', 'Comercial', 'Financeiro']

interface Usuario {
  id: string
  nome: string
  funcao: string
  avatar_url: string
  email: string
}

interface Permissao {
  id?: string
  user_id: string
  is_admin: boolean
  categoria: string
  modulos_permitidos: string[]
  mecanico_role: 'tecnico' | 'observador' | null
  mecanico_tecnico_nome: string | null
}

export default function AdminPage() {
  const { userProfile } = useAuth()
  const { isAdmin, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const router = useRouter()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [permissoes, setPermissoes] = useState<Record<string, Permissao>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showNovoUsuario, setShowNovoUsuario] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novoSenha, setNovoSenha] = useState('nova123')
  const [novoFuncao, setNovoFuncao] = useState('')
  const [novoModulos, setNovoModulos] = useState<string[]>([])
  const [showSenha, setShowSenha] = useState(false)
  const [criando, setCriando] = useState(false)
  const [criarErro, setCriarErro] = useState('')

  useEffect(() => {
    if (!loadingPerm && !isAdmin && userProfile) {
      router.push('/dashboard')
    }
  }, [loadingPerm, isAdmin, userProfile, router])

  const carregar = async () => {
    const { data: users } = await supabase.from('financeiro_usu').select('id, nome, funcao, avatar_url, email').order('nome')
    setUsuarios(users || [])

    const { data: perms } = await supabase.from('portal_permissoes').select('*')
    const map: Record<string, Permissao> = {}
    ;(perms || []).forEach((p: Permissao) => { map[p.user_id] = p })
    setPermissoes(map)

    setLoading(false)
  }

  useEffect(() => {
    if (!isAdmin) return
    carregar()
  }, [isAdmin])

  const salvar = async (userId: string, updates: Partial<Permissao>) => {
    setSaving(userId)
    const existing = permissoes[userId]

    // Update otimista — atualiza UI imediatamente
    setPermissoes(prev => {
      const base: Permissao = prev[userId] ?? { user_id: userId, is_admin: false, categoria: '', modulos_permitidos: [], mecanico_role: null, mecanico_tecnico_nome: null }
      return { ...prev, [userId]: { ...base, ...updates } }
    })

    try {
      if (existing?.id) {
        await supabase.from('portal_permissoes').update({ ...updates, updated_at: new Date().toISOString() }).eq('user_id', userId)
      } else {
        await supabase.from('portal_permissoes').insert([{
          user_id: userId,
          is_admin: false,
          categoria: '',
          modulos_permitidos: [],
          mecanico_role: null,
          mecanico_tecnico_nome: null,
          ...updates,
        }])
      }
    } catch {
      // Reverte em caso de erro
      const { data: perms } = await supabase.from('portal_permissoes').select('*')
      const map: Record<string, Permissao> = {}
      ;(perms || []).forEach((p: Permissao) => { map[p.user_id] = p })
      setPermissoes(map)
    }
    setSaving(null)
  }

  const toggleModulo = (userId: string, modulo: string) => {
    const perm = permissoes[userId]
    const current = perm?.modulos_permitidos || []
    const updated = current.includes(modulo)
      ? current.filter(m => m !== modulo)
      : [...current, modulo]
    salvar(userId, { modulos_permitidos: updated })
  }

  const toggleAdmin = (userId: string) => {
    const perm = permissoes[userId]
    salvar(userId, { is_admin: !(perm?.is_admin) })
  }

  const setCategoria = (userId: string, cat: string) => {
    salvar(userId, { categoria: cat })
  }

  const setMecanicoRole = (userId: string, role: string) => {
    const newRole = role === '' ? null : role as 'tecnico' | 'observador'
    const updates: Partial<Permissao> = { mecanico_role: newRole }

    // Preencher automaticamente com o nome do usuário do portal
    const user = usuarios.find(u => u.id === userId)
    if (newRole && user) {
      updates.mecanico_tecnico_nome = user.nome
    }

    // Limpar técnico vinculado se removeu o papel
    if (!newRole) {
      updates.mecanico_tecnico_nome = null
    }

    // Auto-adicionar módulo painel-mecanicos quando atribui papel
    if (newRole) {
      const perm = permissoes[userId]
      const modulos = perm?.modulos_permitidos || []
      if (!modulos.includes('painel-mecanicos')) {
        updates.modulos_permitidos = [...modulos, 'painel-mecanicos']
      }
    }

    salvar(userId, updates)
  }

  const toggleTodos = (userId: string) => {
    const perm = permissoes[userId]
    const current = perm?.modulos_permitidos || []
    const allModulos = MODULOS.map(m => m.id)
    const hasAll = allModulos.every(m => current.includes(m))
    salvar(userId, { modulos_permitidos: hasAll ? [] : allModulos })
  }

  const criarUsuario = async () => {
    if (!novoNome.trim() || !novoEmail.trim()) { setCriarErro('Nome e email são obrigatórios'); return }
    if (novoSenha.length < 6) { setCriarErro('Senha deve ter no mínimo 6 caracteres'); return }
    setCriando(true)
    setCriarErro('')
    try {
      const res = await fetch('/api/pos/requisicoes/criar-usuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: novoNome.trim(),
          email: novoEmail.trim().toLowerCase(),
          funcao: novoFuncao.trim(),
          senha: novoSenha,
          modulos_permitidos: novoModulos,
        }),
      })
      const result = await res.json()
      if (!res.ok) { setCriarErro(result.error || 'Erro ao criar usuário'); setCriando(false); return }
      setShowNovoUsuario(false)
      setNovoNome(''); setNovoEmail(''); setNovoSenha('nova123'); setNovoFuncao(''); setNovoModulos([])
      await carregar()
    } catch (err: any) {
      setCriarErro(err.message || 'Erro desconhecido')
    } finally {
      setCriando(false)
    }
  }

  const toggleNovoModulo = (modId: string) => {
    setNovoModulos(prev => prev.includes(modId) ? prev.filter(m => m !== modId) : [...prev, modId])
  }

  const filteredUsuarios = usuarios.filter(u =>
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    u.funcao?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  )

  if (loadingPerm || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <p style={{ color: '#a3a3a3', fontSize: '13px', letterSpacing: '3px' }}>CARREGANDO...</p>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div style={{ padding: '32px 40px', fontFamily: 'Inter, sans-serif', background: 'var(--portal-bg)', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px',
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Shield size={24} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: '800', color: 'var(--portal-text)', margin: 0 }}>
              Administração
            </h2>
            <p style={{ fontSize: '14px', color: '#a3a3a3', margin: 0 }}>
              Gerencie os acessos e permissões dos usuários do portal
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '32px' }}>
        {[
          { label: 'TOTAL USUÁRIOS', value: usuarios.length, icon: <Users size={20} /> },
          { label: 'ADMINISTRADORES', value: Object.values(permissoes).filter(p => p.is_admin).length, icon: <Shield size={20} /> },
          { label: 'MECÂNICOS APP', value: Object.values(permissoes).filter(p => p.mecanico_role).length, icon: <Wrench size={20} /> },
          { label: 'SEM ACESSO', value: usuarios.filter(u => !permissoes[u.id] || (permissoes[u.id].modulos_permitidos || []).length === 0).length, icon: <Lock size={20} /> },
        ].map((stat, i) => (
          <div key={i} style={{
            padding: '20px 24px', borderRadius: '16px',
            background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626'
              }}>
                {stat.icon}
              </div>
              <div>
                <p style={{ fontSize: '11px', color: '#a3a3a3', fontWeight: '600', letterSpacing: '1px', marginBottom: '2px' }}>{stat.label}</p>
                <p style={{ fontSize: '22px', fontWeight: '800', color: 'var(--portal-text)' }}>{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Novo Usuário */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <div style={{ position: 'relative', width: '360px' }}>
          <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
          <input
            type="text"
            placeholder="Buscar usuário..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%', padding: '10px 14px 10px 40px', borderRadius: '12px',
              background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', color: 'var(--portal-text)',
              fontSize: '14px', outline: 'none', fontFamily: 'Inter'
            }}
          />
        </div>
        <button
          onClick={() => { setShowNovoUsuario(true); setCriarErro('') }}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 20px', borderRadius: '12px', border: 'none',
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff',
            fontSize: '14px', fontWeight: '700', cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(220,38,38,0.25)', transition: 'all 0.2s'
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)' }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)' }}
        >
          <UserPlus size={18} /> Novo Usuário
        </button>
      </div>

      {/* Modal Criar Usuário */}
      {showNovoUsuario && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !criando) setShowNovoUsuario(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)', zIndex: 50000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <div style={{
            background: 'var(--portal-bg-card)', borderRadius: '24px', width: '560px',
            padding: '40px', boxShadow: '0 25px 60px rgba(0,0,0,0.15)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <UserPlus size={22} color="#fff" />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--portal-text)', margin: 0 }}>Novo Usuário</h3>
                  <p style={{ fontSize: '12px', color: '#a3a3a3', margin: 0 }}>Criar conta de acesso ao portal</p>
                </div>
              </div>
              {!criando && (
                <button onClick={() => setShowNovoUsuario(false)} style={{
                  background: '#f5f5f5', border: 'none', borderRadius: '10px',
                  width: '36px', height: '36px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', color: '#737373'
                }}>
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Campos */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#525252', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>NOME COMPLETO *</label>
                <input
                  value={novoNome} onChange={e => setNovoNome(e.target.value)}
                  placeholder="Ex: João da Silva"
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: '12px',
                    border: '1px solid #e5e5e5', fontSize: '14px', color: 'var(--portal-text)',
                    outline: 'none', fontFamily: 'Inter', boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#525252', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>EMAIL *</label>
                  <input
                    value={novoEmail} onChange={e => setNovoEmail(e.target.value)}
                    type="email" placeholder="email@empresa.com"
                    style={{
                      width: '100%', padding: '12px 16px', borderRadius: '12px',
                      border: '1px solid #e5e5e5', fontSize: '14px', color: 'var(--portal-text)',
                      outline: 'none', fontFamily: 'Inter', boxSizing: 'border-box'
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '12px', fontWeight: '700', color: '#525252', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>FUNÇÃO</label>
                  <input
                    value={novoFuncao} onChange={e => setNovoFuncao(e.target.value)}
                    placeholder="Ex: Vendedor"
                    style={{
                      width: '100%', padding: '12px 16px', borderRadius: '12px',
                      border: '1px solid #e5e5e5', fontSize: '14px', color: 'var(--portal-text)',
                      outline: 'none', fontFamily: 'Inter', boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
              <div>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#525252', letterSpacing: '0.5px', display: 'block', marginBottom: '6px' }}>SENHA</label>
                <div style={{ position: 'relative' }}>
                  <input
                    value={novoSenha} onChange={e => setNovoSenha(e.target.value)}
                    type={showSenha ? 'text' : 'password'}
                    placeholder="Mínimo 6 caracteres"
                    style={{
                      width: '100%', padding: '12px 48px 12px 16px', borderRadius: '12px',
                      border: '1px solid #e5e5e5', fontSize: '14px', color: 'var(--portal-text)',
                      outline: 'none', fontFamily: 'Inter', boxSizing: 'border-box'
                    }}
                  />
                  <button
                    type="button" onClick={() => setShowSenha(!showSenha)}
                    style={{
                      position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', color: '#a3a3a3',
                      display: 'flex', padding: '4px'
                    }}
                  >
                    {showSenha ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: '#a3a3a3', margin: '4px 0 0 0' }}>Padrão: nova123</p>
              </div>
            </div>

            {/* Módulos de acesso */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#525252', letterSpacing: '0.5px' }}>MÓDULOS DE ACESSO</label>
                <button
                  onClick={() => setNovoModulos(prev => prev.length === MODULOS.length ? [] : MODULOS.map(m => m.id))}
                  style={{
                    fontSize: '11px', fontWeight: '600', color: '#dc2626', background: 'none',
                    border: 'none', cursor: 'pointer', padding: '2px 6px'
                  }}
                >
                  {novoModulos.length === MODULOS.length ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {MODULOS.map(mod => {
                  const active = novoModulos.includes(mod.id)
                  return (
                    <button
                      key={mod.id}
                      onClick={() => toggleNovoModulo(mod.id)}
                      style={{
                        padding: '7px 14px', borderRadius: '10px',
                        border: active ? '1px solid #fecaca' : '1px solid #e5e5e5',
                        background: active ? '#fef2f2' : 'var(--portal-bg-secondary)',
                        color: active ? '#dc2626' : '#a3a3a3',
                        fontSize: '12px', fontWeight: '700', cursor: 'pointer',
                        transition: '0.15s'
                      }}
                    >
                      {mod.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Erro */}
            {criarErro && (
              <div style={{
                padding: '10px 16px', borderRadius: '10px', marginBottom: '16px',
                background: '#fef2f2', border: '1px solid #fecaca',
                fontSize: '13px', color: '#dc2626', fontWeight: '500'
              }}>
                {criarErro}
              </div>
            )}

            {/* Botão */}
            <button
              onClick={criarUsuario}
              disabled={criando}
              style={{
                width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                background: criando ? '#a3a3a3' : 'linear-gradient(135deg, #dc2626, #b91c1c)',
                color: '#fff', fontSize: '15px', fontWeight: '700',
                cursor: criando ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                boxShadow: criando ? 'none' : '0 4px 12px rgba(220,38,38,0.3)', transition: 'all 0.2s'
              }}
            >
              <UserPlus size={18} />
              {criando ? 'Criando...' : 'Criar Usuário'}
            </button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div style={{
        borderRadius: '20px', overflow: 'hidden',
        background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        {/* Table Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '260px 120px 150px 1fr 200px 80px',
          padding: '16px 24px', background: 'var(--portal-bg-secondary)', borderBottom: '1px solid var(--portal-border)',
          fontSize: '11px', fontWeight: '700', color: '#a3a3a3', letterSpacing: '1px'
        }}>
          <span>USUÁRIO</span>
          <span>ADMIN</span>
          <span>CATEGORIA</span>
          <span>MÓDULOS PERMITIDOS</span>
          <span>APP MECÂNICOS</span>
          <span style={{ textAlign: 'center' }}>TODOS</span>
        </div>

        {/* Table Rows */}
        {filteredUsuarios.map((user) => {
          const perm = permissoes[user.id]
          const isSaving = saving === user.id
          const isMe = user.id === userProfile?.id
          const modulos = perm?.modulos_permitidos || []

          return (
            <div
              key={user.id}
              style={{
                display: 'grid', gridTemplateColumns: '260px 120px 150px 1fr 200px 80px',
                padding: '16px 24px', borderBottom: '1px solid #f5f5f5',
                alignItems: 'center', transition: '0.15s',
                opacity: isSaving ? 0.6 : 1,
                background: perm?.is_admin ? '#fffbeb' : 'var(--portal-bg-card)'
              }}
            >
              {/* User Info */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '38px', height: '38px', borderRadius: '10px', overflow: 'hidden',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <UserIcon size={18} color="#fff" />
                  )}
                </div>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: 'var(--portal-text)', marginBottom: '1px' }}>
                    {user.nome} {isMe && <span style={{ fontSize: '10px', color: '#a3a3a3' }}>(você)</span>}
                  </p>
                  <p style={{ fontSize: '11px', color: '#a3a3a3', fontWeight: '500' }}>{user.funcao}</p>
                  {user.email && <p style={{ fontSize: '10px', color: '#b0b0b0', fontWeight: '400' }}>{user.email}</p>}
                </div>
              </div>

              {/* Admin Toggle */}
              <div>
                <button
                  onClick={() => !isMe && toggleAdmin(user.id)}
                  disabled={isMe}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 14px', borderRadius: '8px', border: 'none',
                    background: perm?.is_admin ? '#fef3c7' : '#f5f5f5',
                    color: perm?.is_admin ? '#d97706' : '#a3a3a3',
                    fontSize: '12px', fontWeight: '700', cursor: isMe ? 'default' : 'pointer',
                    transition: '0.2s', opacity: isMe ? 0.5 : 1
                  }}
                >
                  {perm?.is_admin ? <Shield size={14} /> : <Unlock size={14} />}
                  {perm?.is_admin ? 'ADMIN' : 'USUÁRIO'}
                </button>
              </div>

              {/* Categoria */}
              <div>
                <select
                  value={perm?.categoria || ''}
                  onChange={(e) => setCategoria(user.id, e.target.value)}
                  style={{
                    padding: '6px 10px', borderRadius: '8px',
                    border: '1px solid #e5e5e5', background: '#fff',
                    fontSize: '12px', fontWeight: '600', color: '#525252',
                    cursor: 'pointer', outline: 'none'
                  }}
                >
                  <option value="">Sem categoria</option>
                  {CATEGORIAS.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Módulos */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {MODULOS.map(mod => {
                  const active = modulos.includes(mod.id)
                  return (
                    <button
                      key={mod.id}
                      onClick={() => toggleModulo(user.id, mod.id)}
                      style={{
                        padding: '5px 12px', borderRadius: '8px',
                        border: active ? '1px solid #fecaca' : '1px solid #e5e5e5',
                        background: active ? '#fef2f2' : 'var(--portal-bg-secondary)',
                        color: active ? '#dc2626' : '#a3a3a3',
                        fontSize: '11px', fontWeight: '700', cursor: 'pointer',
                        transition: '0.15s', letterSpacing: '0.3px'
                      }}
                    >
                      {mod.label}
                    </button>
                  )
                })}
              </div>

              {/* App Mecânicos */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <select
                  value={perm?.mecanico_role || ''}
                  onChange={(e) => setMecanicoRole(user.id, e.target.value)}
                  style={{
                    padding: '6px 10px', borderRadius: '8px',
                    border: '1px solid #e5e5e5',
                    background: perm?.mecanico_role === 'tecnico' ? '#dcfce7' : perm?.mecanico_role === 'observador' ? '#dbeafe' : '#fff',
                    fontSize: '11px', fontWeight: '700',
                    color: perm?.mecanico_role === 'tecnico' ? '#16a34a' : perm?.mecanico_role === 'observador' ? '#2563eb' : '#a3a3a3',
                    cursor: 'pointer', outline: 'none'
                  }}
                >
                  <option value="">Sem acesso</option>
                  <option value="tecnico">Técnico</option>
                  <option value="observador">Observador</option>
                </select>

                {perm?.mecanico_role && perm?.mecanico_tecnico_nome && (
                  <span style={{
                    fontSize: '10px', fontWeight: '600', color: '#525252',
                    padding: '4px 8px', background: '#f5f5f5', borderRadius: '6px',
                  }}>
                    {perm.mecanico_tecnico_nome}
                  </span>
                )}
              </div>

              {/* Toggle All */}
              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={() => toggleTodos(user.id)}
                  style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    border: 'none', cursor: 'pointer', transition: '0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto',
                    background: modulos.length === MODULOS.length ? '#dcfce7' : '#f5f5f5',
                    color: modulos.length === MODULOS.length ? '#16a34a' : '#a3a3a3'
                  }}
                >
                  {modulos.length === MODULOS.length ? <Check size={18} /> : <X size={18} />}
                </button>
              </div>
            </div>
          )
        })}

        {filteredUsuarios.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#a3a3a3', fontSize: '14px' }}>
            Nenhum usuário encontrado
          </div>
        )}
      </div>
    </div>
  )
}
