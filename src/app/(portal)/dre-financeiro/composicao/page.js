'use client'
// =============================================================================
// Tela Composicao (port FIEL de views/composicao.ejs do financeiro-omie-dashboard).
//
// Mantem EXATAMENTE os calculos e o comportamento do original:
//  - Toolbar de mes: ← mes anterior / titulo / mes proximo → / Hoje + label do modo.
//  - 4 KPIs: Total no mes, Grupos, Categorias, Top categoria (+ valor/percentual).
//  - Legenda de grupos (no modo "ambos" separada em Saidas/Entradas, top 8 cada;
//    nos demais modos, top 12).
//  - Treemap (Chart.js 4.4.0 + chartjs-chart-treemap 3.1.0) — cada folha = 1
//    categoria; cor define o grupo (HSL deterministica por hash do nome).
//  - Modal de drill-down: top 10 terceiros da categoria (barras horizontais),
//    com "+ N outros" agregado, lidos da arvore retornada por /api/composicao.
//  - Esc fecha o modal.
//
// O <script> inline original (fetch + manipulacao do DOM + Chart.js) virou logica
// React: estados (useState), efeitos (useEffect) para fetch/render, e JSX para
// KPIs/legenda/modal. O treemap (canvas) continua imperativo via ref, igual a fonte.
//
// A tela original tinha o toggle de TIPO (A Pagar / A Receber / Ambos) no header
// global; como o layout do modulo do portal so expoe o seletor de CONTA, o toggle
// de TIPO e replicado localmente nesta tela (default 'pagar' = pegaTipo da fonte).
//
// O layout do modulo (.../dre-financeiro/layout.js) ja aplica o gate de permissao
// 'financeiro', a sub-nav e o seletor de conta; ainda assim importamos useAuth/
// usePermissoes e SemPermissao por consistencia com o padrao do portal.
//
// Libs de grafico: Chart.js 4.4.0 + chartjs-chart-treemap 3.1.0 (mesmas versoes
// da fonte) carregadas via CDN num <script> dinamico, uma unica vez.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta, nomeMes } from '@/lib/dre-financeiro/format'

// ---------------------------------------------------------------------------
// Formatadores locais (identicos aos do <script> da fonte). Mantidos inline para
// preservar EXATAMENTE o arredondamento usado nos labels do grafico/legenda.
// Atencao: este fmtBRLcurto e o da composicao.ejs (k sem casas decimais),
// distinto do helper global - nao substituir por formatBRLcurto.
// ---------------------------------------------------------------------------
function fmtBRL(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(n) || 0)
}
function fmtBRLcurto(n) {
  const v = Number(n) || 0
  if (v >= 1000000) return 'R$ ' + (v / 1000000).toFixed(1).replace('.', ',') + 'M'
  if (v >= 1000) return 'R$ ' + (v / 1000).toFixed(0) + 'k'
  return 'R$ ' + v.toFixed(0)
}

// ---------------------------------------------------------------------------
// Hash deterministico para cor consistente do grupo entre sessoes (port fiel).
// Paleta por tipo: receber=verde, pagar=vermelho/laranja. Variacao por grupo
// via hash (varia hue dentro da faixa do tipo).
// ---------------------------------------------------------------------------
function hashStr(s) {
  let h = 0
  for (let i = 0; i < (s || '').length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0 }
  return Math.abs(h)
}
function corDoNode(tp, grupo) {
  if (!grupo) grupo = 'Sem grupo'
  const h = hashStr(String(grupo))
  if (tp === 'receber') { const hue = 130 + (h % 50) - 20; return 'hsl(' + hue + ', 50%, 60%)' } // 110..160 (verdes)
  if (tp === 'pagar') { let hue = (h % 60) - 15; if (hue < 0) hue += 360; return 'hsl(' + hue + ', 60%, 62%)' } // -15..45 (vermelhos/laranjas)
  return 'hsl(220, 10%, 60%)'
}
function corDoNodeBorda(tp, grupo) {
  if (!grupo) grupo = 'Sem grupo'
  const h = hashStr(String(grupo))
  if (tp === 'receber') { const hue = 130 + (h % 50) - 20; return 'hsl(' + hue + ', 50%, 40%)' }
  if (tp === 'pagar') { let hue = (h % 60) - 15; if (hue < 0) hue += 360; return 'hsl(' + hue + ', 55%, 42%)' }
  return 'hsl(220, 10%, 40%)'
}

// ---------------------------------------------------------------------------
// Carregamento das libs de grafico (Chart.js + plugin treemap) via CDN, uma
// unica vez. Mesmas versoes da fonte (composicao.ejs).
// ---------------------------------------------------------------------------
let chartLibPromise = null
function carregarChartLibs() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.Chart) return Promise.resolve()
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
  chartLibPromise = addScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js')
    .then(() => addScript('https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@3.1.0/dist/chartjs-chart-treemap.min.js'))
  return chartLibPromise
}

export default function ComposicaoPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  // --- Estado de controles ---------------------------------------------------
  // TIPO replicado localmente (na fonte vinha do header global). Default 'pagar'.
  const [tipo, setTipo] = useState('pagar') // 'pagar' | 'receber' | 'ambos'

  // Mes/ano navegaveis (na fonte vinham por querystring; aqui sao estado).
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())

  // Dados de /api/composicao + arvore p/ o drill-down do modal.
  const [dados, setDados] = useState(null)
  const arvore = useRef(null)
  const [chartReady, setChartReady] = useState(false)

  // Modal de top terceiros
  const [modalAberto, setModalAberto] = useState(false)
  const [modalTitulo, setModalTitulo] = useState('Top terceiros')
  const [modalSubtitulo, setModalSubtitulo] = useState('') // HTML (port fiel do innerHTML)
  const [modalCorpo, setModalCorpo] = useState({ tipo: 'vazio' })

  // Refs do treemap
  const treemapRef = useRef(null)
  const treemapInst = useRef(null)

  // Label do modo (A Pagar / A Receber / Pagar + Receber) — port fiel
  const labelTipo = tipo === 'pagar' ? 'A Pagar' : (tipo === 'receber' ? 'A Receber' : 'Pagar + Receber')

  // Carrega as libs uma vez.
  useEffect(() => {
    carregarChartLibs().then(() => setChartReady(true)).catch(() => setChartReady(false))
  }, [])

  // =========================================================================
  // Carregar(): fetch em /api/composicao (port fiel da funcao homonima da fonte).
  // Reage a conta/tipo/mes/ano.
  // =========================================================================
  useEffect(() => {
    setDados(null)
    arvore.current = null
    const qs = 'conta=' + conta + '&tipo=' + tipo + '&mes=' + mes + '&ano=' + ano
    let ativo = true
    fetch('/api/dre-financeiro/composicao?' + qs).then((r) => r.json()).then((d) => {
      if (!ativo) return
      if (d.erro) { alert('Erro: ' + d.erro); return }
      arvore.current = d.arvore || {}
      setDados(d)
    }).catch((e) => { if (ativo) alert('Erro: ' + e.message) })
    return () => { ativo = false }
  }, [conta, tipo, mes, ano])

  // =========================================================================
  // Render do Treemap (Chart.js). Port fiel do bloco de chart da fonte.
  // KPIs/legenda viram JSX abaixo. Reage a dados / chartReady.
  // =========================================================================
  useEffect(() => {
    if (!chartReady || !dados || !window.Chart) return
    const folhas = dados.folhas || []
    // Sem folhas: destroi o chart (o JSX abaixo mostra o aviso "Nenhum dado...").
    if (folhas.length === 0) {
      if (treemapInst.current) { treemapInst.current.destroy(); treemapInst.current = null }
      return
    }
    if (!treemapRef.current) return

    if (treemapInst.current) treemapInst.current.destroy()
    const ctx = treemapRef.current.getContext('2d')
    // Estrutura plana: cada folha = uma categoria. Cor define o grupo.
    treemapInst.current = new window.Chart(ctx, {
      type: 'treemap',
      data: {
        datasets: [{
          tree: folhas,
          key: 'valor',
          spacing: 1,
          borderWidth: 1,
          borderRadius: 2,
          labels: {
            display: true,
            align: 'left',
            position: 'top',
            color: '#0f172a',
            font: { size: 11 },
            padding: 4,
            formatter: function (ctx2) {
              const d2 = ctx2.raw && ctx2.raw._data
              if (!d2) return ''
              const nome = d2.categoria || ''
              const label = nome.length > 28 ? nome.slice(0, 26) + '...' : nome
              return [label, fmtBRLcurto(ctx2.raw.v)]
            },
            overflow: 'hidden'
          },
          backgroundColor: function (ctx2) {
            if (ctx2.type !== 'data') return 'transparent'
            const d2 = ctx2.raw && ctx2.raw._data
            return corDoNode(d2 && d2.tipo, d2 && d2.grupo)
          },
          borderColor: function (ctx2) {
            if (ctx2.type !== 'data') return 'rgba(0,0,0,0)'
            const d2 = ctx2.raw && ctx2.raw._data
            return corDoNodeBorda(d2 && d2.tipo, d2 && d2.grupo)
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: function (evt, els) {
          if (!els || !els.length) return
          const raw = els[0].element.$context.raw
          const data = raw && raw._data
          if (data && data.categoria) abrirModal(data.tipo, data.grupo, data.categoria, raw.v)
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: {
              title: function (items) {
                const d2 = items[0].raw && items[0].raw._data
                return (d2 && d2.categoria) || ''
              },
              label: function (item) {
                const d2 = item.raw && item.raw._data
                if (!d2) return ''
                const pct = d2.gv ? (100 * item.raw.v / d2.gv) : 0
                const labelTp = d2.tipo === 'receber' ? 'Entrada' : (d2.tipo === 'pagar' ? 'Saida' : '')
                return [
                  (labelTp ? labelTp + ' - ' : '') + 'Grupo: ' + (d2.grupo || '-'),
                  fmtBRL(item.raw.v) + (pct ? ' (' + pct.toFixed(1) + '% do grupo)' : '')
                ]
              }
            }
          }
        }
      }
    })
  }, [chartReady, dados])

  // Limpa o chart ao desmontar.
  useEffect(() => {
    return () => { if (treemapInst.current) { treemapInst.current.destroy(); treemapInst.current = null } }
  }, [])

  // =========================================================================
  // Modal: top terceiros da categoria (port fiel de abrirModal/fecharModal).
  // =========================================================================
  function abrirModal(tp, grupo, categoria, valorTotal) {
    const labelTp = tp === 'receber' ? '+ Entrada' : (tp === 'pagar' ? '- Saida' : '')
    setModalTitulo(categoria)
    setModalSubtitulo(
      (labelTp ? '<span class="font-semibold ' + (tp === 'receber' ? 'text-emerald-700' : 'text-red-700') + '">' + labelTp + '</span> &middot; ' : '')
      + 'Grupo: ' + grupo + ' &middot; ' + fmtBRL(valorTotal)
    )
    setModalCorpo({ tipo: 'carregando' })
    setModalAberto(true)

    const chaveArvore = (tp || '') + '|' + grupo
    const node = arvore.current && arvore.current[chaveArvore]
    if (!node || !node.categorias[categoria]) {
      setModalCorpo({ tipo: 'sem-dados' })
      return
    }
    const terceirosObj = node.categorias[categoria].terceiros || {}
    const lista = Object.entries(terceirosObj)
      .map((p) => ({ nome: p[0], valor: p[1] }))
      .sort((a, b) => b.valor - a.valor)
    setModalCorpo({ tipo: 'terceiros', lista, tp, grupo })
  }

  function fecharModal() { setModalAberto(false) }

  // Esc fecha o modal (port fiel do keydown da fonte).
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') fecharModal() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // =========================================================================
  // Navegacao de mes (port fiel de mesAnt/mesProx/Hoje da fonte).
  // =========================================================================
  function mesAnterior() {
    if (mes === 1) { setMes(12); setAno((a) => a - 1) } else { setMes((m) => m - 1) }
  }
  function mesProximo() {
    if (mes === 12) { setMes(1); setAno((a) => a + 1) } else { setMes((m) => m + 1) }
  }
  function irHoje() { const h = new Date(); setMes(h.getMonth() + 1); setAno(h.getFullYear()) }

  // --- Gate de permissao (BRIEF item 1) -------------------------------------
  if (!loading && !loadingPerm && userProfile && !temAcesso('financeiro')) return <SemPermissao />

  // Classes dos toggles inativos (espelham a fonte).
  const inativoToggle = 'bg-white text-slate-700 hover:bg-slate-100'

  // --- KPIs (port fiel da montagem da fonte) --------------------------------
  const grupos = dados ? (dados.grupos || []) : []
  const folhas = dados ? (dados.folhas || []) : []
  const topCat = folhas[0]
  const kpiTotal = dados ? fmtBRL(dados.total) : '--'
  const kpiGrupos = dados ? grupos.length : '--'
  const kpiCategorias = dados ? folhas.length : '--'
  const kpiTopNome = topCat ? topCat.categoria : '--'
  const kpiTopValor = topCat ? (fmtBRL(topCat.valor) + ' (' + (100 * topCat.valor / (dados.total || 1)).toFixed(1) + '%)') : '--'

  // --- Legenda de grupos (badge) --------------------------------------------
  function BadgeGrupo({ g }) {
    const c = corDoNode(g.tipo, g.nome), cb = corDoNodeBorda(g.tipo, g.nome)
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border" style={{ borderColor: cb }}>
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: c }} />
        <span className="text-slate-700 font-medium">{g.nome}</span>
        <span className="text-slate-500">{fmtBRLcurto(g.valor)}</span>
      </span>
    )
  }

  const semDados = dados && folhas.length === 0

  return (
    <>
      {/* Toolbar de mes */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={mesAnterior} className="px-3 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100">&larr;</button>
        <h1 className="text-2xl font-semibold text-slate-800 min-w-[180px] text-center">{nomeMes(mes)} {ano}</h1>
        <button onClick={mesProximo} className="px-3 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100">&rarr;</button>
        <button onClick={irHoje} className="px-3 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100 text-sm">Hoje</button>
        <span className="text-xs text-slate-500 ml-2">Modo:</span>
        {/* Toggle de TIPO (replicado da header global da fonte) */}
        <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm">
          <button type="button" onClick={() => setTipo('pagar')}
            className={'px-3 py-1 transition ' + (tipo === 'pagar' ? 'bg-red-600 text-white' : inativoToggle)}>A Pagar</button>
          <button type="button" onClick={() => setTipo('receber')}
            className={'px-3 py-1 transition border-l border-slate-300 ' + (tipo === 'receber' ? 'bg-emerald-600 text-white' : inativoToggle)}>A Receber</button>
          <button type="button" onClick={() => setTipo('ambos')}
            className={'px-3 py-1 transition border-l border-slate-300 ' + (tipo === 'ambos' ? 'bg-slate-800 text-white' : inativoToggle)}>Ambos</button>
        </div>
        <span className="text-xs font-semibold text-slate-700">{labelTipo}</span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Total no mes</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{kpiTotal}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Grupos</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{kpiGrupos}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Categorias</div>
          <div className="text-2xl font-bold text-slate-800 mt-1">{kpiCategorias}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Top categoria</div>
          <div className="text-base font-bold text-slate-800 mt-1 truncate">{kpiTopNome}</div>
          <div className="text-xs text-slate-500">{kpiTopValor}</div>
        </div>
      </div>

      {/* Legenda de grupos - separada por tipo no modo "ambos" */}
      <div className="flex flex-wrap gap-2 mb-3 text-xs">
        {tipo === 'ambos' ? (
          (() => {
            const saidas = grupos.filter((g) => g.tipo === 'pagar').slice(0, 8)
            const entradas = grupos.filter((g) => g.tipo === 'receber').slice(0, 8)
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
          })()
        ) : (
          grupos.slice(0, 12).map((g, i) => <BadgeGrupo key={i} g={g} />)
        )}
      </div>

      {/* Treemap */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 mb-6">
        {semDados ? (
          <div className="text-slate-500 text-center py-12">Nenhum dado neste periodo. Sincronize ou troque o mes.</div>
        ) : (
          <div style={{ position: 'relative', height: 560 }}>
            <canvas ref={treemapRef} />
          </div>
        )}
        <div className="text-xs text-slate-500 mt-2">Clique numa celula para ver os top terceiros da categoria.</div>
      </div>

      {/* Modal de top terceiros */}
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
              <ModalCorpo corpo={modalCorpo} />
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ===========================================================================
// Conteudo do modal: lista de top 10 terceiros da categoria (barras horizontais),
// com "+ N outros" agregado. Port fiel da montagem de HTML da fonte (abrirModal),
// convertido para JSX.
// ===========================================================================
function ModalCorpo({ corpo }) {
  if (!corpo || corpo.tipo === 'vazio') return null
  if (corpo.tipo === 'carregando') return <div className="text-slate-500 text-sm">Carregando...</div>
  if (corpo.tipo === 'sem-dados') return <div className="text-slate-500 text-sm">Sem dados.</div>

  if (corpo.tipo === 'terceiros') {
    const { lista, tp, grupo } = corpo
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
            <div key={i} className="border border-slate-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="font-medium text-slate-800 text-sm flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">{i + 1}.</span>
                  <span>{t.nome}</span>
                </div>
                <div className="text-right text-xs text-slate-500">{pct.toFixed(1)}%</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-slate-100 rounded-full h-2">
                  <div className="h-2 rounded-full" style={{ width: barPct + '%', background: corDoNode(tp, grupo) }} />
                </div>
                <div className="text-right font-bold text-slate-800 text-sm whitespace-nowrap">{fmtBRL(t.valor)}</div>
              </div>
            </div>
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
