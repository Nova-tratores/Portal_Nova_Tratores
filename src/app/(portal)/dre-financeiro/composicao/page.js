'use client'
// =============================================================================
// Tela Composicao (port FIEL de views/composicao.ejs do financeiro-omie-dashboard).
//
// Mantem EXATAMENTE os calculos e o comportamento do original:
//  - Toolbar de mes: ← mes anterior / titulo / mes proximo → / Hoje + label do modo.
//  - 4 KPIs: Total no mes, Grupos, Categorias, Top categoria (+ valor/percentual).
//  - Legenda de grupos (no modo "ambos" separada em Saidas/Entradas). NAO e' mais
//    so legenda: cada grupo FILTRA o treemap (um por vez), e os rotulos
//    Todos/Saidas/Entradas escrevem no mesmo estado do toggle de tipo do topo.
//    O corte de top 8/12 da fonte saiu — cortar a lista esconderia filtros.
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
// ISO YYYY-MM-DD -> DD/MM/YYYY (ignora a parte de hora se vier junto).
function fmtData(iso) {
  if (!iso) return '—'
  const d = String(iso).slice(0, 10).split('-')
  return d.length === 3 ? d[2] + '/' + d[1] + '/' + d[0] : String(iso)
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

// Agrega folhas em grupos (chave "tipo|nome", igual a da arvore de drill-down),
// do maior valor pro menor. Usada duas vezes: no recorte final (KPIs) e no
// recorte sem o filtro de grupo (legenda).
function agregarGrupos(folhas) {
  const m = new Map()
  folhas.forEach((f) => {
    const k = f.tipo + '|' + f.grupo
    const g = m.get(k) || { chave: k, nome: f.grupo, tipo: f.tipo, valor: 0 }
    g.valor += f.valor
    m.set(k, g)
  })
  return [...m.values()].sort((a, b) => b.valor - a.valor)
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
  const anoAtual = hoje.getFullYear()
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())

  // Periodo mostrado. 'mes' preserva a navegacao mensal original (o default); os
  // demais viram um intervalo de/ate que a API ja aceita. A API pagina, entao
  // ano/3-anos vem completos (senao truncaria em 1000 linhas — ver route.ts).
  const [preset, setPreset] = useState('mes') // 'mes'|'ano-atual'|'ano-anterior'|'3-anos'|'custom'
  const [deCustom, setDeCustom] = useState('')  // ISO YYYY-MM-DD
  const [ateCustom, setAteCustom] = useState('')

  // Natureza DRE selecionada (null = todas). Custo x despesa x receita nao existe
  // nas tabelas do Omie: sai do grupo_categoria via naturezaDoGrupo.
  const [natureza, setNatureza] = useState(null)

  // Grupo selecionado na legenda (null = todos). Chave "tipo|nome" — a MESMA da
  // arvore do drill-down; o nome sozinho colidiria (ha "Devolucoes" nos dois lados).
  const [grupoSel, setGrupoSel] = useState(null)

  // Esconder devolucoes dos DOIS lados (saida "Devolucoes de Vendas" e entrada
  // "Devolucoes"/"DevolucoeseOutras Saidas"). Desmarcado por padrao: o mes cheio
  // continua sendo o default: esconder e' uma escolha explicita do usuario.
  const [semDevolucoes, setSemDevolucoes] = useState(false)

  // Dados de /api/composicao + arvore p/ o drill-down do modal.
  const [dados, setDados] = useState(null)
  const arvore = useRef(null)
  const [chartReady, setChartReady] = useState(false)

  // Modal de top terceiros
  const [modalAberto, setModalAberto] = useState(false)
  const [modalTitulo, setModalTitulo] = useState('Top terceiros')
  const [modalSubtitulo, setModalSubtitulo] = useState('') // HTML (port fiel do innerHTML)
  const [modalCorpo, setModalCorpo] = useState({ tipo: 'vazio' })

  // Contexto da categoria aberta no modal — alimenta os drill-downs (títulos de
  // um terceiro) e a aba "Modelo". Guardado à parte pra não refazer o cálculo.
  const [modalCtx, setModalCtx] = useState(null) // { tp, grupo, categoria, valorTotal, de, ate, conta, podeModelo }
  // Aba do popup: 'cliente' (os títulos, exato) x 'modelo' (vendas cruzadas por
  // período+cliente — só existe em categorias de receita).
  const [vistaPopup, setVistaPopup] = useState('cliente')
  // Aba Modelo: carregada sob demanda (1ª vez que se abre a aba). O cache vive
  // no modalCtx.categoria — trocar de categoria reabre o modal e zera isto.
  const [modeloState, setModeloState] = useState({ loading: false, dados: null, erro: null })
  // Drill aberto DENTRO do modal: títulos de um terceiro OU vendas de um modelo.
  // null = mostra a lista principal (terceiros ou modelos) da aba atual.
  const [drill, setDrill] = useState(null)

  // Refs do treemap
  const treemapRef = useRef(null)
  const treemapInst = useRef(null)

  // Label do modo (A Pagar / A Receber / Pagar + Receber) — port fiel
  const labelTipo = tipo === 'pagar' ? 'A Pagar' : (tipo === 'receber' ? 'A Receber' : 'Pagar + Receber')

  // Intervalo efetivo (ISO) + rotulo, derivados do preset. O 'mes' usa mes/ano
  // (dia 1 ao ultimo do mes); os presets anuais e o custom viram de/ate direto.
  const { de, ate, periodoLabel } = useMemo(() => {
    const iso = (y, m, d) => y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    const ultimoDia = (y, m) => new Date(y, m, 0).getDate()
    const brl = (s) => (s ? s.split('-').reverse().join('/') : '')
    if (preset === 'ano-atual') return { de: iso(anoAtual, 1, 1), ate: iso(anoAtual, 12, 31), periodoLabel: 'Ano ' + anoAtual }
    if (preset === 'ano-anterior') return { de: iso(anoAtual - 1, 1, 1), ate: iso(anoAtual - 1, 12, 31), periodoLabel: 'Ano ' + (anoAtual - 1) }
    if (preset === '3-anos') return { de: iso(anoAtual - 2, 1, 1), ate: iso(anoAtual, 12, 31), periodoLabel: (anoAtual - 2) + ' – ' + anoAtual }
    if (preset === 'custom') return { de: deCustom, ate: ateCustom, periodoLabel: (deCustom && ateCustom) ? brl(deCustom) + ' – ' + brl(ateCustom) : 'Escolha as datas' }
    return { de: iso(ano, mes, 1), ate: iso(ano, mes, ultimoDia(ano, mes)), periodoLabel: nomeMes(mes) + ' ' + ano }
  }, [preset, mes, ano, deCustom, ateCustom, anoAtual])

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
    // Custom com data faltando: nao dispara (a API assumiria o mes corrente).
    if (!de || !ate) { setDados(null); arvore.current = null; return }
    setDados(null)
    arvore.current = null
    const qs = 'conta=' + conta + '&tipo=ambos&de=' + de + '&ate=' + ate
    let ativo = true
    fetch('/api/dre-financeiro/composicao?' + qs).then((r) => r.json()).then((d) => {
      if (!ativo) return
      if (d.erro) { alert('Erro: ' + d.erro); return }
      arvore.current = d.arvore || {}
      setDados(d)
    }).catch((e) => { if (ativo) alert('Erro: ' + e.message) })
    return () => { ativo = false }
  }, [conta, de, ate])

  // =========================================================================
  // Derivados: natureza por folha, resumo da faixa e recorte (tipo + natureza).
  // Tudo o que a tela mostra (treemap, KPIs, legenda) sai do recorte, senao o
  // cabecalho passa a contradizer o grafico.
  // =========================================================================
  const folhasComNatureza = useMemo(
    () => (dados?.folhas || []).map((f) => ({ ...f, natureza: naturezaDoGrupo(f.tipo, f.grupo) })),
    [dados],
  )

  // Base de TUDO o que a tela mostra. As devolucoes saem daqui (e nao so do
  // treemap) pra faixa de natureza, KPIs e legenda contarem a mesma historia —
  // com o checkbox ligado o cartao "Deducoes" tem de sumir junto.
  const folhasBase = useMemo(
    () => (semDevolucoes ? folhasComNatureza.filter((f) => f.natureza !== 'deducao') : folhasComNatureza),
    [folhasComNatureza, semDevolucoes],
  )

  const totalGeral = useMemo(
    () => folhasBase.reduce((s, f) => s + f.valor, 0),
    [folhasBase],
  )

  // Resumo por natureza: sempre sobre o TOTAL do mes (nao sobre o recorte),
  // pra faixa continuar servindo de mapa mesmo com um filtro ativo.
  const resumoNaturezas = useMemo(() => {
    const m = {}
    folhasBase.forEach((f) => {
      if (!m[f.natureza]) m[f.natureza] = { valor: 0, categorias: 0 }
      m[f.natureza].valor += f.valor
      m[f.natureza].categorias++
    })
    return m
  }, [folhasBase])

  // Recorte SEM o filtro de grupo — e' o que alimenta a legenda. Se a legenda
  // saisse do recorte final, escolher um grupo deixaria um badge so na tela e o
  // usuario ficaria preso sem conseguir trocar de grupo.
  const folhasSemGrupo = useMemo(() => folhasBase.filter((f) => {
    if (natureza && f.natureza !== natureza) return false
    if (tipo !== 'ambos' && f.tipo !== tipo) return false
    return true
  }), [folhasBase, natureza, tipo])

  const folhasFiltradas = useMemo(
    () => (grupoSel ? folhasSemGrupo.filter((f) => f.tipo + '|' + f.grupo === grupoSel) : folhasSemGrupo),
    [folhasSemGrupo, grupoSel],
  )

  // Grupos derivados do recorte (a lista `grupos` da API e sempre a do mes inteiro).
  const gruposFiltrados = useMemo(() => agregarGrupos(folhasFiltradas), [folhasFiltradas])
  // Legenda: todos os grupos do recorte sem o filtro de grupo (ver folhasSemGrupo).
  const gruposLegenda = useMemo(() => agregarGrupos(folhasSemGrupo), [folhasSemGrupo])

  // Os tres filtros (tipo x natureza x grupo) se alinham em vez de brigar: cada
  // escolha larga o que nao cabe nela. Sem isto e' facil chegar a combinacoes
  // vazias (ex.: "Receitas" com o toggle em A Pagar) sem entender o porque.
  function grupoCabe(chave, tp, nat) {
    if (!chave) return true
    const i = chave.indexOf('|')
    const gTipo = chave.slice(0, i), gNome = chave.slice(i + 1)
    if (tp !== 'ambos' && gTipo !== tp) return false
    if (nat && naturezaDoGrupo(gTipo, gNome) !== nat) return false
    return true
  }

  // Clicar na faixa alinha o toggle de tipo.
  function escolherNatureza(chave) {
    const nova = natureza === chave ? null : chave
    setNatureza(nova)
    const def = nova ? NATUREZAS.find((n) => n.chave === nova) : null
    const novoTipo = nova ? (def && def.tipo ? def.tipo : 'ambos') : tipo
    if (nova) setTipo(novoTipo)
    if (!grupoCabe(grupoSel, novoTipo, nova)) setGrupoSel(null)
  }

  // Caminho inverso: trocar o tipo larga a natureza que nao cabe nele (escolher
  // "A Pagar" com Receitas ativo daria tela vazia sem explicacao).
  function escolherTipo(novoTipo) {
    setTipo(novoTipo)
    let novaNat = natureza
    if (natureza && novoTipo !== 'ambos') {
      const def = NATUREZAS.find((n) => n.chave === natureza)
      if (def && def.tipo && def.tipo !== novoTipo) { novaNat = null; setNatureza(null) }
    }
    if (!grupoCabe(grupoSel, novoTipo, novaNat)) setGrupoSel(null)
  }

  // Clicar num grupo da legenda: filtra o treemap por ele e puxa o toggle de
  // tipo junto (o grupo so existe de um dos lados). Clicar de novo limpa.
  function escolherGrupo(g) {
    if (grupoSel === g.chave) { setGrupoSel(null); return }
    setGrupoSel(g.chave)
    setTipo(g.tipo)
    const nat = naturezaDoGrupo(g.tipo, g.nome)
    if (natureza && natureza !== nat) setNatureza(null)
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
    // "Modelo" só existe em vendas (vendas_itens/produtos) — só oferecemos a aba
    // para categorias de RECEITA (venda de tratores). Ver /api/composicao/modelo.
    const podeModelo = tp === 'receber' && naturezaDoGrupo(tp, grupo) === 'receita'
    setModalCtx({ tp, grupo, categoria, valorTotal, de, ate, conta, podeModelo })
    setVistaPopup('cliente')
    setModeloState({ loading: false, dados: null, erro: null })
    setDrill(null)
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

  function fecharModal() { setModalAberto(false); setDrill(null) }

  // Trocar de aba. Ao entrar na aba "Modelo" pela 1ª vez, dispara o fetch do
  // cruzamento período+cliente (aproximado — ver /api/composicao/modelo).
  function trocarVista(v) {
    setDrill(null)
    setVistaPopup(v)
    if (v === 'modelo' && modalCtx && !modeloState.dados && !modeloState.loading) carregarModelo()
  }

  function carregarModelo() {
    const c = modalCtx
    if (!c) return
    setModeloState({ loading: true, dados: null, erro: null })
    const qs = 'conta=' + c.conta + '&de=' + c.de + '&ate=' + c.ate
      + '&grupo=' + encodeURIComponent(c.grupo) + '&categoria=' + encodeURIComponent(c.categoria)
    fetch('/api/dre-financeiro/composicao/modelo?' + qs)
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { setModeloState({ loading: false, dados: null, erro: d.erro }); return }
        setModeloState({ loading: false, dados: d, erro: null })
      })
      .catch((e) => setModeloState({ loading: false, dados: null, erro: e.message }))
  }

  // Drill de um terceiro (cliente/fornecedor) -> lista de títulos que o compõem.
  function abrirDrillTerceiro(terceiro) {
    const c = modalCtx
    if (!c) return
    setDrill({ modo: 'titulos', terceiro, loading: true, lista: [], total: 0, erro: null })
    const qs = 'conta=' + c.conta + '&tipo=' + c.tp + '&de=' + c.de + '&ate=' + c.ate
      + '&grupo=' + encodeURIComponent(c.grupo) + '&categoria=' + encodeURIComponent(c.categoria)
      + '&terceiro=' + encodeURIComponent(terceiro)
    fetch('/api/dre-financeiro/composicao/detalhe?' + qs)
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { setDrill({ modo: 'titulos', terceiro, loading: false, lista: [], total: 0, erro: d.erro }); return }
        setDrill({ modo: 'titulos', terceiro, loading: false, lista: d.titulos || [], total: d.total || 0, erro: null })
      })
      .catch((e) => setDrill({ modo: 'titulos', terceiro, loading: false, lista: [], total: 0, erro: e.message }))
  }

  // Drill de um modelo -> vendas que o compõem (já vieram no payload da aba).
  function abrirDrillModelo(m) {
    setDrill({ modo: 'vendas', modelo: m.modelo, lista: m.vendas || [], total: m.valor || 0, erro: null })
  }

  function voltarDrill() { setDrill(null) }

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

  // --- Legenda de grupos (badge = filtro) -----------------------------------
  // O quadradinho de cor continua sendo a ligacao visual com o treemap; o badge
  // agora tambem FILTRA. Grupo nao selecionado fica esmaecido quando ha selecao,
  // pra ficar obvio o que esta em cena.
  function BadgeGrupo({ g }) {
    const c = corDoNode(g.tipo, g.nome), cb = corDoNodeBorda(g.tipo, g.nome)
    const ativo = grupoSel === g.chave
    return (
      <button type="button" onClick={() => escolherGrupo(g)} aria-pressed={ativo}
        title={g.nome + (ativo ? ' — clique de novo para mostrar todos os grupos' : ' — clique para ver só este grupo')}
        className={'inline-flex items-center gap-1 px-2 py-0.5 rounded border cursor-pointer transition hover:bg-slate-50 '
          + (ativo ? 'ring-2 bg-slate-50' : (grupoSel ? 'opacity-60' : ''))}
        style={{ borderColor: cb, ...(ativo ? { boxShadow: '0 0 0 2px ' + cb } : null) }}>
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: c }} />
        <span className="text-slate-700 font-medium">{g.nome}</span>
        <span className="text-slate-500">{fmtBRLcurto(g.valor)}</span>
        {ativo && <span className="font-bold" style={{ color: cb }}>✓</span>}
      </button>
    )
  }

  const semDados = dados && folhas.length === 0

  return (
    <>
      {/* Seletor de periodo: mes navegavel (default) ou intervalos salvos/custom.
          O intervalo vira de/ate na API, que pagina — ano/3-anos vem completos. */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs text-slate-500 uppercase tracking-wide mr-1">Período</span>
        {[
          ['mes', 'Mês'],
          ['ano-atual', 'Este ano (' + anoAtual + ')'],
          ['ano-anterior', 'Ano passado (' + (anoAtual - 1) + ')'],
          ['3-anos', 'Últimos 3 anos'],
          ['custom', 'Personalizado'],
        ].map(([k, lbl]) => (
          <button key={k} type="button" onClick={() => setPreset(k)} aria-pressed={preset === k}
            className={'text-sm px-3 py-1 rounded-full border transition cursor-pointer '
              + (preset === k ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100')}>
            {lbl}
          </button>
        ))}
        {preset === 'custom' && (
          <span className="inline-flex items-center gap-1 text-sm ml-1">
            <input type="date" value={deCustom} onChange={(e) => setDeCustom(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1" />
            <span className="text-slate-400">até</span>
            <input type="date" value={ateCustom} onChange={(e) => setAteCustom(e.target.value)}
              className="border border-slate-300 rounded px-2 py-1" />
          </span>
        )}
      </div>

      {/* Toolbar de mes (setas so no modo mensal) */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {preset === 'mes' && (
          <button onClick={mesAnterior} className="px-3 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100">&larr;</button>
        )}
        <h1 className="text-2xl font-semibold text-slate-800 min-w-[180px] text-center">{periodoLabel}</h1>
        {preset === 'mes' && (<>
          <button onClick={mesProximo} className="px-3 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100">&rarr;</button>
          <button onClick={irHoje} className="px-3 py-1 border border-slate-300 rounded bg-white hover:bg-slate-100 text-sm">Hoje</button>
        </>)}
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
          {/* O filtro so serve se o usuario perceber que os cartoes SAO botoes: dai
              o rotulo em modo imperativo, a dica ao lado, o chip "Todas" sempre
              visivel (estado neutro explicito) e o check no cartao selecionado. */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs text-slate-500 uppercase tracking-wide">Filtrar por natureza</span>
            <span className="text-[11px] text-slate-400">clique num cartão para ver só essa parte do período</span>
            {/* Devolucao aparece dos DOIS lados (saida "Devolucoes de Vendas" e
                entrada "Devolucoes"/"DevolucoeseOutras Saidas") e distorce a
                leitura do mes. O checkbox tira as duas de uma vez. */}
            <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer select-none"
              title={'Tira as devoluções dos dois lados: "Devoluções de Vendas" (saída) e "Devoluções" / "DevoluçõeseOutras Saidas" (entrada).\nAfeta o treemap, os KPIs, a faixa de natureza e a legenda.'}>
              <input type="checkbox" checked={semDevolucoes}
                onChange={(e) => {
                  setSemDevolucoes(e.target.checked)
                  // Esconder devolucoes com o filtro "Deducoes" ligado daria tela
                  // vazia — larga os filtros que acabaram de perder o conteudo.
                  setGrupoSel(null)
                  if (e.target.checked && natureza === 'deducao') setNatureza(null)
                }} />
              Esconder devoluções
            </label>
            <button type="button" onClick={() => setNatureza(null)}
              title="Mostrar todas as naturezas"
              className={'ml-auto cursor-pointer text-xs px-2.5 py-1 rounded-full border transition '
                + (natureza
                  ? 'bg-white border-slate-300 text-slate-600 hover:bg-slate-100'
                  : 'bg-slate-800 border-slate-800 text-white')}>
              {natureza ? '✕ Limpar filtro' : '✓ Todas'}
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
            {NATUREZAS.filter((n) => resumoNaturezas[n.chave]).map((n) => {
              const r = resumoNaturezas[n.chave]
              const pct = totalGeral > 0 ? (100 * r.valor / totalGeral) : 0
              const ativo = natureza === n.chave
              return (
                <button key={n.chave} type="button" onClick={() => escolherNatureza(n.chave)}
                  title={DESCRICAO_NATUREZA[n.chave] + (ativo ? '\n\n(clique de novo para remover o filtro)' : '\n\n(clique para ver só isto)')}
                  aria-pressed={ativo}
                  className={'relative cursor-pointer text-left rounded-lg border p-3 transition '
                    + (ativo ? 'bg-slate-50 ring-2' : 'bg-white hover:bg-slate-50 hover:shadow-sm hover:-translate-y-px')}
                  style={{ borderColor: n.cor, ...(ativo ? { boxShadow: '0 0 0 2px ' + n.cor } : null) }}>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: n.cor }} />
                    <span className="text-xs font-semibold text-slate-700 truncate">{n.rotulo}</span>
                    {ativo && <span className="ml-auto text-xs font-bold shrink-0" style={{ color: n.cor }}>✓</span>}
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
            Total do período{natureza ? ' · ' + (NATUREZAS.find((n) => n.chave === natureza) || {}).rotulo : ''}
            {grupoSel ? ' · ' + grupoSel.slice(grupoSel.indexOf('|') + 1) : ''}
            {semDevolucoes ? ' · sem devoluções' : ''}
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

      {/* Legenda de grupos — agora e' o filtro fino da tela (o de natureza e' o
          grosso). Sai de gruposLegenda (recorte SEM o filtro de grupo): assim os
          outros grupos continuam a vista e clicaveis depois de escolher um.
          Sem corte de top 8/12 — cortar a lista aqui esconderia filtros. */}
      <div className="mb-3 text-xs">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-slate-500 uppercase tracking-wide">Filtrar por grupo</span>
          <span className="text-[11px] text-slate-400">clique num grupo para remontar o treemap só com ele</span>
          {/* Mesmo estado do toggle "A Pagar / A Receber / Ambos" la de cima:
              sao dois pontos de acesso pro mesmo filtro, nunca dois filtros. */}
          <div className="ml-auto inline-flex rounded-md border border-slate-300 overflow-hidden">
            <button type="button" onClick={() => { escolherTipo('ambos'); setGrupoSel(null) }}
              title="Mostrar entradas e saidas"
              className={'px-2.5 py-1 transition ' + (tipo === 'ambos' ? 'bg-slate-800 text-white' : inativoToggle)}>Todos</button>
            <button type="button" onClick={() => escolherTipo('pagar')}
              title="So o que sai (contas a pagar)"
              className={'px-2.5 py-1 transition border-l border-slate-300 ' + (tipo === 'pagar' ? 'bg-red-600 text-white' : inativoToggle)}>Saídas</button>
            <button type="button" onClick={() => escolherTipo('receber')}
              title="So o que entra (contas a receber)"
              className={'px-2.5 py-1 transition border-l border-slate-300 ' + (tipo === 'receber' ? 'bg-emerald-600 text-white' : inativoToggle)}>Entradas</button>
          </div>
          {grupoSel && (
            <button type="button" onClick={() => setGrupoSel(null)}
              className="text-xs px-2.5 py-1 rounded-full border bg-white border-slate-300 text-slate-600 hover:bg-slate-100">
              ✕ Limpar grupo
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {tipo === 'ambos' ? (
            (() => {
              const saidas = gruposLegenda.filter((g) => g.tipo === 'pagar')
              const entradas = gruposLegenda.filter((g) => g.tipo === 'receber')
              return (
                <>
                  {saidas.length > 0 && (
                    <>
                      {/* O rotulo da secao tambem filtra (= "Saidas" do seletor acima). */}
                      <button type="button" onClick={() => escolherTipo('pagar')}
                        title="Ver só as saidas"
                        className="w-full text-left text-xs text-red-700 font-semibold mb-1 mt-1 hover:underline cursor-pointer">Saidas</button>
                      <div className="flex flex-wrap gap-2 w-full mb-2">{saidas.map((g) => <BadgeGrupo key={g.chave} g={g} />)}</div>
                    </>
                  )}
                  {entradas.length > 0 && (
                    <>
                      <button type="button" onClick={() => escolherTipo('receber')}
                        title="Ver só as entradas"
                        className="w-full text-left text-xs text-emerald-700 font-semibold mb-1 hover:underline cursor-pointer">Entradas</button>
                      <div className="flex flex-wrap gap-2 w-full">{entradas.map((g) => <BadgeGrupo key={g.chave} g={g} />)}</div>
                    </>
                  )}
                </>
              )
            })()
          ) : (
            gruposLegenda.map((g) => <BadgeGrupo key={g.chave} g={g} />)
          )}
        </div>
      </div>

      {/* Treemap */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 mb-6">
        {preset === 'custom' && (!de || !ate) ? (
          <div className="text-slate-500 text-center py-12">Escolha as datas de início e fim do intervalo.</div>
        ) : !dados ? (
          // Periodos longos (ano/3-anos) levam alguns segundos: a API pagina milhares
          // de titulos. Sem este aviso o card fica em branco e parece travado.
          <div className="text-slate-500 text-center py-12">Carregando o período…</div>
        ) : semDados ? (
          <div className="text-slate-500 text-center py-12">
            {/* Distingue "periodo vazio" de "filtro vazio" — sem isto o usuario acha que faltou sincronizar. */}
            {totalGeral > 0
              ? 'Nada neste recorte. Limpe o filtro de grupo ou de natureza, ou troque o modo.'
              : 'Nenhum dado neste período. Sincronize ou troque o período.'}
          </div>
        ) : (
          <div style={{ position: 'relative', height: 560 }}>
            <canvas ref={treemapRef} />
          </div>
        )}
        <div className="text-xs text-slate-500 mt-2">Clique numa célula para ver os terceiros da categoria — e depois num cliente/fornecedor para ver os títulos que o compõem. Em categorias de receita há também a aba <strong>Por Modelo</strong>.</div>
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

            {/* Abas Cliente x Modelo — só em categorias de receita (venda). A aba
                Modelo cruza com vendas por período+cliente e NÃO reconcilia com o
                valor financeiro; o aviso fica dentro da própria aba. */}
            {modalCtx?.podeModelo && !drill && (
              <div className="px-5 pt-3 flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm">
                  <button type="button" onClick={() => trocarVista('cliente')}
                    className={'px-3 py-1 transition ' + (vistaPopup === 'cliente' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}>
                    Por Cliente
                  </button>
                  <button type="button" onClick={() => trocarVista('modelo')}
                    className={'px-3 py-1 transition border-l border-slate-300 ' + (vistaPopup === 'modelo' ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-100')}>
                    Por Modelo
                  </button>
                </div>
                <span className="text-[11px] text-slate-400">
                  {vistaPopup === 'modelo' ? 'vendas dos mesmos clientes no período (aproximado)' : 'os títulos desta categoria (exato)'}
                </span>
              </div>
            )}

            <div className="p-5 overflow-y-auto">
              {drill ? (
                <DrillView drill={drill} onVoltar={voltarDrill} />
              ) : vistaPopup === 'modelo' && modalCtx?.podeModelo ? (
                <ModeloView state={modeloState} onRecarregar={carregarModelo} onModelo={abrirDrillModelo} />
              ) : (
                <ModalCorpo corpo={modalCorpo} onTerceiro={abrirDrillTerceiro} />
              )}
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
function ModalCorpo({ corpo, onTerceiro }) {
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
          // Cada linha abre a lista dos títulos que compõem o valor do terceiro.
          return (
            <button key={i} type="button" onClick={() => onTerceiro && onTerceiro(t.nome)}
              title="Ver os títulos que compõem este valor" className="w-full text-left border border-slate-200 rounded-lg p-3 hover:border-slate-400 hover:bg-slate-50 transition cursor-pointer">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="font-medium text-slate-800 text-sm flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">{i + 1}.</span>
                  <span>{t.nome}</span>
                </div>
                <div className="text-right text-xs text-slate-500 flex items-center gap-1">
                  {pct.toFixed(1)}%
                  <span className="text-slate-300">›</span>
                </div>
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
// DrillView: dentro do modal, mostra o que compõe UM item —
//  - modo 'titulos': os títulos financeiros de um cliente/fornecedor;
//  - modo 'vendas' : as vendas (NF) que somam o valor de um modelo.
// Um "← voltar" retorna à lista principal da aba.
// ===========================================================================
function DrillView({ drill, onVoltar }) {
  const titulo = drill.modo === 'titulos' ? drill.terceiro : drill.modelo
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <button type="button" onClick={onVoltar}
          className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1">
          <span className="text-lg leading-none">←</span> voltar
        </button>
        <div className="text-right">
          <div className="text-sm font-semibold text-slate-800 truncate max-w-[22rem]">{titulo}</div>
          <div className="text-xs text-slate-500">{fmtBRL(drill.total)}</div>
        </div>
      </div>

      {drill.loading && <div className="text-slate-500 text-sm">Carregando…</div>}
      {drill.erro && <div className="text-red-600 text-sm">Erro: {drill.erro}</div>}

      {!drill.loading && !drill.erro && drill.modo === 'titulos' && (
        drill.lista.length === 0
          ? <div className="text-slate-500 text-sm">Sem títulos.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-200">
                    <th className="text-left font-medium py-1.5 pr-2">Documento</th>
                    <th className="text-left font-medium py-1.5 pr-2">Vencimento</th>
                    <th className="text-left font-medium py-1.5 pr-2">Pago em</th>
                    <th className="text-right font-medium py-1.5">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {drill.lista.map((t, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2 text-slate-800">{t.documento || '—'}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{fmtData(t.data_vencimento)}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{fmtData(t.data_pagamento)}</td>
                      <td className="py-1.5 text-right font-medium text-slate-800 whitespace-nowrap">{fmtBRL(t.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}

      {!drill.loading && !drill.erro && drill.modo === 'vendas' && (
        drill.lista.length === 0
          ? <div className="text-slate-500 text-sm">Sem vendas.</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 border-b border-slate-200">
                    <th className="text-left font-medium py-1.5 pr-2">Data</th>
                    <th className="text-left font-medium py-1.5 pr-2">Cliente</th>
                    <th className="text-left font-medium py-1.5 pr-2">Descrição</th>
                    <th className="text-right font-medium py-1.5 pr-2">Qtd</th>
                    <th className="text-right font-medium py-1.5">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {drill.lista.map((v, i) => (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2 text-slate-600 whitespace-nowrap">{fmtData(v.data)}</td>
                      <td className="py-1.5 pr-2 text-slate-800">{v.cliente}</td>
                      <td className="py-1.5 pr-2 text-slate-600">{v.descricao}</td>
                      <td className="py-1.5 pr-2 text-right text-slate-600">{v.quantidade}</td>
                      <td className="py-1.5 text-right font-medium text-slate-800 whitespace-nowrap">{fmtBRL(v.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}
    </div>
  )
}

// ===========================================================================
// ModeloView: aba "Por Modelo" do popup. Vendas dos mesmos clientes no período,
// agregadas por modelo (barras). Clicar num modelo abre as vendas (DrillView).
// Deixa explícito que é aproximado (financeiro x vendas não reconciliam).
// ===========================================================================
function ModeloView({ state, onRecarregar, onModelo }) {
  if (state.loading) return <div className="text-slate-500 text-sm">Cruzando com as vendas do período…</div>
  if (state.erro) return (
    <div className="text-sm">
      <div className="text-red-600 mb-2">Erro: {state.erro}</div>
      <button type="button" onClick={onRecarregar} className="text-slate-600 hover:text-slate-900 underline">tentar de novo</button>
    </div>
  )
  const d = state.dados
  if (!d) return null
  const modelos = d.modelos || []
  const maxVal = modelos[0] ? modelos[0].valor : 1

  return (
    <div>
      {/* Financeiro (categoria) x vendas cruzadas — os dois NÃO batem por definição. */}
      <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-3">
        Vendas de <strong>{d.clientes}</strong> cliente(s) desta categoria no período, por modelo (de <code>vendas_itens</code>, sem peças).
        Total em vendas <strong>{fmtBRL(d.totalVendas)}</strong> vs. financeiro da categoria <strong>{fmtBRL(d.totalFinanceiro)}</strong> —
        os dois <strong>não reconciliam</strong> (regime de caixa × competência, títulos parciais, serviço/peça na mesma categoria).
      </div>

      {modelos.length === 0 ? (
        <div className="text-slate-500 text-sm">
          {d.aviso || 'Nenhuma venda de trator (com modelo cadastrado) desses clientes no período.'}
        </div>
      ) : (
        <div className="space-y-2">
          {modelos.map((m, i) => {
            const pct = d.totalVendas > 0 ? (100 * m.valor / d.totalVendas) : 0
            const barPct = (100 * m.valor / maxVal)
            return (
              <button key={i} type="button" onClick={() => onModelo && onModelo(m)}
                title="Ver as vendas deste modelo"
                className="w-full text-left border border-slate-200 rounded-lg p-3 hover:border-slate-400 hover:bg-slate-50 transition cursor-pointer">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="font-medium text-slate-800 text-sm flex items-center gap-2">
                    <span className="text-xs text-slate-400 font-mono">{i + 1}.</span>
                    <span>{m.modelo}</span>
                    <span className="text-[11px] text-slate-400">{m.qtd} un.</span>
                  </div>
                  <div className="text-right text-xs text-slate-500 flex items-center gap-1">
                    {pct.toFixed(1)}%
                    <span className="text-slate-300">›</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div className="h-2 rounded-full bg-emerald-500" style={{ width: barPct + '%' }} />
                  </div>
                  <div className="text-right font-bold text-slate-800 text-sm whitespace-nowrap">{fmtBRL(m.valor)}</div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
