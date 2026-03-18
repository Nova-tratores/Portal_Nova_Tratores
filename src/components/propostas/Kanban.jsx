'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, X } from 'lucide-react'

const COLUNAS = [
  { nome: 'Enviar Proposta', cor: 'bg-red-100 text-red-700' },
  { nome: 'AGUARDANDO RESPOSTA CLIENTE', cor: 'bg-amber-100 text-amber-700' },
  { nome: 'AGUARDANDO RESPOSTA BANCO', cor: 'bg-violet-100 text-violet-700' },
  { nome: 'Concluida-Vendido', cor: 'bg-emerald-100 text-emerald-700' },
  { nome: 'Concluida- Não vendido.', cor: 'bg-zinc-100 text-zinc-600' }
]

// Status considerados "em aberto" (não concluídos)
const STATUS_ABERTO = ['Enviar Proposta', 'AGUARDANDO RESPOSTA CLIENTE', 'AGUARDANDO RESPOSTA BANCO']

/**
 * Converte qualquer valor monetário para número.
 * Aceita: "15000", "15.000,00", "15000.50", "R$ 1.500", null, undefined, etc.
 */
function parseValor(val) {
  if (val == null || val === '') return 0
  if (typeof val === 'number') return val
  let str = String(val).replace(/[R$\s]/g, '').trim()
  // Se tem vírgula E ponto → formato BR "15.000,50" → remove pontos, troca vírgula
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.')
  }
  // Se tem só vírgula → "1500,50" → troca vírgula por ponto
  else if (str.includes(',')) {
    str = str.replace(',', '.')
  }
  const n = parseFloat(str)
  return isNaN(n) ? 0 : n
}

function formatBRL(val) {
  return parseValor(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Kanban({ onCardClick, onGerarRelatorio }) {
  const [cards, setCards] = useState([])
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  const loadData = async () => {
    const { data } = await supabase.from('Formulario').select('*').neq('status', 'Lixeira').order('id', { ascending: false })
    setCards(data || [])
  }

  useEffect(() => { loadData() }, [])

  const updateStatus = async (id, newStatus, e) => {
    e.stopPropagation()
    const { error } = await supabase.from('Formulario').update({ status: newStatus }).eq('id', id)
    if (!error) loadData()
  }

  const filtradas = useMemo(() => {
    return cards.filter(c => {
      const matchBusca = !busca || (c.Cliente || '').toLowerCase().includes(busca.toLowerCase()) || (c.Modelo || '').toLowerCase().includes(busca.toLowerCase()) || String(c.id).includes(busca)
      const matchStatus = !filtroStatus || c.status === filtroStatus
      return matchBusca && matchStatus
    })
  }, [cards, busca, filtroStatus])

  // Propostas em aberto para relatório
  const emAberto = useMemo(() => cards.filter(c => STATUS_ABERTO.includes(c.status)), [cards])

  const getStatusStyle = (status) => {
    const col = COLUNAS.find(c => c.nome === status)
    return col?.cor || 'bg-zinc-100 text-zinc-600'
  }

  // Soma total em aberto
  const totalAberto = useMemo(() => emAberto.reduce((acc, c) => acc + parseValor(c.Valor_Total), 0), [emAberto])

  const filterInputStyle = "w-full bg-zinc-100/50 text-zinc-700 text-base rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-red-500/40 transition-all placeholder:text-zinc-400 border border-zinc-200"

  return (
    <div className="w-full">
      {/* FILTROS */}
      <div className="bg-white border border-zinc-200 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-600 pointer-events-none" />
            <input type="text" placeholder="Buscar por cliente, modelo ou ID..." value={busca} onChange={e => setBusca(e.target.value)} className={`${filterInputStyle} pl-9`} />
          </div>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className={filterInputStyle}>
            <option value="">Todos os status</option>
            {COLUNAS.map(c => <option key={c.nome} value={c.nome}>{c.nome}</option>)}
          </select>
          {(busca || filtroStatus) && (
            <button onClick={() => { setBusca(''); setFiltroStatus('') }} className="h-full px-4 py-2.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 text-xs font-bold uppercase tracking-wide transition-colors flex items-center gap-2">
              <X size={14} /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* CONTADORES */}
      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {COLUNAS.map(col => {
          const count = cards.filter(c => c.status === col.nome).length
          return (
            <button key={col.nome} onClick={() => setFiltroStatus(filtroStatus === col.nome ? '' : col.nome)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-all border ${filtroStatus === col.nome ? 'border-red-300 bg-red-50 text-red-700' : 'border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50'}`}>
              {col.nome} <span className="ml-1 font-black">({count})</span>
            </button>
          )
        })}

        {/* RESUMO EM ABERTO */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-zinc-500">Em aberto: <strong className="text-red-600">{emAberto.length}</strong> propostas | <strong className="text-red-600">R$ {formatBRL(totalAberto)}</strong></span>
        </div>
      </div>

      {/* TABELA */}
      <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-zinc-200">
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">ID</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">Cliente</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">Marca / Modelo</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">Cidade</th>
              <th className="text-right px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">Valor</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">Status</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest w-[200px]">Alterar</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-12 text-zinc-400 text-base font-medium">Nenhuma proposta encontrada</td></tr>
            ) : (
              filtradas.map(card => {
                const isFromFactory = !!card.id_fabrica_ref
                return (
                  <tr key={card.id} onClick={() => onCardClick(card)} className="border-b border-zinc-100 hover:bg-red-50/50 cursor-pointer transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-zinc-700">#{card.id}</span>
                        {isFromFactory && <span className="text-[9px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">FAB</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-base font-semibold text-zinc-800 group-hover:text-red-600 transition-colors">{card.Cliente || 'SEM NOME'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-zinc-600">{card.Marca} {card.Modelo}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm text-zinc-500">{card.Cidade || '---'}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-base font-bold text-red-600">R$ {formatBRL(card.Valor_Total)}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md uppercase ${getStatusStyle(card.status)}`}>{card.status}</span>
                    </td>
                    <td className="px-5 py-3.5" onClick={e => e.stopPropagation()}>
                      <select
                        className="w-full bg-zinc-50 border border-zinc-200 text-zinc-600 text-xs font-bold p-2 rounded-md outline-none cursor-pointer focus:ring-2 focus:ring-red-500/40"
                        value={card.status}
                        onChange={(e) => updateStatus(card.id, e.target.value, e)}
                      >
                        {COLUNAS.map(f => <option key={f.nome} value={f.nome}>{f.nome}</option>)}
                      </select>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 text-right text-sm text-zinc-400 font-medium">{filtradas.length} proposta{filtradas.length !== 1 ? 's' : ''}</div>
    </div>
  )
}

// Exporta utilitários para uso no relatório
export { parseValor, formatBRL, STATUS_ABERTO }
