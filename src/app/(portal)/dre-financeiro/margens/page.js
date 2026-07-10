'use client'
// =============================================================================
// Tela Margens (port FIEL de views/margens.ejs do financeiro-omie-dashboard).
//
// Mostra a margem REAL por venda historica: Receita − (CMV + Capital empatado
// ate a venda).
//
// A visualizacao INICIAL e um seletor com dois retangulos verticais:
//   - FAMILIA: media de margem atual de cada familia (cards); clicar numa
//     familia abre um popup com os valores e datas que compoem aquela media.
//   - DATA: todos os meses do periodo e a variacao da margem de todas as
//     familias de MAQUINAS (pecas desmarcado por padrao, com checkbox).
// A visualizacao classica (tabela detalhada) continua acessivel por um link
// discreto abaixo do seletor. Conteudo classico:
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
  const { temAcesso, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
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
  // Familia inicia em "Todas as maquinas" (pecas fora por padrao).
  const [familia, setFamilia] = useState('__TODAS_MAQUINAS__')
  const [busca, setBusca] = useState('')
  const [faixa, setFaixa] = useState('')

  // ===== Ordenacao + paginacao ==============================================
  const [ordem, setOrdem] = useState({ campo: 'margem_pct', dir: 'asc' })
  const [pagina, setPagina] = useState(1)

  // ===== Modal de detalhe ===================================================
  const [detalhe, setDetalhe] = useState(null)

  // ===== Visao (seletor inicial) ============================================
  // '' = seletor com os dois retangulos; 'familia' | 'data' | 'tabela' (classica)
  const [visao, setVisao] = useState('')
  const [famSel, setFamSel] = useState(null)              // familia aberta no popup
  const [incluirPecas, setIncluirPecas] = useState(false) // visao DATA: pecas desmarcado

  // "Margens evoluindo" (mesmo container da Analise do DRE) na visao DATA:
  // toggle %/R$ e mes "explodido" no popup de composicao (maquinas do mes).
  const [margemModoEvo, setMargemModoEvo] = useState('pct') // 'pct' | 'rs'
  const [mesSel, setMesSel] = useState(null)                // 'YYYY-MM' aberto no popup
  const [mesSelFam, setMesSelFam] = useState(null)          // familia do ponto clicado no grafico por familia (null = todas)

  // Tabela meses x familias: celulas em margem % (bruta+liquida) ou em valores
  // R$ de venda x custo ("opcao de visualizar valores de custo e venda").
  const [dataTabModo, setDataTabModo] = useState('pct')     // 'pct' | 'valores'

  // Ordenacao das tabelas dos popups: padrao por margem liquida (piores
  // primeiro); qualquer cabecalho ordena asc/desc ao clicar.
  const [popOrdem, setPopOrdem] = useState({ campo: 'margem_pct', dir: 'asc' })
  const abrirPopupOrdemPadrao = () => setPopOrdem({ campo: 'margem_pct', dir: 'asc' })

  // Insumos do rateio de despesas (margem liquida DRE): despesas do mes +
  // faturamento de servicos, vindos de /api/dre-financeiro/margens/rateio.
  const [rateio, setRateio] = useState(null) // { porMes: { 'YYYY-MM': { despesas, servicos } } }

  // Ref do grafico mensal
  const refChart = useRef(null)
  const instChart = useRef(null)

  // Ref do grafico da visao DATA (margem % por familia ao longo dos meses)
  const refChartData = useRef(null)
  const instChartData = useRef(null)

  // Ref do grafico "Margens evoluindo" (bruta x liquida mensal, visao DATA)
  const refChartEvo = useRef(null)
  const instChartEvo = useRef(null)

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

  // Busca os insumos do rateio (despesas + servicos por mes) para o intervalo
  // de meses efetivamente carregado. Falha silenciosa: sem rateio a tela
  // continua mostrando bruta + liquida real (colunas DRE ficam ocultas).
  useEffect(() => {
    if (!dados) { setRateio(null); return }
    const itens = dados.itens || []
    const mesesTodos = [...new Set(itens.map((it) => it.ano + '-' + String(it.mes).padStart(2, '0')))].sort()
    if (!mesesTodos.length) { setRateio(null); return }
    fetch('/api/dre-financeiro/margens/rateio?conta=' + (dados.conta || conta)
      + '&desde=' + mesesTodos[0] + '&ate=' + mesesTodos[mesesTodos.length - 1])
      .then((r) => r.json())
      .then((d) => { setRateio(d && !d.erro && d.porMes ? d : null) })
      .catch(() => setRateio(null))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados])

  // =========================================================================
  // Lista filtrada (port fiel de filtrados()).
  // =========================================================================
  const filtrados = todos.filter((it) => {
    if (familia === '__TODAS_MAQUINAS__') { if (ehPeca(it.familia)) return false }
    else if (familia === '__SO_PECAS__') { if (!ehPeca(it.familia)) return false }
    else if (familia && it.familia !== familia) return false
    const b = busca.trim().toLowerCase()
    if (b && !(String(it.codigo_produto).toLowerCase().includes(b)
      || String(it.sku || '').toLowerCase().includes(b)
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

  // Tecla Esc fecha o modal de detalhe; se ja fechado, fecha os popups
  // (familia da visao FAMILIA / composicao do mes da visao DATA).
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      setDetalhe((d) => { if (!d) { setFamSel(null); setMesSel(null); setMesSelFam(null) } return null })
    }
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

  // =========================================================================
  // Rateio de despesas (margem liquida DRE): para cada mes, fd = despesas /
  // (receita TOTAL vendida no mes — maquinas + pecas, sem filtro — + servicos
  // faturados). A despesa rateada de uma venda e receita_da_venda × fd: as
  // despesas sustentam a operacao inteira, entao o denominador e tudo que
  // faturou, nao so o recorte filtrado na tela.
  // =========================================================================
  const fdPorMes = (() => {
    if (!rateio || !rateio.porMes) return null
    const recMes = {}
    todos.forEach((it) => {
      const k = it.ano + '-' + String(it.mes).padStart(2, '0')
      recMes[k] = (recMes[k] || 0) + it.receita
    })
    const out = {}
    Object.keys(recMes).forEach((k) => {
      const r = rateio.porMes[k]
      if (!r) return
      const denom = recMes[k] + (Number(r.servicos) || 0)
      if (denom > 0) out[k] = { fd: (Number(r.despesas) || 0) / denom, despesas: Number(r.despesas) || 0, servicos: Number(r.servicos) || 0, denom }
    })
    return Object.keys(out).length ? out : null
  })()
  // Despesa do mes atribuida a UMA venda (null quando o rateio nao carregou).
  function despesaRateada(it) {
    if (!fdPorMes) return null
    const f = fdPorMes[it.ano + '-' + String(it.mes).padStart(2, '0')]
    return f ? it.receita * f.fd : null
  }
  // Margem liquida DRE de uma venda (%): (lucro real − despesa rateada)/receita.
  function margemDrePct(it) {
    const d = despesaRateada(it)
    if (d === null || !(it.receita > 0)) return null
    return ((it.margem_real - d) / it.receita) * 100
  }

  // =========================================================================
  // Visao FAMILIA: agregacao por familia sobre TODAS as vendas do periodo.
  // Margem media ponderada (lucro/receita), igual ao calculo dos KPIs.
  // =========================================================================
  const porFamilia = (() => {
    const map = {}
    todos.forEach((it) => {
      const f = it.familia || '(sem familia)'
      if (!map[f]) map[f] = { familia: f, qtd: 0, receita: 0, cmv: 0, custo: 0, lucro: 0, desp: 0 }
      map[f].qtd += 1
      map[f].receita += it.receita
      map[f].cmv += it.cmv
      map[f].custo += it.cmv + it.custo_capital
      map[f].lucro += it.margem_real
      map[f].desp += despesaRateada(it) || 0
    })
    const arr = Object.values(map)
    arr.forEach((x) => {
      x.margem_pct = x.receita > 0 ? +((x.lucro / x.receita) * 100).toFixed(1) : 0
      x.bruta_pct = x.receita > 0 ? +(((x.receita - x.cmv) / x.receita) * 100).toFixed(1) : 0
      x.dre_pct = fdPorMes && x.receita > 0 ? +(((x.lucro - x.desp) / x.receita) * 100).toFixed(1) : null
    })
    arr.sort((a, b) => b.receita - a.receita)
    return arr
  })()

  // =========================================================================
  // Ordenacao das tabelas dos popups (cabecalhos clicaveis A-Z / Z-A).
  // 'data' ordena cronologicamente (dd/mm/yyyy -> yyyymmdd); 'margem_bruta_pct'
  // e calculada na hora (nao vem da API).
  // =========================================================================
  function valorOrdPopup(it, campo) {
    if (campo === 'data') {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(String(it.data_pedido || ''))
      if (m) return Number(m[3]) * 10000 + Number(m[2]) * 100 + Number(m[1])
      return (it.ano || 0) * 10000 + (it.mes || 0) * 100
    }
    if (campo === 'margem_bruta_pct') return it.receita > 0 ? ((it.receita - it.cmv) / it.receita) * 100 : -Infinity
    if (campo === 'margem_dre_pct') { const v = margemDrePct(it); return v === null ? -Infinity : v }
    return it[campo]
  }
  function ordenarPopup(arr) {
    const dirP = popOrdem.dir === 'asc' ? 1 : -1
    return arr.slice().sort((a, b) => {
      let va = valorOrdPopup(a, popOrdem.campo), vb = valorOrdPopup(b, popOrdem.campo)
      if (va === null || va === undefined) va = -Infinity
      if (vb === null || vb === undefined) vb = -Infinity
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dirP
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * dirP
    })
  }
  // Cabecalho ordenavel dos popups (▲/▼ na coluna ativa, ⇅ nas demais).
  function ThPop({ campo, rotulo, dirTexto, title }) {
    const atual = popOrdem.campo === campo
    return (
      <th
        title={title}
        className={(dirTexto === 'left' ? 'text-left' : 'text-right') + ' px-3 py-2 cursor-pointer hover:bg-slate-100 whitespace-nowrap select-none'}
        onClick={() => setPopOrdem((o) => o.campo === campo ? { campo, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { campo, dir: 'asc' })}
      >
        {rotulo} {atual
          ? <span className="text-slate-700">{popOrdem.dir === 'asc' ? '▲' : '▼'}</span>
          : <span className="text-slate-300">⇅</span>}
      </th>
    )
  }

  // Vendas que compoem a media da familia aberta no popup (ordenacao pelos
  // cabecalhos; padrao = margem liquida, piores primeiro).
  const vendasFamSel = famSel
    ? ordenarPopup(todos.filter((it) => (it.familia || '(sem familia)') === famSel))
    : []
  const aggFamSel = famSel ? porFamilia.find((x) => x.familia === famSel) : null

  // =========================================================================
  // Visao DATA: matriz mes x familia (por padrao SO maquinas; pecas entram
  // com o checkbox "Incluir pecas"). Celula = margem % ponderada do mes.
  // =========================================================================
  const dataView = (() => {
    if (visao !== 'data') return { mesesArr: [], famsArr: [], celulas: {}, evolucao: [] }
    const famsSet = new Set()
    const mesesSet = new Set()
    const celulas = {}
    const recFam = {}
    const porMes = {}
    todos.forEach((it) => {
      const f = it.familia || '(sem familia)'
      if (!incluirPecas && ehPeca(f)) return
      const m = it.ano + '-' + String(it.mes).padStart(2, '0')
      famsSet.add(f)
      mesesSet.add(m)
      recFam[f] = (recFam[f] || 0) + it.receita
      const ck = f + '|' + m
      if (!celulas[ck]) celulas[ck] = { receita: 0, cmv: 0, lucro: 0, qtd: 0 }
      celulas[ck].receita += it.receita
      celulas[ck].cmv += it.cmv
      celulas[ck].lucro += it.margem_real
      celulas[ck].qtd += 1
      // Totais do mes p/ "Margens evoluindo": bruta = receita − CMV;
      // liquida (real) = receita − CMV − capital empatado.
      if (!porMes[m]) porMes[m] = { receita: 0, cmv: 0, capital: 0, qtd: 0 }
      porMes[m].receita += it.receita
      porMes[m].cmv += it.cmv
      porMes[m].capital += it.custo_capital
      porMes[m].qtd += 1
    })
    Object.values(celulas).forEach((c2) => {
      c2.margem_pct = c2.receita > 0 ? +((c2.lucro / c2.receita) * 100).toFixed(1) : 0
      c2.bruta_pct = c2.receita > 0 ? +(((c2.receita - c2.cmv) / c2.receita) * 100).toFixed(1) : 0
      c2.custo = c2.receita - c2.lucro // CMV + capital do mes
    })
    const famsArr = [...famsSet].sort((a, b) => (recFam[b] || 0) - (recFam[a] || 0))
    const mesesArr = [...mesesSet].sort()
    const evolucao = mesesArr.map((m) => {
      const x = porMes[m]
      const lucroBruto = x.receita - x.cmv
      const lucroLiq = x.receita - x.cmv - x.capital
      // Liquida DRE do subconjunto exibido: despesa atribuida = fd × receita.
      const fdM = fdPorMes ? fdPorMes[m] : null
      const lucroDre = fdM ? lucroLiq - x.receita * fdM.fd : null
      return {
        mes: m, qtd: x.qtd, receita: x.receita, cmv: x.cmv, capital: x.capital,
        lucroBruto, lucroLiq, lucroDre,
        brutaPct: x.receita > 0 ? +((lucroBruto / x.receita) * 100).toFixed(1) : null,
        liqPct: x.receita > 0 ? +((lucroLiq / x.receita) * 100).toFixed(1) : null,
        drePct: fdM && x.receita > 0 ? +((lucroDre / x.receita) * 100).toFixed(1) : null,
      }
    })
    return { mesesArr, famsArr, celulas, evolucao }
  })()

  // Vendas que compoem o mes "explodido". Se veio de um clique numa bolinha do
  // grafico por familia, filtra tambem pela familia (mesSelFam); senao, mesmo
  // filtro da visao DATA (pecas so com o checkbox). E onde se ve por quanto a
  // maquina deveria ter sido vendida para ficar positiva.
  const vendasMesSel = mesSel ? ordenarPopup(todos.filter((it) => {
    const f = it.familia || '(sem familia)'
    if (mesSelFam) { if (f !== mesSelFam) return false }
    else if (!incluirPecas && ehPeca(f)) return false
    return (it.ano + '-' + String(it.mes).padStart(2, '0')) === mesSel
  })) : []
  const aggMesSel = (() => {
    if (!mesSel || vendasMesSel.length === 0) return null
    const t2 = vendasMesSel.reduce((s, it) => {
      s.receita += it.receita; s.cmv += it.cmv; s.capital += it.custo_capital
      s.desp += despesaRateada(it) || 0
      return s
    }, { receita: 0, cmv: 0, capital: 0, desp: 0 })
    const lucroBruto = t2.receita - t2.cmv
    const lucroLiq = lucroBruto - t2.capital
    return {
      ...t2, lucroBruto, lucroLiq,
      brutaPct: t2.receita > 0 ? +((lucroBruto / t2.receita) * 100).toFixed(1) : 0,
      liqPct: t2.receita > 0 ? +((lucroLiq / t2.receita) * 100).toFixed(1) : 0,
      drePct: fdPorMes && t2.receita > 0 ? +(((lucroLiq - t2.desp) / t2.receita) * 100).toFixed(1) : null,
      lucroDre: fdPorMes ? lucroLiq - t2.desp : null,
    }
  })()

  // Grafico "Margens evoluindo" (mesmo container/estilo da Analise do DRE):
  // linhas Margem Bruta e Margem Liquida (real) por mes, toggle %/R$, escala
  // de leitura -35%..+30% com linha do zero destacada. Clicar num mes abre o
  // popup de composicao (maquinas do mes + venda minima p/ ficar positivo).
  useEffect(() => {
    if (visao !== 'data') {
      if (instChartEvo.current) { instChartEvo.current.destroy(); instChartEvo.current = null }
      return
    }
    if (!chartReady || !refChartEvo.current || !window.Chart) return
    const arr = dataView.evolucao
    const mesesArr = dataView.mesesArr
    const emRS = margemModoEvo === 'rs'
    const mBruta = arr.map((x) => emRS ? x.lucroBruto : x.brutaPct)
    const mLiq = arr.map((x) => emRS ? x.lucroLiq : x.liqPct)
    const mDre = arr.map((x) => emRS ? x.lucroDre : x.drePct)
    const temDre = mDre.some((v) => v !== null && v !== undefined)

    // Escala do eixo Y em % (-35 a +30 como piso/teto de leitura — port fiel
    // de escalaMargens da Analise do DRE).
    let esc = null
    if (!emRS) {
      const vals = []
      mBruta.concat(mLiq, temDre ? mDre : []).forEach((v) => { if (v !== null && v !== undefined && isFinite(v)) vals.push(v) })
      if (vals.length) {
        const lo = Math.max(-35, Math.floor(Math.min(Math.min.apply(null, vals), 0) / 5) * 5)
        const hi = Math.min(30, Math.ceil(Math.max(Math.max.apply(null, vals), 0) / 5) * 5)
        esc = { min: lo, max: hi }
      }
    }
    const sufixo = emRS ? '' : ' %'

    if (instChartEvo.current) instChartEvo.current.destroy()
    const ctx = refChartEvo.current.getContext('2d')
    const datasetsEvo = [
      { type: 'line', label: (emRS ? 'Lucro Bruto' : 'Margem Bruta') + sufixo, data: mBruta, borderColor: '#1e293b', backgroundColor: 'rgba(30,41,59,0.05)', borderWidth: 2, pointRadius: 3, tension: 0.2, fill: false },
      { type: 'line', label: (emRS ? 'Lucro Líquido (real)' : 'Margem Líquida (real)') + sufixo, data: mLiq, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.05)', borderWidth: 2, pointRadius: 3, tension: 0.2, fill: false },
    ]
    // Liquida DRE (com despesas rateadas): so quando o rateio carregou.
    if (temDre) datasetsEvo.push(
      { type: 'line', label: (emRS ? 'Lucro Líquido DRE' : 'Margem Líquida DRE') + sufixo, data: mDre, borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.05)', borderWidth: 2, pointRadius: 3, tension: 0.2, fill: false, spanGaps: true }
    )
    instChartEvo.current = new window.Chart(ctx, {
      data: {
        labels: mesesArr,
        datasets: datasetsEvo,
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        onClick: function (evt, elements) {
          if (elements && elements.length) {
            const m = mesesArr[elements[0].index]
            if (m) { setMesSelFam(null); setMesSel(m); abrirPopupOrdemPadrao() }
          }
        },
        onHover: function (evt, elements) {
          if (evt.native && evt.native.target) evt.native.target.style.cursor = elements.length ? 'pointer' : 'default'
        },
        scales: {
          x: { ticks: { autoSkip: false, maxRotation: 90, minRotation: 0, font: { size: 9 } } },
          y: {
            position: 'left',
            min: esc ? esc.min : undefined,
            max: esc ? esc.max : undefined,
            ticks: emRS
              ? { callback: function (v) { return fmtBRLcurto(v) } }
              : { stepSize: 5, callback: function (v) { return v.toFixed(0) + '%' } },
            grid: { color: function (c2) { return c2.tick.value === 0 ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)' } },
          },
        },
        plugins: {
          legend: { labels: { boxWidth: 12, padding: 10 } },
          tooltip: { callbacks: { label: function (item) {
            if (item.raw === null) return item.dataset.label + ': n/d'
            return item.dataset.label + ': ' + (emRS ? fmtBRL(item.raw) : Number(item.raw).toFixed(1) + '%')
          } } },
        },
      },
    })
    return () => { if (instChartEvo.current) { instChartEvo.current.destroy(); instChartEvo.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, visao, incluirPecas, margemModoEvo, JSON.stringify(dataView.evolucao)])

  // Paleta de cores das linhas por familia (visao DATA).
  const PALETA = ['#2563eb', '#059669', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#65a30d', '#475569', '#ea580c', '#0d9488', '#9333ea']

  // Grafico da visao DATA: uma linha de margem % por familia, meses no eixo X.
  // Bolinhas CLICAVEIS (abrem a composicao familia+mes); linhas finas, retas e
  // sem spanGaps — as retas longas ligando meses distantes eram o que mais
  // sobrepunha o grafico (familias com vendas esparsas cruzavam tudo).
  useEffect(() => {
    if (visao !== 'data') {
      if (instChartData.current) { instChartData.current.destroy(); instChartData.current = null }
      return
    }
    if (!chartReady || !refChartData.current || !window.Chart) return
    const { mesesArr, famsArr, celulas } = dataView
    if (instChartData.current) instChartData.current.destroy()
    const ctx = refChartData.current.getContext('2d')
    instChartData.current = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: mesesArr,
        datasets: famsArr.map((f, i) => ({
          label: f,
          data: mesesArr.map((m) => { const c2 = celulas[f + '|' + m]; return c2 ? c2.margem_pct : null }),
          borderColor: PALETA[i % PALETA.length],
          backgroundColor: PALETA[i % PALETA.length],
          borderWidth: 1.5, pointRadius: 5, pointHoverRadius: 8, pointHitRadius: 10,
          tension: 0, spanGaps: false,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        // intersect: true = tooltip/clique SO em cima da bolinha (clicavel).
        interaction: { mode: 'nearest', intersect: true },
        onClick: function (evt, elements) {
          if (elements && elements.length) {
            const f = famsArr[elements[0].datasetIndex]
            const m = mesesArr[elements[0].index]
            if (f && m) { setMesSelFam(f); setMesSel(m); abrirPopupOrdemPadrao() }
          }
        },
        onHover: function (evt, elements) {
          if (evt.native && evt.native.target) evt.native.target.style.cursor = elements.length ? 'pointer' : 'default'
        },
        scales: { y: { title: { display: true, text: 'Margem %' }, ticks: { callback: function (v) { return v + '%' } } } },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
          tooltip: { callbacks: {
            label: function (item) { return item.dataset.label + ': ' + item.raw + '%' },
            footer: function () { return 'Clique para ver as vendas' },
          } },
        },
      },
    })
    return () => { if (instChartData.current) { instChartData.current.destroy(); instChartData.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, visao, incluirPecas, JSON.stringify(dataView.mesesArr), JSON.stringify(dataView.famsArr), JSON.stringify(Object.values(dataView.celulas).map((c2) => c2.margem_pct))])

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
    // 'visao' entra nas deps: o canvas so existe na visualizacao classica.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, familia, visao, JSON.stringify(arrMensal.map((m) => [m.rotulo, m.receita, m.cmv, m.capital, m.margem_pct]))])

  // --- Gate de permissao (BRIEF item 1) -------------------------------------
  if (!loading && !loadingPerm && userProfile && (!temAcesso('financeiro') && !pode('dre', 'margens'))) return <SemPermissao />

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

      {/* ===== Seletor inicial: dois retangulos verticais ==================== */}
      {visao === '' && (
        <div className="mt-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <button
              onClick={() => setVisao('familia')}
              className="group bg-white border-2 border-slate-200 rounded-2xl p-8 min-h-[340px] flex flex-col items-center justify-center gap-4 hover:border-blue-500 hover:shadow-lg transition-all"
            >
              <div className="text-5xl">🚜</div>
              <div className="text-2xl font-bold tracking-widest text-slate-800 group-hover:text-blue-700">FAMILIA</div>
              <p className="text-sm text-slate-500 text-center leading-relaxed">
                Margem media atual de cada familia.<br />
                Clique numa familia para ver os valores e datas que compoem a media.
              </p>
            </button>
            <button
              onClick={() => setVisao('data')}
              className="group bg-white border-2 border-slate-200 rounded-2xl p-8 min-h-[340px] flex flex-col items-center justify-center gap-4 hover:border-blue-500 hover:shadow-lg transition-all"
            >
              <div className="text-5xl">📅</div>
              <div className="text-2xl font-bold tracking-widest text-slate-800 group-hover:text-blue-700">DATA</div>
              <p className="text-sm text-slate-500 text-center leading-relaxed">
                Todos os meses e a variacao da margem<br />
                de todas as familias de maquinas (pecas opcionais).
              </p>
            </button>
          </div>
          <div className="text-center mt-5">
            <button
              onClick={() => setVisao('tabela')}
              className="text-xs text-slate-500 underline hover:text-slate-700"
            >Ver tabela detalhada de vendas (visualizacao classica)</button>
          </div>
        </div>
      )}

      {/* ===== Visao FAMILIA: media atual de cada familia ==================== */}
      {visao === 'familia' && (
        <div>
          <button
            onClick={() => setVisao('')}
            className="mb-3 text-xs px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100 text-slate-600"
          >← Escolher visualizacao</button>
          {!dados ? (
            <div className="text-sm text-slate-500 py-8 text-center">Carregando...</div>
          ) : porFamilia.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">Nenhuma venda no periodo.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {porFamilia.map((f) => (
                <button
                  key={f.familia}
                  onClick={() => { setFamSel(f.familia); abrirPopupOrdemPadrao() }}
                  className="bg-white border border-slate-200 rounded-lg p-4 text-left hover:border-blue-400 hover:shadow transition-all"
                >
                  <div className="text-xs text-slate-500 truncate" title={f.familia}>
                    {ehPeca(f.familia) ? '🔩 ' : '⚙ '}{f.familia}
                  </div>
                  <div className={'text-2xl font-bold mt-1 ' + corMargem(f.margem_pct)}>{f.margem_pct.toFixed(1)}%</div>
                  <div className="text-[11px] text-slate-500">
                    líquida (real) · bruta <b className={corMargem(f.bruta_pct)}>{f.bruta_pct.toFixed(1)}%</b>
                    {f.dre_pct !== null && <> · DRE <b className={corMargem(f.dre_pct)}>{f.dre_pct.toFixed(1)}%</b></>}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {f.qtd} vendas · venda <span className="text-emerald-700">{fmtBRLcurto(f.receita)}</span> · custo <span className="text-red-700">{fmtBRLcurto(f.custo)}</span>
                  </div>
                  <div className={'text-[11px] ' + corMargem(f.margem_pct)}>{fmtBRLcurto(f.lucro)} lucro</div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== Visao DATA: meses x variacao das familias de maquinas ========= */}
      {visao === 'data' && (
        <div>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <button
              onClick={() => setVisao('')}
              className="text-xs px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100 text-slate-600"
            >← Escolher visualizacao</button>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={incluirPecas}
                onChange={(e) => setIncluirPecas(e.target.checked)}
              />
              Incluir pecas
            </label>
            <span className="text-xs text-slate-500">
              {dataView.mesesArr.length} meses · {dataView.famsArr.length} familias
            </span>
          </div>
          {!dados ? (
            <div className="text-sm text-slate-500 py-8 text-center">Carregando...</div>
          ) : dataView.mesesArr.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">Nenhuma venda no periodo.</div>
          ) : (
            <>
              {/* Margens evoluindo (mesmo container da Analise do DRE). Clique
                  num mes para explodir a composicao (maquinas + venda minima). */}
              <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4">
                <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    Margens evoluindo ({margemModoEvo === 'rs' ? 'R$' : '%'})
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="inline-flex rounded border border-slate-300 overflow-hidden" title="Margens em % da receita ou em valor (R$)">
                      <button onClick={() => setMargemModoEvo('pct')} className={'px-2 py-0.5 text-[10px] ' + (margemModoEvo === 'pct' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}>%</button>
                      <button onClick={() => setMargemModoEvo('rs')} className={'px-2 py-0.5 text-[10px] border-l border-slate-300 ' + (margemModoEvo === 'rs' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}>R$</button>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Bruta = Receita − CMV · Líquida (real) = − Capital · Líquida DRE = − despesas do mês rateadas pela receita total (máquinas + peças + serviços) · clique num mês para explodir
                    </div>
                  </div>
                </div>
                <div style={{ height: '280px', position: 'relative' }}><canvas ref={refChartEvo} /></div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4">
                <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                  Margem % mensal por familia{incluirPecas ? '' : ' (so maquinas)'}
                </div>
                <div style={{ position: 'relative', height: '340px' }}><canvas ref={refChartData} /></div>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs uppercase tracking-wide text-slate-500">
                    Meses x familias — {dataTabModo === 'pct' ? 'margem bruta e liquida' : 'valores de venda e custo'}
                  </span>
                  <div className="inline-flex rounded border border-slate-300 overflow-hidden" title="Celulas em margem % (bruta + liquida) ou em valores R$ (venda x custo)">
                    <button
                      onClick={() => setDataTabModo('pct')}
                      className={'px-2 py-0.5 text-[10px] ' + (dataTabModo === 'pct' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}
                    >Margem %</button>
                    <button
                      onClick={() => setDataTabModo('valores')}
                      className={'px-2 py-0.5 text-[10px] border-l border-slate-300 ' + (dataTabModo === 'valores' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}
                    >Custo x Venda (R$)</button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-2 whitespace-nowrap">Mes</th>
                        {dataView.famsArr.map((f) => (
                          <th key={f} className="text-right px-3 py-2 whitespace-nowrap max-w-[140px] truncate" title={f}>{f}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dataView.mesesArr.map((m, i) => (
                        <tr key={m} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="px-3 py-1.5 font-mono text-slate-700 whitespace-nowrap">{m}</td>
                          {dataView.famsArr.map((f) => {
                            const c2 = dataView.celulas[f + '|' + m]
                            if (!c2) return <td key={f} className="px-3 py-1.5 text-right text-slate-300">-</td>
                            const prev = i > 0 ? dataView.celulas[f + '|' + dataView.mesesArr[i - 1]] : null
                            const d = prev ? +(c2.margem_pct - prev.margem_pct).toFixed(1) : null
                            const fdM = fdPorMes ? fdPorMes[m] : null
                            const drePct = fdM && c2.receita > 0 ? +(((c2.lucro - c2.receita * fdM.fd) / c2.receita) * 100).toFixed(1) : null
                            const tit = c2.qtd + ' vendas · venda ' + fmtBRL(c2.receita) + ' · custo ' + fmtBRL(c2.custo) + ' · bruta ' + c2.bruta_pct.toFixed(1) + '% · liquida ' + c2.margem_pct.toFixed(1) + '%' + (drePct !== null ? ' · DRE ' + drePct.toFixed(1) + '%' : '')
                            if (dataTabModo === 'valores') {
                              return (
                                <td key={f} className="px-3 py-1.5 text-right whitespace-nowrap" title={tit}>
                                  <div className="text-emerald-700 font-medium">{fmtBRLcurto(c2.receita)}</div>
                                  <div className="text-[10px] text-red-700">custo {fmtBRLcurto(c2.custo)}</div>
                                </td>
                              )
                            }
                            return (
                              <td key={f} className="px-3 py-1.5 text-right whitespace-nowrap" title={tit}>
                                <div>
                                  <span className={'font-semibold ' + corMargem(c2.margem_pct)}>{c2.margem_pct.toFixed(1)}%</span>
                                  {d !== null && (
                                    <span className={'ml-1 text-[10px] ' + (d > 0 ? 'text-emerald-600' : (d < 0 ? 'text-red-600' : 'text-slate-400'))}>
                                      {d > 0 ? '▲' : (d < 0 ? '▼' : '=')}{Math.abs(d).toFixed(1)}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px]">
                                  <span className={corMargem(c2.bruta_pct)}>bruta {c2.bruta_pct.toFixed(1)}%</span>
                                  {drePct !== null && <span className={'ml-1 ' + corMargem(drePct)}>DRE {drePct.toFixed(1)}%</span>}
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="px-3 py-2 border-t border-slate-200 text-[11px] text-slate-500">
                  {dataTabModo === 'pct'
                    ? 'Liquida (real) = (receita − CMV − capital)/receita · Bruta = (receita − CMV)/receita · variacao (▲/▼) da liquida em pp vs mes anterior.'
                    : 'Venda = receita do mes · Custo = CMV + capital empatado. Passe o mouse para os valores completos.'}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ===== Visualizacao classica (tabela detalhada) ====================== */}
      {visao === 'tabela' && (
        <>
          <button
            onClick={() => setVisao('')}
            className="mb-3 text-xs px-3 py-1.5 border border-slate-300 rounded bg-white hover:bg-slate-100 text-slate-600"
          >← Escolher visualizacao</button>

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
                      <td className="px-3 py-1.5 font-mono text-[10px] text-slate-600" title={'Cod. Omie: ' + it.codigo_produto}>{it.sku || it.codigo_produto}</td>
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
        </>
      )}

      {/* Popup de composicao do mes explodido (visao DATA / Margens evoluindo):
          maquinas que compoem a margem bruta e a liquida do mes, com a venda
          minima (CMV + Capital) para a venda ter ficado positiva. */}
      {mesSel && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => { setMesSel(null); setMesSelFam(null) }} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[96vw] max-w-[1500px] max-h-[85vh] bg-white rounded-lg shadow-2xl z-50 flex flex-col">
            <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800">
                  {mesSelFam
                    ? (ehPeca(mesSelFam) ? '🔩 ' : '⚙ ') + mesSelFam + ' — mês ' + mesSel
                    : 'Composição do mês ' + mesSel + (incluirPecas ? '' : ' — só máquinas')}
                </h2>
                {aggMesSel ? (
                  <div className="text-xs text-slate-500 mt-0.5">
                    {vendasMesSel.length} vendas · venda {fmtBRL(aggMesSel.receita)} · custo {fmtBRL(aggMesSel.receita - aggMesSel.lucroLiq)}
                    {' · '}Margem Bruta <b className={corMargem(aggMesSel.brutaPct)}>{aggMesSel.brutaPct.toFixed(1)}%</b> ({fmtBRLcurto(aggMesSel.lucroBruto)})
                    {' · '}Margem Líquida (real) <b className={corMargem(aggMesSel.liqPct)}>{aggMesSel.liqPct.toFixed(1)}%</b> ({fmtBRLcurto(aggMesSel.lucroLiq)})
                    {aggMesSel.drePct !== null && (
                      <> · Líquida DRE <b className={corMargem(aggMesSel.drePct)}>{aggMesSel.drePct.toFixed(1)}%</b> ({fmtBRLcurto(aggMesSel.lucroDre)})</>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 mt-0.5">Nenhuma venda no mês.</div>
                )}
              </div>
              <button onClick={() => { setMesSel(null); setMesSelFam(null) }} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">&times;</button>
            </div>
            <div className="overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 sticky top-0">
                    <tr>
                      <ThPop campo="data" rotulo="Data" dirTexto="left" />
                      <ThPop campo="descricao" rotulo="Produto" dirTexto="left" />
                      <ThPop campo="cliente" rotulo="Cliente" dirTexto="left" />
                      <ThPop campo="cmc_unitario" rotulo="CMC unit." title="Custo medio de compra unitario" />
                      <ThPop campo="receita" rotulo="Vendido por" />
                      <ThPop campo="cmv" rotulo="CMV" />
                      <ThPop campo="custo_capital" rotulo="Capital" />
                      <ThPop campo="margem_bruta_pct" rotulo="Mg bruta %" title="(receita − CMV) / receita" />
                      <ThPop campo="margem_real" rotulo="Lucro líq." />
                      <ThPop campo="margem_pct" rotulo="Mg líq. %" title="(receita − CMV − capital) / receita" />
                      {fdPorMes && <ThPop campo="margem_dre_pct" rotulo="Mg DRE %" title="Liquida real − despesas do mes rateadas pela receita total (maquinas + pecas + servicos)" />}
                      <ThPop campo="custo_total" rotulo="Venda p/ positivo" title="CMV + Capital empatado: vendendo acima disso, a venda fica positiva. A linha 'c/ despesas' inclui a despesa rateada do mes" />
                    </tr>
                  </thead>
                  <tbody>
                    {vendasMesSel.map((it, idx) => {
                      const corMg = corMargem(it.margem_pct)
                      const brutaPct = it.receita > 0 ? ((it.receita - it.cmv) / it.receita) * 100 : 0
                      const faltou = it.custo_total - it.receita // > 0 = vendeu abaixo do break-even
                      const dre = margemDrePct(it)
                      const fdIt = fdPorMes ? fdPorMes[it.ano + '-' + String(it.mes).padStart(2, '0')] : null
                      // Break-even incluindo despesa rateada (proporcional a receita):
                      // p* = (CMV + capital) / (1 − fd)
                      const posDre = fdIt && fdIt.fd < 1 ? it.custo_total / (1 - fdIt.fd) : null
                      return (
                        <tr
                          key={idx}
                          className={'border-b border-slate-100 hover:bg-slate-100 cursor-pointer ' + (it.margem_real < 0 ? 'bg-red-50' : (it.sem_cmc ? 'bg-amber-50' : ''))}
                          onClick={() => setDetalhe(it)}
                          title="Clique para ver o detalhe da venda"
                        >
                          <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{it.data_pedido || '-'}</td>
                          <td className="px-3 py-1.5 truncate max-w-[220px]" title={(it.descricao || '') + ' · ' + it.familia}>
                            {it.descricao || '(sem)'}
                            <span className="text-slate-400 text-[10px]"> · {it.familia}</span>
                          </td>
                          <td className="px-3 py-1.5 truncate max-w-[160px] text-slate-700" title={it.cliente || ''}>{it.cliente || '-'}</td>
                          <td className="px-3 py-1.5 text-right text-slate-600">
                            {it.sem_cmc ? <span className="text-amber-700">s/ CMC</span> : fmtBRL(it.cmc_unitario)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium">{fmtBRL(it.receita)}</td>
                          <td className="px-3 py-1.5 text-right text-slate-600">
                            {it.sem_cmc ? <span className="text-amber-700">s/ CMC</span> : fmtBRL(it.cmv)}
                          </td>
                          <td className="px-3 py-1.5 text-right text-amber-700">{fmtBRL(it.custo_capital)}</td>
                          <td className={'px-3 py-1.5 text-right ' + corMargem(brutaPct)}>{brutaPct.toFixed(1)}%</td>
                          <td className={'px-3 py-1.5 text-right font-medium ' + corMg}>{fmtBRL(it.margem_real)}</td>
                          <td className={'px-3 py-1.5 text-right font-bold ' + corMg}>{it.margem_pct.toFixed(1)}%</td>
                          {fdPorMes && (
                            <td className={'px-3 py-1.5 text-right font-medium ' + (dre !== null ? corMargem(dre) : 'text-slate-300')} title={dre !== null ? 'despesa rateada ' + fmtBRL(despesaRateada(it)) : 'sem rateio para o mes'}>
                              {dre !== null ? dre.toFixed(1) + '%' : '-'}
                            </td>
                          )}
                          <td className="px-3 py-1.5 text-right whitespace-nowrap">
                            {it.margem_real < 0 ? (
                              <>
                                <span className="font-bold text-red-700">≥ {fmtBRL(it.custo_total)}</span>
                                <div className="text-[10px] text-red-600">faltou {fmtBRL(faltou)}</div>
                              </>
                            ) : (
                              <span className="text-slate-500">≥ {fmtBRL(it.custo_total)}</span>
                            )}
                            {posDre !== null && (
                              <div className="text-[10px] text-violet-700" title="Preco minimo cobrindo tambem a despesa rateada do mes">c/ despesas ≥ {fmtBRL(posDre)}</div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-3 py-2 border-t border-slate-200 text-[11px] text-slate-500">
              Ordenado por margem líquida (clique nos cabeçalhos para reordenar) · "Venda p/ positivo" = CMV + Capital (break-even de caixa); "c/ despesas" inclui a despesa do mês rateada pela receita total (máquinas + peças + serviços) · clique numa linha para o detalhe completo
            </div>
          </div>
        </>
      )}

      {/* Popup de composicao da media da familia (visao FAMILIA) */}
      {famSel && aggFamSel && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setFamSel(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[96vw] max-w-[1500px] max-h-[85vh] bg-white rounded-lg shadow-2xl z-50 flex flex-col">
            <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800">{ehPeca(famSel) ? '🔩 ' : '⚙ '}{famSel}</h2>
                <div className="text-xs text-slate-500 mt-0.5">
                  Margem líquida (real) <b className={corMargem(aggFamSel.margem_pct)}>{aggFamSel.margem_pct.toFixed(1)}%</b>
                  {' · '}bruta <b className={corMargem(aggFamSel.bruta_pct)}>{aggFamSel.bruta_pct.toFixed(1)}%</b>
                  {aggFamSel.dre_pct !== null && <> · DRE <b className={corMargem(aggFamSel.dre_pct)}>{aggFamSel.dre_pct.toFixed(1)}%</b></>}
                  {' · '}{aggFamSel.qtd} vendas
                  {' · '}venda {fmtBRL(aggFamSel.receita)} · custo {fmtBRL(aggFamSel.custo)}
                  {' · '}<span className={corMargem(aggFamSel.margem_pct)}>{fmtBRL(aggFamSel.lucro)} lucro</span>
                </div>
              </div>
              <button onClick={() => setFamSel(null)} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">&times;</button>
            </div>
            <div className="overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600 sticky top-0">
                    <tr>
                      <ThPop campo="data" rotulo="Data" dirTexto="left" />
                      <ThPop campo="descricao" rotulo="Produto" dirTexto="left" />
                      <ThPop campo="pedido" rotulo="Pedido/NF" dirTexto="left" />
                      <ThPop campo="cliente" rotulo="Cliente" dirTexto="left" />
                      <ThPop campo="cmc_unitario" rotulo="CMC unit." title="Custo medio de compra unitario" />
                      <ThPop campo="receita" rotulo="Venda" />
                      <ThPop campo="custo_total" rotulo="Custo" title="CMV + Capital empatado" />
                      <ThPop campo="margem_bruta_pct" rotulo="Mg bruta %" title="(receita − CMV) / receita" />
                      <ThPop campo="margem_real" rotulo="Lucro líq." />
                      <ThPop campo="margem_pct" rotulo="Mg líq. %" title="(receita − CMV − capital) / receita" />
                      {fdPorMes && <ThPop campo="margem_dre_pct" rotulo="Mg DRE %" title="Liquida real − despesas do mes rateadas pela receita total (maquinas + pecas + servicos)" />}
                    </tr>
                  </thead>
                  <tbody>
                    {vendasFamSel.map((it, idx) => {
                      const corMg = corMargem(it.margem_pct)
                      const brutaPct = it.receita > 0 ? ((it.receita - it.cmv) / it.receita) * 100 : 0
                      const dre = margemDrePct(it)
                      return (
                        <tr
                          key={idx}
                          className={'border-b border-slate-100 hover:bg-slate-100 cursor-pointer ' + (it.margem_real < 0 ? 'bg-red-50' : (it.sem_cmc ? 'bg-amber-50' : ''))}
                          onClick={() => setDetalhe(it)}
                          title="Clique para ver o detalhe da venda"
                        >
                          <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{it.data_pedido || '-'}</td>
                          <td className="px-3 py-1.5 truncate max-w-[240px]" title={it.descricao || ''}>{it.descricao || '(sem)'}</td>
                          <td className="px-3 py-1.5 font-mono text-[11px] text-slate-700">{it.pedido || '-'}</td>
                          <td className="px-3 py-1.5 truncate max-w-[160px] text-slate-700" title={it.cliente || ''}>{it.cliente || '-'}</td>
                          <td className="px-3 py-1.5 text-right text-slate-600">
                            {it.sem_cmc ? <span className="text-amber-700">s/ CMC</span> : fmtBRL(it.cmc_unitario)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-medium text-emerald-700">{fmtBRL(it.receita)}</td>
                          <td className="px-3 py-1.5 text-right text-red-700">{fmtBRL(it.custo_total)}</td>
                          <td className={'px-3 py-1.5 text-right ' + corMargem(brutaPct)}>{brutaPct.toFixed(1)}%</td>
                          <td className={'px-3 py-1.5 text-right font-medium ' + corMg}>{fmtBRL(it.margem_real)}</td>
                          <td className={'px-3 py-1.5 text-right font-bold ' + corMg}>{it.margem_pct.toFixed(1)}%</td>
                          {fdPorMes && (
                            <td className={'px-3 py-1.5 text-right font-medium ' + (dre !== null ? corMargem(dre) : 'text-slate-300')} title={dre !== null ? 'despesa rateada ' + fmtBRL(despesaRateada(it)) : 'sem rateio para o mes'}>
                              {dre !== null ? dre.toFixed(1) + '%' : '-'}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-3 py-2 border-t border-slate-200 text-[11px] text-slate-500">
              {vendasFamSel.length} vendas compoem a media · ordenado por margem líquida (clique nos cabeçalhos para reordenar) · Mg DRE = com despesas do mês rateadas pela receita total (máquinas + peças + serviços) · clique numa linha para o detalhe completo
            </div>
          </div>
        </>
      )}

      {/* Modal detalhe da venda */}
      {detalhe && (() => {
        const it = detalhe
        const corMg = corMargem(it.margem_pct)
        return (
          <>
            {/* z acima do popup de familia (z-40/z-50): o detalhe abre por cima dele */}
            <div className="fixed inset-0 bg-black/40 z-[60]" onClick={() => setDetalhe(null)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[85vh] bg-white rounded-lg shadow-2xl z-[70] flex flex-col">
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
                  <div className="text-xs text-slate-500 mt-1">SKU: <span className="font-mono">{it.sku || '—'}</span> · Cod. Omie: <span className="font-mono">{it.codigo_produto}</span> · Familia: {it.familia}</div>
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
