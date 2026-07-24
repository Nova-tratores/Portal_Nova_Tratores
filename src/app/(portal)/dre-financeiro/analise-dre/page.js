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
import { simlogY, yScaleSimlog, LIN_MIN, LIN_MAX } from '@/lib/dre-financeiro/escala-simlog'

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

// Defaults: 1o dia do ANO ANTERIOR ate o mes atual (o dia em que o usuario abre).
// Ex.: aberto em jul/2026 -> de jan/2025 ate jul/2026.
function defaultsPeriodo() {
  var hoje = new Date()
  var ini = new Date(hoje.getFullYear() - 1, 0, 1) // 1o de janeiro do ano passado
  var fim = new Date(hoje.getFullYear(), hoje.getMonth(), 1) // mes corrente
  function ym(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') }
  return { desde: ym(ini), ate: ym(fim) }
}

// ehPeca(fam): true se a familia comeca com "pec"/"peç" (port do helper da tela
// Margens). Usado no popup de composicao para separar maquinas de pecas.
function ehPeca(fam) {
  return /^pe[çc]/i.test(String(fam || '').normalize('NFD').replace(/[̀-ͯ]/g, ''))
}
// Cor da margem por faixa (port fiel da tela Margens).
function corMargem(pct) {
  return pct >= 30 ? 'text-emerald-700' : (pct >= 15 ? 'text-blue-700' : (pct >= 0 ? 'text-amber-700' : 'text-red-700'))
}
// Mes de referencia (foco) para os blocos que olham "o mes atual": se ha um mes
// focado (clique no grafico) e ele esta no recorte, usa-o; senao o ultimo mes.
// mesAnt = mes imediatamente anterior DENTRO do recorte; anoAnt = mesmo mes -1 ano.
function refMeses(meses, mesFoco) {
  var mesAtual = (mesFoco && meses.indexOf(mesFoco) >= 0) ? mesFoco : meses[meses.length - 1]
  var idx = meses.indexOf(mesAtual)
  var mesAnt = idx > 0 ? meses[idx - 1] : null
  var pa = mesAtual.split('-'); var anoAnt = (parseInt(pa[0], 10) - 1) + '-' + pa[1]
  return { mesAtual: mesAtual, mesAnt: mesAnt, anoAnt: anoAnt }
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
  // Despesas Financeiras: desmarcado por padrao -> foca no resultado OPERACIONAL
  // (esconde a linha/KPI de Lucro Liquido e as desp. financeiras no popup).
  const [mostrarDespFin, setMostrarDespFin] = useState(false)
  // Periodo (inputs type=month)
  const def = defaultsPeriodo()
  const [desde, setDesde] = useState(def.desde)
  const [ate, setAte] = useState(def.ate)

  // Mes "focado" por clique num dos 2 graficos (null = ultimo mes do recorte).
  // Um clique simples foca o mes: destaca nos 2 graficos e REAPRESENTA os KPIs,
  // Insights e a Tabela horizontal em torno dele. (Duplo clique na LINHA abre o
  // popup de composicao — ver popupMes.)
  const [mesFoco, setMesFoco] = useState(null)

  // Popup de composicao do mes (duplo clique numa bolinha do grafico de linha):
  // waterfall do DRE do mes + tabela por maquina (venda minima p/ ficar positiva).
  const [popupMes, setPopupMes] = useState(null)     // 'YYYY-MM' aberto (null = fechado)
  const [popupItens, setPopupItens] = useState(null) // vendas do mes (fetch /margens)
  const [popupRateio, setPopupRateio] = useState(null) // { porMes } (fetch /rateio)
  const [popupCarregando, setPopupCarregando] = useState(false)
  const [popupDespOpAberto, setPopupDespOpAberto] = useState(false) // drill "Despesas Operacionais"

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
  // Ao trocar de base tambem limpamos o foco e fechamos o popup (o mes focado
  // pode nao existir no novo recorte).
  useEffect(() => { setMesFoco(null); setPopupMes(null); carregar() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [regime, conta])

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
    var rm = refMeses(meses, mesFoco)
    var mesAtual = rm.mesAtual, mesAnt = rm.mesAnt, anoAnt = rm.anoAnt
    var v = getVal(mesAtual)
    var vA = mesAnt ? getVal(mesAnt) : null
    var vY = getVal(anoAnt)
    var mom = (vA && Math.abs(vA) > 1e-6) ? ((v - vA) / Math.abs(vA)) * 100 : null
    var yoy = (vY && Math.abs(vY) > 1e-6) ? ((v - vY) / Math.abs(vY)) * 100 : null
    return { mom: mom, yoy: yoy, valor: v, mesAtual: mesAtual, mesAnt: mesAnt, anoAnt: anoAnt, valorAnt: vA, valorAnoAnt: vY }
  }, [dados, mesFoco])

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
    var rm = refMeses(meses, mesFoco)
    var mesAtual = rm.mesAtual, mesAnt = rm.mesAnt, anoAnt = rm.anoAnt
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
    var rm = refMeses(meses, mesFoco)
    var mesAtual = rm.mesAtual, mesAnt = rm.mesAnt, anoAnt = rm.anoAnt
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
      var vAtual = pm[mesAtual] || 0
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
    var rm = refMeses(meses, mesFoco)
    var mesAtual = rm.mesAtual, mesAnt = rm.mesAnt, anoAnt = rm.anoAnt
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

    // --- Foco (clique num mes): indice da coluna a destacar nos 2 graficos ---
    // colDeMes: mes 'YYYY-MM' -> chave de coluna (na granularidade 'ano' e o ano).
    function colDeMes(k) { return granularidade === 'ano' ? String(k).split('-')[0] : k }
    // mesDaColuna: coluna clicada -> mes representativo p/ focar ('ano' pega o
    // ultimo mes daquele ano presente no recorte).
    function mesDaColuna(k) {
      if (granularidade !== 'ano') return k
      var doAno = dados.meses.filter(function (m) { return m.split('-')[0] === String(k) })
      return doAno.length ? doAno[doAno.length - 1] : null
    }
    var focoIdx = mesFoco ? colunas.indexOf(colDeMes(mesFoco)) : -1
    var pointRadiusArr = colunas.map(function (_, i) { return i === focoIdx ? 6 : 3 })
    var pointBWArr = colunas.map(function (_, i) { return i === focoIdx ? 3 : 1 })
    var pointBorderArr = colunas.map(function (_, i) { return i === focoIdx ? '#f59e0b' : 'transparent' })

    // Handlers de clique compartilhados pelos 2 graficos.
    function focar(idx) {
      var k = colunas[idx]; if (k == null) return
      var mk = mesDaColuna(k)
      if (mk) setMesFoco(mk)
    }
    function abrirPopupNoIdx(idx) {
      var k = colunas[idx]; if (k == null || granularidade === 'ano') return
      setMesFoco(k); setPopupMes(k)
    }
    function onClickChart(evt, els) { if (els && els.length) focar(els[0].index) }
    function onHoverChart(evt, els) { if (evt.native && evt.native.target) evt.native.target.style.cursor = els.length ? 'pointer' : 'default' }

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

    // Escala do eixo Y das margens (modo %): linear no intervalo principal
    // -10%..+15% e comprimida (log) fora dele — pontos extremos continuam
    // visiveis sem achatar a zona util (ver escala-simlog.js).
    // Lucro/Margem Liquida so entra quando "Mostrar Despesas Financeiras" esta
    // marcado (a Liquida = Operacional − desp. financeiras).
    var todosPct = emRS ? [] : (mostrarDespFin ? mBruta.concat(mOper, mLiq) : mBruta.concat(mOper))
    // Series plotadas: transformadas no modo %; as REAIS ficam em rawData
    // (tooltip mostra sempre o valor real).
    function plotSerie(s) { return emRS ? s : s.map(simlogY) }

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
            { type: 'line', label: lblBruta, data: plotSerie(mBruta), rawData: mBruta, borderColor: '#1e293b', backgroundColor: 'rgba(30,41,59,0.05)', borderWidth: 2, pointRadius: pointRadiusArr, pointHoverRadius: 6, pointBorderColor: pointBorderArr, pointBorderWidth: pointBWArr, tension: 0.2, fill: false },
            { type: 'line', label: lblOper, data: plotSerie(mOper), rawData: mOper, borderColor: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.05)', borderWidth: 2, pointRadius: pointRadiusArr, pointHoverRadius: 6, pointBorderColor: pointBorderArr, pointBorderWidth: pointBWArr, tension: 0.2, fill: false }
          ].concat(mostrarDespFin ? [
            { type: 'line', label: lblLiq, data: plotSerie(mLiq), rawData: mLiq, borderColor: '#dc2626', backgroundColor: 'rgba(220,38,38,0.05)', borderWidth: 2, pointRadius: pointRadiusArr, pointHoverRadius: 6, pointBorderColor: pointBorderArr, pointBorderWidth: pointBWArr, tension: 0.2, fill: false }
          ] : [])
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          onClick: onClickChart,
          onHover: onHoverChart,
          scales: {
            x: { ticks: { autoSkip: false, maxRotation: 90, minRotation: 0, font: { size: 9 } } },
            y: emRS
              ? {
                  position: 'left',
                  ticks: { callback: function (v) { return fmtBRLs(v) } },
                  grid: { color: function (ctx) { return ctx.tick.value === 0 ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)' } }
                }
              : yScaleSimlog(todosPct, { position: 'left' })
          },
          plugins: {
            legend: { labels: { boxWidth: 12, padding: 10 } },
            tooltip: { callbacks: { label: function (item) {
              // No modo % o dado plotado e transformado; o valor REAL esta em rawData.
              var real = item.dataset.rawData ? item.dataset.rawData[item.dataIndex] : item.raw
              if (real === null || real === undefined) return item.dataset.label + ': n/d'
              return item.dataset.label + ': ' + (emRS ? fmtBRL(real) : Number(real).toFixed(1) + '%')
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
            {
              type: 'bar', label: 'Receita Bruta', data: receita,
              backgroundColor: colunas.map(function (_, i) { return i === focoIdx ? 'rgba(5,150,105,0.95)' : 'rgba(16,185,129,0.7)' }),
              borderColor: colunas.map(function (_, i) { return i === focoIdx ? '#f59e0b' : '#059669' }),
              borderWidth: colunas.map(function (_, i) { return i === focoIdx ? 2 : 1 })
            }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          onClick: onClickChart,
          onHover: onHoverChart,
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

    // Duplo clique numa bolinha do grafico de LINHA abre o popup de composicao
    // do mes (evento nativo — clique simples ja e tratado por onClick=focar).
    var canvasM = refCanvasMargens.current
    function onDbl(e) {
      if (!chartMargensRef.current) return
      var els = chartMargensRef.current.getElementsAtEventForMode(e, 'index', { intersect: false }, false)
      if (els && els.length) abrirPopupNoIdx(els[0].index)
    }
    if (canvasM) canvasM.addEventListener('dblclick', onDbl)

    var infoTxt = colunas.length + ' colunas · regime ' + (regime === 'competencia' ? 'Competência' : 'Omie')
    if (!emRS) {
      var nZonaLog = todosPct.filter(function (v) { return v !== null && isFinite(v) && (v < LIN_MIN || v > LIN_MAX) }).length
      if (nZonaLog > 0) infoTxt += ' · ' + nZonaLog + ' ponto(s) na zona log (fora de ' + LIN_MIN + '%..' + LIN_MAX + '%)'
    }
    setChartInfo(infoTxt)
    return function () { if (canvasM) canvasM.removeEventListener('dblclick', onDbl) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartPronto, dados, granularidade, margemModo, regime, mesFoco, mostrarDespFin])

  // Destroi as instancias Chart.js ao desmontar a tela.
  useEffect(() => {
    return () => {
      if (chartMargensRef.current) chartMargensRef.current.destroy()
      if (chartReceitaRef.current) chartReceitaRef.current.destroy()
    }
  }, [])

  // =====================================================================
  // Popup de composicao do mes: busca as vendas do mes (/margens) e os
  // insumos de rateio (/rateio) para montar a tabela "por quanto a maquina
  // deveria ter sido vendida p/ ficar positiva" — mesma logica da tela Margens.
  // Fetch sob demanda, so quando um mes e aberto por duplo clique.
  // =====================================================================
  useEffect(() => {
    if (!popupMes) { setPopupItens(null); setPopupRateio(null); return }
    var ativo = true
    setPopupDespOpAberto(false)
    setPopupCarregando(true)
    setPopupItens(null); setPopupRateio(null)
    var qsConta = 'conta=' + encodeURIComponent(conta)
    Promise.all([
      fetch('/api/dre-financeiro/margens?' + qsConta + '&taxa=1&desde=' + popupMes).then(function (r) { return r.json() }),
      fetch('/api/dre-financeiro/margens/rateio?' + qsConta + '&desde=' + popupMes + '&ate=' + popupMes).then(function (r) { return r.json() })
    ]).then(function (res) {
      if (!ativo) return
      setPopupCarregando(false)
      setPopupItens((res[0] && !res[0].erro && res[0].itens) ? res[0].itens : [])
      setPopupRateio((res[1] && !res[1].erro && res[1].porMes) ? res[1].porMes : null)
    }).catch(function () {
      if (!ativo) return
      setPopupCarregando(false); setPopupItens([]); setPopupRateio(null)
    })
    return function () { ativo = false }
  }, [popupMes, conta])

  // =====================================================================
  // Export CSV (port fiel de exportarCSV)
  // =====================================================================
  function exportarCSV() {
    if (!dados) { alert('Carregue os dados primeiro.'); return }
    var meses = dados.meses
    var rm = refMeses(meses, mesFoco)
    var mesAtual = rm.mesAtual, mesAnt = rm.mesAnt, anoAnt = rm.anoAnt

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

  // ===== Dados do popup de composicao do mes (duplo clique na linha) ==========
  // Waterfall do DRE do mes (via helpers val*Col) + tabela por maquina com a
  // "venda minima p/ ficar positiva" (break-even de caixa e c/ despesas rateadas).
  const popup = (() => {
    if (!popupMes || !dados) return null
    const k = popupMes
    const rb = valReceitaBrutaCol(k)
    const rlo = valRLOCol(k)
    const lb = valTipoCol('1. Lucro Bruto', k)
    const despTotal = valTipoCol('2. Despesas', k)
    const despFin = valContaCol('2. Despesas', '11. Fixas', '03. Despesas Financeiras', k)
    const despOp = despTotal - despFin
    const lop = lb + despOp
    const ll = lb + despTotal
    const waterfall = [
      { label: 'Receita Bruta de Vendas', valor: rb, tipo: 'linha' },
      { label: '(−) Deduções / impostos s/ vendas', valor: rlo - rb, tipo: 'linha' },
      { label: '= Receita Líquida Operacional', valor: rlo, tipo: 'subtotal' },
      { label: '(−) CMV (custo das mercadorias)', valor: lb - rlo, tipo: 'linha' },
      { label: '= Lucro Bruto', valor: lb, tipo: 'subtotal' },
      { label: '(−) Despesas operacionais', valor: despOp, tipo: 'linha', key: 'despOp' },
      { label: '= Lucro Operacional (EBIT)', valor: lop, tipo: 'resultado' },
      // As duas linhas abaixo so aparecem com "Mostrar Despesas Financeiras" (soDespFin).
      { label: '(−) Despesas financeiras', valor: despFin, tipo: 'linha', soDespFin: true },
      { label: '= Lucro Líquido', valor: ll, tipo: 'resultado', soDespFin: true },
    ]
    // Composicao das Despesas Operacionais (drill ao clicar na linha): contas do
    // tipo "2. Despesas" no mes, EXCETO a conta de Despesas Financeiras.
    const despOpItens = []
    const despNode = (dados.consolidado || {})['2. Despesas']
    if (despNode && despNode.grupos) {
      Object.entries(despNode.grupos).forEach(([g, gn]) => {
        Object.keys(gn.contas || {}).forEach((c) => {
          if (c === '03. Despesas Financeiras') return
          const v = valContaCol('2. Despesas', g, c, k)
          if (Math.abs(v) >= 1) despOpItens.push({ grupo: g, conta: c, valor: v })
        })
      })
      despOpItens.sort((a, b) => a.valor - b.valor) // mais negativo (maior despesa) primeiro
    }
    // Tabela por maquina (so quando o fetch das vendas do mes chegou)
    let maquinas = null, fd = null, agg = null
    if (popupItens) {
      const doMes = popupItens.filter((it) => (it.ano + '-' + String(it.mes).padStart(2, '0')) === k)
      const recMes = doMes.reduce((s, it) => s + (Number(it.receita) || 0), 0)
      const rt = popupRateio ? popupRateio[k] : null
      const servicos = rt ? (Number(rt.servicos) || 0) : 0
      const despesasMes = rt ? (Number(rt.despesas) || 0) : 0
      const denom = recMes + servicos
      fd = (rt && denom > 0) ? despesasMes / denom : null
      maquinas = doMes.filter((it) => !ehPeca(it.familia)).map((it) => {
        const posDre = (fd !== null && fd < 1) ? it.custo_total / (1 - fd) : null
        return Object.assign({}, it, { posDre })
      }).sort((a, b) => a.margem_pct - b.margem_pct)
      const tot = maquinas.reduce((s, it) => {
        s.receita += it.receita; s.custo_total += it.custo_total; s.lucro += it.margem_real
        if (it.margem_real < 0) { s.neg += 1; s.faltou += (it.custo_total - it.receita) }
        s.posDreSum += (it.posDre != null ? it.posDre : it.custo_total)
        return s
      }, { receita: 0, custo_total: 0, lucro: 0, neg: 0, faltou: 0, posDreSum: 0 })
      agg = Object.assign({}, tot, { n: maquinas.length, fd, servicos, despesasMes, recMes })
    }
    return { k, lb, lop, ll, despOp, waterfall, despOpItens, maquinas, agg }
  })()

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

      <div id="adre-status" className="text-xs text-slate-500 mb-3 flex items-center gap-2 flex-wrap">
        <span>{status}</span>
        {mesFoco ? (
          <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 rounded px-2 py-0.5 text-[11px] font-medium">
            Foco: {rotuloMes(mesFoco)}
            <button onClick={() => setMesFoco(null)} className="text-amber-700 hover:text-amber-950 leading-none" title="Voltar ao último mês do recorte">&times;</button>
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">Clique num mês nos gráficos para focar · duplo clique numa bolinha da linha abre a composição</span>
        )}
      </div>

      {/* Toggle de visao: Despesas Financeiras (desmarcado = foco operacional) */}
      <div className="mb-3">
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none" title="Marcado: mostra o Lucro Líquido (após despesas financeiras) no gráfico, nos KPIs e no popup. Desmarcado: foca no resultado operacional.">
          <input type="checkbox" checked={mostrarDespFin} onChange={(e) => setMostrarDespFin(e.target.checked)} />
          Mostrar Despesas Financeiras
        </label>
      </div>

      {/* Bloco 1: KPIs do periodo */}
      <div className={'grid grid-cols-2 gap-3 mb-4 ' + (mostrarDespFin ? 'md:grid-cols-5' : 'md:grid-cols-3')} id="adre-kpis">
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
        {mostrarDespFin && (
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Lucro Líquido</div>
            <div className={kpis ? kpis.ll.cls : 'text-lg font-bold mt-1'}>{kpis ? kpis.ll.valor : '--'}</div>
            <div className="adre-card-mom-yoy text-slate-500 mt-1">{kpis ? <VarBadge mom={kpis.ll.mom} yoy={kpis.ll.yoy} /> : '--'}</div>
          </div>
        )}
        {mostrarDespFin && (
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
        )}
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
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Insights automáticos
            {mesFoco && <span className="ml-2 normal-case tracking-normal text-amber-700 font-medium">— mês em foco: {rotuloMes(mesFoco)}</span>}
          </div>
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
          <span>
            Tabela horizontal — variações por linha
            {mesFoco && <span className="ml-2 normal-case tracking-normal text-amber-700 font-medium">— MoM/YoY relativos a {rotuloMes(mesFoco)}</span>}
          </span>
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

      {/* Popup: composicao do mes (duplo clique numa bolinha do grafico de linha) */}
      {popup && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setPopupMes(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[96vw] max-w-[1100px] max-h-[88vh] bg-white rounded-lg shadow-2xl z-50 flex flex-col">
            <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-800">Composição de {rotuloMes(popup.k)}</h2>
                <div className="text-sm text-slate-500 mt-0.5">
                  Lucro Bruto <b className={corValor(popup.lb)}>{fmtBRL(popup.lb)}</b>
                  {' · '}Lucro Operacional <b className={corValor(popup.lop)}>{fmtBRL(popup.lop)}</b>
                  {mostrarDespFin && <> · Lucro Líquido <b className={corValor(popup.ll)}>{fmtBRL(popup.ll)}</b></>}
                  {' · '}regime {regime === 'competencia' ? 'Competência' : 'Omie'}
                </div>
              </div>
              <button onClick={() => setPopupMes(null)} className="text-slate-500 hover:text-slate-900 text-3xl leading-none">&times;</button>
            </div>

            <div className="overflow-y-auto p-4 space-y-4">
              {/* Waterfall do DRE do mes */}
              <div>
                <div className="text-sm uppercase tracking-wide text-slate-500 mb-2">O que compõe o resultado do mês</div>
                <div className="border border-slate-200 rounded overflow-hidden">
                  {popup.waterfall.filter((w) => mostrarDespFin || !w.soDespFin).map((w, i) => {
                    const isRes = w.tipo === 'resultado'
                    const isSub = w.tipo === 'subtotal'
                    const clicavel = w.key === 'despOp' && popup.despOpItens.length > 0
                    return (
                      <div key={w.label}>
                        <div
                          onClick={clicavel ? (() => setPopupDespOpAberto((v) => !v)) : undefined}
                          className={'flex justify-between px-3 py-2 text-base '
                            + (isRes ? 'bg-slate-100 font-bold border-t border-slate-300 ' : (isSub ? 'bg-slate-50 font-semibold ' : ''))
                            + (i > 0 ? 'border-t border-slate-100 ' : '')
                            + (clicavel ? 'cursor-pointer hover:bg-sky-50' : '')}
                          title={clicavel ? 'Clique para ver a composição das despesas operacionais' : undefined}>
                          <span className={isRes || isSub ? 'text-slate-800' : 'text-slate-600'}>
                            {clicavel && <span className="text-sky-600 mr-1">{popupDespOpAberto ? '▾' : '▸'}</span>}
                            {w.label}
                            {clicavel && <span className="text-[11px] text-sky-600 ml-1">(detalhar)</span>}
                          </span>
                          <span className={corValor(w.valor)}>{fmtBRL(w.valor)}</span>
                        </div>
                        {clicavel && popupDespOpAberto && (
                          <div className="bg-sky-50/40 border-t border-slate-100">
                            {popup.despOpItens.map((d) => (
                              <div key={d.grupo + '|' + d.conta} className="flex justify-between px-3 py-1.5 pl-8 text-sm border-t border-slate-100 first:border-t-0">
                                <span className="text-slate-600 truncate max-w-[70%]" title={d.grupo + ' › ' + d.conta}>
                                  {d.conta}<span className="text-slate-400 text-xs"> · {d.grupo}</span>
                                </span>
                                <span className={corValor(d.valor)}>{fmtBRL(d.valor)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Tabela por maquina: venda minima p/ ficar positiva */}
              <div>
                <div className="text-sm uppercase tracking-wide text-slate-500 mb-2 flex items-center gap-2 flex-wrap">
                  <span>Máquinas vendidas no mês — por quanto precisariam ter sido vendidas p/ ficar positivas</span>
                </div>
                {popupCarregando ? (
                  <div className="text-sm text-slate-400 py-4 text-center">Carregando vendas do mês…</div>
                ) : !popup.maquinas ? (
                  <div className="text-sm text-slate-400 py-4 text-center">Sem dados de vendas.</div>
                ) : popup.maquinas.length === 0 ? (
                  <div className="text-sm text-slate-400 py-4 text-center">Nenhuma máquina vendida neste mês.</div>
                ) : (
                  <>
                    {popup.agg && (
                      <div className="text-sm text-slate-500 mb-2">
                        {popup.agg.n} máquinas · venda {fmtBRL(popup.agg.receita)} · lucro real{' '}
                        <b className={corValor(popup.agg.lucro)}>{fmtBRL(popup.agg.lucro)}</b>
                        {popup.agg.neg > 0 && <> · <span className="text-red-700">{popup.agg.neg} com prejuízo (faltou {fmtBRL(popup.agg.faltou)})</span></>}
                        {popup.agg.fd !== null && <> · despesa rateada do mês = <b>{(popup.agg.fd * 100).toFixed(1)}%</b> da receita</>}
                      </div>
                    )}
                    <div className="border border-slate-200 rounded overflow-x-auto max-h-[42vh] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600 sticky top-0">
                          <tr>
                            <th className="text-left px-3 py-2">Produto</th>
                            <th className="text-left px-3 py-2">Cliente</th>
                            <th className="text-right px-3 py-2">Vendido por</th>
                            <th className="text-right px-3 py-2" title="Custo das mercadorias vendidas">CMV</th>
                            <th className="text-right px-3 py-2" title="Custo do capital empatado até a venda">Capital</th>
                            <th className="text-right px-3 py-2" title="(receita − CMV − capital) / receita">Mg líq. %</th>
                            <th className="text-right px-3 py-2" title="CMV + Capital: vendendo acima disso, a venda cobre o caixa. 'c/ despesas' inclui a despesa do mês rateada pela receita total">Venda p/ positivo (R$)</th>
                            <th className="text-right px-3 py-2" title="Quanto % a mais (sobre o preço vendido) precisaria para cobrir o custo. Negativo = já vendeu acima do break-even">Venda p/ positivo (%)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {popup.maquinas.map((it, idx) => {
                            const corMg = corMargem(it.margem_pct)
                            const faltou = it.custo_total - it.receita
                            const pctNec = it.receita > 0 ? ((it.custo_total - it.receita) / it.receita) * 100 : null
                            const pctNecDre = (it.posDre != null && it.receita > 0) ? ((it.posDre - it.receita) / it.receita) * 100 : null
                            const corPct = (p) => (p == null ? 'text-slate-400' : (p > 0.05 ? 'text-red-700' : 'text-emerald-700'))
                            const fmtSig = (p) => (p == null ? '—' : (p >= 0 ? '+' : '') + p.toFixed(1) + '%')
                            return (
                              <tr key={idx} className={'border-b border-slate-100 ' + (it.margem_real < 0 ? 'bg-red-50' : (it.sem_cmc ? 'bg-amber-50' : ''))}>
                                <td className="px-3 py-2 truncate max-w-[240px]" title={(it.descricao || '') + ' · ' + it.familia}>
                                  {it.descricao || '(sem)'}
                                  <span className="text-slate-400 text-xs"> · {it.familia}</span>
                                </td>
                                <td className="px-3 py-2 truncate max-w-[160px] text-slate-700" title={it.cliente || ''}>{it.cliente || '-'}</td>
                                <td className="px-3 py-2 text-right font-medium">{fmtBRL(it.receita)}</td>
                                <td className="px-3 py-2 text-right text-slate-600">{it.sem_cmc ? <span className="text-amber-700">s/ CMC</span> : fmtBRL(it.cmv)}</td>
                                <td className="px-3 py-2 text-right text-amber-700">{fmtBRL(it.custo_capital)}</td>
                                <td className={'px-3 py-2 text-right font-bold ' + corMg}>{it.margem_pct.toFixed(1)}%</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                  {it.margem_real < 0 ? (
                                    <>
                                      <span className="font-bold text-red-700">≥ {fmtBRL(it.custo_total)}</span>
                                      <div className="text-xs text-red-600">faltou {fmtBRL(faltou)}</div>
                                    </>
                                  ) : (
                                    <span className="text-slate-500">≥ {fmtBRL(it.custo_total)}</span>
                                  )}
                                  {it.posDre != null && (
                                    <div className="text-xs text-violet-700" title="Preço mínimo cobrindo também a despesa do mês rateada pela receita">c/ despesas ≥ {fmtBRL(it.posDre)}</div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">
                                  <span className={'font-bold ' + corPct(pctNec)}>{fmtSig(pctNec)}</span>
                                  {pctNecDre != null && (
                                    <div className={'text-xs ' + corPct(pctNecDre)} title="Aumento % sobre o preço vendido cobrindo também a despesa rateada do mês">c/ despesas {fmtSig(pctNecDre)}</div>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="px-4 py-2 border-t border-slate-200 text-xs text-slate-500">
              "Venda p/ positivo (R$)" = CMV + Capital empatado (break-even de caixa); a coluna (%) é o quanto a mais (sobre o preço vendido) precisaria para cobrir esse custo (negativo = já vendeu acima). "c/ despesas" inclui a despesa do mês rateada pela receita total (máquinas + peças + serviços) — mesma lógica da tela Margens. Clique em "Despesas operacionais" no waterfall para ver a composição.
            </div>
          </div>
        </>
      )}
    </>
  )
}
