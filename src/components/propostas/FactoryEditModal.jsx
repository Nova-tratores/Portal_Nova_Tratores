'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, Link2 } from 'lucide-react'

// Colunas que só existem na view v_proposta_fabrica — não podem ir num UPDATE da tabela.
const COLS_VIEW_FAB = ['dias_na_fase', 'cor_hex', 'cor_pasta', 'fase_ordem', 'eh_final', 'dias_atraso_eta']
const semColsViewFab = (obj) => { const o = { ...obj }; for (const k of COLS_VIEW_FAB) delete o[k]; return o }

export default function FactoryEditModal({ order, onClose, onConvert }) {
  const [formData, setFormData] = useState(order || {})
  const isLocked = order.convertido
  const [propVinc, setPropVinc] = useState(null)     // proposta cliente já vinculada a este pedido
  const [listaProp, setListaProp] = useState([])     // propostas p/ vincular
  const [buscaProp, setBuscaProp] = useState('')
  const [showProp, setShowProp] = useState(false)
  const propRef = useRef(null)

  useEffect(() => {
    (async () => {
      const { data: vinc } = await supabase.from('Formulario').select('id,Cliente,status').eq('id_fabrica_ref', String(order.id)).is('deleted_at', null).maybeSingle()
      setPropVinc(vinc || null)
      // Candidatas a vincular: propostas não deletadas e ainda sem pedido de fábrica.
      const { data: livres } = await supabase.from('Formulario').select('id,Cliente,Marca,Modelo,status,id_fabrica_ref').is('deleted_at', null).order('id', { ascending: false })
      setListaProp((livres || []).filter(p => !p.id_fabrica_ref))
    })()
  }, [order.id])

  useEffect(() => {
    const onDoc = (e) => { if (propRef.current && !propRef.current.contains(e.target)) setShowProp(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const vincularProposta = async (prop) => {
    const { error } = await supabase.from('Formulario').update({ id_fabrica_ref: String(order.id) }).eq('id', prop.id)
    if (error) { alert('Erro ao vincular: ' + error.message); return }
    alert('PEDIDO #' + order.id + ' VINCULADO À PROPOSTA #' + prop.id); window.location.reload()
  }

  const handleUpdate = async () => {
    // Convertido bloqueia os campos principais (desabilitados), mas custo/frete
    // são logística pós-conversão e continuam editáveis/salváveis.
    const payload = semColsViewFab(formData)
    payload.custo = (formData.custo === '' || formData.custo == null) ? null : Number(formData.custo)          // numeric
    payload.frete_valor = (formData.frete_valor === '' || formData.frete_valor == null) ? null : Number(formData.frete_valor)  // numeric
    payload.frete_modalidade = formData.frete_modalidade || null   // CHECK: só null/incluso/nao_incluso
    const { error } = await supabase.from('Proposta_Fabrica').update(payload).eq('id', order.id)
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
            {propVinc && <div className="bg-emerald-500 text-white text-[9px] px-2 py-0.5 rounded mt-1 font-black inline-block">VINCULADO À PROPOSTA CLIENTE #{propVinc.id}</div>}
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

            <section className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
              <div className="px-4 py-2.5 bg-zinc-50 text-[9px] font-extrabold text-zinc-400 border-b border-zinc-200">CUSTO E FRETE</div>
              <div className="flex border-b border-zinc-100">
                <div className="flex-1 p-4 border-r border-zinc-100 flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-zinc-400">CUSTO (R$)</label>
                  <input type="number" value={formData.custo ?? ''} onChange={e => setFormData({ ...formData, custo: e.target.value })} className={inputStyle} />
                </div>
                <div className="flex-1 p-4 flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-zinc-400">MODALIDADE DE FRETE</label>
                  <select value={formData.frete_modalidade ?? ''} onChange={e => setFormData({ ...formData, frete_modalidade: e.target.value })} className={`${inputStyle} cursor-pointer`}>
                    <option value="">— não definido —</option>
                    <option value="incluso">Incluso</option>
                    <option value="nao_incluso">Não incluso</option>
                  </select>
                </div>
              </div>
              <div className="flex">
                <div className="flex-1 p-4 flex flex-col gap-1">
                  <label className="text-[8px] font-bold text-zinc-400">VALOR DO FRETE (R$)</label>
                  <input type="number" value={formData.frete_valor ?? ''} onChange={e => setFormData({ ...formData, frete_valor: e.target.value })} className={inputStyle} />
                </div>
              </div>
              <div className="px-4 pb-3 text-[10px] text-zinc-400">Custo/frete podem ser editados mesmo após a conversão.</div>
            </section>

            <section className="bg-white rounded-xl border border-zinc-200 overflow-visible">
              <div className="px-4 py-2.5 bg-zinc-50 text-[9px] font-extrabold text-zinc-400 border-b border-zinc-200">PROPOSTA DE CLIENTE VINCULADA</div>
              <div className="p-4">
                {propVinc ? (
                  <div className="flex items-center gap-2 text-sm text-zinc-700">
                    <Link2 size={16} className="text-emerald-600 shrink-0" />
                    Vinculado à proposta <span className="font-bold">#{propVinc.id}</span> — {propVinc.Cliente || 'sem nome'}
                  </div>
                ) : (
                  <div className="relative" ref={propRef}>
                    <label className="text-[8px] font-bold text-zinc-400">VINCULAR A UMA PROPOSTA DE CLIENTE EXISTENTE (SEM PEDIDO)</label>
                    <div className="relative mt-1">
                      <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" />
                      <input className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-500/30" value={buscaProp} onFocus={() => setShowProp(true)} onChange={e => { setBuscaProp(e.target.value); setShowProp(true) }} placeholder="Buscar por cliente, modelo ou #ID..." />
                    </div>
                    {showProp && (
                      <div className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-zinc-200 z-[100] max-h-[240px] overflow-y-auto rounded-xl shadow-xl">
                        {listaProp.filter(p => { const t = buscaProp.toLowerCase(); return !buscaProp || (p.Cliente || '').toLowerCase().includes(t) || (p.Modelo || '').toLowerCase().includes(t) || (p.Marca || '').toLowerCase().includes(t) || String(p.id).includes(t) }).slice(0, 50).map(p => (
                          <div key={p.id} className="px-3 py-2.5 cursor-pointer border-b border-zinc-100 hover:bg-red-50 text-sm" onClick={() => vincularProposta(p)}>
                            <span className="font-bold text-zinc-700">#{p.id}</span> <span className="text-zinc-800">{p.Cliente || 'sem nome'}</span>
                            <div className="text-[11px] text-zinc-500">{p.Marca} {p.Modelo} · {p.status}</div>
                          </div>
                        ))}
                        {listaProp.length === 0 && <div className="px-3 py-3 text-sm text-zinc-400">Nenhuma proposta livre para vincular.</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="px-10 py-6 bg-white border-t border-zinc-200 flex flex-col gap-3">
          {isLocked && (
            <p className="text-emerald-600 font-bold text-center w-full text-xs">
              CARD CONVERTIDO — apenas custo/frete são editáveis (os demais campos ficam bloqueados).
            </p>
          )}
          <div className="flex gap-4">
            {!isLocked && formData.status?.includes('Concluida') && (
              <button onClick={() => onConvert(formData)} className="flex-[1.5] py-4 bg-emerald-500 text-white border-none rounded-xl font-black cursor-pointer hover:bg-emerald-600 transition-colors">GERAR PROPOSTA COMERCIAL</button>
            )}
            <button onClick={handleUpdate} className="flex-1 py-4 bg-zinc-900 text-white border-none rounded-xl font-bold cursor-pointer hover:bg-zinc-800 transition-colors">{isLocked ? 'SALVAR CUSTO / FRETE' : 'SALVAR DADOS'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
