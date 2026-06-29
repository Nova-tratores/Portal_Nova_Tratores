'use client'
// =============================================================================
// Tela "Vendas por Modelo" (port FIEL de views/vendas-modelo.ejs do
// financeiro-omie-dashboard).
//
// Mantem EXATAMENTE os calculos, agrupamentos, cores e comportamento da fonte:
//  - Toolbar: botao "Sincronizar modelos do Omie" (POST backfill em background),
//    Periodo (3/6/12/24 meses ou "Desde data..." com <input type=month>),
//    Metrica (receita / qtd / eventos).
//  - 4 KPIs: modelos distintos, eventos de venda, quantidade total, receita total.
//  - Grafico "Evolucao mensal" (Chart.js bar): total da metrica por mes + plugin
//    inline que desenha a QUANTIDADE de cada mes na base de cada barra.
//  - Filtros: Familia (com "Todas as maquinas" / "So pecas"), Modelo, Busca
//    livre, Top (20/50/100/Todos), contador "Mostrando X de Y".
//  - Toggle de visualizacao: Tabela pivotada | Grade anual.
//  - Toggle de agrupamento: Por modelo (variantes) | Por potencia (faixa de cv).
//  - Tabela pivotada: 1 linha por modelo, colunas = meses + Total, heatmap
//    emerald por celula, celulas clicaveis abrem o modal de detalhe.
//  - Grade anual: anos como linhas, 12 meses + TOTAL ano como colunas, mini-
//    barras empilhadas por modelo (top 7 por pagina), totais por mes/ano, linha
//    de trimestres, projecao do mes corrente, legenda clicavel, paginacao.
//  - Modal de detalhe: vendas do modelo no mes (data, empresa, cliente,
//    descricao, qtd, CMC unit. toggle, valor) + resumo/total. Esc fecha.
//
// As estruturas de DOM montadas via innerHTML na fonte foram reescritas como
// JSX/maps; toda a logica de calculo (aplicarAgrupamento, construirSeriesGrade,
// heatmap, projecao, trimestres) e portada 1:1. Os formatadores LOCAIS da fonte
// (fmtBRL sem casas, fmtBRLcurto arredondado) sao mantidos inline porque diferem
// dos helpers do modulo (format.js usa 2 casas) e a fidelidade dos rotulos manda.
//
// Endpoints (com prefixo /api/dre-financeiro/ por BRIEF item 3):
//   GET  /api/dre-financeiro/vendas-modelo?conta=&familia=&modelo=&meses=|&desde=
//   GET  /api/dre-financeiro/vendas-modelo/detalhe?conta=&ano=&mes=&modelos=
//   POST /api/dre-financeiro/produtos/backfill-modelo?conta=&refazer=1
//
// O layout do modulo (.../dre-financeiro/layout.js) ja aplica o gate de permissao
// 'financeiro', a sub-nav e o seletor de conta; ainda assim importamos
// useAuth/usePermissoes/SemPermissao por consistencia com o padrao do portal e
// usamos useDreConta para obter a conta selecionada e montar as URLs.
//
// Chart.js 4.4.0 e carregado via CDN (mesma lib/versao da fonte) num <script>
// dinamico; o grafico usa ref/canvas imperativo (BRIEF item 6 — porte fiel).
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta } from '@/lib/dre-financeiro/format'

// ---------------------------------------------------------------------------
// Formatadores LOCAIS (identicos aos do <script> da fonte). Mantidos inline para
// preservar EXATAMENTE o arredondamento dos rotulos. NAO usar os helpers de
// format.js aqui (aqueles usam 2 casas decimais; a fonte pediu sem casas).
// ---------------------------------------------------------------------------
function fmtBRL(n) {
  // Sem casas decimais (conforme pedido na fonte)
  return 'R$ ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(n) || 0)
}
function fmtBRLcurto(n) {
  const v = Number(n) || 0
  const s = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1000000) return s + 'R$ ' + (a / 1000000).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1000) return s + 'R$ ' + Math.round(a / 1000) + 'k'
  return s + 'R$ ' + Math.round(a)
}
function fmtN(n) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(n) || 0)
}
function rotuloMes(yyyymm) {
  const p = yyyymm.split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return nomes[parseInt(p[1]) - 1] + '/' + p[0].slice(2)
}

// ---------------------------------------------------------------------------
// Mapas de agrupamento (port fiel das constantes da fonte).
// ---------------------------------------------------------------------------
// Modo 1: variantes -> 1 modelo so (ex: "6075E CAB" -> "6075E")
const GRUPOS_MODELOS = {
  '6075E': '6075E',
  '6075E CAB': '6075E',
  '9500S': '9500S/7095',
  '9500S CAB': '9500S/7095',
  '7095': '9500S/7095',
  '7095 CAB': '9500S/7095',
  '6075 BR': '6075',
  '6075 BR CAB': '6075',
  '6075 CAB': '6075',
  '6075 CBU': '6075 CBU',
  '6075L CBU P': '6075 CBU',
  '6065': '6065',
  '6065 CAB': '6065',
  '8000S': '8000S',
  '8000S CAB': '8000S',
}

// Modo 2: aplicado APOS GRUPOS_MODELOS, entao as chaves sao nomes de GRUPO
// (ex: "6075", "9500S/7095") ou nomes de modelo individuais sem grupo (ex:
// "JIVO 2025"). Modelos sem mapeamento passam intactos.
const FAIXAS_POTENCIA = {
  'JIVO 2025': '25 cv',
  'ESK304': '25 cv',
  'OJA 3140': '40/50 cv',
  '5050': '40/50 cv',
  '6060': '60/65',
  '6065': '60/65',
  '6075E': '80 cv',
  '6075': '80 cv',
  '6075 CBU': '80 cv',
  '8000S': '80 cv',
  '9500S/7095': '95 cv',
  '86-110P': '110 cv',
}

// Ordem fixa das faixas no modo "Por potencia" (do menor pro maior hp).
// Faixas nao listadas vao pro fim (ordem natural por receita).
const ORDEM_POTENCIAS = ['25 cv', '40/50 cv', '60/65', '80 cv', '95 cv', '110 cv']

// Hex canonicos das tonalidades emerald do Tailwind, usados no heatmap da tabela.
// (Ver corCelula: o background vai como style inline para nao depender do purge
// do Tailwind compilado; os mesmos cortes/niveis da fonte sao preservados.)
const EMERALD = {
  50: '#ecfdf5',
  100: '#d1fae5',
  200: '#a7f3d0',
  300: '#6ee7b7',
  400: '#34d399',
  500: '#10b981',
}

// Paleta de cores (porte da que vem do projeto omie-consulta-estoque)
const PALETA = [
  { bar: '#dc2626', label: '#b91c1c' }, // vermelho
  { bar: '#ea580c', label: '#c2410c' }, // laranja
  { bar: '#16a34a', label: '#15803d' }, // verde
  { bar: '#2563eb', label: '#1d4ed8' }, // azul
  { bar: '#7c3aed', label: '#6d28d9' }, // roxo
  { bar: '#0d9488', label: '#0f766e' }, // teal
  { bar: '#db2777', label: '#be185d' }, // rosa
  { bar: '#ca8a04', label: '#a16207' }, // amarelo
  { bar: '#475569', label: '#334155' }, // slate
  { bar: '#65a30d', label: '#4d7c0f' }, // lima
]

// ---------------------------------------------------------------------------
// aplicarAgrupamento(modelos, mapa): aplica um mapa modelo->grupo, somando
// totais e por_mes dos membros. Modelos nao mapeados aparecem com seu proprio
// nome. Port fiel da funcao homonima da fonte.
// ---------------------------------------------------------------------------
function aplicarAgrupamento(modelos, mapa) {
  const byGroup = {}
  ;(modelos || []).forEach(function (m) {
    const nome = mapa[m.modelo] || m.modelo
    if (!byGroup[nome]) {
      byGroup[nome] = {
        modelo: nome, familia: m.familia, codigo_produto: m.codigo_produto,
        descricao_exemplo: m.descricao_exemplo,
        totais: { receita: 0, cmv: 0, qtd: 0, eventos: 0, margem_pct: 0, lucro: 0 },
        por_mes: {}, _membros: [],
      }
    }
    const g = byGroup[nome]
    // Propaga membros RAIZ se o input ja eh um grupo (chaining de aplicacoes)
    const membrosOrigem = (m._membros && m._membros.length) ? m._membros : [m.modelo]
    membrosOrigem.forEach(function (mm) {
      if (g._membros.indexOf(mm) < 0) g._membros.push(mm)
    })
    g.totais.receita += m.totais.receita || 0
    g.totais.cmv += m.totais.cmv || 0
    g.totais.qtd += m.totais.qtd || 0
    g.totais.eventos += m.totais.eventos || 0
    Object.keys(m.por_mes || {}).forEach(function (k) {
      if (!g.por_mes[k]) g.por_mes[k] = { receita: 0, qtd: 0, eventos: 0 }
      g.por_mes[k].receita += (m.por_mes[k].receita || 0)
      g.por_mes[k].qtd += (m.por_mes[k].qtd || 0)
      g.por_mes[k].eventos += (m.por_mes[k].eventos || 0)
    })
  })
  Object.keys(byGroup).forEach(function (k) {
    const g = byGroup[k]
    g.totais.lucro = g.totais.receita - g.totais.cmv
    g.totais.margem_pct = g.totais.receita > 0
      ? +(((g.totais.receita - g.totais.cmv) / g.totais.receita) * 100).toFixed(1)
      : 0
  })
  return Object.keys(byGroup).map(function (k) { return byGroup[k] })
    .sort(function (a, b) { return b.totais.receita - a.totais.receita })
}

// ---------------------------------------------------------------------------
// construirSeriesGrade(modelosFiltrados, metrica, meses): retorna TODOS os
// modelos filtrados ordenados por total (desc), com cor estavel pelo indice no
// ranking e a serie de meses preenchida (buracos = 0). Port fiel da fonte.
// ---------------------------------------------------------------------------
function construirSeriesGrade(modelosFiltrados, metrica, todosMesesIn) {
  const lista = modelosFiltrados.slice()
  lista.sort(function (a, b) {
    const ta = a.totais[metrica] !== undefined ? a.totais[metrica] : a.totais.qtd
    const tb = b.totais[metrica] !== undefined ? b.totais[metrica] : b.totais.qtd
    return tb - ta
  })

  // Universo de meses do dataset (precisa pra preencher buracos)
  const todosMeses = todosMesesIn.slice().sort() // 'YYYY-MM'

  // Cada modelo tem cor estavel pelo seu indice no ranking (cicla a paleta de 10)
  return lista.map(function (m, i) {
    const paleta = PALETA[i % PALETA.length]
    const meses = todosMeses.map(function (k) {
      const p = k.split('-')
      const ano = parseInt(p[0], 10), mes = parseInt(p[1], 10)
      const v = (m.por_mes[k] || {})[metrica] || 0
      return { ano: ano, mes: mes, valor: v }
    })
    return { label: m.modelo, _membros: m._membros || [m.modelo], cor: paleta.bar, corLabel: paleta.label, meses: meses }
  })
}

// ---------------------------------------------------------------------------
// Carregamento da lib de grafico (Chart.js) via CDN, uma unica vez. Mesma
// lib/versao da fonte (vendas-modelo.ejs). Identico ao helper de curva-saldo.
// ---------------------------------------------------------------------------
let chartLibPromise = null
function carregarChartLibs() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.Chart) return Promise.resolve()
  if (chartLibPromise) return chartLibPromise
  function addScript(src) {
    return new Promise((resolve, reject) => {
      const existente = document.querySelector('script[src="' + src + '"]')
      if (existente) {
        existente.addEventListener('load', resolve); existente.addEventListener('error', reject)
        if (existente.dataset.loaded) resolve(); return
      }
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = () => { s.dataset.loaded = '1'; resolve() }
      s.onerror = reject
      document.head.appendChild(s)
    })
  }
  chartLibPromise = addScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js')
  return chartLibPromise
}

// ehPeca(f): familia eh peca? (port fiel do helper inline da fonte — normaliza
// acentos e testa /^pe[cc]/i).
function ehPeca(f) {
  return /^pe[çc]/i.test(String(f || '').normalize('NFD').replace(/[̀-ͯ]/g, ''))
}

export default function VendasModeloPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  // --- Estado de controles (espelha as vars do IIFE da fonte) ----------------
  const [meses, setMeses] = useState('__desde__') // 3|6|12|24|__desde__
  const [desde, setDesde] = useState('2023-01')   // <input type=month>
  const [metrica, setMetrica] = useState('qtd')   // receita|qtd|eventos
  const [familia, setFamilia] = useState('')      // filtro de familia (aplicado server-side + client-side)
  const [modelo, setModelo] = useState('')        // filtro de modelo
  const [busca, setBusca] = useState('')          // texto livre
  const [top, setTop] = useState(50)              // 20|50|100|0(=Todos)
  const [viewMode, setViewMode] = useState('tabela')        // tabela|grade
  const [modoAgrupamento, setModoAgrupamento] = useState('modelo') // modelo|potencia
  const [gridPage, setGridPage] = useState(0)     // pagina atual da grade (7 por pagina)

  // Default no 1o carregamento: Trator Novo (se existir). Espelha o
  // primeiroCarregamento da fonte.
  const primeiroCarregamentoRef = useRef(true)

  // --- Dados ----------------------------------------------------------------
  const [dados, setDados] = useState(null)        // resposta de /vendas-modelo
  const [chartReady, setChartReady] = useState(false)

  // --- Backfill -------------------------------------------------------------
  const [backfillStatus, setBackfillStatus] = useState('')
  const [backfillBusy, setBackfillBusy] = useState(false)

  // --- Scroll horizontal pos-carregamento -----------------------------------
  const firstLoadScrollRef = useRef(false)
  const tabelaWrapRef = useRef(null)

  // --- Modal de detalhe -----------------------------------------------------
  const [modalAberto, setModalAberto] = useState(false)
  const [modalCtx, setModalCtx] = useState(null)   // { ano, mes, modeloGrupo, membros }
  const [modalDados, setModalDados] = useState(null) // resposta de /detalhe
  const [modalErro, setModalErro] = useState('')
  const [modalCarregando, setModalCarregando] = useState(false)
  const [showCmc, setShowCmc] = useState(false)

  // Refs do grafico
  const chartRef = useRef(null)
  const chartInst = useRef(null)

  // Carrega a lib uma vez.
  useEffect(() => {
    carregarChartLibs().then(() => setChartReady(true)).catch(() => setChartReady(false))
  }, [])

  // =========================================================================
  // carregar(): busca os dados de vendas por modelo. Port fiel da funcao
  // homonima da fonte. Re-busca quando conta / periodo / familia / modelo mudam.
  // (metrica / busca / top / agrupamento sao puramente client-side -> render.)
  // =========================================================================
  useEffect(() => {
    let cancelado = false
    let qs = 'conta=' + conta + '&familia=' + encodeURIComponent(familia) + '&modelo=' + encodeURIComponent(modelo)
    if (meses === '__desde__') qs += '&desde=' + desde
    else qs += '&meses=' + meses
    setGridPage(0) // reset paginacao da grade ao recarregar dados
    fetch('/api/dre-financeiro/vendas-modelo?' + qs)
      .then((r) => r.json())
      .then((d) => {
        if (cancelado) return
        if (d.erro) { alert(d.erro); return }
        firstLoadScrollRef.current = true // scrolla a tabela ate o final apos render

        // Default no 1o carregamento: Trator Novo (se existir). A fonte trocava
        // o select e re-chamava carregar(); aqui setamos a familia (que dispara
        // re-busca por este mesmo efeito).
        if (primeiroCarregamentoRef.current) {
          primeiroCarregamentoRef.current = false
          const fams = Array.from(new Set((d.modelos || []).map((m) => m.familia)))
          if (!familia && fams.indexOf('Trator Novo') >= 0) {
            setFamilia('Trator Novo')
            return // a re-busca pelo efeito traz os dados ja filtrados
          }
        }
        setDados(d)
      })
      .catch((e) => { if (!cancelado) alert('Erro: ' + e.message) })
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, meses, desde, familia, modelo])

  // =========================================================================
  // Agrupamento (memo). Sempre passa pela stage 1 (variantes -> grupo de
  // modelo). No modo 'potencia' tb passa pela stage 2 (grupo -> faixa de cv).
  // Port fiel do bloco de cache da funcao render() da fonte.
  // =========================================================================
  const modelosBase = useMemo(() => {
    if (!dados) return []
    const step1 = aplicarAgrupamento(dados.modelos, GRUPOS_MODELOS)
    let agrupados = modoAgrupamento === 'potencia'
      ? aplicarAgrupamento(step1, FAIXAS_POTENCIA)
      : step1
    // Modo "Por potencia": ordena pela sequencia fixa (25 -> 40/50 -> ... -> 110).
    // Faixas nao listadas (ex: modelos individuais sem mapeamento) vao pro fim.
    if (modoAgrupamento === 'potencia') {
      const idxPot = (nome) => {
        const i = ORDEM_POTENCIAS.indexOf(nome)
        return i < 0 ? 999 : i
      }
      agrupados = agrupados.slice().sort((a, b) => {
        const ia = idxPot(a.modelo), ib = idxPot(b.modelo)
        if (ia !== ib) return ia - ib
        return b.totais.receita - a.totais.receita
      })
    }
    return agrupados
  }, [dados, modoAgrupamento])

  // =========================================================================
  // Lista filtrada (busca + top). Port fiel do filtro da funcao render().
  // =========================================================================
  const modelosVisiveis = useMemo(() => {
    const b = busca.trim().toLowerCase()
    let modelos = modelosBase.filter(function (m) {
      if (!b) return true
      return (m.modelo || '').toLowerCase().includes(b)
        || String(m.codigo_produto || '').toLowerCase().includes(b)
        || (m.familia || '').toLowerCase().includes(b)
        || (m._membros || []).join(' ').toLowerCase().includes(b)
    })
    if (top > 0) modelos = modelos.slice(0, top)
    return modelos
  }, [modelosBase, busca, top])

  // =========================================================================
  // Listas dos <select> de filtro (familia e modelo). Port fiel de
  // atualizarFiltros(). Familias a partir dos modelos retornados; modelos apos
  // filtro de familia client-side.
  // =========================================================================
  const familiasDisponiveis = useMemo(() => {
    if (!dados) return []
    const set = new Set()
    ;(dados.modelos || []).forEach((m) => set.add(m.familia))
    return Array.from(set).sort()
  }, [dados])

  const modelosDoSelect = useMemo(() => {
    if (!dados) return []
    const fam = familia
    const filtrados = (dados.modelos || []).filter(function (m) {
      if (fam === '__TODAS_MAQUINAS__') return !ehPeca(m.familia)
      if (fam === '__SO_PECAS__') return ehPeca(m.familia)
      if (fam && fam !== '__TODAS_MAQUINAS__' && fam !== '__SO_PECAS__') return m.familia === fam
      return true
    })
    return filtrados.map((m) => m.modelo).sort()
  }, [dados, familia])

  // =========================================================================
  // Heatmap da tabela: max valor por celula (port fiel) + funcoes corCelula /
  // fmtCel / fmtTot. Calculadas sobre os modelos visiveis e a metrica atual.
  // =========================================================================
  const mesesDataset = dados ? dados.meses : []

  const maxCel = useMemo(() => {
    let mx = 0
    modelosVisiveis.forEach((m) => {
      mesesDataset.forEach((k) => {
        const v = (m.por_mes[k] || {})[metrica] || 0
        if (v > mx) mx = v
      })
    })
    return mx
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelosVisiveis, mesesDataset, metrica])

  // corCelula(v): heatmap emerald por celula. Port fiel da fonte (mesmos cortes
  // 0.05/0.2/0.4/0.6/0.8 -> emerald 50/100/200/300/400/500). DIFERENCA TECNICA:
  // a fonte usava o Tailwind via CDN (JIT em runtime), entao a classe dinamica
  // "bg-emerald-<lvl>" sempre existia. No portal o Tailwind v4 e compilado e
  // purga classes montadas por concatenacao -> a cor sumiria. Por isso devolvemos
  // o BACKGROUND como style inline (hex canonico do emerald) e mantemos apenas a
  // cor de texto como classe estatica (que sobrevive ao purge). Resultado visual
  // identico ao original.
  function corCelula(v) {
    if (v <= 0 || maxCel === 0) return { className: '', style: undefined }
    const int = Math.min(1, v / maxCel)
    const lvl = int < 0.05 ? 50 : int < 0.2 ? 100 : int < 0.4 ? 200 : int < 0.6 ? 300 : int < 0.8 ? 400 : 500
    return { className: (lvl >= 400 ? 'text-white' : 'text-slate-800'), style: { background: EMERALD[lvl] } }
  }
  function fmtCel(v) {
    if (!v) return null // a fonte renderiza um "-" cinza; tratamos no JSX
    if (metrica === 'receita') return fmtBRLcurto(v)
    return fmtN(v)
  }
  function fmtTot(v) {
    if (metrica === 'receita') return fmtBRL(v)
    return fmtN(v)
  }
  // fmtCel para celulas do footer (que nunca exibem o dash de modelo)
  function fmtCelFoot(v) {
    if (!v) return null
    if (metrica === 'receita') return fmtBRLcurto(v)
    return fmtN(v)
  }

  // =========================================================================
  // Scroll horizontal ate o final (mes mais recente) apos novo carregamento.
  // Port fiel do bloco vmFirstLoadScroll da fonte.
  // =========================================================================
  useEffect(() => {
    if (!dados) return
    if (firstLoadScrollRef.current && viewMode === 'tabela') {
      firstLoadScrollRef.current = false
      const wrap = tabelaWrapRef.current
      if (wrap) requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth })
    }
  }, [dados, modelosVisiveis, viewMode])

  // =========================================================================
  // Render do grafico "Evolucao mensal" (Chart.js bar) + plugin inline que
  // desenha a quantidade na base de cada barra. Port fiel de renderGrafico().
  // =========================================================================
  useEffect(() => {
    if (!chartReady || !dados || !chartRef.current || !window.Chart) return
    const labels = dados.meses.map((m) => rotuloMes(m))
    const totais = dados.meses.map((m) => (dados.totaisPorMes[m] || {})[metrica] || 0)
    // Quantidade absoluta de cada mes (mostrada sempre na base da barra,
    // independente da metrica)
    const qtdsPorMes = dados.meses.map((m) => (dados.totaisPorMes[m] || {}).qtd || 0)
    const ehReceita = metrica === 'receita'
    const corBg = ehReceita ? 'rgba(16,185,129,0.7)' : 'rgba(59,130,246,0.7)'
    const corBd = ehReceita ? '#059669' : '#2563eb'
    const titulo = ehReceita ? 'Receita R$' : (metrica === 'qtd' ? 'Quantidade' : 'Nº vendas')

    // Plugin inline: desenha a quantidade de cada mes na BASE de cada barra
    const pluginQtdBase = {
      id: 'qtdBase',
      afterDatasetsDraw: function (chart) {
        const ctx = chart.ctx
        const meta = chart.getDatasetMeta(0)
        if (!meta || !meta.data) return
        ctx.save()
        ctx.font = 'bold 11px sans-serif'
        ctx.fillStyle = '#1e3a8a' // azul escuro (Tailwind blue-900)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        meta.data.forEach(function (bar, i) {
          const qtd = qtdsPorMes[i]; if (!qtd) return
          const x = bar.x
          // Base da barra: usa chartArea.bottom; tira 4px pra ficar acima do eixo X
          const yBase = chart.chartArea.bottom - 4
          ctx.fillText(fmtN(qtd), x, yBase)
        })
        ctx.restore()
      },
    }

    if (chartInst.current) chartInst.current.destroy()
    chartInst.current = new window.Chart(chartRef.current.getContext('2d'), {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{ label: titulo, data: totais, backgroundColor: corBg, borderColor: corBd, borderWidth: 1 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        scales: {
          y: { ticks: { callback: function (v) { return ehReceita ? fmtBRLcurto(v) : fmtN(v) } } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (item) { return titulo + ': ' + (ehReceita ? fmtBRL(item.raw) : fmtN(item.raw)) },
            },
          },
        },
      },
      plugins: [pluginQtdBase],
    })

    return () => {
      if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, dados, metrica])

  // =========================================================================
  // Sincronizar modelos do Omie (backfill em background). Port fiel do handler
  // do btn-backfill-modelo da fonte.
  // =========================================================================
  function sincronizarModelos() {
    if (!confirm('Sincronizar modelos do Omie?\n\nLeva ~3-5 min para ~5k produtos (ListarProdutos paginado). Roda em background no servidor.\nRecarregue a pagina em ~5 min para ver os modelos atualizados.')) return
    setBackfillBusy(true)
    setBackfillStatus('sincronizando em background (~3-5 min)...')
    fetch('/api/dre-financeiro/produtos/backfill-modelo?conta=' + conta + '&refazer=1', { method: 'POST' })
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) setBackfillStatus('Erro: ' + d.erro)
        else setBackfillStatus('Iniciado para conta=' + conta + '. Recarregue em ~5 min.')
      })
      .catch((e) => setBackfillStatus('Erro: ' + e.message))
  }

  // =========================================================================
  // Modal de detalhe das vendas do modelo no mes. Port fiel de abrirVmModal /
  // renderVmModal / abrirDoElement.
  // =========================================================================
  const abrirVmModal = useCallback((p) => {
    setModalCtx(p)
    setModalDados(null)
    setModalErro('')
    setModalCarregando(true)
    setModalAberto(true)

    const qs = 'conta=' + encodeURIComponent(conta) +
      '&ano=' + p.ano + '&mes=' + p.mes +
      '&modelos=' + encodeURIComponent(p.membros.join(','))
    fetch('/api/dre-financeiro/vendas-modelo/detalhe?' + qs)
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { setModalErro(d.erro); setModalCarregando(false); return }
        setModalDados(d)
        setModalCarregando(false)
      })
      .catch((e) => { setModalErro(e.message); setModalCarregando(false) })
  }, [conta])

  function fecharVmModal() { setModalAberto(false) }

  // Esc fecha o modal (port fiel do keydown da fonte)
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') fecharVmModal() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // --- Estados de gate de permissao (BRIEF item 1) --------------------------
  if (!loading && !loadingPerm && userProfile && (!temAcesso('financeiro') && !pode('dre', 'vendas-modelo'))) return <SemPermissao />

  // --- KPIs (port fiel) -----------------------------------------------------
  const tg = dados ? dados.totaisGerais : null

  // helper de view-info (port fiel do setViewMode)
  const viewInfoTxt = viewMode === 'tabela'
    ? 'Tabela pivotada: 1 linha por modelo'
    : 'Grade anual: top N modelos x meses, com variacao'

  // botoes de toggle (classes identicas a fonte)
  const ATIVO = 'bg-slate-800 text-white'
  const INATIVO = 'bg-white text-slate-700 hover:bg-slate-100'

  return (
    <>
      {/* Hover das celulas clicaveis da TABELA (port do CSS td.vm-tbl-mes:hover
          da fonte). Fica sempre montado pois a tabela vive fora da grade. */}
      <style jsx global>{`
        td.vm-tbl-mes{transition:outline 0.1s}
        td.vm-tbl-mes:hover{outline:1px solid #3b82f6;outline-offset:-1px}
      `}</style>

      {/* ---- Cabecalho da tela + toolbar ------------------------------------ */}
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Vendas por Modelo</h1>
          <p className="text-xs text-slate-500">Receita e quantidade mes a mes, modelo a modelo</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
          <button
            onClick={sincronizarModelos}
            disabled={backfillBusy}
            className={'px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded' + (backfillBusy ? ' opacity-60 cursor-not-allowed' : '')}
            title="Puxa o campo 'modelo' de todos os produtos via ListarProdutos paginado (~3-5min para ~5k itens). Roda em background; recarregue depois."
          >
            Sincronizar modelos do Omie
          </button>
          <span className="text-slate-500 text-[10px]">{backfillStatus}</span>
          <label className="ml-2">Periodo:</label>
          <select
            value={meses}
            onChange={(e) => setMeses(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1"
          >
            <option value="3">3 meses</option>
            <option value="6">6 meses</option>
            <option value="12">12 meses</option>
            <option value="24">24 meses</option>
            <option value="__desde__">Desde data...</option>
          </select>
          <input
            type="month"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className={'border border-slate-300 rounded px-2 py-1' + (meses === '__desde__' ? '' : ' hidden')}
          />
          <label className="ml-2">Metrica:</label>
          <select
            value={metrica}
            onChange={(e) => { setMetrica(e.target.value); setGridPage(0) }}
            className="border border-slate-300 rounded px-2 py-1"
          >
            <option value="receita">Receita R$</option>
            <option value="qtd">Quantidade</option>
            <option value="eventos">Nº de vendas</option>
          </select>
        </div>
      </div>

      {/* ---- KPIs ----------------------------------------------------------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Modelos distintos</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{tg ? fmtN(tg.modelos) : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Eventos de venda</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{tg ? fmtN(tg.eventos) : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Quantidade total</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{tg ? fmtN(tg.qtd) : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Receita total</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{tg ? fmtBRL(tg.receita) : '--'}</div>
        </div>
      </div>

      {/* ---- Grafico (total da metrica por mes) ----------------------------- */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs uppercase tracking-wide text-slate-500">Evolucao mensal</div>
          <div className="text-[10px] text-slate-400">
            {dados ? dados.meses.length + ' meses · ' + fmtN(dados.totaisGerais.modelos) + ' modelos no filtro' : ''}
          </div>
        </div>
        <div style={{ height: '220px', position: 'relative' }}>
          <canvas ref={chartRef} />
        </div>
      </div>

      {/* ---- Filtros + busca ------------------------------------------------ */}
      <div className="flex items-center gap-2 mb-3 flex-wrap text-sm">
        <label className="text-xs text-slate-500">Familia:</label>
        <select
          value={familia}
          onChange={(e) => setFamilia(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 bg-white min-w-[180px]"
        >
          <option value="">Todas</option>
          <option value="__TODAS_MAQUINAS__">⚙ Todas as maquinas</option>
          <option value="__SO_PECAS__">🔩 So pecas</option>
          <option disabled>──────────</option>
          {familiasDisponiveis.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
        <label className="text-xs text-slate-500 ml-2">Modelo:</label>
        <select
          value={modelo}
          onChange={(e) => setModelo(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 bg-white min-w-[200px] max-w-[280px]"
        >
          <option value="">Todos ({modelosDoSelect.length})</option>
          {modelosDoSelect.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <label className="text-xs text-slate-500 ml-2">Busca:</label>
        <input
          type="text"
          placeholder="texto livre..."
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setGridPage(0) }}
          className="border border-slate-300 rounded px-2 py-1 w-60"
        />
        <label className="text-xs text-slate-500 ml-2">Top:</label>
        <select
          value={top}
          onChange={(e) => { setTop(parseInt(e.target.value, 10)); setGridPage(0) }}
          className="border border-slate-300 rounded px-2 py-1"
        >
          <option value={20}>Top 20</option>
          <option value={50}>Top 50</option>
          <option value={100}>Top 100</option>
          <option value={0}>Todos</option>
        </select>
        <span className="text-xs text-slate-500 ml-2">
          Mostrando <span>{modelosVisiveis.length}</span> de <span>{modelosBase.length}</span>
        </span>
      </div>

      {/* ---- Toggle de visualizacao ----------------------------------------- */}
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <div className="inline-flex rounded border border-slate-300 overflow-hidden text-xs">
          <button
            onClick={() => setViewMode('tabela')}
            className={'px-3 py-1 ' + (viewMode === 'tabela' ? ATIVO : INATIVO)}
          >
            Tabela
          </button>
          <button
            onClick={() => setViewMode('grade')}
            className={'px-3 py-1 border-l border-slate-300 ' + (viewMode === 'grade' ? ATIVO : INATIVO)}
          >
            Grade anual
          </button>
        </div>
        <div
          className="inline-flex rounded border border-slate-300 overflow-hidden text-xs ml-2"
          title="Por modelo: variantes (6075E + 6075E CAB → 6075E). Por potência: agrupa por faixa de cv (25cv, 40/50cv...)"
        >
          <button
            onClick={() => { if (modoAgrupamento !== 'modelo') { setModoAgrupamento('modelo'); setGridPage(0) } }}
            className={'px-3 py-1 ' + (modoAgrupamento === 'modelo' ? ATIVO : INATIVO)}
          >
            Por modelo
          </button>
          <button
            onClick={() => { if (modoAgrupamento !== 'potencia') { setModoAgrupamento('potencia'); setGridPage(0) } }}
            className={'px-3 py-1 border-l border-slate-300 ' + (modoAgrupamento === 'potencia' ? ATIVO : INATIVO)}
          >
            Por potência
          </button>
        </div>
        <span className="text-[10px] text-slate-500 ml-2">{viewInfoTxt}</span>
      </div>

      {/* ---- Tabela pivotada ------------------------------------------------ */}
      {viewMode === 'tabela' && (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <div ref={tabelaWrapRef} className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-2 sticky left-0 bg-slate-50 z-10 min-w-[140px] max-w-[180px]">Modelo</th>
                  <th className="text-left px-2 py-2 min-w-[110px]">Familia</th>
                  {mesesDataset.map((m) => (
                    <th key={m} className="text-right px-2 py-2 whitespace-nowrap">{rotuloMes(m)}</th>
                  ))}
                  <th className="text-right px-2 py-2 bg-slate-100 sticky right-0">Total</th>
                </tr>
              </thead>
              <tbody>
                {modelosVisiveis.length === 0 ? (
                  <tr>
                    <td colSpan={mesesDataset.length + 3} className="px-2 py-6 text-center text-slate-500">
                      Nenhum modelo no filtro.
                    </td>
                  </tr>
                ) : (
                  modelosVisiveis.map((m) => {
                    const temVariantes = m._membros && m._membros.length > 1
                    const membrosTxt = temVariantes ? ' (' + m._membros.join(', ') + ')' : ''
                    const membros = m._membros || [m.modelo]
                    const tituloCel = (m.modelo || '') + membrosTxt + ' · cod ' + m.codigo_produto
                    const tot = m.totais[metrica] !== undefined ? m.totais[metrica] : m.totais.qtd
                    return (
                      <tr key={m.modelo} className="border-b border-slate-100 hover:bg-blue-50">
                        <td
                          className="px-2 py-1 sticky left-0 bg-white truncate max-w-[180px] text-[11px]"
                          title={tituloCel}
                        >
                          {m.modelo}
                          {temVariantes && (
                            <span className="text-slate-400 text-[9px]"> ({m._membros.length})</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-slate-600 text-[10px] truncate max-w-[110px]" title={m.familia || ''}>
                          {m.familia}
                        </td>
                        {mesesDataset.map((k) => {
                          const v = (m.por_mes[k] || {})[metrica] || 0
                          const txt = fmtCel(v)
                          const cor = corCelula(v)
                          if (v > 0) {
                            const pk = k.split('-')
                            return (
                              <td
                                key={k}
                                className={'vm-tbl-mes px-2 py-1 text-right cursor-pointer ' + cor.className}
                                style={cor.style}
                                title="Clique para ver as vendas"
                                onClick={() => abrirVmModal({
                                  ano: parseInt(pk[0], 10),
                                  mes: parseInt(pk[1], 10),
                                  modeloGrupo: m.modelo,
                                  membros: membros,
                                })}
                              >
                                {txt}
                              </td>
                            )
                          }
                          return (
                            <td key={k} className={'px-2 py-1 text-right ' + cor.className} style={cor.style}>
                              {txt === null ? <span className="text-slate-300">-</span> : txt}
                            </td>
                          )
                        })}
                        <td className="px-2 py-1 text-right font-bold bg-slate-50 sticky right-0">{fmtTot(tot)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              <tfoot className="bg-slate-100 font-semibold">
                <tr>
                  <td className="px-2 py-2 sticky left-0 bg-slate-100">TOTAL</td>
                  <td className="px-2 py-2"></td>
                  {(() => {
                    let totGeral = 0
                    const cells = mesesDataset.map((k) => {
                      const v = (dados?.totaisPorMes[k] || {})[metrica] || 0
                      totGeral += v
                      const txt = fmtCelFoot(v)
                      return (
                        <td key={k} className="px-2 py-2 text-right whitespace-nowrap">
                          {txt === null ? <span className="text-slate-300">-</span> : txt}
                        </td>
                      )
                    })
                    return (
                      <>
                        {cells}
                        <td className="px-2 py-2 text-right bg-slate-200 sticky right-0">{fmtTot(totGeral)}</td>
                      </>
                    )
                  })()}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ---- Grade anual ---------------------------------------------------- */}
      {viewMode === 'grade' && (
        <GradeAnual
          dados={dados}
          metrica={metrica}
          modelosFiltrados={modelosVisiveis}
          gridPage={gridPage}
          setGridPage={setGridPage}
          abrirVmModal={abrirVmModal}
        />
      )}

      {/* ---- Modal de detalhe ----------------------------------------------- */}
      {modalAberto && (
        <VmModal
          ctx={modalCtx}
          dados={modalDados}
          erro={modalErro}
          carregando={modalCarregando}
          showCmc={showCmc}
          setShowCmc={setShowCmc}
          onClose={fecharVmModal}
        />
      )}
    </>
  )
}

// ===========================================================================
// Grade anual (alternativa a tabela): anos como rows, 12 meses + total/ano como
// colunas. Cada celula mostra mini-barra empilhada das top-N series com value.
// Port fiel de renderGradeAnual() da fonte, com o CSS inline (movido do <style>).
// ===========================================================================
function GradeAnual({ dados, metrica, modelosFiltrados, gridPage, setGridPage, abrirVmModal }) {
  const ehReceita = metrica === 'receita'
  const fmt = (v) => (ehReceita ? fmtBRLcurto(v) : fmtN(v))

  if (!dados) return null

  const series = construirSeriesGrade(modelosFiltrados, metrica, dados.meses)

  // Sem dados
  if (series.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-3">
        <GradeStyles />
        <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
          <div className="text-xs text-slate-600 font-medium">Sem modelos.</div>
          <div className="flex items-center gap-1">
            <button disabled className="px-2 py-1 text-xs border border-slate-300 rounded bg-white opacity-40 cursor-not-allowed">« Anteriores 7</button>
            <button disabled className="px-2 py-1 text-xs border border-slate-300 rounded bg-white opacity-40 cursor-not-allowed">Próximos 7 »</button>
          </div>
        </div>
        <div className="vm-grid-legenda" />
        <div className="text-slate-500 text-xs p-4 text-center">Sem dados pra exibir.</div>
      </div>
    )
  }

  // Paginacao: 7 modelos por pagina (clampa se passar do total)
  const totalPages = Math.ceil(series.length / 7)
  const pageClamped = gridPage >= totalPages ? 0 : gridPage
  const start = pageClamped * 7
  const end = Math.min(start + 7, series.length)
  const visible = series.slice(start, end)
  const prevDisabled = pageClamped === 0
  const nextDisabled = end >= series.length
  const pageInfo = 'Modelos ' + (start + 1) + '-' + end + ' de ' + series.length +
    (totalPages > 1 ? ' (pag. ' + (pageClamped + 1) + '/' + totalPages + ')' : '')

  // maxVal escala pelos 7 modelos visiveis
  let maxVal = 1
  visible.forEach((s) => { s.meses.forEach((m) => { if (m.valor > maxVal) maxVal = m.valor }) })

  // maxValTrim: maior soma trimestral entre os visiveis
  let maxValTrim = 1
  visible.forEach((s) => {
    const trim = {}
    s.meses.forEach((m) => {
      const q = Math.ceil(m.mes / 3)
      const k = m.ano + '-' + q
      trim[k] = (trim[k] || 0) + (m.valor || 0)
    })
    Object.keys(trim).forEach((k) => { if (trim[k] > maxValTrim) maxValTrim = trim[k] })
  })

  const nomesMes = ['', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const hoje = new Date(), mesAtual = hoje.getMonth() + 1, anoAtual = hoje.getFullYear()
  const anosSet = {}
  visible.forEach((s) => { s.meses.forEach((m) => { anosSet[m.ano] = true }) })

  // Proporcao do mes atual ja transcorrido (dia/total) - serve pra projetar
  const diaAtual = hoje.getDate()
  const diasNoMesAtual = new Date(anoAtual, mesAtual, 0).getDate()
  const propMes = Math.min(1, diaAtual / diasNoMesAtual)

  // Garante que todo ano com dado no totaisPorMes apareca
  Object.keys(dados.totaisPorMes || {}).forEach((k) => { anosSet[parseInt(k.split('-')[0], 10)] = true })
  const anosOrdenados = Object.keys(anosSet).map(Number).sort()

  // Pula pra pagina daquele modelo ao clicar na legenda
  function legendaClick(idx) {
    if (!isFinite(idx)) return
    const novaPagina = Math.floor(idx / 7)
    if (novaPagina !== pageClamped) setGridPage(novaPagina)
  }

  // Renderiza os anos (mais recente em cima), tonalidade cicla a cada 6.
  let tintIdx = 0
  const anosRender = [].concat(anosOrdenados).reverse()

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3">
      <GradeStyles />
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="text-xs text-slate-600 font-medium">{pageInfo}</div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { if (pageClamped > 0) setGridPage(pageClamped - 1) }}
            disabled={prevDisabled}
            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            « Anteriores 7
          </button>
          <button
            onClick={() => setGridPage(pageClamped + 1)}
            disabled={nextDisabled}
            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Próximos 7 »
          </button>
        </div>
      </div>

      {/* Legenda: TODOS os modelos; fora da pagina ficam opacos */}
      <div className="vm-grid-legenda" title="Clique num modelo opaco para ir pra pagina dele">
        {series.map((s, i) => {
          const inPage = i >= start && i < end
          return (
            <div
              key={i}
              className={'vm-grid-legenda-item' + (inPage ? '' : ' faded')}
              title={s.label + (inPage ? '' : ' (clique pra ir pra pagina deste modelo)')}
              onClick={() => legendaClick(i)}
            >
              <span className="vm-grid-legenda-dot" style={{ background: s.cor }} />
              {s.label}
            </div>
          )
        })}
      </div>

      {/* Conteudo: um bloco por ano */}
      <div>
        {anosRender.map((ano) => {
          const tint = tintIdx % 6
          tintIdx++

          // total geral do ano
          let totAnoGeral = 0
          for (let mm = 1; mm <= 12; mm++) {
            totAnoGeral += (dados.totaisPorMes[ano + '-' + String(mm).padStart(2, '0')] || {})[metrica] || 0
          }

          return (
            <div key={ano}>
              <div className="vm-grid-ano-label">{ano}</div>
              <div className={'vm-grid-ano-row vm-tint-' + tint}>
                {/* 12 meses */}
                {Array.from({ length: 12 }, (_, idx) => idx + 1).map((mes) => {
                  const k = ano + '-' + String(mes).padStart(2, '0')
                  const totalMes = (dados.totaisPorMes[k] || {})[metrica] || 0
                  const temData = totalMes > 0 || visible.some((s) => s.meses.find((m) => m.mes === mes && m.ano === ano && m.valor > 0))
                  if (!temData) {
                    return (
                      <div key={mes} className="vm-grid-item vm-grid-item-placeholder">
                        <div className="vm-grid-label">{nomesMes[mes]}</div>
                      </div>
                    )
                  }
                  const isAtual = (mes === mesAtual && ano === anoAtual)
                  // Projecao do mes atual (sobre o total do mes)
                  let projNode = null
                  if (isAtual && propMes > 0 && propMes < 1 && totalMes > 0) {
                    projNode = (
                      <div
                        className="vm-grid-proj"
                        title={'Projecao = total parcial / ' + (propMes * 100).toFixed(0) + '% do mes decorrido'}
                      >
                        Proj: {fmt(totalMes / propMes)}
                      </div>
                    )
                  }
                  return (
                    <div key={mes} className={'vm-grid-item ' + (isAtual ? 'vm-grid-mes-atual' : '')}>
                      <div className="vm-grid-label">{nomesMes[mes]}</div>
                      <div className="vm-grid-cols">
                        {visible.map((s, si) => {
                          const m = s.meses.find((x) => x.mes === mes && x.ano === ano)
                          const v = m ? m.valor : 0
                          const alt = v > 0 ? Math.max((v / maxVal) * 100, 4) : 0
                          const clickable = v > 0
                          const membros = s._membros || [s.label]
                          return (
                            <div
                              key={si}
                              className={'vmcol' + (clickable ? ' vm-clickable' : '')}
                              title={s.label + (v ? ' · ' + fmt(v) + ' · clique para ver as vendas' : '')}
                              onClick={clickable ? () => abrirVmModal({ ano, mes, modeloGrupo: s.label, membros }) : undefined}
                            >
                              <div className="vmcol-bar">
                                {v > 0 && <div className="mbar" style={{ height: alt + '%', background: s.cor }} />}
                              </div>
                              <div className="vmcol-val" style={{ color: s.corLabel }}>
                                {v > 0 ? fmt(v) : <span className="vmcol-dash">·</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      {/* Total do mes INTEIRO (bate com o grafico) */}
                      <div className="vm-grid-cell-total">Total: <strong>{fmt(totalMes)}</strong></div>
                      {projNode}
                    </div>
                  )
                })}

                {/* Coluna TOTAL <ano> */}
                <div className="vm-grid-item vm-grid-total">
                  <div className="vm-grid-total-label">TOTAL {ano}</div>
                  <div className="vm-grid-total-list">
                    {visible.map((s, si) => {
                      const totSerie = s.meses.reduce((a, m) => (m.ano === ano ? a + (m.valor || 0) : a), 0)
                      return (
                        <div key={si} className="trow" style={{ color: s.corLabel }} title={s.label}>
                          <span className="tname">{s.label}</span>
                          <span className="tqty">{fmt(totSerie)}</span>
                        </div>
                      )
                    })}
                    <div className="trow ttot">
                      <span className="tname">TOTAL</span>
                      <span className="tqty">{fmt(totAnoGeral)}</span>
                    </div>
                  </div>
                </div>

                {/* 2a row do MESMO grid: 4 trimestres x span 3 + filler na col 13 */}
                {Array.from({ length: 4 }, (_, idx) => idx + 1).map((q) => {
                  let totalQ = 0
                  for (let mm = (q - 1) * 3 + 1; mm <= q * 3; mm++) {
                    totalQ += (dados.totaisPorMes[ano + '-' + String(mm).padStart(2, '0')] || {})[metrica] || 0
                  }
                  if (totalQ === 0) {
                    return (
                      <div key={'q' + q} className="vm-grid-trim vm-grid-trim-placeholder">
                        <div className="vm-grid-label">TRIM {q}</div>
                      </div>
                    )
                  }
                  return (
                    <div key={'q' + q} className="vm-grid-trim">
                      <div className="vm-grid-label">TRIM {q}</div>
                      <div className="vm-grid-cols">
                        {visible.map((s, si) => {
                          let vQ = 0
                          for (let mm2 = (q - 1) * 3 + 1; mm2 <= q * 3; mm2++) {
                            const ms = s.meses.find((x) => x.mes === mm2 && x.ano === ano)
                            if (ms) vQ += ms.valor || 0
                          }
                          const alt = vQ > 0 ? Math.max((vQ / maxValTrim) * 100, 4) : 0
                          return (
                            <div key={si} className="vmcol" title={s.label + ' · Trim ' + q + (vQ ? ' · ' + fmt(vQ) : '')}>
                              <div className="vmcol-bar">
                                {vQ > 0 && <div className="mbar" style={{ height: alt + '%', background: s.cor }} />}
                              </div>
                              <div className="vmcol-val" style={{ color: s.corLabel }}>
                                {vQ > 0 ? fmt(vQ) : <span className="vmcol-dash">·</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="vm-grid-cell-total">Total: <strong>{fmt(totalQ)}</strong></div>
                    </div>
                  )
                })}
                {/* Filler na 13a coluna (alinha sob o TOTAL ANO) */}
                <div className="vm-grid-trim-filler" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ===========================================================================
// Modal: detalhe das vendas do modelo no mes (descricao, cliente, valor).
// Port fiel de renderVmModal() + estrutura HTML do modal da fonte.
// ===========================================================================
function VmModal({ ctx, dados, erro, carregando, showCmc, setShowCmc, onClose }) {
  if (!ctx) return null
  const rotuloMesStr = rotuloMes(ctx.ano + '-' + String(ctx.mes).padStart(2, '0'))
  const multi = ctx.membros && ctx.membros.length > 1
  const classif = ctx.modeloGrupo + (multi ? ' (' + ctx.membros.length + ' variantes)' : '')
  const titulo = ctx.modeloGrupo + ' · ' + rotuloMesStr

  const vendas = dados ? (dados.vendas || []) : []
  const membrosTxt = ctx.membros.length > 1 ? ' · variantes: ' + ctx.membros.join(', ') : ''

  // Resumo (header inferior)
  let resumoTxt = 'Carregando vendas...'
  if (erro) resumoTxt = 'Erro: ' + erro
  else if (dados) resumoTxt = vendas.length + ' vendas no mes' + membrosTxt

  // Info/total (footer)
  const infoTxt = dados ? (vendas.length + ' venda(s) · ' + fmtN(dados.totais.qtd) + ' unidades') : ''
  const totalTxt = dados ? ('Total: ' + fmtBRL(dados.totais.valor)) : ''

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex justify-between items-center gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">{classif}</div>
            <h3 className="font-bold text-lg text-slate-800">{titulo}</h3>
          </div>
          <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-700 leading-none">×</button>
        </div>

        {/* Resumo + toggle CMC */}
        <div className="px-4 py-2 border-b border-slate-200 bg-slate-50 text-xs flex items-center justify-between gap-2">
          <span className="text-slate-700">{resumoTxt}</span>
          <button
            type="button"
            onClick={() => setShowCmc((v) => !v)}
            className="px-2 py-0.5 text-[10px] rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            title="Mostra/oculta o CMC unitario (custo) de cada movimento"
          >
            {showCmc ? 'Ocultar CMC' : 'Mostrar CMC'}
          </button>
        </div>

        {/* Tabela de vendas */}
        <div className="overflow-auto flex-1">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2">Data</th>
                <th className="text-left px-3 py-2">Empresa</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-left px-3 py-2">Descrição</th>
                <th className="text-right px-3 py-2">Qtd</th>
                {showCmc && <th className="text-right px-3 py-2">CMC unit.</th>}
                <th className="text-right px-3 py-2">Valor</th>
              </tr>
            </thead>
            <tbody>
              {carregando ? (
                <tr><td colSpan={showCmc ? 7 : 6} className="text-center py-4 text-slate-500">Carregando...</td></tr>
              ) : vendas.length === 0 ? (
                <tr><td colSpan={showCmc ? 7 : 6} className="text-center py-4 text-slate-500">Sem vendas neste mes.</td></tr>
              ) : (
                vendas.map((v, i) => (
                  <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-1 whitespace-nowrap text-slate-600">{v.data_pedido || '-'}</td>
                    <td className="px-3 py-1 text-[10px] uppercase text-slate-500">{v.conta_omie || '-'}</td>
                    <td className="px-3 py-1 truncate max-w-[220px]" title={v.nome_cliente || ''}>{v.nome_cliente || '-'}</td>
                    <td className="px-3 py-1 truncate max-w-[260px] text-slate-600" title={v.descricao || ''}>{v.descricao || '-'}</td>
                    <td className="px-3 py-1 text-right">{fmtN(v.quantidade)}</td>
                    {showCmc && (
                      <td className="px-3 py-1 text-right text-slate-600">
                        {v.cmc_unitario ? fmtBRL(v.cmc_unitario) : <span className="text-slate-300">-</span>}
                      </td>
                    )}
                    <td className="px-3 py-1 text-right font-semibold text-emerald-700">{fmtBRL(v.valor_total)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs flex justify-between items-center">
          <span className="text-slate-500">{infoTxt}</span>
          <span className="font-bold text-slate-800">{totalTxt}</span>
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// CSS da grade anual (port fiel do bloco <style> da fonte). Injetado via
// styled-jsx para ficar escopado a esta tela (as classes vm-grid-* sao usadas
// nos nodes acima, montados sem Tailwind para bater pixel-a-pixel com a fonte).
// ===========================================================================
function GradeStyles() {
  return (
    <style jsx global>{`
      .vm-grid-ano-label{font-size:1.1rem;font-weight:800;color:#0f172a;padding:10px 6px 4px;letter-spacing:0.5px}
      .vm-grid-ano-row{display:grid;grid-template-columns:repeat(12,1fr) 1.45fr;gap:4px;margin-bottom:14px;padding:6px;border-radius:8px}
      .vm-grid-ano-row.vm-tint-0{background:#ffeef0}
      .vm-grid-ano-row.vm-tint-1{background:#fff3e0}
      .vm-grid-ano-row.vm-tint-2{background:#e0f2f1}
      .vm-grid-ano-row.vm-tint-3{background:#e3f2fd}
      .vm-grid-ano-row.vm-tint-4{background:#f3e5f5}
      .vm-grid-ano-row.vm-tint-5{background:#fff8e1}
      .vm-grid-item{text-align:center;padding:6px 3px;background:rgba(255,255,255,0.88);border-radius:6px;cursor:default;display:flex;flex-direction:column;min-width:0}
      .vm-grid-item-placeholder{background:rgba(244,244,246,0.55);opacity:0.55}
      .vm-grid-label{font-size:0.82rem;color:#475569;text-transform:uppercase;margin-bottom:4px;line-height:1.1;font-weight:800;letter-spacing:0.5px}
      .vm-grid-cols{display:flex;align-items:stretch;gap:1px;margin-bottom:4px}
      .vmcol{flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center}
      .vmcol-bar{height:34px;width:100%;display:flex;align-items:flex-end;justify-content:center;padding:0 1px}
      .vmcol-bar .mbar{width:100%;min-height:2px;border-radius:2px 2px 0 0;transition:height 0.3s}
      .vmcol-val{font-size:0.74rem;font-weight:800;line-height:1.1;padding:2px 0 0;text-align:center;width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;letter-spacing:-0.5px}
      .vmcol-dash{color:#cbd5e1;font-weight:400}
      .vm-grid-cell-total{font-size:0.7rem;color:#475569;text-align:center;padding-top:3px;border-top:1px dashed #cbd5e1;margin-top:4px;font-weight:600}
      .vm-grid-cell-total strong{color:#0f172a;font-size:0.82rem;font-weight:800}
      .vm-grid-proj{font-size:0.68rem;color:#2563eb;font-weight:700;margin-top:2px;text-align:center}
      .vm-grid-total{font-weight:800;background:rgba(15,23,42,0.06)}
      .vm-grid-total-label{font-size:0.72rem;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:5px;font-weight:800;text-align:center}
      .vm-grid-total-list{display:flex;flex-direction:column;gap:2px;line-height:1.15}
      .trow{display:flex;justify-content:space-between;align-items:baseline;gap:4px;font-size:0.72rem;font-weight:700}
      .trow .tname{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:left}
      .trow .tqty{flex:0 0 auto;font-variant-numeric:tabular-nums}
      .trow.ttot{padding-top:4px;margin-top:4px;border-top:1px solid #64748b;color:#0f172a;font-size:0.82rem;font-weight:800}
      .vm-clickable{cursor:pointer}
      .vm-clickable:hover .vmcol-bar .mbar{opacity:0.85}
      .vm-clickable:hover .vmcol-val{text-decoration:underline}
      .vm-grid-mes-atual{outline:2px solid #0f172a;outline-offset:-2px;background:#ffffff}
      .vm-grid-legenda{display:flex;gap:10px;padding:8px 4px 10px;flex-wrap:wrap;font-size:0.78rem}
      .vm-grid-legenda-item{display:flex;align-items:center;gap:6px;color:#334155;font-weight:600;cursor:pointer;transition:opacity 0.15s;padding:2px 6px;border-radius:4px}
      .vm-grid-legenda-item:hover{background:rgba(15,23,42,0.06)}
      .vm-grid-legenda-item.faded{opacity:0.32}
      .vm-grid-legenda-dot{width:12px;height:12px;border-radius:3px;flex-shrink:0}
      .vm-grid-trim{grid-column:span 3;text-align:center;padding:6px 4px;background:rgba(255,255,255,0.7);border:1px dashed rgba(15,23,42,0.22);border-radius:6px;display:flex;flex-direction:column;min-width:0}
      .vm-grid-trim-placeholder{background:rgba(244,244,246,0.45);opacity:0.55;border-color:rgba(15,23,42,0.12)}
      .vm-grid-trim-filler{grid-column:span 1;background:transparent;border:none}
      .vm-grid-trim .vm-grid-label{color:#1e293b}
    `}</style>
  )
}
