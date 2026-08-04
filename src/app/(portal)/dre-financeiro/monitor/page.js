'use client'
// =============================================================================
// Tela Monitor de Qualidade (port FIEL de views/monitor.ejs do
// financeiro-omie-dashboard), com extensoes do portal:
//  - Colunas "Incluido Por", "Vencimento" e "Inclusao" (vem de
//    contas_pagar/contas_receber via enriquecimento no route; faturamento/
//    compras nao tem esses campos -> "—").
//  - Cabecalho da tabela ORDENAVEL (A-Z/Z-A) + FILTRO por coluna.
//  - Selecao de linhas -> "Criar tarefa de correcao" (/tarefas), com o
//    responsavel PRE-SELECIONADO pelo "Incluido Por" da linha (quando casa com
//    um usuario do portal). A linha encaminhada ganha o selo "enviado".
//
// Comportamento original preservado: cards por modulo, "rodar robos", filtros
// globais (Modulo/Situacao), acoes ignorar/resolver/reabrir e "ultimas
// execucoes". A tela NAO usa libs de grafico (apenas markup + Tailwind).
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
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
// Ordem de severidade p/ ordenacao (alta > media > baixa).
const SEV_RANK = { alta: 3, media: 2, baixa: 1 }

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
// norm: p/ filtros de texto (trim + lower + sem acento).
function norm(s) {
  return String(s == null ? '' : s).trim().toLowerCase().normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
}
// decodeEnt: a Omie devolve texto HTML-escapado (ex.: "FABIO & ASSOC" vira
// "FABIO &amp; ASSOC"). Desescapa as entidades comuns p/ exibir/gravar limpo.
function decodeEnt(s) {
  if (s == null) return s
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
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

// ---------------------------------------------------------------------------
// Colunas ordenaveis/filtraveis da tabela de anomalias.
//  tipo 'menu'  -> filtro por <select> com valores distintos presentes
//  tipo 'texto' -> filtro por <input> (contem, sem acento)
// texto(a) = valor visivel usado tanto no filtro quanto como opcao do menu.
// sort(a)  = valor comparavel para ordenar (numero p/ valor/severidade; ISO p/
//            datas; string p/ o resto).
// ---------------------------------------------------------------------------
const COLUNAS = [
  { key: 'severidade', label: 'Severidade', tipo: 'menu', align: 'left',
    texto: (a) => a.severidade || '', sort: (a) => SEV_RANK[a.severidade] || 0, num: true },
  { key: 'modulo', label: 'Módulo', tipo: 'menu', align: 'left',
    texto: (a) => MODULO_LABEL[a.modulo] || a.modulo || '', sort: (a) => MODULO_LABEL[a.modulo] || a.modulo || '' },
  { key: 'conta', label: 'Conta', tipo: 'menu', align: 'left',
    texto: (a) => a.conta_omie || '', sort: (a) => a.conta_omie || '' },
  { key: 'problema', label: 'Problema', tipo: 'texto', align: 'left',
    texto: (a) => (REGRA_LABEL[a.regra] || a.regra || '') + ' ' + decodeEnt(hintDetalhe(a)), sort: (a) => REGRA_LABEL[a.regra] || a.regra || '' },
  { key: 'documento', label: 'Documento', tipo: 'texto', align: 'left',
    texto: (a) => decodeEnt(a.registro_ref) || '', sort: (a) => decodeEnt(a.registro_ref) || '' },
  { key: 'incluido', label: 'Incluído Por', tipo: 'texto', align: 'left',
    texto: (a) => decodeEnt(a.incluido_por_nome) || '', sort: (a) => decodeEnt(a.incluido_por_nome) || '' },
  { key: 'dataRef', label: 'Data', tipo: 'texto', align: 'left',
    texto: (a) => fmtData(a.data_ref), sort: (a) => String(a.data_ref || '').slice(0, 10) },
  { key: 'vencimento', label: 'Vencimento', tipo: 'texto', align: 'left',
    texto: (a) => fmtData(a.data_vencimento), sort: (a) => String(a.data_vencimento || '').slice(0, 10) },
  { key: 'inclusao', label: 'Inclusão', tipo: 'texto', align: 'left',
    texto: (a) => fmtData(a.data_inclusao), sort: (a) => String(a.data_inclusao || '').slice(0, 10) },
  { key: 'valor', label: 'Valor', tipo: 'texto', align: 'right',
    texto: (a) => fmtBRL(a.valor), sort: (a) => Number(a.valor) || 0, num: true },
]

export default function MonitorPage() {
  const { userProfile, loading } = useAuth()
  const { temAcesso, pode, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const { conta } = useDreConta()

  // --- Estado (espelha as vars/elementos do IIFE da fonte) ------------------
  const [avisoSetup, setAvisoSetup] = useState('')   // texto do aviso de setup (#aviso-setup); '' = oculto
  const [resumo, setResumo] = useState(null)          // d.resumo dos cards; null = "Carregando…"
  const [cardsErro, setCardsErro] = useState('')      // erro de fetch dos cards

  const [fModulo, setFModulo] = useState('')          // filtro #f-modulo ('' = Todos)
  const [fStatus, setFStatus] = useState('aberta')    // filtro #f-status (default 'aberta')
  const [tabelaStatus, setTabelaStatus] = useState('') // texto #tabela-status (contagem / "Carregando…" / erro)
  const [anomalias, setAnomalias] = useState([])       // linhas da tabela (ja enriquecidas)

  const [execStatus, setExecStatus] = useState('')     // texto/erro de #execucoes (vazio = lista normal)
  const [execLista, setExecLista] = useState([])       // d.ultimos das execucoes

  const [rodandoTudo, setRodandoTudo] = useState(false) // botao "rodar todos"
  const [rodandoModulo, setRodandoModulo] = useState({}) // { [modulo]: true } enquanto roda

  // Ordenacao + filtros por coluna (cabecalho).
  const [sortCol, setSortCol] = useState('')           // key da coluna ordenada ('' = ordem do route)
  const [sortDir, setSortDir] = useState('asc')        // 'asc' | 'desc'
  const [filtros, setFiltros] = useState({})           // { [key]: string }

  // Selecao de linhas + criacao de tarefa de correcao.
  const [selecionadas, setSelecionadas] = useState(() => new Set())
  const [usuarios, setUsuarios] = useState([])         // [{ id, nome }] p/ o <select> de responsavel
  const [modalAberto, setModalAberto] = useState(false)
  const [modalItens, setModalItens] = useState([])     // [{ anomalia, atribuido_a }]
  const [modalPrazo, setModalPrazo] = useState('')
  const [enviando, setEnviando] = useState(false)

  // =========================================================================
  // carregarCards(): GET /monitor/anomalias?conta=&status=aberta -> resumo
  // =========================================================================
  const carregarCards = useCallback(() => {
    fetch('/api/dre-financeiro/monitor/anomalias?conta=' + encodeURIComponent(conta) + '&status=aberta')
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) {
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
        setSelecionadas(new Set()) // recarga limpa a selecao
      })
      .catch((e) => { setTabelaStatus('Erro: ' + e.message); setAnomalias([]) })
  }, [conta, fModulo, fStatus])

  // Lista de usuarios do portal (mesmo endpoint do /tarefas).
  const carregarUsuarios = useCallback(() => {
    fetch('/api/tarefas/users')
      .then((r) => r.json())
      .then((d) => setUsuarios(Array.isArray(d) ? d : (d.users || d.usuarios || [])))
      .catch(() => setUsuarios([]))
  }, [])

  // =========================================================================
  // carregarExecucoes(): GET /monitor/status -> d.ultimos
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
  // =========================================================================
  const marcar = useCallback((id, status) => {
    fetch('/api/dre-financeiro/monitor/anomalia/' + encodeURIComponent(id) + '/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    }).then((r) => r.json()).then(() => { carregarTabela(); carregarCards() })
  }, [carregarTabela, carregarCards])

  // =========================================================================
  // rodar(modulo): POST /monitor/run?conta=&modulo= -> apos 2.5s recarrega tudo
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
        if (modulo) setRodandoModulo((s) => ({ ...s, [modulo]: false }))
        else setRodandoTudo(false)
      })
  }, [conta, carregarCards, carregarTabela, carregarExecucoes])

  // Carga inicial + recarga ao trocar a conta.
  useEffect(() => {
    carregarCards()
    carregarExecucoes()
    carregarUsuarios()
  }, [carregarCards, carregarExecucoes, carregarUsuarios])

  // A tabela recarrega ao trocar conta/modulo/situacao.
  useEffect(() => {
    carregarTabela()
  }, [carregarTabela])

  // -------------------------------------------------------------------------
  // Cabecalho: ordenacao + filtro. Aplicados no cliente sobre `anomalias`
  // (a lista ja vem completa do route).
  // -------------------------------------------------------------------------
  const clicarCabecalho = useCallback((key) => {
    // Nao aninhar setSortDir dentro do updater de setSortCol: sob StrictMode
    // (dev) o updater roda 2x e o toggle cancelaria a si mesmo. Decidimos aqui
    // com base no estado atual do closure.
    if (sortCol === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(key); setSortDir('asc') }
  }, [sortCol])
  const setaCol = (key) => (sortCol !== key ? '⇅' : (sortDir === 'asc' ? '▲' : '▼'))
  const setFiltro = (key, val) => setFiltros((f) => ({ ...f, [key]: val }))

  // Opcoes distintas p/ os filtros tipo 'menu' (sobre TODAS as anomalias).
  const opcoesMenu = useMemo(() => {
    const m = {}
    for (const col of COLUNAS) {
      if (col.tipo !== 'menu') continue
      const set = new Set()
      for (const a of anomalias) { const v = col.texto(a); if (v) set.add(v) }
      m[col.key] = Array.from(set).sort((x, y) => x.localeCompare(y, 'pt-BR'))
    }
    return m
  }, [anomalias])

  const linhasVisiveis = useMemo(() => {
    let rows = anomalias
    // filtros por coluna
    const ativos = COLUNAS.filter((c) => (filtros[c.key] || '').trim() !== '')
    if (ativos.length) {
      rows = rows.filter((a) => ativos.every((c) => {
        const alvo = filtros[c.key]
        if (c.tipo === 'menu') return c.texto(a) === alvo
        return norm(c.texto(a)).includes(norm(alvo))
      }))
    }
    // ordenacao
    if (sortCol) {
      const col = COLUNAS.find((c) => c.key === sortCol)
      if (col) {
        const dir = sortDir === 'asc' ? 1 : -1
        rows = [...rows].sort((a, b) => {
          const va = col.sort(a), vb = col.sort(b)
          if (col.num) return (Number(va) - Number(vb)) * dir
          return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true }) * dir
        })
      }
    }
    return rows
  }, [anomalias, filtros, sortCol, sortDir])

  // Ids visiveis ainda NAO encaminhados (elegiveis a selecao/enviar).
  const idsSelecionaveis = useMemo(
    () => linhasVisiveis.filter((a) => !a.tarefa_id).map((a) => a.id),
    [linhasVisiveis],
  )
  const todosSelecionados = idsSelecionaveis.length > 0 && idsSelecionaveis.every((id) => selecionadas.has(id))

  const toggleLinha = (id) => setSelecionadas((s) => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n
  })
  const toggleTodos = () => setSelecionadas((s) => {
    if (todosSelecionados) return new Set()
    return new Set(idsSelecionaveis)
  })

  // -------------------------------------------------------------------------
  // Criar tarefa de correcao: abre o modal com uma linha por anomalia
  // selecionada, cada uma com o responsavel pre-selecionado (sugestao).
  // -------------------------------------------------------------------------
  const abrirModal = () => {
    const itens = anomalias
      .filter((a) => selecionadas.has(a.id) && !a.tarefa_id)
      .map((a) => ({ anomalia: a, atribuido_a: a.sugestao_atribuido_a || '' }))
    if (!itens.length) return
    setModalItens(itens)
    setModalPrazo('')
    setModalAberto(true)
  }
  const setItemUsuario = (id, uid) => setModalItens((its) => its.map(
    (it) => (it.anomalia.id === id ? { ...it, atribuido_a: uid } : it),
  ))

  const tituloTarefa = (a) => 'Corrigir: ' + (REGRA_LABEL[a.regra] || a.regra) + (a.registro_ref ? ' — ' + decodeEnt(a.registro_ref) : '')
  const descricaoTarefa = (a) => {
    const linhas = [
      'Anomalia detectada pelo Monitor de Qualidade dos Dados.',
      'Módulo: ' + (MODULO_LABEL[a.modulo] || a.modulo),
      'Conta: ' + (a.conta_omie || '—'),
      'Documento: ' + (decodeEnt(a.registro_ref) || '—'),
      'Valor: ' + fmtBRL(a.valor),
    ]
    if (a.data_vencimento) linhas.push('Vencimento: ' + fmtData(a.data_vencimento))
    if (a.incluido_por_nome) linhas.push('Incluído por: ' + decodeEnt(a.incluido_por_nome))
    const hint = hintDetalhe(a)
    if (hint) linhas.push('Detalhe: ' + decodeEnt(hint))
    return linhas.join('\n')
  }

  const confirmarEnvio = async () => {
    if (!userProfile?.id) return
    setEnviando(true)
    try {
      for (const it of modalItens) {
        const a = it.anomalia
        const resp = await fetch('/api/dre-financeiro/monitor/anomalia/' + encodeURIComponent(a.id) + '/tarefa', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            titulo: tituloTarefa(a),
            descricao: descricaoTarefa(a),
            criado_por: userProfile.id,
            atribuido_a: it.atribuido_a || null,
            prazo: modalPrazo || undefined,
            prioridade: 2,
          }),
        })
        const d = await resp.json().catch(() => ({}))
        if (!resp.ok || d.erro) throw new Error(d.erro || ('HTTP ' + resp.status))
      }
      setModalAberto(false)
      setSelecionadas(new Set())
      carregarTabela()
    } catch (e) {
      alert('Erro ao criar tarefa(s): ' + e.message)
    } finally {
      setEnviando(false)
    }
  }

  // --- Gate de permissao (por consistencia; o layout ja faz o gate) ---------
  if (loading || loadingPerm) {
    return <div className="p-8 text-center text-slate-400">Carregando...</div>
  }
  if (userProfile && (!temAcesso('financeiro') && !pode('dre', 'monitor'))) {
    return <SemPermissao />
  }

  const nSel = selecionadas.size

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
          {nSel > 0 ? (
            <button
              type="button"
              onClick={abrirModal}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded shadow"
            >
              ✉ Criar tarefa de correção ({nSel})
            </button>
          ) : null}
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
        <div className="text-xs text-slate-500 mb-2">
          {tabelaStatus}
          {anomalias.length !== linhasVisiveis.length ? ' — ' + linhasVisiveis.length + ' após filtros' : ''}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-200 align-bottom">
                {/* checkbox selecionar todos */}
                <th className="py-2 pr-2 w-8">
                  <input
                    type="checkbox"
                    checked={todosSelecionados}
                    onChange={toggleTodos}
                    disabled={idsSelecionaveis.length === 0}
                    title="Selecionar todas as linhas visíveis (não enviadas)"
                  />
                </th>
                {COLUNAS.map((col) => (
                  <th key={col.key} className={'py-2 pr-3 ' + (col.align === 'right' ? 'text-right' : '')}>
                    <button
                      type="button"
                      onClick={() => clicarCabecalho(col.key)}
                      className="inline-flex items-center gap-1 font-semibold hover:text-slate-800"
                      title="Ordenar A-Z / Z-A"
                    >
                      {col.label}
                      <span className="text-[10px] text-slate-400">{setaCol(col.key)}</span>
                    </button>
                    <div className="mt-1">
                      {col.tipo === 'menu' ? (
                        <select
                          value={filtros[col.key] || ''}
                          onChange={(e) => setFiltro(col.key, e.target.value)}
                          className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs font-normal"
                        >
                          <option value="">Todos</option>
                          {(opcoesMenu[col.key] || []).map((o) => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={filtros[col.key] || ''}
                          onChange={(e) => setFiltro(col.key, e.target.value)}
                          placeholder="filtrar…"
                          className="w-full border border-slate-200 rounded px-1 py-0.5 text-xs font-normal"
                        />
                      )}
                    </div>
                  </th>
                ))}
                <th className="py-2 pr-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {linhasVisiveis.map((a) => {
                const hint = hintDetalhe(a)
                const enviado = !!a.tarefa_id
                return (
                  <tr key={a.id} className={'border-b border-slate-100 hover:bg-slate-50 ' + (enviado ? 'bg-emerald-50/40' : '')}>
                    <td className="py-2 pr-2 align-top">
                      {enviado ? (
                        <span className="text-emerald-600" title={'Enviado para correção' + (a.tarefa_criada_em ? ' em ' + new Date(a.tarefa_criada_em).toLocaleString('pt-BR') : '')}>✔</span>
                      ) : (
                        <input type="checkbox" checked={selecionadas.has(a.id)} onChange={() => toggleLinha(a.id)} />
                      )}
                    </td>
                    <td className="py-2 pr-3 align-top">
                      <span className={'px-2 py-0.5 rounded-full text-xs font-bold border ' + (SEV_BADGE[a.severidade] || SEV_BADGE.baixa)}>{a.severidade}</span>
                    </td>
                    <td className="py-2 pr-3 text-slate-700 align-top">{MODULO_LABEL[a.modulo] || a.modulo}</td>
                    <td className="py-2 pr-3 text-slate-600 align-top">{a.conta_omie}</td>
                    <td className="py-2 pr-3 align-top">
                      <div className="font-semibold text-slate-800">{REGRA_LABEL[a.regra] || a.regra}</div>
                      {hint ? <div className="text-xs text-slate-500 mt-0.5">{decodeEnt(hint)}</div> : null}
                    </td>
                    <td className="py-2 pr-3 text-slate-600 align-top">{decodeEnt(a.registro_ref) || '—'}</td>
                    <td className="py-2 pr-3 text-slate-600 align-top">{decodeEnt(a.incluido_por_nome) || '—'}</td>
                    <td className="py-2 pr-3 text-slate-600 align-top">{fmtData(a.data_ref)}</td>
                    <td className="py-2 pr-3 text-slate-600 align-top">{fmtData(a.data_vencimento)}</td>
                    <td className="py-2 pr-3 text-slate-600 align-top">{fmtData(a.data_inclusao)}</td>
                    <td className="py-2 pr-3 text-right text-slate-700 align-top">{fmtBRL(a.valor)}</td>
                    <td className="py-2 pr-3 whitespace-nowrap align-top">
                      {enviado ? (
                        <span className="text-xs text-emerald-700 font-semibold">✔ enviado</span>
                      ) : a.status === 'aberta' ? (
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

      {/* Modal: criar tarefa(s) de correcao */}
      {modalAberto ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !enviando && setModalAberto(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200">
              <h3 className="text-lg font-extrabold text-slate-800">Criar tarefa de correção</h3>
              <p className="text-xs text-slate-500 mt-1">Uma tarefa por anomalia. O responsável já vem pré-selecionado pelo &quot;Incluído Por&quot; quando identificado — ajuste se precisar.</p>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="flex items-center gap-2 mb-3">
                <label className="text-xs font-semibold text-slate-600">Prazo (opcional, para todas)</label>
                <input type="date" value={modalPrazo} onChange={(e) => setModalPrazo(e.target.value)}
                  className="border border-slate-300 rounded px-2 py-1 text-sm" />
              </div>
              <div className="space-y-2">
                {modalItens.map((it) => {
                  const a = it.anomalia
                  return (
                    <div key={a.id} className="border border-slate-200 rounded-lg p-3">
                      <div className="text-sm font-semibold text-slate-800">{REGRA_LABEL[a.regra] || a.regra}{a.registro_ref ? ' — ' + decodeEnt(a.registro_ref) : ''}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {(MODULO_LABEL[a.modulo] || a.modulo)} · {a.conta_omie} · {fmtBRL(a.valor)}
                        {a.data_vencimento ? ' · venc. ' + fmtData(a.data_vencimento) : ''}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <label className="text-xs text-slate-500">Responsável</label>
                        <select
                          value={it.atribuido_a || ''}
                          onChange={(e) => setItemUsuario(a.id, e.target.value)}
                          className="border border-slate-300 rounded px-2 py-1 text-sm flex-1"
                        >
                          <option value="">— escolher —</option>
                          {usuarios.map((u) => (
                            <option key={u.id} value={u.id}>{u.nome}</option>
                          ))}
                        </select>
                        {it.atribuido_a && a.sugestao_atribuido_a === it.atribuido_a ? (
                          <span className="text-[10px] text-emerald-600 font-semibold whitespace-nowrap">sugerido</span>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex items-center justify-end gap-2">
              <button type="button" onClick={() => setModalAberto(false)} disabled={enviando}
                className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900">Cancelar</button>
              <button type="button" onClick={confirmarEnvio} disabled={enviando}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-bold rounded shadow">
                {enviando ? '⏳ criando…' : 'Criar ' + modalItens.length + ' tarefa(s)'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
