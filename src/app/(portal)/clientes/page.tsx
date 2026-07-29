'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsMobile } from '@/hooks/useIsMobile'
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui'
import { supabase } from '@/lib/supabase'
import SemPermissao from '@/components/SemPermissao'
import { Search, ChevronDown, ChevronUp, ArrowLeft, RefreshCw, ChevronRight, Download, Printer, FolderOpen, X, FileText, Wrench, Calendar, MapPin, User, Hash, ClipboardList, Package, Users, Shield, CheckCircle, Clock, Mail, Bell, Tag, Plus, Trash2, Save, Upload, AlertTriangle, Send } from 'lucide-react'

interface Cliente {
  cod_cli: number; empresa: string; razao_social: string; nome_fantasia: string
  cnpj_cpf: string; cidade: string; estado: string; telefone: string; email: string
  total_os: number; total_valor: number; os_ativas: number; projetos: string[]
}
interface OrdemServico {
  num_os: string; cod_os: number; empresa: string; cod_cli: number; cliente_nome: string
  etapa: string; data_previsao: string | null; data_inclusao: string | null
  data_faturamento: string | null; valor_total: number; status: string
  cancelada: boolean; faturada: boolean; servico_interno?: boolean; num_pedido_cli: string; vendedor: string
  cidade: string; contrato: string; projeto: string; num_nf: string; link_nf: string
  descricao: string; servicos: any[]; obs: string; dados_adic: string; pdf_anexo?: string
  pos_pdf?: string | null; pos_id?: string | null; pos_real?: boolean; financeiro?: FinanceiroDoc | null
  nf_substituicoes?: SubstituicaoNF[]
  pv_manual?: string | null   // PV apontado à mão na pasta (prioridade sobre o do Omie)
}
interface SubstituicaoNF {
  nf_tipo: 'servico' | 'peca'; num_antigo: string | null; num_novo: string
  por: string; por_id: string | null; em: string
}
interface FinanceiroDoc {
  id: number | null; boleto: string | null; nf_servico: string | null; nf_peca: string | null
  num_nf_servico: string | null; num_nf_peca: string | null
  status: string | null; valor: number | null; categoria: string; criado_em: string | null
}
interface PedidoVenda {
  num_pedido: string; cod_pedido: number; empresa: string; cod_cli: number
  cliente_nome: string; data_previsao: string | null; data_inclusao: string | null
  etapa: string; valor_total: number; cancelado: boolean; faturado: boolean
  numero_nf: string; link_nf: string; itens: any[]; observacoes: string; pdf_anexo?: string
  pv_pdf?: string | null; ppv_id?: string | null; ppv_real?: boolean; financeiro?: FinanceiroDoc | null
  nf_substituicoes?: SubstituicaoNF[]
  nf_status?: string | null; nf_motivo?: string | null   // NF rejeitada/denegada na SEFAZ
}

function formatCurrency(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function formatDate(d: string | null) {
  if (!d) return '-'
  const date = new Date(d + 'T00:00:00')
  return date.toLocaleDateString('pt-BR')
}
// Tags do Omie (espelho portal_nt_clientes_cadastro_omie.tags) — string JSON [{tag:"X"}]
function parseOmieTags(raw: any): string[] {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : (raw || [])
    return (Array.isArray(arr) ? arr : []).map((t: any) => (typeof t === 'string' ? t : t?.tag)).filter(Boolean)
  } catch { return [] }
}
const REVISOES_HORAS = ['50h','300h','600h','900h','1200h','1500h','1800h','2100h','2400h','2700h','3000h']

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
  const isMobile = useIsMobile()
  const { userProfile } = useAuth()
  const { pode } = usePermissoes(userProfile?.id)
  const podeCriarCliente = pode('clientes', 'criar_cliente')
  const podeCriarProjeto = pode('clientes', 'criar_projeto')
  const podeAnexos = pode('clientes', 'anexos')
  const podeEtiquetas = pode('clientes', 'etiquetas')
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
  const [anexNfOS, setAnexNfOS] = useState(false)
  const [gerarCardFin, setGerarCardFin] = useState(true) // checkbox: gerar card no financeiro ao anexar NF de serviço
  const [forcandoCard, setForcandoCard] = useState(false) // escapes manuais (trocar PV / forçar card)
  const [subNF, setSubNF] = useState<{ osNum: string; empresa: string; nf_tipo: 'servico' | 'peca'; num_antigo: string; num_novo: string } | null>(null)
  const [subSalvando, setSubSalvando] = useState(false)
  const [modalProjeto, setModalProjeto] = useState<string | null>(null)
  const [modalProjetoData, setModalProjetoData] = useState<any>(null)
  const [modalProjetoLoading, setModalProjetoLoading] = useState(false)
  const [projetoTab, setProjetoTab] = useState('resumo')
  const [donoAberto, setDonoAberto] = useState<number | null>(null)
  const [servicoModalOS, setServicoModalOS] = useState<string | null>(null)
  const [pedidoModalNum, setPedidoModalNum] = useState<string | null>(null)
  const [reqModal, setReqModal] = useState<any | null>(null)
  const [revModal, setRevModal] = useState<any | null>(null)
  const [emailsData, setEmailsData] = useState<Record<string, any[]>>({})
  const [loadingEmails, setLoadingEmails] = useState<string | null>(null)
  const [lembretesCliente, setLembretesCliente] = useState<any[]>([])
  const [feedbacksCliente, setFeedbacksCliente] = useState<any[]>([])
  const [tagsOmieCliente, setTagsOmieCliente] = useState<string[]>([])
  const router = useRouter()
  const [osColuna, setOsColuna] = useState<'todas' | 'ativas' | 'faturadas' | 'canceladas'>('todas')
  const [osFiltroTipo, setOsFiltroTipo] = useState<string>('')
  const [osBuscaNF, setOsBuscaNF] = useState('')

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
    if (!podeCriarCliente) { setCriarErro('Você não tem permissão para criar cliente'); return }
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
    if (!podeCriarProjeto) { setCriarErro('Você não tem permissão para criar projeto'); return }
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
    if (!podeEtiquetas) return
    await fetch('/api/clientes/etiquetas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo: ativo ? 'desvincular' : 'vincular', cnpj_cpf: cnpj, etiqueta_id: etiquetaId })
    })
    await carregarEtiquetasCliente(cnpj)
    await carregarMapaEtiquetas()
  }

  const salvarDescricao = async (cnpj: string) => {
    if (!podeEtiquetas) return
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
    if (!podeEtiquetas) return
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
    if (!podeEtiquetas) return
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
    setSelectedCliente(cliente); setExpandedOS(null); setModalProjeto(null); setEmailsData({}); setLoadingDetalhe(true); setLembretesCliente([]); setEtiquetasCliente([]); setFeedbacksCliente([]); setTagsOmieCliente([]); setDescricaoCliente(''); setDescricaoLocal(''); setModalEtiqueta(false)
    try { const res = await fetch(`/api/clientes?codCli=${cliente.cod_cli}&empresa=${encodeURIComponent(cliente.empresa)}`); const data = await res.json(); setOrdens(data.ordens || [])
      setPedidos((data.pedidos || []).map((pv: any) => ({ ...pv, itens: typeof pv.itens === 'string' ? JSON.parse(pv.itens) : (pv.itens || []) })))
    } catch {} setLoadingDetalhe(false)
    // Feedbacks/atendimentos do cliente (modulo Feedbacks & CRM) — ligados por codigo_omie = cod_cli
    try {
      const { data: fbs } = await supabase
        .from('feedback_registros')
        .select('id,tipo,data_contato,status_atendimento,nota,acao,feedback,trator,atendente_nome,criado_em')
        .eq('codigo_omie', String(cliente.cod_cli))
        .order('criado_em', { ascending: false })
      setFeedbacksCliente(fbs || [])
    } catch {}
    // Tags do Omie (mesmas do modulo Feedback) — espelho em portal_nt_clientes_cadastro_omie
    try {
      const { data: cad } = await supabase
        .from('portal_nt_clientes_cadastro_omie')
        .select('tags')
        .eq('cod_cli', cliente.cod_cli)
        .eq('empresa', cliente.empresa)
        .maybeSingle()
      setTagsOmieCliente(parseOmieTags(cad?.tags))
    } catch {}
    if (cliente.cnpj_cpf) {
      try { const res = await fetch(`/api/pos/lembretes?cnpj=${encodeURIComponent(cliente.cnpj_cpf.replace(/\D/g, ''))}`); const data = await res.json(); if (Array.isArray(data)) setLembretesCliente(data) } catch {}
      carregarEtiquetasCliente(cliente.cnpj_cpf)
    }
  }

  const abrirAnexar = (tipo: 'os' | 'pv') => { setAnexErro(''); setAnexNumero(''); setAnexFile(null); setAnexNfFile(null); setAnexPvVinc(''); setAnexPvFile(null); setAnexPvNfFile(null); setAnexInterno(false); setShowAnexar(tipo) }
  const anexarItem = async () => {
    if (!podeAnexos) { setAnexErro('Você não tem permissão para anexar.'); return }
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
  // Anexa a NF de serviço (NFS-e que o Omie não dá em PDF) direto na OS da pasta.
  // Ao salvar, dispara a criação do card no financeiro se o serviço ficar completo.
  const anexarNFservicoNaOS = async (os: OrdemServico, file: File, opts?: { gerarCard?: boolean; substituir?: boolean }) => {
    if (!podeAnexos) return
    if (!selectedCliente) return
    const gerarCard = opts?.gerarCard !== false
    const substituir = !!opts?.substituir
    setAnexNfOS(true)
    try {
      const path = `clientes/${os.empresa.replace(/ /g, '_')}/os-${os.num_os}-nfserv-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage.from('anexos').upload(path, file, { upsert: true })
      if (upErr) { alert('Falha ao subir o PDF da NF de serviço.'); setAnexNfOS(false); return }
      const pdf_url = supabase.storage.from('anexos').getPublicUrl(path).data.publicUrl
      const res = await fetch('/api/clientes/anexar-nf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'os', num: os.num_os, empresa: os.empresa, pdf_url, gerarCard }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { alert(data.error || 'Erro ao anexar a NF.'); setAnexNfOS(false); return }
      const r = String(data.card?.resultado || '')
      await abrirDetalhe(selectedCliente)
      setModalOS(null)
      if (substituir) {
        alert('Arquivo da NF de serviço substituído.')
      } else if (!gerarCard) {
        alert('NF de serviço anexada na pasta (sem gerar card no financeiro).')
      } else {
        alert(`NF de serviço anexada na pasta.${r.includes('Card criado') ? ' ✅ Card criado no financeiro!' : r.includes('Aguardando') ? ' Ainda falta outra nota pra liberar o card.' : ''}`)
      }
    } catch { alert('Erro de conexão.') }
    setAnexNfOS(false)
  }
  // Anexa MANUALMENTE a NF de peça num PV (usado quando a SEFAZ rejeitou a nota e ela
  // foi reemitida/gerada por fora). Depois segue o fluxo normal: gera o card no financeiro.
  const anexarNFpecaNoPV = async (pv: PedidoVenda, file: File, opts?: { gerarCard?: boolean; substituir?: boolean }) => {
    if (!podeAnexos || !selectedCliente) return
    const gerarCard = opts?.gerarCard !== false
    const substituir = !!opts?.substituir
    setAnexNfOS(true)
    try {
      const path = `clientes/${pv.empresa.replace(/ /g, '_')}/pv-${pv.num_pedido}-nfpeca-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage.from('anexos').upload(path, file, { upsert: true })
      if (upErr) { alert('Falha ao subir o PDF da NF de peça.'); setAnexNfOS(false); return }
      const pdf_url = supabase.storage.from('anexos').getPublicUrl(path).data.publicUrl
      const res = await fetch('/api/clientes/anexar-nf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'pv', num: pv.num_pedido, empresa: pv.empresa, pdf_url, gerarCard }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { alert(data.error || 'Erro ao anexar a NF de peça.'); setAnexNfOS(false); return }
      await abrirDetalhe(selectedCliente)
      setModalOS(null)
      alert(substituir ? 'Arquivo da NF de peça substituído.'
        : gerarCard ? 'NF de peça anexada na pasta. ✅ Card do financeiro acionado.'
        : 'NF de peça anexada na pasta (sem gerar card no financeiro).')
    } catch { alert('Erro de conexão.') }
    setAnexNfOS(false)
  }
  // ── Escapes manuais (só pra quando a NF dá erro; o automático continua igual) ──
  // 1) Apontar outro Pedido de Venda pra OS (quando o vínculo do Omie está errado/vazio).
  const trocarPVdaOS = async (os: OrdemServico, pvAtual: string) => {
    if (!podeAnexos || !selectedCliente) return
    const pv = window.prompt(
      `Nº do Pedido de Venda (peça) desta OS.\n\nAtual: ${pvAtual || '(nenhum)'}\n\nDeixe VAZIO para voltar ao vínculo automático do Omie.`,
      pvAtual || ''
    )
    if (pv === null) return // cancelou
    setForcandoCard(true)
    let usuario = '', usuarioId = ''
    try { const { data } = await supabase.auth.getUser(); usuario = data.user?.email || ''; usuarioId = data.user?.id || '' } catch {}
    try {
      const res = await fetch('/api/clientes/vincular-pv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ num_os: os.num_os, empresa: os.empresa, pv: pv.trim(), usuario, usuarioId }),
      })
      const d = await res.json()
      if (!res.ok || d.error) { alert(d.error || 'Erro ao trocar o pedido.'); setForcandoCard(false); return }
      await abrirDetalhe(selectedCliente)
      const base = d.pv
        ? `Pedido de venda da OS ${os.num_os} passou a ser o ${d.pv}.`
        : `OS ${os.num_os} voltou ao vínculo automático do Omie.`
      const r = String(d.resultado || '')
      if (/Card criado/i.test(r)) { setModalOS(null); alert(`${base}\n\n✅ ${r}`) }
      else alert(`${base}\n\n${r || 'Ainda não foi pro financeiro.'}`)
    } catch { alert('Erro de conexão.') }
    setForcandoCard(false)
  }
  // 2) Criar o card no financeiro À MÃO. Só existe pra quando deu erro na nota — o fluxo
  //    automático NUNCA cria card com nota faltando.
  const criarCardManual = async (os: OrdemServico, motivo: string) => {
    if (!podeAnexos || !selectedCliente) return
    if (!window.confirm(
      motivo
        ? `Criar o card da OS ${os.num_os} no financeiro À MÃO?\n\nProblema encontrado:\n${motivo}\n\nO card será criado assim mesmo (o automático não cria quando falta nota).\nConfira os dados no financeiro depois.`
        : `Enviar a OS ${os.num_os} para o financeiro agora?\n\nSe já existe um card, não vai duplicar.`
    )) return
    setForcandoCard(true)
    try {
      const res = await fetch(`/api/financeiro/sync-os?os=${encodeURIComponent(os.num_os)}&manual=1`, { method: 'POST' })
      const d = await res.json()
      const r = String(d?.resultado || d?.error || '')
      await abrirDetalhe(selectedCliente)
      if (/Card criado/i.test(r)) { setModalOS(null); alert(`✅ ${r}`) }
      else alert(`Não criou o card.\n\n${r || 'Sem detalhe.'}`)
    } catch { alert('Erro de conexão.') }
    setForcandoCard(false)
  }
  // Marca uma NF (serviço/peça) como substituída na OS da pasta (nº antigo -> novo + histórico).
  const salvarSubstituicao = async () => {
    if (!podeAnexos) return
    if (!subNF || !subNF.num_novo.trim() || !selectedCliente) return
    setSubSalvando(true)
    let usuario = '', usuarioId = ''
    try { const { data } = await supabase.auth.getUser(); usuario = data.user?.email || ''; usuarioId = data.user?.id || '' } catch {}
    try {
      const res = await fetch('/api/clientes/substituir-nf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: 'os', num: subNF.osNum, empresa: subNF.empresa, nf_tipo: subNF.nf_tipo, num_antigo: subNF.num_antigo.trim() || null, num_novo: subNF.num_novo.trim(), usuario, usuarioId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { alert(data.error || 'Erro ao registrar substituição.'); setSubSalvando(false); return }
      setSubNF(null)
      await abrirDetalhe(selectedCliente)
      setModalOS(null)
      alert('Substituição registrada no histórico da OS.')
    } catch { alert('Erro de conexão.') }
    setSubSalvando(false)
  }
  const filtradosRaw = clientes.filter(c => {
    const matchSearch = !search || [c.razao_social, c.nome_fantasia, c.cnpj_cpf, c.cidade, ...(c.projetos || [])].some(f => (f || '').toLowerCase().includes(search.toLowerCase()))
    return matchSearch && (!empresaFilter || c.empresa === empresaFilter)
  })
  // Deduplica por CNPJ/CPF (não pode aparecer o mesmo cliente 2x). Mantém o registro mais completo.
  const filtered = (() => {
    const porDoc = new Map<string, Cliente>()
    const semDoc: Cliente[] = []
    const peso = (c: Cliente) => (Number(c.total_valor || 0) * 1000) + Number(c.total_os || 0)
    for (const c of filtradosRaw) {
      const doc = (c.cnpj_cpf || '').replace(/\D/g, '')
      if (!doc) { semDoc.push(c); continue }
      const ex = porDoc.get(doc)
      if (!ex || peso(c) > peso(ex)) porDoc.set(doc, c)
    }
    return [...porDoc.values(), ...semDoc]
  })()
  const empresas = [...new Set(clientes.map(c => c.empresa))]
  // Interpreta o "num_pedido_cli" da OS. Pode vir "4090" (PV), "REM 3477"
  // (remessa) ou "CASTRO 4090"/"3681 CASTRO" (peça comprada na Castro). Como a
  // Castro tem PV com o MESMO número de outra empresa, devolve também a empresa
  // alvo pra casar o PV certo (Castro quando mencionado, senão a empresa da OS).
  const parseRef = (ref: string, osEmpresa?: string) => {
    const r = String(ref || '').trim()
    if (!r) return { tipo: 'texto' as const, num: '', empresa: '', label: '' }
    const remM = r.match(/^REM\s*(\d+)$/i)
    if (remM) return { tipo: 'remessa' as const, num: remM[1], empresa: osEmpresa || '', label: `Remessa ${remM[1]}` }
    const ehCastro = /castro/i.test(r)
    const num = /^\d+$/.test(r) ? r : (ehCastro ? (r.match(/\d+/g) || []).join("") : '')
    if (num) return { tipo: 'pv' as const, num, empresa: ehCastro ? 'Castro Pecas' : (osEmpresa || ''), label: `Pedido de Venda ${num}${ehCastro ? ' (Castro)' : ''}` }
    return { tipo: 'texto' as const, num: '', empresa: '', label: r }
  }
  const findAllPVs = (ref: string, osEmpresa?: string): PedidoVenda[] => {
    const p = parseRef(ref, osEmpresa)
    if (!p.num) return []
    return pedidos.filter(pv => pv.num_pedido === p.num && (!p.empresa || pv.empresa === p.empresa))
  }
  const classifyRef = (ref: string, osEmpresa?: string) => {
    const p = parseRef(ref, osEmpresa)
    return { tipo: p.tipo, label: p.label }
  }

  // ============ DETALHE DO CLIENTE ============
  if (selectedCliente) {
    const cli = selectedCliente
    const totalFaturadas = ordens.filter(o => o.faturada).length
    const totalCanceladas = ordens.filter(o => o.cancelada).length
    const totalAtivas = ordens.filter(o => !o.faturada && !o.cancelada).length
    const totalValorOS = ordens.reduce((s, o) => s + (o.valor_total || 0), 0)
    const totalValorPV = pedidos.reduce((s, p) => s + (p.valor_total || 0), 0)
    const pvsSemOS = pedidos.filter(pv => !ordens.some(os => {
      const p = parseRef(os.num_pedido_cli, os.empresa)
      return p.tipo === 'pv' && p.num === pv.num_pedido && (!p.empresa || p.empresa === pv.empresa)
    }))

    return (
      <div style={{ padding: 'clamp(12px, 4vw, 20px) clamp(12px, 4vw, 32px) 48px', width: '100%', boxSizing: 'border-box' }}>
        <button onClick={() => setSelectedCliente(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 13, padding: '4px 0', marginBottom: 18 }}>
          <ArrowLeft size={16} /> Voltar para lista
        </button>

        <div className="cli-detail-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '320px minmax(0, 1fr)', gap: isMobile ? 14 : 24, alignItems: 'start' }}>
          {/* ===================== SIDEBAR ===================== */}
          <aside style={{ position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Card do cliente */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 1px 3px rgba(16,24,40,0.06)' }}>
              <div style={{ padding: '20px', background: 'linear-gradient(135deg, #991b1b 0%, #dc2626 100%)', color: '#fff' }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                  <User size={22} color="#fff" />
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.25 }}>{cli.nome_fantasia || cli.razao_social}</div>
                {cli.nome_fantasia && cli.razao_social && cli.nome_fantasia !== cli.razao_social && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>{cli.razao_social}</div>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 12, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)' }}>
                  <FolderOpen size={11} /> {cli.empresa}
                </span>
              </div>
              <div style={{ padding: '6px 0' }}>
                {[
                  { l: 'CNPJ / CPF', v: cli.cnpj_cpf ? formatCNPJ(cli.cnpj_cpf) : '-', icon: Hash },
                  { l: 'Cidade', v: cli.cidade ? `${cli.cidade}/${cli.estado}` : '-', icon: MapPin },
                  { l: 'Telefone', v: cli.telefone || '-', icon: User },
                  { l: 'Email', v: cli.email || '-', icon: Mail },
                ].map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 18px' }}>
                    <f.icon size={15} color="#9CA3AF" style={{ marginTop: 2, flexShrink: 0 }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{f.l}</div>
                      <div style={{ fontSize: 13, color: '#111827', fontWeight: 500, wordBreak: 'break-word' }}>{f.v}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Etiquetas (compacto) */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E5E7EB', padding: '14px 16px', boxShadow: '0 1px 3px rgba(16,24,40,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4 }}>
                  <Tag size={14} color="#2563EB" /> Etiquetas
                </div>
                <button onClick={() => setModalEtiqueta(!modalEtiqueta)} title="Gerenciar etiquetas"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, border: '1px solid #E5E7EB', background: modalEtiqueta ? '#EFF6FF' : '#fff', color: '#2563EB', cursor: 'pointer' }}>
                  <Plus size={15} />
                </button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {etiquetasCliente.map(e => (
                  <span key={e.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 16, fontSize: 12, fontWeight: 700, background: e.cor, color: '#fff' }}>
                    {e.nome}
                    <button onClick={() => cli.cnpj_cpf && toggleEtiqueta(cli.cnpj_cpf, e.id, true)}
                      style={{ background: 'rgba(255,255,255,0.3)', border: 'none', borderRadius: '50%', width: 15, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}>
                      <X size={9} color="#fff" />
                    </button>
                  </span>
                ))}
                {/* Tags do Omie (mesmas do modulo Feedback) — so-leitura */}
                {tagsOmieCliente.map(t => (
                  <span key={`omie-${t}`} title="Tag do Omie (sincronizada pelo modulo Feedback)"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 16, fontSize: 12, fontWeight: 700, background: '#EEF2FF', color: '#4338CA', border: '1px solid #C7D2FE' }}>
                    <Tag size={10} /> {t}
                  </span>
                ))}
                {etiquetasCliente.length === 0 && tagsOmieCliente.length === 0 && !modalEtiqueta && (
                  <span style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>Sem etiquetas. Clique + para marcar.</span>
                )}
              </div>
              {modalEtiqueta && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F3F4F6' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                    {todasEtiquetas.map(e => {
                      const ativo = etiquetasCliente.some(ec => ec.id === e.id)
                      return (
                        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          <button onClick={() => cli.cnpj_cpf && toggleEtiqueta(cli.cnpj_cpf, e.id, ativo)}
                            style={{ padding: '4px 11px', borderRadius: 16, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: ativo ? `2px solid ${e.cor}` : '2px solid #D1D5DB', background: ativo ? e.cor : '#fff', color: ativo ? '#fff' : '#6B7280', transition: 'all .15s' }}>
                            {e.nome}
                          </button>
                          <button onClick={() => excluirEtiqueta(e.id)} title="Excluir etiqueta"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D1D5DB', padding: 1, display: 'flex' }}>
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input value={novaEtiquetaNome} onChange={ev => setNovaEtiquetaNome(ev.target.value)} placeholder="Nova..."
                      style={{ flex: 1, minWidth: 0, padding: '7px 10px', borderRadius: 7, border: '1px solid #E5E7EB', fontSize: 12, outline: 'none' }}
                      onKeyDown={ev => ev.key === 'Enter' && criarEtiqueta()} />
                    <input type="color" value={novaEtiquetaCor} onChange={ev => setNovaEtiquetaCor(ev.target.value)}
                      style={{ width: 32, height: 32, borderRadius: 7, border: '1px solid #E5E7EB', cursor: 'pointer', padding: 2, flexShrink: 0 }} />
                    <button onClick={criarEtiqueta}
                      style={{ padding: '7px 12px', borderRadius: 7, background: '#2563EB', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                      Criar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Projetos */}
            {cli.projetos && cli.projetos.length > 0 && (
              <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E5E7EB', padding: '14px 16px', boxShadow: '0 1px 3px rgba(16,24,40,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
                  <FolderOpen size={14} color="#2563EB" /> Projetos ({cli.projetos.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cli.projetos.map(p => (
                    <button key={p} onClick={() => abrirModalProjeto(p, cli.empresa)}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left', fontSize: 12.5, color: '#1D4ED8', padding: '8px 10px', border: '1px solid #BFDBFE', borderRadius: 8, background: '#EFF6FF', cursor: 'pointer', fontWeight: 600 }}>
                      <Hash size={12} style={{ flexShrink: 0 }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Observações */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E5E7EB', padding: '14px 16px', boxShadow: '0 1px 3px rgba(16,24,40,0.06)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                Observações
              </div>
              <textarea value={descricaoLocal} onChange={ev => setDescricaoLocal(ev.target.value)}
                placeholder="Anote algo sobre este cliente..."
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', resize: 'vertical', minHeight: 56, fontFamily: 'inherit', color: '#111827' }} />
              {descricaoLocal !== descricaoCliente && (
                <button onClick={() => cli.cnpj_cpf && salvarDescricao(cli.cnpj_cpf)} disabled={salvandoDesc}
                  style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, background: '#059669', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <Save size={14} /> Salvar
                </button>
              )}
            </div>

            {/* Feedbacks / Atendimentos (compacto) — modulo Feedbacks & CRM */}
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E5E7EB', padding: '14px 16px', boxShadow: '0 1px 3px rgba(16,24,40,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
                <ClipboardList size={14} color="#7C3AED" /> Feedbacks ({feedbacksCliente.length})
              </div>
              {feedbacksCliente.length === 0 ? (
                <span style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>Sem feedbacks registrados.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {feedbacksCliente.slice(0, 6).map((f: any) => {
                    const crm = f.tipo === 'crm'
                    const cor = crm ? '#dc2626' : '#6366f1'
                    const corBg = crm ? '#FEF2F2' : '#EEF2FF'
                    const texto = (f.feedback || f.acao || '').trim()
                    const statusLabel: Record<string, string> = { concluido: 'Concluído', aberto: 'Aberto', em_andamento: 'Em andamento', sem_resposta: 'Sem resposta', arquivado: 'Arquivado' }
                    const dataTxt = f.data_contato ? formatDate(f.data_contato) : (f.criado_em ? new Date(f.criado_em).toLocaleDateString('pt-BR') : '—')
                    return (
                      <div key={f.id}
                        onClick={() => router.push(`/feedbacks/clientes?registro=${f.id}`)}
                        title="Abrir este feedback no módulo Feedbacks & CRM"
                        onMouseEnter={e => { e.currentTarget.style.background = '#F5F3FF' }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#FCFCFD' }}
                        style={{ border: '1px solid #F3F4F6', borderLeft: `3px solid ${cor}`, borderRadius: 8, padding: '8px 10px', background: '#FCFCFD', cursor: 'pointer', transition: 'background .15s' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: texto ? 3 : 0, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: cor, background: corBg, padding: '1px 7px', borderRadius: 10, letterSpacing: 0.3 }}>{crm ? 'CRM' : 'RFM'}</span>
                          <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 600 }}>{dataTxt}</span>
                          {f.status_atendimento && <span style={{ fontSize: 10, color: '#9CA3AF' }}>· {statusLabel[f.status_atendimento] || f.status_atendimento}</span>}
                        </div>
                        {texto && (
                          <div style={{ fontSize: 12, color: '#374151', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{texto}</div>
                        )}
                        {(f.nota != null || f.trator) && (
                          <div style={{ fontSize: 10.5, color: '#9CA3AF', marginTop: 3 }}>
                            {f.nota != null ? `Nota ${f.nota}` : ''}{f.nota != null && f.trator ? ' · ' : ''}{f.trator || ''}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {feedbacksCliente.length > 6 && (
                    <span style={{ fontSize: 11, color: '#9CA3AF', fontStyle: 'italic' }}>+{feedbacksCliente.length - 6} mais</span>
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* ===================== COLUNA PRINCIPAL ===================== */}
          <main style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

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
            {/* RESUMO + FILTROS */}
            {(() => {
              const classifyOS = (os: OrdemServico) => {
                const txt = (os.descricao || '').toLowerCase() + ' ' + (typeof os.servicos === 'string' ? os.servicos : JSON.stringify(os.servicos || [])).toLowerCase()
                if (/revis[aã]o|cheque.*h|check.*h|\d+\s*h\b/.test(txt)) return 'revisao'
                if (/garantia/.test(txt)) return 'garantia'
                return 'manutencao'
              }
              const extractChassis = (os: OrdemServico) => {
                const servs = typeof os.servicos === 'string' ? JSON.parse(os.servicos) : (os.servicos || [])
                for (const s of servs) { const m = (s.desc || '').match(/Chassis:\s*([^|]+)/i); if (m) return m[1].trim() }
                return ''
              }
              const extractModelo = (os: OrdemServico) => {
                const servs = typeof os.servicos === 'string' ? JSON.parse(os.servicos) : (os.servicos || [])
                for (const s of servs) { const m = (s.desc || '').match(/Modelo:\s*([^|]+)/i); if (m) return m[1].trim() }
                return ''
              }
              const maquinas = [...new Set(ordens.map(os => extractModelo(os)).filter(Boolean))]

              const ordensFiltradas = ordens.filter(os => {
                if (osColuna === 'ativas' && (os.faturada || os.cancelada)) return false
                if (osColuna === 'faturadas' && !os.faturada) return false
                if (osColuna === 'canceladas' && !os.cancelada) return false
                if (osFiltroTipo === 'revisao' && classifyOS(os) !== 'revisao') return false
                if (osFiltroTipo === 'manutencao' && classifyOS(os) !== 'manutencao') return false
                if (osFiltroTipo === 'garantia' && classifyOS(os) !== 'garantia') return false
                if (osFiltroTipo === 'com_nf' && !os.num_nf && !os.financeiro?.num_nf_servico) return false
                if (osFiltroTipo === 'sem_nf' && (os.num_nf || os.financeiro?.num_nf_servico)) return false
                if (osFiltroTipo.startsWith('maq:') && extractModelo(os) !== osFiltroTipo.slice(4)) return false
                if (osBuscaNF) {
                  const q = osBuscaNF.toLowerCase()
                  const nfs = [os.num_nf, os.financeiro?.num_nf_servico, os.financeiro?.num_nf_peca, os.num_os, os.num_pedido_cli].filter(Boolean).join(' ').toLowerCase()
                  if (!nfs.includes(q)) return false
                }
                return true
              })

              return (<>
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                { l: 'OS', v: String(ordens.length), c: '#2563EB' },
                { l: 'Ativas', v: String(totalAtivas), c: '#EA580C' },
                { l: 'Faturadas', v: String(totalFaturadas), c: '#059669' },
                { l: 'Canceladas', v: String(totalCanceladas), c: '#DC2626' },
                { l: 'Valor OS', v: formatCurrency(totalValorOS), c: '#7C3AED' },
                { l: 'Valor PV', v: formatCurrency(totalValorPV), c: '#DC2626' },
              ].map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>{c.l}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: c.c }}>{c.v}</span>
                </div>
              ))}
            </div>

            {ordens.length === 0 && pedidos.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: '#9CA3AF', fontSize: 15 }}>Nenhuma ordem de servico encontrada</div>
            ) : (
              <div>
                {/* TITULO + FILTROS */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Wrench size={18} color="#DC2626" /> Ordens de Servico ({ordensFiltradas.length})
                  </div>
                  <button onClick={() => abrirAnexar('os')}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <Plus size={14} /> Anexar OS
                  </button>
                </div>

                {/* Abas de coluna */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
                  {([
                    { id: 'todas', label: 'Todas', count: ordens.length },
                    { id: 'ativas', label: 'Ativas', count: totalAtivas },
                    { id: 'faturadas', label: 'Faturadas', count: totalFaturadas },
                    { id: 'canceladas', label: 'Canceladas', count: totalCanceladas },
                  ] as const).map(tab => (
                    <button key={tab.id} onClick={() => setOsColuna(tab.id)}
                      style={{
                        padding: '6px 14px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        background: osColuna === tab.id ? '#111827' : '#F3F4F6',
                        color: osColuna === tab.id ? '#fff' : '#6B7280',
                        transition: 'all 0.15s',
                      }}>
                      {tab.label} <span style={{ opacity: 0.7, marginLeft: 4 }}>{tab.count}</span>
                    </button>
                  ))}
                </div>

                {/* Filtros */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={osFiltroTipo}
                    onChange={e => setOsFiltroTipo(e.target.value)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      border: osFiltroTipo ? '1px solid #DC2626' : '1px solid #E5E7EB',
                      background: osFiltroTipo ? '#FEF2F2' : '#fff',
                      color: osFiltroTipo ? '#DC2626' : '#6B7280',
                      outline: 'none',
                    }}>
                    <option value="">Tipo de serviço</option>
                    <option value="revisao">Revisão</option>
                    <option value="manutencao">Manutenção</option>
                    <option value="garantia">Garantia</option>
                    <option value="com_nf">Com NF</option>
                    <option value="sem_nf">Sem NF</option>
                  </select>
                  {maquinas.length > 0 && (
                    <select
                      value={osFiltroTipo.startsWith('maq:') ? osFiltroTipo : ''}
                      onChange={e => setOsFiltroTipo(e.target.value)}
                      style={{
                        padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        border: osFiltroTipo.startsWith('maq:') ? '1px solid #DC2626' : '1px solid #E5E7EB',
                        background: osFiltroTipo.startsWith('maq:') ? '#FEF2F2' : '#fff',
                        color: osFiltroTipo.startsWith('maq:') ? '#DC2626' : '#6B7280',
                        outline: 'none',
                      }}>
                      <option value="">Máquina</option>
                      {maquinas.map(m => <option key={m} value={`maq:${m}`}>{m}</option>)}
                    </select>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: osBuscaNF ? '1px solid #DC2626' : '1px solid #E5E7EB', background: osBuscaNF ? '#FEF2F2' : '#fff' }}>
                    <Search size={13} color={osBuscaNF ? '#DC2626' : '#9CA3AF'} />
                    <input
                      type="text" placeholder="Buscar NF, OS..."
                      value={osBuscaNF} onChange={e => setOsBuscaNF(e.target.value)}
                      style={{ border: 'none', outline: 'none', background: 'none', fontSize: 12, width: 130, color: '#111827' }}
                    />
                    {osBuscaNF && <X size={12} onClick={() => setOsBuscaNF('')} style={{ cursor: 'pointer', color: '#9CA3AF' }} />}
                  </div>
                </div>

                {/* OS COMO CARDS */}
                {ordensFiltradas.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Nenhuma OS com esses filtros</div>
                ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12, marginBottom: 28 }}>
                  {ordensFiltradas.map((os, oi) => {
                    const servicos = typeof os.servicos === 'string' ? JSON.parse(os.servicos) : (os.servicos || [])
                    const solicitacao = (() => { const d = servicos.map((s: any) => s.desc || '').join('|'); const m = d.match(/Solicita[çc][ãa]o[^:]*:\s*([^|]+)/i); return m ? m[1].trim() : '' })()
                    const ref = classifyRef(os.num_pedido_cli, os.empresa)
                    const numRef = ref.tipo === 'pv' ? os.num_pedido_cli : ''
                    const remRef = ref.tipo === 'remessa' ? os.num_pedido_cli : ''
                    const ehInterno = !!os.servico_interno
                    const acc = os.cancelada ? '#DC2626' : ehInterno ? '#7C3AED' : os.faturada ? '#10B981' : '#F59E0B'
                    const statusLabel = os.cancelada ? os.status : ehInterno ? 'Fechado interno' : os.status

                    return (
                      <div key={os.num_os} className="cli-card" onClick={() => setModalOS(os)}
                        style={{
                          position: 'relative', display: 'flex', flexDirection: 'column', gap: 8,
                          padding: '13px 16px 13px 20px', border: '1px solid #E5E7EB', borderRadius: 12,
                          background: '#fff', cursor: 'pointer', transition: 'all 0.15s',
                          boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden',
                          animationDelay: `${Math.min(oi * 30, 300)}ms`,
                        }}
                        onMouseEnter={ev => { ev.currentTarget.style.borderColor = '#CBD5E1'; ev.currentTarget.style.boxShadow = '0 6px 16px rgba(16,24,40,0.09)'; ev.currentTarget.style.transform = 'translateY(-1px)' }}
                        onMouseLeave={ev => { ev.currentTarget.style.borderColor = '#E5E7EB'; ev.currentTarget.style.boxShadow = '0 1px 2px rgba(16,24,40,0.04)'; ev.currentTarget.style.transform = 'none' }}>
                        {/* barra de status na lateral */}
                        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: acc }} />

                        {/* topo: OS / PV + valor */}
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>OS {os.num_os}</span>
                            {numRef && <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>PV {numRef}</span>}
                            {remRef && <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 5, background: '#FFF7ED', color: '#EA580C', border: '1px solid #FED7AA', whiteSpace: 'nowrap' }}>{ref.label}</span>}
                          </div>
                          <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', flexShrink: 0 }}>{formatCurrency(os.valor_total || 0)}</span>
                        </div>

                        {/* descrição */}
                        <div style={{ fontSize: 12.5, color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                          {solicitacao || os.descricao || 'Sem descrição'}
                        </div>

                        {/* rodapé: status + data + pdf */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: acc, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: acc, flexShrink: 0 }} />{statusLabel}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                            {os.pdf_anexo && (
                              <a href={os.pdf_anexo} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()} title="PDF anexado"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#2563EB', textDecoration: 'none' }}>
                                <FileText size={12} /> PDF
                              </a>
                            )}
                            <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>{formatDate(os.data_previsao)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                )}

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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
                      {pvsSemOS.map((pv, pi) => (
                        <div key={pv.num_pedido} className="cli-card"
                          style={{
                            position: 'relative', display: 'flex', flexDirection: 'column', gap: 8,
                            padding: '13px 16px 13px 20px', border: '1px solid #E5E7EB', borderRadius: 12,
                            background: '#fff', boxShadow: '0 1px 2px rgba(16,24,40,0.04)', overflow: 'hidden',
                            animationDelay: `${Math.min(pi * 30, 300)}ms`,
                          }}>
                          <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: '#EA580C' }} />

                          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
                              <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', whiteSpace: 'nowrap' }}>PV {pv.num_pedido}</span>
                              {pv.numero_nf && <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 600, whiteSpace: 'nowrap' }}>NF {pv.numero_nf}</span>}
                            </div>
                            <span style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', flexShrink: 0 }}>{formatCurrency(pv.valor_total || 0)}</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#EA580C', textTransform: 'uppercase', letterSpacing: 0.3, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#EA580C', flexShrink: 0 }} />{pv.etapa}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                              <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>{formatDate(pv.data_previsao)}</span>
                              <a href={pv.pv_pdf || `/api/clientes/print?tipo=pv&cod=${pv.cod_pedido}&empresa=${encodeURIComponent(pv.empresa)}`}
                                target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title={pv.ppv_real ? 'Abrir PPV original' : 'Imprimir PV'}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid #E5E7EB', background: '#fff', textDecoration: 'none', color: '#475569' }}>
                                <Printer size={15} />
                              </a>
                              {pv.link_nf && (
                                <a href={pv.link_nf} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="Baixar NF"
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: 'none', background: '#0F172A', textDecoration: 'none', color: '#fff' }}>
                                  <Download size={15} />
                                </a>
                              )}
                              {/* NF rejeitada na SEFAZ → avisa e deixa anexar na mão */}
                              {!pv.link_nf && pv.nf_motivo && (
                                <label onClick={e => e.stopPropagation()} title={`NF não saiu${pv.nf_status ? ` (status ${pv.nf_status})` : ''}: ${pv.nf_motivo}\n\nClique para anexar a nota manualmente.`}
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, height: 30, padding: '0 10px', borderRadius: 7, border: '1px solid #FECACA', background: '#FEF2F2', color: '#B91C1C', fontSize: 12, fontWeight: 700, cursor: anexNfOS ? 'wait' : 'pointer' }}>
                                  <AlertTriangle size={14} /> {anexNfOS ? '...' : 'NF rejeitada — anexar'}
                                  <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={anexNfOS}
                                    onChange={e => { e.stopPropagation(); const f = e.target.files?.[0]; if (f) anexarNFpecaNoPV(pv, f, { gerarCard: true }) }} />
                                </label>
                              )}
                              {pv.pdf_anexo && (
                                <a href={pv.pdf_anexo} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title="PDF anexado"
                                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid #FED7AA', background: '#FFF7ED', textDecoration: 'none', color: '#EA580C' }}>
                                  <FileText size={15} />
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
            )})()}
          </>
        )}
          </main>
        </div>

        {/* ========== MODAL: MARCAR NF SUBSTITUÍDA ========== */}
        {subNF && (
          <div onClick={e => { if (e.target === e.currentTarget && !subSalvando) setSubNF(null) }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div style={{ background: '#fff', borderRadius: 16, width: 440, maxWidth: '95vw', padding: 26 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h2 style={{ fontSize: 19, fontWeight: 800, color: '#111827', margin: 0 }}>Marcar NF como substituída</h2>
                <button onClick={() => setSubNF(null)} style={{ background: '#F3F4F6', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} color="#6B7280" /></button>
              </div>
              <p style={{ fontSize: 13, color: '#6B7280', margin: '0 0 18px' }}>
                OS {subNF.osNum}. Registra a troca (nº antigo → novo) no histórico. O cancelamento/emissão da nota em si é feito no Omie.
              </p>

              <div style={{ marginBottom: 14 }}>
                <label style={lblModal}>QUAL NOTA</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([['servico', 'Serviço'], ['peca', 'Peça']] as const).map(([v, lbl]) => (
                    <button key={v} onClick={() => setSubNF({ ...subNF, nf_tipo: v })}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        border: subNF.nf_tipo === v ? '2px solid #2563EB' : '1px solid #E5E7EB',
                        background: subNF.nf_tipo === v ? '#EFF6FF' : '#fff', color: subNF.nf_tipo === v ? '#1D4ED8' : '#6B7280' }}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 14 }}>
                <label style={lblModal}>Nº DA NF ANTIGA (cancelada)</label>
                <input value={subNF.num_antigo} onChange={e => setSubNF({ ...subNF, num_antigo: e.target.value })} placeholder="Ex: 0002067" style={inpModal} />
              </div>

              <div style={{ marginBottom: 20 }}>
                <label style={lblModal}>Nº DA NF NOVA (substituta) *</label>
                <input value={subNF.num_novo} onChange={e => setSubNF({ ...subNF, num_novo: e.target.value })} autoFocus placeholder="Ex: 0002071" onKeyDown={e => { if (e.key === 'Enter' && subNF.num_novo.trim()) salvarSubstituicao() }} style={inpModal} />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setSubNF(null)} disabled={subSalvando}
                  style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={salvarSubstituicao} disabled={subSalvando || !subNF.num_novo.trim()}
                  style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: subNF.num_novo.trim() ? '#2563EB' : '#9CA3AF', color: '#fff', fontSize: 14, fontWeight: 700, cursor: subSalvando ? 'wait' : 'pointer' }}>
                  {subSalvando ? 'Salvando...' : 'Registrar substituição'}
                </button>
              </div>
            </div>
          </div>
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
          const ref = classifyRef(os.num_pedido_cli, os.empresa)
          const pvs = (ref.tipo === 'pv' || ref.tipo === 'remessa') ? findAllPVs(os.num_pedido_cli, os.empresa) : []

          return (
            <div className="cli-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => setModalOS(null)}>
              <div className="cli-modal" style={{ background: '#fff', borderRadius: 16, width: '92%', maxWidth: 860, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
                onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ padding: '24px 28px', background: 'linear-gradient(135deg, #991b1b 0%, #dc2626 100%)', borderRadius: '16px 16px 0 0', color: '#fff', position: 'relative' }}>
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
                      {os.servico_interno && !os.cancelada ? 'Fechado interno' : os.status}
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
                  {/* Info grid — Valor Total = serviço (OS) + peças (PVs vinculados),
                      que é o mesmo total que vai pro card do financeiro. */}
                  {(() => {
                    const vServico = os.valor_total || 0
                    const vPecas = pvs.reduce((s: number, p: PedidoVenda) => s + (p.valor_total || 0), 0)
                    const vTotal = vServico + vPecas
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 24 }}>
                        {[
                          {
                            l: 'Valor Total', v: formatCurrency(vTotal), bg: '#F3F4F6', c: '#111827', b: '#E5E7EB',
                            sub: vPecas > 0 ? `Serviço ${formatCurrency(vServico)} + Peças ${formatCurrency(vPecas)}` : null,
                          },
                          { l: 'Data Previsao', v: formatDate(os.data_previsao), bg: '#F9FAFB', c: '#374151', b: '#E5E7EB', sub: null },
                          { l: 'Data Inclusao', v: formatDate(os.data_inclusao), bg: '#F9FAFB', c: '#374151', b: '#E5E7EB', sub: null },
                          { l: 'Faturamento', v: formatDate(os.data_faturamento), bg: os.faturada ? '#ECFDF5' : '#F9FAFB', c: os.faturada ? '#047857' : '#9CA3AF', b: os.faturada ? '#A7F3D0' : '#E5E7EB', sub: null },
                        ].map((c, i) => (
                          <div key={i} style={{ padding: '14px 16px', borderRadius: 10, background: c.bg, border: `1px solid ${c.b}` }}>
                            <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{c.l}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: c.c }}>{c.v}</div>
                            {c.sub && <div style={{ fontSize: 11, color: '#6B7280', marginTop: 3, fontWeight: 500 }}>{c.sub}</div>}
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {/* Info adicional */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
                    {[
                      { l: 'Vendedor', v: os.vendedor || '-' },
                      { l: 'Cidade', v: os.cidade || cli.cidade || '-' },
                      { l: 'NF', v: os.num_nf || os.financeiro?.num_nf_servico || '-' },
                    ].map((f, i) => (
                      <div key={i} style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#F9FAFB' }}>
                        <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{f.l}</div>
                        <div style={{ fontSize: 14, color: '#111827', fontWeight: 500 }}>{f.v}</div>
                      </div>
                    ))}
                  </div>

                  {/* Selo: NF substituída */}
                  {Array.isArray(os.nf_substituicoes) && os.nf_substituicoes.length > 0 && (
                    <div style={{ marginBottom: 24, padding: '12px 16px', borderRadius: 10, background: '#FEF3C7', border: '1px solid #FCD34D' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 800, color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                        <RefreshCw size={14} /> NF substituída
                      </div>
                      {os.nf_substituicoes.map((s, i) => (
                        <div key={i} style={{ fontSize: 13, color: '#92400E', lineHeight: 1.5 }}>
                          NF de {s.nf_tipo === 'peca' ? 'peça' : 'serviço'}: <b>{s.num_antigo || '—'}</b> → <b>{s.num_novo}</b>
                          <span style={{ color: '#B45309' }}> · {s.por || '—'}{s.em ? ` · ${new Date(s.em).toLocaleDateString('pt-BR')}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Solicitacao */}
                  {solicitacao && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Solicitacao</div>
                      <div style={{ padding: '14px 18px', borderRadius: 10, background: '#F9FAFB', border: '1px solid #E5E7EB', fontSize: 14, color: '#1F2937', lineHeight: 1.6 }}>
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
                              {(s.qtd ?? s.quantidade) != null && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>Qtd: {s.qtd ?? s.quantidade}</div>}
                            </div>
                            {(s.valor || s.valor_unitario) && (
                              <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', flexShrink: 0, marginLeft: 16, textAlign: 'right' }}>
                                {formatCurrency(s.valor || s.valor_unitario || 0)}
                                <div style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500 }}>un.</div>
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

                  {/* ── Ações, agrupadas por assunto ── */}
                  {(() => {
                    const LBL = { fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase' as const, letterSpacing: 0.6, marginBottom: 8 }
                    const ROW = { display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }
                    const BASE = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 9, fontSize: 13.5, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }
                    const GHOST = { ...BASE, border: '1px solid #E5E7EB', background: '#fff', color: '#374151' }
                    const DARK = { ...BASE, border: 'none', background: '#111827', color: '#fff' }
                    const WARN = { ...BASE, border: '1px solid #F59E0B', background: '#FFFBEB', color: '#B45309', fontWeight: 700 }
                    const GREEN = { ...BASE, border: 'none', background: '#059669', color: '#fff' }
                    const MUTED = { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' as const }
                    const nfServ = os.link_nf || os.financeiro?.nf_servico
                    const numNfServ = os.num_nf || os.financeiro?.num_nf_servico
                    const boletos = (os.financeiro?.boleto || '').split(',').map(s => s.trim()).filter(Boolean)
                    return (
                      <div style={{ paddingTop: 16, borderTop: '1px solid #F3F4F6', display: 'flex', flexDirection: 'column', gap: 18 }}>

                        {/* DOCUMENTOS */}
                        <div>
                          <div style={LBL}>Documentos</div>
                          <div style={ROW}>
                            <a href={os.pos_pdf || `/api/clientes/print?tipo=os&cod=${os.cod_os}&empresa=${encodeURIComponent(os.empresa)}`}
                              target="_blank" rel="noopener noreferrer" title="Abrir a Ordem de Serviço" style={GHOST}>
                              <Printer size={15} /> {os.pos_real ? 'Abrir OS (POS)' : 'Imprimir OS'}
                            </a>
                            {pvs.map(pv => (
                              <a key={pv.num_pedido} href={pv.pv_pdf || `/api/clientes/print?tipo=pv&cod=${pv.cod_pedido}&empresa=${encodeURIComponent(pv.empresa)}`}
                                target="_blank" rel="noopener noreferrer" title={`Abrir o pedido de peças ${pv.num_pedido}`} style={GHOST}>
                                <Printer size={15} /> {pv.ppv_real ? 'Abrir PPV' : 'Imprimir PV'} {pv.num_pedido}
                              </a>
                            ))}
                          </div>
                        </div>

                        {/* NOTA FISCAL DE SERVIÇO */}
                        <div>
                          <div style={LBL}>Nota Fiscal de Serviço{numNfServ ? ` — nº ${numNfServ}` : ''}</div>
                          <div style={ROW}>
                            {nfServ ? (
                              <>
                                <a href={nfServ} target="_blank" rel="noopener noreferrer" title="Baixar o PDF da nota" style={DARK}>
                                  <Download size={15} /> Baixar a nota
                                </a>
                                {os.link_nf && (
                                  <label title="Trocar o PDF que está anexado (envia outro arquivo no lugar)" style={{ ...GHOST, cursor: anexNfOS ? 'wait' : 'pointer' }}>
                                    <Upload size={15} /> {anexNfOS ? 'Enviando...' : 'Trocar o PDF'}
                                    <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={anexNfOS}
                                      onChange={e => { const f = e.target.files?.[0]; if (f) anexarNFservicoNaOS(os, f, { gerarCard: false, substituir: true }) }} />
                                  </label>
                                )}
                              </>
                            ) : os.faturada && !os.cancelada ? (
                              <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6 }}>
                                <label title="Enviar o PDF da NFS-e (o Omie não fornece essa nota em PDF)" style={{ ...WARN, cursor: anexNfOS ? 'wait' : 'pointer' }}>
                                  <Upload size={15} /> {anexNfOS ? 'Enviando...' : 'Anexar a nota'}
                                  <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={anexNfOS}
                                    onChange={e => { const f = e.target.files?.[0]; if (f) anexarNFservicoNaOS(os, f, { gerarCard: gerarCardFin }) }} />
                                </label>
                                {os.financeiro ? (
                                  <span title={`Card #${os.financeiro.id || ''} já criado no financeiro`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#047857', fontWeight: 600, paddingLeft: 2 }}>
                                    <input type="checkbox" checked disabled style={{ cursor: 'default', accentColor: '#047857' }} />
                                    Já enviado ao financeiro{os.financeiro.id ? ` (#${os.financeiro.id})` : ''}
                                  </span>
                                ) : (
                                  <label title="Se marcado, ao anexar a nota já cria o card no financeiro" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6B7280', cursor: 'pointer', userSelect: 'none', paddingLeft: 2 }}>
                                    <input type="checkbox" checked={gerarCardFin} onChange={e => setGerarCardFin(e.target.checked)} style={{ cursor: 'pointer', accentColor: '#B45309' }} />
                                    Enviar para o Financeiro
                                  </label>
                                )}
                              </div>
                            ) : (
                              <span style={MUTED}>Ainda sem nota (a OS não foi faturada).</span>
                            )}
                            <button onClick={() => setSubNF({ osNum: os.num_os, empresa: os.empresa, nf_tipo: 'servico', num_antigo: numNfServ || '', num_novo: '' })}
                              title="A nota foi cancelada e emitida outra? Registre aqui o nº antigo → nº novo (fica no histórico)."
                              style={GHOST}>
                              <RefreshCw size={15} /> Registrar troca de nº da nota
                            </button>
                          </div>
                        </div>

                        {/* NOTA FISCAL DE PEÇA (por PV) */}
                        {pvs.length > 0 && (
                          <div>
                            <div style={LBL}>Nota Fiscal de Peça</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {pvs.map(pv => {
                                const nfPeca = pv.link_nf || os.financeiro?.nf_peca
                                return (
                                  <div key={pv.num_pedido} style={ROW}>
                                    {nfPeca ? (
                                      <>
                                        <a href={nfPeca} target="_blank" rel="noopener noreferrer" title={`Baixar a NF de peça do PV ${pv.num_pedido}`} style={DARK}>
                                          <Download size={15} /> Baixar a nota do PV {pv.num_pedido}{pv.numero_nf ? ` (nº ${pv.numero_nf})` : ''}
                                        </a>
                                        {pv.link_nf && (
                                          <label title="Trocar o PDF anexado" style={{ ...GHOST, cursor: anexNfOS ? 'wait' : 'pointer' }}>
                                            <Upload size={15} /> {anexNfOS ? 'Enviando...' : 'Trocar o PDF'}
                                            <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={anexNfOS}
                                              onChange={e => { const f = e.target.files?.[0]; if (f) anexarNFpecaNoPV(pv, f, { gerarCard: false, substituir: true }) }} />
                                          </label>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        {pv.nf_motivo && (
                                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 13px', borderRadius: 9, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, fontWeight: 600, maxWidth: 560, lineHeight: 1.35 }}>
                                            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                                            <span>A nota do PV {pv.num_pedido} <b>não foi autorizada</b>{pv.nf_status ? ` (status ${pv.nf_status})` : ''}: {pv.nf_motivo}</span>
                                          </span>
                                        )}
                                        <label title={`Enviar o PDF da NF de peça do PV ${pv.num_pedido}. Ao anexar, o card do financeiro é acionado.`}
                                          style={{ ...(pv.nf_motivo ? { ...BASE, border: 'none', background: '#B91C1C', color: '#fff', fontWeight: 700 } : WARN), cursor: anexNfOS ? 'wait' : 'pointer' }}>
                                          <Upload size={15} /> {anexNfOS ? 'Enviando...' : `Anexar a nota do PV ${pv.num_pedido}`}
                                          <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={anexNfOS}
                                            onChange={e => { const f = e.target.files?.[0]; if (f) anexarNFpecaNoPV(pv, f, { gerarCard: true }) }} />
                                        </label>
                                      </>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* FINANCEIRO */}
                        {boletos.length > 0 && (
                          <div>
                            <div style={LBL}>Financeiro</div>
                            <div style={ROW}>
                              {boletos.map((b: string, bi: number) => (
                                <a key={bi} href={b} target="_blank" rel="noopener noreferrer" title="Baixar o boleto" style={GREEN}>
                                  <Download size={15} /> Boleto{boletos.length > 1 ? ` ${bi + 1}` : ''}
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* STATUS PRO FINANCEIRO — o card só nasce com as DUAS notas */}
                        {(() => {
                          const temServ = !!nfServ
                          const pvDaOS = os.pv_manual || os.num_pedido_cli || ''
                          const pvsComNF = pvs.filter(p => p.link_nf || os.financeiro?.nf_peca)
                          const temPeca = pvs.length === 0 ? true : pvsComNF.length === pvs.length
                          const completo = temServ && temPeca
                          const jaNoFinanceiro = !!os.financeiro
                          const problemas: string[] = []
                          if (!temServ) problemas.push('• A NF de Serviço não está na pasta (não saiu no Omie e não foi anexada).')
                          for (const p of pvs.filter(x => !x.link_nf && !os.financeiro?.nf_peca)) {
                            problemas.push(p.nf_motivo
                              ? `• A NF de Peça do PV ${p.num_pedido} foi RECUSADA${p.nf_status ? ` (status ${p.nf_status})` : ''}: ${p.nf_motivo}`
                              : `• A NF de Peça do PV ${p.num_pedido} não está na pasta.`)
                          }
                          const Item = ({ ok, txt }: { ok: boolean; txt: string }) => (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 600, color: ok ? '#047857' : '#B91C1C' }}>
                              <span style={{ width: 18, height: 18, borderRadius: 5, border: `2px solid ${ok ? '#047857' : '#FCA5A5'}`, background: ok ? '#047857' : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                {ok && <CheckCircle size={12} color="#fff" />}
                              </span>
                              {txt}
                            </span>
                          )
                          return (
                            <div style={{ paddingTop: 4 }}>
                              <div style={LBL}>Status para o financeiro</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 14px', borderRadius: 10, background: jaNoFinanceiro ? '#ECFDF5' : completo ? '#F0FDF4' : '#FFFBEB', border: `1px solid ${jaNoFinanceiro ? '#A7F3D0' : completo ? '#BBF7D0' : '#FDE68A'}` }}>
                                <Item ok={temServ} txt={temServ ? 'NF de Serviço anexada' : 'NF de Serviço FALTANDO — anexe acima'} />
                                {pvs.length > 0 && (
                                  <Item ok={temPeca} txt={temPeca
                                    ? `NF de Peça anexada${pvs.length > 1 ? ` (${pvs.length} pedidos)` : ` (PV ${pvs[0].num_pedido})`}`
                                    : `NF de Peça FALTANDO (PV ${pvs.filter(p => !p.link_nf).map(p => p.num_pedido).join(', ')}) — anexe acima`} />
                                )}

                                {/* CARD JÁ EXISTE NO FINANCEIRO — mostrar detalhes */}
                                {jaNoFinanceiro && (
                                  <div style={{ marginTop: 4, padding: '10px 12px', borderRadius: 8, background: '#D1FAE5', border: '1px solid #6EE7B7' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#047857', marginBottom: 6 }}>
                                      <CheckCircle size={14} /> Card no financeiro
                                      {os.financeiro?.id && (
                                        <span style={{ fontSize: 11, fontWeight: 600, color: '#059669', background: '#ECFDF5', padding: '2px 8px', borderRadius: 6 }}>
                                          #{os.financeiro.id}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12, color: '#065F46' }}>
                                      {os.financeiro?.status && (
                                        <div><span style={{ fontWeight: 600 }}>Status:</span> {os.financeiro.status}</div>
                                      )}
                                      {os.financeiro?.valor && (
                                        <div><span style={{ fontWeight: 600 }}>Valor:</span> R$ {Number(os.financeiro.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                                      )}
                                      {os.financeiro?.categoria && (
                                        <div><span style={{ fontWeight: 600 }}>Categoria:</span> {os.financeiro.categoria}</div>
                                      )}
                                      {os.financeiro?.num_nf_servico && (
                                        <div><span style={{ fontWeight: 600 }}>NF Serv.:</span> {os.financeiro.num_nf_servico}</div>
                                      )}
                                      {os.financeiro?.num_nf_peca && (
                                        <div><span style={{ fontWeight: 600 }}>NF Peça:</span> {os.financeiro.num_nf_peca}</div>
                                      )}
                                      {os.financeiro?.criado_em && (
                                        <div><span style={{ fontWeight: 600 }}>Criado:</span> {new Date(os.financeiro.criado_em).toLocaleDateString('pt-BR')}</div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* NÃO ESTÁ NO FINANCEIRO */}
                                {!jaNoFinanceiro && (
                                  <div style={{ fontSize: 12.5, marginTop: 3, color: completo ? '#047857' : '#92400E', fontWeight: 600 }}>
                                    {completo
                                      ? 'As notas estão prontas — use o botão abaixo para enviar, ou aguarde o sync automático.'
                                      : 'Enquanto faltar nota, NÃO vai pro financeiro (é de propósito, pra não gerar card errado).'}
                                  </div>
                                )}
                              </div>

                              {/* BOTÃO ENVIAR PARA O FINANCEIRO — quando completo mas não foi ainda */}
                              {!jaNoFinanceiro && completo && (
                                <button onClick={() => criarCardManual(os, '')} disabled={forcandoCard}
                                  title="Envia esta OS para o financeiro agora. Se já foi enviada, não duplica."
                                  style={{ ...BASE, marginTop: 10, border: 'none', background: '#047857', color: '#fff', fontWeight: 700, cursor: forcandoCard ? 'wait' : 'pointer' }}>
                                  <Send size={15} /> {forcandoCard ? 'Enviando...' : 'Enviar para o Financeiro'}
                                </button>
                              )}

                              {/* Caixa do ERRO — aparece quando tem problemas e não foi pro financeiro */}
                              {!jaNoFinanceiro && problemas.length > 0 && (
                                <div style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, background: '#FEF2F2', border: '1px solid #FECACA' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#B91C1C', fontWeight: 800, fontSize: 13, marginBottom: 6 }}>
                                    <AlertTriangle size={15} /> Problema com a nota — o card NÃO foi pro financeiro
                                  </div>
                                  <div style={{ fontSize: 13, color: '#7F1D1D', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{problemas.join('\n')}</div>
                                  <div style={{ fontSize: 12.5, color: '#7F1D1D', marginTop: 8, lineHeight: 1.5 }}>
                                    <b>O que fazer:</b> anexe a nota que falta acima, ou aponte o pedido de venda certo.
                                    Se a nota foi emitida por fora e você quer seguir mesmo assim, crie o card <b>à mão</b> no botão abaixo.
                                  </div>
                                  <button onClick={() => criarCardManual(os, problemas.join('\n'))} disabled={forcandoCard}
                                    title="Cria o card no financeiro à mão, mesmo com a nota pendente. O automático nunca faz isso."
                                    style={{ ...BASE, marginTop: 10, border: 'none', background: '#B91C1C', color: '#fff', fontWeight: 700, cursor: forcandoCard ? 'wait' : 'pointer' }}>
                                    <Package size={15} /> {forcandoCard ? 'Criando...' : 'Criar o card no financeiro à mão'}
                                  </button>
                                </div>
                              )}

                              <div style={{ ...ROW, marginTop: 10 }}>
                                <button onClick={() => trocarPVdaOS(os, pvDaOS)} disabled={forcandoCard}
                                  title="O Omie vinculou o pedido errado (ou nenhum)? Aponte aqui o nº do Pedido de Venda certo — o sistema vai buscar a NF de peça nele. Vazio = volta ao automático."
                                  style={{ ...GHOST, cursor: forcandoCard ? 'wait' : 'pointer' }}>
                                  <Hash size={15} /> {forcandoCard ? 'Buscando...' : 'Trocar o nº do pedido de venda'}
                                  {pvDaOS && (
                                    <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 700, color: os.pv_manual ? '#B45309' : '#9CA3AF' }}>
                                      ({pvDaOS}{os.pv_manual ? ' · manual' : ''})
                                    </span>
                                  )}
                                </button>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          )
        })()}

        {/* MODAL PROJETO */}
        {modalProjeto && (
          <div className="cli-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setModalProjeto(null)}>
            <div className="cli-modal" style={{ background: '#F9FAFB', borderRadius: 16, width: '95%', maxWidth: 1100, maxHeight: '92vh', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}
              onClick={ev => ev.stopPropagation()}>

              {/* Header gradient */}
              <div style={{ padding: '20px 28px', background: 'linear-gradient(135deg, #991b1b 0%, #dc2626 100%)', color: '#fff', position: 'relative', flexShrink: 0 }}>
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
                // PVs vinculados a OS (via num_pedido_cli)
                const pvsVinculados = new Set<string>()
                for (const os of osProj) {
                  const { num } = parseRef(os.num_pedido_cli, os.empresa)
                  if (num) pvsVinculados.add(num)
                }
                // Peças avulsas = PVs que NÃO estão vinculados a nenhuma OS
                const pecasAgrupadas = (() => {
                  const m = new Map<string, { num_pv: string; itens: any[]; valor: number; qtd: number; cliente: string; data: string }>()
                  for (const p of pecasList) {
                    if (pvsVinculados.has(String(p.num_pv))) continue
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
                  { id: 'pecas', label: 'Peças Avulsas', icon: Package, count: pecasAgrupadas.reduce((s, g) => s + g.itens.length, 0) },
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {servicosAgrupados.map((g: any, gi: number) => {
                                const os = osPorNum.get(String(g.num_os))
                                const { num: pvRefNum } = parseRef(os?.num_pedido_cli || '', os?.empresa)
                                const temPV = !!pvRefNum
                                const pecasDoServ = temPV ? pecasList.filter((p: any) => String(p.num_pv) === pvRefNum) : []
                                const valorPecas = pecasDoServ.reduce((s: number, p: any) => s + (p.valor_total || 0), 0)
                                return (
                                  <div key={gi} onClick={() => setServicoModalOS(String(g.num_os))}
                                    style={{ border: '1px solid #E5E7EB', borderRadius: 10, background: '#fff', cursor: 'pointer', overflow: 'hidden', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#BFDBFE'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(37,99,235,0.08)' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', gap: 12 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                        <Wrench size={15} color="#2563EB" style={{ flexShrink: 0 }} />
                                        <span style={{ fontWeight: 700, color: '#2563EB', fontSize: 13, flexShrink: 0 }}>OS {g.num_os}</span>
                                        {temPV && <span style={{ fontSize: 11, color: '#EA580C', fontWeight: 600, flexShrink: 0 }}>+ PV {pvRefNum}</span>}
                                        <span style={{ color: '#6B7280', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.cliente || '-'}</span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                                        <span style={{ fontSize: 12, color: '#9CA3AF' }}>{formatDate(g.data)}</span>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{formatCurrency((g.valor || 0) + valorPecas)}</span>
                                      </div>
                                    </div>
                                    {/* Detalhes: serviços + peças */}
                                    <div style={{ padding: '0 16px 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: '#EFF6FF', color: '#2563EB', fontWeight: 600 }}>
                                        {g.linhas.length} serviço{g.linhas.length !== 1 ? 's' : ''} · {formatCurrency(g.valor || 0)}
                                      </span>
                                      {pecasDoServ.length > 0 && (
                                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: '#FFF7ED', color: '#EA580C', fontWeight: 600 }}>
                                          {pecasDoServ.length} peça{pecasDoServ.length !== 1 ? 's' : ''} · {formatCurrency(valorPecas)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ─── PECAS (avulsas — não vinculadas a OS) ─── */}
                      {projetoTab === 'pecas' && (
                        <div>
                          {pecasAgrupadas.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>
                              Nenhuma peça avulsa. Peças vinculadas a OS aparecem na aba Serviços.
                            </div>
                          ) : (
                            <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: isMobile ? 'auto' : 'hidden', background: '#fff' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 140px 80px 120px', minWidth: isMobile ? 560 : undefined, padding: '10px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>
                                <span>Pedido</span><span>Itens</span><span>Cliente</span><span style={{ textAlign: 'center' }}>Qtd</span><span style={{ textAlign: 'right' }}>Total</span>
                              </div>
                              {pecasAgrupadas.map((g: any, gi: number) => (
                                <div key={gi} onClick={() => setPedidoModalNum(String(g.num_pv))} title="Ver detalhes do pedido"
                                  style={{ display: 'grid', gridTemplateColumns: '110px 1fr 140px 80px 120px', minWidth: isMobile ? 560 : undefined, padding: '12px 16px', borderBottom: `1px solid ${ln2}`, fontSize: 13, color: '#374151', alignItems: 'center', cursor: 'pointer' }}
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
                                  <div key={ri} onClick={() => setReqModal(r)}
                                    style={{ padding: '14px 18px', border: `1px solid ${r.match_chassis ? '#BFDBFE' : '#E5E7EB'}`, borderRadius: 10, background: '#fff', cursor: 'pointer', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = r.match_chassis ? '#BFDBFE' : '#E5E7EB'; e.currentTarget.style.boxShadow = 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>#{r.id}</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: sc.bg, color: sc.c, border: `1px solid ${sc.b}` }}>{r.status}</span>
                                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 5, background: '#F3F4F6', color: '#6B7280' }}>{r.tipo}</span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {r.valor_despeza && parseFloat(r.valor_despeza) > 0 && <span style={{ fontSize: 13, color: '#059669', fontWeight: 700 }}>{formatCurrency(parseFloat(r.valor_despeza))}</span>}
                                        <ChevronRight size={15} color="#C4C9D2" />
                                      </div>
                                    </div>
                                    <div style={{ fontSize: 13, color: '#374151' }}>{r.titulo || '-'}</div>
                                    <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
                                      {r.solicitante || '-'} · {r.created_at ? new Date(r.created_at).toLocaleDateString('pt-BR') : '-'}
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
                                  <div key={ti} onClick={() => setRevModal(t)}
                                    style={{ border: '1px solid #E5E7EB', borderRadius: 12, background: '#fff', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.boxShadow = 'none' }}>
                                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{t.Modelo || '-'}</div>
                                        <div style={{ fontSize: 13, color: '#6B7280', marginTop: 2 }}>Chassis: <span style={{ fontFamily: 'monospace' }}>{t.Chassis || '-'}</span> — Cliente: {t.Cliente || '-'}</div>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ textAlign: 'right' }}>
                                          <div style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>{revisoesDone.length}/{REVISOES_HORAS.length} revisoes</div>
                                          {proximaRevisao && <div style={{ fontSize: 11, color: '#EA580C' }}>Proxima: {proximaRevisao}</div>}
                                        </div>
                                        <ChevronRight size={16} color="#C4C9D2" />
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
                      const refPed = parseRef(os?.num_pedido_cli || '', os?.empresa)
                      const pedido = String(os?.num_pedido_cli || '').trim()
                      const pedidoEhPV = refPed.tipo === 'pv'
                      const status = os?.status || grupo?.status || ''
                      return (
                        <div onClick={e => { if (e.target === e.currentTarget) setServicoModalOS(null) }}
                          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)', zIndex: 10002, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                          <div style={{ background: '#fff', borderRadius: 18, width: 720, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
                            {/* Header */}
                            <div style={{ background: 'linear-gradient(135deg, #991b1b, #dc2626)', padding: '22px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
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
                                    <button onClick={() => setPedidoModalNum(refPed.num)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg, #EA580C, #C2410C)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
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
                              <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: isMobile ? 'auto' : 'hidden' }}>
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
                                  <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: isMobile ? 'auto' : 'hidden' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 50px 100px 110px', minWidth: isMobile ? 460 : undefined, padding: '11px 16px', background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.3 }}>
                                      <span>Codigo</span><span>Descricao</span><span style={{ textAlign: 'center' }}>Qtd</span><span style={{ textAlign: 'right' }}>Unit.</span><span style={{ textAlign: 'right' }}>Total</span>
                                    </div>
                                    {itens.length === 0 ? (
                                      <div style={{ padding: '14px', fontSize: 13, color: '#9CA3AF' }}>Sem itens cadastrados neste pedido.</div>
                                    ) : (
                                      <>
                                        {itens.map((p: any, pi: number) => (
                                          <div key={pi} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 50px 100px 110px', minWidth: isMobile ? 460 : undefined, padding: '12px 16px', borderBottom: '1px solid #F3F4F6', fontSize: 13, color: '#374151', alignItems: 'start', background: pi % 2 ? '#FAFBFC' : '#fff' }}>
                                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#6B7280' }}>{p.codigo || '-'}</span>
                                            <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{p.desc || '-'}</span>
                                            <span style={{ fontSize: 12.5, textAlign: 'center' }}>{p.quantidade}</span>
                                            <span style={{ textAlign: 'right', fontSize: 12.5, color: '#6B7280' }}>{formatCurrency(p.valor_unitario || 0)}</span>
                                            <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(p.valor_total || 0)}</span>
                                          </div>
                                        ))}
                                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 50px 100px 110px', minWidth: isMobile ? 460 : undefined, padding: '12px 16px', fontSize: 13, background: '#FFFBF5', alignItems: 'center' }}>
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

        {/* ===== Modal Requisição Detalhe ===== */}
        {reqModal && (
          <div className="cli-overlay" onClick={e => { if (e.target === e.currentTarget) setReqModal(null) }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="cli-modal" style={{ background: '#fff', borderRadius: 16, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
              <div style={{ background: 'linear-gradient(135deg, #991b1b 0%, #dc2626 100%)', padding: '22px 28px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>Requisição #{reqModal.id}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>{reqModal.titulo || '-'}</div>
                </div>
                <button onClick={() => setReqModal(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={16} color="#fff" />
                </button>
              </div>
              <div style={{ padding: '24px 28px' }}>
                {(() => {
                  const statusColor: Record<string, { bg: string; c: string; b: string }> = {
                    pedido: { bg: '#FFF7ED', c: '#EA580C', b: '#FED7AA' },
                    completa: { bg: '#ECFDF5', c: '#059669', b: '#A7F3D0' },
                    aguardando: { bg: '#EFF6FF', c: '#2563EB', b: '#BFDBFE' },
                    financeiro: { bg: '#F5F3FF', c: '#7C3AED', b: '#C4B5FD' },
                    lixeira: { bg: '#FEF2F2', c: '#DC2626', b: '#FECACA' },
                  }
                  const sc = statusColor[reqModal.status] || statusColor.pedido
                  const fields = [
                    { l: 'Status', v: reqModal.status, badge: true, sc },
                    { l: 'Tipo', v: reqModal.tipo },
                    { l: 'Solicitante', v: reqModal.solicitante },
                    { l: 'Fornecedor', v: reqModal.fornecedor },
                    { l: 'Chassis/Modelo', v: reqModal.Chassis_Modelo, mono: true },
                    { l: 'Projeto', v: reqModal.projeto_nome ? `${reqModal.projeto_nome} (${reqModal.projeto_codigo || ''})` : null },
                    { l: 'Nota Fiscal', v: reqModal.numero_nota },
                    { l: 'Valor', v: reqModal.valor_despeza && parseFloat(reqModal.valor_despeza) > 0 ? formatCurrency(parseFloat(reqModal.valor_despeza)) : null, green: true },
                    { l: 'Data', v: reqModal.created_at ? new Date(reqModal.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : null },
                  ]
                  return (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
                        {fields.filter(f => f.v).map((f, i) => (
                          <div key={i}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 4 }}>{f.l}</div>
                            {f.badge ? (
                              <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: f.sc!.bg, color: f.sc!.c, border: `1px solid ${f.sc!.b}` }}>{f.v}</span>
                            ) : (
                              <div style={{ fontSize: 14, fontWeight: 600, color: f.green ? '#059669' : '#111827', fontFamily: f.mono ? 'monospace' : undefined }}>{f.v}</div>
                            )}
                          </div>
                        ))}
                      </div>
                      {reqModal.obs && (
                        <div style={{ marginTop: 20, padding: 16, background: '#F9FAFB', borderRadius: 10, border: '1px solid #F3F4F6' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', marginBottom: 6 }}>Observações</div>
                          <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{reqModal.obs}</div>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          </div>
        )}

        {/* ===== Modal Revisão Detalhe ===== */}
        {revModal && (
          <div className="cli-overlay" onClick={e => { if (e.target === e.currentTarget) setRevModal(null) }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
            <div className="cli-modal" style={{ background: '#fff', borderRadius: 16, width: 560, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
              <div style={{ background: 'linear-gradient(135deg, #991b1b 0%, #dc2626 100%)', padding: '22px 28px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>{revModal.Modelo || 'Trator'}</div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                    Chassis: {revModal.Chassis || '-'} — {revModal.Cliente || '-'}
                  </div>
                </div>
                <button onClick={() => setRevModal(null)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={16} color="#fff" />
                </button>
              </div>
              <div style={{ padding: '24px 28px' }}>
                {(revModal.Entrega || revModal["Inspecao Data"]) && (
                  <div style={{ display: 'flex', gap: 20, marginBottom: 20, flexWrap: 'wrap' }}>
                    {revModal.Entrega && (
                      <div style={{ padding: '10px 16px', background: '#EFF6FF', borderRadius: 10, border: '1px solid #BFDBFE' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#2563EB', marginBottom: 2 }}>ENTREGA</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E40AF' }}>{revModal.Entrega}</div>
                      </div>
                    )}
                    {revModal["Inspecao Data"] && (
                      <div style={{ padding: '10px 16px', background: '#FFF7ED', borderRadius: 10, border: '1px solid #FED7AA' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#EA580C', marginBottom: 2 }}>INSPEÇÃO</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#C2410C' }}>{revModal["Inspecao Data"]}{revModal["Inspecao Horimetro"] ? ` — ${revModal["Inspecao Horimetro"]}h` : ''}</div>
                      </div>
                    )}
                  </div>
                )}
                <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 12 }}>Histórico de Revisões</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {REVISOES_HORAS.map(h => {
                    const data = revModal[`${h} Data`]
                    const horim = revModal[`${h} Horimetro`]
                    const done = !!data
                    return (
                      <div key={h} style={{
                        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 10,
                        background: done ? '#ECFDF5' : '#F9FAFB', border: `1px solid ${done ? '#A7F3D0' : '#E5E7EB'}`,
                      }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: done ? '#059669' : '#E5E7EB', color: done ? '#fff' : '#9CA3AF', fontSize: 11, fontWeight: 800,
                        }}>
                          {done ? <CheckCircle size={18} /> : h.replace('h', '')}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: done ? '#059669' : '#9CA3AF' }}>{h}</div>
                          {done ? (
                            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                              Realizada em <strong style={{ color: '#374151' }}>{data}</strong>
                              {horim ? <> — Horímetro: <strong style={{ color: '#374151' }}>{horim}h</strong></> : ''}
                            </div>
                          ) : (
                            <div style={{ fontSize: 12, color: '#D1D5DB', marginTop: 2 }}>Pendente</div>
                          )}
                        </div>
                        {done && <CheckCircle size={16} color="#059669" />}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ============ LISTA DE CLIENTES ============
  return (
    <div style={{ padding: '16px 32px 32px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-secondary)' }} />
          <input type="text" placeholder="Buscar por nome, CNPJ, cidade, projeto..."
            value={search} onChange={ev => setSearch(ev.target.value)}
            style={{ width: '100%', padding: '12px 14px 12px 40px', borderRadius: 12, border: '1px solid var(--portal-border)', color: 'var(--portal-text)', fontSize: 14, outline: 'none', background: 'var(--portal-bg-card)', boxSizing: 'border-box' }} />
        </div>
        {empresas.length > 1 && (
          <select value={empresaFilter} onChange={ev => setEmpresaFilter(ev.target.value)}
            style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--portal-border)', color: 'var(--portal-text)', fontSize: 13, cursor: 'pointer', outline: 'none', background: 'var(--portal-bg-card)' }}>
            <option value="">Todas empresas</option>
            {empresas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
          </select>
        )}
        {syncStatus && (
          <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', background: 'var(--portal-bg-secondary)', borderRadius: 10, border: '1px solid var(--portal-border)' }}>
            {syncing && <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            {syncStatus}
          </span>
        )}
        <button onClick={() => { setCriarErro(''); setFormCli({ ...FORM_CLI_VAZIO }); setShowCriarCliente(true) }} {...gateBtn(podeCriarCliente)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', height: 44, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', ...estiloSemPermissao(podeCriarCliente) }}>
          <Plus size={15} /> Criar Cliente
        </button>
        <button onClick={() => { setCriarErro(''); setProjNome(''); setShowCriarProjeto(true) }} {...gateBtn(podeCriarProjeto)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', height: 44, borderRadius: 12, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', ...estiloSemPermissao(podeCriarProjeto) }}>
          <FolderOpen size={15} /> Criar Projeto
        </button>
        <button onClick={() => router.push('/clientes/relatorios')} title="Relatórios semanais (faturados sem NF)"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', height: 44, borderRadius: 12, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <FileText size={15} /> Relatórios
        </button>
        <button onClick={syncBackground} disabled={syncing} title="Sincronizar"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', cursor: syncing ? 'not-allowed' : 'pointer' }}>
          <RefreshCw size={16} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
        </button>
        <style>{`
          @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
          @keyframes fadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
          @keyframes slideIn { from { opacity: 0; transform: scale(0.96) translateY(10px) } to { opacity: 1; transform: scale(1) translateY(0) } }
          @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
          .cli-card { animation: fadeUp 0.35s ease-out both }
          .cli-modal { animation: slideIn 0.25s ease-out }
          .cli-overlay { animation: fadeIn 0.2s ease-out }
        `}</style>
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
        <div style={{ border: isMobile ? 'none' : '1px solid var(--portal-border)', borderRadius: 14, overflow: 'hidden', background: isMobile ? 'transparent' : 'var(--portal-bg-card)', boxShadow: isMobile ? 'none' : '0 1px 3px var(--portal-shadow)', display: isMobile ? 'flex' : 'block', flexDirection: 'column', gap: isMobile ? 10 : 0 }}>
          {/* Cabeçalho da tabela — só no desktop */}
          {!isMobile && (
          <div style={{
            display: 'grid', gridTemplateColumns: '44px 1fr 160px 140px 70px 120px 110px 24px',
            padding: '12px 20px', background: 'var(--portal-bg-secondary)', borderBottom: '1px solid var(--portal-border)',
            fontSize: 11, color: 'var(--portal-text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5, alignItems: 'center'
          }}>
            <span>#</span><span>Cliente</span><span>CNPJ / CPF</span><span>Cidade</span>
            <span style={{ textAlign: 'center' }}>OS</span><span style={{ textAlign: 'right' }}>Valor Total</span><span>Empresa</span><span></span>
          </div>
          )}

          {filtered.slice(0, 200).map((cli, idx) => (
            isMobile ? (
              // MOBILE: cartão (a grade de 8 colunas não cabe no celular)
              <div key={`${cli.cod_cli}-${cli.empresa}`} onClick={() => abrirDetalhe(cli)}
                style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 12, padding: 14, cursor: 'pointer', boxShadow: '0 1px 2px var(--portal-shadow)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 15, color: 'var(--portal-text)', fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{cli.nome_fantasia || cli.razao_social}</span>
                  {(etiquetasMapa[cli.cnpj_cpf?.replace(/\D/g, '')] || []).map(e => (
                    <span key={e.id} style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: e.cor, color: '#fff', lineHeight: '16px' }}>{e.nome}</span>
                  ))}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', marginTop: 4, fontFamily: 'monospace' }}>{formatCNPJ(cli.cnpj_cpf)}</div>
                <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', marginTop: 2 }}>{cli.cidade ? `${cli.cidade}/${cli.estado}` : '-'} · {cli.empresa}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}><b style={{ color: 'var(--portal-text)' }}>{cli.total_os}</b> OS</span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>{cli.total_valor > 0 ? formatCurrency(cli.total_valor) : '-'}</span>
                </div>
              </div>
            ) : (
            <div key={`${cli.cod_cli}-${cli.empresa}`} onClick={() => abrirDetalhe(cli)}
              style={{
                display: 'grid', gridTemplateColumns: '44px 1fr 160px 140px 70px 120px 110px 24px',
                padding: '14px 20px', borderBottom: '1px solid var(--portal-border)', alignItems: 'center', cursor: 'pointer',
                fontSize: 14, color: 'var(--portal-text)', transition: 'background 0.15s'
              }}
              onMouseEnter={ev => { ev.currentTarget.style.background = 'var(--portal-bg-hover)' }}
              onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}>
              <span style={{ color: 'var(--portal-text-muted)', fontSize: 12, fontWeight: 500 }}>{idx + 1}</span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, color: 'var(--portal-text)', fontWeight: 600 }}>{cli.nome_fantasia || cli.razao_social}</span>
                  {(etiquetasMapa[cli.cnpj_cpf?.replace(/\D/g, '')] || []).map(e => (
                    <span key={e.id} style={{
                      display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                      background: e.cor, color: '#fff', lineHeight: '16px', letterSpacing: 0.3
                    }}>{e.nome}</span>
                  ))}
                </div>
                {cli.nome_fantasia && cli.razao_social && cli.nome_fantasia !== cli.razao_social && (
                  <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 1 }}>{cli.razao_social}</div>
                )}
              </div>
              <span style={{ fontSize: 12, color: 'var(--portal-text-secondary)', fontFamily: 'monospace' }}>{formatCNPJ(cli.cnpj_cpf)}</span>
              <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)' }}>{cli.cidade ? `${cli.cidade}/${cli.estado}` : '-'}</span>
              <span style={{ textAlign: 'center', fontWeight: 700, fontSize: 14, color: 'var(--portal-text)' }}>{cli.total_os}</span>
              <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: 'var(--portal-text)' }}>{cli.total_valor > 0 ? formatCurrency(cli.total_valor) : '-'}</span>
              <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>{cli.empresa}</span>
              <ChevronRight size={16} color="var(--portal-text-muted)" />
            </div>
            )
          ))}

          {filtered.length > 200 && (
            <div style={{ padding: 14, textAlign: 'center', fontSize: 13, color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-secondary)' }}>
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
