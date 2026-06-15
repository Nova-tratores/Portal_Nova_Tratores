'use client'
// =============================================================================
// Tela Lucratividade (port FIEL de views/lucratividade.ejs do
// financeiro-omie-dashboard).
//
// Mantem EXATAMENTE os calculos e o comportamento do original. A tela tem 3
// secoes:
//
//  1) CAPITAL PARADO EM ESTOQUE
//     Toolbar: familia (select dinamico), "sem giro ha" (90/180/365/730/1095/
//     desde Jan23), SELIC %/mes (number) e botao Aplicar. Card destaque
//     "corrosao patrimonial silenciosa", 4 KPIs (valor parado / custo de
//     oportunidade / produtos parados / % do estoque), grafico de barras de
//     distribuicao por dias sem giro e tabela "top produtos parados".
//     Consome /api/dre-financeiro/lucratividade/capital-parado.
//
//  2) MARGEM BRUTA OPERACIONAL
//     Toolbar: periodo (3/6/12/24/36/60 meses ou "desde data"), granularidade
//     (mes/semestre/ano) e cobertura CMC. 4 KPIs (receita/CMV/lucro/margem%),
//     grafico misto (barras receita+CMV + linha margem%) e tabela margem por
//     familia. Consome /api/dre-financeiro/lucratividade/margem.
//
//  3) SIMULADOR WHAT-IF ("E se eu liquidasse o estoque parado?")
//     Modo futuro/retroativo, presets, sliders (% liquidar / % desconto /
//     horizonte) e data passada. Calculo 100% client-side a partir do ultimo
//     resultado de capital-parado (mesma matematica do IIFE da fonte) + grafico
//     de linha (sem acao x com acao). NAO consome API propria.
//
// Chart.js 4.4.0 e carregado via CDN (mesma lib da fonte) num <script>
// dinamico; os 3 graficos usam ref/canvas imperativo. KPIs/tabelas/cards/
// sliders sao React/JSX.
//
// A conta vem do seletor compartilhado (layout do modulo) via useDreConta. O
// layout ja aplica o gate de permissao 'financeiro' e a sub-nav; ainda assim
// importamos useAuth/usePermissoes e SemPermissao por consistencia com o
// padrao do portal.
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

// ---------------------------------------------------------------------------
// Carregamento da lib de grafico (Chart.js) via CDN, uma unica vez. Mesma
// versao da fonte (lucratividade.ejs).
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

// Presets do simulador (port fiel dos botoes .sim-preset da fonte).
const SIM_PRESETS = [
  { liq: 20, desc: 10, meses: 12, classes: 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100', titulo: 'Liquidar 20% com 10% desconto - vendas pontuais sem perder muito', label: '🐢 Conservador' },
  { liq: 40, desc: 20, meses: 12, classes: 'border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100', titulo: 'Limpa de fim de ano - meio termo entre caixa e margem', label: '⚖ Equilibrado' },
  { liq: 60, desc: 30, meses: 12, classes: 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100', titulo: 'Promocao agressiva - libera caixa, perde margem moderada', label: '🔥 Agressivo' },
  { liq: 80, desc: 40, meses: 6, classes: 'border-purple-300 bg-purple-50 text-purple-800 hover:bg-purple-100', titulo: 'Queima total - liquida quase tudo com desconto pesado em 6 meses', label: '🚨 Queima total' },
  { liq: 30, desc: 50, meses: 24, classes: 'border-slate-300 bg-slate-50 text-slate-800 hover:bg-slate-100', titulo: 'Cenario pessimista - mercado fraco, descontos grandes, prazo longo', label: '🌧 Mercado fraco' },
]

export default function LucratividadePage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  const [chartReady, setChartReady] = useState(false)

  // ===== Estado: CAPITAL PARADO =============================================
  // Controles (espelham os inputs da fonte). diasSel guarda o value bruto do
  // select (inclui o sentinela __desde_jan23__); a conversao p/ dias e feita no
  // fetch, igual a fonte.
  const [diasSel, setDiasSel] = useState('180')
  const [selic, setSelic] = useState('1.00')
  const [familia, setFamilia] = useState('')        // familia "aplicada" (usada no fetch)
  const [cpData, setCpData] = useState(null)         // resposta de capital-parado
  // gatilho de "Aplicar"/change: incrementa p/ re-buscar (espelha o fato de que
  // na fonte o fetch so dispara nos eventos, nao a cada digito do SELIC).
  const [cpReq, setCpReq] = useState(0)

  // ===== Estado: MARGEM =====================================================
  const [mesesMargem, setMesesMargem] = useState('12') // value bruto do select (pode ser __desde__)
  const [desdeMargem, setDesdeMargem] = useState('2023-01')
  const [granMargem, setGranMargem] = useState('mes')
  const [mgData, setMgData] = useState(null)         // resposta de margem

  // ===== Estado: SIMULADOR WHAT-IF =========================================
  const [simModo, setSimModo] = useState('futuro')   // 'futuro' | 'retroativo'
  const [simPctLiq, setSimPctLiq] = useState(50)     // %
  const [simPctDesc, setSimPctDesc] = useState(30)   // %
  const [simMeses, setSimMeses] = useState(12)
  const [simDataPassada, setSimDataPassada] = useState('2025-01') // YYYY-MM
  const [simPresetAtivo, setSimPresetAtivo] = useState(-1)

  // Refs dos 3 graficos
  const refBuckets = useRef(null); const instBuckets = useRef(null)
  const refMargem = useRef(null); const instMargem = useRef(null)
  const refSim = useRef(null); const instSim = useRef(null)

  // Carrega a lib uma vez.
  useEffect(() => {
    carregarChartLibs().then(() => setChartReady(true)).catch(() => setChartReady(false))
  }, [])

  // =========================================================================
  // carregarCapitalParado(): port fiel da funcao homonima da fonte.
  // Re-busca quando conta muda ou quando cpReq incrementa (Aplicar / change de
  // familia ou dias). O SELIC so entra no fetch via cpReq (Enter ou Aplicar),
  // mas afeta o simulador a cada digito (igual a fonte).
  // =========================================================================
  useEffect(() => {
    let dias = diasSel
    if (diasSel === '__desde_jan23__') {
      const inicio = new Date(2023, 0, 1)
      dias = Math.floor((new Date() - inicio) / 86400000)
    }
    const qs = 'conta=' + conta
      + '&dias=' + dias
      + '&selic=' + selic
      + '&familia=' + encodeURIComponent(familia)
    fetch('/api/dre-financeiro/lucratividade/capital-parado?' + qs)
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { alert('Erro: ' + d.erro); return }
        setCpData(d)
      })
      .catch((e) => { alert('Erro: ' + e.message) })
    // selic NAO entra nas deps: na fonte o fetch so dispara nos eventos, nao a
    // cada digito do campo SELIC; aqui o disparo vem por cpReq.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, cpReq])

  // =========================================================================
  // carregarMargem(): port fiel da funcao homonima da fonte.
  // =========================================================================
  useEffect(() => {
    let qs = 'conta=' + conta + '&gran=' + granMargem
    if (mesesMargem === '__desde__') {
      qs += '&desde=' + desdeMargem
    } else {
      qs += '&meses=' + mesesMargem
    }
    fetch('/api/dre-financeiro/lucratividade/margem?' + qs)
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { alert('Erro: ' + d.erro); return }
        setMgData(d)
      })
      .catch((e) => { alert('Erro: ' + e.message) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, mesesMargem, desdeMargem, granMargem])

  // =========================================================================
  // Grafico de buckets (distribuicao por dias sem giro). Port fiel.
  // =========================================================================
  useEffect(() => {
    if (!chartReady || !cpData || !refBuckets.current || !window.Chart) return
    const d = cpData
    if (instBuckets.current) instBuckets.current.destroy()
    const ctx = refBuckets.current.getContext('2d')
    instBuckets.current = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels: d.buckets.map((b) => b.rotulo),
        datasets: [
          {
            label: 'Valor',
            data: d.buckets.map((b) => b.valor),
            backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#dc2626', '#991b1b', '#7c2d12', '#475569'],
            yAxisID: 'y',
          },
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
    return () => { if (instBuckets.current) { instBuckets.current.destroy(); instBuckets.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, cpData])

  // =========================================================================
  // Grafico de margem mensal (receita+CMV barras + linha margem%). Port fiel.
  // =========================================================================
  useEffect(() => {
    if (!chartReady || !mgData || !refMargem.current || !window.Chart) return
    const d = mgData
    if (instMargem.current) instMargem.current.destroy()
    const ctx = refMargem.current.getContext('2d')
    instMargem.current = new window.Chart(ctx, {
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
    return () => { if (instMargem.current) { instMargem.current.destroy(); instMargem.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, mgData])

  // =========================================================================
  // Simulador what-if: calculo derivado (port fiel de recalcSim da fonte).
  // Roda inteiramente no client a partir de cpData + controles. Devolve um
  // objeto com todos os textos/cores/serie do grafico (ou null se sem dados).
  // =========================================================================
  function calcSim() {
    if (!cpData) return null
    const pctLiq = Number(simPctLiq) / 100
    const pctDesc = Number(simPctDesc) / 100
    const selicNum = Number(selic) / 100

    let meses, dataLabel, mesesPassados, dataInfo = ''
    if (simModo === 'retroativo') {
      const partes = simDataPassada.split('-')
      const dPass = new Date(Number(partes[0]), Number(partes[1]) - 1, 1)
      const hoje = new Date()
      mesesPassados = Math.max(1, Math.round((hoje.getFullYear() * 12 + hoje.getMonth()) - (dPass.getFullYear() * 12 + dPass.getMonth())))
      meses = mesesPassados
      dataLabel = dPass.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
      dataInfo = mesesPassados + ' meses atras'
    } else {
      meses = Number(simMeses)
      mesesPassados = 0
    }

    // No modo retroativo: filtra produtos que ja estavam parados na data
    // escolhida (dias_em_estoque >= mesesPassados * 30). Port fiel: usa o
    // top_parados como amostra explicita.
    let produtosBase = []
    if (simModo === 'retroativo') {
      const diasMinPassado = mesesPassados * 30
      produtosBase = (cpData.top_parados || []).filter((p) => p.dias_em_estoque >= diasMinPassado)
    }

    const valorParadoBase = simModo === 'retroativo'
      ? produtosBase.reduce((s, p) => s + p.valor_estoque, 0)
      : cpData.parado.valor

    const valorLiquidado = valorParadoBase * pctLiq
    const caixaImediato = valorLiquidado * (1 - pctDesc)
    const perdaDesc = valorLiquidado * pctDesc
    const capitalRestante = valorParadoBase - valorLiquidado

    let caixaRecuperado, corrosaoEvitada, liquido, subCaixa
    if (simModo === 'retroativo') {
      caixaRecuperado = caixaImediato * Math.pow(1 + selicNum, mesesPassados)
      corrosaoEvitada = valorLiquidado * (Math.pow(1 + selicNum, mesesPassados) - 1)
      liquido = caixaRecuperado - valorParadoBase + corrosaoEvitada
      subCaixa = 'rendido com SELIC ate hoje'
    } else {
      caixaRecuperado = caixaImediato
      corrosaoEvitada = valorLiquidado * (Math.pow(1 + selicNum, meses) - 1)
      liquido = caixaRecuperado - valorParadoBase + corrosaoEvitada
      subCaixa = 'imediato (preco × (1−desc))'
    }

    const evitadaSub = simModo === 'retroativo'
      ? mesesPassados + 'm desde ' + dataLabel
      : meses + 'm a ' + (selicNum * 100).toFixed(2) + '%/mes'

    const liquidoTitulo = simModo === 'retroativo'
      ? 'Voce teria isto a mais HOJE'
      : 'Resultado liquido (caixa − parado + corrosao evitada)'

    const liquidoSub = simModo === 'retroativo'
      ? (liquido >= 0
          ? 'comparando com o cenario real (R$ ' + fmtBRLcurto(valorParadoBase) + ' ainda parados hoje em ' + produtosBase.length + ' produtos amostrados do top)'
          : 'manter teria sido melhor com esse desconto, mesmo retroativo')
      : (liquido >= 0
          ? 'liquidar VALE A PENA neste cenario'
          : 'manter parado seria melhor (desconto alto demais para o horizonte)')

    // Serie do grafico
    const labels = [], atual = [], cenario = []
    let titulo
    if (simModo === 'retroativo') {
      titulo = 'Linha do tempo: ' + mesesPassados + ' meses desde ' + dataLabel + ' ate hoje'
      for (let i = 0; i <= mesesPassados; i++) {
        labels.push('M-' + (mesesPassados - i))
        atual.push(valorParadoBase * Math.pow(1 + selicNum, i))
        cenario.push(caixaImediato * Math.pow(1 + selicNum, i) + capitalRestante * Math.pow(1 + selicNum, i))
      }
      labels[labels.length - 1] = 'HOJE'
    } else {
      titulo = 'Capital ao longo dos proximos ' + meses + ' meses'
      for (let j = 0; j <= meses; j++) {
        labels.push('M+' + j)
        atual.push(valorParadoBase * Math.pow(1 + selicNum, j))
        cenario.push(caixaImediato * Math.pow(1 + selicNum, j) + capitalRestante * Math.pow(1 + selicNum, j))
      }
    }

    return {
      caixaRecuperado, subCaixa, perdaDesc, corrosaoEvitada, evitadaSub,
      liquido, liquidoTitulo, liquidoSub, titulo, labels, atual, cenario,
      dataInfo,
    }
  }

  const sim = calcSim()

  // Render do grafico do simulador (port fiel). Reage a sim/chartReady.
  useEffect(() => {
    if (!chartReady || !sim || !refSim.current || !window.Chart) return
    if (instSim.current) instSim.current.destroy()
    const ctx = refSim.current.getContext('2d')
    instSim.current = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: sim.labels,
        datasets: [
          { label: 'Sem acao (capital empatado + corrosao)', data: sim.atual, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', fill: true, tension: 0.1, pointRadius: 2 },
          { label: 'Com acao (caixa + estoque restante)', data: sim.cenario, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)', fill: true, tension: 0.1, pointRadius: 2 },
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
    return () => { if (instSim.current) { instSim.current.destroy(); instSim.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, sim && sim.labels.join(','), sim && sim.atual.join(','), sim && sim.cenario.join(',')])

  // --- Aplica preset (port fiel do listener .sim-preset) --------------------
  const aplicarPreset = useCallback((idx) => {
    const p = SIM_PRESETS[idx]
    setSimModo('futuro') // cenarios sao para o futuro
    setSimPctLiq(p.liq)
    setSimPctDesc(p.desc)
    setSimMeses(p.meses)
    setSimPresetAtivo(idx)
  }, [])

  // --- Gate de permissao (BRIEF item 1) -------------------------------------
  if (!loading && !loadingPerm && userProfile && !temAcesso('financeiro')) return <SemPermissao />

  // ===== Derivados de exibicao: CAPITAL PARADO ==============================
  const cp = cpData
  const p = cp ? cp.parado : null
  // Familias do select (port fiel do innerHTML montado na fonte).
  const familiasDisp = cp ? (cp.familias_disponiveis || []) : []

  // ===== Derivados de exibicao: MARGEM ======================================
  const mg = mgData
  const tot = mg ? mg.totais : null
  // Cor da margem total (port fiel).
  function corMargem(pct) {
    return pct >= 30 ? 'text-emerald-700' : (pct >= 15 ? 'text-blue-700' : (pct >= 0 ? 'text-amber-700' : 'text-red-700'))
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-800 mb-4">Lucratividade</h1>

      {/* ===== CAPITAL PARADO ===== */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-800">Capital Parado em Estoque</h2>
          <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
            <label>Familia:</label>
            <select
              value={familia}
              onChange={(e) => { setFamilia(e.target.value); setCpReq((n) => n + 1) }}
              className="border border-slate-300 rounded px-2 py-1 bg-white min-w-[170px]"
            >
              <option value="">Todas</option>
              {cp && <option value="__TODAS_MAQUINAS__">⚙ Todas as maquinas</option>}
              {cp && <option value="__SO_PECAS__">🔩 So pecas</option>}
              {cp && <option disabled>──────────</option>}
              {familiasDisp.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <label className="ml-2">Sem giro ha:</label>
            <select
              value={diasSel}
              onChange={(e) => { setDiasSel(e.target.value); setCpReq((n) => n + 1) }}
              className="border border-slate-300 rounded px-2 py-1"
            >
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
              onKeyDown={(e) => { if (e.key === 'Enter') setCpReq((n) => n + 1) }}
              className="border border-slate-300 rounded px-2 py-1 w-16"
            />
            <button
              onClick={() => setCpReq((n) => n + 1)}
              className="ml-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >Aplicar</button>
          </div>
        </div>

        {/* Card destaque: CORROSAO SILENCIOSA */}
        <div className="bg-gradient-to-r from-red-900 to-amber-800 rounded-lg p-5 mb-4 text-white">
          <div className="flex items-baseline justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-widest text-red-100">💸 Corrosao patrimonial silenciosa</div>
              <div className="text-3xl font-bold mt-1">{cp ? fmtBRL(cp.custo_capital_total || 0) : '--'}</div>
              <div className="text-xs text-red-100 mt-1">
                {cp
                  ? 'ja consumido pelo capital empatado no estoque (SELIC acumulada x valor x tempo). '
                    + 'No estoque parado (>= ' + cp.parametros.dias_minimos + 'd): ' + fmtBRL(p.custo_capital_acumulado || 0)
                  : 'ja consumido pelo capital empatado no estoque (SELIC acumulada x valor x tempo parado)'}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs uppercase tracking-widest text-amber-100">Projecao + 12 meses</div>
              <div className="text-2xl font-bold mt-1">{cp ? fmtBRL(p.custo_oportunidade_ano || 0) : '--'}</div>
              <div className="text-xs text-amber-100">se nada mudar, mais isso sera queimado</div>
            </div>
          </div>
          <div className="text-[11px] text-red-100/80 mt-3 italic border-t border-red-700/50 pt-2">
            Sem boletos de armazenagem chegando, a empresa pode ter falsa sensacao de que "nao perde dinheiro".
            Mas a corrosao do patrimonio liquido acontece via DRE/balanco: cada dia parado e juros queimados que nao viram receita.
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Valor parado</div>
            <div className="text-2xl font-bold text-red-700 mt-1">{p ? fmtBRL(p.valor) : '--'}</div>
            <div className="text-xs text-slate-500">{cp ? 'sem giro ha ' + cp.parametros.dias_minimos + '+ dias' : '--'}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Custo de oportunidade</div>
            <div className="text-2xl font-bold text-amber-700 mt-1">{p ? fmtBRL(p.custo_oportunidade_mes) : '--'}</div>
            <div className="text-xs text-slate-500">
              {cp ? 'ano: ' + fmtBRL(p.custo_oportunidade_ano) + ' (' + cp.parametros.taxa_mensal_pct + '%/mes)' : 'por mes'}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Produtos parados</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{p ? String(p.qtd) : '--'}</div>
            <div className="text-xs text-slate-500">{cp ? 'de ' + cp.qtd_produtos + ' produtos' : 'de total'}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">% do estoque total</div>
            <div className="text-2xl font-bold text-orange-700 mt-1">{p ? p.pct_do_total + '%' : '--'}</div>
            <div className="text-xs text-slate-500">parado</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Distribuicao por dias sem giro</div>
            <div style={{ position: 'relative', height: '240px' }}><canvas ref={refBuckets} /></div>
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
                <tbody>
                  {(() => {
                    const linhas = cp ? (cp.top_parados || []).slice(0, 20) : []
                    if (linhas.length === 0) {
                      return <tr><td colSpan={5} className="px-2 py-4 text-center text-slate-500">Sem produtos no criterio.</td></tr>
                    }
                    return linhas.map((t, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-2 py-1 truncate max-w-[220px]" title={t.descricao || ''}>{t.descricao || '(sem nome)'}</td>
                        <td className="px-2 py-1 text-right">{t.estoque_qty.toFixed(0)}</td>
                        <td className="px-2 py-1 text-right">{t.dias_sem_giro >= 99998 ? '∞' : t.dias_sem_giro}</td>
                        <td className="px-2 py-1 text-right font-medium">{fmtBRLcurto(t.valor_estoque)}</td>
                        <td className="px-2 py-1 text-right text-red-700">{t.custo_capital > 0 ? fmtBRLcurto(t.custo_capital) : '-'}</td>
                      </tr>
                    ))
                  })()}
                </tbody>
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
            <select
              value={mesesMargem}
              onChange={(e) => setMesesMargem(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1"
            >
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
            <select
              value={granMargem}
              onChange={(e) => setGranMargem(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1"
            >
              <option value="mes">Mes</option>
              <option value="semestre">Semestre</option>
              <option value="ano">Ano</option>
            </select>
            <span className="ml-2 text-amber-700">
              {tot ? '(' + tot.qtd + ' itens, ' + tot.cobertura_cmc_pct + '% com CMC)' : ''}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Receita total</div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">{tot ? fmtBRL(tot.receita) : '--'}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">CMV (custo)</div>
            <div className="text-2xl font-bold text-red-700 mt-1">{tot ? fmtBRL(tot.cmv) : '--'}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Lucro bruto</div>
            <div className="text-2xl font-bold text-blue-700 mt-1">{tot ? fmtBRL(tot.lucro) : '--'}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Margem %</div>
            <div className={tot ? 'text-2xl font-bold mt-1 ' + corMargem(tot.margem_pct) : 'text-2xl font-bold mt-1'}>
              {tot ? tot.margem_pct + '%' : '--'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-lg border border-slate-200 p-4 md:col-span-2">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Margem mensal (receita vs CMV + linha %)</div>
            <div style={{ position: 'relative', height: '300px' }}><canvas ref={refMargem} /></div>
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
                <tbody>
                  {(() => {
                    const fams = mg ? (mg.familias || []) : []
                    if (fams.length === 0) {
                      return <tr><td colSpan={3} className="px-2 py-4 text-center text-slate-500">Sem dados.</td></tr>
                    }
                    return fams.map((f, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-2 py-1">{f.familia}</td>
                        <td className="px-2 py-1 text-right">{fmtBRLcurto(f.receita)}</td>
                        <td className={'px-2 py-1 text-right font-medium ' + corMargem(f.margem_pct)}>{f.margem_pct}%</td>
                      </tr>
                    ))
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SIMULADOR WHAT-IF (futuro ou retroativo) ===== */}
      <section className="mb-8 mt-8">
        <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-slate-800">🎯 Simulador "E se eu liquidasse o estoque parado?"</h2>
          <div className="text-xs text-slate-500">cenarios futuros ou retroativos</div>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-4">
          {/* Toggle modo */}
          <div className="flex items-center gap-2 mb-3 text-xs flex-wrap">
            <span className="text-slate-600">Modo:</span>
            <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm">
              <button
                type="button"
                onClick={() => setSimModo('futuro')}
                className={simModo === 'futuro' ? 'px-3 py-1 transition bg-slate-800 text-white' : 'px-3 py-1 transition bg-white text-slate-700 hover:bg-slate-100'}
              >Futuro (a partir de hoje)</button>
              <button
                type="button"
                onClick={() => setSimModo('retroativo')}
                className={(simModo === 'retroativo' ? 'px-3 py-1 transition bg-slate-800 text-white' : 'px-3 py-1 transition bg-white text-slate-700 hover:bg-slate-100') + ' border-l border-slate-300'}
              >Retroativo (data passada)</button>
            </div>
            <span className="text-slate-500 italic ml-2">
              {simModo === 'futuro'
                ? 'Simulando o que aconteceria se voce liquidasse HOJE com horizonte de N meses adiante.'
                : 'Simulando o que voce TERIA HOJE se tivesse liquidado naquela data passada. So considera produtos que ja estavam em estoque na epoca.'}
            </span>
          </div>

          {/* Cenarios pre-definidos */}
          <div className="flex items-center gap-2 mb-4 text-xs flex-wrap border-t border-slate-200 pt-3">
            <span className="text-slate-600 font-semibold">Cenarios:</span>
            {SIM_PRESETS.map((preset, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => aplicarPreset(idx)}
                title={preset.titulo}
                className={'sim-preset px-2 py-1 border rounded ' + preset.classes + (simPresetAtivo === idx ? ' ring-2 ring-slate-900' : '')}
              >
                {preset.label}<br /><span className="text-[10px] font-normal">{preset.liq}% liq · {preset.desc}% desc · {preset.meses}m</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Controles */}
            <div>
              <div className="mb-4">
                <label className="text-xs text-slate-600 flex justify-between"><span>% do estoque parado a liquidar</span><b className="text-blue-700">{Number(simPctLiq).toFixed(0)}%</b></label>
                <input type="range" min="0" max="100" step="5" value={simPctLiq}
                  onChange={(e) => { setSimPctLiq(Number(e.target.value)); setSimPresetAtivo(-1) }}
                  className="w-full mt-1" />
              </div>
              <div className="mb-4">
                <label className="text-xs text-slate-600 flex justify-between"><span>% de desconto na liquidacao</span><b className="text-orange-700">{Number(simPctDesc).toFixed(0)}%</b></label>
                <input type="range" min="0" max="70" step="5" value={simPctDesc}
                  onChange={(e) => { setSimPctDesc(Number(e.target.value)); setSimPresetAtivo(-1) }}
                  className="w-full mt-1" />
              </div>
              <div className={'mb-4 ' + (simModo === 'retroativo' ? 'hidden' : '')}>
                <label className="text-xs text-slate-600 flex justify-between"><span>Horizonte de analise (meses)</span><b className="text-slate-700">{simMeses}</b></label>
                <input type="range" min="3" max="36" step="3" value={simMeses}
                  onChange={(e) => { setSimMeses(Number(e.target.value)); setSimPresetAtivo(-1) }}
                  className="w-full mt-1" />
              </div>
              <div className={'mb-2 ' + (simModo === 'retroativo' ? '' : 'hidden')}>
                <label className="text-xs text-slate-600 block mb-1">Data da decisao hipotetica</label>
                <input type="month" value={simDataPassada}
                  onChange={(e) => setSimDataPassada(e.target.value)}
                  className="border border-slate-300 rounded px-2 py-1 text-sm w-full" />
                <div className="text-[11px] text-slate-500 mt-1">{sim ? sim.dataInfo : ''}</div>
              </div>
              <div className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                Premissas: liquidacao gera caixa imediato (preco × (1−desconto)). Capital liberado deixa de "queimar" SELIC mensalmente.
                Desconto e perda real no momento, mas evita corrosao futura silenciosa.
              </div>
            </div>

            {/* Resultado */}
            <div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-emerald-50 border border-emerald-200 rounded p-3">
                  <div className="text-[10px] uppercase text-emerald-800 tracking-wide">Caixa recuperado</div>
                  <div className="text-lg font-bold text-emerald-900 mt-0.5">{sim ? fmtBRL(sim.caixaRecuperado) : '--'}</div>
                  <div className="text-[10px] text-emerald-700">{sim ? sim.subCaixa : ''}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <div className="text-[10px] uppercase text-red-800 tracking-wide">Perda no desconto</div>
                  <div className="text-lg font-bold text-red-900 mt-0.5">{sim ? fmtBRL(sim.perdaDesc) : '--'}</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded p-3">
                  <div className="text-[10px] uppercase text-amber-800 tracking-wide">Corrosao evitada</div>
                  <div className="text-lg font-bold text-amber-900 mt-0.5">{sim ? fmtBRL(sim.corrosaoEvitada) : '--'}</div>
                  <div className="text-[10px] text-amber-700">{sim ? sim.evitadaSub : 'no horizonte'}</div>
                </div>
              </div>
              <div className="bg-gradient-to-r from-slate-900 to-blue-900 rounded p-4 text-white">
                <div className="text-xs uppercase tracking-widest text-slate-300">{sim ? sim.liquidoTitulo : 'Resultado liquido'}</div>
                <div className={'text-3xl font-bold mt-1 ' + (sim ? (sim.liquido >= 0 ? 'text-emerald-300' : 'text-red-300') : '')}>
                  {sim ? (sim.liquido >= 0 ? '+' : '') + fmtBRL(sim.liquido) : '--'}
                </div>
                <div className="text-xs text-slate-300 mt-1">{sim ? sim.liquidoSub : ''}</div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">{sim ? sim.titulo : 'Capital parado ao longo do tempo'}</div>
            <div style={{ position: 'relative', height: '200px' }}><canvas ref={refSim} /></div>
          </div>
        </div>
      </section>
    </>
  )
}
