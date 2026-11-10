'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  Users, Check, X, Search, ChevronDown, ChevronUp, ChevronRight, ArrowLeft,
  User as UserIcon, Lock, Unlock, Wrench, Smartphone, UserPlus, Eye, EyeOff,
  Activity, Clock, Settings, ClipboardList, DollarSign, FileText, Mail, Ban, RotateCcw
} from 'lucide-react'
import PermissoesCartoes from '@/components/admin/PermissoesCartoes'
import AssinaturaUsuarioModal from '@/components/admin/AssinaturaUsuarioModal'
import { setorComFuncao, funcaoNoSetor, trocarFuncaoSetor, limparFuncoesDeOutrosSetores } from '@/lib/permissoes/funcoes-setor'
import PapelMenu, { type Nivel } from '@/components/admin/PapelMenu'
import AcoesUsuarioMenu from '@/components/admin/AcoesUsuarioMenu'
import { ModalAcessos } from '@/components/admin/DistribuirAcessos'
import ResumoAcessos, { type FiltroPapel } from '@/components/admin/ResumoAcessos'
import ContasSemCadastro from '@/components/admin/ContasSemCadastro'
import TrocarEmailModal from '@/components/admin/TrocarEmailModal'
import AvisosTratorilson from '@/components/admin/AvisosTratorilson'
import NotificacoesAdmin from '@/components/admin/NotificacoesAdmin'
import BuscaModulo from '@/components/admin/BuscaModulo'
import { MODULOS_ADMIN as MODULOS, MODULO_ADMINISTRACAO } from '@/lib/permissoes/modulos-admin'


// colunas da lista de usuários (21/10/2026): usuário · papel · categoria · acessos · ⋯

const CATEGORIAS = ['Pós Vendas', 'Peças', 'Comercial', 'Financeiro', 'T.I.']

interface Usuario {
  id: string
  nome: string
  funcao: string
  avatar_url: string
  email: string
  ativo?: boolean
}

interface Permissao {
  id?: string
  user_id: string
  is_admin: boolean
  is_dev?: boolean
  /** Diretor: autoriza o lançamento das comissões (e outras aprovações) — 20/10/2026 */
  is_diretor?: boolean
  categoria: string
  modulos_permitidos: string[]
  mecanico_role: 'tecnico' | 'observador' | null
  mecanico_tecnico_nome: string | null
}

export default function AdminPage() {
  const { userProfile } = useAuth()
  const { isAdmin, isDev, temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  // Módulo "Administração" (José, 10/11/2026: "coloca a própria Administração pra gente dar
  // acesso aos usuários ou remover"): quem o tem sem ser Admin entra aqui só para dar e tirar
  // acessos do Portal (e a função do setor). Nível, Diretor, categoria, conta, ficha e os
  // apps continuam só do Admin — o servidor (/api/admin/permissoes) barra o resto.
  const gestorAcessos = !isAdmin && temAcesso(MODULO_ADMINISTRACAO)
  const podeEntrar = isAdmin || gestorAcessos
  const catalogoGestor = gestorAcessos ? MODULOS.filter((m) => m.id !== MODULO_ADMINISTRACAO) : MODULOS
  const router = useRouter()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [permissoes, setPermissoes] = useState<Record<string, Permissao>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  // aviso de tarefas órfãs ao desativar um usuário (oferece reatribuição)
  const [avisoOrfas, setAvisoOrfas] = useState<{ userId: string; nome: string; count: number } | null>(null)
  // Quais usuários estão com o painel de permissões expandido
  const [expandidoUsuario, setExpandidoUsuario] = useState<Set<string>>(new Set())
  // filtro pelos números do topo (Admins, Devs, Diretores…)
  const [filtroPapel, setFiltroPapel] = useState<FiltroPapel>(null)
  // resumo dos níveis (números + cartões) fica fechado; abre quando quiser (José, 10/11/2026)
  const [verResumo, setVerResumo] = useState(false)
  useEffect(() => { try { setVerResumo(localStorage.getItem('admin-ver-resumo') === '1') } catch { /* sem storage */ } }, [])
  const trocarResumo = () => {
    const novo = !verResumo
    setVerResumo(novo)
    if (!novo) setFiltroPapel(null)
    try { localStorage.setItem('admin-ver-resumo', novo ? '1' : '0') } catch { /* sem storage */ }
  }
  // a pessoa aberta fica na URL (/admin?usuario=<id>): recarregar ou mandar o link abre
  // direto nela; Voltar do navegador fecha (José, 10/11/2026)
  const usuarioDaUrl = () => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('usuario'))
  const toggleExpandirUsuario = (id: string) => {
    const abrindo = !expandidoUsuario.has(id)
    setExpandidoUsuario(abrindo ? new Set([id]) : new Set())
    const u = new URL(window.location.href)
    if (abrindo) {
      u.searchParams.set('usuario', id)
      if (usuarioDaUrl()) window.history.replaceState(window.history.state, '', u.toString())
      else window.history.pushState(window.history.state, '', u.toString())
    } else {
      u.searchParams.delete('usuario')
      window.history.replaceState(window.history.state, '', u.toString())
    }
  }
  useEffect(() => {
    const ler = () => { const id = usuarioDaUrl(); setExpandidoUsuario(id ? new Set([id]) : new Set()) }
    ler()
    window.addEventListener('popstate', ler)
    return () => window.removeEventListener('popstate', ler)
  }, [])
  const [search, setSearch] = useState('')
  const [showNovoUsuario, setShowNovoUsuario] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novoSenha, setNovoSenha] = useState('nova123')
  const [novoFuncao, setNovoFuncao] = useState('')
  // assinatura salva (diretor e gerentes não assinam toda vez) — José, 29/10/2026
  const [assinaturaDe, setAssinaturaDe] = useState<{ id: string; nome: string } | null>(null)
  const [novoModulos, setNovoModulos] = useState<string[]>([])
  const [novoVendedor, setNovoVendedor] = useState(false)
  // Quem tem linha em `vendedores` (entra no app NT Vendas), por user_id
  const [vendedores, setVendedores] = useState<Record<string, { id: number; ativo: boolean }>>({})
  const [salvandoVendedor, setSalvandoVendedor] = useState<string | null>(null)
  const [showSenha, setShowSenha] = useState(false)
  const [criando, setCriando] = useState(false)
  const [criarErro, setCriarErro] = useState('')
  const [versaoContas, setVersaoContas] = useState(0)
  const [trocarEmailDe, setTrocarEmailDe] = useState<{ id: string; nome?: string; email?: string | null } | null>(null)

  const resetarSenha = async (email: string) => {
    if (!email) { alert('Usuário sem email cadastrado'); return }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/resetar-senha', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ email }),
      })
      const result = await res.json()
      if (!res.ok) {
        alert('Erro: ' + (result.error || 'Falha ao enviar'))
      } else {
        alert('Email de redefinição enviado para ' + email)
      }
    } catch {
      alert('Erro ao conectar com servidor')
    }
  }

  useEffect(() => {
    if (!loadingPerm && !podeEntrar && userProfile) {
      router.push('/dashboard')
    }
  }, [loadingPerm, podeEntrar, userProfile, router])

  const carregar = async () => {
    const { data: users } = await supabase.from('financeiro_usu').select('id, nome, funcao, avatar_url, email, ativo').order('nome')
    setUsuarios(users || [])

    const { data: perms } = await supabase.from('portal_permissoes').select('*')
    const map: Record<string, Permissao> = {}
    ;(perms || []).forEach((p: Permissao) => { map[p.user_id] = p })
    setPermissoes(map)

    setLoading(false)
    if (isAdmin) carregarVendedores()
  }

  const carregarVendedores = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/vendedor', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
      if (res.ok) setVendedores((await res.json()).vendedores || {})
    } catch { /* sem a lista o botão só aparece desligado */ }
  }

  // Liga/desliga o acesso ao app NT Vendas (linha em `vendedores`; nunca apaga)
  const salvarVendedor = async (userId: string, ativo: boolean) => {
    setSalvandoVendedor(userId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/vendedor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ user_id: userId, ativo }),
      })
      const r = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(r.error || 'Falha ao salvar')
      setVendedores(prev => ({ ...prev, [userId]: { id: r.id, ativo } }))
    } catch (e: any) {
      alert('Erro ao marcar vendedor: ' + (e?.message || 'erro'))
    } finally {
      setSalvandoVendedor(null)
    }
  }

  useEffect(() => {
    if (!podeEntrar) return
    carregar()
  }, [podeEntrar])

  const salvar = async (userId: string, updates: Partial<Permissao>) => {
    setSaving(userId)
    const existing = permissoes[userId]

    // Update otimista — atualiza UI imediatamente
    setPermissoes(prev => {
      const base: Permissao = prev[userId] ?? { user_id: userId, is_admin: false, categoria: '', modulos_permitidos: [], mecanico_role: null, mecanico_tecnico_nome: null }
      return { ...prev, [userId]: { ...base, ...updates } }
    })

    try {
      // Escrita passa pelo servidor (com checagem de admin). O cliente não pode
      // mais gravar portal_permissoes direto — RLS bloqueia (fim da auto-promoção).
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/permissoes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ user_id: userId, updates }),
      })
      if (!res.ok) {
        const r = await res.json().catch(() => ({}))
        throw new Error(r.error || 'Falha ao salvar permissão')
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

  const toggleAdmin = (userId: string) => {
    const perm = permissoes[userId]
    salvar(userId, { is_admin: !(perm?.is_admin) })
  }

  // Define o nível de acesso: usuario | admin | dev (dev = admin + extras)
  const setNivel = (userId: string, nivel: string) => {
    if (nivel === 'dev') salvar(userId, { is_admin: true, is_dev: true })
    else if (nivel === 'admin') salvar(userId, { is_admin: true, is_dev: false })
    else salvar(userId, { is_admin: false, is_dev: false })
  }

  const setCategoria = (userId: string, cat: string) => {
    // a função de outro setor (ex.: Garantista ao virar Peças) deixa de valer
    const mods = permissoes[userId]?.modulos_permitidos || []
    const limpos = limparFuncoesDeOutrosSetores(mods, cat)
    salvar(userId, limpos.length !== mods.length ? { categoria: cat, modulos_permitidos: limpos } : { categoria: cat })
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

  // Inativar / reativar usuário (soft-delete em financeiro_usu)
  const toggleAtivo = async (userId: string, novo: boolean) => {
    if (userId === userProfile?.id) return // não pode inativar a própria conta
    setSaving(userId)
    setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, ativo: novo } : u))
    // Passa pelo servidor: com RLS, o navegador só edita a própria linha de
    // financeiro_usu; mexer no "ativo" de outro usuário é ação de admin no servidor.
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/admin/usuario-ativo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ user_id: userId, ativo: novo }),
      })
      const r = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(r.error || 'Falha ao alterar status')
      }
      if (r.avisoLogin) alert(r.avisoLogin)
      // desativou e havia tarefas abertas → oferecer reatribuição (senão ficam órfãs)
      if (!novo && (r.tarefasAbertas || 0) > 0) {
        const nome = usuarios.find(u => u.id === userId)?.nome || 'usuário'
        setAvisoOrfas({ userId, nome, count: r.tarefasAbertas })
      }
    } catch (e: any) {
      // reverte
      setUsuarios(prev => prev.map(u => u.id === userId ? { ...u, ativo: !novo } : u))
      alert('Erro ao alterar status: ' + (e?.message || 'erro'))
    }
    setSaving(null)
  }

  // reatribui em massa as tarefas abertas do usuário desativado para outro
  const reatribuirOrfas = async (para: string) => {
    if (!avisoOrfas || !para) { setAvisoOrfas(null); return }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/tarefas/reatribuir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` },
        body: JSON.stringify({ de_user_id: avisoOrfas.userId, para_user_id: para }),
      })
      const r = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(r.error || 'falha')
      alert(`${r.reatribuidas || 0} tarefa(s) reatribuída(s).`)
    } catch (e: any) {
      alert('Erro ao reatribuir: ' + (e?.message || 'erro'))
    }
    setAvisoOrfas(null)
  }

  const criarUsuario = async () => {
    if (!novoNome.trim() || !novoEmail.trim()) { setCriarErro('Nome e email são obrigatórios'); return }
    if (novoSenha.length < 6) { setCriarErro('Senha deve ter no mínimo 6 caracteres'); return }
    setCriando(true)
    setCriarErro('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/pos/requisicoes/criar-usuario', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
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
      if (novoVendedor && result.auth_user_id) await salvarVendedor(result.auth_user_id, true)
      setShowNovoUsuario(false)
      setNovoNome(''); setNovoEmail(''); setNovoSenha('nova123'); setNovoFuncao(''); setNovoModulos([]); setNovoVendedor(false)
      setVersaoContas((v) => v + 1)
      await carregar()
    } catch (err: any) {
      setCriarErro(err.message || 'Erro desconhecido')
    } finally {
      setCriando(false)
    }
  }

  const matchBusca = (u: Usuario) =>
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    u.funcao?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  // ativo === false é inativo; true/undefined = ativo (antes de rodar o SQL todos são ativos)
  const passaPapel = (u: Usuario) => {
    const p = permissoes[u.id]
    switch (filtroPapel) {
      case 'admin': return !!p?.is_admin && !p?.is_dev
      case 'dev': return !!p?.is_dev
      case 'diretor': return !!p?.is_diretor
      case 'vendedor': return !!vendedores[u.id]?.ativo
      case 'mecanicos': return !!p?.mecanico_role
      case 'sem': return !p?.is_admin && !(p?.modulos_permitidos || []).length
      default: return true
    }
  }
  const filteredUsuarios = usuarios.filter(u => u.ativo !== false && matchBusca(u) && passaPapel(u))
  const inativosFiltrados = usuarios.filter(u => u.ativo === false && matchBusca(u))

  if (loadingPerm || loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <p style={{ color: '#a3a3a3', fontSize: '13px', letterSpacing: '3px' }}>CARREGANDO...</p>
      </div>
    )
  }

  if (!podeEntrar) return null

  return (
    <div className="adm-root" style={{ padding: '32px 40px', fontFamily: 'Inter, sans-serif', background: 'var(--portal-bg)', minHeight: '100%' }}>
      <style>{`
        .adm-resumo-bt { display: inline-flex; align-items: center; gap: 6px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--portal-border); background: var(--portal-bg-card); color: var(--portal-text-secondary); font-family: inherit; font-size: 13.5px; cursor: pointer }
        .adm-resumo-bt:hover, .adm-resumo-bt.on { color: var(--portal-text); border-color: #94a3b8 }
        .adm-lista { border-radius: 20px; background: var(--portal-bg-card); border: 1px solid var(--portal-border); overflow: hidden }
        .adm-cab, .adm-linha { display: grid; grid-template-columns: minmax(240px, 1.4fr) minmax(150px, 210px) minmax(200px, 1fr) minmax(170px, 1fr) 44px; gap: 14px; align-items: center; padding: 0 20px }
        .adm-cab { padding-top: 12px; padding-bottom: 12px; font-size: 11px; letter-spacing: .7px; text-transform: uppercase; color: #94a3b8; border-bottom: 1px solid var(--portal-border) }
        .adm-item { border-bottom: 1px solid var(--portal-border); transition: opacity .15s } .adm-item:last-of-type { border-bottom: none }
        .adm-linha { padding-top: 10px; padding-bottom: 10px; transition: background .12s } .adm-linha:hover { background: var(--portal-bg-secondary) }
        .adm-pessoa { display: flex; align-items: center; gap: 12px; min-width: 0; border: none; background: none; padding: 4px 0; cursor: pointer; text-align: left; font-family: inherit; color: inherit }
        .adm-av { width: 40px; height: 40px; border-radius: 50%; overflow: hidden; flex-shrink: 0; display: grid; place-items: center; background: linear-gradient(135deg, #dc2626, #b91c1c); color: #fefefe; font-size: 15px }
        .adm-av img { width: 100%; height: 100%; object-fit: cover } .adm-av.admin { box-shadow: 0 0 0 2px var(--portal-bg-card), 0 0 0 4px #f59e0b } .adm-av.dev { box-shadow: 0 0 0 2px var(--portal-bg-card), 0 0 0 4px #0f172a }
        .adm-quem { display: grid; min-width: 0 } .adm-quem b { font-size: 14.5px; font-weight: 500; color: var(--portal-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
        .adm-quem em { font-style: normal; font-size: 11.5px; color: #94a3b8; font-weight: 400 } .adm-quem small { font-size: 12.5px; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
        .adm-pessoa:hover .adm-quem b { color: #dc2626 }
        .adm-setor { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0 }
        .adm-sel { appearance: none; -webkit-appearance: none; border: 1px solid transparent; background: var(--portal-bg-secondary) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 9px center; border-radius: 999px; padding: 6px 28px 6px 12px; font-family: inherit; font-size: 12.5px; color: var(--portal-text); cursor: pointer; outline: none; max-width: 100% }
        .adm-sel:hover:not(:disabled) { border-color: #cbd5e1 } .adm-sel:disabled { cursor: default; opacity: .7 }
        .adm-sel.fn { color: #94a3b8 } .adm-sel.fn.tem { color: #3730a3; background-color: #eef2ff }
        .adm-apps { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0 }
        .adm-tag { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; border-radius: 999px; padding: 4px 10px; white-space: nowrap }
        .adm-tag.adm { background: #fef3c7; color: #b45309 } .adm-tag.mec { background: #ecfdf5; color: #047857 } .adm-tag.ven { background: #fef2f2; color: #b91c1c }
        .adm-nada { color: #cbd5e1; font-size: 13px } .adm-acoes { display: flex; justify-content: flex-end }
        @media (max-width: 900px) {
          .adm-cab { display: none }
          .adm-linha { grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: 'pessoa acoes' 'papel papel' 'setor setor' 'apps apps'; gap: 8px; padding: 12px 14px }
          .adm-pessoa { grid-area: pessoa } .adm-acoes { grid-area: acoes } .adm-papel { grid-area: papel } .adm-setor { grid-area: setor } .adm-apps { grid-area: apps } .adm-apps:has(.adm-nada) { display: none }
        }
        @media (max-width: 768px) {
          .adm-root { padding: 16px 12px !important; }
          .adm-root h2 { font-size: 22px !important; }
        }
      `}</style>
      {avisoOrfas && (
        <div onClick={() => setAvisoOrfas(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, maxWidth: 460, width: '100%', padding: 22, boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '1rem', color: '#1e293b' }}>⚠️ {avisoOrfas.nome} tem {avisoOrfas.count} tarefa(s) aberta(s)</h3>
            <p style={{ fontSize: '.85rem', color: '#475569', marginBottom: 14 }}>
              Ao desativar, essas tarefas ficam <b>órfãs</b>. Reatribua para outra pessoa agora, ou deixe (elas aparecem na aba <b>Órfãs</b> de /tarefas).
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <select id="reatribuir-orfas-sel" defaultValue="" style={{ flex: 1, minWidth: 180, border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: '.85rem' }}>
                <option value="">Reatribuir para…</option>
                {usuarios.filter(u => u.ativo && u.id !== avisoOrfas.userId).map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
              <button onClick={() => { const v = (document.getElementById('reatribuir-orfas-sel') as HTMLSelectElement)?.value; if (v) reatribuirOrfas(v); }} style={{ padding: '8px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, fontSize: '.85rem', cursor: 'pointer' }}>Reatribuir</button>
              <button onClick={() => setAvisoOrfas(null)} style={{ padding: '8px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 8, fontSize: '.85rem', cursor: 'pointer' }}>Deixar por ora</button>
            </div>
          </div>
        </div>
      )}
      {/* sem título nem links no topo (José, 10/11/2026); o editor de teste e o "por que cada pessoa tem cada tela" seguem em /admin/teste e /admin/permissoes */}
      {/* Números que filtram a lista + o que cada nível acessa (21/10/2026) */}
      {verResumo && (() => {
        const ativos = usuarios.filter((u) => u.ativo !== false)
        const nivelDe = (id: string) => (permissoes[id]?.is_dev ? 'dev' : permissoes[id]?.is_admin ? 'admin' : 'usuario') as 'usuario' | 'admin' | 'dev'
        const conta = {
          total: ativos.length,
          admin: ativos.filter((u) => permissoes[u.id]?.is_admin && !permissoes[u.id]?.is_dev).length,
          dev: ativos.filter((u) => permissoes[u.id]?.is_dev).length,
          diretor: ativos.filter((u) => permissoes[u.id]?.is_diretor).length,
          vendedor: ativos.filter((u) => vendedores[u.id]?.ativo).length,
          mecanicos: ativos.filter((u) => permissoes[u.id]?.mecanico_role).length,
          sem: ativos.filter((u) => !permissoes[u.id]?.is_admin && !(permissoes[u.id]?.modulos_permitidos || []).length).length,
        }
        return <ResumoAcessos usuarios={ativos} nivelDe={nivelDe} conta={conta} totalModulos={MODULOS.length} filtro={filtroPapel} onFiltro={setFiltroPapel} />
      })()}

      {/* Search + Novo Usuário */}
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div style={{ position: 'relative', width: '360px', maxWidth: '100%' }}>
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
        {/* procurar por módulo: quem tem acesso a ele (José, 04/11/2026) */}
        <button type="button" className={`adm-resumo-bt ${verResumo ? 'on' : ''}`} onClick={trocarResumo} title="Números de cada nível e o que cada um acessa">
          <ChevronDown size={15} style={{ transform: verResumo ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />{verResumo ? 'Esconder resumo' : 'Ver resumo'}
        </button>
        <BuscaModulo modulos={MODULOS} usuarios={usuarios} permissoes={permissoes} onVerUsuario={(nome) => { setFiltroPapel(null); setSearch(nome) }} />
        {/* criar usuário é só para Dev (José, 09/11/2026) — a rota também barra */}
        {isDev && <button
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
        </button>}
      </div>

      {/* Modal Criar Usuário */}
      {showNovoUsuario && isDev && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !criando) setShowNovoUsuario(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)', zIndex: 50000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px', boxSizing: 'border-box'
          }}
        >
          <div style={{
            background: 'var(--portal-bg-card)', borderRadius: '24px', width: '560px', maxWidth: '100%',
            maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', boxSizing: 'border-box',
            padding: 'clamp(18px, 5vw, 32px) clamp(18px, 5vw, 32px) 0', boxShadow: '0 25px 60px rgba(0,0,0,0.15)'
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
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
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', fontSize: '13px', fontWeight: 600, color: 'var(--portal-text)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={novoVendedor} onChange={e => setNovoVendedor(e.target.checked)} />
                  É vendedor (NT Vendas)
                  <span style={{ fontSize: '11px', fontWeight: 400, color: '#a3a3a3' }}>— entra no app de vendas com este mesmo login</span>
                </label>
              </div>
            </div>

            {/* Módulos de acesso */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                <label style={{ fontSize: '12px', fontWeight: '700', color: '#525252', letterSpacing: '0.5px' }}>MÓDULOS DE ACESSO</label>
                <button
                  onClick={() => setNovoModulos(prev => MODULOS.every(m => prev.includes(m.id)) ? [] : MODULOS.map(m => m.id))}
                  style={{
                    fontSize: '11px', fontWeight: '600', color: '#dc2626', background: 'none',
                    border: 'none', cursor: 'pointer', padding: '2px 6px'
                  }}
                >
                  {MODULOS.every(m => novoModulos.includes(m.id)) ? 'Desmarcar todos' : 'Marcar todos'}
                </button>
              </div>
              <PermissoesCartoes
                modulos={novoModulos}
                catalogo={MODULOS}
                souDev={isDev}
                onChange={setNovoModulos}
              />
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

            {/* Botão (rodapé fixo: sempre visível mesmo com a lista de módulos longa) */}
            <div style={{ position: 'sticky', bottom: 0, background: 'var(--portal-bg-card)', padding: '12px 0 24px', marginTop: '8px' }}>
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
        </div>
      )}

      {/* Lista de usuários (José, 10/11/2026: "deixa algo mais bonito"; sem contar módulos) */}
      <div className="adm-lista">
        <div className="adm-cab">
          <span>Pessoa</span>
          <span>Papel</span>
          <span>Setor e função</span>
          <span>Apps</span>
          <span />
        </div>

        {/* Table Rows */}
        {filteredUsuarios.map((user) => {
          const perm = permissoes[user.id]
          const isSaving = saving === user.id
          const isMe = user.id === userProfile?.id
          const modulos = perm?.modulos_permitidos || []

          const expandido = expandidoUsuario.has(user.id)
          const nivelAtual: Nivel = perm?.is_dev ? 'dev' : perm?.is_admin ? 'admin' : 'usuario'
          const devLock = !isDev && nivelAtual === 'dev'
          const ehVendedor = !!vendedores[user.id]?.ativo

          return (
            <div key={user.id} className="adm-item" style={{ opacity: isSaving ? 0.6 : 1 }}>
            <div className="adm-linha">
              <button type="button" className="adm-pessoa" onClick={() => toggleExpandirUsuario(user.id)} title="Abrir ficha e permissões">
                <span className={`adm-av ${nivelAtual}`}>
                  {user.avatar_url ? <img src={user.avatar_url} alt="" /> : user.nome.charAt(0)}
                </span>
                <span className="adm-quem">
                  <b>{user.nome}{isMe && <em> (você)</em>}</b>
                  <small>{user.email || user.funcao || ''}</small>
                </span>
              </button>

              {/* Papel: nível + Diretor + Vendedor num menu só */}
              <div className="adm-papel">
                <PapelMenu
                  nivel={nivelAtual}
                  podeDev={isDev}
                  bloqueado={isMe || devLock || gestorAcessos}
                  motivoBloqueio={isMe ? 'Você não pode mudar o seu próprio nível.' : devLock ? 'Só um Dev pode mudar um Dev.' : gestorAcessos ? 'Só um Admin muda o nível, Diretor e Vendedor.' : undefined}
                  diretor={!!perm?.is_diretor}
                  vendedor={ehVendedor}
                  salvandoVendedor={salvandoVendedor === user.id}
                  onNivel={(n) => setNivel(user.id, n)}
                  onDiretor={(v) => salvar(user.id, { is_diretor: v })}
                  onVendedor={(v) => salvarVendedor(user.id, v)}
                />
              </div>

              {/* Setor (Categoria) e função no setor */}
              <div className="adm-setor">
                <select className="adm-sel" value={perm?.categoria || ''} onChange={(e) => setCategoria(user.id, e.target.value)}
                  disabled={gestorAcessos} title={gestorAcessos ? 'Só um Admin muda o setor' : 'Setor'}>
                  <option value="">Sem setor</option>
                  {CATEGORIAS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
                {/* função dentro do setor: Pós-Vendas, Peças ou Comercial (José, 29/10 e 10/11/2026) */}
                {setorComFuncao(perm?.categoria) && (
                  <select className={`adm-sel fn ${funcaoNoSetor(modulos, perm?.categoria) ? 'tem' : ''}`}
                    value={funcaoNoSetor(modulos, perm?.categoria)?.chave || ''}
                    disabled={gestorAcessos && isMe}
                    onChange={(e) => salvar(user.id, { modulos_permitidos: trocarFuncaoSetor(modulos, perm!.categoria, e.target.value || null) })}
                    title={`Função no ${setorComFuncao(perm?.categoria)!.nome}`}>
                    <option value="">sem função</option>
                    {setorComFuncao(perm?.categoria)!.funcoes.map((fn) => <option key={fn.chave} value={fn.chave}>{fn.rot}</option>)}
                  </select>
                )}
              </div>

              {/* Apps: só o que a pessoa tem (sem contar módulos) */}
              <div className="adm-apps">
                {perm?.is_admin && <span className="adm-tag adm">acesso total</span>}
                {perm?.mecanico_role && <span className="adm-tag mec"><Wrench size={12} />Mecânicos · {perm.mecanico_role === 'tecnico' ? 'técnico' : 'observador'}</span>}
                {ehVendedor && <span className="adm-tag ven"><Smartphone size={12} />NT Vendas</span>}
                {!perm?.is_admin && !perm?.mecanico_role && !ehVendedor && <span className="adm-nada">—</span>}
              </div>

              {/* Ações da conta */}
              <div className="adm-acoes">
                {isAdmin && <AcoesUsuarioMenu
                  podeInativar={!isMe}
                  motivo={isMe ? 'Você não pode inativar a própria conta' : undefined}
                  onResetar={() => {
                    if (!user.email) { alert('Usuário sem email cadastrado'); return }
                    if (confirm(`Enviar email de redefinição de senha para ${user.email}?`)) resetarSenha(user.email)
                  }}
                  onEmail={() => setTrocarEmailDe({ id: user.id, nome: user.nome, email: user.email })}
                  onAssinatura={() => setAssinaturaDe({ id: user.id, nome: user.nome })}
                  onInativar={() => { if (!isMe && confirm(`Inativar ${user.nome}? Ele não conseguirá entrar e some das listas, mas os dados ficam.`)) toggleAtivo(user.id, false) }}
                />}
              </div>
            </div>

            {expandido && (
                <ModalAcessos
                  userId={user.id}
                  avatar={user.avatar_url}
                  funcao={user.funcao}
                  categoria={perm?.categoria || ''}
                  email={user.email}
                  onFechar={() => toggleExpandirUsuario(user.id)}
                  nome={user.nome}
                  ehAdmin={!!perm?.is_admin}
                  souDev={isDev}
                  soPermissoes={gestorAcessos}
                  disabled={saving === user.id || (gestorAcessos && isMe)}
                  modulos={modulos}
                  catalogo={catalogoGestor}
                  onModulos={(novo) => salvar(user.id, { modulos_permitidos: novo })}
                  mecanicoRole={perm?.mecanico_role ?? null}
                  mecanicoNome={perm?.mecanico_tecnico_nome ?? null}
                  onMecanico={(role) => setMecanicoRole(user.id, role)}
                  vendedor={ehVendedor}
                  salvandoVendedor={salvandoVendedor === user.id}
                  onVendedor={(v) => salvarVendedor(user.id, v)}
                  outros={usuarios.filter((u) => u.id !== user.id && u.ativo !== false).map((u) => ({ id: u.id, nome: u.nome, modulos: permissoes[u.id]?.modulos_permitidos || [] }))}
                />
            )}
            </div>
          )
        })}

        {filteredUsuarios.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#a3a3a3', fontSize: '14px' }}>
            Nenhum usuário encontrado
          </div>
        )}
      </div>

      {/* ===== Seção: Usuários Inativos ===== */}
      {isAdmin && inativosFiltrados.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Ban size={16} color="#a3a3a3" />
            <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text-secondary)', margin: 0 }}>
              Inativos
            </h3>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#a3a3a3', background: 'var(--portal-bg-secondary)', padding: '2px 10px', borderRadius: 10 }}>
              {inativosFiltrados.length}
            </span>
          </div>
          <div style={{ borderRadius: 16, overflow: 'hidden', background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)' }}>
            {inativosFiltrados.map(user => {
              const isSaving = saving === user.id
              return (
                <div key={user.id} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, padding: '12px clamp(12px, 3vw, 20px)', borderBottom: '1px solid #f5f5f5', opacity: isSaving ? 0.6 : 0.85 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, overflow: 'hidden', background: '#e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, filter: 'grayscale(1)' }}>
                    {user.avatar_url ? <img src={user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserIcon size={16} color="#fff" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text-secondary)', margin: 0 }}>
                      {user.nome} <span style={{ fontSize: 10, fontWeight: 700, color: '#a3a3a3', background: 'var(--portal-bg-secondary)', padding: '1px 7px', borderRadius: 5, marginLeft: 6 }}>INATIVO</span>
                    </p>
                    <p style={{ fontSize: 11, color: '#a3a3a3', margin: 0, overflowWrap: 'anywhere' }}>{user.funcao}{user.email ? ` · ${user.email}` : ''}</p>
                  </div>
                  <button
                    onClick={() => toggleAtivo(user.id, true)}
                    title={`Reativar ${user.nome}`}
                    style={{
                      padding: '7px 14px', borderRadius: 9, border: '1px solid #bbf7d0', background: '#f0fdf4',
                      color: '#16a34a', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <RotateCcw size={14} /> Reativar
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ===== Avisos do Tratorilson (Devs sempre + escolhidos aqui) ===== */}
      {isAdmin && <AvisosTratorilson />}

      {/* ===== Notificações: quem recebe o quê + o que cada app aciona (José, 29/10/2026) ===== */}
      {isAdmin && <NotificacoesAdmin />}
      {assinaturaDe && <AssinaturaUsuarioModal userId={assinaturaDe.id} nome={assinaturaDe.nome} onFechar={() => setAssinaturaDe(null)} />}

      {/* ===== Logins sem cadastro (Auth sem financeiro_usu) ===== */}
      {isAdmin && <ContasSemCadastro versao={versaoContas} onCadastrar={isDev ? (email) => { setNovoEmail(email); setCriarErro(''); setShowNovoUsuario(true) } : undefined} onTrocarEmail={(c) => setTrocarEmailDe({ id: c.id, email: c.email })} />}

      {trocarEmailDe && (
        <TrocarEmailModal
          usuario={trocarEmailDe}
          onFechar={() => setTrocarEmailDe(null)}
          onTrocado={(novo) => {
            setUsuarios((us) => us.map((u) => (u.id === trocarEmailDe.id ? { ...u, email: novo } : u)))
            setVersaoContas((v) => v + 1)
          }}
        />
      )}

    </div>
  )
}
