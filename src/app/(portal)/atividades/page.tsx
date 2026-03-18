'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { supabase } from '@/lib/supabase'
import {
  Activity, Search, Filter, ChevronDown, ChevronLeft, ChevronRight,
  Clock, User, Settings, ClipboardList, Wrench, DollarSign, Shield, FileText
} from 'lucide-react'

interface AuditEntry {
  id: number
  user_id: string
  user_nome: string
  sistema: string
  acao: string
  entidade: string | null
  entidade_id: string | null
  entidade_label: string | null
  detalhes: Record<string, unknown>
  created_at: string
}

const SISTEMAS = [
  { value: '', label: 'Todos os sistemas' },
  { value: 'revisoes', label: 'Controle de Revisões' },
  { value: 'requisicoes', label: 'Requisições' },
  { value: 'pos', label: 'Pós-Vendas (OS)' },
  { value: 'ppv', label: 'Peças (Pedido de Venda)' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'propostas', label: 'Proposta Comercial' },
]

const SISTEMA_ICONS: Record<string, React.ReactNode> = {
  revisoes: <Wrench size={16} />,
  requisicoes: <ClipboardList size={16} />,
  pos: <Settings size={16} />,
  ppv: <Shield size={16} />,
  financeiro: <DollarSign size={16} />,
  propostas: <FileText size={16} />,
}

const ACAO_COLORS: Record<string, { bg: string; text: string }> = {
  criar: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  editar: { bg: 'bg-blue-50', text: 'text-blue-700' },
  deletar: { bg: 'bg-red-50', text: 'text-red-700' },
  visualizar: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
  enviar_email: { bg: 'bg-purple-50', text: 'text-purple-700' },
  mover_status: { bg: 'bg-amber-50', text: 'text-amber-700' },
  upload: { bg: 'bg-cyan-50', text: 'text-cyan-700' },
  acesso: { bg: 'bg-zinc-100', text: 'text-zinc-500' },
}

const PAGE_SIZE = 30

function AtividadesPageInner() {
  const { userProfile } = useAuth()
  const [logs, setLogs] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  // Filtros
  const [filtroSistema, setFiltroSistema] = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [filtroEntidade, setFiltroEntidade] = useState('')
  const [showFiltros, setShowFiltros] = useState(false)

  // Usuários únicos para o filtro
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string }[]>([])

  useEffect(() => {
    const fetchUsuarios = async () => {
      const { data } = await supabase
        .from('audit_log')
        .select('user_id, user_nome')
      if (data) {
        const unique = Array.from(
          new Map(data.map(d => [d.user_id, { id: d.user_id, nome: d.user_nome }])).values()
        )
        setUsuarios(unique.sort((a, b) => a.nome.localeCompare(b.nome)))
      }
    }
    fetchUsuarios()
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filtroSistema) query = query.eq('sistema', filtroSistema)
    if (filtroUsuario) query = query.eq('user_id', filtroUsuario)
    if (filtroEntidade) query = query.ilike('entidade_label', `%${filtroEntidade}%`)
    if (filtroBusca) {
      query = query.or(`entidade_label.ilike.%${filtroBusca}%,acao.ilike.%${filtroBusca}%,entidade_id.ilike.%${filtroBusca}%`)
    }

    const { data, count } = await query
    if (data) setLogs(data)
    if (count !== null) setTotalCount(count)
    setLoading(false)
  }, [page, filtroSistema, filtroUsuario, filtroEntidade, filtroBusca])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  // Reset page quando muda filtro
  useEffect(() => { setPage(0) }, [filtroSistema, filtroUsuario, filtroEntidade, filtroBusca])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffH = Math.floor(diffMs / 3600000)

    if (diffMin < 1) return 'Agora'
    if (diffMin < 60) return `${diffMin}min atrás`
    if (diffH < 24) return `${diffH}h atrás`

    return d.toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  const acaoLabel = (acao: string) => {
    const map: Record<string, string> = {
      criar: 'Criou',
      editar: 'Editou',
      deletar: 'Deletou',
      visualizar: 'Visualizou',
      enviar_email: 'Enviou email',
      mover_status: 'Moveu status',
      upload: 'Fez upload',
      acesso: 'Acessou',
    }
    return map[acao] || acao
  }

  const sistemaLabel = (key: string) => {
    return SISTEMAS.find(s => s.value === key)?.label || key
  }

  return (
    <div style={{ padding: '32px 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: '800', color: '#1a1a1a', marginBottom: '6px' }}>
              Atividades
            </h2>
            <p style={{ color: '#a3a3a3', fontSize: '14px' }}>
              Histórico de ações dos usuários nos sistemas
            </p>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 16px', borderRadius: '12px',
            background: '#fef2f2', border: '1px solid #fecaca',
            fontSize: '13px', color: '#dc2626', fontWeight: '600'
          }}>
            <Activity size={16} />
            {totalCount} registros
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{
        background: '#ffffff', borderRadius: '16px', border: '1px solid #f0f0f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)', marginBottom: '24px', overflow: 'hidden'
      }}>
        <div style={{
          padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px'
        }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{
              position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3'
            }} />
            <input
              type="text"
              placeholder="Buscar por card, ID, ação..."
              value={filtroBusca}
              onChange={(e) => setFiltroBusca(e.target.value)}
              style={{
                width: '100%', padding: '8px 14px 8px 36px', borderRadius: '10px',
                background: '#fafafa', border: '1px solid #e5e5e5',
                color: '#1a1a1a', fontSize: '13px', outline: 'none', fontFamily: 'Inter'
              }}
            />
          </div>

          <select
            value={filtroSistema}
            onChange={(e) => setFiltroSistema(e.target.value)}
            style={{
              padding: '8px 14px', borderRadius: '10px',
              background: '#fafafa', border: '1px solid #e5e5e5',
              color: '#1a1a1a', fontSize: '13px', fontFamily: 'Inter',
              outline: 'none', cursor: 'pointer'
            }}
          >
            {SISTEMAS.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <button
            onClick={() => setShowFiltros(!showFiltros)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '10px',
              background: showFiltros ? '#fef2f2' : '#fafafa',
              border: showFiltros ? '1px solid #fecaca' : '1px solid #e5e5e5',
              color: showFiltros ? '#dc2626' : '#737373',
              fontSize: '13px', fontFamily: 'Inter', cursor: 'pointer', fontWeight: '500'
            }}
          >
            <Filter size={14} />
            Filtros
            <ChevronDown size={12} style={{
              transition: 'transform 0.2s',
              transform: showFiltros ? 'rotate(180deg)' : 'rotate(0deg)'
            }} />
          </button>
        </div>

        {showFiltros && (
          <div style={{
            padding: '0 24px 16px', display: 'flex', gap: '12px',
            borderTop: '1px solid #f5f5f5', paddingTop: '16px'
          }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: '#a3a3a3', fontWeight: '600', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                USUÁRIO
              </label>
              <select
                value={filtroUsuario}
                onChange={(e) => setFiltroUsuario(e.target.value)}
                style={{
                  width: '100%', padding: '8px 14px', borderRadius: '10px',
                  background: '#fafafa', border: '1px solid #e5e5e5',
                  color: '#1a1a1a', fontSize: '13px', fontFamily: 'Inter', outline: 'none'
                }}
              >
                <option value="">Todos os usuários</option>
                {usuarios.map(u => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
            </div>

            <div style={{ flex: 1 }}>
              <label style={{ fontSize: '11px', color: '#a3a3a3', fontWeight: '600', letterSpacing: '1px', display: 'block', marginBottom: '6px' }}>
                CARD / ENTIDADE
              </label>
              <input
                type="text"
                placeholder="Ex: Requisição #45, Trator MF8737..."
                value={filtroEntidade}
                onChange={(e) => setFiltroEntidade(e.target.value)}
                style={{
                  width: '100%', padding: '8px 14px', borderRadius: '10px',
                  background: '#fafafa', border: '1px solid #e5e5e5',
                  color: '#1a1a1a', fontSize: '13px', fontFamily: 'Inter', outline: 'none'
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Tabela de logs */}
      <div style={{
        background: '#ffffff', borderRadius: '16px', border: '1px solid #f0f0f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden'
      }}>
        {/* Header da tabela */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 140px 100px 1.2fr 200px 120px',
          padding: '12px 24px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fafafa'
        }}>
          {['Usuário', 'Sistema', 'Ação', 'Entidade', 'Detalhes', 'Quando'].map(h => (
            <span key={h} style={{
              fontSize: '10px', fontWeight: '700', color: '#a3a3a3',
              letterSpacing: '1.5px', textTransform: 'uppercase' as const
            }}>
              {h}
            </span>
          ))}
        </div>

        {/* Loading */}
        {loading && (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <p style={{ color: '#a3a3a3', fontSize: '13px' }}>Carregando...</p>
          </div>
        )}

        {/* Empty state */}
        {!loading && logs.length === 0 && (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <Activity size={32} color="#e5e5e5" style={{ margin: '0 auto 12px' }} />
            <p style={{ color: '#a3a3a3', fontSize: '14px', fontWeight: '500' }}>
              Nenhuma atividade encontrada
            </p>
            <p style={{ color: '#d4d4d4', fontSize: '12px', marginTop: '4px' }}>
              As ações dos usuários aparecerão aqui
            </p>
          </div>
        )}

        {/* Rows */}
        {!loading && logs.map((entry, i) => {
          const acaoStyle = ACAO_COLORS[entry.acao] || ACAO_COLORS.acesso
          const detalhesStr = entry.detalhes && Object.keys(entry.detalhes).length > 0
            ? Object.entries(entry.detalhes)
                .map(([k, v]) => {
                  if (k === 'campo') return `Campo: ${v}`
                  if (k === 'de') return `De: ${v}`
                  if (k === 'para') return `Para: ${v}`
                  if (k === 'status') return `Status: ${v}`
                  return `${k}: ${v}`
                })
                .join(' · ')
            : '—'

          return (
            <div
              key={entry.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 140px 100px 1.2fr 200px 120px',
                padding: '14px 24px',
                borderBottom: i < logs.length - 1 ? '1px solid #f5f5f5' : 'none',
                alignItems: 'center',
                transition: 'background 0.15s',
                cursor: 'default'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#fafafa' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              {/* Usuário */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '8px',
                  background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <User size={13} color="#fff" />
                </div>
                <span style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a1a' }}>
                  {entry.user_nome?.split(' ')[0] || 'Usuário'}
                </span>
              </div>

              {/* Sistema */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: '#dc2626', display: 'flex' }}>
                  {SISTEMA_ICONS[entry.sistema] || <Activity size={16} />}
                </span>
                <span style={{ fontSize: '12px', color: '#737373', fontWeight: '500' }}>
                  {sistemaLabel(entry.sistema)}
                </span>
              </div>

              {/* Ação */}
              <span style={{
                fontSize: '11px', fontWeight: '600',
                padding: '3px 10px', borderRadius: '6px',
                display: 'inline-block', width: 'fit-content'
              }} className={`${acaoStyle.bg} ${acaoStyle.text}`}>
                {acaoLabel(entry.acao)}
              </span>

              {/* Entidade */}
              <div>
                {entry.entidade_label ? (
                  <p style={{ fontSize: '13px', color: '#1a1a1a', fontWeight: '500' }}>
                    {entry.entidade_label}
                  </p>
                ) : (
                  <p style={{ fontSize: '13px', color: '#d4d4d4' }}>—</p>
                )}
                {entry.entidade_id && (
                  <p style={{ fontSize: '11px', color: '#a3a3a3', marginTop: '1px' }}>
                    ID: {entry.entidade_id}
                  </p>
                )}
              </div>

              {/* Detalhes */}
              <p style={{
                fontSize: '12px', color: '#a3a3a3',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const
              }} title={detalhesStr}>
                {detalhesStr}
              </p>

              {/* Quando */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Clock size={12} color="#d4d4d4" />
                <span style={{ fontSize: '12px', color: '#a3a3a3', fontWeight: '500' }}>
                  {formatDate(entry.created_at)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '12px', marginTop: '24px'
        }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '8px 14px', borderRadius: '10px',
              background: '#ffffff', border: '1px solid #e5e5e5',
              color: page === 0 ? '#d4d4d4' : '#737373',
              fontSize: '13px', fontFamily: 'Inter', cursor: page === 0 ? 'default' : 'pointer'
            }}
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <span style={{ fontSize: '13px', color: '#737373', fontWeight: '500' }}>
            Página {page + 1} de {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '8px 14px', borderRadius: '10px',
              background: '#ffffff', border: '1px solid #e5e5e5',
              color: page >= totalPages - 1 ? '#d4d4d4' : '#737373',
              fontSize: '13px', fontFamily: 'Inter', cursor: page >= totalPages - 1 ? 'default' : 'pointer'
            }}
          >
            Próxima <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

export default function AtividadesPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id);
  if (!loadingPerm && userProfile && !temAcesso('atividades')) return <SemPermissao />;
  return <AtividadesPageInner />;
}
