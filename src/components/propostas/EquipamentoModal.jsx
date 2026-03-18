'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function EquipamentoModal({ onClose }) {
  const [loading, setLoading] = useState(false)
  const [file, setFile] = useState(null)

  const anosRecentes = Array.from({ length: 22 }, (_, i) => (new Date().getFullYear() + 1 - i).toString())

  const [formData, setFormData] = useState({
    marca: '', modelo: '', descricao: '', finame: '', configuracao: '',
    ano: new Date().getFullYear().toString()
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const sanitizeFileName = (name) => {
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      let imageUrl = ''
      if (file) {
        const cleanName = sanitizeFileName(file.name)
        const filePath = `equipamentos/${Math.random()}-${cleanName}`
        const { error: uploadError } = await supabase.storage.from('equipamentos').upload(filePath, file)
        if (uploadError) throw uploadError
        const { data } = supabase.storage.from('equipamentos').getPublicUrl(filePath)
        imageUrl = data.publicUrl
      }
      const { error } = await supabase.from('Equipamentos').insert([{ ...formData, imagem: imageUrl }])
      if (error) throw error
      alert("EQUIPAMENTO CADASTRADO COM SUCESSO!"); onClose()
    } catch (err) { alert("Erro ao salvar equipamento: " + err.message) }
    finally { setLoading(false) }
  }

  const inputStyle = "w-full px-3 py-3 bg-white border border-zinc-200 text-[15px] rounded-md outline-none focus:ring-2 focus:ring-red-500/40"

  return (
    <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-[9999] p-2.5">
      <div className="bg-zinc-50 w-full max-w-[800px] max-h-[90vh] flex flex-col rounded-xl border border-zinc-200 shadow-2xl overflow-hidden">
        <div className="px-8 py-5 border-b border-zinc-200 flex justify-between items-center bg-white">
          <h2 className="text-lg font-black text-zinc-900">CADASTRAR EQUIPAMENTO</h2>
          <button onClick={onClose} className="text-red-600 font-bold bg-transparent border-none cursor-pointer">FECHAR [X]</button>
        </div>
        <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-8 overflow-y-auto">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-5">
              <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600 tracking-wide">MARCA</label><input name="marca" required className={inputStyle} onChange={handleChange} placeholder="Ex: Massey Ferguson" /></div>
              <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600 tracking-wide">MODELO</label><input name="modelo" required className={inputStyle} onChange={handleChange} placeholder="Ex: MF 4275" /></div>
              <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600 tracking-wide">ANO DE FABRICACAO</label><select name="ano" value={formData.ano} className={inputStyle} onChange={handleChange}>{anosRecentes.map(ano => <option key={ano} value={ano}>{ano}</option>)}</select></div>
              <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600 tracking-wide">FINAME / NCM</label><input name="finame" className={inputStyle} onChange={handleChange} placeholder="00000000" /></div>
            </div>
            <div className="flex flex-col gap-2 mt-5"><label className="text-[11px] font-extrabold text-zinc-600">DESCRICAO CURTA</label><input name="descricao" placeholder="Ex: Trator Agricola de Rodas" className={inputStyle} onChange={handleChange} /></div>
            <div className="flex flex-col gap-2 mt-5"><label className="text-[11px] font-extrabold text-zinc-600">FOTO DO EQUIPAMENTO</label><input type="file" accept="image/*" required className={inputStyle} onChange={(e) => setFile(e.target.files[0])} /></div>
            <div className="flex flex-col gap-2 mt-5"><label className="text-[11px] font-extrabold text-zinc-600">CONFIGURACAO PADRAO (DETALHADA)</label><textarea name="configuracao" rows="5" className={inputStyle} onChange={handleChange} placeholder="Descreva os itens de serie..." /></div>
          </div>
          <div className="px-8 py-5 border-t border-zinc-200 bg-white">
            <button type="submit" disabled={loading} className="w-full py-4 bg-red-600 text-white border-none rounded-xl font-bold text-base cursor-pointer hover:bg-red-700 transition-colors disabled:opacity-50">{loading ? 'GRAVANDO DADOS...' : 'SALVAR EQUIPAMENTO NO ESTOQUE'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
