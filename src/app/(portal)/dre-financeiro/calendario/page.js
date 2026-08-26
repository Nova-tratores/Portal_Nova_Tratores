'use client'
// =============================================================================
// Tela Calendario (port FIEL de views/calendario.ejs do financeiro-omie-dashboard).
//
// Mantem EXATAMENTE os calculos e o comportamento do original:
//  - Toolbar: navegacao anterior/proximo/hoje + toggle de visao (Mes / Ano / Lista).
//  - Toggle de TIPO (A Pagar / A Receber / Ambos) — no header global da fonte;
//    como o layout do modulo do portal so expoe o seletor de CONTA, o toggle de
//    TIPO e replicado localmente nesta tela (default 'pagar' = pegaTipo da fonte).
//  - KPIs distintos por tipo (pagar / receber / ambos), tanto no mes quanto no ano.
//  - Calendario mensal (grid de 7 colunas): cor de celula, bolinhas e conteudo
//    conforme o tipo; clique abre o drawer do dia.
//  - Calendario anual: 4 cards de trimestre + 12 cards de mes com escala visual.
//  - Visao Lista: tabela ordenavel (mes/ano), resumo e export CSV.
//  - Filtros: status / terceiro / grupo / categoria / departamento.
//  - Drawer lateral com os titulos do dia (resumo + cartoes).
//  - Sincronizar: dispara pagar + receber para a conta atual e faz polling.
//
// A navegacao do original era por mudanca de URL (full reload); no portal isso
// vira estado React (mes/ano/view/tipo/filtros) que re-dispara os fetches — o
// equivalente SPA fiel ao comportamento observado.
//
// Os endpoints sao consumidos com o prefixo /api/dre-financeiro/ e ?conta=...
// (conta vem de useDreConta). O layout do modulo ja aplica o gate de permissao
// 'financeiro' e a sub-nav; ainda assim importamos useAuth/usePermissoes e
// SemPermissao por consistencia com o padrao do portal.
//
// Nao ha bibliotecas de grafico nesta tela (o original tambem nao usa): o
// "calendario", os cards anuais e as barras de distribuicao sao puro markup.
// =============================================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta } from '@/lib/dre-financeiro/format'

// ---------------------------------------------------------------------------
// Constantes (identicas ao <script> da fonte)
// ---------------------------------------------------------------------------
const NOMES_MES = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const DIAS_SEM = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

// ---------------------------------------------------------------------------
// Formatadores locais (identicos aos do <script> da fonte). Mantidos inline para
// preservar EXATAMENTE o arredondamento usado nas celulas/cards/drawer.
// ---------------------------------------------------------------------------
function fmtBRL(n) {
  const v = Number(n) || 0
  const sinal = v < 0 ? '-' : ''
  const abs = Math.abs(v)
  if (abs >= 1000000) return sinal + 'R$ ' + (abs / 1000000).toFixed(1).replace('.', ',') + 'M'
  if (abs >= 1000) return sinal + 'R$ ' + (abs / 1000).toFixed(1).replace('.', ',') + 'k'
  return sinal + 'R$ ' + abs.toFixed(0)
}
function fmtBRLcurto(n) {
  const v = Number(n) || 0
  const s = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1000000) return s + 'R$ ' + (a / 1000000).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1000) return s + 'R$ ' + (a / 1000).toFixed(0) + 'k'
  return s + 'R$ ' + a.toFixed(0)
}
function fmtBRLfull(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0)
}
function fmtBRdata(iso) {
  if (!iso) return ''
  const p = iso.split('-')
  return p[2] + '/' + p[1] + '/' + p[0]
}

// ---------------------------------------------------------------------------
// Helpers de badges / classificacao (identicos a fonte)
// ---------------------------------------------------------------------------
function statusBadgeInfo(s) {
  const map = {
    LIQUIDADO: ['Pago', 'bg-emerald-100 text-emerald-800'],
    VENCIDO: ['Vencido', 'bg-red-100 text-red-800'],
    A_VENCER_PROXIMO: ['Proximo', 'bg-blue-100 text-blue-800'],
    A_VENCER: ['A vencer', 'bg-amber-100 text-amber-800'],
    PARCIAL: ['Parcial', 'bg-orange-100 text-orange-800'],
  }
  return map[s] || [s, 'bg-slate-100 text-slate-700']
}
function StatusBadge({ s }) {
  const [label, cls] = statusBadgeInfo(s)
  return <span className={'inline-block px-2 py-0.5 rounded text-xs font-medium ' + cls}>{label}</span>
}
function TipoBadge({ t }) {
  if (t === 'pagar') return <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 mr-1">Pagar</span>
  if (t === 'receber') return <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 mr-1">Receber</span>
  return null
}
function empresaLabel(c) {
  const s = String(c || '').toUpperCase()
  if (s === 'NOVA') return 'Nova'
  if (s === 'CASTRO') return 'Castro'
  return c || '—'
}
function EmpresaBadge({ c }) {
  const s = String(c || '').toUpperCase()
  const cls = s === 'NOVA' ? 'bg-blue-100 text-blue-800'
    : s === 'CASTRO' ? 'bg-purple-100 text-purple-800'
      : 'bg-slate-100 text-slate-700'
  return <span className={'inline-block px-2 py-0.5 rounded text-xs font-bold ' + cls}>{empresaLabel(c)}</span>
}
function docDe(t) {
  let doc = t.numero_documento_fiscal ? ('NF ' + t.numero_documento_fiscal)
    : (t.numero_documento ? ('Doc ' + t.numero_documento) : '')
  if (t.numero_parcela) doc += (doc ? ' · ' : '') + 'Parc ' + t.numero_parcela
  return doc
}

// Colunas da visao Lista (identicas a fonte)
const LCOLS = [
  { key: 'empresa', label: 'Empresa', align: 'left' },
  { key: 'nome', label: 'Terceiro', align: 'left' },
  { key: 'doc', label: 'Documento', align: 'left' },
  { key: 'data', label: 'Vencimento', align: 'left' },
  { key: 'status', label: 'Status', align: 'left' },
  { key: 'valor', label: 'Valor', align: 'right' },
]

export default function CalendarioPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  // --- Estado de controles (espelha as vars do IIFE da fonte) ---------------
  const agora = new Date()
  const [tipo, setTipo] = useState('pagar') // 'pagar' | 'receber' | 'ambos' (pegaTipo)
  const [eixo, setEixo] = useState('vencimento') // 'vencimento' | 'emissao' (data de referencia)
  const [view, setView] = useState('mes') // 'mes' | 'ano' | 'lista'
  const [mes, setMes] = useState(agora.getMonth() + 1)
  const [ano, setAno] = useState(agora.getFullYear())
  const [filtros, setFiltros] = useState({
    status: '', fornecedor: '', grupo: '', categoria: '', departamento: '',
  })

  // Hoje (ISO) — para destacar a celula e calcular proximos 7 dias
  const hojeISO = new Date().toISOString().slice(0, 10)

  // --- Dados ----------------------------------------------------------------
  const [dias, setDias] = useState([]) // calendario mensal
  const [kpis, setKpis] = useState({}) // kpis do mes ou do ano
  const [erroCal, setErroCal] = useState('')

  const [meses, setMeses] = useState([]) // calendario anual
  const [kpisAno, setKpisAno] = useState({})
  const [erroAno, setErroAno] = useState('')

  const [opcoes, setOpcoes] = useState({ fornecedores: [], grupos: [], categorias: [], departamentos: [] })

  // --- Visao Lista ----------------------------------------------------------
  const [escopoLista, setEscopoLista] = useState('mes') // 'mes' | 'ano'
  const [listaDados, setListaDados] = useState([])
  const [listaCarregando, setListaCarregando] = useState(false)
  const [erroLista, setErroLista] = useState('')
  const [lSort, setLSort] = useState({ col: 'data', dir: 'asc' })

  // --- Drawer ---------------------------------------------------------------
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [drawerData, setDrawerData] = useState('')
  const [drawerTitulos, setDrawerTitulos] = useState([])
  const [drawerCarregando, setDrawerCarregando] = useState(false)
  const [drawerErro, setDrawerErro] = useState('')

  // --- Sync -----------------------------------------------------------------
  const [syncStatus, setSyncStatus] = useState('')
  const [syncRodando, setSyncRodando] = useState(false)
  const syncTimer = useRef(null)

  // =========================================================================
  // Monta query string com conta/tipo/mes/ano/view + filtros (port de montarQS)
  // =========================================================================
  const montarQS = useCallback((extra) => {
    const qs = new URLSearchParams()
    qs.set('conta', conta)
    qs.set('tipo', tipo)
    qs.set('eixo', eixo)
    qs.set('mes', String(mes))
    qs.set('ano', String(ano))
    qs.set('view', view)
    Object.keys(filtros).forEach((k) => { if (filtros[k]) qs.set(k, filtros[k]) })
    if (extra) Object.keys(extra).forEach((k) => { qs.set(k, extra[k]) })
    return qs.toString()
  }, [conta, tipo, eixo, mes, ano, view, filtros])

  // =========================================================================
  // Carregamento do calendario mensal (port fiel de carregarCalendario)
  // =========================================================================
  const carregarCalendario = useCallback(() => {
    setErroCal('')
    fetch('/api/dre-financeiro/calendario?' + montarQS())
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { setErroCal(d.erro); setDias([]); return }
        setDias(d.dias || [])
        setKpis(d.kpis || {})
      })
      .catch((e) => setErroCal(e.message))
  }, [montarQS])

  // =========================================================================
  // Carregamento do calendario anual (port fiel de carregarAno)
  // =========================================================================
  const carregarAno = useCallback(() => {
    setErroAno('')
    let qs = 'conta=' + conta + '&tipo=' + tipo + '&eixo=' + eixo + '&ano=' + ano
    Object.keys(filtros).forEach((k) => { if (filtros[k]) qs += '&' + k + '=' + encodeURIComponent(filtros[k]) })
    fetch('/api/dre-financeiro/calendario-ano?' + qs)
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { setErroAno(d.erro); setMeses([]); return }
        setMeses(d.meses || [])
        setKpisAno(d.kpis || {})
      })
      .catch((e) => setErroAno(e.message))
  }, [conta, tipo, eixo, ano, filtros])

  // =========================================================================
  // Carregamento das opcoes de filtro (port fiel de carregarFiltros)
  // =========================================================================
  const carregarFiltros = useCallback(() => {
    fetch('/api/dre-financeiro/filtros?' + montarQS())
      .then((r) => r.json())
      .then((d) => {
        setOpcoes({
          fornecedores: d.fornecedores || [],
          grupos: d.grupos || [],
          categorias: d.categorias || [],
          departamentos: d.departamentos || [],
        })
      })
      .catch(() => { /* silencioso, igual a fonte */ })
  }, [montarQS])

  // =========================================================================
  // Periodo da visao Lista (port fiel de periodoLista)
  // =========================================================================
  const periodoLista = useCallback(() => {
    if (escopoLista === 'ano') return { de: ano + '-01-01', ate: ano + '-12-31', label: String(ano) }
    const mm = String(mes).padStart(2, '0')
    const ult = new Date(ano, mes, 0).getDate()
    return { de: ano + '-' + mm + '-01', ate: ano + '-' + mm + '-' + String(ult).padStart(2, '0'), label: NOMES_MES[mes - 1] + ' ' + ano }
  }, [escopoLista, ano, mes])

  // =========================================================================
  // Carregamento da visao Lista (port fiel de carregarLista)
  // =========================================================================
  const carregarLista = useCallback(() => {
    const p = periodoLista()
    setErroLista('')
    setListaCarregando(true)
    fetch('/api/dre-financeiro/calendario-lista?' + montarQS({ de: p.de, ate: p.ate }))
      .then((r) => r.json())
      .then((d) => {
        setListaCarregando(false)
        if (d.erro) { setErroLista(d.erro); setListaDados([]); return }
        setListaDados(d.titulos || [])
      })
      .catch((e) => { setListaCarregando(false); setErroLista(e.message) })
  }, [montarQS, periodoLista])

  // =========================================================================
  // Efeitos de carregamento (port fiel do bloco "Inicial" da fonte)
  // Recarrega ao mudar view/tipo/conta/mes/ano/filtros.
  // =========================================================================
  useEffect(() => {
    if (view === 'lista') carregarLista()
    else if (view === 'ano') carregarAno()
    else carregarCalendario()
  }, [view, carregarLista, carregarAno, carregarCalendario])

  // Opcoes de filtro: carregam sempre (fonte chama carregarFiltros() no fim)
  useEffect(() => { carregarFiltros() }, [carregarFiltros])

  // Limpa o timer de sync ao desmontar
  useEffect(() => () => { if (syncTimer.current) clearInterval(syncTimer.current) }, [])

  // =========================================================================
  // Navegacao (port fiel de mesAnt/mesProx/url/urlAno/hojeHref)
  // =========================================================================
  function irAnterior() {
    if (view === 'ano') { setAno((a) => a - 1); return }
    if (mes === 1) { setMes(12); setAno((a) => a - 1) }
    else setMes((m) => m - 1)
  }
  function irProximo() {
    if (view === 'ano') { setAno((a) => a + 1); return }
    if (mes === 12) { setMes(1); setAno((a) => a + 1) }
    else setMes((m) => m + 1)
  }
  function irHoje() {
    const d = new Date()
    setAno(d.getFullYear())
    if (view !== 'ano') setMes(d.getMonth() + 1)
  }

  const tituloPeriodo = view === 'ano' ? String(ano)
    : (view === 'lista' ? periodoLista().label : (NOMES_MES[mes - 1] + ' ' + ano))
  const labelTipo = tipo === 'pagar' ? 'A Pagar' : (tipo === 'receber' ? 'A Receber' : 'Pagar + Receber')

  // =========================================================================
  // Filtros (port fiel de aplicaFiltros / btn-limpar)
  // =========================================================================
  function mudarFiltro(k, v) {
    setFiltros((prev) => ({ ...prev, [k]: v }))
  }
  function limparFiltros() {
    setFiltros({ status: '', fornecedor: '', grupo: '', categoria: '', departamento: '' })
  }

  // =========================================================================
  // Drawer (port fiel de abrirDrawer / fecharDrawer)
  // =========================================================================
  function abrirDrawer(dataISO) {
    setDrawerData(dataISO)
    setDrawerAberto(true)
    setDrawerErro('')
    setDrawerTitulos([])
    setDrawerCarregando(true)
    fetch('/api/dre-financeiro/titulos?' + montarQS({ data: dataISO }))
      .then((r) => r.json())
      .then((d) => {
        setDrawerCarregando(false)
        if (d.erro) { setDrawerErro(d.erro); return }
        setDrawerTitulos(d.titulos || [])
      })
      .catch((e) => { setDrawerCarregando(false); setDrawerErro(e.message) })
  }
  function fecharDrawer() { setDrawerAberto(false) }

  // =========================================================================
  // Sync (port fiel do handler de btn-sync) — sempre pagar + receber
  // =========================================================================
  function sincronizar() {
    if (conta === 'todas') {
      alert('Selecione uma conta especifica para sincronizar.')
      return
    }
    setSyncRodando(true)
    setSyncStatus('Iniciando...')
    fetch('/api/dre-financeiro/sync/conta?conta=' + conta + '&mes=' + mes + '&ano=' + ano, { method: 'POST' })
      .then((r) => r.json())
      .then(() => {
        if (syncTimer.current) clearInterval(syncTimer.current)
        syncTimer.current = setInterval(() => {
          fetch('/api/dre-financeiro/sync/status?conta=' + conta)
            .then((r) => r.json())
            .then((s) => {
              if (s.rodando) {
                setSyncStatus(s.etapa + ' - pag ' + s.paginaAtual + ' (' + s.registrosSalvos + ' salvos)')
              } else {
                clearInterval(syncTimer.current); syncTimer.current = null
                setSyncRodando(false)
                if (s.erro) {
                  setSyncStatus('Erro: ' + s.erro)
                } else {
                  setSyncStatus('OK - ' + s.registrosSalvos + ' titulos (pagar + receber)')
                  if (view === 'ano') carregarAno()
                  else if (view === 'lista') carregarLista()
                  else carregarCalendario()
                  carregarFiltros()
                }
              }
            })
        }, 2000)
      })
      .catch((e) => { setSyncRodando(false); setSyncStatus('Erro: ' + e.message) })
  }

  // =========================================================================
  // Cor de fundo / bolinhas / conteudo da celula do mes (port fiel)
  // =========================================================================
  function corCelula(d) {
    if (tipo === 'ambos') {
      if (d.saldo > 0) return 'bg-emerald-50 border-emerald-200'
      if (d.saldo < 0) return 'bg-red-50 border-red-200'
      return ''
    }
    if (tipo === 'receber') {
      if (d.vencido > 0) return 'bg-red-100 border-red-300'
      if (d.parcial > 0) return 'bg-orange-100 border-orange-300'
      if (d.aVencer > 0) return 'bg-emerald-50 border-emerald-200'
      if (d.pago > 0) return 'bg-emerald-100 border-emerald-300'
      return ''
    }
    // pagar
    if (d.vencido > 0) return 'bg-red-100 border-red-300'
    if (d.parcial > 0) return 'bg-orange-100 border-orange-300'
    if (d.aVencer > 0) return 'bg-amber-50 border-amber-200'
    if (d.pago > 0) return 'bg-emerald-50 border-emerald-200'
    return ''
  }
  function Bolinhas({ d }) {
    const out = []
    if (tipo === 'ambos') {
      if (d.countEntrada > 0) out.push(<span key="e" className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" title="entrada" />)
      if (d.countSaida > 0) out.push(<span key="s" className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" title="saida" />)
      return out
    }
    if (d.vencido > 0) out.push(<span key="v" className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" title="vencido" />)
    if (d.parcial > 0) out.push(<span key="p" className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1" title="parcial" />)
    if (d.aVencer > 0) out.push(<span key="a" className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" title="a vencer" />)
    if (d.pago > 0) out.push(<span key="g" className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" title="pago" />)
    return out
  }
  function ConteudoCelula({ info }) {
    if (!info) return null
    if (tipo === 'ambos') {
      const saldoCor = info.saldo >= 0 ? 'text-emerald-800' : 'text-red-800'
      return (
        <>
          {info.countEntrada > 0 && <div className="text-xs text-emerald-700 font-semibold">+{fmtBRL(info.entrada)}</div>}
          {info.countSaida > 0 && <div className="text-xs text-red-700 font-semibold">-{fmtBRL(info.saida)}</div>}
          <div className={'text-xs ' + saldoCor + ' font-bold mt-0.5'}>= {fmtBRL(info.saldo)}</div>
        </>
      )
    }
    return (
      <>
        <div className="text-sm font-bold text-slate-800 mt-1">{fmtBRL(info.total)}</div>
        <div className="text-xs text-slate-500">{info.count} titulo{info.count > 1 ? 's' : ''}</div>
      </>
    )
  }

  // =========================================================================
  // Render do grid mensal (port fiel de renderCalendario), via JSX
  // =========================================================================
  function celulasMes() {
    const porData = {}
    dias.forEach((d) => { porData[d.data] = d })
    const primeiro = new Date(ano, mes - 1, 1)
    const diaSemInicio = primeiro.getDay()
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const altura = tipo === 'ambos' ? 'h-28' : 'h-24'

    const cells = []
    let key = 0
    for (let i = 0; i < diaSemInicio; i++) {
      cells.push(<div key={'b' + key++} className={altura + ' border-r border-b border-slate-200 bg-slate-50/50'} />)
    }
    for (let d = 1; d <= ultimoDia; d++) {
      const iso = ano + '-' + String(mes).padStart(2, '0') + '-' + String(d).padStart(2, '0')
      const info = porData[iso]
      const cor = info ? corCelula(info) : ''
      const ehHoje = iso === hojeISO ? 'ring-2 ring-blue-500 ring-inset' : ''
      const dow = new Date(ano, mes - 1, d).getDay()
      const fimDeSemana = (dow === 0 || dow === 6) ? 'bg-slate-50' : ''
      cells.push(
        <div
          key={'d' + d}
          className={altura + ' border-r border-b border-slate-200 p-2 cursor-pointer hover:bg-blue-50 transition ' + cor + ' ' + ehHoje + ' ' + fimDeSemana}
          onClick={() => abrirDrawer(iso)}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">{d}</span>
            {info && <span><Bolinhas d={info} /></span>}
          </div>
          <ConteudoCelula info={info} />
        </div>
      )
    }
    const totalCelulas = diaSemInicio + ultimoDia
    const faltando = (7 - (totalCelulas % 7)) % 7
    for (let j = 0; j < faltando; j++) {
      cells.push(<div key={'f' + key++} className={altura + ' border-r border-b border-slate-200 bg-slate-50/50'} />)
    }
    return cells
  }

  // =========================================================================
  // Agregacoes do calendario anual (port fiel de carregarAno)
  // =========================================================================
  const trimestres = [
    { nome: '1T', meses: [1, 2, 3] },
    { nome: '2T', meses: [4, 5, 6] },
    { nome: '3T', meses: [7, 8, 9] },
    { nome: '4T', meses: [10, 11, 12] },
  ].map((t) => {
    const ms = meses.filter((m) => t.meses.indexOf(m.mes) >= 0)
    const agg = { nome: t.nome, total: 0, count: 0, vencido: 0, pago: 0, aVencer: 0, parcial: 0, saida: 0, entrada: 0 }
    ms.forEach((m) => {
      agg.total += m.total; agg.count += m.count
      agg.vencido += m.vencido; agg.pago += m.pago
      agg.aVencer += m.aVencer; agg.parcial += m.parcial
      agg.saida += m.saida; agg.entrada += m.entrada
    })
    agg.saldo = agg.entrada - agg.saida
    return agg
  })

  let maxTotal = 0
  meses.forEach((m) => {
    const v = (tipo === 'ambos') ? Math.max(m.entrada, m.saida) : m.total
    if (v > maxTotal) maxTotal = v
  })
  maxTotal = maxTotal || 1

  const hojeM = new Date().getMonth() + 1
  const hojeA = new Date().getFullYear()

  function corBgTrim(t) {
    if (tipo === 'ambos') {
      if (t.saldo > 0) return 'bg-emerald-100 border-emerald-300'
      if (t.saldo < 0) return 'bg-red-100 border-red-300'
      return 'bg-slate-50 border-slate-200'
    }
    if (tipo === 'receber') return t.total > 0 ? 'bg-emerald-100 border-emerald-300' : 'bg-slate-50 border-slate-200'
    return t.total > 0 ? 'bg-amber-100 border-amber-300' : 'bg-slate-50 border-slate-200'
  }
  function corCardMes(m) {
    if (tipo === 'ambos') {
      if (m.saldo > 0) return 'bg-emerald-50'
      if (m.saldo < 0) return 'bg-red-50'
      return 'bg-white'
    }
    if (tipo === 'receber') return m.total > 0 ? 'bg-emerald-50' : 'bg-white'
    return m.total > 0 ? 'bg-amber-50' : 'bg-white'
  }

  // =========================================================================
  // Visao Lista: ordenacao (port fiel de lval / listaOrdenada / lSeta)
  // =========================================================================
  function lval(t, k) {
    switch (k) {
      case 'empresa': return empresaLabel(t.conta_omie)
      case 'nome': return (t.nome_contraparte || '').toLowerCase()
      case 'doc': return (t.numero_documento_fiscal || t.numero_documento || '')
      case 'data': return dataDe(t)
      case 'status': return t.status_derivado || ''
      case 'valor': return Number(t.valor_documento) || 0
      default: return ''
    }
  }
  function listaOrdenada() {
    const arr = listaDados.slice()
    const dir = lSort.dir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const va = lval(a, lSort.col), vb = lval(b, lSort.col)
      let r
      if (typeof va === 'number' && typeof vb === 'number') r = va - vb
      else r = String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' })
      if (r === 0) r = dataDe(a).localeCompare(dataDe(b))
      return r * dir
    })
    return arr
  }
  function clicarLSort(k) {
    setLSort((prev) => {
      if (k === prev.col) return { col: k, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { col: k, dir: (k === 'valor' || k === 'data') ? 'desc' : 'asc' }
    })
  }
  function LSeta({ k }) {
    if (k !== lSort.col) return <span className="text-slate-300">{'⇅'}</span>
    return lSort.dir === 'asc' ? <span className="text-slate-700">{'▲'}</span> : <span className="text-slate-700">{'▼'}</span>
  }

  // =========================================================================
  // Export CSV da visao Lista (port fiel de exportarListaCSV)
  // =========================================================================
  function exportarListaCSV() {
    const arr = listaOrdenada()
    const sep = ';'
    const head = ['Empresa', 'Tipo', 'Terceiro', 'Documento', 'NF', 'Parcela', 'Grupo', 'Categoria', 'Departamento',
      'Emissao', 'Criacao', 'Vencimento', 'Pagamento', 'Status', 'Valor documento', 'Valor pago']
    function cell(v) { v = (v == null ? '' : String(v)); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v }
    function num(n) { return (Number(n) || 0).toFixed(2).replace('.', ',') }
    const linhas = arr.map((t) => [
      empresaLabel(t.conta_omie), t.tipo === 'receber' ? 'Receber' : 'Pagar',
      t.nome_contraparte || '', t.numero_documento || '', t.numero_documento_fiscal || '', t.numero_parcela || '',
      t.grupo_categoria || '', t.descricao_categoria || '', t.descricao_departamento || '',
      fmtBRdata(t.data_emissao), fmtBRdata(String(t.data_inclusao || '').slice(0, 10)), fmtBRdata(t.data_vencimento), fmtBRdata(t.data_pagamento),
      t.status_derivado || '', num(t.valor_documento), num(t.valor_pago),
    ].map(cell).join(sep))
    const csv = '﻿' + [head.join(sep)].concat(linhas).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const p = periodoLista()
    a.download = 'calendario_' + tipo + '_' + p.de + '_a_' + p.ate + '.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // --- Estado de gate de permissao (BRIEF item 1) ---------------------------
  if (!loading && !loadingPerm && userProfile && (!temAcesso('financeiro') && !pode('dre', 'calendario'))) return <SemPermissao />

  // Coluna de data da Lista segue o eixo selecionado (Vencimento/Emissao/Criacao).
  // data_inclusao e timestamp -> usar so a fatia de data (YYYY-MM-DD).
  const eixoCampo = eixo === 'emissao' ? 'data_emissao' : eixo === 'inclusao' ? 'data_inclusao' : 'data_vencimento'
  const eixoLabel = eixo === 'emissao' ? 'Emissão' : eixo === 'inclusao' ? 'Criação' : 'Vencimento'
  const dataDe = (t) => String((t && t[eixoCampo]) || '').slice(0, 10)
  const lcols = LCOLS.map((c) => (c.key === 'data' ? { ...c, label: eixoLabel } : c))

  // Resumo / total da visao Lista
  const listaArr = listaOrdenada()
  const showTipoLista = (tipo === 'ambos')
  const totalLista = listaArr.reduce((s, t) => s + (Number(t.valor_documento) || 0), 0)
  const alinha = { left: 'text-left', center: 'text-center', right: 'text-right' }

  // Totais do drawer
  let drwEntrada = 0, drwSaida = 0
  drawerTitulos.forEach((t) => { if (t.tipo === 'receber') drwEntrada += t.valor_documento; else drwSaida += t.valor_documento })
  const drwSaldo = drwEntrada - drwSaida
  const drwTotalDia = tipo === 'receber' ? drwEntrada : drwSaida

  const altGrid = tipo === 'ambos' ? 'h-28' : 'h-24'

  return (
    <div className="text-slate-900">
      {/* ===================== Toolbar superior ===================== */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button type="button" onClick={irAnterior} className="px-3 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100">{'←'}</button>
        <h1 className="text-2xl font-semibold text-slate-800 min-w-[180px] text-center">{tituloPeriodo}</h1>
        <button type="button" onClick={irProximo} className="px-3 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100">{'→'}</button>
        <button type="button" onClick={irHoje} className="px-3 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100 text-sm">Hoje</button>

        {/* Toggle Mes / Ano / Lista */}
        <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm ml-2">
          {['mes', 'ano', 'lista'].map((v, i) => {
            const ativo = view === v
            const label = v === 'mes' ? 'Mes' : v === 'ano' ? 'Ano' : 'Lista'
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={'px-3 py-1 transition ' + (i > 0 ? 'border-l border-slate-300 ' : '') +
                  (ativo ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Toggle de TIPO (replica o header global da fonte) */}
        <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm" role="group">
          <button
            type="button" onClick={() => setTipo('pagar')}
            className={'px-3 py-1 transition ' + (tipo === 'pagar' ? 'bg-red-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}
          >A Pagar</button>
          <button
            type="button" onClick={() => setTipo('receber')}
            className={'px-3 py-1 transition border-l border-slate-300 ' + (tipo === 'receber' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}
          >A Receber</button>
          <button
            type="button" onClick={() => setTipo('ambos')}
            className={'px-3 py-1 transition border-l border-slate-300 ' + (tipo === 'ambos' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}
          >Ambos</button>
        </div>

        {/* Toggle de EIXO: posiciona os titulos por data de vencimento ou de emissao */}
        <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm" role="group" title="Data usada para posicionar os titulos no calendario">
          <button
            type="button" onClick={() => setEixo('vencimento')}
            className={'px-3 py-1 transition ' + (eixo === 'vencimento' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}
          >Vencimento</button>
          <button
            type="button" onClick={() => setEixo('emissao')}
            className={'px-3 py-1 transition border-l border-slate-300 ' + (eixo === 'emissao' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}
          >Emissao</button>
          <button
            type="button" onClick={() => setEixo('inclusao')}
            title="Data de inclusao (criacao) do lancamento no Omie — util em Contas a Pagar, onde a nota do fornecedor e lancada dias apos a emissao"
            className={'px-3 py-1 transition border-l border-slate-300 ' + (eixo === 'inclusao' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}
          >Criacao</button>
        </div>

        <span className="text-xs text-slate-500 ml-2">Modo:</span>
        <span className="text-xs font-semibold text-slate-700">{labelTipo}</span>
        <span className="text-xs text-slate-400">·</span>
        <span className="text-xs font-semibold text-slate-700">por {eixo === 'emissao' ? 'emissao' : eixo === 'inclusao' ? 'criacao' : 'vencimento'}</span>

        <button
          type="button" onClick={sincronizar} disabled={syncRodando}
          className="ml-auto px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:bg-slate-400"
        >Sincronizar</button>
        <span className="text-xs text-slate-500">{syncStatus}</span>
      </div>

      {/* ===================== KPIs ===================== */}
      {view !== 'lista' && tipo === 'pagar' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Kpi label="A vencer no mes" cor="text-amber-600" valor={kpiVal('aVencer')} />
          <Kpi label="Vencido" cor="text-red-600" valor={kpiVal('vencido')} />
          <Kpi label="Pago no mes" cor="text-emerald-600" valor={kpiVal('pago')} />
          <Kpi label="Proximos 7 dias" cor="text-blue-600" valor={kpiVal('prox7')} />
        </div>
      )}
      {view !== 'lista' && tipo === 'receber' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Kpi label="A receber no mes" cor="text-emerald-600" valor={kpiVal('aVencer')} />
          <Kpi label="Vencido" cor="text-red-600" valor={kpiVal('vencido')} />
          <Kpi label="Recebido no mes" cor="text-emerald-700" valor={kpiVal('pago')} />
          <Kpi label="Proximos 7 dias" cor="text-blue-600" valor={kpiVal('prox7')} />
        </div>
      )}
      {view !== 'lista' && tipo === 'ambos' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Kpi label="A receber no mes" cor="text-emerald-600" valor={kpiVal('aReceber')} />
          <Kpi label="A pagar no mes" cor="text-red-600" valor={kpiVal('aPagar')} />
          <Kpi label="Saldo previsto" cor={kpiSaldoCor('saldoPrevisto')} valor={kpiVal('saldoPrevisto')} />
          <Kpi label="Saldo prox. 7 dias" cor={kpiSaldoCor('saldoProx7')} valor={kpiVal('saldoProx7')} />
        </div>
      )}

      {/* ===================== Filtros ===================== */}
      <div className="flex items-center gap-2 mb-4 flex-wrap text-sm">
        <select value={filtros.status} onChange={(e) => mudarFiltro('status', e.target.value)} className="border border-slate-300 rounded px-2 py-1 bg-white">
          <option value="">Todos os status</option>
          <option value="A_VENCER">A vencer</option>
          <option value="A_VENCER_PROXIMO">Proximos 7 dias</option>
          <option value="VENCIDO">Vencido</option>
          <option value="LIQUIDADO">Liquidado</option>
          <option value="PARCIAL">Pagamento parcial</option>
        </select>
        <select value={filtros.fornecedor} onChange={(e) => mudarFiltro('fornecedor', e.target.value)} className="border border-slate-300 rounded px-2 py-1 bg-white max-w-[260px]">
          <option value="">{tipo === 'receber' ? 'Todos os clientes' : (tipo === 'ambos' ? 'Todos os terceiros' : 'Todos os fornecedores')}</option>
          {opcoes.fornecedores.map((f) => <option key={f.codigo} value={f.codigo}>{f.nome || f.codigo}</option>)}
        </select>
        <select value={filtros.grupo} onChange={(e) => mudarFiltro('grupo', e.target.value)} className="border border-slate-300 rounded px-2 py-1 bg-white max-w-[260px]">
          <option value="">Todos os grupos</option>
          {opcoes.grupos.map((f) => <option key={f.codigo} value={f.codigo}>{f.nome || f.codigo}</option>)}
        </select>
        <select value={filtros.categoria} onChange={(e) => mudarFiltro('categoria', e.target.value)} className="border border-slate-300 rounded px-2 py-1 bg-white max-w-[260px]">
          <option value="">Todas as categorias</option>
          {opcoes.categorias.map((f) => <option key={f.codigo} value={f.codigo}>{f.nome || f.codigo}</option>)}
        </select>
        <select value={filtros.departamento} onChange={(e) => mudarFiltro('departamento', e.target.value)} className="border border-slate-300 rounded px-2 py-1 bg-white max-w-[260px]">
          <option value="">Todos os departamentos</option>
          {opcoes.departamentos.map((f) => <option key={f.codigo} value={f.codigo}>{f.nome || f.codigo}</option>)}
        </select>
        <button type="button" onClick={limparFiltros} className="px-3 py-1 border border-slate-300 rounded text-slate-600 hover:bg-slate-100">Limpar</button>
      </div>

      {/* ===================== Calendario mensal ===================== */}
      {view === 'mes' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div className="grid grid-cols-7 bg-slate-100 text-xs font-semibold text-slate-600 uppercase">
            {DIAS_SEM.map((d) => (
              <div key={d} className="px-2 py-2 text-center border-r border-slate-200 last:border-r-0">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {erroCal
              ? <div className="col-span-7 p-6 text-center text-red-600">{erroCal}</div>
              : celulasMes()}
          </div>
        </div>
      )}

      {/* ===================== Calendario anual ===================== */}
      {view === 'ano' && (
        <div className="overflow-x-auto">
          <div className="min-w-[1100px]">
            {erroAno ? (
              <div className="p-6 text-center text-red-600">{erroAno}</div>
            ) : (
              <>
                {/* Cards de trimestre */}
                <div className="grid grid-cols-12 gap-2 mb-2">
                  {trimestres.map((t) => (
                    <div key={t.nome} className={'col-span-3 p-2 rounded-lg border ' + corBgTrim(t)}>
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">{t.nome}</div>
                        <div className="text-[10px] text-slate-500">{t.count}</div>
                      </div>
                      {tipo === 'ambos' ? (
                        <>
                          <div className="text-[10px] text-emerald-700 mt-1">+ {fmtBRL(t.entrada)}</div>
                          <div className="text-[10px] text-red-700">- {fmtBRL(t.saida)}</div>
                          <div className={'text-sm font-bold mt-0.5 ' + (t.saldo >= 0 ? 'text-emerald-800' : 'text-red-800')}>= {fmtBRL(t.saldo)}</div>
                        </>
                      ) : (
                        <div className="text-base font-bold text-slate-800 mt-1">{fmtBRL(t.total)}</div>
                      )}
                    </div>
                  ))}
                </div>
                {/* 12 cards de mes */}
                <div className="grid grid-cols-12 gap-2">
                  {meses.map((m) => {
                    const ehHoje = (m.mes === hojeM && ano === hojeA)
                    const ring = ehHoje ? 'ring-2 ring-blue-500' : ''
                    const abrirMes = () => { setMes(m.mes); setView('mes') }
                    return (
                      <div
                        key={m.mes}
                        onClick={abrirMes}
                        className={'col-span-1 block p-2 rounded-lg border border-slate-200 hover:border-slate-400 hover:shadow transition cursor-pointer ' + corCardMes(m) + ' ' + ring}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs font-semibold text-slate-800">{NOMES_MES[m.mes - 1].slice(0, 3)}</div>
                          <div className="text-[10px] text-slate-500">{m.count}</div>
                        </div>
                        {tipo === 'ambos' ? (
                          <>
                            <div className="text-[10px] text-emerald-700">+ {fmtBRLcurto(m.entrada)}</div>
                            <div className="text-[10px] text-red-700">- {fmtBRLcurto(m.saida)}</div>
                            <div className={'text-xs font-bold mt-0.5 ' + (m.saldo >= 0 ? 'text-emerald-700' : 'text-red-700')}>{fmtBRLcurto(m.saldo)}</div>
                            <div className="mt-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500" style={{ width: (100 * m.entrada / maxTotal) + '%' }} />
                            </div>
                            <div className="mt-0.5 h-1 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-red-500" style={{ width: (100 * m.saida / maxTotal) + '%' }} />
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-sm font-bold text-slate-800">{fmtBRLcurto(m.total)}</div>
                            {(() => {
                              const totalCount = m.count || 1
                              const w1 = (100 * m.vencido / totalCount)
                              const w2 = (100 * m.parcial / totalCount)
                              const w3 = (100 * m.aVencer / totalCount)
                              const w4 = (100 * m.pago / totalCount)
                              return (
                                <div className="mt-1 flex h-1 rounded-full overflow-hidden bg-slate-100">
                                  {w1 ? <div className="bg-red-500" style={{ width: w1 + '%' }} /> : null}
                                  {w2 ? <div className="bg-orange-500" style={{ width: w2 + '%' }} /> : null}
                                  {w3 ? <div className="bg-amber-500" style={{ width: w3 + '%' }} /> : null}
                                  {w4 ? <div className="bg-emerald-500" style={{ width: w4 + '%' }} /> : null}
                                </div>
                              )
                            })()}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===================== Visao Lista ===================== */}
      {view === 'lista' && (
        <div>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm">
              {['mes', 'ano'].map((esc, i) => {
                const on = escopoLista === esc
                return (
                  <button
                    key={esc}
                    type="button"
                    onClick={() => setEscopoLista(esc)}
                    className={'px-3 py-1 transition ' + (i > 0 ? 'border-l border-slate-300 ' : '') +
                      (on ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}
                  >{esc === 'mes' ? 'Mes' : 'Ano'}</button>
                )
              })}
            </div>
            <span className="text-sm text-slate-600">
              <b>{listaArr.length}</b> titulo{listaArr.length !== 1 ? 's' : ''} {'·'} Total: <b className="text-slate-800">{fmtBRLfull(totalLista)}</b>
            </span>
            <button
              type="button"
              onClick={exportarListaCSV}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition"
            >{'↓'} Exportar CSV</button>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            {listaCarregando ? (
              <div className="p-8 text-center text-slate-400">Carregando...</div>
            ) : erroLista ? (
              <div className="p-8 text-center text-red-600">{erroLista}</div>
            ) : listaArr.length === 0 ? (
              <div className="p-8 text-center text-slate-400">Nenhum titulo no periodo.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-base text-slate-800">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide text-slate-600 bg-slate-50 border-b border-slate-200">
                      {lcols.map((c) => (
                        <th
                          key={c.key}
                          onClick={() => clicarLSort(c.key)}
                          className={'px-4 py-2.5 font-bold ' + alinha[c.align] + ' cursor-pointer select-none hover:bg-slate-100 whitespace-nowrap'}
                        >
                          <span className="inline-flex items-center gap-1">{c.label} <LSeta k={c.key} /></span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listaArr.map((t, i) => {
                      const sub = [t.grupo_categoria, t.descricao_categoria].filter(Boolean).join(' · ')
                      return (
                        <tr
                          key={t.codigo_lancamento || i}
                          onClick={() => { const d = dataDe(t); if (d) abrirDrawer(d) }}
                          className="border-b border-slate-100 hover:bg-blue-50 cursor-pointer"
                        >
                          <td className="px-4 py-2.5"><EmpresaBadge c={t.conta_omie} /></td>
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-slate-900">
                              {showTipoLista && <TipoBadge t={t.tipo} />}
                              {t.nome_contraparte || <span className="text-slate-400">Sem nome</span>}
                            </div>
                            {sub && <div className="text-xs text-slate-500">{sub}</div>}
                          </td>
                          <td className="px-4 py-2.5 text-slate-700 whitespace-nowrap">{docDe(t)}</td>
                          <td className="px-4 py-2.5 text-slate-800 whitespace-nowrap">{fmtBRdata(dataDe(t))}</td>
                          <td className="px-4 py-2.5"><StatusBadge s={t.status_derivado} /></td>
                          <td className="px-4 py-2.5 text-right font-bold text-slate-900 whitespace-nowrap">{fmtBRLfull(t.valor_documento)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================== Drawer lateral ===================== */}
      <div
        className={'fixed inset-0 bg-black/30 z-40 ' + (drawerAberto ? '' : 'hidden')}
        onClick={fecharDrawer}
      />
      <aside
        className={'fixed top-0 right-0 h-full w-full md:w-[640px] bg-white shadow-2xl z-50 transform transition-transform overflow-y-auto ' +
          (drawerAberto ? 'translate-x-0' : 'translate-x-full')}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Titulos {eixo === 'emissao' ? 'emitidos' : eixo === 'inclusao' ? 'criados' : 'vencendo'} em {fmtBRdata(drawerData)}</h2>
          <button onClick={fecharDrawer} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">{'×'}</button>
        </div>
        <div className="p-5">
          {drawerCarregando ? (
            <div className="text-slate-500 text-sm">Carregando...</div>
          ) : drawerErro ? (
            <div className="text-red-600 text-sm">{drawerErro}</div>
          ) : drawerTitulos.length === 0 ? (
            <div className="text-slate-500 text-sm">Nenhum titulo neste dia.</div>
          ) : (
            <>
              {/* Resumo */}
              {tipo === 'ambos' ? (
                <div className="mb-4 grid grid-cols-3 gap-2 text-center">
                  <div className="border border-emerald-200 bg-emerald-50 rounded p-2">
                    <div className="text-xs text-emerald-700">Entradas</div>
                    <div className="font-bold text-emerald-800">{fmtBRLfull(drwEntrada)}</div>
                  </div>
                  <div className="border border-red-200 bg-red-50 rounded p-2">
                    <div className="text-xs text-red-700">Saidas</div>
                    <div className="font-bold text-red-800">{fmtBRLfull(drwSaida)}</div>
                  </div>
                  <div className="border border-slate-200 rounded p-2">
                    <div className="text-xs text-slate-600">Saldo</div>
                    <div className={'font-bold ' + (drwSaldo >= 0 ? 'text-emerald-700' : 'text-red-700')}>{fmtBRLfull(drwSaldo)}</div>
                  </div>
                </div>
              ) : (
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm text-slate-600"><b>{drawerTitulos.length}</b> titulo{drawerTitulos.length > 1 ? 's' : ''}</div>
                  <div className="text-lg font-bold text-slate-800">{fmtBRLfull(drwTotalDia)}</div>
                </div>
              )}

              {/* Cartoes dos titulos */}
              <div className="space-y-2">
                {drawerTitulos.map((t, i) => {
                  const corBorda = t.tipo === 'receber' ? 'border-emerald-200' : 'border-slate-200'
                  const meta = []
                  if (t.numero_documento) meta.push('Doc: ' + t.numero_documento)
                  if (t.numero_documento_fiscal) meta.push('NF: ' + t.numero_documento_fiscal)
                  if (t.numero_parcela) meta.push('Parc: ' + t.numero_parcela)
                  if (t.grupo_categoria) meta.push(t.grupo_categoria)
                  if (t.descricao_categoria) meta.push(t.descricao_categoria)
                  if (t.descricao_departamento) meta.push(t.descricao_departamento)
                  const labelPgto = t.tipo === 'receber' ? 'Recebido' : 'Pago'
                  return (
                    <div key={t.codigo_lancamento || i} className={'border ' + corBorda + ' rounded-lg p-3 hover:border-slate-300 transition'}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="font-medium text-slate-800 text-sm">
                          {tipo === 'ambos' && <TipoBadge t={t.tipo} />}
                          {t.nome_contraparte || <span className="text-slate-400">Sem nome</span>}
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-slate-900">{fmtBRLfull(t.valor_documento)}</div>
                          <StatusBadge s={t.status_derivado} />
                        </div>
                      </div>
                      {meta.length > 0 && <div className="text-xs text-slate-500 mb-1">{meta.join(' · ')}</div>}
                      {t.observacao && <div className="text-xs text-slate-600 italic">{t.observacao}</div>}
                      {t.data_pagamento && (
                        <div className="text-xs text-emerald-700 mt-1">{labelPgto} em {fmtBRdata(t.data_pagamento)} ({fmtBRLfull(t.valor_pago)})</div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  )

  // -------------------------------------------------------------------------
  // Helpers de KPI (declarados como closures para usar kpis/kpisAno/view).
  // Reaproveitam os mesmos elementos quando a visao e "ano" (labels iguais a
  // fonte, valores anuais; prox7/saldoProx7 viram "--" no ano, igual a fonte).
  // -------------------------------------------------------------------------
  function kpiVal(qual) {
    if (view === 'ano') {
      const k = kpisAno
      switch (qual) {
        case 'aVencer': return fmtBRL(k.aVencer)
        case 'vencido': return fmtBRL(k.vencido)
        case 'pago': return fmtBRL(k.pagoAno)
        case 'prox7': return '--'
        case 'aReceber': return fmtBRL(k.aReceberAno)
        case 'aPagar': return fmtBRL(k.aPagarAno)
        case 'saldoPrevisto': return fmtBRL(k.saldoPrevisto)
        case 'saldoProx7': return '--'
        default: return '--'
      }
    }
    const k = kpis
    switch (qual) {
      case 'aVencer': return fmtBRL(k.aVencer)
      case 'vencido': return fmtBRL(k.vencido)
      case 'pago': return fmtBRL(k.pagoMes)
      case 'prox7': return fmtBRL(k.prox7)
      case 'aReceber': return fmtBRL(k.aReceberMes)
      case 'aPagar': return fmtBRL(k.aPagarMes)
      case 'saldoPrevisto': return fmtBRL(k.saldoPrevisto)
      case 'saldoProx7': return fmtBRL(k.saldoProx7)
      default: return '--'
    }
  }
  function kpiSaldoCor(qual) {
    if (view === 'ano' && (qual === 'saldoProx7')) return 'text-slate-800'
    const k = view === 'ano' ? kpisAno : kpis
    const v = k[qual] || 0
    return v >= 0 ? 'text-emerald-700' : 'text-red-700'
  }
}

// ---------------------------------------------------------------------------
// Card de KPI (markup identico aos cards .ejs)
// ---------------------------------------------------------------------------
function Kpi({ label, cor, valor }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={'text-2xl font-bold mt-1 ' + cor}>{valor}</div>
    </div>
  )
}
