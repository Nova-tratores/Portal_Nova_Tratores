'use client'
// =============================================================================
// Tela Rentabilidade (port FIEL de views/rentabilidade.ejs do financeiro-omie-dashboard).
//
// A fonte e um "shell" com duas abas que, no Express, carregavam o conteudo via
// <iframe> apontando para /margens?embed=1 (aba "Margens por venda") e
// /lucratividade?embed=1 (aba "Capital parado"). Como o portal nao usa iframe,
// portamos o CONTEUDO INTEGRAL das duas views embarcadas como dois paineis React
// renderizados conforme a aba ativa — preservando textos, colunas, cores, KPIs,
// graficos e o comportamento exatamente como o original.
//
//   Aba "Margens por venda"  -> port fiel de views/margens.ejs
//        consome  GET /api/dre-financeiro/margens
//   Aba "Capital parado"     -> port fiel de views/lucratividade.ejs
//        consome  GET /api/dre-financeiro/lucratividade/capital-parado
//                 GET /api/dre-financeiro/lucratividade/margem
//
// A aba inicial vem de ?tab=capital|margens (default 'margens'), igual ao server.js
// (req.query.tab === 'capital' ? 'capital' : 'margens'); ao trocar de aba o ?tab e
// atualizado via history.replaceState, espelhando o setTab() da fonte.
//
// Chart.js 4.4.0 + chartjs-plugin-datalabels 2.2.0 sao carregados via CDN (mesmas
// versoes da fonte) num <script> dinamico; os graficos usam refs/canvas imperativos.
// Tabelas/linhas/modal montados via innerHTML na fonte sao reproduzidos FIEL e
// injetados com dangerouslySetInnerHTML, com delegacao de cliques (igual patrimonio).
//
// O layout do modulo (.../dre-financeiro/layout.js) ja aplica o gate de permissao
// 'financeiro', a sub-nav e o seletor de conta; ainda assim importamos useAuth/
// usePermissoes e SemPermissao por consistencia com o padrao do portal. A conta
// selecionada vem de useDreConta (cookie compartilhado) e monta as URLs das APIs.
// =============================================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta } from '@/lib/dre-financeiro/format'

// ---------------------------------------------------------------------------
// Formatadores locais (identicos aos <script> das fontes margens/lucratividade).
// Mantidos inline para preservar EXATAMENTE o arredondamento dos KPIs/labels/
// graficos. A fonte usa fmtBRLcurto com "k" SEM casas decimais (toFixed(0)),
// que difere do helper global formatBRLcurto do portal — por isso replicamos.
// ---------------------------------------------------------------------------
function fmtBRL(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0)
}
function fmtBRLcurto(n) {
  const v = Number(n) || 0
  const s = v < 0 ? '-' : ''
  const a = Math.abs(v)
  if (a >= 1000000) return s + 'R$ ' + (a / 1000000).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1000) return s + 'R$ ' + (a / 1000).toFixed(0) + 'k'
  return s + 'R$ ' + a.toFixed(0)
}

// ---------------------------------------------------------------------------
// Carregamento de Chart.js 4.4.0 + chartjs-plugin-datalabels 2.2.0 via CDN
// (mesmas versoes da fonte), uma unica vez. O plugin datalabels e usado no
// grafico de evolucao mensal das margens (registrado por-grafico, como na fonte).
// ---------------------------------------------------------------------------
let chartLibPromise = null
function carregarLib(src) {
  return new Promise((resolve, reject) => {
    const existente = document.querySelector('script[src="' + src + '"]')
    if (existente) {
      if (existente.dataset.loaded) { resolve(); return }
      existente.addEventListener('load', resolve)
      existente.addEventListener('error', reject)
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => { s.dataset.loaded = '1'; resolve() }
    s.onerror = reject
    document.head.appendChild(s)
  })
}
function carregarChartLibs() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.Chart && window.ChartDataLabels) return Promise.resolve()
  if (chartLibPromise) return chartLibPromise
  chartLibPromise = carregarLib('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js')
    .then(() => carregarLib('https://cdn.jsdelivr.net/npm/chartjs-plugin-datalabels@2.2.0/dist/chartjs-plugin-datalabels.min.js'))
  return chartLibPromise
}

export default function RentabilidadePage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  // Aba ativa: inicial vem de ?tab=capital|margens (default 'margens'), como no server.
  const [tab, setTab] = useState('margens')
  const [chartReady, setChartReady] = useState(false)

  // Le a aba inicial da URL (igual server.js: tab === 'capital' ? 'capital' : 'margens').
  useEffect(() => {
    if (typeof window === 'undefined') return
    const t = new URL(window.location.href).searchParams.get('tab')
    setTab(t === 'capital' ? 'capital' : 'margens')
  }, [])

  // Carrega Chart.js + datalabels uma vez.
  useEffect(() => {
    carregarChartLibs().then(() => setChartReady(true)).catch(() => setChartReady(false))
  }, [])

  // setTab(t): troca aba e atualiza ?tab na URL (port fiel do setTab da fonte).
  function selecionarTab(t) {
    setTab(t)
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href)
      u.searchParams.set('tab', t)
      window.history.replaceState({}, '', u.toString())
    }
  }

  // --- Gate de permissao (BRIEF item 1) -------------------------------------
  if (!loading && !loadingPerm && userProfile && !temAcesso('financeiro')) return <SemPermissao />

  const ativo = 'bg-slate-800 text-white'
  const inativo = 'bg-white text-slate-700 hover:bg-slate-100'

  return (
    <div>
      {/* Cabecalho + abas (port fiel do shell de rentabilidade.ejs) */}
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Rentabilidade</h1>
          <p className="text-xs text-slate-500">Margem real por venda + custo de capital parado em estoque</p>
        </div>
        <div className="inline-flex rounded border border-slate-300 overflow-hidden text-sm">
          <button
            id="tab-margens"
            onClick={() => selecionarTab('margens')}
            className={'px-4 py-1.5 transition ' + (tab === 'margens' ? ativo : inativo)}
          >
            Margens por venda
          </button>
          <button
            id="tab-capital"
            onClick={() => selecionarTab('capital')}
            className={'px-4 py-1.5 transition border-l border-slate-300 ' + (tab === 'capital' ? ativo : inativo)}
          >
            Capital parado
          </button>
        </div>
      </div>

      {/* Conteudo embarcado: no original era um <iframe>; aqui renderizamos o
          conteudo das views diretamente, conforme a aba ativa. */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden p-4" style={{ minHeight: '70vh' }}>
        {tab === 'margens'
          ? <PainelMargens conta={conta} chartReady={chartReady} />
          : <PainelCapital conta={conta} chartReady={chartReady} />}
      </div>
    </div>
  )
}

// =============================================================================
// PAINEL "MARGENS POR VENDA" — port fiel de views/margens.ejs (modo embed).
// =============================================================================
function PainelMargens({ conta, chartReady }) {
  // Estado equivalente as variaveis do IIFE da fonte.
  const todos = useRef([])               // todos os itens retornados pela API
  const listaRenderizada = useRef([])    // lista filtrada+ordenada da pagina atual
  const ordem = useRef({ campo: 'margem_pct', dir: 'asc' })
  const POR_PAG = 50

  const [pagina, setPagina] = useState(1)
  const [render0, setRender0] = useState(0) // tick para forcar re-render apos mutar refs

  // Controles do topo
  const [meses, setMeses] = useState('12')
  const [desde, setDesde] = useState('2023-01')
  const [taxa, setTaxa] = useState('1.00')

  // Filtros
  const [fFamilia, setFFamilia] = useState('')
  const [fBusca, setFBusca] = useState('')
  const [fMargem, setFMargem] = useState('')
  const [familias, setFamilias] = useState([])

  // KPIs (texto + classe de cor, como setText(id,val,classes))
  const [kpiQtd, setKpiQtd] = useState('--')
  const [kpiQtdSub, setKpiQtdSub] = useState('itens vendidos')
  const [kpiRec, setKpiRec] = useState('--')
  const [kpiCusto, setKpiCusto] = useState('--')
  const [kpiCustoSub, setKpiCustoSub] = useState('custo real')
  const [kpiLucro, setKpiLucro] = useState('--')
  const [kpiMargPct, setKpiMargPct] = useState({ txt: '--', cls: 'text-xs' })
  const [kpiNeg, setKpiNeg] = useState('--')
  const [kpiNegSub, setKpiNegSub] = useState('margem <= 0')
  const [avisoCmc, setAvisoCmc] = useState(null) // HTML ou null (escondido)

  // Modal detalhe da venda
  const [modalAberto, setModalAberto] = useState(false)
  const [modalTitulo, setModalTitulo] = useState('Detalhe da Venda')
  const [modalHtml, setModalHtml] = useState('')

  // Refs do grafico mensal
  const graficoBoxRef = useRef(null)      // container (hidden quando sem familia)
  const chartCanvasRef = useRef(null)
  const chartMensal = useRef(null)
  const [graficoVisivel, setGraficoVisivel] = useState(false)
  const [graficoFam, setGraficoFam] = useState('')
  const [graficoInfo, setGraficoInfo] = useState('')

  // carregar(): GET /api/dre-financeiro/margens — port fiel de carregar().
  const carregar = useCallback(() => {
    let qs = 'conta=' + conta + '&taxa=' + taxa
    if (meses === '__desde__') qs += '&desde=' + desde
    else qs += '&meses=' + meses
    fetch('/api/dre-financeiro/margens?' + qs).then((r) => r.json()).then((d) => {
      if (d.erro) { alert('Erro: ' + d.erro); return }
      todos.current = d.itens || []
      const t = d.totais
      const fams = d.familias || []

      setKpiQtd(String(t.qtd))
      setKpiQtdSub(d.meses + ' meses ' + (d.desde ? '(desde ' + d.desde + ')' : ''))
      setKpiRec(fmtBRL(t.receita))
      setKpiCusto(fmtBRL(t.custo_total))
      setKpiCustoSub('CMV ' + fmtBRLcurto(t.cmv) + ' + Capital ' + fmtBRLcurto(t.capital_total))
      setKpiLucro(fmtBRL(t.lucro))
      const corM = t.margem_pct >= 30 ? 'text-emerald-700' : (t.margem_pct >= 15 ? 'text-blue-700' : (t.margem_pct >= 0 ? 'text-amber-700' : 'text-red-700'))
      setKpiMargPct({ txt: t.margem_pct + '% medio', cls: 'text-xs ' + corM })
      const negs = todos.current.filter((it) => it.margem_real <= 0)
      setKpiNeg(String(negs.length))
      const valorNeg = negs.reduce((s, it) => s + it.receita, 0)
      const valorPrej = negs.reduce((s, it) => s + Math.abs(it.margem_real), 0)
      setKpiNegSub(fmtBRLcurto(valorNeg) + ' em receita · ' + fmtBRLcurto(valorPrej) + ' de prejuizo')

      // Aviso CMC
      if (t.qtd_sem_cmc > 0) {
        const pct = t.qtd > 0 ? (100 * t.qtd_sem_cmc / t.qtd).toFixed(0) : 0
        setAvisoCmc('⚠ <b>' + t.qtd_sem_cmc + ' vendas (' + pct + '%) sem CMC unitario registrado.</b> '
          + 'Para essas, CMV = 0 (margem aparece como 100%, mas e artificial). '
          + 'Cobertura CMC: ' + t.cobertura_cmc_pct + '%.')
      } else { setAvisoCmc(null) }

      setFamilias(fams)
      setPagina(1)
      setRender0((x) => x + 1)
    })
  }, [conta, taxa, meses, desde])

  // Carrega na montagem e quando conta muda (a fonte chama carregar() no fim do IIFE).
  useEffect(() => { carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [conta])

  // --- Funcoes de filtro/ordenacao (port fiel) ------------------------------
  function ehPeca(fam) {
    return /^pe[çc]/i.test(String(fam || '').normalize('NFD').replace(/[̀-ͯ]/g, ''))
  }
  function filtrados() {
    const fam = fFamilia
    const busca = fBusca.trim().toLowerCase()
    const faixa = fMargem
    return todos.current.filter((it) => {
      if (fam === '__TODAS_MAQUINAS__') { if (ehPeca(it.familia)) return false }
      else if (fam === '__SO_PECAS__') { if (!ehPeca(it.familia)) return false }
      else if (fam && it.familia !== fam) return false
      if (busca && !(String(it.codigo_produto).toLowerCase().includes(busca)
        || (it.descricao || '').toLowerCase().includes(busca)
        || (it.cliente || '').toLowerCase().includes(busca)
        || (it.vendedor || '').toLowerCase().includes(busca))) return false
      if (faixa === 'neg' && it.margem_pct > 0) return false
      if (faixa === 'baixa' && (it.margem_pct < 0 || it.margem_pct > 15)) return false
      if (faixa === 'media' && (it.margem_pct <= 15 || it.margem_pct > 30)) return false
      if (faixa === 'alta' && it.margem_pct <= 30) return false
      return true
    })
  }
  function ordenados(arr) {
    const c = ordem.current.campo, dir = ordem.current.dir === 'asc' ? 1 : -1
    return arr.slice().sort((a, b) => {
      let va = a[c], vb = b[c]
      if (va === null || va === undefined) va = -Infinity
      if (vb === null || vb === undefined) vb = -Infinity
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * dir
    })
  }

  // Lista calculada para render (filtrada+ordenada) — recalcula quando muda algo.
  const lista = ordenados(filtrados())
  listaRenderizada.current = lista
  const totPag = Math.max(1, Math.ceil(lista.length / POR_PAG))
  const paginaAtual = pagina > totPag ? 1 : pagina
  const slice = lista.slice((paginaAtual - 1) * POR_PAG, paginaAtual * POR_PAG)

  // --- Tabela (innerHTML fiel ao render() da fonte) -------------------------
  let tbodyHtml = ''
  slice.forEach((it, idx) => {
    const corMg = it.margem_pct >= 30 ? 'text-emerald-700' : (it.margem_pct >= 15 ? 'text-blue-700' : (it.margem_pct >= 0 ? 'text-amber-700' : 'text-red-700'))
    const rowCor = it.margem_real < 0 ? 'bg-red-50' : (it.sem_cmc ? 'bg-amber-50' : '')
    const idxAbs = (paginaAtual - 1) * POR_PAG + idx
    tbodyHtml += '<tr class="border-b border-slate-100 hover:bg-slate-100 cursor-pointer ' + rowCor + '" data-venda-idx="' + idxAbs + '">'
    tbodyHtml += '<td class="px-3 py-1.5 text-slate-600 whitespace-nowrap">' + (it.data_pedido || '-') + '</td>'
    tbodyHtml += '<td class="px-3 py-1.5 font-mono text-[10px] text-slate-600">' + it.codigo_produto + '</td>'
    tbodyHtml += '<td class="px-3 py-1.5 truncate max-w-[240px]" title="' + (it.descricao || '') + '">' + (it.descricao || '(sem)') + '</td>'
    tbodyHtml += '<td class="px-3 py-1.5 text-slate-600 text-[11px]">' + it.familia + '</td>'
    tbodyHtml += '<td class="px-3 py-1.5 font-mono text-[11px] text-slate-700">' + (it.pedido || '-') + '</td>'
    tbodyHtml += '<td class="px-3 py-1.5 text-right">' + it.quantidade.toFixed(0) + '</td>'
    tbodyHtml += '<td class="px-3 py-1.5 text-right text-slate-500">' + (it.dias_estoque || '-') + '</td>'
    tbodyHtml += '<td class="px-3 py-1.5 text-right">' + fmtBRL(it.receita) + '</td>'
    tbodyHtml += '<td class="px-3 py-1.5 text-right text-slate-600">' + (it.sem_cmc ? '<span class="text-amber-700">s/ CMC</span>' : fmtBRL(it.cmv)) + '</td>'
    tbodyHtml += '<td class="px-3 py-1.5 text-right text-amber-700">' + fmtBRL(it.custo_capital) + '</td>'
    tbodyHtml += '<td class="px-3 py-1.5 text-right font-medium ' + corMg + '">' + fmtBRL(it.margem_real) + '</td>'
    tbodyHtml += '<td class="px-3 py-1.5 text-right font-bold ' + corMg + '">' + it.margem_pct.toFixed(1) + '%</td>'
    tbodyHtml += '</tr>'
  })
  if (!slice.length) tbodyHtml = '<tr><td colspan="12" class="px-3 py-6 text-center text-slate-500">Nenhuma venda no filtro.</td></tr>'

  // Indicadores de ordenacao no thead (port fiel).
  function indicador(campo) {
    if (campo === ordem.current.campo) return { txt: ordem.current.dir === 'asc' ? '▲' : '▼', cls: 'ind text-slate-700' }
    return { txt: '⇅', cls: 'ind text-slate-300' }
  }
  function ordenarPor(c) {
    if (ordem.current.campo === c) ordem.current.dir = ordem.current.dir === 'asc' ? 'desc' : 'asc'
    else { ordem.current.campo = c; ordem.current.dir = (['receita', 'quantidade', 'cmv', 'custo_capital', 'margem_real', 'margem_pct', 'dias_estoque', 'data_pedido'].includes(c)) ? 'desc' : 'asc' }
    setRender0((x) => x + 1)
  }
  function paginarMg(delta) {
    setPagina((p) => Math.max(1, Math.min(totPag, p + delta)))
  }

  // --- Grafico de margem mensal (port fiel de renderGraficoMensal) ----------
  useEffect(() => {
    const fam = fFamilia
    if (!fam) {
      setGraficoVisivel(false)
      if (chartMensal.current) { chartMensal.current.destroy(); chartMensal.current = null }
      return
    }
    setGraficoVisivel(true)
    const label = fam === '__TODAS_MAQUINAS__' ? 'Todas as maquinas'
      : fam === '__SO_PECAS__' ? 'So pecas'
        : fam
    setGraficoFam(label)

    // Agrega por mes
    const porMes = {}
    lista.forEach((it) => {
      const k = it.ano + '-' + String(it.mes).padStart(2, '0')
      if (!porMes[k]) porMes[k] = { rotulo: k, receita: 0, cmv: 0, capital: 0, lucro: 0, qtd: 0 }
      porMes[k].receita += it.receita
      porMes[k].cmv += it.cmv
      porMes[k].capital += it.custo_capital
      porMes[k].lucro += it.margem_real
      porMes[k].qtd += 1
    })
    const arr = Object.values(porMes).sort((a, b) => a.rotulo.localeCompare(b.rotulo))
    arr.forEach((m) => { m.margem_pct = m.receita > 0 ? +((m.lucro / m.receita) * 100).toFixed(1) : 0 })

    setGraficoInfo(arr.length + ' meses · ' + lista.length + ' vendas no filtro')

    if (!chartReady || !window.Chart || !chartCanvasRef.current) return
    if (chartMensal.current) chartMensal.current.destroy()
    chartMensal.current = new window.Chart(chartCanvasRef.current.getContext('2d'), {
      data: {
        labels: arr.map((m) => m.rotulo),
        datasets: [
          {
            type: 'bar', label: 'Receita', data: arr.map((m) => m.receita), backgroundColor: 'rgba(16,185,129,0.7)', borderColor: '#059669', yAxisID: 'y',
            datalabels: { display: false },
          },
          {
            type: 'bar', label: 'CMV+Capital', data: arr.map((m) => m.cmv + m.capital), backgroundColor: 'rgba(239,68,68,0.7)', borderColor: '#dc2626', yAxisID: 'y',
            datalabels: { display: false },
          },
          {
            type: 'line', label: 'Margem %', data: arr.map((m) => m.margem_pct), borderColor: '#1e293b', backgroundColor: '#ffffff', borderWidth: 2, pointRadius: 8, pointHoverRadius: 10, pointBackgroundColor: '#ffffff', pointBorderColor: '#1e293b', pointBorderWidth: 2, tension: 0.2, yAxisID: 'y1',
            datalabels: {
              display: true,
              align: 'center',
              anchor: 'center',
              color: '#1e293b',
              font: { weight: 'bold', size: 9 },
              formatter: function (v) { return Math.round(v) + '%' },
            },
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: { position: 'left', title: { display: true, text: 'R$' }, ticks: { callback: function (v) { return fmtBRLcurto(v) } } },
          y1: { position: 'right', title: { display: true, text: 'Margem %' }, grid: { drawOnChartArea: false }, ticks: { callback: function (v) { return v + '%' } } },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function (item) {
                if (item.dataset.label === 'Margem %') return 'Margem ' + item.raw + '%'
                return item.dataset.label + ': ' + fmtBRL(item.raw)
              },
            },
          },
        },
      },
      plugins: [window.ChartDataLabels],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, fFamilia, fBusca, fMargem, paginaAtual, render0])

  // --- Modal detalhe da venda (port fiel de abrirDetalheVenda) --------------
  function abrirDetalheVenda(idx) {
    const it = listaRenderizada.current[idx]
    if (!it) return
    setModalTitulo('Venda · Pedido ' + (it.pedido || '?'))
    const corMg = it.margem_pct >= 30 ? 'text-emerald-700' : (it.margem_pct >= 15 ? 'text-blue-700' : (it.margem_pct >= 0 ? 'text-amber-700' : 'text-red-700'))
    let html = ''
    html += '<div class="grid grid-cols-3 gap-3 mb-4">'
    html += '<div class="bg-emerald-50 border border-emerald-200 rounded p-3"><div class="text-[10px] uppercase text-emerald-800">Receita</div><div class="text-lg font-bold text-emerald-900 mt-0.5">' + fmtBRL(it.receita) + '</div></div>'
    html += '<div class="bg-red-50 border border-red-200 rounded p-3"><div class="text-[10px] uppercase text-red-800">Custo (CMV+Capital)</div><div class="text-lg font-bold text-red-900 mt-0.5">' + fmtBRL(it.custo_total) + '</div></div>'
    html += '<div class="bg-slate-50 border border-slate-200 rounded p-3"><div class="text-[10px] uppercase text-slate-700">Margem</div><div class="text-lg font-bold mt-0.5 ' + corMg + '">' + fmtBRL(it.margem_real) + ' <span class="text-xs">(' + it.margem_pct.toFixed(1) + '%)</span></div></div>'
    html += '</div>'

    html += '<div class="border border-slate-200 rounded p-3 mb-3">'
    html += '<div class="text-xs text-slate-500 uppercase tracking-wide mb-2">Produto</div>'
    html += '<div class="text-sm font-medium text-slate-800">' + (it.descricao || '(sem descricao)') + '</div>'
    html += '<div class="text-xs text-slate-500 mt-1">Codigo: <span class="font-mono">' + it.codigo_produto + '</span> · Familia: ' + it.familia + '</div>'
    html += '</div>'

    html += '<div class="grid grid-cols-2 gap-3 mb-3">'
    html += '<div class="border border-slate-200 rounded p-3">'
    html += '<div class="text-xs text-slate-500 uppercase tracking-wide mb-1">Comercial</div>'
    html += '<div class="text-xs"><b>Pedido/NF:</b> ' + (it.pedido || '-') + '</div>'
    html += '<div class="text-xs"><b>Data:</b> ' + (it.data_pedido || '-') + '</div>'
    html += '<div class="text-xs"><b>Cliente:</b> ' + (it.cliente || '-') + '</div>'
    html += '<div class="text-xs"><b>Vendedor:</b> ' + (it.vendedor || '-') + '</div>'
    html += '</div>'
    html += '<div class="border border-slate-200 rounded p-3">'
    html += '<div class="text-xs text-slate-500 uppercase tracking-wide mb-1">Quantidades</div>'
    html += '<div class="text-xs"><b>Qty:</b> ' + it.quantidade + '</div>'
    html += '<div class="text-xs"><b>Preco unit:</b> ' + fmtBRL(it.valor_unitario) + '</div>'
    html += '<div class="text-xs"><b>CMC unit:</b> ' + (it.sem_cmc ? '<span class="text-amber-700">nao registrado</span>' : fmtBRL(it.cmc_unitario)) + '</div>'
    html += '<div class="text-xs"><b>Dias em estoque:</b> ' + (it.dias_estoque || '-') + (it.dias_estoque ? ' dias' : '') + '</div>'
    html += '</div>'
    html += '</div>'

    html += '<div class="border border-slate-200 rounded p-3 bg-slate-50">'
    html += '<div class="text-xs text-slate-500 uppercase tracking-wide mb-2">Decomposicao do custo</div>'
    html += '<div class="flex justify-between py-1 text-sm"><span>Receita</span><span class="font-medium text-emerald-700">' + fmtBRL(it.receita) + '</span></div>'
    html += '<div class="flex justify-between py-1 text-sm"><span>− CMV (cmc × qty)</span><span class="font-medium text-red-700">−' + fmtBRL(it.cmv) + '</span></div>'
    html += '<div class="flex justify-between py-1 text-sm"><span>− Capital empatado (' + (it.dias_estoque || 0) + 'd × SELIC)</span><span class="font-medium text-amber-700">−' + fmtBRL(it.custo_capital) + '</span></div>'
    html += '<div class="flex justify-between py-1 text-base border-t border-slate-300 mt-1 pt-2"><span class="font-semibold">= Lucro real</span><span class="font-bold ' + corMg + '">' + fmtBRL(it.margem_real) + ' (' + it.margem_pct.toFixed(1) + '%)</span></div>'
    html += '</div>'

    if (it.margem_real < 0) {
      html += '<div class="mt-3 bg-red-50 border border-red-200 rounded p-3 text-xs text-red-800">'
      html += '<b>⚠ Venda com prejuizo:</b> o custo total (CMV + capital empatado) superou a receita. '
      if (it.dias_estoque > 365) html += 'Produto parou ' + it.dias_estoque + ' dias antes da venda - capital corroeu margem.'
      else if (it.cmv > it.receita) html += 'CMV maior que receita - possivel erro de preco cadastrado.'
      html += '</div>'
    }

    setModalHtml(html)
    setModalAberto(true)
  }
  function fecharDetalheVenda() { setModalAberto(false) }

  // Esc fecha o modal (port fiel do keydown).
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setModalAberto(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Delegacao de clique nas linhas da tabela (data-venda-idx -> abrirDetalheVenda).
  function onTbodyClick(ev) {
    const tr = ev.target.closest('[data-venda-idx]')
    if (tr) abrirDetalheVenda(parseInt(tr.getAttribute('data-venda-idx'), 10))
  }

  const cols = [
    { sort: 'data_pedido', label: 'Data', align: 'left' },
    { sort: 'codigo_produto', label: 'Cod', align: 'left' },
    { sort: 'descricao', label: 'Produto', align: 'left' },
    { sort: 'familia', label: 'Familia', align: 'left' },
    { sort: 'pedido', label: 'Pedido/NF', align: 'left' },
    { sort: 'quantidade', label: 'Qty', align: 'right' },
    { sort: 'dias_estoque', label: 'Dias estoque', align: 'right' },
    { sort: 'receita', label: 'Receita', align: 'right' },
    { sort: 'cmv', label: 'CMV', align: 'right' },
    { sort: 'custo_capital', label: 'Capital', align: 'right' },
    { sort: 'margem_real', label: 'Lucro', align: 'right' },
    { sort: 'margem_pct', label: 'Margem %', align: 'right' },
  ]

  return (
    <div>
      {/* Cabecalho do painel + controles de periodo/SELIC */}
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Margens de Vendas</h1>
          <p className="text-xs text-slate-500">Margem real por venda historica: Receita − (CMV + Capital empatado ate a venda)</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <label>Periodo:</label>
          <select value={meses} onChange={(e) => setMeses(e.target.value)} className="border border-slate-300 rounded px-2 py-1">
            <option value="1">1 mes</option>
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
            className={'border border-slate-300 rounded px-2 py-1 ' + (meses === '__desde__' ? '' : 'hidden')}
          />
          <label className="ml-2">SELIC %/mes:</label>
          <input
            type="number" step="0.05" value={taxa}
            onChange={(e) => setTaxa(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') carregar() }}
            className="border border-slate-300 rounded px-2 py-1 w-16"
          />
          <button onClick={carregar} className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Aplicar</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Vendas</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{kpiQtd}</div>
          <div className="text-xs text-slate-500">{kpiQtdSub}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Receita total</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{kpiRec}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">CMV + Capital</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{kpiCusto}</div>
          <div className="text-xs text-slate-500">{kpiCustoSub}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Lucro</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{kpiLucro}</div>
          <div className={kpiMargPct.cls}>{kpiMargPct.txt}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Vendas com prejuizo</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{kpiNeg}</div>
          <div className="text-xs text-slate-500">{kpiNegSub}</div>
        </div>
      </div>

      {/* Aviso CMC */}
      {avisoCmc && (
        <div
          className="mb-3 bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900"
          dangerouslySetInnerHTML={{ __html: avisoCmc }}
        />
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-3 flex-wrap text-sm">
        <label className="text-xs text-slate-500">Familia:</label>
        <select value={fFamilia} onChange={(e) => { setFFamilia(e.target.value); setPagina(1) }} className="border border-slate-300 rounded px-2 py-1 bg-white">
          <option value="">Todas</option>
          <option value="__TODAS_MAQUINAS__">⚙ Todas as maquinas</option>
          <option value="__SO_PECAS__">🔩 So pecas</option>
          <option disabled>──────────</option>
          {familias.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <label className="text-xs text-slate-500 ml-2">Busca:</label>
        <input
          type="text" placeholder="codigo, descricao, cliente, vendedor..."
          value={fBusca}
          onChange={(e) => { setFBusca(e.target.value); setPagina(1) }}
          className="border border-slate-300 rounded px-2 py-1 w-72"
        />
        <label className="text-xs text-slate-500 ml-2">Margem:</label>
        <select value={fMargem} onChange={(e) => { setFMargem(e.target.value); setPagina(1) }} className="border border-slate-300 rounded px-2 py-1 bg-white">
          <option value="">Todas</option>
          <option value="neg">Prejuizo (≤ 0%)</option>
          <option value="baixa">0% a 15%</option>
          <option value="media">15% a 30%</option>
          <option value="alta">&gt; 30%</option>
        </select>
        <span className="text-xs text-slate-500 ml-2">Mostrando <span>{lista.length}</span> de <span>{todos.current.length}</span></span>
      </div>

      {/* Tabela */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 select-none">
              <tr>
                {cols.map((c) => {
                  const ind = indicador(c.sort)
                  return (
                    <th
                      key={c.sort}
                      onClick={() => ordenarPor(c.sort)}
                      className={'text-' + c.align + ' px-3 py-2 cursor-pointer hover:bg-slate-100'}
                    >
                      {c.label} <span className={ind.cls}>{ind.txt}</span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody onClick={onTbodyClick} dangerouslySetInnerHTML={{ __html: tbodyHtml }} />
          </table>
        </div>
        <div className="px-3 py-2 border-t border-slate-200 text-xs text-slate-600 flex items-center gap-3">
          <button
            onClick={() => paginarMg(-1)}
            className={'px-2 py-0.5 border border-slate-300 rounded ' + (paginaAtual > 1 ? 'hover:bg-slate-100' : 'opacity-50 cursor-not-allowed')}
          >← Ant</button>
          <span>Pagina <b>{paginaAtual}</b> de <b>{totPag}</b> ({lista.length} vendas)</span>
          <button
            onClick={() => paginarMg(1)}
            className={'px-2 py-0.5 border border-slate-300 rounded ' + (paginaAtual < totPag ? 'hover:bg-slate-100' : 'opacity-50 cursor-not-allowed')}
          >Prox →</button>
        </div>
      </div>

      {/* Grafico de margem mensal (aparece quando ha filtro de familia) */}
      <div ref={graficoBoxRef} className={'bg-white border border-slate-200 rounded-lg p-4 mt-4 ' + (graficoVisivel ? '' : 'hidden')}>
        <div className="flex items-baseline justify-between mb-2">
          <div>
            <div className="text-xs text-slate-500 uppercase tracking-wide">Evolucao mensal — <span className="text-slate-800 font-semibold normal-case">{graficoFam}</span></div>
            <div className="text-[11px] text-slate-500">{graficoInfo}</div>
          </div>
        </div>
        <div style={{ position: 'relative', height: '300px' }}><canvas ref={chartCanvasRef} /></div>
      </div>

      {/* Modal detalhe da venda */}
      {modalAberto && <div className="fixed inset-0 bg-black/40 z-40" onClick={fecharDetalheVenda} />}
      <div className={'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[85vh] bg-white rounded-lg shadow-2xl z-50 flex-col ' + (modalAberto ? 'flex' : 'hidden')}>
        <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">{modalTitulo}</h2>
          <button onClick={fecharDetalheVenda} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">&times;</button>
        </div>
        <div className="p-5 overflow-y-auto" dangerouslySetInnerHTML={{ __html: modalHtml }} />
      </div>
    </div>
  )
}

// =============================================================================
// PAINEL "CAPITAL PARADO" — port fiel de views/lucratividade.ejs (modo embed).
// Inclui: Capital Parado em Estoque + Margem Bruta Operacional + Simulador
// what-if (futuro/retroativo).
// =============================================================================
function PainelCapital({ conta, chartReady }) {
  // Controles Capital parado
  const [cpFamilia, setCpFamilia] = useState('')
  const [familiasCp, setFamiliasCp] = useState([])
  const [diasParado, setDiasParado] = useState('180')
  const [selic, setSelic] = useState('1.00')

  // Card corrosao + KPIs Capital parado
  const [corrosaoTotal, setCorrosaoTotal] = useState('--')
  const [corrosaoSub, setCorrosaoSub] = useState('ja consumido pelo capital empatado no estoque (SELIC acumulada x valor x tempo parado)')
  const [corrosaoProj, setCorrosaoProj] = useState('--')
  const [cpValor, setCpValor] = useState('--')
  const [cpValorSub, setCpValorSub] = useState('--')
  const [cpCustoMes, setCpCustoMes] = useState('--')
  const [cpCustoAno, setCpCustoAno] = useState('por mes')
  const [cpQtd, setCpQtd] = useState('--')
  const [cpQtdSub, setCpQtdSub] = useState('de total')
  const [cpPct, setCpPct] = useState('--')
  const [cpTabelaHtml, setCpTabelaHtml] = useState('')

  // Controles Margem bruta
  const [mesesMargem, setMesesMargem] = useState('12')
  const [desdeMargem, setDesdeMargem] = useState('2023-01')
  const [granMargem, setGranMargem] = useState('mes')
  const [mgReceita, setMgReceita] = useState('--')
  const [mgCmv, setMgCmv] = useState('--')
  const [mgLucro, setMgLucro] = useState('--')
  const [mgPct, setMgPct] = useState({ txt: '--', cls: 'text-2xl font-bold mt-1' })
  const [mgCobertura, setMgCobertura] = useState('')
  const [mgFamiliasHtml, setMgFamiliasHtml] = useState('')

  // Simulador
  const [simModo, setSimModo] = useState('futuro') // 'futuro' | 'retroativo'
  const [simPctLiq, setSimPctLiq] = useState(50)
  const [simPctDesc, setSimPctDesc] = useState(30)
  const [simMeses, setSimMeses] = useState(12)
  const [simDataPassada, setSimDataPassada] = useState('2025-01')
  const [simPresetAtivo, setSimPresetAtivo] = useState(null)

  // Saidas calculadas do simulador
  const [simOut, setSimOut] = useState({
    caixa: '--', caixaSub: '', perda: '--', evitada: '--', evitadaSub: 'no horizonte',
    liquidoTitulo: 'Resultado liquido', liquido: '--', liquidoCls: 'text-3xl font-bold mt-1', liquidoSub: '',
    dataInfo: '', chartTitulo: 'Capital parado ao longo do tempo', modoInfo: 'Simulando o que aconteceria se voce liquidasse HOJE com horizonte de N meses adiante.',
  })

  // Dados/charts
  const simData = useRef(null) // ultimo retorno de /capital-parado
  const bucketsRef = useRef(null)
  const chartBuckets = useRef(null)
  const margemRef = useRef(null)
  const chartMargem = useRef(null)
  const simRef = useRef(null)
  const simChart = useRef(null)

  // carregarCapitalParado(): GET /api/dre-financeiro/lucratividade/capital-parado.
  const carregarCapitalParado = useCallback(() => {
    let dias = diasParado
    if (diasParado === '__desde_jan23__') {
      const inicio = new Date(2023, 0, 1)
      dias = Math.floor((new Date() - inicio) / 86400000)
    }
    const fam = cpFamilia
    fetch('/api/dre-financeiro/lucratividade/capital-parado?conta=' + conta + '&dias=' + dias + '&selic=' + selic + '&familia=' + encodeURIComponent(fam))
      .then((r) => r.json()).then((d) => {
        if (d.erro) { alert('Erro: ' + d.erro); return }
        setFamiliasCp(d.familias_disponiveis || [])
        const p = d.parado
        setCpValor(fmtBRL(p.valor))
        setCpValorSub('sem giro ha ' + d.parametros.dias_minimos + '+ dias')
        setCpCustoMes(fmtBRL(p.custo_oportunidade_mes))
        setCpCustoAno('ano: ' + fmtBRL(p.custo_oportunidade_ano) + ' (' + d.parametros.taxa_mensal_pct + '%/mes)')
        setCpQtd(String(p.qtd))
        setCpQtdSub('de ' + d.qtd_produtos + ' produtos')
        setCpPct(p.pct_do_total + '%')

        // Card destaque: corrosao silenciosa
        setCorrosaoTotal(fmtBRL(d.custo_capital_total || 0))
        setCorrosaoSub('ja consumido pelo capital empatado no estoque (SELIC acumulada x valor x tempo). '
          + 'No estoque parado (>= ' + d.parametros.dias_minimos + 'd): ' + fmtBRL(p.custo_capital_acumulado || 0))
        setCorrosaoProj(fmtBRL(p.custo_oportunidade_ano || 0))

        // Grafico buckets (Chart.js bar)
        if (chartReady && window.Chart && bucketsRef.current) {
          if (chartBuckets.current) chartBuckets.current.destroy()
          chartBuckets.current = new window.Chart(bucketsRef.current.getContext('2d'), {
            type: 'bar',
            data: {
              labels: d.buckets.map((b) => b.rotulo),
              datasets: [
                { label: 'Valor', data: d.buckets.map((b) => b.valor), backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#dc2626', '#991b1b', '#7c2d12', '#475569'], yAxisID: 'y' },
              ],
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: function (item) {
                      const b = d.buckets[item.dataIndex]
                      return [b.rotulo, fmtBRL(b.valor) + ' (' + b.qtd + ' produtos)']
                    },
                  },
                },
              },
              scales: { y: { ticks: { callback: function (v) { return fmtBRLcurto(v) } } } },
            },
          })
        }

        // Tabela top parados (innerHTML fiel)
        let html = ''
        d.top_parados.slice(0, 20).forEach((t) => {
          html += '<tr class="border-b border-slate-100">'
          html += '<td class="px-2 py-1 truncate max-w-[220px]" title="' + (t.descricao || '') + '">' + (t.descricao || '(sem nome)') + '</td>'
          html += '<td class="px-2 py-1 text-right">' + t.estoque_qty.toFixed(0) + '</td>'
          html += '<td class="px-2 py-1 text-right">' + (t.dias_sem_giro >= 99998 ? '∞' : t.dias_sem_giro) + '</td>'
          html += '<td class="px-2 py-1 text-right font-medium">' + fmtBRLcurto(t.valor_estoque) + '</td>'
          html += '<td class="px-2 py-1 text-right text-red-700">' + (t.custo_capital > 0 ? fmtBRLcurto(t.custo_capital) : '-') + '</td>'
          html += '</tr>'
        })
        if (!html) html = '<tr><td colspan="5" class="px-2 py-4 text-center text-slate-500">Sem produtos no criterio.</td></tr>'
        setCpTabelaHtml(html)

        // Atualiza simulador what-if com os dados atualizados
        simData.current = d
        recalcSim()
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, diasParado, selic, cpFamilia, chartReady])

  // carregarMargem(): GET /api/dre-financeiro/lucratividade/margem.
  const carregarMargem = useCallback(() => {
    let qs = 'conta=' + conta + '&gran=' + granMargem
    if (mesesMargem === '__desde__') qs += '&desde=' + desdeMargem
    else qs += '&meses=' + mesesMargem
    fetch('/api/dre-financeiro/lucratividade/margem?' + qs)
      .then((r) => r.json()).then((d) => {
        if (d.erro) { alert('Erro: ' + d.erro); return }
        const t = d.totais
        setMgReceita(fmtBRL(t.receita))
        setMgCmv(fmtBRL(t.cmv))
        setMgLucro(fmtBRL(t.lucro))
        const corM = t.margem_pct >= 30 ? 'text-emerald-700' : (t.margem_pct >= 15 ? 'text-blue-700' : (t.margem_pct >= 0 ? 'text-amber-700' : 'text-red-700'))
        setMgPct({ txt: t.margem_pct + '%', cls: 'text-2xl font-bold mt-1 ' + corM })
        setMgCobertura('(' + t.qtd + ' itens, ' + t.cobertura_cmc_pct + '% com CMC)')

        // Chart margem mensal (Chart.js misto)
        if (chartReady && window.Chart && margemRef.current) {
          if (chartMargem.current) chartMargem.current.destroy()
          chartMargem.current = new window.Chart(margemRef.current.getContext('2d'), {
            data: {
              labels: d.meses.map((m) => m.rotulo),
              datasets: [
                { type: 'bar', label: 'Receita', data: d.meses.map((m) => m.receita), backgroundColor: 'rgba(16,185,129,0.7)', yAxisID: 'y' },
                { type: 'bar', label: 'CMV', data: d.meses.map((m) => m.cmv), backgroundColor: 'rgba(239,68,68,0.7)', yAxisID: 'y' },
                { type: 'line', label: 'Margem %', data: d.meses.map((m) => m.margem_pct), borderColor: '#0f172a', borderWidth: 2, pointRadius: 3, tension: 0.2, yAxisID: 'y1' },
              ],
            },
            options: {
              responsive: true, maintainAspectRatio: false,
              interaction: { mode: 'index', intersect: false },
              scales: {
                y: { position: 'left', title: { display: true, text: 'R$' }, ticks: { callback: function (v) { return fmtBRLcurto(v) } } },
                y1: { position: 'right', title: { display: true, text: 'Margem %' }, grid: { drawOnChartArea: false }, ticks: { callback: function (v) { return v + '%' } } },
              },
            },
          })
        }

        // Tabela margem por familia
        let html = ''
        d.familias.forEach((f) => {
          const corMf = f.margem_pct >= 30 ? 'text-emerald-700' : (f.margem_pct >= 15 ? 'text-blue-700' : (f.margem_pct >= 0 ? 'text-amber-700' : 'text-red-700'))
          html += '<tr class="border-b border-slate-100">'
          html += '<td class="px-2 py-1">' + f.familia + '</td>'
          html += '<td class="px-2 py-1 text-right">' + fmtBRLcurto(f.receita) + '</td>'
          html += '<td class="px-2 py-1 text-right font-medium ' + corMf + '">' + f.margem_pct + '%</td>'
          html += '</tr>'
        })
        if (!html) html = '<tr><td colspan="3" class="px-2 py-4 text-center text-slate-500">Sem dados.</td></tr>'
        setMgFamiliasHtml(html)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, granMargem, mesesMargem, desdeMargem, chartReady])

  // === SIMULADOR WHAT-IF (futuro ou retroativo) — port fiel de recalcSim ====
  function recalcSim() {
    const d = simData.current
    if (!d) return
    const pctLiq = Number(simPctLiq) / 100
    const pctDesc = Number(simPctDesc) / 100
    const selicN = Number(selic) / 100

    let meses, dataLabel, mesesPassados
    if (simModo === 'retroativo') {
      const partes = simDataPassada.split('-')
      const dPass = new Date(Number(partes[0]), Number(partes[1]) - 1, 1)
      const hoje = new Date()
      mesesPassados = Math.max(1, Math.round((hoje.getFullYear() * 12 + hoje.getMonth()) - (dPass.getFullYear() * 12 + dPass.getMonth())))
      meses = mesesPassados
      dataLabel = dPass.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
    } else {
      meses = Number(simMeses)
      mesesPassados = 0
    }

    // No modo retroativo: filtra produtos que ja estavam parados na data escolhida.
    let produtosBase
    if (simModo === 'retroativo') {
      const diasMinPassado = mesesPassados * 30
      produtosBase = (d.top_parados || []).filter((p) => p.dias_em_estoque >= diasMinPassado)
    }

    const valorParadoBase = simModo === 'retroativo'
      ? produtosBase.reduce((s, p) => s + p.valor_estoque, 0)
      : d.parado.valor

    const valorLiquidado = valorParadoBase * pctLiq
    const caixaImediato = valorLiquidado * (1 - pctDesc)
    const perdaDesc = valorLiquidado * pctDesc
    const capitalRestante = valorParadoBase - valorLiquidado

    let caixaRecuperado, corrosaoEvitada, liquido, subCaixa
    if (simModo === 'retroativo') {
      caixaRecuperado = caixaImediato * Math.pow(1 + selicN, mesesPassados)
      corrosaoEvitada = valorLiquidado * (Math.pow(1 + selicN, mesesPassados) - 1)
      liquido = caixaRecuperado - valorParadoBase + corrosaoEvitada
      subCaixa = 'rendido com SELIC ate hoje'
    } else {
      caixaRecuperado = caixaImediato
      corrosaoEvitada = valorLiquidado * (Math.pow(1 + selicN, meses) - 1)
      liquido = caixaRecuperado - valorParadoBase + corrosaoEvitada
      subCaixa = 'imediato (preco × (1−desc))'
    }

    const liquidoTitulo = simModo === 'retroativo'
      ? 'Voce teria isto a mais HOJE'
      : 'Resultado liquido (caixa − parado + corrosao evitada)'
    const liquidoCls = 'text-3xl font-bold mt-1 ' + (liquido >= 0 ? 'text-emerald-300' : 'text-red-300')
    const liquidoSub = simModo === 'retroativo'
      ? (liquido >= 0
        ? 'comparando com o cenario real (R$ ' + fmtBRLcurto(valorParadoBase) + ' ainda parados hoje em ' + produtosBase.length + ' produtos amostrados do top)'
        : 'manter teria sido melhor com esse desconto, mesmo retroativo')
      : (liquido >= 0
        ? 'liquidar VALE A PENA neste cenario'
        : 'manter parado seria melhor (desconto alto demais para o horizonte)')

    setSimOut({
      caixa: fmtBRL(caixaRecuperado),
      caixaSub: subCaixa,
      perda: fmtBRL(perdaDesc),
      evitada: fmtBRL(corrosaoEvitada),
      evitadaSub: simModo === 'retroativo'
        ? mesesPassados + 'm desde ' + dataLabel
        : meses + 'm a ' + (selicN * 100).toFixed(2) + '%/mes',
      liquidoTitulo,
      liquido: (liquido >= 0 ? '+' : '') + fmtBRL(liquido),
      liquidoCls,
      liquidoSub,
      dataInfo: simModo === 'retroativo' ? mesesPassados + ' meses atras' : '',
      chartTitulo: '', // definido abaixo
      modoInfo: simModo === 'futuro'
        ? 'Simulando o que aconteceria se voce liquidasse HOJE com horizonte de N meses adiante.'
        : 'Simulando o que voce TERIA HOJE se tivesse liquidado naquela data passada. So considera produtos que ja estavam em estoque na epoca.',
    })

    // Grafico
    const labels = [], atual = [], cenario = []
    let titulo
    if (simModo === 'retroativo') {
      titulo = 'Linha do tempo: ' + mesesPassados + ' meses desde ' + dataLabel + ' ate hoje'
      for (let i = 0; i <= mesesPassados; i++) {
        labels.push('M-' + (mesesPassados - i))
        atual.push(valorParadoBase * Math.pow(1 + selicN, i))
        cenario.push(caixaImediato * Math.pow(1 + selicN, i) + capitalRestante * Math.pow(1 + selicN, i))
      }
      labels[labels.length - 1] = 'HOJE'
    } else {
      titulo = 'Capital ao longo dos proximos ' + meses + ' meses'
      for (let j = 0; j <= meses; j++) {
        labels.push('M+' + j)
        atual.push(valorParadoBase * Math.pow(1 + selicN, j))
        cenario.push(caixaImediato * Math.pow(1 + selicN, j) + capitalRestante * Math.pow(1 + selicN, j))
      }
    }
    setSimOut((o) => ({ ...o, chartTitulo: titulo }))

    if (chartReady && window.Chart && simRef.current) {
      if (simChart.current) simChart.current.destroy()
      simChart.current = new window.Chart(simRef.current.getContext('2d'), {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            { label: 'Sem acao (capital empatado + corrosao)', data: atual, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.1, pointRadius: 2 },
            { label: 'Com acao (caixa + estoque restante)', data: cenario, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.1, pointRadius: 2 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { boxWidth: 12, font: { size: 11 } } },
            tooltip: { callbacks: { label: function (item) { return item.dataset.label + ': ' + fmtBRL(item.raw) } } },
          },
          scales: { y: { ticks: { callback: function (v) { return fmtBRLcurto(v) } } } },
        },
      })
    }
  }

  // Carrega capital-parado e margem na montagem / mudanca de conta.
  useEffect(() => { carregarCapitalParado() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [conta])
  useEffect(() => { carregarMargem() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [conta])

  // Recalcula simulador quando seus inputs/modo mudam (port fiel dos addEventListener
  // 'input' em sim-pct-liq/sim-pct-desc/sim-meses/sim-data-passada/inp-selic + setModoSim).
  useEffect(() => { recalcSim() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [simModo, simPctLiq, simPctDesc, simMeses, simDataPassada, selic, chartReady])

  // setModoSim(modo) — troca o modo do simulador (recalc via efeito acima).
  function setModoSim(modo) { setSimModo(modo) }

  // Cenarios pre-definidos (sao para o futuro).
  function aplicarPreset(p) {
    setModoSim('futuro')
    setSimPctLiq(Number(p.liq))
    setSimPctDesc(Number(p.desc))
    setSimMeses(Number(p.meses))
    setSimPresetAtivo(p.id)
  }
  const presets = [
    { id: 'conservador', liq: 20, desc: 10, meses: 12, cls: 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100', title: 'Liquidar 20% com 10% desconto - vendas pontuais sem perder muito', nome: '🐢 Conservador', sub: '20% liq · 10% desc · 12m' },
    { id: 'equilibrado', liq: 40, desc: 20, meses: 12, cls: 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100', title: 'Limpa de fim de ano - meio termo entre caixa e margem', nome: '⚖ Equilibrado', sub: '40% liq · 20% desc · 12m' },
    { id: 'agressivo', liq: 60, desc: 30, meses: 12, cls: 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100', title: 'Promocao agressiva - libera caixa, perde margem moderada', nome: '🔥 Agressivo', sub: '60% liq · 30% desc · 12m' },
    { id: 'queima', liq: 80, desc: 40, meses: 6, cls: 'border-purple-300 bg-purple-50 text-purple-800 hover:bg-purple-100', title: 'Queima total - liquida quase tudo com desconto pesado em 6 meses', nome: '🚨 Queima total', sub: '80% liq · 40% desc · 6m' },
    { id: 'fraco', liq: 30, desc: 50, meses: 24, cls: 'border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100', title: 'Cenario pessimista - mercado fraco, descontos grandes, prazo longo', nome: '🌧 Mercado fraco', sub: '30% liq · 50% desc · 24m' },
  ]

  const onModo = 'px-3 py-1 transition bg-slate-800 text-white'
  const offModo = 'px-3 py-1 transition bg-white text-slate-700 hover:bg-slate-100'

  return (
    <div>
      {/* ===== CAPITAL PARADO ===== */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-800">Capital Parado em Estoque</h2>
          <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
            <label>Familia:</label>
            <select value={cpFamilia} onChange={(e) => setCpFamilia(e.target.value)} className="border border-slate-300 rounded px-2 py-1 bg-white min-w-[170px]">
              <option value="">Todas</option>
              <option value="__TODAS_MAQUINAS__">⚙ Todas as maquinas</option>
              <option value="__SO_PECAS__">🔩 So pecas</option>
              <option disabled>──────────</option>
              {familiasCp.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <label className="ml-2">Sem giro ha:</label>
            <select value={diasParado} onChange={(e) => setDiasParado(e.target.value)} className="border border-slate-300 rounded px-2 py-1">
              <option value="90">90 dias</option>
              <option value="180">180 dias</option>
              <option value="365">365 dias</option>
              <option value="730">2 anos</option>
              <option value="1095">3 anos</option>
              <option value="__desde_jan23__">Desde Jan/2023</option>
            </select>
            <label className="ml-2">SELIC %/mes:</label>
            <input
              type="number" step="0.05" value={selic}
              onChange={(e) => setSelic(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') carregarCapitalParado() }}
              className="border border-slate-300 rounded px-2 py-1 w-16"
            />
            <button onClick={carregarCapitalParado} className="ml-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">Aplicar</button>
          </div>
        </div>

        {/* Card destaque: CORROSAO SILENCIOSA */}
        <div className="bg-gradient-to-r from-red-900 to-amber-800 rounded-lg p-5 mb-4 text-white">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-widest text-red-100">💸 Corrosao patrimonial silenciosa</div>
              <div className="text-3xl font-bold mt-1">{corrosaoTotal}</div>
              <div className="text-xs text-red-100 mt-1">{corrosaoSub}</div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest text-amber-100">Projecao + 12 meses</div>
              <div className="text-2xl font-bold mt-1">{corrosaoProj}</div>
              <div className="text-xs text-amber-100">se nada mudar, mais isso sera queimado</div>
            </div>
          </div>
          <div className="text-[11px] text-red-100/80 mt-3 italic border-t border-red-700/50 pt-2">
            Sem boletos de armazenagem chegando, a empresa pode ter falsa sensacao de que &quot;nao perde dinheiro&quot;.
            Mas a corrosao do patrimonio liquido acontece via DRE/balanco: cada dia parado e juros queimados que nao viram receita.
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Valor parado</div>
            <div className="text-2xl font-bold text-red-700 mt-1">{cpValor}</div>
            <div className="text-xs text-slate-500">{cpValorSub}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Custo de oportunidade</div>
            <div className="text-2xl font-bold text-amber-700 mt-1">{cpCustoMes}</div>
            <div className="text-xs text-slate-500">{cpCustoAno}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Produtos parados</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{cpQtd}</div>
            <div className="text-xs text-slate-500">{cpQtdSub}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">% do estoque total</div>
            <div className="text-2xl font-bold text-orange-700 mt-1">{cpPct}</div>
            <div className="text-xs text-slate-500">parado</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Distribuicao por dias sem giro</div>
            <div style={{ position: 'relative', height: '240px' }}><canvas ref={bucketsRef} /></div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Top produtos parados (por valor)</div>
            <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Descricao</th>
                    <th className="text-right px-2 py-1">Qty</th>
                    <th className="text-right px-2 py-1">Dias</th>
                    <th className="text-right px-2 py-1">Valor</th>
                    <th className="text-right px-2 py-1 text-red-700" title="Custo de capital ja consumido por este produto">Corroido</th>
                  </tr>
                </thead>
                <tbody dangerouslySetInnerHTML={{ __html: cpTabelaHtml }} />
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ===== MARGEM BRUTA ===== */}
      <section>
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-800">Margem Bruta Operacional</h2>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <label>Periodo:</label>
            <select value={mesesMargem} onChange={(e) => setMesesMargem(e.target.value)} className="border border-slate-300 rounded px-2 py-1">
              <option value="3">3 meses</option>
              <option value="6">6 meses</option>
              <option value="12">12 meses</option>
              <option value="24">24 meses</option>
              <option value="36">36 meses</option>
              <option value="60">60 meses</option>
              <option value="__desde__">Desde data...</option>
            </select>
            <input
              type="month" value={desdeMargem}
              onChange={(e) => setDesdeMargem(e.target.value)}
              className={'border border-slate-300 rounded px-2 py-1 ' + (mesesMargem === '__desde__' ? '' : 'hidden')}
            />
            <label className="ml-2">Granular.:</label>
            <select value={granMargem} onChange={(e) => setGranMargem(e.target.value)} className="border border-slate-300 rounded px-2 py-1">
              <option value="mes">Mes</option>
              <option value="semestre">Semestre</option>
              <option value="ano">Ano</option>
            </select>
            <span className="ml-2 text-amber-700">{mgCobertura}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Receita total</div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">{mgReceita}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">CMV (custo)</div>
            <div className="text-2xl font-bold text-red-700 mt-1">{mgCmv}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Lucro bruto</div>
            <div className="text-2xl font-bold text-blue-700 mt-1">{mgLucro}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Margem %</div>
            <div className={mgPct.cls}>{mgPct.txt}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-lg border border-slate-200 p-4 md:col-span-2">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Margem mensal (receita vs CMV + linha %)</div>
            <div style={{ position: 'relative', height: '300px' }}><canvas ref={margemRef} /></div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Margem por familia</div>
            <div className="overflow-y-auto" style={{ maxHeight: '300px' }}>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-600 sticky top-0">
                  <tr>
                    <th className="text-left px-2 py-1">Familia</th>
                    <th className="text-right px-2 py-1">Receita</th>
                    <th className="text-right px-2 py-1">Margem %</th>
                  </tr>
                </thead>
                <tbody dangerouslySetInnerHTML={{ __html: mgFamiliasHtml }} />
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SIMULADOR WHAT-IF (futuro ou retroativo) ===== */}
      <section className="mb-8 mt-8">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-800">🎯 Simulador &quot;E se eu liquidasse o estoque parado?&quot;</h2>
          <div className="text-xs text-slate-500">cenarios futuros ou retroativos</div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
          {/* Toggle modo */}
          <div className="flex items-center gap-2 mb-3 text-xs flex-wrap">
            <span className="text-slate-600">Modo:</span>
            <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm">
              <button type="button" onClick={() => setModoSim('futuro')} className={simModo === 'futuro' ? onModo : offModo}>Futuro (a partir de hoje)</button>
              <button type="button" onClick={() => setModoSim('retroativo')} className={(simModo === 'retroativo' ? onModo : offModo) + ' border-l border-slate-300'}>Retroativo (data passada)</button>
            </div>
            <span className="text-slate-500 italic ml-2">{simOut.modoInfo}</span>
          </div>

          {/* Cenarios pre-definidos */}
          <div className="flex items-center gap-2 mb-4 text-xs flex-wrap border-t border-slate-200 pt-3">
            <span className="text-slate-600 font-semibold">Cenarios:</span>
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => aplicarPreset(p)}
                title={p.title}
                className={'px-2 py-1 border rounded ' + p.cls + (simPresetAtivo === p.id ? ' ring-2 ring-slate-900' : '')}
              >
                {p.nome}<br /><span className="text-[10px] font-normal">{p.sub}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Controles */}
            <div>
              <div className="mb-4">
                <label className="text-xs text-slate-600 flex justify-between"><span>% do estoque parado a liquidar</span><b className="text-blue-700">{simPctLiq}%</b></label>
                <input type="range" min="0" max="100" step="5" value={simPctLiq} onChange={(e) => { setSimPctLiq(Number(e.target.value)); setSimPresetAtivo(null) }} className="w-full mt-1" />
              </div>
              <div className="mb-4">
                <label className="text-xs text-slate-600 flex justify-between"><span>% de desconto na liquidacao</span><b className="text-orange-700">{simPctDesc}%</b></label>
                <input type="range" min="0" max="70" step="5" value={simPctDesc} onChange={(e) => { setSimPctDesc(Number(e.target.value)); setSimPresetAtivo(null) }} className="w-full mt-1" />
              </div>
              <div className={'mb-4 ' + (simModo === 'retroativo' ? 'hidden' : '')}>
                <label className="text-xs text-slate-600 flex justify-between"><span>Horizonte de analise (meses)</span><b className="text-slate-700">{simMeses}</b></label>
                <input type="range" min="3" max="36" step="3" value={simMeses} onChange={(e) => { setSimMeses(Number(e.target.value)); setSimPresetAtivo(null) }} className="w-full mt-1" />
              </div>
              <div className={'mb-2 ' + (simModo === 'retroativo' ? '' : 'hidden')}>
                <label className="text-xs text-slate-600 block mb-1">Data da decisao hipotetica</label>
                <input type="month" value={simDataPassada} onChange={(e) => setSimDataPassada(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-sm w-full" />
                <div className="text-[11px] text-slate-500 mt-1">{simOut.dataInfo}</div>
              </div>
              <div className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                Premissas: liquidacao gera caixa imediato (preco × (1−desconto)). Capital liberado deixa de &quot;queimar&quot; SELIC mensalmente.
                Desconto e perda real no momento, mas evita corrosao futura silenciosa.
              </div>
            </div>

            {/* Resultado */}
            <div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                  <div className="text-[10px] uppercase text-emerald-800 tracking-wide">Caixa recuperado</div>
                  <div className="text-lg font-bold text-emerald-900 mt-0.5">{simOut.caixa}</div>
                  <div className="text-[10px] text-emerald-700">{simOut.caixaSub}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <div className="text-[10px] uppercase text-red-800 tracking-wide">Perda no desconto</div>
                  <div className="text-lg font-bold text-red-900 mt-0.5">{simOut.perda}</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded p-3">
                  <div className="text-[10px] uppercase text-amber-800 tracking-wide">Corrosao evitada</div>
                  <div className="text-lg font-bold text-amber-900 mt-0.5">{simOut.evitada}</div>
                  <div className="text-[10px] text-amber-700">{simOut.evitadaSub}</div>
                </div>
              </div>
              <div className="bg-gradient-to-r from-slate-900 to-blue-900 rounded p-4 text-white">
                <div className="text-xs uppercase tracking-widest text-slate-300">{simOut.liquidoTitulo}</div>
                <div className={simOut.liquidoCls}>{simOut.liquido}</div>
                <div className="text-xs text-slate-300 mt-1">{simOut.liquidoSub}</div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">{simOut.chartTitulo}</div>
            <div style={{ position: 'relative', height: '200px' }}><canvas ref={simRef} /></div>
          </div>
        </div>
      </section>
    </div>
  )
}
