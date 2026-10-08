'use client'
// Kanban de tickets: uma coluna por status. Arrastar o card para outra coluna
// troca o status — só nas colunas que o papel do usuário permite
// (statusDisponiveis, a mesma regra dos botões da página do ticket); o servidor
// continua validando (validarTransicao). DnD HTML5 nativo, molde do PPV.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, CalendarDays, User as UserIcon, Zap, ShoppingCart } from 'lucide-react'
import {
  STATUS_INFO, STATUS_ATIVOS, STATUS_FINAIS, statusDisponiveis, diasParado, prazoVencido,
  type Ticket, type TicketStatus, type UsuarioMin,
} from '@/lib/tickets/constantes'

interface Props {
  tickets: Ticket[]            // já filtrados e ordenados pela página
  usuarios: Record<string, UsuarioMin>
  visao: 'fila' | 'pedidos' | 'acompanhando' | 'gerencial'
  encerrados: boolean
  meuId: string | undefined
  isAdmin: boolean
  atualId: string | null
  onMarcarAtual: (id: string) => void
  onMudarStatus: (id: string, para: TicketStatus) => Promise<void>
  /** Abre o ticket numa janela (sem trocar de página). */
  onAbrir?: (id: string) => void
  /** Cor do bloco na borda esquerda do card (Cronograma / bloco). */
  corDe?: (t: Ticket) => string
  /** Selos extras no topo do card (ex.: URGENTE, nome do bloco). */
  extra?: (t: Ticket) => React.ReactNode
}

const MIME_ID = 'ticket-id'

export default function KanbanTickets({
  tickets, usuarios, visao, encerrados, meuId, isAdmin, atualId, onMarcarAtual, onMudarStatus, onAbrir, corDe, extra,
}: Props) {
  const router = useRouter()
  // Enquanto um card está sendo arrastado: id + colunas em que pode ser solto.
  const [arrastando, setArrastando] = useState<{ id: string; permitidos: Set<TicketStatus> } | null>(null)
  const [colunaOver, setColunaOver] = useState<TicketStatus | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)

  const colunas: TicketStatus[] = encerrados ? [...STATUS_ATIVOS, ...STATUS_FINAIS] : STATUS_ATIVOS
  const porStatus: Partial<Record<TicketStatus, Ticket[]>> = {}
  for (const t of tickets) (porStatus[t.status] ||= []).push(t)

  const iniciarArrasto = (t: Ticket, e: React.DragEvent) => {
    const permitidos = new Set(statusDisponiveis(
      t.status, t.responsavel_id === meuId, t.solicitante_id === meuId, isAdmin,
    ))
    setArrastando({ id: t.id, permitidos })
    e.dataTransfer.setData(MIME_ID, t.id)
    e.dataTransfer.setData('text/plain', t.id) // Firefox exige
    e.dataTransfer.effectAllowed = 'move'
  }

  const encerrarArrasto = () => { setArrastando(null); setColunaOver(null) }

  const soltar = async (para: TicketStatus) => {
    const atual = arrastando
    encerrarArrasto()
    if (!atual || !atual.permitidos.has(para)) return
    const t = tickets.find((x) => x.id === atual.id)
    if (!t || t.status === para) return
    if (para === 'cancelado' && !window.confirm('Cancelar este ticket? Essa ação encerra a demanda.')) return
    setSalvando(atual.id)
    try { await onMudarStatus(atual.id, para) } finally { setSalvando(null) }
  }

  return (
    <div className="kt-board" style={{
      display: 'grid', gridTemplateColumns: `repeat(${colunas.length}, minmax(230px, 1fr))`, gap: 12,
      overflowX: 'auto', alignItems: 'start', paddingBottom: 8, maxWidth: '100%',
    }}>
      {/* Celular/tablet: as colunas rolam de lado e "encaixam" uma por vez. */}
      <style>{`@media (max-width: 768px){.kt-board{scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}.kt-col{scroll-snap-align:start}.kt-zap{min-width:36px;min-height:32px;justify-content:center}}`}</style>
      {colunas.map((status) => {
        const info = STATUS_INFO[status]
        const lista = porStatus[status] || []
        const final = STATUS_FINAIS.includes(status)
        const bloqueada = !!arrastando && !arrastando.permitidos.has(status)
        const alvo = !!arrastando && colunaOver === status && !bloqueada
        return (
          <div key={status} className="kt-col"
            onDragOver={(e) => {
              if (!arrastando) return
              e.preventDefault()
              e.dataTransfer.dropEffect = bloqueada ? 'none' : 'move'
              if (colunaOver !== status) setColunaOver(status)
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              if (colunaOver === status) setColunaOver(null)
            }}
            onDrop={(e) => { e.preventDefault(); soltar(status) }}
            style={{
              background: alvo ? info.fundo : 'var(--portal-bg,#f9fafb)',
              border: alvo ? `1.5px dashed ${info.cor}` : '1.5px solid transparent',
              borderRadius: 12, padding: 10, minWidth: 230, minHeight: 160,
              opacity: bloqueada ? .4 : final && !arrastando ? .75 : 1,
              cursor: bloqueada ? 'not-allowed' : undefined,
              transition: 'opacity .15s, background .15s',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '0 4px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 800, color: info.cor }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: info.cor }} /> {info.label}
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)' }}>{lista.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lista.length === 0 && (
                <div style={{ padding: '18px 8px', textAlign: 'center', fontSize: 12, color: alvo ? info.cor : 'var(--portal-text-muted,#aaa)', fontWeight: alvo ? 700 : undefined }}>
                  {alvo ? 'Solte aqui' : '—'}
                </div>
              )}
              {lista.map((t) => {
                const dias = diasParado(t.ultima_atividade_em)
                const vencido = prazoVencido(t.prazo, t.status)
                const resp = usuarios[t.responsavel_id]
                const sol = usuarios[t.solicitante_id]
                const ehAtual = visao === 'fila' && t.id === atualId
                const ehSC = t.tipo === 'compras' // status da SC vem do sc_etapa — não arrasta
                const arrastavel = !ehSC && !final && salvando !== t.id
                return (
                  <div key={t.id} role="button" tabIndex={0}
                    draggable={arrastavel}
                    onDragStart={(e) => iniciarArrasto(t, e)}
                    onDragEnd={encerrarArrasto}
                    onClick={() => (onAbrir ? onAbrir(t.id) : router.push(`/tickets/${t.id}`))}
                    onKeyDown={(e) => { if (e.key === 'Enter') (onAbrir ? onAbrir(t.id) : router.push(`/tickets/${t.id}`)) }}
                    title={ehSC ? 'Solicitação de compras: a etapa muda dentro do ticket' : undefined}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: 6, padding: 11, borderRadius: 10,
                      border: ehAtual ? '1.5px solid #d97706' : '1px solid var(--portal-border,#e5e7eb)',
                      ...(corDe ? { borderLeft: `4px solid ${corDe(t)}` } : {}),
                      background: ehAtual ? 'rgba(217,119,6,.06)' : 'var(--portal-surface,#fff)',
                      cursor: arrastavel ? 'grab' : 'pointer',
                      opacity: arrastando?.id === t.id || salvando === t.id ? .5 : 1,
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: 'var(--portal-text-muted,#999)' }}>
                        #{t.numero}
                        {ehSC && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '0 6px', borderRadius: 999, fontSize: 10, fontWeight: 800, color: '#7c3aed', background: 'rgba(124,58,237,.12)' }}>
                            <ShoppingCart size={10} /> SC
                          </span>
                        )}
                      </span>
                      <span title="Dias sem movimento" style={{
                        display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700,
                        color: dias >= 5 ? '#dc2626' : dias >= 2 ? '#d97706' : 'var(--portal-text-muted,#999)',
                      }}>
                        <Clock size={11} /> {dias === 0 ? 'hoje' : `${dias}d`}
                      </span>
                    </div>
                    {extra?.(t)}
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text,#111)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {t.titulo}
                    </div>
                    {ehAtual && (
                      <span style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 3, padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800, color: '#d97706', background: 'rgba(217,119,6,.14)' }}>
                        <Zap size={11} /> Mexendo agora
                      </span>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11.5, color: 'var(--portal-text-muted,#888)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><UserIcon size={11} /> {resp?.nome || '—'}</span>
                      {visao !== 'pedidos' && sol && <span>pedido por {sol.nome}</span>}
                      {t.categoria && <span>{t.categoria}</span>}
                      {t.prazo && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: vencido ? '#dc2626' : undefined, fontWeight: vencido ? 700 : undefined }}>
                          <CalendarDays size={11} /> {new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}{vencido ? ' (vencido)' : ''}
                        </span>
                      )}
                    </div>
                    {visao === 'fila' && !final && (
                      <button className="kt-zap" onClick={(e) => { e.stopPropagation(); onMarcarAtual(t.id) }}
                        title={ehAtual ? 'Deixar de destacar este ticket' : 'Estou mexendo neste agora'}
                        style={{
                          alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700,
                          border: ehAtual ? '1px solid #d97706' : '1px solid var(--portal-border,#e5e7eb)',
                          background: ehAtual ? 'rgba(217,119,6,.14)' : 'transparent',
                          color: ehAtual ? '#d97706' : 'var(--portal-text-muted,#999)',
                        }}>
                        <Zap size={12} fill={ehAtual ? '#d97706' : 'none'} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
