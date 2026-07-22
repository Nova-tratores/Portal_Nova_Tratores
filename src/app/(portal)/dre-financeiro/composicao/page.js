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

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta, nomeMes } from '@/lib/dre-financeiro/format'
import { NATUREZAS, DESCRICAO_NATUREZA, naturezaDoGrupo } from '@/lib/dre-financeiro/natureza'

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
// ATENCAO: nao basta testar `window.Chart` para decidir se ja esta tudo carregado.
// Varias telas do modulo (aderencia, margens, curva-saldo, ...) carregam SO o
// chart.umd, sem o plugin treemap. Ao navegar (client-side) de uma delas para ca,
// window.Chart ja existe mas o controller 'treemap' NAO esta registado, e o
// new Chart({type:'treemap'}) rebenta dentro do useEffect -> a error boundary do
// Next mostra "Application error: a client-side exception has occurred".
// Por isso o teste e' pelo REGISTO do controller, e o chart.umd so e' (re)carregado
// se ainda nao existir.
function treemapPronto() {
  if (typeof window === 'undefined' || !window.Chart) return false
  try { return !!window.Chart.registry.getController('treemap') } catch { return false }
}

let chartLibPromise = null
function carregarChartLibs() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (treemapPronto()) return Promise.resolve()
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
  const base = window.Chart
    ? Promise.resolve()
    : addScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js')
  chartLibPromise = base
    .then(() => addScript('https://cdn.jsdelivr.net/npm/chartjs-chart-treemap@3.1.0/dist/chartjs-chart-treemap.min.js'))
  return chartLibPromise
}

export default function ComposicaoPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  // --- Estado de controles ---------------------------------------------------
  // TIPO replicado localmente (na fonte vinha do header global). Default 'pagar'.
  const [tipo, setTipo] = useState('pagar') // 'pagar' | 'receber' | 'ambos'

  // Mes/ano navegaveis (na fonte vinham por querystring; aqui sao estado).
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())

  // Natureza DRE selecionada (null = todas). Custo x despesa x receita nao existe
  // nas tabelas do Omie: sai do grupo_categoria via naturezaDoGrupo.
  const [natureza, setNatureza] = useState(null)

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
  // Carregar(): fetch em /api/composicao.
  //
  // Busca SEMPRE tipo=ambos: a faixa de naturezas precisa de receitas e saidas
  // ao mesmo tempo pra mostrar o bolo inteiro. Com os dois lados em maos, o
  // toggle A Pagar/A Receber vira filtro no cliente — de brinde, trocar o
  // toggle deixa de refazer requisicao. Reage so a conta/mes/ano.
  // =========================================================================
  useEffect(() => {
    setDados(null)
    arvore.current = null
    const qs = 'conta=' + conta + '&tipo=ambos&mes=' + mes + '&ano=' + ano
    let ativo = true
    fetch('/api/dre-financeiro/composicao?' + qs).then((r) => r.json()).then((d) => {
      if (!ativo) return
      if (d.erro) { alert('Erro: ' + d.erro); return }
      arvore.current = d.arvore || {}
      setDados(d)
    }).catch((e) => { if (ativo) alert('Erro: ' + e.message) })
    return () => { ativo = false }
  }, [conta, mes, ano])

  // =========================================================================
  // Derivados: natureza por folha, resumo da faixa e recorte (tipo + natureza).
  // Tudo o que a tela mostra (treemap, KPIs, legenda) sai do recorte, senao o
  // cabecalho passa a contradizer o grafico.
  // =========================================================================
  const folhasComNatureza = useMemo(
    () => (dados?.folhas || []).map((f) => ({ ...f, natureza: naturezaDoGrupo(f.tipo, f.grupo) })),
    [dados],
  )

  const totalGeral = useMemo(
    () => folhasComNatureza.reduce((s, f) => s + f.valor, 0),
    [folhasComNatureza],
  )

  // Resumo por natureza: sempre sobre o TOTAL do mes (nao sobre o recorte),
  // pra faixa continuar servindo de mapa mesmo com um filtro ativo.
  const resumoNaturezas = useMemo(() => {
    const m = {}
    folhasComNatureza.forEach((f) => {
      if (!m[f.natureza]) m[f.natureza] = { valor: 0, categorias: 0 }
      m[f.natureza].valor += f.valor
      m[f.natureza].categorias++
    })
    return m
  }, [folhasComNatureza])

  const folhasFiltradas = useMemo(() => folhasComNatureza.filter((f) => {
    if (natureza && f.natureza !== natureza) return false
    if (tipo !== 'ambos' && f.tipo !== tipo) return false
    return true
  }), [folhasComNatureza, natureza, tipo])

  // Grupos derivados do recorte (a lista `grupos` da API e sempre a do mes inteiro).
  const gruposFiltrados = useMemo(() => {
    const m = new Map()
    folhasFiltradas.forEach((f) => {
      const k = f.tipo + '|' + f.grupo
      const g = m.get(k) || { nome: f.grupo, tipo: f.tipo, valor: 0 }
      g.valor += f.valor
      m.set(k, g)
    })
    return [...m.values()].sort((a, b) => b.valor - a.valor)
  }, [folhasFiltradas])

  // Clicar na faixa alinha o toggle de tipo, em vez de deixar os dois brigando
  // (ex.: "Receitas" com o toggle em A Pagar daria tela vazia).
  function escolherNatureza(chave) {
    const nova = natureza === chave ? null : chave
    setNatureza(nova)
    if (!nova) return
    const def = NATUREZAS.find((n) => n.chave === nova)
    setTipo(def && def.tipo ? def.tipo : 'ambos')
  }

  // Caminho inverso: trocar o tipo larga a natureza que nao cabe nele (escolher
  // "A Pagar" com Receitas ativo daria tela vazia sem explicacao).
  function escolherTipo(novoTipo) {
    setTipo(novoTipo)
    if (!natureza || novoTipo === 'ambos') return
    const def = NATUREZAS.find((n) => n.chave === natureza)
    if (def && def.tipo && def.tipo !== novoTipo) setNatureza(null)
  }

  // =========================================================================
  // Render do Treemap (Chart.js). Port fiel do bloco de chart da fonte.
  // KPIs/legenda viram JSX abaixo. Reage a dados / chartReady.
  // =========================================================================
  useEffect(() => {
    if (!chartReady || !dados || !window.Chart) return
    // Rede de seguranca: um erro do Chart.js aqui dentro sobe para a error boundary
    // do Next e derruba a TELA INTEIRA ("Application error"). Melhor perder so o
    // grafico e manter KPIs/legenda/modal a funcionar.
    try {
      montarTreemap()
    } catch (e) {
      console.error('[composicao] falha ao montar o treemap:', e)
      if (treemapInst.current) { try { treemapInst.current.destroy() } catch { } treemapInst.current = null }
    }

    function montarTreemap() {
    // Recorte atual (tipo + natureza), nao a lista crua da API.
    const folhas = folhasFiltradas
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
    }
  }, [chartReady, dados, folhasFiltradas])

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
  if (!loading && !loadingPerm && userProfile && (!temAcesso('financeiro') && !pode('dre', 'composicao'))) return <SemPermissao />

  // Classes dos toggles inativos (espelham a fonte).
  const inativoToggle = 'bg-white text-slate-700 hover:bg-slate-100'

  // --- KPIs (mesma montagem da fonte, agora sobre o recorte) ----------------
  const grupos = gruposFiltrados
  const folhas = folhasFiltradas
  const totalRecorte = folhas.reduce((s, f) => s + f.valor, 0)
  const topCat = folhas[0]
  const kpiTotal = dados ? fmtBRL(totalRecorte) : '--'
  const kpiGrupos = dados ? grupos.length : '--'
  const kpiCategorias = dados ? folhas.length : '--'
  const kpiTopNome = topCat ? topCat.categoria : '--'
  const kpiTopValor = topCat ? (fmtBRL(topCat.valor) + ' (' + (100 * topCat.valor / (totalRecorte || 1)).toFixed(1) + '%)') : '--'

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
          <button type="button" onClick={() => escolherTipo('pagar')}
            className={'px-3 py-1 transition ' + (tipo === 'pagar' ? 'bg-red-600 text-white' : inativoToggle)}>A Pagar</button>
          <button type="button" onClick={() => escolherTipo('receber')}
            className={'px-3 py-1 transition border-l border-slate-300 ' + (tipo === 'receber' ? 'bg-emerald-600 text-white' : inativoToggle)}>A Receber</button>
          <button type="button" onClick={() => escolherTipo('ambos')}
            className={'px-3 py-1 transition border-l border-slate-300 ' + (tipo === 'ambos' ? 'bg-slate-800 text-white' : inativoToggle)}>Ambos</button>
        </div>
        <span className="text-xs font-semibold text-slate-700">{labelTipo}</span>
      </div>

      {/* Faixa por natureza DRE (custo x despesa x receita). Clicar filtra o resto
          da tela; clicar de novo limpa. Naturezas sem valor no mes ficam de fora. */}
      {dados && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-slate-500 uppercase tracking-wide">Natureza</span>
            {natureza && (
              <button onClick={() => escolherNatureza(natureza)}
                className="text-xs text-slate-500 underline hover:text-slate-800">limpar filtro</button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {NATUREZAS.filter((n) => resumoNaturezas[n.chave]).map((n) => {
              const r = resumoNaturezas[n.chave]
              const pct = totalGeral > 0 ? (100 * r.valor / totalGeral) : 0
              const ativo = natureza === n.chave
              return (
                <button key={n.chave} type="button" onClick={() => escolherNatureza(n.chave)}
                  title={DESCRICAO_NATUREZA[n.chave]}
                  className={'text-left rounded-lg border p-3 transition ' + (ativo ? 'bg-slate-50 ring-2' : 'bg-white hover:bg-slate-50')}
                  style={{ borderColor: n.cor, ...(ativo ? { boxShadow: '0 0 0 2px ' + n.cor } : null) }}>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: n.cor }} />
                    <span className="text-xs font-semibold text-slate-700 truncate">{n.rotulo}</span>
                  </div>
                  <div className="text-lg font-bold text-slate-800 mt-1 leading-tight">{fmtBRLcurto(r.valor)}</div>
                  <div className="text-[11px] text-slate-500">{pct.toFixed(1)}% &middot; {r.categorias} cat.</div>
                </button>
              )
            })}
          </div>
          {/* O "custo" daqui e' compra paga, nao o CMV do DRE. Sem este aviso a
              comparacao com a aba DRE vira duvida recorrente. */}
          {resumoNaturezas.custo && (
            <div className="text-[11px] text-slate-500 mt-2">
              <strong className="font-semibold">Custos</strong> = grupo &quot;Despesas Diretas&quot; do Omie (compra de mercadoria), pela <strong className="font-semibold">data de vencimento do título</strong>.
              Não é o CMV da aba DRE, que é por competência e sai do CMC das vendas — os dois não batem por definição.
              <strong className="font-semibold"> Investimento</strong> é CAPEX e não entra no DRE.
            </div>
          )}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">
            Total no mes{natureza ? ' · ' + (NATUREZAS.find((n) => n.chave === natureza) || {}).rotulo : ''}
          </div>
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
          <div className="text-slate-500 text-center py-12">
            {/* Distingue "mes vazio" de "filtro vazio" — sem isto o usuario acha que faltou sincronizar. */}
            {totalGeral > 0
              ? 'Nada neste recorte. Limpe o filtro de natureza ou troque o modo.'
              : 'Nenhum dado neste periodo. Sincronize ou troque o mes.'}
          </div>
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
