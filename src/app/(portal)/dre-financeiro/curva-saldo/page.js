'use client'
// =============================================================================
// Tela Curva de Saldo (port FIEL de views/curva-saldo.ejs do
// financeiro-omie-dashboard).
//
// Mantem EXATAMENTE os calculos e o comportamento do original:
//  - Toolbar: saldo inicial (number) + janela (30/60/90/180/365 dias) + Aplicar.
//  - 5 KPIs: saldo final, saldo minimo (+ data), total entradas, total saidas,
//    dias negativos. Cores condicionais identicas a fonte.
//  - Alerta de saldo negativo (primeiro dia negativo) quando houver.
//  - Grafico (Chart.js + adapter date-fns): linha do saldo acumulado (eixo y)
//    + barras de entradas/saidas do dia (eixo y1, saidas negativas). Clique numa
//    barra/ponto abre o modal dos titulos daquele dia.
//  - Tabela "Dias com movimento": so dias com entrada/saida; cada linha abre o
//    modal do dia (mesma logica/filtro da curva).
//  - Modal de titulos do dia: busca /titulos?tipo=ambos&data=..., filtra aberto>0,
//    ordena por valor desc, monta resumo (entradas/saidas/saldo) + cards por titulo
//    com badge de status. Esc fecha. Tudo port fiel do innerHTML da fonte.
//
// Na fonte, "Aplicar" recarregava a pagina com ?dias=&inicial= so para re-rodar
// carregar(); aqui dias/inicial sao estado local e o efeito re-busca — mesmo
// comportamento observavel. A conta vem do seletor compartilhado (layout do
// modulo) via useDreConta.
//
// Chart.js 4.4.0 + chartjs-adapter-date-fns sao carregados via CDN (mesmas libs
// da fonte) num <script> dinamico; o grafico usa ref/canvas imperativo. KPIs/
// alerta/tabela/modal sao React/JSX.
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
// Formatadores locais (identicos aos do <script> da fonte). Mantidos inline para
// preservar EXATAMENTE o arredondamento usado nos labels do grafico/KPIs.
// ---------------------------------------------------------------------------
function fmtBRL(n) {
  const v = Number(n) || 0
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
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
  if (!iso) return ''
  const p = iso.split('-')
  return p[2] + '/' + p[1] + '/' + p[0]
}

// ---------------------------------------------------------------------------
// Badge de status (port fiel de statusBadge). Devolve { label, classes }.
// ---------------------------------------------------------------------------
function statusBadge(s) {
  const map = {
    LIQUIDADO: ['Pago', 'bg-emerald-100 text-emerald-800'],
    VENCIDO: ['Vencido', 'bg-red-100 text-red-800'],
    A_VENCER_PROXIMO: ['Proximo', 'bg-blue-100 text-blue-800'],
    A_VENCER: ['A vencer', 'bg-amber-100 text-amber-800'],
    PARCIAL: ['Parcial', 'bg-orange-100 text-orange-800'],
  }
  const v = map[s] || [s, 'bg-slate-100 text-slate-700']
  return { label: v[0], classes: v[1] }
}

// ---------------------------------------------------------------------------
// Carregamento das libs de grafico (Chart.js + adapter date-fns) via CDN, uma
// unica vez. Mesmas libs/versoes da fonte (curva-saldo.ejs).
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
    .then(() => addScript('https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns/dist/chartjs-adapter-date-fns.bundle.min.js'))
  return chartLibPromise
}

export default function CurvaSaldoPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  // --- Estado de controles (espelha as vars do IIFE da fonte) ----------------
  // dias/inicial: na fonte vinham do servidor (default 90 / 0) e o "Aplicar"
  // recarregava a pagina; aqui sao estado local re-aplicado pelo botao.
  const [dias, setDias] = useState(90)        // janela aplicada (re-busca)
  const [inicial, setInicial] = useState(0)   // saldo inicial aplicado (re-busca)
  // Valores "rascunho" dos inputs ate o usuario clicar em Aplicar (espelha o
  // sel-dias / inp-inicial que so surtem efeito no clique).
  const [diasInput, setDiasInput] = useState(90)
  const [inicialInput, setInicialInput] = useState(0)

  // --- Dados ----------------------------------------------------------------
  const [dados, setDados] = useState(null)     // resposta de /saldo-projetado
  const [chartReady, setChartReady] = useState(false)

  // --- Modal de titulos do dia ----------------------------------------------
  const [modalAberto, setModalAberto] = useState(false)
  const [modalTitulo, setModalTitulo] = useState('Titulos do dia')
  const [modalResumo, setModalResumo] = useState(null) // {entradas, saidas, saldo}
  const [modalCorpo, setModalCorpo] = useState({ tipo: 'vazio' })

  // Refs do grafico
  const chartRef = useRef(null)
  const chartInst = useRef(null)

  // Carrega as libs uma vez.
  useEffect(() => {
    carregarChartLibs().then(() => setChartReady(true)).catch(() => setChartReady(false))
  }, [])

  // =========================================================================
  // carregar(): busca a curva projetada. Port fiel da funcao homonima da fonte.
  // Re-busca quando conta / dias / inicial mudam (dias e inicial sao os valores
  // ja "aplicados").
  // =========================================================================
  useEffect(() => {
    const qs = 'conta=' + conta + '&dias=' + dias + '&inicial=' + inicial
    fetch('/api/dre-financeiro/saldo-projetado?' + qs)
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { alert('Erro: ' + d.erro); return }
        setDados(d)
      })
      .catch((e) => { alert('Erro: ' + e.message) })
  }, [conta, dias, inicial])

  // =========================================================================
  // Render do grafico (Chart.js). Port fiel do bloco "Grafico" da fonte.
  // Reage a dados / chartReady.
  // =========================================================================
  useEffect(() => {
    if (!chartReady || !dados || !chartRef.current || !window.Chart) return
    const d = dados

    const labels = d.pontos.map((p) => p.data)
    const saldos = d.pontos.map((p) => p.saldoAcumulado)
    const entradas = d.pontos.map((p) => p.entradas)
    const saidas = d.pontos.map((p) => -p.saidas) // negativo p/ visualizacao

    if (chartInst.current) chartInst.current.destroy()
    const ctx = chartRef.current.getContext('2d')
    chartInst.current = new window.Chart(ctx, {
      type: 'line',
      data: {
        _labelsRef: labels, // armazena para uso no onClick
        labels: labels,
        datasets: [
          {
            label: 'Saldo acumulado',
            data: saldos,
            borderColor: '#0ea5e9',
            backgroundColor: 'rgba(14,165,233,0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.1,
            pointRadius: 0,
            pointHoverRadius: 5,
            yAxisID: 'y',
          },
          {
            label: 'Entradas dia',
            data: entradas,
            type: 'bar',
            backgroundColor: 'rgba(16,185,129,0.6)',
            borderColor: '#10b981',
            yAxisID: 'y1',
            stack: 'mov',
          },
          {
            label: 'Saidas dia',
            data: saidas,
            type: 'bar',
            backgroundColor: 'rgba(239,68,68,0.6)',
            borderColor: '#ef4444',
            yAxisID: 'y1',
            stack: 'mov',
          },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        onClick: function (evt, elements) {
          if (!elements || !elements.length) return
          const idx = elements[0].index
          const dataISO = labels[idx]
          if (dataISO) abrirModal(dataISO)
        },
        scales: {
          x: {
            ticks: {
              callback: function (val, idx) {
                const iso = labels[idx]
                if (!iso) return ''
                const p = iso.split('-')
                return p[2] + '/' + p[1]
              },
              maxTicksLimit: 15,
            },
          },
          y: {
            position: 'left',
            title: { display: true, text: 'Saldo acumulado' },
            ticks: { callback: function (v) { return fmtBRLcurto(v) } },
          },
          y1: {
            position: 'right',
            title: { display: true, text: 'Entradas / Saidas do dia' },
            grid: { drawOnChartArea: false },
            ticks: { callback: function (v) { return fmtBRLcurto(v) } },
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              title: function (items) { return fmtBRdata(items[0].label) },
              label: function (item) {
                return item.dataset.label + ': ' + fmtBRL(Math.abs(item.raw))
              },
            },
          },
          annotation: undefined,
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
  // abrirModal(dataISO): titulos do dia. Port fiel de window.abrirModal.
  // =========================================================================
  const abrirModal = useCallback((dataISO) => {
    setModalTitulo('Titulos vencendo em ' + fmtBRdata(dataISO))
    setModalResumo(null)
    setModalCorpo({ tipo: 'carregando' })
    setModalAberto(true)

    const qs = 'conta=' + conta + '&tipo=ambos&data=' + dataISO
    fetch('/api/dre-financeiro/titulos?' + qs).then((r) => r.json()).then((d) => {
      if (d.erro) { setModalCorpo({ tipo: 'erro', msg: d.erro }); return }
      let titulos = d.titulos || []
      // Filtra somente titulos com aberto > 0 (mesma logica da curva)
      titulos = titulos.filter((t) => {
        const aberto = (t.valor_documento || 0) - (t.valor_pago || 0)
        return aberto > 0.001
      })
      // Ordena por valor decrescente
      titulos.sort((a, b) => {
        const va = (a.valor_documento || 0) - (a.valor_pago || 0)
        const vb = (b.valor_documento || 0) - (b.valor_pago || 0)
        return vb - va
      })

      if (titulos.length === 0) {
        setModalResumo(null)
        setModalCorpo({ tipo: 'vazio-dia' })
        return
      }

      let totalEntrada = 0, totalSaida = 0
      titulos.forEach((t) => {
        const aberto = (t.valor_documento || 0) - (t.valor_pago || 0)
        if (t.tipo === 'receber') totalEntrada += aberto
        else totalSaida += aberto
      })
      const saldo = totalEntrada - totalSaida
      setModalResumo({ entradas: totalEntrada, saidas: totalSaida, saldo })
      setModalCorpo({ tipo: 'lista', titulos })
    }).catch((e) => setModalCorpo({ tipo: 'erro', msg: e.message }))
  }, [conta])

  function fecharModal() { setModalAberto(false) }

  // Esc fecha o modal (port fiel do keydown da fonte)
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') fecharModal() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // =========================================================================
  // Aplicar (port fiel do btn-aplicar): aplica os inputs rascunho.
  // =========================================================================
  function aplicar() {
    setDias(parseInt(diasInput, 10) || 90)
    setInicial(parseFloat(inicialInput) || 0)
  }

  // --- Estados de gate de permissao (BRIEF item 1) --------------------------
  if (!loading && !loadingPerm && userProfile && (!temAcesso('financeiro') && !pode('dre', 'curva-saldo'))) return <SemPermissao />

  // --- KPIs derivados (port fiel do bloco de KPIs da fonte) -----------------
  const d = dados
  // saldo final + cor
  const corFinal = d
    ? (d.saldoFinal >= 0 ? 'text-2xl font-bold mt-1 text-emerald-700' : 'text-2xl font-bold mt-1 text-red-700')
    : 'text-2xl font-bold mt-1'
  const corMin = d
    ? (d.saldoMin >= 0 ? 'text-2xl font-bold mt-1 text-slate-800' : 'text-2xl font-bold mt-1 text-red-700')
    : 'text-2xl font-bold mt-1'
  // data do saldo minimo (primeiro ponto cujo saldo acumulado bate com saldoMin)
  let dataMin = ''
  if (d) {
    for (let i = 0; i < d.pontos.length; i++) {
      if (Math.abs(d.pontos[i].saldoAcumulado - d.saldoMin) < 0.01) { dataMin = d.pontos[i].data; break }
    }
  }
  // alerta de saldo negativo
  const primeiroNeg = d && d.diasNegativos.length > 0 ? d.diasNegativos[0] : null

  // Linhas da tabela: so dias com movimento (port fiel do forEach da fonte)
  const linhasTabela = d ? d.pontos.filter((p) => !(p.entradas === 0 && p.saidas === 0)) : []

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <h1 className="text-2xl font-semibold text-slate-800">Curva de Saldo Projetado</h1>

        <span className="text-xs text-slate-500 ml-4">Saldo inicial:</span>
        <input
          type="number" step="100" value={inicialInput}
          onChange={(e) => setInicialInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') aplicar() }}
          className="border border-slate-300 rounded px-2 py-1 text-sm w-32"
        />

        <span className="text-xs text-slate-500 ml-2">Janela:</span>
        <select
          value={diasInput}
          onChange={(e) => setDiasInput(parseInt(e.target.value, 10))}
          className="border border-slate-300 rounded px-2 py-1 text-sm"
        >
          <option value={30}>30 dias</option>
          <option value={60}>60 dias</option>
          <option value={90}>90 dias</option>
          <option value={180}>180 dias</option>
          <option value={365}>1 ano</option>
        </select>

        <button onClick={aplicar}
          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Aplicar</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Saldo final</div>
          <div className={corFinal}>{d ? fmtBRL(d.saldoFinal) : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Saldo minimo</div>
          <div className={corMin}>{d ? fmtBRL(d.saldoMin) : '--'}</div>
          <div className="text-xs text-slate-500 mt-0.5">{d ? (dataMin ? 'em ' + fmtBRdata(dataMin) : '') : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Total entradas</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{d ? fmtBRL(d.totalEntradas) : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Total saidas</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{d ? fmtBRL(d.totalSaidas) : '--'}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          <div className="text-xs text-slate-500 uppercase tracking-wide">Dias negativos</div>
          <div className="text-2xl font-bold text-red-600 mt-1">{d ? String(d.diasNegativos.length) : '--'}</div>
        </div>
      </div>

      {/* Aviso de saldo negativo */}
      {primeiroNeg && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-sm">
          <div className="font-semibold text-red-800 mb-1">⚠ Saldo ficara negativo neste periodo</div>
          <div className="text-red-700">
            Primeiro dia negativo: {fmtBRdata(primeiroNeg.data)} (saldo {fmtBRL(primeiroNeg.saldo)})
          </div>
        </div>
      )}

      {/* Grafico */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-6">
        <canvas ref={chartRef} height="120" />
        <div className="text-xs text-slate-500 mt-2">Clique numa barra ou ponto para ver os titulos do dia.</div>
      </div>

      {/* Tabela compacta de movimentos relevantes */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase">
          Dias com movimento — clique numa linha para ver os titulos do dia
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="text-left px-4 py-2">Data</th>
                <th className="text-right px-4 py-2">Entradas</th>
                <th className="text-right px-4 py-2">Saidas</th>
                <th className="text-right px-4 py-2">Saldo do dia</th>
                <th className="text-right px-4 py-2">Saldo acumulado</th>
              </tr>
            </thead>
            <tbody>
              {linhasTabela.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-500">Nenhum movimento neste periodo.</td></tr>
              ) : (
                linhasTabela.map((p, i) => {
                  const corSaldo = p.saldoAcumulado < 0 ? 'text-red-700 font-semibold' : 'text-slate-800'
                  return (
                    <tr key={i}
                      className="border-b border-slate-100 hover:bg-blue-50 cursor-pointer"
                      onClick={() => abrirModal(p.data)}
                      title="Clique para ver os titulos do dia">
                      <td className="px-4 py-2"><span className="text-blue-600 mr-1">▶</span>{fmtBRdata(p.data)}</td>
                      <td className="text-right px-4 py-2 text-emerald-700">{p.entradas ? fmtBRL(p.entradas) : '-'}</td>
                      <td className="text-right px-4 py-2 text-red-700">{p.saidas ? fmtBRL(p.saidas) : '-'}</td>
                      <td className="text-right px-4 py-2">{(p.saldoDoDia >= 0 ? '+' : '') + fmtBRL(p.saldoDoDia)}</td>
                      <td className={'text-right px-4 py-2 ' + corSaldo}>{fmtBRL(p.saldoAcumulado)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de titulos do dia */}
      {modalAberto && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={fecharModal} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl max-h-[85vh] bg-white rounded-lg shadow-2xl z-50 flex flex-col">
            <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
              <h2 className="font-semibold text-slate-800">{modalTitulo}</h2>
              <button onClick={fecharModal} className="text-slate-500 hover:text-slate-900 text-2xl leading-none">×</button>
            </div>
            {/* Resumo */}
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              {modalResumo && (
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <div className="text-xs text-emerald-700">Entradas</div>
                    <div className="font-bold text-emerald-800">{fmtBRL(modalResumo.entradas)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-red-700">Saidas</div>
                    <div className="font-bold text-red-800">{fmtBRL(modalResumo.saidas)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-600">Saldo do dia</div>
                    <div className={'font-bold ' + (modalResumo.saldo >= 0 ? 'text-emerald-700' : 'text-red-700')}>{fmtBRL(modalResumo.saldo)}</div>
                  </div>
                </div>
              )}
            </div>
            {/* Corpo */}
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
// Conteudo do modal: lista de titulos do dia (cards). Port fiel da montagem de
// HTML da fonte, convertido para JSX.
// ===========================================================================
function ModalCorpo({ corpo }) {
  if (!corpo || corpo.tipo === 'vazio') return null
  if (corpo.tipo === 'carregando') return <div className="text-slate-500 text-sm">Carregando...</div>
  if (corpo.tipo === 'erro') return <div className="text-red-600 text-sm">{corpo.msg}</div>
  if (corpo.tipo === 'vazio-dia') return <div className="text-slate-500 text-sm">Nenhum titulo em aberto neste dia.</div>

  if (corpo.tipo === 'lista') {
    return (
      <div className="space-y-2">
        {corpo.titulos.map((t, i) => {
          const aberto = (t.valor_documento || 0) - (t.valor_pago || 0)
          const ehEntrada = t.tipo === 'receber'
          const corBorda = ehEntrada ? 'border-emerald-200' : 'border-red-200'
          const corValor = ehEntrada ? 'text-emerald-800' : 'text-red-800'
          const badge = statusBadge(t.status_derivado)
          // meta (port fiel: Doc / Parc / grupo / categoria / departamento)
          const meta = []
          if (t.numero_documento) meta.push('Doc: ' + t.numero_documento)
          if (t.numero_parcela) meta.push('Parc: ' + t.numero_parcela)
          if (t.grupo_categoria) meta.push(t.grupo_categoria)
          if (t.descricao_categoria) meta.push(t.descricao_categoria)
          if (t.descricao_departamento) meta.push(t.descricao_departamento)
          return (
            <div key={i} className={'border ' + corBorda + ' rounded-lg p-3'}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="font-medium text-slate-800 text-sm">
                  {ehEntrada ? (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 mr-2">+ Entrada</span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-800 mr-2">- Saida</span>
                  )}
                  {t.nome_contraparte || <span className="text-slate-400">Sem nome</span>}
                </div>
                <div className="text-right">
                  <div className={'font-bold ' + corValor}>{(ehEntrada ? '+' : '-') + ' ' + fmtBRL(aberto)}</div>
                  <span className={'inline-block px-2 py-0.5 rounded text-xs font-medium ' + badge.classes}>{badge.label}</span>
                </div>
              </div>
              {meta.length > 0 && (
                <div className="text-xs text-slate-500">{meta.join(' · ')}</div>
              )}
              {t.observacao && (
                <div className="text-xs text-slate-600 italic mt-0.5">{t.observacao}</div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return null
}
