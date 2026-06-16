'use client'
// =============================================================================
// Tela Pontualidade / Aderencia (port FIEL de views/aderencia.ejs do
// financeiro-omie-dashboard). Realizado vs Previsto: compara data_vencimento vs
// data_pagamento para medir previsibilidade.
//
// Mantem EXATAMENTE os calculos e o comportamento observavel do original:
//  - Toolbar: titulo + Janela (30/90/180/365/540/730 dias) + Granularidade
//    (Mes / Semana). Na fonte, trocar gran/dias recarregava a pagina (?gran=&dias=);
//    aqui sao estado local re-aplicado pelo efeito de fetch (mesmo resultado).
//  - 5 KPIs: Pontualidade (aderencia %), Atraso medio, % no prazo, % atrasados,
//    R$ atrasado (+ nao pago). Cores condicionais identicas a fonte.
//  - Barra de distribuicao empilhada (No prazo / Antecipado / Atrasado / Nao pago)
//    + legenda, com as mesmas cores/percentuais/contagens da fonte.
//  - Grafico (Chart.js 4.4.0): barras Previsto x Realizado (eixo y, R$) + linha
//    de Atraso medio (eixo y1, dias). Mesmo dataset/cores/tooltips da fonte.
//  - Tabela "Top desvios": ordenacao client-side por coluna (mesma logica de
//    desviosAtuais/ordemAtual da fonte: numericos comecam desc, textuais asc).
//
// A fonte lia o tipo (pagar/receber/ambos) do toggle da header global. No portal
// o layout do modulo so traz o seletor de CONTA, entao replicamos o toggle de
// TIPO local nesta tela (mesmo padrao da tela "vencidos" ja portada). Default
// 'pagar' (TIPO_PADRAO da fonte). A CONTA vem do seletor compartilhado via
// useDreConta.
//
// Chart.js 4.4.0 e carregado via CDN (mesma lib/versao da fonte) num <script>
// dinamico; o grafico usa ref/canvas imperativo. KPIs/distribuicao/tabela sao
// React/JSX.
//
// O layout do modulo (.../dre-financeiro/layout.js) ja aplica o gate de permissao
// 'financeiro' e a sub-nav; ainda assim importamos useAuth/usePermissoes e
// SemPermissao por consistencia com o padrao do portal.
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta } from '@/lib/dre-financeiro/format'

// ---------------------------------------------------------------------------
// Formatadores locais (identicos aos do <script> da fonte). Mantidos inline para
// preservar EXATAMENTE o arredondamento usado nos labels do grafico/KPIs.
// (fmtBRLcurto aqui usa a variante da fonte: >=1k => "R$ Nk" sem casa decimal.)
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
function fmtBRdata(iso) {
  if (!iso) return '-'
  const p = String(iso).slice(0, 10).split('-')
  return p[2] + '/' + p[1] + '/' + p[0]
}

// fmtRotulo: YYYY-MM -> MM/YYYY ; YYYY-Www -> "YYYY / Sww" (port fiel da fonte).
function fmtRotulo(s) {
  if (/^\d{4}-W\d{2}$/.test(s)) return s.replace('-W', ' / S')
  if (/^\d{4}-\d{2}$/.test(s)) return s.slice(5) + '/' + s.slice(0, 4)
  return s
}

// Classe utilitaria do toggle inativo (espelha o estilo da header.ejs/vencidos).
const inativoToggle = 'bg-white text-slate-700 hover:bg-slate-100'

// ---------------------------------------------------------------------------
// Carregamento da lib de grafico (Chart.js 4.4.0) via CDN, uma unica vez.
// Mesma lib/versao da fonte (aderencia.ejs).
// ---------------------------------------------------------------------------
let chartLibPromise = null
function carregarChartLibs() {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.Chart) return Promise.resolve()
  if (chartLibPromise) return chartLibPromise
  const src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
  chartLibPromise = new Promise((resolve, reject) => {
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
  return chartLibPromise
}

export default function AderenciaPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  // --- Estado de controles (espelha as vars do IIFE da fonte) ----------------
  // tipo: na fonte vinha da header global; aqui e toggle local. Default 'pagar'.
  // dias/gran: na fonte vinham do servidor (default 180 / 'mes') e trocar
  // recarregava a pagina; aqui sao estado local re-aplicado pelo efeito de fetch.
  const [tipo, setTipo] = useState('pagar')   // 'pagar' | 'receber' | 'ambos'
  const [dias, setDias] = useState(180)       // janela (re-busca)
  const [gran, setGran] = useState('mes')     // 'mes' | 'semana' (re-busca)

  // --- Dados ----------------------------------------------------------------
  const [dados, setDados] = useState(null)    // resposta de /aderencia
  const [chartReady, setChartReady] = useState(false)

  // --- Ordenacao da tabela de desvios (port fiel de ordemAtual) -------------
  const [ordem, setOrdem] = useState({ campo: 'valor', dir: 'desc' })

  // Refs do grafico
  const chartRef = useRef(null)
  const chartInst = useRef(null)

  // Carrega a lib uma vez.
  useEffect(() => {
    carregarChartLibs().then(() => setChartReady(true)).catch(() => setChartReady(false))
  }, [])

  // =========================================================================
  // carregar(): busca aderencia. Port fiel da funcao homonima da fonte.
  // Monta de/ate (ate = hoje, de = hoje - dias) e re-busca quando
  // conta / tipo / dias / gran mudam.
  // =========================================================================
  useEffect(() => {
    const hojeISO = new Date().toISOString().slice(0, 10)
    const d = new Date()
    d.setDate(d.getDate() - dias)
    const deISO = d.toISOString().slice(0, 10)
    const qs = 'conta=' + conta + '&tipo=' + tipo + '&gran=' + gran + '&de=' + deISO + '&ate=' + hojeISO

    fetch('/api/dre-financeiro/aderencia?' + qs)
      .then((r) => r.json())
      .then((resp) => {
        if (resp.erro) { alert('Erro: ' + resp.erro); return }
        setDados(resp)
      })
      .catch((e) => { alert('Erro: ' + e.message) })
  }, [conta, tipo, dias, gran])

  // =========================================================================
  // Render do grafico (Chart.js). Port fiel do bloco "Grafico previsto x
  // realizado por bucket" da fonte. Reage a dados / chartReady.
  // =========================================================================
  useEffect(() => {
    if (!chartReady || !dados || !chartRef.current || !window.Chart) return

    const buckets = dados.buckets || []
    const labels = buckets.map((b) => fmtRotulo(b.rotulo))
    const prev = buckets.map((b) => b.previsto)
    const real = buckets.map((b) => b.realizado)
    const atrasos = buckets.map((b) => b.atraso_medio_dias)

    if (chartInst.current) chartInst.current.destroy()
    const ctx = chartRef.current.getContext('2d')
    chartInst.current = new window.Chart(ctx, {
      data: {
        labels: labels,
        datasets: [
          { type: 'bar', label: 'Previsto', data: prev, backgroundColor: 'rgba(100,116,139,0.6)', borderColor: '#475569', yAxisID: 'y' },
          { type: 'bar', label: 'Realizado', data: real, backgroundColor: 'rgba(16,185,129,0.7)', borderColor: '#059669', yAxisID: 'y' },
          { type: 'line', label: 'Atraso medio (d)', data: atrasos, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 2, pointRadius: 3, tension: 0.2, yAxisID: 'y1', spanGaps: true },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: { position: 'left', title: { display: true, text: 'Valor R$' }, ticks: { callback: function (v) { return fmtBRLcurto(v) } } },
          y1: { position: 'right', title: { display: true, text: 'Atraso (d)' }, grid: { drawOnChartArea: false } },
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: function (item) {
                if (item.dataset.label === 'Atraso medio (d)') {
                  return 'Atraso medio: ' + (item.raw === null ? '--' : item.raw + ' dias')
                }
                return item.dataset.label + ': ' + fmtBRL(item.raw)
              },
            },
          },
        },
      },
    })

    // Limpa a instancia ao desmontar / antes de re-renderizar.
    return () => {
      if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartReady, dados])

  // =========================================================================
  // Ordenacao da tabela de desvios (port fiel de renderTabelaDesvios + o
  // listener de clique do thead). Numericos comecam desc, textuais asc.
  // =========================================================================
  function clicarOrdenacao(campo) {
    setOrdem((o) => {
      if (o.campo === campo) {
        return { campo, dir: o.dir === 'asc' ? 'desc' : 'asc' }
      }
      const numericos = ['valor', 'atraso_dias']
      return { campo, dir: numericos.indexOf(campo) >= 0 ? 'desc' : 'asc' }
    })
  }

  // Indicador de ordenacao no cabecalho (▲ / ▼ no campo ativo, ⇅ nos demais).
  function indicador(campo) {
    if (ordem.campo === campo) {
      return <span className="sort-ind text-slate-700">{ordem.dir === 'asc' ? '▲' : '▼'}</span>
    }
    return <span className="sort-ind text-slate-300">⇅</span>
  }

  // --- Estado de gate de permissao (BRIEF item 1) ---------------------------
  if (!loading && !loadingPerm && userProfile && !temAcesso('financeiro')) return <SemPermissao />

  // --- Derivados (port fiel do bloco de KPIs / distribuicao da fonte) -------
  const t = (dados && dados.totais) || null

  // KPI Pontualidade (aderencia)
  let kpiAderencia = '--', corAderencia = 'text-2xl font-bold mt-1'
  let kpiAderenciaSub = 'realizado / previsto'
  if (t) {
    const corAd = (t.aderencia_pct >= 95) ? 'text-emerald-700' : (t.aderencia_pct >= 80 ? 'text-amber-600' : 'text-red-700')
    kpiAderencia = t.aderencia_pct.toFixed(1) + '%'
    corAderencia = 'text-2xl font-bold mt-1 ' + corAd
    kpiAderenciaSub = fmtBRL(t.realizado) + ' / ' + fmtBRL(t.previsto)
  }

  // KPI Atraso medio
  let kpiAtraso = '--', corAtraso = 'text-2xl font-bold mt-1'
  if (t) {
    const corAt = (t.atraso_medio_dias === null)
      ? 'text-slate-500'
      : (t.atraso_medio_dias > 2 ? 'text-red-700' : (t.atraso_medio_dias < -2 ? 'text-blue-700' : 'text-emerald-700'))
    kpiAtraso = (t.atraso_medio_dias === null ? '--' : (t.atraso_medio_dias > 0 ? '+' : '') + t.atraso_medio_dias + ' d')
    corAtraso = 'text-2xl font-bold mt-1 ' + corAt
  }

  // KPI % no prazo / % atrasados
  const kpiNoPrazo = t ? t.no_prazo_pct.toFixed(1) + '%' : '--'
  const kpiNoPrazoSub = t ? t.no_prazo + ' titulos' : 'titulos'
  const kpiAtrasado = t ? t.atrasado_pct.toFixed(1) + '%' : '--'
  const kpiAtrasadoSub = t ? t.atrasado + ' titulos' : 'titulos'

  // KPI R$ atrasado (+ nao pago)
  let kpiValorAtrasado = '--', kpiValorAtrasadoSub = '+ nao pago'
  if (t) {
    const vAtrasado = (t.valor_atrasado || 0) + (t.valor_nao_pago || 0)
    kpiValorAtrasado = fmtBRL(vAtrasado)
    const subAtr = []
    if (t.valor_atrasado) subAtr.push(fmtBRLcurto(t.valor_atrasado) + ' atrasado')
    if (t.valor_nao_pago) subAtr.push(fmtBRLcurto(t.valor_nao_pago) + ' nao pago')
    kpiValorAtrasadoSub = subAtr.join(' + ') || '-'
  }

  // Distribuicao empilhada (port fiel do array "classes" da fonte)
  const classesDist = t ? [
    { key: 'no_prazo_pct', label: 'No prazo', cor: 'bg-emerald-500', txt: 'text-emerald-700', count: t.no_prazo },
    { key: 'antecipado_pct', label: 'Antecipado', cor: 'bg-blue-500', txt: 'text-blue-700', count: t.antecipado },
    { key: 'atrasado_pct', label: 'Atrasado', cor: 'bg-red-500', txt: 'text-red-700', count: t.atrasado },
    { key: 'nao_pago_pct', label: 'Nao pago', cor: 'bg-slate-500', txt: 'text-slate-700', count: t.nao_pago },
  ] : []

  // Lista de desvios ordenada (port fiel de renderTabelaDesvios)
  const desvios = (dados && dados.top_desvios) ? dados.top_desvios.slice() : []
  {
    const c = ordem.campo
    const dir = ordem.dir === 'asc' ? 1 : -1
    desvios.sort((a, b) => {
      let va = a[c], vb = b[c]
      if (va === null || va === undefined) va = ''
      if (vb === null || vb === undefined) vb = ''
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * dir
    })
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-semibold text-slate-800">Pontualidade · Realizado vs Previsto</h1>

        {/* Toggle de TIPO (replicado da header global da fonte) */}
        <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm ml-2" role="group">
          <button type="button" onClick={() => setTipo('pagar')}
            className={'px-3 py-1 transition ' + (tipo === 'pagar' ? 'bg-red-600 text-white' : inativoToggle)}>A Pagar</button>
          <button type="button" onClick={() => setTipo('receber')}
            className={'px-3 py-1 transition border-l border-slate-300 ' + (tipo === 'receber' ? 'bg-emerald-600 text-white' : inativoToggle)}>A Receber</button>
          <button type="button" onClick={() => setTipo('ambos')}
            className={'px-3 py-1 transition border-l border-slate-300 ' + (tipo === 'ambos' ? 'bg-slate-800 text-white' : inativoToggle)}>Ambos</button>
        </div>

        <span className="text-xs text-slate-500 ml-4">Janela:</span>
        <select value={dias} onChange={(e) => setDias(parseInt(e.target.value, 10))}
          className="border border-slate-300 rounded px-2 py-1 text-sm">
          <option value={30}>Ult. 30 dias</option>
          <option value={90}>Ult. 90 dias</option>
          <option value={180}>Ult. 6 meses</option>
          <option value={365}>Ult. 12 meses</option>
          <option value={540}>Ult. 18 meses</option>
          <option value={730}>Ult. 24 meses</option>
        </select>

        <span className="text-xs text-slate-500 ml-2">Granularidade:</span>
        <div className="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm">
          <button type="button" onClick={() => setGran('mes')}
            className={'px-3 py-1 transition ' + (gran === 'mes' ? 'bg-slate-800 text-white' : inativoToggle)}>Mes</button>
          <button type="button" onClick={() => setGran('semana')}
            className={'px-3 py-1 transition border-l border-slate-300 ' + (gran === 'semana' ? 'bg-slate-800 text-white' : inativoToggle)}>Semana</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Pontualidade</div>
          <div className={corAderencia}>{kpiAderencia}</div>
          <div className="text-xs text-slate-500">{kpiAderenciaSub}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Atraso medio</div>
          <div className={corAtraso}>{kpiAtraso}</div>
          <div className="text-xs text-slate-500">dias (ponderado por valor)</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">% no prazo</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{kpiNoPrazo}</div>
          <div className="text-xs text-slate-500">{kpiNoPrazoSub}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">% atrasados</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{kpiAtrasado}</div>
          <div className="text-xs text-slate-500">{kpiAtrasadoSub}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">R$ atrasado</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{kpiValorAtrasado}</div>
          <div className="text-xs text-slate-500">{kpiValorAtrasadoSub}</div>
        </div>
      </div>

      {/* Distribuicao empilhada */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6">
        <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">Distribuicao geral por classificacao</div>
        <div className="flex h-6 rounded overflow-hidden bg-slate-100">
          {classesDist.map((c) => {
            const pct = (t && t[c.key]) || 0
            if (pct <= 0) return null
            return (
              <div key={c.key} className={c.cor + ' h-full'} style={{ width: pct + '%' }}
                title={c.label + ': ' + pct.toFixed(1) + '%'} />
            )
          })}
        </div>
        <div className="flex gap-4 text-xs mt-2 text-slate-600 flex-wrap">
          {classesDist.map((c) => {
            const pct = (t && t[c.key]) || 0
            return (
              <span key={c.key} className="flex items-center gap-1">
                <span className={'inline-block w-3 h-3 rounded-sm ' + c.cor} />
                <span className={c.txt + ' font-medium'}>{c.label}</span>
                <span className="text-slate-500">{pct.toFixed(1) + '% (' + c.count + ')'}</span>
              </span>
            )
          })}
        </div>
      </div>

      {/* Grafico previsto vs realizado */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <canvas ref={chartRef} height="120" />
      </div>

      {/* Top desvios */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase">
          Top desvios (maior atraso x valor)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 select-none">
              <tr>
                <th className="text-left px-4 py-2 cursor-pointer hover:bg-slate-100" onClick={() => clicarOrdenacao('tipo')}>Tipo {indicador('tipo')}</th>
                <th className="text-left px-4 py-2 cursor-pointer hover:bg-slate-100" onClick={() => clicarOrdenacao('nome')}>Terceiro {indicador('nome')}</th>
                <th className="text-left px-4 py-2 cursor-pointer hover:bg-slate-100" onClick={() => clicarOrdenacao('nf')}>NF {indicador('nf')}</th>
                <th className="text-left px-4 py-2 cursor-pointer hover:bg-slate-100" onClick={() => clicarOrdenacao('vencimento')}>Vencimento {indicador('vencimento')}</th>
                <th className="text-left px-4 py-2 cursor-pointer hover:bg-slate-100" onClick={() => clicarOrdenacao('pagamento')}>Pagamento {indicador('pagamento')}</th>
                <th className="text-right px-4 py-2 cursor-pointer hover:bg-slate-100" onClick={() => clicarOrdenacao('atraso_dias')}>Atraso (dias) {indicador('atraso_dias')}</th>
                <th className="text-right px-4 py-2 cursor-pointer hover:bg-slate-100" onClick={() => clicarOrdenacao('valor')}>Valor {indicador('valor')}</th>
              </tr>
            </thead>
            <tbody>
              {desvios.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-500">Sem desvios relevantes no periodo.</td></tr>
              ) : (
                desvios.map((dv, i) => {
                  const corTipo = dv.tipo === 'receber' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                  const corAtr = dv.atraso_dias > 0 ? 'text-red-700 font-semibold' : 'text-blue-700 font-semibold'
                  return (
                    <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <span className={'inline-block px-2 py-0.5 rounded text-xs ' + corTipo}>{dv.tipo === 'receber' ? 'Receber' : 'Pagar'}</span>
                      </td>
                      <td className="px-4 py-2">{dv.nome || <span className="text-slate-400">Sem nome</span>}</td>
                      <td className="px-4 py-2 text-slate-600 font-mono text-xs">{dv.nf || <span className="text-slate-300">-</span>}</td>
                      <td className="px-4 py-2 text-slate-600">{fmtBRdata(dv.vencimento)}</td>
                      <td className="px-4 py-2 text-slate-600">{fmtBRdata(dv.pagamento)}</td>
                      <td className={'px-4 py-2 text-right ' + corAtr}>{(dv.atraso_dias > 0 ? '+' : '') + dv.atraso_dias}</td>
                      <td className="px-4 py-2 text-right font-medium">{fmtBRL(dv.valor)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
