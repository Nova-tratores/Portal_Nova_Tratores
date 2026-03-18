'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function FactoryFormModal({ onClose }) {
  const [loading, setLoading] = useState(false)
  const [listaClientes, setListaClientes] = useState([])
  const [listaEquipamentos, setListaEquipamentos] = useState([])
  const [buscaCli, setBuscaCli] = useState('')
  const [buscaEq, setBuscaEq] = useState('')
  const [showCli, setShowCli] = useState(false)
  const [showEq, setShowEq] = useState(false)

  const [formData, setFormData] = useState({
    vendedor_fab: '', cliente: '', marca: '', modelo: '',
    maq_valor: '', valor_final: '', status: 'Proposta solicitada'
  })

  useEffect(() => {
    async function fetchData() {
      const { data: clis } = await supabase.from('Clientes').select('*')
      const { data: equis } = await supabase.from('Equipamentos').select('*')
      if (clis) setListaClientes(clis)
      if (equis) setListaEquipamentos(equis)
    }
    fetchData()
  }, [])

  const selecionarCliente = (c) => {
    const nome = c.nome_fantasia || c.razao_social || c.nome || 'Sem Nome'
    setFormData(prev => ({ ...prev, cliente: nome }))
    setBuscaCli(nome); setShowCli(false)
  }

  const selecionarEquipamento = (e) => {
    setFormData(prev => ({ ...prev, marca: e.marca, modelo: e.modelo }))
    setBuscaEq(`${e.marca} ${e.modelo}`); setShowEq(false)
  }

  const handleSave = async (e) => {
    e.preventDefault(); setLoading(true)
    const { error } = await supabase.from('Proposta_Fabrica').insert([formData])
    if (!error) { alert("PEDIDO FABRICA CRIADO!"); onClose(); window.location.reload() }
    else { alert("Erro: " + error.message); setLoading(false) }
  }

  const inputStyle = "w-full px-3 py-3 bg-white border border-zinc-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-red-500/40"

  return (
    <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-[5000]">
      <div className="bg-white w-full max-w-[500px] rounded-xl border border-zinc-200 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 flex justify-between items-center border-b border-zinc-200">
          <h2 className="text-sm font-black">NOVA SOLICITACAO FABRICA</h2>
          <button onClick={onClose} className="font-bold text-zinc-500 hover:text-red-600 bg-transparent border-none cursor-pointer">X</button>
        </div>
        <form onSubmit={handleSave} className="p-5">
          <div className="flex flex-col gap-4">
            <div className="relative">
              <label className="text-[10px] font-black text-zinc-500 uppercase">CLIENTE</label>
              <input className={inputStyle} value={buscaCli} onChange={e => { setBuscaCli(e.target.value); setShowCli(true) }} placeholder="Pesquisar..." />
              {showCli && buscaCli && (
                <div className="absolute top-[65px] left-0 w-full bg-white border border-zinc-300 z-[100] max-h-[150px] overflow-y-auto rounded-lg shadow-lg">
                  {listaClientes.filter(c => (c.nome_fantasia || c.nome || "").toLowerCase().includes(buscaCli.toLowerCase())).slice(0, 8).map(c => (
                    <div key={c.id} className="p-2.5 cursor-pointer border-b border-zinc-100 hover:bg-red-50 text-sm" onClick={() => selecionarCliente(c)}>{c.nome_fantasia || c.nome}</div>
                  ))}
                </div>
              )}
            </div>
            <div className="relative">
              <label className="text-[10px] font-black text-zinc-500 uppercase">MAQUINA DO ESTOQUE</label>
              <input className={inputStyle} value={buscaEq} onChange={e => { setBuscaEq(e.target.value); setShowEq(true) }} placeholder="Pesquisar..." />
              {showEq && buscaEq && (
                <div className="absolute top-[65px] left-0 w-full bg-white border border-zinc-300 z-[100] max-h-[150px] overflow-y-auto rounded-lg shadow-lg">
                  {listaEquipamentos.filter(e => e.modelo.toLowerCase().includes(buscaEq.toLowerCase())).map(e => (
                    <div key={e.id} className="p-2.5 cursor-pointer border-b border-zinc-100 hover:bg-red-50 text-sm" onClick={() => selecionarEquipamento(e)}>{e.marca} {e.modelo}</div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] font-black text-zinc-500 uppercase">VENDEDOR</label>
              <input className={inputStyle} onChange={e => setFormData({ ...formData, vendedor_fab: e.target.value })} />
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full mt-5 py-4 bg-red-600 text-white border-none rounded-xl font-bold cursor-pointer hover:bg-red-700 transition-colors disabled:opacity-50">{loading ? 'SALVANDO...' : 'CRIAR SOLICITACAO'}</button>
        </form>
      </div>
    </div>
  )
}
