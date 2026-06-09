'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import {
  Search, ChevronDown, ChevronRight, ArrowLeft, FolderOpen,
  FileText, Package, AlertTriangle, CheckCircle, Download,
  Building2, Filter, XCircle, Plus, X, Loader2, RefreshCw
} from 'lucide-react'

interface NfItem {
  num_os?: string; num_pedido?: string; numero_nf: string; link: string; valor: number; data: string; cliente: string
}
interface NfPendente {
  num_os?: string; num_pedido?: string; valor: number; data: string; cliente: string
}
interface Projeto {
  codigo: number; nome: string; empresa: string; inativo: boolean
  cliente: { cod_cli: number | null; nome: string; cnpj_cpf: string; cidade: string; estado: string }
  os_total: number; os_faturadas: number; os_canceladas: number
  nf_servico: number; nf_servico_pendente: number; valor_servicos: number
  nfs_servico: NfItem[]; nfs_servico_pendentes: NfPendente[]
  pv_total: number; pv_faturados: number
  nf_peca: number; nf_peca_pendente: number; valor_pecas: number
  nfs_peca: NfItem[]; nfs_peca_pendentes: NfPendente[]
  valor_total: number
}
interface ClienteGrupo {
  cliente: { cod_cli: number | null; nome: string; cnpj_cpf: string; cidade: string; estado: string }
  empresa: string
  projetos: Projeto[]
  totais: {
    projetos: number; os_total: number; os_faturadas: number
    nf_servico: number; nf_servico_pendente: number; valor_servicos: number
    pv_total: number; nf_peca: number; nf_peca_pendente: number; valor_pecas: number; valor_total: number
  }
}

function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function fmtDate(d: string | null) {
  if (!d) return '-'
  if (d.includes('/')) return d
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')
}

function ProjetosPageInner() {
  const [data, setData] = useState<{ clientes: ClienteGrupo[]; todos_projetos: Projeto[]; total_projetos: number; total_clientes: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [empresaFilter, setEmpresaFilter] = useState('')
  const [viewMode, setViewMode] = useState<'cliente' | 'projeto'>('projeto')
  const [expandedCliente, setExpandedCliente] = useState<string | null>(null)
  const [expandedProjeto, setExpandedProjeto] = useState<string | null>(null)
  const [filterNf, setFilterNf] = useState<'todos' | 'com-nf' | 'sem-nf' | 'pendente'>('todos')
  const [showCriar, setShowCriar] = useState(false)
  const [criarNome, setCriarNome] = useState('')
  const [criarEmpresa, setCriarEmpresa] = useState('Nova Tratores')
  const [criarLoading, setCriarLoading] = useState(false)
  const [criarErro, setCriarErro] = useState('')
  const [syncNfLoading, setSyncNfLoading] = useState(false)
  const [showSync, setShowSync] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{
    pct: number; step: number; totalSteps: number
    empresa: string; mes: string; nfs: number; tempoRestante: number
    logs: { empresa: string; mes: string; entradas: number; saidas: number }[]
    resultado: { total_entrada: number; total_saida: number; total_nfs: number; tempo_total: number; erros?: string[]; vinculo?: { clientes: number; projetos: number } } | null
    erro: string; etapaVinculo: boolean
  }>({ pct: 0, step: 0, totalSteps: 0, empresa: '', mes: '', nfs: 0, tempoRestante: 0, logs: [], resultado: null, erro: '', etapaVinculo: false })

  const syncNfs = async () => {
    setShowSync(true); setSyncNfLoading(true)
    setSyncProgress({ pct: 0, step: 0, totalSteps: 0, empresa: '', mes: '', nfs: 0, tempoRestante: 0, logs: [], resultado: null, erro: '', etapaVinculo: false })
    try {
      const res = await fetch('/api/clientes/projetos/sync-nfs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anos: 3 }),
      })
      if (!res.body) { setSyncProgress(p => ({...p, erro: 'Sem resposta do servidor'})); setSyncNfLoading(false); return }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const match = line.match(/^data: (.+)$/m)
          if (!match) continue
          try {
            const ev = JSON.parse(match[1])
            if (ev.type === 'inicio') {
              setSyncProgress(p => ({...p, totalSteps: ev.totalSteps}))
            } else if (ev.type === 'progresso') {
              setSyncProgress(p => ({...p, pct: ev.pct, step: ev.step, totalSteps: ev.totalSteps, empresa: ev.empresa, mes: ev.mes, nfs: ev.nfs_ate_agora, tempoRestante: ev.tempo_restante}))
            } else if (ev.type === 'mes_concluido') {
              setSyncProgress(p => ({...p, pct: ev.pct, step: ev.step, nfs: ev.total_acumulado,
                logs: [...p.logs, { empresa: ev.empresa, mes: ev.mes, entradas: ev.entradas, saidas: ev.saidas }]
              }))
            } else if (ev.type === 'fim') {
              setSyncProgress(p => ({...p, pct: 100, resultado: { total_entrada: ev.total_entrada, total_saida: ev.total_saida, total_nfs: ev.total_nfs, tempo_total: ev.tempo_total, erros: ev.erros }}))
            } else if (ev.type === 'erro_mes') {
              setSyncProgress(p => ({...p, logs: [...p.logs, { empresa: ev.empresa, mes: ev.mes, entradas: -1, saidas: 0 }]}))
            }
          } catch {}
        }
      }
    } catch (e: any) { setSyncProgress(p => ({...p, erro: e.message || 'Erro de conexão'})); setSyncNfLoading(false); return }

    // Vincular NFs a clientes e projetos automaticamente
    setSyncProgress(p => ({...p, etapaVinculo: true}))
    try {
      const vRes = await fetch('/api/clientes/projetos/sync-nfs/vincular', { method: 'POST' })
      const vData = await vRes.json()
      if (vData.ok) {
        setSyncProgress(p => ({...p, etapaVinculo: false, resultado: p.resultado ? {...p.resultado, vinculo: { clientes: vData.clientes_vinculados, projetos: vData.projetos_vinculados }} : p.resultado }))
      }
    } catch {}
    setSyncNfLoading(false)
  }

  function fmtTempo(seg: number) {
    if (seg < 60) return `${seg}s`
    const m = Math.floor(seg / 60)
    const s = seg % 60
    return `${m}min ${s}s`
  }

  const criarProjeto = async () => {
    if (!criarNome.trim()) { setCriarErro('Nome obrigatório'); return }
    setCriarLoading(true); setCriarErro('')
    try {
      const res = await fetch('/api/clientes/projetos/criar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: criarNome.trim().toUpperCase(), empresa: criarEmpresa }),
      })
      const d = await res.json()
      if (!res.ok) { setCriarErro(d.error || 'Erro ao criar'); setCriarLoading(false); return }
      setShowCriar(false); setCriarNome(''); setCriarErro('')
      carregar()
    } catch (e: any) { setCriarErro(e.message || 'Erro de rede') }
    setCriarLoading(false)
  }

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const params = empresaFilter ? `?empresa=${encodeURIComponent(empresaFilter)}` : ''
      const res = await fetch(`/api/clientes/projetos-resumo${params}`)
      const d = await res.json()
      setData(d)
    } catch {}
    setLoading(false)
  }, [empresaFilter])

  useEffect(() => { carregar() }, [carregar])

  const empresas = data ? [...new Set(data.todos_projetos.map(p => p.empresa))] : []

  const filteredProjetos = (data?.todos_projetos || []).filter(p => {
    const matchSearch = !search || [p.nome, p.cliente.nome, p.cliente.cnpj_cpf, p.cliente.cidade, p.empresa]
      .some(f => (f || '').toLowerCase().includes(search.toLowerCase()))
    const matchNf = filterNf === 'todos'
      || (filterNf === 'com-nf' && p.nf_servico > 0)
      || (filterNf === 'sem-nf' && p.nf_servico === 0 && p.os_faturadas === 0)
      || (filterNf === 'pendente' && p.nf_servico_pendente > 0)
    return matchSearch && matchNf
  })

  const filteredClientes = (data?.clientes || []).filter(g => {
    const matchSearch = !search || [g.cliente.nome, g.cliente.cnpj_cpf, g.cliente.cidade, g.empresa,
      ...g.projetos.map(p => p.nome)].some(f => (f || '').toLowerCase().includes(search.toLowerCase()))
    return matchSearch
  })

  const toggleProjeto = (key: string) => setExpandedProjeto(expandedProjeto === key ? null : key)
  const toggleCliente = (key: string) => setExpandedCliente(expandedCliente === key ? null : key)

  // Contadores
  const totalComNf = filteredProjetos.filter(p => p.nf_servico > 0).length
  const totalSemNf = filteredProjetos.filter(p => p.nf_servico === 0 && p.os_faturadas === 0).length
  const totalPendente = filteredProjetos.filter(p => p.nf_servico_pendente > 0).length

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <a href="/clientes" style={{ color: '#6B7280', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <ArrowLeft size={14} /> Voltar para Clientes
          </a>
          <h1 style={{ fontSize: 26, color: '#111827', fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>Projetos</h1>
          <p style={{ fontSize: 14, color: '#6B7280', margin: '4px 0 0' }}>
            {data ? `${data.total_projetos} projetos de ${data.total_clientes} clientes` : 'Carregando...'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={syncNfs} disabled={syncNfLoading}
            style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #E5E7EB', background: syncNfLoading ? '#F9FAFB' : '#fff', color: syncNfLoading ? '#9CA3AF' : '#374151', fontSize: 13, fontWeight: 600, cursor: syncNfLoading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={15} style={syncNfLoading ? { animation: 'spin 1s linear infinite' } : {}} /> Sync NFs
          </button>
          <button onClick={() => setShowCriar(true)}
            style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#2563EB', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={15} /> Criar Projeto
          </button>
          <div style={{ display: 'flex', borderRadius: 8, border: '1px solid #E5E7EB', overflow: 'hidden', marginLeft: 4 }}>
            <button onClick={() => setViewMode('projeto')}
              style={{ padding: '10px 16px', border: 'none', background: viewMode === 'projeto' ? '#111827' : '#fff', color: viewMode === 'projeto' ? '#fff' : '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Projetos
            </button>
            <button onClick={() => setViewMode('cliente')}
              style={{ padding: '10px 16px', border: 'none', borderLeft: '1px solid #E5E7EB', background: viewMode === 'cliente' ? '#111827' : '#fff', color: viewMode === 'cliente' ? '#fff' : '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Clientes
            </button>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input type="text" placeholder="Buscar por projeto, cliente, CNPJ, cidade..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '11px 14px 11px 40px', borderRadius: 10, border: '1px solid #E5E7EB', color: '#111827', fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff' }} />
        </div>
        {empresas.length > 1 && (
          <select value={empresaFilter} onChange={e => setEmpresaFilter(e.target.value)}
            style={{ padding: '11px 16px', borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 13, cursor: 'pointer', outline: 'none', background: '#fff', color: '#374151' }}>
            <option value="">Todas empresas</option>
            {empresas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
          </select>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { id: 'todos' as const, label: 'Todos', count: filteredProjetos.length },
            { id: 'com-nf' as const, label: 'Com NF', count: totalComNf, color: '#059669', bg: '#ECFDF5' },
            { id: 'pendente' as const, label: 'Pendente', count: totalPendente, color: '#D97706', bg: '#FFFBEB' },
            { id: 'sem-nf' as const, label: 'Sem NF', count: totalSemNf, color: '#DC2626', bg: '#FEF2F2' },
          ].map(f => (
            <button key={f.id} onClick={() => setFilterNf(f.id)}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: filterNf === f.id ? `2px solid ${f.color || '#111827'}` : '1px solid #E5E7EB',
                background: filterNf === f.id ? (f.bg || '#F9FAFB') : '#fff',
                color: filterNf === f.id ? (f.color || '#111827') : '#6B7280',
              }}>
              {f.label} <span style={{ fontWeight: 700, marginLeft: 2 }}>{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF', fontSize: 15 }}>
          <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
          <div>Carregando projetos...</div>
        </div>
      ) : viewMode === 'projeto' ? (
        /* ========== VISAO POR PROJETO ========== */
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 60px 70px 60px 70px 70px 110px 28px', padding: '12px 20px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5 }}>
            <span>Projeto</span><span>Cliente</span><span style={{ textAlign: 'center' }}>OS</span><span style={{ textAlign: 'center' }}>NF Serv.</span><span style={{ textAlign: 'center' }}>PV</span><span style={{ textAlign: 'center' }}>NF Peca</span><span style={{ textAlign: 'center' }}>Pend.</span><span style={{ textAlign: 'right' }}>Valor Total</span><span></span>
          </div>

          {filteredProjetos.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Nenhum projeto encontrado</div>
          ) : filteredProjetos.slice(0, 300).map(p => {
            const key = `${p.codigo}|${p.empresa}`
            const isExp = expandedProjeto === key
            const temPendente = p.nf_servico_pendente > 0 || p.nf_peca_pendente > 0

            return (
              <div key={key}>
                <div onClick={() => toggleProjeto(key)}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 200px 60px 70px 60px 70px 70px 110px 28px',
                    padding: '14px 20px', borderBottom: '1px solid #F3F4F6', cursor: 'pointer',
                    background: isExp ? '#F0F4FF' : temPendente ? '#FFFBEB' : 'transparent',
                    alignItems: 'center', fontSize: 14, color: '#111827', transition: 'background .15s',
                  }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FolderOpen size={16} color={p.inativo ? '#D1D5DB' : '#2563EB'} />
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{p.nome}</span>
                      {p.inativo && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#F3F4F6', color: '#9CA3AF', fontWeight: 600 }}>INATIVO</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2, marginLeft: 24 }}>{p.empresa}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{p.cliente.nome || '-'}</div>
                    {p.cliente.cidade && <div style={{ fontSize: 12, color: '#9CA3AF' }}>{p.cliente.cidade}/{p.cliente.estado}</div>}
                  </div>
                  <span style={{ textAlign: 'center', fontWeight: 600, fontSize: 14 }}>{p.os_total}</span>
                  <span style={{ textAlign: 'center' }}>
                    {p.nf_servico > 0 ? (
                      <span style={{ color: '#059669', fontWeight: 700, fontSize: 14 }}>{p.nf_servico}</span>
                    ) : p.os_faturadas > 0 ? (
                      <span style={{ color: '#DC2626', fontWeight: 700, fontSize: 14 }}>0</span>
                    ) : (
                      <span style={{ color: '#D1D5DB', fontSize: 14 }}>-</span>
                    )}
                  </span>
                  <span style={{ textAlign: 'center', fontWeight: 600, fontSize: 14 }}>{p.pv_total || <span style={{ color: '#D1D5DB' }}>-</span>}</span>
                  <span style={{ textAlign: 'center' }}>
                    {p.nf_peca > 0 ? (
                      <span style={{ color: '#059669', fontWeight: 700, fontSize: 14 }}>{p.nf_peca}</span>
                    ) : p.pv_faturados > 0 ? (
                      <span style={{ color: '#DC2626', fontWeight: 700, fontSize: 14 }}>0</span>
                    ) : (
                      <span style={{ color: '#D1D5DB', fontSize: 14 }}>-</span>
                    )}
                  </span>
                  <span style={{ textAlign: 'center' }}>
                    {temPendente ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#D97706', fontWeight: 700, fontSize: 13 }}>
                        <AlertTriangle size={13} /> {p.nf_servico_pendente + p.nf_peca_pendente}
                      </span>
                    ) : (
                      <span style={{ color: '#D1D5DB', fontSize: 14 }}>-</span>
                    )}
                  </span>
                  <span style={{ textAlign: 'right', fontWeight: 600, fontSize: 14, color: '#374151' }}>{p.valor_total > 0 ? fmt(p.valor_total) : '-'}</span>
                  <ChevronDown size={16} color="#9CA3AF" style={{ transition: 'transform .15s', transform: isExp ? 'rotate(0)' : 'rotate(-90deg)' }} />
                </div>

                {isExp && (
                  <div style={{ borderBottom: '2px solid #E5E7EB', background: '#F8FAFC', padding: '20px 24px 20px 48px' }}>
                    {/* Resumo */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
                      {[
                        { l: 'Ordens de Servico', v: String(p.os_total), bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
                        { l: 'NF Servico', v: String(p.nf_servico), bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' },
                        { l: 'Valor Servicos', v: fmt(p.valor_servicos), bg: '#ECFDF5', color: '#059669', border: '#A7F3D0' },
                        { l: 'Pedidos Venda', v: String(p.pv_total), bg: '#FFF7ED', color: '#EA580C', border: '#FED7AA' },
                        { l: 'NF Peca', v: String(p.nf_peca), bg: '#FFF7ED', color: '#EA580C', border: '#FED7AA' },
                        { l: 'Valor Pecas', v: fmt(p.valor_pecas), bg: '#FFF7ED', color: '#EA580C', border: '#FED7AA' },
                        { l: 'Pendentes', v: String(p.nf_servico_pendente + p.nf_peca_pendente), bg: (p.nf_servico_pendente + p.nf_peca_pendente) > 0 ? '#FFFBEB' : '#F9FAFB', color: (p.nf_servico_pendente + p.nf_peca_pendente) > 0 ? '#D97706' : '#9CA3AF', border: (p.nf_servico_pendente + p.nf_peca_pendente) > 0 ? '#FDE68A' : '#E5E7EB' },
                        { l: 'TOTAL', v: fmt(p.valor_total), bg: '#F5F3FF', color: '#7C3AED', border: '#C4B5FD' },
                      ].map((s, i) => (
                        <div key={i} style={{ padding: '10px 16px', borderRadius: 10, background: s.bg, border: `1px solid ${s.border}`, minWidth: 100 }}>
                          <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 3, fontWeight: 500 }}>{s.l}</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: s.color }}>{s.v}</div>
                        </div>
                      ))}
                    </div>

                    {/* NFs emitidas */}
                    {p.nfs_servico.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#059669', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <FileText size={14} /> Notas Fiscais de Servico ({p.nfs_servico.length})
                        </div>
                        <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '80px 90px 1fr 110px 100px 70px', padding: '10px 16px', background: '#F9FAFB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.3 }}>
                            <span>OS</span><span>NF</span><span>Cliente</span><span style={{ textAlign: 'right' }}>Valor</span><span>Data</span><span></span>
                          </div>
                          {p.nfs_servico.map((nf, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 90px 1fr 110px 100px 70px', padding: '10px 16px', borderTop: '1px solid #F3F4F6', fontSize: 13, color: '#374151', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600 }}>{nf.num_os}</span>
                              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6B7280' }}>{nf.numero_nf || '-'}</span>
                              <span style={{ color: '#6B7280', fontSize: 13 }}>{nf.cliente}</span>
                              <span style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(nf.valor)}</span>
                              <span style={{ fontSize: 12, color: '#9CA3AF' }}>{fmtDate(nf.data)}</span>
                              <span>
                                {nf.link && (
                                  <a href={nf.link} target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>
                                    <Download size={11} /> PDF
                                  </a>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* NFs pendentes */}
                    {p.nfs_servico_pendentes.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#D97706', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <AlertTriangle size={14} /> OS Faturadas sem Nota Fiscal ({p.nfs_servico_pendentes.length})
                        </div>
                        <div style={{ border: '1px solid #FDE68A', borderRadius: 10, overflow: 'hidden', background: '#FFFBEB' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px 100px', padding: '10px 16px', background: '#FEF3C7', fontSize: 11, color: '#92400E', textTransform: 'uppercase', fontWeight: 600 }}>
                            <span>OS</span><span>Cliente</span><span style={{ textAlign: 'right' }}>Valor</span><span>Data</span>
                          </div>
                          {p.nfs_servico_pendentes.map((nf, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px 100px', padding: '10px 16px', borderTop: '1px solid #FDE68A', fontSize: 13, color: '#92400E', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600 }}>{nf.num_os}</span>
                              <span>{nf.cliente}</span>
                              <span style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(nf.valor)}</span>
                              <span style={{ fontSize: 12 }}>{fmtDate(nf.data)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* NFs peca emitidas */}
                    {p.nfs_peca.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#EA580C', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Package size={14} /> Notas Fiscais de Peca ({p.nfs_peca.length})
                        </div>
                        <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '80px 90px 1fr 110px 100px 70px', padding: '10px 16px', background: '#F9FAFB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.3 }}>
                            <span>PV</span><span>NF</span><span>Cliente</span><span style={{ textAlign: 'right' }}>Valor</span><span>Data</span><span></span>
                          </div>
                          {p.nfs_peca.map((nf, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '80px 90px 1fr 110px 100px 70px', padding: '10px 16px', borderTop: '1px solid #F3F4F6', fontSize: 13, color: '#374151', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600 }}>{nf.num_pedido}</span>
                              <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#6B7280' }}>{nf.numero_nf || '-'}</span>
                              <span style={{ color: '#6B7280', fontSize: 13 }}>{nf.cliente}</span>
                              <span style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(nf.valor)}</span>
                              <span style={{ fontSize: 12, color: '#9CA3AF' }}>{fmtDate(nf.data)}</span>
                              <span>
                                {nf.link && (
                                  <a href={nf.link} target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>
                                    <Download size={11} /> PDF
                                  </a>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* NFs peca pendentes */}
                    {p.nfs_peca_pendentes.length > 0 && (
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#D97706', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <AlertTriangle size={14} /> PV Faturados sem Nota Fiscal ({p.nfs_peca_pendentes.length})
                        </div>
                        <div style={{ border: '1px solid #FDE68A', borderRadius: 10, overflow: 'hidden', background: '#FFFBEB' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px 100px', padding: '10px 16px', background: '#FEF3C7', fontSize: 11, color: '#92400E', textTransform: 'uppercase', fontWeight: 600 }}>
                            <span>PV</span><span>Cliente</span><span style={{ textAlign: 'right' }}>Valor</span><span>Data</span>
                          </div>
                          {p.nfs_peca_pendentes.map((nf, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 120px 100px', padding: '10px 16px', borderTop: '1px solid #FDE68A', fontSize: 13, color: '#92400E', alignItems: 'center' }}>
                              <span style={{ fontWeight: 600 }}>{nf.num_pedido}</span>
                              <span>{nf.cliente}</span>
                              <span style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(nf.valor)}</span>
                              <span style={{ fontSize: 12 }}>{fmtDate(nf.data)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {p.nfs_servico.length === 0 && p.nfs_servico_pendentes.length === 0 && p.nfs_peca.length === 0 && p.nfs_peca_pendentes.length === 0 && (
                      <div style={{ padding: 28, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
                        Nenhuma nota fiscal encontrada para este projeto
                      </div>
                    )}

                    <div style={{ marginTop: 16 }}>
                      <a href={`/clientes/projeto?nome=${encodeURIComponent(p.nome)}&empresa=${encodeURIComponent(p.empresa)}`}
                        style={{ fontSize: 13, color: '#2563EB', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, padding: '6px 0' }}>
                        Ver projeto completo <ChevronRight size={14} />
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {filteredProjetos.length > 300 && (
            <div style={{ padding: 14, textAlign: 'center', fontSize: 13, color: '#6B7280', background: '#F9FAFB' }}>
              Mostrando 300 de {filteredProjetos.length} projetos. Use a busca para filtrar.
            </div>
          )}
        </div>
      ) : (
        /* ========== VISAO POR CLIENTE ========== */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredClientes.length === 0 ? (
            <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF', fontSize: 15 }}>Nenhum cliente encontrado</div>
          ) : filteredClientes.map(g => {
            const key = `${g.cliente.cod_cli}|${g.empresa}`
            const isExp = expandedCliente === key

            return (
              <div key={key} style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', background: '#fff', boxShadow: isExp ? '0 4px 12px rgba(0,0,0,0.06)' : 'none', transition: 'box-shadow .2s' }}>
                <div onClick={() => toggleCliente(key)}
                  style={{ display: 'flex', alignItems: 'center', padding: '18px 24px', cursor: 'pointer', gap: 16, background: isExp ? '#F8FAFC' : '#fff', userSelect: 'none' }}>
                  <ChevronDown size={18} color="#6B7280" style={{ transition: 'transform .2s', transform: isExp ? 'rotate(0)' : 'rotate(-90deg)', flexShrink: 0 }} />
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: '#EFF6FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Building2 size={20} color="#2563EB" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{g.cliente.nome || 'Sem cliente vinculado'}</div>
                    <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>
                      {g.cliente.cnpj_cpf && <span>{g.cliente.cnpj_cpf}</span>}
                      {g.cliente.cnpj_cpf && g.cliente.cidade && <span style={{ margin: '0 6px', color: '#D1D5DB' }}>|</span>}
                      {g.cliente.cidade && <span>{g.cliente.cidade}/{g.cliente.estado}</span>}
                      {(g.cliente.cnpj_cpf || g.cliente.cidade) && <span style={{ margin: '0 6px', color: '#D1D5DB' }}>|</span>}
                      <span>{g.empresa}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', flexShrink: 0 }}>
                    {[
                      { v: `${g.totais.projetos} proj.`, bg: '#EFF6FF', c: '#2563EB', b: '#BFDBFE' },
                      { v: `${g.totais.os_total} OS`, bg: '#F9FAFB', c: '#374151', b: '#E5E7EB' },
                      ...(g.totais.nf_servico > 0 ? [{ v: `${g.totais.nf_servico} NF serv.`, bg: '#ECFDF5', c: '#059669', b: '#A7F3D0' }] : []),
                      ...(g.totais.pv_total > 0 ? [{ v: `${g.totais.pv_total} PV`, bg: '#FFF7ED', c: '#EA580C', b: '#FED7AA' }] : []),
                      ...(g.totais.nf_peca > 0 ? [{ v: `${g.totais.nf_peca} NF peca`, bg: '#ECFDF5', c: '#059669', b: '#A7F3D0' }] : []),
                      ...((g.totais.nf_servico_pendente + g.totais.nf_peca_pendente) > 0 ? [{ v: `${g.totais.nf_servico_pendente + g.totais.nf_peca_pendente} pend.`, bg: '#FFFBEB', c: '#D97706', b: '#FDE68A' }] : []),
                    ].map((t, i) => (
                      <span key={i} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: t.bg, color: t.c, border: `1px solid ${t.b}`, whiteSpace: 'nowrap' }}>{t.v}</span>
                    ))}
                    <span style={{ padding: '5px 12px', borderRadius: 6, fontSize: 13, fontWeight: 800, background: '#F5F3FF', color: '#7C3AED', border: '1px solid #C4B5FD', whiteSpace: 'nowrap' }}>{fmt(g.totais.valor_total)}</span>
                  </div>
                </div>

                {isExp && (
                  <div style={{ borderTop: '1px solid #E5E7EB' }}>
                    {g.projetos.map(p => {
                      const pKey = `${p.codigo}|${p.empresa}`
                      const isPExp = expandedProjeto === pKey
                      const temPend = (p.nf_servico_pendente + p.nf_peca_pendente) > 0

                      return (
                        <div key={pKey} style={{ borderBottom: '1px solid #F3F4F6' }}>
                          <div onClick={() => toggleProjeto(pKey)}
                            style={{ display: 'flex', alignItems: 'center', padding: '14px 24px 14px 44px', cursor: 'pointer', gap: 12, background: isPExp ? '#F0F4FF' : temPend ? '#FFFDF5' : 'transparent', transition: 'background .15s' }}>
                            <FolderOpen size={16} color={p.inativo ? '#D1D5DB' : '#2563EB'} style={{ flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, fontSize: 14, color: '#111827', flex: 1 }}>{p.nome}</span>
                            <div style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 13, flexShrink: 0 }}>
                              <span style={{ color: '#374151', fontWeight: 600 }}>{p.os_total} OS</span>
                              {p.nf_servico > 0 ? <span style={{ color: '#059669', fontWeight: 700 }}>{p.nf_servico} NF</span> : <span style={{ color: '#D1D5DB' }}>-</span>}
                              {p.pv_total > 0 ? <span style={{ color: '#EA580C', fontWeight: 600 }}>{p.pv_total} PV</span> : <span style={{ color: '#D1D5DB' }}>-</span>}
                              {p.nf_peca > 0 ? <span style={{ color: '#059669', fontWeight: 700 }}>{p.nf_peca} NF pc</span> : <span style={{ color: '#D1D5DB' }}>-</span>}
                              {temPend ? <span style={{ color: '#D97706', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 3 }}><AlertTriangle size={12} /> {p.nf_servico_pendente + p.nf_peca_pendente}</span> : <span style={{ color: '#D1D5DB' }}>-</span>}
                              <span style={{ fontWeight: 700, color: '#374151', minWidth: 90, textAlign: 'right' }}>{p.valor_total > 0 ? fmt(p.valor_total) : '-'}</span>
                            </div>
                            <ChevronDown size={14} color="#9CA3AF" style={{ transition: 'transform .15s', transform: isPExp ? 'rotate(0)' : 'rotate(-90deg)', flexShrink: 0 }} />
                          </div>

                          {isPExp && (
                            <div style={{ padding: '16px 24px 16px 76px', background: '#F8FAFC' }}>
                              {p.nfs_servico.length > 0 && (
                                <div style={{ marginBottom: 14 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>NFs Servico</div>
                                  {p.nfs_servico.map((nf, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 16, padding: '6px 0', fontSize: 13, color: '#374151', alignItems: 'center', borderBottom: i < p.nfs_servico.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                                      <span style={{ fontWeight: 600, minWidth: 60 }}>OS {nf.num_os}</span>
                                      <span style={{ fontFamily: 'monospace', fontSize: 12, minWidth: 70, color: '#6B7280' }}>NF {nf.numero_nf || '-'}</span>
                                      <span style={{ flex: 1, color: '#6B7280' }}>{nf.cliente}</span>
                                      <span style={{ fontWeight: 600 }}>{fmt(nf.valor)}</span>
                                      <span style={{ fontSize: 12, color: '#9CA3AF', minWidth: 80 }}>{fmtDate(nf.data)}</span>
                                      {nf.link && (
                                        <a href={nf.link} target="_blank" rel="noopener noreferrer"
                                          style={{ padding: '3px 8px', borderRadius: 5, background: '#111827', color: '#fff', fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>PDF</a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {p.nfs_servico_pendentes.length > 0 && (
                                <div style={{ marginBottom: 14 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#D97706', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Faturadas sem NF</div>
                                  {p.nfs_servico_pendentes.map((nf, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 16, padding: '6px 0', fontSize: 13, color: '#92400E', alignItems: 'center', borderBottom: i < p.nfs_servico_pendentes.length - 1 ? '1px solid #FDE68A' : 'none' }}>
                                      <span style={{ fontWeight: 600, minWidth: 60 }}>OS {nf.num_os}</span>
                                      <span style={{ flex: 1 }}>{nf.cliente}</span>
                                      <span style={{ fontWeight: 600 }}>{fmt(nf.valor)}</span>
                                      <span style={{ fontSize: 12, minWidth: 80 }}>{fmtDate(nf.data)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {p.nfs_peca.length > 0 && (
                                <div style={{ marginBottom: 14 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#EA580C', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>NFs Peca</div>
                                  {p.nfs_peca.map((nf, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 16, padding: '6px 0', fontSize: 13, color: '#374151', alignItems: 'center', borderBottom: i < p.nfs_peca.length - 1 ? '1px solid #F3F4F6' : 'none' }}>
                                      <span style={{ fontWeight: 600, minWidth: 60 }}>PV {nf.num_pedido}</span>
                                      <span style={{ fontFamily: 'monospace', fontSize: 12, minWidth: 70, color: '#6B7280' }}>NF {nf.numero_nf || '-'}</span>
                                      <span style={{ flex: 1, color: '#6B7280' }}>{nf.cliente}</span>
                                      <span style={{ fontWeight: 600 }}>{fmt(nf.valor)}</span>
                                      <span style={{ fontSize: 12, color: '#9CA3AF', minWidth: 80 }}>{fmtDate(nf.data)}</span>
                                      {nf.link && (
                                        <a href={nf.link} target="_blank" rel="noopener noreferrer"
                                          style={{ padding: '3px 8px', borderRadius: 5, background: '#111827', color: '#fff', fontSize: 11, textDecoration: 'none', fontWeight: 600 }}>PDF</a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                              {p.nfs_peca_pendentes.length > 0 && (
                                <div style={{ marginBottom: 14 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: '#D97706', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>PV Faturados sem NF</div>
                                  {p.nfs_peca_pendentes.map((nf, i) => (
                                    <div key={i} style={{ display: 'flex', gap: 16, padding: '6px 0', fontSize: 13, color: '#92400E', alignItems: 'center', borderBottom: i < p.nfs_peca_pendentes.length - 1 ? '1px solid #FDE68A' : 'none' }}>
                                      <span style={{ fontWeight: 600, minWidth: 60 }}>PV {nf.num_pedido}</span>
                                      <span style={{ flex: 1 }}>{nf.cliente}</span>
                                      <span style={{ fontWeight: 600 }}>{fmt(nf.valor)}</span>
                                      <span style={{ fontSize: 12, minWidth: 80 }}>{fmtDate(nf.data)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {p.nfs_servico.length === 0 && p.nfs_servico_pendentes.length === 0 && p.nfs_peca.length === 0 && p.nfs_peca_pendentes.length === 0 && (
                                <div style={{ fontSize: 13, color: '#9CA3AF', padding: '12px 0' }}>Nenhuma NF neste projeto</div>
                              )}
                              <a href={`/clientes/projeto?nome=${encodeURIComponent(p.nome)}&empresa=${encodeURIComponent(p.empresa)}`}
                                style={{ fontSize: 13, color: '#2563EB', textDecoration: 'none', marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                                Ver completo <ChevronRight size={13} />
                              </a>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Tela de carregamento fullscreen */}
      {showSync && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: syncProgress.resultado ? '#F0FDF4' : syncProgress.erro ? '#FEF2F2' : '#0F172A',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.5s',
        }}>
          {/* Carregando */}
          {!syncProgress.resultado && !syncProgress.erro && (
            <>
              {!syncProgress.etapaVinculo ? (
                <>
                  <div style={{ fontSize: 72, fontWeight: 900, color: '#fff', letterSpacing: -3, lineHeight: 1 }}>
                    {syncProgress.pct}%
                  </div>
                  <div style={{ width: 400, maxWidth: '80vw', marginTop: 28 }}>
                    <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: 10, height: 16, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 10, transition: 'width 0.4s ease',
                        width: `${syncProgress.pct}%`,
                        background: 'linear-gradient(90deg, #3B82F6, #8B5CF6, #EC4899)',
                      }} />
                    </div>
                  </div>
                  <div style={{ marginTop: 24, color: '#94A3B8', fontSize: 14, fontWeight: 500, textAlign: 'center' }}>
                    {syncProgress.empresa ? `${syncProgress.empresa} — ${syncProgress.mes}` : 'Iniciando...'}
                  </div>
                  <div style={{ marginTop: 8, color: '#475569', fontSize: 12, textAlign: 'center' }}>
                    {syncProgress.nfs > 0 && <span>{syncProgress.nfs} NFs encontradas</span>}
                    {syncProgress.nfs > 0 && syncProgress.tempoRestante > 0 && <span style={{ margin: '0 8px' }}>|</span>}
                    {syncProgress.tempoRestante > 0 && <span>~{fmtTempo(syncProgress.tempoRestante)} restantes</span>}
                  </div>
                  <div style={{ marginTop: 6, color: '#334155', fontSize: 11 }}>
                    Etapa {syncProgress.step} de {syncProgress.totalSteps}
                  </div>
                </>
              ) : (
                <>
                  <Loader2 size={48} color="#8B5CF6" style={{ animation: 'spin 1s linear infinite' }} />
                  <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginTop: 20 }}>
                    Vinculando NFs a Clientes e Projetos...
                  </div>
                  <div style={{ marginTop: 8, color: '#94A3B8', fontSize: 13 }}>
                    {syncProgress.nfs} NFs sincronizadas, associando automaticamente
                  </div>
                </>
              )}
            </>
          )}

          {/* Concluído */}
          {syncProgress.resultado && (
            <>
              <CheckCircle size={64} color="#059669" />
              <div style={{ fontSize: 28, fontWeight: 800, color: '#059669', marginTop: 16 }}>
                Sincronização Concluída
              </div>
              <div style={{ display: 'flex', gap: 20, marginTop: 28 }}>
                {[
                  { l: 'NF Entrada', v: syncProgress.resultado.total_entrada, c: '#2563EB' },
                  { l: 'NF Saída', v: syncProgress.resultado.total_saida, c: '#EA580C' },
                  { l: 'Total', v: syncProgress.resultado.total_nfs, c: '#059669' },
                  { l: 'Tempo', v: fmtTempo(syncProgress.resultado.tempo_total), c: '#7C3AED' },
                ].map((s, i) => (
                  <div key={i} style={{ textAlign: 'center', minWidth: 90 }}>
                    <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{s.l}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: s.c }}>{s.v}</div>
                  </div>
                ))}
              </div>
              {syncProgress.resultado.vinculo && (
                <div style={{ marginTop: 24, padding: '16px 24px', borderRadius: 10, background: '#F0F9FF', border: '1px solid #BAE6FD', display: 'flex', gap: 28, alignItems: 'center' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0369A1' }}>Vinculação</div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>Clientes</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB' }}>{syncProgress.resultado.vinculo.clientes}</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 9, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>Projetos</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: '#8B5CF6' }}>{syncProgress.resultado.vinculo.projetos}</div>
                  </div>
                </div>
              )}
              {syncProgress.resultado.erros && syncProgress.resultado.erros.length > 0 && (
                <div style={{ marginTop: 20, padding: '10px 16px', borderRadius: 8, background: '#FEF2F2', maxWidth: 400 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#DC2626', marginBottom: 4 }}>
                    {syncProgress.resultado.erros.length} erro(s)
                  </div>
                  {syncProgress.resultado.erros.slice(0, 3).map((e, i) => (
                    <div key={i} style={{ fontSize: 10, color: '#92400E' }}>{e}</div>
                  ))}
                </div>
              )}
              <button onClick={() => setShowSync(false)}
                style={{ marginTop: 32, padding: '12px 40px', borderRadius: 10, border: 'none', background: '#059669', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: 0.5 }}>
                Fechar
              </button>
            </>
          )}

          {/* Erro */}
          {syncProgress.erro && (
            <>
              <XCircle size={64} color="#DC2626" />
              <div style={{ fontSize: 22, fontWeight: 700, color: '#DC2626', marginTop: 16 }}>
                Erro na Sincronização
              </div>
              <div style={{ marginTop: 12, fontSize: 13, color: '#92400E', maxWidth: 400, textAlign: 'center' }}>
                {syncProgress.erro}
              </div>
              <button onClick={() => setShowSync(false)}
                style={{ marginTop: 28, padding: '12px 40px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Fechar
              </button>
            </>
          )}
        </div>
      )}

      {/* Modal Criar Projeto */}
      {showCriar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
          onClick={e => { if (e.target === e.currentTarget) setShowCriar(false) }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#111' }}>Criar Projeto</div>
              <button onClick={() => setShowCriar(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <X size={18} color="#999" />
              </button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Nome do Projeto</label>
              <input
                autoFocus
                value={criarNome}
                onChange={e => setCriarNome(e.target.value.toUpperCase())}
                placeholder="Ex: VALTRA BH180 - CHASSIS 123456"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#555', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Empresa</label>
              <select
                value={criarEmpresa}
                onChange={e => setCriarEmpresa(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' }}>
                <option value="Nova Tratores">Nova Tratores</option>
                <option value="Castro Peças">Castro Peças</option>
              </select>
            </div>
            {criarErro && (
              <div style={{ padding: '8px 12px', borderRadius: 6, background: '#FEF2F2', color: '#DC2626', fontSize: 12, marginBottom: 14 }}>
                {criarErro}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCriar(false)}
                style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid #E5E7EB', background: '#fff', color: '#666', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={criarProjeto} disabled={criarLoading}
                style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: criarLoading ? '#93C5FD' : '#2563EB', color: '#fff', fontSize: 12, fontWeight: 600, cursor: criarLoading ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {criarLoading && <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />}
                {criarLoading ? 'Criando...' : 'Criar e Enviar ao Omie'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProjetosPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  if (!loadingPerm && userProfile && !temAcesso('clientes')) return <SemPermissao />
  return <ProjetosPageInner />
}
