'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function ClientEditModal({ onClose }) {
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [clientes, setClientes] = useState([])
  const [selectedClient, setSelectedClient] = useState(null)

  const loadClientes = async () => {
    let query = supabase.from('Clientes').select('*').order('nome', { ascending: true })
    if (searchTerm.trim() !== '') query = query.ilike('nome', `%${searchTerm}%`)
    const { data, error } = await query.limit(50)
    if (!error) setClientes(data || [])
  }

  useEffect(() => {
    const timer = setTimeout(loadClientes, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const handleUpdate = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('Clientes').update(selectedClient).eq('id', selectedClient.id)
    if (!error) { alert("CLIENTE ATUALIZADO!"); onClose() }
    else { alert("Erro: " + error.message) }
    setLoading(false)
  }

  const inputStyle = "w-full px-3 py-3 bg-white border border-zinc-200 text-[15px] rounded-lg outline-none focus:ring-2 focus:ring-red-500/40"

  return (
    <div className="fixed inset-0 bg-black/85 flex justify-center items-center z-[9999]">
      <div className="bg-zinc-50 w-full max-w-[850px] max-h-[92vh] flex flex-col rounded-2xl border border-zinc-200 shadow-2xl overflow-hidden">
        <div className="px-8 py-5 border-b border-zinc-200 flex justify-between items-center bg-white">
          <h2 className="text-lg font-black text-zinc-900">{selectedClient ? 'EDITANDO: ' + selectedClient.nome : 'GERENCIAR CLIENTES'}</h2>
          <button onClick={onClose} className="text-red-600 font-bold bg-transparent border-none cursor-pointer">FECHAR [X]</button>
        </div>

        <div className="p-6 overflow-y-auto">
          {!selectedClient ? (
            <div className="p-2.5">
              <label className="text-[11px] font-extrabold text-zinc-600">PESQUISAR CLIENTE</label>
              <input className={inputStyle} placeholder="Busque por nome ou CPF..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              <div className="mt-5">
                {clientes.map(c => (
                  <div key={c.id} onClick={() => setSelectedClient(c)} className="p-4 bg-white border border-zinc-200 rounded-xl cursor-pointer flex items-center gap-4 mb-2.5 hover:border-red-300 transition-colors">
                    <div className="flex flex-col">
                      <strong className="text-base">{c.nome}</strong>
                      <span className="text-xs text-zinc-500">{c.cidade} | CPF/CNPJ: {c.cppf_cnpj} | IE: {c.inscricao || 'N/A'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <form onSubmit={handleUpdate} className="p-2.5">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
                <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600">NOME / RAZAO SOCIAL</label><input value={selectedClient.nome || ''} className={inputStyle} onChange={e => setSelectedClient({ ...selectedClient, nome: e.target.value })} /></div>
                <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600">CPF / CNPJ</label><input value={selectedClient.cppf_cnpj || ''} className={inputStyle} onChange={e => setSelectedClient({ ...selectedClient, cppf_cnpj: e.target.value })} /></div>
                <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600">INSCRICAO ESTADUAL / MUN.</label><input value={selectedClient.inscricao || ''} className={inputStyle} onChange={e => setSelectedClient({ ...selectedClient, inscricao: e.target.value })} /></div>
                <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600">CIDADE</label><input value={selectedClient.cidade || ''} className={inputStyle} onChange={e => setSelectedClient({ ...selectedClient, cidade: e.target.value })} /></div>
                <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600">TELEFONE</label><input value={selectedClient.num_telefone || ''} className={inputStyle} onChange={e => setSelectedClient({ ...selectedClient, num_telefone: e.target.value })} /></div>
                <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600">ENDERECO</label><input value={selectedClient.endereco || ''} className={inputStyle} onChange={e => setSelectedClient({ ...selectedClient, endereco: e.target.value })} /></div>
                <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600">BAIRRO</label><input value={selectedClient.bairro || ''} className={inputStyle} onChange={e => setSelectedClient({ ...selectedClient, bairro: e.target.value })} /></div>
                <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600">EMAIL</label><input value={selectedClient.email || ''} className={inputStyle} onChange={e => setSelectedClient({ ...selectedClient, email: e.target.value })} /></div>
              </div>
              <button type="submit" disabled={loading} className="w-full mt-5 py-4 bg-red-600 text-white border-none rounded-xl font-bold text-base cursor-pointer hover:bg-red-700 transition-colors">{loading ? 'PROCESSANDO...' : 'SALVAR ALTERACOES'}</button>
              <button type="button" onClick={() => setSelectedClient(null)} className="w-full mt-2.5 py-4 bg-zinc-500 text-white border-none rounded-xl font-bold text-base cursor-pointer hover:bg-zinc-600 transition-colors">VOLTAR PARA LISTA</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
