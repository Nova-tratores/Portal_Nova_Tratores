'use client'
// Tela CICLO DE CAIXA do modulo DRE Financeiro.
// Port FIEL de views/ciclo-caixa.ejs do financeiro-omie-dashboard.
// Mostra DSO, DIO, DPO e CCC (Cash Conversion Cycle) consolidado + quebra por empresa,
// uma linha do tempo visual (barra horizontal pura em HTML/CSS, sem lib de grafico) e
// uma interpretacao textual do ciclo.
//
// O layout do modulo (.../dre-financeiro/layout.js) ja faz o gate de permissao
// 'financeiro', a sub-nav e o seletor de conta; aqui focamos no CONTEUDO.
// Importamos useDreConta apenas para montar a URL da API (?conta=...) e refazer
// o fetch quando a conta selecionada muda.

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta } from '@/lib/dre-financeiro/format'

// ----- Helpers de formatacao (port fiel do <script> inline do ciclo-caixa.ejs) -----
// Especificos desta tela (BRL sem casas, dias arredondados com sufixo " d"),
// reproduzidos exatamente como no original.
function fmtBRL(n) {
  return 'R$ ' + new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(n) || 0)
}
function fmtDias(n) {
  if (n === null || n === undefined || !isFinite(n)) return '--'
  return Math.round(n) + ' d'
}
// corCcc: verde <30, ambar <60, vermelho acima. (port fiel)
function corCcc(v) {
  if (v == null) return 'text-slate-500'
  if (v < 30) return 'text-emerald-700'
  if (v < 60) return 'text-amber-700'
  return 'text-red-700'
}

export default function CicloCaixaDreFinanceiro() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  const [meses, setMeses] = useState('12')   // seletor de periodo (3/6/12/24)
  const [dados, setDados] = useState(null)    // payload do /api/.../ciclo-caixa
  const [status, setStatus] = useState('')    // texto da linha de status (cc-status)

  // carregar(): replica a funcao carregar() do <script> da ciclo-caixa.ejs.
  // Mantem o param ?meses= original e acrescenta ?conta= conforme convencao do portal.
  const carregar = useCallback(async () => {
    setStatus('Calculando...')
    const url = '/api/dre-financeiro/ciclo-caixa?meses=' + encodeURIComponent(meses) +
      '&conta=' + encodeURIComponent(conta)
    try {
      const r = await fetch(url)
      const d = await r.json()
      if (d.erro) { setStatus('Erro: ' + d.erro); return }
      setDados(d)
      setStatus('Periodo: ' + d.meses + ' meses (~' + d.dias_periodo + ' dias)')
    } catch (e) {
      setStatus('Erro: ' + e.message)
    }
  }, [meses, conta])

  // carregar() no mount, ao trocar de periodo e ao trocar de conta.
  useEffect(() => { carregar() }, [carregar])

  // Gate de permissao (espelha o layout; mantido por seguranca/padrao do portal).
  if (!loading && !loadingPerm && userProfile && (!temAcesso('financeiro') && !pode('dre', 'ciclo-caixa'))) {
    return <SemPermissao />
  }

  const c = dados ? dados.consolidado : null

  // ----- Linha do tempo (port fiel da renderTimeline()) -----
  // Barra horizontal mostrando DSO + DIO − DPO = CCC. Larguras proporcionais
  // ao total dos modulos dos tres prazos.
  let pctDIO = 0, pctDSO = 0, pctDPO = 0
  if (c) {
    const total = Math.max(Math.abs(c.dio || 0) + Math.abs(c.dso || 0) + Math.abs(c.dpo || 0), 1)
    pctDIO = ((c.dio || 0) / total) * 100
    pctDSO = ((c.dso || 0) / total) * 100
    pctDPO = ((c.dpo || 0) / total) * 100
  }

  // ----- Interpretacao textual (port fiel da renderInterp()) -----
  // Tres estados: vazio (sem payload), 'sem dados suficientes' (ccc null e != 0)
  // e a frase completa com avaliacao colorida + dica conforme faixa do CCC.
  function montarInterp() {
    if (!c) return { kind: 'vazio' }
    if (!c.ccc && c.ccc !== 0) return { kind: 'sem-dados' }
    const ccc = Math.round(c.ccc)
    let avaliacao
    if (ccc < 30) avaliacao = <span className="text-emerald-700 font-semibold">excelente</span>
    else if (ccc < 60) avaliacao = <span className="text-amber-700 font-semibold">razoavel</span>
    else avaliacao = <span className="text-red-700 font-semibold">apertado - precisa de capital de giro</span>
    const dica = ccc > 60
      ? 'Considere: negociar prazos maiores com fornecedores (aumentar DPO), reduzir estoque parado (diminuir DIO), ou cobrar a receber mais rapido (diminuir DSO).'
      : ccc < 30
        ? 'Ciclo saudavel - voce recebe perto de quando paga.'
        : 'Espaco pra melhorar reduzindo estoque parado ou prazo de cobranca.'
    return { kind: 'frase', ccc, avaliacao, dica }
  }
  const interp = montarInterp()

  // Linha da tabela por empresa (port fiel da funcao linha()).
  function Linha({ nome, x, isCons }) {
    const clsTr = isCons ? 'font-bold bg-slate-100' : ''
    return (
      <tr className={'border-b border-slate-100 ' + clsTr}>
        <td className="px-3 py-2">{nome}</td>
        <td className="px-3 py-2 text-right">{fmtBRL(x.receita_periodo)}</td>
        <td className="px-3 py-2 text-right">{fmtBRL(x.cmv_periodo)}</td>
        <td className="px-3 py-2 text-right">{fmtBRL(x.a_receber_aberto)}</td>
        <td className="px-3 py-2 text-right">{fmtBRL(x.a_pagar_aberto)}</td>
        <td className="px-3 py-2 text-right">{fmtBRL(x.estoque_atual)}</td>
        <td className="px-3 py-2 text-right bg-blue-50">{fmtDias(x.dso)}</td>
        <td className="px-3 py-2 text-right bg-amber-50">{fmtDias(x.dio)}</td>
        <td className="px-3 py-2 text-right bg-emerald-50">{fmtDias(x.dpo)}</td>
        <td className={'px-3 py-2 text-right bg-slate-200 font-bold ' + corCcc(x.ccc)}>{fmtDias(x.ccc)}</td>
      </tr>
    )
  }

  return (
    <>
      {/* Cabecalho + seletor de periodo */}
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">Ciclo de Conversao de Caixa</h1>
          <p className="text-xs text-slate-500">DSO, DPO, DIO e CCC - quanto tempo leva entre pagar fornecedor e receber do cliente.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <label htmlFor="cc-meses">Periodo:</label>
          <select
            id="cc-meses"
            value={meses}
            onChange={(e) => setMeses(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1"
          >
            <option value="3">3 meses</option>
            <option value="6">6 meses</option>
            <option value="12">12 meses</option>
            <option value="24">24 meses</option>
          </select>
        </div>
      </div>

      <div id="cc-status" className="text-xs text-slate-500 mb-3">{status}</div>

      {/* KPIs Consolidado */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">DSO</div>
            <div className="text-[10px] text-slate-400" title="Days Sales Outstanding - dias medios para receber dos clientes">i</div>
          </div>
          <div className="text-3xl font-bold text-blue-700" id="kpi-dso">{c ? fmtDias(c.dso) : '--'}</div>
          <div className="text-[10px] text-slate-500 mt-1">dias pra receber</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">DIO</div>
            <div className="text-[10px] text-slate-400" title="Days Inventory Outstanding - dias medios que o produto fica parado em estoque">i</div>
          </div>
          <div className="text-3xl font-bold text-amber-700" id="kpi-dio">{c ? fmtDias(c.dio) : '--'}</div>
          <div className="text-[10px] text-slate-500 mt-1">dias parado em estoque</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide font-bold">DPO</div>
            <div className="text-[10px] text-slate-400" title="Days Payable Outstanding - dias medios para pagar fornecedores">i</div>
          </div>
          <div className="text-3xl font-bold text-emerald-700" id="kpi-dpo">{c ? fmtDias(c.dpo) : '--'}</div>
          <div className="text-[10px] text-slate-500 mt-1">dias pra pagar</div>
        </div>
        <div className="bg-slate-800 text-white rounded-lg p-4">
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] uppercase tracking-wide font-bold opacity-80">CCC</div>
            <div className="text-[10px] opacity-60" title="Cash Conversion Cycle = DSO + DIO - DPO. Dias entre desembolso ao fornecedor e recebimento do cliente.">i</div>
          </div>
          <div className="text-3xl font-bold" id="kpi-ccc">{c ? fmtDias(c.ccc) : '--'}</div>
          <div className="text-[10px] opacity-80 mt-1">ciclo de caixa (dias)</div>
        </div>
      </div>

      {/* Explicacao visual: linha do tempo */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-5">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">Linha do tempo do dinheiro (consolidado)</div>
        <div className="relative" id="cc-timeline" style={{ height: '100px' }}>
          {c && (
            <>
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex h-12 rounded overflow-hidden border border-slate-200">
                <div
                  style={{ width: pctDIO + '%', background: 'rgba(245,158,11,0.85)' }}
                  className="flex items-center justify-center text-[11px] text-white font-bold"
                  title="DIO: dias parado em estoque"
                >DIO {fmtDias(c.dio)}</div>
                <div
                  style={{ width: pctDSO + '%', background: 'rgba(59,130,246,0.85)' }}
                  className="flex items-center justify-center text-[11px] text-white font-bold"
                  title="DSO: dias para receber"
                >DSO {fmtDias(c.dso)}</div>
                <div
                  style={{ width: pctDPO + '%', background: 'rgba(16,185,129,0.85)' }}
                  className="flex items-center justify-center text-[11px] text-white font-bold"
                  title="DPO: dias para pagar (entra na conta como CREDITO de tempo)"
                >DPO {fmtDias(c.dpo)}</div>
              </div>
              <div className="absolute right-2 top-1 text-[10px] text-slate-500">CCC = DSO + DIO − DPO</div>
            </>
          )}
        </div>
        <div className="text-[11px] text-slate-500 mt-2">
          <b>Interpretacao:</b>{' '}
          <span id="cc-interp">
            {interp.kind === 'vazio' ? '' : interp.kind === 'sem-dados' ? 'sem dados suficientes' : (
              <>
                O dinheiro fica fora da empresa por <b>{interp.ccc} dias</b> entre comprar produto e receber a venda. {interp.avaliacao}. {interp.dica}
              </>
            )}
          </span>
        </div>
      </div>

      {/* Por empresa */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wide text-slate-600 font-semibold">Quebra por empresa</div>
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2">Empresa</th>
              <th className="text-right px-3 py-2">Receita (periodo)</th>
              <th className="text-right px-3 py-2">CMV (periodo)</th>
              <th className="text-right px-3 py-2">A Receber</th>
              <th className="text-right px-3 py-2">A Pagar</th>
              <th className="text-right px-3 py-2">Estoque</th>
              <th className="text-right px-3 py-2 bg-blue-50">DSO</th>
              <th className="text-right px-3 py-2 bg-amber-50">DIO</th>
              <th className="text-right px-3 py-2 bg-emerald-50">DPO</th>
              <th className="text-right px-3 py-2 bg-slate-200 font-bold">CCC</th>
            </tr>
          </thead>
          <tbody id="cc-tbody">
            {dados && (
              <>
                <Linha nome="NOVA" x={dados.nova} />
                <Linha nome="CASTRO" x={dados.castro} />
                <Linha nome="CONSOLIDADO" x={dados.consolidado} isCons />
              </>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
