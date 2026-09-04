'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, X, Printer } from 'lucide-react'
import { useAuditLog } from '@/hooks/useAuditLog'
import { gerarPdfLista, hojeISO } from '@/lib/propostas/pdf-lista'

// `nome` = string EXATA gravada no banco. `pasta` = pasta física (bate com fase_fabrica.cor_pasta).
// As 2 últimas fases (branca/cinza) foram adicionadas na evolução do módulo.
const FASES = [
  { nome: 'Proposta solicitada', cor: 'bg-red-100 text-red-700', pasta: 'amarela' },
  { nome: 'Proposta Recebida', cor: 'bg-amber-100 text-amber-700', pasta: 'amarela' },
  { nome: 'Pedido Feito / Aguardando Maq', cor: 'bg-blue-100 text-blue-700', pasta: 'verde' },
  { nome: 'Proposta Concluida/ Maquina Recebida', cor: 'bg-emerald-100 text-emerald-700', pasta: 'verde' },
  { nome: 'Aguardando faturamento da fábrica', cor: 'bg-slate-100 text-slate-600', pasta: 'branca' },
  { nome: 'Faturado por nós', cor: 'bg-zinc-200 text-zinc-700', pasta: 'cinza' }
]

// Cor do quadradinho da pasta física.
const PASTA_COR = { amarela: '#FACC15', verde: '#22C55E', branca: '#E2E8F0', cinza: '#94A3B8' }

// "Em aberto" = não faturado por nós (fase final).
const FASES_ABERTAS = ['Proposta solicitada', 'Proposta Recebida', 'Pedido Feito / Aguardando Maq', 'Proposta Concluida/ Maquina Recebida', 'Aguardando faturamento da fábrica']

// Aging "hoje" / "N dias" com cor por atraso.
const agingTexto = (d) => { const n = Number(d); return (!Number.isFinite(n) || n <= 0) ? 'hoje' : `${n} dia${n !== 1 ? 's' : ''}` }
const agingCor = (d) => { const n = Number(d); return n > 15 ? 'text-red-600 font-bold' : n > 7 ? 'text-amber-600 font-semibold' : 'text-zinc-400' }

const fmtR$ = (v) => (v == null || v === '') ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const FRETE_LABEL = { incluso: 'Incluso', nao_incluso: 'Não incluso' }
const freteTexto = (o) => {
  if (!o.frete_modalidade) return '—'
  const base = FRETE_LABEL[o.frete_modalidade] || o.frete_modalidade
  return (o.frete_valor != null && o.frete_valor !== '') ? `${base} · ${fmtR$(o.frete_valor)}` : base
}

// Colunas da tabela (chave do filtro por coluna + label da tela/PDF).
const COLS_LISTA = [
  { k: 'id', label: 'ID' },
  { k: 'cliente', label: 'Cliente' },
  { k: 'vendedor', label: 'Vendedor' },
  { k: 'maquina', label: 'Marca / Modelo' },
  { k: 'custo', label: 'Custo' },
  { k: 'frete', label: 'Frete' },
  { k: 'status', label: 'Status' },
  { k: 'dias', label: 'Parado há' },
]

// Texto exibido em cada coluna — usado pelo filtro do cabeçalho e pelo PDF (bate com a tela).
function colTexto(o, k) {
  switch (k) {
    case 'id': return `#${o.id}${o.convertido ? ' CONVERTIDO' : ''}`
    case 'cliente': return o.cliente || ''
    case 'vendedor': return o.vendedor_fab || ''
    case 'maquina': return `${o.marca || ''} ${o.modelo || ''}`.trim()
    case 'custo': return fmtR$(o.custo)
    case 'frete': return freteTexto(o)
    case 'status': return o.status || ''
    case 'dias': return agingTexto(o.dias_na_fase)
    default: return ''
  }
}

export default function FactoryKanban({ onCardClick }) {
  const { log } = useAuditLog()
  const [orders, setOrders] = useState([])
  const [busca, setBusca] = useState('')
  const [filtroFase, setFiltroFase] = useState('')
  const [filtrosCol, setFiltrosCol] = useState({})   // filtro por coluna (2ª linha do cabeçalho, AND)
  const [gerando, setGerando] = useState(false)
  const temFiltroCol = Object.values(filtrosCol).some(v => v && v.trim())

  const load = async () => {
    // View v_proposta_fabrica: já esconde deletados, traz dias_na_fase, cor_pasta e eh_final.
    const { data } = await supabase.from('v_proposta_fabrica').select('*')
      .order('dias_na_fase', { ascending: false })
      .order('id', { ascending: false })
    setOrders(data || [])
  }

  useEffect(() => { load() }, [])

  const handleStatusChange = async (e, id) => {
    e.stopPropagation()
    const newStatus = e.target.value
    const { error } = await supabase.from('Proposta_Fabrica').update({ status: newStatus }).eq('id', id)
    if (!error) load()
  }

  const filtradas = useMemo(() => {
    return orders.filter(o => {
      const matchBusca = !busca || (o.cliente || '').toLowerCase().includes(busca.toLowerCase()) || (o.modelo || '').toLowerCase().includes(busca.toLowerCase()) || String(o.id).includes(busca)
      const matchFase = !filtroFase || o.status === filtroFase
      // Filtro por coluna (AND). Custo aceita também o número cru.
      const matchCols = Object.entries(filtrosCol).every(([k, v]) => {
        const q = (v || '').trim().toLowerCase()
        if (!q) return true
        const alvo = colTexto(o, k).toLowerCase() + (k === 'custo' ? ` ${String(o.custo ?? '').toLowerCase()}` : '')
        return alvo.includes(q)
      })
      return matchBusca && matchFase && matchCols
    })
  }, [orders, busca, filtroFase, filtrosCol])

  // ====== IMPRIMIR A RELAÇÃO DA TELA (respeita busca, fase e filtros de coluna) ======
  const imprimirLista = async () => {
    if (gerando) return
    if (filtradas.length === 0) { alert('Nenhum pedido na tela para imprimir.'); return }
    setGerando(true)
    try {
      const filtrosResumo = []
      if (busca.trim()) filtrosResumo.push(`Busca: "${busca.trim()}"`)
      if (filtroFase) filtrosResumo.push(`Fase: ${filtroFase}`)
      for (const col of COLS_LISTA) { const v = (filtrosCol[col.k] || '').trim(); if (v) filtrosResumo.push(`${col.label}: "${v}"`) }
      const somaCusto = filtradas.reduce((acc, o) => acc + (Number(o.custo) || 0), 0)
      await gerarPdfLista({
        titulo: 'PEDIDOS FABRICA - RELACAO DA TELA',
        colunas: COLS_LISTA.map(c => c.label),
        linhas: filtradas.map(o => COLS_LISTA.map(col => colTexto(o, col.k) || '---')),
        filtrosResumo,
        rodape: [{ texto: `CUSTO TOTAL (${filtradas.length} pedido${filtradas.length !== 1 ? 's' : ''}): ${fmtR$(somaCusto)}`, destaque: true }],
        arquivo: `pedidos_fabrica_${hojeISO()}.pdf`,
        columnStyles: { 0: { cellWidth: 26 }, 4: { halign: 'right', fontStyle: 'bold' }, 7: { cellWidth: 22 } },
      })
      log({ sistema: 'Proposta Comercial', acao: 'relatorio', entidade: 'pedidos_fabrica_lista', detalhes: { total: filtradas.length, filtros: filtrosResumo } })
    } catch (err) {
      console.error(err)
      alert('Erro ao gerar PDF: ' + err.message)
    } finally { setGerando(false) }
  }

  const emAberto = useMemo(() => orders.filter(o => FASES_ABERTAS.includes(o.status)), [orders])

  const getStatusStyle = (status) => {
    const fase = FASES.find(f => f.nome === status)
    return fase?.cor || 'bg-zinc-100 text-zinc-600'
  }

  const filterInputStyle = "w-full bg-zinc-100/50 text-zinc-700 text-base rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-500/40 transition-all placeholder:text-zinc-400 border border-zinc-200"

  return (
    <div className="w-full">
      {/* FILTROS */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-3 items-center">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-600 pointer-events-none" />
            <input type="text" placeholder="Buscar por cliente, modelo ou ID..." value={busca} onChange={e => setBusca(e.target.value)} className={`${filterInputStyle} pl-9`} />
          </div>
          <select value={filtroFase} onChange={e => setFiltroFase(e.target.value)} className={filterInputStyle}>
            <option value="">Todas as fases</option>
            {FASES.map(f => <option key={f.nome} value={f.nome}>{f.nome}</option>)}
          </select>
          {(busca || filtroFase || temFiltroCol) ? (
            <button onClick={() => { setBusca(''); setFiltroFase(''); setFiltrosCol({}) }} className="h-full px-4 py-2.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 text-xs font-bold uppercase tracking-wide transition-colors flex items-center gap-2">
              <X size={14} /> Limpar
            </button>
          ) : <span />}
          <button onClick={imprimirLista} disabled={gerando} title="Gera um PDF com a relação exatamente como está na tela (busca, fase e filtros do cabeçalho)"
            className="h-full px-4 py-2.5 rounded-lg bg-zinc-800 text-white hover:bg-zinc-900 text-xs font-bold uppercase tracking-wide transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            <Printer size={14} className={gerando ? 'animate-pulse' : ''} /> {gerando ? 'Gerando...' : 'Imprimir'}
          </button>
        </div>
      </div>

      {/* CONTADORES */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {FASES.map(fase => {
          const count = orders.filter(o => o.status === fase.nome).length
          return (
            <button key={fase.nome} onClick={() => setFiltroFase(filtroFase === fase.nome ? '' : fase.nome)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-all border ${filtroFase === fase.nome ? 'border-red-300 bg-red-50 text-red-700' : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50'}`}>
              {fase.nome} <span className="ml-1 font-black">({count})</span>
            </button>
          )
        })}
        <div className="ml-auto text-sm text-zinc-500">Em aberto: <strong className="text-red-600">{emAberto.length}</strong> pedidos</div>
      </div>

      {/* TABELA */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-200">
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">ID</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">Cliente</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">Vendedor</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">Marca / Modelo</th>
              <th className="text-right px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">Custo</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">Frete</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">Status</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">Parado há</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest w-[220px]">Alterar Fase</th>
            </tr>
            {/* 2ª linha: filtro por coluna (AND) — mesmo padrão de /ajustes/alertas */}
            <tr className="border-b border-zinc-200 bg-zinc-50/60">
              {COLS_LISTA.map(col => (
                <th key={col.k} className="px-3 pb-2.5 pt-0.5">
                  <input type="text" value={filtrosCol[col.k] || ''} placeholder="filtrar…" aria-label={`Filtrar ${col.label}`}
                    onChange={e => setFiltrosCol(f => ({ ...f, [col.k]: e.target.value }))}
                    className="w-full min-w-[70px] bg-white text-zinc-700 text-xs font-normal normal-case tracking-normal rounded-md px-2 py-1.5 outline-none border border-zinc-200 focus:ring-2 focus:ring-red-500/40 placeholder:text-zinc-400" />
                </th>
              ))}
              <th className="px-3 pb-2.5 pt-0.5" />
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-12 text-zinc-400 text-base font-medium">Nenhum pedido encontrado</td></tr>
            ) : (
              filtradas.map(order => (
                <tr key={order.id} onClick={() => onCardClick(order)} className="border-b border-zinc-100 hover:bg-red-50/50 cursor-pointer transition-colors group">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-zinc-700">#{order.id}</span>
                      {order.convertido && <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">CONVERTIDO</span>}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-base font-semibold text-zinc-800 group-hover:text-red-600 transition-colors">{order.cliente || '---'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-zinc-500">{order.vendedor_fab || '---'}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-zinc-600">{order.marca} {order.modelo}</span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <span className="text-sm font-semibold text-zinc-700">{fmtR$(order.custo)}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-zinc-500">{freteTexto(order)}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm border border-zinc-300 shrink-0" title={`Pasta ${order.cor_pasta || ''}`} style={{ backgroundColor: PASTA_COR[order.cor_pasta] || '#F4F4F5' }} />
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md uppercase ${getStatusStyle(order.status)}`}>{order.status}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`text-sm ${agingCor(order.dias_na_fase)}`}>{agingTexto(order.dias_na_fase)}</span>
                  </td>
                  <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusChange(e, order.id)}
                      className="w-full bg-zinc-50 border border-zinc-200 text-zinc-600 text-xs font-bold p-2 rounded-md outline-none cursor-pointer focus:ring-2 focus:ring-red-500/40"
                    >
                      {FASES.map(f => <option key={f.nome} value={f.nome}>{f.nome}</option>)}
                    </select>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-right text-sm text-zinc-400 font-medium">{filtradas.length} pedido{filtradas.length !== 1 ? 's' : ''}</div>
    </div>
  )
}

export { FASES_ABERTAS }
