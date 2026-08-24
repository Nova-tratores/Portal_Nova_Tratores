'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X } from 'lucide-react'

// Status "perdido" — string EXATA gravada no banco.
export const STATUS_PERDIDO = 'Concluida- Não vendido.'

// Ao marcar a proposta como "não vendido", obriga a registrar o PORQUÊ
// (grava status + motivo_perda_id + concorrente). Sem isso, "perdi a venda"
// não vira informação de gestão.
export default function MotivoPerdaModal({ proposta, onClose, onSaved }) {
  const [motivos, setMotivos] = useState([])
  const [motivoId, setMotivoId] = useState('')
  const [concorrente, setConcorrente] = useState('')
  const [concorrenteValor, setConcorrenteValor] = useState('')
  const [obs, setObs] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('motivo_perda').select('*').eq('ativo', true).order('id')
      .then(({ data }) => setMotivos(data || []))
  }, [])

  const motivoSel = motivos.find(m => String(m.id) === String(motivoId))
  const exigeConc = !!motivoSel?.exige_concorrente

  const confirmar = async () => {
    if (!motivoId) { alert('Escolha o motivo da perda.'); return }
    if (exigeConc && !concorrente.trim()) { alert('Este motivo exige informar o concorrente.'); return }
    setSaving(true)
    const patch = {
      status: STATUS_PERDIDO,
      motivo_perda_id: Number(motivoId),
      concorrente: concorrente.trim() || null,
      concorrente_valor: concorrenteValor ? Number(concorrenteValor) : null,
      motivo_perda_obs: obs.trim() || null,
    }
    const { error } = await supabase.from('Formulario').update(patch).eq('id', proposta.id)
    setSaving(false)
    if (error) { alert('Erro ao salvar: ' + error.message); return }
    onSaved?.(patch, motivoSel?.nome)
  }

  const inputStyle = "w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-500/40"

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[10002] p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-[440px] max-w-full rounded-2xl border border-zinc-200 shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-zinc-900">Por que a proposta foi perdida?</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Proposta <span className="text-red-600 font-semibold">#{proposta.id}</span> · {proposta.Cliente || 'sem nome'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-red-600 flex items-center justify-center"><X size={18} /></button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">Motivo da perda *</label>
            <select value={motivoId} onChange={e => setMotivoId(e.target.value)} className={`${inputStyle} cursor-pointer`} autoFocus>
              <option value="">Selecione...</option>
              {motivos.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
            </select>
          </div>

          {exigeConc && (
            <div className="grid grid-cols-[1fr_140px] gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">Concorrente *</label>
                <input value={concorrente} onChange={e => setConcorrente(e.target.value)} className={inputStyle} placeholder="Quem levou a venda" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">Valor deles (R$)</label>
                <input type="number" step="0.01" value={concorrenteValor} onChange={e => setConcorrenteValor(e.target.value)} className={inputStyle} placeholder="opcional" />
              </div>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">Observações (mais informações)</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3} className={`${inputStyle} resize-none`} placeholder="Contexto, o que faltou, próximos passos..." />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-zinc-200 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg bg-zinc-100 text-zinc-600 text-sm font-semibold hover:bg-zinc-200 transition-colors">Cancelar</button>
          <button onClick={confirmar} disabled={saving} className="px-5 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50">{saving ? 'Salvando...' : 'Marcar como perdida'}</button>
        </div>
      </div>
    </div>
  )
}
