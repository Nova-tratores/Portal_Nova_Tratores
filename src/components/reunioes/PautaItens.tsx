'use client'
// Itens da pauta (R5/R6/R7). Modo pauta: lista reordenável + campo de inclusão.
// Modo condução: item a item com timer e botões de resultado por tipo.
import { useState } from 'react'
import { ListOrdered, ChevronUp, ChevronDown, Trash2, Clock, Zap, CheckCircle2, PauseCircle, Shuffle, Info, MessageSquare, Plus, CornerDownRight, Megaphone } from 'lucide-react'
import type { ItemPauta, ItemTipo, ItemResultado, ReuniaoRef } from '@/lib/reunioes/regras'
import { ITEM_TIPO_INFO, RESULTADOS_POR_TIPO, somaTempo, ordenarItens, textoReagendamento } from '@/lib/reunioes/regras'
import { cartao, botao, botaoClaro, campo, chip, Timer, primeiroNome } from './comum'

// label = botão na condução; selo = como o item fica marcado; dica = legenda do botão.
const ROTULO_RESULTADO: Record<ItemResultado, { label: string; selo: string; cor: string; icone: React.ReactNode; dica: string }> = {
  decidido:  { label: 'Decidido', selo: 'Decidido', cor: '#059669', icone: <CheckCircle2 size={15} />, dica: 'Registra a decisão e o motivo (os dois obrigatórios).' },
  adiado:    { label: 'Adiar p/ próxima', selo: 'Adiado', cor: '#d97706', icone: <PauseCircle size={15} />, dica: 'Não deu tempo de tratar hoje. O item volta na pauta da próxima reunião da série.' },
  parking:   { label: 'Fora do tema', selo: 'Fora do tema', cor: '#6b7280', icone: <Shuffle size={15} />, dica: 'O assunto fugiu do foco desta reunião. Fica anotado e entra na pauta da próxima reunião da série.' },
  informado: { label: 'Informado', selo: 'Informado', cor: '#2563eb', icone: <Info size={15} />, dica: 'O recado foi dado. Fecha o item.' },
  discutido: { label: 'Discutido', selo: 'Discutido', cor: '#7c3aed', icone: <MessageSquare size={15} />, dica: 'O assunto foi conversado. Fecha o item.' },
}
const ddmm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '')

/** Campanha de marketing que um assunto pode tratar (GET /api/reunioes/campanhas, 18/11/2026). */
export interface CampanhaPauta { id: string; nome: string; data_inicio: string | null; data_fim: string | null }
const ROSA = '#db2777'

/** Selo "📣 Campanha" do assunto: mostra a campanha ligada e, para quem pode, troca ou desliga. */
function SeloCampanha({ item, campanhas, onCampanha }: { item: ItemPauta; campanhas: CampanhaPauta[]; onCampanha?: (itemId: string, campanhaId: string | null) => Promise<void> }) {
  const atual = campanhas.find((c) => c.id === item.campanha_id)
  if (!onCampanha) {
    if (!atual) return null
    return <a href={`/marketing/${atual.id}`} title="Abrir a campanha" style={{ ...chip(ROSA, 'rgba(219,39,119,.1)'), textDecoration: 'none' }}><Megaphone size={11} /> {atual.nome}</a>
  }
  if (!campanhas.length) return null
  return (
    <label title="De qual campanha de marketing é este assunto? Ele entra na linha do tempo dela."
      style={{ ...chip(atual ? ROSA : '#6b7280', atual ? 'rgba(219,39,119,.1)' : 'rgba(107,114,128,.08)'), cursor: 'pointer', position: 'relative' }}>
      <Megaphone size={11} />
      <span>{atual ? atual.nome : 'campanha?'}</span>
      <select value={item.campanha_id || ''} onChange={(e) => { onCampanha(item.id, e.target.value || null).catch(() => { /* o erro já aparece embaixo da pauta */ }) }}
        aria-label="Campanha deste assunto"
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}>
        <option value="">Nenhuma campanha</option>
        {campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.data_inicio ? ` (${c.data_inicio.slice(0, 4)})` : ''}</option>)}
      </select>
    </label>
  )
}
// Selo de origem: de onde o item veio (com a data da reunião anterior, quando se sabe).
const rotuloOrigem = (origem: string, de?: ReuniaoRef) => {
  const veio = de ? ` · veio de ${ddmm(de.prazo)}` : ' da reunião anterior'
  if (origem === 'adiado_anterior') return `adiado${veio}`
  if (origem === 'parking_anterior') return `fora do tema${veio}`
  if (origem === 'parking') return 'anotado durante a reunião'
  if (origem === 'pendencia_escalada') return 'pendência escalada'
  return origem
}

export default function PautaItens({ itens, usuarios, modo, podeEditar, podeConduzir, duracaoMin, corteFechado, onIncluir, onReordenar, onRemover, onResultado, onCriarAcao, onAbrirTicket, destinos, origens, proxima, temSerie, onAbrirReuniao, campanhas = [], onCampanha }: {
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
  destinos?: Record<string, ReuniaoRef>
  origens?: Record<string, ReuniaoRef>
  proxima?: ReuniaoRef | null
  temSerie?: boolean
  onAbrirReuniao?: (id: string) => void
  /** campanhas de marketing para ligar o assunto (linha do tempo da campanha) */
  campanhas?: CampanhaPauta[]
  onCampanha?: (itemId: string, campanhaId: string | null) => Promise<void>
}) {
  const [pergunta, setPergunta] = useState('')
  const [tipo] = useState<ItemTipo>('discutir')   // tipo e tempo saíram da tela (José, 17/11/2026)
  const [tempo] = useState(5)
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
      {/* Pauta como título (José, 17/11/2026), sem os selos de corte */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ flex: 'none', width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', color: '#2563eb', background: 'color-mix(in srgb,#2563eb 9%,var(--portal-surface,#fefefe))', border: '1px solid color-mix(in srgb,#2563eb 18%,transparent)' }}><ListOrdered size={16} /></span>
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 17, fontWeight: 500, color: 'var(--portal-text,#0f172a)' }}>Pauta</span>
          <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>O que vai ser falado nesta reunião{lista.length ? ` · ${lista.length} ${lista.length === 1 ? 'assunto' : 'assuntos'}` : ''}</span>
        </span>
        <span style={{ flex: 1 }} />
        {lista.length > 0 && <span title="Tempo previsto dos assuntos × duração da reunião" style={chip(estourou ? '#dc2626' : '#64748b', estourou ? 'rgba(220,38,38,.1)' : 'rgba(100,116,139,.1)')}><Clock size={12} /> {total} de {duracaoMin} min</span>}
      </div>

      {lista.length === 0 && <div style={{ fontSize: 13.5, color: 'var(--portal-text-muted,#64748b)', padding: '2px 0 10px' }}>Nenhum assunto ainda.</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lista.map((item, idx) => {
          const t = ITEM_TIPO_INFO[item.tipo]
          const r = item.resultado ? ROTULO_RESULTADO[item.resultado] : null
          const emDecisao = decidindo === item.id
          return (
            <div key={item.id} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--portal-border,#e5e7eb)', background: r ? 'var(--portal-bg,#f9fafb)' : 'var(--portal-surface,#fff)', opacity: r && modo === 'conducao' ? .75 : 1 }}>
              {modo !== 'leitura' && podeEditar && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--portal-text-muted,#999)' }}>
                  <button onClick={() => mover(item.id, -1)} disabled={idx === 0} style={{ border: 'none', background: 'transparent', cursor: idx === 0 ? 'default' : 'pointer', padding: 2, color: 'inherit', opacity: idx === 0 ? .25 : .8 }}><ChevronUp size={14} /></button>
                  <span style={{ fontSize: 11, fontWeight: 500 }}>{idx + 1}</span>
                  <button onClick={() => mover(item.id, 1)} disabled={idx === lista.length - 1} style={{ border: 'none', background: 'transparent', cursor: idx === lista.length - 1 ? 'default' : 'pointer', padding: 2, color: 'inherit', opacity: idx === lista.length - 1 ? .25 : .8 }}><ChevronDown size={14} /></button>
                </div>
              )}
              {(modo === 'leitura' || !podeEditar) && <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--portal-text-muted,#999)', marginTop: 2 }}>{idx + 1}.</span>}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  {item.tipo !== 'discutir' && <span style={chip(t.cor, t.fundo)}>{t.label}</span>}
                  {item.urgente && <span style={chip('#dc2626', 'rgba(220,38,38,.1)')}><Zap size={11} /> urgente</span>}
                  {item.origem !== 'manual' && (() => {
                    const de = item.item_origem_id ? origens?.[item.item_origem_id] : undefined
                    const txt = rotuloOrigem(item.origem, de)
                    return de && onAbrirReuniao
                      ? <button onClick={() => onAbrirReuniao(de.reuniao_id)} title={`Abrir a reunião nº ${de.numero}`} style={{ ...chip('#6b7280', 'rgba(107,114,128,.12)'), border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>{txt}</button>
                      : <span style={chip('#6b7280', 'rgba(107,114,128,.12)')}>{txt}</span>
                  })()}
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>{primeiroNome(nome(item.trazido_por))} · {item.tempo_min} min</span>
                  {r && <span title={r.dica} style={chip(r.cor, r.cor + '1f')}>{r.icone} {r.selo}</span>}
                  <SeloCampanha item={item} campanhas={campanhas} onCampanha={onCampanha} />
                  {modo === 'conducao' && !r && (
                    <button onClick={() => setAtivo(ativo === item.id ? null : item.id)} style={{ marginLeft: 'auto', ...botaoClaro(), padding: '4px 10px', minHeight: 30, fontSize: 12 }}>{ativo === item.id ? 'em discussão' : 'iniciar'}</button>
                  )}
                  {ativo === item.id && !r && <Timer chave={item.id} limiteMin={item.tempo_min} ativo />}
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 500, color: 'var(--portal-text,#111)', lineHeight: 1.35 }}>{item.pergunta}</div>
                {(() => {
                  const re = textoReagendamento(item.resultado, { destino: destinos?.[item.id], proxima, temSerie: !!temSerie })
                  if (!re) return null
                  const cor = r?.cor || '#6b7280'
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 500, color: cor }}>
                      <CornerDownRight size={14} />
                      {re.reuniao_id && onAbrirReuniao
                        ? <button onClick={() => onAbrirReuniao(re.reuniao_id!)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: cor, fontWeight: 500, fontSize: 12.5, textDecoration: 'underline', textAlign: 'left' }}>{re.texto}</button>
                        : <span>{re.texto}</span>}
                    </div>
                  )
                })()}
                {item.ticket_referencia_id && onAbrirTicket && <button onClick={() => onAbrirTicket(item.ticket_referencia_id!)} style={{ alignSelf: 'flex-start', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', fontSize: 12.5, color: '#2563eb', textDecoration: 'underline' }}>abrir a tarefa</button>}
                {item.decisao_texto && (
                  <div style={{ fontSize: 13, padding: '8px 10px', borderRadius: 8, background: 'rgba(5,150,105,.08)', color: 'var(--portal-text,#111)' }}>
                    <b style={{ fontWeight: 500 }}>Decisão:</b> {item.decisao_texto}<br /><b style={{ fontWeight: 500 }}>Motivo:</b> {item.decisao_motivo}
                  </div>
                )}
                {modo === 'conducao' && podeConduzir && !r && !emDecisao && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {RESULTADOS_POR_TIPO[item.tipo].map((res) => (
                      <button key={res} onClick={() => registrar(item, res)} title={ROTULO_RESULTADO[res].dica} style={{ ...botao(ROTULO_RESULTADO[res].cor, true), flex: '1 1 120px' }}>{ROTULO_RESULTADO[res].icone} {ROTULO_RESULTADO[res].label}</button>
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
              {modo !== 'leitura' && podeEditar && !r && onRemover && (
                <button onClick={() => { if (window.confirm('Tirar este item da pauta?')) onRemover(item.id) }} title="Remover" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#999)', alignSelf: 'flex-start', padding: 2 }}><Trash2 size={14} /></button>
              )}
            </div>
          )
        })}
      </div>

      {(modo !== 'leitura' && podeEditar && onIncluir) && (
        <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={pergunta} onChange={(e) => setPergunta(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') incluir() }}
            placeholder="Escreva um assunto para a pauta e aperte Enter" style={{ ...campo, flex: '1 1 260px', fontSize: 15, height: 44 }} maxLength={500} />
          <button onClick={incluir} disabled={!pergunta.trim() || incluindo} style={{ ...botao('#2563eb'), minHeight: 44, opacity: pergunta.trim() && !incluindo ? 1 : .5 }}><Plus size={15} /> Incluir</button>
        </div>
      )}
      {erro && <div style={{ marginTop: 8, color: '#dc2626', fontSize: 13, fontWeight: 500 }}>{erro}</div>}
    </section>
  )
}
