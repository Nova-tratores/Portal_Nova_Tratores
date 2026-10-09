'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsMobile } from '@/hooks/useIsMobile'
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui'
import { supabase } from '@/lib/supabase'
import VisualizadorDocumento, { type DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento'
import ContatosChatwoot from '@/components/clientes/ContatosChatwoot'
import ModalNovoCliente from '@/components/clientes/ModalNovoCliente'
import ModalPedidoVenda from '@/components/clientes/ModalPedidoVenda'
import { authHeaders } from '@/lib/auth/client'
import SemPermissao from '@/components/SemPermissao'
import { BellOff, Tractor, Search, ChevronDown, ChevronUp, ArrowLeft, RefreshCw, ChevronRight, Download, FolderOpen, X, FileText, Wrench, Calendar, MapPin, User, Hash, ClipboardList, Package, Users, Shield, CheckCircle, Clock, Mail, Bell, Tag, Plus, Trash2, Save, Upload, AlertTriangle, Send, Phone, Copy, Check } from 'lucide-react'

interface Cliente {
  cod_cli: number; empresa: string; razao_social: string; nome_fantasia: string
  cnpj_cpf: string; cidade: string; estado: string; telefone: string; email: string
  endereco?: string; bairro?: string
  total_os: number; total_valor: number; os_ativas: number; projetos: string[]; refs?: string[]
  /** ["o", nº OS, nº NFS-e] | ["p", nº PV, nº NF-e] — busca por número leva direto ao serviço */
  docs?: string[][]
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

// Nº de nota pra mostrar: sem os zeros à esquerda do Omie (0000000000065 → 65)
function fmtNF(n: string | null | undefined) { return String(n || '').trim().replace(/^0+(?=\d)/, '') }
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

// Cache da PASTA do cliente (vive enquanto a aba estiver aberta):
// reabrir um cliente é instantâneo — mostra o que já temos e re-busca por
// baixo. O hover na lista pré-carrega; a pasta aberta revalida a cada 30s
// e ao voltar pra aba.
type DetalheCache = { ordens: any[]; pedidos: any[]; feedbacks: any[]; tags: string[]; lembretes: any[] }
const cacheDetalhe = new Map<string, DetalheCache>()
const prefetchando = new Set<string>()
const chaveCliente = (c: { cod_cli: number | string; empresa: string }) => `${c.cod_cli}|${c.empresa}`

function formatCNPJ(v: string) {
  if (!v) return ''
  const n = v.replace(/\D/g, '')
  if (n.length === 14) return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  return v
}

const ln = 'var(--portal-border)'
const ln2 = '#F3F4F6'
const inpModal: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 13, boxSizing: 'border-box', outline: 'none', color: 'var(--portal-text)', background: 'var(--portal-bg-card)' }
const lblModal: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--portal-text-secondary)', letterSpacing: 0.3, display: 'block', marginBottom: 4 }

// Botão de upload de PDF estilizado (substitui o input file nativo)
function FileDrop({ label, hint, file, onPick, accent = '#2563EB' }: { label: string; hint?: string; file: File | null; onPick: (f: File | null) => void; accent?: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={lblModal}>{label}</label>
      {!file ? (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 14px', border: '1.5px dashed #D1D5DB', borderRadius: 10, cursor: 'pointer', color: 'var(--portal-text-secondary)', fontSize: 13, fontWeight: 600, background: 'var(--portal-bg-secondary)', transition: 'all .15s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = accent; e.currentTarget.style.color = accent }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#D1D5DB'; e.currentTarget.style.color = 'var(--portal-text-secondary)' }}>
          <Upload size={16} />
          <span>Selecionar PDF</span>
          <input type="file" accept="application/pdf" onChange={e => onPick(e.target.files?.[0] || null)} style={{ display: 'none' }} />
        </label>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: `1.5px solid ${accent}`, borderRadius: 10, background: `${accent}0D`, fontSize: 13 }}>
          <FileText size={16} color={accent} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--portal-text)', fontWeight: 600 }}>{file.name}</span>
          <button type="button" onClick={() => onPick(null)} title="Remover" style={{ background: 'var(--portal-bg-card)', border: '1px solid #E5E7EB', borderRadius: 6, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><X size={13} color="#6B7280" /></button>
        </div>
      )}
      {hint && !file && <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginTop: 4 }}>{hint}</div>}
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
  const [copiadoContato, setCopiadoContato] = useState<string | null>(null)
  // Abas: lista de clientes × lista de máquinas (projetos)
  const [aba, setAba] = useState<'clientes' | 'maquinas'>('clientes')
  const [maquinas, setMaquinas] = useState<any[]>([])
  const [maquinasLoad, setMaquinasLoad] = useState(false)
  const [maquinasCarregou, setMaquinasCarregou] = useState(false)
  const [buscaMaq, setBuscaMaq] = useState('')
  const [selectedCliente, setSelectedCliente] = useState<Cliente | null>(null)
  const [ordens, setOrdens] = useState<OrdemServico[]>([])
  const [pedidos, setPedidos] = useState<PedidoVenda[]>([])
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)
  const [expandedOS, setExpandedOS] = useState<string | null>(null)
  const [modalOS, setModalOS] = useState<OrdemServico | null>(null)
  const [docAberto, setDocAberto] = useState<DocumentoVisualizavel | null>(null)
  const fecharDoc = useCallback(() => setDocAberto(null), [])
  const [anexNfOS, setAnexNfOS] = useState(false)
  const [gerarCardFin, setGerarCardFin] = useState(true) // checkbox: gerar card no financeiro ao anexar NF de serviço
  const [forcandoCard, setForcandoCard] = useState(false) // escapes manuais (trocar PV / forçar card)
  const [subNF, setSubNF] = useState<{ osNum: string; empresa: string; nf_tipo: 'servico' | 'peca'; num_antigo: string; num_novo: string } | null>(null)
  const [subSalvando, setSubSalvando] = useState(false)
  const [modalProjeto, setModalProjeto] = useState<string | null>(null)
  const [modalProjetoEmpresa, setModalProjetoEmpresa] = useState('')
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
  // Aba da pasta: separa OS + PVs avulsos em faturados / cancelados / abertos
  const [osColuna, setOsColuna] = useState<'abertos' | 'faturados' | 'cancelados' | 'balcao'>('faturados')
  // aba Balcão: pedidos de peças sem OS ligada, com filtro por situação + janela do pedido
  const [balcaoFiltro, setBalcaoFiltro] = useState<'todos' | 'faturados' | 'abertos' | 'cancelados'>('todos')
  const [modalPV, setModalPV] = useState<PedidoVenda | null>(null)
  const [osFiltroTipo, setOsFiltroTipo] = useState<string>('')
  const [osBuscaNF, setOsBuscaNF] = useState('')

  // Criar cliente / projeto (no Omie + local)
  const EMPRESAS_OMIE = ['Nova Tratores', 'Castro Peças']
  const [showCriarCliente, setShowCriarCliente] = useState(false)
  const [showCriarProjeto, setShowCriarProjeto] = useState(false)
  const [menuNovo, setMenuNovo] = useState(false) // menu do botão "Novo" (cliente ou projeto)
  const [criando, setCriando] = useState(false)
  const [criarErro, setCriarErro] = useState('')
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

  const criarProjeto = async () => {
    if (!podeCriarProjeto) { setCriarErro('Você não tem permissão para criar projeto'); return }
    if (!projNome.trim()) { setCriarErro('Nome do projeto é obrigatório'); return }
    setCriando(true); setCriarErro('')
    try {
      const res = await fetch('/api/clientes/projetos/criar', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ nome: projNome, empresa: projEmpresa }) })
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
  // Aba "Por Máquina": lista todos os projetos/máquinas de todos os clientes (carrega sob demanda).
  const carregarMaquinas = useCallback(async () => {
    setMaquinasLoad(true)
    try { const res = await fetch('/api/clientes/projetos-resumo'); const data = await res.json(); setMaquinas(data.todos_projetos || []); setMaquinasCarregou(true) } catch {}
    setMaquinasLoad(false)
  }, [])
  const trocarAba = (nova: 'clientes' | 'maquinas') => {
    setAba(nova)
    if (nova === 'maquinas' && !maquinasCarregou && !maquinasLoad) carregarMaquinas()
  }
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
    setModalProjetoEmpresa(empresa)
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
  // Revisões (tabela tratores): horímetro atual = maior horímetro já registrado;
  // próxima revisão = primeiro marco (REVISOES_HORAS) ainda sem data.
  const revHorimetroAtual = (t: any) => {
    if (!t) return ''
    let h = ''
    for (const k of REVISOES_HORAS) if (t[`${k} Horimetro`]) h = t[`${k} Horimetro`]
    return h || t['Inspecao Horimetro'] || ''
  }
  const revProxima = (t: any) => {
    if (!t) return ''
    for (const k of REVISOES_HORAS) if (!t[`${k} Data`]) return k
    return ''
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

  // Deep link: /clientes?cod=123&doc=... abre a pasta do cliente direto
  const [urlClienteTratada, setUrlClienteTratada] = useState(false)
  useEffect(() => {
    if (urlClienteTratada || clientes.length === 0) return
    setUrlClienteTratada(true)
    const p = new URLSearchParams(window.location.search)
    const cod = p.get('cod'); const doc = p.get('doc')
    if (!cod && !doc) return
    const alvo = clientes.find(c => (cod && String(c.cod_cli) === cod) || (!!doc && c.cnpj_cpf === doc))
    if (alvo) abrirDetalhe(alvo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientes, urlClienteTratada])

  // Busca TUDO da pasta em PARALELO, aplicando cada pedaço assim que chega
  // (e guardando no cache). Só aplica na tela se o cliente ainda for o aberto.
  const chaveAbertaRef = useRef('')
  const buscarDetalhe = useCallback(async (cliente: Cliente) => {
    const chave = chaveCliente(cliente)
    const aplicar = (parte: Partial<DetalheCache>) => {
      const atual = cacheDetalhe.get(chave) || { ordens: [], pedidos: [], feedbacks: [], tags: [], lembretes: [] }
      Object.assign(atual, parte)
      cacheDetalhe.set(chave, atual)
      if (chaveAbertaRef.current !== chave) return
      if (parte.ordens !== undefined) setOrdens(parte.ordens)
      if (parte.pedidos !== undefined) setPedidos(parte.pedidos)
      if (parte.feedbacks !== undefined) setFeedbacksCliente(parte.feedbacks)
      if (parte.tags !== undefined) setTagsOmieCliente(parte.tags)
      if (parte.lembretes !== undefined) setLembretesCliente(parte.lembretes)
    }
    await Promise.all([
      // OS + Pedidos (o grosso da pasta)
      fetch(`/api/clientes?codCli=${cliente.cod_cli}&empresa=${encodeURIComponent(cliente.empresa)}`)
        .then((res) => res.json())
        .then((data) => aplicar({
          ordens: data.ordens || [],
          pedidos: (data.pedidos || []).map((pv: any) => ({ ...pv, itens: typeof pv.itens === 'string' ? JSON.parse(pv.itens) : (pv.itens || []) })),
        }))
        .catch(() => {})
        .finally(() => { if (chaveAbertaRef.current === chave) setLoadingDetalhe(false) }),
      // Feedbacks/atendimentos (modulo Feedbacks & CRM)
      supabase
        .from('feedback_registros')
        .select('id,tipo,data_contato,status_atendimento,nota,acao,feedback,trator,atendente_nome,criado_em')
        .eq('codigo_omie', String(cliente.cod_cli))
        .order('criado_em', { ascending: false })
        .then(({ data: fbs }) => aplicar({ feedbacks: fbs || [] })),
      // Tags do Omie (espelho em portal_nt_clientes_cadastro_omie)
      supabase
        .from('portal_nt_clientes_cadastro_omie')
        .select('tags')
        .eq('cod_cli', cliente.cod_cli)
        .eq('empresa', cliente.empresa)
        .maybeSingle()
        .then(({ data: cad }) => aplicar({ tags: parseOmieTags(cad?.tags) })),
      // Lembretes do POS: pelo CNPJ OU por qualquer código do cliente (Nova/Castro) —
      // há lembrete gravado só com a chave OMIE:<cod>, sem CNPJ
      fetch(`/api/clientes/info-pasta?cod=${encodeURIComponent(String(cliente.cod_cli))}&empresa=${encodeURIComponent(cliente.empresa)}${cliente.cnpj_cpf ? `&cnpj=${encodeURIComponent(cliente.cnpj_cpf.replace(/\D/g, ''))}` : ''}`)
        .then((res) => res.json())
        .then((data) => { if (Array.isArray(data?.lembretes)) aplicar({ lembretes: data.lembretes }) })
        .catch(() => {}),
    ])
  }, [])

  // Pré-carrega a pasta quando o mouse passa na lista (clicar = instantâneo)
  const prefetchDetalhe = (cliente: Cliente) => {
    const chave = chaveCliente(cliente)
    if (cacheDetalhe.has(chave) || prefetchando.has(chave)) return
    prefetchando.add(chave)
    buscarDetalhe(cliente).finally(() => prefetchando.delete(chave))
  }

  const abrirDetalhe = async (cliente: Cliente) => {
    const chave = chaveCliente(cliente)
    chaveAbertaRef.current = chave
    setSelectedCliente(cliente); setExpandedOS(null); setModalProjeto(null); setEmailsData({}); setEtiquetasCliente([]); setDescricaoCliente(''); setDescricaoLocal(''); setModalEtiqueta(false)
    // Reflete o cliente aberto na URL (dá pra linkar/favoritar/voltar direto)
    if (typeof window !== 'undefined') window.history.replaceState(null, '', `/clientes?cod=${cliente.cod_cli}&doc=${encodeURIComponent(cliente.cnpj_cpf || '')}`)
    const emCache = cacheDetalhe.get(chave)
    if (emCache) {
      // Pasta abre NA HORA com o que já temos; a re-busca corre por baixo
      setOrdens(emCache.ordens); setPedidos(emCache.pedidos); setFeedbacksCliente(emCache.feedbacks)
      setTagsOmieCliente(emCache.tags); setLembretesCliente(emCache.lembretes)
      setLoadingDetalhe(false)
    } else {
      setOrdens([]); setPedidos([]); setLembretesCliente([]); setFeedbacksCliente([]); setTagsOmieCliente([])
      setLoadingDetalhe(true)
    }
    if (cliente.cnpj_cpf) carregarEtiquetasCliente(cliente.cnpj_cpf)
    await buscarDetalhe(cliente)
  }

  // Busca por nº (OS / PV / NF) → abre a pasta JÁ na janela do serviço. Tenta com
  // o que está em cache (abre na hora); senão espera a pasta carregar.
  const abrirServico = async (cliente: Cliente, tipo: 'o' | 'p', num: string) => {
    const chave = chaveCliente(cliente)
    const so = (v: unknown) => String(v ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '')
    const aba = (cancelada: boolean, fechada: boolean) => cancelada ? 'cancelados' : fechada ? 'faturados' : 'abertos'
    const tentar = () => {
      const c = cacheDetalhe.get(chave)
      if (!c) return false
      const ordensC = c.ordens as OrdemServico[]
      const os = tipo === 'o'
        ? ordensC.find(o => so(o.num_os) === so(num))
        : ordensC.find(o => !o.cancelada && so(o.num_pedido_cli) === so(num))
      if (os) { setOsColuna(aba(os.cancelada, os.faturada || !!os.servico_interno)); setModalOS(os); return true }
      if (tipo === 'p') {
        const pv = (c.pedidos as PedidoVenda[]).find(p => so(p.num_pedido) === so(num))
        if (pv) {
          // pedido sem OS = peça de balcão: abre a aba Balcão já na janela do pedido
          setOsColuna('balcao'); setBalcaoFiltro('todos'); setModalPV(pv)
          return true
        }
      }
      return false
    }
    const carregando = abrirDetalhe(cliente)
    if (tentar()) return
    await carregando
    if (chaveAbertaRef.current === chave) tentar()
  }

  // Pasta VIVA: revalida a cada 30s enquanto aberta e ao voltar pra aba
  useEffect(() => {
    if (!selectedCliente) return
    const alvo = selectedCliente
    const revalidar = () => buscarDetalhe(alvo)
    const t = setInterval(revalidar, 30000)
    const aoFocar = () => { if (document.visibilityState === 'visible') revalidar() }
    document.addEventListener('visibilitychange', aoFocar)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', aoFocar) }
  }, [selectedCliente, buscarDetalhe])

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
  // Busca só com números (ex.: "5250", "0000064") = nº de OS, PV ou nota fiscal
  const buscaNumero = /^\s*\d+\s*$/.test(search) ? search.trim().replace(/^0+(?=\d)/, '') : ''
  const docsQueBatem = (c: Cliente) => buscaNumero
    ? (c.docs || []).filter(d => d[1].replace(/^0+(?=\d)/, '') === buscaNumero || d[2] === buscaNumero)
    : []
  const filtradosRaw = clientes.filter(c => {
    const matchSearch = !search || docsQueBatem(c).length > 0 || [c.razao_social, c.nome_fantasia, c.cnpj_cpf, c.cidade, ...(c.projetos || []), ...(c.refs || [])].some(f => (f || '').toLowerCase().includes(search.toLowerCase()))
    return matchSearch && (!empresaFilter || c.empresa === empresaFilter)
  })
  // Deduplica por CNPJ/CPF (não pode aparecer o mesmo cliente 2x). Mantém o registro mais completo.
  const filtered = (() => {
    const porDoc = new Map<string, Cliente>()
    const semDoc: Cliente[] = []
    // na busca por número, fica o cadastro (Nova/Castro) onde o documento está
    const peso = (c: Cliente) => (docsQueBatem(c).length ? 1e15 : 0) + (Number(c.total_valor || 0) * 1000) + Number(c.total_os || 0)
    for (const c of filtradosRaw) {
      const doc = (c.cnpj_cpf || '').replace(/\D/g, '')
      if (!doc) { semDoc.push(c); continue }
      const ex = porDoc.get(doc)
      if (!ex || peso(c) > peso(ex)) porDoc.set(doc, c)
    }
    return [...porDoc.values(), ...semDoc]
  })()
  const empresas = [...new Set(clientes.map(c => c.empresa))]
  const maquinasFiltradas = maquinas.filter(m => {
    const t = buscaMaq.toLowerCase()
    const okBusca = !buscaMaq || (m.nome || '').toLowerCase().includes(t) || (m.cliente?.nome || '').toLowerCase().includes(t) || (m.cliente?.cidade || '').toLowerCase().includes(t)
    const okEmp = !empresaFilter || m.empresa === empresaFilter
    return okBusca && okEmp
  })
  const copiarContato = (e: React.MouseEvent, texto: string) => {
    e.stopPropagation()
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiadoContato(texto)
      setTimeout(() => setCopiadoContato(c => (c === texto ? null : c)), 1200)
    }).catch(() => {})
  }
  const btnCopiar: React.CSSProperties = { border: 'none', background: 'transparent', cursor: 'pointer', padding: 2, display: 'inline-flex', alignItems: 'center' }
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
  // Renderiza esta visão quando há um cliente selecionado OU quando só o modal de
  // máquina está aberto (aberto direto pela aba "Por Máquina", sem entrar na pasta).
  if (selectedCliente || modalProjeto) {
    const cli = selectedCliente as Cliente
    const totalFaturadas = ordens.filter(o => o.faturada).length
    const totalCanceladas = ordens.filter(o => o.cancelada).length
    const totalAtivas = ordens.filter(o => !o.faturada && !o.cancelada).length
    const pvsSemOS = pedidos.filter(pv => !ordens.some(os => {
      const p = parseRef(os.num_pedido_cli, os.empresa)
      return p.tipo === 'pv' && p.num === pv.num_pedido && (!p.empresa || p.empresa === pv.empresa)
    }))
    // Situação de cada documento p/ as abas. OS fechada como serviço interno não
    // gera fatura, mas está encerrada — vai junto com as faturadas.
    const situacaoOS = (o: OrdemServico) => o.cancelada ? 'cancelados' : (o.faturada || o.servico_interno) ? 'faturados' : 'abertos'
    const situacaoPV = (p: PedidoVenda) => p.cancelado ? 'cancelados' : p.faturado ? 'faturados' : 'abertos'
    const pvsBalcao = pvsSemOS
      .filter(pv => balcaoFiltro === 'todos' || situacaoPV(pv) === balcaoFiltro)
      .sort((a, b) => String(b.data_previsao || b.data_inclusao || '').localeCompare(String(a.data_previsao || a.data_inclusao || '')))
    // PV ligado a mais de uma OS não cancelada: com o MESMO valor = provável OS
    // duplicada no Omie; com valor diferente = PV dividido entre serviços (só informa)
    const osPorPV = new Map<string, OrdemServico[]>()
    for (const o of ordens) {
      if (o.cancelada) continue
      const r = parseRef(o.num_pedido_cli, o.empresa)
      if (r.tipo !== 'pv' || !r.num) continue
      const k = `${r.empresa || o.empresa}|${r.num}`
      osPorPV.set(k, [...(osPorPV.get(k) || []), o])
    }
    const outrasOSdoPV = (o: OrdemServico) => {
      const r = parseRef(o.num_pedido_cli, o.empresa)
      if (o.cancelada || r.tipo !== 'pv' || !r.num) return []
      return (osPorPV.get(`${r.empresa || o.empresa}|${r.num}`) || []).filter(x => x.num_os !== o.num_os)
    }
    const contaAba = (aba: string) => aba === 'balcao' ? pvsSemOS.length : ordens.filter(o => situacaoOS(o) === aba).length

    return (
      <div style={{ padding: 'clamp(12px, 4vw, 20px) clamp(12px, 4vw, 32px) 48px', width: '100%', boxSizing: 'border-box' }}>
        {selectedCliente && (<>
        <button onClick={() => { setSelectedCliente(null); if (typeof window !== 'undefined') window.history.replaceState(null, '', '/clientes') }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-secondary)', fontSize: 13, padding: '4px 0', marginBottom: 18 }}>
          <ArrowLeft size={16} /> Voltar para lista
        </button>

        <div className="cli-detail-grid" style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '320px minmax(0, 1fr)', gap: isMobile ? 14 : 24, alignItems: 'start' }}>
          {/* ===================== SIDEBAR ===================== */}
          {/* Fixa ao rolar a página, mas com altura da tela e rolagem própria —
              sem o limite, o que passava da janela ficava inalcançável */}
          <style>{`.cli-aside > * { flex-shrink: 0 }`}</style>
          <aside className="cli-aside" style={isMobile
            ? { display: 'flex', flexDirection: 'column', gap: 16 }
            : { position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', gap: 16, maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', overscrollBehavior: 'contain', paddingRight: 4, scrollbarWidth: 'thin' }}>
            {/* Card do cliente */}
            <div style={{ background: 'var(--portal-bg-card)', borderRadius: 16, border: '1px solid #E5E7EB', overflow: 'hidden', boxShadow: '0 1px 3px rgba(16,24,40,0.06)' }}>
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
                      <div style={{ fontSize: 10, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>{f.l}</div>
                      <div style={{ fontSize: 13, color: 'var(--portal-text)', fontWeight: 500, wordBreak: 'break-word' }}>{f.v}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contatos do WhatsApp (NovaZap) vinculados ao CNPJ */}
            <ContatosChatwoot key={`${cli.cod_cli}-${cli.empresa}`} cod={cli.cod_cli} cnpj={cli.cnpj_cpf || ''} empresa={cli.empresa} nomeCliente={cli.nome_fantasia || cli.razao_social} />

            {/* Etiquetas (compacto) */}
            <div style={{ background: 'var(--portal-bg-card)', borderRadius: 16, border: '1px solid #E5E7EB', padding: '14px 16px', boxShadow: '0 1px 3px rgba(16,24,40,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
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
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted)', fontStyle: 'italic' }}>Sem etiquetas. Clique + para marcar.</span>
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
                            style={{ padding: '4px 11px', borderRadius: 16, fontSize: 11, fontWeight: 700, cursor: 'pointer', border: ativo ? `2px solid ${e.cor}` : '2px solid #D1D5DB', background: ativo ? e.cor : '#fff', color: ativo ? '#fff' : 'var(--portal-text-secondary)', transition: 'all .15s' }}>
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
              <div style={{ background: 'var(--portal-bg-card)', borderRadius: 16, border: '1px solid #E5E7EB', padding: '14px 16px', boxShadow: '0 1px 3px rgba(16,24,40,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
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
            <div style={{ background: 'var(--portal-bg-card)', borderRadius: 16, border: '1px solid #E5E7EB', padding: '14px 16px', boxShadow: '0 1px 3px rgba(16,24,40,0.06)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
                Observações
              </div>
              <textarea value={descricaoLocal} onChange={ev => setDescricaoLocal(ev.target.value)}
                placeholder="Anote algo sobre este cliente..."
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1px solid #E5E7EB', fontSize: 13, outline: 'none', resize: 'vertical', minHeight: 56, fontFamily: 'inherit', color: 'var(--portal-text)' }} />
              {descricaoLocal !== descricaoCliente && (
                <button onClick={() => cli.cnpj_cpf && salvarDescricao(cli.cnpj_cpf)} disabled={salvandoDesc}
                  style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, background: '#059669', color: '#fff', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  <Save size={14} /> Salvar
                </button>
              )}
            </div>

            {/* Feedbacks / Atendimentos (compacto) — modulo Feedbacks & CRM */}
            <div style={{ background: 'var(--portal-bg-card)', borderRadius: 16, border: '1px solid #E5E7EB', padding: '14px 16px', boxShadow: '0 1px 3px rgba(16,24,40,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 }}>
                <ClipboardList size={14} color="#7C3AED" /> Feedbacks ({feedbacksCliente.length})
              </div>
              {feedbacksCliente.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--portal-text-muted)', fontStyle: 'italic' }}>Sem feedbacks registrados.</span>
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
                          <span style={{ fontSize: 11, color: 'var(--portal-text-secondary)', fontWeight: 600 }}>{dataTxt}</span>
                          {f.status_atendimento && <span style={{ fontSize: 10, color: 'var(--portal-text-muted)' }}>· {statusLabel[f.status_atendimento] || f.status_atendimento}</span>}
                        </div>
                        {texto && (
                          <div style={{ fontSize: 12, color: 'var(--portal-text)', lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{texto}</div>
                        )}
                        {(f.nota != null || f.trator) && (
                          <div style={{ fontSize: 10.5, color: 'var(--portal-text-muted)', marginTop: 3 }}>
                            {f.nota != null ? `Nota ${f.nota}` : ''}{f.nota != null && f.trator ? ' · ' : ''}{f.trator || ''}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {feedbacksCliente.length > 6 && (
                    <span style={{ fontSize: 11, color: 'var(--portal-text-muted)', fontStyle: 'italic' }}>+{feedbacksCliente.length - 6} mais</span>
                  )}
                </div>
              )}
            </div>
          </aside>

          {/* ===================== COLUNA PRINCIPAL ===================== */}
          <main style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

        {/* LEMBRETES DO CLIENTE (POS) — sempre visível: sem lembrete também é informação */}
        {selectedCliente && (
          <div style={{ marginBottom: 20 }}>
            {lembretesCliente.some((l: any) => !l.concluido) && (
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bell size={16} color="#E65100" /> Lembretes do POS ({lembretesCliente.filter((l: any) => !l.concluido).length})
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {!loadingDetalhe && !lembretesCliente.some((l: any) => !l.concluido) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, background: 'var(--portal-bg-secondary)', fontSize: 13, color: 'var(--portal-text-secondary)' }}>
                  <BellOff size={15} color="#94A3B8" style={{ flexShrink: 0 }} />
                  Sem lembretes do POS para este cliente.
                </div>
              )}
              {lembretesCliente.filter((l: any) => !l.concluido).map((l: any) => (
                <div key={l.id} style={{
                  padding: '14px 18px', borderRadius: 12,
                  background: '#FFF7ED', border: '1px solid #FFCC80',
                  display: 'flex', alignItems: 'flex-start', gap: 12,
                }}>
                  <Bell size={16} color="#E65100" style={{ flexShrink: 0, marginTop: 2 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: '#1a1a1a', fontWeight: 600, lineHeight: 1.4 }}>{l.lembrete}</div>
                    <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginTop: 4 }}>
                      {l.criado_por ? `Por ${l.criado_por}` : ''}
                      {l.criado_por && l.created_at ? ' — ' : ''}
                      {l.created_at ? new Date(l.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
                    </div>
                  </div>
                </div>
              ))}
              {lembretesCliente.filter((l: any) => l.concluido).length > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 12, color: 'var(--portal-text-muted)', cursor: 'pointer', fontWeight: 600 }}>
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
                          <div style={{ fontSize: 10, color: 'var(--portal-text-muted)', marginTop: 3 }}>
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
          <div style={{ padding: 80, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 15 }}>
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
                if (situacaoOS(os) !== osColuna) return false
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
              }).sort((a, b) => (b.data_previsao || '').localeCompare(a.data_previsao || '') || (parseInt(b.num_os) || 0) - (parseInt(a.num_os) || 0))

              return (<>
            {/* Resumo do cliente — painéis no estilo dos cards de OS */}
            {(() => {
              // valores sem os cancelados (OS/PV cancelado não é dinheiro do cliente)
              const valorServ = ordens.filter(o => !o.cancelada).reduce((s, o) => s + (o.valor_total || 0), 0)
              const valorPecas = pedidos.filter(p => !p.cancelado).reduce((s, p) => s + (p.valor_total || 0), 0)
              const pvsValidos = pedidos.filter(p => !p.cancelado).length
              const totalOS = ordens.length || 1
              const segs = [
                { n: totalFaturadas, cor: '#10B981', rot: 'faturadas' },
                { n: totalAtivas, cor: '#F59E0B', rot: 'em aberto' },
                { n: totalCanceladas, cor: '#EF4444', rot: 'canceladas' },
              ]
              const LBLK: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#94A3B8' }
              const TILE: React.CSSProperties = { position: 'relative', border: '1px solid #E5E7EB', borderRadius: 14, background: 'var(--portal-bg-card)', padding: '14px 16px', boxShadow: '0 1px 2px rgba(16,24,40,0.05)', overflow: 'hidden', minWidth: 0 }
              const icone = (el: React.ReactNode, cor: string, fundo: string) => (
                <span style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 9, background: fundo, color: cor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{el}</span>
              )
              const VAL: React.CSSProperties = { fontSize: 22, fontWeight: 800, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums', marginTop: 6, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: 12, marginBottom: 20 }}>
                  {/* Ordens de serviço + distribuição */}
                  <div style={TILE}>
                    {icone(<Wrench size={16} />, '#2563EB', '#EFF6FF')}
                    <div style={LBLK}>Ordens de serviço</div>
                    <div style={VAL}>{ordens.length}</div>
                    <div style={{ display: 'flex', height: 6, borderRadius: 6, overflow: 'hidden', background: 'var(--portal-bg-secondary)', marginTop: 10 }}>
                      {segs.filter(s => s.n > 0).map(s => <div key={s.rot} title={`${s.n} ${s.rot}`} style={{ width: `${(s.n / totalOS) * 100}%`, background: s.cor }} />)}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 8 }}>
                      {segs.map(s => (
                        <span key={s.rot} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: '#64748B' }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.cor }} /><b style={{ color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{s.n}</b> {s.rot}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Serviços */}
                  <div style={TILE}>
                    {icone(<ClipboardList size={16} />, '#2563EB', '#EFF6FF')}
                    <div style={LBLK}>Serviços</div>
                    <div style={{ ...VAL, color: '#1D4ED8' }}>{formatCurrency(valorServ)}</div>
                    <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 8 }}>Mão de obra e deslocamento das OS</div>
                  </div>

                  {/* Peças */}
                  <div style={TILE}>
                    {icone(<Package size={16} />, '#EA580C', '#FFF7ED')}
                    <div style={LBLK}>Peças</div>
                    <div style={{ ...VAL, color: '#C2410C' }}>{formatCurrency(valorPecas)}</div>
                    <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 8 }}>{pvsValidos} {pvsValidos === 1 ? 'pedido de venda' : 'pedidos de venda'}</div>
                  </div>

                  {/* Total */}
                  <div style={{ ...TILE, background: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)', border: 'none' }}>
                    <div style={{ ...LBLK, color: '#FECACA' }}>Total com o cliente</div>
                    <div style={{ ...VAL, color: '#fefefe', fontSize: 24 }}>{formatCurrency(valorServ + valorPecas)}</div>
                    <div style={{ fontSize: 11.5, color: '#FECACA', marginTop: 8 }}>Serviços + peças, sem os cancelados</div>
                  </div>
                </div>
              )
            })()}

            {ordens.length === 0 && pedidos.length === 0 ? (
              <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 15 }}>Nenhuma ordem de servico encontrada</div>
            ) : (
              <div>
                {/* ABAS: Faturados / Cancelados / Abertos (OS) + Balcão (pedidos de peças sem OS) */}
                <div style={{ display: 'flex', gap: 2, marginBottom: 16, borderBottom: '1px solid #E5E7EB', overflowX: 'auto' }}>
                  {([
                    { id: 'faturados', label: 'Faturados', cor: '#059669' },
                    { id: 'cancelados', label: 'Cancelados', cor: '#94A3B8' },
                    { id: 'abertos', label: 'Abertos', cor: '#EA580C' },
                    { id: 'balcao', label: 'Balcão', cor: '#C2410C' },
                  ] as const).map(tab => {
                    const ativo = osColuna === tab.id
                    const n = contaAba(tab.id)
                    return (
                      <button key={tab.id} onClick={() => setOsColuna(tab.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                          padding: '10px 18px', marginBottom: -1,
                          border: 'none', borderBottom: `3px solid ${ativo ? tab.cor : 'transparent'}`, background: 'none', cursor: 'pointer',
                          fontSize: 14, fontWeight: ativo ? 700 : 600,
                          color: ativo ? 'var(--portal-text)' : 'var(--portal-text-muted)', transition: 'all 0.15s',
                        }}>
                        {tab.label}
                        <span style={{ fontSize: 11.5, fontWeight: 700, padding: '1px 8px', borderRadius: 10, background: ativo ? tab.cor : 'var(--portal-bg-secondary)', color: ativo ? '#fff' : 'var(--portal-text-muted)' }}>{n}</span>
                      </button>
                    )
                  })}
                </div>

                {osColuna !== 'balcao' && (<>
                {/* TITULO + FILTROS */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Wrench size={18} color="#DC2626" /> Ordens de Servico ({ordensFiltradas.length})
                  </div>
                  <button onClick={() => abrirAnexar('os')}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                    <Plus size={14} /> Anexar OS
                  </button>
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
                      color: osFiltroTipo ? '#DC2626' : 'var(--portal-text-secondary)',
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
                        color: osFiltroTipo.startsWith('maq:') ? '#DC2626' : 'var(--portal-text-secondary)',
                        outline: 'none',
                      }}>
                      <option value="">Máquina</option>
                      {maquinas.map(m => <option key={m} value={`maq:${m}`}>{m}</option>)}
                    </select>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, border: osBuscaNF ? '1px solid #DC2626' : '1px solid #E5E7EB', background: osBuscaNF ? '#FEF2F2' : '#fff' }}>
                    <Search size={13} color={osBuscaNF ? '#DC2626' : 'var(--portal-text-muted)'} />
                    <input
                      type="text" placeholder="Buscar NF, OS..."
                      value={osBuscaNF} onChange={e => setOsBuscaNF(e.target.value)}
                      style={{ border: 'none', outline: 'none', background: 'none', fontSize: 12, width: 130, color: 'var(--portal-text)' }}
                    />
                    {osBuscaNF && <X size={12} onClick={() => setOsBuscaNF('')} style={{ cursor: 'pointer', color: 'var(--portal-text-muted)' }} />}
                  </div>
                </div>

                {/* OS COMO CARDS */}
                {ordensFiltradas.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 13 }}>{osFiltroTipo || osBuscaNF ? 'Nenhuma OS com esses filtros' : `Nenhuma OS ${osColuna === 'abertos' ? 'aberta' : osColuna === 'faturados' ? 'faturada' : 'cancelada'}`}</div>
                ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 28 }}>
                  {ordensFiltradas.map((os, oi) => {
                    const servicos = typeof os.servicos === 'string' ? JSON.parse(os.servicos) : (os.servicos || [])
                    const solicitacao = (() => { const d = servicos.map((s: any) => s.desc || '').join('|'); const m = d.match(/Solicita[çc][ãa]o[^:]*:\s*([^|]+)/i); return m ? m[1].trim() : '' })()
                    const ref = classifyRef(os.num_pedido_cli, os.empresa)
                    const numRef = ref.tipo === 'pv' ? os.num_pedido_cli : ''
                    const remRef = ref.tipo === 'remessa' ? os.num_pedido_cli : ''
                    const ehInterno = !!os.servico_interno
                    const acc = os.cancelada ? '#DC2626' : ehInterno ? '#7C3AED' : os.faturada ? '#10B981' : '#F59E0B'
                    const statusLabel = os.cancelada ? os.status : ehInterno ? 'Fechado interno' : os.status
                    // Peças vêm do(s) pedido(s) de venda vinculado(s) à OS
                    const pvsLig = (ref.tipo === 'pv' || ref.tipo === 'remessa') ? findAllPVs(os.num_pedido_cli, os.empresa) : []
                    const pecas = pvsLig.flatMap((pv: any) => pv.itens || [])
                    // O valor da OS no Omie é só o serviço — as peças vêm do(s) PV(s) vinculado(s).
                    // Mesma conta da janela da OS: total do PV (cai na soma dos itens se faltar).
                    const pecasTotal = pvsLig.reduce((s: number, pv: any) => s + (Number(pv.valor_total) || (pv.itens || []).reduce((t: number, i: any) => t + (Number(i.valor_total) || 0), 0)), 0)
                    const maoObra = os.valor_total || 0
                    const totalGeral = maoObra + pecasTotal
                    const outrasOS = outrasOSdoPV(os)
                    const duplicadas = outrasOS.filter(x => (x.valor_total || 0) === (os.valor_total || 0)).map(x => x.num_os)
                    const compartilhadas = outrasOS.filter(x => (x.valor_total || 0) !== (os.valor_total || 0)).map(x => x.num_os)
                    const PECAS_VISIVEIS = 4
                    const tecnico = (os.vendedor || '').replace(/^T[ée]cnico:\s*/i, '').trim()
                    const modelo = extractModelo(os)
                    const chassi = extractChassis(os)
                    const st = os.cancelada ? { cor: '#B91C1C', fundo: '#FEF2F2', borda: '#FECACA' }
                      : ehInterno ? { cor: '#6D28D9', fundo: '#F5F3FF', borda: '#DDD6FE' }
                      : os.faturada ? { cor: '#047857', fundo: '#ECFDF5', borda: '#A7F3D0' }
                      : { cor: '#B45309', fundo: '#FFFBEB', borda: '#FDE68A' }
                    // notas: número + se o PDF já está na pasta
                    const nfServNum = fmtNF(os.num_nf || os.financeiro?.num_nf_servico)
                    const nfServOk = !!(os.link_nf || os.financeiro?.nf_servico)
                    const nfsPeca = pvsLig.map((pv: any) => ({ num: fmtNF(pv.numero_nf), ok: !!pv.link_nf })).filter((n: { num: string }) => n.num)
                    const CHIP: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '3px 9px', borderRadius: 7, whiteSpace: 'nowrap', border: '1px solid #E5E7EB', background: 'var(--portal-bg-secondary)', color: '#475569' }
                    const chipNF = (rotulo: string, num: string, ok: boolean, k: string) => (
                      <span key={k} title={ok ? 'PDF da nota na pasta' : 'Nota sem PDF na pasta'}
                        style={{ ...CHIP, background: ok ? '#ECFDF5' : '#FFFBEB', borderColor: ok ? '#A7F3D0' : '#FDE68A', color: ok ? '#047857' : '#B45309' }}>
                        {ok ? <Check size={12} strokeWidth={3} /> : <Clock size={12} strokeWidth={2.5} />} {rotulo} {num}
                      </span>
                    )
                    const lbl: React.CSSProperties = { display: 'block', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#94A3B8' }
                    const totNum: React.CSSProperties = { fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }

                    return (
                      <div key={os.num_os} className="cli-card" onClick={() => setModalOS(os)}
                        style={{ position: 'relative', border: '1px solid #E5E7EB', borderRadius: 14, background: 'var(--portal-bg-card)', cursor: 'pointer', transition: 'all 0.15s', boxShadow: '0 1px 2px rgba(16,24,40,0.05)', overflow: 'hidden', animationDelay: `${Math.min(oi * 30, 300)}ms` }}
                        onMouseEnter={ev => { ev.currentTarget.style.borderColor = '#CBD5E1'; ev.currentTarget.style.boxShadow = '0 8px 20px rgba(16,24,40,0.10)'; ev.currentTarget.style.transform = 'translateY(-1px)' }}
                        onMouseLeave={ev => { ev.currentTarget.style.borderColor = 'var(--portal-border)'; ev.currentTarget.style.boxShadow = '0 1px 2px rgba(16,24,40,0.05)'; ev.currentTarget.style.transform = 'none' }}>
                        <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: acc }} />

                        <div style={{ padding: '15px 18px 14px 22px' }}>
                          {/* Cabeçalho: ícone · OS · técnico/data | status */}
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                              <span style={{ width: 40, height: 40, borderRadius: 11, background: st.fundo, color: st.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Wrench size={19} />
                              </span>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--portal-text)', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>OS {os.num_os}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#64748B', marginTop: 3, flexWrap: 'wrap' }}>
                                  {tecnico && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><User size={12} /> {tecnico}</span>}
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Calendar size={12} /> {formatDate(os.data_previsao)}</span>
                                </div>
                              </div>
                            </div>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: st.cor, background: st.fundo, border: `1px solid ${st.borda}`, padding: '4px 11px', borderRadius: 999, whiteSpace: 'nowrap' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.cor }} />{statusLabel}
                            </span>
                          </div>

                          {/* Etiquetas: PV · máquina · notas · avisos */}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                            {numRef && <span style={{ ...CHIP, background: '#FFF7ED', borderColor: '#FED7AA', color: '#C2410C' }}><Package size={12} /> PV {numRef}</span>}
                            {remRef && <span style={{ ...CHIP, background: '#FFF7ED', borderColor: '#FED7AA', color: '#C2410C' }}><Package size={12} /> {ref.label}</span>}
                            {(modelo || chassi) && (
                              <span style={CHIP} title="Máquina do serviço"><Tag size={12} /> {[modelo, chassi && `chassi ${chassi}`].filter(Boolean).join(' · ')}</span>
                            )}
                            {nfServNum && chipNF('NFS-e', nfServNum, nfServOk, 'nfs')}
                            {nfsPeca.map((n: { num: string; ok: boolean }, i: number) => chipNF('NF-e', n.num, n.ok, `nfe-${i}`))}
                            {os.pdf_anexo && (
                              <a href={os.pdf_anexo} target="_blank" rel="noopener noreferrer" onClick={ev => ev.stopPropagation()} title="PDF anexado à OS"
                                style={{ ...CHIP, background: '#EFF6FF', borderColor: '#BFDBFE', color: '#1D4ED8', textDecoration: 'none' }}>
                                <FileText size={12} /> PDF anexado
                              </a>
                            )}
                            {duplicadas.length > 0 && (
                              <span title={`A OS ${duplicadas.join(', ')} tem o mesmo PV ${numRef} e o mesmo valor desta. Confira no Omie se não é OS duplicada — as peças aparecem nas duas.`}
                                style={{ ...CHIP, fontWeight: 700, background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C' }}>
                                <AlertTriangle size={12} /> Possível OS duplicada ({duplicadas.join(', ')})
                              </span>
                            )}
                            {compartilhadas.length > 0 && (
                              <span title={`O PV ${numRef} também está ligado à OS ${compartilhadas.join(', ')} (valor diferente). As peças do PV aparecem nas duas.`} style={CHIP}>
                                PV também na OS {compartilhadas.join(', ')}
                              </span>
                            )}
                          </div>

                          {/* Serviço */}
                          <div style={{ marginTop: 14 }}>
                            <span style={lbl}>Serviço</span>
                            <div style={{ fontSize: 13.5, color: '#334155', lineHeight: 1.55, marginTop: 4, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                              {solicitacao || os.descricao || 'Sem descrição'}
                            </div>
                          </div>

                          {/* Peças do PV vinculado (as primeiras; o resto na janela da OS) */}
                          {pecas.length > 0 && (
                            <div style={{ marginTop: 14, border: '1px solid #F1F5F9', borderRadius: 10, overflow: 'hidden' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', background: 'var(--portal-bg-secondary)' }}>
                                <span style={{ ...lbl, color: '#C2410C' }}>Peças · {pecas.length} {pecas.length === 1 ? 'item' : 'itens'}</span>
                                {numRef && <span style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>PV {numRef}</span>}
                              </div>
                              {pecas.slice(0, PECAS_VISIVEIS).map((p: any, pi: number) => (
                                <div key={pi} style={{ display: 'grid', gridTemplateColumns: 'minmax(70px, 120px) minmax(0, 1fr) auto auto', gap: 10, alignItems: 'baseline', fontSize: 12.5, color: '#475569', padding: '6px 12px', borderTop: '1px solid #F1F5F9' }}>
                                  <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, color: '#C2410C', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.codigo || '-'}</span>
                                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descricao || p.desc || '-'}</span>
                                  <span style={{ color: '#94A3B8', fontVariantNumeric: 'tabular-nums' }}>{p.quantidade}×</span>
                                  <span style={{ fontWeight: 600, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums', minWidth: 78, textAlign: 'right' }}>{formatCurrency(p.valor_total || 0)}</span>
                                </div>
                              ))}
                              {pecas.length > PECAS_VISIVEIS && (
                                <div style={{ padding: '6px 12px', borderTop: '1px solid #F1F5F9', fontSize: 12, fontWeight: 600, color: '#64748B' }}>
                                  + {pecas.length - PECAS_VISIVEIS} {pecas.length - PECAS_VISIVEIS === 1 ? 'peça' : 'peças'} · abra a OS para ver todas
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Rodapé: Serviço + Peças = Total */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 18, flexWrap: 'wrap', padding: '11px 18px 11px 22px', borderTop: '1px solid #F1F5F9', background: 'var(--portal-bg-secondary)' }}>
                          {pecasTotal > 0 && (<>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ ...lbl, color: '#2563EB' }}>Serviço</span>
                              <b style={{ ...totNum, color: '#1D4ED8' }}>{formatCurrency(maoObra)}</b>
                            </div>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#CBD5E1' }}>+</span>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ ...lbl, color: '#EA580C' }}>Peças</span>
                              <b style={{ ...totNum, color: '#C2410C' }}>{formatCurrency(pecasTotal)}</b>
                            </div>
                            <span style={{ fontSize: 15, fontWeight: 700, color: '#CBD5E1' }}>=</span>
                          </>)}
                          <div style={{ textAlign: 'right', padding: '6px 16px', borderRadius: 10, background: '#dc2626', minWidth: 130 }}>
                            <span style={{ ...lbl, color: '#FECACA' }}>Total</span>
                            <b style={{ fontSize: 18, fontWeight: 800, color: '#fefefe', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totalGeral)}</b>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                )}

                </>)}

                {/* BALCÃO: pedidos de peças sem OS ligada */}
                {osColuna === 'balcao' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Package size={18} color="#C2410C" /> Peças de balcão ({pvsBalcao.length})
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--portal-text-muted)' }}>pedidos sem OS ligada</span>
                    </div>
                    <button onClick={() => abrirAnexar('pv')}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 8, border: '1px solid #FED7AA', background: '#FFF7ED', color: '#EA580C', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <Plus size={14} /> Anexar PV
                    </button>
                  </div>
                  {/* filtro por situação */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                    {([
                      { id: 'todos', label: 'Todos', n: pvsSemOS.length },
                      { id: 'faturados', label: 'Faturados', n: pvsSemOS.filter(pv => situacaoPV(pv) === 'faturados').length },
                      { id: 'abertos', label: 'Em aberto', n: pvsSemOS.filter(pv => situacaoPV(pv) === 'abertos').length },
                      { id: 'cancelados', label: 'Cancelados', n: pvsSemOS.filter(pv => situacaoPV(pv) === 'cancelados').length },
                    ] as const).map(f => {
                      const on = balcaoFiltro === f.id
                      return (
                        <button key={f.id} onClick={() => setBalcaoFiltro(f.id)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, border: `1px solid ${on ? '#C2410C' : '#E5E7EB'}`, background: on ? '#FFF7ED' : 'var(--portal-bg-card)', color: on ? '#C2410C' : 'var(--portal-text-secondary)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                          {f.label} <span style={{ opacity: 0.7 }}>{f.n}</span>
                        </button>
                      )
                    })}
                  </div>
                  {pvsBalcao.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 13, border: '1px dashed var(--portal-border)', borderRadius: 12 }}>Nenhum pedido de balcão{balcaoFiltro !== 'todos' ? ' com esse filtro' : ''}.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 12 }}>
                      {pvsBalcao.map((pv, pi) => {
                        const st = pv.cancelado ? { rot: 'Cancelado', cor: '#B91C1C', fundo: '#FEF2F2', borda: '#FECACA' }
                          : pv.faturado ? { rot: 'Faturado', cor: '#047857', fundo: '#ECFDF5', borda: '#A7F3D0' }
                          : { rot: pv.etapa || 'Em aberto', cor: '#B45309', fundo: '#FFFBEB', borda: '#FDE68A' }
                        const nf = fmtNF(pv.numero_nf || pv.financeiro?.num_nf_peca)
                        const temNF = !!(pv.link_nf || pv.financeiro?.nf_peca)
                        const qtdItens = (pv.itens || []).length
                        return (
                          <div key={`${pv.empresa}-${pv.num_pedido}`} className="cli-card" onClick={() => setModalPV(pv)}
                            style={{ position: 'relative', border: '1px solid #E5E7EB', borderRadius: 14, background: 'var(--portal-bg-card)', cursor: 'pointer', overflow: 'hidden', boxShadow: '0 1px 2px rgba(16,24,40,0.05)', transition: 'all 0.15s', animationDelay: `${Math.min(pi * 30, 300)}ms` }}
                            onMouseEnter={ev => { ev.currentTarget.style.boxShadow = '0 8px 20px rgba(16,24,40,0.10)'; ev.currentTarget.style.transform = 'translateY(-1px)' }}
                            onMouseLeave={ev => { ev.currentTarget.style.boxShadow = '0 1px 2px rgba(16,24,40,0.05)'; ev.currentTarget.style.transform = 'none' }}>
                            <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: st.cor }} />
                            <div style={{ padding: '14px 16px 12px 20px' }}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                  <span style={{ width: 36, height: 36, borderRadius: 10, background: '#FFF7ED', color: '#C2410C', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Package size={17} /></span>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>
                                      PV {pv.num_pedido}{/castro/i.test(pv.empresa) && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: '#1D4ED8' }}>CASTRO</span>}
                                    </div>
                                    <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 1 }}>{formatDate(pv.data_previsao || pv.data_inclusao)} · {qtdItens} {qtdItens === 1 ? 'item' : 'itens'}</div>
                                  </div>
                                </div>
                                <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: st.cor, background: st.fundo, border: `1px solid ${st.borda}`, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap' }}>{st.rot}</span>
                              </div>
                              {(pv.itens || []).length > 0 && (
                                <div style={{ fontSize: 12.5, color: '#475569', marginTop: 10, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.45 }}>
                                  {(pv.itens || []).slice(0, 3).map((it: { descricao?: string; desc?: string }) => it.descricao || it.desc).filter(Boolean).join(' · ')}{qtdItens > 3 ? ` · +${qtdItens - 3}` : ''}
                                </div>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 16px 9px 20px', borderTop: '1px solid #F1F5F9', background: 'var(--portal-bg-secondary)' }}>
                              {pv.cancelado ? <span style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>sem nota</span>
                                : temNF ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: '#047857' }}><Check size={12} strokeWidth={3} /> NF-e {nf || 'anexada'}</span>
                                : pv.nf_motivo ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: '#B91C1C' }}><X size={12} strokeWidth={3} /> NF recusada</span>
                                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: '#B45309' }}><Clock size={12} /> {pv.faturado ? 'sem NF na pasta' : 'aguardando faturar'}</span>}
                              <span style={{ fontSize: 16, fontWeight: 800, color: '#C2410C', fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(pv.valor_total || 0)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
                )}
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
            <div className="cli-mpad" style={{ background: 'var(--portal-bg-card)', borderRadius: 16, width: 440, maxWidth: '95vw', padding: 26 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>Marcar NF como substituída</h2>
                <button onClick={() => setSubNF(null)} style={{ background: 'var(--portal-bg-secondary)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} color="#6B7280" /></button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--portal-text-secondary)', margin: '0 0 18px' }}>
                OS {subNF.osNum}. Registra a troca (nº antigo → novo) no histórico. O cancelamento/emissão da nota em si é feito no Omie.
              </p>

              <div style={{ marginBottom: 14 }}>
                <label style={lblModal}>QUAL NOTA</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([['servico', 'Serviço'], ['peca', 'Peça']] as const).map(([v, lbl]) => (
                    <button key={v} onClick={() => setSubNF({ ...subNF, nf_tipo: v })}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        border: subNF.nf_tipo === v ? '2px solid #2563EB' : '1px solid #E5E7EB',
                        background: subNF.nf_tipo === v ? '#EFF6FF' : '#fff', color: subNF.nf_tipo === v ? '#1D4ED8' : 'var(--portal-text-secondary)' }}>
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
                  style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid #E5E7EB', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
                <button onClick={salvarSubstituicao} disabled={subSalvando || !subNF.num_novo.trim()}
                  style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: subNF.num_novo.trim() ? '#2563EB' : 'var(--portal-text-muted)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: subSalvando ? 'wait' : 'pointer' }}>
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
            <div className="cli-mpad" style={{ background: 'var(--portal-bg-card)', borderRadius: 16, width: 460, maxWidth: '95vw', padding: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>
                  Anexar {showAnexar === 'os' ? 'Ordem de Serviço' : 'Pedido de Venda'}
                </h2>
                <button onClick={() => setShowAnexar(null)} style={{ background: 'var(--portal-bg-secondary)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} color="#6B7280" /></button>
              </div>
              <p style={{ fontSize: 13, color: 'var(--portal-text-secondary)', margin: '0 0 18px' }}>
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
                  <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginTop: 4 }}>Se informar, eu puxo o PV do Omie e deixo ligado a esta OS na pasta.</div>
                </div>
              )}

              {showAnexar === 'os' && (
                <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 16, padding: '10px 12px', borderRadius: 10, border: `1px solid ${anexInterno ? '#A7F3D0' : 'var(--portal-border)'}`, background: anexInterno ? '#ECFDF5' : '#F9FAFB', cursor: 'pointer' }}>
                  <input type="checkbox" checked={anexInterno} onChange={e => setAnexInterno(e.target.checked)} style={{ width: 16, height: 16, marginTop: 1, accentColor: '#059669', cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--portal-text)', fontWeight: 600, lineHeight: 1.35 }}>
                    Serviço interno (sem NF de serviço)
                    <span style={{ display: 'block', fontSize: 11, fontWeight: 400, color: 'var(--portal-text-secondary)', marginTop: 2 }}>Não busco nota no Omie. Anexe o recibo no lugar das NFs, se quiser.</span>
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

              <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginBottom: 14 }}>Empresa: <strong>{selectedCliente?.empresa}</strong></div>

              {anexErro && <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 14 }}>{anexErro}</div>}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button onClick={() => setShowAnexar(null)} disabled={anexando} style={{ padding: '11px 22px', borderRadius: 10, border: '1px solid #E5E7EB', background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
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
              <div className="cli-modal" style={{ background: 'var(--portal-bg-card)', borderRadius: 16, width: '92%', maxWidth: 860, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
                onClick={e => e.stopPropagation()}>

                {/* Fechar — preso no topo da janela mesmo rolando o conteúdo */}
                <div style={{ position: 'sticky', top: 0, height: 0, zIndex: 5 }}>
                  <button onClick={() => setModalOS(null)} title="Fechar"
                    style={{ position: 'absolute', top: 10, right: 10, width: 32, height: 32, background: 'var(--portal-bg-card)', border: '1px solid #E5E7EB', borderRadius: '50%', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', boxShadow: '0 2px 8px rgba(16,24,40,0.15)' }}>
                    <X size={16} />
                  </button>
                </div>

                {/* Header — estilo documento (formal) */}
                <div style={{ padding: '22px 64px 18px 28px', borderBottom: '2px solid #0F172A', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, position: 'relative' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--portal-text)' }}>{cli.nome_fantasia || cli.razao_social}</div>
                    <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{formatCNPJ(cli.cnpj_cpf)}{(os.cidade || cli.cidade) ? ` · ${os.cidade || cli.cidade}` : ''}</div>
                    <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
                      {os.projeto && <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #E5E7EB', color: '#475569' }}>{os.projeto}</span>}
                      {os.contrato && <span style={{ fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 8, background: '#F8FAFC', border: '1px solid #E5E7EB', color: '#475569' }}>Contrato: {os.contrato}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.6, color: '#94A3B8' }}>Ordem de Serviço</div>
                    <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--portal-text)', lineHeight: 1, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{os.num_os}</div>
                    <div style={{ marginTop: 8 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '3px 11px', borderRadius: 999, background: os.cancelada ? '#FEE2E2' : os.faturada ? '#DCFCE7' : '#FEF3C7', color: os.cancelada ? '#DC2626' : os.faturada ? '#16A34A' : '#D97706' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />{os.servico_interno && !os.cancelada ? 'Fechado interno' : os.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '24px 28px' }}>
                  {/* Info grid — Valor Total = serviço (OS) + peças (PVs vinculados),
                      que é o mesmo total que vai pro card do financeiro. */}
                  {(() => {
                    const vServico = os.valor_total || 0
                    const vPecas = pvs.reduce((s: number, p: PedidoVenda) => s + (p.valor_total || 0), 0)
                    const vTotal = vServico + vPecas
                    const numNfServ = fmtNF(os.num_nf || os.financeiro?.num_nf_servico) || '—'
                    const numNfPeca = fmtNF(os.financeiro?.num_nf_peca) || pvs.map((p: PedidoVenda) => fmtNF(p.numero_nf)).filter(Boolean).join(', ') || '—'
                    const celulas = [
                      { l: 'Valor total', v: formatCurrency(vTotal), c: '#DC2626', sub: vPecas > 0 ? `Serviço ${formatCurrency(vServico)} · Peças ${formatCurrency(vPecas)}` : null },
                      { l: 'Faturamento', v: formatDate(os.data_faturamento), c: os.faturada ? '#16A34A' : '#94A3B8', sub: null },
                      { l: 'Data prevista', v: formatDate(os.data_previsao), c: undefined, sub: null },
                      { l: 'Técnico', v: os.vendedor || '—', c: undefined, sub: null },
                      { l: 'Cidade', v: os.cidade || cli.cidade || '—', c: undefined, sub: null },
                      { l: 'Data inclusão', v: formatDate(os.data_inclusao), c: undefined, sub: null },
                      { l: 'NF de Serviço', v: numNfServ, c: numNfServ !== '—' ? 'var(--portal-text)' : '#94A3B8', sub: null },
                      { l: 'NF de Peça', v: numNfPeca, c: numNfPeca !== '—' ? 'var(--portal-text)' : '#94A3B8', sub: null },
                      { l: os.projeto ? 'Máquina / Chassi' : 'Contrato', v: os.projeto || os.contrato || '—', c: undefined, sub: null },
                    ]
                    return (
                      <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden', marginBottom: 22, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                        {celulas.map((f, i) => (
                          <div key={i} title={String(f.v)} style={{ padding: '11px 14px', borderRight: i % 3 !== 2 ? '1px solid #F1F5F9' : 'none', borderBottom: i < 6 ? '1px solid #F1F5F9' : 'none', minWidth: 0 }}>
                            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: '#94A3B8' }}>{f.l}</div>
                            <div style={{ fontSize: 14, fontWeight: 600, color: f.c || 'var(--portal-text)', marginTop: 3, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.v}</div>
                            {f.sub && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{f.sub}</div>}
                          </div>
                        ))}
                      </div>
                    )
                  })()}

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
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Solicitacao</div>
                      <div style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--portal-bg-secondary)', border: '1px solid #E5E7EB', fontSize: 14, color: '#1F2937', lineHeight: 1.6 }}>
                        {solicitacao}
                      </div>
                    </div>
                  )}

                  {/* Servicos */}
                  {servicos.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Servicos ({servicos.length})</div>
                      <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
                        {servicos.map((s: any, si: number) => (
                          <div key={si} style={{ padding: '12px 16px', borderBottom: si < servicos.length - 1 ? '1px solid #F3F4F6' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 13, color: 'var(--portal-text)', fontWeight: 500 }}>{s.desc || s.descricao || s.nome || `Servico ${si + 1}`}</div>
                              {(s.qtd ?? s.quantidade) != null && <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 2 }}>Qtd: {s.qtd ?? s.quantidade}</div>}
                            </div>
                            {(s.valor || s.valor_unitario) && (
                              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text)', flexShrink: 0, marginLeft: 16, textAlign: 'right' }}>
                                {formatCurrency(s.valor || s.valor_unitario || 0)}
                                <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', fontWeight: 500 }}>un.</div>
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
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Observacoes</div>
                      <div style={{ padding: '14px 18px', borderRadius: 10, background: '#FFFBEB', border: '1px solid #FDE68A', fontSize: 13, color: '#92400E', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {os.obs}
                      </div>
                    </div>
                  )}

                  {/* Dados adicionais */}
                  {os.dados_adic && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Dados Adicionais</div>
                      <div style={{ padding: '14px 18px', borderRadius: 10, background: 'var(--portal-bg-secondary)', border: '1px solid #E5E7EB', fontSize: 13, color: 'var(--portal-text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                        {os.dados_adic}
                      </div>
                    </div>
                  )}

                  {/* ── Ações, agrupadas por assunto ── */}
                  {(() => {
                    const LBL = { fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 10 }
                    const CARD: React.CSSProperties = { border: '1px solid #E5E7EB', borderRadius: 12, padding: '13px 16px', background: 'var(--portal-bg-card)' }
                    const ROW = { display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' }
                    const BASE = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 15px', borderRadius: 9, fontSize: 13, fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }
                    const GREEN = { ...BASE, border: 'none', background: '#059669', color: '#fff' }
                    const nfServ = os.link_nf || os.financeiro?.nf_servico
                    const numNfServ = fmtNF(os.num_nf || os.financeiro?.num_nf_servico)
                    // Pra VER: PDF já no storage abre direto; senão a rota busca o PDF da NFS-e
                    // no Omie, guarda na pasta e grava na OS (o link salvo costuma ser a
                    // consulta do nfse.gov.br ou da prefeitura, que não abrem aqui).
                    const nfServNoPortal = !!os.link_nf && /supabase\.co\/storage\/.+\.pdf/i.test(os.link_nf)
                    const nfServVer = nfServNoPortal ? os.link_nf : `/api/clientes/nota-servico?empresa=${encodeURIComponent(os.empresa)}&cod_os=${os.cod_os}${numNfServ ? `&num_nf=${encodeURIComponent(numNfServ)}` : ''}`
                    const temNotaServ = !!nfServ || (!!numNfServ && os.faturada && !os.cancelada && !os.servico_interno)
                    const boletos = (os.financeiro?.boleto || '').split(',').map(s => s.trim()).filter(Boolean)
                    return (
                      <div style={{ marginTop: 22, paddingTop: 20, borderTop: '2px solid #0F172A', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Documentos e financeiro</div>

                        {/* DOCUMENTOS E NOTAS — lista no mesmo estilo do status das notas */}
                        {(() => {
                          const BTN_VER: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fefefe', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }
                          const BTN_TROCAR: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'var(--portal-bg-card)', color: '#334155', fontSize: 12.5, fontWeight: 700, cursor: anexNfOS ? 'wait' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }
                          const BTN_ANEXAR: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: '1px solid #F59E0B', background: '#FFFBEB', color: '#B45309', fontSize: 12.5, fontWeight: 700, cursor: anexNfOS ? 'wait' : 'pointer', whiteSpace: 'nowrap' }
                          const LISTA: React.CSSProperties = { border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }
                          const linha = (o: {
                            chave: string; icone: React.ReactNode; cor: string; fundo: string; titulo: string; detalhe: React.ReactNode
                            detalheCor?: string; acoes?: React.ReactNode; extra?: React.ReactNode; primeira?: boolean
                          }) => (
                            <div key={o.chave} style={{ padding: '11px 14px', borderTop: o.primeira ? 'none' : '1px solid #F1F5F9', background: 'var(--portal-bg-card)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <span style={{ width: 34, height: 34, borderRadius: 10, background: o.fundo, color: o.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{o.icone}</span>
                                <div style={{ flex: 1, minWidth: 160 }}>
                                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--portal-text)' }}>{o.titulo}</div>
                                  <div style={{ fontSize: 12, color: o.detalheCor || 'var(--portal-text-muted)', marginTop: 1, lineHeight: 1.4 }}>{o.detalhe}</div>
                                </div>
                                {o.acoes && <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>{o.acoes}</div>}
                              </div>
                              {o.extra && <div style={{ marginLeft: 46, marginTop: 8 }}>{o.extra}</div>}
                            </div>
                          )
                          const trocar = (onPick: (f: File) => void) => (
                            <label title="Enviar outro PDF no lugar desta nota" style={BTN_TROCAR}>
                              {anexNfOS ? <RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} />} {anexNfOS ? 'Enviando...' : 'Trocar PDF'}
                              <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={anexNfOS}
                                onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f) }} />
                            </label>
                          )
                          const verBtn = (titulo: string, nome: string, url: string) => (
                            <button onClick={() => setDocAberto({ titulo, nome, url })} title="Ver, imprimir ou baixar" style={BTN_VER}>
                              <FileText size={14} /> Ver
                            </button>
                          )
                          const urlOS = os.pos_pdf || `/api/clientes/print?tipo=os&cod=${os.cod_os}&empresa=${encodeURIComponent(os.empresa)}`
                          const tituloNfServ = `NF de Serviço${numNfServ ? ` nº ${numNfServ}` : ''}`
                          return (<>
                            {/* DOCUMENTOS */}
                            <div style={CARD}>
                              <div style={LBL}>Documentos</div>
                              <div style={LISTA}>
                                {linha({
                                  chave: 'os', primeira: true, icone: <Wrench size={16} />, cor: '#2563EB', fundo: '#EFF6FF',
                                  titulo: `Ordem de Serviço ${os.num_os}`,
                                  detalhe: os.pos_real ? 'Documento do POS (portal)' : 'PDF oficial do Omie',
                                  acoes: verBtn(`Ordem de Serviço ${os.num_os}`, `OS-${os.num_os}`, urlOS),
                                })}
                                {pvs.map(pv => linha({
                                  chave: `pv-${pv.num_pedido}`, icone: <Package size={16} />, cor: '#EA580C', fundo: '#FFF7ED',
                                  titulo: `Pedido de Venda ${pv.num_pedido}`,
                                  detalhe: `${(pv.itens || []).length} ${(pv.itens || []).length === 1 ? 'item' : 'itens'} · ${formatCurrency(pv.valor_total || 0)}${pv.ppv_real ? ' · PPV do portal' : ''}`,
                                  acoes: verBtn(`Pedido de Venda ${pv.num_pedido}`, `PV-${pv.num_pedido}`, pv.pv_pdf || `/api/clientes/print?tipo=pv&cod=${pv.cod_pedido}&empresa=${encodeURIComponent(pv.empresa)}`),
                                }))}
                              </div>
                            </div>

                            {/* NOTAS FISCAIS */}
                            <div style={CARD}>
                              <div style={LBL}>Notas fiscais</div>
                              <div style={LISTA}>
                                {/* Serviço */}
                                {temNotaServ ? linha({
                                  chave: 'nf-serv', primeira: true, icone: <Check size={16} strokeWidth={3} />, cor: '#059669', fundo: '#ECFDF5',
                                  titulo: tituloNfServ,
                                  detalhe: nfServNoPortal ? 'PDF guardado na pasta' : 'O PDF é buscado no Omie ao abrir',
                                  acoes: <>
                                    {verBtn(`${tituloNfServ} · OS ${os.num_os}`, `NF-servico-${numNfServ || os.num_os}`, nfServVer)}
                                    {os.link_nf && trocar(f => anexarNFservicoNaOS(os, f, { gerarCard: false, substituir: true }))}
                                  </>,
                                }) : os.faturada && !os.cancelada ? linha({
                                  chave: 'nf-serv', primeira: true, icone: <Clock size={15} strokeWidth={2.5} />, cor: '#D97706', fundo: '#FFFBEB',
                                  titulo: 'NF de Serviço', detalhe: 'Não veio do Omie — anexe o PDF da NFS-e', detalheCor: '#92400E',
                                  acoes: (
                                    <label title="Enviar o PDF da NFS-e" style={BTN_ANEXAR}>
                                      <Upload size={14} /> {anexNfOS ? 'Enviando...' : 'Anexar'}
                                      <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={anexNfOS}
                                        onChange={e => { const f = e.target.files?.[0]; if (f) anexarNFservicoNaOS(os, f, { gerarCard: gerarCardFin }) }} />
                                    </label>
                                  ),
                                  extra: os.financeiro ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#047857', fontWeight: 600 }}>
                                      <CheckCircle size={13} /> Já enviado ao financeiro{os.financeiro.id ? ` (#${os.financeiro.id})` : ''}
                                    </span>
                                  ) : (
                                    <label title="Se marcado, ao anexar a nota já cria o card no financeiro" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--portal-text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                                      <input type="checkbox" checked={gerarCardFin} onChange={e => setGerarCardFin(e.target.checked)} style={{ cursor: 'pointer', accentColor: '#B45309' }} />
                                      Ao anexar, enviar para o Financeiro
                                    </label>
                                  ),
                                }) : linha({
                                  chave: 'nf-serv', primeira: true, icone: <FileText size={15} />, cor: '#94A3B8', fundo: 'var(--portal-bg-secondary)',
                                  titulo: 'NF de Serviço', detalhe: 'Sai quando a OS for faturada',
                                })}

                                {/* Peça — uma por PV */}
                                {pvs.map(pv => {
                                  const nfPeca = pv.link_nf || os.financeiro?.nf_peca
                                  const n = fmtNF(pv.numero_nf || os.financeiro?.num_nf_peca)
                                  const tituloPeca = `NF de Peça${n ? ` nº ${n}` : ''}`
                                  if (nfPeca) return linha({
                                    chave: `nf-pv-${pv.num_pedido}`, icone: <Check size={16} strokeWidth={3} />, cor: '#059669', fundo: '#ECFDF5',
                                    titulo: tituloPeca, detalhe: `Pedido de Venda ${pv.num_pedido}`,
                                    acoes: <>
                                      {verBtn(`${tituloPeca} · PV ${pv.num_pedido}`, `NF-peca-${n || pv.num_pedido}`, nfPeca)}
                                      {pv.link_nf && trocar(f => anexarNFpecaNoPV(pv, f, { gerarCard: false, substituir: true }))}
                                    </>,
                                  })
                                  const recusada = !!pv.nf_motivo
                                  return linha({
                                    chave: `nf-pv-${pv.num_pedido}`,
                                    icone: recusada ? <X size={16} strokeWidth={3} /> : <Clock size={15} strokeWidth={2.5} />,
                                    cor: recusada ? '#DC2626' : '#D97706', fundo: recusada ? '#FEF2F2' : '#FFFBEB',
                                    titulo: `NF de Peça · PV ${pv.num_pedido}`,
                                    detalhe: recusada ? `Não autorizada na SEFAZ${pv.nf_status ? ` (status ${pv.nf_status})` : ''}: ${pv.nf_motivo}` : 'Não veio do Omie — anexe o PDF da nota',
                                    detalheCor: recusada ? '#B91C1C' : '#92400E',
                                    acoes: (
                                      <label title={`Enviar o PDF da NF de peça do PV ${pv.num_pedido}. Ao anexar, o card do financeiro é acionado.`}
                                        style={recusada ? { ...BTN_ANEXAR, border: 'none', background: '#B91C1C', color: '#fefefe' } : BTN_ANEXAR}>
                                        <Upload size={14} /> {anexNfOS ? 'Enviando...' : 'Anexar'}
                                        <input type="file" accept="application/pdf" style={{ display: 'none' }} disabled={anexNfOS}
                                          onChange={e => { const f = e.target.files?.[0]; if (f) anexarNFpecaNoPV(pv, f, { gerarCard: true }) }} />
                                      </label>
                                    ),
                                  })
                                })}
                              </div>
                            </div>
                          </>)
                        })()}

                        {/* REGISTROS / CORREÇÕES */}
                        {(() => {
                          const pvDaOS = os.pv_manual || os.num_pedido_cli || ''
                          return (
                            <div style={CARD}>
                              <div style={LBL}>Registros e correções</div>
                              <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
                                {[
                                  {
                                    chave: 'troca-nf', icone: <RefreshCw size={15} />, cor: '#7C3AED', fundo: '#F5F3FF',
                                    titulo: 'Troca de nº da nota',
                                    detalhe: 'A nota foi cancelada e emitida outra? Registre nº antigo → novo (fica no histórico).',
                                    botao: 'Registrar', ocupado: false,
                                    acao: () => setSubNF({ osNum: os.num_os, empresa: os.empresa, nf_tipo: 'servico', num_antigo: numNfServ || '', num_novo: '' }),
                                  },
                                  {
                                    chave: 'troca-pv', icone: <Hash size={15} />, cor: '#0369A1', fundo: '#F0F9FF',
                                    titulo: `Pedido de venda da OS${pvDaOS ? `: ${pvDaOS}` : ''}${os.pv_manual ? ' (manual)' : ''}`,
                                    detalhe: 'O Omie ligou o pedido errado (ou nenhum)? Aponte o PV certo — a NF de peça é buscada nele.',
                                    botao: forcandoCard ? 'Buscando...' : 'Trocar', ocupado: forcandoCard,
                                    acao: () => trocarPVdaOS(os, pvDaOS),
                                  },
                                ].map((l, i) => (
                                  <div key={l.chave} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '11px 14px', borderTop: i ? '1px solid #F1F5F9' : 'none', background: 'var(--portal-bg-card)' }}>
                                    <span style={{ width: 34, height: 34, borderRadius: 10, background: l.fundo, color: l.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{l.icone}</span>
                                    <div style={{ flex: 1, minWidth: 160 }}>
                                      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--portal-text)' }}>{l.titulo}</div>
                                      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 1, lineHeight: 1.4 }}>{l.detalhe}</div>
                                    </div>
                                    <button onClick={l.acao} disabled={l.ocupado}
                                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 8, border: '1px solid #E5E7EB', background: 'var(--portal-bg-card)', color: '#334155', fontSize: 12.5, fontWeight: 700, cursor: l.ocupado ? 'wait' : 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                      {l.botao}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })()}

                        {/* FINANCEIRO */}
                        {boletos.length > 0 && (
                          <div style={CARD}>
                            <div style={LBL}>Financeiro</div>
                            <div style={ROW}>
                              {boletos.map((b: string, bi: number) => (
                                <button key={bi} onClick={() => setDocAberto({ titulo: `Boleto${boletos.length > 1 ? ` ${bi + 1}` : ''} · OS ${os.num_os}`, nome: `Boleto-OS-${os.num_os}${boletos.length > 1 ? `-${bi + 1}` : ''}`, url: b })}
                                  title="Ver o boleto (imprimir ou baixar)" style={GREEN}>
                                  <FileText size={15} /> Boleto{boletos.length > 1 ? ` ${bi + 1}` : ''}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* STATUS PRO FINANCEIRO — o card só nasce com as DUAS notas */}
                        {(() => {
                          const temServ = !!nfServ
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
                          // Uma linha por nota exigida: serviço + uma de peça por PV vinculado
                          const linhas = [
                            { chave: 'serv', titulo: 'NF de Serviço', numero: numNfServ || '', ok: temServ, recusada: false, motivo: '' },
                            ...pvs.map(p => ({
                              chave: `pv-${p.num_pedido}`, titulo: `NF de Peça · PV ${p.num_pedido}`,
                              numero: fmtNF(p.numero_nf || os.financeiro?.num_nf_peca),
                              ok: !!(p.link_nf || os.financeiro?.nf_peca),
                              recusada: !!p.nf_motivo && !p.link_nf, motivo: p.nf_motivo || '',
                            })),
                          ]
                          const prontas = linhas.filter(l => l.ok).length
                          const corBarra = prontas === linhas.length ? '#059669' : prontas > 0 ? '#F59E0B' : '#E5E7EB'
                          return (
                            <div style={CARD}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                                <div style={{ ...LBL, marginBottom: 0 }}>Notas para o financeiro</div>
                                <span style={{ fontSize: 12, fontWeight: 700, color: prontas === linhas.length ? '#047857' : '#92400E', fontVariantNumeric: 'tabular-nums' }}>
                                  {prontas} de {linhas.length} {linhas.length === 1 ? 'nota pronta' : 'notas prontas'}
                                </span>
                              </div>
                              <div style={{ height: 4, borderRadius: 4, background: 'var(--portal-bg-secondary)', overflow: 'hidden', marginBottom: 12 }}>
                                <div style={{ width: `${linhas.length ? (prontas / linhas.length) * 100 : 0}%`, height: '100%', background: corBarra, transition: 'width 0.3s' }} />
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
                                  {linhas.map((l, i) => {
                                    const cor = l.ok ? '#059669' : l.recusada ? '#DC2626' : '#D97706'
                                    const fundo = l.ok ? '#ECFDF5' : l.recusada ? '#FEF2F2' : '#FFFBEB'
                                    const selo = l.ok ? 'Anexada' : l.recusada ? 'Recusada' : 'Faltando'
                                    return (
                                      <div key={l.chave} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderTop: i ? '1px solid #F1F5F9' : 'none', background: 'var(--portal-bg-card)' }}>
                                        <span style={{ width: 30, height: 30, borderRadius: '50%', background: fundo, color: cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                          {l.ok ? <Check size={16} strokeWidth={3} /> : l.recusada ? <X size={16} strokeWidth={3} /> : <Clock size={15} strokeWidth={2.5} />}
                                        </span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--portal-text)' }}>{l.titulo}</div>
                                          <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                            title={l.recusada ? l.motivo : undefined}>
                                            {l.ok ? (l.numero ? `nº ${l.numero}` : 'PDF na pasta')
                                              : l.recusada ? `Não autorizada na SEFAZ: ${l.motivo}`
                                              : 'Anexe o PDF no bloco acima'}
                                          </div>
                                        </div>
                                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase', color: cor, background: fundo, border: `1px solid ${cor}33`, padding: '3px 10px', borderRadius: 999, flexShrink: 0 }}>
                                          {selo}
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>

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
                                        <div><span style={{ fontWeight: 600 }}>NF Serv.:</span> {fmtNF(os.financeiro.num_nf_servico)}</div>
                                      )}
                                      {os.financeiro?.num_nf_peca && (
                                        <div><span style={{ fontWeight: 600 }}>NF Peça:</span> {fmtNF(os.financeiro.num_nf_peca)}</div>
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
        </>)}

        {modalPV && (
          <ModalPedidoVenda pv={pedidos.find(p => p.num_pedido === modalPV.num_pedido && p.empresa === modalPV.empresa) || modalPV} clienteNome={selectedCliente?.nome_fantasia || selectedCliente?.razao_social || ''}
            onFechar={() => setModalPV(null)} onVerDocumento={d => setDocAberto(d)} anexando={anexNfOS}
            onAnexarNF={(f, substituir) => anexarNFpecaNoPV(modalPV, f, { gerarCard: !substituir, substituir })} />
        )}
        <VisualizadorDocumento key={docAberto?.url || ""} doc={docAberto} onClose={fecharDoc} />

        {/* MODAL PROJETO */}
        {modalProjeto && (
          <div className="cli-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setModalProjeto(null)}>
            <div className="cli-modal" style={{ background: 'var(--portal-bg-secondary)', borderRadius: 16, width: '95%', maxWidth: 1100, maxHeight: '92vh', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}
              onClick={ev => ev.stopPropagation()}>

              {/* Header profissional (grafite) */}
              <div style={{ padding: '20px 26px', background: 'linear-gradient(135deg, #1b2230 0%, #2c3648 100%)', color: '#fff', position: 'relative', flexShrink: 0 }}>
                <button onClick={() => setModalProjeto(null)}
                  style={{ position: 'absolute', top: 14, right: 14, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={18} color="#fff" />
                </button>
                {(() => {
                  const md = modalProjetoData || {}
                  const modeloHd = md.chassis?.[0]?.modelo || md.revisoes?.[0]?.Modelo || ''
                  const chassiHd = md.chassis?.[0]?.chassis || ''
                  const donoHd = md.donos?.[0]?.nome || ''
                  const entregaHd = md.revisoes?.[0]?.Entrega || ''
                  const horimetroHd = revHorimetroAtual(md.revisoes?.[0])
                  const chip = (k: string, v: string) => v ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600, padding: '5px 11px', borderRadius: 999, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.14)', color: '#eef1f6' }}>
                      <span style={{ color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>{k}</span> {v}
                    </span>
                  ) : null
                  return (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ width: 50, height: 50, borderRadius: 12, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Wrench size={24} color="#fff" />
                        </div>
                        <div style={{ minWidth: 0, paddingRight: 40 }}>
                          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.15 }}>{modalProjeto}</div>
                          <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.66)', marginTop: 2 }}>{modalProjetoEmpresa || cli?.empresa || ''}{modeloHd ? ` · ${modeloHd}` : ''}</div>
                        </div>
                      </div>
                      {(chassiHd || entregaHd || donoHd || horimetroHd) && (
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                          {chip('Chassi', chassiHd)}
                          {chip('Entrega', entregaHd)}
                          {chip('Dono atual', donoHd)}
                          {chip('Horímetro', horimetroHd ? `${horimetroHd} h` : '')}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>

              {modalProjetoLoading ? (
                <div style={{ padding: 80, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 15 }}>
                  <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
                  <div>Carregando projeto...</div>
                </div>
              ) : !modalProjetoData ? (
                <div style={{ padding: 80, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 15 }}>Erro ao carregar projeto</div>
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
                    {/* Tabs — estilo navegador (Chrome) */}
                    <div style={{ display: 'flex', gap: 4, padding: '10px 14px 0', borderBottom: '1px solid #E5E7EB', background: '#F1F5F9', flexShrink: 0, overflowX: 'auto' }}>
                      {tabs.map(t => {
                        const on = projetoTab === t.id
                        return (
                          <button key={t.id} onClick={() => setProjetoTab(t.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
                              border: '1px solid', borderColor: on ? 'var(--portal-border)' : 'transparent',
                              borderBottom: on ? '1px solid #fff' : '1px solid transparent',
                              borderRadius: '10px 10px 0 0', background: on ? '#fff' : 'transparent',
                              cursor: 'pointer', fontSize: 13, fontWeight: on ? 700 : 500,
                              color: on ? '#2563EB' : 'var(--portal-text-secondary)', transition: 'all 0.15s', whiteSpace: 'nowrap',
                              position: 'relative', top: 1, marginBottom: -1,
                            }}>
                            <t.icon size={15} />
                            {t.label}
                            {t.count !== null && t.count > 0 && (
                              <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 10, background: on ? '#EFF6FF' : 'var(--portal-border)', color: on ? '#2563EB' : 'var(--portal-text-muted)', fontWeight: 700 }}>
                                {t.count}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px', background: 'var(--portal-bg-card)' }}>

                      {/* ─── RESUMO ─── */}
                      {projetoTab === 'resumo' && (() => {
                        const donoAtual = donosList[0]
                        const chassiP = chassis[0]
                        const trator = revList[0]
                        const modelo = chassiP?.modelo || trator?.Modelo || '—'
                        const investido = (resumo.valor_total_os || 0) + (resumo.valor_total_pv || 0)
                        const ultimosSvc = [...servicosAgrupados].sort((a, b) => String(b.data || '').localeCompare(String(a.data || ''))).slice(0, 4)
                        const ultimaVisita = ultimosSvc[0]?.data || osProj[0]?.data_previsao || ''
                        const horimetro = revHorimetroAtual(trator)
                        const proxRev = revProxima(trator)
                        const iniciais = (donoAtual?.nome || '?').trim().split(/\s+/).slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
                        const card: React.CSSProperties = { border: '1px solid #E6E9EF', borderRadius: 13, background: 'var(--portal-bg-card)', overflow: 'hidden' }
                        const cardTtl: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#3f4855', padding: '11px 16px', borderBottom: '1px solid #EEF1F5', background: '#F7F8FA' }
                        const lab: React.CSSProperties = { fontSize: 9.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--portal-text-muted)' }
                        const val: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#14171d', marginTop: 3 }
                        const secTtl: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--portal-text-muted)', margin: '22px 0 12px' }
                        return (
                          <div>
                            {/* Identificação + Dono atual */}
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr', gap: 14 }}>
                              <div style={card}>
                                <div style={cardTtl}>Identificação</div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                                  {[
                                    { l: 'Modelo', v: modelo },
                                    { l: 'Chassi', v: chassiP?.chassis || '—', mono: true },
                                    { l: 'Ano', v: trator?.Ano || '—' },
                                    { l: 'Número do motor', v: trator?.Numero_Motor || '—', mono: true },
                                    { l: 'Data de entrega', v: trator?.Entrega || '—' },
                                    { l: 'Vendedor', v: trator?.Vendedor || osProj[0]?.vendedor || '—' },
                                  ].map((f, i) => (
                                    <div key={i} style={{ padding: '11px 16px', borderRight: i % 2 === 0 ? '1px solid #EEF1F5' : 'none', borderBottom: i < 4 ? '1px solid #EEF1F5' : 'none', minWidth: 0 }}>
                                      <div style={lab}>{f.l}</div>
                                      <div style={{ ...val, fontFamily: f.mono ? 'monospace' : undefined, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.v}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div style={{ ...card, padding: 16 }}>
                                <div style={{ ...lab, marginBottom: 12 }}>Dono atual</div>
                                {donoAtual ? (
                                  <>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                      <div style={{ width: 44, height: 44, borderRadius: 11, background: '#EEF4FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, flexShrink: 0 }}>{iniciais}</div>
                                      <div style={{ minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 15, fontWeight: 600, color: '#14171d' }}>{donoAtual.nome || 'Cliente'}</span><span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: '#E9FAF3', color: '#059669' }}>ATUAL</span></div>
                                        <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 1 }}>Cliente desde {formatDate(donoAtual.primeira_os)}</div>
                                      </div>
                                    </div>
                                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #EEF1F5' }}>
                                      {[
                                        { l: 'CPF / CNPJ', v: donoAtual.cnpj_cpf ? formatCNPJ(donoAtual.cnpj_cpf) : '—', mono: true, copy: '' },
                                        { l: 'Cidade', v: donoAtual.cidade ? `${donoAtual.cidade}/${donoAtual.estado}` : '—', copy: '' },
                                        { l: 'Endereço', v: donoAtual.endereco ? `${donoAtual.endereco}${donoAtual.bairro ? ', ' + donoAtual.bairro : ''}` : '—', copy: '' },
                                        { l: 'Telefone', v: donoAtual.telefone || '—', copy: donoAtual.telefone || '' },
                                        { l: 'E-mail', v: donoAtual.email || '—', copy: donoAtual.email || '' },
                                        { l: 'Período como dono', v: `${formatDate(donoAtual.primeira_os)} — ${formatDate(donoAtual.ultima_os)}`, copy: '' },
                                      ].map((f, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '6px 0' }}>
                                          <span style={{ fontSize: 11, color: 'var(--portal-text-muted)', flexShrink: 0 }}>{f.l}</span>
                                          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#14171d', textAlign: 'right', display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, fontFamily: f.mono ? 'monospace' : undefined }}>
                                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.v}</span>
                                            {f.copy ? <button onClick={e => copiarContato(e, f.copy)} title="Copiar" style={{ ...btnCopiar, color: copiadoContato === f.copy ? '#16a34a' : 'var(--portal-text-muted)' }}>{copiadoContato === f.copy ? <Check size={12} /> : <Copy size={12} />}</button> : null}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                    <div style={{ display: 'flex', gap: 18, marginTop: 14, paddingTop: 12, borderTop: '1px solid #EEF1F5' }}>
                                      <div><div style={{ fontSize: 16, fontWeight: 600, color: '#14171d' }}>{donoAtual.total_os}</div><div style={{ fontSize: 10, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>OS deste dono</div></div>
                                      <div><div style={{ fontSize: 16, fontWeight: 600, color: '#059669' }}>{formatCurrency(donoAtual.total_valor)}</div><div style={{ fontSize: 10, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>Faturado</div></div>
                                      <div><div style={{ fontSize: 16, fontWeight: 600, color: '#14171d' }}>{donosList.length}</div><div style={{ fontSize: 10, color: 'var(--portal-text-muted)', textTransform: 'uppercase' }}>Donos</div></div>
                                    </div>
                                  </>
                                ) : <div style={{ fontSize: 13, color: 'var(--portal-text-muted)' }}>Sem dono registrado</div>}
                              </div>
                            </div>

                            {/* KPIs */}
                            <div style={secTtl}>Visão geral</div>
                            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 12 }}>
                              {[
                                { l: 'Ordens de serviço', v: String(resumo.total_os || 0), s: `${resumo.os_faturadas || 0} faturadas`, c: '#2563EB', small: false },
                                { l: 'Investido na máquina', v: formatCurrency(investido), s: 'Serviços + peças', c: '#059669', small: false },
                                { l: 'Última visita', v: formatDate(ultimaVisita) || '—', s: ultimosSvc[0] ? `OS ${ultimosSvc[0].num_os}` : '', c: '#14171d', small: true },
                                { l: 'Próxima revisão', v: proxRev || (trator ? 'em dia' : '—'), s: proxRev && horimetro ? `atual ${horimetro} h` : '', c: '#d97706', small: true },
                              ].map((k, i) => (
                                <div key={i} style={{ border: '1px solid #E6E9EF', borderRadius: 13, padding: '14px 16px' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--portal-text-muted)', textTransform: 'uppercase', letterSpacing: 0.4, fontWeight: 700 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: k.c }} />{k.l}</div>
                                  <div style={{ fontSize: k.small ? 17 : 22, fontWeight: 600, marginTop: 7, color: k.c }}>{k.v}</div>
                                  {k.s && <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginTop: 2 }}>{k.s}</div>}
                                </div>
                              ))}
                            </div>

                            {/* Plano de revisões */}
                            {trator && (
                              <>
                                <div style={secTtl}>Plano de revisões</div>
                                <div style={{ border: '1px solid #E6E9EF', borderRadius: 13, padding: 16 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                    <div style={{ fontSize: 13, color: '#3f4855' }}>Horímetro atual: <b style={{ fontSize: 15, color: '#14171d' }}>{horimetro ? `${horimetro} h` : '—'}</b></div>
                                    {trator.Entrega && <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>Entrega em {trator.Entrega}</div>}
                                  </div>
                                  <div style={{ display: 'flex', overflowX: 'auto', paddingBottom: 4 }}>
                                    {REVISOES_HORAS.map((h: string, i: number) => {
                                      const data = trator[`${h} Data`]
                                      const done = !!data
                                      const isNext = h === proxRev
                                      return (
                                        <div key={h} style={{ flex: 1, minWidth: 64, textAlign: 'center', position: 'relative' }}>
                                          {i > 0 && <div style={{ position: 'absolute', top: 15, left: '-50%', width: '100%', height: 2, background: done ? '#059669' : '#E6E9EF' }} />}
                                          <div style={{ width: 32, height: 32, borderRadius: '50%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, position: 'relative', zIndex: 1, border: `2px solid ${done ? '#059669' : isNext ? '#d97706' : '#E6E9EF'}`, background: done ? '#059669' : isNext ? '#FEF6E7' : '#fff', color: done ? '#fff' : isNext ? '#d97706' : 'var(--portal-text-muted)' }}>
                                            {done ? <CheckCircle size={15} /> : h.replace('h', '')}
                                          </div>
                                          <div style={{ fontSize: 10.5, fontWeight: 600, marginTop: 6, color: isNext ? '#d97706' : '#3f4855' }}>{h}</div>
                                          <div style={{ fontSize: 9.5, color: 'var(--portal-text-muted)', marginTop: 1 }}>{done ? formatDate(data) : (isNext ? 'prevista' : '—')}</div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              </>
                            )}

                            {/* Últimos serviços */}
                            {ultimosSvc.length > 0 && (
                              <>
                                <div style={secTtl}>Últimos serviços</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  {ultimosSvc.map((s, i) => (
                                    <div key={i} onClick={() => irParaServico(s.num_os)}
                                      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 14px', border: '1px solid #E6E9EF', borderRadius: 11, cursor: 'pointer', background: 'var(--portal-bg-card)' }}
                                      onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563EB'; e.currentTarget.style.background = '#EEF4FF' }}
                                      onMouseLeave={e => { e.currentTarget.style.borderColor = '#E6E9EF'; e.currentTarget.style.background = '#fff' }}>
                                      <span style={{ fontSize: 13, fontWeight: 600, color: '#2563EB', minWidth: 64 }}>OS {s.num_os}</span>
                                      <span style={{ flex: 1, fontSize: 12.5, color: '#3f4855', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{s.linhas?.[0]?.desc || s.status || '-'}</span>
                                      <span style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{formatDate(s.data)}</span>
                                      <span style={{ fontSize: 13, fontWeight: 600, color: '#14171d', minWidth: 96, textAlign: 'right' }}>{formatCurrency(s.valor || 0)}</span>
                                    </div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        )
                      })()}

                      {/* ─── DONOS ─── */}
                      {projetoTab === 'donos' && (
                        <div>
                          <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', marginBottom: 16 }}>Clientes que tiveram servicos faturados neste projeto</div>
                          {donosList.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 14 }}>Nenhum dono encontrado</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {donosList.map((dono: any, di: number) => {
                                const aberto = donoAberto === dono.cod_cli
                                const oss = osDoDono(dono.cod_cli)
                                return (
                                <div key={di} style={{ border: '1px solid #E5E7EB', borderRadius: 12, background: 'var(--portal-bg-card)', overflow: 'hidden' }}>
                                  <div onClick={() => setDonoAberto(aberto ? null : dono.cod_cli)} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px', cursor: 'pointer', background: aberto ? '#F8FAFC' : '#fff' }}>
                                    <div style={{
                                      width: 48, height: 48, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                      background: di === 0 ? '#EFF6FF' : '#F9FAFB',
                                    }}>
                                      <User size={22} color={di === 0 ? '#2563EB' : 'var(--portal-text-muted)'} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--portal-text)' }}>{dono.nome || 'Cliente sem nome'}</span>
                                        {di === 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}>ATUAL</span>}
                                      </div>
                                      <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', marginTop: 2, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                        {dono.cnpj_cpf && <span>{formatCNPJ(dono.cnpj_cpf)}</span>}
                                        {dono.cidade && <span>{dono.cidade}/{dono.estado}</span>}
                                      </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>{dono.total_os} OS</div>
                                      <div style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>{formatCurrency(dono.total_valor)}</div>
                                      <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginTop: 2 }}>{formatDate(dono.primeira_os)} — {formatDate(dono.ultima_os)}</div>
                                    </div>
                                    {aberto ? <ChevronUp size={18} color="#9CA3AF" /> : <ChevronDown size={18} color="#9CA3AF" />}
                                  </div>
                                  {aberto && (
                                    <div style={{ borderTop: '1px solid #E5E7EB', background: 'var(--portal-bg-secondary)', padding: '8px' }}>
                                      <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, padding: '6px 10px' }}>Ordens de serviço deste dono</div>
                                      {oss.length === 0 ? (
                                        <div style={{ padding: '10px', fontSize: 13, color: 'var(--portal-text-muted)' }}>Nenhuma OS</div>
                                      ) : oss.map((os: any, oi: number) => (
                                        <div key={oi} onClick={() => irParaServico(os.num_os)} title="Ver detalhes do serviço"
                                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', background: 'var(--portal-bg-card)', border: '1px solid #EEF0F3', marginBottom: 6 }}
                                          onMouseEnter={e => { e.currentTarget.style.borderColor = '#BFDBFE'; e.currentTarget.style.background = '#F8FAFF' }}
                                          onMouseLeave={e => { e.currentTarget.style.borderColor = '#EEF0F3'; e.currentTarget.style.background = '#fff' }}>
                                          <span style={{ fontSize: 13, fontWeight: 700, color: '#2563EB', minWidth: 70 }}>OS {os.num_os}</span>
                                          <span style={{ flex: 1, fontSize: 12, color: 'var(--portal-text-secondary)' }}>{os.status || '-'}</span>
                                          <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>{formatDate(os.data_previsao || os.data_inclusao)}</span>
                                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text)', minWidth: 90, textAlign: 'right' }}>{formatCurrency(os.valor_total || 0)}</span>
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
                            <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 14 }}>Nenhum servico encontrado</div>
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
                                    style={{ border: '1px solid #E5E7EB', borderRadius: 10, background: 'var(--portal-bg-card)', cursor: 'pointer', overflow: 'hidden', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#BFDBFE'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(37,99,235,0.08)' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--portal-border)'; e.currentTarget.style.boxShadow = 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', gap: 12 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                        <Wrench size={15} color="#2563EB" style={{ flexShrink: 0 }} />
                                        <span style={{ fontWeight: 700, color: '#2563EB', fontSize: 13, flexShrink: 0 }}>OS {g.num_os}</span>
                                        {temPV && <span style={{ fontSize: 11, color: '#EA580C', fontWeight: 600, flexShrink: 0 }}>+ PV {pvRefNum}</span>}
                                        <span style={{ color: 'var(--portal-text-secondary)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.cliente || '-'}</span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                                        <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>{formatDate(g.data)}</span>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)' }}>{formatCurrency((g.valor || 0) + valorPecas)}</span>
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
                            <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 14 }}>
                              Nenhuma peça avulsa. Peças vinculadas a OS aparecem na aba Serviços.
                            </div>
                          ) : (
                            <div style={{ border: '1px solid #E5E7EB', borderRadius: 10, overflow: isMobile ? 'auto' : 'hidden', background: 'var(--portal-bg-card)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 140px 80px 120px', minWidth: isMobile ? 560 : undefined, padding: '10px 16px', background: 'var(--portal-bg-secondary)', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: 'var(--portal-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                                <span>Pedido</span><span>Itens</span><span>Cliente</span><span style={{ textAlign: 'center' }}>Qtd</span><span style={{ textAlign: 'right' }}>Total</span>
                              </div>
                              {pecasAgrupadas.map((g: any, gi: number) => (
                                <div key={gi} onClick={() => setPedidoModalNum(String(g.num_pv))} title="Ver detalhes do pedido"
                                  style={{ display: 'grid', gridTemplateColumns: '110px 1fr 140px 80px 120px', minWidth: isMobile ? 560 : undefined, padding: '12px 16px', borderBottom: `1px solid ${ln2}`, fontSize: 13, color: 'var(--portal-text)', alignItems: 'center', cursor: 'pointer' }}
                                  onMouseEnter={e => { e.currentTarget.style.background = '#FFFBF5' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                                  <span style={{ fontWeight: 700, color: '#EA580C' }}>PV {g.num_pv}</span>
                                  <span style={{ color: 'var(--portal-text)', fontSize: 12 }}>
                                    {g.itens.length} {g.itens.length === 1 ? 'item' : 'itens'}
                                    <span style={{ color: 'var(--portal-text-muted)' }}> — {(g.itens[0]?.desc || '').slice(0, 55)}{(g.itens[0]?.desc || '').length > 55 ? '…' : ''}</span>
                                  </span>
                                  <span style={{ color: 'var(--portal-text-secondary)', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.cliente || '-'}</span>
                                  <span style={{ textAlign: 'center', fontSize: 12, color: 'var(--portal-text-secondary)' }}>{g.qtd}</span>
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
                            <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 14 }}>Nenhuma requisicao encontrada</div>
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
                                    style={{ padding: '14px 18px', border: `1px solid ${r.match_chassis ? '#BFDBFE' : 'var(--portal-border)'}`, borderRadius: 10, background: 'var(--portal-bg-card)', cursor: 'pointer', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = r.match_chassis ? '#BFDBFE' : 'var(--portal-border)'; e.currentTarget.style.boxShadow = 'none' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)' }}>#{r.id}</span>
                                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: sc.bg, color: sc.c, border: `1px solid ${sc.b}` }}>{r.status}</span>
                                        <span style={{ fontSize: 12, padding: '2px 8px', borderRadius: 5, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)' }}>{r.tipo}</span>
                                      </div>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {r.valor_despeza && parseFloat(r.valor_despeza) > 0 && <span style={{ fontSize: 13, color: '#059669', fontWeight: 700 }}>{formatCurrency(parseFloat(r.valor_despeza))}</span>}
                                        <ChevronRight size={15} color="#C4C9D2" />
                                      </div>
                                    </div>
                                    <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>{r.titulo || '-'}</div>
                                    <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 4 }}>
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
                            <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 14 }}>Nenhuma revisao encontrada para os chassis deste projeto</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                              {revList.map((t: any, ti: number) => {
                                const revisoesDone = REVISOES_HORAS.filter(h => t[`${h} Data`])
                                const proximaRevisao = REVISOES_HORAS.find(h => !t[`${h} Data`])
                                return (
                                  <div key={ti} onClick={() => setRevModal(t)}
                                    style={{ border: '1px solid #E5E7EB', borderRadius: 12, background: 'var(--portal-bg-card)', overflow: 'hidden', cursor: 'pointer', transition: 'all 0.15s' }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)' }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--portal-border)'; e.currentTarget.style.boxShadow = 'none' }}>
                                    <div style={{ padding: '14px 20px', borderBottom: '1px solid #F3F4F6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <div>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--portal-text)' }}>{t.Modelo || '-'}</div>
                                        <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', marginTop: 2 }}>Chassis: <span style={{ fontFamily: 'monospace' }}>{t.Chassis || '-'}</span> — Cliente: {t.Cliente || '-'}</div>
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
                                            background: done ? '#ECFDF5' : '#F9FAFB', color: done ? '#059669' : '#D1D5DB', border: `1px solid ${done ? '#A7F3D0' : 'var(--portal-border)'}`,
                                          }}>
                                            <div>{h}</div>
                                            {done && <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--portal-text-secondary)', marginTop: 2 }}>{data}</div>}
                                            {horim && <div style={{ fontSize: 10, color: 'var(--portal-text-muted)' }}>{horim}h</div>}
                                          </div>
                                        )
                                      })}
                                    </div>
                                    {(t.Entrega || t["Inspecao Data"]) && (
                                      <div style={{ padding: '10px 20px', borderTop: '1px solid #F3F4F6', display: 'flex', gap: 20, fontSize: 12, color: 'var(--portal-text-secondary)' }}>
                                        {t.Entrega && <span>Entrega: <strong style={{ color: 'var(--portal-text)' }}>{t.Entrega}</strong></span>}
                                        {t["Inspecao Data"] && <span>Inspecao: <strong style={{ color: 'var(--portal-text)' }}>{t["Inspecao Data"]}</strong></span>}
                                        {t["Inspecao Horimetro"] && <span>Horimetro inspecao: <strong style={{ color: 'var(--portal-text)' }}>{t["Inspecao Horimetro"]}h</strong></span>}
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
                          <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', marginBottom: 16 }}>Emails relacionados aos chassis deste projeto</div>
                          {totalEmails === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 14 }}>Nenhum email de garantia encontrado</div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                              {Object.entries(emailsList).map(([ch, emails]: [string, any]) => (
                                <div key={ch}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Hash size={13} color="#2563EB" /> Chassis {ch} ({emails.length} emails)
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {emails.map((e: any, ei: number) => (
                                      <div key={ei} style={{ padding: '12px 16px', border: '1px solid #E5E7EB', borderRadius: 10, background: 'var(--portal-bg-card)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <Mail size={14} color="#6B7280" />
                                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text)' }}>{e.assunto || e.subject || 'Sem assunto'}</span>
                                          </div>
                                          <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>{e.data ? new Date(e.data).toLocaleDateString('pt-BR') : '-'}</span>
                                        </div>
                                        <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)' }}>De: {e.de || e.from || '-'}</div>
                                        {e.anexos && e.anexos.length > 0 && (
                                          <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                                            {e.anexos.map((a: any, ai: number) => (
                                              <a key={ai} href={a.url || a.link || '#'} target="_blank" rel="noopener noreferrer"
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 8px', borderRadius: 5, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', textDecoration: 'none', border: '1px solid #E5E7EB' }}>
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
                          <div style={{ background: 'var(--portal-bg-card)', borderRadius: 18, width: 720, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
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
                                  <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Valor total</div>
                                  <div style={{ fontSize: 27, fontWeight: 800, color: 'var(--portal-text)', lineHeight: 1.15 }}>{formatCurrency(total)}</div>
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
                                  <div key={i} style={{ padding: '11px 15px', background: 'var(--portal-bg-card)', border: '1px solid #EEF0F3', borderRadius: 11 }}>
                                    <div style={{ fontSize: 10.5, color: 'var(--portal-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>{f.l}</div>
                                    <div style={{ fontSize: 14, color: 'var(--portal-text)', fontWeight: 600, wordBreak: 'break-word' }}>{f.v}</div>
                                  </div>
                                ))}
                                {/* Pedido vinculado (link) ocupando a linha toda */}
                                <div style={{ gridColumn: '1 / -1', padding: '11px 15px', background: pedidoEhPV ? '#EFF6FF' : '#fff', border: `1px solid ${pedidoEhPV ? '#BFDBFE' : '#EEF0F3'}`, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                  <div>
                                    <div style={{ fontSize: 10.5, color: 'var(--portal-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>Nº do Pedido do Cliente</div>
                                    <div style={{ fontSize: 14, color: 'var(--portal-text)', fontWeight: 700 }}>{pedido || '—'}</div>
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
                                  <div style={{ fontSize: 11.5, color: 'var(--portal-text)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 9 }}>Anexos</div>
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

                              <div style={{ fontSize: 11.5, color: 'var(--portal-text)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 9 }}>Serviços ({linhas.length})</div>
                              <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: isMobile ? 'auto' : 'hidden' }}>
                                {linhas.length === 0 ? (
                                  <div style={{ padding: '14px', fontSize: 13, color: 'var(--portal-text-muted)' }}>Sem detalhamento de serviços.</div>
                                ) : (
                                  <>
                                    {linhas.map((l: any, li: number) => (
                                      <div key={li} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderBottom: '1px solid #F3F4F6', fontSize: 13, background: li % 2 ? '#FAFBFC' : '#fff' }}>
                                        <span style={{ color: 'var(--portal-text)', lineHeight: 1.45 }}>{l.desc || '-'}</span>
                                        <span style={{ fontWeight: 700, color: 'var(--portal-text)', whiteSpace: 'nowrap' }}>{formatCurrency(l.valor || 0)}</span>
                                      </div>
                                    ))}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 16px', fontSize: 13, background: '#F8FAFC' }}>
                                      <span style={{ fontWeight: 700, color: 'var(--portal-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3, fontSize: 11.5 }}>Total</span>
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
                          <div style={{ background: 'var(--portal-bg-card)', borderRadius: 18, width: 760, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
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
                                <div style={{ padding: 30, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 14 }}>Pedido não encontrado nos dados deste projeto.</div>
                              ) : (
                                <>
                                  {/* Destaque */}
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: '#FFFBF5', border: '1px solid #FED7AA', borderRadius: 14, marginBottom: 20 }}>
                                    <div>
                                      <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>Valor total</div>
                                      <div style={{ fontSize: 27, fontWeight: 800, color: 'var(--portal-text)', lineHeight: 1.15 }}>{formatCurrency(totalPv)}</div>
                                    </div>
                                    {pv.etapa && <span style={{ fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 20, background: '#FFF7ED', color: '#EA580C', border: '1px solid #FED7AA' }}>{pv.etapa}</span>}
                                  </div>
                                  {/* Info */}
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22 }}>
                                    {[
                                      { l: 'Cliente', v: pv.cliente_nome || '-' },
                                      { l: 'Data', v: formatDate(pv.data_previsao || pv.data_inclusao) },
                                    ].map((f, i) => (
                                      <div key={i} style={{ padding: '11px 15px', background: 'var(--portal-bg-card)', border: '1px solid #EEF0F3', borderRadius: 11 }}>
                                        <div style={{ fontSize: 10.5, color: 'var(--portal-text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 3 }}>{f.l}</div>
                                        <div style={{ fontSize: 14, color: 'var(--portal-text)', fontWeight: 600, wordBreak: 'break-word' }}>{f.v}</div>
                                      </div>
                                    ))}
                                  </div>

                                  {(pv.pdf_anexo || pv.link_nf) && (
                                    <div style={{ marginBottom: 22, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                      {pv.pdf_anexo && <a href={pv.pdf_anexo} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, background: '#FFF7ED', color: '#EA580C', border: '1px solid #FED7AA', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}><FileText size={15} /> PDF do PV</a>}
                                      {pv.link_nf && <a href={pv.link_nf} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 10, background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}><Download size={15} /> {pv.numero_nf ? `Nota Fiscal ${pv.numero_nf}` : 'Nota / Recibo'}</a>}
                                    </div>
                                  )}

                                  <div style={{ fontSize: 11.5, color: 'var(--portal-text)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 9 }}>Produtos ({itens.length})</div>
                                  <div style={{ border: '1px solid #E5E7EB', borderRadius: 12, overflow: isMobile ? 'auto' : 'hidden' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 50px 100px 110px', minWidth: isMobile ? 460 : undefined, padding: '11px 16px', background: 'var(--portal-bg-secondary)', borderBottom: '1px solid #E5E7EB', fontSize: 11, color: 'var(--portal-text-secondary)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.3 }}>
                                      <span>Codigo</span><span>Descricao</span><span style={{ textAlign: 'center' }}>Qtd</span><span style={{ textAlign: 'right' }}>Unit.</span><span style={{ textAlign: 'right' }}>Total</span>
                                    </div>
                                    {itens.length === 0 ? (
                                      <div style={{ padding: '14px', fontSize: 13, color: 'var(--portal-text-muted)' }}>Sem itens cadastrados neste pedido.</div>
                                    ) : (
                                      <>
                                        {itens.map((p: any, pi: number) => (
                                          <div key={pi} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 50px 100px 110px', minWidth: isMobile ? 460 : undefined, padding: '12px 16px', borderBottom: '1px solid #F3F4F6', fontSize: 13, color: 'var(--portal-text)', alignItems: 'start', background: pi % 2 ? '#FAFBFC' : '#fff' }}>
                                            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--portal-text-secondary)' }}>{p.codigo || '-'}</span>
                                            <span style={{ fontSize: 12.5, lineHeight: 1.45 }}>{p.descricao || p.desc || '-'}</span>
                                            <span style={{ fontSize: 12.5, textAlign: 'center' }}>{p.quantidade}</span>
                                            <span style={{ textAlign: 'right', fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>{formatCurrency(p.valor_unitario || 0)}</span>
                                            <span style={{ textAlign: 'right', fontWeight: 700 }}>{formatCurrency(p.valor_total || 0)}</span>
                                          </div>
                                        ))}
                                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 50px 100px 110px', minWidth: isMobile ? 460 : undefined, padding: '12px 16px', fontSize: 13, background: '#FFFBF5', alignItems: 'center' }}>
                                          <span style={{ gridColumn: '1 / 3', fontWeight: 700, color: 'var(--portal-text-secondary)', textTransform: 'uppercase', letterSpacing: 0.3, fontSize: 11.5 }}>Total</span>
                                          <span style={{ textAlign: 'center', fontWeight: 700, color: 'var(--portal-text-secondary)' }}>{totalQtd}</span>
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
            <div className="cli-modal" style={{ background: 'var(--portal-bg-card)', borderRadius: 16, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
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
                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{f.l}</div>
                            {f.badge ? (
                              <span style={{ fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: f.sc!.bg, color: f.sc!.c, border: `1px solid ${f.sc!.b}` }}>{f.v}</span>
                            ) : (
                              <div style={{ fontSize: 14, fontWeight: 600, color: f.green ? '#059669' : 'var(--portal-text)', fontFamily: f.mono ? 'monospace' : undefined }}>{f.v}</div>
                            )}
                          </div>
                        ))}
                      </div>
                      {reqModal.obs && (
                        <div style={{ marginTop: 20, padding: 16, background: 'var(--portal-bg-secondary)', borderRadius: 10, border: '1px solid #F3F4F6' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Observações</div>
                          <div style={{ fontSize: 13, color: 'var(--portal-text)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{reqModal.obs}</div>
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
            <div className="cli-modal" style={{ background: 'var(--portal-bg-card)', borderRadius: 16, width: 560, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }}>
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
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 12 }}>Histórico de Revisões</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {REVISOES_HORAS.map(h => {
                    const data = revModal[`${h} Data`]
                    const horim = revModal[`${h} Horimetro`]
                    const done = !!data
                    return (
                      <div key={h} style={{
                        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 10,
                        background: done ? '#ECFDF5' : '#F9FAFB', border: `1px solid ${done ? '#A7F3D0' : 'var(--portal-border)'}`,
                      }}>
                        <div style={{
                          width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: done ? '#059669' : 'var(--portal-border)', color: done ? '#fff' : 'var(--portal-text-muted)', fontSize: 11, fontWeight: 800,
                        }}>
                          {done ? <CheckCircle size={18} /> : h.replace('h', '')}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: done ? '#059669' : 'var(--portal-text-muted)' }}>{h}</div>
                          {done ? (
                            <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginTop: 2 }}>
                              Realizada em <strong style={{ color: 'var(--portal-text)' }}>{data}</strong>
                              {horim ? <> — Horímetro: <strong style={{ color: 'var(--portal-text)' }}>{horim}h</strong></> : ''}
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
  const BTN_SEC: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '0 15px', height: 42, borderRadius: 11, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }
  const corEmpresa = (emp: string) => /castro/i.test(emp)
    ? { bg: '#EFF6FF', fg: '#1D4ED8', bd: '#BFDBFE' }
    : { bg: '#FEF2F2', fg: '#B91C1C', bd: '#FECACA' }
  const iniciaisCli = (c: Cliente) => (c.nome_fantasia || c.razao_social || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
  // Faixa "achado por nº": o serviço/pedido que bateu com a busca, com atalho
  const faixaAchados = (cli: Cliente) => {
    const docs = docsQueBatem(cli)
    if (!docs.length) return null
    return (
      <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
        {docs.slice(0, 4).map((d, i) => {
          const ehOS = d[0] === 'o'
          return (
            <button key={i} onClick={() => abrirServico(cli, ehOS ? 'o' : 'p', d[1])}
              title={ehOS ? 'Abrir a pasta já na janela desta OS' : 'Abrir a pasta já neste pedido'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 6px 5px 10px', borderRadius: 9, border: `1px solid ${ehOS ? '#BFDBFE' : '#FED7AA'}`, background: ehOS ? '#EFF6FF' : '#FFF7ED', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: ehOS ? '#1D4ED8' : '#C2410C' }}>
              {ehOS ? <Wrench size={13} /> : <Package size={13} />}
              {ehOS ? 'OS' : 'PV'} {d[1]}{d[2] ? ` · ${ehOS ? 'NFS-e' : 'NF-e'} ${d[2]}` : ''}
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 6, background: ehOS ? '#2563EB' : '#EA580C', color: '#fefefe', fontSize: 11, fontWeight: 700 }}>
                Abrir <ChevronRight size={11} />
              </span>
            </button>
          )
        })}
        {docs.length > 4 && <span style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', alignSelf: 'center' }}>+{docs.length - 4}</span>}
      </div>
    )
  }

  return (
    <div className="cli-page" style={{ padding: 'clamp(12px, 3vw, 20px) clamp(12px, 4vw, 32px) 32px', width: '100%', boxSizing: 'border-box' }}>
      {/* Linha 1: abas (esquerda) + ações (direita) */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes slideIn { from { opacity: 0; transform: scale(0.96) translateY(10px) } to { opacity: 1; transform: scale(1) translateY(0) } }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        .cli-card { animation: fadeUp 0.35s ease-out both }
        .cli-modal { animation: slideIn 0.25s ease-out }
        .cli-overlay { animation: fadeIn 0.2s ease-out }
        .cli-tb-seg { transition: background 0.15s, color 0.15s }
        .cli-tb-seg:hover:not(:disabled) { background: var(--portal-bg-hover); color: var(--portal-text) }
        .cli-tb-prim { transition: transform 0.15s, box-shadow 0.15s, filter 0.15s }
        .cli-tb-prim:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(220,38,38,0.32); filter: brightness(1.05) }
        .cli-tab { transition: all 0.15s }
        .cli-tab:hover { color: var(--portal-text) }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 13, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }}>
          {([{ id: 'clientes', label: 'Clientes', icon: <Users size={15} /> }, { id: 'maquinas', label: 'Por Máquina', icon: <Wrench size={15} /> }] as const).map(t => {
            const on = aba === t.id
            return (
              <button key={t.id} className="cli-tab" onClick={() => trocarAba(t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13.5, fontWeight: 700, background: on ? 'var(--portal-bg-card)' : 'transparent', color: on ? '#dc2626' : 'var(--portal-text-secondary)', boxShadow: on ? '0 1px 3px rgba(16,24,40,0.12)' : 'none' }}>
                {t.icon} {t.label}
              </button>
            )
          })}
        </div>

        {aba === 'clientes' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {/* Grupo de ações secundárias */}
            <div style={{ display: 'inline-flex', alignItems: 'stretch', height: 42, borderRadius: 12, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', boxShadow: '0 1px 2px rgba(16,24,40,0.05)', overflow: 'hidden' }}>
              <button className="cli-tb-seg" onClick={() => router.push('/clientes/relatorios')} title="Relatórios semanais (faturados sem NF)"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '0 15px', border: 'none', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                <span style={{ width: 24, height: 24, borderRadius: 7, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FileText size={13} /></span>
                Relatórios
              </button>
              <span style={{ width: 1, background: 'var(--portal-border)', margin: '8px 0' }} />
              <button className="cli-tb-seg" onClick={syncBackground} disabled={syncing} title={syncing ? 'Sincronizando com o Omie...' : 'Sincronizar com o Omie'}
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, border: 'none', background: 'transparent', color: syncing ? '#16A34A' : 'var(--portal-text-secondary)', cursor: syncing ? 'not-allowed' : 'pointer' }}>
                <RefreshCw size={16} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
              </button>
            </div>

            {/* Ação principal: um botão "Novo" e o usuário escolhe o que criar */}
            <div style={{ position: 'relative' }}>
              <button className="cli-tb-prim" onClick={() => setMenuNovo(m => !m)} {...gateBtn(podeCriarCliente || podeCriarProjeto)}
                aria-haspopup="menu" aria-expanded={menuNovo}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 9, height: 42, padding: '0 14px 0 8px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 45%, #b91c1c 100%)', color: '#fefefe', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(220,38,38,0.25)', ...estiloSemPermissao(podeCriarCliente || podeCriarProjeto) }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={16} strokeWidth={2.75} /></span>
                Novo
                <ChevronDown size={15} style={{ marginLeft: 2, transition: 'transform 0.15s', transform: menuNovo ? 'rotate(180deg)' : 'none' }} />
              </button>
              {menuNovo && (<>
                {/* clique fora fecha */}
                <div onClick={() => setMenuNovo(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
                <div role="menu" style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 51, width: 290, padding: 6, borderRadius: 14, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', boxShadow: '0 16px 40px rgba(16,24,40,0.16)' }}>
                  {[
                    { id: 'cliente', titulo: 'Cliente', sub: 'Pessoa ou empresa — cria no Omie', icone: <User size={18} />, cor: '#DC2626', fundo: '#FEF2F2', pode: podeCriarCliente,
                      acao: () => setShowCriarCliente(true) },
                    { id: 'projeto', titulo: 'Projeto / máquina', sub: 'Trator, implemento ou equipamento', icone: <Tractor size={18} />, cor: '#047857', fundo: '#ECFDF5', pode: podeCriarProjeto,
                      acao: () => { setCriarErro(''); setProjNome(''); setShowCriarProjeto(true) } },
                  ].map(o => (
                    <button key={o.id} role="menuitem" className="cli-tb-seg" disabled={!o.pode} title={o.pode ? undefined : 'Sem permissão'}
                      onClick={() => { setMenuNovo(false); o.acao() }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 10px', borderRadius: 10, border: 'none', background: 'transparent', textAlign: 'left', cursor: o.pode ? 'pointer' : 'not-allowed', opacity: o.pode ? 1 : 0.45 }}>
                      <span style={{ width: 38, height: 38, borderRadius: 11, background: o.fundo, color: o.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{o.icone}</span>
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--portal-text)' }}>{o.titulo}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--portal-text-muted)', marginTop: 1 }}>{o.sub}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>)}
            </div>
          </div>
        )}
      </div>

      {aba === 'clientes' && (<>
      {/* Linha 2: busca + empresa */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={17} style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', color: search ? '#dc2626' : 'var(--portal-text-muted)' }} />
          <input type="text" placeholder="Buscar por nome, CNPJ, cidade, projeto, nº da OS, PV ou nota fiscal..."
            value={search} onChange={ev => setSearch(ev.target.value)}
            style={{ width: '100%', height: 46, padding: '0 40px 0 44px', borderRadius: 12, border: `1px solid ${search ? '#FCA5A5' : 'var(--portal-border)'}`, color: 'var(--portal-text)', fontSize: 14, outline: 'none', background: 'var(--portal-bg-card)', boxSizing: 'border-box', boxShadow: search ? '0 0 0 3px rgba(220,38,38,0.08)' : '0 1px 2px rgba(16,24,40,0.05)', transition: 'all 0.15s' }} />
          {search && (
            <button onClick={() => setSearch('')} title="Limpar busca"
              style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 26, height: 26, borderRadius: 7, border: 'none', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          )}
        </div>
        {empresas.length > 1 && (
          <select value={empresaFilter} onChange={ev => setEmpresaFilter(ev.target.value)}
            style={{ ...BTN_SEC, height: 46, padding: '0 14px', outline: 'none', borderColor: empresaFilter ? '#FCA5A5' : 'var(--portal-border)' }}>
            <option value="">Todas as empresas</option>
            {empresas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
          </select>
        )}
      </div>

      {/* Resumo da lista / estado do sync */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14, minHeight: 22 }}>
        {!loading && (
          <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>
            <b style={{ color: 'var(--portal-text)' }}>{filtered.length.toLocaleString('pt-BR')}</b> {filtered.length === 1 ? 'cliente' : 'clientes'}
            {search ? ' encontrados' : ''}
          </span>
        )}
        {buscaNumero && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, padding: '3px 10px', borderRadius: 999, background: '#EFF6FF', color: '#1D4ED8' }}>
            <Hash size={11} /> Procurando o nº {buscaNumero} em OS, PV e notas fiscais
          </span>
        )}
        {syncStatus && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--portal-text-secondary)', padding: '3px 10px', borderRadius: 999, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }}>
            {syncing && <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />}
            {syncStatus}
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 15 }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
          <div>Carregando clientes...</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '64px 20px', textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 14, border: '1px dashed var(--portal-border)', borderRadius: 14 }}>
          <Search size={26} style={{ marginBottom: 10, opacity: 0.5 }} />
          <div style={{ fontWeight: 600, color: 'var(--portal-text-secondary)' }}>{clientes.length === 0 ? 'Nenhum cliente. Sincronização em andamento...' : 'Nenhum cliente encontrado'}</div>
          {clientes.length > 0 && <div style={{ marginTop: 4, fontSize: 12.5 }}>Tente o nome, o CNPJ ou o número da OS / nota.</div>}
        </div>
      ) : (
        <div style={{ border: isMobile ? 'none' : '1px solid var(--portal-border)', borderRadius: 16, overflow: 'hidden', background: isMobile ? 'transparent' : 'var(--portal-bg-card)', boxShadow: isMobile ? 'none' : '0 1px 3px rgba(16,24,40,0.06)', display: isMobile ? 'flex' : 'block', flexDirection: 'column', gap: isMobile ? 10 : 0 }}>
          {/* Cabeçalho da tabela — só no desktop */}
          {!isMobile && (
          <div style={{
            display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) 170px 150px 70px 130px 120px 20px', columnGap: 16,
            padding: '11px 20px', background: 'var(--portal-bg-secondary)', borderBottom: '1px solid var(--portal-border)',
            fontSize: 10.5, color: 'var(--portal-text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.6, alignItems: 'center'
          }}>
            <span></span><span>Cliente</span><span>CNPJ / CPF</span><span>Cidade</span>
            <span style={{ textAlign: 'center' }}>OS</span><span style={{ textAlign: 'right' }}>Valor total</span><span>Empresa</span><span></span>
          </div>
          )}

          {filtered.slice(0, 200).map(cli => {
            const emp = corEmpresa(cli.empresa)
            const etqs = etiquetasMapa[cli.cnpj_cpf?.replace(/\D/g, '')] || []
            return isMobile ? (
              // MOBILE: cartão (a grade de 8 colunas não cabe no celular)
              <div key={`${cli.cod_cli}-${cli.empresa}`} onClick={() => abrirDetalhe(cli)} onMouseEnter={() => prefetchDetalhe(cli)}
                style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 14, padding: 14, cursor: 'pointer', boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 38, height: 38, borderRadius: 11, background: emp.bg, color: emp.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{iniciaisCli(cli)}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14.5, color: 'var(--portal-text)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cli.nome_fantasia || cli.razao_social}</div>
                    <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 1 }}>{cli.cidade ? `${cli.cidade}/${cli.estado}` : '-'}</div>
                  </div>
                  <ChevronRight size={16} color="var(--portal-text-muted)" />
                </div>
                {/* Dados básicos: endereço, telefone e e-mail (copiáveis) */}
                {(cli.endereco || cli.telefone || cli.email) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 9, fontSize: 12, color: 'var(--portal-text-secondary)' }}>
                    {cli.endereco && (
                      <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, color: 'var(--portal-text-muted)' }}>
                        <MapPin size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {cli.endereco}{cli.bairro ? `, ${cli.bairro}` : ''}
                      </span>
                    )}
                    {cli.telefone && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }}>
                        <Phone size={12} style={{ flexShrink: 0 }} /> {cli.telefone}
                        <button onClick={e => copiarContato(e, cli.telefone)} title="Copiar telefone" style={{ ...btnCopiar, color: copiadoContato === cli.telefone ? '#16a34a' : 'var(--portal-text-muted)' }}>{copiadoContato === cli.telefone ? <Check size={12} /> : <Copy size={12} />}</button>
                      </span>
                    )}
                    {cli.email && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500, minWidth: 0 }}>
                        <Mail size={12} style={{ flexShrink: 0 }} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{cli.email}</span>
                        <button onClick={e => copiarContato(e, cli.email)} title="Copiar email" style={{ ...btnCopiar, color: copiadoContato === cli.email ? '#16a34a' : 'var(--portal-text-muted)' }}>{copiadoContato === cli.email ? <Check size={12} /> : <Copy size={12} />}</button>
                      </span>
                    )}
                  </div>
                )}
                {etqs.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                    {etqs.map(e => <span key={e.id} style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: e.cor, color: '#fff' }}>{e.nome}</span>)}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid #F1F5F9' }}>
                  <span style={{ fontSize: 12, color: 'var(--portal-text-secondary)', fontFamily: 'ui-monospace, monospace' }}>{formatCNPJ(cli.cnpj_cpf)}</span>
                  <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--portal-text)' }}>{cli.total_valor > 0 ? formatCurrency(cli.total_valor) : '-'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)' }}>{cli.total_os} OS</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: emp.bg, color: emp.fg }}>{cli.empresa}</span>
                </div>
                {faixaAchados(cli)}
              </div>
            ) : (
            <div key={`${cli.cod_cli}-${cli.empresa}`} onClick={() => abrirDetalhe(cli)}
              style={{ padding: '14px 20px', borderBottom: '1px solid var(--portal-border)', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={ev => { ev.currentTarget.style.background = 'var(--portal-bg-hover)'; prefetchDetalhe(cli) }}
              onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '44px minmax(0, 1fr) 170px 150px 70px 130px 120px 20px', columnGap: 16, alignItems: 'center', fontSize: 14, color: 'var(--portal-text)' }}>
                <span title={cli.empresa} style={{ width: 40, height: 40, borderRadius: 12, background: emp.bg, color: emp.fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>
                  {iniciaisCli(cli)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14.5, color: 'var(--portal-text)', fontWeight: 700 }}>{cli.nome_fantasia || cli.razao_social}</span>
                    {etqs.map(e => (
                      <span key={e.id} style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: e.cor, color: '#fff', lineHeight: '16px', letterSpacing: 0.3 }}>{e.nome}</span>
                    ))}
                  </div>
                  {cli.nome_fantasia && cli.razao_social && cli.nome_fantasia !== cli.razao_social && (
                    <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 1 }}>{cli.razao_social}</div>
                  )}
                  {cli.endereco && (
                    <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={11} style={{ flexShrink: 0 }} /> {cli.endereco}{cli.bairro ? `, ${cli.bairro}` : ''}
                    </div>
                  )}
                  {(cli.telefone || cli.email) && (
                    <div style={{ fontSize: 11.5, color: 'var(--portal-text-secondary)', fontWeight: 500, marginTop: 3, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      {cli.telefone && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Phone size={11} /> {cli.telefone}
                        <button onClick={e => copiarContato(e, cli.telefone)} title="Copiar telefone" style={{ ...btnCopiar, color: copiadoContato === cli.telefone ? '#16a34a' : 'var(--portal-text-muted)' }}>{copiadoContato === cli.telefone ? <Check size={12} /> : <Copy size={12} />}</button></span>}
                      {cli.email && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Mail size={11} /> {cli.email}
                        <button onClick={e => copiarContato(e, cli.email)} title="Copiar email" style={{ ...btnCopiar, color: copiadoContato === cli.email ? '#16a34a' : 'var(--portal-text-muted)' }}>{copiadoContato === cli.email ? <Check size={12} /> : <Copy size={12} />}</button></span>}
                    </div>
                  )}
                </div>
                <span style={{ justifySelf: 'start', fontSize: 11.5, color: 'var(--portal-text-secondary)', fontFamily: 'ui-monospace, monospace', padding: '3px 8px', borderRadius: 7, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', whiteSpace: 'nowrap' }}>{formatCNPJ(cli.cnpj_cpf) || '—'}</span>
                <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', lineHeight: 1.35 }}>{cli.cidade ? `${cli.cidade}/${cli.estado}` : '-'}</span>
                <span style={{ justifySelf: 'center', minWidth: 34, textAlign: 'center', fontWeight: 700, fontSize: 13, color: 'var(--portal-text)', padding: '3px 9px', borderRadius: 999, background: 'var(--portal-bg-secondary)', fontVariantNumeric: 'tabular-nums' }}>{cli.total_os}</span>
                <span style={{ textAlign: 'right', fontSize: 14.5, fontWeight: 700, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>{cli.total_valor > 0 ? formatCurrency(cli.total_valor) : '-'}</span>
                <span style={{ justifySelf: 'start', fontSize: 11.5, fontWeight: 700, padding: '3px 9px', borderRadius: 7, background: emp.bg, color: emp.fg, border: `1px solid ${emp.bd}`, whiteSpace: 'nowrap' }}>{cli.empresa}</span>
                <ChevronRight size={16} color="var(--portal-text-muted)" />
              </div>
              {/* serviço/pedido que bateu com a busca por número */}
              <div style={{ marginLeft: 60 }}>{faixaAchados(cli)}</div>
            </div>
            )
          })}

          {filtered.length > 200 && (
            <div style={{ padding: 14, textAlign: 'center', fontSize: 13, color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-secondary)' }}>
              Mostrando 200 de {filtered.length.toLocaleString('pt-BR')} clientes. Use a busca para filtrar.
            </div>
          )}
        </div>
      )}
      </>)}

      {/* ===== ABA POR MÁQUINA ===== */}
      {aba === 'maquinas' && (<>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 260 }}>
          <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-secondary)' }} />
          <input type="text" placeholder="Buscar máquina por modelo/chassi, cliente ou cidade..."
            value={buscaMaq} onChange={ev => setBuscaMaq(ev.target.value)}
            style={{ width: '100%', padding: '12px 14px 12px 40px', borderRadius: 12, border: '1px solid var(--portal-border)', color: 'var(--portal-text)', fontSize: 14, outline: 'none', background: 'var(--portal-bg-card)', boxSizing: 'border-box' }} />
        </div>
        {empresas.length > 1 && (
          <select value={empresaFilter} onChange={ev => setEmpresaFilter(ev.target.value)}
            style={{ padding: '12px 16px', borderRadius: 12, border: '1px solid var(--portal-border)', color: 'var(--portal-text)', fontSize: 13, cursor: 'pointer', outline: 'none', background: 'var(--portal-bg-card)' }}>
            <option value="">Todas empresas</option>
            {empresas.map(emp => <option key={emp} value={emp}>{emp}</option>)}
          </select>
        )}
        <button onClick={carregarMaquinas} disabled={maquinasLoad} title="Atualizar máquinas"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', cursor: maquinasLoad ? 'not-allowed' : 'pointer' }}>
          <RefreshCw size={16} style={maquinasLoad ? { animation: 'spin 1s linear infinite' } : {}} />
        </button>
      </div>

      {maquinasLoad ? (
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 15 }}>
          <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
          <div>Carregando máquinas...</div>
        </div>
      ) : maquinasFiltradas.length === 0 ? (
        <div style={{ padding: 80, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 15 }}>
          {maquinas.length === 0 ? 'Nenhuma máquina encontrada.' : 'Nenhuma máquina para esse filtro.'}
        </div>
      ) : (
        <div style={{ border: isMobile ? 'none' : '1px solid var(--portal-border)', borderRadius: 14, overflow: 'hidden', background: isMobile ? 'transparent' : 'var(--portal-bg-card)', boxShadow: isMobile ? 'none' : '0 1px 3px var(--portal-shadow)', display: isMobile ? 'flex' : 'block', flexDirection: 'column', gap: isMobile ? 10 : 0 }}>
          {!isMobile && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px 140px 60px 120px 130px 24px', columnGap: 16, padding: '12px 20px', background: 'var(--portal-bg-secondary)', borderBottom: '1px solid var(--portal-border)', fontSize: 11, color: 'var(--portal-text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.5, alignItems: 'center' }}>
              <span>Máquina</span><span>Cliente</span><span>Cidade</span><span style={{ textAlign: 'center' }}>OS</span><span style={{ textAlign: 'right' }}>Valor</span><span style={{ textAlign: 'center' }}>NF pend.</span><span></span>
            </div>
          )}
          {maquinasFiltradas.slice(0, 300).map((m, idx) => {
            const pend = (m.nf_servico_pendente || 0) + (m.nf_peca_pendente || 0)
            // Abre a ficha da máquina (modal com abas) direto — sem entrar na pasta do cliente.
            const abrir = () => abrirModalProjeto(m.nome, m.empresa)
            return isMobile ? (
              <div key={`${m.codigo}-${m.empresa}-${idx}`} onClick={abrir} style={{ border: '1px solid var(--portal-border)', borderRadius: 12, background: 'var(--portal-bg-card)', padding: 14, cursor: 'pointer' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)' }}>{m.nome || '—'}{m.inativo ? ' (inativo)' : ''}</div>
                <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', marginTop: 2 }}>{m.cliente?.nome || '—'}{m.cliente?.cidade ? ` · ${m.cliente.cidade}` : ''}</div>
                <div style={{ display: 'flex', gap: 14, marginTop: 8, alignItems: 'center', fontSize: 13 }}>
                  <span style={{ color: 'var(--portal-text-secondary)' }}>OS: <b style={{ color: 'var(--portal-text)' }}>{m.os_total || 0}</b></span>
                  <span style={{ color: 'var(--portal-text-secondary)' }}>{m.valor_total > 0 ? formatCurrency(m.valor_total) : '-'}</span>
                  {pend > 0 && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 999, padding: '2px 10px' }}>{pend} NF pend.</span>}
                </div>
              </div>
            ) : (
              <div key={`${m.codigo}-${m.empresa}-${idx}`} onClick={abrir}
                style={{ display: 'grid', gridTemplateColumns: '1fr 200px 140px 60px 120px 130px 24px', columnGap: 16, padding: '14px 20px', borderBottom: '1px solid var(--portal-border)', cursor: 'pointer', alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.nome || '—'}{m.inativo ? ' (inativo)' : ''}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>{m.empresa}</div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.cliente?.nome || '—'}</div>
                <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.cliente?.cidade || '—'}</div>
                <div style={{ textAlign: 'center', fontSize: 14, fontWeight: 600, color: 'var(--portal-text)' }}>{m.os_total || 0}</div>
                <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, color: 'var(--portal-text)' }}>{m.valor_total > 0 ? formatCurrency(m.valor_total) : '-'}</div>
                <div style={{ textAlign: 'center' }}>
                  {pend > 0
                    ? <span style={{ fontSize: 12, fontWeight: 700, color: '#B45309', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 999, padding: '2px 10px' }}>{pend}</span>
                    : <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>ok</span>}
                </div>
                <ChevronRight size={16} color="var(--portal-text-muted)" />
              </div>
            )
          })}
          {maquinasFiltradas.length > 300 && (
            <div style={{ padding: 14, textAlign: 'center', fontSize: 13, color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-secondary)' }}>
              Mostrando 300 de {maquinasFiltradas.length} máquinas. Use a busca para filtrar.
            </div>
          )}
        </div>
      )}
      </>)}

      {/* ===== Modal Criar Cliente ===== */}
      {/* Novo cliente: mesmo formulário do POS (valida pelas regras do Omie) */}
      <ModalNovoCliente aberto={showCriarCliente} onFechar={() => setShowCriarCliente(false)} zIndex={10000}
        onCriado={async (c) => {
          setShowCriarCliente(false)
          await carregarLista()
          const f = c.form
          const novo: Cliente = {
            cod_cli: c.cod_cli, empresa: c.empresa,
            razao_social: f.razao_social.trim(), nome_fantasia: f.nome_fantasia?.trim() || f.razao_social.trim(),
            cnpj_cpf: c.cliente.cnpj, cidade: f.cidade || '', estado: f.estado || '',
            telefone: f.telefone || '', email: f.email || '',
            total_os: 0, total_valor: 0, os_ativas: 0, projetos: [],
          }
          if (c.aviso) alert(c.aviso)
          else if (c.ja_existia) alert(`Esse CNPJ/CPF já estava cadastrado no Omie — abrindo o cadastro existente (cód. ${c.cod_cli}).`)
          await abrirDetalhe(novo)
        }} />

      {/* ===== Modal Criar Projeto ===== */}
      {showCriarProjeto && (
        <div onClick={e => { if (e.target === e.currentTarget && !criando) setShowCriarProjeto(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="cli-mpad" style={{ background: 'var(--portal-bg-card)', borderRadius: 16, width: 440, maxWidth: '95vw', padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>Criar Projeto</h2>
              <button onClick={() => setShowCriarProjeto(false)} style={{ background: 'var(--portal-bg-secondary)', border: 'none', borderRadius: 8, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} color="#6B7280" /></button>
            </div>
            <p style={{ fontSize: 13, color: 'var(--portal-text-secondary)', margin: '0 0 18px' }}>Cria no Omie (IncluirProjeto). O vínculo com o cliente acontece depois, via OS.</p>

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
              <button onClick={() => setShowCriarProjeto(false)} disabled={criando} style={{ padding: '11px 22px', borderRadius: 10, border: '1px solid #E5E7EB', background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={criarProjeto} disabled={criando || !projNome.trim()} style={{ padding: '11px 24px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #2563EB, #1D4ED8)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: (criando || !projNome.trim()) ? 'not-allowed' : 'pointer', opacity: (criando || !projNome.trim()) ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tractor size={15} /> {criando ? 'Criando...' : 'Criar Projeto'}
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
