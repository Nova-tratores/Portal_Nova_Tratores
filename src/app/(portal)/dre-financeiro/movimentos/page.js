'use client'
// =============================================================================
// Tela Movimentações de Conta Corrente (extrato financeiro Omie).
//
// Lê a tabela movimentos_cc (Supabase) via /api/dre-financeiro/movimentos e
// dispara a sincronização com o Omie via /api/dre-financeiro/movimentos/sync
// (janela por data de pagamento = período filtrado na tela).
//
//  - KPIs: Entradas (R), Saídas (P), Saldo do período e qtd de movimentos.
//  - Filtros: período (com atalhos), natureza, conta corrente e busca livre.
//  - Tabela ordenável; valor verde/vermelho conforme natureza; exportar CSV.
//  - codigo_titulo liga com contas_pagar/receber.codigo_lancamento — base para
//    o cruzamento com títulos (próxima etapa).
//
// O layout do módulo (.../dre-financeiro/layout.js) já aplica o seletor de
// CONTA (NOVA/CASTRO/TODAS) e o gate de permissão ('financeiro' ou dre:movimentos).
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatBRL, useDreConta } from '@/lib/dre-financeiro/format'

const VERDE = '#059669'
const VERMELHO = '#dc2626'

function toISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtData(iso) {
  if (!iso) return ''
  const p = String(iso).slice(0, 10).split('-')
  return `${p[2]}/${p[1]}/${p[0]}`
}
function docDe(m) {
  let doc = m.numero_documento_fiscal ? `NF ${m.numero_documento_fiscal}`
    : (m.numero_documento ? `Doc ${m.numero_documento}` : '')
  if (m.numero_parcela) doc += (doc ? ' · ' : '') + `Parc ${m.numero_parcela}`
  return doc
}
function empresaLabel(c) {
  const s = String(c || '').toUpperCase()
  if (s === 'NOVA') return 'Nova'
  if (s === 'CASTRO') return 'Castro'
  return c || '—'
}

function EmpresaBadge({ conta }) {
  const s = String(conta || '').toUpperCase()
  const cor = s === 'NOVA'
    ? { bg: '#dbeafe', fg: '#1e40af' }
    : s === 'CASTRO' ? { bg: '#f3e8ff', fg: '#6b21a8' } : { bg: '#f1f5f9', fg: '#334155' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
      fontSize: '11px', fontWeight: 700, background: cor.bg, color: cor.fg
    }}>
      {empresaLabel(conta)}
    </span>
  )
}

function NaturezaBadge({ natureza }) {
  const entrada = natureza === 'R'
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '6px',
      fontSize: '11px', fontWeight: 700,
      background: entrada ? '#d1fae5' : '#fee2e2',
      color: entrada ? '#065f46' : '#991b1b'
    }}>
      {entrada ? '↓ Entrada' : '↑ Saída'}
    </span>
  )
}

// Colunas da tabela (ordenáveis).
const COLUNAS = [
  { key: 'data', label: 'Data', align: 'left' },
  { key: 'empresa', label: 'Empresa', align: 'left' },
  { key: 'natureza', label: 'Tipo', align: 'left' },
  { key: 'nome', label: 'Contraparte', align: 'left' },
  { key: 'doc', label: 'Documento', align: 'left' },
  { key: 'categoria', label: 'Categoria', align: 'left' },
  { key: 'cc', label: 'Conta corrente', align: 'left' },
  { key: 'valor', label: 'Valor', align: 'right' },
]
function sortVal(m, key) {
  switch (key) {
    case 'data': return m.data_pagamento || ''
    case 'empresa': return empresaLabel(m.conta_omie)
    case 'natureza': return m.natureza || ''
    case 'nome': return (m.nome_cliente_fornecedor || '').toLowerCase()
    case 'doc': return m.numero_documento_fiscal || m.numero_documento || ''
    case 'categoria': return (m.descricao_categoria || '').toLowerCase()
    case 'cc': return (m.nome_conta_corrente || '').toLowerCase()
    case 'valor': return Number(m.valor_pago) || 0
  }
  return ''
}

const estiloInput = {
  padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: '8px',
  fontSize: '13px', color: '#1e293b', background: '#fff', outline: 'none'
}
const estiloAtalho = {
  padding: '4px 10px', borderRadius: '999px', border: '1px solid #cbd5e1',
  background: '#fff', color: '#475569', fontSize: '12px', cursor: 'pointer'
}

export default function MovimentosPage() {
  const { conta } = useDreConta()

  const agora = new Date()
  const [de, setDe] = useState(toISO(new Date(agora.getFullYear(), agora.getMonth(), 1)))
  const [ate, setAte] = useState(toISO(new Date(agora.getFullYear(), agora.getMonth() + 1, 0)))
  const [natureza, setNatureza] = useState('')
  const [cc, setCc] = useState('')
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState({ key: 'data', dir: 'desc' })

  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState(null)
  const [ccOptions, setCcOptions] = useState([])

  const [sync, setSync] = useState(null)
  const pollRef = useRef(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const qs = new URLSearchParams({ conta, de, ate })
      if (natureza) qs.set('natureza', natureza)
      if (cc) qs.set('cc', cc)
      const r = await fetch(`/api/dre-financeiro/movimentos?${qs.toString()}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`)
      setDados(j)
      // Mantém o dropdown de conta corrente completo: só atualiza a lista quando
      // a consulta veio sem o filtro de CC aplicado.
      if (!cc) setCcOptions(j.contasCorrentes || [])
    } catch (e) {
      setErro(e.message)
    } finally {
      setLoading(false)
    }
  }, [conta, de, ate, natureza, cc])

  useEffect(() => { carregar() }, [carregar])

  // ---- Modo Antecipações: operações de desconto de duplicatas ----
  // Reconstruídas pela API a partir da CC "Omie Desconto de Duplicatas":
  // cheio/juros/líquido/taxa por operação são exatos; o líquido POR DUPLICATA
  // é rateio pela taxa da operação (o Omie cobra o deságio por lote).
  const [modo, setModo] = useState('extrato') // 'extrato' | 'antecipacoes'
  const [ant, setAnt] = useState(null)
  const [antLoading, setAntLoading] = useState(false)
  const [antErro, setAntErro] = useState(null)

  const carregarAnt = useCallback(async () => {
    setAntLoading(true)
    setAntErro(null)
    try {
      const qs = new URLSearchParams({ conta, de, ate })
      const r = await fetch(`/api/dre-financeiro/movimentos/antecipacoes?${qs.toString()}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`)
      setAnt(j)
    } catch (e) {
      setAntErro(e.message)
    } finally {
      setAntLoading(false)
    }
  }, [conta, de, ate])

  useEffect(() => { if (modo === 'antecipacoes') carregarAnt() }, [modo, carregarAnt])

  // ---- Sync com o Omie (dispara + polling do estado) ----
  const pararPoll = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }, [])

  const iniciarPoll = useCallback(() => {
    pararPoll()
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch('/api/dre-financeiro/movimentos/sync')
        const j = await r.json()
        setSync(j)
        if (!j.rodando) {
          pararPoll()
          carregar()
          carregarAnt()
        }
      } catch { /* tenta de novo no próximo tick */ }
    }, 3000)
  }, [pararPoll, carregar, carregarAnt])

  useEffect(() => {
    // Se já houver um sync rodando (disparado antes / em outra aba), retoma o polling.
    fetch('/api/dre-financeiro/movimentos/sync')
      .then((r) => r.json())
      .then((j) => { setSync(j); if (j.rodando) iniciarPoll() })
      .catch(() => {})
    return pararPoll
  }, [iniciarPoll, pararPoll])

  async function sincronizar() {
    try {
      const qs = new URLSearchParams({ conta, de, ate })
      const r = await fetch(`/api/dre-financeiro/movimentos/sync?${qs.toString()}`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`)
      setSync({ rodando: true, contas: {} })
      iniciarPoll()
    } catch (e) {
      alert(`Erro ao iniciar sync: ${e.message}`)
    }
  }

  // ---- Atalhos de período ----
  function setPeriodo(dDe, dAte) { setDe(toISO(dDe)); setAte(toISO(dAte)) }
  const atalhos = [
    { label: 'Mês atual', fn: () => setPeriodo(new Date(agora.getFullYear(), agora.getMonth(), 1), new Date(agora.getFullYear(), agora.getMonth() + 1, 0)) },
    { label: 'Mês anterior', fn: () => setPeriodo(new Date(agora.getFullYear(), agora.getMonth() - 1, 1), new Date(agora.getFullYear(), agora.getMonth(), 0)) },
    { label: '90 dias', fn: () => { const d = new Date(agora); d.setDate(d.getDate() - 90); setPeriodo(d, agora) } },
    { label: 'Ano', fn: () => setPeriodo(new Date(agora.getFullYear(), 0, 1), new Date(agora.getFullYear(), 11, 31)) },
  ]

  // ---- Filtro de busca + ordenação (client-side) ----
  const linhas = useMemo(() => {
    let arr = dados?.movimentos || []
    const q = busca.trim().toLowerCase()
    if (q) {
      arr = arr.filter((m) => [
        m.nome_cliente_fornecedor, m.numero_documento, m.numero_documento_fiscal,
        m.descricao_categoria, m.grupo_categoria, m.nome_conta_corrente, m.origem, m.status
      ].some((v) => v && String(v).toLowerCase().includes(q)))
    }
    const { key, dir } = ordem
    const mult = dir === 'asc' ? 1 : -1
    return [...arr].sort((a, b) => {
      const va = sortVal(a, key)
      const vb = sortVal(b, key)
      if (va < vb) return -1 * mult
      if (va > vb) return 1 * mult
      return 0
    })
  }, [dados, busca, ordem])

  const totaisFiltro = useMemo(() => {
    let entradas = 0, saidas = 0
    linhas.forEach((m) => {
      const v = Number(m.valor_pago) || 0
      if (m.natureza === 'R') entradas += v
      else saidas += v
    })
    return { entradas, saidas, saldo: entradas - saidas }
  }, [linhas])

  function toggleOrdem(key) {
    setOrdem((o) => o.key === key ? { key, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'valor' || key === 'data' ? 'desc' : 'asc' })
  }

  // Operações filtradas pela busca (por cliente das duplicatas).
  const opsFiltradas = useMemo(() => {
    let arr = ant?.operacoes || []
    const q = busca.trim().toLowerCase()
    if (q) arr = arr.filter((o) => (o.duplicatas || []).some((d) => (d.cliente || '').toLowerCase().includes(q)))
    return arr
  }, [ant, busca])

  function exportarCSV() {
    if (modo === 'antecipacoes') return exportarCSVAntecipacoes()
    const cab = ['Data', 'Empresa', 'Tipo', 'Contraparte', 'Documento', 'Categoria', 'Grupo', 'Conta corrente', 'Valor', 'Juros', 'Multa', 'Desconto', 'Cod. título']
    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
    const linhasCsv = linhas.map((m) => [
      fmtData(m.data_pagamento), empresaLabel(m.conta_omie),
      m.natureza === 'R' ? 'Entrada' : 'Saída',
      m.nome_cliente_fornecedor || '', docDe(m),
      m.descricao_categoria || '', m.grupo_categoria || '',
      m.nome_conta_corrente || '',
      String(Number(m.valor_pago) || 0).replace('.', ','),
      String(Number(m.juros) || 0).replace('.', ','),
      String(Number(m.multa) || 0).replace('.', ','),
      String(Number(m.desconto) || 0).replace('.', ','),
      m.codigo_titulo || '',
    ].map(esc).join(';'))
    const csv = '﻿' + [cab.map(esc).join(';'), ...linhasCsv].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `movimentacoes_${de}_${ate}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function exportarCSVAntecipacoes() {
    const cab = ['Data operação', 'Empresa', 'Taxa %', 'Cliente', 'Entrada na conta', 'Valor original', 'Usado na operação', 'Líquido estimado']
    const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`
    const num = (v) => String(Math.round((Number(v) || 0) * 100) / 100).replace('.', ',')
    const linhasCsv = []
    opsFiltradas.forEach((o) => {
      o.duplicatas.forEach((d) => {
        linhasCsv.push([
          fmtData(o.data), empresaLabel(o.conta_omie), num(o.taxaPct),
          d.cliente, fmtData(d.dataEntrada), num(d.valorOriginal), num(d.valorNaOperacao), num(d.liquidoEstimado),
        ].map(esc).join(';'))
      })
    })
    const csv = '﻿' + [cab.map(esc).join(';'), ...linhasCsv].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `antecipacoes_${de}_${ate}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const rodando = !!sync?.rodando
  const statusSync = rodando
    ? Object.values(sync?.contas || {})
        .filter((s) => s.rodando)
        .map((s) => `${s.label || ''}: ${s.etapa || '...'}${s.totalPaginas ? ` (pág ${s.paginaAtual}/${s.totalPaginas})` : ''} · ${s.registrosSalvos || 0} salvos`)
        .join(' | ') || 'iniciando...'
    : null
  const erroSync = !rodando && sync?.contas
    ? Object.values(sync.contas).map((s) => s.erro).filter(Boolean)[0]
    : null

  const kpis = [
    { label: 'Entradas', valor: dados?.totais?.entradas || 0, cor: VERDE },
    { label: 'Saídas', valor: dados?.totais?.saidas || 0, cor: VERMELHO },
    { label: 'Saldo do período', valor: dados?.totais?.saldo || 0, cor: (dados?.totais?.saldo || 0) >= 0 ? VERDE : VERMELHO },
    { label: 'Movimentos', valor: dados?.totais?.qtd || 0, cor: '#334155', inteiro: true },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Cabeçalho + ações */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>💳 Movimentações de Conta Corrente</h1>
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
            Extrato dos movimentos financeiros do Omie (por data de pagamento). Sincronize o período para atualizar.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'inline-flex', borderRadius: '8px', overflow: 'hidden', border: '1px solid #10B981' }}>
            {[['extrato', 'Extrato'], ['antecipacoes', 'Antecipações']].map(([id, label], i) => (
              <button key={id} type="button" onClick={() => setModo(id)} style={{
                padding: '6px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                border: 'none', borderLeft: i ? '1px solid #10B981' : 'none',
                background: modo === id ? '#10B981' : '#fff', color: modo === id ? '#fff' : '#047857'
              }}>{label}</button>
            ))}
          </div>
          <button type="button" onClick={exportarCSV}
            disabled={modo === 'antecipacoes' ? !opsFiltradas.length : !linhas.length}
            style={{
              ...estiloAtalho,
              opacity: (modo === 'antecipacoes' ? opsFiltradas.length : linhas.length) ? 1 : 0.5
            }}>
            ⬇️ Exportar CSV
          </button>
          <button type="button" onClick={sincronizar} disabled={rodando} style={{
            padding: '7px 14px', borderRadius: '8px', border: 'none', cursor: rodando ? 'default' : 'pointer',
            background: rodando ? '#94a3b8' : '#10B981', color: '#fff', fontSize: '13px', fontWeight: 700
          }}>
            {rodando ? '⏳ Sincronizando...' : '🔄 Sincronizar período (Omie)'}
          </button>
        </div>
      </div>

      {/* Status do sync */}
      {rodando && (
        <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', fontSize: '12px' }}>
          Sincronizando com o Omie — {statusSync}. A lista atualiza sozinha ao terminar.
        </div>
      )}
      {erroSync && (
        <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: '12px' }}>
          Última sincronização terminou com erro: {erroSync}
        </div>
      )}

      {/* Migration pendente */}
      {dados?.precisaMigration && (
        <div style={{ padding: '12px 14px', borderRadius: '10px', background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '13px' }}>
          ⚠️ A tabela <b>movimentos_cc</b> ainda não existe no Supabase. Aplique a migration
          {' '}<b>sql/movimentos-cc.sql</b> no SQL Editor e depois clique em &quot;Sincronizar período&quot;.
        </div>
      )}

      {/* Filtros */}
      <div style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px',
        display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap'
      }}>
        <label style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
          De <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={estiloInput} />
        </label>
        <label style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
          Até <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={estiloInput} />
        </label>
        <div style={{ display: 'flex', gap: '6px' }}>
          {atalhos.map((a) => (
            <button key={a.label} type="button" onClick={a.fn} style={estiloAtalho}>{a.label}</button>
          ))}
        </div>
        {modo === 'extrato' && (
          <>
            <select value={natureza} onChange={(e) => setNatureza(e.target.value)} style={estiloInput}>
              <option value="">Entradas + Saídas</option>
              <option value="R">Só entradas (recebimentos)</option>
              <option value="P">Só saídas (pagamentos)</option>
            </select>
            <select value={cc} onChange={(e) => setCc(e.target.value)} style={{ ...estiloInput, maxWidth: '220px' }}>
              <option value="">Todas as contas correntes</option>
              {ccOptions.map((c) => (
                <option key={c.codigo} value={c.codigo}>{c.nome}</option>
              ))}
            </select>
          </>
        )}
        <input
          type="text"
          placeholder={modo === 'antecipacoes' ? '🔎 Buscar cliente da duplicata...' : '🔎 Buscar contraparte, documento, categoria...'}
          value={busca} onChange={(e) => setBusca(e.target.value)}
          style={{ ...estiloInput, flex: 1, minWidth: '220px' }}
        />
      </div>

      {modo === 'extrato' && (<>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px' }}>{k.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: k.cor, marginTop: '2px' }}>
              {k.inteiro ? (k.valor || 0).toLocaleString('pt-BR') : formatBRL(k.valor)}
            </div>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Carregando...</div>
        ) : erro ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#991b1b', fontSize: '13px' }}>Erro: {erro}</div>
        ) : linhas.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
            Nenhum movimento no período.
            {!dados?.precisaMigration && ' Clique em "Sincronizar período (Omie)" para buscar os movimentos.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {COLUNAS.map((c) => (
                    <th
                      key={c.key} onClick={() => toggleOrdem(c.key)}
                      style={{
                        padding: '8px 12px', textAlign: c.align, cursor: 'pointer', whiteSpace: 'nowrap',
                        fontSize: '11px', fontWeight: 700, color: ordem.key === c.key ? '#0f172a' : '#64748b',
                        textTransform: 'uppercase', letterSpacing: '.4px', userSelect: 'none'
                      }}
                    >
                      {c.label}{ordem.key === c.key ? (ordem.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map((m) => {
                  const entrada = m.natureza === 'R'
                  return (
                    <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '7px 12px', whiteSpace: 'nowrap', color: '#334155' }}>{fmtData(m.data_pagamento)}</td>
                      <td style={{ padding: '7px 12px' }}><EmpresaBadge conta={m.conta_omie} /></td>
                      <td style={{ padding: '7px 12px' }}><NaturezaBadge natureza={m.natureza} /></td>
                      <td style={{ padding: '7px 12px', color: '#1e293b', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.nome_cliente_fornecedor || ''}>
                        {m.nome_cliente_fornecedor || <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 12px', color: '#475569', whiteSpace: 'nowrap' }}>{docDe(m) || '—'}</td>
                      <td style={{ padding: '7px 12px', color: '#475569', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${m.grupo_categoria || ''} > ${m.descricao_categoria || ''}`}>
                        {m.descricao_categoria || <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 12px', color: '#475569', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.nome_conta_corrente || ''}>
                        {m.nome_conta_corrente || <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ padding: '7px 12px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: entrada ? VERDE : VERMELHO }}>
                        {entrada ? '+' : '−'} {formatBRL(m.valor_pago)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0', fontWeight: 700 }}>
                  <td colSpan={7} style={{ padding: '8px 12px', color: '#475569', fontSize: '12px' }}>
                    {linhas.length.toLocaleString('pt-BR')} movimento(s) no filtro ·
                    entradas {formatBRL(totaisFiltro.entradas)} · saídas {formatBRL(totaisFiltro.saidas)}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap', color: totaisFiltro.saldo >= 0 ? VERDE : VERMELHO }}>
                    {formatBRL(totaisFiltro.saldo)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
      </>)}

      {modo === 'antecipacoes' && (<>
      {/* KPIs das antecipações */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
        {[
          { label: 'Valor antecipado (cheio)', valor: ant?.totais?.valorCheio || 0, cor: '#334155' },
          { label: 'Juros pagos', valor: ant?.totais?.juros || 0, cor: VERMELHO },
          { label: 'Líquido recebido', valor: ant?.totais?.liquido || 0, cor: VERDE },
          { label: 'Taxa média', valor: ant?.totais?.taxaMediaPct || 0, cor: '#7c3aed', pct: true },
        ].map((k) => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.5px' }}>{k.label}</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: k.cor, marginTop: '2px' }}>
              {k.pct ? `${(k.valor || 0).toFixed(2).replace('.', ',')}%` : formatBRL(k.valor)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: '11px', color: '#94a3b8' }}>
        {ant?.totais ? `${ant.totais.operacoes} operação(ões) · ${ant.totais.duplicatas} duplicata(s) no período. ` : ''}
        Valor cheio, juros e líquido de cada operação são exatos (extrato da conta &quot;Omie Desconto de Duplicatas&quot;);
        o líquido por duplicata é estimado pelo rateio da taxa da operação — o Omie cobra o deságio por lote, não por duplicata.
      </div>

      {/* Operações de desconto */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {antLoading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>Carregando...</div>
        ) : antErro ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#991b1b', fontSize: '13px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>Erro: {antErro}</div>
        ) : opsFiltradas.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px' }}>
            Nenhuma operação de desconto de duplicatas no período.
          </div>
        ) : opsFiltradas.map((o, i) => (
          <details key={`${o.data}-${o.conta_omie}-${i}`} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', overflow: 'hidden' }}>
            <summary style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>{fmtData(o.data)}</span>
              <EmpresaBadge conta={o.conta_omie} />
              <span style={{ fontSize: '12px', color: '#64748b' }}>{o.duplicatas.length} duplicata(s)</span>
              <span style={{ marginLeft: 'auto', fontSize: '13px', color: '#334155', whiteSpace: 'nowrap' }}>
                cheio <b>{formatBRL(o.valorCheio)}</b>
              </span>
              <span style={{ fontSize: '13px', color: VERMELHO, whiteSpace: 'nowrap' }}>juros <b>{formatBRL(o.juros)}</b></span>
              <span style={{ fontSize: '13px', color: VERDE, whiteSpace: 'nowrap' }}>líquido <b>{formatBRL(o.liquido)}</b></span>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#7c3aed', whiteSpace: 'nowrap' }}>
                {(o.taxaPct || 0).toFixed(2).replace('.', ',')}%
              </span>
            </summary>
            <div style={{ borderTop: '1px solid #f1f5f9', overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>Cliente</th>
                    <th style={{ padding: '6px 12px', textAlign: 'left', fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>Entrada na conta</th>
                    <th style={{ padding: '6px 12px', textAlign: 'right', fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>Valor original</th>
                    <th style={{ padding: '6px 12px', textAlign: 'right', fontSize: '10px', color: '#64748b', textTransform: 'uppercase' }}>Líquido estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {o.duplicatas.map((d, j) => (
                    <tr key={j} style={{ borderTop: '1px solid #f8fafc' }}>
                      <td style={{ padding: '5px 12px', color: '#1e293b' }}>
                        {d.cliente}
                        {d.parcial && (
                          <span style={{ marginLeft: 6, fontSize: 10, color: '#b45309', background: '#fef3c7', padding: '1px 6px', borderRadius: 6 }}>
                            parte ({formatBRL(d.valorNaOperacao)}) nesta operação
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '5px 12px', color: '#475569', whiteSpace: 'nowrap' }}>{fmtData(d.dataEntrada)}</td>
                      <td style={{ padding: '5px 12px', textAlign: 'right', color: '#334155', whiteSpace: 'nowrap' }}>{formatBRL(d.valorOriginal)}</td>
                      <td style={{ padding: '5px 12px', textAlign: 'right', fontWeight: 700, color: VERDE, whiteSpace: 'nowrap' }}>{formatBRL(d.liquidoEstimado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {o.incompleta && (
                <div style={{ padding: '6px 12px', fontSize: '11px', color: '#b45309', background: '#fffbeb' }}>
                  ⚠️ {formatBRL(o.valorSemOrigem)} desta operação vêm de duplicatas anteriores a jan/2025 (fora do histórico sincronizado).
                </div>
              )}
            </div>
          </details>
        ))}
      </div>

      {/* Duplicatas descontadas aguardando liberação (saldo na conta de desconto) */}
      {!antLoading && !antErro && (ant?.pendentes || []).length > 0 && (
        <details style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '10px 14px' }}>
          <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 700, color: '#475569' }}>
            ⏳ {ant.pendentes.length} duplicata(s) na conta de desconto aguardando liberação · {formatBRL(ant.pendentes.reduce((s, p) => s + p.valor, 0))}
          </summary>
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#475569' }}>
            {ant.pendentes.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', padding: '3px 0', borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
                <span>{fmtData(p.data)} · {p.cliente} <EmpresaBadge conta={p.conta_omie} /></span>
                <b>{formatBRL(p.valor)}</b>
              </div>
            ))}
          </div>
        </details>
      )}
      </>)}
    </div>
  )
}
