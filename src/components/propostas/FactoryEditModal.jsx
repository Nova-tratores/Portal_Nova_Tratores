'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function FactoryEditModal({ order, onClose, onConvert }) {
  const [formData, setFormData] = useState(order || {})
  const isLocked = order.convertido

  const handleUpdate = async () => {
    if (isLocked) return
    const { error } = await supabase.from('Proposta_Fabrica').update(formData).eq('id', order.id)
    if (!error) { alert("PEDIDO SALVO!"); window.location.reload() }
  }

  const inputStyle = "w-full border-none outline-none text-[15px] font-semibold text-zinc-800 bg-transparent"

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex justify-center items-center z-[2000]">
      <div className={`bg-zinc-50 w-[95%] max-w-[650px] rounded-2xl flex flex-col overflow-hidden shadow-2xl ${isLocked ? 'border-4 border-emerald-500' : 'border border-zinc-200'}`}>
        <div className="px-10 py-5 bg-white border-b border-zinc-200 flex justify-between items-center">
          <div>
            <h2 className="text-base font-black text-zinc-900">
              {isLocked ? 'VISUALIZACAO DE REGISTRO' : 'EDICAO DE FABRICA'} #{formData.id}
            </h2>
            {isLocked && <div className="bg-emerald-500 text-white text-[9px] px-2 py-0.5 rounded mt-1 font-black inline-block">CONVERTIDO EM PROPOSTA CLIENTE N {formData.proposta_id_gerada}</div>}
          </div>
          <button onClick={onClose} className="text-red-600 font-bold bg-transparent border-none cursor-pointer hover:text-red-800">FECHAR</button>
        </div>

        <div className={`px-10 py-8 overflow-y-auto ${isLocked ? 'bg-green-50' : 'bg-zinc-50'}`}>
          <div className="flex flex-col gap-6">
            <section className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-zinc-50 text-[9px] font-extrabold text-zinc-400 border-b border-zinc-200">LOGISTICA FABRICA</div>
              <div className="flex">
                <div className="flex-1 p-4 border-r border-zinc-100 flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-zinc-400">VENDEDOR FABRICA</label>
                  <input value={formData.vendedor_fab || ''} disabled={isLocked} onChange={e => setFormData({ ...formData, vendedor_fab: e.target.value })} className={inputStyle} />
                </div>
                <div className="flex-1 p-4 flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-zinc-400">CLIENTE INTERESSADO</label>
                  <input value={formData.cliente || ''} readOnly className={inputStyle} />
                </div>
              </div>
            </section>

            <section className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-zinc-50 text-[9px] font-extrabold text-zinc-400 border-b border-zinc-200">FASE E VALOR</div>
              <div className="flex">
                <div className="flex-1 p-4 border-r border-zinc-100 flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-zinc-400">VALOR FINAL (R$)</label>
                  <input type="number" value={formData.valor_final || ''} disabled={isLocked} onChange={e => setFormData({ ...formData, valor_final: e.target.value })} className={inputStyle} />
                </div>
                <div className="flex-1 p-4 flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-zinc-400">FASE ATUAL</label>
                  <input value={formData.status || ''} disabled={isLocked} className={inputStyle} />
                </div>
              </div>
            </section>
          </div>
        </div>

        <div className="px-10 py-6 bg-white border-t border-zinc-200 flex gap-4">
          {isLocked ? (
            <p className="text-emerald-600 font-black text-center w-full text-xs">
              ESTE CARD ESTA BLOQUEADO PARA EDICAO POIS JA FOI GERADA UMA PROPOSTA COMERCIAL.
            </p>
          ) : (
            <>
              {formData.status?.includes('Concluida') && (
                <button onClick={() => onConvert(formData)} className="flex-[1.5] py-4 bg-emerald-500 text-white border-none rounded-xl font-black cursor-pointer hover:bg-emerald-600 transition-colors">GERAR PROPOSTA COMERCIAL</button>
              )}
              <button onClick={handleUpdate} className="flex-1 py-4 bg-zinc-900 text-white border-none rounded-xl font-bold cursor-pointer hover:bg-zinc-800 transition-colors">SALVAR DADOS</button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
