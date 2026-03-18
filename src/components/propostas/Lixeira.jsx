'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function Lixeira({ onClose }) {
  const [loading, setLoading] = useState(false)
  const [itensExcluidos, setItensExcluidos] = useState([])
  const [filtro, setFiltro] = useState('')

  useEffect(() => { buscarExcluidos() }, [])

  const buscarExcluidos = async () => {
    setLoading(true)
    const { data } = await supabase.from('Formulario').select('*').eq('status', 'Lixeira').order('id', { ascending: false })
    if (data) setItensExcluidos(data)
    setLoading(false)
  }

  const restaurarProposta = async (id) => {
    const { error } = await supabase.from('Formulario').update({ status: 'Enviar Proposta' }).eq('id', id)
    if (!error) { alert("PROPOSTA RESTAURADA COM SUCESSO!"); buscarExcluidos() }
  }

  const excluirParaSempre = async (id) => {
    if (confirm("ATENCAO: ESTA ACAO E IRREVERSIVEL. DESEJA EXCLUIR PARA SEMPRE?")) {
      const { error } = await supabase.from('Formulario').delete().eq('id', id)
      if (!error) { alert("PROPOSTA ELIMINADA DO SISTEMA."); buscarExcluidos() }
    }
  }

  const listaFiltrada = itensExcluidos.filter(item =>
    item.Cliente?.toLowerCase().includes(filtro.toLowerCase()) ||
    item.Modelo?.toLowerCase().includes(filtro.toLowerCase()) ||
    item.id?.toString().includes(filtro)
  )

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex justify-center items-center z-[10000]">
      <div className="bg-white w-[95%] max-w-[900px] h-[85vh] rounded-2xl border border-zinc-200 flex flex-col shadow-2xl overflow-hidden">
        <div className="px-8 py-5 bg-white border-b border-zinc-200 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <span className="text-2xl">&#128465;</span>
            <h2 className="font-black text-zinc-900">LIXEIRA DO SISTEMA</h2>
          </div>
          <button onClick={onClose} className="font-black text-zinc-500 hover:text-red-600 bg-transparent border-none cursor-pointer">FECHAR [X]</button>
        </div>

        <div className="px-8 py-4 bg-zinc-50 border-b border-zinc-200">
          <label className="text-[10px] font-black text-zinc-700 block mb-1">PESQUISAR NA LIXEIRA</label>
          <input className="w-full px-3 py-3 rounded-lg border border-zinc-200 font-bold text-sm outline-none focus:ring-2 focus:ring-red-500/40" placeholder="Buscar por cliente, modelo ou ID..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center font-black mt-12 text-zinc-400">CARREGANDO...</div>
          ) : listaFiltrada.length === 0 ? (
            <div className="text-center text-zinc-400 mt-12 font-black">NENHUM ITEM ENCONTRADO</div>
          ) : (
            <table className="w-full border-collapse bg-white rounded-xl overflow-hidden border border-zinc-200">
              <thead>
                <tr>
                  <th className="text-left p-4 bg-zinc-900 text-white text-xs font-black uppercase">ID</th>
                  <th className="text-left p-4 bg-zinc-900 text-white text-xs font-black uppercase">CLIENTE</th>
                  <th className="text-left p-4 bg-zinc-900 text-white text-xs font-black uppercase">MAQUINA / MODELO</th>
                  <th className="text-left p-4 bg-zinc-900 text-white text-xs font-black uppercase">ACOES</th>
                </tr>
              </thead>
              <tbody>
                {listaFiltrada.map(item => (
                  <tr key={item.id} className="border-b border-zinc-100">
                    <td className="p-4 text-[13px] font-bold text-zinc-700"><strong>#{item.id}</strong></td>
                    <td className="p-4 text-[13px] font-bold text-zinc-700">{item.Cliente}</td>
                    <td className="p-4 text-[13px] font-bold text-zinc-700">{item.Marca} {item.Modelo}</td>
                    <td className="p-4">
                      <div className="flex gap-2.5">
                        <button onClick={() => restaurarProposta(item.id)} className="bg-emerald-500 text-white border-none px-4 py-2 rounded-md font-black cursor-pointer text-[10px] hover:bg-emerald-600 transition-colors">RESTAURAR</button>
                        <button onClick={() => excluirParaSempre(item.id)} className="bg-red-600 text-white border-none px-4 py-2 rounded-md font-black cursor-pointer text-[10px] hover:bg-red-700 transition-colors">EXCLUIR DEFINITIVO</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
