'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function TratorEditModal({ onClose }) {
  const [listaTratores, setListaTratores] = useState([])
  const [busca, setBusca] = useState('')
  const [selecionado, setSelecionado] = useState(null)
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)

  const [formData, setFormData] = useState({
    marca: '', modelo: '', motor: '', transmissao_diant: '',
    bomb_inje: '', bomb_hidra: '', embreagem: '', capacit_comb: '',
    cambio: '', reversor: '', trasmissao_tras: '', oleo_motor: '',
    oleo_trasmissao: '', diant_min_max: '', tras_min_max: '',
    obs: '', imagem: '', ano: '', 'finame/ncm': ''
  })

  useEffect(() => { fetchTratores() }, [])

  const fetchTratores = async () => {
    const { data } = await supabase.from('cad_trator').select('*').order('marca')
    if (data) setListaTratores(data)
  }

  const handleSelecionar = (t) => {
    setSelecionado(t); setFormData({ ...t }); setBusca(`${t.marca} ${t.modelo}`); setShowDropdown(false)
  }

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
    } catch (err) { alert("Erro upload: " + err.message) }
    finally { setUploading(false) }
  }

  const handleUpdate = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.from('cad_trator').update(formData).eq('id', selecionado.id)
    if (!error) { alert("TRATOR ATUALIZADO COM SUCESSO!"); window.location.reload() }
    else { alert("Erro: " + error.message); setLoading(false) }
  }

  const inputStyle = "w-full border-none outline-none text-sm font-bold bg-transparent"
  const labelStyle = "text-[9px] font-black text-zinc-500 uppercase mb-1 block"

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex justify-center items-center z-[6000]">
      <div className="bg-white w-[95%] max-w-[1000px] h-[90vh] rounded-2xl flex flex-col border border-zinc-200 shadow-2xl overflow-hidden">
        <div className="px-8 py-5 bg-white border-b border-zinc-200 flex justify-between items-center">
          <h2 className="font-black text-zinc-900">EDICAO DE TRATORES</h2>
          <button onClick={onClose} className="font-black text-zinc-500 hover:text-red-600 bg-transparent border-none cursor-pointer">FECHAR [X]</button>
        </div>

        <div className="px-8 py-6 overflow-y-auto flex-1">
          <div className="relative mb-6">
            <label className="text-[11px] font-black text-zinc-700 mb-2 block">PESQUISAR TRATOR PARA EDITAR</label>
            <input className="w-full px-4 py-3 bg-zinc-900 text-white rounded-xl border-none text-sm font-bold" value={busca}
              onFocus={() => setShowDropdown(true)}
              onChange={e => { setBusca(e.target.value); setSelecionado(null); setShowDropdown(true) }}
              placeholder="Clique para ver todos ou digite marca/modelo..." />

            {showDropdown && !selecionado && (
              <div className="absolute top-[75px] left-0 right-0 bg-white border-2 border-zinc-300 z-[100] max-h-[250px] overflow-y-auto rounded-xl shadow-xl">
                {listaTratores
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
              <button onClick={() => { setSelecionado(null); setBusca(''); setShowDropdown(true) }} className="mt-2.5 bg-zinc-100 border-none px-3 py-2 rounded-md cursor-pointer text-[10px] font-bold hover:bg-zinc-200 transition-colors">Trocar Trator (Nova Busca)</button>
            )}
          </div>

          {selecionado && (
            <form onSubmit={handleUpdate} className="flex flex-col gap-5">
              <div className="text-xs font-black text-red-600 uppercase">I. IDENTIFICACAO E FOTO</div>
              <div className="text-center">
                <div className="inline-flex flex-col items-center gap-2.5">
                  {formData.imagem ? (
                    <img src={formData.imagem} className="w-[250px] max-h-[180px] object-contain border-2 border-zinc-300 rounded-xl" alt="Trator" />
                  ) : (
                    <div className="w-[250px] h-[150px] bg-zinc-100 flex items-center justify-center rounded-xl border-2 border-dashed border-zinc-300">SEM FOTO</div>
                  )}
                  <input type="file" id="editTratorImg" className="hidden" onChange={handleUpload} />
                  <button type="button" onClick={() => document.getElementById('editTratorImg').click()} className="px-4 py-2 bg-zinc-900 text-white border-none rounded-md cursor-pointer text-[10px] font-extrabold">{uploading ? 'ENVIANDO...' : 'ALTERAR FOTO'}</button>
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

              <div className="text-xs font-black text-red-600 uppercase">II. MOTOR E COMBUSTIVEL</div>
              <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
                <div className="flex">
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>MOTOR</label><input value={formData.motor} onChange={e => setFormData({ ...formData, motor: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>BOMBA INJETORA</label><input value={formData.bomb_inje} onChange={e => setFormData({ ...formData, bomb_inje: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>CAPACIDADE TANQUE</label><input value={formData.capacit_comb} onChange={e => setFormData({ ...formData, capacit_comb: e.target.value })} className={inputStyle} /></div>
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
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>TRANSMISSAO DIANT.</label><input value={formData.transmissao_diant} onChange={e => setFormData({ ...formData, transmissao_diant: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>TRANSMISSAO TRAS.</label><input value={formData.trasmissao_tras} onChange={e => setFormData({ ...formData, trasmissao_tras: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>BOMBA HIDRAULICA</label><input value={formData.bomb_hidra} onChange={e => setFormData({ ...formData, bomb_hidra: e.target.value })} className={inputStyle} /></div>
                </div>
              </div>

              <div className="text-xs font-black text-red-600 uppercase">IV. FLUIDOS E PNEUS</div>
              <div className="border border-zinc-200 bg-white rounded-xl overflow-hidden">
                <div className="flex border-b border-zinc-200">
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>OLEO MOTOR</label><input value={formData.oleo_motor} onChange={e => setFormData({ ...formData, oleo_motor: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>OLEO TRANSMISSAO</label><input value={formData.oleo_trasmissao} onChange={e => setFormData({ ...formData, oleo_trasmissao: e.target.value })} className={inputStyle} /></div>
                </div>
                <div className="flex">
                  <div className="flex-1 p-3 border-r border-zinc-200 flex flex-col"><label className={labelStyle}>DIANTEIRA MINIMA E MAXIMA</label><input value={formData.diant_min_max} onChange={e => setFormData({ ...formData, diant_min_max: e.target.value })} className={inputStyle} /></div>
                  <div className="flex-1 p-3 flex flex-col"><label className={labelStyle}>TRASEIRA MINIMA E MAXIMA</label><input value={formData.tras_min_max} onChange={e => setFormData({ ...formData, tras_min_max: e.target.value })} className={inputStyle} /></div>
                </div>
              </div>

              <div className="text-xs font-black text-red-600 uppercase">V. OBSERVACOES</div>
              <textarea value={formData.obs} onChange={e => setFormData({ ...formData, obs: e.target.value })} className="px-4 py-3.5 border border-zinc-200 rounded-xl text-sm w-full min-h-[80px] bg-white resize-none font-bold outline-none focus:ring-2 focus:ring-red-500/40" />

              <button type="submit" disabled={loading || uploading} className="w-full py-4 bg-zinc-900 text-white border-none rounded-xl font-black cursor-pointer mt-2.5 mb-5 hover:bg-zinc-800 transition-colors disabled:opacity-50">{loading ? 'SALVANDO...' : 'ATUALIZAR CADASTRO DO TRATOR'}</button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
