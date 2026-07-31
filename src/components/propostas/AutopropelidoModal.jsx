'use client'
import { useState } from 'react'

export default function AutopropelidoModal({ onClose }) {
  const [loading, setLoading] = useState(false)
  const [uploading] = useState(false)
  const [imagePreview, setImagePreview] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [formData, setFormData] = useState({
    marca: '', modelo: '', ano: '', 'finame/ncm': '',
    motor: '', transmissao: '', tanque_pulv: '', tecnologia: '', telemetria: '',
    barra_pulv: '', num_secoes: '', espac_bicos: '', vao_livre: '', bitola: '', tanque_comb: ''
  })

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const fd = new FormData()
      for (const [key, val] of Object.entries(formData)) {
        if (val) fd.append(key, val)
      }
      if (imageFile) fd.append('file', imageFile)

      const res = await fetch('/api/propostas/autopropelido', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao cadastrar')
      alert("AUTOPROPELIDO CADASTRADO COM SUCESSO!")
      window.location.reload()
    } catch (error) {
      alert("Erro ao cadastrar autopropelido: " + error.message)
    }
    setLoading(false)
  }

  const inputStyle = "w-full border-none outline-none text-sm font-bold bg-transparent"
  const labelStyle = "text-[9px] font-black text-zinc-500 uppercase mb-1 block"

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex justify-center items-center z-[5000]">
      <div className="bg-white w-[95%] max-w-[1100px] h-[90vh] rounded-2xl flex flex-col border border-zinc-200 shadow-2xl overflow-hidden">
        <div className="px-8 py-5 bg-white border-b border-zinc-200 flex justify-between items-center">
          <h2 className="font-black text-zinc-900">CADASTRAR NOVO AUTOPROPELIDO</h2>
          <button onClick={onClose} className="font-black text-zinc-500 hover:text-red-600 bg-transparent border-none cursor-pointer">FECHAR [X]</button>
        </div>

        <div className="px-8 py-6 overflow-y-auto flex-1">
          <form onSubmit={handleSave} className="flex flex-col gap-5">
            <div className="text-xs font-black text-red-600 uppercase">I. IDENTIFICACAO E FOTO</div>
            <div className="text-center">
              <div className="inline-flex flex-col items-center gap-2.5 mb-2.5">
                {imagePreview ? (
                  <img src={imagePreview} className="w-[300px] h-[200px] object-cover border-2 border-zinc-300 rounded-xl" alt="Autopropelido" />
                ) : (
                  <div className="w-[300px] h-[200px] flex items-center justify-center bg-zinc-100 border-2 border-dashed border-zinc-300 rounded-xl text-zinc-400 font-bold">SEM FOTO</div>
                )}
                <input type="file" id="fileAuto" onChange={handleFileSelect} className="hidden" accept="image/*" />
                <button type="button" onClick={() => document.getElementById('fileAuto').click()} className="px-5 py-2.5 bg-zinc-900 text-white border-none rounded-lg cursor-pointer font-extrabold text-[11px]">{uploading ? 'ENVIANDO...' : 'ANEXAR FOTO DO AUTOPROPELIDO'}</button>
              </div>
            </div>

            <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
              <div className="flex border-b border-zinc-200">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>MARCA</label><input required value={formData.marca} onChange={e => setFormData({ ...formData, marca: e.target.value })} className={inputStyle} placeholder="Ex: KUHN" /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>MODELO</label><input required value={formData.modelo} onChange={e => setFormData({ ...formData, modelo: e.target.value })} className={inputStyle} placeholder="Ex: STRONGER 3200 HD" /></div>
              </div>
              <div className="flex">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>ANO</label><input value={formData.ano} onChange={e => setFormData({ ...formData, ano: e.target.value })} className={inputStyle} placeholder="Ex: 2026" /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>FINAME / NCM</label><input value={formData['finame/ncm']} onChange={e => setFormData({ ...formData, 'finame/ncm': e.target.value })} className={inputStyle} placeholder="Ex: 03540770 / 84244900" /></div>
              </div>
            </div>

            <div className="text-xs font-black text-red-600 uppercase">II. MOTOR E TRANSMISSAO</div>
            <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
              <div className="flex">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>MOTOR</label><input value={formData.motor} onChange={e => setFormData({ ...formData, motor: e.target.value })} className={inputStyle} placeholder="Ex: MWM de 280 cv" /></div>
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>TRANSMISSAO</label><input value={formData.transmissao} onChange={e => setFormData({ ...formData, transmissao: e.target.value })} className={inputStyle} placeholder="Ex: Eletronica hidrostatica - 4WD" /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>TANQUE DE COMBUSTIVEL (L)</label><input value={formData.tanque_comb} onChange={e => setFormData({ ...formData, tanque_comb: e.target.value })} className={inputStyle} placeholder="Ex: 400" /></div>
              </div>
            </div>

            <div className="text-xs font-black text-red-600 uppercase">III. PULVERIZACAO</div>
            <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
              <div className="flex border-b border-zinc-200">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>TANQUE DE PULVERIZACAO (L)</label><input value={formData.tanque_pulv} onChange={e => setFormData({ ...formData, tanque_pulv: e.target.value })} className={inputStyle} placeholder="Ex: 3200 em aco inox" /></div>
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>BARRA DE PULVERIZACAO (M)</label><input value={formData.barra_pulv} onChange={e => setFormData({ ...formData, barra_pulv: e.target.value })} className={inputStyle} placeholder="Ex: 32M" /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>NUMERO DE SECOES</label><input value={formData.num_secoes} onChange={e => setFormData({ ...formData, num_secoes: e.target.value })} className={inputStyle} placeholder="Ex: 19 - Air System" /></div>
              </div>
              <div className="flex">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>ESPACAMENTO ENTRE BICOS (CM)</label><input value={formData.espac_bicos} onChange={e => setFormData({ ...formData, espac_bicos: e.target.value })} className={inputStyle} placeholder="Ex: 50" /></div>
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>VAO LIVRE (M)</label><input value={formData.vao_livre} onChange={e => setFormData({ ...formData, vao_livre: e.target.value })} className={inputStyle} placeholder="Ex: 1,8" /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>BITOLA (M)</label><input value={formData.bitola} onChange={e => setFormData({ ...formData, bitola: e.target.value })} className={inputStyle} placeholder="Ex: Ajustavel 2,80 a 3,50" /></div>
              </div>
            </div>

            <div className="text-xs font-black text-red-600 uppercase">IV. TECNOLOGIA</div>
            <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
              <div className="flex">
                <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>TECNOLOGIA</label><input value={formData.tecnologia} onChange={e => setFormData({ ...formData, tecnologia: e.target.value })} className={inputStyle} placeholder="Ex: TRIMBLE 1060" /></div>
                <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>TELEMETRIA</label><input value={formData.telemetria} onChange={e => setFormData({ ...formData, telemetria: e.target.value })} className={inputStyle} placeholder="Ex: Liberacao por 1 ano gratis" /></div>
              </div>
            </div>
          </form>
        </div>

        <div className="px-8 py-5 bg-white border-t border-zinc-200">
          <button onClick={handleSave} disabled={loading} className="w-full py-4 bg-red-600 text-white border-none rounded-xl font-black cursor-pointer text-base hover:bg-red-700 transition-colors disabled:opacity-50">{loading ? 'CADASTRANDO...' : 'SALVAR AUTOPROPELIDO NO SISTEMA'}</button>
        </div>
      </div>
    </div>
  )
}
