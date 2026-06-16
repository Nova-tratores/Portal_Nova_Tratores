'use client'
// =============================================================================
// Tela Margens (port FIEL de views/margens.ejs do financeiro-omie-dashboard).
//
// Mostra a margem REAL por venda historica: Receita − (CMV + Capital empatado
// ate a venda). A tela tem:
//
//   - Toolbar: periodo (1/3/6/12/24 meses ou "desde data..."), SELIC %/mes e
//     botao Aplicar. Esses controles disparam o fetch da API (igual a fonte:
//     o fetch so roda nos eventos Aplicar / change do periodo / Enter no SELIC).
//   - 5 KPIs (vendas / receita / CMV+Capital / lucro / vendas com prejuizo).
//   - Aviso de cobertura CMC (so aparece quando ha vendas sem CMC unitario).
//   - Filtros client-side: familia (select dinamico, com sentinelas "todas as
//     maquinas" / "so pecas"), busca (codigo/descricao/cliente/vendedor) e
//     faixa de margem. A filtragem/ordenacao/paginacao e 100% no client a partir
//     da lista 'todos' (igual ao IIFE da fonte).
//   - Tabela ordenavel + paginada (50 por pagina).
//   - Grafico de evolucao mensal (so quando ha filtro de familia): barras
//     Receita + CMV+Capital e linha Margem % (com datalabels).
//   - Modal de detalhe da venda (clique na linha).
//
// Chart.js 4.4.0 + chartjs-plugin-datalabels 2.2.0 sao carregados via CDN
// (mesmas versoes da fonte). O grafico usa ref/canvas imperativo; KPIs/tabela/
// modal sao React/JSX.
//
// A conta vem do seletor compartilhado (layout do modulo) via useDreConta. O
// layout ja aplica o gate de permissao 'financeiro' e a sub-nav; ainda assim
// importamos useAuth/usePermissoes e SemPermissao por consistencia com o padrao
// do portal.
// =============================================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta } from '@/lib/dre-financeiro/format'

// ---------------------------------------------------------------------------
// Formatadores locais (identicos aos do <script> da fonte). Mantidos inline
// para preservar EXATAMENTE o arredondamento usado nos labels/KPIs/graficos.
// (fmtBRLcurto da fonte difere do formatBRLcurto do portal — aqui >=1k usa
//  toFixed(0) "k" sem casa decimal; mantemos o da fonte.)
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

// Cor da margem por faixa (port fiel das ternarias repetidas na fonte).
function corMargem(pct) {
  return pct >= 30 ? 'text-emerald-700' : (pct >= 15 ? 'text-blue-700' : (pct >= 0 ? 'text-amber-700' : 'text-red-700'))
}

// ehPeca(fam): true se a familia comeca com "pec"/"peç" (sem acento, case-insens).
// Port fiel da regex da fonte.
function ehPeca(fam) {
  return /^pe[çc]/i.test(String(fam || '').normalize('NFD').replace(/[̀-ͯ]/g, ''))
}

const POR_PAG = 50

// Campos cuja ordenacao padrao e descendente (port fiel do array da fonte).
const ORDEM_DESC_PADRAO = ['receita', 'quantidade', 'cmv', 'custo_capital', 'margem_real', 'margem_pct', 'dias_estoque', 'data_pedido']

// ---------------------------------------------------------------------------
// Carregamento de Chart.js 4.4.0 + chartjs-plugin-datalabels 2.2.0 via CDN
// (mesmas versoes da fonte), uma unica vez. O plugin datalabels e usado no
// grafico de evolucao mensal (registrado por-grafico, como na fonte).
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

export default function MargensPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  const [chartReady, setChartReady] = useState(false)

  // ===== Controles da toolbar (disparam o fetch) ============================
  // mesesSel guarda o value bruto do select (inclui o sentinela __desde__).
  const [mesesSel, setMesesSel] = useState('12')
  const [desde, setDesde] = useState('2023-01')
  const [taxa, setTaxa] = useState('1.00')
  // Trigger de "Aplicar"/change de periodo/Enter no SELIC: incrementa p/ re-buscar
  // (espelha o fato de que na fonte o fetch so dispara nos eventos, nao a cada
  // digito do SELIC).
  const [req, setReq] = useState(0)

  // ===== Dados da API =======================================================
  const [dados, setDados] = useState(null)   // resposta completa de /api/margens
  const todos = dados ? (dados.itens || []) : []

  // ===== Filtros client-side ================================================
  const [familia, setFamilia] = useState('')
  const [busca, setBusca] = useState('')
  const [faixa, setFaixa] = useState('')

  // ===== Ordenacao + paginacao ==============================================
  const [ordem, setOrdem] = useState({ campo: 'margem_pct', dir: 'asc' })
  const [pagina, setPagina] = useState(1)

  // ===== Modal de detalhe ===================================================
  const [detalhe, setDetalhe] = useState(null)

  // Ref do grafico mensal
  const refChart = useRef(null)
  const instChart = useRef(null)

  // Carrega a lib uma vez.
  useEffect(() => {
    carregarChartLibs().then(() => setChartReady(true)).catch(() => setChartReady(false))
  }, [])

  // =========================================================================
  // carregar(): port fiel da funcao homonima da fonte. Re-busca quando a conta
  // muda ou quando 'req' incrementa (Aplicar / change do periodo / Enter no
  // SELIC). O SELIC so entra no fetch via req (igual a fonte).
  // =========================================================================
  useEffect(() => {
    let qs = 'conta=' + conta + '&taxa=' + taxa
    if (mesesSel === '__desde__') qs += '&desde=' + desde
    else qs += '&meses=' + mesesSel
    fetch('/api/dre-financeiro/margens?' + qs)
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { alert('Erro: ' + d.erro); return }
        setDados(d)
        setPagina(1)
      })
      .catch((e) => { alert('Erro: ' + e.message) })
    // taxa NAO entra nas deps: na fonte o fetch so dispara nos eventos, nao a
    // cada digito do campo SELIC; aqui o disparo vem por req.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, req])

  // =========================================================================
  // Lista filtrada (port fiel de filtrados()).
  // =========================================================================
  const filtrados = todos.filter((it) => {
    if (familia === '__TODAS_MAQUINAS__') { if (ehPeca(it.familia)) return false }
    else if (familia === '__SO_PECAS__') { if (!ehPeca(it.familia)) return false }
    else if (familia && it.familia !== familia) return false
    const b = busca.trim().toLowerCase()
    if (b && !(String(it.codigo_produto).toLowerCase().includes(b)
      || (it.descricao || '').toLowerCase().includes(b)
      || (it.cliente || '').toLowerCase().includes(b)
      || (it.vendedor || '').toLowerCase().includes(b))) return false
    if (faixa === 'neg' && it.margem_pct > 0) return false
    if (faixa === 'baixa' && (it.margem_pct < 0 || it.margem_pct > 15)) return false
    if (faixa === 'media' && (it.margem_pct <= 15 || it.margem_pct > 30)) return false
    if (faixa === 'alta' && it.margem_pct <= 30) return false
    return true
  })

  // =========================================================================
  // Lista ordenada (port fiel de ordenados()).
  // =========================================================================
  const c = ordem.campo
  const dir = ordem.dir === 'asc' ? 1 : -1
  const lista = filtrados.slice().sort((a, b) => {
    let va = a[c], vb = b[c]
    if (va === null || va === undefined) va = -Infinity
    if (vb === null || vb === undefined) vb = -Infinity
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * dir
  })

  // Paginacao (clampa a pagina, igual a fonte: se passar do total, volta p/ 1).
  const totPag = Math.max(1, Math.ceil(lista.length / POR_PAG))
  const paginaAtual = pagina > totPag ? 1 : pagina
  const slice = lista.slice((paginaAtual - 1) * POR_PAG, paginaAtual * POR_PAG)

  // ao trocar filtro/busca/faixa, volta p/ pagina 1 (port fiel dos listeners).
  function resetPagina() { setPagina(1) }

  // Clique no cabecalho da tabela (port fiel do listener de ordenacao).
  function ordenarPor(campo) {
    setOrdem((o) => {
      if (o.campo === campo) return { campo, dir: o.dir === 'asc' ? 'desc' : 'asc' }
      return { campo, dir: ORDEM_DESC_PADRAO.includes(campo) ? 'desc' : 'asc' }
    })
  }

  // Indicador de ordenacao por coluna (port fiel: ▲/▼ na coluna ativa, ⇅ nas demais).
  function indOrdem(campo) {
    if (ordem.campo === campo) {
      return <span className="ind text-slate-700">{ordem.dir === 'asc' ? '▲' : '▼'}</span>
    }
    return <span className="ind text-slate-300">⇅</span>
  }

  // Paginar (port fiel de paginarMg).
  const paginar = useCallback((delta) => {
    setPagina((p) => Math.max(1, Math.min(totPag, p + delta)))
  }, [totPag])

  // Tecla Esc fecha o modal (port fiel do listener de keydown).
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setDetalhe(null) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // =========================================================================
  // Grafico de evolucao mensal (port fiel de renderGraficoMensal()).
  // So aparece quando ha filtro de familia; agrega a lista filtrada por mes.
  // =========================================================================
  // Calcula a agregacao por mes a partir da lista filtrada+ordenada (igual a
  // fonte, que passa 'lista' para renderGraficoMensal).
  const arrMensal = (() => {
    if (!familia) return []
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
    return arr
  })()

  const labelFamilia = familia === '__TODAS_MAQUINAS__' ? 'Todas as maquinas'
    : familia === '__SO_PECAS__' ? 'So pecas'
      : familia

  useEffect(() => {
    if (!familia) {
      // Sem familia: destroi o grafico (igual a fonte, que esconde o box).
      if (instChart.current) { instChart.current.destroy(); instChart.current = null }
      return
    }
    if (!chartReady || !refChart.current || !window.Chart) return
    const arr = arrMensal
    if (instChart.current) instChart.current.destroy()
    const ctx = refChart.current.getContext('2d')
    instChart.current = new window.Chart(ctx, {
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
    return () => { if (instChart.current) { instChart.current.destroy(); instChart.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, familia, JSON.stringify(arrMensal.map((m) => [m.rotulo, m.receita, m.cmv, m.capital, m.margem_pct]))])

  // --- Gate de permissao (BRIEF item 1) -------------------------------------
  if (!loading && !loadingPerm && userProfile && !temAcesso('financeiro')) return <SemPermissao />

  // ===== Derivados de exibicao ==============================================
  const t = dados ? dados.totais : null
  const fams = dados ? (dados.familias || []) : []
  // KPI de vendas com prejuizo (port fiel: margem_real <= 0).
  const negs = todos.filter((it) => it.margem_real <= 0)
  const valorNeg = negs.reduce((s, it) => s + it.receita, 0)
  const valorPrej = negs.reduce((s, it) => s + Math.abs(it.margem_real), 0)
  // Aviso CMC (port fiel: so aparece quando ha vendas sem CMC).
  const avisoPct = t && t.qtd > 0 ? (100 * t.qtd_sem_cmc / t.qtd).toFixed(0) : 0

  return (
    <>
      {/* Cabecalho + toolbar */}
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Margens de Vendas</h1>
          <p className="text-xs text-slate-500">Margem real por venda historica: Receita − (CMV + Capital empatado ate a venda)</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <label>Periodo:</label>
          <select
            value={mesesSel}
            onChange={(e) => { setMesesSel(e.target.value); setReq((n) => n + 1) }}
            className="border border-slate-300 rounded px-2 py-1"
          >
            <option value="1">1 mes</option>
            <option value="3">3 meses</option>
            <option value="6">6 meses</option>
            <option value="12">12 meses</option>
            <option value="24">24 meses</option>
            <option value="__desde__">Desde data...</option>
          </select>
          <input
            type="month" value={desde}
            onChange={(e) => { setDesde(e.target.value); setReq((n) => n + 1) }}
            className={'border border-slate-300 rounded px-2 py-1 ' + (mesesSel === '__desde__' ? '' : 'hidden')}
          />
          <label className="ml-2">SELIC %/mes:</label>
          <input
            type="number" step="0.05" value={taxa}
            onChange={(e) => setTaxa(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setReq((n) => n + 1) }}
            className="border border-slate-300 rounded px-2 py-1 w-16"
          />
          <button
            onClick={() => setReq((n) => n + 1)}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          >Aplicar</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Vendas</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{t ? String(t.qtd) : '--'}</div>
          <div className="text-xs text-slate-500">
            {dados ? dados.meses + ' meses ' + (dados.desde ? '(desde ' + dados.desde + ')' : '') : 'itens vendidos'}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Receita total</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{t ? fmtBRL(t.receita) : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">CMV + Capital</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{t ? fmtBRL(t.custo_total) : '--'}</div>
          <div className="text-xs text-slate-500">
            {t ? 'CMV ' + fmtBRLcurto(t.cmv) + ' + Capital ' + fmtBRLcurto(t.capital_total) : 'custo real'}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Lucro</div>
          <div className="text-2xl font-bold text-blue-700 mt-1">{t ? fmtBRL(t.lucro) : '--'}</div>
          <div className={t ? 'text-xs ' + corMargem(t.margem_pct) : 'text-xs text-slate-500'}>
            {t ? t.margem_pct + '% medio' : '--'}
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Vendas com prejuizo</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{dados ? String(negs.length) : '--'}</div>
          <div className="text-xs text-slate-500">
            {dados ? fmtBRLcurto(valorNeg) + ' em receita · ' + fmtBRLcurto(valorPrej) + ' de prejuizo' : 'margem <= 0'}
          </div>
        </div>
      </div>

      {/* Aviso CMC */}
      {t && t.qtd_sem_cmc > 0 && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-900">
          ⚠ <b>{t.qtd_sem_cmc} vendas ({avisoPct}%) sem CMC unitario registrado.</b>{' '}
          Para essas, CMV = 0 (margem aparece como 100%, mas e artificial).{' '}
          Cobertura CMC: {t.cobertura_cmc_pct}%.
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-2 mb-3 flex-wrap text-sm">
        <label className="text-xs text-slate-500">Familia:</label>
        <select
          value={familia}
          onChange={(e) => { setFamilia(e.target.value); resetPagina() }}
          className="border border-slate-300 rounded px-2 py-1 bg-white"
        >
          <option value="">Todas</option>
          <option value="__TODAS_MAQUINAS__">⚙ Todas as maquinas</option>
          <option value="__SO_PECAS__">🔩 So pecas</option>
          <option disabled>──────────</option>
          {fams.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <label className="text-xs text-slate-500 ml-2">Busca:</label>
        <input
          type="text"
          placeholder="codigo, descricao, cliente, vendedor..."
          value={busca}
          onChange={(e) => { setBusca(e.target.value); resetPagina() }}
          className="border border-slate-300 rounded px-2 py-1 w-72"
        />
        <label className="text-xs text-slate-500 ml-2">Margem:</label>
        <select
          value={faixa}
          onChange={(e) => { setFaixa(e.target.value); resetPagina() }}
          className="border border-slate-300 rounded px-2 py-1 bg-white"
        >
          <option value="">Todas</option>
          <option value="neg">Prejuizo (≤ 0%)</option>
          <option value="baixa">0% a 15%</option>
          <option value="media">15% a 30%</option>
          <option value="alta">&gt; 30%</option>
        </select>
        <span className="text-xs text-slate-500 ml-2">Mostrando {lista.length} de {todos.length}</span>
      </div>

      {/* Tabela */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600 select-none">
              <tr>
                <th className="text-left  px-3 py-2 cursor-pointer hover:bg-slate-100" onClick={() => ordenarPor('data_pedido')}>Data {indOrdem('data_pedido')}</th>
                <th className="text-left  px-3 py-2 cursor-pointer hover:bg-slate-100" onClick={() => ordenarPor('codigo_produto')}>Cod {indOrdem('codigo_produto')}</th>
                <th className="text-left  px-3 py-2 cursor-pointer hover:bg-slate-100" onClick={() => ordenarPor('descricao')}>Produto {indOrdem('descricao')}</th>
                <th className="text-left  px-3 py-2 cursor-pointer hover:bg-slate-100" onClick={() => ordenarPor('familia')}>Familia {indOrdem('familia')}</th>
                <th className="text-left  px-3 py-2 cursor-pointer hover:bg-slate-100" onClick={() => ordenarPor('pedido')}>Pedido/NF {indOrdem('pedido')}</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:bg-slate-100" onClick={() => ordenarPor('quantidade')}>Qty {indOrdem('quantidade')}</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:bg-slate-100" onClick={() => ordenarPor('dias_estoque')}>Dias estoque {indOrdem('dias_estoque')}</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:bg-slate-100" onClick={() => ordenarPor('receita')}>Receita {indOrdem('receita')}</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:bg-slate-100" onClick={() => ordenarPor('cmv')}>CMV {indOrdem('cmv')}</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:bg-slate-100" onClick={() => ordenarPor('custo_capital')}>Capital {indOrdem('custo_capital')}</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:bg-slate-100" onClick={() => ordenarPor('margem_real')}>Lucro {indOrdem('margem_real')}</th>
                <th className="text-right px-3 py-2 cursor-pointer hover:bg-slate-100" onClick={() => ordenarPor('margem_pct')}>Margem % {indOrdem('margem_pct')}</th>
              </tr>
            </thead>
            <tbody>
              {slice.length === 0 ? (
                <tr><td colSpan={12} className="px-3 py-6 text-center text-slate-500">Nenhuma venda no filtro.</td></tr>
              ) : (
                slice.map((it, idx) => {
                  const corMg = corMargem(it.margem_pct)
                  const rowCor = it.margem_real < 0 ? 'bg-red-50' : (it.sem_cmc ? 'bg-amber-50' : '')
                  return (
                    <tr
                      key={(paginaAtual - 1) * POR_PAG + idx}
                      className={'border-b border-slate-100 hover:bg-slate-100 cursor-pointer ' + rowCor}
                      onClick={() => setDetalhe(it)}
                    >
                      <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{it.data_pedido || '-'}</td>
                      <td className="px-3 py-1.5 font-mono text-[10px] text-slate-600">{it.codigo_produto}</td>
                      <td className="px-3 py-1.5 truncate max-w-[240px]" title={it.descricao || ''}>{it.descricao || '(sem)'}</td>
                      <td className="px-3 py-1.5 text-slate-600 text-[11px]">{it.familia}</td>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-slate-700">{it.pedido || '-'}</td>
                      <td className="px-3 py-1.5 text-right">{it.quantidade.toFixed(0)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-500">{it.dias_estoque || '-'}</td>
                      <td className="px-3 py-1.5 text-right">{fmtBRL(it.receita)}</td>
                      <td className="px-3 py-1.5 text-right text-slate-600">
                        {it.sem_cmc ? <span className="text-amber-700">s/ CMC</span> : fmtBRL(it.cmv)}
                      </td>
                      <td className="px-3 py-1.5 text-right text-amber-700">{fmtBRL(it.custo_capital)}</td>
                      <td className={'px-3 py-1.5 text-right font-medium ' + corMg}>{fmtBRL(it.margem_real)}</td>
                      <td className={'px-3 py-1.5 text-right font-bold ' + corMg}>{it.margem_pct.toFixed(1)}%</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-slate-200 text-xs text-slate-600 flex items-center gap-3">
          <button
            onClick={() => paginar(-1)}
            className={'px-2 py-0.5 border border-slate-300 rounded ' + (paginaAtual > 1 ? 'hover:bg-slate-100' : 'opacity-50 cursor-not-allowed')}
          >← Ant</button>
          <span>Pagina <b>{paginaAtual}</b> de <b>{totPag}</b> ({lista.length} vendas)</span>
          <button
            onClick={() => paginar(1)}
            className={'px-2 py-0.5 border border-slate-300 rounded ' + (paginaAtual < totPag ? 'hover:bg-slate-100' : 'opacity-50 cursor-not-allowed')}
          >Prox →</button>
        </div>
      </div>

      {/* Grafico de margem mensal (aparece quando ha filtro de familia) */}
      {familia && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 mt-4">
          <div className="flex items-baseline justify-between mb-2">
            <div>
              <div className="text-xs text-slate-500 uppercase tracking-wide">
                Evolucao mensal — <span className="text-slate-800 font-semibold normal-case">{labelFamilia}</span>
              </div>
              <div className="text-[11px] text-slate-500">{arrMensal.length} meses · {lista.length} vendas no filtro</div>
            </div>
          </div>
          <div style={{ position: 'relative', height: '300px' }}><canvas ref={refChart} /></div>
        </div>
      )}

      {/* Modal detalhe da venda */}
      {detalhe && (() => {
        const it = detalhe
        const corMg = corMargem(it.margem_pct)
        return (
          <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setDetalhe(null)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[85vh] bg-white rounded-lg shadow-2xl z-50 flex flex-col">
              <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                <h2 className="font-semibold text-slate-800">Venda · Pedido {it.pedido || '?'}</h2>
                <button onClick={() => setDetalhe(null)} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">&times;</button>
              </div>
              <div className="p-5 overflow-y-auto">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                    <div className="text-[10px] uppercase text-emerald-800">Receita</div>
                    <div className="text-lg font-bold text-emerald-900 mt-0.5">{fmtBRL(it.receita)}</div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded p-3">
                    <div className="text-[10px] uppercase text-red-800">Custo (CMV+Capital)</div>
                    <div className="text-lg font-bold text-red-900 mt-0.5">{fmtBRL(it.custo_total)}</div>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded p-3">
                    <div className="text-[10px] uppercase text-slate-700">Margem</div>
                    <div className={'text-lg font-bold mt-0.5 ' + corMg}>{fmtBRL(it.margem_real)} <span className="text-xs">({it.margem_pct.toFixed(1)}%)</span></div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded p-3 mb-3">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Produto</div>
                  <div className="text-sm font-medium text-slate-800">{it.descricao || '(sem descricao)'}</div>
                  <div className="text-xs text-slate-500 mt-1">Codigo: <span className="font-mono">{it.codigo_produto}</span> · Familia: {it.familia}</div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="border border-slate-200 rounded p-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Comercial</div>
                    <div className="text-xs"><b>Pedido/NF:</b> {it.pedido || '-'}</div>
                    <div className="text-xs"><b>Data:</b> {it.data_pedido || '-'}</div>
                    <div className="text-xs"><b>Cliente:</b> {it.cliente || '-'}</div>
                    <div className="text-xs"><b>Vendedor:</b> {it.vendedor || '-'}</div>
                  </div>
                  <div className="border border-slate-200 rounded p-3">
                    <div className="text-xs text-slate-500 uppercase tracking-wide mb-1">Quantidades</div>
                    <div className="text-xs"><b>Qty:</b> {it.quantidade}</div>
                    <div className="text-xs"><b>Preco unit:</b> {fmtBRL(it.valor_unitario)}</div>
                    <div className="text-xs"><b>CMC unit:</b> {it.sem_cmc ? <span className="text-amber-700">nao registrado</span> : fmtBRL(it.cmc_unitario)}</div>
                    <div className="text-xs"><b>Dias em estoque:</b> {(it.dias_estoque || '-')}{it.dias_estoque ? ' dias' : ''}</div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded p-3 bg-slate-50">
                  <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Decomposicao do custo</div>
                  <div className="flex justify-between py-1 text-sm"><span>Receita</span><span className="font-medium text-emerald-700">{fmtBRL(it.receita)}</span></div>
                  <div className="flex justify-between py-1 text-sm"><span>− CMV (cmc × qty)</span><span className="font-medium text-red-700">−{fmtBRL(it.cmv)}</span></div>
                  <div className="flex justify-between py-1 text-sm"><span>− Capital empatado ({it.dias_estoque || 0}d × SELIC)</span><span className="font-medium text-amber-700">−{fmtBRL(it.custo_capital)}</span></div>
                  <div className="flex justify-between py-1 text-base border-t border-slate-300 mt-1 pt-2"><span className="font-semibold">= Lucro real</span><span className={'font-bold ' + corMg}>{fmtBRL(it.margem_real)} ({it.margem_pct.toFixed(1)}%)</span></div>
                </div>

                {it.margem_real < 0 && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded p-3 text-xs text-red-800">
                    <b>⚠ Venda com prejuizo:</b> o custo total (CMV + capital empatado) superou a receita.{' '}
                    {it.dias_estoque > 365
                      ? 'Produto parou ' + it.dias_estoque + ' dias antes da venda - capital corroeu margem.'
                      : (it.cmv > it.receita ? 'CMV maior que receita - possivel erro de preco cadastrado.' : '')}
                  </div>
                )}
              </div>
            </div>
          </>
        )
      })()}
    </>
  )
}
