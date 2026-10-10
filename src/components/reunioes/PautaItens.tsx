'use client'
// Itens da pauta (R5/R6/R7). Modo pauta: lista reordenável + campo de inclusão.
// Modo condução: item a item com timer e botões de resultado por tipo.
import { useState } from 'react'
import { ChevronUp, ChevronDown, Trash2, Clock, Zap, CheckCircle2, PauseCircle, ParkingCircle, Info, MessageSquare, Plus } from 'lucide-react'
import type { ItemPauta, ItemTipo, ItemResultado } from '@/lib/reunioes/regras'
import { ITEM_TIPO_INFO, RESULTADOS_POR_TIPO, somaTempo, ordenarItens } from '@/lib/reunioes/regras'
import { cartao, botao, botaoClaro, campo, chip, Timer, primeiroNome } from './comum'

const ROTULO_RESULTADO: Record<ItemResultado, { label: string; cor: string; icone: React.ReactNode }> = {
  decidido:  { label: 'Decidido',  cor: '#059669', icone: <CheckCircle2 size={15} /> },
  adiado:    { label: 'Adiar',     cor: '#d97706', icone: <PauseCircle size={15} /> },
  parking:   { label: 'Parking lot', cor: '#6b7280', icone: <ParkingCircle size={15} /> },
  informado: { label: 'Informado', cor: '#2563eb', icone: <Info size={15} /> },
  discutido: { label: 'Discutido', cor: '#7c3aed', icone: <MessageSquare size={15} /> },
}
const ROTULO_ORIGEM: Record<string, string> = { pendencia_escalada: 'pendência escalada', parking_anterior: 'parking da anterior', adiado_anterior: 'adiado da anterior', parking: 'parking lot' }

export default function PautaItens({ itens, usuarios, modo, podeEditar, podeConduzir, duracaoMin, corteFechado, onIncluir, onReordenar, onRemover, onResultado, onCriarAcao, onAbrirTicket }: {
  itens: ItemPauta[]
  usuarios: Record<string, { nome: string }>
  modo: 'pauta' | 'conducao' | 'leitura'
  podeEditar: boolean
  podeConduzir: boolean
  duracaoMin: number
  corteFechado: boolean
  onIncluir?: (c: { pergunta: string; tipo: ItemTipo; tempo_min: number; parking?: boolean }) => Promise<void>
  onReordenar?: (ordem: string[]) => Promise<void>
  onRemover?: (id: string) => Promise<void>
  onResultado?: (id: string, r: { resultado: ItemResultado; decisao_texto?: string; decisao_motivo?: string; notas?: string }) => Promise<void>
  onCriarAcao?: (item: ItemPauta) => void
  onAbrirTicket?: (id: string) => void
}) {
  const [pergunta, setPergunta] = useState('')
  const [tipo, setTipo] = useState<ItemTipo>('decidir')
  const [tempo, setTempo] = useState(5)
  const [incluindo, setIncluindo] = useState(false)
  const [erro, setErro] = useState('')
  const [decidindo, setDecidindo] = useState<string | null>(null)
  const [decisao, setDecisao] = useState(''); const [motivo, setMotivo] = useState('')
  const [ativo, setAtivo] = useState<string | null>(null)
  const nome = (id: string) => usuarios[id]?.nome || '—'
  const lista = ordenarItens(itens)
  const total = somaTempo(lista)
  const estourou = total > duracaoMin

  const incluir = async () => {
    if (!pergunta.trim() || !onIncluir) return
    setIncluindo(true); setErro('')
    try { await onIncluir({ pergunta: pergunta.trim(), tipo, tempo_min: tempo }); setPergunta('') } catch (e) { setErro(e instanceof Error ? e.message : 'Falha') } finally { setIncluindo(false) }
  }
  const mover = (id: string, delta: -1 | 1) => {
    const ids = lista.map((i) => i.id); const i = ids.indexOf(id); const j = i + delta
    if (i < 0 || j < 0 || j >= ids.length || !onReordenar) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]; onReordenar(ids)
  }
  const registrar = async (item: ItemPauta, r: ItemResultado) => {
    if (!onResultado) return
    if (r === 'decidido') { setDecidindo(item.id); setDecisao(item.decisao_texto || ''); setMotivo(item.decisao_motivo || ''); return }
    setErro('')
    try { await onResultado(item.id, { resultado: r }) } catch (e) { setErro(e instanceof Error ? e.message : 'Falha') }
  }
  const confirmarDecisao = async (item: ItemPauta) => {
    if (!onResultado) return
    setErro('')
    try { await onResultado(item.id, { resultado: 'decidido', decisao_texto: decisao, decisao_motivo: motivo }); setDecidindo(null) } catch (e) { setErro(e instanceof Error ? e.message : 'Falha') }
  }

  return (
    <section style={cartao}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text,#111)' }}>Pauta</span>
        <span style={chip('#6b7280', 'rgba(107,114,128,.12)')}>{lista.length} {lista.length === 1 ? 'item' : 'itens'}</span>
        <span title="Soma do tempo previsto × duração da reunião" style={chip(estourou ? '#dc2626' : '#059669', estourou ? 'rgba(220,38,38,.1)' : 'rgba(5,150,105,.1)')}><Clock size={12} /> {total} / {duracaoMin} min{estourou ? ' — estoura' : ''}</span>
        {corteFechado && modo === 'pauta' && <span style={chip('#d97706', 'rgba(217,119,6,.12)')}>pauta fechada — só o condutor inclui (urgente)</span>}
      </div>

      {lista.length === 0 && <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)', padding: '6px 0 10px' }}>Nenhum item ainda. Cada item é uma pergunta que a reunião precisa responder.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lista.map((item, idx) => {
          const t = ITEM_TIPO_INFO[item.tipo]
          const r = item.resultado ? ROTULO_RESULTADO[item.resultado] : null
          const emDecisao = decidindo === item.id
          return (
            <div key={item.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--portal-border,#e5e7eb)', background: r ? 'var(--portal-bg,#f9fafb)' : 'var(--portal-surface,#fff)', opacity: r && modo === 'conducao' ? .75 : 1 }}>
              {modo === 'pauta' && podeEditar && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--portal-text-muted,#999)' }}>
                  <button onClick={() => mover(item.id, -1)} disabled={idx === 0} style={{ border: 'none', background: 'transparent', cursor: idx === 0 ? 'default' : 'pointer', padding: 2, color: 'inherit', opacity: idx === 0 ? .25 : .8 }}><ChevronUp size={14} /></button>
                  <span style={{ fontSize: 11, fontWeight: 800 }}>{idx + 1}</span>
                  <button onClick={() => mover(item.id, 1)} disabled={idx === lista.length - 1} style={{ border: 'none', background: 'transparent', cursor: idx === lista.length - 1 ? 'default' : 'pointer', padding: 2, color: 'inherit', opacity: idx === lista.length - 1 ? .25 : .8 }}><ChevronDown size={14} /></button>
                </div>
              )}
              {modo !== 'pauta' && <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)', marginTop: 2 }}>{idx + 1}.</span>}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={chip(t.cor, t.fundo)}>{t.label}</span>
                  {item.urgente && <span style={chip('#dc2626', 'rgba(220,38,38,.1)')}><Zap size={11} /> urgente</span>}
                  {item.origem !== 'manual' && <span style={chip('#6b7280', 'rgba(107,114,128,.12)')}>{ROTULO_ORIGEM[item.origem] || item.origem}</span>}
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>{primeiroNome(nome(item.trazido_por))} · {item.tempo_min} min</span>
                  {r && <span style={chip(r.cor, r.cor + '1f')}>{r.icone} {r.label}</span>}
                  {modo === 'conducao' && !r && (
                    <button onClick={() => setAtivo(ativo === item.id ? null : item.id)} style={{ marginLeft: 'auto', ...botaoClaro(), padding: '4px 10px', minHeight: 30, fontSize: 12 }}>{ativo === item.id ? 'em discussão' : 'iniciar'}</button>
                  )}
                  {ativo === item.id && !r && <Timer chave={item.id} limiteMin={item.tempo_min} ativo />}
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--portal-text,#111)', lineHeight: 1.35 }}>{item.pergunta}</div>
                {item.ticket_referencia_id && onAbrirTicket && <button onClick={() => onAbrirTicket(item.ticket_referencia_id!)} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 12.5, color: '#2563eb', textDecoration: 'underline' }}>abrir a ação referida</button>}
                {item.decisao_texto && (
                  <div style={{ fontSize: 13, padding: '8px 10px', borderRadius: 8, background: 'rgba(5,150,105,.08)', color: 'var(--portal-text,#111)' }}>
                    <b>Decisão:</b> {item.decisao_texto}<br /><b>Motivo:</b> {item.decisao_motivo}
                  </div>
                )}
                {modo === 'conducao' && podeConduzir && !r && !emDecisao && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {RESULTADOS_POR_TIPO[item.tipo].map((res) => (
                      <button key={res} onClick={() => registrar(item, res)} style={{ ...botao(ROTULO_RESULTADO[res].cor, true), flex: '1 1 120px' }}>{ROTULO_RESULTADO[res].icone} {ROTULO_RESULTADO[res].label}</button>
                    ))}
                  </div>
                )}
                {emDecisao && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 10, background: 'var(--portal-bg,#f9fafb)' }}>
                    <input autoFocus value={decisao} onChange={(e) => setDecisao(e.target.value)} placeholder="O que foi decidido *" style={campo} maxLength={2000} />
                    <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por quê * (o motivo é o que faz a ata valer daqui a 6 meses)" style={campo} maxLength={2000} />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                      <button onClick={() => setDecidindo(null)} style={botaoClaro()}>Voltar</button>
                      <button onClick={() => confirmarDecisao(item)} disabled={!decisao.trim() || !motivo.trim()} style={{ ...botao('#059669'), opacity: decisao.trim() && motivo.trim() ? 1 : .5 }}><CheckCircle2 size={14} /> Registrar decisão</button>
                    </div>
                  </div>
                )}
                {modo === 'conducao' && podeConduzir && r && onCriarAcao && item.resultado === 'decidido' && (
                  <button onClick={() => onCriarAcao(item)} style={{ ...botao('#dc2626'), alignSelf: 'flex-start' }}><Plus size={14} /> Criar ação desta decisão</button>
                )}
              </div>
              {modo === 'pauta' && podeEditar && !r && onRemover && (
                <button onClick={() => { if (window.confirm('Tirar este item da pauta?')) onRemover(item.id) }} title="Remover" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#999)', alignSelf: 'flex-start', padding: 2 }}><Trash2 size={14} /></button>
              )}
            </div>
          )
        })}
      </div>

      {(modo === 'pauta' && podeEditar && onIncluir) && (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input value={pergunta} onChange={(e) => setPergunta(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') incluir() }}
            placeholder="Qual pergunta a reunião precisa responder?" style={{ ...campo, fontSize: 15, padding: '11px 14px' }} maxLength={500} />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {(['decidir', 'informar', 'discutir'] as ItemTipo[]).map((t) => (
              <button key={t} onClick={() => setTipo(t)} style={{ ...chip(tipo === t ? '#fff' : ITEM_TIPO_INFO[t].cor, tipo === t ? ITEM_TIPO_INFO[t].cor : ITEM_TIPO_INFO[t].fundo), border: 'none', cursor: 'pointer', padding: '6px 12px', fontSize: 13 }}>{ITEM_TIPO_INFO[t].label}</button>
            ))}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}><Clock size={13} /><input type="number" min={1} max={240} value={tempo} onChange={(e) => setTempo(Number(e.target.value) || 5)} style={{ ...campo, width: 64, padding: '5px 8px' }} /> min</label>
            <span style={{ flex: 1 }} />
            <button onClick={incluir} disabled={!pergunta.trim() || incluindo} style={{ ...botao(), opacity: pergunta.trim() && !incluindo ? 1 : .5 }}><Plus size={14} /> Incluir na pauta</button>
          </div>
        </div>
      )}
      {erro && <div style={{ marginTop: 8, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
    </section>
  )
}
