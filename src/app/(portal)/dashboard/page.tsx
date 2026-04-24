'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useRefreshOnFocus } from '@/hooks/useRefreshOnFocus'
import { usePermissoes } from '@/hooks/usePermissoes'
import { supabase } from '@/lib/supabase'
import { useAuditLog } from '@/hooks/useAuditLog'
import {
  Settings, ClipboardList, Wrench, FileText,
  DollarSign, Activity, Clock, ChevronRight, Search,
  BarChart3, Users, Package, ClipboardCheck, AlertTriangle,
  CheckCircle2, Map, RefreshCw, Database, X, Check, Calculator, Eye
} from 'lucide-react'

interface SystemCard {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  color: string
  gradient: string
  href: string
  tag: string
  external?: boolean
}

const systems: SystemCard[] = [
  {
    id: 'sistema-financeiro',
    name: 'Financeiro',
    description: 'Gestão de NF, boletos, contas a pagar e receber, chamados RH',
    icon: <DollarSign size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)',
    href: '/financeiro',
    tag: 'FINANÇAS'
  },
  {
    id: 'app-requisicoes',
    name: 'Requisições',
    description: 'Kanban de requisições de materiais e serviços das unidades',
    icon: <ClipboardList size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
    href: '/requisicoes',
    tag: 'COMPRAS'
  },
  {
    id: 'controle-revisao',
    name: 'Controle de Revisões',
    description: 'Acompanhamento de revisões periódicas de tratores com integração Gmail',
    icon: <Wrench size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #b91c1c, #991b1b)',
    href: '/revisoes',
    tag: 'MANUTENÇÃO'
  },
  {
    id: 'pos',
    name: 'Pós-Vendas (OS)',
    description: 'Ordens de serviço, integração Omie ERP, geração de PDF',
    icon: <Settings size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #dc2626, #991b1b)',
    href: '/pos',
    tag: 'SERVIÇOS'
  },
  {
    id: 'ppv',
    name: 'Peças (Pedido de Venda)',
    description: 'Pedidos de venda de peças, rastreamento e gestão',
    icon: <Package size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #ef4444, #b91c1c)',
    href: '/ppv',
    tag: 'PEÇAS'
  },
  {
    id: 'proposta-comercial',
    name: 'Proposta Comercial',
    description: 'Geração de propostas com PDF e QR Code para clientes',
    icon: <FileText size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #991b1b, #7f1d1d)',
    href: '/propostas',
    tag: 'VENDAS'
  },
  {
    id: 'orcamentos',
    name: 'Orçamentos',
    description: 'Orçamentos personalizados com peças, mão de obra e deslocamento',
    icon: <Calculator size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #dc2626, #ef4444)',
    href: '/orcamentos',
    tag: 'ORÇAMENTOS'
  },
  {
    id: 'tarefas',
    name: 'Tarefas',
    description: 'Gestão de tarefas entre usuários',
    icon: <ClipboardCheck size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)',
    href: '/tarefas',
    tag: 'TAREFAS'
  },
  {
    id: 'painel-mecanicos',
    name: 'Painel Mecânicos',
    description: 'Agenda semanal, caminhos, pontuação e gestão dos técnicos de campo',
    icon: <Users size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #dc2626, #ef4444)',
    href: '/painel-mecanicos',
    tag: 'TÉCNICOS'
  },
  {
    id: 'mapa-geral',
    name: 'Mapa Geral',
    description: 'Visualização geográfica de clientes, máquinas e operações',
    icon: <Map size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #b91c1c, #991b1b)',
    href: 'https://mapa-geral-production.up.railway.app/',
    tag: 'MAPA',
    external: true
  },
  {
    id: 'consulta-estoque',
    name: 'Consulta Estoque',
    description: 'Estoque Omie, CMC, curva ABC, dashboard de vendas e comissões',
    icon: <BarChart3 size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #ef4444, #991b1b)',
    href: 'https://omie-consulta-estoque-production.up.railway.app/dashboard',
    tag: 'ESTOQUE',
    external: true
  },
  {
    id: 'visual-estoque',
    name: 'Visual Estoque',
    description: 'Showroom virtual de estoque com visualização de peças e produtos',
    icon: <Eye size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #b91c1c, #7f1d1d)',
    href: 'https://visual-estoque-production.up.railway.app',
    tag: 'SHOWROOM',
    external: true
  }
]

interface LogEntry {
  id: string
  sistema: string
  acao: string
  created_at: string
}

// Mapeia system.id para o módulo de permissão
const systemToModulo: Record<string, string> = {
  'sistema-financeiro': 'financeiro',
  'app-requisicoes': 'requisicoes',
  'controle-revisao': 'revisoes',
  'pos': 'pos',
  'ppv': 'ppv',
  'proposta-comercial': 'propostas',
  'orcamentos': 'orcamentos',
  'tarefas': 'tarefas',
  'painel-mecanicos': 'painel-mecanicos',
  'mapa-geral': 'mapa',
  'consulta-estoque': 'estoque',
  'visual-estoque': 'visual-estoque',
}

export default function DashboardPage() {
  const { userProfile, router } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { log: auditLog } = useAuditLog()
  const [searchTerm, setSearchTerm] = useState('')
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [minhasTarefas, setMinhasTarefas] = useState<any[]>([])
  const [tarefasLoading, setTarefasLoading] = useState(true)
  const [showSync, setShowSync] = useState(false)
  const [syncRunning, setSyncRunning] = useState(false)
  const [syncProgress, setSyncProgress] = useState(0)
  const [syncStep, setSyncStep] = useState('')
  const [syncResults, setSyncResults] = useState<any>(null)
  const [syncError, setSyncError] = useState('')
  const [syncSelection, setSyncSelection] = useState<{ clientes: boolean; projetos: boolean; produtos: boolean }>({
    clientes: true, projetos: true, produtos: true,
  })

  // Refresh ao voltar para a aba
  const refreshDashboard = useCallback(() => {
    if (!userProfile) return
    supabase.from('portal_logs').select('*').eq('user_id', userProfile.id)
      .order('created_at', { ascending: false }).limit(5)
      .then(({ data }) => { if (data) setRecentLogs(data) })
  }, [userProfile])
  useRefreshOnFocus(refreshDashboard)

  // Relógio a cada 30s em vez de 1s — reduz 30x re-renders
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!userProfile) return
    const loadLogs = async () => {
      const { data } = await supabase
        .from('portal_logs')
        .select('*')
        .eq('user_id', userProfile.id)
        .order('created_at', { ascending: false })
        .limit(5)
      if (data) setRecentLogs(data)
    }
    loadLogs()
  }, [userProfile])

  // Carregar tarefas
  useEffect(() => {
    if (!userProfile) return
    const loadTarefas = async () => {
      try {
        const res = await fetch(`/api/tarefas?filter=minhas&userId=${userProfile.id}`)
        const data = await res.json()
        const pendentes = (Array.isArray(data) ? data : [])
          .filter((t: any) => t.computed_status !== 'concluida')
          .slice(0, 5)
        setMinhasTarefas(pendentes)
      } catch (err) {
        console.error('Erro ao carregar tarefas:', err)
      } finally {
        setTarefasLoading(false)
      }
    }
    loadTarefas()
  }, [userProfile])

  const logAccess = async (system: SystemCard) => {
    if (!userProfile) return
    await supabase.from('portal_logs').insert([{
      user_id: userProfile.id,
      user_nome: userProfile.nome,
      sistema: system.name,
      acao: 'acesso'
    }])
  }

  const openSystem = async (system: SystemCard) => {
    logAccess(system)
    auditLog({ sistema: system.id.replace('sistema-', ''), acao: 'acesso', entidade_label: system.name })
    if (system.external) {
      const appsComAuth = ['consulta-estoque', 'visual-estoque']
      const { data: { session } } = await supabase.auth.getSession()
      if (appsComAuth.includes(system.id) && session?.access_token && session?.refresh_token) {
        const url = new URL(system.href)
        const authUrl = `${url.origin}/auth/token?access_token=${session.access_token}&refresh_token=${session.refresh_token}&redirect_to=${encodeURIComponent(url.pathname + url.search)}`
        window.open(authUrl, '_blank')
      } else {
        window.open(system.href, '_blank')
      }
    } else {
      router.push(system.href)
    }
  }

  const allowedSystems = useMemo(() => systems.filter(s => {
    const modulo = systemToModulo[s.id]
    return modulo ? temAcesso(modulo) : true
  }), [temAcesso])

  const searchLower = searchTerm.toLowerCase()
  const filteredSystems = useMemo(() => allowedSystems.filter(s =>
    s.name.toLowerCase().includes(searchLower) ||
    s.description.toLowerCase().includes(searchLower) ||
    s.tag.toLowerCase().includes(searchLower)
  ), [allowedSystems, searchLower])

  const greeting = () => {
    const h = currentTime.getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  const executarSync = async () => {
    // Monta apenas os steps selecionados, distribuindo o progresso igualmente
    const tiposEscolhidos = (['clientes', 'projetos', 'produtos'] as const).filter(t => syncSelection[t])
    if (tiposEscolhidos.length === 0) {
      setSyncError('Selecione pelo menos um item para sincronizar')
      return
    }

    setSyncRunning(true)
    setSyncProgress(0)
    setSyncResults(null)
    setSyncError('')
    const results: any = {}

    const fatia = 100 / tiposEscolhidos.length
    const steps = tiposEscolhidos.map((tipo, i) => ({
      tipo,
      label: `Sincronizando ${tipo}...`,
      peso: Math.round(fatia * (i + 1)),
      prev: Math.round(fatia * i),
    }))

    try {
      for (const step of steps) {
        setSyncStep(step.label)
        let current = step.prev
        const interval = setInterval(() => {
          current = Math.min(current + 1, step.peso - 2)
          setSyncProgress(current)
        }, 300)

        const res = await fetch(`/api/pos/sync?tipo=${step.tipo}`, {
          method: 'POST',
          headers: { 'x-sync-manual': 'true' },
        })
        clearInterval(interval)
        const data = await res.json()

        if (!data.sucesso) {
          setSyncError(data.erro || `Erro em ${step.tipo}`)
          setSyncProgress(step.peso)
          setSyncRunning(false)
          return
        }

        results[step.tipo] = data.resultado
        setSyncProgress(step.peso)
      }

      setSyncProgress(100)
      setSyncStep('Concluído!')
      setSyncResults(results)
    } catch (err: any) {
      setSyncError(err.message || 'Erro desconhecido')
    } finally {
      setSyncRunning(false)
    }
  }

  return (
    <div style={{ padding: '32px 40px' }}>
      {/* Greeting */}
      <div style={{ marginBottom: '40px' }} className="animate-fade-in">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '32px', fontWeight: '800', color: '#1a1a1a', marginBottom: '8px' }}>
              {greeting()}, <span className="gradient-text">{userProfile?.nome?.split(' ')[0] || 'Usuário'}</span>
            </h2>
            <p style={{ color: '#a3a3a3', fontSize: '15px', fontWeight: '400' }}>
              Acesse seus sistemas e acompanhe as atividades
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={() => setShowSync(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '10px 16px', borderRadius: '12px',
                background: '#ffffff', border: '1px solid #f0f0f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                cursor: 'pointer', color: '#a3a3a3', fontSize: '13px', fontWeight: '500',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#fecaca'; e.currentTarget.style.color = '#dc2626' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#f0f0f0'; e.currentTarget.style.color = '#a3a3a3' }}
            >
              <RefreshCw size={15} />
              Sync
            </button>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 18px', borderRadius: '12px',
              background: '#ffffff', border: '1px solid #f0f0f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}>
              <Clock size={16} color="#a3a3a3" />
              <span style={{ fontSize: '14px', color: '#737373', fontWeight: '500', fontVariantNumeric: 'tabular-nums' }}>
                {currentTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px',
        marginBottom: '40px'
      }}>
        {[
          { icon: <BarChart3 size={20} />, label: 'Sistemas', value: String(allowedSystems.length) },
          { icon: <Users size={20} />, label: 'Função', value: userProfile?.funcao || '-' },
          { icon: <Activity size={20} />, label: 'Acessos Hoje', value: recentLogs.filter(l => new Date(l.created_at).toDateString() === new Date().toDateString()).length.toString() },
          { icon: <Clock size={20} />, label: 'Último Acesso', value: recentLogs[0] ? new Date(recentLogs[0].created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-' }
        ].map((stat, i) => (
          <div key={i} style={{
            padding: '20px 24px', borderRadius: '16px',
            background: '#ffffff', border: '1px solid #f0f0f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            animation: `fadeIn 0.6s ease-out ${i * 0.1}s both`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '10px',
                background: '#fef2f2', display: 'flex',
                alignItems: 'center', justifyContent: 'center', color: '#dc2626'
              }}>
                {stat.icon}
              </div>
              <div>
                <p style={{ fontSize: '11px', color: '#a3a3a3', fontWeight: '600', letterSpacing: '1px', marginBottom: '2px' }}>
                  {stat.label.toUpperCase()}
                </p>
                <p style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a' }}>
                  {stat.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search + Section title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <div style={{
          width: '4px', height: '24px', borderRadius: '2px',
          background: 'linear-gradient(180deg, #dc2626, #b91c1c)'
        }} />
        <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a' }}>
          Sistemas Disponíveis
        </h3>
        <span style={{
          fontSize: '12px', fontWeight: '600', color: '#a3a3a3',
          background: '#f5f5f5', padding: '4px 12px',
          borderRadius: '20px'
        }}>
          {filteredSystems.length} sistemas
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative', width: '280px' }}>
          <Search size={14} style={{
            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3'
          }} />
          <input
            type="text"
            placeholder="Buscar sistema..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%', padding: '8px 14px 8px 36px', borderRadius: '10px',
              background: '#ffffff', border: '1px solid #e5e5e5',
              color: '#1a1a1a', fontSize: '13px', outline: 'none', fontFamily: 'Inter'
            }}
          />
        </div>
      </div>

      {/* System Cards */}
      {allowedSystems.length === 0 && !loadingPerm && (
        <div style={{
          padding: '60px 40px', textAlign: 'center', borderRadius: '20px',
          background: '#ffffff', border: '1px solid #f0f0f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: '20px'
        }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '16px', margin: '0 auto 20px',
            background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Package size={28} color="#dc2626" />
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', marginBottom: '8px' }}>
            Aguardando liberação
          </h3>
          <p style={{ fontSize: '14px', color: '#a3a3a3', maxWidth: '400px', margin: '0 auto' }}>
            Seu acesso ainda não foi configurado. Entre em contato com o administrador do sistema para liberar os módulos.
          </p>
        </div>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
        gap: '20px'
      }}>
        {filteredSystems.map((system, index) => (
          <div
            key={system.id}
            className="card-hover"
            onClick={() => openSystem(system)}
            onMouseEnter={() => setHoveredCard(system.id)}
            onMouseLeave={() => setHoveredCard(null)}
            style={{
              borderRadius: '20px', overflow: 'hidden', cursor: 'pointer',
              background: '#ffffff',
              border: hoveredCard === system.id
                ? '1px solid #fecaca'
                : '1px solid #f0f0f0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              animation: `fadeIn 0.6s ease-out ${index * 0.08}s both`,
              position: 'relative'
            }}
          >
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
              background: hoveredCard === system.id ? system.gradient : 'transparent',
              transition: 'all 0.4s ease'
            }} />

            <div style={{ padding: '28px' }}>
              <div style={{
                display: 'flex', alignItems: 'flex-start',
                justifyContent: 'space-between', marginBottom: '20px'
              }}>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '14px',
                  background: system.gradient, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  color: '#fff', boxShadow: '0 8px 24px rgba(220,38,38,0.2)',
                  transition: 'all 0.3s',
                  transform: hoveredCard === system.id ? 'scale(1.08)' : 'scale(1)'
                }}>
                  {system.icon}
                </div>
                <span style={{
                  fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px',
                  color: '#dc2626', background: '#fef2f2',
                  padding: '5px 12px', borderRadius: '8px',
                  border: '1px solid #fecaca'
                }}>
                  {system.tag}
                </span>
              </div>

              <h4 style={{
                fontSize: '18px', fontWeight: '700', color: '#1a1a1a',
                marginBottom: '8px'
              }}>
                {system.name}
              </h4>
              <p style={{
                fontSize: '13px', color: '#a3a3a3', lineHeight: '1.6',
                marginBottom: '20px'
              }}>
                {system.description}
              </p>

              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                paddingTop: '16px', borderTop: '1px solid #f5f5f5'
              }}>
                <span style={{
                  fontSize: '11px', color: '#d4d4d4', fontWeight: '500',
                  display: 'flex', alignItems: 'center', gap: '6px'
                }}>
                  <div style={{
                    width: '6px', height: '6px', borderRadius: '50%',
                    background: '#22c55e'
                  }} />
                  {system.external ? 'Externo' : 'Integrado'}
                </span>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  color: hoveredCard === system.id ? '#dc2626' : '#d4d4d4',
                  fontSize: '12px', fontWeight: '600', transition: 'all 0.3s'
                }}>
                  {system.external ? 'Abrir' : 'Acessar'}
                  <ChevronRight size={14} style={{
                    transition: 'transform 0.3s',
                    transform: hoveredCard === system.id ? 'translateX(4px)' : 'translateX(0)'
                  }} />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Minhas Tarefas */}
      <div style={{ marginTop: '48px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '4px', height: '24px', borderRadius: '2px',
              background: 'linear-gradient(180deg, #dc2626, #b91c1c)'
            }} />
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a' }}>
              Minhas Tarefas
            </h3>
            {minhasTarefas.length > 0 && (
              <span style={{
                fontSize: '11px', fontWeight: '700', color: '#fff',
                background: '#dc2626', padding: '2px 10px', borderRadius: '10px'
              }}>
                {minhasTarefas.length}
              </span>
            )}
          </div>
          <button
            onClick={() => router.push('/tarefas')}
            style={{
              background: 'none', border: 'none', color: '#dc2626',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '4px'
            }}
          >
            Ver todas <ChevronRight size={16} />
          </button>
        </div>

        {tarefasLoading ? (
          <div style={{
            padding: '40px', textAlign: 'center', borderRadius: '16px',
            background: '#fff', border: '1px solid #f0f0f0'
          }}>
            <p style={{ color: '#a3a3a3', fontSize: '13px' }}>Carregando tarefas...</p>
          </div>
        ) : minhasTarefas.length === 0 ? (
          <div style={{
            padding: '40px', textAlign: 'center', borderRadius: '16px',
            background: '#fff', border: '1px solid #f0f0f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            <ClipboardCheck size={36} color="#e5e5e5" style={{ margin: '0 auto 12px', display: 'block' }} />
            <p style={{ color: '#a3a3a3', fontSize: '14px', margin: 0 }}>Nenhuma tarefa pendente</p>
          </div>
        ) : (
          <div style={{
            borderRadius: '16px', overflow: 'hidden',
            background: '#fff', border: '1px solid #f0f0f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            {minhasTarefas.map((t: any, i: number) => {
              const isAtrasada = t.computed_status === 'atrasada'
              const hasDue = !!t.prazo
              const priorityColors: Record<number, string> = { 0: '#a3a3a3', 1: '#3b82f6', 2: '#f59e0b', 3: '#f97316', 4: '#ef4444', 5: '#dc2626' }
              const priorityLabels: Record<number, string> = { 0: '', 1: 'Baixa', 2: 'Normal', 3: 'Alta', 4: 'Urgente', 5: 'Crítica' }
              const dueDate = hasDue ? new Date(t.prazo) : null
              const now = new Date()
              const diffDays = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null

              return (
                <div
                  key={t.id}
                  onClick={() => router.push('/tarefas')}
                  style={{
                    padding: '16px 24px',
                    display: 'flex', alignItems: 'center', gap: '16px',
                    borderBottom: i < minhasTarefas.length - 1 ? '1px solid #f5f5f5' : 'none',
                    borderLeft: `3px solid ${isAtrasada ? '#ef4444' : '#f59e0b'}`,
                    cursor: 'pointer', transition: 'background 0.15s',
                    background: isAtrasada ? '#fffbfb' : 'transparent'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafa' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isAtrasada ? '#fffbfb' : 'transparent' }}
                >
                  {/* Ícone status */}
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    background: isAtrasada ? '#fef2f2' : '#fffbeb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {isAtrasada
                      ? <AlertTriangle size={18} color="#ef4444" />
                      : <Clock size={18} color="#f59e0b" />
                    }
                  </div>

                  {/* Conteúdo */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: '14px', fontWeight: '500', color: '#1a1a1a',
                      margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                    }}>
                      {t.titulo}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                      {t.criador && (
                        <span style={{ fontSize: '12px', color: '#a3a3a3' }}>
                          de {t.criador.nome}
                        </span>
                      )}
                      {t.prioridade > 0 && (
                        <span style={{
                          fontSize: '10px', fontWeight: '600',
                          color: priorityColors[t.prioridade] || '#a3a3a3',
                          textTransform: 'uppercase'
                        }}>
                          {priorityLabels[t.prioridade]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Data */}
                  {hasDue && (
                    <div style={{
                      textAlign: 'right', flexShrink: 0
                    }}>
                      <p style={{
                        fontSize: '12px', fontWeight: '600', margin: 0,
                        color: isAtrasada ? '#ef4444' : diffDays !== null && diffDays <= 1 ? '#f59e0b' : '#737373'
                      }}>
                        {dueDate!.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      </p>
                      <p style={{
                        fontSize: '10px', color: isAtrasada ? '#ef4444' : '#a3a3a3',
                        margin: '2px 0 0 0', fontWeight: isAtrasada ? '600' : '400'
                      }}>
                        {isAtrasada ? `${Math.abs(diffDays!)} dia(s) atrás` : diffDays === 0 ? 'Hoje' : diffDays === 1 ? 'Amanhã' : `${diffDays} dias`}
                      </p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Recent Activity */}
      {recentLogs.length > 0 && (
        <div style={{ marginTop: '48px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            marginBottom: '20px'
          }}>
            <div style={{
              width: '4px', height: '24px', borderRadius: '2px',
              background: 'linear-gradient(180deg, #ef4444, #dc2626)'
            }} />
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a' }}>
              Atividade Recente
            </h3>
          </div>

          <div style={{
            borderRadius: '16px', overflow: 'hidden',
            background: '#ffffff', border: '1px solid #f0f0f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
          }}>
            {recentLogs.map((log, i) => (
              <div key={log.id || i} style={{
                padding: '16px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: i < recentLogs.length - 1 ? '1px solid #f5f5f5' : 'none'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Activity size={16} color="#a3a3a3" />
                  <span style={{ fontSize: '13px', color: '#525252', fontWeight: '500' }}>
                    Acessou <span style={{ color: '#dc2626', fontWeight: '600' }}>{log.sistema}</span>
                  </span>
                </div>
                <span style={{ fontSize: '12px', color: '#d4d4d4' }}>
                  {new Date(log.created_at).toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Sync Omie */}
      {showSync && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !syncRunning) setShowSync(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            backdropFilter: 'blur(8px)', zIndex: 50000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          <div style={{
            background: '#fff', borderRadius: '24px', width: '480px',
            padding: '40px', boxShadow: '0 25px 60px rgba(0,0,0,0.15)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '12px',
                  background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Database size={22} color="#dc2626" />
                </div>
                <div>
                  <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>Sync Omie</h3>
                  <p style={{ fontSize: '12px', color: '#a3a3a3', margin: 0 }}>Clientes, projetos e produtos</p>
                </div>
              </div>
              {!syncRunning && (
                <button onClick={() => setShowSync(false)} style={{
                  background: '#f5f5f5', border: 'none', borderRadius: '10px',
                  width: '36px', height: '36px', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', color: '#737373'
                }}>
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Barra de progresso */}
            <div style={{
              background: '#f5f5f5', borderRadius: '12px', height: '12px',
              overflow: 'hidden', marginBottom: '16px'
            }}>
              <div style={{
                height: '100%', borderRadius: '12px',
                background: syncError ? '#ef4444' : syncProgress === 100 ? '#22c55e' : 'linear-gradient(90deg, #dc2626, #ef4444)',
                width: `${syncProgress}%`,
                transition: 'width 0.4s ease-out'
              }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <span style={{ fontSize: '13px', color: syncError ? '#ef4444' : '#737373', fontWeight: '500' }}>
                {syncError || syncStep || 'Pronto para sincronizar'}
              </span>
              <span style={{ fontSize: '20px', fontWeight: '700', color: syncProgress === 100 ? '#22c55e' : '#1a1a1a' }}>
                {syncProgress}%
              </span>
            </div>

            {/* Etapas + seleção (checkboxes) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
              {([
                { label: 'Clientes', key: 'clientes' as const },
                { label: 'Projetos', key: 'projetos' as const },
                { label: 'Produtos', key: 'produtos' as const },
              ]).map(s => {
                const selected = syncSelection[s.key]
                const hasResult = !!syncResults?.[s.key]
                const done = hasResult
                const active = syncRunning && selected && !done && syncStep.toLowerCase().includes(s.key)
                const disabledVisual = !selected && !syncRunning
                return (
                  <label key={s.key} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '12px 16px', borderRadius: '12px',
                    background: done ? '#f0fdf4' : active ? '#fef2f2' : disabledVisual ? '#fafafa' : '#fff7ed',
                    border: `1px solid ${done ? '#bbf7d0' : active ? '#fecaca' : disabledVisual ? '#f0f0f0' : '#fed7aa'}`,
                    transition: 'all 0.3s',
                    cursor: syncRunning ? 'not-allowed' : 'pointer',
                    opacity: disabledVisual ? 0.6 : 1,
                  }}>
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={syncRunning}
                      onChange={e => setSyncSelection(prev => ({ ...prev, [s.key]: e.target.checked }))}
                      style={{
                        width: 18, height: 18, accentColor: '#dc2626',
                        cursor: syncRunning ? 'not-allowed' : 'pointer', flexShrink: 0,
                      }}
                    />
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '8px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: done ? '#22c55e' : active ? '#dc2626' : '#e5e5e5',
                      color: '#fff', flexShrink: 0
                    }}>
                      {done ? <Check size={14} /> : active ? <RefreshCw size={14} className="animate-spin" /> : <Database size={14} />}
                    </div>
                    <span style={{
                      fontSize: '14px', fontWeight: done ? '600' : '500',
                      color: done ? '#16a34a' : active ? '#dc2626' : '#525252'
                    }}>
                      {s.label}
                    </span>
                    {done && syncResults?.[s.key] && (
                      <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#16a34a', fontWeight: '600' }}>
                        {syncResults[s.key].total} registros
                      </span>
                    )}
                  </label>
                )
              })}
            </div>

            {/* Botão */}
            {!syncRunning && syncProgress < 100 && (
              <button
                onClick={executarSync}
                style={{
                  width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff',
                  fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
                  boxShadow: '0 4px 12px rgba(220,38,38,0.3)', transition: 'all 0.2s'
                }}
              >
                <RefreshCw size={18} /> Iniciar Sincronizacao
              </button>
            )}

            {syncProgress === 100 && !syncError && (
              <button
                onClick={() => { setShowSync(false); setSyncProgress(0); setSyncStep(''); setSyncResults(null) }}
                style={{
                  width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                  background: '#22c55e', color: '#fff',
                  fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                }}
              >
                <Check size={18} /> Concluido — Fechar
              </button>
            )}

            {syncError && !syncRunning && (
              <button
                onClick={executarSync}
                style={{
                  width: '100%', padding: '14px', borderRadius: '14px', border: 'none',
                  background: '#ef4444', color: '#fff',
                  fontSize: '15px', fontWeight: '700', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'
                }}
              >
                <RefreshCw size={18} /> Tentar Novamente
              </button>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{
        marginTop: '60px', paddingTop: '24px',
        borderTop: '1px solid #f0f0f0',
        textAlign: 'center'
      }}>
        <p
          style={{ fontSize: '12px', color: '#d4d4d4', fontWeight: '500', cursor: 'default' }}
          onDoubleClick={() => setShowSync(true)}
          title=""
        >
          Nova Tratores &copy; {new Date().getFullYear()} &mdash; Portal Corporativo v1.0
        </p>
      </div>
    </div>
  )
}
