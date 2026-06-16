'use client'
// =============================================================================
// Tela Patrimonio (port FIEL de views/patrimonio.ejs do financeiro-omie-dashboard).
//
// Mantem EXATAMENTE os calculos e o comportamento do original:
//  - KPI de Patrimonio operacional (destaque) + 4 cards de ativos + 1 de passivo,
//    todos clicaveis (abrem o modal de detalhe de 1o nivel).
//  - Composicao dos ativos (donut, Chart.js) + Balanco visual (barras empilhadas
//    em HTML + cobertura colorida; o card e clicavel -> modal de detalhe).
//  - Ciclo de Caixa (DSO/DIO/DPO/Ciclo + regua visual com tooltips).
//  - Cobertura de obrigacoes (vencidos + cards por janela).
//  - Evolucao historica (Chart.js misto barras empilhadas + linha de patrimonio +
//    linha tracejada de corrosao SELIC quando disponivel), com seletor de janela.
//  - Botoes "Salvar snapshot diario" e "Reconstruir historico" (backfill).
//  - Modal de 1o nivel: detalhe por item (pecas/maquinas/frota/a_receber/a_pagar/
//    patrimonio/balanco). a_receber/a_pagar tem visualizacao especial com chart
//    horizontal (Chart.js) e drill por cliente/fornecedor -> lista de titulos.
//  - Modal de 2o nivel: ficha completa de um titulo do Omie (todos os campos +
//    cadastro do cliente/fornecedor).
//
// Chart.js 4.4.0 e carregado via CDN (mesma versao da fonte) num <script> dinamico;
// os graficos usam refs/canvas imperativos. KPIs/cards/modais sao React/JSX, mas o
// conteudo HTML montado dinamicamente na fonte (detalhe de item, drill, ficha do
// titulo, balanco) e reproduzido FIEL e injetado via dangerouslySetInnerHTML para
// nao perder nenhum estilo/coluna/cor — exatamente como o innerHTML do original.
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
// Formatadores locais (identicos ao <script> da fonte). Mantidos inline para
// preservar EXATAMENTE o arredondamento usado nos KPIs/labels/graficos.
// (a fonte usa fmtBRLcurto com "k" sem casas decimais; difere do helper global
//  do portal, por isso replicamos aqui para fidelidade total.)
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
function pct(n, total) { return total > 0 ? (100 * n / total).toFixed(1) + '%' : '-' }
function fmtBRdata(iso) { if (!iso) return ''; const p = String(iso).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0] }

// ---------------------------------------------------------------------------
// Carregamento de Chart.js 4.4.0 via CDN (mesma versao da fonte), uma unica vez.
// ---------------------------------------------------------------------------
let chartLibPromise = null
function carregarChartLibs() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.Chart) return Promise.resolve()
  if (chartLibPromise) return chartLibPromise
  chartLibPromise = new Promise((resolve, reject) => {
    const src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
    const existente = document.querySelector('script[src="' + src + '"]')
    if (existente) {
      if (existente.dataset.loaded || window.Chart) { resolve(); return }
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
  return chartLibPromise
}

// Labels dos itens do modal de detalhe (port fiel de LABELS_ITEM)
const LABELS_ITEM = {
  pecas: 'Estoque de Pecas',
  maquinas: 'Estoque de Maquinas',
  frota: 'Frota Veicular',
  a_receber: 'A Receber em Aberto',
  a_pagar: 'A Pagar em Aberto',
  patrimonio: 'Patrimonio Operacional',
  balanco: 'Balanco visual - detalhes',
}

// Rotulos dos campos do titulo no modal de 2o nivel (port fiel de LABELS_CAMPO)
const LABELS_CAMPO = {
  codigo_lancamento: 'Codigo lancamento',
  numero_documento_fiscal: 'NF',
  numero_documento: 'Documento',
  numero_parcela: 'Parcela',
  data_emissao: 'Emissao',
  data_vencimento: 'Vencimento',
  data_previsao: 'Previsao',
  data_pagamento: 'Pagamento',
  data_registro: 'Registro',
  valor_documento: 'Valor documento',
  valor_pago: 'Valor pago',
  valor_juros: 'Juros',
  valor_multa: 'Multa',
  valor_desconto: 'Desconto',
  valor_corrigido: 'Valor corrigido',
  status_titulo: 'Status',
  operacao: 'Operacao',
  nome_cliente: 'Cliente',
  nome_fornecedor: 'Fornecedor',
  codigo_cliente_fornecedor: 'Codigo cliente/fornecedor',
  cnpj_cpf: 'CNPJ/CPF',
  conta_omie: 'Conta Omie',
  codigo_categoria: 'Codigo categoria',
  descricao_categoria: 'Descricao categoria',
  grupo_categoria: 'Grupo categoria',
  codigo_conta_corrente: 'Conta corrente',
  nome_conta_corrente: 'Nome conta corrente',
  codigo_projeto: 'Projeto',
  codigo_departamento: 'Departamento',
  observacao: 'Observacao',
  numero_pedido: 'Pedido',
  numero_titulo: 'Numero titulo',
  id_conta_corrente: 'ID conta corrente',
  codigo_barras: 'Codigo de barras',
  distribuicao: 'Distribuicao',
  bloqueado: 'Bloqueado',
  sincronizado_em: 'Sincronizado em',
  criado_em: 'Criado em',
  atualizado_em: 'Atualizado em',
}
function rotuloCampo(k) {
  if (LABELS_CAMPO[k]) return LABELS_CAMPO[k]
  return k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
function fmtValor(k, v) {
  if (v === null || v === undefined || v === '') return '<span class="text-slate-300">-</span>'
  const s = String(k).toLowerCase()
  if (/^valor/.test(s) || s === 'aberto') return fmtBRL(v)
  if (/^data_/.test(s) && /^\d{4}-\d{2}-\d{2}/.test(String(v))) return String(v).slice(0, 10).split('-').reverse().join('/')
  if (typeof v === 'boolean') return v ? 'Sim' : 'Nao'
  if (typeof v === 'object') return '<code class="text-[10px] text-slate-500">' + JSON.stringify(v) + '</code>'
  return String(v)
}

export default function PatrimonioPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  // --- Estado de dados/UI ---------------------------------------------------
  const [chartReady, setChartReady] = useState(false)
  const ultimoPayload = useRef(null) // ultimo retorno de /api/patrimonio (para o detalhe do balanco)
  const [dados, setDados] = useState(null) // payload de /api/patrimonio (KPIs/composicao/ciclo/cobertura)

  // Snapshot / Backfill
  const [snapStatus, setSnapStatus] = useState('')
  const [snapBusy, setSnapBusy] = useState(false)
  const [backfillStatus, setBackfillStatus] = useState('')
  const [backfillBusy, setBackfillBusy] = useState(false)
  const [diasBackfill, setDiasBackfill] = useState('90')

  // Historico
  const [diasHist, setDiasHist] = useState('90')
  const [histVazio, setHistVazio] = useState(false)
  // Contador para forcar redesenho do historico apos snapshot/backfill.
  const [histTick, setHistTick] = useState(0)

  // Modal 1o nivel
  const [modalAberto, setModalAberto] = useState(false)
  const [modalTitulo, setModalTitulo] = useState('Detalhe')
  const [modalCorpo, setModalCorpo] = useState({ tipo: 'vazio' }) // descreve o conteudo a renderizar

  // Modal 2o nivel (ficha do titulo)
  const [modal2Aberto, setModal2Aberto] = useState(false)
  const [modal2Titulo, setModal2Titulo] = useState('Detalhe do titulo')
  const [modal2Subtitulo, setModal2Subtitulo] = useState('') // HTML
  const [modal2Html, setModal2Html] = useState('<div class="text-slate-500 text-sm">Carregando dados do Omie...</div>')

  // Refs de canvas/graficos
  const compRef = useRef(null)
  const chartComp = useRef(null)
  const histRef = useRef(null)
  const chartHist = useRef(null)
  const drillRef = useRef(null)   // canvas do chart de drill (a_receber/a_pagar) — vive dentro do modal-body
  const chartDrill = useRef(null)

  // Estado do drill por entidade (cliente/fornecedor) — usado em a_receber/a_pagar
  const drillEntidades = useRef([])
  const drillSelecionado = useRef(null)
  const drillIsReceber = useRef(true)
  const [drillDetalheHtml, setDrillDetalheHtml] = useState('') // detalhe da entidade selecionada (HTML)

  // Carrega Chart.js uma vez
  useEffect(() => {
    carregarChartLibs().then(() => setChartReady(true)).catch(() => setChartReady(false))
  }, [])

  // =========================================================================
  // carregar(): GET /api/patrimonio?conta=... -> KPIs + composicao + ciclo + cobertura
  // Port fiel da funcao carregar() da fonte.
  // =========================================================================
  const carregar = useCallback(() => {
    fetch('/api/dre-financeiro/patrimonio?conta=' + conta).then((r) => r.json()).then((d) => {
      if (d.erro) { alert('Erro: ' + d.erro); return }
      ultimoPayload.current = d
      setDados(d)
    })
  }, [conta])

  useEffect(() => { carregar() }, [carregar])

  // Donut de composicao (Chart.js) — port fiel do bloco de chartComp
  useEffect(() => {
    if (!chartReady || !dados || !window.Chart || !compRef.current) return
    const d = dados
    const a = d.ativos
    const compData = [
      { label: 'Pecas', valor: a.estoque_pecas, cor: '#3b82f6' },
      { label: 'Maquinas', valor: a.estoque_maquinas, cor: '#6366f1' },
      { label: 'Frota', valor: a.frota, cor: '#a855f7' },
      { label: 'A receber', valor: a.a_receber_aberto, cor: '#10b981' },
    ].filter((x) => x.valor > 0)

    if (chartComp.current) chartComp.current.destroy()
    chartComp.current = new window.Chart(compRef.current.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: compData.map((x) => x.label),
        datasets: [{
          data: compData.map((x) => x.valor),
          backgroundColor: compData.map((x) => x.cor),
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: function (item) {
                const v = item.raw
                return item.label + ': ' + fmtBRL(v) + ' (' + (100 * v / d.total_ativos).toFixed(1) + '%)'
              },
            },
          },
        },
      },
    })
  }, [chartReady, dados])

  // =========================================================================
  // carregarHistorico(): GET /api/patrimonio/historico?conta=...&dias=...
  // Port fiel da funcao carregarHistorico() da fonte (Chart misto).
  // =========================================================================
  useEffect(() => {
    if (!chartReady || !window.Chart) return
    fetch('/api/dre-financeiro/patrimonio/historico?conta=' + conta + '&dias=' + diasHist).then((r) => r.json()).then((d) => {
      if (d.erro) return
      const pontos = d.pontos || []
      if (pontos.length === 0) {
        setHistVazio(true)
        if (chartHist.current) { chartHist.current.destroy(); chartHist.current = null }
        return
      }
      setHistVazio(false)
      if (!histRef.current) return

      const labels = pontos.map((p) => fmtBRdata(p.data))
      if (chartHist.current) chartHist.current.destroy()
      // Corrosao SELIC acumulada (pode vir null em snapshots antigos)
      const serieCorrosao = pontos.map((p) => {
        const v = p.custo_capital_acumulado
        return v === null || v === undefined ? null : Number(v)
      })
      const temCorrosao = serieCorrosao.some((v) => v !== null && v > 0)

      chartHist.current = new window.Chart(histRef.current.getContext('2d'), {
        data: {
          labels: labels,
          datasets: [
            { type: 'bar', label: 'Estoque pecas', data: pontos.map((p) => Number(p.estoque_pecas)), backgroundColor: '#3b82f6', stack: 'ativos' },
            { type: 'bar', label: 'Estoque maquinas', data: pontos.map((p) => Number(p.estoque_maquinas)), backgroundColor: '#6366f1', stack: 'ativos' },
            { type: 'bar', label: 'Frota', data: pontos.map((p) => Number(p.frota)), backgroundColor: '#a855f7', stack: 'ativos' },
            { type: 'bar', label: 'A receber', data: pontos.map((p) => Number(p.a_receber_aberto)), backgroundColor: '#10b981', stack: 'ativos' },
            { type: 'bar', label: 'A pagar', data: pontos.map((p) => -Number(p.a_pagar_aberto)), backgroundColor: '#ef4444', stack: 'passivos' },
            {
              type: 'line', label: 'Patrimonio operacional', data: pontos.map((p) => Number(p.patrimonio_operacional)),
              borderColor: '#0f172a', borderWidth: 3, pointRadius: 2, tension: 0.1, fill: false, yAxisID: 'y',
            },
            temCorrosao ? {
              type: 'line', label: 'Corrosao SELIC acumulada (estoque)',
              data: serieCorrosao,
              borderColor: '#f59e0b', borderWidth: 2, borderDash: [6, 4], pointRadius: 2, tension: 0.1, fill: false, yAxisID: 'yCorrosao',
              spanGaps: false,
            } : null,
          ].filter(Boolean),
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: { stacked: true, ticks: { maxTicksLimit: 12 } },
            y: { stacked: true, ticks: { callback: function (v) { return fmtBRLcurto(v) } } },
            yCorrosao: temCorrosao ? {
              display: true, position: 'right', grid: { display: false },
              ticks: { callback: function (v) { return fmtBRLcurto(v) }, color: '#b45309', font: { size: 10 } },
              title: { display: true, text: 'Corrosao (R$)', color: '#b45309', font: { size: 10 } },
            } : { display: false },
          },
          plugins: {
            legend: { labels: { boxWidth: 12, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: function (item) {
                  if (item.raw === null || item.raw === undefined) return item.dataset.label + ': -'
                  return item.dataset.label + ': ' + fmtBRL(Math.abs(item.raw))
                },
              },
            },
          },
        },
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, conta, diasHist, histTick])

  // =========================================================================
  // Detalhe do balanco (1o nivel) — port fiel de renderBalancoDetalhe (innerHTML)
  // =========================================================================
  function renderBalancoDetalhe() {
    const d = ultimoPayload.current
    if (!d) { setModalCorpo({ tipo: 'html', html: '<div class="text-slate-500 text-sm">Aguarde, dados ainda carregando...</div>' }); return }
    const a = d.ativos, p = d.passivos
    const totalAt = d.total_ativos, totalPa = d.total_passivos
    const cobertura = totalPa > 0 ? totalAt / totalPa : null
    const corCob = cobertura === null ? 'text-slate-500' :
      cobertura > 3 ? 'text-emerald-700' :
        cobertura > 1.5 ? 'text-blue-700' :
          cobertura > 1 ? 'text-amber-700' : 'text-red-700'
    const classifCob = cobertura === null ? 'sem passivos' :
      cobertura > 3 ? 'folga confortavel (> 3x)' :
        cobertura > 1.5 ? 'saudavel (1.5x - 3x)' :
          cobertura > 1 ? 'apertado (1x - 1.5x)' : 'descoberto (< 1x)'
    const saldo = totalAt - totalPa
    const ativosLinhas = [
      { label: 'Estoque pecas', valor: a.estoque_pecas, cor: 'bg-blue-500' },
      { label: 'Estoque maquinas', valor: a.estoque_maquinas, cor: 'bg-indigo-500' },
      { label: 'Frota', valor: a.frota, cor: 'bg-purple-500' },
      { label: 'A receber', valor: a.a_receber_aberto, cor: 'bg-emerald-500' },
    ].filter((x) => x.valor > 0)
    const passivosLinhas = [
      { label: 'A pagar em aberto', valor: p.a_pagar_aberto, cor: 'bg-red-500' },
    ].filter((x) => x.valor > 0)

    let html = ''
    html += '<div class="text-sm text-slate-700 mb-3">Confronto entre o que voce <b>tem</b> (ativos) e o que voce <b>deve</b> (passivos). A cobertura mostra quantas vezes os ativos liquidam todos os passivos.</div>'

    html += '<div class="grid grid-cols-2 gap-3 mb-4">'
    html += '<div class="bg-emerald-50 border border-emerald-200 rounded p-3"><div class="text-[10px] uppercase text-emerald-700">Total ativos</div><div class="text-xl font-bold text-emerald-900">' + fmtBRL(totalAt) + '</div></div>'
    html += '<div class="bg-red-50 border border-red-200 rounded p-3"><div class="text-[10px] uppercase text-red-700">Total passivos</div><div class="text-xl font-bold text-red-900">' + fmtBRL(totalPa) + '</div></div>'
    html += '</div>'

    html += '<div class="bg-slate-50 border border-slate-200 rounded p-3 mb-4">'
    html += '<div class="flex justify-between items-baseline mb-1">'
    html += '<div class="text-xs uppercase text-slate-600">Cobertura</div>'
    html += '<div class="text-2xl font-bold ' + corCob + '">' + (cobertura === null ? '--' : cobertura.toFixed(2) + 'x') + '</div>'
    html += '</div>'
    html += '<div class="text-xs text-slate-600">' + classifCob + '</div>'
    html += '<div class="text-xs text-slate-500 mt-1">Saldo liquido (ativos − passivos): <b class="' + (saldo >= 0 ? 'text-emerald-700' : 'text-red-700') + '">' + fmtBRL(saldo) + '</b></div>'
    html += '</div>'

    html += '<div class="mb-3"><div class="text-xs uppercase text-slate-500 mb-1">Composicao dos ativos</div>'
    ativosLinhas.forEach((x) => {
      const pc = totalAt > 0 ? (100 * x.valor / totalAt) : 0
      html += '<div class="mb-2">'
      html += '<div class="flex justify-between text-xs mb-0.5"><span class="text-slate-700">' + x.label + '</span><span class="font-medium">' + fmtBRL(x.valor) + ' <span class="text-slate-400">(' + pc.toFixed(1) + '%)</span></span></div>'
      html += '<div class="h-2 bg-slate-100 rounded overflow-hidden"><div class="' + x.cor + ' h-full" style="width:' + pc + '%"></div></div>'
      html += '</div>'
    })
    if (!ativosLinhas.length) html += '<div class="text-xs text-slate-400">Sem ativos.</div>'
    html += '</div>'

    html += '<div><div class="text-xs uppercase text-slate-500 mb-1">Composicao dos passivos</div>'
    passivosLinhas.forEach((x) => {
      const pc = totalPa > 0 ? (100 * x.valor / totalPa) : 0
      html += '<div class="mb-2">'
      html += '<div class="flex justify-between text-xs mb-0.5"><span class="text-slate-700">' + x.label + '</span><span class="font-medium">' + fmtBRL(x.valor) + '</span></div>'
      html += '<div class="h-2 bg-slate-100 rounded overflow-hidden"><div class="' + x.cor + ' h-full" style="width:' + pc + '%"></div></div>'
      html += '</div>'
    })
    if (!passivosLinhas.length) html += '<div class="text-xs text-slate-400">Sem passivos.</div>'
    html += '</div>'

    setModalCorpo({ tipo: 'html', html })
  }

  // =========================================================================
  // Detalhe agrupado (a_receber/a_pagar): KPIs + chart top N + drill por entidade.
  // Port fiel de renderDetalheAgrupado + selecionarEntidadeDrill da fonte.
  // O corpo do modal e HTML estatico (KPIs/chart/lista); o drill-detalhe e um
  // container separado preenchido por selecionarEntidadeDrill. O canvas do chart
  // e montado por React (ref drillRef) e o Chart.js desenha nele via useEffect.
  // =========================================================================
  const [drillView, setDrillView] = useState(null) // { headerHtml, chartTopN, alturaChart, listaHtml }

  function renderDetalheAgrupado(d) {
    drillIsReceber.current = d.item === 'a_receber'
    drillEntidades.current = d.entidades || []
    drillSelecionado.current = null
    setDrillDetalheHtml('')
    const entidade = d.agrupamento || (drillIsReceber.current ? 'cliente' : 'fornecedor')
    const entidadePlural = entidade === 'cliente' ? 'clientes' : 'fornecedores'

    // KPIs no topo (HTML fiel)
    let html = ''
    html += '<div class="text-sm text-slate-700 mb-3">' + (d.descricao || '') + '</div>'
    html += '<div class="grid grid-cols-3 gap-2 mb-3">'
    html += '<div class="bg-slate-50 border border-slate-200 rounded p-2"><div class="text-[10px] uppercase text-slate-500">Total em aberto</div><div class="text-lg font-bold text-slate-800">' + fmtBRL(d.total) + '</div><div class="text-[10px] text-slate-500">' + d.qtd + ' titulos</div></div>'
    html += '<div class="bg-emerald-50 border border-emerald-200 rounded p-2"><div class="text-[10px] uppercase text-emerald-700">' + entidadePlural + ' externos</div><div class="text-lg font-bold text-emerald-800">' + fmtBRL(d.total_externos) + '</div><div class="text-[10px] text-emerald-700">' + d.qtd_entidades + ' ' + entidadePlural + '</div></div>'
    const excluido = (d.excluido_intercompany || 0) + (d.excluido_sem_cliente || 0)
    html += '<div class="bg-amber-50 border border-amber-200 rounded p-2"><div class="text-[10px] uppercase text-amber-700">Excluido</div><div class="text-lg font-bold text-amber-800">' + fmtBRL(excluido) + '</div><div class="text-[10px] text-amber-700" title="Intercompany NOVA/CASTRO + ' + entidadePlural + ' sem identificacao">' + (d.qtd_intercompany || 0) + ' inter &middot; ' + (d.qtd_sem_cliente || 0) + ' sem ' + entidade + '</div></div>'
    html += '</div>'

    const topN = Math.min(15, drillEntidades.current.length)
    html += '<div class="text-xs text-slate-500 uppercase tracking-wide mb-1">Top ' + topN + ' ' + entidadePlural + ' (clique numa barra p/ ver titulos)</div>'
    const alturaChart = Math.max(180, topN * 26)

    // Lista completa textual (acessivel) — so se tiver mais que o chart mostra.
    // Mantemos como HTML, mas os cliques de selecao usam delegacao de eventos
    // (data-drill-idx) tratada no onClick do container do modal-body.
    let listaHtml = ''
    if (drillEntidades.current.length > topN) {
      listaHtml += '<details class="mb-3"><summary class="text-xs text-slate-500 cursor-pointer hover:text-slate-700">Ver todos os ' + drillEntidades.current.length + ' ' + entidadePlural + ' (lista completa)</summary>'
      listaHtml += '<div class="mt-2 border border-slate-200 rounded max-h-60 overflow-y-auto divide-y divide-slate-100">'
      drillEntidades.current.forEach((e, idx) => {
        listaHtml += '<div class="flex justify-between items-center px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-xs" data-drill-idx="' + idx + '">'
        listaHtml += '<span class="truncate flex-1 mr-2" title="' + (e.nome || '') + '">' + (idx + 1) + '. ' + (e.nome || '(sem nome)') + (e.cnpj ? ' <span class="text-slate-400">' + e.cnpj + '</span>' : '') + '</span>'
        listaHtml += '<span class="font-semibold text-slate-700 whitespace-nowrap">' + fmtBRLcurto(e.total) + ' <span class="text-slate-400">(' + e.qtd + ')</span></span>'
        listaHtml += '</div>'
      })
      listaHtml += '</div></details>'
    }

    setDrillView({
      headerHtml: html,
      topN,
      alturaChart,
      listaHtml,
    })
    setModalCorpo({ tipo: 'drill' })
  }

  // Desenha o chart horizontal do drill (a_receber/a_pagar) quando o modal abre.
  useEffect(() => {
    if (!chartReady || !window.Chart) return
    if (!modalAberto || modalCorpo.tipo !== 'drill' || !drillView) return
    if (!drillRef.current) return
    const corBar = drillIsReceber.current ? '#10b981' : '#ef4444'
    const top = drillEntidades.current.slice(0, drillView.topN)

    if (chartDrill.current) chartDrill.current.destroy()
    chartDrill.current = new window.Chart(drillRef.current.getContext('2d'), {
      type: 'bar',
      data: {
        labels: top.map((e) => { const n = String(e.nome || ''); return n.length > 32 ? n.slice(0, 30) + '...' : n }),
        datasets: [{
          data: top.map((e) => e.total),
          backgroundColor: top.map(() => corBar),
          borderWidth: 0,
          _entidades: top,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        onClick: function (evt, els) {
          if (!els || !els.length) return
          selecionarEntidadeDrill(els[0].index)
        },
        scales: {
          x: { ticks: { callback: function (v) { return fmtBRLcurto(v) }, font: { size: 10 } }, grid: { color: '#f1f5f9' } },
          y: { ticks: { font: { size: 10 } }, grid: { display: false } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function (item) {
                const e = top[item.dataIndex]
                return [fmtBRL(e.total) + ' (' + e.qtd + ' titulos)',
                e.vencido > 0 ? 'Vencido: ' + fmtBRL(e.vencido) + ' · max atraso ' + e.maiorAtraso + 'd' : 'Tudo a vencer',
                e.cnpj ? 'CNPJ: ' + e.cnpj : '',
                (e.cidade ? e.cidade + (e.estado ? '/' + e.estado : '') : '')].filter(Boolean)
              },
            },
          },
        },
      },
    })
    return () => { if (chartDrill.current) { chartDrill.current.destroy(); chartDrill.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, modalAberto, modalCorpo.tipo, drillView])

  // Seleciona uma entidade do drill -> realca a barra + monta a tabela de titulos.
  // Port fiel de selecionarEntidadeDrill.
  function selecionarEntidadeDrill(idx) {
    const e = drillEntidades.current[idx]
    if (!e) return
    drillSelecionado.current = idx
    if (chartDrill.current && chartDrill.current.data && chartDrill.current.data.datasets[0]) {
      const corBar = drillIsReceber.current ? '#10b981' : '#ef4444'
      const corBarSel = drillIsReceber.current ? '#047857' : '#b91c1c'
      const top = chartDrill.current.data.datasets[0]._entidades || []
      chartDrill.current.data.datasets[0].backgroundColor = top.map((x) => (x === e ? corBarSel : corBar))
      chartDrill.current.update('none')
    }
    const atrasoCor = drillIsReceber.current ? 'text-red-700' : 'text-slate-700'
    let html = '<div class="border border-slate-300 rounded-lg p-3 bg-white">'
    html += '<div class="flex items-start justify-between gap-2 mb-2">'
    html += '<div><div class="text-base font-bold text-slate-900">' + (e.nome || '(sem nome)') + '</div>'
    html += '<div class="text-xs text-slate-500">'
    if (e.cnpj) html += 'CNPJ ' + e.cnpj + ' · '
    if (e.cidade) html += e.cidade + (e.estado ? '/' + e.estado : '') + ' · '
    html += e.qtd + ' titulos em aberto</div></div>'
    html += '<div class="text-right"><div class="text-xl font-bold text-slate-900">' + fmtBRL(e.total) + '</div>'
    if (e.vencido > 0) html += '<div class="text-xs ' + atrasoCor + ' font-semibold">Vencido ' + fmtBRL(e.vencido) + ' · max ' + e.maiorAtraso + 'd</div>'
    if (e.aVencer > 0) html += '<div class="text-xs text-emerald-700">A vencer ' + fmtBRL(e.aVencer) + '</div>'
    html += '</div></div>'

    // Tabela de titulos
    html += '<div class="border border-slate-200 rounded overflow-hidden mt-2"><table class="w-full text-xs"><thead class="bg-slate-50 text-slate-600"><tr>'
    html += '<th class="text-left px-2 py-1">NF / Parc</th>'
    html += '<th class="text-left px-2 py-1">Vencimento</th>'
    html += '<th class="text-left px-2 py-1">Status</th>'
    html += '<th class="text-right px-2 py-1">Valor</th></tr></thead><tbody>'
    const tipoTitulo = drillIsReceber.current ? 'a_receber' : 'a_pagar'
    e.titulos.forEach((t) => {
      const venc = t.vencimento ? t.vencimento.split('-').reverse().join('/') : '-'
      const atrasoTxt = t.atraso_dias > 0 ? ' <span class="text-red-700 text-[10px]">(' + t.atraso_dias + 'd)</span>' : ''
      const nfParc = (t.nf ? 'NF ' + t.nf : '-') + (t.parcela ? ' · p' + t.parcela : '')
      // Cliques abrem o modal de 2o nivel via delegacao (data-titulo-tipo/codigo).
      const attrs = t.codigo ? ('data-titulo-tipo="' + tipoTitulo + '" data-titulo-codigo="' + String(t.codigo).replace(/"/g, '') + '"') : ''
      const cls = t.codigo ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-slate-50'
      html += '<tr class="border-t border-slate-100 ' + cls + '" ' + attrs + ' title="' + (t.codigo ? 'Clique para ver todos os campos do titulo' : '') + '">'
      html += '<td class="px-2 py-1 font-mono text-[10px]">' + (t.codigo ? '<span class="text-blue-600">▶</span> ' : '') + nfParc + '</td>'
      html += '<td class="px-2 py-1">' + venc + atrasoTxt + '</td>'
      html += '<td class="px-2 py-1 text-slate-500">' + (t.status || '-') + ' <span class="text-[10px] text-slate-400 uppercase">' + (t.conta || '') + '</span></td>'
      html += '<td class="px-2 py-1 text-right font-semibold">' + fmtBRL(t.valor) + '</td>'
      html += '</tr>'
    })
    html += '</tbody></table></div>'
    html += '</div>'
    setDrillDetalheHtml(html)
  }

  // =========================================================================
  // abrirDetalhe(item) — port fiel: abre modal de 1o nivel e busca /detalhe.
  // =========================================================================
  function abrirDetalhe(item) {
    setModalTitulo(LABELS_ITEM[item] || item)
    setDrillView(null)
    setDrillDetalheHtml('')
    setModalAberto(true)

    if (item === 'balanco') { renderBalancoDetalhe(); return }

    setModalCorpo({ tipo: 'carregando' })
    fetch('/api/dre-financeiro/patrimonio/detalhe?conta=' + conta + '&item=' + item).then((r) => r.json()).then((d) => {
      if (d.erro) { setModalCorpo({ tipo: 'html', html: '<div class="text-red-600 text-sm">' + d.erro + '</div>' }); return }

      // a_receber/a_pagar tem visualizacao especial com chart + drill por entidade
      if ((item === 'a_receber' || item === 'a_pagar') && Array.isArray(d.entidades)) {
        renderDetalheAgrupado(d)
        return
      }

      // Demais itens: HTML montado fiel (formula/total + composicao OU itens OU vazio)
      let html = ''
      html += '<div class="text-sm text-slate-700 mb-3">' + (d.descricao || '') + '</div>'
      if (d.formula) html += '<div class="text-xs text-slate-500 font-mono bg-slate-50 border border-slate-200 rounded p-2 mb-3">Formula: ' + d.formula + '</div>'
      html += '<div class="flex items-baseline justify-between mb-4">'
      html += '<div class="text-2xl font-bold text-slate-800">' + fmtBRL(d.total) + '</div>'
      if (d.qtd !== undefined) html += '<div class="text-xs text-slate-500">' + d.qtd + ' itens</div>'
      html += '</div>'

      if (d.composicao) {
        // patrimonio/balanco — formula decomposta com drill-down (data-drill-item)
        html += '<div class="border border-slate-200 rounded p-3 bg-slate-50">'
        html += '<div class="text-[11px] text-slate-500 mb-2">Clique numa linha com seta ▶ para explodir os detalhes</div>'
        d.composicao.forEach((c) => {
          const cor = c.valor < 0 ? 'text-red-700' : (c.destaque ? 'text-slate-900 font-bold' : 'text-slate-800')
          if (c.drill) {
            const hover = 'cursor-pointer hover:bg-white hover:border-blue-400 border border-transparent rounded -mx-1 px-1'
            html += '<div class="flex justify-between py-1 ' + hover + '" data-drill-item="' + c.drill + '">'
            html += '<span class="text-sm flex items-center gap-1"><span class="text-blue-600 text-xs">▶</span>' + c.label + '</span>'
            html += '<span class="text-sm font-medium ' + cor + '">' + fmtBRL(c.valor) + '</span>'
            html += '</div>'
          } else {
            html += '<div class="flex justify-between py-1 ' + (c.destaque ? 'border-t border-slate-300 mt-1 pt-2' : '') + '">'
            html += '<span class="text-sm">' + c.label + '</span>'
            html += '<span class="text-sm font-medium ' + cor + '">' + fmtBRL(c.valor) + '</span>'
            html += '</div>'
          }
        })
        html += '</div>'

        // Se for balanco, ainda mostrar cobertura por janela
        if (d.item === 'balanco' && d.cobertura_por_janela && d.cobertura_por_janela.length) {
          html += '<div class="mt-4 border border-slate-200 rounded p-3">'
          html += '<div class="text-xs text-slate-500 uppercase tracking-wide mb-2">Cobertura por janela (a receber / a pagar)</div>'
          html += '<div class="grid grid-cols-2 md:grid-cols-4 gap-2">'
          d.cobertura_por_janela.forEach((j) => {
            const corClass = j.classificacao === 'confortavel' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' :
              j.classificacao === 'saudavel' ? 'border-blue-300 bg-blue-50 text-blue-800' :
                j.classificacao === 'apertado' ? 'border-amber-300 bg-amber-50 text-amber-800' :
                  j.classificacao === 'descoberto' ? 'border-red-300 bg-red-50 text-red-800' :
                    'border-slate-200 bg-slate-50 text-slate-700'
            html += '<div class="border rounded p-2 ' + corClass + '">'
            html += '<div class="text-[10px] uppercase">' + j.dias + ' dias</div>'
            html += '<div class="text-lg font-bold mt-0.5">' + (j.cobertura !== null ? j.cobertura + 'x' : 'n/a') + '</div>'
            html += '<div class="text-[10px] capitalize">' + j.classificacao.replace('_', ' ') + '</div>'
            html += '</div>'
          })
          html += '</div></div>'
        }
      } else if (d.itens && d.itens.length) {
        html += '<div class="text-xs text-slate-500 uppercase tracking-wide mb-2">Top ' + d.itens.length + (d.qtd > d.itens.length ? ' de ' + d.qtd : '') + '</div>'
        const maxVal = Math.max.apply(null, d.itens.map((x) => x.valor))
        html += '<div class="space-y-1">'
        d.itens.forEach((it) => {
          const pc = maxVal > 0 ? (100 * it.valor / maxVal) : 0
          html += '<div class="border border-slate-200 rounded p-2 hover:bg-slate-50">'
          html += '<div class="flex justify-between items-start gap-2">'
          html += '<div class="text-sm font-medium text-slate-800 flex-1 truncate" title="' + (it.rotulo || '') + '">' + (it.rotulo || '(sem nome)') + '</div>'
          html += '<div class="text-sm font-bold text-slate-900 whitespace-nowrap">' + fmtBRL(it.valor) + '</div>'
          html += '</div>'
          if (it.subtitulo) html += '<div class="text-[10px] text-slate-500 mt-0.5 truncate">' + it.subtitulo + '</div>'
          html += '<div class="mt-1 h-1 bg-slate-100 rounded overflow-hidden"><div class="h-full bg-slate-400" style="width:' + pc + '%"></div></div>'
          html += '</div>'
        })
        html += '</div>'
      } else {
        html += '<div class="text-slate-500 text-sm">Sem itens individuais para listar.</div>'
      }
      setModalCorpo({ tipo: 'html', html })
    })
  }

  function fecharModal() {
    setModalAberto(false)
    if (chartDrill.current) { chartDrill.current.destroy(); chartDrill.current = null }
  }
  function fecharModal2() { setModal2Aberto(false) }

  // Esc fecha modal2 primeiro, senao o 1o (port fiel do keydown)
  useEffect(() => {
    function onKey(e) {
      if (e.key !== 'Escape') return
      setModal2Aberto((m2) => {
        if (m2) return false
        setModalAberto(false)
        return false
      })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // =========================================================================
  // abrirTituloDetalhe(tipo, codigo) — modal 2o nivel: ficha completa do titulo.
  // Port fiel da funcao homonima da fonte.
  // =========================================================================
  function abrirTituloDetalhe(tipo, codigo) {
    if (!codigo) return
    setModal2Titulo('Detalhe do titulo ' + codigo)
    setModal2Subtitulo((tipo === 'a_receber' ? 'Contas a receber' : 'Contas a pagar') + ' &middot; carregando...')
    setModal2Html('<div class="text-slate-500 text-sm">Carregando dados do Omie...</div>')
    setModal2Aberto(true)

    fetch('/api/dre-financeiro/patrimonio/titulo?tipo=' + tipo + '&codigo=' + encodeURIComponent(codigo))
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { setModal2Html('<div class="text-red-600 text-sm">' + d.erro + '</div>'); return }
        const t = d.titulo || {}
        const c = d.cadastro
        const nome = t[d.colNome] || (c && (c.razao_social || c.nome_fantasia)) || '(sem nome)'
        const nfParc = (t.numero_documento_fiscal ? 'NF ' + t.numero_documento_fiscal : '') + (t.numero_parcela ? ' · parc ' + t.numero_parcela : '')
        setModal2Subtitulo('<b>' + nome + '</b>' + (nfParc ? ' &middot; ' + nfParc : ''))

        // Banner com KPIs do titulo
        let html = ''
        const aberto = d.aberto || 0
        const pago = Number(t.valor_pago) || 0
        const doc = Number(t.valor_documento) || 0
        const hojeISO = new Date().toISOString().slice(0, 10)
        const atrasoDias = (t.data_vencimento && t.data_vencimento < hojeISO)
          ? Math.max(0, Math.floor((new Date(hojeISO) - new Date(t.data_vencimento)) / 86400000)) : 0
        const corAtraso = atrasoDias > 0 ? 'text-red-700' : 'text-emerald-700'

        html += '<div class="grid grid-cols-3 gap-2 mb-4">'
        html += '<div class="bg-slate-50 border border-slate-200 rounded p-2"><div class="text-[10px] uppercase text-slate-500">Valor documento</div><div class="text-base font-bold text-slate-800">' + fmtBRL(doc) + '</div></div>'
        html += '<div class="bg-emerald-50 border border-emerald-200 rounded p-2"><div class="text-[10px] uppercase text-emerald-700">Valor pago</div><div class="text-base font-bold text-emerald-800">' + fmtBRL(pago) + '</div></div>'
        html += '<div class="bg-amber-50 border border-amber-200 rounded p-2"><div class="text-[10px] uppercase text-amber-700">Em aberto</div><div class="text-base font-bold text-amber-800">' + fmtBRL(aberto) + '</div>'
        if (atrasoDias > 0) html += '<div class="text-[10px] ' + corAtraso + ' font-semibold">' + atrasoDias + ' dias atraso</div>'
        html += '</div></div>'

        // Ficha do titulo (ordem preferencial -> resto)
        const ordem = [
          'codigo_lancamento', 'numero_titulo', 'numero_documento_fiscal', 'numero_documento', 'numero_parcela', 'numero_pedido',
          'status_titulo', 'operacao', 'bloqueado',
          'data_emissao', 'data_vencimento', 'data_previsao', 'data_pagamento', 'data_registro',
          'valor_documento', 'valor_pago', 'valor_juros', 'valor_multa', 'valor_desconto', 'valor_corrigido',
          'nome_cliente', 'nome_fornecedor', 'codigo_cliente_fornecedor', 'cnpj_cpf', 'conta_omie',
          'grupo_categoria', 'descricao_categoria', 'codigo_categoria',
          'nome_conta_corrente', 'codigo_conta_corrente', 'id_conta_corrente',
          'codigo_projeto', 'codigo_departamento', 'codigo_barras',
          'observacao', 'distribuicao',
          'sincronizado_em', 'criado_em', 'atualizado_em',
        ]
        const existentes = Object.keys(t)
        const ordenado = ordem.filter((k) => existentes.indexOf(k) >= 0)
        const resto = existentes.filter((k) => ordenado.indexOf(k) < 0 && k !== 'id')
        const todos = ordenado.concat(resto)

        html += '<div class="border border-slate-200 rounded overflow-hidden">'
        html += '<div class="bg-slate-100 px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-600 font-semibold">Todos os campos do titulo no Omie</div>'
        html += '<table class="w-full text-xs"><tbody>'
        todos.forEach((k, i) => {
          const rowBg = i % 2 === 0 ? '' : 'bg-slate-50'
          html += '<tr class="border-b border-slate-100 ' + rowBg + '">'
          html += '<td class="px-3 py-1.5 text-slate-600 font-medium w-1/3 align-top">' + rotuloCampo(k) + '<div class="text-[9px] text-slate-400 font-mono">' + k + '</div></td>'
          html += '<td class="px-3 py-1.5 text-slate-800 align-top break-words">' + fmtValor(k, t[k]) + '</td>'
          html += '</tr>'
        })
        html += '</tbody></table></div>'

        // Cadastro do cliente/fornecedor (se houver)
        if (c) {
          html += '<div class="mt-4 border border-slate-200 rounded overflow-hidden">'
          html += '<div class="bg-slate-100 px-3 py-1.5 text-[10px] uppercase tracking-wide text-slate-600 font-semibold">Cadastro do ' + (tipo === 'a_receber' ? 'cliente' : 'fornecedor') + '</div>'
          html += '<table class="w-full text-xs"><tbody>';
          ['razao_social', 'nome_fantasia', 'cnpj_norm', 'cidade', 'estado', 'telefone', 'email', 'endereco', 'bairro', 'cep', 'codigo_cliente_omie', 'conta_omie']
            .filter((k) => c[k] !== undefined && c[k] !== null && c[k] !== '')
            .forEach((k, i) => {
              const rowBg = i % 2 === 0 ? '' : 'bg-slate-50'
              html += '<tr class="border-b border-slate-100 ' + rowBg + '">'
              html += '<td class="px-3 py-1.5 text-slate-600 font-medium w-1/3">' + rotuloCampo(k) + '</td>'
              html += '<td class="px-3 py-1.5 text-slate-800">' + fmtValor(k, c[k]) + '</td>'
              html += '</tr>'
            })
          html += '</tbody></table></div>'
        }

        setModal2Html(html)
      })
      .catch((e) => setModal2Html('<div class="text-red-600 text-sm">Erro: ' + e.message + '</div>'))
  }

  // Delegacao de cliques dentro do modal-body (HTML montado por innerHTML):
  //  - data-drill-item  -> abrirDetalhe(item)  (composicao do patrimonio/balanco)
  //  - data-drill-idx   -> selecionarEntidadeDrill(idx)  (lista completa)
  //  - data-titulo-*    -> abrirTituloDetalhe(tipo, codigo)  (tabela de titulos)
  function onModalBodyClick(ev) {
    const alvoTitulo = ev.target.closest('[data-titulo-codigo]')
    if (alvoTitulo) { abrirTituloDetalhe(alvoTitulo.getAttribute('data-titulo-tipo'), alvoTitulo.getAttribute('data-titulo-codigo')); return }
    const alvoDrill = ev.target.closest('[data-drill-idx]')
    if (alvoDrill) { selecionarEntidadeDrill(parseInt(alvoDrill.getAttribute('data-drill-idx'), 10)); return }
    const alvoItem = ev.target.closest('[data-drill-item]')
    if (alvoItem) { abrirDetalhe(alvoItem.getAttribute('data-drill-item')); return }
  }

  // =========================================================================
  // Snapshot diario / Backfill — port fiel dos handlers da fonte.
  // =========================================================================
  function salvarSnapshot() {
    setSnapBusy(true)
    setSnapStatus('salvando...')
    fetch('/api/dre-financeiro/patrimonio/snapshot', { method: 'POST' })
      .then((r) => r.json()).then((d) => {
        setSnapBusy(false)
        if (d.erro) setSnapStatus('Erro: ' + d.erro)
        else { setSnapStatus('OK - ' + d.data); recarregarHistorico() }
      })
  }
  function reconstruirHistorico() {
    const dias = diasBackfill
    if (!window.confirm('Reconstruir ' + dias + ' dias de historico? Estoque/frota usam valor atual (sem historico real); a_receber e a_pagar serao recalculados das datas de emissao/pagamento.')) return
    setBackfillBusy(true)
    setBackfillStatus('reconstruindo...')
    fetch('/api/dre-financeiro/patrimonio/backfill?dias=' + dias, { method: 'POST' })
      .then((r) => r.json()).then((d) => {
        setBackfillBusy(false)
        if (d.erro) setBackfillStatus('Erro: ' + d.erro)
        else { setBackfillStatus('OK - ' + d.snapshots + ' snapshots criados'); recarregarHistorico() }
      })
  }

  // Recarrega o historico apos snapshot/backfill: incrementa histTick, que e
  // dependencia do efeito principal de carregamento do grafico (redesenha tudo).
  function recarregarHistorico() { setHistTick((t) => t + 1) }

  // --- Gate de permissao (BRIEF item 1) -------------------------------------
  if (!loading && !loadingPerm && userProfile && !temAcesso('financeiro')) return <SemPermissao />

  // --- Valores derivados para os KPIs/cards/ciclo/cobertura -----------------
  const d = dados
  const a = d ? d.ativos : null
  const p = d ? d.passivos : null

  // Cobertura (card do balanco visual)
  const cobertura = d && p && p.a_pagar_aberto > 0 ? d.total_ativos / p.a_pagar_aberto : null
  const corCobertura = cobertura === null ? 'text-slate-500'
    : cobertura > 3 ? 'text-emerald-700'
      : cobertura > 1.5 ? 'text-blue-700'
        : cobertura > 1 ? 'text-amber-600' : 'text-red-700'
  const subCobertura = cobertura === null ? 'sem passivos'
    : cobertura > 3 ? 'folga confortavel'
      : cobertura > 1.5 ? 'saudavel'
        : cobertura > 1 ? 'apertado' : 'descoberto'

  // Barras pseudo-balanco (ativos/passivos) — port fiel
  const compData = a ? [
    { label: 'Pecas', valor: a.estoque_pecas, cor: '#3b82f6' },
    { label: 'Maquinas', valor: a.estoque_maquinas, cor: '#6366f1' },
    { label: 'Frota', valor: a.frota, cor: '#a855f7' },
    { label: 'A receber', valor: a.a_receber_aberto, cor: '#10b981' },
  ].filter((x) => x.valor > 0) : []
  const ativosTotais = d ? d.total_ativos : 0
  const passivosTotais = d ? d.total_passivos : 0
  const maxBar = Math.max(ativosTotais, passivosTotais) || 1

  // Ciclo de caixa
  const ciclo = d ? d.ciclo_caixa : null
  const corCiclo = !ciclo || ciclo.ciclo === null ? 'text-slate-500'
    : ciclo.ciclo < 60 ? 'text-emerald-700'
      : ciclo.ciclo < 120 ? 'text-amber-600' : 'text-red-700'
  // Regua do ciclo
  let reguaPDso = 0, reguaPDio = 0, reguaPDpo = 0, reguaMaxR = 30
  if (ciclo) {
    reguaMaxR = Math.max((ciclo.dso || 0) + (ciclo.dio || 0), ciclo.dpo || 0, 30)
    reguaPDso = 100 * (ciclo.dso || 0) / reguaMaxR
    reguaPDio = 100 * (ciclo.dio || 0) / reguaMaxR
    reguaPDpo = 100 * (ciclo.dpo || 0) / reguaMaxR
  }
  const cicloFonte = ciclo
    ? '(vendas: ' + fmtBRLcurto(ciclo.vendas_90d) + ' / 90d · compras: ' + fmtBRLcurto(ciclo.compras_90d) + ' / 90d' + (ciclo.dpo_fallback ? ' · DPO via emissao' : '') + ')'
    : '(media ultimos 90 dias)'

  // Cobertura de obrigacoes
  const cob = d ? d.cobertura : null

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-semibold text-slate-800">Patrimonio Consolidado</h1>
        <span className="text-xs text-slate-500 ml-2">Snapshot atual</span>
        <button onClick={salvarSnapshot} disabled={snapBusy}
          className="ml-auto px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-60">Salvar snapshot diario</button>
        <span className="text-xs text-slate-500">{snapStatus}</span>
      </div>

      {/* Patrimonio operacional - destaque */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-lg p-6 mb-6 text-white cursor-pointer hover:from-slate-700 hover:to-slate-600 transition"
        onClick={() => abrirDetalhe('patrimonio')}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-300">Patrimonio operacional</div>
            <div className="text-4xl font-bold mt-1">{d ? fmtBRL(d.patrimonio_operacional) : '--'}</div>
            <div className="text-sm text-slate-300 mt-1">
              Ativos <span>{d ? fmtBRL(d.total_ativos) : '--'}</span> &middot; Passivos <span>{d ? fmtBRL(d.total_passivos) : '--'}</span>
            </div>
          </div>
          <div className="text-slate-400 text-xs">clique para detalhes ▶</div>
        </div>
      </div>

      {/* Cards: 4 ativos + 1 passivo (clicaveis -> abrem popup) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4 cursor-pointer hover:border-blue-400 hover:shadow transition" onClick={() => abrirDetalhe('pecas')}>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Estoque pecas</div>
          <div className="text-xl font-bold text-blue-700 mt-1">{a ? fmtBRL(a.estoque_pecas) : '--'}</div>
          <div className="text-xs text-slate-500">{a ? pct(a.estoque_pecas, d.total_ativos) : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4 cursor-pointer hover:border-indigo-400 hover:shadow transition" onClick={() => abrirDetalhe('maquinas')}>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Estoque maquinas</div>
          <div className="text-xl font-bold text-indigo-700 mt-1">{a ? fmtBRL(a.estoque_maquinas) : '--'}</div>
          <div className="text-xs text-slate-500">{a ? pct(a.estoque_maquinas, d.total_ativos) : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4 cursor-pointer hover:border-purple-400 hover:shadow transition" onClick={() => abrirDetalhe('frota')}>
          <div className="text-xs text-slate-500 uppercase tracking-wide">Frota (compartilhada)</div>
          <div className="text-xl font-bold text-purple-700 mt-1">{a ? fmtBRL(a.frota) : '--'}</div>
          <div className="text-xs text-slate-500">{a ? pct(a.frota, d.total_ativos) : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4 cursor-pointer hover:border-emerald-400 hover:shadow transition" onClick={() => abrirDetalhe('a_receber')}>
          <div className="text-xs text-slate-500 uppercase tracking-wide">A receber em aberto</div>
          <div className="text-xl font-bold text-emerald-700 mt-1">{a ? fmtBRL(a.a_receber_aberto) : '--'}</div>
          <div className="text-xs text-slate-500">{a ? pct(a.a_receber_aberto, d.total_ativos) : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4 cursor-pointer hover:border-red-400 hover:shadow transition" onClick={() => abrirDetalhe('a_pagar')}>
          <div className="text-xs text-slate-500 uppercase tracking-wide">A pagar em aberto</div>
          <div className="text-xl font-bold text-red-700 mt-1">{p ? fmtBRL(p.a_pagar_aberto) : '--'}</div>
          <div className="text-xs text-slate-500">passivo &middot; clique p/ detalhes</div>
        </div>
      </div>

      {/* Composicao + linha pseudo balanco */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Composicao dos ativos</div>
          <div style={{ position: 'relative', height: 280 }}>
            <canvas ref={compRef} />
          </div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4 cursor-pointer hover:border-slate-400 hover:shadow transition"
          onClick={() => abrirDetalhe('balanco')} title="Clique p/ ver o balanco detalhado">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-slate-500 uppercase tracking-wide">Balanco visual</div>
            <div className="text-[10px] text-slate-400">clique p/ detalhes ▶</div>
          </div>
          <div className="text-xs text-slate-600 mb-1">Ativos</div>
          <div className="flex h-6 rounded overflow-hidden bg-slate-100 mb-3">
            {compData.length ? compData.map((x, i) => (
              <div key={i} style={{ width: (100 * x.valor / maxBar) + '%', background: x.cor }} title={x.label + ': ' + fmtBRL(x.valor)} />
            )) : <div className="text-xs text-slate-500 p-1">Sem ativos</div>}
          </div>
          <div className="text-xs text-slate-600 mb-1">Passivos</div>
          <div className="flex h-6 rounded overflow-hidden bg-slate-100 mb-3">
            {passivosTotais > 0
              ? <div className="bg-red-500" style={{ width: (100 * passivosTotais / maxBar) + '%' }} title={'A pagar: ' + fmtBRL(passivosTotais)} />
              : <div className="text-xs text-slate-500 p-1">Sem passivos</div>}
          </div>
          <div className="text-xs text-slate-600 mb-1">Cobertura (Ativos / Passivos)</div>
          <div className={'text-2xl font-bold ' + corCobertura}>{cobertura === null ? '--' : cobertura.toFixed(2) + 'x'}</div>
          <div className="text-xs text-slate-500">{d ? subCobertura : '--'}</div>
        </div>
      </div>

      {/* Ciclo de Caixa */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
        <div className="flex items-baseline gap-3 mb-3">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Ciclo de Caixa</div>
          <div className="text-xs text-slate-400">{cicloFonte}</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="border border-emerald-200 bg-emerald-50 rounded p-3 cursor-help" title={'DSO — Days Sales Outstanding (dias de venda em aberto).\nEm media, quantos dias voce demora pra receber das vendas que faz.\nFormula: (A receber em aberto) / (vendas medias por dia nos ultimos 90 dias).\nMenor = melhor (clientes pagando mais rapido).'}>
            <div className="text-xs text-emerald-800 uppercase tracking-wide">DSO <span className="text-emerald-600">ⓘ</span></div>
            <div className="text-xl font-bold text-emerald-900 mt-1">{ciclo && ciclo.dso !== null ? ciclo.dso + 'd' : '--'}</div>
            <div className="text-[10px] text-emerald-700">dias para receber</div>
          </div>
          <div className="border border-blue-200 bg-blue-50 rounded p-3 cursor-help" title={'DIO — Days Inventory Outstanding (dias de estoque).\nEm media, quantos dias o estoque dura ate ser vendido.\nFormula: (Estoque pecas + maquinas) / (vendas medias por dia nos ultimos 90 dias).\nMenor = giro mais rapido. Estoque parado = capital amarrado.'}>
            <div className="text-xs text-blue-800 uppercase tracking-wide">DIO <span className="text-blue-600">ⓘ</span></div>
            <div className="text-xl font-bold text-blue-900 mt-1">{ciclo && ciclo.dio !== null ? ciclo.dio + 'd' : '--'}</div>
            <div className="text-[10px] text-blue-700">dias de estoque</div>
          </div>
          <div className="border border-red-200 bg-red-50 rounded p-3 cursor-help" title={'DPO — Days Payable Outstanding (dias de pagamento em aberto).\nEm media, quantos dias voce demora pra pagar os fornecedores.\nFormula: (A pagar em aberto) / (compras medias por dia nos ultimos 90 dias).\nMaior = mais prazo dos fornecedores (bom p/ caixa, ate certo limite).'}>
            <div className="text-xs text-red-800 uppercase tracking-wide">DPO <span className="text-red-600">ⓘ</span></div>
            <div className="text-xl font-bold text-red-900 mt-1">{ciclo && ciclo.dpo !== null ? ciclo.dpo + 'd' : '--'}</div>
            <div className="text-[10px] text-red-700">dias para pagar</div>
          </div>
          <div className="border border-slate-300 bg-slate-100 rounded p-3 cursor-help" title={'Ciclo de Caixa (Cash Conversion Cycle).\nDias entre voce pagar a mercadoria/insumo e receber dos clientes.\nFormula: DSO + DIO − DPO.\nMenor = dinheiro retorna mais rapido. Negativo = clientes pagam antes dos fornecedores (excelente, raro fora de varejo).\nGeral: < 60d folgado, 60-120d normal, > 120d apertado.'}>
            <div className="text-xs text-slate-700 uppercase tracking-wide">Ciclo <span className="text-slate-500">ⓘ</span></div>
            <div className={'text-xl font-bold mt-1 ' + corCiclo}>{ciclo && ciclo.ciclo !== null ? ciclo.ciclo + 'd' : '--'}</div>
            <div className="text-[10px] text-slate-600">DSO + DIO &minus; DPO</div>
          </div>
        </div>
        {/* Regua visual: DSO + DIO em cima, DPO subtraindo abaixo */}
        <div className="text-xs text-slate-600 mb-1">Linha do tempo do dinheiro (dias)</div>
        <div className="flex h-7 rounded overflow-hidden bg-slate-100 mb-1">
          {ciclo && (
            <>
              <div className="bg-emerald-400 flex items-center justify-center text-[10px] text-white font-bold" style={{ width: reguaPDso + '%' }} title={'DSO: ' + ciclo.dso + ' dias'}>{reguaPDso > 5 ? 'DSO ' + ciclo.dso : ''}</div>
              <div className="bg-blue-400 flex items-center justify-center text-[10px] text-white font-bold" style={{ width: reguaPDio + '%' }} title={'DIO: ' + ciclo.dio + ' dias'}>{reguaPDio > 5 ? 'DIO ' + ciclo.dio : ''}</div>
              <div className="bg-red-400 flex items-center justify-center text-[10px] text-white font-bold" style={{ width: reguaPDpo + '%', marginLeft: 'auto' }} title={'DPO: -' + ciclo.dpo + ' dias (subtrai)'}>{reguaPDpo > 5 ? '−DPO ' + ciclo.dpo : ''}</div>
            </>
          )}
        </div>
        <div className="flex justify-between text-[10px] text-slate-500">
          {ciclo && (
            <>
              <span>0d</span>
              <span className="font-semibold">Ciclo = {ciclo.ciclo !== null ? ciclo.ciclo + 'd' : '--'}</span>
              <span>{Math.round(reguaMaxR)}d</span>
            </>
          )}
        </div>
      </div>

      {/* Cobertura de obrigacoes */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
        <div className="flex items-baseline gap-3 mb-3">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Cobertura de obrigacoes</div>
          <div className="text-xs text-slate-400">(a receber vs a pagar por janela)</div>
        </div>
        <div className="text-xs text-slate-600 mb-3">
          {cob && (
            <>Ja vencidos em aberto: <b className="text-red-700">{fmtBRL(cob.vencido_pagar)}</b> a pagar &middot; <b className="text-emerald-700">{fmtBRL(cob.vencido_receber)}</b> a receber</>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cob && cob.janelas.map((j, i) => {
            const cor = j.classificacao === 'confortavel' ? 'border-emerald-300 bg-emerald-50' :
              j.classificacao === 'saudavel' ? 'border-blue-300 bg-blue-50' :
                j.classificacao === 'apertado' ? 'border-amber-300 bg-amber-50' :
                  j.classificacao === 'descoberto' ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'
            const corCob = j.classificacao === 'descoberto' ? 'text-red-700' :
              j.classificacao === 'apertado' ? 'text-amber-700' :
                j.classificacao === 'saudavel' ? 'text-blue-700' :
                  j.classificacao === 'confortavel' ? 'text-emerald-700' : 'text-slate-700'
            const saldoCor = j.saldo_liquido >= 0 ? 'text-emerald-700' : 'text-red-700'
            return (
              <div key={i} className={'border ' + cor + ' rounded p-3'}>
                <div className="text-xs uppercase tracking-wide text-slate-600">Ate {j.dias} dias</div>
                <div className={'text-2xl font-bold ' + corCob + ' mt-1'}>{j.cobertura !== null ? j.cobertura + 'x' : 'n/a'}</div>
                <div className="text-[10px] capitalize text-slate-500">{j.classificacao.replace('_', ' ')}</div>
                <div className="text-xs mt-2"><span className="text-emerald-700">+ {fmtBRLcurto(j.a_receber_total)}</span> / <span className="text-red-700">− {fmtBRLcurto(j.a_pagar_total)}</span></div>
                <div className={'text-xs font-semibold ' + saldoCor + ' mt-0.5'}>saldo: {fmtBRLcurto(j.saldo_liquido)}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Historico */}
      <div className="bg-white rounded-lg border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Evolucao historica</div>
          <div className="flex items-center gap-2">
            <select value={diasHist} onChange={(e) => setDiasHist(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-xs">
              <option value="30">30 dias</option>
              <option value="90">90 dias</option>
              <option value="180">180 dias</option>
              <option value="365">365 dias</option>
              <option value="730">2 anos</option>
            </select>
            <select value={diasBackfill} onChange={(e) => setDiasBackfill(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-xs">
              <option value="30">Backfill 30d</option>
              <option value="90">Backfill 90d</option>
              <option value="180">Backfill 180d</option>
              <option value="365">Backfill 1 ano</option>
              <option value="730">Backfill 2 anos</option>
            </select>
            <button onClick={reconstruirHistorico} disabled={backfillBusy}
              className="px-3 py-1 bg-purple-600 text-white text-xs rounded hover:bg-purple-700 disabled:opacity-60"
              title="Cria snapshots historicos retroativos. Estoque/frota usam valor atual; a_receber/a_pagar sao reconstruidos das datas de emissao/pagamento.">Reconstruir historico</button>
            <span className="text-xs text-slate-500">{backfillStatus}</span>
          </div>
        </div>
        <div style={{ position: 'relative', height: 360, display: histVazio ? 'none' : undefined }}>
          <canvas ref={histRef} />
        </div>
        {histVazio && (
          <div className="text-center text-slate-500 text-sm py-8">
            Sem snapshots ainda. Clique em &quot;Reconstruir historico&quot; para criar snapshots retroativos baseados nos dados de contas_pagar/receber existentes.
          </div>
        )}
      </div>

      {/* Modal de detalhes (1o nivel) */}
      {modalAberto && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={fecharModal} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[85vh] bg-white rounded-lg shadow-2xl z-50 flex flex-col">
            <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">{modalTitulo}</h2>
              <button onClick={fecharModal} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">×</button>
            </div>
            <div className="p-5 overflow-y-auto" onClick={onModalBodyClick}>
              {modalCorpo.tipo === 'carregando' && <div className="text-slate-500 text-sm">Carregando...</div>}
              {modalCorpo.tipo === 'html' && <div dangerouslySetInnerHTML={{ __html: modalCorpo.html }} />}
              {modalCorpo.tipo === 'drill' && drillView && (
                <>
                  <div dangerouslySetInnerHTML={{ __html: drillView.headerHtml }} />
                  <div className="bg-white border border-slate-200 rounded p-2 mb-3" style={{ position: 'relative', height: drillView.alturaChart }}>
                    <canvas ref={drillRef} />
                  </div>
                  {drillView.listaHtml && <div dangerouslySetInnerHTML={{ __html: drillView.listaHtml }} />}
                  <div className="mt-3" dangerouslySetInnerHTML={{ __html: drillDetalheHtml }} />
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Modal 2o nivel: detalhe de um titulo especifico (z-index maior) */}
      {modal2Aberto && (
        <>
          <div className="fixed inset-0 bg-black/50 z-[60]" onClick={fecharModal2} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl max-h-[85vh] bg-white rounded-lg shadow-2xl z-[70] flex flex-col">
            <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="font-semibold text-slate-800">{modal2Titulo}</h2>
                <div className="text-xs text-slate-500 mt-0.5" dangerouslySetInnerHTML={{ __html: modal2Subtitulo }} />
              </div>
              <button onClick={fecharModal2} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">×</button>
            </div>
            <div className="p-5 overflow-y-auto" dangerouslySetInnerHTML={{ __html: modal2Html }} />
          </div>
        </>
      )}
    </>
  )
}
