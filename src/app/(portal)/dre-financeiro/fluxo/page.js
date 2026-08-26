'use client'
// =============================================================================
// Tela Fluxo (port FIEL de views/fluxo.ejs do financeiro-omie-dashboard).
//
// Mantem EXATAMENTE os calculos e o comportamento do original:
//  - Toolbar de periodo: mes / YTD / ano-anterior / ano completo / todo /
//    custom / comparar anos lado a lado (com os mesmos sub-controles).
//  - 3 modos de visualizacao:
//      * Sankey (ECharts) — caminho do dinheiro Grupo -> Categoria -> Top Terceiros.
//      * Treemap (Chart.js + chartjs-chart-treemap) — tamanho proporcional a categoria.
//      * Comparativo ano-a-ano (tabela com barras por ano + variacao %).
//  - KPIs distintos para Sankey e Treemap.
//  - Modal de drill-down (top terceiros / titulos do fluxo), reaproveitado por
//    Sankey (via /api/.../fluxo/detalhe) e Treemap (via arvore de /api/.../composicao).
//  - displayGrupo(): "Despesas Diretas" -> "Custos Diretos" so no display.
//  - Cores HSL deterministicas por grupo (hash do nome), identicas a fonte.
//
// ECharts 5.5.0 + Chart.js 4.4.0 + chartjs-chart-treemap 3.1.0 sao carregados
// via CDN (mesmas versoes da fonte) num <script> dinamico; os graficos usam
// refs/canvas/containers imperativos. KPIs/legenda/tabela/modal sao React/JSX.
//
// A tela original tinha o toggle de TIPO (A Pagar / A Receber / Ambos) no header
// global; como o layout do modulo do portal so expoe o seletor de CONTA, o toggle
// de TIPO e replicado localmente nesta tela (default 'pagar' = pegaTipo da fonte).
//
// O layout do modulo (.../dre-financeiro/layout.js) ja aplica o gate de permissao
// 'financeiro' e a sub-nav; ainda assim importamos useAuth/usePermissoes e
// SemPermissao por consistencia com o padrao do portal.
// =============================================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta } from '@/lib/dre-financeiro/format'

// ---------------------------------------------------------------------------
// Helpers de periodo (identicos ao <script> da fonte: nomesMes, pad, etc.)
// ---------------------------------------------------------------------------
const nomesMes = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
function pad(n) { return String(n).padStart(2, '0') }
function ultimoDia(a, m) { return new Date(a, m, 0).getDate() }
function fmtISOdate(y, m, d) { return y + '-' + pad(m) + '-' + pad(d) }

// ---------------------------------------------------------------------------
// Formatadores locais (identicos aos do <script> da fonte). Mantidos inline para
// preservar EXATAMENTE o arredondamento usado nos labels dos graficos.
// ---------------------------------------------------------------------------
function fmtBRL(n) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0) }
function fmtBRLcurto(n) {
  const v = Number(n) || 0, s = v < 0 ? '-' : '', a = Math.abs(v)
  if (a >= 1000000) return s + 'R$ ' + (a / 1000000).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1000) return s + 'R$ ' + (a / 1000).toFixed(0) + 'k'
  return s + 'R$ ' + a.toFixed(0)
}

// ---------------------------------------------------------------------------
// Cores deterministicas por grupo (hash do nome) — port fiel
// ---------------------------------------------------------------------------
function hashStr(s) {
  let h = 0
  for (let i = 0; i < (s || '').length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0 }
  return Math.abs(h)
}
function corDoNode(tp, grupo) {
  if (!grupo) grupo = 'Sem grupo'
  const h = hashStr(String(grupo))
  if (tp === 'receber') { const hue = 130 + (h % 50) - 20; return 'hsl(' + hue + ', 50%, 60%)' }
  if (tp === 'pagar') { let hue2 = (h % 60) - 15; if (hue2 < 0) hue2 += 360; return 'hsl(' + hue2 + ', 60%, 62%)' }
  return 'hsl(220, 10%, 60%)'
}
function corDoNodeBorda(tp, grupo) {
  if (!grupo) grupo = 'Sem grupo'
  const h = hashStr(String(grupo))
  if (tp === 'receber') { const hue = 130 + (h % 50) - 20; return 'hsl(' + hue + ', 50%, 40%)' }
  if (tp === 'pagar') { let hue2 = (h % 60) - 15; if (hue2 < 0) hue2 += 360; return 'hsl(' + hue2 + ', 55%, 42%)' }
  return 'hsl(220, 10%, 40%)'
}
function corLink(tp, nome) {
  const h = hashStr(String(nome || 'x'))
  if (tp === 'receber') return 'hsla(' + (130 + (h % 50) - 20) + ', 50%, 60%, 0.5)'
  let hue2 = (h % 60) - 15; if (hue2 < 0) hue2 += 360
  return 'hsla(' + hue2 + ', 60%, 60%, 0.5)'
}

// Mapeia o nome de grupo_categoria do Omie para o label exibido na UI.
// Mantemos o ID/filtro original (Supabase) intacto - troca so no display.
function displayGrupo(nome) {
  if (nome === 'Despesas Diretas') return 'Custos Diretos'
  return nome
}

// Cores por ano do comparativo (degrade fixo) — port fiel
const CORES_ANO = ['#64748b', '#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#ca8a04', '#dc2626', '#0d9488']
function corAno(idx) { return CORES_ANO[idx % CORES_ANO.length] }

// ---------------------------------------------------------------------------
// Carregamento das libs de grafico (ECharts + Chart.js + plugin treemap) via CDN,
// uma unica vez. Mesmas versoes da fonte (fluxo.ejs).
// ---------------------------------------------------------------------------
// NAO testar so `window.Chart`: outras telas do modulo (aderencia, margens, ...)
// carregam SO o chart.umd, sem o treemap. Vindo de uma delas por navegacao
// client-side, window.Chart existe mas o controller 'treemap' nao esta registado
// e o new Chart({type:'treemap'}) rebenta -> "Application error" na tela toda.
function treemapPronto() {
  if (typeof window === 'undefined' || !window.Chart) return false
  try { return !!window.Chart.registry.getController('treemap') } catch { return false }
}

let chartLibPromise = null
function carregarChartLibs() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.echarts && treemapPronto()) return Promise.resolve()
  if (chartLibPromise) return chartLibPromise
  function addScript(src) {
    return new Promise((resolve, reject) => {
      const existente = document.querySelector('script[src="' + src + '"]')
      if (existente) { existente.addEventListener('load', resolve); existente.addEventListener('error', reject); if (existente.dataset.loaded) resolve(); return }
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = () => { s.dataset.loaded = '1'; resolve() }
      s.onerror = reject
      document.head.appendChild(s)
    })
  }
  const base = window.echarts
    ? Promise.resolve()
    : addScript('https://cdn.jsdelivr.net/npm/echarts@5.5.0/dist/echarts.min.js')
  chartLibPromise = base
    .then(() => (window.Chart ? null : addScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js')))
    .then(() => addScript('https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@3.1.0/dist/chartjs-chart-treemap.min.js'))
  return chartLibPromise
}

// ANOS_DISPONIVEIS: do ano atual ate 2022 (igual a IIFE da fonte).
function anosDisponiveis() {
  const out = []
  const h = new Date().getFullYear()
  for (let y = h; y >= 2022; y--) out.push(y)
  return out
}

export default function FluxoPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  const ANOS_DISPONIVEIS = anosDisponiveis()

  // --- Estado de controles (espelha as vars do IIFE da fonte) ---------------
  // TIPO replicado localmente (na fonte vinha do header global). Default 'ambos'.
  const [tipo, setTipo] = useState('ambos') // 'pagar' | 'receber' | 'ambos'

  // periodo: 'mes' | 'ytd' | 'ano-anterior' | 'ano' | 'todo' | 'custom' | 'comparar'
  const hoje = new Date()
  const [periodo, setPeriodo] = useState('mes')
  const [mesAtual, setMesAtual] = useState(hoje.getMonth() + 1)
  const [anoAtual, setAnoAtual] = useState(hoje.getFullYear())
  const [anoUnico, setAnoUnico] = useState(hoje.getFullYear())
  const [customDe, setCustomDe] = useState('')
  const [customAte, setCustomAte] = useState('')
  const [anosComparar, setAnosComparar] = useState(() => ANOS_DISPONIVEIS.slice(0, 3).map((y) => y).sort())

  const [modo, setModo] = useState('sankey') // 'sankey' | 'treemap'

  // Caches de dados (invalidados ao trocar periodo/conta/tipo) — espelha a fonte.
  const [dadosSankey, setDadosSankey] = useState(null)
  const [dadosComposicao, setDadosComposicao] = useState(null)
  const [dadosComparar, setDadosComparar] = useState(null)
  const arvoreComposicao = useRef(null) // arvore p/ o modal do treemap

  const [carregandoSankey, setCarregandoSankey] = useState(false)
  const [carregandoTreemap, setCarregandoTreemap] = useState(false)
  const [comparativoInfo, setComparativoInfo] = useState('--')
  const [chartReady, setChartReady] = useState(false)

  // Modal de top terceiros / titulos do fluxo
  const [modalAberto, setModalAberto] = useState(false)
  const [modalTitulo, setModalTitulo] = useState('Top terceiros')
  const [modalSubtitulo, setModalSubtitulo] = useState('') // HTML (port fiel do innerHTML)
  const [modalCorpo, setModalCorpo] = useState({ tipo: 'vazio' }) // descreve o conteudo a renderizar
  // 2º popup (empilhado): drill de maquinas/produtos de um fornecedor do Treemap
  const [drillMaq, setDrillMaq] = useState(null)

  // Refs de graficos
  const sankeyRef = useRef(null)
  const sankeyInst = useRef(null)
  const treemapRef = useRef(null)
  const treemapInst = useRef(null)

  // ECharts precisa que o container exista quando inicializamos; usamos esta flag.
  const sankeyVazio = useRef(false)

  // Carrega as libs uma vez.
  useEffect(() => {
    carregarChartLibs().then(() => setChartReady(true)).catch(() => setChartReady(false))
  }, [])

  // =========================================================================
  // resolverPeriodo(): converte o estado de periodo -> {de, ate, titulo, qs}
  // Port fiel da funcao homonima da fonte.
  // =========================================================================
  const resolverPeriodo = useCallback(() => {
    const hY = hoje.getFullYear(), hM = hoje.getMonth() + 1, hD = hoje.getDate()
    if (periodo === 'ytd') {
      return { de: fmtISOdate(hY, 1, 1), ate: fmtISOdate(hY, hM, hD), titulo: hY + ' (YTD - ate hoje)', qs: 'periodo=ytd' }
    }
    if (periodo === 'ano-anterior') {
      const a = hY - 1
      return { de: fmtISOdate(a, 1, 1), ate: fmtISOdate(a, 12, 31), titulo: a + ' (ano completo)', qs: 'periodo=ano-anterior' }
    }
    if (periodo === 'ano') {
      return { de: fmtISOdate(anoUnico, 1, 1), ate: fmtISOdate(anoUnico, 12, 31), titulo: anoUnico + ' (ano completo)', qs: 'periodo=ano&anoUnico=' + anoUnico }
    }
    if (periodo === 'todo') {
      return { de: '2000-01-01', ate: fmtISOdate(hY, 12, 31), titulo: 'Todo o periodo (' + 'desde 2000)', qs: 'periodo=todo' }
    }
    if (periodo === 'custom') {
      const de = customDe || fmtISOdate(hY, 1, 1).slice(0, 7)
      const ate = customAte || fmtISOdate(hY, 12, 31).slice(0, 7)
      const deP = de + '-01'
      const ateY = parseInt(ate.split('-')[0], 10), ateM = parseInt(ate.split('-')[1], 10)
      const ateP = ateY && ateM ? fmtISOdate(ateY, ateM, ultimoDia(ateY, ateM)) : fmtISOdate(hY, 12, 31)
      const lbl = nomesMes[parseInt(de.split('-')[1]) - 1] + '/' + de.split('-')[0].slice(2)
        + ' a ' + nomesMes[parseInt(ate.split('-')[1]) - 1] + '/' + ate.split('-')[0].slice(2)
      return { de: deP, ate: ateP, titulo: lbl + ' (custom)', qs: 'periodo=custom&de=' + de + '&ate=' + ate }
    }
    if (periodo === 'comparar') {
      return { de: null, ate: null, titulo: 'Comparativo ' + anosComparar.join(' vs '), qs: 'periodo=comparar&anos=' + anosComparar.join(',') }
    }
    // periodo = 'mes'
    const iniM = fmtISOdate(anoAtual, mesAtual, 1)
    const fimM = fmtISOdate(anoAtual, mesAtual, ultimoDia(anoAtual, mesAtual))
    return { de: iniM, ate: fimM, titulo: nomesMes[mesAtual - 1] + '/' + anoAtual, qs: 'periodo=mes&mes=' + mesAtual + '&ano=' + anoAtual }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, anoUnico, customDe, customAte, anosComparar, anoAtual, mesAtual])

  // Label do modo (A Pagar / A Receber / Pagar + Receber) — port fiel
  const labelTipo = tipo === 'pagar' ? 'A Pagar' : (tipo === 'receber' ? 'A Receber' : 'Pagar + Receber')

  const ehComparar = periodo === 'comparar'
  const p = resolverPeriodo()

  // =========================================================================
  // Invalidacao de cache: troca de periodo/conta/tipo => nova consulta
  // (espelha o "dadosSankey = null; dadosComposicao = null;" da fonte).
  // =========================================================================
  useEffect(() => {
    setDadosSankey(null)
    setDadosComposicao(null)
    setDadosComparar(null)
    arvoreComposicao.current = null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, tipo, periodo, anoUnico, customDe, customAte, mesAtual, anoAtual, anosComparar.join(',')])

  // =========================================================================
  // SANKEY: carregamento + render (port fiel de carregarSankey/renderSankey)
  // =========================================================================
  useEffect(() => {
    if (ehComparar || modo !== 'sankey') return
    if (dadosSankey) return
    const pr = resolverPeriodo()
    if (!pr.de || !pr.ate) return
    setCarregandoSankey(true)
    const qs = 'conta=' + conta + '&tipo=' + tipo + '&de=' + pr.de + '&ate=' + pr.ate
    fetch('/api/dre-financeiro/fluxo?' + qs).then((r) => r.json()).then((d) => {
      setCarregandoSankey(false)
      if (d.erro) { alert('Erro: ' + d.erro); return }
      setDadosSankey(d)
    }).catch((e) => { setCarregandoSankey(false); alert('Erro: ' + e.message) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehComparar, modo, dadosSankey, conta, tipo, resolverPeriodo])

  // Render do Sankey (ECharts). Reage a dadosSankey / chartReady / visibilidade.
  useEffect(() => {
    if (!chartReady || ehComparar || modo !== 'sankey') return
    if (!dadosSankey || !sankeyRef.current || !window.echarts) return
    const d = dadosSankey

    function trunc(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '...' : s }
    // Decodifica metadados do id do node (formato definido em /api/fluxo).
    // g|tipo|grupo  c|tipo|grupo|cat  t|tipo|grupo|cat|terceiro
    // o|tipo|grupo|cats (outras categorias)  o|tipo|grupo|cat (outros terceiros)
    function partsFromId(id) {
      if (!id) return {}
      const ps = String(id).split('|')
      if (ps[0] === 'g') return { grupo: ps[2] }
      if (ps[0] === 'c') return { grupo: ps[2], categoria: ps[3] }
      if (ps[0] === 't') return { grupo: ps[2], categoria: ps[3], terceiro: ps[4] }
      if (ps[0] === 'o' && ps[3] === 'cats') return { grupo: ps[2], outros: 'categorias' }
      if (ps[0] === 'o') return { grupo: ps[2], categoria: ps[3], outros: 'terceiros' }
      return {}
    }
    // Label de 1 linha (nome + valor compacto). Valor completo no tooltip.
    const nodes = (d.nodes || []).map((n) => {
      const cor = corDoNode(n.tipo, n.name)
      const meta = partsFromId(n.id)
      const displayName = (n.nivel === 'grupo') ? displayGrupo(n.name) : n.name
      return {
        name: n.id,
        label: { formatter: trunc(displayName, 32) + '  ' + fmtBRLcurto(n.valor), fontSize: 11, color: '#1e293b' },
        itemStyle: { color: cor, borderColor: cor },
        _displayName: displayName, _tipo: n.tipo, _nivel: n.nivel, _valor: n.valor,
        _grupo: meta.grupo, _categoria: meta.categoria, _terceiro: meta.terceiro, _outros: meta.outros,
      }
    })
    const nodeById = {}
    nodes.forEach((n) => { nodeById[n.name] = n })
    const links = (d.links || []).map((l) => ({
      source: l.source, target: l.target, value: l.value,
      lineStyle: { color: corLink(l.tipo, l.source), opacity: 0.5, curveness: 0.5 },
    }))

    // Altura dinamica: mais nos = mais espaco vertical.
    const alturaCalc = Math.max(800, nodes.length * 22)
    const elChart = sankeyRef.current
    elChart.style.height = alturaCalc + 'px'

    // Init robusto: reaproveita a instancia ligada AO nó atual (evita instancia
    // orfã num nó detached após remonte) e nunca faz init duplo no mesmo nó.
    let inst = window.echarts.getInstanceByDom(elChart)
    if (!inst) inst = window.echarts.init(elChart)
    sankeyInst.current = inst
    inst.setOption({
      tooltip: {
        trigger: 'item', formatter: function (params) {
          if (params.dataType === 'edge') {
            const srcNode = nodeById[params.data.source], tgtNode = nodeById[params.data.target]
            return '<b>' + (srcNode ? srcNode._displayName : params.data.source) + '</b> &rarr; <b>'
              + (tgtNode ? tgtNode._displayName : params.data.target) + '</b><br/>' + fmtBRL(params.data.value)
              + '<br/><span style="color:#94a3b8;font-size:10px">(clique para detalhes)</span>'
          }
          const n = params.data
          return '<b>' + (n._displayName || n.name) + '</b><br/>'
            + (n._tipo === 'receber' ? 'Entrada' : 'Saida') + ' &middot; ' + (n._nivel || '') + '<br/>'
            + fmtBRL(n._valor || 0)
            + '<br/><span style="color:#94a3b8;font-size:10px">(clique para detalhes)</span>'
        },
      },
      series: [{
        type: 'sankey', data: nodes, links: links, emphasis: { focus: 'adjacency' },
        nodeAlign: 'left', nodeGap: 22, nodeWidth: 14, left: 10, right: 320, top: 16, bottom: 16,
        lineStyle: { color: 'gradient', curveness: 0.5 },
        label: { color: '#1e293b', fontSize: 11, position: 'right' },
      }],
    }, true)

    // Click: edge ou node -> abre modal com titulos que compoem aquele fluxo.
    inst.off('click')
    inst.on('click', function (params) {
      let alvo = null
      if (params.dataType === 'edge') alvo = nodeById[params.data.target]
      else if (params.dataType === 'node') alvo = params.data
      if (alvo) abrirFluxoDetalhe(alvo)
    })

    // No primeiro paint o container pode ainda estar com largura 0 (transição de
    // rota / layout não assentado) -> canvas 0×0 -> Sankey em branco. Um resize no
    // próximo frame corrige a medição depois que o layout estabiliza.
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => { if (sankeyInst.current) sankeyInst.current.resize() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, dadosSankey, ehComparar, modo])

  // Observa o container do Sankey: quando ele ganha largura (0 -> real, após o
  // layout assentar) reajusta o gráfico. Cobre o "às vezes em branco ao abrir".
  useEffect(() => {
    if (modo !== 'sankey' || ehComparar) return
    const el = sankeyRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => { if (sankeyInst.current) sankeyInst.current.resize() })
    ro.observe(el)
    return () => ro.disconnect()
  }, [modo, ehComparar, chartReady])

  // Ao sair da visão Sankey (troca de modo/comparar), descarta a instância para
  // não deixar um gráfico ligado a um nó já removido do DOM.
  useEffect(() => {
    if (modo === 'sankey' && !ehComparar) return
    if (sankeyInst.current) { sankeyInst.current.dispose(); sankeyInst.current = null }
  }, [modo, ehComparar])

  // Resize do Sankey quando a janela muda
  useEffect(() => {
    function onResize() { if (sankeyInst.current) sankeyInst.current.resize() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // =========================================================================
  // Modal: detalhe de fluxo (Sankey) — port fiel de abrirFluxoDetalhe
  // =========================================================================
  function abrirFluxoDetalhe(node) {
    if (!node) return
    const pr = resolverPeriodo()
    const tipoNode = node._tipo
    const grupo = node._grupo, categoria = node._categoria, terceiro = node._terceiro, outros = node._outros

    // Titulo: breadcrumb dos niveis conhecidos (aplica displayGrupo no grupo)
    const partes = []
    if (grupo) partes.push(displayGrupo(grupo))
    if (categoria) partes.push(categoria)
    if (terceiro) partes.push(terceiro)
    setModalTitulo(partes.length ? partes.join(' › ') : (node._displayName || 'Detalhe'))
    const labelTp = tipoNode === 'receber' ? '+ Entrada' : (tipoNode === 'pagar' ? '- Saida' : '')
    const avisoOutros = outros === 'categorias' ? ' &middot; <span class="text-amber-700">agregado de varias categorias do grupo</span>'
      : outros === 'terceiros' ? ' &middot; <span class="text-amber-700">agregado de varios terceiros da categoria</span>'
        : ''
    setModalSubtitulo(
      '<span class="font-semibold ' + (tipoNode === 'receber' ? 'text-emerald-700' : 'text-red-700') + '">' + labelTp + '</span>'
      + ' &middot; ' + (node._nivel || '') + ' &middot; ' + fmtBRL(node._valor || 0) + avisoOutros
    )
    setModalCorpo({ tipo: 'carregando' })
    setModalAberto(true)

    let qs = 'conta=' + conta + '&tipo=' + tipoNode + '&de=' + pr.de + '&ate=' + pr.ate
    // Para "outros categorias" filtra so por grupo. Para "outros terceiros"
    // filtra por grupo+cat. Para grupo/cat/terceiro normal, idem.
    if (grupo) qs += '&grupo=' + encodeURIComponent(grupo)
    if (categoria && outros !== 'categorias') qs += '&categoria=' + encodeURIComponent(categoria)
    if (terceiro) qs += '&terceiro=' + encodeURIComponent(terceiro)

    fetch('/api/dre-financeiro/fluxo/detalhe?' + qs).then((r) => r.json()).then((d) => {
      if (d.erro) { setModalCorpo({ tipo: 'erro', msg: d.erro }); return }
      setModalCorpo({ tipo: 'detalhe', dados: d, semCategoria: !categoria, tipoNode })
    }).catch((e) => setModalCorpo({ tipo: 'erro', msg: e.message }))
  }

  // =========================================================================
  // TREEMAP: carregamento (port fiel de carregarTreemap)
  // =========================================================================
  useEffect(() => {
    if (ehComparar || modo !== 'treemap') return
    if (dadosComposicao) return
    const pr = resolverPeriodo()
    if (!pr.de || !pr.ate) return
    setCarregandoTreemap(true)
    // semAntecip=1: o /fluxo e' visao de CAIXA -> remove o principal da antecipacao
    // de duplicatas (APIP). A DRE › Composicao NAO passa o param e mantem a barra.
    const qs = 'conta=' + conta + '&tipo=' + tipo + '&de=' + pr.de + '&ate=' + pr.ate + '&semAntecip=1'
    fetch('/api/dre-financeiro/composicao?' + qs).then((r) => r.json()).then((d) => {
      setCarregandoTreemap(false)
      if (d.erro) { alert('Erro: ' + d.erro); return }
      arvoreComposicao.current = d.arvore || {}
      setDadosComposicao(d)
    }).catch((e) => { setCarregandoTreemap(false); alert('Erro: ' + e.message) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehComparar, modo, dadosComposicao, conta, tipo, resolverPeriodo])

  // Render do Treemap (Chart.js). Port fiel de renderTreemap (sem KPIs/legenda,
  // que viram JSX abaixo). Reage a dadosComposicao / chartReady / visibilidade.
  useEffect(() => {
    if (!chartReady || ehComparar || modo !== 'treemap') return
    if (!dadosComposicao || !window.Chart) return
    const d = dadosComposicao
    const folhas = d.folhas || []
    if (folhas.length === 0) { if (treemapInst.current) { treemapInst.current.destroy(); treemapInst.current = null } return }
    if (!treemapRef.current) return

    if (treemapInst.current) treemapInst.current.destroy()
    const ctx = treemapRef.current.getContext('2d')
    treemapInst.current = new window.Chart(ctx, {
      type: 'treemap',
      data: {
        datasets: [{
          tree: folhas, key: 'valor', spacing: 1, borderWidth: 1, borderRadius: 2,
          // Nome da categoria no topo (1 linha, truncado)
          labels: {
            display: true, align: 'left', position: 'top', color: '#0f172a',
            font: { size: 11, weight: 'bold' }, padding: 4, overflow: 'hidden',
            formatter: function (ctx2) {
              const d2 = ctx2.raw && ctx2.raw._data; if (!d2) return ''
              const nome = d2.categoria || ''
              return nome.length > 28 ? nome.slice(0, 26) + '...' : nome
            },
          },
          // Valor no rodape (separado do nome - nao sobrepoe)
          captions: {
            display: true, align: 'right', color: '#475569',
            font: { size: 10, weight: 'bold' }, padding: 4,
            formatter: function (ctx2) {
              const d2 = ctx2.raw && ctx2.raw._data; if (!d2) return ''
              return fmtBRLcurto(ctx2.raw.v)
            },
          },
          backgroundColor: function (ctx2) {
            if (ctx2.type !== 'data') return 'transparent'
            const d2 = ctx2.raw && ctx2.raw._data; return corDoNode(d2 && d2.tipo, d2 && d2.grupo)
          },
          borderColor: function (ctx2) {
            if (ctx2.type !== 'data') return 'rgba(0,0,0,0)'
            const d2 = ctx2.raw && ctx2.raw._data; return corDoNodeBorda(d2 && d2.tipo, d2 && d2.grupo)
          },
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        onClick: function (evt, els) {
          if (!els || !els.length) return
          const raw = els[0].element.$context.raw, data = raw && raw._data
          if (data && data.categoria) abrirModalComposicao(data.tipo, data.grupo, data.categoria, raw.v)
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              title: function (items) { const d2 = items[0].raw && items[0].raw._data; return (d2 && d2.categoria) || '' },
              label: function (item) {
                const d2 = item.raw && item.raw._data; if (!d2) return ''
                const pct = d2.gv ? (100 * item.raw.v / d2.gv) : 0
                const labelTp = d2.tipo === 'receber' ? 'Entrada' : (d2.tipo === 'pagar' ? 'Saida' : '')
                return [(labelTp ? labelTp + ' - ' : '') + 'Grupo: ' + (displayGrupo(d2.grupo) || '-'),
                fmtBRL(item.raw.v) + (pct ? ' (' + pct.toFixed(1) + '% do grupo)' : '')]
              },
            },
          },
        },
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, dadosComposicao, ehComparar, modo])

  // =========================================================================
  // Modal: top terceiros da categoria (Treemap) — port fiel de abrirModal
  // =========================================================================
  function abrirModalComposicao(tp, grupo, categoria, valorTotal) {
    const labelTp = tp === 'receber' ? '+ Entrada' : (tp === 'pagar' ? '- Saida' : '')
    setModalTitulo(categoria)
    setModalSubtitulo(
      (labelTp ? '<span class="font-semibold ' + (tp === 'receber' ? 'text-emerald-700' : 'text-red-700') + '">' + labelTp + '</span> &middot; ' : '')
      + 'Grupo: ' + displayGrupo(grupo) + ' &middot; ' + fmtBRL(valorTotal)
    )
    setModalAberto(true)
    const node = arvoreComposicao.current && arvoreComposicao.current[(tp || '') + '|' + grupo]
    if (!node || !node.categorias[categoria]) { setModalCorpo({ tipo: 'sem-dados' }); return }
    const terceirosObj = node.categorias[categoria].terceiros || {}
    const lista = Object.entries(terceirosObj).map((pp) => ({ nome: pp[0], valor: pp[1] })).sort((a, b) => b.valor - a.valor)
    setModalCorpo({ tipo: 'terceiros', lista, tp, grupo, categoria })
  }

  function fecharModal() { setModalAberto(false) }

  // =========================================================================
  // Drill 2º nível (Treemap): clicar num fornecedor abre um popup com as
  // maquinas/produtos (descricao, qtd, valor) que compoem aquele valor.
  // =========================================================================
  function abrirDrillMaquinas(terceiro, tp, grupo, categoria) {
    const pr = resolverPeriodo()
    if (!pr.de || !pr.ate) return
    setDrillMaq({ terceiro, tp, loading: true, itens: [], totalTitulo: 0, totalItens: 0, semDetalhe: false, erro: null })
    const qs = 'conta=' + conta + '&tipo=' + tp + '&de=' + pr.de + '&ate=' + pr.ate
      + '&grupo=' + encodeURIComponent(grupo || '') + '&categoria=' + encodeURIComponent(categoria || '')
      + '&terceiro=' + encodeURIComponent(terceiro || '')
    fetch('/api/dre-financeiro/composicao/produtos?' + qs)
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { setDrillMaq({ terceiro, tp, loading: false, itens: [], totalTitulo: 0, totalItens: 0, semDetalhe: false, erro: d.erro }); return }
        setDrillMaq({
          terceiro, tp, loading: false, erro: null,
          itens: d.itens || [], totalTitulo: d.totalTitulo || 0, totalItens: d.totalItens || 0,
          semDetalhe: !!d.semDetalhe,
        })
      })
      .catch((e) => setDrillMaq({ terceiro, tp, loading: false, itens: [], totalTitulo: 0, totalItens: 0, semDetalhe: false, erro: e.message }))
  }

  function fecharDrillMaq() { setDrillMaq(null) }

  // Esc fecha primeiro o drill de maquinas (se aberto); senao o modal.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (drillMaq) { setDrillMaq(null); return }
      fecharModal()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drillMaq])

  // =========================================================================
  // COMPARATIVO ano-a-ano (port fiel de carregarComparar/renderComparativo)
  // =========================================================================
  useEffect(() => {
    if (!ehComparar) return
    if (dadosComparar) return
    setComparativoInfo('Carregando ' + anosComparar.length + ' anos...')
    // 1 chamada /api/composicao por ano em paralelo
    const promises = anosComparar.map((y) => {
      // semAntecip=1: idem Treemap — visao de caixa do /fluxo, sem o principal APIP.
      const qs = 'conta=' + conta + '&tipo=' + tipo + '&de=' + y + '-01-01&ate=' + y + '-12-31&semAntecip=1'
      return fetch('/api/dre-financeiro/composicao?' + qs).then((r) => r.json()).then((d) => ({ ano: y, dados: d }))
    })
    Promise.all(promises).then((resultados) => {
      setDadosComparar(resultados)
    }).catch((e) => setComparativoInfo('Erro: ' + e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehComparar, dadosComparar, conta, tipo, anosComparar])

  // Constroi o modelo de dados do comparativo (port fiel de renderComparativo).
  function construirComparativo(resultados) {
    const mapa = {} // chave: tipo|grupo
    resultados.forEach((r) => {
      (r.dados.grupos || []).forEach((g) => {
        const k = g.tipo + '|' + g.nome
        if (!mapa[k]) mapa[k] = { tipo: g.tipo, grupo: g.nome, valoresPorAno: {}, total: 0 }
        mapa[k].valoresPorAno[r.ano] = (mapa[k].valoresPorAno[r.ano] || 0) + (g.valor || 0)
        mapa[k].total += (g.valor || 0)
      })
    })
    const linhas = Object.values(mapa).sort((a, b) => b.total - a.total)
    const topLinhas = linhas.slice(0, 12) // top 12 grupos por total
    const anosOrd = anosComparar.slice().sort()

    function maxDaLinha(l) {
      let m = 0
      anosOrd.forEach((y) => { if ((l.valoresPorAno[y] || 0) > m) m = l.valoresPorAno[y] || 0 })
      return m
    }

    // Totais por ano (de todos os grupos, nao so top)
    const totaisAno = {}
    anosOrd.forEach((y) => { totaisAno[y] = 0 })
    Object.values(mapa).forEach((l) => { anosOrd.forEach((y) => { totaisAno[y] += l.valoresPorAno[y] || 0 }) })
    const totalGeral = anosOrd.reduce((s, y) => s + totaisAno[y], 0)

    return { mapa, topLinhas, anosOrd, maxDaLinha, totaisAno, totalGeral }
  }

  // Atualiza a info do comparativo quando os dados chegam (port do texto-resumo)
  useEffect(() => {
    if (!ehComparar || !dadosComparar) return
    const c = construirComparativo(dadosComparar)
    setComparativoInfo(
      'Top ' + c.topLinhas.length + ' grupos de ' + Object.keys(c.mapa).length + ' · ' +
      c.anosOrd.length + ' anos comparados · total no periodo R$ ' +
      new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(c.totalGeral)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ehComparar, dadosComparar])

  // =========================================================================
  // Wiring dos controles de PERIODO (port fiel dos handlers da fonte)
  // =========================================================================
  function trocarPeriodoTipo(novo) { setPeriodo(novo) }
  function mesAnterior() {
    if (mesAtual === 1) { setMesAtual(12); setAnoAtual((a) => a - 1) } else { setMesAtual((m) => m - 1) }
  }
  function mesProximo() {
    if (mesAtual === 12) { setMesAtual(1); setAnoAtual((a) => a + 1) } else { setMesAtual((m) => m + 1) }
  }
  function irHoje() { const h = new Date(); setMesAtual(h.getMonth() + 1); setAnoAtual(h.getFullYear()) }
  function onMesInput(v) { if (!v) return; const ps = v.split('-'); setAnoAtual(parseInt(ps[0], 10)); setMesAtual(parseInt(ps[1], 10)) }
  function onAnoInput(v) { const n = parseInt(v, 10); if (!n || n < 2000) return; setAnoUnico(n) }
  function toggleAnoComparar(y) {
    setAnosComparar((prev) => {
      const sel = prev.indexOf(y) >= 0 ? prev.filter((x) => x !== y) : prev.concat([y])
      if (sel.length === 0) { alert('Selecione pelo menos 1 ano'); return prev }
      return sel.slice().sort()
    })
  }
  function compararTodos() { setAnosComparar(ANOS_DISPONIVEIS.slice().sort()) }

  // Toggle de view (port fiel de setView, sem a parte de URL/visibilidade que
  // aqui e controlada por estado/JSX).
  function setView(novo) { setModo(novo) }

  // --- Estados de gate de permissao (BRIEF item 1) --------------------------
  if (!loading && !loadingPerm && userProfile && (!temAcesso('financeiro') && !pode('dre', 'fluxo'))) return <SemPermissao />

  // Classes dos toggles (espelham ativo/inativo da fonte)
  const ativoToggle = 'bg-slate-800 text-white'
  const inativoToggle = 'bg-white text-slate-700 hover:bg-slate-100'

  // --- KPIs do Sankey -------------------------------------------------------
  const dS = dadosSankey
  const saldo = dS ? ((dS.totalEntradas || 0) - (dS.totalSaidas || 0)) : 0
  const kpiSankey = {
    entradas: dS ? fmtBRL(dS.totalEntradas || 0) : '--',
    saidas: dS ? fmtBRL(dS.totalSaidas || 0) : '--',
    saldo: dS ? fmtBRL(saldo) : '--',
    saldoPositivo: saldo >= 0,
    counts: dS ? ((dS.nodes || []).length + ' / ' + (dS.links || []).length) : '--',
  }

  // --- KPIs do Treemap ------------------------------------------------------
  const dC = dadosComposicao
  const topCat = dC ? (dC.folhas || [])[0] : null
  const kpiTreemap = {
    total: dC ? fmtBRL(dC.total) : '--',
    grupos: dC ? (dC.grupos || []).length : '--',
    categorias: dC ? (dC.folhas || []).length : '--',
    topNome: topCat ? topCat.categoria : '--',
    topValor: topCat ? (fmtBRL(topCat.valor) + ' (' + (100 * topCat.valor / (dC.total || 1)).toFixed(1) + '%)') : '--',
  }

  // --- Legenda de grupos do Treemap (port fiel da montagem da fonte) --------
  function BadgeGrupo({ g }) {
    const c = corDoNode(g.tipo, g.nome), cb = corDoNodeBorda(g.tipo, g.nome)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border" style={{ borderColor: cb }}>
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: c }} />
        <span className="text-slate-700 font-medium">{displayGrupo(g.nome)}</span>
        <span className="text-slate-500">{fmtBRLcurto(g.valor)}</span>
      </span>
    )
  }

  const gruposTreemap = dC ? (dC.grupos || []) : []
  const treemapSemDados = dC && (dC.folhas || []).length === 0

  // --- Comparativo (modelo derivado) ----------------------------------------
  const cmp = (ehComparar && dadosComparar) ? construirComparativo(dadosComparar) : null
  function fmtVar(v) {
    if (v === null || v === undefined || !isFinite(v)) return <span className="text-slate-300">-</span>
    const arrow = v >= 0 ? '▲' : '▼'
    const cls = v >= 0 ? 'text-emerald-700' : 'text-red-700'
    return <span className={cls + ' font-semibold'}>{arrow} {Math.abs(v).toFixed(1)}%</span>
  }

  return (
    <>
      {/* Toolbar de periodo */}
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <h1 className="text-2xl font-semibold text-slate-800">
          Fluxo{(p.titulo) ? ' · ' + p.titulo : ''}
        </h1>
        <div className="flex items-center gap-1 text-xs">
          {/* Toggle de TIPO (replicado da header global da fonte) */}
          <span className="text-slate-500 mr-1">Modo:</span>
          <div className="inline-flex rounded border border-slate-300 overflow-hidden mr-2">
            <button onClick={() => setTipo('pagar')}
              className={'px-3 py-1 ' + (tipo === 'pagar' ? 'bg-red-600 text-white' : inativoToggle)}>A Pagar</button>
            <button onClick={() => setTipo('receber')}
              className={'px-3 py-1 border-l border-slate-300 ' + (tipo === 'receber' ? 'bg-emerald-600 text-white' : inativoToggle)}>A Receber</button>
            <button onClick={() => setTipo('ambos')}
              className={'px-3 py-1 border-l border-slate-300 ' + (tipo === 'ambos' ? 'bg-slate-800 text-white' : inativoToggle)}>Ambos</button>
          </div>
          <span className="font-semibold text-slate-700">{labelTipo}</span>
          {/* Toggle Sankey / Treemap (escondido em comparativo) */}
          {!ehComparar && (
            <div className="ml-3 inline-flex rounded border border-slate-300 overflow-hidden">
              <button onClick={() => setView('sankey')}
                title="Sankey: caminho do dinheiro grupo > categoria > top terceiros"
                className={'px-3 py-1 ' + (modo === 'sankey' ? ativoToggle : inativoToggle)}>Sankey</button>
              <button onClick={() => setView('treemap')}
                title="Treemap: tamanho proporcional ao valor da categoria"
                className={'px-3 py-1 border-l border-slate-300 ' + (modo === 'treemap' ? ativoToggle : inativoToggle)}>Treemap</button>
            </div>
          )}
        </div>
      </div>

      {/* Controles de periodo */}
      <div className="flex items-center gap-2 mb-4 flex-wrap text-xs">
        <label className="text-slate-500">Periodo:</label>
        <select value={periodo} onChange={(e) => trocarPeriodoTipo(e.target.value)}
          className="border border-slate-300 rounded px-2 py-1 bg-white">
          <option value="mes">Mes especifico</option>
          <option value="ytd">Este ano (YTD)</option>
          <option value="ano-anterior">Ano passado</option>
          <option value="ano">Ano completo...</option>
          <option value="todo">Todo o periodo</option>
          <option value="custom">Personalizado...</option>
          <option value="comparar">Comparar anos lado a lado</option>
        </select>

        {/* Sub-controles de mes especifico */}
        {periodo === 'mes' && (
          <span className="inline-flex items-center gap-1">
            <button onClick={mesAnterior} className="px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100">&larr;</button>
            <input type="month" value={anoAtual + '-' + pad(mesAtual)} onChange={(e) => onMesInput(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1 bg-white" />
            <button onClick={mesProximo} className="px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100">&rarr;</button>
            <button onClick={irHoje} className="px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100">Hoje</button>
          </span>
        )}

        {/* Sub-controle de ano */}
        {periodo === 'ano' && (
          <span className="inline-flex items-center gap-1">
            <input type="number" min="2000" max="2099" value={anoUnico} onChange={(e) => onAnoInput(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1 bg-white w-24" />
          </span>
        )}

        {/* Sub-controles de personalizado */}
        {periodo === 'custom' && (
          <span className="inline-flex items-center gap-1">
            <label className="text-slate-500">De:</label>
            <input type="month" value={customDe || (hoje.getFullYear() + '-01')} onChange={(e) => setCustomDe(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1 bg-white" />
            <label className="text-slate-500">Ate:</label>
            <input type="month" value={customAte || (hoje.getFullYear() + '-' + pad(hoje.getMonth() + 1))} onChange={(e) => setCustomAte(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1 bg-white" />
          </span>
        )}

        {/* Sub-controle: anos a comparar (checkboxes inline) */}
        {periodo === 'comparar' && (
          <span className="inline-flex items-center gap-2">
            <label className="text-slate-500">Anos:</label>
            <span className="inline-flex items-center gap-2">
              {ANOS_DISPONIVEIS.slice().sort().map((y) => (
                <label key={y} className="inline-flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={anosComparar.indexOf(y) >= 0} onChange={() => toggleAnoComparar(y)} /> {y}
                </label>
              ))}
            </span>
            <button onClick={compararTodos} className="px-2 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100 text-[10px]">Todos</button>
          </span>
        )}

        <span className="ml-auto text-slate-500">{p.de && p.ate ? (p.de + ' a ' + p.ate) : ''}</span>
      </div>

      {/* KPIs SANKEY */}
      {!ehComparar && modo === 'sankey' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Entradas</div>
            <div className="text-2xl font-bold text-emerald-700 mt-1">{kpiSankey.entradas}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Saidas</div>
            <div className="text-2xl font-bold text-red-700 mt-1">{kpiSankey.saidas}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Saldo</div>
            <div className={'text-2xl font-bold mt-1 ' + (kpiSankey.saldoPositivo ? 'text-emerald-700' : 'text-red-700')}>{kpiSankey.saldo}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Nos / Fluxos</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{kpiSankey.counts}</div>
          </div>
        </div>
      )}

      {/* KPIs TREEMAP */}
      {!ehComparar && modo === 'treemap' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Total no mes</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{kpiTreemap.total}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Grupos</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{kpiTreemap.grupos}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Categorias</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{kpiTreemap.categorias}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Top categoria</div>
            <div className="text-base font-bold text-slate-800 mt-1 truncate">{kpiTreemap.topNome}</div>
            <div className="text-xs text-slate-500">{kpiTreemap.topValor}</div>
          </div>
        </div>
      )}

      {/* Sankey container */}
      {!ehComparar && modo === 'sankey' && (
        <div className="bg-white border border-slate-200 rounded-lg p-3 mb-3">
          {carregandoSankey && <div className="text-slate-500 text-sm py-4">Carregando...</div>}
          <div ref={sankeyRef} style={{ width: '100%', height: 1000 }} />
          <div className="text-xs text-slate-500 mt-2">Passe o mouse num no para destacar o caminho. Da esquerda p/ direita: Grupo &rarr; Categoria &rarr; Top Terceiros.</div>
        </div>
      )}

      {/* Treemap container + legenda */}
      {!ehComparar && modo === 'treemap' && (
        <div>
          <div className="flex flex-wrap gap-2 mb-3 text-xs">
            {tipo === 'ambos' ? (
              <>
                {(() => {
                  const saidas = gruposTreemap.filter((g) => g.tipo === 'pagar').slice(0, 8)
                  const entradas = gruposTreemap.filter((g) => g.tipo === 'receber').slice(0, 8)
                  return (
                    <>
                      {saidas.length > 0 && (
                        <>
                          <div className="w-full text-xs text-red-700 font-semibold mb-1 mt-1">Saidas</div>
                          <div className="flex flex-wrap gap-2 w-full mb-2">{saidas.map((g, i) => <BadgeGrupo key={'s' + i} g={g} />)}</div>
                        </>
                      )}
                      {entradas.length > 0 && (
                        <>
                          <div className="w-full text-xs text-emerald-700 font-semibold mb-1">Entradas</div>
                          <div className="flex flex-wrap gap-2 w-full">{entradas.map((g, i) => <BadgeGrupo key={'e' + i} g={g} />)}</div>
                        </>
                      )}
                    </>
                  )
                })()}
              </>
            ) : (
              gruposTreemap.slice(0, 12).map((g, i) => <BadgeGrupo key={i} g={g} />)
            )}
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-3 mb-6">
            {carregandoTreemap && <div className="text-slate-500 text-sm py-4">Carregando...</div>}
            {treemapSemDados ? (
              <div className="text-slate-500 text-center py-12">Nenhum dado neste periodo. Sincronize ou troque o mes.</div>
            ) : (
              <div style={{ position: 'relative', height: 560 }}>
                <canvas ref={treemapRef} />
              </div>
            )}
            <div className="text-xs text-slate-500 mt-2">Clique numa celula para ver os top terceiros da categoria.</div>
          </div>
        </div>
      )}

      {/* Comparativo ano-a-ano */}
      {ehComparar && (
        <div>
          <div className="text-xs text-slate-500 mb-2">{comparativoInfo}</div>
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            {cmp && (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 min-w-[200px]">Grupo</th>
                    {cmp.anosOrd.map((y, i) => (
                      <th key={y} className="text-right px-3 py-2 min-w-[160px]" style={{ borderBottom: '3px solid ' + corAno(i) }}>{y}</th>
                    ))}
                    <th className="text-right px-3 py-2 bg-slate-100">Total</th>
                    {cmp.anosOrd.length >= 2 && (
                      <th className="text-right px-3 py-2 bg-slate-100">Variacao {cmp.anosOrd[0]}→{cmp.anosOrd[cmp.anosOrd.length - 1]}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {cmp.topLinhas.map((l, li) => {
                    const mx = cmp.maxDaLinha(l)
                    const corG = corDoNode(l.tipo, l.grupo)
                    const primeiro = l.valoresPorAno[cmp.anosOrd[0]] || 0
                    const ultimo = l.valoresPorAno[cmp.anosOrd[cmp.anosOrd.length - 1]] || 0
                    const diff = primeiro > 0 ? ((ultimo - primeiro) / primeiro) * 100 : null
                    return (
                      <tr key={li} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2">
                            <span className="inline-block w-3 h-3 rounded-sm flex-shrink-0" style={{ background: corG }} />
                            <span className="font-semibold text-slate-800">{displayGrupo(l.grupo)}</span>
                            <span className="text-[10px] text-slate-400 uppercase">{l.tipo === 'pagar' ? 'saida' : 'entrada'}</span>
                          </span>
                        </td>
                        {cmp.anosOrd.map((y, i) => {
                          const v = l.valoresPorAno[y] || 0
                          const pct = mx > 0 ? (v / mx) * 100 : 0
                          return (
                            <td key={y} className="px-3 py-2 text-right">
                              <div className="flex items-center gap-2 justify-end">
                                <div className="flex-1 bg-slate-100 rounded h-2 max-w-[100px]">
                                  <div className="h-2 rounded" style={{ width: pct + '%', background: corAno(i) }} />
                                </div>
                                <span className="font-bold text-slate-700 whitespace-nowrap">
                                  {v ? fmtBRLcurto(v) : <span className="text-slate-300">-</span>}
                                </span>
                              </div>
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-right font-bold text-slate-800 bg-slate-50">{fmtBRLcurto(l.total)}</td>
                        {cmp.anosOrd.length >= 2 && (
                          <td className="px-3 py-2 text-right bg-slate-50">{fmtVar(diff)}</td>
                        )}
                      </tr>
                    )
                  })}
                  {/* Footer: totais por ano */}
                  <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold">
                    <td className="px-3 py-2">TOTAL ({Object.keys(cmp.mapa).length} grupos)</td>
                    {cmp.anosOrd.map((y, i) => (
                      <td key={y} className="px-3 py-2 text-right" style={{ color: corAno(i) }}>{fmtBRL(cmp.totaisAno[y])}</td>
                    ))}
                    <td className="px-3 py-2 text-right">{fmtBRL(cmp.totalGeral)}</td>
                    {cmp.anosOrd.length >= 2 && (
                      <td className="px-3 py-2 text-right">
                        {fmtVar(cmp.totaisAno[cmp.anosOrd[0]] > 0 ? ((cmp.totaisAno[cmp.anosOrd[cmp.anosOrd.length - 1]] - cmp.totaisAno[cmp.anosOrd[0]]) / cmp.totaisAno[cmp.anosOrd[0]]) * 100 : null)}
                      </td>
                    )}
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Modal de top terceiros / titulos do fluxo */}
      {modalAberto && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={fecharModal} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[85vh] bg-white rounded-lg shadow-2xl z-50 flex flex-col">
            <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-800">{modalTitulo}</h2>
                <div className="text-xs text-slate-500 mt-0.5" dangerouslySetInnerHTML={{ __html: modalSubtitulo }} />
              </div>
              <button onClick={fecharModal} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">×</button>
            </div>
            <div className="p-5 overflow-y-auto">
              <ModalCorpo corpo={modalCorpo} onTerceiro={abrirDrillMaquinas} />
            </div>
          </div>
        </>
      )}

      {/* 2º popup (empilhado): maquinas/produtos que compoem o fornecedor */}
      {drillMaq && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[60]" onClick={fecharDrillMaq} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl max-h-[85vh] bg-white rounded-lg shadow-2xl z-[70] flex flex-col">
            <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-semibold text-slate-800 truncate">{drillMaq.terceiro}</h2>
                <div className="text-xs text-slate-500 mt-0.5">Maquinas / produtos que compoem o valor</div>
              </div>
              <button onClick={fecharDrillMaq} className="text-slate-500 hover:text-slate-900 text-2xl leading-none shrink-0">×</button>
            </div>
            <div className="p-5 overflow-y-auto">
              <DrillMaquinas d={drillMaq} />
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ===========================================================================
// Conteudo do modal: renderiza, conforme a origem, ou o detalhe de fluxo
// (Sankey) ou a lista de top terceiros (Treemap). Port fiel da montagem de HTML
// da fonte, convertido para JSX.
// ===========================================================================
function ModalCorpo({ corpo, onTerceiro }) {
  if (!corpo || corpo.tipo === 'vazio') return null
  if (corpo.tipo === 'carregando') return <div className="text-slate-500 text-sm">Carregando...</div>
  if (corpo.tipo === 'erro') return <div className="text-red-600 text-sm">{corpo.msg}</div>
  if (corpo.tipo === 'sem-dados') return <div className="text-slate-500 text-sm">Sem dados.</div>

  // --- Detalhe de fluxo (Sankey): tabela de titulos -------------------------
  if (corpo.tipo === 'detalhe') {
    const d = corpo.dados
    const semCategoria = corpo.semCategoria
    const tipoNode = corpo.tipoNode
    const qtdMostrando = d.titulos && (d.titulos.length < d.qtd)
    return (
      <>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-slate-50 border border-slate-200 rounded p-2">
            <div className="text-[10px] uppercase text-slate-500">Total</div>
            <div className="text-lg font-bold text-slate-800">{fmtBRL(d.total)}</div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded p-2">
            <div className="text-[10px] uppercase text-slate-500">Titulos</div>
            <div className="text-lg font-bold text-slate-800">
              {d.qtd}{qtdMostrando && <span className="text-[10px] text-slate-400"> (mostrando {d.titulos.length})</span>}
            </div>
          </div>
        </div>
        {(!d.titulos || !d.titulos.length) ? (
          <div className="text-slate-500 text-sm">Sem titulos.</div>
        ) : (
          <div className="border border-slate-200 rounded overflow-hidden overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-2 py-1">{tipoNode === 'receber' ? 'Cliente' : 'Fornecedor'}</th>
                  <th className="text-left px-2 py-1 whitespace-nowrap">NF / Parc</th>
                  <th className="text-left px-2 py-1">Vencimento</th>
                  {semCategoria && <th className="text-left px-2 py-1">Categoria</th>}
                  <th className="text-left px-2 py-1">Status</th>
                  <th className="text-right px-2 py-1">Valor</th>
                </tr>
              </thead>
              <tbody>
                {d.titulos.map((t, i) => {
                  const venc = t.vencimento ? t.vencimento.split('-').reverse().join('/') : '-'
                  const nfp = (t.nf ? 'NF ' + t.nf : '-') + (t.parcela ? ' p' + t.parcela : '')
                  return (
                    <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-2 py-1 max-w-[200px] truncate" title={t.terceiro || ''}>{t.terceiro || '-'}</td>
                      <td className="px-2 py-1 font-mono text-[10px] whitespace-nowrap">{nfp}</td>
                      <td className="px-2 py-1 whitespace-nowrap">{venc}</td>
                      {semCategoria && <td className="px-2 py-1 max-w-[150px] truncate text-slate-500" title={t.categoria || ''}>{t.categoria || '-'}</td>}
                      <td className="px-2 py-1 text-slate-500 text-[10px]">{t.status || '-'}</td>
                      <td className="px-2 py-1 text-right font-semibold whitespace-nowrap">{fmtBRL(t.valor)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </>
    )
  }

  // --- Top terceiros (Treemap): barras horizontais --------------------------
  if (corpo.tipo === 'terceiros') {
    const { lista, tp, grupo, categoria } = corpo
    const top = lista.slice(0, 10)
    const totalCat = lista.reduce((s, t) => s + t.valor, 0)
    const maxVal = top[0] ? top[0].valor : 1
    const resto = lista.length - 10
    const restoVal = lista.slice(10).reduce((s, t) => s + t.valor, 0)
    return (
      <div className="space-y-2">
        {top.map((t, i) => {
          const pct = totalCat > 0 ? (100 * t.valor / totalCat) : 0
          const barPct = (100 * t.valor / maxVal)
          return (
            <button key={i} type="button"
              onClick={() => onTerceiro && onTerceiro(t.nome, tp, grupo, categoria)}
              title="Ver maquinas/produtos que compoem este valor"
              className="w-full text-left border border-slate-200 rounded-lg p-3 hover:border-slate-400 hover:bg-slate-50 transition-colors cursor-pointer">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="font-medium text-slate-800 text-sm flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">{i + 1}.</span><span>{t.nome}</span>
                </div>
                <div className="text-right text-xs text-slate-500">{pct.toFixed(1)}%</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div className="h-2 rounded-full" style={{ width: barPct + '%', background: corDoNode(tp, grupo) }} />
                </div>
                <div className="text-right font-bold text-slate-800 text-sm whitespace-nowrap">{fmtBRL(t.valor)}</div>
              </div>
            </button>
          )
        })}
        {lista.length > 10 && (
          <div className="text-xs text-slate-500 text-center pt-2">+ {resto} outros ({fmtBRL(restoVal)})</div>
        )}
      </div>
    )
  }

  return null
}

// ===========================================================================
// Conteudo do 2º popup: maquinas/produtos (descricao, qtd, valor) que compoem
// o valor de um fornecedor. Os valores vem da NF-e de entrada e podem divergir
// um pouco do valor do quadrante (frete/impostos/rateio de duplicata).
// ===========================================================================
function DrillMaquinas({ d }) {
  if (!d) return null
  if (d.loading) return <div className="text-slate-500 text-sm">Carregando...</div>
  if (d.erro) return <div className="text-red-600 text-sm">Erro: {d.erro}</div>
  if (d.semDetalhe) {
    return <div className="text-slate-500 text-sm">Sem detalhamento de itens para contas a receber.</div>
  }

  const itens = d.itens || []
  const divergencia = Math.abs((d.totalItens || 0) - (d.totalTitulo || 0))
  const mostraDivergencia = (d.totalTitulo || 0) > 0 && divergencia / d.totalTitulo > 0.01

  return (
    <>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-slate-50 border border-slate-200 rounded p-2">
          <div className="text-[10px] uppercase text-slate-500">Valor no fluxo</div>
          <div className="text-lg font-bold text-slate-800">{fmtBRL(d.totalTitulo || 0)}</div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded p-2">
          <div className="text-[10px] uppercase text-slate-500">Soma dos itens (NF-e)</div>
          <div className="text-lg font-bold text-slate-800">{fmtBRL(d.totalItens || 0)}</div>
        </div>
      </div>
      {mostraDivergencia && (
        <div className="text-[11px] text-slate-500 mb-3">
          A soma dos itens da NF-e pode diferir do valor no fluxo (frete, impostos ou rateio de duplicatas).
        </div>
      )}
      {itens.length === 0 ? (
        <div className="text-slate-500 text-sm">Sem itens de NF-e para este fornecedor no periodo (ex.: notas de servico/frete sem itens).</div>
      ) : (
        <div className="border border-slate-200 rounded overflow-hidden overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-2 py-1">Maquina / produto</th>
                <th className="text-right px-2 py-1 whitespace-nowrap">Qtd</th>
                <th className="text-right px-2 py-1 whitespace-nowrap">Valor</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it, i) => (
                <tr key={i} className="border-t border-slate-100">
                  <td className="px-2 py-1 text-slate-800">{it.descricao}</td>
                  <td className="px-2 py-1 text-right text-slate-600 whitespace-nowrap">{it.qtd ? it.qtd.toLocaleString('pt-BR') : '-'}</td>
                  <td className="px-2 py-1 text-right font-medium text-slate-800 whitespace-nowrap">{fmtBRL(it.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
