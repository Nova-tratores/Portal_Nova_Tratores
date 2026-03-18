'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ClientModal({ onClose }) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    nome: '', cppf_cnpj: '', inscricao: '', cidade: '',
    endereco: '', bairro: '', num_telefone: '', email: ''
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('Clientes').insert([formData])
    if (error) { alert("Erro ao cadastrar: " + error.message) }
    else { alert("CLIENTE CADASTRADO COM SUCESSO!"); onClose() }
    setLoading(false)
  }

  const inputStyle = "w-full px-4 py-3.5 bg-white border border-zinc-200 text-[15px] rounded-lg outline-none focus:ring-2 focus:ring-red-500/40"

  return (
    <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-[9999] p-2.5">
      <div className="bg-zinc-50 w-full max-w-[800px] max-h-[90vh] flex flex-col rounded-xl border border-zinc-200 shadow-2xl overflow-hidden">
        <div className="px-8 py-5 border-b border-zinc-200 flex justify-between items-center bg-white">
          <h2 className="text-lg font-black text-zinc-900">CADASTRAR NOVO CLIENTE</h2>
          <button onClick={onClose} className="text-red-600 font-bold bg-transparent border-none cursor-pointer">FECHAR [X]</button>
        </div>
        <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-8 overflow-y-auto">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5">
              <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600 tracking-wide">NOME / RAZAO SOCIAL</label><input name="nome" required className={inputStyle} onChange={handleChange} placeholder="Nome do cliente" /></div>
              <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600 tracking-wide">CPF / CNPJ</label><input name="cppf_cnpj" className={inputStyle} onChange={handleChange} placeholder="000.000.000-00" /></div>
              <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600 tracking-wide">INSCRICAO ESTADUAL / MUN.</label><input name="inscricao" className={inputStyle} onChange={handleChange} placeholder="Isento ou Numero" /></div>
              <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600 tracking-wide">CIDADE</label><input name="cidade" className={inputStyle} onChange={handleChange} placeholder="Ex: Piraju" /></div>
              <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600 tracking-wide">ENDERECO</label><input name="endereco" className={inputStyle} onChange={handleChange} placeholder="Rua, numero" /></div>
              <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600 tracking-wide">BAIRRO</label><input name="bairro" className={inputStyle} onChange={handleChange} placeholder="Bairro" /></div>
              <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600 tracking-wide">TELEFONE</label><input name="num_telefone" className={inputStyle} onChange={handleChange} placeholder="(00) 00000-0000" /></div>
              <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600 tracking-wide">EMAIL</label><input name="email" type="email" className={inputStyle} onChange={handleChange} placeholder="email@exemplo.com" /></div>
            </div>
          </div>
          <div className="px-8 py-5 border-t border-zinc-200 bg-white">
            <button type="submit" disabled={loading} className="w-full py-4 bg-zinc-900 text-white border-none rounded-xl font-bold text-base cursor-pointer hover:bg-zinc-800 transition-colors disabled:opacity-50">{loading ? 'GRAVANDO...' : 'SALVAR CLIENTE'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
