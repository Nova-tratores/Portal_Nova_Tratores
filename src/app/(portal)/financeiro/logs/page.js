'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import FinanceiroNav from '@/components/financeiro/FinanceiroNav'
import {
  Activity, Search, Clock, User, ChevronLeft, ChevronRight,
  Filter, ChevronDown, FileText, DollarSign, Users
} from 'lucide-react'

const PAGE_SIZE = 30

const ACAO_COLORS = {
  criar:            { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
  editar:           { bg: '#eff6ff', text: '#3b82f6', border: '#bfdbfe' },
  deletar:          { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  mover_status:     { bg: '#fffbeb', text: '#d97706', border: '#fde68a' },
  upload:           { bg: '#ecfeff', text: '#0891b2', border: '#a5f3fc' },
  enviar_email:     { bg: '#faf5ff', text: '#7c3aed', border: '#ddd6fe' },
  enviar_omie:      { bg: '#ecfdf5', text: '#047857', border: '#a7f3d0' },
  erro_envio_omie:  { bg: '#fef2f2', text: '#b91c1c', border: '#fca5a5' },
  visualizar:       { bg: '#f5f5f5', text: '#737373', border: '#e5e5e5' },
}

const ACAO_LABELS = {
  criar: 'Criou',
  editar: 'Editou',
  deletar: 'Deletou',
  mover_status: 'Moveu status',
  upload: 'Upload',
  enviar_email: 'Enviou email',
  enviar_omie: 'Enviou ao Omie',
  erro_envio_omie: 'Erro envio Omie',
  visualizar: 'Visualizou',
}

export default function LogsFinanceiro() {
  const { userProfile } = useAuth()
  const { isAdmin, loading: loadingPerm } = usePermissoes(userProfile?.id)

  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [filtroAcao, setFiltroAcao] = useState('')
  const [usuarios, setUsuarios] = useState([])

  useEffect(() => {
    const fetchUsuarios = async () => {
      const { data } = await supabase
        .from('financeiro_usu')
        .select('id, nome')
        .order('nome')
      if (data) setUsuarios(data)
    }
    fetchUsuarios()
  }, [])

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('audit_log')
      .select('*', { count: 'exact' })
      .eq('sistema', 'financeiro')
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    if (filtroUsuario) query = query.eq('user_id', filtroUsuario)
    if (filtroAcao) query = query.eq('acao', filtroAcao)
    if (filtroBusca) {
      const safe = filtroBusca.replace(/%/g, '\\%').replace(/,/g, '')
      query = query.or(`entidade_label.ilike.%${safe}%,acao.ilike.%${safe}%,entidade_id.ilike.%${safe}%,user_nome.ilike.%${safe}%`)
    }

    const { data, count } = await query
    if (data) setLogs(data)
    if (count !== null) setTotalCount(count)
    setLoading(false)
  }, [page, filtroUsuario, filtroAcao, filtroBusca])

  useEffect(() => { fetchLogs() }, [fetchLogs])
  useEffect(() => { setPage(0) }, [filtroUsuario, filtroAcao, filtroBusca])

  const totalPages = Math.ceil(totalCount / PAGE_SIZE)

  const formatDate = (iso) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffH = Math.floor(diffMs / 3600000)
    if (diffMin < 1) return 'Agora'
    if (diffMin < 60) return `${diffMin}min atrás`
    if (diffH < 24) return `${diffH}h atrás`
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  if (loadingPerm) return (
    <div style={{ minHeight: 'calc(100vh - 64px)', fontFamily: 'Montserrat, sans-serif' }}>
      <FinanceiroNav />
      <div style={{ padding: '60px', textAlign: 'center', color: '#6b7280' }}>Carregando...</div>
    </div>
  )

  if (!isAdmin) return (
    <div style={{ minHeight: 'calc(100vh - 64px)', fontFamily: 'Montserrat, sans-serif' }}>
      <FinanceiroNav />
      <div style={{ padding: '80px 40px', textAlign: 'center' }}>
        <Activity size={48} color="#e5e5e5" style={{ margin: '0 auto 16px' }} />
        <p style={{ color: '#a3a3a3', fontSize: '16px', fontWeight: '500' }}>Acesso restrito a administradores</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)', fontFamily: 'Montserrat, sans-serif' }}>
      <FinanceiroNav />

      <div style={{ padding: '24px 32px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', margin: 0 }}>Logs do Financeiro</h2>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '4px' }}>Historico de ações dos usuarios no modulo financeiro</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: '13px', color: '#64748b', fontWeight: '600' }}>
            <Activity size={16} />
            {totalCount} registros
          </div>
        </div>

        {/* Filtros */}
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e5e7eb', marginBottom: '20px', padding: '16px 24px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              placeholder="Buscar por card, usuario, ação..."
              value={filtroBusca}
              onChange={(e) => setFiltroBusca(e.target.value)}
              style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '13px', outline: 'none', fontFamily: 'Montserrat, sans-serif', boxSizing: 'border-box' }}
            />
          </div>

          <select
            value={filtroUsuario}
            onChange={(e) => setFiltroUsuario(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '13px', outline: 'none', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }}
          >
            <option value="">Todos os usuarios</option>
            {usuarios.map(u => (
              <option key={u.id} value={u.id}>{u.nome}</option>
            ))}
          </select>

          <select
            value={filtroAcao}
            onChange={(e) => setFiltroAcao(e.target.value)}
            style={{ padding: '10px 14px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', color: '#1e293b', fontSize: '13px', outline: 'none', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }}
          >
            <option value="">Todas as ações</option>
            <option value="criar">Criou</option>
            <option value="editar">Editou</option>
            <option value="deletar">Deletou</option>
            <option value="mover_status">Moveu status</option>
            <option value="upload">Upload</option>
          </select>
        </div>

        {/* Lista de logs */}
        <div style={{ background: '#ffffff', borderRadius: '16px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          {loading && (
            <div style={{ padding: '48px', textAlign: 'center' }}>
              <p style={{ color: '#94a3b8', fontSize: '14px' }}>Carregando logs...</p>
            </div>
          )}

          {!loading && logs.length === 0 && (
            <div style={{ padding: '60px', textAlign: 'center' }}>
              <Activity size={36} color="#e2e8f0" style={{ margin: '0 auto 12px' }} />
              <p style={{ color: '#94a3b8', fontSize: '15px', fontWeight: '500' }}>Nenhum log encontrado</p>
              <p style={{ color: '#cbd5e1', fontSize: '12px', marginTop: '4px' }}>As ações dos usuarios aparecerão aqui</p>
            </div>
          )}

          {!loading && logs.map((entry, i) => {
            const acaoStyle = ACAO_COLORS[entry.acao] || ACAO_COLORS.visualizar
            const acaoLabel = ACAO_LABELS[entry.acao] || entry.acao

            const detalhesArr = []
            if (entry.detalhes && typeof entry.detalhes === 'object') {
              const d = entry.detalhes
              if (d.campo) detalhesArr.push(`Campo: ${d.campo}`)
              if (d.de !== undefined) detalhesArr.push(`De: ${d.de}`)
              if (d.para !== undefined) detalhesArr.push(`Para: ${d.para}`)
              if (d.status) detalhesArr.push(`Status: ${d.status}`)
              if (d.fornecedor) detalhesArr.push(`Fornecedor: ${d.fornecedor}`)
              if (d.valor) detalhesArr.push(`Valor: ${d.valor}`)
              if (d.metodo) detalhesArr.push(`Método: ${d.metodo}`)
              if (d.nf) detalhesArr.push(`NF: ${d.nf}`)
            }
            const detalhesStr = detalhesArr.length > 0 ? detalhesArr.join(' · ') : null

            return (
              <div
                key={entry.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '16px',
                  padding: '16px 24px',
                  borderBottom: i < logs.length - 1 ? '1px solid #f1f5f9' : 'none',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                {/* Avatar usuario */}
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <User size={16} color="#64748b" />
                </div>

                {/* Info principal */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b' }}>
                      {entry.user_nome || 'Usuario'}
                    </span>
                    <span style={{
                      fontSize: '11px', fontWeight: '600',
                      padding: '2px 10px', borderRadius: '6px',
                      background: acaoStyle.bg, color: acaoStyle.text,
                      border: `1px solid ${acaoStyle.border}`,
                    }}>
                      {acaoLabel}
                    </span>
                    {entry.entidade && (
                      <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '500' }}>
                        {entry.entidade}
                      </span>
                    )}
                  </div>
                  {entry.entidade_label && (
                    <p style={{ fontSize: '13px', color: '#475569', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.entidade_label}
                    </p>
                  )}
                  {detalhesStr && (
                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={detalhesStr}>
                      {detalhesStr}
                    </p>
                  )}
                </div>

                {/* Hora */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                  <Clock size={13} color="#cbd5e1" />
                  <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '500', whiteSpace: 'nowrap' }}>
                    {formatDate(entry.created_at)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginTop: '24px' }}>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '10px 18px', borderRadius: '10px', background: '#ffffff', border: '1px solid #e2e8f0', color: page === 0 ? '#cbd5e1' : '#64748b', fontSize: '13px', cursor: page === 0 ? 'default' : 'pointer', fontFamily: 'Montserrat, sans-serif' }}
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <span style={{ fontSize: '13px', color: '#64748b', fontWeight: '500' }}>
              Pagina {page + 1} de {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '10px 18px', borderRadius: '10px', background: '#ffffff', border: '1px solid #e2e8f0', color: page >= totalPages - 1 ? '#cbd5e1' : '#64748b', fontSize: '13px', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontFamily: 'Montserrat, sans-serif' }}
            >
              Proxima <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
