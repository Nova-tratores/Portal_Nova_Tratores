'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { Search, ChevronDown, ChevronUp, ArrowLeft, RefreshCw, ChevronRight, Download, Printer, FolderOpen, X, FileText, Wrench, Calendar, MapPin, User, Hash, ClipboardList, Package, Users, Shield, CheckCircle, Clock, Mail, Bell, Tag, Plus, Trash2, Save } from 'lucide-react'

interface Cliente {
  cod_cli: number; empresa: string; razao_social: string; nome_fantasia: string
  cnpj_cpf: string; cidade: string; estado: string; telefone: string; email: string
  total_os: number; total_valor: number; os_ativas: number; projetos: string[]
}
interface OrdemServico {
  num_os: string; cod_os: number; empresa: string; cod_cli: number; cliente_nome: string
  etapa: string; data_previsao: string | null; data_inclusao: string | null
  data_faturamento: string | null; valor_total: number; status: string
  cancelada: boolean; faturada: boolean; num_pedido_cli: string; vendedor: string
  cidade: string; contrato: string; projeto: string; num_nf: string; link_nf: string
  descricao: string; servicos: any[]; obs: string; dados_adic: string
}
interface PedidoVenda {
  num_pedido: string; cod_pedido: number; empresa: string; cod_cli: number
  cliente_nome: string; data_previsao: string | null; data_inclusao: string | null
  etapa: string; valor_total: number; cancelado: boolean; faturado: boolean
  numero_nf: string; link_nf: string; itens: any[]; observacoes: string
}

function formatCurrency(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function formatDate(d: string | null) {
  if (!d) return '-'
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('pt-BR')
}
function formatCNPJ(v: string) {
  if (!v) return ''
  const n = v.replace(/\D/g, '')
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return v
}

const ln = '#E5E7EB'
const ln2 = '#F3F4F6'

function ClientesPageInner() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState('')
  const [search, setSearch] = useState('')
  const [empresaFilter, setEmpresaFilter] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [ordens, setOrdens] = useState<OrdemServico[]>([])
  const [pedidos, setPedidos] = useState<PedidoVenda[]>([])
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [expandedOS, setExpandedOS] = useState<string | null>(null)
  const [modalOS, setModalOS] = useState<OrdemServico | null>(null)
  const [modalProjeto, setModalProjeto] = useState<string | null>(null)
  const [modalProjetoData, setModalProjetoData] = useState<any>(null)
  const [modalProjetoLoading, setModalProjetoLoading] = useState(false)
  const [projetoTab, setProjetoTab] = useState('resumo')
  const [emailsData, setEmailsData] = useState<Record<string, any[]>>({})
  const [loadingEmails, setLoadingEmails] = useState<string | null>(null)
  const [lembretesCliente, setLembretesCliente] = useState<any[]>([])

  // Etiquetas
  const [todasEtiquetas, setTodasEtiquetas] = useState<{ id: number; nome: string; cor: string }[]>([])
  const [etiquetasCliente, setEtiquetasCliente] = useState<{ id: number; nome: string; cor: string }[]>([])
  const [descricaoCliente, setDescricaoCliente] = useState('')
  const [descricaoLocal, setDescricaoLocal] = useState('')
  const [salvandoDesc, setSalvandoDesc] = useState(false)
  const [modalEtiqueta, setModalEtiqueta] = useState(false)
  const [novaEtiquetaNome, setNovaEtiquetaNome] = useState('')
  const [novaEtiquetaCor, setNovaEtiquetaCor] = useState('#3b82f6')
  const [etiquetasMapa, setEtiquetasMapa] = useState<Record<string, { id: number; nome: string; cor: string }[]>>({})

  const carregarMapaEtiquetas = useCallback(async () => {
    try {
      const res = await fetch('/api/clientes/etiquetas?modo=mapa')
      const data = await res.json()
      const etqs = data.etiquetas || []
      const mapa: Record<string, { id: number; nome: string; cor: string }[]> = {}
      for (const v of (data.mapa || [])) {
        const etq = etqs.find((e: any) => e.id === v.etiqueta_id)
        if (etq) {
          if (!mapa[v.cnpj_cpf]) mapa[v.cnpj_cpf] = []
          mapa[v.cnpj_cpf].push(etq)
        }
      }
      setEtiquetasMapa(mapa)
      setTodasEtiquetas(etqs)
    } catch {}
  }, [])

  const carregarEtiquetasCliente = useCallback(async (cnpj: string) => {
    try {
      const res = await fetch(`/api/clientes/etiquetas?cnpj=${encodeURIComponent(cnpj)}`)
      const data = await res.json()
      setEtiquetasCliente(data.etiquetas || [])
      setDescricaoCliente(data.descricao || '')
      setDescricaoLocal(data.descricao || '')
    } catch {}
  }, [])

  const toggleEtiqueta = async (cnpj: string, etiquetaId: number, ativo: boolean) => {
    await fetch('/api/clientes/etiquetas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo: ativo ? 'desvincular' : 'vincular', cnpj_cpf: cnpj, etiqueta_id: etiquetaId })
    })
    await carregarEtiquetasCliente(cnpj)
    await carregarMapaEtiquetas()
  }

  const salvarDescricao = async (cnpj: string) => {
    setSalvandoDesc(true)
    await fetch('/api/clientes/etiquetas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo: 'descricao', cnpj_cpf: cnpj, descricao: descricaoLocal })
    })
    setDescricaoCliente(descricaoLocal)
    setSalvandoDesc(false)
  }

  const criarEtiqueta = async () => {
    if (!novaEtiquetaNome.trim()) return
    await fetch('/api/clientes/etiquetas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: novaEtiquetaNome.trim(), cor: novaEtiquetaCor })
    })
    setNovaEtiquetaNome('')
    setNovaEtiquetaCor('#3b82f6')
    const res = await fetch('/api/clientes/etiquetas')
    const data = await res.json()
    setTodasEtiquetas(data.etiquetas || [])
  }

  const excluirEtiqueta = async (id: number) => {
    if (!confirm('Excluir esta etiqueta de todos os clientes?')) return
    await fetch(`/api/clientes/etiquetas?id=${id}`, { method: 'DELETE' })
    const res = await fetch('/api/clientes/etiquetas')
    const data = await res.json()
    setTodasEtiquetas(data.etiquetas || [])
    if (selectedCliente) await carregarEtiquetasCliente(selectedCliente.cnpj_cpf)
    await carregarMapaEtiquetas()
  }

  const carregarLista = useCallback(async () => {
    setLoading(true)
    try { const res = await fetch('/api/clientes'); const data = await res.json(); setClientes(data.clientes || []); return data.clientes?.length || 0 } catch {} setLoading(false); return 0
  }, [])
  const syncBackground = useCallback(async () => {
    if (syncing) return; setSyncing(true); setSyncStatus('Atualizando dados...')
    try { const res = await fetch('/api/clientes/sync', { method: 'POST' }); const data = await res.json(); if (data.sucesso) { await carregarLista(); setSyncStatus('Atualizado'); setTimeout(() => setSyncStatus(''), 3000) } } catch {} setSyncing(false)
  }, [syncing, carregarLista])
  const [nfStatus, setNfStatus] = useState('')
  const syncNFs = useCallback(async () => {
    setNfStatus('Baixando notas fiscais...')
    try {
      const res = await fetch('/api/clientes/sync-nfs?limite=500', { method: 'POST' })
      const data = await res.json()
      if (data.sucesso) {
        const r = data.resultado || {}
        const pendentes = Object.values(r).reduce((s: number, v: any) => s + (v.os_processadas - v.os_com_nf) + (v.pv_processados - v.pv_com_nf), 0)
        const baixadas = Object.values(r).reduce((s: number, v: any) => s + v.os_com_nf + v.pv_com_nf, 0)
        if (baixadas > 0 && pendentes > 0) {
          setNfStatus(`${baixadas} notas baixadas, restam pendentes...`)
          setTimeout(() => syncNFs(), 3000)
        } else if (baixadas > 0) {
          setNfStatus(`${baixadas} notas baixadas. Concluido.`)
          setTimeout(() => setNfStatus(''), 5000)
        } else {
          setNfStatus('Todas as notas fiscais ja foram baixadas.')
          setTimeout(() => setNfStatus(''), 5000)
        }
      }
    } catch { setNfStatus('') }
  }, [])

  useEffect(() => {
    (async () => { const count = await carregarLista(); setLoading(false); if (count === 0) { syncBackground(); return }
      try { const res = await fetch('/api/clientes?checkSync=1'); const data = await res.json(); if (data.lastSync) { const diffH = (Date.now() - new Date(data.lastSync).getTime()) / 3600000; if (diffH > 6) syncBackground() } else syncBackground() } catch { syncBackground() }
      syncNFs()
      carregarMapaEtiquetas()
    })()

    // Auto-sync a cada 30 minutos: busca OS/PV do dia e NFs pendentes
    const interval = setInterval(async () => {
      try {
        await fetch('/api/clientes/sync-recente')
        await carregarLista()
      } catch {}
    }, 30 * 60 * 1000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const abrirModalProjeto = async (nome: string, empresa: string) => {
    setModalProjeto(nome)
    setModalProjetoLoading(true)
    setModalProjetoData(null)
    setProjetoTab('resumo')
    try {
      const res = await fetch(`/api/clientes/projeto?nome=${encodeURIComponent(nome)}&empresa=${encodeURIComponent(empresa)}`)
      const data = await res.json()
      setModalProjetoData(data)
    } catch {}
    setModalProjetoLoading(false)
  }
  const carregarEmails = async (chassis: string) => {
    if (emailsData[chassis]) return
    setLoadingEmails(chassis)
    try {
      const res = await fetch(`/api/clientes/emails-chassis?chassis=${encodeURIComponent(chassis)}`)
      const data = await res.json()
      setEmailsData(prev => ({ ...prev, [chassis]: data.emails || [] }))
    } catch {}
    setLoadingEmails(null)
  }

  const abrirDetalhe = async (cliente: Cliente) => {
    setSelectedCliente(cliente); setExpandedOS(null); setModalProjeto(null); setEmailsData({}); setLoadingDetalhe(true); setLembretesCliente([]); setEtiquetasCliente([]); setDescricaoCliente(''); setDescricaoLocal(''); setModalEtiqueta(false)
    try { const res = await fetch(`/api/clientes?codCli=${cliente.cod_cli}&empresa=${encodeURIComponent(cliente.empresa)}`); const data = await res.json(); setOrdens(data.ordens || [])
      setPedidos((data.pedidos || []).map((pv: any) => ({ ...pv, itens: typeof pv.itens === 'string' ? JSON.parse(pv.itens) : (pv.itens || []) })))
    } catch {} setLoadingDetalhe(false)
    if (cliente.cnpj_cpf) {
      try { const res = await fetch(`/api/pos/lembretes?cnpj=${encodeURIComponent(cliente.cnpj_cpf.replace(/\D/g, ''))}`); const data = await res.json(); if (Array.isArray(data)) setLembretesCliente(data) } catch {}
      carregarEtiquetasCliente(cliente.cnpj_cpf)
    }
  }
  const filtered = clientes.filter(c => {
    const matchSearch = !search || [c.razao_social, c.nome_fantasia, c.cnpj_cpf, c.cidade, ...(c.projetos || [])].some(f => (f || '').toLowerCase().includes(search.toLowerCase()))
    return matchSearch && (!empresaFilter || c.empresa === empresaFilter)
  })
  const empresas = [...new Set(clientes.map(c => c.empresa))]
  const findAllPVs = (ref: string): PedidoVenda[] => { if (!ref || !/^\d+$/.test(ref)) return []; return pedidos.filter(pv => pv.num_pedido === ref) }
  const classifyRef = (ref: string) => {
    if (!ref) return { tipo: 'texto' as const, label: '' }
    if (/^\d+$/.test(ref)) return { tipo: 'pv' as const, label: `Pedido de Venda ${ref}` }
    const m = ref.match(/^REM\s*(\d+)$/i)
    if (m) return { tipo: 'remessa' as const, label: `Remessa ${m[1]}` }
    return { tipo: 'texto' as const, label: ref }
  }

  // ============ DETALHE DO CLIENTE ============
  if (selectedCliente) {
    const cli = selectedCliente
    const totalFaturadas = ordens.filter(o => o.faturada).length
    const totalCanceladas = ordens.filter(o => o.cancelada).length
    const totalAtivas = ordens.filter(o => !o.faturada && !o.cancelada).length
    const totalValorOS = ordens.reduce((s, o) => s + (o.valor_total || 0), 0)
    const totalValorPV = pedidos.reduce((s, p) => s + (p.valor_total || 0), 0)
    const pvsSemOS = pedidos.filter(pv => !ordens.some(os => /^\d+$/.test(os.num_pedido_cli) && os.num_pedido_cli === pv.num_pedido))

    return (
      <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
        <button onClick={() => setSelectedCliente(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 13, padding: '4px 0', marginBottom: 20 }}>
          <ArrowLeft size={16} /> Voltar para lista
        </button>

        {/* HEADER CLIENTE */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E5E7EB', marginBottom: 24, overflow: 'hidden' }}>
          <div style={{ padding: '24px 28px', background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)', color: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 24, fontWeight: 700 }}>{cli.nome_fantasia || cli.razao_social}</span>
              {etiquetasCliente.map(e => (
                <span key={e.id} style={{
                  display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                  background: e.cor, color: '#fff', letterSpacing: 0.3, border: '1px solid rgba(255,255,255,0.3)'
                }}>{e.nome}</span>
              ))}
            </div>
            {cli.nome_fantasia && cli.razao_social && cli.nome_fantasia !== cli.razao_social && (
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{cli.razao_social}</div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {[
              { l: 'CNPJ / CPF', v: cli.cnpj_cpf ? formatCNPJ(cli.cnpj_cpf) : '-', icon: Hash },
              { l: 'Cidade', v: cli.cidade ? `${cli.cidade}/${cli.estado}` : '-', icon: MapPin },
              { l: 'Telefone', v: cli.telefone || '-', icon: User },
              { l: 'Email', v: cli.email || '-', icon: FileText },
              { l: 'Empresa', v: cli.empresa, icon: FolderOpen },
            ].map((f, i) => (
              <div key={i} style={{ padding: '16px 20px', borderRight: i < 4 ? '1px solid #F3F4F6' : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>
                  <f.icon size={12} /> {f.l}
                </div>
                <div style={{ fontSize: 14, color: '#111827', fontWeight: 500 }}>{f.v}</div>
              </div>
            ))}
          </div>
          {cli.projetos && cli.projetos.length > 0 && (
            <div style={{ padding: '14px 20px', borderTop: '1px solid #F3F4F6', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Projetos:</span>
              {cli.projetos.map(p => (
                <button key={p} onClick={() => abrirModalProjeto(p, cli.empresa)}
                  style={{ fontSize: 13, color: '#2563EB', padding: '5px 14px', border: '1px solid #BFDBFE', borderRadius: 8, background: '#EFF6FF', cursor: 'pointer', fontWeight: 600 }}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ETIQUETAS + DESCRIÇÃO */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E5E7EB', marginBottom: 20, padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: '#111827' }}>
              <Tag size={16} color="#2563EB" /> Etiquetas
            </div>
            <button onClick={() => setModalEtiqueta(!modalEtiqueta)}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8, padding: '6px 12px', background: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              <Plus size={14} /> Gerenciar
            </button>
          </div>

          {/* Etiquetas atribuídas */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: etiquetasCliente.length > 0 ? 12 : 0 }}>
            {etiquetasCliente.map(e => (
              <span key={e.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 700,
                background: e.cor, color: '#fff', letterSpacing: 0.3
              }}>
                {e.nome}
                <button onClick={() => cli.cnpj_cpf && toggleEtiqueta(cli.cnpj_cpf, e.id, true)}
                  style={{ background: 'rgba(255,255,255,0.3)', border: 'none', borderRadius: '50%', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                  <X size={10} color="#fff" />
                </button>
              </span>
            ))}
            {etiquetasCliente.length === 0 && (
              <span style={{ fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' }}>Nenhuma etiqueta atribuída</span>
            )}
          </div>

          {/* Modal de gerenciamento de etiquetas */}
          {modalEtiqueta && (
            <div style={{ marginTop: 12, padding: 16, background: '#F9FAFB', borderRadius: 12, border: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                Adicionar / Remover Etiquetas
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {todasEtiquetas.map(e => {
                  const ativo = etiquetasCliente.some(ec => ec.id === e.id)
                  return (
                    <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={() => cli.cnpj_cpf && toggleEtiqueta(cli.cnpj_cpf, e.id, ativo)}
                        style={{
                          padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          border: ativo ? `2px solid ${e.cor}` : '2px solid #D1D5DB',
                          background: ativo ? e.cor : '#fff',
                          color: ativo ? '#fff' : '#6B7280',
                          transition: 'all .15s'
                        }}>
                        {e.nome}
                      </button>
                      <button onClick={() => excluirEtiqueta(e.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: 2, display: 'flex' }}
                        title="Excluir etiqueta">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={novaEtiquetaNome} onChange={ev => setNovaEtiquetaNome(ev.target.value)}
                  placeholder="Nova etiqueta..."
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none' }}
                  onKeyDown={ev => ev.key === 'Enter' && criarEtiqueta()} />
                <input type="color" value={novaEtiquetaCor} onChange={ev => setNovaEtiquetaCor(ev.target.value)}
                  style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #E5E7EB', cursor: 'pointer', padding: 2 }} />
                <button onClick={criarEtiqueta}
                  style={{ padding: '8px 16px', borderRadius: 8, background: '#2563EB', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Criar
                </button>
              </div>
            </div>
          )}

          {/* Descrição */}
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
              Descrição / Observações
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <textarea value={descricaoLocal} onChange={ev => setDescricaoLocal(ev.target.value)}
                placeholder="Adicione observações sobre este cliente..."
                style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 14, outline: 'none', resize: 'vertical', minHeight: 60, fontFamily: 'inherit', color: '#111827' }} />
              {descricaoLocal !== descricaoCliente && (
                <button onClick={() => cli.cnpj_cpf && salvarDescricao(cli.cnpj_cpf)} disabled={salvandoDesc}
                  style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 4, padding: '8px 16px', borderRadius: 8, background: '#059669', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <Save size={14} /> Salvar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* LEMBRETES DO CLIENTE */}
        {lembretesCliente.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Bell size={16} color="#E65100" /> Lembretes ({lembretesCliente.filter((l: any) => !l.concluido).length} ativos)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lembretesCliente.filter((l: any) => !l.concluido).map((l: any) => (
                <div key={l.id} style={{
                  padding: '14px 18px', borderRadius: 12,
                  background: '#FFF7ED', border: '1px solid #FFCC80',
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                }}>
                  <Bell size={16} color="#E65100" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: '#1a1a1a', fontWeight: 600, lineHeight: 1.4 }}>{l.lembrete}</div>
                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>
                      {l.criado_por ? `Por ${l.criado_por}` : ''}
                      {l.criado_por && l.created_at ? ' — ' : ''}
                      {l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
                    </div>
                  </div>
                </div>
              ))}
              {lembretesCliente.filter((l: any) => l.concluido).length > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 12, color: '#9CA3AF', cursor: 'pointer', fontWeight: 600 }}>
                    {lembretesCliente.filter((l: any) => l.concluido).length} concluído(s)
                  </summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {lembretesCliente.filter((l: any) => l.concluido).map((l: any) => (
                      <div key={l.id} style={{
                        padding: '12px 16px', borderRadius: 10,
                        background: '#F0FFF0', border: '1px solid #C8E6C9',
                        display: 'flex', alignItems: 'flex-start', gap: 10, opacity: 0.7,
                      }}>
                        <CheckCircle size={14} color="#2E7D32" style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, color: '#555', textDecoration: 'line-through' }}>{l.lembrete}</div>
                          <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 3 }}>
                            Concluído por {l.concluido_por || '—'}
                            {l.concluido_em ? ` em ${new Date(l.concluido_em).toLocaleDateString('pt-BR')}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        )}

        {loadingDetalhe ? (
          <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF', fontSize: 15 }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
            <div>Carregando...</div>
          </div>
        ) : (
          <>
            {/* RESUMO CARDS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, marginBottom: 28 }}>
              {[
                { l: 'Total OS', v: String(ordens.length), bg: '#EFF6FF', c: '#2563EB', b: '#BFDBFE', icon: ClipboardList },
                { l: 'Ativas', v: String(totalAtivas), bg: '#FFF7ED', c: '#EA580C', b: '#FED7AA', icon: Wrench },
                { l: 'Faturadas', v: String(totalFaturadas), bg: '#ECFDF5', c: '#059669', b: '#A7F3D0', icon: FileText },
                { l: 'Valor OS', v: formatCurrency(totalValorOS), bg: '#F5F3FF', c: '#7C3AED', b: '#C4B5FD', icon: Package },
                { l: 'Valor PV', v: formatCurrency(totalValorPV), bg: '#FEF2F2', c: '#DC2626', b: '#FECACA', icon: Package },
              ].map((c, i) => (
                <div key={i} style={{ padding: '16px 20px', borderRadius: 12, background: c.bg, border: `1px solid ${c.b}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                    <c.icon size={13} color={c.c} /> {c.l}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: c.c }}>{c.v}</div>
                </div>
              ))}
            </div>

            {ordens.length === 0 && pedidos.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#9CA3AF', fontSize: 15 }}>Nenhuma ordem de servico encontrada</div>
            ) : (
              <div>
                {/* TITULO SECAO */}
                {ordens.length > 0 && (
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Wrench size={18} color="#2563EB" /> Ordens de Servico ({ordens.length})
                  </div>
                )}

                {/* OS COMO CARDS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
                  {ordens.map((os) => {
                    const servicos = typeof os.servicos === 'string' ? JSON.parse(os.servicos) : (os.servicos || [])
                    const solicitacao = (() => { const d = servicos.map((s: any) => s.desc || '').join('|'); const m = d.match(/Solicita[çc][ãa]o[^:]*:\s*([^|]+)/i); return m ? m[1].trim() : '' })()
                    const ref = classifyRef(os.num_pedido_cli)
                    const numRef = ref.tipo === 'pv' ? os.num_pedido_cli : ''

                    return (
                      <div key={os.num_os} onClick={() => setModalOS(os)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
                          border: '1px solid #E5E7EB', borderRadius: 12, background: '#fff', cursor: 'pointer',
                          transition: 'all 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        }}
                        onMouseEnter={ev => { ev.currentTarget.style.borderColor = '#2563EB'; ev.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.08)' }}
                        onMouseLeave={ev => { ev.currentTarget.style.borderColor = '#E5E7EB'; ev.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.03)' }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                          background: os.cancelada ? '#FEF2F2' : os.faturada ? '#ECFDF5' : '#EFF6FF',
                        }}>
                          <Wrench size={20} color={os.cancelada ? '#DC2626' : os.faturada ? '#059669' : '#2563EB'} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>OS {os.num_os}</span>
                            {numRef && <span style={{ fontSize: 13, color: '#6B7280' }}>/ PV {numRef}</span>}
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                              background: os.cancelada ? '#FEF2F2' : os.faturada ? '#ECFDF5' : '#FFF7ED',
                              color: os.cancelada ? '#DC2626' : os.faturada ? '#059669' : '#EA580C',
                              border: `1px solid ${os.cancelada ? '#FECACA' : os.faturada ? '#A7F3D0' : '#FED7AA'}`,
                            }}>{os.status}</span>
                          </div>
                          <div style={{ fontSize: 13, color: '#6B7280', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {solicitacao || os.descricao || 'Sem descricao'}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{formatCurrency(os.valor_total || 0)}</div>
                          <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{formatDate(os.data_previsao)}</div>
                        </div>
                        <ChevronRight size={18} color="#D1D5DB" style={{ flexShrink: 0 }} />
                      </div>
                    )
                  })}
                </div>

                {/* PVs sem OS */}
                {pvsSemOS.length > 0 && (
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Package size={18} color="#EA580C" /> Pedidos de Venda avulsos ({pvsSemOS.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {pvsSemOS.map(pv => (
                        <div key={pv.num_pedido}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px',
                            border: '1px solid #E5E7EB', borderRadius: 12, background: '#fff',
                          }}>
                          <div style={{ width: 44, height: 44, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: '#FFF7ED' }}>
                            <Package size={20} color="#EA580C" />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>PV {pv.num_pedido}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#F9FAFB', color: '#6B7280', border: '1px solid #E5E7EB' }}>{pv.etapa}</span>
                            </div>
                            {pv.numero_nf && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>NF {pv.numero_nf}</div>}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{formatCurrency(pv.valor_total || 0)}</div>
                            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{formatDate(pv.data_previsao)}</div>
                          </div>
                          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                            <a href={`/api/clientes/print?tipo=pv&cod=${pv.cod_pedido}&empresa=${encodeURIComponent(pv.empresa)}`}
                              target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', textDecoration: 'none', color: '#374151' }}>
                              <Printer size={16} />
                            </a>
                            {pv.link_nf && (
                              <a href={pv.link_nf} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, border: 'none', background: '#111827', textDecoration: 'none', color: '#fff' }}>
                                <Download size={16} />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ========== MODAL OS DETALHADA ========== */}
        {modalOS && (() => {
          const os = modalOS
          const servicos = typeof os.servicos === 'string' ? JSON.parse(os.servicos) : (os.servicos || [])
          const solicitacao = (() => { const d = servicos.map((s: any) => s.desc || '').join('|'); const m = d.match(/Solicita[çc][ãa]o[^:]*:\s*([^|]+)/i); return m ? m[1].trim() : '' })()
          const ref = classifyRef(os.num_pedido_cli)
          const pvs = ref.tipo === 'pv' ? findAllPVs(os.num_pedido_cli) : []

          return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setModalOS(null)}>
              <div style={{ background: '#fff', borderRadius: 16, width: '92%', maxWidth: 800, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
                onClick={e => e.stopPropagation()}>

                {/* Header azul */}
                <div style={{ padding: '24px 28px', background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)', borderRadius: '16px 16px 0 0', color: '#fff', position: 'relative' }}>
                  <button onClick={() => setModalOS(null)}
                    style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <X size={18} color="#fff" />
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Wrench size={24} color="#fff" />
                    </div>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800 }}>Ordem de Servico {os.num_os}</div>
                      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{cli.nome_fantasia || cli.razao_social}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                      background: os.cancelada ? 'rgba(220,38,38,0.2)' : os.faturada ? 'rgba(5,150,105,0.2)' : 'rgba(255,255,255,0.15)',
                      color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
                      {os.status}
                    </span>
                    {os.projeto && (
                      <span style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
                        {os.projeto}
                      </span>
                    )}
                    {os.contrato && (
                      <span style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)' }}>
                        Contrato: {os.contrato}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ padding: '24px 28px' }}>
                  {/* Info grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
                    {[
                      { l: 'Valor Total', v: formatCurrency(os.valor_total || 0), bg: '#F5F3FF', c: '#7C3AED', b: '#C4B5FD' },
                      { l: 'Data Previsao', v: formatDate(os.data_previsao), bg: '#EFF6FF', c: '#2563EB', b: '#BFDBFE' },
                      { l: 'Data Inclusao', v: formatDate(os.data_inclusao), bg: '#F9FAFB', c: '#374151', b: '#E5E7EB' },
                      { l: 'Faturamento', v: formatDate(os.data_faturamento), bg: os.faturada ? '#ECFDF5' : '#F9FAFB', c: os.faturada ? '#059669' : '#9CA3AF', b: os.faturada ? '#A7F3D0' : '#E5E7EB' },
                    ].map((c, i) => (
                      <div key={i} style={{ padding: '14px 16px', borderRadius: 10, background: c.bg, border: `1px solid ${c.b}` }}>
                        <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{c.l}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: c.c }}>{c.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Info adicional */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
                    {[
                      { l: 'Vendedor', v: os.vendedor || '-' },
                      { l: 'Cidade', v: os.cidade || cli.cidade || '-' },
                      { l: 'NF', v: os.num_nf || '-' },
                    ].map((f, i) => (
                      <div key={i} style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#F9FAFB' }}>
                        <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{f.l}</div>
                        <div style={{ fontSize: 14, color: '#111827', fontWeight: 500 }}>{f.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Solicitacao */}
                  {solicitacao && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Solicitacao</div>
                      <div style={{ padding: '14px 18px', borderRadius: 10, background: '#F0F4FF', border: '1px solid #BFDBFE', fontSize: 14, color: '#1E3A5F', lineHeight: 1.6 }}>
                        {solicitacao}
                      </div>
                    </div>
                  )}

                  {/* Servicos */}
                  {servicos.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Servicos ({servicos.length})</div>
                      <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
                        {servicos.map((s: any, si: number) => (
                          <div key={si} style={{ padding: '12px 16px', borderBottom: si < servicos.length - 1 ? '1px solid #F3F4F6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{s.desc || s.descricao || s.nome || `Servico ${si + 1}`}</div>
                              {s.quantidade && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>Qtd: {s.quantidade}</div>}
                            </div>
                            {(s.valor || s.valor_unitario) && (
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', flexShrink: 0, marginLeft: 16 }}>
                                {formatCurrency(s.valor || s.valor_unitario || 0)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Obs */}
                  {os.obs && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Observacoes</div>
                      <div style={{ padding: '14px 18px', borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 13, color: '#92400E', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {os.obs}
                      </div>
                    </div>
                  )}

                  {/* Dados adicionais */}
                  {os.dados_adic && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Dados Adicionais</div>
                      <div style={{ padding: '14px 18px', borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB', fontSize: 13, color: '#6B7280', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {os.dados_adic}
                      </div>
                    </div>
                  )}

                  {/* Botoes de acao */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid #F3F4F6' }}>
                    <a href={`/api/clientes/print?tipo=os&cod=${os.cod_os}&empresa=${encodeURIComponent(os.empresa)}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', border: '1px solid #E5E7EB', borderRadius: 10, background: '#fff', color: '#374151', fontSize: 14, textDecoration: 'none', fontWeight: 600 }}>
                      <Printer size={16} /> Imprimir OS
                    </a>
                    {os.link_nf && (
                      <a href={os.link_nf} target="_blank" rel="noopener noreferrer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', border: 'none', borderRadius: 10, background: '#111827', color: '#fff', fontSize: 14, textDecoration: 'none', fontWeight: 600 }}>
                        <Download size={16} /> Baixar NF
                      </a>
                    )}
                    {pvs.map(pv => (
                      <span key={pv.num_pedido} style={{ display: 'contents' }}>
                        <a href={`/api/clientes/print?tipo=pv&cod=${pv.cod_pedido}&empresa=${encodeURIComponent(pv.empresa)}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', border: '1px solid #E5E7EB', borderRadius: 10, background: '#fff', color: '#374151', fontSize: 14, textDecoration: 'none', fontWeight: 600 }}>
                          <Printer size={16} /> PV {pv.num_pedido}
                        </a>
                        {pv.link_nf && (
                          <a href={pv.link_nf} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 20px', border: 'none', borderRadius: 10, background: '#111827', color: '#fff', fontSize: 14, textDecoration: 'none', fontWeight: 600 }}>
                            <Download size={16} /> NF PV {pv.num_pedido}
                          </a>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* MODAL PROJETO */}
        {modalProjeto && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setModalProjeto(null)}>
            <div style={{ background: '#F9FAFB', borderRadius: 16, width: '95%', maxWidth: 1100, maxHeight: '92vh', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}
              onClick={ev => ev.stopPropagation()}>

              {/* Header gradient */}
              <div style={{ padding: '20px 28px', background: 'linear-gradient(135deg, #1E3A5F 0%, #2563EB 100%)', color: '#fff', position: 'relative', flexShrink: 0 }}>
                <button onClick={() => setModalProjeto(null)}
                  style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: '6px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <X size={18} color="#fff" />
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <FolderOpen size={22} color="#fff" />
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{modalProjeto}</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{cli.empresa}</div>
                  </div>
                </div>
              </div>

              {modalProjetoLoading ? (
                <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF', fontSize: 15 }}>
                  <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
                  <div>Carregando projeto...</div>
                </div>
              ) : !modalProjetoData ? (
                <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF', fontSize: 15 }}>Erro ao carregar projeto</div>
              ) : (() => {
                const d = modalProjetoData
                const chassis: any[] = d.chassis || []
                const nfs: any[] = d.notas_fiscais || []
                const osProj: any[] = d.ordens || []
                const pvsProj: any[] = d.pedidos_venda || []
                const resumo = d.resumo || {}
                const donosList: any[] = d.donos || []
                const servicosList: any[] = d.servicos || []
                const pecasList: any[] = d.pecas || []
                const reqList: any[] = d.requisicoes || []
                const revList: any[] = d.revisoes || []
                const emailsList = d.emails_por_chassis || {}
                const totalEmails = Object.values(emailsList).reduce((s: number, arr: any) => s + (arr?.length || 0), 0)
                const REVISOES_HORAS = ['50h','300h','600h','900h','1200h','1500h','1800h','2100h','2400h','2700h','3000h']

                const tabs = [
                  { id: 'resumo', label: 'Resumo', icon: ClipboardList, count: null },
                  { id: 'donos', label: 'Donos', icon: Users, count: donosList.length },
                  { id: 'servicos', label: 'Servicos', icon: Wrench, count: servicosList.length },
                  { id: 'pecas', label: 'Pecas', icon: Package, count: pecasList.length },
                  { id: 'requisicoes', label: 'Requisicoes', icon: ClipboardList, count: reqList.length },
                  { id: 'revisoes', label: 'Revisoes', icon: CheckCircle, count: revList.length },
                  { id: 'garantias', label: 'Garantias', icon: Shield, count: totalEmails },
                ]

                return (
                  <>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #E5E7EB', background: '#fff', flexShrink: 0, overflowX: 'auto' }}>
                      {tabs.map(t => (
                        <button key={t.id} onClick={() => setProjetoTab(t.id)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px', border: 'none', borderBottom: projetoTab === t.id ? '2px solid #2563EB' : '2px solid transparent',
                            background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: projetoTab === t.id ? 700 : 500,
                            color: projetoTab === t.id ? '#2563EB' : '#6B7280', transition: 'all 0.15s', whiteSpace: 'nowrap',
                          }}>
                          <t.icon size={15} />
                          {t.label}
                          {t.count !== null && t.count > 0 && (
                            <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: projetoTab === t.id ? '#EFF6FF' : '#F3F4F6', color: projetoTab === t.id ? '#2563EB' : '#9CA3AF', fontWeight: 700 }}>
                              {t.count}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>

                      {/* ─── RESUMO ─── */}
                      {projetoTab === 'resumo' && (
                        <div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 24 }}>
                            {[
                              { l: 'Ordens de Servico', v: String(resumo.total_os || 0), bg: '#EFF6FF', c: '#2563EB', b: '#BFDBFE', icon: Wrench },
                              { l: 'Valor Servicos', v: formatCurrency(resumo.valor_total_os || 0), bg: '#ECFDF5', c: '#059669', b: '#A7F3D0', icon: FileText },
                              { l: 'Pedidos de Venda', v: String(resumo.total_pv || 0), bg: '#FFF7ED', c: '#EA580C', b: '#FED7AA', icon: Package },
                            ].map((f, i) => (
                              <div key={i} style={{ padding: '16px 20px', border: `1px solid ${f.b}`, borderRadius: 12, background: f.bg }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontWeight: 600 }}>
                                  <f.icon size={13} color={f.c} /> {f.l}
                                </div>
                                <div style={{ fontSize: 22, color: f.c, fontWeight: 800 }}>{f.v}</div>
                              </div>
                            ))}
                          </div>

                          {/* Chassis */}
                          {chassis.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                              <div style={{ fontSize: 13, color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Chassis ({chassis.length})</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {chassis.map((ch: any, ci: number) => (
                                  <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', border: '1px solid #E5E7EB', borderRadius: 10, background: '#fff' }}>
                                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#F0F4FF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                      <Hash size={16} color="#2563EB" />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ fontSize: 14, fontWeight: 700, color: '#111827', fontFamily: 'monospace' }}>{ch.chassis}</div>
                                      <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{ch.modelo || 'Modelo nao informado'} {ch.cliente_nome ? `— ${ch.cliente_nome}` : ''}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* NFs */}
                          {nfs.length > 0 && (
                            <div style={{ marginBottom: 20 }}>
                              <div style={{ fontSize: 13, color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Notas Fiscais ({nfs.length})</div>
                              <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 110px 90px 60px', padding: '10px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>
                                  <span>Tipo</span><span>Origem</span><span>Numero</span><span style={{ textAlign: 'right' }}>Valor</span><span>Data</span><span></span>
                                </div>
                                {nfs.map((nf: any, ni: number) => (
                                  <div key={ni} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 110px 90px 60px', padding: '10px 16px', borderBottom: `1px solid ${ln2}`, fontSize: 13, color: '#374151', alignItems: 'center' }}>
                                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>{nf.tipo}</span>
                                    <span style={{ fontWeight: 500 }}>{nf.origem}</span>
                                    <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{nf.numero || '-'}</span>
                                    <span style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(nf.valor || 0)}</span>
                                    <span style={{ color: '#9CA3AF', fontSize: 12 }}>{nf.data ? (nf.data.includes('/') ? nf.data : new Date(nf.data + 'T00:00:00').toLocaleDateString('pt-BR')) : '-'}</span>
                                    <span>{nf.link && <a href={nf.link} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 6, background: '#111827', color: '#fff', fontSize: 10, textDecoration: 'none', fontWeight: 600 }}><Download size={10} /> PDF</a>}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ─── DONOS ─── */}
                      {projetoTab === 'donos' && (
                        <div>
                          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>Clientes que tiveram servicos faturados neste projeto</div>
                          {donosList.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Nenhum dono encontrado</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {donosList.map((dono: any, di: number) => (
                                <div key={di} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', border: '1px solid #E5E7EB', borderRadius: 12, background: '#fff' }}>
                                  <div style={{
                                    width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                    background: di === 0 ? '#EFF6FF' : '#F9FAFB',
                                  }}>
                                    <User size={22} color={di === 0 ? '#2563EB' : '#9CA3AF'} />
                                  </div>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{dono.nome || 'Cliente sem nome'}</span>
                                      {di === 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}>ATUAL</span>}
                                    </div>
                                    <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                      {dono.cnpj_cpf && <span>{formatCNPJ(dono.cnpj_cpf)}</span>}
                                      {dono.cidade && <span>{dono.cidade}/{dono.estado}</span>}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{dono.total_os} OS</div>
                                    <div style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>{formatCurrency(dono.total_valor)}</div>
                                    <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>{formatDate(dono.primeira_os)} — {formatDate(dono.ultima_os)}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ─── SERVICOS ─── */}
                      {projetoTab === 'servicos' && (
                        <div>
                          {servicosList.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Nenhum servico encontrado</div>
                          ) : (
                            <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 120px 100px 100px', padding: '10px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>
                                <span>OS</span><span>Descricao</span><span>Cliente</span><span style={{ textAlign: 'right' }}>Valor</span><span>Data</span>
                              </div>
                              {servicosList.map((s: any, si: number) => (
                                <div key={si} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 120px 100px 100px', padding: '10px 16px', borderBottom: `1px solid ${ln2}`, fontSize: 13, color: '#374151', alignItems: 'start' }}>
                                  <span style={{ fontWeight: 600 }}>{s.num_os}</span>
                                  <span style={{ color: '#374151', lineHeight: 1.4, fontSize: 12 }}>{s.desc || '-'}</span>
                                  <span style={{ color: '#6B7280', fontSize: 12 }}>{s.cliente || '-'}</span>
                                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(s.valor || 0)}</span>
                                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>{formatDate(s.data)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ─── PECAS ─── */}
                      {projetoTab === 'pecas' && (
                        <div>
                          {pecasList.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Nenhuma peca encontrada</div>
                          ) : (
                            <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '70px 80px 1fr 50px 90px 100px', padding: '10px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>
                                <span>PV</span><span>Codigo</span><span>Descricao</span><span>Qtd</span><span style={{ textAlign: 'right' }}>Unit.</span><span style={{ textAlign: 'right' }}>Total</span>
                              </div>
                              {pecasList.map((p: any, pi: number) => (
                                <div key={pi} style={{ display: 'grid', gridTemplateColumns: '70px 80px 1fr 50px 90px 100px', padding: '10px 16px', borderBottom: `1px solid ${ln2}`, fontSize: 13, color: '#374151', alignItems: 'start' }}>
                                  <span style={{ fontWeight: 600 }}>{p.num_pv}</span>
                                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#6B7280' }}>{p.codigo || '-'}</span>
                                  <span style={{ fontSize: 12, lineHeight: 1.4 }}>{p.desc || '-'}</span>
                                  <span style={{ fontSize: 12 }}>{p.quantidade}</span>
                                  <span style={{ textAlign: 'right', fontSize: 12, color: '#6B7280' }}>{formatCurrency(p.valor_unitario || 0)}</span>
                                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(p.valor_total || 0)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ─── REQUISICOES ─── */}
                      {projetoTab === 'requisicoes' && (
                        <div>
                          {reqList.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Nenhuma requisicao encontrada</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {reqList.map((r: any, ri: number) => {
                                const statusColor: Record<string, { bg: string; c: string; b: string }> = {
                                  pedido: { bg: '#FFF7ED', c: '#EA580C', b: '#FED7AA' },
                                  completa: { bg: '#ECFDF5', c: '#059669', b: '#A7F3D0' },
                                  aguardando: { bg: '#EFF6FF', c: '#2563EB', b: '#BFDBFE' },
                                  financeiro: { bg: '#F5F3FF', c: '#7C3AED', b: '#C4B5FD' },
                                  lixeira: { bg: '#FEF2F2', c: '#DC2626', b: '#FECACA' },
                                }
                                const sc = statusColor[r.status] || statusColor.pedido
                                return (
                                  <div key={ri} style={{ padding: '14px 18px', border: '1px solid #E5E7EB', borderRadius: 10, background: '#fff' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>#{r.id}</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: sc.bg, color: sc.c, border: `1px solid ${sc.b}` }}>{r.status}</span>
                                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 5, background: '#F3F4F6', color: '#6B7280' }}>{r.tipo}</span>
                                      </div>
                                      <span style={{ fontSize: 12, color: '#9CA3AF' }}>{r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '-'}</span>
                                    </div>
                                    <div style={{ fontSize: 13, color: '#374151' }}>{r.titulo || '-'}</div>
                                    <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4, display: 'flex', gap: 16 }}>
                                      <span>Solicitante: {r.solicitante || '-'}</span>
                                      {r.fornecedor && <span>Fornecedor: {r.fornecedor}</span>}
                                      {r.valor_despeza && parseFloat(r.valor_despeza) > 0 && <span style={{ color: '#059669', fontWeight: 600 }}>{formatCurrency(parseFloat(r.valor_despeza))}</span>}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ─── REVISOES ─── */}
                      {projetoTab === 'revisoes' && (
                        <div>
                          {revList.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Nenhuma revisao encontrada para os chassis deste projeto</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                              {revList.map((t: any, ti: number) => {
                                const revisoesDone = REVISOES_HORAS.filter(h => t[`${h} Data`])
                                const proximaRevisao = REVISOES_HORAS.find(h => !t[`${h} Data`])
                                return (
                                  <div key={ti} style={{ border: '1px solid #E5E7EB', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
                                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{t.Modelo || '-'}</div>
                                        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Chassis: <span style={{ fontFamily: 'monospace' }}>{t.Chassis || '-'}</span> — Cliente: {t.Cliente || '-'}</div>
                                      </div>
                                      <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>{revisoesDone.length}/{REVISOES_HORAS.length} revisoes</div>
                                        {proximaRevisao && <div style={{ fontSize: 11, color: '#EA580C' }}>Proxima: {proximaRevisao}</div>}
                                      </div>
                                    </div>
                                    <div style={{ padding: '14px 20px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                      {REVISOES_HORAS.map(h => {
                                        const data = t[`${h} Data`]
                                        const horim = t[`${h} Horimetro`]
                                        const done = !!data
                                        return (
                                          <div key={h} style={{
                                            padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, minWidth: 70, textAlign: 'center',
                                            background: done ? '#ECFDF5' : '#F9FAFB', color: done ? '#059669' : '#D1D5DB', border: `1px solid ${done ? '#A7F3D0' : '#E5E7EB'}`,
                                          }}>
                                            <div>{h}</div>
                                            {done && <div style={{ fontSize: 10, fontWeight: 500, color: '#6B7280', marginTop: 2 }}>{data}</div>}
                                            {horim && <div style={{ fontSize: 10, color: '#9CA3AF' }}>{horim}h</div>}
                                          </div>
                                        )
                                      })}
                                    </div>
                                    {(t.Entrega || t["Inspecao Data"]) && (
                                      <div style={{ padding: '10px 20px', borderTop: '1px solid #F3F4F6', display: 'flex', gap: 20, fontSize: 12, color: '#6B7280' }}>
                                        {t.Entrega && <span>Entrega: <strong style={{ color: '#374151' }}>{t.Entrega}</strong></span>}
                                        {t["Inspecao Data"] && <span>Inspecao: <strong style={{ color: '#374151' }}>{t["Inspecao Data"]}</strong></span>}
                                        {t["Inspecao Horimetro"] && <span>Horimetro inspecao: <strong style={{ color: '#374151' }}>{t["Inspecao Horimetro"]}h</strong></span>}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ─── GARANTIAS (emails) ─── */}
                      {projetoTab === 'garantias' && (
                        <div>
                          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 16 }}>Emails relacionados aos chassis deste projeto</div>
                          {totalEmails === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Nenhum email de garantia encontrado</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                              {Object.entries(emailsList).map(([ch, emails]: [string, any]) => (
                                <div key={ch}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Hash size={13} color="#2563EB" /> Chassis {ch} ({emails.length} emails)
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {emails.map((e: any, ei: number) => (
                                      <div key={ei} style={{ padding: '12px 16px', border: '1px solid #E5E7EB', borderRadius: 10, background: '#fff' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Mail size={14} color="#6B7280" />
                                            <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{e.assunto || e.subject || 'Sem assunto'}</span>
                                          </div>
                                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{e.data ? new Date(e.data).toLocaleDateString('pt-BR') : '-'}</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: '#6B7280' }}>De: {e.de || e.from || '-'}</div>
                                        {e.anexos && e.anexos.length > 0 && (
                                          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                            {e.anexos.map((a: any, ai: number) => (
                                              <a key={ai} href={a.url || a.link || '#'} target="_blank" rel="noopener noreferrer"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 5, background: '#F3F4F6', color: '#374151', textDecoration: 'none', border: '1px solid #E5E7EB' }}>
                                                <Download size={10} /> {a.nome || a.filename || `Anexo ${ai + 1}`}
                                              </a>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                    </div>
                  </>
                )
              })()}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ============ LISTA DE CLIENTES ============
  return (
    <div style={{ padding: '32px 40px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, color: '#111827', fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>Clientes</h1>
          <p style={{ fontSize: 14, color: '#6B7280', margin: '4px 0 0' }}>{clientes.length} clientes cadastrados</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {(syncStatus || nfStatus) && (
            <span style={{ fontSize: 13, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
              {(syncing || nfStatus) && <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              {syncStatus || nfStatus}
            </span>
          )}
          <button onClick={syncBackground} disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', cursor: syncing ? 'not-allowed' : 'pointer' }}>
            <RefreshCw size={16} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
          <input type="text" placeholder="Buscar por nome, CNPJ, cidade, projeto..."
            value={search} onChange={ev => setSearch(ev.target.value)}
            style={{ width: '100%', padding: '11px 14px 11px 40px', borderRadius: 10, border: '1px solid #E5E7EB', color: '#111827', fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box' }} />
        </div>
        {empresas.length > 1 && (
          <select value={empresaFilter} onChange={ev => setEmpresaFilter(ev.target.value)}
            style={{ padding: '11px 16px', borderRadius: 10, border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, cursor: 'pointer', outline: 'none', background: '#fff' }}>
            <option value="">Todas empresas</option>
            {empresas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF', fontSize: 15 }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
          <div>Carregando clientes...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF', fontSize: 15 }}>
          {clientes.length === 0 ? 'Nenhum cliente. Sincronizacao em andamento...' : 'Nenhum cliente encontrado'}
        </div>
      ) : (
        <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '44px 1fr 160px 140px 70px 120px 110px 24px',
            padding: '12px 20px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB',
            fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5, alignItems: 'center'
          }}>
            <span>#</span><span>Cliente</span><span>CNPJ / CPF</span><span>Cidade</span>
            <span style={{ textAlign: 'center' }}>OS</span><span style={{ textAlign: 'right' }}>Valor Total</span><span>Empresa</span><span></span>
          </div>

          {filtered.slice(0, 200).map((cli, idx) => (
            <div key={`${cli.cod_cli}-${cli.empresa}`} onClick={() => abrirDetalhe(cli)}
              style={{
                display: 'grid', gridTemplateColumns: '44px 1fr 160px 140px 70px 120px 110px 24px',
                padding: '14px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center', cursor: 'pointer',
                fontSize: 14, color: '#111827', transition: 'background 0.15s'
              }}
              onMouseEnter={ev => { ev.currentTarget.style.background = '#F9FAFB' }}
              onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}>
              <span style={{ color: '#D1D5DB', fontSize: 12, fontWeight: 500 }}>{idx + 1}</span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, color: '#111827', fontWeight: 600 }}>{cli.nome_fantasia || cli.razao_social}</span>
                  {(etiquetasMapa[cli.cnpj_cpf?.replace(/\D/g, '')] || []).map(e => (
                    <span key={e.id} style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                      background: e.cor, color: '#fff', lineHeight: '16px', letterSpacing: 0.3
                    }}>{e.nome}</span>
                  ))}
                </div>
                {cli.nome_fantasia && cli.razao_social && cli.nome_fantasia !== cli.razao_social && (
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>{cli.razao_social}</div>
                )}
              </div>
              <span style={{ fontSize: 12, color: '#6B7280', fontFamily: 'monospace' }}>{formatCNPJ(cli.cnpj_cpf)}</span>
              <span style={{ fontSize: 13, color: '#6B7280' }}>{cli.cidade ? `${cli.cidade}/${cli.estado}` : '-'}</span>
              <span style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, color: '#374151' }}>{cli.total_os}</span>
              <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: '#374151' }}>{cli.total_valor > 0 ? formatCurrency(cli.total_valor) : '-'}</span>
              <span style={{ fontSize: 12, color: '#9CA3AF' }}>{cli.empresa}</span>
              <ChevronRight size={16} color="#D1D5DB" />
            </div>
          ))}

          {filtered.length > 200 && (
            <div style={{ padding: 14, textAlign: 'center', fontSize: 13, color: '#6B7280', background: '#F9FAFB' }}>
              Mostrando 200 de {filtered.length} clientes. Use a busca para filtrar.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ClientesPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  if (!loadingPerm && userProfile && !temAcesso('clientes')) return <SemPermissao />
  return <ClientesPageInner />
}
