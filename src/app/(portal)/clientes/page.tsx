'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { supabase } from '@/lib/supabase'
import SemPermissao from '@/components/SemPermissao'
import { Search, ChevronDown, ChevronUp, ArrowLeft, RefreshCw, ChevronRight, Download, Printer, FolderOpen, X, FileText, Wrench, Calendar, MapPin, User, Hash, ClipboardList, Package, Users, Shield, CheckCircle, Clock, Mail, Bell, Tag, Plus, Trash2, Save, Upload } from 'lucide-react'

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
  descricao: string; servicos: any[]; obs: string; dados_adic: string; pdf_anexo?: string
}
interface PedidoVenda {
  num_pedido: string; cod_pedido: number; empresa: string; cod_cli: number
  cliente_nome: string; data_previsao: string | null; data_inclusao: string | null
  etapa: string; valor_total: number; cancelado: boolean; faturado: boolean
  numero_nf: string; link_nf: string; itens: any[]; observacoes: string; pdf_anexo?: string
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
const inpModal: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', outline: 'none', color: '#111827', background: '#fff' }
const lblModal: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#6B7280', letterSpacing: 0.3, display: 'block', marginBottom: 4 }

// Botão de upload de PDF estilizado (substitui o input file nativo)
function FileDrop({ label, hint, file, onPick, accent = '#2563EB' }: { label: string; hint?: string; file: File | null; onPick: (f: File | null) => void; accent?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={lblModal}>{label}</label>
      {!file ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: '1.5px dashed #D1D5DB', borderRadius: 10, cursor: 'pointer', color: '#6B7280', fontSize: 13, fontWeight: 600, background: '#F9FAFB', transition: 'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.color = '#6B7280' }}>
          <Upload size={16} />
          <span>Selecionar PDF</span>
          <input type="file" accept="application/pdf" onChange={e => onPick(e.target.files?.[0] || null)} style={{ display: 'none' }} />
        </label>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: `1.5px solid ${accent}`, borderRadius: 10, background: `${accent}0D`, fontSize: 13 }}>
          <FileText size={16} color={accent} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#111827', fontWeight: 600 }}>{file.name}</span>
          <button type="button" onClick={() => onPick(null)} title="Remover" style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 6, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><X size={13} color="#6B7280" /></button>
        </div>
      )}
      {hint && !file && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

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
  const [donoAberto, setDonoAberto] = useState<number | null>(null)
  const [servicoModalOS, setServicoModalOS] = useState<string | null>(null)
  const [pedidoModalNum, setPedidoModalNum] = useState<string | null>(null)
  const [emailsData, setEmailsData] = useState<Record<string, any[]>>({})
  const [loadingEmails, setLoadingEmails] = useState<string | null>(null)
  const [lembretesCliente, setLembretesCliente] = useState<any[]>([])

  // Criar cliente / projeto (no Omie + local)
  const EMPRESAS_OMIE = ['Nova Tratores', 'Castro Peças']
  const FORM_CLI_VAZIO = { empresa: 'Nova Tratores', cnpj_cpf: '', razao_social: '', nome_fantasia: '', email: '', telefone: '', endereco: '', numero: '', bairro: '', cidade: '', estado: '', cep: '' }
  const [showCriarCliente, setShowCriarCliente] = useState(false)
  const [showCriarProjeto, setShowCriarProjeto] = useState(false)
  const [criando, setCriando] = useState(false)
  const [criarErro, setCriarErro] = useState('')
  const [formCli, setFormCli] = useState({ ...FORM_CLI_VAZIO })
  const [projNome, setProjNome] = useState('')
  const [projEmpresa, setProjEmpresa] = useState('Nova Tratores')

  // Anexar OS / PV (lê do Omie + PDF opcional)
  const [showAnexar, setShowAnexar] = useState<null | 'os' | 'pv'>(null)
  const [anexNumero, setAnexNumero] = useState('')
  const [anexFile, setAnexFile] = useState<File | null>(null)
  const [anexNfFile, setAnexNfFile] = useState<File | null>(null)
  const [anexPvVinc, setAnexPvVinc] = useState('')
  const [anexPvFile, setAnexPvFile] = useState<File | null>(null)
  const [anexPvNfFile, setAnexPvNfFile] = useState<File | null>(null)
  const [anexInterno, setAnexInterno] = useState(false)
  const [anexando, setAnexando] = useState(false)
  const [anexErro, setAnexErro] = useState('')

  const criarCliente = async () => {
    if (!formCli.razao_social.trim() || !formCli.cnpj_cpf.trim()) { setCriarErro('Razão Social e CNPJ/CPF são obrigatórios'); return }
    setCriando(true); setCriarErro('')
    try {
      const dadosForm = { ...formCli }
      const res = await fetch('/api/clientes/criar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dadosForm) })
      const data = await res.json()
      if (!res.ok || data.error) { setCriarErro(data.error || 'Erro ao criar cliente'); setCriando(false); return }
      setShowCriarCliente(false); setFormCli({ ...FORM_CLI_VAZIO })
      await carregarLista()
      // Abre a pasta do cliente recém-criado/vinculado (senão ele fica no fim da lista, ordenada por nº de OS)
      const novo: Cliente = {
        cod_cli: data.cod_cli, empresa: data.empresa || dadosForm.empresa,
        razao_social: dadosForm.razao_social.trim(), nome_fantasia: dadosForm.nome_fantasia?.trim() || dadosForm.razao_social.trim(),
        cnpj_cpf: dadosForm.cnpj_cpf.trim(), cidade: dadosForm.cidade || '', estado: dadosForm.estado || '',
        telefone: dadosForm.telefone || '', email: dadosForm.email || '',
        total_os: 0, total_valor: 0, os_ativas: 0, projetos: [],
      }
      alert(data.aviso || `Cliente "${novo.razao_social}" pronto (cód. ${novo.cod_cli}). Abrindo a pasta dele.`)
      if (data.cod_cli) await abrirDetalhe(novo)
    } catch { setCriarErro('Erro de conexão com o servidor') }
    setCriando(false)
  }

  const criarProjeto = async () => {
    if (!projNome.trim()) { setCriarErro('Nome do projeto é obrigatório'); return }
    setCriando(true); setCriarErro('')
    try {
      const res = await fetch('/api/clientes/projetos/criar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nome: projNome, empresa: projEmpresa }) })
      const data = await res.json()
      if (!res.ok || data.error) { setCriarErro(data.error || 'Erro ao criar projeto'); setCriando(false); return }
      setShowCriarProjeto(false); setProjNome('')
      alert(data.aviso || `Projeto "${data.nome}" criado no Omie (cód. ${data.codigo}).`)
    } catch { setCriarErro('Erro de conexão com o servidor') }
    setCriando(false)
  }

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
  // NF: o download/vínculo das notas é feito 100% pelo cron (GitHub Actions sync-nfs.yml),
  // de madrugada e em lotes até zerar o backlog. A página não baixa mais NF ao abrir
  // (evitava reprocessar pra sempre faturadas sem nota disponível no Omie).

  useEffect(() => {
    (async () => { const count = await carregarLista(); setLoading(false); if (count === 0) { syncBackground(); return }
      try { const res = await fetch('/api/clientes?checkSync=1'); const data = await res.json(); if (data.lastSync) { const diffH = (Date.now() - new Date(data.lastSync).getTime()) / 3600000; if (diffH > 6) syncBackground() } else syncBackground() } catch { syncBackground() }
      carregarMapaEtiquetas()
    })()

    // Auto-sync a cada 30 minutos: busca OS/PV do dia (dados recentes)
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
    setDonoAberto(null)
    setServicoModalOS(null)
    setPedidoModalNum(null)
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

  const abrirAnexar = (tipo: 'os' | 'pv') => { setAnexErro(''); setAnexNumero(''); setAnexFile(null); setAnexNfFile(null); setAnexPvVinc(''); setAnexPvFile(null); setAnexPvNfFile(null); setAnexInterno(false); setShowAnexar(tipo) }
  const anexarItem = async () => {
    if (!anexNumero.trim() || !selectedCliente || !showAnexar) return
    setAnexando(true); setAnexErro('')
    const subir = async (file: File, sufixo: string): Promise<string | null> => {
      const path = `clientes/${selectedCliente.empresa.replace(/ /g, '_')}/${showAnexar}-${anexNumero.trim()}-${sufixo}-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage.from('anexos').upload(path, file, { upsert: true })
      if (upErr) return null
      return supabase.storage.from('anexos').getPublicUrl(path).data.publicUrl
    }
    try {
      let pdf_url: string | undefined
      let nf_pdf_url: string | undefined
      if (anexFile) {
        const u = await subir(anexFile, 'doc')
        if (!u) { setAnexErro('Falha ao subir o PDF do documento.'); setAnexando(false); return }
        pdf_url = u
      }
      if (anexNfFile) {
        const u = await subir(anexNfFile, 'nf')
        if (!u) { setAnexErro('Falha ao subir o PDF da NF.'); setAnexando(false); return }
        nf_pdf_url = u
      }
      // PDFs do Pedido de Venda vinculado (só no modo OS, quando há PV informado)
      let pv_pdf_url: string | undefined
      let pv_nf_pdf_url: string | undefined
      if (showAnexar === 'os' && anexPvVinc.trim()) {
        if (anexPvFile) {
          const u = await subir(anexPvFile, 'pvdoc')
          if (!u) { setAnexErro('Falha ao subir o PDF do PV.'); setAnexando(false); return }
          pv_pdf_url = u
        }
        if (anexPvNfFile) {
          const u = await subir(anexPvNfFile, 'pvnf')
          if (!u) { setAnexErro('Falha ao subir o PDF da NF de peça.'); setAnexando(false); return }
          pv_nf_pdf_url = u
        }
      }
      const res = await fetch('/api/clientes/anexar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: showAnexar, numero: anexNumero.trim(), empresa: selectedCliente.empresa, pdf_url, nf_pdf_url, pv_vinculado: showAnexar === 'os' ? anexPvVinc.trim() : undefined, pv_pdf_url, pv_nf_pdf_url, servico_interno: showAnexar === 'os' ? anexInterno : false }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setAnexErro(data.error || 'Erro ao anexar'); setAnexando(false); return }
      if (data.aviso) alert(data.aviso)
      setShowAnexar(null); setAnexNumero(''); setAnexFile(null); setAnexNfFile(null); setAnexPvVinc(''); setAnexPvFile(null); setAnexPvNfFile(null); setAnexInterno(false)
      await abrirDetalhe(selectedCliente)
    } catch { setAnexErro('Erro de conexão com o servidor') }
    setAnexando(false)
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
                            {l.concluido_em_ordem ? <span style={{ color: '#2E7D32', fontWeight: 700 }}> · OS {l.concluido_em_ordem}</span> : ''}
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Wrench size={18} color="#2563EB" /> Ordens de Servico ({ordens.length})
                  </div>
                  <button onClick={() => abrirAnexar('os')}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <Plus size={14} /> Anexar OS
                  </button>
                </div>

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
                        {os.pdf_anexo && (
                          <a href={os.pdf_anexo} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()} title="PDF anexado"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#1D4ED8', fontSize: 11, fontWeight: 700, textDecoration: 'none', flexShrink: 0 }}>
                            <FileText size={13} /> PDF
                          </a>
                        )}
                        <ChevronRight size={18} color="#D1D5DB" style={{ flexShrink: 0 }} />
                      </div>
                    )
                  })}
                </div>

                {/* PVs sem OS */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Package size={18} color="#EA580C" /> Pedidos de Venda avulsos ({pvsSemOS.length})
                    </div>
                    <button onClick={() => abrirAnexar('pv')}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid #FED7AA', background: '#FFF7ED', color: '#EA580C', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <Plus size={14} /> Anexar PV
                    </button>
                  </div>
                  {pvsSemOS.length > 0 && (
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
                            {pv.pdf_anexo && (
                              <a href={pv.pdf_anexo} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="PDF anexado"
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, border: '1px solid #FED7AA', background: '#FFF7ED', textDecoration: 'none', color: '#EA580C' }}>
                                <FileText size={16} />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ========== MODAL ANEXAR OS/PV ========== */}
        {showAnexar && (
          <div onClick={e => { if (e.target === e.currentTarget && !anexando) setShowAnexar(null) }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 16, width: 460, maxWidth: '95vw', padding: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: 0 }}>
                  Anexar {showAnexar === 'os' ? 'Ordem de Serviço' : 'Pedido de Venda'}
                </h2>
                <button onClick={() => setShowAnexar(null)} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} color="#6B7280" /></button>
              </div>
              <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 18px' }}>
                Informe o número; o resto (cliente, valores, datas e a {showAnexar === 'os' ? 'NF de serviço' : 'NF de peça'}) é lido do Omie. Se quiser, anexe o PDF.
              </p>

              <div style={{ marginBottom: 14 }}>
                <label style={lblModal}>NÚMERO DO {showAnexar === 'os' ? 'OS' : 'PEDIDO'} *</label>
                <input value={anexNumero} onChange={e => setAnexNumero(e.target.value)} autoFocus placeholder="Ex: 5026" onKeyDown={e => { if (e.key === 'Enter' && anexNumero.trim()) anexarItem() }} style={inpModal} />
              </div>

              {showAnexar === 'os' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={lblModal}>PEDIDO DE VENDA VINCULADO (opcional)</label>
                  <input value={anexPvVinc} onChange={e => setAnexPvVinc(e.target.value.replace(/\D/g, ''))} placeholder="Nº do PV ligado a esta OS" style={inpModal} />
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Se informar, eu puxo o PV do Omie e deixo ligado a esta OS na pasta.</div>
                </div>
              )}

              {showAnexar === 'os' && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16, padding: '10px 12px', borderRadius: 10, border: `1px solid ${anexInterno ? '#A7F3D0' : '#E5E7EB'}`, background: anexInterno ? '#ECFDF5' : '#F9FAFB', cursor: 'pointer' }}>
                  <input type="checkbox" checked={anexInterno} onChange={e => setAnexInterno(e.target.checked)} style={{ width: 16, height: 16, marginTop: 1, accentColor: '#059669', cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: '#374151', fontWeight: 600, lineHeight: 1.35 }}>
                    Serviço interno (sem NF de serviço)
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: '#6B7280', marginTop: 2 }}>Não busco nota no Omie. Anexe o recibo no lugar das NFs, se quiser.</span>
                  </span>
                </label>
              )}

              <FileDrop
                label={`PDF DA ${showAnexar === 'os' ? 'OS' : 'PV'} (opcional)`}
                file={anexFile} onPick={setAnexFile}
                accent={showAnexar === 'os' ? '#2563EB' : '#EA580C'} />

              <FileDrop
                label={anexInterno ? 'PDF DO RECIBO (opcional)' : `PDF DA ${showAnexar === 'os' ? 'NF DE SERVIÇO' : 'NF DE PEÇA'} (opcional)`}
                hint={anexInterno ? 'Serviço interno: anexe o recibo se tiver (sem NF).' : 'Se não anexar, eu busco a nota no Omie automaticamente.'}
                file={anexNfFile} onPick={setAnexNfFile}
                accent={showAnexar === 'os' ? '#2563EB' : '#EA580C'} />

              {showAnexar === 'os' && anexPvVinc.trim() && (
                <div style={{ marginBottom: 16, padding: '14px 14px 0', border: '1px solid #FED7AA', borderRadius: 12, background: '#FFF7ED' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#C2410C', letterSpacing: 0.3, marginBottom: 10 }}>ANEXOS DO PEDIDO DE VENDA {anexPvVinc.trim()}</div>
                  <FileDrop label="PDF DO PV (opcional)" file={anexPvFile} onPick={setAnexPvFile} accent="#EA580C" />
                  <FileDrop label={anexInterno ? 'PDF DO RECIBO (opcional)' : 'PDF DA NF DE PEÇA (opcional)'} hint={anexInterno ? 'Serviço interno: anexe o recibo se tiver (sem NF).' : 'Se não anexar, eu busco a nota do PV no Omie.'} file={anexPvNfFile} onPick={setAnexPvNfFile} accent="#EA580C" />
                </div>
              )}

              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 14 }}>Empresa: <strong>{selectedCliente?.empresa}</strong></div>

              {anexErro && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>{anexErro}</div>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowAnexar(null)} disabled={anexando} style={{ padding: '11px 22px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={anexarItem} disabled={anexando || !anexNumero.trim()} style={{ padding: '11px 24px', borderRadius: 10, border: 'none', background: showAnexar === 'os' ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' : 'linear-gradient(135deg, #EA580C, #C2410C)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (anexando || !anexNumero.trim()) ? 'not-allowed' : 'pointer', opacity: (anexando || !anexNumero.trim()) ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {anexando ? 'Lendo do Omie...' : 'Anexar'}
                </button>
              </div>
            </div>
          </div>
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

                // OS indexada por número (tem vendedor e num_pedido_cli)
                const osPorNum = new Map<string, any>()
                for (const os of osProj) osPorNum.set(String(os.num_os), os)
                // Serviços agrupados por OS (junta os duplicados do mesmo número)
                const servicosAgrupados = (() => {
                  const m = new Map<string, { num_os: string; linhas: any[]; valor: number; data: string; cliente: string; status: string }>()
                  for (const s of servicosList) {
                    const k = String(s.num_os)
                    const e = m.get(k) || { num_os: s.num_os, linhas: [] as any[], valor: 0, data: s.data, cliente: s.cliente, status: s.status }
                    e.linhas.push(s); e.valor += s.valor || 0
                    m.set(k, e)
                  }
                  return Array.from(m.values())
                })()
                const osDoDono = (codCli: number) => osProj.filter((o: any) => o.cod_cli === codCli)
                const irParaServico = (numOS: string) => { setProjetoTab('servicos'); setServicoModalOS(String(numOS)) }
                // PV indexado por número + peças por PV (pra abrir o pedido e ver os produtos)
                const pvPorNum = new Map<string, any>()
                for (const pv of pvsProj) pvPorNum.set(String(pv.num_pedido), pv)
                const pecasDoPv = (num: string) => pecasList.filter((p: any) => String(p.num_pv) === String(num))
                // Peças agrupadas por pedido (junta os itens do mesmo PV)
                const pecasAgrupadas = (() => {
                  const m = new Map<string, { num_pv: string; itens: any[]; valor: number; qtd: number; cliente: string; data: string }>()
                  for (const p of pecasList) {
                    const k = String(p.num_pv)
                    const e = m.get(k) || { num_pv: p.num_pv, itens: [] as any[], valor: 0, qtd: 0, cliente: p.cliente, data: p.data }
                    e.itens.push(p); e.valor += p.valor_total || 0; e.qtd += Number(p.quantidade) || 0
                    m.set(k, e)
                  }
                  return Array.from(m.values())
                })()

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
                          {/* Frase-resumo */}
                          <div style={{ marginBottom: 18, padding: '14px 18px', background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 12, fontSize: 14, color: '#374151', lineHeight: 1.65 }}>
                            Este projeto teve <strong style={{ color: '#2563EB' }}>{resumo.total_os || 0}</strong> {(resumo.total_os || 0) === 1 ? 'ordem de serviço' : 'ordens de serviço'}, <strong style={{ color: '#EA580C' }}>{resumo.total_pv || 0}</strong> {(resumo.total_pv || 0) === 1 ? 'pedido de venda' : 'pedidos de venda'}, aparece em <strong style={{ color: '#7C3AED' }}>{reqList.length}</strong> {reqList.length === 1 ? 'requisição' : 'requisições'} e em <strong style={{ color: '#0891B2' }}>{totalEmails}</strong> {totalEmails === 1 ? 'e-mail' : 'e-mails'}.
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
                            {[
                              { l: 'Ordens de Servico', v: String(resumo.total_os || 0), bg: '#EFF6FF', c: '#2563EB', b: '#BFDBFE', icon: Wrench },
                              { l: 'Valor Servicos', v: formatCurrency(resumo.valor_total_os || 0), bg: '#ECFDF5', c: '#059669', b: '#A7F3D0', icon: FileText },
                              { l: 'Pedidos de Venda', v: String(resumo.total_pv || 0), bg: '#FFF7ED', c: '#EA580C', b: '#FED7AA', icon: Package },
                              { l: 'Requisicoes', v: String(reqList.length), bg: '#FAF5FF', c: '#7C3AED', b: '#E9D5FF', icon: ClipboardList },
                              { l: 'E-mails', v: String(totalEmails), bg: '#ECFEFF', c: '#0891B2', b: '#A5F3FC', icon: Mail },
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
                              {donosList.map((dono: any, di: number) => {
                                const aberto = donoAberto === dono.cod_cli
                                const oss = osDoDono(dono.cod_cli)
                                return (
                                <div key={di} style={{ border: '1px solid #E5E7EB', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
                                  <div onClick={() => setDonoAberto(aberto ? null : dono.cod_cli)} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', cursor: 'pointer', background: aberto ? '#F8FAFC' : '#fff' }}>
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
                                    {aberto ? <ChevronUp size={18} color="#9CA3AF" /> : <ChevronDown size={18} color="#9CA3AF" />}
                                  </div>
                                  {aberto && (
                                    <div style={{ borderTop: '1px solid #E5E7EB', background: '#F9FAFB', padding: '8px' }}>
                                      <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, padding: '6px 10px' }}>Ordens de serviço deste dono</div>
                                      {oss.length === 0 ? (
                                        <div style={{ padding: '10px', fontSize: 13, color: '#9CA3AF' }}>Nenhuma OS</div>
                                      ) : oss.map((os: any, oi: number) => (
                                        <div key={oi} onClick={() => irParaServico(os.num_os)} title="Ver detalhes do serviço"
                                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: '#fff', border: '1px solid #EEF0F3', marginBottom: 6 }}
                                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#BFDBFE'; e.currentTarget.style.background = '#F8FAFF' }}
                                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#EEF0F3'; e.currentTarget.style.background = '#fff' }}>
                                          <span style={{ fontSize: 13, fontWeight: 700, color: '#2563EB', minWidth: 70 }}>OS {os.num_os}</span>
                                          <span style={{ flex: 1, fontSize: 12, color: '#6B7280' }}>{os.status || '-'}</span>
                                          <span style={{ fontSize: 12, color: '#9CA3AF' }}>{formatDate(os.data_previsao || os.data_inclusao)}</span>
                                          <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', minWidth: 90, textAlign: 'right' }}>{formatCurrency(os.valor_total || 0)}</span>
                                          <ChevronRight size={15} color="#C4C9D2" />
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ─── SERVICOS ─── */}
                      {projetoTab === 'servicos' && (
                        <div>
                          {servicosAgrupados.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Nenhum servico encontrado</div>
                          ) : (
                            <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 140px 110px 100px', padding: '10px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>
                                <span>OS</span><span>Servicos</span><span>Cliente</span><span style={{ textAlign: 'right' }}>Valor</span><span>Data</span>
                              </div>
                              {servicosAgrupados.map((g: any, gi: number) => (
                                <div key={gi} onClick={() => setServicoModalOS(String(g.num_os))} title="Ver detalhes da OS"
                                  style={{ display: 'grid', gridTemplateColumns: '90px 1fr 140px 110px 100px', padding: '12px 16px', borderBottom: `1px solid ${ln2}`, fontSize: 13, color: '#374151', alignItems: 'center', cursor: 'pointer' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFF' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                                  <span style={{ fontWeight: 700, color: '#2563EB' }}>OS {g.num_os}</span>
                                  <span style={{ color: '#374151', fontSize: 12 }}>
                                    {g.linhas.length} {g.linhas.length === 1 ? 'serviço' : 'serviços'}
                                    <span style={{ color: '#9CA3AF' }}> — {(g.linhas[0]?.desc || '').slice(0, 60)}{(g.linhas[0]?.desc || '').length > 60 ? '…' : ''}</span>
                                  </span>
                                  <span style={{ color: '#6B7280', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.cliente || '-'}</span>
                                  <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(g.valor || 0)}</span>
                                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>{formatDate(g.data)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ─── PECAS ─── */}
                      {projetoTab === 'pecas' && (
                        <div>
                          {pecasAgrupadas.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Nenhuma peca encontrada</div>
                          ) : (
                            <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 140px 80px 120px', padding: '10px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>
                                <span>Pedido</span><span>Itens</span><span>Cliente</span><span style={{ textAlign: 'center' }}>Qtd</span><span style={{ textAlign: 'right' }}>Total</span>
                              </div>
                              {pecasAgrupadas.map((g: any, gi: number) => (
                                <div key={gi} onClick={() => setPedidoModalNum(String(g.num_pv))} title="Ver detalhes do pedido"
                                  style={{ display: 'grid', gridTemplateColumns: '110px 1fr 140px 80px 120px', padding: '12px 16px', borderBottom: `1px solid ${ln2}`, fontSize: 13, color: '#374151', alignItems: 'center', cursor: 'pointer' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = '#FFFBF5' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                                  <span style={{ fontWeight: 700, color: '#EA580C' }}>PV {g.num_pv}</span>
                                  <span style={{ color: '#374151', fontSize: 12 }}>
                                    {g.itens.length} {g.itens.length === 1 ? 'item' : 'itens'}
                                    <span style={{ color: '#9CA3AF' }}> — {(g.itens[0]?.desc || '').slice(0, 55)}{(g.itens[0]?.desc || '').length > 55 ? '…' : ''}</span>
                                  </span>
                                  <span style={{ color: '#6B7280', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.cliente || '-'}</span>
                                  <span style={{ textAlign: 'center', fontSize: 12, color: '#6B7280' }}>{g.qtd}</span>
                                  <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(g.valor || 0)}</span>
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
                                  <div key={ri} style={{ padding: '14px 18px', border: `1px solid ${r.match_chassis ? '#BFDBFE' : '#E5E7EB'}`, borderRadius: 10, background: '#fff' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>#{r.id}</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: sc.bg, color: sc.c, border: `1px solid ${sc.b}` }}>{r.status}</span>
                                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 5, background: '#F3F4F6', color: '#6B7280' }}>{r.tipo}</span>
                                        {r.match === 'chassi' && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}>achada pelo chassi</span>}
                                      </div>
                                      <span style={{ fontSize: 12, color: '#9CA3AF' }}>{r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '-'}</span>
                                    </div>
                                    <div style={{ fontSize: 13, color: '#374151' }}>{r.titulo || '-'}</div>
                                    {r.Chassis_Modelo && (
                                      <div style={{ fontSize: 12, color: '#374151', marginTop: 5, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <Hash size={12} color="#2563EB" />
                                        <span style={{ fontFamily: 'monospace' }}>{r.Chassis_Modelo}</span>
                                        {r.match_chassis && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}>final {r.match_chassis}</span>}
                                      </div>
                                    )}
                                    <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
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

                    {/* ─── MODAL DETALHE DO SERVIÇO (OS) ─── */}
                    {servicoModalOS && (() => {
                      const os = osPorNum.get(servicoModalOS)
                      const grupo = servicosAgrupados.find((g: any) => String(g.num_os) === servicoModalOS)
                      const linhas = grupo?.linhas || []
                      const total = grupo?.valor || os?.valor_total || 0
                      const pedido = String(os?.num_pedido_cli || '').trim()
                      const pedidoEhPV = /^\d+$/.test(pedido)
                      const status = os?.status || grupo?.status || ''
                      return (
                        <div onClick={e => { if (e.target === e.currentTarget) setServicoModalOS(null) }}
                          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                          <div style={{ background: '#fff', borderRadius: 18, width: 720, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
                            {/* Header */}
                            <div style={{ background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', padding: '22px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Wrench size={22} color="#fff" /></div>
                                <div>
                                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>Ordem de Serviço</div>
                                  <div style={{ fontSize: 23, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>OS {servicoModalOS}</div>
                                </div>
                              </div>
                              <button onClick={() => setServicoModalOS(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 9, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><X size={18} color="#fff" /></button>
                            </div>
                            {/* Body */}
                            <div style={{ padding: '24px 26px', overflow: 'auto' }}>
                              {/* Destaque: total + status */}
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: '#F8FAFC', border: '1px solid #EEF0F3', borderRadius: 14, marginBottom: 20 }}>
                                <div>
                                  <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Valor total</div>
                                  <div style={{ fontSize: 27, fontWeight: 800, color: '#111827', lineHeight: 1.15 }}>{formatCurrency(total)}</div>
                                </div>
                                {status && <span style={{ fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 20, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}>{status}</span>}
                              </div>
                              {/* Info */}
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
                                {[
                                  { l: 'Cliente', v: grupo?.cliente || os?.cliente_nome || '-' },
                                  { l: 'Vendedor', v: os?.vendedor || '-' },
                                  { l: 'Data', v: formatDate(os?.data_previsao || os?.data_inclusao || grupo?.data) },
                                  { l: 'Cidade', v: os?.cidade || '-' },
                                ].map((f, i) => (
                                  <div key={i} style={{ padding: '11px 15px', background: '#fff', border: '1px solid #EEF0F3', borderRadius: 11 }}>
                                    <div style={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>{f.l}</div>
                                    <div style={{ fontSize: 14, color: '#111827', fontWeight: 600, wordBreak: 'break-word' }}>{f.v}</div>
                                  </div>
                                ))}
                                {/* Pedido vinculado (link) ocupando a linha toda */}
                                <div style={{ gridColumn: '1 / -1', padding: '11px 15px', background: pedidoEhPV ? '#EFF6FF' : '#fff', border: `1px solid ${pedidoEhPV ? '#BFDBFE' : '#EEF0F3'}`, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                  <div>
                                    <div style={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>Nº do Pedido do Cliente</div>
                                    <div style={{ fontSize: 14, color: '#111827', fontWeight: 700 }}>{pedido || '—'}</div>
                                  </div>
                                  {pedidoEhPV && (
                                    <button onClick={() => setPedidoModalNum(pedido)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #EA580C, #C2410C)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                                      <Package size={14} /> Ver pedido <ChevronRight size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {(os?.pdf_anexo || os?.link_nf) && (
                                <div style={{ marginBottom: 22 }}>
                                  <div style={{ fontSize: 11.5, color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 9 }}>Anexos</div>
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {os?.pdf_anexo && (
                                      <a href={os.pdf_anexo} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}><FileText size={15} /> PDF da OS</a>
                                    )}
                                    {os?.link_nf && (
                                      <a href={os.link_nf} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}><Download size={15} /> {os?.num_nf ? `Nota Fiscal ${os.num_nf}` : 'Nota / Recibo'}</a>
                                    )}
                                  </div>
                                </div>
                              )}

                              <div style={{ fontSize: 11.5, color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 9 }}>Serviços ({linhas.length})</div>
                              <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
                                {linhas.length === 0 ? (
                                  <div style={{ padding: '14px', fontSize: 13, color: '#9CA3AF' }}>Sem detalhamento de serviços.</div>
                                ) : (
                                  <>
                                    {linhas.map((l: any, li: number) => (
                                      <div key={li} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: '1px solid #F3F4F6', fontSize: 13, background: li % 2 ? '#FAFBFC' : '#fff' }}>
                                        <span style={{ color: '#374151', lineHeight: 1.45 }}>{l.desc || '-'}</span>
                                        <span style={{ fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' }}>{formatCurrency(l.valor || 0)}</span>
                                      </div>
                                    ))}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 16px', fontSize: 13, background: '#F8FAFC' }}>
                                      <span style={{ fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.3, fontSize: 11.5 }}>Total</span>
                                      <span style={{ fontWeight: 800, color: '#2563EB', whiteSpace: 'nowrap', fontSize: 15 }}>{formatCurrency(total)}</span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    {/* ─── MODAL DETALHE DO PEDIDO DE VENDA (produtos) ─── */}
                    {pedidoModalNum && (() => {
                      const pv = pvPorNum.get(pedidoModalNum)
                      const itens = pecasDoPv(pedidoModalNum)
                      const totalPv = pv?.valor_total || itens.reduce((s: number, p: any) => s + (p.valor_total || 0), 0)
                      const totalQtd = itens.reduce((s: number, p: any) => s + (Number(p.quantidade) || 0), 0)
                      return (
                        <div onClick={e => { if (e.target === e.currentTarget) setPedidoModalNum(null) }}
                          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 10003, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                          <div style={{ background: '#fff', borderRadius: 18, width: 760, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
                            {/* Header */}
                            <div style={{ background: 'linear-gradient(135deg, #EA580C, #C2410C)', padding: '22px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Package size={22} color="#fff" /></div>
                                <div>
                                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase' }}>Pedido de Venda</div>
                                  <div style={{ fontSize: 23, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>Pedido {pedidoModalNum}</div>
                                </div>
                              </div>
                              <button onClick={() => setPedidoModalNum(null)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 9, width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><X size={18} color="#fff" /></button>
                            </div>
                            {/* Body */}
                            <div style={{ padding: '24px 26px', overflow: 'auto' }}>
                              {!pv ? (
                                <div style={{ padding: 30, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Pedido não encontrado nos dados deste projeto.</div>
                              ) : (
                                <>
                                  {/* Destaque */}
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: '#FFFBF5', border: '1px solid #FED7AA', borderRadius: 14, marginBottom: 20 }}>
                                    <div>
                                      <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Valor total</div>
                                      <div style={{ fontSize: 27, fontWeight: 800, color: '#111827', lineHeight: 1.15 }}>{formatCurrency(totalPv)}</div>
                                    </div>
                                    {pv.etapa && <span style={{ fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 20, background: '#FFF7ED', color: '#EA580C', border: '1px solid #FED7AA' }}>{pv.etapa}</span>}
                                  </div>
                                  {/* Info */}
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
                                    {[
                                      { l: 'Cliente', v: pv.cliente_nome || '-' },
                                      { l: 'Data', v: formatDate(pv.data_previsao || pv.data_inclusao) },
                                    ].map((f, i) => (
                                      <div key={i} style={{ padding: '11px 15px', background: '#fff', border: '1px solid #EEF0F3', borderRadius: 11 }}>
                                        <div style={{ fontSize: 10.5, color: '#9CA3AF', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>{f.l}</div>
                                        <div style={{ fontSize: 14, color: '#111827', fontWeight: 600, wordBreak: 'break-word' }}>{f.v}</div>
                                      </div>
                                    ))}
                                  </div>

                                  {(pv.pdf_anexo || pv.link_nf) && (
                                    <div style={{ marginBottom: 22, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                      {pv.pdf_anexo && <a href={pv.pdf_anexo} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, background: '#FFF7ED', color: '#EA580C', border: '1px solid #FED7AA', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}><FileText size={15} /> PDF do PV</a>}
                                      {pv.link_nf && <a href={pv.link_nf} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}><Download size={15} /> {pv.numero_nf ? `Nota Fiscal ${pv.numero_nf}` : 'Nota / Recibo'}</a>}
                                    </div>
                                  )}

                                  <div style={{ fontSize: 11.5, color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 9 }}>Produtos ({itens.length})</div>
                                  <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 50px 100px 110px', padding: '11px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.3 }}>
                                      <span>Codigo</span><span>Descricao</span><span style={{ textAlign: 'center' }}>Qtd</span><span style={{ textAlign: 'right' }}>Unit.</span><span style={{ textAlign: 'right' }}>Total</span>
                                    </div>
                                    {itens.length === 0 ? (
                                      <div style={{ padding: '14px', fontSize: 13, color: '#9CA3AF' }}>Sem itens cadastrados neste pedido.</div>
                                    ) : (
                                      <>
                                        {itens.map((p: any, pi: number) => (
                                          <div key={pi} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 50px 100px 110px', padding: '12px 16px', borderBottom: '1px solid #F3F4F6', fontSize: 13, color: '#374151', alignItems: 'start', background: pi % 2 ? '#FAFBFC' : '#fff' }}>
                                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#6B7280' }}>{p.codigo || '-'}</span>
                                            <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{p.desc || '-'}</span>
                                            <span style={{ fontSize: 12.5, textAlign: 'center' }}>{p.quantidade}</span>
                                            <span style={{ textAlign: 'right', fontSize: 12.5, color: '#6B7280' }}>{formatCurrency(p.valor_unitario || 0)}</span>
                                            <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(p.valor_total || 0)}</span>
                                          </div>
                                        ))}
                                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 50px 100px 110px', padding: '12px 16px', fontSize: 13, background: '#FFFBF5', alignItems: 'center' }}>
                                          <span style={{ gridColumn: '1 / 3', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.3, fontSize: 11.5 }}>Total</span>
                                          <span style={{ textAlign: 'center', fontWeight: 700, color: '#6B7280' }}>{totalQtd}</span>
                                          <span></span>
                                          <span style={{ textAlign: 'right', fontWeight: 800, color: '#EA580C', fontSize: 15 }}>{formatCurrency(totalPv)}</span>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })()}
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
          {syncStatus && (
            <span style={{ fontSize: 13, color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: '#F9FAFB', borderRadius: 8, border: '1px solid #E5E7EB' }}>
              {syncing && <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />}
              {syncStatus}
            </span>
          )}
          <button onClick={() => { setCriarErro(''); setFormCli({ ...FORM_CLI_VAZIO }); setShowCriarCliente(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', height: 40, borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <Plus size={15} /> Criar Cliente
          </button>
          <button onClick={() => { setCriarErro(''); setProjNome(''); setShowCriarProjeto(true) }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', height: 40, borderRadius: 8, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <FolderOpen size={15} /> Criar Projeto
          </button>
          <button onClick={syncBackground} disabled={syncing} title="Sincronizar"
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

      {/* ===== Modal Criar Cliente ===== */}
      {showCriarCliente && (
        <div onClick={e => { if (e.target === e.currentTarget && !criando) setShowCriarCliente(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 580, maxWidth: '95vw', maxHeight: '92vh', overflow: 'auto', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: 0 }}>Criar Cliente</h2>
              <button onClick={() => setShowCriarCliente(false)} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} color="#6B7280" /></button>
            </div>
            <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 18px' }}>Cria também no Omie (IncluirCliente) e aparece na lista.</p>

            <div style={{ marginBottom: 12 }}>
              <label style={lblModal}>EMPRESA *</label>
              <select value={formCli.empresa} onChange={e => setFormCli(p => ({ ...p, empresa: e.target.value }))} style={{ ...inpModal, cursor: 'pointer' }}>
                {EMPRESAS_OMIE.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={lblModal}>CNPJ / CPF *</label>
                <input value={formCli.cnpj_cpf} onChange={e => setFormCli(p => ({ ...p, cnpj_cpf: e.target.value }))} placeholder="Só números ou com máscara" style={inpModal} />
              </div>
              <div>
                <label style={lblModal}>NOME FANTASIA</label>
                <input value={formCli.nome_fantasia} onChange={e => setFormCli(p => ({ ...p, nome_fantasia: e.target.value }))} placeholder="(opcional)" style={inpModal} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={lblModal}>RAZÃO SOCIAL *</label>
              <input value={formCli.razao_social} onChange={e => setFormCli(p => ({ ...p, razao_social: e.target.value }))} placeholder="Nome / razão social" style={inpModal} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={lblModal}>EMAIL</label><input value={formCli.email} onChange={e => setFormCli(p => ({ ...p, email: e.target.value }))} style={inpModal} /></div>
              <div><label style={lblModal}>TELEFONE</label><input value={formCli.telefone} onChange={e => setFormCli(p => ({ ...p, telefone: e.target.value }))} placeholder="DDD + número" style={inpModal} /></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={lblModal}>ENDEREÇO</label><input value={formCli.endereco} onChange={e => setFormCli(p => ({ ...p, endereco: e.target.value }))} style={inpModal} /></div>
              <div><label style={lblModal}>NÚMERO</label><input value={formCli.numero} onChange={e => setFormCli(p => ({ ...p, numero: e.target.value }))} style={inpModal} /></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 70px 110px', gap: 12, marginBottom: 18 }}>
              <div><label style={lblModal}>BAIRRO</label><input value={formCli.bairro} onChange={e => setFormCli(p => ({ ...p, bairro: e.target.value }))} style={inpModal} /></div>
              <div><label style={lblModal}>CIDADE</label><input value={formCli.cidade} onChange={e => setFormCli(p => ({ ...p, cidade: e.target.value }))} style={inpModal} /></div>
              <div><label style={lblModal}>UF</label><input value={formCli.estado} maxLength={2} onChange={e => setFormCli(p => ({ ...p, estado: e.target.value.toUpperCase() }))} style={inpModal} /></div>
              <div><label style={lblModal}>CEP</label><input value={formCli.cep} onChange={e => setFormCli(p => ({ ...p, cep: e.target.value }))} style={inpModal} /></div>
            </div>

            {criarErro && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>{criarErro}</div>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCriarCliente(false)} disabled={criando} style={{ padding: '11px 22px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={criarCliente} disabled={criando} style={{ padding: '11px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: criando ? 'not-allowed' : 'pointer', opacity: criando ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Plus size={15} /> {criando ? 'Criando...' : 'Criar Cliente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Modal Criar Projeto ===== */}
      {showCriarProjeto && (
        <div onClick={e => { if (e.target === e.currentTarget && !criando) setShowCriarProjeto(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 440, maxWidth: '95vw', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827', margin: 0 }}>Criar Projeto</h2>
              <button onClick={() => setShowCriarProjeto(false)} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} color="#6B7280" /></button>
            </div>
            <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 18px' }}>Cria no Omie (IncluirProjeto). O vínculo com o cliente acontece depois, via OS.</p>

            <div style={{ marginBottom: 12 }}>
              <label style={lblModal}>EMPRESA *</label>
              <select value={projEmpresa} onChange={e => setProjEmpresa(e.target.value)} style={{ ...inpModal, cursor: 'pointer' }}>
                {EMPRESAS_OMIE.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={lblModal}>NOME DO PROJETO *</label>
              <input value={projNome} onChange={e => setProjNome(e.target.value)} autoFocus placeholder="Ex: Chassi/Modelo..." onKeyDown={e => { if (e.key === 'Enter' && projNome.trim()) criarProjeto() }} style={inpModal} />
            </div>

            {criarErro && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>{criarErro}</div>}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCriarProjeto(false)} disabled={criando} style={{ padding: '11px 22px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={criarProjeto} disabled={criando || !projNome.trim()} style={{ padding: '11px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (criando || !projNome.trim()) ? 'not-allowed' : 'pointer', opacity: (criando || !projNome.trim()) ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                <FolderOpen size={15} /> {criando ? 'Criando...' : 'Criar Projeto'}
              </button>
            </div>
          </div>
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
