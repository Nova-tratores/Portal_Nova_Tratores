'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { Search, ChevronDown, ChevronUp, ArrowLeft, RefreshCw, ChevronRight, Download, Printer } from 'lucide-react'

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

const ln = '#e5e5e5'
const ln2 = '#f0f0f0'

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
  const [modalProjeto, setModalProjeto] = useState<string | null>(null)
  const [modalProjetoData, setModalProjetoData] = useState<any>(null)
  const [modalProjetoLoading, setModalProjetoLoading] = useState(false)
  const [emailsData, setEmailsData] = useState<Record<string, any[]>>({})
  const [loadingEmails, setLoadingEmails] = useState<string | null>(null)

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
    setSelectedCliente(cliente); setExpandedOS(null); setTab('ordens'); setProjetosData({}); setEmailsData({}); setLoadingDetalhe(true)
    try { const res = await fetch(`/api/clientes?codCli=${cliente.cod_cli}&empresa=${encodeURIComponent(cliente.empresa)}`); const data = await res.json(); setOrdens(data.ordens || [])
      setPedidos((data.pedidos || []).map((pv: any) => ({ ...pv, itens: typeof pv.itens === 'string' ? JSON.parse(pv.itens) : (pv.itens || []) })))
    } catch {} setLoadingDetalhe(false)
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
    return (
      <div style={{ padding: '28px 36px' }}>
        <button onClick={() => setSelectedCliente(null)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '12px', padding: '4px 0', marginBottom: '20px' }}>
          <ArrowLeft size={14} /> Voltar para lista
        </button>

        {/* HEADER CLIENTE */}
        <div style={{ border: `1px solid ${ln}`, borderRadius: '4px', marginBottom: '20px' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${ln}` }}>
            <div style={{ fontSize: '18px', color: '#111', marginBottom: '4px' }}>{cli.nome_fantasia || cli.razao_social}</div>
            {cli.nome_fantasia && cli.razao_social && cli.nome_fantasia !== cli.razao_social && (
              <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>{cli.razao_social}</div>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
            {[
              { l: 'CNPJ/CPF', v: cli.cnpj_cpf ? formatCNPJ(cli.cnpj_cpf) : '-' },
              { l: 'Cidade', v: cli.cidade ? `${cli.cidade}/${cli.estado}` : '-' },
              { l: 'Telefone', v: cli.telefone || '-' },
              { l: 'Email', v: cli.email || '-' },
              { l: 'Empresa', v: cli.empresa },
            ].map((f, i) => (
              <div key={i} style={{ padding: '10px 20px', borderRight: i < 4 ? `1px solid ${ln}` : 'none', borderBottom: `1px solid ${ln}` }}>
                <div style={{ fontSize: '9px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{f.l}</div>
                <div style={{ fontSize: '12px', color: '#333' }}>{f.v}</div>
              </div>
            ))}
          </div>
          {cli.projetos && cli.projetos.length > 0 && (
            <div style={{ padding: '10px 20px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '9px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '4px' }}>Projetos:</span>
              {cli.projetos.map(p => (
                <button key={p} onClick={() => abrirModalProjeto(p, cli.empresa)}
                  style={{ fontSize: '11px', color: '#555', padding: '2px 8px', border: `1px solid ${ln}`, borderRadius: '3px', background: '#fff', cursor: 'pointer' }}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>

        {loadingDetalhe ? (
          <p style={{ color: '#999', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Carregando...</p>
        ) : ordens.length === 0 ? (
          <p style={{ color: '#999', fontSize: '13px', padding: '40px 0', textAlign: 'center' }}>Nenhuma ordem de servico encontrada</p>
        ) : (
          /* ============ ABA ORDENS ============ */
          <div>

            <div style={{ border: `1px solid ${ln}`, borderRadius: '4px', overflow: 'hidden' }}>
              {/* Header tabela OS */}
              <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr 100px 100px 100px 24px', padding: '8px 14px', background: '#fafafa', borderBottom: `1px solid ${ln}`, fontSize: '9px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                <span>Ordem / Pedido</span><span>Servico Solicitado</span><span>Status</span><span style={{ textAlign: 'right' }}>Valor</span><span>Data</span><span></span>
              </div>

              {ordens.map((os, idx) => {
                const isExp = expandedOS === os.num_os
                const servicos = typeof os.servicos === 'string' ? JSON.parse(os.servicos) : (os.servicos || [])
                const solicitacao = (() => { const d = servicos.map((s: any) => s.desc || '').join('|'); const m = d.match(/Solicita[çc][ãa]o[^:]*:\s*([^|]+)/i); return m ? m[1].trim() : '' })()
                const ref = classifyRef(os.num_pedido_cli)
                const pvs = ref.tipo === 'pv' ? findAllPVs(os.num_pedido_cli) : []
                const numRef = ref.tipo === 'pv' ? os.num_pedido_cli : ''

                return (
                  <div key={os.num_os}>
                    <div
                      onClick={() => setExpandedOS(isExp ? null : os.num_os)}
                      style={{
                        display: 'grid', gridTemplateColumns: '100px 1fr 100px 100px 100px 24px',
                        padding: '10px 14px', borderBottom: `1px solid ${ln2}`, cursor: 'pointer',
                        background: isExp ? '#f8f8f8' : 'transparent', alignItems: 'center', fontSize: '12px', color: '#333',
                        transition: 'background 0.1s'
                      }}
                      onMouseEnter={ev => { if (!isExp) ev.currentTarget.style.background = '#fcfcfc' }}
                      onMouseLeave={ev => { if (!isExp) ev.currentTarget.style.background = 'transparent' }}>
                      <span style={{ fontWeight: 500 }}>{os.num_os}{numRef ? `/${numRef}` : ''}</span>
                      <span style={{ color: '#555', fontSize: '12px' }}>{solicitacao || '-'}</span>
                      <span style={{ fontSize: '11px', color: '#666' }}>{os.status}</span>
                      <span style={{ textAlign: 'right', fontWeight: 500 }}>{formatCurrency(os.valor_total || 0)}</span>
                      <span style={{ fontSize: '11px', color: '#888' }}>{formatDate(os.data_previsao)}</span>
                      {isExp ? <ChevronUp size={12} color="#bbb" /> : <ChevronDown size={12} color="#bbb" />}
                    </div>

                    {isExp && (
                      <div style={{ padding: '14px 14px 14px 84px', borderBottom: `1px solid ${ln}`, background: '#fafafa' }}>
                        {solicitacao && (
                          <div style={{ fontSize: '13px', color: '#333', marginBottom: '12px', paddingLeft: '10px', borderLeft: '3px solid #ddd' }}>
                            {solicitacao}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <a href={`/api/clientes/print?tipo=os&cod=${os.cod_os}&empresa=${encodeURIComponent(os.empresa)}`}
                            target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: `1px solid ${ln}`, borderRadius: '3px', background: '#fff', color: '#444', fontSize: '11px', textDecoration: 'none' }}>
                            <Printer size={11} /> Ordem de Servico
                          </a>
                          {os.link_nf && (
                            <a href={os.link_nf} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: `1px solid ${ln}`, borderRadius: '3px', background: '#fff', color: '#444', fontSize: '11px', textDecoration: 'none' }}>
                              <Download size={11} /> Nota Fiscal da Ordem
                            </a>
                          )}
                          {pvs.map(pv => (
                            <span key={pv.num_pedido} style={{ display: 'contents' }}>
                              <a href={`/api/clientes/print?tipo=pv&cod=${pv.cod_pedido}&empresa=${encodeURIComponent(pv.empresa)}`}
                                target="_blank" rel="noopener noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: `1px solid ${ln}`, borderRadius: '3px', background: '#fff', color: '#444', fontSize: '11px', textDecoration: 'none' }}>
                                <Printer size={11} /> Pedido de Venda {pv.num_pedido}
                              </a>
                              {pv.link_nf && (
                                <a href={pv.link_nf} target="_blank" rel="noopener noreferrer"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: `1px solid ${ln}`, borderRadius: '3px', background: '#fff', color: '#444', fontSize: '11px', textDecoration: 'none' }}>
                                  <Download size={11} /> Nota Fiscal do Pedido {pv.num_pedido}
                                </a>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* PVs sem OS */}
            {(() => {
              const pvsSemOS = pedidos.filter(pv => !ordens.some(os => /^\d+$/.test(os.num_pedido_cli) && os.num_pedido_cli === pv.num_pedido))
              if (pvsSemOS.length === 0) return null
              return (
                <div style={{ marginTop: '24px' }}>
                  <div style={{ fontSize: '11px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Pedidos de Venda sem ordem vinculada ({pvsSemOS.length})
                  </div>
                  <div style={{ border: `1px solid ${ln}`, borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 100px 100px 24px', padding: '8px 14px', background: '#fafafa', borderBottom: `1px solid ${ln}`, fontSize: '9px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <span>Numero</span><span>Etapa</span><span>Nota Fiscal</span><span style={{ textAlign: 'right' }}>Valor</span><span>Data</span><span></span>
                    </div>
                    {pvsSemOS.map(pv => {
                      const isExp = expandedOS === `pv-${pv.num_pedido}`
                      return (
                        <div key={pv.num_pedido}>
                          <div onClick={() => setExpandedOS(isExp ? null : `pv-${pv.num_pedido}`)}
                            style={{ display: 'grid', gridTemplateColumns: '80px 1fr 100px 100px 100px 24px', padding: '10px 14px', borderBottom: `1px solid ${ln2}`, cursor: 'pointer', background: isExp ? '#f8f8f8' : 'transparent', alignItems: 'center', fontSize: '12px', color: '#333' }}
                            onMouseEnter={ev => { if (!isExp) ev.currentTarget.style.background = '#fcfcfc' }}
                            onMouseLeave={ev => { if (!isExp) ev.currentTarget.style.background = 'transparent' }}>
                            <span style={{ fontWeight: 500 }}>{pv.num_pedido}</span>
                            <span style={{ color: '#666', fontSize: '11px' }}>{pv.etapa}</span>
                            <span style={{ fontSize: '11px', color: '#666' }}>{pv.numero_nf || '-'}</span>
                            <span style={{ textAlign: 'right', fontWeight: 500 }}>{formatCurrency(pv.valor_total || 0)}</span>
                            <span style={{ fontSize: '11px', color: '#888' }}>{formatDate(pv.data_previsao)}</span>
                            {isExp ? <ChevronUp size={12} color="#bbb" /> : <ChevronDown size={12} color="#bbb" />}
                          </div>
                          {isExp && (
                            <div style={{ padding: '14px 14px 14px 94px', borderBottom: `1px solid ${ln}`, background: '#fafafa' }}>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <a href={`/api/clientes/print?tipo=pv&cod=${pv.cod_pedido}&empresa=${encodeURIComponent(pv.empresa)}`}
                                  target="_blank" rel="noopener noreferrer"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: `1px solid ${ln}`, borderRadius: '3px', background: '#fff', color: '#444', fontSize: '11px', textDecoration: 'none' }}>
                                  <Printer size={11} /> Pedido de Venda
                                </a>
                                {pv.link_nf && (
                                  <a href={pv.link_nf} target="_blank" rel="noopener noreferrer"
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: `1px solid ${ln}`, borderRadius: '3px', background: '#fff', color: '#444', fontSize: '11px', textDecoration: 'none' }}>
                                    <Download size={11} /> Nota Fiscal do Pedido
                                  </a>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {/* MODAL PROJETO */}
        {modalProjeto && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setModalProjeto(null)}>
            <div style={{ background: '#fff', borderRadius: '6px', width: '90%', maxWidth: '900px', maxHeight: '85vh', overflow: 'auto', border: `1px solid ${ln}` }}
              onClick={ev => ev.stopPropagation()}>

              {/* Header modal */}
              <div style={{ padding: '16px 20px', borderBottom: `1px solid ${ln}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
                <div>
                  <div style={{ fontSize: '16px', color: '#111' }}>{modalProjeto}</div>
                  <div style={{ fontSize: '11px', color: '#999' }}>{cli.empresa}</div>
                </div>
                <button onClick={() => setModalProjeto(null)}
                  style={{ background: 'none', border: 'none', fontSize: '20px', color: '#999', cursor: 'pointer', padding: '4px 8px' }}>
                  x
                </button>
              </div>

              {modalProjetoLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#999', fontSize: '13px' }}>Carregando projeto...</div>
              ) : !modalProjetoData ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#999', fontSize: '13px' }}>Erro ao carregar projeto</div>
              ) : (() => {
                const d = modalProjetoData
                const chassis: any[] = d.chassis || []
                const nfs: any[] = d.notas_fiscais || []
                const osProj: any[] = d.ordens || []
                const pvsProj: any[] = d.pedidos_venda || []
                const resumo = d.resumo || {}

                return (
                  <div style={{ padding: '16px 20px' }}>

                    {/* Resumo */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '16px' }}>
                      {[
                        { l: 'Ordens de Servico', v: String(resumo.total_os || 0) },
                        { l: 'Valor Servicos', v: formatCurrency(resumo.valor_total_os || 0) },
                        { l: 'Pedidos de Venda', v: String(resumo.total_pv || 0) },
                        { l: 'Valor Pecas', v: formatCurrency(resumo.valor_total_pv || 0) },
                      ].map((f, i) => (
                        <div key={i} style={{ padding: '8px 14px', border: `1px solid ${ln}`, borderRadius: '4px' }}>
                          <div style={{ fontSize: '9px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>{f.l}</div>
                          <div style={{ fontSize: '14px', color: '#222' }}>{f.v}</div>
                        </div>
                      ))}
                    </div>

                    {/* Chassis */}
                    {chassis.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '9px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                          Chassis ({chassis.length})
                        </div>
                        <div style={{ border: `1px solid ${ln}`, borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '6px 12px', background: '#fafafa', borderBottom: `1px solid ${ln}`, fontSize: '9px', color: '#999', textTransform: 'uppercase' }}>
                            <span>Chassis</span><span>Modelo</span><span>Cliente</span>
                          </div>
                          {chassis.map((ch: any, ci: number) => (
                            <div key={ci} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '7px 12px', borderBottom: `1px solid ${ln2}`, fontSize: '12px', color: '#333' }}>
                              <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>{ch.chassis}</span>
                              <span>{ch.modelo || '-'}</span>
                              <span style={{ color: '#666', fontSize: '11px' }}>{ch.cliente_nome || '-'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Notas Fiscais */}
                    {nfs.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '9px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                          Notas Fiscais ({nfs.length})
                        </div>
                        <div style={{ border: `1px solid ${ln}`, borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 90px 80px 60px', padding: '6px 12px', background: '#fafafa', borderBottom: `1px solid ${ln}`, fontSize: '9px', color: '#999', textTransform: 'uppercase' }}>
                            <span>Tipo</span><span>Origem</span><span>Numero</span><span style={{ textAlign: 'right' }}>Valor</span><span>Data</span><span></span>
                          </div>
                          {nfs.map((nf: any, ni: number) => (
                            <div key={ni} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 90px 80px 60px', padding: '7px 12px', borderBottom: `1px solid ${ln2}`, fontSize: '11px', color: '#333', alignItems: 'center' }}>
                              <span style={{ color: '#888' }}>{nf.tipo}</span>
                              <span>{nf.origem}</span>
                              <span style={{ fontFamily: 'monospace' }}>{nf.numero || '-'}</span>
                              <span style={{ textAlign: 'right' }}>{formatCurrency(nf.valor || 0)}</span>
                              <span style={{ color: '#888' }}>{nf.data ? (nf.data.includes('/') ? nf.data : new Date(nf.data + 'T00:00:00').toLocaleDateString('pt-BR')) : '-'}</span>
                              <span>{nf.link && <a href={nf.link} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 6px', border: `1px solid ${ln}`, borderRadius: '3px', background: '#fff', color: '#444', fontSize: '10px', textDecoration: 'none' }}><Download size={9} /> PDF</a>}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Ordens */}
                    {osProj.length > 0 && (
                      <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '9px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                          Ordens de Servico ({osProj.length})
                        </div>
                        <div style={{ border: `1px solid ${ln}`, borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 90px 80px', padding: '6px 12px', background: '#fafafa', borderBottom: `1px solid ${ln}`, fontSize: '9px', color: '#999', textTransform: 'uppercase' }}>
                            <span>Numero</span><span>Cliente</span><span>Status</span><span style={{ textAlign: 'right' }}>Valor</span><span>Data</span>
                          </div>
                          {osProj.map((os: any, oi: number) => (
                            <div key={oi} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 90px 80px', padding: '7px 12px', borderBottom: `1px solid ${ln2}`, fontSize: '11px', color: '#333' }}>
                              <span style={{ fontWeight: 500 }}>{os.num_os}</span>
                              <span style={{ color: '#666' }}>{os.cliente_nome || '-'}</span>
                              <span style={{ color: '#888' }}>{os.status}</span>
                              <span style={{ textAlign: 'right' }}>{formatCurrency(os.valor_total || 0)}</span>
                              <span style={{ color: '#888' }}>{formatDate(os.data_previsao)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* PVs */}
                    {pvsProj.length > 0 && (
                      <div>
                        <div style={{ fontSize: '9px', color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>
                          Pedidos de Venda ({pvsProj.length})
                        </div>
                        <div style={{ border: `1px solid ${ln}`, borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 90px 80px', padding: '6px 12px', background: '#fafafa', borderBottom: `1px solid ${ln}`, fontSize: '9px', color: '#999', textTransform: 'uppercase' }}>
                            <span>Numero</span><span>Cliente</span><span>Etapa</span><span style={{ textAlign: 'right' }}>Valor</span><span>Data</span>
                          </div>
                          {pvsProj.map((pv: any, pi: number) => (
                            <div key={pi} style={{ display: 'grid', gridTemplateColumns: '60px 1fr 80px 90px 80px', padding: '7px 12px', borderBottom: `1px solid ${ln2}`, fontSize: '11px', color: '#333' }}>
                              <span style={{ fontWeight: 500 }}>{pv.num_pedido}</span>
                              <span style={{ color: '#666' }}>{pv.cliente_nome || '-'}</span>
                              <span style={{ color: '#888' }}>{pv.etapa || '-'}</span>
                              <span style={{ textAlign: 'right' }}>{formatCurrency(pv.valor_total || 0)}</span>
                              <span style={{ color: '#888' }}>{formatDate(pv.data_previsao || pv.data_inclusao)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
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
    <div style={{ padding: '28px 36px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '18px', color: '#111', marginBottom: '2px' }}>Pastas Clientes</div>
          <div style={{ fontSize: '11px', color: '#999' }}>{clientes.length} clientes</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {(syncStatus || nfStatus) && (
            <span style={{ fontSize: '11px', color: '#999', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {(syncing || nfStatus) && <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />}
              {syncStatus || nfStatus}
            </span>
          )}
          <button onClick={syncBackground} disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '30px', height: '30px', borderRadius: '4px', border: `1px solid ${ln}`, background: '#fff', color: '#888', cursor: syncing ? 'not-allowed' : 'pointer' }}>
            <RefreshCw size={14} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
          </button>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#bbb' }} />
          <input type="text" placeholder="Buscar por nome, CNPJ, cidade, projeto..."
            value={search} onChange={ev => setSearch(ev.target.value)}
            style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: '4px', border: `1px solid ${ln}`, color: '#333', fontSize: '12px', outline: 'none', background: '#fff' }} />
        </div>
        {empresas.length > 1 && (
          <select value={empresaFilter} onChange={ev => setEmpresaFilter(ev.target.value)}
            style={{ padding: '7px 12px', borderRadius: '4px', border: `1px solid ${ln}`, color: '#333', fontSize: '11px', cursor: 'pointer', outline: 'none', background: '#fff' }}>
            <option value="">Todas empresas</option>
            {empresas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#999', fontSize: '13px', padding: '60px 0', textAlign: 'center' }}>Carregando...</p>
      ) : filtered.length === 0 ? (
        <p style={{ color: '#999', fontSize: '13px', padding: '60px 0', textAlign: 'center' }}>
          {clientes.length === 0 ? 'Nenhum cliente. Sincronizacao em andamento...' : 'Nenhum cliente encontrado'}
        </p>
      ) : (
        <div style={{ border: `1px solid ${ln}`, borderRadius: '4px', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 140px 120px 60px 100px 100px 20px',
            padding: '8px 14px', background: '#fafafa', borderBottom: `1px solid ${ln}`,
            fontSize: '9px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.5px', alignItems: 'center'
          }}>
            <span>#</span><span>Cliente</span><span>CNPJ</span><span>Cidade</span>
            <span style={{ textAlign: 'center' }}>Ordens</span><span style={{ textAlign: 'right' }}>Valor</span><span>Empresa</span><span></span>
          </div>

          {filtered.slice(0, 200).map((cli, idx) => (
            <div key={`${cli.cod_cli}-${cli.empresa}`} onClick={() => abrirDetalhe(cli)}
              style={{
                display: 'grid', gridTemplateColumns: '40px 1fr 140px 120px 60px 100px 100px 20px',
                padding: '9px 14px', borderBottom: `1px solid ${ln2}`, alignItems: 'center', cursor: 'pointer',
                fontSize: '12px', color: '#333', transition: 'background 0.1s'
              }}
              onMouseEnter={ev => { ev.currentTarget.style.background = '#fcfcfc' }}
              onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}>
              <span style={{ color: '#bbb', fontSize: '11px' }}>{idx + 1}</span>
              <div>
                <div style={{ fontSize: '12px', color: '#222' }}>{cli.nome_fantasia || cli.razao_social}</div>
                {cli.nome_fantasia && cli.razao_social && cli.nome_fantasia !== cli.razao_social && (
                  <div style={{ fontSize: '10px', color: '#aaa' }}>{cli.razao_social}</div>
                )}
              </div>
              <span style={{ fontSize: '10px', color: '#666', fontFamily: 'monospace' }}>{formatCNPJ(cli.cnpj_cpf)}</span>
              <span style={{ fontSize: '11px', color: '#666' }}>{cli.cidade ? `${cli.cidade}/${cli.estado}` : '-'}</span>
              <span style={{ textAlign: 'center', fontWeight: 500 }}>{cli.total_os}</span>
              <span style={{ textAlign: 'right', fontSize: '11px' }}>{cli.total_valor > 0 ? formatCurrency(cli.total_valor) : '-'}</span>
              <span style={{ fontSize: '10px', color: '#888' }}>{cli.empresa}</span>
              <ChevronRight size={12} color="#ccc" />
            </div>
          ))}

          {filtered.length > 200 && (
            <div style={{ padding: '10px 14px', textAlign: 'center', fontSize: '11px', color: '#999', background: '#fafafa' }}>
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
