'use client'
// =============================================================================
// Tela Monitor de Qualidade (port FIEL de views/monitor.ejs do
// financeiro-omie-dashboard).
//
// Mantem EXATAMENTE o comportamento do original:
//  - Cards por modulo (Contas a Pagar / Receber / Faturamento / Compras) com o
//    total de anomalias ABERTAS, split por severidade (alta/media/baixa) e
//    botao "Rodar agora" por modulo.
//  - Botao "Rodar todos os robos agora".
//  - Aviso de setup quando a API retorna { erro } (tabela qa_anomalias ausente).
//  - Filtros (Modulo + Situacao) que recarregam a tabela de anomalias.
//  - Tabela de anomalias com badge de severidade, label de regra + hint de
//    detalhe, e acoes (ignorar/resolver/reabrir) que dao POST no status.
//  - "Ultimas execucoes dos robos" lendo /monitor/status.
//
// A tela NAO usa libs de grafico (apenas markup + Tailwind). Toda a logica do
// <script> inline da fonte foi convertida em estado/efeitos React + render JSX.
//
// Diferenca de CONTA: na fonte a conta vinha do header global (var CONTA);
// aqui vem do seletor de conta do layout do modulo via useDreConta().
//
// O layout do modulo (.../dre-financeiro/layout.js) ja aplica o gate de
// permissao 'financeiro' e a sub-nav; ainda assim importamos useAuth/
// usePermissoes e SemPermissao por consistencia com o padrao do portal.
//
// Observacao sobre cores: a fonte montava classes Tailwind dinamicamente
// (ex.: 'bg-' + cor + '-50'). Como o portal usa Tailwind em build (purge),
// classes geradas em runtime seriam removidas. Por isso as classes de cada
// modulo estao escritas por extenso em MODULO_CLS (mesmas cores do original).
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { useDreConta } from '@/lib/dre-financeiro/format'

// ---------------------------------------------------------------------------
// Constantes de UI (port fiel das vars do <script> da fonte)
// ---------------------------------------------------------------------------
const REGRA_LABEL = {
  valor_zerado: 'Valor zerado', sem_fornecedor: 'Sem fornecedor', sem_cliente: 'Sem cliente',
  sem_categoria: 'Sem categoria', sem_grupo_categoria: 'Sem grupo de categoria',
  sem_departamento: 'Sem departamento', custo_ausente: 'Custo (CMC) ausente',
  sem_valor_produtos: 'Sem valor de produtos',
  valor_atipico: 'Valor fora do padrão', preco_atipico: 'Preço fora do padrão',
  categoria_atipica: 'Categoria fora do padrão',
}

const MODULO_LABEL = {
  contas_pagar: 'Contas a Pagar', contas_receber: 'Contas a Receber',
  faturamento: 'Faturamento / Vendas', compras: 'Compras / Notas de Entrada',
}

// Ordem dos modulos (espelha o forEach da fonte).
const MODULOS = ['contas_pagar', 'contas_receber', 'faturamento', 'compras']

// Classes por modulo escritas por extenso (purge-safe). Espelham MODULO_COR da
// fonte: contas_pagar=red, contas_receber=emerald, faturamento=fuchsia,
// compras=amber. Cada modulo replica EXATAMENTE as classes geradas no original.
const MODULO_CLS = {
  contas_pagar: {
    card: 'bg-red-50 border-2 border-red-300 rounded-xl p-4',
    titulo: 'text-sm font-extrabold text-red-900 uppercase tracking-wide',
    totalComAlerta: 'text-red-900', // quando total > 0
    btn: 'btn-rodar mt-3 w-full px-2 py-1 text-xs font-bold rounded bg-red-600 hover:bg-red-700 text-white',
  },
  contas_receber: {
    card: 'bg-emerald-50 border-2 border-emerald-300 rounded-xl p-4',
    titulo: 'text-sm font-extrabold text-emerald-900 uppercase tracking-wide',
    totalComAlerta: 'text-emerald-900',
    btn: 'btn-rodar mt-3 w-full px-2 py-1 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  faturamento: {
    card: 'bg-fuchsia-50 border-2 border-fuchsia-300 rounded-xl p-4',
    titulo: 'text-sm font-extrabold text-fuchsia-900 uppercase tracking-wide',
    totalComAlerta: 'text-fuchsia-900',
    btn: 'btn-rodar mt-3 w-full px-2 py-1 text-xs font-bold rounded bg-fuchsia-600 hover:bg-fuchsia-700 text-white',
  },
  compras: {
    card: 'bg-amber-50 border-2 border-amber-300 rounded-xl p-4',
    titulo: 'text-sm font-extrabold text-amber-900 uppercase tracking-wide',
    totalComAlerta: 'text-amber-900',
    btn: 'btn-rodar mt-3 w-full px-2 py-1 text-xs font-bold rounded bg-amber-600 hover:bg-amber-700 text-white',
  },
}

// Badge de severidade (port fiel de SEV_BADGE).
const SEV_BADGE = {
  alta: 'bg-red-100 text-red-800 border-red-300',
  media: 'bg-amber-100 text-amber-800 border-amber-300',
  baixa: 'bg-slate-100 text-slate-600 border-slate-300',
}

// ---------------------------------------------------------------------------
// Formatadores locais (identicos aos do <script> da fonte). Mantidos inline
// para preservar EXATAMENTE o comportamento dos hints/valores/datas.
// ---------------------------------------------------------------------------
// fmtBRLn: usado nos hints. Retorna '?' para null/undefined (igual a fonte).
function fmtBRLn(n) {
  if (n == null) return '?'
  return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
// fmtBRL: usado na coluna Valor. Retorna '—' para null/undefined (igual a fonte).
function fmtBRL(n) {
  if (n === null || n === undefined) return '—'
  const v = Number(n) || 0
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtData(iso) {
  if (!iso) return '—'
  const p = String(iso).slice(0, 10).split('-')
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso
}

// hintDetalhe(a): texto auxiliar abaixo do nome da regra (port fiel).
function hintDetalhe(a) {
  const d = a.detalhe || {}
  if (a.regra === 'valor_atipico') {
    return 'cat. "' + (d.categoria || '?') + '": ' + fmtBRLn(a.valor) + ' vs típico ' + fmtBRLn(d.mediana_categoria) +
      (d.z != null ? (' (z ' + d.z + ')') : (d.razao != null ? (' (' + d.razao + 'x)') : ''))
  }
  if (a.regra === 'preco_atipico') {
    return (d.descricao || '') + ': unit. ' + fmtBRLn(d.preco_unitario) + ' vs típico ' + fmtBRLn(d.preco_tipico) +
      (d.z != null ? (' (z ' + d.z + ')') : (d.razao != null ? (' (' + d.razao + 'x)') : ''))
  }
  if (a.regra === 'categoria_atipica') {
    return '"' + (d.contraparte || '?') + '" nunca usou a categoria "' + (d.categoria || '?') + '"'
  }
  if (d.descricao) return d.descricao
  return ''
}

export default function MonitorPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  // --- Estado (espelha as vars/elementos do IIFE da fonte) ------------------
  const [avisoSetup, setAvisoSetup] = useState('')   // texto do aviso de setup (#aviso-setup); '' = oculto
  const [resumo, setResumo] = useState(null)          // d.resumo dos cards; null = "Carregando…"
  const [cardsErro, setCardsErro] = useState('')      // erro de fetch dos cards

  const [fModulo, setFModulo] = useState('')          // filtro #f-modulo ('' = Todos)
  const [fStatus, setFStatus] = useState('aberta')    // filtro #f-status (default 'aberta')
  const [tabelaStatus, setTabelaStatus] = useState('') // texto #tabela-status (contagem / "Carregando…" / erro)
  const [anomalias, setAnomalias] = useState([])       // linhas da tabela

  const [execStatus, setExecStatus] = useState('')     // texto/erro de #execucoes (vazio = lista normal)
  const [execLista, setExecLista] = useState([])       // d.ultimos das execucoes

  const [rodandoTudo, setRodandoTudo] = useState(false) // botao "rodar todos"
  const [rodandoModulo, setRodandoModulo] = useState({}) // { [modulo]: true } enquanto roda

  // =========================================================================
  // carregarCards(): GET /monitor/anomalias?conta=&status=aberta -> resumo
  // Port fiel da funcao homonima da fonte.
  // =========================================================================
  const carregarCards = useCallback(() => {
    fetch('/api/dre-financeiro/monitor/anomalias?conta=' + encodeURIComponent(conta) + '&status=aberta')
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) {
          // Mostra o aviso de setup (espelha o texto exato da fonte).
          setAvisoSetup('Atenção: ' + d.erro + ' — rode sql/qa_anomalias_init.sql no Supabase e clique em "Rodar todos os robôs".')
          setResumo(null)
          return
        }
        setAvisoSetup('')
        setCardsErro('')
        setResumo(d.resumo || {})
      })
      .catch((e) => { setCardsErro('Erro: ' + e.message); setResumo(null) })
  }, [conta])

  // =========================================================================
  // carregarTabela(): GET /monitor/anomalias?conta=&status=&modulo=
  // Port fiel: usa os filtros atuais (fModulo/fStatus).
  // =========================================================================
  const carregarTabela = useCallback(() => {
    setTabelaStatus('Carregando…')
    const url = '/api/dre-financeiro/monitor/anomalias?conta=' + encodeURIComponent(conta) +
      '&status=' + encodeURIComponent(fStatus) + (fModulo ? '&modulo=' + encodeURIComponent(fModulo) : '')
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { setTabelaStatus('Erro: ' + d.erro); setAnomalias([]); return }
        const rows = d.anomalias || []
        const tot = (d.total != null ? d.total : rows.length)
        setTabelaStatus(tot + ' anomalia(s)' + (d.truncada ? (' — exibindo as primeiras ' + rows.length) : ''))
        setAnomalias(rows)
      })
      .catch((e) => { setTabelaStatus('Erro: ' + e.message); setAnomalias([]) })
  }, [conta, fModulo, fStatus])

  // =========================================================================
  // carregarExecucoes(): GET /monitor/status -> d.ultimos
  // Port fiel da funcao homonima da fonte.
  // =========================================================================
  const carregarExecucoes = useCallback(() => {
    fetch('/api/dre-financeiro/monitor/status')
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) { setExecStatus('Erro: ' + d.erro); setExecLista([]); return }
        const u = d.ultimos || []
        setExecStatus('')
        setExecLista(u)
      })
      .catch((e) => { setExecStatus('Erro: ' + e.message); setExecLista([]) })
  }, [])

  // =========================================================================
  // marcar(id, status): POST /monitor/anomalia/:id/status -> recarrega
  // Port fiel da funcao homonima da fonte.
  // =========================================================================
  const marcar = useCallback((id, status) => {
    fetch('/api/dre-financeiro/monitor/anomalia/' + encodeURIComponent(id) + '/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    }).then((r) => r.json()).then(() => { carregarTabela(); carregarCards() })
  }, [carregarTabela, carregarCards])

  // =========================================================================
  // rodar(modulo): POST /monitor/run?conta=&modulo= -> apos 2.5s recarrega tudo
  // Port fiel: modulo null -> 'todos'. Controla o estado do botao (rodando…).
  // =========================================================================
  const rodar = useCallback((modulo) => {
    if (modulo) setRodandoModulo((s) => ({ ...s, [modulo]: true }))
    else setRodandoTudo(true)
    fetch('/api/dre-financeiro/monitor/run?conta=' + encodeURIComponent(conta) + (modulo ? '&modulo=' + encodeURIComponent(modulo) : '&modulo=todos'), { method: 'POST' })
      .then((r) => r.json())
      .then(() => {
        setTimeout(() => {
          carregarCards(); carregarTabela(); carregarExecucoes()
          if (modulo) setRodandoModulo((s) => ({ ...s, [modulo]: false }))
          else setRodandoTudo(false)
        }, 2500)
      })
      .catch(() => {
        // Mesmo em falha, restaura o botao para nao travar a UI.
        if (modulo) setRodandoModulo((s) => ({ ...s, [modulo]: false }))
        else setRodandoTudo(false)
      })
  }, [conta, carregarCards, carregarTabela, carregarExecucoes])

  // Carga inicial + recarga ao trocar a conta (espelha a IIFE + reload da fonte).
  useEffect(() => {
    carregarCards()
    carregarExecucoes()
  }, [carregarCards, carregarExecucoes])

  // A tabela recarrega ao trocar conta/modulo/situacao (espelha os listeners
  // 'change' de #f-modulo/#f-status + a carga inicial da fonte).
  useEffect(() => {
    carregarTabela()
  }, [carregarTabela])

  // --- Gate de permissao (por consistencia; o layout ja faz o gate) ---------
  if (loading || loadingPerm) {
    return <div className="p-8 text-center text-slate-400">Carregando...</div>
  }
  if (userProfile && !temAcesso('financeiro')) {
    return <SemPermissao />
  }

  return (
    <>
      {/* Cabecalho: titulo + botao "rodar todos" */}
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800">Monitor de Qualidade dos Dados</h1>
          <p className="text-sm text-slate-500 mt-1">Robôs que conferem se os lançamentos no Omie estão completos (categoria, departamento, cliente/fornecedor, custo, valor).</p>
        </div>
        <button
          type="button"
          onClick={() => rodar(null)}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-sm font-bold rounded shadow"
        >
          {rodandoTudo ? '⏳ rodando…' : '▶ Rodar todos os robôs agora'}
        </button>
      </div>

      {/* Aviso de setup (oculto enquanto avisoSetup === '') */}
      {avisoSetup ? (
        <div className="mb-4 p-3 rounded-lg bg-amber-100 border-2 border-amber-300 text-amber-900 text-sm font-semibold">
          {avisoSetup}
        </div>
      ) : null}

      {/* Cards por modulo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cardsErro ? (
          <div className="text-red-600 text-sm">{cardsErro}</div>
        ) : resumo === null ? (
          <div className="text-slate-400 text-sm">Carregando…</div>
        ) : (
          MODULOS.map((m) => {
            const r = (resumo && resumo[m]) || { total: 0, alta: 0, media: 0, baixa: 0 }
            const cls = MODULO_CLS[m]
            const rodando = !!rodandoModulo[m]
            return (
              <div key={m} className={cls.card}>
                <div className={cls.titulo}>{MODULO_LABEL[m]}</div>
                <div className={'text-5xl font-extrabold mt-2 ' + (r.total > 0 ? cls.totalComAlerta : 'text-slate-300')}>{r.total}</div>
                <div className="text-xs text-slate-600 mt-2">
                  <span className="font-bold text-red-700">{r.alta || 0} alta</span>{' · '}
                  <span className="font-bold text-amber-700">{r.media || 0} média</span>{' · '}
                  <span className="text-slate-500">{r.baixa || 0} baixa</span>
                </div>
                <button type="button" onClick={() => rodar(m)} className={cls.btn}>
                  {rodando ? '⏳ rodando…' : '▶ Rodar agora'}
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Filtros + tabela de anomalias */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <h2 className="text-lg font-extrabold text-slate-700">Anomalias</h2>
          <label className="text-xs text-slate-500 ml-auto">Módulo</label>
          <select
            value={fModulo}
            onChange={(e) => setFModulo(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="">Todos</option>
            <option value="contas_pagar">Contas a Pagar</option>
            <option value="contas_receber">Contas a Receber</option>
            <option value="faturamento">Faturamento / Vendas</option>
            <option value="compras">Compras / Notas de Entrada</option>
          </select>
          <label className="text-xs text-slate-500">Situação</label>
          <select
            value={fStatus}
            onChange={(e) => setFStatus(e.target.value)}
            className="border border-slate-300 rounded px-2 py-1 text-sm"
          >
            <option value="aberta">Abertas</option>
            <option value="resolvida">Resolvidas</option>
            <option value="ignorada">Ignoradas</option>
            <option value="todas">Todas</option>
          </select>
        </div>
        <div className="text-xs text-slate-500 mb-2">{tabelaStatus}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="py-2 pr-3">Severidade</th>
                <th className="py-2 pr-3">Módulo</th>
                <th className="py-2 pr-3">Conta</th>
                <th className="py-2 pr-3">Problema</th>
                <th className="py-2 pr-3">Documento</th>
                <th className="py-2 pr-3">Data</th>
                <th className="py-2 pr-3 text-right">Valor</th>
                <th className="py-2 pr-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {anomalias.map((a) => {
                const hint = hintDetalhe(a)
                return (
                  <tr key={a.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-3 align-top">
                      <span className={'px-2 py-0.5 rounded-full text-xs font-bold border ' + (SEV_BADGE[a.severidade] || SEV_BADGE.baixa)}>{a.severidade}</span>
                    </td>
                    <td className="py-2 pr-3 text-slate-700 align-top">{MODULO_LABEL[a.modulo] || a.modulo}</td>
                    <td className="py-2 pr-3 text-slate-600 align-top">{a.conta_omie}</td>
                    <td className="py-2 pr-3 align-top">
                      <div className="font-semibold text-slate-800">{REGRA_LABEL[a.regra] || a.regra}</div>
                      {hint ? <div className="text-xs text-slate-500 mt-0.5">{hint}</div> : null}
                    </td>
                    <td className="py-2 pr-3 text-slate-600 align-top">{a.registro_ref || '—'}</td>
                    <td className="py-2 pr-3 text-slate-600">{fmtData(a.data_ref)}</td>
                    <td className="py-2 pr-3 text-right text-slate-700">{fmtBRL(a.valor)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {a.status === 'aberta' ? (
                        <>
                          <button type="button" onClick={() => marcar(a.id, 'ignorada')}
                            className="text-xs text-slate-500 hover:text-slate-800 underline">ignorar</button>{' '}
                          <button type="button" onClick={() => marcar(a.id, 'resolvida')}
                            className="text-xs text-emerald-700 hover:text-emerald-900 underline ml-2">resolver</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => marcar(a.id, 'aberta')}
                          className="text-xs text-sky-700 hover:text-sky-900 underline">reabrir</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ultimas execucoes dos robos */}
      <div className="mt-6">
        <h2 className="text-lg font-extrabold text-slate-700 mb-2">Últimas execuções dos robôs</h2>
        <div className="text-xs text-slate-600">
          {execStatus ? (
            execStatus
          ) : execLista.length === 0 ? (
            'Nenhuma execução registrada ainda.'
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
              {execLista.slice(0, 16).map((l, i) => {
                const quando = l.fim ? new Date(l.fim).toLocaleString('pt-BR') : (l.inicio ? new Date(l.inicio).toLocaleString('pt-BR') : '—')
                const cor = l.status === 'erro' ? 'text-red-600' : 'text-slate-600'
                return (
                  <div key={i} className={cor}>
                    {quando}{' · '}
                    <b>{MODULO_LABEL[l.modulo] || l.modulo}</b>{' '}{l.conta_omie}{' · '}
                    {l.status === 'erro'
                      ? ('ERRO: ' + (l.erro || ''))
                      : ('novas ' + (l.anomalias_novas || 0) + ', resolvidas ' + (l.anomalias_resolvidas || 0) + ', abertas ' + (l.abertas_total || 0))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
