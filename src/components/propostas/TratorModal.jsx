'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function TratorModal({ onClose }) {
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [formData, setFormData] = useState({
    marca: '', modelo: '', motor: '', transmissao_diant: '',
    bomb_inje: '', bomb_hidra: '', embreagem: '', capacit_comb: '',
    cambio: '', reversor: '', trasmissao_tras: '', oleo_motor: '',
    oleo_trasmissao: '', diant_min_max: '', tras_min_max: '',
    obs: '', imagem: '', ano: '', 'finame/ncm': ''
  })

  const handleUpload = async (e) => {
    try {
      setUploading(true)
      const file = e.target.files[0]
      if (!file) return
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random()}-${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('equipamentos').upload(fileName, file)
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('equipamentos').getPublicUrl(fileName)
      setFormData({ ...formData, imagem: data.publicUrl })
    } catch (error) { alert('Erro no upload: ' + error.message) }
    finally { setUploading(false) }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('cad_trator').insert([formData])
    if (error) { alert("Erro ao cadastrar trator: " + error.message) }
    else { alert("TRATOR CADASTRADO COM SUCESSO!"); window.location.reload() }
    setLoading(false)
  }

  const inputStyle = "w-full border-none outline-none text-sm font-bold bg-transparent"
  const labelStyle = "text-[9px] font-black text-zinc-500 uppercase mb-1 block"

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex justify-center items-center z-[5000]">
      <div className="bg-white w-[95%] max-w-[1100px] h-[90vh] rounded-2xl flex flex-col border border-zinc-200 shadow-2xl overflow-hidden">
        <div className="px-8 py-5 bg-white border-b border-zinc-200 flex justify-between items-center">
          <h2 className="font-black text-zinc-900">CADASTRAR NOVO TRATOR</h2>
          <button onClick={onClose} className="font-black text-zinc-500 hover:text-red-600 bg-transparent border-none cursor-pointer">FECHAR [X]</button>
        </div>

        <div className="px-8 py-6 overflow-y-auto flex-1">
          <form onSubmit={handleSave} className="flex flex-col gap-5">
            <div className="text-xs font-black text-red-600 uppercase">I. IDENTIFICACAO E FOTO</div>
            <div className="text-center">
              <div className="inline-flex flex-col items-center gap-2.5 mb-2.5">
                {formData.imagem ? (
                  <img src={formData.imagem} className="w-[300px] h-[200px] object-cover border-2 border-zinc-300 rounded-xl" alt="Trator" />
                ) : (
                  <div className="w-[300px] h-[200px] flex items-center justify-center bg-zinc-100 border-2 border-dashed border-zinc-300 rounded-xl text-zinc-400 font-bold">SEM FOTO</div>
                )}
                <input type="file" id="fileTrator" onChange={handleUpload} className="hidden" accept="image/*" />
                <button type="button" onClick={() => document.getElementById('fileTrator').click()} className="px-5 py-2.5 bg-zinc-900 text-white border-none rounded-lg cursor-pointer font-extrabold text-[11px]">{uploading ? 'ENVIANDO...' : 'ANEXAR FOTO DO TRATOR'}</button>
              </div>
            </div>

            <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
              <div className="flex border-b border-zinc-200">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>MARCA</label><input required value={formData.marca} onChange={e => setFormData({ ...formData, marca: e.target.value })} className={inputStyle} placeholder="Ex: Massey Ferguson" /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>MODELO</label><input required value={formData.modelo} onChange={e => setFormData({ ...formData, modelo: e.target.value })} className={inputStyle} placeholder="Ex: 4707" /></div>
              </div>
              <div className="flex">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>ANO</label><input value={formData.ano} onChange={e => setFormData({ ...formData, ano: e.target.value })} className={inputStyle} placeholder="Ex: 2025" /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>FINAME / NCM</label><input value={formData['finame/ncm']} onChange={e => setFormData({ ...formData, 'finame/ncm': e.target.value })} className={inputStyle} /></div>
              </div>
            </div>

            <div className="text-xs font-black text-red-600 uppercase">II. MOTOR E SISTEMA DE COMBUSTIVEL</div>
            <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
              <div className="flex">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>MOTOR</label><input value={formData.motor} onChange={e => setFormData({ ...formData, motor: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>BOMBA INJETORA</label><input value={formData.bomb_inje} onChange={e => setFormData({ ...formData, bomb_inje: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>CAPACIDADE TANQUE (L)</label><input value={formData.capacit_comb} onChange={e => setFormData({ ...formData, capacit_comb: e.target.value })} className={inputStyle} /></div>
              </div>
            </div>

            <div className="text-xs font-black text-red-600 uppercase">III. TRANSMISSAO E MECANICA</div>
            <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
              <div className="flex border-b border-zinc-200">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>CAMBIO</label><input value={formData.cambio} onChange={e => setFormData({ ...formData, cambio: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>REVERSOR</label><input value={formData.reversor} onChange={e => setFormData({ ...formData, reversor: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>EMBREAGEM</label><input value={formData.embreagem} onChange={e => setFormData({ ...formData, embreagem: e.target.value })} className={inputStyle} /></div>
              </div>
              <div className="flex border-b border-zinc-200">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>TRANSMISSAO DIANTEIRA</label><input value={formData.transmissao_diant} onChange={e => setFormData({ ...formData, transmissao_diant: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>TRANSMISSAO TRASEIRA</label><input value={formData.trasmissao_tras} onChange={e => setFormData({ ...formData, trasmissao_tras: e.target.value })} className={inputStyle} /></div>
              </div>
              <div className="flex">
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>BOMBA HIDRAULICA</label><input value={formData.bomb_hidra} onChange={e => setFormData({ ...formData, bomb_hidra: e.target.value })} className={inputStyle} /></div>
              </div>
            </div>

            <div className="text-xs font-black text-red-600 uppercase">IV. FLUIDOS E PNEUMATICOS</div>
            <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
              <div className="flex border-b border-zinc-200">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>OLEO MOTOR</label><input value={formData.oleo_motor} onChange={e => setFormData({ ...formData, oleo_motor: e.target.value })} className={inputStyle} /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>OLEO TRANSMISSAO</label><input value={formData.oleo_trasmissao} onChange={e => setFormData({ ...formData, oleo_trasmissao: e.target.value })} className={inputStyle} /></div>
              </div>
              <div className="flex">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>DIANTEIRA MINIMA E MAXIMA</label><input value={formData.diant_min_max} onChange={e => setFormData({ ...formData, diant_min_max: e.target.value })} className={inputStyle} placeholder="Ex: 12.4-24" /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>TRASEIRA MINIMA E MAXIMA</label><input value={formData.tras_min_max} onChange={e => setFormData({ ...formData, tras_min_max: e.target.value })} className={inputStyle} placeholder="Ex: 18.4-30" /></div>
              </div>
            </div>

            <div className="text-xs font-black text-red-600 uppercase">V. OBSERVACOES</div>
            <textarea value={formData.obs} onChange={e => setFormData({ ...formData, obs: e.target.value })} className="px-4 py-3.5 border border-zinc-200 rounded-xl text-sm w-full min-h-[80px] bg-white resize-none font-bold outline-none focus:ring-2 focus:ring-red-500/40" placeholder="Informacoes tecnicas adicionais..." />
          </form>
        </div>

        <div className="px-8 py-5 bg-white border-t border-zinc-200">
          <button onClick={handleSave} disabled={loading || uploading} className="w-full py-4 bg-red-600 text-white border-none rounded-xl font-black cursor-pointer text-base hover:bg-red-700 transition-colors disabled:opacity-50">{loading ? 'CADASTRANDO...' : 'SALVAR TRATOR NO SISTEMA'}</button>
        </div>
      </div>
    </div>
  )
}
