'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  Shield, Users, Check, X, Search, ChevronDown,
  User as UserIcon, Lock, Unlock
} from 'lucide-react'

const MODULOS = [
  { id: 'financeiro', label: 'Financeiro', color: '#dc2626' },
  { id: 'requisicoes', label: 'Requisições', color: '#ef4444' },
  { id: 'revisoes', label: 'Revisões', color: '#b91c1c' },
  { id: 'pos', label: 'Pós-Vendas', color: '#dc2626' },
  { id: 'ppv', label: 'Peças (PPV)', color: '#ef4444' },
  { id: 'propostas', label: 'Propostas', color: '#991b1b' },
  { id: 'atividades', label: 'Atividades', color: '#dc2626' },
]

const CATEGORIAS = ['Pós Vendas', 'Peças', 'Comercial', 'Financeiro']

interface Usuario {
  id: string
  nome: string
  funcao: string
  avatar_url: string
}

interface Permissao {
  id?: string
  user_id: string
  is_admin: boolean
  categoria: string
  modulos_permitidos: string[]
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

  useEffect(() => {
    if (!loadingPerm && !isAdmin && userProfile) {
      router.push('/dashboard')
    }
  }, [loadingPerm, isAdmin, userProfile, router])

  useEffect(() => {
    if (!isAdmin) return
    const carregar = async () => {
      const { data: users } = await supabase.from('financeiro_usu').select('id, nome, funcao, avatar_url').order('nome')
      setUsuarios(users || [])

      const { data: perms } = await supabase.from('portal_permissoes').select('*')
      const map: Record<string, Permissao> = {}
      ;(perms || []).forEach((p: Permissao) => { map[p.user_id] = p })
      setPermissoes(map)
      setLoading(false)
    }
    carregar()
  }, [isAdmin])

  const salvar = async (userId: string, updates: Partial<Permissao>) => {
    setSaving(userId)
    const existing = permissoes[userId]

    if (existing?.id) {
      await supabase.from('portal_permissoes').update({ ...updates, updated_at: new Date().toISOString() }).eq('user_id', userId)
    } else {
      await supabase.from('portal_permissoes').insert([{
        user_id: userId,
        is_admin: false,
        categoria: '',
        modulos_permitidos: [],
        ...updates,
      }])
    }

    // Recarrega permissões
    const { data: perms } = await supabase.from('portal_permissoes').select('*')
    const map: Record<string, Permissao> = {}
    ;(perms || []).forEach((p: Permissao) => { map[p.user_id] = p })
    setPermissoes(map)
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

  const toggleTodos = (userId: string) => {
    const perm = permissoes[userId]
    const current = perm?.modulos_permitidos || []
    const allModulos = MODULOS.map(m => m.id)
    const hasAll = allModulos.every(m => current.includes(m))
    salvar(userId, { modulos_permitidos: hasAll ? [] : allModulos })
  }

  const filteredUsuarios = usuarios.filter(u =>
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    u.funcao?.toLowerCase().includes(search.toLowerCase())
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
    <div style={{ padding: '32px 40px', fontFamily: 'Inter, sans-serif' }}>
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
            <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#1a1a1a', margin: 0 }}>
              Administração
            </h2>
            <p style={{ fontSize: '14px', color: '#a3a3a3', margin: 0 }}>
              Gerencie os acessos e permissões dos usuários do portal
            </p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '32px' }}>
        {[
          { label: 'TOTAL USUÁRIOS', value: usuarios.length, icon: <Users size={20} /> },
          { label: 'ADMINISTRADORES', value: Object.values(permissoes).filter(p => p.is_admin).length, icon: <Shield size={20} /> },
          { label: 'SEM ACESSO', value: usuarios.filter(u => !permissoes[u.id] || (permissoes[u.id].modulos_permitidos || []).length === 0).length, icon: <Lock size={20} /> },
        ].map((stat, i) => (
          <div key={i} style={{
            padding: '20px 24px', borderRadius: '16px',
            background: '#ffffff', border: '1px solid #f0f0f0',
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
                <p style={{ fontSize: '22px', fontWeight: '800', color: '#1a1a1a' }}>{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', width: '360px', marginBottom: '24px' }}>
        <Search size={16} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
        <input
          type="text"
          placeholder="Buscar usuário..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px 10px 40px', borderRadius: '12px',
            background: '#fff', border: '1px solid #e5e5e5', color: '#1a1a1a',
            fontSize: '14px', outline: 'none', fontFamily: 'Inter'
          }}
        />
      </div>

      {/* Users Table */}
      <div style={{
        borderRadius: '20px', overflow: 'hidden',
        background: '#ffffff', border: '1px solid #f0f0f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        {/* Table Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '280px 140px 160px 1fr 80px',
          padding: '16px 24px', background: '#fafafa', borderBottom: '1px solid #f0f0f0',
          fontSize: '11px', fontWeight: '700', color: '#a3a3a3', letterSpacing: '1px'
        }}>
          <span>USUÁRIO</span>
          <span>ADMIN</span>
          <span>CATEGORIA</span>
          <span>MÓDULOS PERMITIDOS</span>
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
                display: 'grid', gridTemplateColumns: '280px 140px 160px 1fr 80px',
                padding: '16px 24px', borderBottom: '1px solid #f5f5f5',
                alignItems: 'center', transition: '0.15s',
                opacity: isSaving ? 0.6 : 1,
                background: perm?.is_admin ? '#fffbeb' : '#fff'
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
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', marginBottom: '1px' }}>
                    {user.nome} {isMe && <span style={{ fontSize: '10px', color: '#a3a3a3' }}>(você)</span>}
                  </p>
                  <p style={{ fontSize: '11px', color: '#a3a3a3', fontWeight: '500' }}>{user.funcao}</p>
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
                        background: active ? '#fef2f2' : '#fafafa',
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
