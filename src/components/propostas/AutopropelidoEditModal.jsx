'use client'
import { useState, useEffect } from 'react'

export default function AutopropelidoEditModal({ onClose }) {
  const [lista, setLista] = useState([])
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState(null)
  const [loading, setLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const [imageFile, setImageFile] = useState(null)

  const [formData, setFormData] = useState({
    marca: '', modelo: '', ano: '', 'finame/ncm': '', imagem: '',
    motor: '', transmissao: '', tanque_pulv: '', tecnologia: '', telemetria: '',
    barra_pulv: '', num_secoes: '', espac_bicos: '', vao_livre: '', bitola: '', tanque_comb: ''
  })

  useEffect(() => { fetchLista() }, [])

  const fetchLista = async () => {
    try {
      const res = await fetch('/api/propostas/autopropelido-lista')
      const data = await res.json()
      if (Array.isArray(data)) setLista(data)
    } catch (e) { console.error('Erro ao buscar autopropelidos:', e) }
  }

  const handleSelecionar = (t) => {
    setSelecionado(t); setFormData({ ...t }); setBusca(`${t.marca} ${t.modelo}`); setShowDropdown(false)
  }

  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImageFile(file)
    setFormData({ ...formData, imagem: URL.createObjectURL(file) })
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('id', String(selecionado.id))
      for (const [key, val] of Object.entries(formData)) {
        if (key !== 'id' && key !== 'imagem' && val != null) fd.append(key, String(val))
      }
      if (imageFile) {
        fd.append('file', imageFile)
      } else if (formData.imagem && !formData.imagem.startsWith('blob:')) {
        fd.append('imagem', formData.imagem)
      }

      const res = await fetch('/api/propostas/autopropelido', { method: 'PATCH', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao atualizar')
      alert("AUTOPROPELIDO ATUALIZADO COM SUCESSO!")
      window.location.reload()
    } catch (err) {
      alert("Erro: " + err.message)
    }
    setLoading(false)
  }

  const inputStyle = "w-full border-none outline-none text-sm font-bold bg-transparent"
  const labelStyle = "text-[9px] font-black text-zinc-500 uppercase mb-1 block"

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex justify-center items-center z-[6000]">
      <div className="bg-white w-[95%] max-w-[1000px] h-[90vh] rounded-2xl flex flex-col border border-zinc-200 shadow-2xl overflow-hidden">
        <div className="px-8 py-5 bg-white border-b border-zinc-200 flex justify-between items-center">
          <h2 className="font-black text-zinc-900">EDICAO DE AUTOPROPELIDOS</h2>
          <button onClick={onClose} className="font-black text-zinc-500 hover:text-red-600 bg-transparent border-none cursor-pointer">FECHAR [X]</button>
        </div>

        <div className="px-8 py-6 overflow-y-auto flex-1">
          <div className="relative mb-6">
            <label className="text-[11px] font-black text-zinc-700 mb-2 block">PESQUISAR AUTOPROPELIDO PARA EDITAR</label>
            <input className="w-full px-4 py-3 bg-zinc-900 text-white rounded-xl border-none text-sm font-bold" value={busca}
              onFocus={() => setShowDropdown(true)}
              onChange={e => { setBusca(e.target.value); setSelecionado(null); setShowDropdown(true) }}
              placeholder="Clique para ver todos ou digite marca/modelo..." />

            {showDropdown && !selecionado && (
              <div className="absolute top-[75px] left-0 right-0 bg-white border-2 border-zinc-300 z-[100] max-h-[250px] overflow-y-auto rounded-xl shadow-xl">
                {lista
                  .filter(t => { const termo = busca.toLowerCase(); return !busca || (t.marca || "").toLowerCase().includes(termo) || (t.modelo || "").toLowerCase().includes(termo) })
                  .slice(0, 40)
                  .map(t => (
                    <div key={t.id} className="p-3 cursor-pointer border-b border-zinc-100 text-zinc-800 font-semibold text-[13px] hover:bg-red-50" onClick={() => handleSelecionar(t)}>
                      <strong>{t.marca}</strong> {t.modelo} {t.ano ? `(${t.ano})` : ''}
                    </div>
                  ))}
              </div>
            )}

            {selecionado && (
              <button onClick={() => { setSelecionado(null); setBusca(''); setShowDropdown(true) }} className="mt-2.5 bg-zinc-100 border-none px-3 py-2 rounded-md cursor-pointer text-[10px] font-bold hover:bg-zinc-200 transition-colors">Trocar Autopropelido (Nova Busca)</button>
            )}
          </div>

          {selecionado && (
            <form onSubmit={handleUpdate} className="flex flex-col gap-5">
              <div className="text-xs font-black text-red-600 uppercase">I. IDENTIFICACAO E FOTO</div>
              <div className="text-center">
                <div className="inline-flex flex-col items-center gap-2.5">
                  {formData.imagem ? (
                    <img src={formData.imagem} className="w-[250px] max-h-[180px] object-contain border-2 border-zinc-300 rounded-xl" alt="Autopropelido" />
                  ) : (
                    <div className="w-[250px] h-[150px] bg-zinc-100 flex items-center justify-center rounded-xl border-2 border-dashed border-zinc-300">SEM FOTO</div>
                  )}
                  <input type="file" id="editAutoImg" className="hidden" onChange={handleFileSelect} />
                  <button type="button" onClick={() => document.getElementById('editAutoImg').click()} className="px-4 py-2 bg-zinc-900 text-white border-none rounded-md cursor-pointer text-[10px] font-extrabold">ALTERAR FOTO</button>
                </div>
              </div>

              <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
                <div className="flex border-b border-zinc-200">
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>MARCA</label><input value={formData.marca} onChange={e => setFormData({ ...formData, marca: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>MODELO</label><input value={formData.modelo} onChange={e => setFormData({ ...formData, modelo: e.target.value })} className={inputStyle} /></div>
                </div>
                <div className="flex">
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>ANO</label><input value={formData.ano} onChange={e => setFormData({ ...formData, ano: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>FINAME / NCM</label><input value={formData['finame/ncm']} onChange={e => setFormData({ ...formData, 'finame/ncm': e.target.value })} className={inputStyle} /></div>
                </div>
              </div>

              <div className="text-xs font-black text-red-600 uppercase">II. MOTOR E TRANSMISSAO</div>
              <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
                <div className="flex">
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>MOTOR</label><input value={formData.motor} onChange={e => setFormData({ ...formData, motor: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>TRANSMISSAO</label><input value={formData.transmissao} onChange={e => setFormData({ ...formData, transmissao: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>TANQUE DE COMBUSTIVEL (L)</label><input value={formData.tanque_comb} onChange={e => setFormData({ ...formData, tanque_comb: e.target.value })} className={inputStyle} /></div>
                </div>
              </div>

              <div className="text-xs font-black text-red-600 uppercase">III. PULVERIZACAO</div>
              <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
                <div className="flex border-b border-zinc-200">
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>TANQUE DE PULVERIZACAO (L)</label><input value={formData.tanque_pulv} onChange={e => setFormData({ ...formData, tanque_pulv: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>BARRA DE PULVERIZACAO (M)</label><input value={formData.barra_pulv} onChange={e => setFormData({ ...formData, barra_pulv: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>NUMERO DE SECOES</label><input value={formData.num_secoes} onChange={e => setFormData({ ...formData, num_secoes: e.target.value })} className={inputStyle} /></div>
                </div>
                <div className="flex">
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>ESPACAMENTO ENTRE BICOS (CM)</label><input value={formData.espac_bicos} onChange={e => setFormData({ ...formData, espac_bicos: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>VAO LIVRE (M)</label><input value={formData.vao_livre} onChange={e => setFormData({ ...formData, vao_livre: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>BITOLA (M)</label><input value={formData.bitola} onChange={e => setFormData({ ...formData, bitola: e.target.value })} className={inputStyle} /></div>
                </div>
              </div>

              <div className="text-xs font-black text-red-600 uppercase">IV. TECNOLOGIA</div>
              <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
                <div className="flex">
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>TECNOLOGIA</label><input value={formData.tecnologia} onChange={e => setFormData({ ...formData, tecnologia: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>TELEMETRIA</label><input value={formData.telemetria} onChange={e => setFormData({ ...formData, telemetria: e.target.value })} className={inputStyle} /></div>
                </div>
              </div>

              <button type="submit" disabled={loading} className="w-full py-4 bg-zinc-900 text-white border-none rounded-xl font-black cursor-pointer mt-2.5 mb-5 hover:bg-zinc-800 transition-colors disabled:opacity-50">{loading ? 'SALVANDO...' : 'ATUALIZAR CADASTRO DO AUTOPROPELIDO'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
