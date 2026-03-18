'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function EquipamentoEditModal({ onClose }) {
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults] = useState([])
  const [selectedItem, setSelectedItem] = useState(null)
  const [file, setFile] = useState(null)
  const [localPreview, setLocalPreview] = useState(null)

  const anosRecentes = Array.from({ length: 25 }, (_, i) => (new Date().getFullYear() + 1 - i).toString())

  const loadEquipamentos = async () => {
    let query = supabase.from('Equipamentos').select('*').order('modelo', { ascending: true })
    if (searchTerm.trim() !== '') query = query.ilike('modelo', `%${searchTerm}%`)
    const { data, error } = await query.limit(50)
    if (!error) setResults(data || [])
  }

  useEffect(() => {
    const timer = setTimeout(loadEquipamentos, 300)
    return () => clearTimeout(timer)
  }, [searchTerm])

  const sanitizeFileName = (name) => {
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9.\-_]/g, '')
  }

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    if (selectedFile) { setFile(selectedFile); setLocalPreview(URL.createObjectURL(selectedFile)) }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      let imageUrl = selectedItem.imagem
      if (file) {
        const cleanName = sanitizeFileName(file.name)
        const filePath = `equipamentos/${Math.random()}-${cleanName}`
        const { error: uploadError } = await supabase.storage.from('equipamentos').upload(filePath, file)
        if (uploadError) throw uploadError
        const { data } = supabase.storage.from('equipamentos').getPublicUrl(filePath)
        imageUrl = data.publicUrl
      }
      const { error } = await supabase.from('Equipamentos').update({
        marca: selectedItem.marca, modelo: selectedItem.modelo, descricao: selectedItem.descricao,
        finame: selectedItem.finame, configuracao: selectedItem.configuracao, ano: selectedItem.ano, imagem: imageUrl
      }).eq('id', selectedItem.id)
      if (error) throw error
      alert("EQUIPAMENTO ATUALIZADO COM SUCESSO!"); onClose()
    } catch (err) { alert("Erro ao salvar: " + err.message) }
    finally { setLoading(false) }
  }

  const inputStyle = "w-full px-3 py-3 bg-white border border-zinc-200 text-[15px] rounded-lg outline-none focus:ring-2 focus:ring-red-500/40"

  return (
    <div className="fixed inset-0 bg-black/85 flex justify-center items-center z-[9999]">
      <div className="bg-zinc-50 w-[95%] max-w-[850px] max-h-[92vh] flex flex-col rounded-2xl border border-zinc-200 shadow-2xl overflow-hidden">
        <div className="px-8 py-5 border-b border-zinc-200 flex justify-between items-center bg-white">
          <h2 className="text-lg font-black text-zinc-900">{selectedItem ? 'EDITAR: ' + selectedItem.modelo : 'GERENCIAR ESTOQUE'}</h2>
          <button onClick={onClose} className="text-red-600 font-bold bg-transparent border-none cursor-pointer">FECHAR [X]</button>
        </div>

        <div className="p-6 overflow-y-auto">
          {!selectedItem ? (
            <div className="p-2.5">
              <label className="text-[11px] font-extrabold text-zinc-600 uppercase">PESQUISAR OU SELECIONAR DA LISTA</label>
              <input className={inputStyle} placeholder="Busque por modelo ou marca..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
              <div className="mt-5">
                {results.map(eq => (
                  <div key={eq.id} onClick={() => { setSelectedItem(eq); setLocalPreview(null); setFile(null) }} className="p-4 bg-white border border-zinc-200 rounded-xl cursor-pointer flex items-center gap-4 mb-2.5 hover:border-red-300 transition-colors">
                    <img src={eq.imagem} className="w-[60px] h-[45px] object-cover rounded border border-zinc-200" alt="" />
                    <div className="flex flex-col">
                      <span className="font-black text-[15px]">{eq.marca} {eq.modelo}</span>
                      <span className="text-[11px] text-zinc-500">ANO: {eq.ano} | ID: {eq.id}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <form onSubmit={handleUpdate} className="p-2.5">
              <div className="mb-6 bg-white p-4 rounded-xl border border-zinc-200">
                <label className="text-[11px] font-extrabold text-zinc-600 uppercase">FOTO DO EQUIPAMENTO</label>
                <div className="flex items-center gap-5 mt-2.5">
                  <img src={localPreview || selectedItem.imagem} className="w-[150px] h-[110px] object-cover rounded-lg border-2 border-zinc-300" alt="Preview" />
                  <div className="relative overflow-hidden inline-block">
                    <input type="file" accept="image/*" onChange={handleFileChange} className="absolute text-[100px] right-0 top-0 opacity-0 cursor-pointer" />
                    <button type="button" className="bg-zinc-900 text-white border-none px-5 py-2.5 rounded-md font-bold cursor-pointer text-sm">ALTERAR IMAGEM</button>
                  </div>
                </div>
                {file && <p className="text-[10px] text-emerald-600 font-bold mt-1">Nova imagem selecionada: {file.name}</p>}
              </div>

              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-5">
                <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600">MARCA</label><input value={selectedItem.marca || ''} className={inputStyle} onChange={e => setSelectedItem({ ...selectedItem, marca: e.target.value })} /></div>
                <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600">MODELO</label><input value={selectedItem.modelo || ''} className={inputStyle} onChange={e => setSelectedItem({ ...selectedItem, modelo: e.target.value })} /></div>
                <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600">ANO</label><select value={selectedItem.ano || ''} className={inputStyle} onChange={e => setSelectedItem({ ...selectedItem, ano: e.target.value })}>{anosRecentes.map(ano => <option key={ano} value={ano}>{ano}</option>)}</select></div>
                <div className="flex flex-col gap-2"><label className="text-[11px] font-extrabold text-zinc-600">FINAME / NCM</label><input value={selectedItem.finame || ''} className={inputStyle} onChange={e => setSelectedItem({ ...selectedItem, finame: e.target.value })} /></div>
              </div>
              <div className="flex flex-col gap-2 mt-5"><label className="text-[11px] font-extrabold text-zinc-600">DESCRICAO CURTA</label><input value={selectedItem.descricao || ''} className={inputStyle} onChange={e => setSelectedItem({ ...selectedItem, descricao: e.target.value })} /></div>
              <div className="flex flex-col gap-2 mt-5"><label className="text-[11px] font-extrabold text-zinc-600">CONFIGURACAO DETALHADA</label><textarea rows="6" value={selectedItem.configuracao || ''} className={inputStyle} onChange={e => setSelectedItem({ ...selectedItem, configuracao: e.target.value })} /></div>
              <button type="submit" disabled={loading} className="w-full mt-5 py-4 bg-red-600 text-white border-none rounded-xl font-bold text-base cursor-pointer hover:bg-red-700 transition-colors">{loading ? 'PROCESSANDO...' : 'SALVAR TODAS AS ALTERACOES'}</button>
              <button type="button" onClick={() => setSelectedItem(null)} className="w-full mt-2.5 py-4 bg-zinc-500 text-white border-none rounded-xl font-bold text-base cursor-pointer hover:bg-zinc-600 transition-colors">VOLTAR PARA LISTA</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
