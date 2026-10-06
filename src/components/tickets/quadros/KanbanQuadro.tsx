'use client'
// Kanban de um quadro: colunas próprias do quadro (não os status).
// Arrastar o cartão troca a COLUNA (no celular: seletor "Mover para").
// O criador do quadro inclui, renomeia, reordena e remove colunas aqui mesmo.
import { useState } from 'react'
import { Clock, CalendarDays, User as UserIcon, Pencil, Trash2, ChevronLeft, ChevronRight, Plus, Check, X, GanttChart, SquareCheck } from 'lucide-react'
import { diasParado, prazoVencido, type Ticket, type UsuarioMin } from '@/lib/tickets/constantes'
import { colunaDoTicket, type QuadroColuna } from '@/lib/tickets/quadros'
import StatusBadge from '../StatusBadge'

interface Props {
  colunas: QuadroColuna[]
  tickets: Ticket[]
  usuarios: Record<string, UsuarioMin>
  cor: string
  meuId?: string
  podeTrabalhar: boolean
  podeGerenciar: boolean
  isMobile: boolean
  onAbrir: (id: string) => void
  /** ordem = ids da coluna de destino já na ordem nova (arrastar para cima/baixo). */
  onMover: (ticketId: string, colunaId: string, ordem?: string[]) => Promise<void>
  onNovoTicket: (colunaId: string) => void
  onColuna: (payload: Record<string, unknown>) => Promise<boolean>
  /** Etapa do cronograma ligada a cada ticket (previsão, crítico). */
  etapas?: Record<string, { fim: string | null; critica: boolean; status: string }>
  /** Tarefas (passos) de cada ticket: selo "1/3 tarefas". */
  passos?: Record<string, { feitas: number; total: number }>
}

const MIME = 'quadro-ticket-id'
const iconeBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, borderRadius: 6,
  border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#888)', padding: 0,
}

export default function KanbanQuadro({
  colunas, tickets, usuarios, cor, meuId, podeTrabalhar, podeGerenciar, isMobile,
  onAbrir, onMover, onNovoTicket, onColuna, etapas = {}, passos = {},
}: Props) {
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [antesDe, setAntesDe] = useState<string | null>(null) // cartão sobre o qual vai cair
  const [salvando, setSalvando] = useState<string | null>(null)
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null)
  const [removendo, setRemovendo] = useState<{ id: string; destino: string } | null>(null)
  const [novaColuna, setNovaColuna] = useState<string | null>(null)

  const porColuna = new Map<string, Ticket[]>()
  for (const t of tickets) {
    const c = colunaDoTicket(t.quadro_coluna_id, colunas)
    if (c) porColuna.set(c, [...(porColuna.get(c) || []), t])
  }
  const pos = (t: Ticket) => (t as Ticket & { quadro_posicao?: number | null }).quadro_posicao ?? Number.MAX_SAFE_INTEGER
  for (const [k, l] of porColuna) porColuna.set(k, [...l].sort((a, b) => pos(a) - pos(b)))
  const podeMoverCartao = (t: Ticket) => podeTrabalhar || t.solicitante_id === meuId || t.responsavel_id === meuId

  const mover = async (ticketId: string, colunaId: string, antes: string | null = null) => {
    const t = tickets.find((x) => x.id === ticketId)
    if (!t) return
    const mesma = colunaDoTicket(t.quadro_coluna_id, colunas) === colunaId
    if (mesma && (!antes || antes === ticketId)) return
    const ids = (porColuna.get(colunaId) || []).map((x) => x.id).filter((x) => x !== ticketId)
    const i = antes && antes !== '__fim' ? ids.indexOf(antes) : -1
    if (i >= 0) ids.splice(i, 0, ticketId); else ids.push(ticketId)
    setSalvando(ticketId)
    try { await onMover(ticketId, colunaId, ids) } finally { setSalvando(null) }
  }

  const reordenar = (idx: number, delta: -1 | 1) => {
    const ids = colunas.map((c) => c.id)
    const j = idx + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[idx], ids[j]] = [ids[j], ids[idx]]
    onColuna({ acao: 'colunas_ordenar', ids })
  }

  return (
    <div style={{ display: 'flex', gap: 12, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 10 }}>
      {colunas.map((col, idx) => {
        const lista = porColuna.get(col.id) || []
        const alvo = !!arrastando && over === col.id
        const outras = colunas.filter((c) => c.id !== col.id)
        return (
          <div key={col.id}
            onDragOver={(e) => { if (!arrastando) return; e.preventDefault(); if (over !== col.id) setOver(col.id) }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node) && over === col.id) setOver(null) }}
            onDrop={(e) => { e.preventDefault(); const id = arrastando; const a = antesDe; setArrastando(null); setOver(null); setAntesDe(null); if (id) mover(id, col.id, a) }}
            style={{
              flex: '0 0 270px', width: 270, borderRadius: 12, padding: 10,
              background: alvo ? 'rgba(220,38,38,.06)' : 'var(--portal-bg,#f3f4f6)',
              border: alvo ? `1.5px dashed ${cor}` : '1.5px solid transparent',
            }}>
            {/* Cabeçalho da coluna */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10, minHeight: 26 }}>
              {renomeando?.id === col.id ? (
                <>
                  <input id={`col-${col.id}`} value={renomeando.nome} autoFocus maxLength={60}
                    onChange={(e) => setRenomeando({ id: col.id, nome: e.target.value })}
                    onKeyDown={async (e) => {
                      if (e.key === 'Escape') setRenomeando(null)
                      if (e.key === 'Enter' && renomeando.nome.trim()) { if (await onColuna({ acao: 'coluna_renomear', coluna_id: col.id, nome: renomeando.nome })) setRenomeando(null) }
                    }}
                    style={{ flex: 1, minWidth: 0, padding: '4px 8px', borderRadius: 6, fontSize: 13, fontWeight: 700, border: '1px solid var(--portal-border,#ddd)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)' }} />
                  <button style={iconeBtn} title="Salvar" onClick={async () => { if (renomeando.nome.trim() && await onColuna({ acao: 'coluna_renomear', coluna_id: col.id, nome: renomeando.nome })) setRenomeando(null) }}><Check size={15} /></button>
                  <button style={iconeBtn} title="Cancelar" onClick={() => setRenomeando(null)}><X size={15} /></button>
                </>
              ) : (
                <>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, color: 'var(--portal-text,#111)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.nome}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)', marginRight: 2 }}>{lista.length}</span>
                  {podeGerenciar && (
                    <>
                      <button style={{ ...iconeBtn, opacity: idx === 0 ? .25 : 1 }} disabled={idx === 0} title="Mover coluna para a esquerda" onClick={() => reordenar(idx, -1)}><ChevronLeft size={15} /></button>
                      <button style={{ ...iconeBtn, opacity: idx === colunas.length - 1 ? .25 : 1 }} disabled={idx === colunas.length - 1} title="Mover coluna para a direita" onClick={() => reordenar(idx, 1)}><ChevronRight size={15} /></button>
                      <button style={iconeBtn} title="Renomear coluna" onClick={() => setRenomeando({ id: col.id, nome: col.nome })}><Pencil size={13} /></button>
                      {colunas.length > 1 && (
                        <button style={iconeBtn} title="Remover coluna" onClick={() => {
                          if (lista.length === 0) {
                            if (window.confirm(`Remover a coluna "${col.nome}"?`)) onColuna({ acao: 'coluna_remover', coluna_id: col.id })
                          } else setRemovendo({ id: col.id, destino: outras[0].id })
                        }}><Trash2 size={13} /></button>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {removendo?.id === col.id && (
              <div style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: 'var(--portal-surface,#fff)', border: '1px solid #fca5a5', fontSize: 12.5, color: 'var(--portal-text,#111)' }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Remover &quot;{col.nome}&quot;</div>
                <label htmlFor={`dest-${col.id}`} style={{ display: 'block', marginBottom: 4 }}>Os {lista.length} cartões vão para:</label>
                <select id={`dest-${col.id}`} value={removendo.destino} onChange={(e) => setRemovendo({ id: col.id, destino: e.target.value })}
                  style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--portal-border,#ddd)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)', marginBottom: 8 }}>
                  {outras.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button onClick={() => setRemovendo(null)} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--portal-border,#ddd)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--portal-text-secondary,#555)' }}>Cancelar</button>
                  <button onClick={async () => { if (await onColuna({ acao: 'coluna_remover', coluna_id: col.id, destino_id: removendo.destino })) setRemovendo(null) }}
                    style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}>Remover coluna</button>
                </div>
              </div>
            )}

            {/* Cartões */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lista.map((t) => {
                const dias = diasParado(t.ultima_atividade_em)
                const vencido = prazoVencido(t.prazo, t.status)
                const pode = podeMoverCartao(t) && salvando !== t.id
                return (
                  <div key={t.id} role="button" tabIndex={0}
                    draggable={pode && !isMobile}
                    onDragStart={(e) => { setArrastando(t.id); e.dataTransfer.setData(MIME, t.id); e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move' }}
                    onDragEnd={() => { setArrastando(null); setOver(null); setAntesDe(null) }}
                    onDragOver={(e) => { if (!arrastando || arrastando === t.id) return; const r = e.currentTarget.getBoundingClientRect(); const metadeDeBaixo = e.clientY > r.top + r.height / 2; const idx = lista.findIndex((x) => x.id === t.id); const alvo = metadeDeBaixo ? (lista[idx + 1]?.id ?? '__fim') : t.id; if (antesDe !== alvo) setAntesDe(alvo) }}
                    onClick={() => onAbrir(t.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onAbrir(t.id) }}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 6, padding: 11, borderRadius: 10,
                      background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)',
                      borderLeft: `3px solid ${cor}`, cursor: pode && !isMobile ? 'grab' : 'pointer',
                      boxShadow: arrastando && arrastando !== t.id && over === col.id && antesDe === t.id ? `0 -3px 0 0 ${cor}` : undefined,
                      opacity: arrastando === t.id || salvando === t.id ? .5 : 1,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--portal-text-muted,#999)' }}>#{t.numero}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text,#111)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{t.titulo}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', fontSize: 11.5, color: 'var(--portal-text-muted,#888)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><UserIcon size={11} /> {usuarios[t.responsavel_id]?.nome || '—'}</span>
                      {t.prazo && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: vencido ? '#dc2626' : undefined, fontWeight: vencido ? 700 : undefined }}>
                          <CalendarDays size={11} /> {new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      {passos[t.id] && (
                        <span title="Tarefas deste ticket" style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, color: passos[t.id].feitas === passos[t.id].total ? '#16a34a' : undefined }}>
                          <SquareCheck size={11} /> {passos[t.id].feitas}/{passos[t.id].total} tarefas
                        </span>
                      )}
                      {etapas[t.id]?.fim && etapas[t.id].status !== 'concluida' && (
                        <span title="Previsão do cronograma" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <GanttChart size={11} /> previsto até {new Date(etapas[t.id].fim + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      )}
                      {etapas[t.id]?.critica && etapas[t.id].status !== 'concluida' && (
                        <span style={{ color: '#dc2626', fontWeight: 700 }}>caminho crítico</span>
                      )}
                      {(() => { const e = etapas[t.id]; if (!e?.fim || !t.prazo || e.status === 'concluida' || e.fim <= t.prazo) return null; const d = Math.round((new Date(e.fim).getTime() - new Date(t.prazo).getTime()) / 864e5); return <span style={{ color: '#d97706', fontWeight: 700 }}>atrasou {d}d</span> })()}
                      <span title="Dias sem movimento" style={{ display: 'flex', alignItems: 'center', gap: 3, color: dias >= 5 ? '#dc2626' : dias >= 2 ? '#d97706' : undefined, fontWeight: dias >= 2 ? 700 : undefined }}>
                        <Clock size={11} /> {dias === 0 ? 'hoje' : `${dias}d`}
                      </span>
                    </div>
                    {isMobile && podeMoverCartao(t) && colunas.length > 1 && (
                      <select aria-label="Mover para a coluna" value={colunaDoTicket(t.quadro_coluna_id, colunas) || ''}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => mover(t.id, e.target.value)}
                        style={{ marginTop: 2, padding: '6px 8px', borderRadius: 6, fontSize: 12.5, border: '1px solid var(--portal-border,#ddd)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)' }}>
                        {colunas.map((c) => <option key={c.id} value={c.id}>Mover para: {c.nome}</option>)}
                      </select>
                    )}
                  </div>
                )
              })}
              {lista.length === 0 && (
                <div style={{ padding: '14px 8px', textAlign: 'center', fontSize: 12, color: alvo ? cor : 'var(--portal-text-muted,#aaa)', fontWeight: alvo ? 700 : undefined }}>
                  {alvo ? 'Solte aqui' : 'Nenhum cartão'}
                </div>
              )}
              {podeTrabalhar && (
                <button onClick={() => onNovoTicket(col.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--portal-text-muted,#888)' }}>
                  <Plus size={14} /> Novo ticket aqui
                </button>
              )}
            </div>
          </div>
        )
      })}

      {podeGerenciar && (
        <div style={{ flex: '0 0 250px', width: 250 }}>
          {novaColuna === null ? (
            <button onClick={() => setNovaColuna('')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '11px 12px', borderRadius: 12, border: '1.5px dashed var(--portal-border,#d1d5db)', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--portal-text-muted,#888)' }}>
              <Plus size={15} /> Adicionar coluna
            </button>
          ) : (
            <div style={{ padding: 10, borderRadius: 12, background: 'var(--portal-bg,#f3f4f6)' }}>
              <input id="nova-coluna" value={novaColuna} autoFocus maxLength={60} placeholder="Nome da coluna"
                onChange={(e) => setNovaColuna(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Escape') setNovaColuna(null)
                  if (e.key === 'Enter' && novaColuna.trim()) { if (await onColuna({ acao: 'coluna_add', nome: novaColuna })) setNovaColuna(null) }
                }}
                style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', borderRadius: 8, fontSize: 13, border: '1px solid var(--portal-border,#ddd)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)', marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button disabled={!novaColuna.trim()} onClick={async () => { if (await onColuna({ acao: 'coluna_add', nome: novaColuna })) setNovaColuna(null) }}
                  style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 12.5, fontWeight: 700, opacity: novaColuna.trim() ? 1 : .5 }}>Adicionar</button>
                <button onClick={() => setNovaColuna(null)}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'transparent', cursor: 'pointer', fontSize: 12.5, color: 'var(--portal-text-secondary,#555)' }}>Cancelar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
