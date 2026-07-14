'use client'
// =============================================================================
// Tela DRE Consolidada (port FIEL de views/dre.ejs do financeiro-omie-dashboard).
//
// Mantem EXATAMENTE os calculos e o comportamento do original:
//  - Regime "Competencia" (default) e "Omie" (toggle).
//  - KPIs consolidados, grafico de evolucao mensal (Chart.js bar+line).
//  - Tabela DRE hierarquica (tipo > grupo > conta > categoria) com colunas
//    NOVA / CASTRO / Consolidado + colunas por mes (ou ano).
//  - Grafico de evolucao das despesas (linha por conta/categoria) alinhado a
//    tabela, com clamp de escala (IQR) e drill-down por clique.
//  - Modal de drill-down: lista de movimentos + treemap, busca, ordenacao.
//  - Card de operacoes intercompany (so no regime Omie).
//  - Export CSV.
//
// Chart.js 4.4.0 + chartjs-chart-treemap 3.1.0 sao carregados via CDN (mesmo
// que a fonte) num <script> dinamico; os graficos usam refs/canvas imperativos.
// A tabela/KPIs/modal sao renderizados via JSX/React (estado e handlers React).
//
// O layout do modulo (.../dre-financeiro/layout.js) ja aplica o gate de
// permissao 'financeiro' e a sub-nav; ainda assim importamos useAuth/usePermissoes
// e SemPermissao por consistencia com o padrao do portal.
// =============================================================================

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta } from '@/lib/dre-financeiro/format'

// ---------------------------------------------------------------------------
// Constantes de layout (espelham as do <script> da fonte)
// ---------------------------------------------------------------------------
const COL_CONTA_PX = 280 // primeira coluna sticky (nome da conta)
const COL_AUX_PX = 90 // cada uma: NOVA, CASTRO, Consolidado
const COL_MES_PX = 92 // cada coluna de mes
const OFFSET_GRAFICO_PX = COL_CONTA_PX + 3 * COL_AUX_PX // 550 — padding-left do canvas do grafico

const PALETA = ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#10b981', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16']
// Liquidacoes de antecipacao de duplicata (factoring: ERG/BRADESCO/VOTORANTIM)
// caem nesta categoria do Omie. E' principal (fluxo de financiamento), nao
// despesa - no grafico de despesas sai da conta "03. Despesas Financeiras" e
// vira serie propria, oculta por padrao, pra nao esmagar as demais linhas.
const CATEGORIA_EMPRESTIMOS = 'Pagamento de Empréstimos'
const PALETA_TREEMAP = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16', '#0ea5e9', '#a3e635']
// Marcadores distintos por familia: ajudam a diferenciar linhas sobrepostas na
// aba "Margens por Familia" (margens proximas tendem a colar umas nas outras).
const FAM_POINT_STYLES = ['circle', 'rect', 'triangle', 'rectRot', 'star', 'crossRot']

// ---------------------------------------------------------------------------
// Formatadores locais (identicos aos do <script> da fonte; o modo % depende
// destes, por isso ficam inline ao inves de usar os de '@/lib/.../format').
// ---------------------------------------------------------------------------
function fmtBRL(n) {
  return 'R$ ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(n) || 0)
}
function fmtBRLs(n) {
  let v = Number(n) || 0, s = v < 0 ? '-' : '', a = Math.abs(v)
  if (a >= 1e6) return s + 'R$ ' + (a / 1e6).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1e3) return s + 'R$ ' + Math.round(a / 1e3) + 'k'
  return s + 'R$ ' + Math.round(a)
}
function rotuloMes(k) {
  const p = k.split('-')
  return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][parseInt(p[1]) - 1] + '/' + p[0].slice(2)
}
function cor(v) {
  if (v > 0) return 'text-emerald-700'
  if (v < 0) return 'text-red-700'
  return 'text-slate-500'
}

// ---------------------------------------------------------------------------
// Unidades de periodo (mes / trimestre / ano) a partir da lista de meses
// "YYYY-MM". Cada unidade carrega as chaves de mes que a compoem, para a
// agregacao posterior. Ordenadas cronologicamente.
// ---------------------------------------------------------------------------
function unidadesDeMeses(meses, unidade) {
  const lista = (meses || []).slice().sort()
  if (unidade === 'mes') {
    return lista.map((k) => ({ key: k, label: rotuloMes(k), meses: [k] }))
  }
  if (unidade === 'ano') {
    const mapa = {}
    lista.forEach((k) => { const a = k.split('-')[0]; (mapa[a] = mapa[a] || []).push(k) })
    return Object.keys(mapa).sort().map((a) => ({ key: a, label: a, meses: mapa[a] }))
  }
  // trimestre
  const mapa = {}
  lista.forEach((k) => {
    const p = k.split('-'); const ano = p[0]; const q = Math.floor((parseInt(p[1]) - 1) / 3) + 1
    const key = ano + '-T' + q
    if (!mapa[key]) mapa[key] = { key, label: 'T' + q + '/' + ano.slice(2), meses: [] }
    mapa[key].meses.push(k)
  })
  return Object.keys(mapa).sort().map((key) => mapa[key])
}

// Janelas moveis de 12 meses (uma por mes-fim), para a Peca B no modo 12M.
function janelas12M(meses) {
  const lista = (meses || []).slice().sort()
  return lista.map((fim, i) => ({
    key: fim,
    label: rotuloMes(fim),
    meses: lista.slice(Math.max(0, i - 11), i + 1),
  }))
}

// Soma um por_mes sobre um conjunto de chaves de mes.
function somaPorMeses(porMes, chaves) {
  if (!porMes) return 0
  let s = 0
  ;(chaves || []).forEach((k) => { s += porMes[k] || 0 })
  return s
}

// Soma um campo (ex.: 'receita'/'cmv') de um por_mes cujos valores sao objetos,
// sobre um conjunto de chaves de mes. Usado na aba "Margens por Familia".
function somaCampoPorMeses(porMes, chaves, campo) {
  if (!porMes) return 0
  let s = 0
  ;(chaves || []).forEach((k) => { const c = porMes[k]; if (c) s += c[campo] || 0 })
  return s
}

// Agrega as 5 linhas do DRE (em R$) para um conjunto de meses, a partir da
// arvore consolidada. Reconcilia com o grafico/KPIs:
//   ReceitaLiquida = LucroBruto + |CMV| ; Resultado = LucroBruto - |Despesas|.
function agregarDRE(consolidado, chaves) {
  const lb = (consolidado && consolidado['1. Lucro Bruto']) || {}
  const grupoCustos = (lb.grupos && lb.grupos['21. Custos']) || {}
  const desp = (consolidado && consolidado['2. Despesas']) || {}
  const lucroBruto = somaPorMeses(lb.por_mes, chaves)
  const cmv = Math.abs(somaPorMeses(grupoCustos.por_mes, chaves))
  const despesas = Math.abs(somaPorMeses(desp.por_mes, chaves))
  const receita = lucroBruto + cmv
  const resultado = lucroBruto - despesas
  return { receita, cmv, lucroBruto, despesas, resultado }
}

// Defaults: jan/2023 ate mes anterior ao atual (igual setupDefaults da fonte)
function defaultsPeriodo() {
  const hoje = new Date()
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const ini = new Date(2023, 0, 1)
  const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
  return { de: ym(ini), ate: ym(fim) }
}

// Carrega Chart.js + plugin treemap via CDN uma unica vez (mesmas versoes da fonte).
let chartLibPromise = null
function carregarChartLib() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.Chart) return Promise.resolve()
  if (chartLibPromise) return chartLibPromise
  function addScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = resolve
      s.onerror = reject
      document.head.appendChild(s)
    })
  }
  chartLibPromise = addScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js')
    .then(() => addScript('https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@3.1.0/dist/chartjs-chart-treemap.min.js'))
  return chartLibPromise
}

export default function DrePage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
  // A tela DRE e sempre consolidada (NOVA + CASTRO); a conta selecionada e
  // importada por consistencia com o BRIEF, mas o original nao filtra por conta.
  useDreConta()

  // --- Estado de dados/controles (espelha as vars do IIFE da fonte) ---------
  const def = defaultsPeriodo()
  const [dados, setDados] = useState(null)
  const [status, setStatus] = useState('')
  const [carregando, setCarregando] = useState(false)

  const [regime, setRegime] = useState('competencia') // 'competencia' | 'omie'
  const [modoExibicao, setModoExibicao] = useState('rs') // 'rs' | 'pct'
  const [granularidade, setGranularidade] = useState('mes') // 'mes' | 'ano'
  const [escalaDespesas, setEscalaDespesas] = useState('log') // 'log' | 'auto' | 'full'
  const [nivelDespesas, setNivelDespesas] = useState('conta') // 'conta' | 'categoria'

  const [desde, setDesde] = useState(def.de)
  const [ate, setAte] = useState(def.ate)
  const [tipoData, setTipoData] = useState('1') // '1' Emissao | '2' Registro

  const [mostrarContas, setMostrarContas] = useState(false)
  const [mostrarCategorias, setMostrarCategorias] = useState(false)
  const [mostrarMeses, setMostrarMeses] = useState(true)

  // --- Painel de resultado (Cascata + Margens + Resumo) ---------------------
  const [dreUnidade, setDreUnidade] = useState('trimestre') // 'mes' | 'trimestre' | 'ano'
  const [drePeriodoSel, setDrePeriodoSel] = useState(null)   // chave da unidade focada (cascata + resumo)
  const [dreComparar, setDreComparar] = useState('anterior') // 'anterior' | 'ano_anterior'
  const [margem12M, setMargem12M] = useState(false)          // Peca B: janela movel de 12 meses

  // --- Abas da tela (Consolidado / Margens por Familia) ---------------------
  const [aba, setAba] = useState('consolidado')              // 'consolidado' | 'familias'
  const [dadosFam, setDadosFam] = useState(null)             // { meses, familias } da rota margens-familia
  const [carregandoFam, setCarregandoFam] = useState(false)
  const [erroFam, setErroFam] = useState('')
  const [metricaFam, setMetricaFam] = useState('liquida')    // 'bruta' | 'liquida' (grafico)
  const famChartRef = useRef(null)
  const famChartInst = useRef(null)

  // Cache de denominadores (Receita Liquida Operacional) por escopo
  const [rl, setRl] = useState(null)

  // Modal de drill-down
  const [modalAberto, setModalAberto] = useState(false)
  const [modalCtx, setModalCtx] = useState(null) // { classif, titulo }
  const [modalMovimentos, setModalMovimentos] = useState([])
  const [modalCarregando, setModalCarregando] = useState(false)
  const [modalErro, setModalErro] = useState('')
  const [modalBusca, setModalBusca] = useState('')
  const [modalView, setModalView] = useState('tabela') // 'tabela' | 'treemap'
  const [modalGrupo, setModalGrupo] = useState('fornecedor') // 'fornecedor' | 'categoria'
  const [ordemModal, setOrdemModal] = useState({ campo: 'valor', dir: 'desc' })

  // Modal de detalhe do grafico de familias (clique num ponto): vendas que
  // compoem a margem daquela familia naquele periodo.
  const [famDetCtx, setFamDetCtx] = useState(null) // { titulo, resumo }
  const [famDetVendas, setFamDetVendas] = useState([])
  const [famDetCarregando, setFamDetCarregando] = useState(false)
  const [famDetErro, setFamDetErro] = useState('')
  const [famDetBusca, setFamDetBusca] = useState('')

  // Refs de canvas + instancias Chart.js
  const cascataRef = useRef(null)
  const cascataInst = useRef(null)
  const margemRef = useRef(null)
  const margemInst = useRef(null)
  const despesasRef = useRef(null)
  const despesasInst = useRef(null)
  const treemapRef = useRef(null)
  const treemapInst = useRef(null)
  const scrollRef = useRef(null)
  const tabelaRef = useRef(null)
  const despesasWrapRef = useRef(null)

  const [graficoInfo, setGraficoInfo] = useState('')
  const [despesasInfo, setDespesasInfo] = useState('')
  const [chartReady, setChartReady] = useState(false)

  // Flag: scrolla pra direita (meses recentes) apenas no primeiro render apos carregar
  const scrollPosDir = useRef(false)

  // Carrega a lib de grafico uma vez
  useEffect(() => {
    carregarChartLib().then(() => setChartReady(true)).catch(() => setChartReady(false))
  }, [])

  // =========================================================================
  // Helpers de granularidade / agregacao (port fiel)
  // =========================================================================
  const colunasAtuais = useCallback(() => {
    if (!dados) return []
    if (granularidade === 'ano') {
      const anos = Array.from(new Set((dados.meses || []).map((k) => k.split('-')[0])))
      return anos.sort()
    }
    return dados.meses || []
  }, [dados, granularidade])

  const valorPorColuna = useCallback((porMes, key) => {
    if (!porMes) return 0
    if (granularidade === 'ano') {
      let soma = 0
      Object.entries(porMes).forEach((e) => { if (e[0].startsWith(key + '-')) soma += e[1] })
      return soma
    }
    return porMes[key] || 0
  }, [granularidade])

  const rotuloColuna = useCallback((key) => {
    if (granularidade === 'ano') return key
    return rotuloMes(key)
  }, [granularidade])

  // Receita Liquida Operacional (denominador do modo % RL)
  const calcularReceitaLiquida = useCallback((d) => {
    function rlArv(arv) {
      const t = arv && arv['1. Lucro Bruto']; if (!t) return 0
      const g = t.grupos && t.grupos['01. Receita Líquida Operacional']; if (!g) return 0
      return g.total || 0
    }
    function rlPorColuna(arv) {
      const out = {}
      const g = arv && arv['1. Lucro Bruto'] && arv['1. Lucro Bruto'].grupos && arv['1. Lucro Bruto'].grupos['01. Receita Líquida Operacional']
      if (!g) return out
      const cols = (granularidade === 'ano')
        ? Array.from(new Set((d.meses || []).map((k) => k.split('-')[0]))).sort()
        : (d.meses || [])
      cols.forEach((c) => { out[c] = valorPorColuna(g.por_mes, c) })
      return out
    }
    return {
      nova: rlArv(d.nova),
      castro: rlArv(d.castro),
      consolidado: rlArv(d.consolidado),
      consolidadoPorMes: rlPorColuna(d.consolidado), // chave pode ser ano ou mes
    }
  }, [granularidade, valorPorColuna])

  // Recalcula RL sempre que dados ou granularidade mudam
  useEffect(() => {
    if (dados) setRl(calcularReceitaLiquida(dados))
  }, [dados, calcularReceitaLiquida])

  // Unidades de periodo do painel de resultado (cascata + resumo)
  const dreUnidades = useCallback(() => unidadesDeMeses(dados?.meses, dreUnidade), [dados, dreUnidade])

  // Carga lazy da aba "Margens por Familia": so busca quando a aba e aberta.
  useEffect(() => {
    if (aba !== 'familias') return
    // Usa o periodo EFETIVAMENTE carregado no DRE (dados.periodo), nao o input:
    // assim a receita por familia cobre exatamente os mesmos meses das despesas
    // usadas no rateio (so muda quando o usuario clica "Carregar").
    const de = dados && dados.periodo && dados.periodo.de
    const ateP = dados && dados.periodo && dados.periodo.ate
    if (!de || !ateP) return
    setCarregandoFam(true); setErroFam('')
    // conta=todas: o DRE desta tela e SEMPRE consolidado (NOVA+CASTRO), entao a
    // receita por familia tem de cobrir as duas empresas para casar com as
    // despesas consolidadas usadas no rateio da margem liquida.
    fetch('/api/dre-financeiro/margens-familia?conta=todas&desde=' + de + '&ate=' + ateP)
      .then((r) => r.json())
      .then((d) => {
        setCarregandoFam(false)
        if (d.erro) { setErroFam(d.erro); setDadosFam(null); return }
        setDadosFam(d)
      })
      .catch((e) => { setCarregandoFam(false); setErroFam(e.message); setDadosFam(null) })
  }, [aba, dados])

  // Modelo da aba "Margens por Familia": cruza familia x unidade de periodo
  // (mes/trimestre/ano via dreUnidade), com margem bruta (receita-CMV) e margem
  // liquida (lucro bruto - despesas do periodo RATEADAS pela receita da familia).
  const famModel = useMemo(() => {
    if (!dadosFam || !dadosFam.familias || !dadosFam.familias.length) return null
    const unidades = unidadesDeMeses(dadosFam.meses, dreUnidade)
    const despPorMes = (dados && dados.consolidado && dados.consolidado['2. Despesas'] && dados.consolidado['2. Despesas'].por_mes) || {}
    // Por coluna (unidade): receita total de todas as familias + despesas do periodo.
    const colInfo = unidades.map((u) => ({
      key: u.key, label: u.label, meses: u.meses,
      receitaTotal: dadosFam.familias.reduce((s, f) => s + somaCampoPorMeses(f.por_mes, u.meses, 'receita'), 0),
      despesas: Math.abs(somaPorMeses(despPorMes, u.meses)),
    }))
    function celula(receita, cmv, c) {
      const lucroBruto = receita - cmv
      const margemBruta = receita > 0 ? (lucroBruto / receita) * 100 : null
      const despesaRateada = c.receitaTotal > 0 ? c.despesas * (receita / c.receitaTotal) : 0
      const lucroLiq = lucroBruto - despesaRateada
      const margemLiq = receita > 0 ? (lucroLiq / receita) * 100 : null
      return { key: c.key, receita, cmv, lucroBruto, margemBruta, despesaRateada, lucroLiq, margemLiq }
    }
    const linhas = dadosFam.familias.map((f) => ({
      familia: f.familia,
      totReceita: f.totais.receita,
      cels: colInfo.map((c) => celula(
        somaCampoPorMeses(f.por_mes, c.meses, 'receita'),
        somaCampoPorMeses(f.por_mes, c.meses, 'cmv'), c)),
    }))
    const totalCels = colInfo.map((c) => {
      const cmv = dadosFam.familias.reduce((s, f) => s + somaCampoPorMeses(f.por_mes, c.meses, 'cmv'), 0)
      // Na linha total, a despesa "rateada" e a despesa total do periodo.
      const cel = celula(c.receitaTotal, cmv, c)
      cel.despesaRateada = c.despesas
      cel.lucroLiq = cel.lucroBruto - c.despesas
      cel.margemLiq = c.receitaTotal > 0 ? (cel.lucroLiq / c.receitaTotal) * 100 : null
      return cel
    })
    return { colInfo, linhas, totalCels }
  }, [dadosFam, dados, dreUnidade])

  // Quando dados/unidade mudam, foca a ultima unidade disponivel (se a atual sumiu)
  useEffect(() => {
    const us = unidadesDeMeses(dados?.meses, dreUnidade)
    if (!us.length) { if (drePeriodoSel !== null) setDrePeriodoSel(null); return }
    if (!us.some((u) => u.key === drePeriodoSel)) setDrePeriodoSel(us[us.length - 1].key)
  }, [dados, dreUnidade, drePeriodoSel])

  // Formatadores que respeitam o modo (rs / pct). Retornam string ou JSX-marker.
  const fmtValorTexto = useCallback((v, denominador) => {
    if (modoExibicao === 'pct') {
      if (!denominador) return null // sinaliza traco cinza
      return ((v / denominador) * 100).toFixed(1) + '%'
    }
    return fmtBRLs(v)
  }, [modoExibicao])

  const fmtValorGrande = useCallback((v, denominador) => {
    if (modoExibicao === 'pct') {
      if (!denominador) return '--'
      return ((v / denominador) * 100).toFixed(1) + '%'
    }
    return fmtBRL(v)
  }, [modoExibicao])

  // =========================================================================
  // Carregamento dos dados (port fiel de carregar())
  // =========================================================================
  const carregar = useCallback((forceRefresh, regimeOverride) => {
    const reg = regimeOverride || regime
    if (!desde || !ate) { alert('Selecione o periodo'); return }
    setCarregando(true)
    let url
    if (reg === 'competencia') {
      setStatus('Reconstruindo DRE em regime de competencia a partir de vendas_itens + contas_pagar...')
      url = '/api/dre-financeiro/dre-competencia?desde=' + desde + '&ate=' + ate
    } else {
      setStatus(forceRefresh
        ? 'Re-buscando tudo do Omie (ignorando cache)...'
        : 'Buscando DRE (cache em supabase - primeira vez por mes leva ~1s, re-consulta e instantanea)...')
      url = '/api/dre-financeiro/dre?desde=' + desde + '&ate=' + ate + '&tipo_data=' + tipoData + (forceRefresh ? '&refresh=1' : '')
    }
    fetch(url).then((r) => r.json()).then((d) => {
      setCarregando(false)
      if (d.erro) { setStatus('Erro: ' + d.erro); return }
      scrollPosDir.current = true
      if (reg === 'competencia') {
        setStatus('Itens lidos: NOVA=' + d.contagem.nova_total + ' · CASTRO=' + d.contagem.castro_total + ' (intercompany filtrado em vendas: NOVA=' + d.contagem.nova_intercompany + ', CASTRO=' + d.contagem.castro_intercompany + ')')
      } else {
        setStatus('Movimentos lidos: NOVA=' + d.contagem.nova_total + ' (intercompany=' + d.contagem.nova_intercompany + ') · CASTRO=' + d.contagem.castro_total + ' (intercompany=' + d.contagem.castro_intercompany + ')')
      }
      setDados(d)
    }).catch((e) => {
      setCarregando(false)
      setStatus('Erro: ' + e.message)
    })
  }, [regime, desde, ate, tipoData])

  // Carrega na montagem (igual carregar(false) no fim do IIFE)
  useEffect(() => {
    carregar(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Troca de regime: ajusta subtitulo/visibilidade e recarrega (port de setRegime)
  function trocarRegime(r) {
    if (regime === r) return
    setRegime(r)
    carregar(false, r)
  }

  // =========================================================================
  // Somatorios da arvore DRE (port fiel)
  // =========================================================================
  function totalDoTipo(arvore, tipoPrefixo) {
    let soma = 0
    Object.keys(arvore || {}).forEach((t) => { if (t.indexOf(tipoPrefixo) === 0) soma += arvore[t].total })
    return soma
  }
  function totalContaEspecifica(arvore, tipoPrefixo, grupoSubstr, contaSubstr) {
    let soma = 0
    Object.keys(arvore || {}).forEach((t) => {
      if (t.indexOf(tipoPrefixo) !== 0) return
      Object.keys(arvore[t].grupos || {}).forEach((g) => {
        if (grupoSubstr && g.indexOf(grupoSubstr) < 0) return
        Object.keys(arvore[t].grupos[g].contas || {}).forEach((c) => {
          if (contaSubstr && c.indexOf(contaSubstr) < 0) return
          soma += arvore[t].grupos[g].contas[c].total
        })
      })
    })
    return soma
  }
  function totalDoTipoGrupo(arvore, tipoPrefixo, grupoSubstr) {
    let soma = 0
    Object.keys(arvore || {}).forEach((t) => {
      if (t.indexOf(tipoPrefixo) !== 0) return
      Object.keys(arvore[t].grupos || {}).forEach((g) => {
        if (g.indexOf(grupoSubstr) >= 0) soma += arvore[t].grupos[g].total
      })
    })
    return soma
  }

  // =========================================================================
  // KPIs (port fiel de renderKPIs)
  // =========================================================================
  let kpi = null
  if (dados && rl) {
    const cons = dados.consolidado
    const receitaBruta = totalContaEspecifica(cons, '1.', '01. Receita', '01. Receita Bruta')
    const cmv = totalDoTipoGrupo(cons, '1.', '21. Custos')
    const lucroBruto = totalDoTipo(cons, '1.')
    const despesas = totalDoTipo(cons, '2.')
    const resultado = lucroBruto + despesas // despesas ja sao negativas
    const den = rl.consolidado
    kpi = {
      receita: fmtValorGrande(receitaBruta, den),
      cmv: fmtValorGrande(cmv, den),
      lucroBruto: fmtValorGrande(lucroBruto, den),
      despesas: fmtValorGrande(despesas, den),
      resultado: fmtValorGrande(resultado, den),
      resultadoPositivo: resultado >= 0,
    }
  }

  // =========================================================================
  // PECA A — Cascata (waterfall) do periodo focado.
  // Sequencia: Receita Liquida -> (-)CMV -> (=)Lucro Bruto -> (-)Despesas
  // -> (=)Resultado. Barras de total ancoram no zero; deducoes flutuam entre
  // o acumulado anterior e o novo acumulado. Usa barras FLUTUANTES nativas do
  // Chart.js (data: [lo, hi]) — assim o sinal do acumulado nao quebra o
  // empilhamento (que separaria positivos e negativos). Um plugin inline
  // desenha rotulos (R$ + % da receita) e conectores tracejados.
  // =========================================================================
  useEffect(() => {
    if (!chartReady || !dados || !cascataRef.current || !window.Chart) return
    const us = unidadesDeMeses(dados.meses, dreUnidade)
    const sel = us.find((u) => u.key === drePeriodoSel) || us[us.length - 1]
    if (!sel) { if (cascataInst.current) { cascataInst.current.destroy(); cascataInst.current = null } return }
    const a = agregarDRE(dados.consolidado, sel.meses)
    const rec = a.receita || 0
    const lb = a.lucroBruto, res = a.resultado

    // Cada barra: faixa [lo, hi]; `valor` e o delta exibido (deducoes negativas);
    // `acc` e o nivel acumulado na aresta direita (origem do conector).
    const verde = '#0ea5e9', azul = '#1e3a8a', coral = '#f97316', neg = '#dc2626'
    const barras = [
      { label: 'Receita Líquida', lo: 0, hi: rec, valor: rec, acc: rec, color: verde },
      { label: '(−) CMV', lo: lb, hi: rec, valor: -a.cmv, acc: lb, color: coral },
      { label: '(=) Lucro Bruto', lo: Math.min(0, lb), hi: Math.max(0, lb), valor: lb, acc: lb, color: azul },
      { label: '(−) Despesas', lo: Math.min(lb, res), hi: Math.max(lb, res), valor: -a.despesas, acc: res, color: coral },
      { label: '(=) Resultado', lo: Math.min(0, res), hi: Math.max(0, res), valor: res, acc: res, color: res >= 0 ? azul : neg },
    ]
    const labels = barras.map((b) => b.label)
    const dataFaixas = barras.map((b) => [b.lo, b.hi])
    const cores = barras.map((b) => b.color)

    // Plugin inline: rotulos (R$ + %RL) acima de cada barra + conectores.
    const pluginRotulos = {
      id: 'cascataRotulos',
      afterDatasetsDraw(chart) {
        const { ctx } = chart
        const meta = chart.getDatasetMeta(0)
        if (!meta || !meta.data) return
        ctx.save()
        // conectores tracejados: nivel acumulado da barra i ate a barra i+1
        ctx.setLineDash([4, 3]); ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1
        for (let i = 0; i < barras.length - 1; i++) {
          const el = meta.data[i], elNext = meta.data[i + 1]
          if (!el || !elNext) continue
          const yAcc = chart.scales.y.getPixelForValue(barras[i].acc)
          ctx.beginPath()
          ctx.moveTo(el.x - el.width / 2, yAcc)
          ctx.lineTo(elNext.x + elNext.width / 2, yAcc)
          ctx.stroke()
        }
        ctx.setLineDash([])
        // rotulos: R$ (negrito) + % da receita, acima do topo de cada barra
        ctx.textAlign = 'center'
        barras.forEach((b, i) => {
          const el = meta.data[i]; if (!el) return
          const yTopo = chart.scales.y.getPixelForValue(b.hi)
          const pct = rec ? (b.valor / rec) * 100 : 0
          ctx.font = '700 11px sans-serif'; ctx.fillStyle = '#0f172a'
          ctx.fillText(fmtBRLs(b.valor), el.x, yTopo - 17)
          if (rec) { ctx.font = '600 10px sans-serif'; ctx.fillStyle = '#64748b'; ctx.fillText(pct.toFixed(0) + '%', el.x, yTopo - 5) }
        })
        ctx.restore()
      },
    }

    if (cascataInst.current) cascataInst.current.destroy()
    cascataInst.current = new window.Chart(cascataRef.current.getContext('2d'), {
      type: 'bar',
      data: { labels, datasets: [{ data: dataFaixas, backgroundColor: cores, borderWidth: 0, borderRadius: 3 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { top: 30 } },
        scales: {
          x: { grid: { display: false } },
          y: { ticks: { callback: (v) => fmtBRLs(v) }, grid: { color: (c) => (c.tick && c.tick.value === 0 ? '#94a3b8' : '#f1f5f9') } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => items[0].label,
              label: (item) => {
                const b = barras[item.dataIndex]
                const pct = rec ? (b.valor / rec) * 100 : 0
                return fmtBRL(b.valor) + (rec ? ' · ' + pct.toFixed(1) + '% da receita' : '')
              },
            },
          },
        },
      },
      plugins: [pluginRotulos],
    })
  }, [chartReady, dados, dreUnidade, drePeriodoSel])

  // =========================================================================
  // PECA B — Linha de margens % ao longo do tempo.
  // Margem Bruta % (solida) e Margem Liquida % (tracejada), por unidade
  // (trimestre/ano) ou por janela movel de 12 meses. Linha de referencia no
  // zero. Eixo secundario opcional fica a cargo do usuario; aqui mantemos
  // apenas as duas margens para leitura limpa da rentabilidade.
  // =========================================================================
  useEffect(() => {
    if (!chartReady || !dados || !margemRef.current || !window.Chart) return
    const us = margem12M ? janelas12M(dados.meses) : unidadesDeMeses(dados.meses, dreUnidade)
    const labels = us.map((u) => u.label)
    const margemBruta = us.map((u) => {
      const a = agregarDRE(dados.consolidado, u.meses)
      return a.receita ? (a.lucroBruto / a.receita) * 100 : null
    })
    const margemLiquida = us.map((u) => {
      const a = agregarDRE(dados.consolidado, u.meses)
      return a.receita ? (a.resultado / a.receita) * 100 : null
    })

    if (margemInst.current) margemInst.current.destroy()
    margemInst.current = new window.Chart(margemRef.current.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Margem Bruta %', data: margemBruta, borderColor: '#1e3a8a', backgroundColor: '#1e3a8a', borderWidth: 2, pointRadius: 2, tension: 0.2, spanGaps: true },
          { label: 'Margem Líquida %', data: margemLiquida, borderColor: '#dc2626', backgroundColor: '#dc2626', borderWidth: 2, borderDash: [5, 4], pointRadius: 2, tension: 0.2, spanGaps: true },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { grid: { display: false } },
          y: {
            ticks: { callback: (v) => v + '%' },
            grid: { color: (c) => (c.tick && c.tick.value === 0 ? '#94a3b8' : '#f1f5f9') },
          },
        },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 18, font: { size: 11 } } },
          tooltip: { callbacks: { label: (item) => item.dataset.label + ': ' + (item.raw == null ? '—' : item.raw.toFixed(1) + '%') } },
        },
      },
    })
    setGraficoInfo((dados.meses || []).length + ' meses')
  }, [chartReady, dados, dreUnidade, margem12M])

  // =========================================================================
  // Grafico da aba "Margens por Familia": evolucao da margem (bruta OU liquida,
  // conforme metricaFam) por unidade de periodo, 1 linha por familia top-6 (por
  // receita) + "Outros" agregado.
  // =========================================================================
  useEffect(() => {
    if (aba !== 'familias' || !chartReady || !famChartRef.current || !window.Chart) return
    const model = famModel
    if (!model || !model.colInfo.length) {
      if (famChartInst.current) { famChartInst.current.destroy(); famChartInst.current = null }
      return
    }
    const labels = model.colInfo.map((c) => c.label)
    const campoPct = metricaFam === 'bruta' ? 'margemBruta' : 'margemLiq'
    const campoLucro = metricaFam === 'bruta' ? 'lucroBruto' : 'lucroLiq'
    const TOP = 6
    const ordenadas = model.linhas.slice().sort((a, b) => b.totReceita - a.totReceita)
    const top = ordenadas.slice(0, TOP)
    const resto = ordenadas.slice(TOP)
    const datasets = top.map((ln, i) => ({
      label: ln.familia,
      data: ln.cels.map((c) => c[campoPct]),
      borderColor: PALETA[i % PALETA.length], backgroundColor: PALETA[i % PALETA.length],
      borderWidth: 2, pointRadius: 3, pointHoverRadius: 6,
      pointStyle: FAM_POINT_STYLES[i % FAM_POINT_STYLES.length],
      tension: 0.2, spanGaps: true,
    }))
    if (resto.length) {
      const data = model.colInfo.map((c, idx) => {
        let receita = 0, lucro = 0
        resto.forEach((ln) => { const cel = ln.cels[idx]; receita += cel.receita; lucro += cel[campoLucro] })
        return receita > 0 ? (lucro / receita) * 100 : null
      })
      datasets.push({ label: 'Outros', data, borderColor: '#94a3b8', backgroundColor: '#94a3b8', borderWidth: 2, borderDash: [5, 4], pointRadius: 3, pointHoverRadius: 6, pointStyle: 'circle', tension: 0.2, spanGaps: true })
    }
    // Familias por dataset (mesma ordem): usado no clique p/ abrir o detalhe.
    // "Outros" agrega todas as familias fora do top-6.
    const dsFamilias = top.map((ln) => [ln.familia])
    if (resto.length) dsFamilias.push(resto.map((ln) => ln.familia))

    // Escala robusta (clamp IQR, como no grafico de despesas): um outlier
    // (ex.: margem 300% num mes de receita minima) nao esmaga as demais linhas.
    // Valores fora da faixa ficam cortados no grafico mas aparecem no tooltip.
    const vals = []
    datasets.forEach((ds) => ds.data.forEach((v) => { if (v != null && isFinite(v)) vals.push(v) }))
    let yMin, yMax
    if (vals.length >= 8) {
      const s = vals.slice().sort((a, b) => a - b)
      const pct = (p) => {
        const idx = (s.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx)
        return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (idx - lo)
      }
      const q1 = pct(0.25), q3 = pct(0.75), iqr = q3 - q1
      const min = Math.max(s[0], q1 - 1.5 * iqr)
      const max = Math.min(s[s.length - 1], q3 + 1.5 * iqr)
      const pad = Math.max(2, (max - min) * 0.1)
      yMin = Math.floor((min - pad) / 5) * 5
      yMax = Math.ceil((max + pad) / 5) * 5
    }

    // Resumo (R$) da celula clicada, agregando as familias do dataset na coluna.
    function resumoColuna(idxDs, idxCol) {
      const linhas = idxDs < top.length ? [top[idxDs]] : resto
      const r = { receita: 0, cmv: 0, lucroBruto: 0, despesaRateada: 0, lucroLiq: 0 }
      linhas.forEach((ln) => {
        const c = ln.cels[idxCol]
        r.receita += c.receita; r.cmv += c.cmv; r.lucroBruto += c.lucroBruto
        r.despesaRateada += c.despesaRateada; r.lucroLiq += c.lucroLiq
      })
      return r
    }

    if (famChartInst.current) famChartInst.current.destroy()
    famChartInst.current = new window.Chart(famChartRef.current.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onClick: (evt, _els, chart) => {
          const els = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true)
          if (!els.length) return
          const { datasetIndex, index } = els[0]
          const col = model.colInfo[index]
          const familias = dsFamilias[datasetIndex]
          if (!col || !familias) return
          const nomeDs = datasetIndex < top.length ? top[datasetIndex].familia : 'Outros'
          const r = resumoColuna(datasetIndex, index)
          const resumo = 'Receita ' + fmtBRL(r.receita) + ' · CMV ' + fmtBRL(r.cmv)
            + ' · Lucro bruto ' + fmtBRL(r.lucroBruto)
            + ' · Despesa rateada ' + fmtBRL(r.despesaRateada)
            + ' · Lucro líquido ' + fmtBRL(r.lucroLiq)
          abrirDetalheFam({ titulo: nomeDs + ' · ' + col.label, resumo, familias, meses: col.meses })
        },
        onHover: (evt, _els, chart) => {
          const els = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true)
          chart.canvas.style.cursor = els.length ? 'pointer' : 'default'
        },
        scales: {
          x: { grid: { display: false } },
          y: { min: yMin, max: yMax, ticks: { callback: (v) => v + '%' }, grid: { color: (c) => (c.tick && c.tick.value === 0 ? '#94a3b8' : '#f1f5f9') } },
        },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 18, font: { size: 11 } } },
          tooltip: { usePointStyle: true, callbacks: { label: (item) => item.dataset.label + ': ' + (item.raw == null ? '—' : item.raw.toFixed(1) + '%') } },
        },
      },
    })
    // Cleanup: o canvas da aba familias desmonta ao trocar de aba; destruir a
    // instancia evita um Chart preso a um canvas destacado (vazamento).
    return () => { if (famChartInst.current) { famChartInst.current.destroy(); famChartInst.current = null } }
  }, [aba, chartReady, famModel, metricaFam])

  // =========================================================================
  // Teto de leitura do grafico de despesas (clamp IQR) — port fiel
  // =========================================================================
  function arredondarCimaDespesas(v) {
    if (v <= 0) return 0
    const mag = Math.pow(10, Math.floor(Math.log10(v)))
    const passo = mag / 2
    return Math.ceil(v / passo) * passo
  }
  function calcularTetoDespesas(datasets) {
    const vals = []
    datasets.forEach((ds) => { ds.data.forEach((v) => { if (isFinite(v) && v > 0) vals.push(v) }) })
    if (vals.length < 8) return null
    vals.sort((a, b) => a - b)
    function pct(p) {
      const idx = (vals.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx)
      return lo === hi ? vals[lo] : vals[lo] + (vals[hi] - vals[lo]) * (idx - lo)
    }
    const q3 = pct(0.75), iqr = q3 - pct(0.25)
    const cerca = q3 + 3 * iqr
    const normais = vals.filter((v) => v <= cerca)
    if (!normais.length) return null
    const teto = arredondarCimaDespesas(normais[normais.length - 1] * 1.1)
    const fora = vals.filter((v) => v > teto).length
    return fora > 0 ? { teto, fora } : null
  }

  // =========================================================================
  // Grafico de evolucao das despesas (port fiel de renderGraficoDespesas)
  // =========================================================================
  useEffect(() => {
    if (!chartReady || !dados || !despesasRef.current || !window.Chart) return
    const colunas = colunasAtuais()
    const labels = colunas.map(rotuloColuna)

    const porConta = {}
    const porCategoria = {}
    let nomes = []
    let datasets = []
    let infoTxt = ''

    if (nivelDespesas === 'categoria') {
      Object.keys(dados.consolidado || {}).forEach((t) => {
        if (t.indexOf('2.') !== 0) return
        const grupos = (dados.consolidado[t] || {}).grupos || {}
        Object.keys(grupos).forEach((g) => {
          const contas = grupos[g].contas || {}
          Object.keys(contas).forEach((c) => {
            const cats = contas[c].categorias || {}
            Object.keys(cats).forEach((cat) => {
              if (!porCategoria[cat]) porCategoria[cat] = { porMes: {}, tipo: t }
              const pm = cats[cat].por_mes || {}
              Object.keys(pm).forEach((k) => { porCategoria[cat].porMes[k] = (porCategoria[cat].porMes[k] || 0) + pm[k] })
            })
          })
        })
      })

      const todasCats = Object.keys(porCategoria).map((cat) => {
        const totAbs = colunas.reduce((s, k) => s + Math.abs(valorPorColuna(porCategoria[cat].porMes, k)), 0)
        return { nome: cat, totAbs }
      }).sort((a, b) => b.totAbs - a.totAbs)

      const TOP_N = 8
      const top = todasCats.slice(0, TOP_N)
      const resto = todasCats.slice(TOP_N)

      nomes = top.map((x) => x.nome)
      datasets = top.map((x, i) => {
        const c = PALETA[i % PALETA.length]
        return {
          label: x.nome,
          data: colunas.map((k) => Math.abs(valorPorColuna(porCategoria[x.nome].porMes, k))),
          borderColor: c, backgroundColor: c,
          borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, pointHitRadius: 8, tension: 0.2, fill: false,
        }
      })
      if (resto.length) {
        nomes.push('__OUTROS__')
        const outrosPorCol = colunas.map((k) => resto.reduce((s, x) => s + Math.abs(valorPorColuna(porCategoria[x.nome].porMes, k)), 0))
        datasets.push({
          label: 'Outros (' + resto.length + ')',
          data: outrosPorCol,
          borderColor: '#94a3b8', backgroundColor: '#94a3b8',
          borderWidth: 2, borderDash: [4, 4], pointRadius: 2, pointHoverRadius: 5, pointHitRadius: 8, tension: 0.2, fill: false,
        })
      }
      infoTxt = top.length + ' categorias' + (resto.length ? ' (+' + resto.length + ' em Outros)' : '') + ' · ' + colunas.length + ' colunas'
    } else {
      Object.keys(dados.consolidado || {}).forEach((t) => {
        if (t.indexOf('2.') !== 0) return
        const grupos = (dados.consolidado[t] || {}).grupos || {}
        Object.keys(grupos).forEach((g) => {
          const contas = grupos[g].contas || {}
          Object.keys(contas).forEach((c) => {
            if (!porConta[c]) porConta[c] = { porMes: {}, tipo: t }
            const pm = contas[c].por_mes || {}
            Object.keys(pm).forEach((k) => { porConta[c].porMes[k] = (porConta[c].porMes[k] || 0) + pm[k] })
            // "Pagamento de Emprestimos" (antecipacoes) sai da conta e vira
            // serie propria. So no regime Competencia a arvore tem o nivel
            // categorias{} - no Omie o bloco e' no-op e nada muda.
            const pmEmp = ((contas[c].categorias || {})[CATEGORIA_EMPRESTIMOS] || {}).por_mes || {}
            Object.keys(pmEmp).forEach((k) => {
              porConta[c].porMes[k] = (porConta[c].porMes[k] || 0) - pmEmp[k]
              porConta[c].categoriaNe = CATEGORIA_EMPRESTIMOS
              if (!porConta[CATEGORIA_EMPRESTIMOS]) {
                porConta[CATEGORIA_EMPRESTIMOS] = { porMes: {}, tipo: t, categoria: CATEGORIA_EMPRESTIMOS, conta: c }
              }
              porConta[CATEGORIA_EMPRESTIMOS].porMes[k] = (porConta[CATEGORIA_EMPRESTIMOS].porMes[k] || 0) + pmEmp[k]
            })
          })
        })
      })
      const temEmprestimos = !!porConta[CATEGORIA_EMPRESTIMOS]
      nomes = Object.keys(porConta).filter((n) => n !== CATEGORIA_EMPRESTIMOS).sort()
      const nContas = nomes.length
      datasets = nomes.map((nome, i) => {
        const c = PALETA[i % PALETA.length]
        return {
          label: nome,
          data: colunas.map((k) => Math.abs(valorPorColuna(porConta[nome].porMes, k))),
          borderColor: c, backgroundColor: c,
          borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, pointHitRadius: 8, tension: 0.2, fill: false,
        }
      })
      if (temEmprestimos) {
        // Por ultimo = item 7 da legenda (nao mexe nas cores das contas 01-06).
        // Tracejada pra distinguir; com a escala Log (default) os picos dela
        // nao achatam as demais linhas.
        nomes.push(CATEGORIA_EMPRESTIMOS)
        datasets.push({
          label: CATEGORIA_EMPRESTIMOS,
          data: colunas.map((k) => Math.abs(valorPorColuna(porConta[CATEGORIA_EMPRESTIMOS].porMes, k))),
          borderColor: '#64748b', backgroundColor: '#64748b',
          borderWidth: 2, borderDash: [4, 4], pointRadius: 2, pointHoverRadius: 5, pointHitRadius: 8, tension: 0.2, fill: false,
        })
      }
      infoTxt = nContas + ' contas · ' + colunas.length + ' colunas'
        + (temEmprestimos ? ' · empréstimos fora de Despesas Financeiras (série própria na legenda)' : '')
    }

    const clamp = calcularTetoDespesas(datasets)
    if (despesasInst.current) despesasInst.current.destroy()
    despesasInst.current = new window.Chart(despesasRef.current.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { left: OFFSET_GRAFICO_PX, right: 0 } },
        interaction: { mode: 'index', intersect: false },
        onClick: function (evt, els, chart) {
          if (granularidade !== 'mes') return
          const pts = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true)
          if (!pts.length) return
          const el = pts[0]
          const k = colunas[el.index]; if (!k) return
          const p = k.split('-')
          if (nivelDespesas === 'categoria') {
            const cat = nomes[el.datasetIndex]
            if (!cat || cat === '__OUTROS__') return
            abrirModalDetalhe({ ano: p[0], mes: p[1], dreTipo: '2. Despesas', dreCategoria: cat, label: cat })
          } else {
            const conta = nomes[el.datasetIndex]
            const info = porConta[conta]
            if (!conta || !info) return
            if (info.categoria) {
              // Serie separada de emprestimos: filtra pela categoria dentro da conta de origem
              abrirModalDetalhe({ ano: p[0], mes: p[1], dreTipo: info.tipo, dreGrupo: '', dreConta: info.conta || '', dreCategoria: info.categoria, label: conta })
            } else {
              // Conta que teve os emprestimos removidos: modal exclui a categoria pra bater com a linha
              abrirModalDetalhe({ ano: p[0], mes: p[1], dreTipo: info.tipo, dreGrupo: '', dreConta: conta, dreCategoriaNe: info.categoriaNe || '', label: conta })
            }
          }
        },
        onHover: function (evt, els, chart) {
          let clicavel = false
          if (granularidade === 'mes') {
            clicavel = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true).length > 0
          }
          chart.canvas.style.cursor = clicavel ? 'pointer' : 'default'
        },
        scales: {
          x: { offset: true, grid: { display: false } },
          // Log (default): pontos que estouram muito (ex.: parcelas de emprestimo)
          // continuam visiveis sem achatar as demais linhas.
          y: escalaDespesas === 'log' ? {
            type: 'logarithmic',
            ticks: { callback: (v) => fmtBRLs(v) },
          } : {
            min: 0,
            max: (escalaDespesas === 'auto' && clamp) ? clamp.teto : undefined,
            ticks: { callback: (v) => fmtBRLs(v) },
          },
          // Espelho do eixo Y no lado direito: o grafico e' largo e rola na
          // horizontal - quem esta na ponta direita tambem precisa da regua.
          y2: {
            position: 'right',
            type: escalaDespesas === 'log' ? 'logarithmic' : 'linear',
            afterDataLimits: (axis) => {
              const y = axis.chart.scales.y
              if (y) { axis.min = y.min; axis.max = y.max }
            },
            grid: { drawOnChartArea: false },
            ticks: { callback: (v) => fmtBRLs(v) },
          },
        },
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 10 } } },
          tooltip: { callbacks: { label: (item) => item.dataset.label + ': ' + fmtBRL(item.raw) } },
        },
      },
    })
    if (escalaDespesas === 'auto' && clamp) infoTxt += ' · ' + clamp.fora + ' ponto(s) fora da escala (ver tooltip)'
    setDespesasInfo(infoTxt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, dados, granularidade, nivelDespesas, escalaDespesas, colunasAtuais, rotuloColuna, valorPorColuna])

  // Ajusta larguras da tabela/wrapper do grafico e scrolla pra direita (port fiel)
  useEffect(() => {
    if (!dados) return
    const colunas = colunasAtuais()
    const nMeses = mostrarMeses ? colunas.length : 0
    const larguraTotalPx = COL_CONTA_PX + 3 * COL_AUX_PX + nMeses * COL_MES_PX
    if (tabelaRef.current) tabelaRef.current.style.width = larguraTotalPx + 'px'
    if (despesasWrapRef.current) despesasWrapRef.current.style.width = larguraTotalPx + 'px'
    if (scrollPosDir.current) {
      scrollPosDir.current = false
      const sc = scrollRef.current
      if (sc) requestAnimationFrame(() => { sc.scrollLeft = sc.scrollWidth })
    }
  }, [dados, mostrarMeses, granularidade, colunasAtuais])

  // =========================================================================
  // Modal de drill-down (port fiel de abrirModalDetalhe + helpers)
  // =========================================================================
  function abrirModalDetalhe(p) {
    const ano = p.ano, mes = p.mes
    const dreTipo = p.dreTipo, dreGrupo = p.dreGrupo, dreConta = p.dreConta, dreCategoria = p.dreCategoria || ''
    const dreCategoriaNe = p.dreCategoriaNe || ''
    const labelLinha = p.label || ''
    const rotuloMesStr = rotuloMes(ano + '-' + mes)
    const classifTexto = [dreTipo, dreGrupo, dreConta, dreCategoria].filter(Boolean).join(' › ')
      + (dreCategoriaNe ? ' (exceto ' + dreCategoriaNe + ')' : '')

    setModalCtx({ classif: classifTexto, titulo: labelLinha + ' · ' + rotuloMesStr })
    setModalMovimentos([])
    setModalErro('')
    setModalBusca('')
    setModalView('tabela')
    setModalGrupo('fornecedor')
    setOrdemModal({ campo: 'valor', dir: 'desc' })
    setModalCarregando(true)
    setModalAberto(true)
    if (treemapInst.current) { treemapInst.current.destroy(); treemapInst.current = null }

    let qs = 'ano=' + ano + '&mes=' + mes
    let endpoint
    if (regime === 'competencia') {
      endpoint = '/api/dre-financeiro/dre-competencia/detalhe'
    } else {
      qs += '&conta_omie=consolidado&tipo_data=' + tipoData
      endpoint = '/api/dre-financeiro/dre/detalhe'
    }
    if (dreTipo) qs += '&dre_tipo=' + encodeURIComponent(dreTipo)
    if (dreGrupo) qs += '&dre_grupo=' + encodeURIComponent(dreGrupo)
    if (dreConta) qs += '&dre_conta=' + encodeURIComponent(dreConta)
    if (dreCategoria) qs += '&dre_categoria=' + encodeURIComponent(dreCategoria)
    if (dreCategoriaNe) qs += '&dre_categoria_ne=' + encodeURIComponent(dreCategoriaNe)
    fetch(endpoint + '?' + qs).then((r) => r.json()).then((d) => {
      setModalCarregando(false)
      if (d.erro) { setModalErro('Erro: ' + d.erro); return }
      setModalMovimentos(d.movimentos || [])
    }).catch((e) => {
      setModalCarregando(false)
      setModalErro('Erro: ' + e.message)
    })
  }

  function fecharModal() {
    setModalAberto(false)
    if (treemapInst.current) { treemapInst.current.destroy(); treemapInst.current = null }
  }

  // Abre o popup de vendas de um ponto do grafico de familias.
  // p: { titulo, resumo, familias: [nomes normalizados], meses: ['YYYY-MM'] }
  function abrirDetalheFam(p) {
    setFamDetCtx({ titulo: p.titulo, resumo: p.resumo })
    setFamDetVendas([]); setFamDetErro(''); setFamDetBusca(''); setFamDetCarregando(true)
    const qs = 'conta=todas&meses=' + p.meses.join(',') + '&familias=' + encodeURIComponent(p.familias.join(','))
    fetch('/api/dre-financeiro/margens-familia/detalhe?' + qs)
      .then((r) => r.json())
      .then((d) => {
        setFamDetCarregando(false)
        if (d.erro) { setFamDetErro('Erro: ' + d.erro); return }
        setFamDetVendas(d.vendas || [])
      })
      .catch((e) => { setFamDetCarregando(false); setFamDetErro('Erro: ' + e.message) })
  }

  // Esc fecha os modais
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') { fecharModal(); setFamDetCtx(null) } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Filtra movimentos pela busca (port fiel de filtrarModal)
  function filtrarModal(filtroBusca) {
    const f = (filtroBusca || '').trim().toLowerCase()
    if (!f) return { f, list: modalMovimentos.slice() }
    return {
      f,
      list: modalMovimentos.filter((m) =>
        (m.nomeClienteFornecedor || '').toLowerCase().includes(f)
        || (m.categoria || '').toLowerCase().includes(f)
        || (m.dreConta || '').toLowerCase().includes(f)
        || (m.numeroDocumento || '').toLowerCase().includes(f)),
    }
  }

  // Ordenacao (port fiel de dataSortKey/ordenarModal)
  function dataSortKey(s) {
    s = String(s || '')
    let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
    if (m) return m[3] + m[2] + m[1]
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return m[1] + m[2] + m[3]
    return s
  }
  function ordenarModal(list) {
    const c = ordemModal.campo, dir = ordemModal.dir === 'asc' ? 1 : -1
    return list.slice().sort((a, b) => {
      let va = a[c], vb = b[c]
      if (c === 'valor') return ((Number(va) || 0) - (Number(vb) || 0)) * dir
      if (c === 'dataMovimento') { va = dataSortKey(va); vb = dataSortKey(vb) }
      if (va === null || va === undefined) va = ''
      if (vb === null || vb === undefined) vb = ''
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * dir
    })
  }
  function clicarOrdenacao(c) {
    setOrdemModal((prev) => {
      if (prev.campo === c) return { campo: c, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { campo: c, dir: (c === 'valor' || c === 'dataMovimento') ? 'desc' : 'asc' }
    })
  }

  // Treemap do modal (port fiel de renderModalTreemap)
  useEffect(() => {
    if (!modalAberto || modalView !== 'treemap') return
    if (!chartReady || !treemapRef.current || !window.Chart) return
    const r = filtrarModal(modalBusca)
    const campo = modalGrupo === 'categoria' ? 'categoria' : 'nomeClienteFornecedor'
    const semRotulo = modalGrupo === 'categoria' ? '(sem categoria)' : '(sem fornecedor)'
    const mapa = {}
    r.list.forEach((m) => {
      const nome = m[campo] || semRotulo
      mapa[nome] = (mapa[nome] || 0) + Math.abs(Number(m.valor) || 0)
    })
    let folhas = Object.keys(mapa).map((k) => ({ nome: k, valor: mapa[k] }))
      .filter((x) => x.valor > 0)
      .sort((a, b) => b.valor - a.valor)
    const LIMITE = 40
    if (folhas.length > LIMITE) {
      const head = folhas.slice(0, LIMITE - 1)
      const resto = folhas.slice(LIMITE - 1)
      head.push({ nome: 'Outros (' + resto.length + ')', valor: resto.reduce((s, x) => s + x.valor, 0) })
      folhas = head
    }
    const totalTm = folhas.reduce((s, x) => s + x.valor, 0)
    folhas.forEach((x, i) => { x.cor = PALETA_TREEMAP[i % PALETA_TREEMAP.length] })

    if (treemapInst.current) { treemapInst.current.destroy(); treemapInst.current = null }
    if (!folhas.length) return
    const ctx = treemapRef.current.getContext('2d')
    treemapInst.current = new window.Chart(ctx, {
      type: 'treemap',
      data: {
        datasets: [{
          tree: folhas, key: 'valor', spacing: 1, borderWidth: 1, borderRadius: 2,
          borderColor: 'rgba(255,255,255,0.9)',
          backgroundColor: function (c) {
            if (c.type !== 'data') return 'transparent'
            const d = c.raw && c.raw._data
            return (d && d.cor) || '#94a3b8'
          },
          labels: {
            display: true, align: 'left', position: 'top', color: '#fff',
            font: { size: 11, weight: 'bold' }, padding: 4, overflow: 'hidden',
            formatter: function (c) {
              const d = c.raw && c.raw._data; if (!d) return ''
              const nome = d.nome || ''
              return nome.length > 28 ? nome.slice(0, 26) + '...' : nome
            },
          },
          captions: {
            display: true, align: 'right', color: 'rgba(255,255,255,0.92)',
            font: { size: 10, weight: 'bold' }, padding: 4,
            formatter: function (c) { return fmtBRLs(c.raw.v) },
          },
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              title: function (items) { const d = items[0].raw && items[0].raw._data; return (d && d.nome) || '' },
              label: function (item) {
                const v = item.raw.v
                const pct = totalTm ? (100 * v / totalTm) : 0
                return fmtBRL(v) + ' (' + pct.toFixed(1) + '% do total)'
              },
            },
          },
        },
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalAberto, modalView, modalGrupo, modalBusca, modalMovimentos, chartReady])

  // =========================================================================
  // Export CSV (port fiel de exportarDreCSV)
  // =========================================================================
  function exportarDreCSV() {
    if (!dados) { alert('Carregue os dados primeiro.'); return }
    function esc(v) {
      let s = (v === null || v === undefined) ? '' : String(v)
      if (s.indexOf(';') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) s = '"' + s.replace(/"/g, '""') + '"'
      return s
    }
    function fmtNum(n) {
      if (n === null || n === undefined || !isFinite(n)) return ''
      return String(Math.round(Number(n) * 100) / 100).replace('.', ',')
    }
    const colunas = colunasAtuais()
    const mc = mostrarContas
    const mcat = mostrarCategorias && mostrarContas
    const cons = dados.consolidado || {}, nova = dados.nova || {}, castro = dados.castro || {}

    function nodeFromTree(arv, t, g, c) {
      let node = arv && arv[t]
      if (!node) return null
      if (g === undefined) return node
      node = node.grupos && node.grupos[g]
      if (!node) return null
      if (c === undefined) return node
      return (node.contas && node.contas[c]) || null
    }
    function rowCsv(label, nivel, t, g, c) {
      const nN = nodeFromTree(nova, t, g, c), nC = nodeFromTree(castro, t, g, c), nCons = nodeFromTree(cons, t, g, c)
      const prefix = nivel === 0 ? '' : (nivel === 1 ? '  ' : nivel === 2 ? '    ' : '      ')
      const cells = [esc(prefix + label), fmtNum(nN ? nN.total : 0), fmtNum(nC ? nC.total : 0), fmtNum(nCons ? nCons.total : 0)]
      colunas.forEach((k) => { cells.push(fmtNum(nCons ? valorPorColuna(nCons.por_mes, k) : 0)) })
      return cells.join(';')
    }
    function rowCsvCategoria(cat, node) {
      const cells = [esc('      ' + cat), fmtNum(0), fmtNum(0), fmtNum(node.total || 0)]
      colunas.forEach((k) => { cells.push(fmtNum(valorPorColuna(node.por_mes, k))) })
      return cells.join(';')
    }

    const lines = []
    lines.push(['Periodo', desde + ' a ' + ate].join(';'))
    lines.push(['Regime', regime].join(';'))
    lines.push(['Granularidade', granularidade].join(';'))
    lines.push('')
    lines.push(['Conta', 'NOVA', 'CASTRO', 'Consolidado'].concat(colunas.map(rotuloColuna)).join(';'))

    const tipos = Array.from(new Set(Object.keys(nova).concat(Object.keys(castro)).concat(Object.keys(cons)))).sort()
    tipos.forEach((t) => {
      lines.push(rowCsv(t, 0, t))
      const grupos = Array.from(new Set([
        ...Object.keys((nova[t] || {}).grupos || {}),
        ...Object.keys((castro[t] || {}).grupos || {}),
        ...Object.keys((cons[t] || {}).grupos || {}),
      ])).sort()
      grupos.forEach((g) => {
        lines.push(rowCsv(g, 1, t, g))
        if (mc) {
          const contas = Array.from(new Set([
            ...Object.keys(((nova[t] || {}).grupos[g] || {}).contas || {}),
            ...Object.keys(((castro[t] || {}).grupos[g] || {}).contas || {}),
            ...Object.keys(((cons[t] || {}).grupos[g] || {}).contas || {}),
          ])).sort()
          contas.forEach((c) => {
            lines.push(rowCsv(c, 2, t, g, c))
            if (mcat) {
              const contaCons = ((cons[t] || {}).grupos[g] || {}).contas[c]
              const cats = (contaCons && contaCons.categorias) || {}
              Object.keys(cats).sort().forEach((cat) => { lines.push(rowCsvCategoria(cat, cats[cat])) })
            }
          })
        }
      })
    })

    function valTipoTot(arv, t) { return (arv[t] && arv[t].total) || 0 }
    const resPorMes = {}
    ;(dados.meses || []).forEach((mk) => {
      const lb = cons['1. Lucro Bruto'], dp = cons['2. Despesas']
      resPorMes[mk] = ((lb && lb.por_mes && lb.por_mes[mk]) || 0) + ((dp && dp.por_mes && dp.por_mes[mk]) || 0)
    })
    const resCells = [
      esc('= RESULTADO LIQUIDO'),
      fmtNum(valTipoTot(nova, '1. Lucro Bruto') + valTipoTot(nova, '2. Despesas')),
      fmtNum(valTipoTot(castro, '1. Lucro Bruto') + valTipoTot(castro, '2. Despesas')),
      fmtNum(valTipoTot(cons, '1. Lucro Bruto') + valTipoTot(cons, '2. Despesas')),
    ]
    colunas.forEach((k) => { resCells.push(fmtNum(valorPorColuna(resPorMes, k))) })
    lines.push(resCells.join(';'))

    const csv = '﻿' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'dre-' + regime + '-' + desde + '_' + ate + '.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // =========================================================================
  // Construcao das linhas da tabela DRE (port fiel de renderTabela), via JSX
  // =========================================================================
  function construirLinhasTabela() {
    if (!dados || !rl) return []
    const colunas = colunasAtuais()
    const mCat = mostrarCategorias && mostrarContas
    const arvCons = dados.consolidado, arvNova = dados.nova, arvCas = dados.castro

    function valConta(arv, t, g, c) {
      if (!arv[t] || !arv[t].grupos[g] || !arv[t].grupos[g].contas[c]) return 0
      return arv[t].grupos[g].contas[c].total
    }
    function valGrupo(arv, t, g) { if (!arv[t] || !arv[t].grupos[g]) return 0; return arv[t].grupos[g].total }
    function valTipo(arv, t) { if (!arv[t]) return 0; return arv[t].total }
    function valContaMes(arv, t, g, c, k) {
      if (!arv[t] || !arv[t].grupos[g] || !arv[t].grupos[g].contas[c]) return 0
      return arv[t].grupos[g].contas[c].por_mes[k] || 0
    }
    function valGrupoMes(arv, t, g, k) { if (!arv[t] || !arv[t].grupos[g]) return 0; return arv[t].grupos[g].por_mes[k] || 0 }
    function valTipoMes(arv, t, k) { if (!arv[t]) return 0; return arv[t].por_mes[k] || 0 }

    const linhas = []
    let key = 0
    function linha(opts) {
      const nivel = opts.nivel
      const label = opts.label
      const vN = opts.vN, vC = opts.vC, vCons = opts.vCons
      const porMes = opts.porMes
      const ctxClassif = opts.ctxClassif || {}
      const clicavelLinha = opts.clicavel !== false
      const cssClass = nivel === 0 ? 'font-bold'
        : nivel === 1 ? 'font-semibold'
          : nivel === 2 ? 'text-slate-600'
            : 'text-slate-500 text-[11px]'
      const padding = nivel === 0 ? 'pl-2'
        : nivel === 1 ? 'pl-6'
          : nivel === 2 ? 'pl-10'
            : 'pl-14'

      const celulasMes = []
      if (mostrarMeses) colunas.forEach((k) => {
        let v
        if (granularidade === 'ano') {
          v = (dados.meses || []).reduce((s, mk) => mk.startsWith(k + '-') ? s + porMes(mk) : s, 0)
        } else {
          v = porMes(k)
        }
        const den = rl.consolidadoPorMes[k]
        const celulaClicavel = (granularidade === 'mes') && v && clicavelLinha
        const txt = v ? fmtValorTexto(v, den) : null
        celulasMes.push({
          key: k,
          clicavel: !!celulaClicavel,
          ctx: celulaClicavel ? {
            ano: k.split('-')[0], mes: k.split('-')[1],
            dreTipo: ctxClassif.dreTipo || '', dreGrupo: ctxClassif.dreGrupo || '',
            dreConta: ctxClassif.dreConta || '', dreCategoria: ctxClassif.dreCategoria || '',
            label: label || '',
          } : null,
          cor: cor(v),
          texto: v ? txt : null, // null => '-' cinza
        })
      })

      linhas.push({
        key: key++,
        cssClass, padding, label,
        vN: fmtValorTexto(vN, rl.nova), corN: cor(vN),
        vC: fmtValorTexto(vC, rl.castro), corC: cor(vC),
        vCons: fmtValorTexto(vCons, rl.consolidado), corCons: cor(vCons),
        celulasMes,
      })
    }

    const tipos = Array.from(new Set(
      Object.keys(arvNova).concat(Object.keys(arvCas)).concat(Object.keys(arvCons))
    )).sort()

    tipos.forEach((t) => {
      linha({
        nivel: 0, label: t, ctxClassif: { dreTipo: t },
        vN: valTipo(arvNova, t), vC: valTipo(arvCas, t), vCons: valTipo(arvCons, t),
        porMes: (k) => valTipoMes(arvCons, t, k),
      })
      const grupos = Array.from(new Set([
        ...Object.keys((arvNova[t] || {}).grupos || {}),
        ...Object.keys((arvCas[t] || {}).grupos || {}),
        ...Object.keys((arvCons[t] || {}).grupos || {}),
      ])).sort()
      grupos.forEach((g) => {
        linha({
          nivel: 1, label: g, ctxClassif: { dreTipo: t, dreGrupo: g },
          vN: valGrupo(arvNova, t, g), vC: valGrupo(arvCas, t, g), vCons: valGrupo(arvCons, t, g),
          porMes: (k) => valGrupoMes(arvCons, t, g, k),
        })
        if (mostrarContas) {
          const contas = Array.from(new Set([
            ...Object.keys(((arvNova[t] || {}).grupos[g] || {}).contas || {}),
            ...Object.keys(((arvCas[t] || {}).grupos[g] || {}).contas || {}),
            ...Object.keys(((arvCons[t] || {}).grupos[g] || {}).contas || {}),
          ])).sort()
          contas.forEach((c) => {
            linha({
              nivel: 2, label: c, ctxClassif: { dreTipo: t, dreGrupo: g, dreConta: c },
              vN: valConta(arvNova, t, g, c), vC: valConta(arvCas, t, g, c), vCons: valConta(arvCons, t, g, c),
              porMes: (k) => valContaMes(arvCons, t, g, c, k),
            })
            if (mCat) {
              const contaCons = ((arvCons[t] || {}).grupos[g] || {}).contas[c]
              const cats = (contaCons && contaCons.categorias) || {}
              Object.keys(cats).sort().forEach((cat) => {
                linha({
                  nivel: 3, label: cat,
                  ctxClassif: { dreTipo: t, dreGrupo: g, dreConta: c, dreCategoria: cat },
                  vN: 0, vC: 0, vCons: cats[cat].total,
                  porMes: (k) => cats[cat].por_mes[k] || 0,
                })
              })
            }
          })
        }
      })
    })

    // Linha de RESULTADO LIQUIDO
    const resN = valTipo(arvNova, '1. Lucro Bruto') + valTipo(arvNova, '2. Despesas')
    const resC = valTipo(arvCas, '1. Lucro Bruto') + valTipo(arvCas, '2. Despesas')
    const resCons = valTipo(arvCons, '1. Lucro Bruto') + valTipo(arvCons, '2. Despesas')
    const mesesRes = {}
    ;(dados.meses || []).forEach((k) => {
      mesesRes[k] = (valTipoMes(arvCons, '1. Lucro Bruto', k) || 0) + (valTipoMes(arvCons, '2. Despesas', k) || 0)
    })
    linha({
      nivel: 0, label: '= RESULTADO LIQUIDO',
      vN: resN, vC: resC, vCons: resCons,
      porMes: (k) => mesesRes[k],
      clicavel: false,
    })

    return linhas
  }

  // =========================================================================
  // Intercompany (port fiel de renderIntercompany) — so no regime Omie
  // =========================================================================
  let inter = null
  if (dados && regime === 'omie' && dados.intercompany) {
    function totalArv(a) { let s = 0; Object.values(a || {}).forEach((t) => { s += t.total || 0 }); return s }
    function totalReceitaBruta(arv) {
      const t = arv && arv['1. Lucro Bruto']; if (!t) return 0
      const g = t.grupos && t.grupos['01. Receita Líquida Operacional']; if (!g) return 0
      const c = g.contas && g.contas['01. Receita Bruta de Vendas']; if (!c) return 0
      return c.total || 0
    }
    function totalCmv(arv) {
      const t = arv && arv['1. Lucro Bruto']; if (!t) return 0
      const g = t.grupos && t.grupos['21. Custos']; if (!g) return 0
      return g.total || 0
    }
    function lado(arv, count) {
      const receita = totalReceitaBruta(arv)
      const cmv = totalCmv(arv)
      const total = totalArv(arv)
      const outros = total - receita - cmv
      return {
        receita: fmtBRL(receita), cmv: fmtBRL(cmv), outros: fmtBRL(outros),
        liquido: fmtBRL(total), count: count + ' movimentos',
      }
    }
    inter = {
      nova: lado(dados.intercompany.nova, dados.contagem.nova_intercompany),
      castro: lado(dados.intercompany.castro, dados.contagem.castro_intercompany),
    }
  }

  // --- Estados de gate de permissao (BRIEF item 1) --------------------------
  if (!loading && !loadingPerm && userProfile && (!temAcesso('financeiro') && !pode('dre', 'dre'))) return <SemPermissao />

  // Classes dos toggles (espelham ativo/inativo da fonte)
  const tgAtivo = 'bg-slate-800 text-white'
  const tgInativo = 'bg-white text-slate-700 hover:bg-slate-100'

  const linhasTabela = construirLinhasTabela()
  const colunas = colunasAtuais()

  // =========================================================================
  // PECA C — Resumo DRE do periodo focado: 5 linhas com R$, AV% (vertical,
  // sobre a receita liquida) e AH% (horizontal, vs. periodo de comparacao).
  // Comparacao: unidade imediatamente anterior, ou mesma unidade do ano
  // anterior (4 trimestres / 12 meses / 1 ano atras).
  // =========================================================================
  const resumo = (() => {
    if (!dados) return null
    const us = unidadesDeMeses(dados.meses, dreUnidade)
    if (!us.length) return null
    const idx = Math.max(0, us.findIndex((u) => u.key === drePeriodoSel))
    const sel = us[idx] || us[us.length - 1]
    const selIdx = us.indexOf(sel)
    const passo = dreComparar === 'ano_anterior'
      ? (dreUnidade === 'mes' ? 12 : dreUnidade === 'trimestre' ? 4 : 1)
      : 1
    const cmp = us[selIdx - passo] || null
    const aSel = agregarDRE(dados.consolidado, sel.meses)
    const aCmp = cmp ? agregarDRE(dados.consolidado, cmp.meses) : null
    const rec = aSel.receita || 0
    const av = (v) => (rec ? (v / rec) * 100 : null)
    const ah = (atual, ant) => (ant ? ((atual - ant) / Math.abs(ant)) * 100 : null)
    const linha = (label, valor, sub, antVal) => ({
      label, valor, sub,
      av: av(valor),
      ah: aCmp ? ah(valor, antVal) : null,
    })
    return {
      sel, cmp,
      linhas: [
        linha('Receita Líquida', aSel.receita, false, aCmp?.receita),
        linha('(−) CMV', -aSel.cmv, false, aCmp ? -aCmp.cmv : null),
        linha('(=) Lucro Bruto', aSel.lucroBruto, true, aCmp?.lucroBruto),
        linha('(−) Despesas', -aSel.despesas, false, aCmp ? -aCmp.despesas : null),
        linha('(=) Resultado', aSel.resultado, true, aCmp?.resultado),
      ],
    }
  })()

  // Movimentos filtrados/ordenados do modal (para a tabela)
  const modalFiltro = filtrarModal(modalBusca)
  const modalLista = ordenarModal(modalFiltro.list)
  const modalTotalFiltrado = modalLista.reduce((s, m) => s + (Number(m.valor) || 0), 0)
  const modalTotalAll = modalMovimentos.reduce((s, m) => s + (Number(m.valor) || 0), 0)
  const modalResumo = modalCarregando
    ? 'Carregando movimentos...'
    : (modalErro
      ? modalErro
      : (!modalFiltro.f
        ? modalMovimentos.length + ' movimentos · total ' + fmtBRL(modalTotalAll)
        : 'Filtro "' + modalFiltro.f + '" - ' + modalLista.length + ' resultados'))

  // Vendas filtradas do popup do grafico de familias + totais do filtro
  const FAM_DET_MAX_LINHAS = 800
  const famDetLista = useMemo(() => {
    const f = (famDetBusca || '').trim().toLowerCase()
    if (!f) return famDetVendas
    return famDetVendas.filter((v) =>
      String(v.nome_cliente || '').toLowerCase().includes(f)
      || String(v.descricao || '').toLowerCase().includes(f)
      || String(v.numero_pedido || '').toLowerCase().includes(f)
      || String(v.familia_norm || '').toLowerCase().includes(f))
  }, [famDetVendas, famDetBusca])
  const famDetTotais = useMemo(() => {
    const t = famDetLista.reduce((s, v) => {
      s.receita += Number(v.valor_total) || 0
      s.custo += v.custo || 0
      if (v.custo == null) s.semCusto += 1
      return s
    }, { receita: 0, custo: 0, semCusto: 0 })
    t.lucro = t.receita - t.custo
    t.margem = t.receita > 0 ? (t.lucro / t.receita) * 100 : null
    return t
  }, [famDetLista])

  // Cabecalhos clicaveis do modal
  const modalCols = [
    { campo: 'dataMovimento', label: 'Data', align: 'text-left' },
    { campo: '_conta_omie', label: 'Empresa', align: 'text-left' },
    { campo: 'nomeClienteFornecedor', label: 'Cliente / Fornecedor', align: 'text-left' },
    { campo: 'categoria', label: 'Categoria', align: 'text-left' },
    { campo: 'dreConta', label: 'Conta DRE', align: 'text-left' },
    { campo: 'numeroDocumento', label: 'Doc', align: 'text-left' },
    { campo: 'incluidoPor', label: 'Incluído por', align: 'text-left' },
    { campo: 'valor', label: 'Valor', align: 'text-right' },
  ]

  return (
    <>
      {/* CSS scoped da tabela (port fiel do <style> da fonte) */}
      <style jsx>{`
        .dre-scroll { max-height: 92vh; overflow: auto; position: relative; }
        .dre-scroll :global(thead th) { position: sticky; top: 0; background: #f1f5f9; z-index: 20; box-shadow: inset 0 -1px 0 #cbd5e1; }
        .dre-scroll :global(th:first-child),
        .dre-scroll :global(td:first-child) { position: sticky; left: 0; z-index: 10; background: #fff; border-right: 1px solid #e2e8f0; }
        .dre-scroll :global(tr.font-bold td:first-child) { background: #f1f5f9; }
        .dre-scroll :global(tr.font-semibold td:first-child) { background: #f8fafc; }
        .dre-scroll :global(thead th:first-child) { z-index: 30; background: #f1f5f9; }
        .dre-scroll :global(td.dre-cell-mes) { cursor: pointer; transition: background 0.1s; }
        .dre-scroll :global(td.dre-cell-mes:hover) { background: #dbeafe !important; outline: 1px solid #3b82f6; }
      `}</style>

      {/* Cabecalho: titulo + controles */}
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">DRE Consolidada</h1>
          <p className="text-xs text-slate-500">
            {regime === 'competencia'
              ? 'NOVA + CASTRO em regime de competência real. Receita+CMV por emissão NF (vendas_itens); Despesas por emissão (contas_pagar). Não usa Omie.'
              : 'NOVA + CASTRO - vendas intercompany. Fonte: API ListarDRE do Omie.'}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
          <div className="inline-flex rounded border border-slate-300 overflow-hidden"
            title="Omie: regime misto (Receita por vencimento, CMV por emissao). Competencia: tudo por emissao NF (Receita+CMV) e contas a pagar por emissao (Despesas).">
            <button onClick={() => trocarRegime('omie')}
              className={'px-3 py-1 text-xs ' + (regime === 'omie' ? tgAtivo : tgInativo)}>Omie</button>
            <button onClick={() => trocarRegime('competencia')}
              className={'px-3 py-1 text-xs border-l border-slate-300 ' + (regime === 'competencia' ? tgAtivo : tgInativo)}>Competência</button>
          </div>
          <label className="ml-2">De:</label>
          <input type="month" value={desde} onChange={(e) => setDesde(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1" />
          <label>Ate:</label>
          <input type="month" value={ate} onChange={(e) => setAte(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1" />
          {regime === 'omie' && (
            <label className="ml-2">Tipo de data:
              <select value={tipoData} onChange={(e) => setTipoData(e.target.value)}
                className="border border-slate-300 rounded px-2 py-1">
                <option value="1">Emissao</option>
                <option value="2">Registro</option>
              </select>
            </label>
          )}
          <button onClick={() => carregar(false)} disabled={carregando}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded">
            {carregando ? 'Carregando...' : 'Carregar'}
          </button>
          <div className="ml-3 inline-flex rounded border border-slate-300 overflow-hidden">
            <button onClick={() => setModoExibicao('rs')} title="Valores em reais"
              className={'px-3 py-1 text-xs ' + (modoExibicao === 'rs' ? tgAtivo : tgInativo)}>R$</button>
            <button onClick={() => setModoExibicao('pct')} title="Cada linha como % da Receita Liquida Operacional (analise vertical)"
              className={'px-3 py-1 text-xs border-l border-slate-300 ' + (modoExibicao === 'pct' ? tgAtivo : tgInativo)}>% RL</button>
          </div>
          <div className="ml-2 inline-flex rounded border border-slate-300 overflow-hidden">
            <button onClick={() => setGranularidade('mes')} title="Mostrar colunas mes a mes"
              className={'px-3 py-1 text-xs ' + (granularidade === 'mes' ? tgAtivo : tgInativo)}>Mes</button>
            <button onClick={() => setGranularidade('ano')} title="Mostrar colunas agrupadas por ano"
              className={'px-3 py-1 text-xs border-l border-slate-300 ' + (granularidade === 'ano' ? tgAtivo : tgInativo)}>Ano</button>
          </div>
        </div>
      </div>

      {/* Barra de abas (Consolidado / Margens por Familia) */}
      <div className="flex items-center gap-1 border-b border-slate-200 mb-3">
        {[['consolidado', 'Consolidado'], ['familias', 'Margens por Família']].map(([k, lbl]) => (
          <button key={k} onClick={() => setAba(k)}
            className={'px-4 py-2 text-sm font-medium -mb-px border-b-2 ' +
              (aba === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700')}>{lbl}</button>
        ))}
      </div>

      {aba === 'consolidado' && (
      <>
      <div className="text-xs text-slate-500 mb-3">{status}</div>

      {/* KPIs Consolidado */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Receita Bruta</div>
          <div className="text-lg font-bold text-emerald-700 mt-1">{kpi ? kpi.receita : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">CMV</div>
          <div className="text-lg font-bold text-red-700 mt-1">{kpi ? kpi.cmv : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Lucro Bruto</div>
          <div className="text-lg font-bold text-slate-800 mt-1">{kpi ? kpi.lucroBruto : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Despesas</div>
          <div className="text-lg font-bold text-red-700 mt-1">{kpi ? kpi.despesas : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Resultado Liquido</div>
          <div className={'text-lg font-bold mt-1 ' + (kpi ? (kpi.resultadoPositivo ? 'text-emerald-700' : 'text-red-700') : '')}>
            {kpi ? kpi.resultado : '--'}
          </div>
        </div>
      </div>

      {/* Seletor compartilhado do painel de resultado (Cascata + Resumo) */}
      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 mb-4 flex items-center gap-2 flex-wrap text-xs text-slate-600">
        <span className="uppercase tracking-wide text-slate-500">Período de análise</span>
        <div className="inline-flex rounded border border-slate-300 overflow-hidden" title="Unidade do período para a cascata e o resumo">
          {[['mes', 'Mês'], ['trimestre', 'Trimestre'], ['ano', 'Ano']].map(([k, lbl], i) => (
            <button key={k} onClick={() => setDreUnidade(k)}
              className={(i ? 'border-l border-slate-300 ' : '') + 'px-3 py-1 ' + (dreUnidade === k ? tgAtivo : tgInativo)}>{lbl}</button>
          ))}
        </div>
        <select value={drePeriodoSel || ''} onChange={(e) => setDrePeriodoSel(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1">
          {dreUnidades().map((u) => (<option key={u.key} value={u.key}>{u.label}</option>))}
        </select>
        <span className="ml-1 text-slate-500">comparar com</span>
        <div className="inline-flex rounded border border-slate-300 overflow-hidden" title="Base da análise horizontal (AH%)">
          <button onClick={() => setDreComparar('anterior')}
            className={'px-3 py-1 ' + (dreComparar === 'anterior' ? tgAtivo : tgInativo)}>Período anterior</button>
          <button onClick={() => setDreComparar('ano_anterior')}
            className={'px-3 py-1 border-l border-slate-300 ' + (dreComparar === 'ano_anterior' ? tgAtivo : tgInativo)}>Ano anterior</button>
        </div>
        {resumo && resumo.cmp && (
          <span className="text-[10px] text-slate-400">{resumo.sel.label} vs {resumo.cmp.label}</span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* PECA A — Cascata do resultado */}
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            Cascata do resultado{resumo ? ' — ' + resumo.sel.label : ''}
          </div>
          <div style={{ height: 300, position: 'relative' }}>
            <canvas ref={cascataRef}></canvas>
          </div>
        </div>

        {/* PECA C — Resumo DRE (R$, AV%, AH%) */}
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wide text-slate-500">Resumo DRE</div>
            <div className="text-[10px] text-slate-400">
              AV% = sobre receita líquida · AH% = vs {dreComparar === 'ano_anterior' ? 'ano anterior' : 'período anterior'}
            </div>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-200">
                <th className="text-left py-1 font-medium">Linha</th>
                <th className="text-right py-1 font-medium">R$</th>
                <th className="text-right py-1 font-medium">AV%</th>
                <th className="text-right py-1 font-medium">AH%</th>
              </tr>
            </thead>
            <tbody>
              {resumo ? resumo.linhas.map((l) => (
                <tr key={l.label} className={'border-b border-slate-100 ' + (l.sub ? 'font-bold text-slate-800' : 'text-slate-600')}>
                  <td className="py-1.5">{l.label}</td>
                  <td className={'py-1.5 text-right tabular-nums ' + cor(l.valor)}>{fmtBRL(l.valor)}</td>
                  <td className="py-1.5 text-right text-slate-500 tabular-nums">{l.av == null ? '—' : l.av.toFixed(1) + '%'}</td>
                  <td className={'py-1.5 text-right tabular-nums ' + (l.ah == null ? 'text-slate-400' : l.ah >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                    {l.ah == null ? '—' : (l.ah >= 0 ? '+' : '') + l.ah.toFixed(1) + '%'}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={4} className="py-4 text-center text-slate-400">Sem dados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* PECA B — Evolucao das margens (%) */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Evolução das margens (%) — por {margem12M ? '12 meses móveis' : (dreUnidade === 'mes' ? 'mês' : dreUnidade === 'trimestre' ? 'trimestre' : 'ano')}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] flex items-center gap-1" title="Suaviza a sazonalidade somando os últimos 12 meses em cada ponto">
              <input type="checkbox" checked={margem12M} onChange={(e) => setMargem12M(e.target.checked)} /> 12M móvel
            </label>
            <div className="text-[10px] text-slate-400">{graficoInfo}</div>
          </div>
        </div>
        <div style={{ height: 260, position: 'relative' }}>
          <canvas ref={margemRef}></canvas>
        </div>
      </div>

      {/* Tabela DRE + Grafico de despesas */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600 flex items-center justify-between">
          <span>Demonstracao do Resultado</span>
          <div className="flex items-center gap-2">
            <label className="text-[10px]">
              <input type="checkbox" checked={mostrarContas} onChange={(e) => setMostrarContas(e.target.checked)} /> mostrar contas (nivel 3)
            </label>
            <label className="text-[10px]" title="Só faz efeito quando 'mostrar contas' tambem está marcado. Expande cada conta nas categorias do Omie (ex: Combustível).">
              <input type="checkbox" checked={mostrarCategorias} onChange={(e) => setMostrarCategorias(e.target.checked)} /> mostrar categorias
            </label>
            <label className="text-[10px]">
              <input type="checkbox" checked={mostrarMeses} onChange={(e) => setMostrarMeses(e.target.checked)} /> mostrar meses
            </label>
            <button onClick={exportarDreCSV}
              className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded"
              title="Exporta a tabela DRE em CSV (UTF-8 com BOM, valores em R$)">Exportar CSV</button>
          </div>
        </div>

        <div className="dre-scroll" ref={scrollRef}>
          <table ref={tabelaRef} className="text-xs" style={{ tableLayout: 'fixed' }}>
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-2 py-2 sticky left-0 bg-slate-50"
                  style={{ width: COL_CONTA_PX, minWidth: COL_CONTA_PX, maxWidth: COL_CONTA_PX }}>Conta</th>
                <th className="text-right px-2 py-2 bg-slate-100" style={{ width: COL_AUX_PX }}>NOVA</th>
                <th className="text-right px-2 py-2 bg-slate-100" style={{ width: COL_AUX_PX }}>CASTRO</th>
                <th className="text-right px-2 py-2 bg-slate-200 font-bold" style={{ width: COL_AUX_PX }}>Consolidado</th>
                {mostrarMeses && colunas.map((k) => (
                  <th key={k} className="text-right px-2 py-2 whitespace-nowrap" style={{ width: COL_MES_PX }}>{rotuloColuna(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhasTabela.map((ln) => (
                <tr key={ln.key} className={ln.cssClass + ' border-b border-slate-100'}>
                  <td className={'px-2 py-1 ' + ln.padding}>{ln.label}</td>
                  <td className={'px-2 py-1 text-right ' + ln.corN}>
                    {ln.vN === null ? <span className="text-slate-300">-</span> : ln.vN}
                  </td>
                  <td className={'px-2 py-1 text-right ' + ln.corC}>
                    {ln.vC === null ? <span className="text-slate-300">-</span> : ln.vC}
                  </td>
                  <td className={'px-2 py-1 text-right font-bold ' + ln.corCons}>
                    {ln.vCons === null ? <span className="text-slate-300">-</span> : ln.vCons}
                  </td>
                  {mostrarMeses && ln.celulasMes.map((cel) => (
                    cel.clicavel ? (
                      <td key={cel.key}
                        className={'px-2 py-1 text-right dre-cell-mes ' + cel.cor}
                        onClick={() => abrirModalDetalhe(cel.ctx)}>
                        {cel.texto === null ? <span className="text-slate-300">-</span> : cel.texto}
                      </td>
                    ) : (
                      <td key={cel.key} className={'px-2 py-1 text-right ' + cel.cor}>
                        {cel.texto === null ? <span className="text-slate-300">-</span> : cel.texto}
                      </td>
                    )
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Toolbar do grafico de despesas (sticky left:0) */}
          <div className="border-t border-slate-200 px-3 py-2 bg-slate-50 flex items-center justify-between flex-wrap gap-2"
            style={{ position: 'sticky', left: 0, zIndex: 15 }}>
            <span className="text-xs uppercase tracking-wide text-slate-500">
              Evolução mensal das despesas — por {nivelDespesas === 'categoria' ? 'categoria' : 'conta'}
            </span>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded border border-slate-300 overflow-hidden"
                title="Conta: 1 linha por conta DRE (nivel 3). Categoria: 1 linha por categoria Omie (nivel 4, top 8 + Outros).">
                <button onClick={() => setNivelDespesas('conta')}
                  className={'px-2 py-0.5 text-[10px] ' + (nivelDespesas === 'conta' ? tgAtivo : tgInativo)}>Conta</button>
                <button onClick={() => setNivelDespesas('categoria')}
                  className={'px-2 py-0.5 text-[10px] border-l border-slate-300 ' + (nivelDespesas === 'categoria' ? tgAtivo : tgInativo)}>Categoria</button>
              </div>
              <div className="inline-flex rounded border border-slate-300 overflow-hidden"
                title="Log: escala logarítmica — pontos que estouram muito continuam visíveis sem achatar as demais linhas. Legível: limita o teto do eixo Y (linear). Completa: escala linear inteira.">
                <button onClick={() => setEscalaDespesas('log')}
                  className={'px-2 py-0.5 text-[10px] ' + (escalaDespesas === 'log' ? tgAtivo : tgInativo)}>Log</button>
                <button onClick={() => setEscalaDespesas('auto')}
                  className={'px-2 py-0.5 text-[10px] border-l border-slate-300 ' + (escalaDespesas === 'auto' ? tgAtivo : tgInativo)}>Legível</button>
                <button onClick={() => setEscalaDespesas('full')}
                  className={'px-2 py-0.5 text-[10px] border-l border-slate-300 ' + (escalaDespesas === 'full' ? tgAtivo : tgInativo)}>Completa</button>
              </div>
              <div className="text-[10px] text-slate-400">{despesasInfo}</div>
            </div>
          </div>

          {/* Wrapper do canvas do grafico de despesas */}
          <div ref={despesasWrapRef} style={{ position: 'relative', height: 320 }}>
            <canvas ref={despesasRef}></canvas>
          </div>

          <div className="text-[10px] text-slate-400 px-3 py-1" style={{ position: 'sticky', left: 0 }}>
            Clique numa bolinha (modo Mês) para ver os movimentos daquele mês.
          </div>
        </div>
      </div>

      {/* Intercompany detalhe (so no regime Omie) */}
      {inter && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase tracking-wide text-amber-800 font-semibold">Operacoes intercompany excluidas</div>
            <div className="text-[10px] text-amber-700">Excluidos do consolidado: vendas, custos, impostos e despesas com a outra empresa do grupo</div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <div className="text-amber-900 font-bold mb-1">NOVA → CASTRO</div>
              <div className="grid grid-cols-2 gap-1 text-amber-800">
                <span>Receita Bruta de Vendas:</span><span className="text-right font-semibold">{inter.nova.receita}</span>
                <span>CMV / Custos:</span><span className="text-right">{inter.nova.cmv}</span>
                <span>Outros:</span><span className="text-right">{inter.nova.outros}</span>
                <span className="border-t border-amber-300 pt-0.5 font-bold">Impacto liquido:</span>
                <span className="text-right border-t border-amber-300 pt-0.5 font-bold">{inter.nova.liquido}</span>
              </div>
              <div className="text-[10px] text-amber-700 mt-1">{inter.nova.count}</div>
            </div>
            <div>
              <div className="text-amber-900 font-bold mb-1">CASTRO → NOVA</div>
              <div className="grid grid-cols-2 gap-1 text-amber-800">
                <span>Receita Bruta de Vendas:</span><span className="text-right font-semibold">{inter.castro.receita}</span>
                <span>CMV / Custos:</span><span className="text-right">{inter.castro.cmv}</span>
                <span>Outros:</span><span className="text-right">{inter.castro.outros}</span>
                <span className="border-t border-amber-300 pt-0.5 font-bold">Impacto liquido:</span>
                <span className="text-right border-t border-amber-300 pt-0.5 font-bold">{inter.castro.liquido}</span>
              </div>
              <div className="text-[10px] text-amber-700 mt-1">{inter.castro.count}</div>
            </div>
          </div>
        </div>
      )}

      {/* Rodape: atualizar do Omie (so no regime Omie) */}
      {regime === 'omie' && (
        <div className="flex justify-end items-center gap-2 mt-6 mb-3 text-xs text-slate-500">
          <span>Cache em Supabase. Re-busca completa via Omie:</span>
          <button onClick={() => {
            if (!confirm('Re-buscar todos os meses do Omie? Pode levar 1-2 min para periodos longos e consumir cota de API.')) return
            carregar(true)
          }}
            disabled={carregando}
            className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded"
            title="Re-busca tudo do Omie ignorando o cache. Use quando suspeitar de dados desatualizados.">Atualizar do Omie</button>
        </div>
      )}
      </>
      )}

      {/* ===================== ABA: Margens por Familia ===================== */}
      {aba === 'familias' && (
        <FamiliasTab
          dadosFam={dadosFam} carregandoFam={carregandoFam} erroFam={erroFam}
          regime={regime} dreUnidade={dreUnidade} setDreUnidade={setDreUnidade}
          metricaFam={metricaFam} setMetricaFam={setMetricaFam}
          famModel={famModel} famChartRef={famChartRef}
          tgAtivo={tgAtivo} tgInativo={tgInativo}
        />
      )}

      {/* Modal de drill-down */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) fecharModal() }}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col">
            <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">{modalCtx ? modalCtx.classif : '--'}</div>
                <h3 className="font-bold text-lg text-slate-800">{modalCtx ? modalCtx.titulo : '--'}</h3>
              </div>
              <button onClick={fecharModal} className="text-2xl text-slate-400 hover:text-slate-700 leading-none">×</button>
            </div>
            <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 text-xs flex flex-wrap gap-3 items-center">
              <span className="text-slate-700">{modalResumo}</span>
              <div className="inline-flex rounded border border-slate-300 overflow-hidden" title="Alterna entre a lista de movimentos e o treemap">
                <button onClick={() => setModalView('tabela')}
                  className={'px-3 py-0.5 text-xs ' + (modalView === 'tabela' ? tgAtivo : tgInativo)}>Tabela</button>
                <button onClick={() => setModalView('treemap')}
                  className={'px-3 py-0.5 text-xs border-l border-slate-300 ' + (modalView === 'treemap' ? tgAtivo : tgInativo)}>Treemap</button>
              </div>
              {modalView === 'treemap' && (
                <div className="inline-flex rounded border border-slate-300 overflow-hidden" title="Como agrupar as celulas do treemap">
                  <button onClick={() => setModalGrupo('fornecedor')}
                    className={'px-3 py-0.5 text-xs ' + (modalGrupo === 'fornecedor' ? tgAtivo : tgInativo)}>Fornecedor</button>
                  <button onClick={() => setModalGrupo('categoria')}
                    className={'px-3 py-0.5 text-xs border-l border-slate-300 ' + (modalGrupo === 'categoria' ? tgAtivo : tgInativo)}>Categoria</button>
                </div>
              )}
              <label className="ml-auto text-xs">
                Buscar:
                <input type="text" value={modalBusca} onChange={(e) => setModalBusca(e.target.value)}
                  placeholder="cliente, descricao, categoria..."
                  className="border border-slate-300 rounded px-2 py-0.5 text-xs ml-1 w-56" />
              </label>
            </div>

            {/* View tabela */}
            <div className="overflow-auto flex-1" style={{ display: modalView === 'tabela' ? '' : 'none' }}>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 sticky top-0">
                  <tr>
                    {modalCols.map((mc) => {
                      const ativo = ordemModal.campo === mc.campo
                      const ind = ativo ? (ordemModal.dir === 'asc' ? '▲' : '▼') : '⇅'
                      return (
                        <th key={mc.campo}
                          onClick={() => clicarOrdenacao(mc.campo)}
                          className={mc.align + ' px-3 py-2 cursor-pointer hover:bg-slate-100'}>
                          {mc.label} <span className={ativo ? 'text-slate-700' : 'text-slate-300'}>{ind}</span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {modalCarregando ? (
                    <tr><td colSpan={8} className="text-center py-4 text-slate-500">Carregando...</td></tr>
                  ) : modalLista.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-4 text-slate-500">Sem movimentos.</td></tr>
                  ) : modalLista.map((m, i) => {
                    const v = Number(m.valor) || 0
                    const cls = v >= 0 ? 'text-emerald-700' : 'text-red-700'
                    return (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1 whitespace-nowrap text-slate-600">{m.dataMovimento || '-'}</td>
                        <td className="px-3 py-1 text-[10px] uppercase text-slate-500">{m._conta_omie || '-'}</td>
                        <td className="px-3 py-1 truncate max-w-[220px]" title={m.nomeClienteFornecedor || ''}>{m.nomeClienteFornecedor || '-'}</td>
                        <td className="px-3 py-1 truncate max-w-[200px] text-[11px] text-slate-600" title={m.categoria || ''}>{m.categoria || '-'}</td>
                        <td className="px-3 py-1 truncate max-w-[200px] text-[11px] text-slate-500" title={m.dreConta || ''}>{m.dreConta || '-'}</td>
                        <td className="px-3 py-1 text-[11px] text-slate-500">{m.numeroDocumento || '-'}</td>
                        <td className="px-3 py-1 truncate max-w-[140px] text-[11px] text-slate-500" title={m.incluidoPor || ''}>{m.incluidoPor || '-'}</td>
                        <td className={'px-3 py-1 text-right font-semibold ' + cls}>{fmtBRL(v)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* View treemap */}
            <div className="flex-1 p-3" style={{ display: modalView === 'treemap' ? '' : 'none' }}>
              <div style={{ position: 'relative', height: '100%', minHeight: 420 }}>
                <canvas ref={treemapRef}></canvas>
              </div>
            </div>

            <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs flex justify-between items-center">
              <span className="text-slate-500">{modalCarregando ? '' : (modalLista.length + ' de ' + modalMovimentos.length + ' movimentos')}</span>
              <span className="font-bold text-slate-800">{modalCarregando ? '' : ('Total: ' + fmtBRL(modalTotalFiltrado))}</span>
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalhe do grafico de familias: vendas que compoem o ponto clicado */}
      {famDetCtx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(15,23,42,0.6)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setFamDetCtx(null) }}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[88vh] flex flex-col">
            <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Vendas que compõem a margem</div>
                <h3 className="font-bold text-lg text-slate-800">{famDetCtx.titulo}</h3>
                {famDetCtx.resumo && <div className="text-[11px] text-slate-500 mt-0.5">{famDetCtx.resumo}</div>}
              </div>
              <button onClick={() => setFamDetCtx(null)} className="text-2xl text-slate-400 hover:text-slate-700 leading-none">×</button>
            </div>
            <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 text-xs flex flex-wrap gap-3 items-center">
              <span className="text-slate-700">
                {famDetCarregando ? 'Carregando vendas...' : (famDetErro || (famDetVendas.length + ' vendas'))}
              </span>
              <label className="ml-auto text-xs">
                Buscar:
                <input type="text" value={famDetBusca} onChange={(e) => setFamDetBusca(e.target.value)}
                  placeholder="cliente, máquina/item, pedido..."
                  className="border border-slate-300 rounded px-2 py-0.5 text-xs ml-1 w-56" />
              </label>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">Data</th>
                    <th className="text-left px-3 py-2">Pedido</th>
                    <th className="text-left px-3 py-2">Máquina / Item</th>
                    <th className="text-left px-3 py-2">Cliente</th>
                    <th className="text-right px-3 py-2">Qtd</th>
                    <th className="text-right px-3 py-2">Custo (CMC)</th>
                    <th className="text-right px-3 py-2">Venda</th>
                    <th className="text-right px-3 py-2">Lucro</th>
                    <th className="text-right px-3 py-2">MB %</th>
                  </tr>
                </thead>
                <tbody>
                  {famDetCarregando ? (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">Carregando…</td></tr>
                  ) : famDetLista.length === 0 ? (
                    <tr><td colSpan={9} className="px-3 py-6 text-center text-slate-400">{famDetErro || 'Nenhuma venda encontrada.'}</td></tr>
                  ) : famDetLista.slice(0, FAM_DET_MAX_LINHAS).map((v, i) => {
                    const receita = Number(v.valor_total) || 0
                    const mb = v.custo != null && receita > 0 ? ((receita - v.custo) / receita) * 100 : null
                    return (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-1 whitespace-nowrap text-slate-600">{v.data_pedido || '—'}</td>
                        <td className="px-3 py-1 whitespace-nowrap text-slate-500">{v.numero_pedido || '—'}</td>
                        <td className="px-3 py-1" title={v.descricao || ''}>{v.descricao || '—'}</td>
                        <td className="px-3 py-1" title={v.nome_cliente || ''}>{v.nome_cliente || '—'}</td>
                        <td className="px-3 py-1 text-right tabular-nums">{Number(v.quantidade) || 0}</td>
                        <td className="px-3 py-1 text-right tabular-nums text-slate-600">{v.custo == null ? '—' : fmtBRL(v.custo)}</td>
                        <td className="px-3 py-1 text-right tabular-nums font-medium">{fmtBRL(receita)}</td>
                        <td className={'px-3 py-1 text-right tabular-nums ' + cor(v.lucro)}>{v.lucro == null ? '—' : fmtBRL(v.lucro)}</td>
                        <td className={'px-3 py-1 text-right tabular-nums ' + cor(mb)}>{mb == null ? '—' : mb.toFixed(1) + '%'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs flex flex-wrap justify-between items-center gap-2">
              <span className="text-slate-500">
                {famDetCarregando ? '' : (
                  Math.min(famDetLista.length, FAM_DET_MAX_LINHAS) + ' de ' + famDetVendas.length + ' vendas'
                  + (famDetLista.length > FAM_DET_MAX_LINHAS ? ' (use a busca para refinar)' : '')
                  + (famDetTotais.semCusto ? ' · ' + famDetTotais.semCusto + ' sem CMC (custo ignorado)' : '')
                )}
              </span>
              {!famDetCarregando && (
                <span className="font-bold text-slate-800">
                  {'Venda ' + fmtBRL(famDetTotais.receita) + ' · Custo ' + fmtBRL(famDetTotais.custo)
                    + ' · Lucro bruto ' + fmtBRL(famDetTotais.lucro)
                    + (famDetTotais.margem == null ? '' : ' · MB ' + famDetTotais.margem.toFixed(1) + '%')}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// =============================================================================
// Aba "Margens por Familia": tabela (familia x periodo, margem bruta + liquida)
// + grafico de evolucao. Recebe o modelo ja calculado (famModel) e o ref do
// canvas (o efeito do grafico vive no componente pai e usa esse ref).
// =============================================================================
function FamiliasTab({ dadosFam, carregandoFam, erroFam, regime, dreUnidade, setDreUnidade,
  metricaFam, setMetricaFam, famModel, famChartRef, tgAtivo, tgInativo }) {
  const model = famModel

  const COL_FAM_PX = 200
  const COL_PER_PX = 110

  return (
    <>
      {/* Controles: unidade de periodo (mes/trimestre/ano) */}
      <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 mb-4 flex items-center gap-2 flex-wrap text-xs text-slate-600">
        <span className="uppercase tracking-wide text-slate-500">Período</span>
        <div className="inline-flex rounded border border-slate-300 overflow-hidden" title="Unidade do período para a tabela e o gráfico">
          {[['mes', 'Mês'], ['trimestre', 'Trimestre'], ['ano', 'Ano']].map(([k, lbl], i) => (
            <button key={k} onClick={() => setDreUnidade(k)}
              className={(i ? 'border-l border-slate-300 ' : '') + 'px-3 py-1 ' + (dreUnidade === k ? tgAtivo : tgInativo)}>{lbl}</button>
          ))}
        </div>
        <span className="ml-3 text-[11px] text-slate-400">
          Margem bruta = (receita − CMV) / receita · Margem líquida = (lucro bruto − despesas rateadas pela receita) / receita
        </span>
        {regime === 'omie' && (
          <span className="ml-auto text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
            Receita/CMV por família vêm de vendas_itens (competência); as despesas seguem o regime carregado.
          </span>
        )}
      </div>

      {carregandoFam && <div className="text-xs text-slate-500 mb-3">Carregando margens por família…</div>}
      {erroFam && <div className="text-xs text-red-600 mb-3">Erro: {erroFam}</div>}
      {!carregandoFam && !erroFam && (!model || !model.linhas.length) && (
        <div className="text-xs text-slate-500 mb-3">Sem vendas no período selecionado.</div>
      )}

      {model && model.linhas.length > 0 && (
        <>
          {/* Tabela: familia x periodo (MB% em cima, ML% embaixo) */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600 flex items-center justify-between">
              <span>Margens por família</span>
              <span className="text-[10px] normal-case text-slate-400">linha de cima: margem bruta % · linha de baixo: margem líquida %</span>
            </div>
            <div className="overflow-auto" style={{ maxHeight: '70vh' }}>
              <table className="text-xs" style={{ tableLayout: 'fixed', minWidth: COL_FAM_PX + model.colInfo.length * COL_PER_PX }}>
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left px-2 py-2 sticky left-0 bg-slate-50 z-10"
                      style={{ width: COL_FAM_PX, minWidth: COL_FAM_PX }}>Família</th>
                    {model.colInfo.map((c) => (
                      <th key={c.key} className="text-right px-2 py-2 whitespace-nowrap" style={{ width: COL_PER_PX }}>{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.linhas.map((ln) => (
                    <tr key={ln.familia} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-2 py-1 sticky left-0 bg-white truncate" title={ln.familia}
                        style={{ width: COL_FAM_PX, minWidth: COL_FAM_PX }}>{ln.familia}</td>
                      {ln.cels.map((cel) => (
                        <td key={cel.key} className="px-2 py-1 text-right tabular-nums"
                          title={'Receita ' + fmtBRL(cel.receita) + ' · Lucro bruto ' + fmtBRL(cel.lucroBruto) + ' · Lucro líquido ' + fmtBRL(cel.lucroLiq)}>
                          <div className={cor(cel.margemBruta)}>{cel.margemBruta == null ? '—' : cel.margemBruta.toFixed(1) + '%'}</div>
                          <div className={'text-[10px] ' + cor(cel.margemLiq)}>{cel.margemLiq == null ? '—' : cel.margemLiq.toFixed(1) + '%'}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {/* Linha total */}
                  <tr className="border-t-2 border-slate-300 font-bold bg-slate-50">
                    <td className="px-2 py-1 sticky left-0 bg-slate-50" style={{ width: COL_FAM_PX, minWidth: COL_FAM_PX }}>Total</td>
                    {model.totalCels.map((cel) => (
                      <td key={cel.key} className="px-2 py-1 text-right tabular-nums"
                        title={'Receita ' + fmtBRL(cel.receita) + ' · Despesas ' + fmtBRL(cel.despesaRateada)}>
                        <div className={cor(cel.margemBruta)}>{cel.margemBruta == null ? '—' : cel.margemBruta.toFixed(1) + '%'}</div>
                        <div className={'text-[10px] ' + cor(cel.margemLiq)}>{cel.margemLiq == null ? '—' : cel.margemLiq.toFixed(1) + '%'}</div>
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Grafico de evolucao das margens por familia */}
          <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Evolução da margem {metricaFam === 'bruta' ? 'bruta' : 'líquida'} por família (top 6 + Outros)
              </div>
              <div className="inline-flex rounded border border-slate-300 overflow-hidden text-xs">
                <button onClick={() => setMetricaFam('bruta')}
                  className={'px-3 py-1 ' + (metricaFam === 'bruta' ? tgAtivo : tgInativo)}>Margem Bruta %</button>
                <button onClick={() => setMetricaFam('liquida')}
                  className={'px-3 py-1 border-l border-slate-300 ' + (metricaFam === 'liquida' ? tgAtivo : tgInativo)}>Margem Líquida %</button>
              </div>
            </div>
            <div style={{ height: 440, position: 'relative' }}>
              <canvas ref={famChartRef}></canvas>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Dica: clique num <strong>ponto</strong> para ver as vendas que compõem aquele valor · clique numa família na legenda para escondê-la e isolar as demais.
              A escala ignora valores extremos para facilitar a leitura (o valor exato aparece no tooltip).
            </div>
          </div>
        </>
      )}
    </>
  )
}
