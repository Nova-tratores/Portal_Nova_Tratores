'use client'
// Tela "Clientes" do modulo DRE Financeiro.
// Port FIEL de views/clientes.ejs (financeiro-omie-dashboard / Express+EJS).
// Analise ABC de receita + ranking de inadimplencia (NOVA + CASTRO consolidado por CNPJ).
//
// O gate de permissao 'financeiro', a sub-nav e o seletor de conta vivem no layout
// do modulo (.../dre-financeiro/layout.js); aqui focamos no CONTEUDO. Ainda assim
// usamos useDreConta() para obter a conta selecionada e montar as URLs das APIs.
//
// Observacao de fidelidade: o EJS original usa um fmtBRL SEM casas decimais
// (maximumFractionDigits:0) e um fmtBRLs proprios; preservamos ambos localmente
// em vez de usar o formatBRL (2 casas) do modulo, para nao alterar a aparencia.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useDreConta } from '@/lib/dre-financeiro/format'

// --- helpers fieis ao <script> da view original -----------------------------

// fmtBRL(n): "R$ N" sem casas decimais (igual ao original).
function fmtBRL(n) {
  return 'R$ ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(n) || 0)
}

// ym(d): "YYYY-MM" para <input type="month">.
function ym(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

// Default: jan/2023 a mes anterior (igual ao /dre da fonte).
function defaultsPeriodo() {
  const hoje = new Date()
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)
  const ini = new Date(2023, 0, 1)
  return { desde: ym(ini), ate: ym(fim) }
}

// corAtraso(dias): classe CSS por faixa de atraso (igual ao original).
function corAtraso(dias) {
  if (dias > 90) return 'atraso-alto'
  if (dias > 30) return 'atraso-medio'
  return 'atraso-baixo'
}

export default function ClientesPage() {
  const { conta } = useDreConta()

  // Periodo (inputs type=month). Iniciam no default da fonte.
  const ini = defaultsPeriodo()
  const [desde, setDesde] = useState(ini.desde)
  const [ate, setAte] = useState(ini.ate)

  // Dados retornados pela API e estado de UI.
  const [dados, setDados] = useState(null)
  const [status, setStatus] = useState('Carregando...')
  const [carregando, setCarregando] = useState(false)

  // Filtros das tabelas (controlados; espelham os radios/inputs da view).
  const [filtroAbc, setFiltroAbc] = useState('todos') // todos | A | B | C
  const [buscaAbc, setBuscaAbc] = useState('')
  const [filtroInad, setFiltroInad] = useState('todos') // todos | alto
  const [buscaInad, setBuscaInad] = useState('')

  // Ref p/ os valores atuais de periodo usados dentro de carregar (mantem fiel:
  // carregar le os inputs no momento do clique).
  const desdeRef = useRef(desde)
  const ateRef = useRef(ate)
  desdeRef.current = desde
  ateRef.current = ate

  // --- carregamento (espelha carregar() do original) ------------------------
  async function carregar() {
    const de = desdeRef.current
    const at = ateRef.current
    if (!de || !at) { alert('Selecione o periodo'); return }
    setStatus('Carregando ABC e inadimplencia...')
    setCarregando(true)
    try {
      const r = await fetch('/api/dre-financeiro/clientes/analise?conta=' + conta + '&desde=' + de + '&ate=' + at)
      const d = await r.json()
      setCarregando(false)
      if (d.erro) { setStatus('Erro: ' + d.erro); return }
      setDados(d)
      const ign = d.ignorados || {}
      let ignTxt = ''
      if (ign.intercompany_count || ign.sem_cliente_count) {
        ignTxt = ' · Ignorados: ' +
          (ign.intercompany_count ? ign.intercompany_count + ' linhas intercompany' : '') +
          (ign.intercompany_count && ign.sem_cliente_count ? ' + ' : '') +
          (ign.sem_cliente_count ? ign.sem_cliente_count + ' sem cliente identificado' : '') +
          ' (R$ ' + Math.round(ign.receita_ignorada).toLocaleString('pt-BR') + ' fora do total)'
      }
      setStatus('Periodo: ' + d.periodo.desde + ' a ' + d.periodo.ate + ' · ' +
        d.abc.totalClientes + ' clientes ativos · ' +
        d.inadimplencia.totalClientes + ' inadimplentes' + ignTxt)
    } catch (e) {
      setCarregando(false)
      setStatus('Erro: ' + e.message)
    }
  }

  // Carga inicial e recarga quando a conta muda (mantem dados coerentes com a
  // conta selecionada no layout). No original, carregar() roda uma vez no fim.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregar() }, [conta])

  // --- KPIs (espelham renderKPIs) -------------------------------------------
  const kpis = useMemo(() => {
    if (!dados) {
      return { receita: '--', total: '--', a: '--', b: '--', c: '--', inadTotal: '--', inadQtd: '--', inadPct: '--' }
    }
    const pct = dados.abc.totalReceita > 0 ? (dados.inadimplencia.total / dados.abc.totalReceita) * 100 : 0
    return {
      receita: fmtBRL(dados.abc.totalReceita),
      total: dados.abc.totalClientes,
      a: dados.abc.countA,
      b: dados.abc.countB,
      c: dados.abc.countC,
      inadTotal: fmtBRL(dados.inadimplencia.total),
      inadQtd: dados.inadimplencia.totalClientes,
      inadPct: pct.toFixed(1) + '%',
    }
  }, [dados])

  // --- lista ABC filtrada (espelha renderABC) -------------------------------
  const listaAbc = useMemo(() => {
    if (!dados) return []
    const busca = (buscaAbc || '').toLowerCase().trim()
    return dados.abc.clientes.filter((c) => {
      if (filtroAbc !== 'todos' && c.classe !== filtroAbc) return false
      if (busca && !((c.nome || '').toLowerCase().includes(busca) || (c.cnpj || '').includes(busca))) return false
      return true
    })
  }, [dados, filtroAbc, buscaAbc])

  // --- lista inadimplencia filtrada (espelha renderInadimplencia) -----------
  const listaInad = useMemo(() => {
    if (!dados) return []
    const busca = (buscaInad || '').toLowerCase().trim()
    return dados.inadimplencia.clientes.filter((c) => {
      if (filtroInad === 'alto' && c.maiorAtraso <= 90) return false
      if (busca && !((c.nome || '').toLowerCase().includes(busca) || (c.cnpj || '').includes(busca))) return false
      return true
    })
  }, [dados, filtroInad, buscaInad])

  // --- exportar CSV (port FIEL de exportarCSV) ------------------------------
  function exportarCSV() {
    if (!dados) { alert('Carregue antes.'); return }
    function csvField(v) {
      let s = (v === null || v === undefined) ? '' : String(v)
      if (s.indexOf(';') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) s = '"' + s.replace(/"/g, '""') + '"'
      return s
    }
    function fmtNum(n) {
      if (n === null || n === undefined || !isFinite(n)) return ''
      return String(Math.round(Number(n) * 100) / 100).replace('.', ',')
    }
    const lines = []
    lines.push(['Periodo', dados.periodo.desde + ' a ' + dados.periodo.ate].map(csvField).join(';'))
    lines.push('')
    lines.push('=== ABC ===')
    lines.push(['Rank', 'Nome', 'CNPJ', 'Cidade', 'UF', 'Contas', 'Receita', '% Receita', '% Acumulado', 'CMV', 'Lucro Bruto', 'Margem %', 'Em atraso', 'Titulos atraso', 'Maior atraso (dias)', 'Classe'].map(csvField).join(';'))
    dados.abc.clientes.forEach((c) => {
      lines.push([c.rank, c.nome, c.cnpj, c.cidade, c.estado, c.contas, fmtNum(c.receita), fmtNum(c.pctReceita), fmtNum(c.pctAcumulado), fmtNum(c.cmv), fmtNum(c.lucroBruto), fmtNum(c.margemPct), fmtNum(c.valorAtraso), c.qtdTitulosAtraso, c.maiorAtraso, c.classe].map(csvField).join(';'))
    })
    lines.push('')
    lines.push('=== Inadimplencia ===')
    lines.push(['Rank', 'Nome', 'CNPJ', 'Cidade', 'UF', 'Contas', 'Valor em atraso', 'Titulos', 'Maior atraso (dias)'].map(csvField).join(';'))
    dados.inadimplencia.clientes.forEach((c) => {
      lines.push([c.rank, c.nome, c.cnpj, c.cidade, c.estado, c.contas, fmtNum(c.valorAtraso), c.qtdTitulos, c.maiorAtraso].map(csvField).join(';'))
    })
    const csv = '﻿' + lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'clientes-abc-inadimplencia-' + dados.periodo.desde + '_' + dados.periodo.ate + '.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {/* Estilos da tabela (port FIEL do <style> da view). */}
      <style>{`
        .cli-table { width: 100%; font-size: 12px; }
        .cli-table th { position: sticky; top: 0; background: #f1f5f9; color: #475569; text-align: left; padding: 6px 8px; border-bottom: 1px solid #cbd5e1; z-index: 5; }
        .cli-table td { padding: 4px 8px; border-bottom: 1px solid #e2e8f0; }
        .cli-table tr:hover td { background: #f8fafc; }
        .cli-scroll { max-height: 60vh; overflow: auto; }
        .badge-A { background: #d1fae5; color: #065f46; }
        .badge-B { background: #fef3c7; color: #92400e; }
        .badge-C { background: #e2e8f0; color: #475569; }
        .atraso-baixo { background: #fef3c7; color: #92400e; }
        .atraso-medio { background: #fed7aa; color: #9a3412; }
        .atraso-alto  { background: #fecaca; color: #991b1b; }
      `}</style>

      {/* Cabecalho: titulo + filtros de periodo + botoes */}
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Clientes</h1>
          <p className="text-xs text-slate-500">Análise ABC de receita e ranking de inadimplência (NOVA + CASTRO consolidado por CNPJ).</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600 flex-wrap">
          <label>De:</label>
          <input
            type="month"
            className="border border-slate-300 rounded px-2 py-1"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
          />
          <label>Até:</label>
          <input
            type="month"
            className="border border-slate-300 rounded px-2 py-1"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
          />
          <button
            className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded disabled:opacity-60"
            onClick={carregar}
            disabled={carregando}
          >
            {carregando ? 'Carregando...' : 'Carregar'}
          </button>
          <button
            className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs rounded"
            title="Exporta ABC e inadimplencia em CSV (UTF-8 com BOM)"
            onClick={exportarCSV}
          >
            CSV
          </button>
        </div>
      </div>

      <div className="text-xs text-slate-500 mb-3">{status}</div>

      {/* KPIs ABC */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Receita Total</div>
          <div className="text-lg font-bold text-emerald-700 mt-1">{kpis.receita}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Total Clientes</div>
          <div className="text-lg font-bold text-slate-800 mt-1">{kpis.total}</div>
        </div>
        <div className="bg-white rounded-lg border border-emerald-300 p-3 bg-emerald-50/40">
          <div className="text-[10px] text-emerald-700 uppercase tracking-wide">Classe A (até 80%)</div>
          <div className="text-lg font-bold text-emerald-700 mt-1">{kpis.a}</div>
        </div>
        <div className="bg-white rounded-lg border border-amber-300 p-3 bg-amber-50/40">
          <div className="text-[10px] text-amber-800 uppercase tracking-wide">Classe B (80-95%)</div>
          <div className="text-lg font-bold text-amber-800 mt-1">{kpis.b}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-300 p-3 bg-slate-50/40">
          <div className="text-[10px] text-slate-600 uppercase tracking-wide">Classe C (resto)</div>
          <div className="text-lg font-bold text-slate-700 mt-1">{kpis.c}</div>
        </div>
      </div>

      {/* Tabela ABC */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600 flex items-center justify-between flex-wrap gap-2">
          <span>ABC — clientes por receita do período</span>
          <div className="flex items-center gap-3 text-[10px]">
            <label><input type="radio" name="cli-filtro-abc" value="todos" checked={filtroAbc === 'todos'} onChange={() => setFiltroAbc('todos')} /> todos</label>
            <label><input type="radio" name="cli-filtro-abc" value="A" checked={filtroAbc === 'A'} onChange={() => setFiltroAbc('A')} /> só A</label>
            <label><input type="radio" name="cli-filtro-abc" value="B" checked={filtroAbc === 'B'} onChange={() => setFiltroAbc('B')} /> só B</label>
            <label><input type="radio" name="cli-filtro-abc" value="C" checked={filtroAbc === 'C'} onChange={() => setFiltroAbc('C')} /> só C</label>
            <label>Buscar: <input type="text" className="border border-slate-300 rounded px-2 py-0.5 text-xs ml-1 w-48" placeholder="nome / CNPJ" value={buscaAbc} onChange={(e) => setBuscaAbc(e.target.value)} /></label>
          </div>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Local</th>
                <th>Cont.</th>
                <th className="text-right">Receita</th>
                <th className="text-right" title="% da receita do período que este cliente representa">% Rec.</th>
                <th className="text-right" title="% acumulado (Pareto)">% Acum.</th>
                <th className="text-right">CMV</th>
                <th className="text-right">Lucro Bruto</th>
                <th className="text-right">Margem %</th>
                <th className="text-right" title="Saldo vencido em aberto deste cliente hoje">Em atraso</th>
                <th className="text-right" title="Maior dias de atraso entre os titulos vencidos">Dias</th>
                <th>Classe</th>
              </tr>
            </thead>
            <tbody>
              {listaAbc.length === 0 ? (
                <tr><td colSpan={13} className="text-center py-4 text-slate-400">Nenhum cliente nesse filtro.</td></tr>
              ) : listaAbc.map((c) => {
                const localTxt = [c.cidade, c.estado].filter(Boolean).join('/')
                const corMargem = c.margemPct >= 15 ? 'text-emerald-700' : c.margemPct >= 5 ? 'text-amber-700' : 'text-red-700'
                const temAtraso = c.valorAtraso > 0
                const corDias = c.maiorAtraso > 90 ? 'atraso-alto' : c.maiorAtraso > 30 ? 'atraso-medio' : 'atraso-baixo'
                return (
                  <tr key={c.cnpj ? c.cnpj + '|' + c.rank : 'r' + c.rank}>
                    <td className="text-slate-400">{c.rank}</td>
                    <td>
                      <div className="font-semibold text-slate-800">{c.nome}</div>
                      {c.cnpj ? <div className="text-[10px] text-slate-400">{c.cnpj}</div> : null}
                    </td>
                    <td className="text-[11px] text-slate-500">{localTxt}</td>
                    <td className="text-[10px] uppercase text-slate-500">{c.contas}</td>
                    <td className="text-right font-semibold">{fmtBRL(c.receita)}</td>
                    <td className="text-right text-slate-600">{c.pctReceita.toFixed(2)}%</td>
                    <td className={'text-right font-semibold ' + (c.classe === 'A' ? 'text-emerald-700' : c.classe === 'B' ? 'text-amber-700' : 'text-slate-500')}>{c.pctAcumulado.toFixed(1)}%</td>
                    <td className="text-right text-slate-600">{fmtBRL(c.cmv)}</td>
                    <td className={'text-right ' + (c.lucroBruto >= 0 ? 'text-emerald-700' : 'text-red-700')}>{fmtBRL(c.lucroBruto)}</td>
                    <td className={'text-right ' + corMargem}>{c.margemPct.toFixed(1)}%</td>
                    <td className="text-right">
                      {temAtraso ? (
                        <>
                          <span className="font-semibold text-red-700">{fmtBRL(c.valorAtraso)}</span>
                          {c.qtdTitulosAtraso > 1 ? <div className="text-[10px] text-slate-400">{c.qtdTitulosAtraso} títulos</div> : null}
                        </>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className="text-right">
                      {temAtraso ? (
                        <span className={'text-xs font-bold px-1.5 py-0.5 rounded ' + corDias}>{c.maiorAtraso}d</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td><span className={'text-xs font-bold px-2 py-0.5 rounded badge-' + c.classe}>{c.classe}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inadimplencia: KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <div className="bg-white rounded-lg border border-red-300 p-3 bg-red-50/30">
          <div className="text-[10px] text-red-700 uppercase tracking-wide">Total em atraso</div>
          <div className="text-xl font-bold text-red-700 mt-1">{kpis.inadTotal}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">Clientes inadimplentes</div>
          <div className="text-xl font-bold text-slate-800 mt-1">{kpis.inadQtd}</div>
        </div>
        <div className="bg-white rounded-lg border border-slate-200 p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">% sobre receita do período</div>
          <div className="text-xl font-bold text-slate-800 mt-1">{kpis.inadPct}</div>
        </div>
      </div>

      {/* Tabela Inadimplencia */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-4">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600 flex items-center justify-between flex-wrap gap-2">
          <span>Inadimplência — devedores com vencimento &lt; hoje</span>
          <div className="flex items-center gap-3 text-[10px]">
            <label><input type="radio" name="cli-filtro-inad" value="todos" checked={filtroInad === 'todos'} onChange={() => setFiltroInad('todos')} /> todos</label>
            <label><input type="radio" name="cli-filtro-inad" value="alto" checked={filtroInad === 'alto'} onChange={() => setFiltroInad('alto')} /> só &gt;90d</label>
            <label>Buscar: <input type="text" className="border border-slate-300 rounded px-2 py-0.5 text-xs ml-1 w-48" placeholder="nome / CNPJ" value={buscaInad} onChange={(e) => setBuscaInad(e.target.value)} /></label>
          </div>
        </div>
        <div className="cli-scroll">
          <table className="cli-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Cliente</th>
                <th>Local</th>
                <th>Cont.</th>
                <th className="text-right">Valor em atraso</th>
                <th className="text-right" title="Quantidade de titulos vencidos em aberto">Títulos</th>
                <th className="text-right" title="Dias desde o vencimento mais antigo">Maior atraso</th>
              </tr>
            </thead>
            <tbody>
              {listaInad.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-4 text-slate-400">Nenhum devedor nesse filtro.</td></tr>
              ) : listaInad.map((c) => {
                const localTxt = [c.cidade, c.estado].filter(Boolean).join('/')
                return (
                  <tr key={c.cnpj ? c.cnpj + '|' + c.rank : 'r' + c.rank}>
                    <td className="text-slate-400">{c.rank}</td>
                    <td>
                      <div className="font-semibold text-slate-800">{c.nome}</div>
                      {c.cnpj ? <div className="text-[10px] text-slate-400">{c.cnpj}</div> : null}
                    </td>
                    <td className="text-[11px] text-slate-500">{localTxt}</td>
                    <td className="text-[10px] uppercase text-slate-500">{c.contas}</td>
                    <td className="text-right font-bold text-red-700">{fmtBRL(c.valorAtraso)}</td>
                    <td className="text-right text-slate-600">{c.qtdTitulos}</td>
                    <td className="text-right"><span className={'text-xs font-bold px-2 py-0.5 rounded ' + corAtraso(c.maiorAtraso)}>{c.maiorAtraso} dias</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
