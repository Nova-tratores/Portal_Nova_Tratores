'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, X } from 'lucide-react'

const FASES = [
  { nome: 'Proposta solicitada', cor: 'bg-red-100 text-red-700' },
  { nome: 'Proposta Recebida', cor: 'bg-amber-100 text-amber-700' },
  { nome: 'Pedido Feito / Aguardando Maq', cor: 'bg-blue-100 text-blue-700' },
  { nome: 'Proposta Concluida/ Maquina Recebida', cor: 'bg-emerald-100 text-emerald-700' }
]

const FASES_ABERTAS = ['Proposta solicitada', 'Proposta Recebida', 'Pedido Feito / Aguardando Maq']

export default function FactoryKanban({ onCardClick }) {
  const [orders, setOrders] = useState([])
  const [busca, setBusca] = useState('')
  const [filtroFase, setFiltroFase] = useState('')

  const load = async () => {
    const { data } = await supabase.from('Proposta_Fabrica').select('*').order('id', { ascending: false })
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
      return matchBusca && matchFase
    })
  }, [orders, busca, filtroFase])

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
        <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-center">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-600 pointer-events-none" />
            <input type="text" placeholder="Buscar por cliente, modelo ou ID..." value={busca} onChange={e => setBusca(e.target.value)} className={`${filterInputStyle} pl-9`} />
          </div>
          <select value={filtroFase} onChange={e => setFiltroFase(e.target.value)} className={filterInputStyle}>
            <option value="">Todas as fases</option>
            {FASES.map(f => <option key={f.nome} value={f.nome}>{f.nome}</option>)}
          </select>
          {(busca || filtroFase) && (
            <button onClick={() => { setBusca(''); setFiltroFase('') }} className="h-full px-4 py-2.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 text-xs font-bold uppercase tracking-wide transition-colors flex items-center gap-2">
              <X size={14} /> Limpar
            </button>
          )}
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
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest">Status</th>
              <th className="text-left px-5 py-3.5 text-xs font-bold text-zinc-400 uppercase tracking-widest w-[220px]">Alterar Fase</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-zinc-400 text-base font-medium">Nenhum pedido encontrado</td></tr>
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
                  <td className="px-5 py-3.5">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md uppercase ${getStatusStyle(order.status)}`}>{order.status}</span>
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
