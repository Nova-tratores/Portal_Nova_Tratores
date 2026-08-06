'use client'
// Tela HOME do modulo DRE Financeiro (Resumo Executivo).
// Port FIEL de views/home.ejs do financeiro-omie-dashboard.
// O layout do modulo (.../dre-financeiro/layout.js) ja faz o gate de permissao
// 'financeiro', a sub-nav e o seletor de conta; aqui focamos no CONTEUDO.
// Importamos useDreConta apenas para montar a URL da API (?conta=...) e refazer
// o fetch quando a conta muda.

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta } from '@/lib/dre-financeiro/format'
import TileSemaforo from '@/components/dre-financeiro/TileSemaforo'

// ----- Helpers de formatacao (port fiel do <script> inline do home.ejs) -----
// Estes formatadores sao especificos da home (abreviam M/k sem casas no <1k)
// e diferem dos formatadores genericos de '@/lib/dre-financeiro/format', por
// isso sao reproduzidos exatamente como no original.
function fmtBRL(n) {
  const v = Number(n) || 0, s = v < 0 ? '-' : '', a = Math.abs(v)
  if (a >= 1e6) return s + 'R$ ' + (a / 1e6).toFixed(1).replace('.', ',') + 'M'
  if (a >= 1e3) return s + 'R$ ' + Math.round(a / 1e3) + 'k'
  return s + 'R$ ' + Math.round(a)
}
function fmtPct(n, casas) {
  if (n === null || n === undefined || !isFinite(n)) return '--'
  return Number(n).toFixed(casas || 1) + '%'
}
function fmtDias(n) {
  if (n === null || n === undefined || !isFinite(n)) return '--'
  return Math.round(n) + 'd'
}
function trend(now, ant) {
  if (!ant || ant === 0) return { cls: 'text-slate-400', txt: '' }
  const diff = ((now - ant) / Math.abs(ant)) * 100
  const arrow = diff >= 0 ? '▲' : '▼'
  return { cls: diff >= 0 ? 'text-emerald-700' : 'text-red-700', txt: ' ' + arrow + ' ' + Math.abs(diff).toFixed(1) + '%' }
}
function rotMes(ym) {
  if (!ym) return ''
  const p = ym.split('-')
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return nomes[parseInt(p[1]) - 1] + '/' + p[0].slice(2)
}

// Pilula do indice-resumo de saude (pior-caso dos sinais).
const INDICE_COR = {
  bom: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  atencao: 'bg-amber-100 text-amber-800 border-amber-300',
  ruim: 'bg-red-100 text-red-800 border-red-300',
  sem_dado: 'bg-slate-100 text-slate-600 border-slate-300',
}
const INDICE_LUZ = { bom: '🟢', atencao: '🟡', ruim: '🔴', sem_dado: '⚪' }
function StatusResumo({ indice }) {
  const cls = INDICE_COR[indice.status] || INDICE_COR.sem_dado
  return (
    <span className={'inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-bold ' + cls}>
      {INDICE_LUZ[indice.status]} {indice.label}
    </span>
  )
}

export default function HomeDreFinanceiro() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  // Pode ver a tela do DRE apontada por href? Quem tem 'financeiro' (ou admin)
  // vê tudo; senão, só as telas liberadas em 'dre:<slug>'. Usado pra esconder os
  // cards (que sao <Link> pra cada tela) — esconde tambem o KPI sensivel junto.
  const podeVerTela = (href) => {
    if (!href || !href.startsWith('/dre-financeiro/')) return true
    const slug = href.slice('/dre-financeiro/'.length).split('?')[0]
    return temAcesso('financeiro') || pode('dre', slug)
  }

  const [dados, setDados] = useState(null)   // payload dos KPIs
  const [meta, setMeta] = useState('Carregando KPIs...') // texto do subtitulo (home-meta)
  const [saude, setSaude] = useState(null)   // payload do semaforo de saude financeira

  // carregar(force): replica a funcao carregar() do <script> da home.ejs.
  const carregar = useCallback(async (force) => {
    setMeta(force ? 'Recalculando...' : 'Carregando KPIs (cache 5min)...')
    const url = '/api/dre-financeiro/home/kpis?conta=' + encodeURIComponent(conta) + (force ? '&refresh=1' : '')
    try {
      const r = await fetch(url)
      const d = await r.json()
      if (d.erro) { setMeta('Erro: ' + d.erro); setDados(null); return }
      // render(): monta o texto de meta (cache/calculo + data de geracao)
      const m = d.cache && d.cache.hit
        ? 'Cache: ' + d.cache.idade_seg + 's atras (TTL ' + d.cache.ttl_seg + 's)'
        : 'Calculado em ' + (d.cache && d.cache.calculo_ms ? d.cache.calculo_ms + 'ms' : '?')
      setMeta(m + ' · gerado ' + new Date(d.gerado_em).toLocaleString('pt-BR'))
      setDados(d)
    } catch (e) {
      setMeta('Erro: ' + e.message)
      setDados(null)
    }
  }, [conta])

  // Semaforo de saude: fetch proprio (rota /saude, cache 5min) - nao atrasa os
  // KPIs principais; renderiza assim que chega.
  const carregarSaude = useCallback(async (force) => {
    const url = '/api/dre-financeiro/saude?conta=' + encodeURIComponent(conta) + (force ? '&refresh=1' : '')
    try {
      const r = await fetch(url)
      const d = await r.json()
      if (d.erro) { setSaude(null); return }
      setSaude(d)
    } catch (e) { setSaude(null) }
  }, [conta])

  // carregar(false) no mount e sempre que a conta selecionada muda.
  useEffect(() => { carregar(false); carregarSaude(false) }, [carregar, carregarSaude])

  // Gate de permissao (espelha o layout; mantido por seguranca/padrao do portal).
  // Home liberada pra quem tem 'financeiro' OU qualquer tela do 'dre'.
  if (!loading && !loadingPerm && userProfile && !temAcesso('financeiro') && !temAcesso('dre')) {
    return <SemPermissao />
  }

  const d = dados || {}

  // ----- Valores derivados (port fiel da render() do home.ejs) -----
  // 2. CCC: cor do numero conforme valor
  const cccCor = d.ciclo
    ? (d.ciclo.ccc < 30 ? 'text-emerald-700' : d.ciclo.ccc < 60 ? 'text-amber-700' : 'text-red-700')
    : ''
  // 3. Resultado mes: cor + trend
  const rMes = d.resultado_mes ? d.resultado_mes.resultado : null
  const resCor = rMes !== null ? (rMes >= 0 ? 'text-emerald-700' : 'text-red-700') : ''
  const tRes = (d.resultado_mes && d.resultado_mes_anterior)
    ? trend(rMes, d.resultado_mes_anterior.resultado)
    : { cls: '', txt: '' }
  // 4. Pontualidade: cor conforme %
  const ader = d.aderencia_30d_pagar_pct
  const aderCor = (ader !== null && ader !== undefined)
    ? (ader >= 90 ? 'text-emerald-700' : ader >= 70 ? 'text-amber-700' : 'text-red-700')
    : ''
  // 6. Vencimentos: cor do liquido
  const venc = d.vencimentos_7d
  const liqCor = venc ? (venc.liquido >= 0 ? 'text-emerald-700 font-extrabold' : 'text-red-700 font-extrabold') : ''

  return (
    <>
      <div className="flex items-baseline justify-between mb-5 flex-wrap gap-2">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-800">Resumo Executivo</h1>
          <p className="text-sm text-slate-500 mt-1" id="home-meta">{meta}</p>
        </div>
        <button
          id="home-refresh"
          onClick={() => { carregar(true); carregarSaude(true) }}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded"
          title="Recalcular ignorando cache de 5min"
        >Atualizar</button>
      </div>

      {/* Semaforo de Saude Financeira (deterioracao de caixa + resultado).
          Cada tile: luz de status + valor + seta de tendencia; caixa primeiro.
          Fonte: /api/dre-financeiro/saude. Esconde tiles cuja tela o usuario
          nao pode ver (mesmo podeVerTela dos KPIs). */}
      {saude && Array.isArray(saude.sinais) && saude.sinais.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <h2 className="text-xl font-extrabold text-slate-700 uppercase tracking-wide">Saude Financeira</h2>
            {saude.indice && <StatusResumo indice={saude.indice} />}
            <span className="text-sm text-slate-400">semaforo de deterioracao · caixa primeiro · tendencia dos ult. 3 meses</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {saude.sinais.filter(s => podeVerTela(s.href)).map(s => (
              <TileSemaforo key={s.chave} sinal={s} />
            ))}
          </div>
        </div>
      )}

      {/* KPI grid (6 cards grandes coloridos, 3x2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8" id="home-kpis">
        {/* Patrimonio (azul) */}
        {podeVerTela('/dre-financeiro/patrimonio') && (
        <Link href="/dre-financeiro/patrimonio" className="bg-sky-100 border-2 border-sky-300 rounded-xl p-5 hover:border-sky-500 hover:shadow-lg transition block">
          <div className="text-sm uppercase tracking-wide text-sky-900 font-extrabold">Patrimonio Operacional</div>
          <div className="text-5xl font-extrabold text-sky-900 mt-2" id="kpi-patrimonio">
            {d.patrimonio ? fmtBRL(d.patrimonio.operacional) : '--'}
          </div>
          <div className="text-base text-sky-800 mt-3" id="kpi-patrimonio-sub">
            {d.patrimonio ? ('Ativos ' + fmtBRL(d.patrimonio.ativos) + ' − Passivos ' + fmtBRL(d.patrimonio.passivos)) : '--'}
          </div>
          <div className="text-sm text-sky-700 font-bold mt-3">Ver patrimonio →</div>
        </Link>
        )}
        {/* CCC (roxo) */}
        {podeVerTela('/dre-financeiro/ciclo-caixa') && (
        <Link href="/dre-financeiro/ciclo-caixa" className="bg-violet-100 border-2 border-violet-300 rounded-xl p-5 hover:border-violet-500 hover:shadow-lg transition block">
          <div className="text-sm uppercase tracking-wide text-violet-900 font-extrabold">Ciclo de Caixa (CCC)</div>
          <div className={'text-5xl font-extrabold mt-2 ' + cccCor} id="kpi-ccc">
            {d.ciclo ? fmtDias(d.ciclo.ccc) : '--'}
          </div>
          <div className="text-base text-violet-800 mt-3" id="kpi-ccc-sub">
            {d.ciclo ? ('DSO ' + fmtDias(d.ciclo.dso) + ' + DIO ' + fmtDias(d.ciclo.dio) + ' − DPO ' + fmtDias(d.ciclo.dpo)) : '--'}
          </div>
          <div className="text-sm text-violet-700 font-bold mt-3">Ver ciclo de caixa →</div>
        </Link>
        )}
        {/* Resultado mes (verde) */}
        {podeVerTela('/dre-financeiro/dre') && (
        <Link href="/dre-financeiro/dre" className="bg-emerald-100 border-2 border-emerald-300 rounded-xl p-5 hover:border-emerald-500 hover:shadow-lg transition block">
          <div className="text-sm uppercase tracking-wide text-emerald-900 font-extrabold">
            Resultado <span id="kpi-resultado-mes-rotulo">{d.mes_atual ? rotMes(d.mes_atual) : 'mes'}</span>
          </div>
          <div className={'text-5xl font-extrabold mt-2 ' + resCor} id="kpi-resultado">
            {rMes !== null ? fmtBRL(rMes) : '--'}
          </div>
          <div className="text-base text-emerald-800 mt-3" id="kpi-resultado-sub">
            {d.resultado_mes ? (
              <>
                {'Receita ' + fmtBRL(d.resultado_mes.receitaBruta) + ' · Lucro Bruto ' + fmtBRL(d.resultado_mes.lucroBruto)}
                <br />
                <span className={tRes.cls}>{'vs ' + rotMes(d.mes_anterior) + tRes.txt}</span>
              </>
            ) : '--'}
          </div>
          <div className="text-sm text-emerald-700 font-bold mt-3">Ver DRE →</div>
        </Link>
        )}
        {/* Pontualidade (rosa) */}
        {podeVerTela('/dre-financeiro/aderencia') && (
        <Link href="/dre-financeiro/aderencia" className="bg-rose-100 border-2 border-rose-300 rounded-xl p-5 hover:border-rose-500 hover:shadow-lg transition block">
          <div className="text-sm uppercase tracking-wide text-rose-900 font-extrabold">Pontualidade ultimos 30d</div>
          <div className={'text-5xl font-extrabold mt-2 ' + aderCor} id="kpi-aderencia">
            {(ader !== null && ader !== undefined) ? fmtPct(ader) : '--'}
          </div>
          <div className="text-base text-rose-800 mt-3">% pago no prazo (contas a pagar)</div>
          <div className="text-sm text-rose-700 font-bold mt-3">Ver pontualidade →</div>
        </Link>
        )}
        {/* Capital parado (laranja) */}
        {podeVerTela('/dre-financeiro/rentabilidade?tab=capital') && (
        <Link href="/dre-financeiro/rentabilidade?tab=capital" className="bg-amber-100 border-2 border-amber-300 rounded-xl p-5 hover:border-amber-500 hover:shadow-lg transition block">
          <div className="text-sm uppercase tracking-wide text-amber-900 font-extrabold">Capital Parado em Estoque</div>
          <div className="text-5xl font-extrabold text-amber-900 mt-2" id="kpi-capital">
            {d.capital_parado ? fmtBRL(d.capital_parado.valor) : '--'}
          </div>
          <div className="text-base text-amber-800 mt-3" id="kpi-capital-sub">
            {d.capital_parado
              ? (d.capital_parado.pct_do_total + '% do estoque · corrosao R$ ' +
                  Math.round(d.capital_parado.corrosao_mes).toLocaleString('pt-BR') + '/mes')
              : '--'}
          </div>
          <div className="text-sm text-amber-700 font-bold mt-3">Ver capital parado →</div>
        </Link>
        )}
        {/* Vencimentos 7d (teal) */}
        {podeVerTela('/dre-financeiro/calendario') && (
        <Link href="/dre-financeiro/calendario" className="bg-teal-100 border-2 border-teal-300 rounded-xl p-5 hover:border-teal-500 hover:shadow-lg transition block">
          <div className="text-sm uppercase tracking-wide text-teal-900 font-extrabold">Vencimentos proximos 7 dias</div>
          <div className="text-3xl font-extrabold mt-2 flex gap-3 items-baseline flex-wrap">
            <span className="text-emerald-700" id="kpi-venc-receber">{venc ? '+' + fmtBRL(venc.a_receber) : '--'}</span>
            <span className="text-base text-teal-600">·</span>
            <span className="text-red-700" id="kpi-venc-pagar">{venc ? '−' + fmtBRL(venc.a_pagar) : '--'}</span>
          </div>
          <div className="text-base text-teal-800 mt-3">
            A receber · A pagar  |  liquido <span id="kpi-venc-liquido" className={venc ? liqCor : 'font-bold'}>{venc ? fmtBRL(venc.liquido) : '--'}</span>
          </div>
          <div className="text-sm text-teal-700 font-bold mt-3">Ver calendario →</div>
        </Link>
        )}
      </div>

      {/* Atalhos por categoria (cards coloridos pra cada pagina) */}
      <div id="home-todas-paginas" className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-extrabold text-slate-700 uppercase tracking-wide">Todas as paginas</h2>
        <span className="text-sm text-slate-500">Atalhos rapidos por categoria</span>
      </div>

      {/* Categoria: Caixa & Vencimentos */}
      <div className="mb-2 mt-2 flex items-baseline gap-2">
        <h3 className="text-lg font-extrabold text-slate-700 uppercase tracking-wide">Caixa &amp; Vencimentos</h3>
        <span className="text-sm text-slate-400">quando o dinheiro entra e sai</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <Link href="/dre-financeiro/calendario" className="bg-blue-100 border-2 border-blue-300 hover:border-blue-500 hover:shadow rounded-lg p-4 transition">
          <div className="text-base font-extrabold text-blue-900">Calendario</div>
          <div className="text-sm text-blue-800 mt-1">Vencimentos mes a mes</div>
        </Link>
        <Link href="/dre-financeiro/curva-saldo" className="bg-cyan-100 border-2 border-cyan-300 hover:border-cyan-500 hover:shadow rounded-lg p-4 transition">
          <div className="text-base font-extrabold text-cyan-900">Curva de Saldo</div>
          <div className="text-sm text-cyan-800 mt-1">Projecao 30-365 dias</div>
        </Link>
        <Link href="/dre-financeiro/fluxo" className="bg-orange-100 border-2 border-orange-300 hover:border-orange-500 hover:shadow rounded-lg p-4 transition">
          <div className="text-base font-extrabold text-orange-900">Fluxo (Sankey)</div>
          <div className="text-sm text-orange-800 mt-1">Caminho do dinheiro grupo→cat→terceiro</div>
        </Link>
        <Link href="/dre-financeiro/fluxo?modo=treemap" className="bg-yellow-100 border-2 border-yellow-300 hover:border-yellow-500 hover:shadow rounded-lg p-4 transition">
          <div className="text-base font-extrabold text-yellow-900">Fluxo (Treemap)</div>
          <div className="text-sm text-yellow-800 mt-1">Composicao por categoria</div>
        </Link>
      </div>

      {/* Categoria: Prazos & Eficiencia */}
      <div className="mb-2 mt-2 flex items-baseline gap-2">
        <h3 className="text-lg font-extrabold text-slate-700 uppercase tracking-wide">Prazos &amp; Eficiencia</h3>
        <span className="text-sm text-slate-400">prazos de giro e cumprimento</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <Link href="/dre-financeiro/ciclo-caixa" className="bg-violet-100 border-2 border-violet-300 hover:border-violet-500 hover:shadow rounded-lg p-4 transition">
          <div className="text-base font-extrabold text-violet-900">Ciclo de Caixa</div>
          <div className="text-sm text-violet-800 mt-1">DSO + DIO − DPO</div>
        </Link>
        <Link href="/dre-financeiro/aderencia" className="bg-pink-100 border-2 border-pink-300 hover:border-pink-500 hover:shadow rounded-lg p-4 transition">
          <div className="text-base font-extrabold text-pink-900">Pontualidade</div>
          <div className="text-sm text-pink-800 mt-1">Realizado vs previsto</div>
        </Link>
      </div>

      {/* Categoria: Resultado (DRE) */}
      <div className="mb-2 mt-2 flex items-baseline gap-2">
        <h3 className="text-lg font-extrabold text-slate-700 uppercase tracking-wide">Resultado (DRE)</h3>
        <span className="text-sm text-slate-400">receita, despesas e lucro</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <Link href="/dre-financeiro/dre" className="bg-emerald-100 border-2 border-emerald-300 hover:border-emerald-500 hover:shadow rounded-lg p-4 transition">
          <div className="text-base font-extrabold text-emerald-900">DRE</div>
          <div className="text-sm text-emerald-800 mt-1">Resultado consolidado</div>
        </Link>
        <Link href="/dre-financeiro/analise-dre" className="bg-fuchsia-100 border-2 border-fuchsia-300 hover:border-fuchsia-500 hover:shadow rounded-lg p-4 transition">
          <div className="text-base font-extrabold text-fuchsia-900">Analise DRE</div>
          <div className="text-sm text-fuchsia-800 mt-1">Insights MoM/YoY + atipicos</div>
        </Link>
      </div>

      {/* Categoria: Patrimonio & Rentabilidade */}
      <div className="mb-2 mt-2 flex items-baseline gap-2">
        <h3 className="text-lg font-extrabold text-slate-700 uppercase tracking-wide">Patrimonio &amp; Rentabilidade</h3>
        <span className="text-sm text-slate-400">ativos, margem e custo de capital</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <Link href="/dre-financeiro/patrimonio" className="bg-sky-100 border-2 border-sky-300 hover:border-sky-500 hover:shadow rounded-lg p-4 transition">
          <div className="text-base font-extrabold text-sky-900">Patrimonio</div>
          <div className="text-sm text-sky-800 mt-1">Balanco + cobertura</div>
        </Link>
        <Link href="/dre-financeiro/rentabilidade?tab=margens" className="bg-lime-100 border-2 border-lime-300 hover:border-lime-500 hover:shadow rounded-lg p-4 transition">
          <div className="text-base font-extrabold text-lime-900">Margens por venda</div>
          <div className="text-sm text-lime-800 mt-1">Margem real (CMV + capital)</div>
        </Link>
        <Link href="/dre-financeiro/rentabilidade?tab=capital" className="bg-amber-100 border-2 border-amber-300 hover:border-amber-500 hover:shadow rounded-lg p-4 transition">
          <div className="text-base font-extrabold text-amber-900">Capital parado</div>
          <div className="text-sm text-amber-800 mt-1">Estoque sem giro + SELIC</div>
        </Link>
      </div>

      {/* Categoria: Comercial */}
      <div className="mb-2 mt-2 flex items-baseline gap-2">
        <h3 className="text-lg font-extrabold text-slate-700 uppercase tracking-wide">Comercial</h3>
        <span className="text-sm text-slate-400">vendas e clientes</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Link href="/dre-financeiro/vendas-modelo" className="bg-fuchsia-100 border-2 border-fuchsia-300 hover:border-fuchsia-500 hover:shadow rounded-lg p-4 transition">
          <div className="text-base font-extrabold text-fuchsia-900">Vendas/Modelo</div>
          <div className="text-sm text-fuchsia-800 mt-1">Serie mensal por modelo</div>
        </Link>
        <Link href="/dre-financeiro/clientes" className="bg-rose-100 border-2 border-rose-300 hover:border-rose-500 hover:shadow rounded-lg p-4 transition">
          <div className="text-base font-extrabold text-rose-900">Clientes</div>
          <div className="text-sm text-rose-800 mt-1">ABC Pareto + inadimplencia</div>
        </Link>
      </div>

      {/* Categoria: Qualidade dos dados */}
      <div className="mb-2 mt-6 flex items-baseline gap-2">
        <h3 className="text-lg font-extrabold text-slate-700 uppercase tracking-wide">Qualidade dos Dados</h3>
        <span className="text-sm text-slate-400">robos que conferem os lancamentos no Omie</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Link href="/dre-financeiro/monitor" className="bg-red-100 border-2 border-red-300 hover:border-red-500 hover:shadow rounded-lg p-4 transition">
          <div className="text-base font-extrabold text-red-900">Monitor de Qualidade</div>
          <div className="text-sm text-red-800 mt-1">Anomalias por modulo (categoria, custo, cliente...)</div>
        </Link>
      </div>
    </>
  )
}
