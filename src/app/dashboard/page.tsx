'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import {
  LogOut, Settings, ClipboardList, Wrench, FileText,
  DollarSign, Activity, Clock, ChevronRight, Search, Bell,
  BarChart3, Users, Layers, Menu, X, Shield, User as UserIcon
} from 'lucide-react'

interface SystemCard {
  id: string
  name: string
  description: string
  icon: React.ReactNode
  color: string
  gradient: string
  port: number
  path: string
  tag: string
}

const systems: SystemCard[] = [
  {
    id: 'sistema-financeiro',
    name: 'Financeiro',
    description: 'Gestão de NF, boletos, contas a pagar e receber, chamados RH',
    icon: <DollarSign size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)',
    port: 3001,
    path: '',
    tag: 'FINANÇAS'
  },
  {
    id: 'app-requisicoes',
    name: 'Requisições',
    description: 'Kanban de requisições de materiais e serviços das unidades',
    icon: <ClipboardList size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #ef4444, #dc2626)',
    port: 3002,
    path: '',
    tag: 'COMPRAS'
  },
  {
    id: 'controle-revisao',
    name: 'Controle de Revisões',
    description: 'Acompanhamento de revisões periódicas de tratores com integração Gmail',
    icon: <Wrench size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #b91c1c, #991b1b)',
    port: 3003,
    path: '',
    tag: 'MANUTENÇÃO'
  },
  {
    id: 'pos',
    name: 'Pós-Vendas (OS)',
    description: 'Ordens de serviço, integração Omie ERP, geração de PDF',
    icon: <Settings size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #dc2626, #991b1b)',
    port: 3004,
    path: '',
    tag: 'SERVIÇOS'
  },
  {
    id: 'ppv',
    name: 'Pós-Vendas (Garantia)',
    description: 'Processos de garantia, peças, pedidos Omie e rastreamento',
    icon: <Shield size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #ef4444, #b91c1c)',
    port: 3005,
    path: '',
    tag: 'GARANTIA'
  },
  {
    id: 'proposta-comercial',
    name: 'Proposta Comercial',
    description: 'Geração de propostas com PDF e QR Code para clientes',
    icon: <FileText size={28} />,
    color: '#dc2626',
    gradient: 'linear-gradient(135deg, #991b1b, #7f1d1d)',
    port: 5173,
    path: '',
    tag: 'VENDAS'
  }
]

interface LogEntry {
  id: string
  sistema: string
  acao: string
  created_at: string
}

export default function DashboardPage() {
  const { userProfile, loading, handleLogout } = useAuth()
  const [searchTerm, setSearchTerm] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [recentLogs, setRecentLogs] = useState<LogEntry[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
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

  const logAccess = async (system: SystemCard) => {
    if (!userProfile) return
    await supabase.from('portal_logs').insert([{
      user_id: userProfile.id,
      user_nome: userProfile.nome,
      sistema: system.name,
      acao: 'acesso'
    }])
  }

  const openSystem = (system: SystemCard) => {
    logAccess(system)
    window.open(`http://localhost:${system.port}${system.path}`, '_blank')
  }

  const filteredSystems = systems.filter(s =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.tag.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#ffffff'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '14px', margin: '0 auto 20px',
            background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
            animation: 'pulse-glow 2s infinite'
          }} />
          <p style={{ color: '#a3a3a3', fontSize: '13px', letterSpacing: '3px', fontWeight: '500' }}>
            CARREGANDO...
          </p>
        </div>
      </div>
    )
  }

  const greeting = () => {
    const h = currentTime.getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', position: 'relative' }}>

      {/* ===== TOP BAR ===== */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        padding: '0 32px', height: '72px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#ffffff',
        borderBottom: '1px solid #f0f0f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              background: 'none', border: 'none', color: '#737373',
              cursor: 'pointer', display: 'flex', padding: '8px'
            }}
          >
            {sidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <img
              src="/Logo_Nova.png"
              alt="Nova Tratores"
              style={{ height: '40px' }}
            />
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', width: '340px' }}>
          <Search size={16} style={{
            position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3'
          }} />
          <input
            type="text"
            placeholder="Buscar sistema..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%', padding: '10px 16px 10px 42px', borderRadius: '12px',
              background: '#f5f5f5', border: '1px solid #e5e5e5',
              color: '#1a1a1a', fontSize: '13px', outline: 'none', fontFamily: 'Inter',
              transition: 'all 0.3s'
            }}
          />
        </div>

        {/* User section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button style={{
            position: 'relative', background: 'none', border: 'none',
            color: '#a3a3a3', cursor: 'pointer', padding: '8px'
          }}>
            <Bell size={20} />
            <div style={{
              position: 'absolute', top: '6px', right: '6px',
              width: '8px', height: '8px', borderRadius: '50%',
              background: '#dc2626'
            }} />
          </button>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '6px 16px 6px 6px', borderRadius: '14px',
            background: '#f5f5f5', cursor: 'pointer'
          }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '10px', overflow: 'hidden',
              background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              {userProfile?.avatar_url ? (
                <img src={userProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <UserIcon size={18} color="#fff" />
              )}
            </div>
            <div>
              <p style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a1a', lineHeight: '1.2' }}>
                {userProfile?.nome?.split(' ')[0] || 'Usuário'}
              </p>
              <p style={{ fontSize: '10px', color: '#a3a3a3', fontWeight: '500' }}>
                {userProfile?.funcao || 'Colaborador'}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ===== SIDEBAR ===== */}
      <div style={{
        position: 'fixed', top: '72px', left: 0, bottom: 0,
        width: sidebarOpen ? '280px' : '0px', overflow: 'hidden',
        transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        zIndex: 40, background: '#ffffff',
        borderRight: sidebarOpen ? '1px solid #f0f0f0' : 'none',
        boxShadow: sidebarOpen ? '4px 0 20px rgba(0,0,0,0.04)' : 'none'
      }}>
        <div style={{ padding: '24px', width: '280px' }}>
          {/* User info */}
          <div style={{
            padding: '20px', borderRadius: '16px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            marginBottom: '24px'
          }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '16px', overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '14px'
            }}>
              {userProfile?.avatar_url ? (
                <img src={userProfile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '16px' }} />
              ) : (
                <div style={{
                  width: '100%', height: '100%', borderRadius: '16px',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <UserIcon size={24} color="#fff" />
                </div>
              )}
            </div>
            <p style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a1a', marginBottom: '4px' }}>
              {userProfile?.nome || 'Usuário'}
            </p>
            <p style={{ fontSize: '12px', color: '#dc2626', fontWeight: '600', letterSpacing: '1px' }}>
              {userProfile?.funcao || 'Colaborador'}
            </p>
          </div>

          {/* Quick nav */}
          <p style={{
            fontSize: '10px', fontWeight: '700', color: '#a3a3a3',
            letterSpacing: '2px', marginBottom: '12px', paddingLeft: '4px'
          }}>
            NAVEGAÇÃO RÁPIDA
          </p>
          {systems.map((sys) => (
            <button
              key={sys.id}
              onClick={() => { openSystem(sys); setSidebarOpen(false) }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 14px', borderRadius: '12px', border: 'none',
                background: 'transparent', color: '#737373', cursor: 'pointer',
                fontSize: '13px', fontWeight: '500', fontFamily: 'Inter',
                transition: 'all 0.2s', textAlign: 'left', marginBottom: '2px'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#fef2f2'
                e.currentTarget.style.color = '#dc2626'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = '#737373'
              }}
            >
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: sys.gradient, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}>
                <span style={{ color: '#fff', display: 'flex', transform: 'scale(0.6)' }}>{sys.icon}</span>
              </div>
              {sys.name}
            </button>
          ))}

          {/* Logout */}
          <div style={{
            borderTop: '1px solid #f0f0f0',
            marginTop: '20px', paddingTop: '20px'
          }}>
            <button
              onClick={handleLogout}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px 14px', borderRadius: '12px', border: 'none',
                background: '#fef2f2', color: '#dc2626',
                cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                fontFamily: 'Inter', transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#fef2f2' }}
            >
              <LogOut size={18} />
              Sair do Portal
            </button>
          </div>
        </div>
      </div>

      {/* ===== MAIN CONTENT ===== */}
      <main style={{
        padding: '32px 40px',
        marginLeft: sidebarOpen ? '280px' : '0px',
        transition: 'margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
      }}>
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

        {/* Stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px',
          marginBottom: '40px'
        }}>
          {[
            { icon: <BarChart3 size={20} />, label: 'Sistemas', value: '6' },
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

        {/* Section title */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          marginBottom: '24px'
        }}>
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
        </div>

        {/* ===== SYSTEM CARDS ===== */}
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
              {/* Top accent line */}
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
                    localhost:{system.port}
                  </span>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    color: hoveredCard === system.id ? '#dc2626' : '#d4d4d4',
                    fontSize: '12px', fontWeight: '600', transition: 'all 0.3s'
                  }}>
                    Acessar
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

        {/* ===== RECENT ACTIVITY ===== */}
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

        {/* Footer */}
        <div style={{
          marginTop: '60px', paddingTop: '24px',
          borderTop: '1px solid #f0f0f0',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '12px', color: '#d4d4d4', fontWeight: '500' }}>
            Nova Tratores &copy; {new Date().getFullYear()} &mdash; Portal Corporativo v1.0
          </p>
        </div>
      </main>
    </div>
  )
}
