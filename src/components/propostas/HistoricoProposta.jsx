'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { X, History, Plus, Pencil, ArrowRightLeft, Trash2, Copy } from 'lucide-react'

// Rótulos amigáveis dos campos gravados no log de edição.
const LABELS = {
  Cliente: 'Cliente', 'Cpf/Cpnj': 'CPF / CNPJ', 'inscricao_esta/mun': 'I.E. / Mun.',
  Cidade: 'Cidade', Bairro: 'Bairro', cep: 'CEP', End_Entrega: 'Endereço',
  Marca: 'Marca', Modelo: 'Modelo', Ano: 'Ano', Qtd_Eqp: 'Quantidade',
  Valor_Total: 'Valor total', validade: 'Validade', Condicoes: 'Condições de pagamento',
  Prazo_Entrega: 'Prazo de entrega', status: 'Status', Configuracao: 'Descrição técnica',
  Descricao: 'Descrição', termometro: 'Termômetro', vendedor_id: 'Vendedor',
  motivo_perda_id: 'Motivo da perda', motivo_perda_obs: 'Obs. da perda',
  concorrente: 'Concorrente', concorrente_valor: 'Valor do concorrente',
  id_fabrica_ref: 'Pedido de fábrica',
}
const rotulo = (k) => LABELS[k] || k

function fmtData(iso) {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  } catch { return String(iso) }
}

const META = {
  criar: { titulo: 'Proposta criada', Icon: Plus, cor: 'text-emerald-600', bg: 'bg-emerald-100' },
  editar: { titulo: 'Alterou a proposta', Icon: Pencil, cor: 'text-blue-600', bg: 'bg-blue-100' },
  mover_status: { titulo: 'Mudou o status', Icon: ArrowRightLeft, cor: 'text-amber-600', bg: 'bg-amber-100' },
  duplicar: { titulo: 'Duplicou a proposta', Icon: Copy, cor: 'text-violet-600', bg: 'bg-violet-100' },
  lixeira: { titulo: 'Moveu para a lixeira', Icon: Trash2, cor: 'text-red-600', bg: 'bg-red-100' },
}

export default function HistoricoProposta({ propostaId, onClose }) {
  const [loading, setLoading] = useState(true)
  const [eventos, setEventos] = useState([])

  useEffect(() => {
    let ativo = true
    ;(async () => {
      setLoading(true)
      const { data } = await supabase.from('audit_log').select('*')
        .eq('entidade', 'proposta').eq('entidade_id', String(propostaId))
        .order('created_at', { ascending: false })
      if (ativo) { setEventos(data || []); setLoading(false) }
    })()
    return () => { ativo = false }
  }, [propostaId])

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex justify-center items-center z-[10001] p-5" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-[600px] max-w-full max-h-[85vh] rounded-2xl border border-zinc-200 shadow-2xl flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b border-zinc-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 text-white flex items-center justify-center"><History size={18} /></div>
            <div>
              <h2 className="text-lg font-medium text-zinc-900">Histórico da proposta <span className="text-red-600">#{propostaId}</span></h2>
              <p className="text-xs text-zinc-400">Quem alterou, o que mudou e quando</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-red-600 flex items-center justify-center transition-colors"><X size={18} /></button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {loading ? (
            <div className="text-center text-zinc-400 py-12">Carregando...</div>
          ) : eventos.length === 0 ? (
            <div className="text-center text-zinc-400 py-12">Nenhuma alteração registrada ainda.</div>
          ) : (
            <div className="flex flex-col">
              {eventos.map((ev, i) => {
                const meta = META[ev.acao] || { titulo: ev.acao, Icon: Pencil, cor: 'text-zinc-600', bg: 'bg-zinc-100' }
                const Icon = meta.Icon
                const det = ev.detalhes || {}
                const alteracoes = Array.isArray(det.alteracoes) ? det.alteracoes : []
                return (
                  <div key={ev.id || i} className="flex gap-3.5 pb-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-9 h-9 rounded-full ${meta.bg} ${meta.cor} flex items-center justify-center shrink-0`}><Icon size={16} /></div>
                      {i < eventos.length - 1 && <div className="w-px flex-1 bg-zinc-200 my-1" />}
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[15px] font-medium text-zinc-800">{meta.titulo}</span>
                        <span className="text-xs text-zinc-400 whitespace-nowrap">{fmtData(ev.created_at)}</span>
                      </div>
                      <div className="text-sm text-zinc-500 mt-0.5">por {ev.user_nome || '—'}</div>

                      {ev.acao === 'mover_status' && (det.de || det.para) && (
                        <div className="mt-1.5 text-sm text-zinc-700">
                          <span className="text-zinc-500">{det.de || '—'}</span> <span className="text-zinc-400">→</span> <span className="font-medium">{det.para || '—'}</span>
                        </div>
                      )}
                      {ev.acao === 'criar' && det.origem && (
                        <div className="mt-1.5 text-sm text-zinc-500">Duplicada da proposta #{det.origem}</div>
                      )}
                      {alteracoes.length > 0 && (
                        <div className="mt-2 flex flex-col gap-1.5">
                          {alteracoes.map((a, j) => (
                            <div key={j} className="text-sm bg-zinc-50 border border-zinc-100 rounded-lg px-3 py-2">
                              <span className="font-medium text-zinc-700">{rotulo(a.campo)}: </span>
                              <span className="text-zinc-400 line-through">{a.de || '(vazio)'}</span>
                              <span className="text-zinc-400"> → </span>
                              <span className="text-zinc-800">{a.para || '(vazio)'}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
