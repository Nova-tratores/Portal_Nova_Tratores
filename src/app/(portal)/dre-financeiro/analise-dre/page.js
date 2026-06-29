'use client'
// Tela ANALISE DRE do modulo DRE Financeiro.
// Port FIEL de views/analise-dre.ejs do financeiro-omie-dashboard.
// O layout do modulo (.../dre-financeiro/layout.js) ja faz o gate de permissao
// 'financeiro', a sub-nav e o seletor de conta; aqui focamos no CONTEUDO.
// Importamos useDreConta apenas para refazer o fetch quando a conta selecionada
// muda (e montar a URL com ?conta=...).
//
// O <script> inline do EJS foi reescrito como logica React:
//  - estados (regime, granularidade, margemModo, toggles da tabela, dados)
//  - efeitos (useEffect) para carregar dados e (re)desenhar os 2 graficos Chart.js
//  - renderizacao via JSX (KPIs, insights, tabela horizontal)
// Os calculos (MoM/YoY, Z-score, margens, granularidade, Lucro Operacional) e os
// textos/labels/cores/gatilhos sao reproduzidos EXATAMENTE como no original.
//
// Chart.js e carregado dinamicamente (mesmo CDN do EJS) num useEffect; os
// graficos sao desenhados em refs <canvas> e destruidos/recriados a cada render.

import { useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta } from '@/lib/dre-financeiro/format'

// =========================================================================
// Helpers (port fiel do <script> inline da analise-dre.ejs)
// Estes formatadores sao especificos desta tela (abreviam M/k e formatam
// % / pp do jeito do auditor), por isso reproduzidos exatamente como no
// original e nao trocados pelos genericos de '@/lib/dre-financeiro/format'.
// =========================================================================
function fmtBRL(n) { return 'R$ ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(n) || 0) }
function fmtBRLs(n) {
  var v = Number(n) || 0, s = v < 0 ? '-' : '', a = Math.abs(v)
  if (a >= 1e6) return s + 'R$ ' + (a / 1e6).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1e3) return s + 'R$ ' + Math.round(a / 1e3) + 'k'
  return s + 'R$ ' + Math.round(a)
}
function fmtPct(n, dec) {
  if (n === null || n === undefined || !isFinite(n)) return '-'
  return (n >= 0 ? '+' : '') + Number(n).toFixed(dec == null ? 1 : dec) + '%'
}
function fmtPP(n) {
  if (n === null || n === undefined || !isFinite(n)) return '-'
  return (n >= 0 ? '+' : '') + Number(n).toFixed(1) + 'pp'
}
function rotuloMes(k) {
  var p = String(k).split('-')
  var nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return nomes[parseInt(p[1]) - 1] + '/' + p[0].slice(2)
}
function corValor(v) { if (v > 0) return 'text-emerald-700'; if (v < 0) return 'text-red-700'; return 'text-slate-500' }
function corVar(p) { if (p === null || !isFinite(p)) return 'adre-var-neutral'; if (p > 0.1) return 'adre-var-up'; if (p < -0.1) return 'adre-var-down'; return 'adre-var-neutral' }

// Defaults: jan/2023 ate mes anterior (port fiel de setupDefaults()).
function defaultsPeriodo() {
  var hoje = new Date()
  var fim = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  var ini = new Date(2023, 0, 1)
  function ym(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') }
  return { desde: ym(ini), ate: ym(fim) }
}

export default function AnaliseDre() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  // ----- Estado (espelha as variaveis do IIFE do EJS) -----
  const [dados, setDados] = useState(null)              // payload da API
  const [regime, setRegime] = useState('competencia')   // 'omie' | 'competencia'
  const [granularidade, setGran] = useState('mes')      // 'mes' | 'ano' | 'ytd'
  const [margemModo, setMargemModo] = useState('pct')   // 'pct' | 'rs' (eixo do grafico de margens)
  const [carregando, setCarregando] = useState(false)
  const [status, setStatus] = useState('Carregando...')
  const [chartInfo, setChartInfo] = useState('')
  // Toggles da tabela
  const [mostrarGrupos, setMostrarGrupos] = useState(true)
  const [mostrarContas, setMostrarContas] = useState(false)
  const [destacarVar, setDestacarVar] = useState(true)
  // Periodo (inputs type=month)
  const def = defaultsPeriodo()
  const [desde, setDesde] = useState(def.desde)
  const [ate, setAte] = useState(def.ate)

  // Refs dos canvas + instancias Chart.js
  const refCanvasMargens = useRef(null)
  const refCanvasReceita = useRef(null)
  const chartMargensRef = useRef(null)
  const chartReceitaRef = useRef(null)
  const [chartPronto, setChartPronto] = useState(false) // Chart.js carregado?

  // =====================================================================
  // Carrega Chart.js dinamicamente (mesmo CDN do EJS), uma unica vez.
  // =====================================================================
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.Chart) { setChartPronto(true); return }
    var existente = document.querySelector('script[data-adre-chartjs]')
    if (existente) {
      existente.addEventListener('load', () => setChartPronto(true))
      if (window.Chart) setChartPronto(true)
      return
    }
    var s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
    s.setAttribute('data-adre-chartjs', '1')
    s.onload = () => setChartPronto(true)
    document.body.appendChild(s)
  }, [])

  // =====================================================================
  // Carregar dados (API) - port fiel de carregar()
  // =====================================================================
  const carregar = useCallback(async () => {
    if (!desde || !ate) { alert('Selecione o periodo'); return }
    var url, qs = 'desde=' + desde + '&ate=' + ate
    if (regime === 'competencia') { url = '/api/dre-financeiro/dre-competencia' }
    else { url = '/api/dre-financeiro/dre'; qs += '&tipo_data=1' }
    // conta selecionada (convencao do portal: ?conta=...)
    qs += '&conta=' + encodeURIComponent(conta)
    setStatus('Carregando ' + (regime === 'competencia' ? 'regime competência' : 'regime Omie (cache supabase)') + '...')
    setCarregando(true)
    try {
      const r = await fetch(url + '?' + qs)
      const d = await r.json()
      setCarregando(false)
      if (d.erro) { setStatus('Erro: ' + d.erro); return }
      setDados(d)
      setStatus('Período: ' + d.meses[0] + ' a ' + d.meses[d.meses.length - 1] + ' (' + d.meses.length + ' meses) · regime: ' + (regime === 'competencia' ? 'Competência' : 'Omie'))
    } catch (e) {
      setCarregando(false)
      setStatus('Erro: ' + e.message)
    }
  }, [desde, ate, regime, conta])

  // carregar() no mount, ao trocar regime e ao trocar a conta (replica o
  // comportamento do EJS: carregar() inicial + setRegime chamava carregar()).
  useEffect(() => { carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [regime, conta])

  // =====================================================================
  // Granularidade: colunas e valor por coluna (port fiel)
  // =====================================================================
  const colunasAtuais = useCallback(() => {
    if (!dados || !dados.meses) return []
    if (granularidade === 'ano') {
      return Array.from(new Set(dados.meses.map(function (k) { return k.split('-')[0] }))).sort()
    }
    return dados.meses // mes e ytd usam mesmas colunas; YTD muda apenas o VALOR
  }, [dados, granularidade])

  const valorColuna = useCallback((porMes, key) => {
    if (!porMes) return 0
    if (granularidade === 'ano') {
      var soma = 0
      Object.entries(porMes).forEach(function (e) { if (e[0].startsWith(key + '-')) soma += e[1] })
      return soma
    }
    if (granularidade === 'ytd') {
      var p = key.split('-'); var a = +p[0], m = +p[1]
      var soma = 0
      for (var i = 1; i <= m; i++) {
        var k = a + '-' + String(i).padStart(2, '0')
        soma += (porMes[k] || 0)
      }
      return soma
    }
    return porMes[key] || 0
  }, [granularidade])

  const rotuloColuna = useCallback((key) => {
    if (granularidade === 'ano') return key
    if (granularidade === 'ytd') return rotuloMes(key) + ' (YTD)'
    return rotuloMes(key)
  }, [granularidade])

  // =====================================================================
  // Acesso a arvore consolidada (port fiel)
  // =====================================================================
  const tipoNode = useCallback((t) => (dados && dados.consolidado && dados.consolidado[t]) || null, [dados])
  const grupoNode = useCallback((t, g) => { var tn = tipoNode(t); return (tn && tn.grupos && tn.grupos[g]) || null }, [tipoNode])
  const contaNode = useCallback((t, g, c) => { var gn = grupoNode(t, g); return (gn && gn.contas && gn.contas[c]) || null }, [grupoNode])
  const valTipo = useCallback((t) => { var n = tipoNode(t); return n ? n.total : 0 }, [tipoNode])
  const valTipoCol = useCallback((t, k) => { var n = tipoNode(t); if (!n) return 0; return valorColuna(n.por_mes, k) }, [tipoNode, valorColuna])
  const valGrupo = useCallback((t, g) => { var n = grupoNode(t, g); return n ? n.total : 0 }, [grupoNode])
  const valGrupoCol = useCallback((t, g, k) => { var n = grupoNode(t, g); if (!n) return 0; return valorColuna(n.por_mes, k) }, [grupoNode, valorColuna])
  const valConta = useCallback((t, g, c) => { var n = contaNode(t, g, c); return n ? n.total : 0 }, [contaNode])
  const valContaCol = useCallback((t, g, c, k) => { var n = contaNode(t, g, c); if (!n) return 0; return valorColuna(n.por_mes, k) }, [contaNode, valorColuna])

  // Lucro Operacional (EBIT proxy): Lucro Bruto + Despesas (exceto Financeiras)
  // Como Despesas e Financeiras sao ambos negativos, isso eh equivalente a
  // somar o Lucro Bruto com (Despesas - DespesasFinanceiras).
  const valLucroOp = useCallback(() => valTipo('1. Lucro Bruto') + (valTipo('2. Despesas') - valConta('2. Despesas', '11. Fixas', '03. Despesas Financeiras')), [valTipo, valConta])
  const valLucroOpCol = useCallback((k) => {
    var df = valContaCol('2. Despesas', '11. Fixas', '03. Despesas Financeiras', k)
    return valTipoCol('1. Lucro Bruto', k) + (valTipoCol('2. Despesas', k) - df)
  }, [valContaCol, valTipoCol])
  const valRLO = useCallback(() => valGrupo('1. Lucro Bruto', '01. Receita Líquida Operacional'), [valGrupo]) // Receita Líquida Operacional
  const valRLOCol = useCallback((k) => valGrupoCol('1. Lucro Bruto', '01. Receita Líquida Operacional', k), [valGrupoCol])
  const valReceitaBruta = useCallback(() => valConta('1. Lucro Bruto', '01. Receita Líquida Operacional', '01. Receita Bruta de Vendas'), [valConta])
  const valReceitaBrutaCol = useCallback((k) => valContaCol('1. Lucro Bruto', '01. Receita Líquida Operacional', '01. Receita Bruta de Vendas', k), [valContaCol])

  // =====================================================================
  // Calculo MoM / YoY (port fiel de calcMomYoy)
  // Recebe getVal(mesKey) -> valor; retorna {mom, yoy, valor, ...}
  // =====================================================================
  const calcMomYoy = useCallback((getVal) => {
    if (!dados || !dados.meses || !dados.meses.length) return { mom: null, yoy: null }
    var meses = dados.meses
    var mesAtual = meses[meses.length - 1]
    var mesAnt = meses[meses.length - 2] || null
    var pa = mesAtual.split('-'); var anoAnt = (parseInt(pa[0], 10) - 1) + '-' + pa[1]
    var v = getVal(mesAtual)
    var vA = mesAnt ? getVal(mesAnt) : null
    var vY = getVal(anoAnt)
    var mom = (vA && Math.abs(vA) > 1e-6) ? ((v - vA) / Math.abs(vA)) * 100 : null
    var yoy = (vY && Math.abs(vY) > 1e-6) ? ((v - vY) / Math.abs(vY)) * 100 : null
    return { mom: mom, yoy: yoy, valor: v, mesAtual: mesAtual, mesAnt: mesAnt, anoAnt: anoAnt, valorAnt: vA, valorAnoAnt: vY }
  }, [dados])

  // =====================================================================
  // KPIs (Bloco 1) - calcula os 5 cards (port fiel de renderKPIs)
  // =====================================================================
  function calcKPIs() {
    if (!dados || !dados.meses || !dados.meses.length) return null
    function card(getValor, sinalPositivo, forcaVerde) {
      var c = calcMomYoy(getValor)
      var corCls = sinalPositivo ? (c.valor >= 0 ? 'text-emerald-700' : 'text-red-700') : (c.valor <= 0 ? 'text-emerald-700' : 'text-red-700')
      var cls = 'text-lg font-bold mt-1 ' + (sinalPositivo ? (forcaVerde ? 'text-emerald-700' : corCls) : corCls)
      return { cls: cls, valor: fmtBRL(c.valor), mom: c.mom, yoy: c.yoy }
    }
    var receita = card(valReceitaBruta, true, true)
    var lb = card(function () { return valTipo('1. Lucro Bruto') }, true, false)
    var lop = card(valLucroOp, true, false)
    var ll = card(function () { return valTipo('1. Lucro Bruto') + valTipo('2. Despesas') }, true, false)

    // Margem Liquida % (peculiar: nao eh R$, eh %)
    function getML(mesKey) {
      var rlo = valRLOCol(mesKey)
      var ll2 = valTipoCol('1. Lucro Bruto', mesKey) + valTipoCol('2. Despesas', mesKey)
      return rlo > 0 ? (ll2 / rlo) * 100 : 0
    }
    var meses = dados.meses
    var mesAtual = meses[meses.length - 1]
    var mesAnt = meses[meses.length - 2] || null
    var pa = mesAtual.split('-'); var anoAnt = (parseInt(pa[0], 10) - 1) + '-' + pa[1]
    var mlAtual = getML(mesAtual)
    var mlAnt = mesAnt ? getML(mesAnt) : null
    var mlAnoAnt = getML(anoAnt)
    var mlMomPP = (mlAnt !== null) ? (mlAtual - mlAnt) : null
    var mlYoyPP = (mlAnoAnt !== null && Math.abs(mlAnoAnt) > 1e-6) ? (mlAtual - mlAnoAnt) : null
    var ml = {
      cls: 'text-lg font-bold mt-1 ' + (mlAtual >= 0 ? 'text-emerald-700' : 'text-red-700'),
      valor: mlAtual.toFixed(1) + '%',
      momPP: mlMomPP, yoyPP: mlYoyPP
    }
    return { receita: receita, lb: lb, lop: lop, ll: ll, ml: ml }
  }

  // Barra de variacao MoM/YoY de um KPID em R$ (badge clicavel-like)
  function VarBadge({ mom, yoy }) {
    return (
      <>
        <span className={corVar(mom) + ' px-1 rounded'}>MoM {fmtPct(mom)}</span>
        {' · '}
        <span className={corVar(yoy) + ' px-1 rounded'}>YoY {fmtPct(yoy)}</span>
      </>
    )
  }

  // =====================================================================
  // Insights automaticos (Bloco 3) - heuristica conservadora (port fiel)
  // Retorna { html: JSX } ou { vazio: JSX }
  // =====================================================================
  function calcInsights() {
    if (!dados || !dados.meses || dados.meses.length < 2) {
      return { vazio: <div className="text-xs text-slate-400">Periodo curto demais para insights (precisa &gt;= 2 meses).</div> }
    }
    var meses = dados.meses
    var mesAtual = meses[meses.length - 1]
    var mesAnt = meses[meses.length - 2] || null
    var pa = mesAtual.split('-'); var anoAnt = (parseInt(pa[0], 10) - 1) + '-' + pa[1]
    var temMesAnt = !!mesAnt
    var temAnoAnt = dados.meses.indexOf(anoAnt) >= 0 // soh se de fato ha dado do ano passado

    function walkLinhas(cb) {
      var cons = dados.consolidado || {}
      Object.entries(cons).forEach(function (e) {
        var t = e[0], tn = e[1]
        cb({ nivel: 0, label: t, tipo: t, grupo: null, conta: null, node: tn })
        Object.entries(tn.grupos || {}).forEach(function (eg) {
          var g = eg[0], gn = eg[1]
          cb({ nivel: 1, label: g, tipo: t, grupo: g, conta: null, node: gn })
          Object.entries(gn.contas || {}).forEach(function (ec) {
            cb({ nivel: 2, label: ec[0], tipo: t, grupo: g, conta: ec[0], node: ec[1] })
          })
        })
      })
    }

    // Tres baldes separados por horizonte temporal
    var alertasMoM = []   // mes vs mes anterior
    var alertasYoY = []   // mes vs mesmo mes ano anterior
    var alertasZ = []     // dispersao no periodo

    // === 1. MoM (mes anterior -> mes atual): grupos com variacao >= 25% ===
    if (temMesAnt) {
      walkLinhas(function (lin) {
        if (lin.nivel !== 1) return // soh grupos pra nao poluir
        var pm = lin.node.por_mes || {}
        var vAtual = pm[mesAtual] || 0
        var vAnt = pm[mesAnt] || 0
        if (Math.abs(vAnt) < 100) return
        var pct = ((vAtual - vAnt) / Math.abs(vAnt)) * 100
        if (Math.abs(pct) >= 25) {
          alertasMoM.push({
            severidade: Math.abs(pct),
            cor: pct >= 0 ? 'emerald' : 'red',
            icone: pct >= 0 ? '↑' : '↓',
            titulo: lin.label,
            metrica: (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%',
            delta_rs: vAtual - vAnt,
            contexto: fmtBRLs(vAnt) + ' → ' + fmtBRLs(vAtual)
          })
        }
      })
    }

    // === 1b. Margens caindo MoM (vai no MoM tambem) ===
    if (temMesAnt) {
      function margemMoM(label, getNum) {
        var num = getNum(mesAtual), den = valRLOCol(mesAtual)
        var numA = getNum(mesAnt), denA = valRLOCol(mesAnt)
        if (den <= 0 || denA <= 0) return
        var pctAt = (num / den) * 100, pctAn = (numA / denA) * 100
        var delta = pctAt - pctAn
        if (Math.abs(delta) < 3) return
        alertasMoM.push({
          severidade: Math.abs(delta) * 8,
          cor: delta >= 0 ? 'emerald' : 'red',
          icone: delta >= 0 ? '↑' : '↓',
          titulo: label,
          metrica: (delta >= 0 ? '+' : '') + delta.toFixed(1) + 'pp',
          delta_rs: 0,
          contexto: pctAn.toFixed(1) + '% → ' + pctAt.toFixed(1) + '%'
        })
      }
      margemMoM('Margem Bruta (%)', function (k) { return valTipoCol('1. Lucro Bruto', k) })
      margemMoM('Margem Operacional (%)', valLucroOpCol)
      margemMoM('Margem Líquida (%)', function (k) { return valTipoCol('1. Lucro Bruto', k) + valTipoCol('2. Despesas', k) })
    }

    // === 2. YoY (mesmo mes ano anterior): linhas com variacao >= 30% ===
    if (temAnoAnt) {
      walkLinhas(function (lin) {
        var pm = lin.node.por_mes || {}
        var vAtual = pm[mesAtual] || 0
        var vAnoAnt = pm[anoAnt] || 0
        if (Math.abs(vAnoAnt) < 100) return
        var pct = ((vAtual - vAnoAnt) / Math.abs(vAnoAnt)) * 100
        if (Math.abs(pct) >= 30) {
          alertasYoY.push({
            severidade: Math.abs(pct),
            cor: pct >= 0 ? 'emerald' : 'red',
            icone: pct >= 0 ? '↑' : '↓',
            titulo: lin.label,
            metrica: (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%',
            delta_rs: vAtual - vAnoAnt,
            contexto: fmtBRLs(vAnoAnt) + ' → ' + fmtBRLs(vAtual)
          })
        }
      })
    }

    // === 3. Anomalias estatisticas (Z-score > 2 no mes atual) ===
    walkLinhas(function (lin) {
      if (lin.nivel !== 1) return
      var pm = lin.node.por_mes || {}
      var serie = meses.map(function (k) { return pm[k] || 0 })
      var media = serie.reduce(function (s, v) { return s + v }, 0) / serie.length
      var desv = Math.sqrt(serie.reduce(function (s, v) { return s + (v - media) * (v - media) }, 0) / serie.length)
      if (desv < 1e-6) return
      var vAtual = serie[serie.length - 1]
      var z = (vAtual - media) / desv
      if (Math.abs(z) > 2) {
        alertasZ.push({
          severidade: Math.abs(z) * 8,
          cor: 'amber',
          icone: z >= 0 ? '↑' : '↓',
          titulo: lin.label,
          metrica: 'Z=' + (z >= 0 ? '+' : '') + z.toFixed(1),
          delta_rs: 0,
          contexto: 'mes ' + fmtBRLs(vAtual) + ' · media ' + fmtBRLs(media)
        })
      }
    })

    // Ordena cada balde por severidade e pega top 5
    ;[alertasMoM, alertasYoY, alertasZ].forEach(function (arr) {
      arr.sort(function (a, b) { return b.severidade - a.severidade })
    })

    var subMoM = temMesAnt ? (rotuloMes(mesAtual) + ' vs ' + rotuloMes(mesAnt) + ' · gatilhos: |var grupo| >= 25%, |delta margem| >= 3pp') : 'sem mes anterior no recorte'
    var subYoY = temAnoAnt ? (rotuloMes(mesAtual) + ' vs ' + rotuloMes(anoAnt) + ' · gatilho: |var| >= 30%') : 'sem ' + rotuloMes(anoAnt) + ' no recorte'
    var subZ = 'mes atual vs media do periodo ' + rotuloMes(meses[0]) + ' - ' + rotuloMes(mesAtual) + ' · gatilho: |Z| > 2σ'

    return {
      blocos: [
        { kind: 'mom', titulo: 'Mês a mês', sub: subMoM, lista: alertasMoM, vazio: 'Sem variações relevantes mês a mês.' },
        { kind: 'yoy', titulo: 'Ano a ano', sub: subYoY, lista: alertasYoY, vazio: temAnoAnt ? 'Sem variações relevantes ano a ano.' : 'Inclua ' + rotuloMes(anoAnt) + ' no recorte para ativar essa análise.' },
        { kind: 'z', titulo: 'Atípicos', sub: subZ, lista: alertasZ, vazio: 'Sem valores fora do padrão estatístico.' }
      ]
    }
  }

  // Mapa de cores dos cards de alerta (port fiel de corMap)
  const corMap = {
    red: { border: 'border-red-500', bg: 'bg-red-50', icon: 'text-red-600', metric: 'text-red-700', badge: 'bg-red-100 text-red-700' },
    emerald: { border: 'border-emerald-500', bg: 'bg-emerald-50', icon: 'text-emerald-600', metric: 'text-emerald-700', badge: 'bg-emerald-100 text-emerald-700' },
    amber: { border: 'border-amber-500', bg: 'bg-amber-50', icon: 'text-amber-600', metric: 'text-amber-700', badge: 'bg-amber-100 text-amber-800' }
  }
  function CardAlerta({ a }) {
    var c = corMap[a.cor] || corMap.amber
    return (
      <div className={'flex items-center gap-2 p-2 rounded border-l-4 ' + c.border + ' ' + c.bg}>
        <div className={'text-xl leading-none ' + c.icon}>{a.icone}</div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-xs text-slate-800 truncate" title={a.titulo}>{a.titulo}</div>
          <div className="text-[10px] text-slate-600">{a.contexto}</div>
        </div>
        <div className="text-right whitespace-nowrap"><div className={'text-base font-bold ' + c.metric}>{a.metrica}</div></div>
      </div>
    )
  }
  function BlocoInsight({ b }) {
    // cor do badge depende do tipo do bloco (port fiel da funcao bloco())
    var corBadge = b.kind === 'mom' ? 'bg-sky-100 text-sky-800'
      : b.kind === 'yoy' ? 'bg-violet-100 text-violet-800'
        : 'bg-amber-100 text-amber-800'
    var top = b.lista.slice(0, 5)
    return (
      <div className="border border-slate-200 rounded p-3">
        <div className="flex items-baseline gap-2 mb-2">
          <span className={'text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ' + corBadge}>{b.titulo}</span>
          <span className="text-[10px] text-slate-500">{b.sub}</span>
          {b.lista.length > 5 && <span className="text-[10px] text-slate-400 ml-auto">+ {b.lista.length - 5} nao mostrados</span>}
        </div>
        {top.length === 0
          ? <div className="text-[11px] text-slate-400 italic">{b.vazio}</div>
          : <div className="space-y-1">{top.map((a, i) => <CardAlerta key={i} a={a} />)}</div>}
      </div>
    )
  }

  // =====================================================================
  // Tabela horizontal (Bloco 4) - monta as linhas (port fiel de renderTabela)
  // =====================================================================
  function calcLinhasTabela() {
    if (!dados || !dados.meses) return []
    var meses = dados.meses
    var mesAtual = meses[meses.length - 1]
    var mesAnt = meses[meses.length - 2] || null
    var pa = mesAtual.split('-'); var anoAnt = (parseInt(pa[0], 10) - 1) + '-' + pa[1]
    var cons = dados.consolidado || {}
    var qCol = colunasAtuais().length

    function rowFor(label, nivel, porMes, total) {
      var serieMeses = meses.map(function (k) { return porMes[k] || 0 })
      var soma = total !== undefined ? total : serieMeses.reduce(function (s, v) { return s + v }, 0)
      var media = qCol > 0 ? soma / qCol : 0
      var vAtual = porMes[mesAtual] || 0
      var vAnt = mesAnt ? (porMes[mesAnt] || 0) : null
      var vAnoAnt = porMes[anoAnt] || 0
      var momPct = (vAnt !== null && Math.abs(vAnt) > 1e-6) ? ((vAtual - vAnt) / Math.abs(vAnt)) * 100 : null
      var yoyPct = (Math.abs(vAnoAnt) > 1e-6) ? ((vAtual - vAnoAnt) / Math.abs(vAnoAnt)) * 100 : null
      var yoyAbs = vAtual - vAnoAnt

      var cssClass = nivel === 0 ? 'font-bold linha-tipo' : (nivel === 1 ? 'font-semibold linha-grupo' : 'text-slate-700')
      var padding = nivel === 0 ? 'pl-2' : (nivel === 1 ? 'pl-6' : 'pl-10')
      var clsMom = destacarVar ? corVar(momPct) : 'adre-var-neutral'
      var clsYoy = destacarVar ? corVar(yoyPct) : 'adre-var-neutral'

      return { label, cssClass, padding, soma, media, momPct, yoyPct, yoyAbs, clsMom, clsYoy }
    }

    var linhas = []
    var tipos = Object.keys(cons).sort()
    tipos.forEach(function (t) {
      var tn = cons[t]
      linhas.push(rowFor(t, 0, tn.por_mes || {}, tn.total))
      if (!mostrarGrupos) return
      var grupos = Object.keys(tn.grupos || {}).sort()
      grupos.forEach(function (g) {
        var gn = tn.grupos[g]
        linhas.push(rowFor(g, 1, gn.por_mes || {}, gn.total))
        if (!mostrarContas) return
        var contas = Object.keys(gn.contas || {}).sort()
        contas.forEach(function (c) {
          var cn = gn.contas[c]
          linhas.push(rowFor(c, 2, cn.por_mes || {}, cn.total))
        })
      })
    })

    // Linha sintetica: Lucro Operacional
    var lopPorMes = {}
    meses.forEach(function (k) { lopPorMes[k] = valLucroOpCol(k) })
    linhas.push(rowFor('= Lucro Operacional (EBIT proxy)', 0, lopPorMes, valLucroOp()))

    // Linha sintetica: Resultado Liquido
    var llPorMes = {}
    meses.forEach(function (k) { llPorMes[k] = valTipoCol('1. Lucro Bruto', k) + valTipoCol('2. Despesas', k) })
    linhas.push(rowFor('= Resultado Líquido', 0, llPorMes, valTipo('1. Lucro Bruto') + valTipo('2. Despesas')))

    return linhas
  }

  // =====================================================================
  // Charts: Margens evoluindo + Receita Bruta (port fiel de renderChart)
  // useEffect: redesenha sempre que dados/granularidade/margemModo/regime/Chart.js mudam.
  // =====================================================================
  useEffect(() => {
    if (!chartPronto || typeof window === 'undefined' || !window.Chart || !dados) return
    var Chart = window.Chart
    var colunas = colunasAtuais()
    var labels = colunas.map(rotuloColuna)
    // valorColuna (chamado dentro de cada valXxxCol) ja agrega corretamente
    // de acordo com a granularidade. Nao precisa de soma adicional aqui.
    function numBruta(k) { return valTipoCol('1. Lucro Bruto', k) }
    function numOper(k) { return valLucroOpCol(k) }
    function numLiq(k) { return valTipoCol('1. Lucro Bruto', k) + valTipoCol('2. Despesas', k) }

    var emRS = margemModo === 'rs'

    // Modo %  : numerador / Receita Liquida Operacional * 100.
    // Modo R$ : o proprio numerador (Lucro Bruto/Operacional/Liquido em reais).
    function margemSerie(getNum) {
      return colunas.map(function (k) {
        var num = getNum(k)
        if (emRS) return num
        var den = valRLOCol(k)
        return den > 0 ? (num / den) * 100 : null
      })
    }
    var receita = colunas.map(valReceitaBrutaCol)
    var mBruta = margemSerie(numBruta)
    var mOper = margemSerie(numOper)
    var mLiq = margemSerie(numLiq)

    // Escala do eixo Y das margens (-35% a +30% como piso/teto de leitura).
    var ESCALA_PISO = -35, ESCALA_TETO = 30
    function escalaMargens(seriesArr) {
      var todos = []
      seriesArr.forEach(function (s) { s.forEach(function (v) { if (v !== null && isFinite(v)) todos.push(v) }) })
      if (!todos.length) return null
      var dMin = Math.min.apply(null, todos), dMax = Math.max.apply(null, todos)
      var lo = Math.max(ESCALA_PISO, Math.floor(Math.min(dMin, 0) / 5) * 5)
      var hi = Math.min(ESCALA_TETO, Math.ceil(Math.max(dMax, 0) / 5) * 5)
      var nFora = todos.filter(function (v) { return v < lo || v > hi }).length
      return { min: lo, max: hi, foraEscala: nFora }
    }
    var esc = emRS ? null : escalaMargens([mBruta, mOper, mLiq])

    var sufixo = emRS ? '' : ' %'
    var lblBruta = (emRS ? 'Lucro Bruto' : 'Margem Bruta') + sufixo
    var lblOper = (emRS ? 'Lucro Operacional' : 'Margem Operacional') + sufixo
    var lblLiq = (emRS ? 'Lucro Líquido' : 'Margem Líquida') + sufixo

    // Grafico 1: Margens (so linhas; eixo em % ou R$ conforme o toggle)
    if (chartMargensRef.current) chartMargensRef.current.destroy()
    if (refCanvasMargens.current) {
      chartMargensRef.current = new Chart(refCanvasMargens.current.getContext('2d'), {
        data: {
          labels: labels,
          datasets: [
            { type: 'line', label: lblBruta, data: mBruta, borderColor: '#1e293b', backgroundColor: 'rgba(30,41,59,0.05)', borderWidth: 2, pointRadius: 3, tension: 0.2, fill: false },
            { type: 'line', label: lblOper, data: mOper, borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.05)', borderWidth: 2, pointRadius: 3, tension: 0.2, fill: false },
            { type: 'line', label: lblLiq, data: mLiq, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.05)', borderWidth: 2, pointRadius: 3, tension: 0.2, fill: false }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: { ticks: { autoSkip: false, maxRotation: 90, minRotation: 0, font: { size: 9 } } },
            y: {
              position: 'left',
              min: esc ? esc.min : undefined,
              max: esc ? esc.max : undefined,
              ticks: emRS
                ? { callback: function (v) { return fmtBRLs(v) } }
                : { stepSize: 5, callback: function (v) { return v.toFixed(0) + '%' } },
              grid: { color: function (ctx) { return ctx.tick.value === 0 ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)' } }
            }
          },
          plugins: {
            legend: { labels: { boxWidth: 12, padding: 10 } },
            tooltip: { callbacks: { label: function (item) {
              if (item.raw === null) return item.dataset.label + ': n/d'
              return item.dataset.label + ': ' + (emRS ? fmtBRL(item.raw) : Number(item.raw).toFixed(1) + '%')
            } } }
          }
        }
      })
    }

    // Grafico 2: Receita Bruta (so barra, escala em R$)
    if (chartReceitaRef.current) chartReceitaRef.current.destroy()
    if (refCanvasReceita.current) {
      chartReceitaRef.current = new Chart(refCanvasReceita.current.getContext('2d'), {
        data: {
          labels: labels,
          datasets: [
            { type: 'bar', label: 'Receita Bruta', data: receita, backgroundColor: 'rgba(16,185,129,0.7)', borderColor: '#059669', borderWidth: 1 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          scales: {
            x: { ticks: { autoSkip: false, maxRotation: 90, minRotation: 0, font: { size: 9 } } },
            y: { position: 'left', ticks: { callback: function (v) { return fmtBRLs(v) } } }
          },
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: function (item) { return fmtBRL(item.raw) } } }
          }
        }
      })
    }

    var infoTxt = colunas.length + ' colunas · regime ' + (regime === 'competencia' ? 'Competência' : 'Omie')
    if (esc && esc.foraEscala > 0) infoTxt += ' · ' + esc.foraEscala + ' ponto(s) fora da escala (ver tooltip)'
    setChartInfo(infoTxt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartPronto, dados, granularidade, margemModo, regime])

  // Destroi as instancias Chart.js ao desmontar a tela.
  useEffect(() => {
    return () => {
      if (chartMargensRef.current) chartMargensRef.current.destroy()
      if (chartReceitaRef.current) chartReceitaRef.current.destroy()
    }
  }, [])

  // =====================================================================
  // Export CSV (port fiel de exportarCSV)
  // =====================================================================
  function exportarCSV() {
    if (!dados) { alert('Carregue os dados primeiro.'); return }
    var meses = dados.meses
    var mesAtual = meses[meses.length - 1]
    var mesAnt = meses[meses.length - 2] || null
    var pa = mesAtual.split('-'); var anoAnt = (parseInt(pa[0], 10) - 1) + '-' + pa[1]

    function esc(v) {
      var s = (v === null || v === undefined) ? '' : String(v)
      if (s.indexOf(';') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
        s = '"' + s.replace(/"/g, '""') + '"'
      }
      return s
    }
    function fmtNum(n) {
      if (n === null || n === undefined || !isFinite(n)) return ''
      return String(Math.round(Number(n) * 100) / 100).replace('.', ',')
    }
    function rowCsv(label, nivel, porMes, total) {
      var qCol = colunasAtuais().length
      var soma = total !== undefined ? total : meses.reduce(function (s, k) { return s + (porMes[k] || 0) }, 0)
      var media = qCol > 0 ? soma / qCol : 0
      var vAtual = porMes[mesAtual] || 0
      var vAnt = mesAnt ? (porMes[mesAnt] || 0) : null
      var vAnoAnt = porMes[anoAnt] || 0
      var momPct = (vAnt !== null && Math.abs(vAnt) > 1e-6) ? ((vAtual - vAnt) / Math.abs(vAnt)) * 100 : null
      var yoyPct = (Math.abs(vAnoAnt) > 1e-6) ? ((vAtual - vAnoAnt) / Math.abs(vAnoAnt)) * 100 : null
      var yoyAbs = vAtual - vAnoAnt
      var prefix = nivel === 0 ? '' : (nivel === 1 ? '  ' : '    ')
      return [esc(prefix + label), fmtNum(soma), fmtNum(media), fmtNum(momPct), fmtNum(yoyPct), fmtNum(yoyAbs)].join(';')
    }

    var lines = []
    lines.push(['Periodo', meses[0] + ' a ' + meses[meses.length - 1]].join(';'))
    lines.push(['Regime', regime].join(';'))
    lines.push(['Granularidade', granularidade].join(';'))
    lines.push('')
    lines.push(['Linha do DRE', 'Total Periodo', 'Media', 'MoM %', 'YoY %', 'YoY Delta R$'].join(';'))

    var cons = dados.consolidado || {}
    Object.keys(cons).sort().forEach(function (t) {
      var tn = cons[t]
      lines.push(rowCsv(t, 0, tn.por_mes || {}, tn.total))
      Object.keys(tn.grupos || {}).sort().forEach(function (g) {
        var gn = tn.grupos[g]
        lines.push(rowCsv(g, 1, gn.por_mes || {}, gn.total))
        Object.keys(gn.contas || {}).sort().forEach(function (c) {
          var cn = gn.contas[c]
          lines.push(rowCsv(c, 2, cn.por_mes || {}, cn.total))
        })
      })
    })
    var lopPm = {}; meses.forEach(function (k) { lopPm[k] = valLucroOpCol(k) })
    lines.push(rowCsv('= Lucro Operacional (EBIT proxy)', 0, lopPm, valLucroOp()))
    var llPm = {}; meses.forEach(function (k) { llPm[k] = valTipoCol('1. Lucro Bruto', k) + valTipoCol('2. Despesas', k) })
    lines.push(rowCsv('= Resultado Liquido', 0, llPm, valTipo('1. Lucro Bruto') + valTipo('2. Despesas')))

    var csv = '﻿' + lines.join('\n')
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = 'analise-dre-' + regime + '-' + meses[0] + '_' + meses[meses.length - 1] + '.csv'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // =====================================================================
  // Subtitulo conforme regime (port fiel de setRegime -> sub.textContent)
  // =====================================================================
  const subtitulo = regime === 'competencia'
    ? 'Regime de competência: Receita/CMV por emissão NF, Despesas por contas_pagar.data_emissao.'
    : 'Regime Omie (ListarDRE): Receita por vencimento, CMV pela emissão, Despesas via plano de contas.'

  // Gate de permissao (espelha o layout; mantido por seguranca/padrao do portal).
  if (!loading && !loadingPerm && userProfile && (!temAcesso('financeiro') && !pode('dre', 'analise-dre'))) {
    return <SemPermissao />
  }

  // Classes ativo/inativo dos toggles (port fiel das constantes do EJS)
  const ativo = 'bg-slate-800 text-white'
  const inativo = 'bg-white text-slate-700 hover:bg-slate-100'

  const kpis = calcKPIs()
  const insights = dados ? calcInsights() : null
  const linhasTabela = dados ? calcLinhasTabela() : []

  return (
    <>
      {/* CSS especifico desta tela (port fiel do <style> do EJS) */}
      <style jsx global>{`
        #adre-tabela-scroll{max-height:60vh;overflow:auto;position:relative}
        #adre-tabela-scroll thead th{position:sticky;top:0;background:#f1f5f9;z-index:20;box-shadow:inset 0 -1px 0 #cbd5e1}
        #adre-tabela-scroll th:first-child,
        #adre-tabela-scroll td:first-child{position:sticky;left:0;z-index:10;background:#fff;border-right:1px solid #e2e8f0;min-width:280px;max-width:340px}
        #adre-tabela-scroll tr.linha-tipo  td:first-child{background:#f1f5f9}
        #adre-tabela-scroll tr.linha-grupo td:first-child{background:#f8fafc}
        #adre-tabela-scroll thead th:first-child{z-index:30;background:#f1f5f9}
        .adre-var-up   { background: rgba(16,185,129,0.12); color: #047857; }
        .adre-var-down { background: rgba(239,68,68,0.15);  color: #b91c1c; }
        .adre-var-neutral { color: #64748b; }
        .adre-card-mom-yoy { font-size: 10px; line-height: 1.2; }
      `}</style>

      {/* Cabecalho: titulo + controles (regime, periodo, granularidade, acoes) */}
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Análise do DRE</h1>
          <p className="text-xs text-slate-500" id="adre-subtitulo">{subtitulo}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
          <div className="inline-flex rounded border border-slate-300 overflow-hidden" title="Omie: regime misto (Receita por vencimento, CMV por emissao). Competencia: tudo por emissao NF.">
            <button onClick={() => setRegime('omie')} className={'px-3 py-1 text-xs ' + (regime === 'omie' ? ativo : 'bg-white text-slate-700 hover:bg-slate-100')}>Omie</button>
            <button onClick={() => setRegime('competencia')} className={'px-3 py-1 text-xs border-l border-slate-300 ' + (regime === 'competencia' ? ativo : 'bg-white text-slate-700 hover:bg-slate-100')}>Competência</button>
          </div>
          <label className="ml-2">De:</label>
          <input value={desde} onChange={(e) => setDesde(e.target.value)} type="month" className="border border-slate-300 rounded px-2 py-1" />
          <label>Até:</label>
          <input value={ate} onChange={(e) => setAte(e.target.value)} type="month" className="border border-slate-300 rounded px-2 py-1" />
          <div className="ml-2 inline-flex rounded border border-slate-300 overflow-hidden">
            <button onClick={() => setGran('mes')} className={'px-3 py-1 text-xs ' + (granularidade === 'mes' ? ativo : inativo)} title="Coluna por mes">Mês</button>
            <button onClick={() => setGran('ano')} className={'px-3 py-1 text-xs border-l border-slate-300 ' + (granularidade === 'ano' ? ativo : inativo)} title="Coluna por ano (agrupado)">Ano</button>
            <button onClick={() => setGran('ytd')} className={'px-3 py-1 text-xs border-l border-slate-300 ' + (granularidade === 'ytd' ? ativo : inativo)} title="Year-to-date: acumulado de janeiro ate cada mes">YTD</button>
          </div>
          <button onClick={carregar} disabled={carregando} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded">{carregando ? 'Carregando...' : 'Carregar'}</button>
          <button onClick={exportarCSV} className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded" title="Exporta tabela horizontal completa (UTF-8 com BOM)">CSV</button>
        </div>
      </div>

      <div id="adre-status" className="text-xs text-slate-500 mb-3">{status}</div>

      {/* Bloco 1: KPIs do periodo */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4" id="adre-kpis">
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Receita Bruta</div>
          <div className={kpis ? kpis.receita.cls : 'text-lg font-bold text-emerald-700 mt-1'}>{kpis ? kpis.receita.valor : '--'}</div>
          <div className="adre-card-mom-yoy text-slate-500 mt-1">{kpis ? <VarBadge mom={kpis.receita.mom} yoy={kpis.receita.yoy} /> : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Lucro Bruto</div>
          <div className={kpis ? kpis.lb.cls : 'text-lg font-bold mt-1'}>{kpis ? kpis.lb.valor : '--'}</div>
          <div className="adre-card-mom-yoy text-slate-500 mt-1">{kpis ? <VarBadge mom={kpis.lb.mom} yoy={kpis.lb.yoy} /> : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3" title="EBIT proxy: Lucro Bruto + Despesas Operacionais (exclui Despesas Financeiras)">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Lucro Operacional</div>
          <div className={kpis ? kpis.lop.cls : 'text-lg font-bold mt-1'}>{kpis ? kpis.lop.valor : '--'}</div>
          <div className="adre-card-mom-yoy text-slate-500 mt-1">{kpis ? <VarBadge mom={kpis.lop.mom} yoy={kpis.lop.yoy} /> : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Lucro Líquido</div>
          <div className={kpis ? kpis.ll.cls : 'text-lg font-bold mt-1'}>{kpis ? kpis.ll.valor : '--'}</div>
          <div className="adre-card-mom-yoy text-slate-500 mt-1">{kpis ? <VarBadge mom={kpis.ll.mom} yoy={kpis.ll.yoy} /> : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Margem Líquida %</div>
          <div className={kpis ? kpis.ml.cls : 'text-lg font-bold mt-1'}>{kpis ? kpis.ml.valor : '--'}</div>
          <div className="adre-card-mom-yoy text-slate-500 mt-1">
            {kpis ? (
              <>
                <span className={corVar(kpis.ml.momPP) + ' px-1 rounded'}>MoM {fmtPP(kpis.ml.momPP)}</span>
                {' · '}
                <span className={corVar(kpis.ml.yoyPP) + ' px-1 rounded'}>YoY {fmtPP(kpis.ml.yoyPP)}</span>
              </>
            ) : '--'}
          </div>
        </div>
      </div>

      {/* Bloco 2: Margens evoluindo + Receita bruta */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <div className="bg-white border border-slate-200 rounded-lg p-3 lg:col-span-2">
          <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
            <div className="text-xs uppercase tracking-wide text-slate-500" id="adre-chart-margens-titulo">Margens evoluindo ({margemModo === 'rs' ? 'R$' : '%'})</div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded border border-slate-300 overflow-hidden" title="Margens em % da Receita Líquida ou em valor (R$)">
                <button onClick={() => setMargemModo('pct')} className={'px-2 py-0.5 text-[10px] ' + (margemModo === 'pct' ? ativo : inativo)}>%</button>
                <button onClick={() => setMargemModo('rs')} className={'px-2 py-0.5 text-[10px] border-l border-slate-300 ' + (margemModo === 'rs' ? ativo : inativo)}>R$</button>
              </div>
              <div className="text-[10px] text-slate-400" id="adre-chart-info">{chartInfo}</div>
            </div>
          </div>
          <div style={{ height: '280px', position: 'relative' }}>
            <canvas ref={refCanvasMargens} id="adre-chart-margens"></canvas>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs uppercase tracking-wide text-slate-500">Receita bruta (R$)</div>
          </div>
          <div style={{ height: '280px', position: 'relative' }}>
            <canvas ref={refCanvasReceita} id="adre-chart-receita"></canvas>
          </div>
        </div>
      </div>

      {/* Bloco 3: Insights automaticos */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Insights automáticos</div>
          <div className="text-[10px] text-slate-400">organizado por horizonte temporal · top 5 por seção</div>
        </div>
        <div id="adre-insights" className="space-y-2">
          {!insights ? null
            : insights.vazio ? insights.vazio
              : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {insights.blocos.map((b) => <BlocoInsight key={b.kind} b={b} />)}
                </div>
              )}
        </div>
      </div>

      {/* Bloco 4: Tabela horizontal */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600 flex items-center justify-between flex-wrap gap-2">
          <span>Tabela horizontal — variações por linha</span>
          <div className="flex items-center gap-3">
            <label className="text-[10px]"><input type="checkbox" checked={mostrarGrupos} onChange={(e) => setMostrarGrupos(e.target.checked)} /> grupos</label>
            <label className="text-[10px]"><input type="checkbox" checked={mostrarContas} onChange={(e) => setMostrarContas(e.target.checked)} /> contas (nível 3)</label>
            <label className="text-[10px]"><input type="checkbox" checked={destacarVar} onChange={(e) => setDestacarVar(e.target.checked)} /> destacar variações</label>
          </div>
        </div>
        <div id="adre-tabela-scroll">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">Linha do DRE</th>
                <th className="text-right px-3 py-2">Total Período</th>
                <th className="text-right px-3 py-2" title="Média por coluna (mês, ano ou YTD)">Média</th>
                <th className="text-right px-3 py-2" title="Último mês vs penúltimo">MoM %</th>
                <th className="text-right px-3 py-2" title="Último mês vs mesmo mês 12 meses atrás">YoY %</th>
                <th className="text-right px-3 py-2" title="Diferença absoluta YoY (R$)">YoY Δ R$</th>
              </tr>
            </thead>
            <tbody id="adre-tbody">
              {linhasTabela.map((r, i) => (
                <tr key={i} className={r.cssClass + ' border-b border-slate-100'}>
                  <td className={'px-2 py-1 ' + r.padding}>{r.label}</td>
                  <td className={'px-2 py-1 text-right ' + corValor(r.soma)}>{fmtBRL(r.soma)}</td>
                  <td className={'px-2 py-1 text-right ' + corValor(r.media)}>{fmtBRL(r.media)}</td>
                  <td className={'px-2 py-1 text-right ' + r.clsMom}>{r.momPct === null ? '-' : fmtPct(r.momPct, 1)}</td>
                  <td className={'px-2 py-1 text-right ' + r.clsYoy}>{r.yoyPct === null ? '-' : fmtPct(r.yoyPct, 1)}</td>
                  <td className={'px-2 py-1 text-right ' + corValor(r.yoyAbs)}>{fmtBRL(r.yoyAbs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
