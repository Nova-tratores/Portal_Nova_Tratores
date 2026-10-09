'use client'
// Um grupo de ideias (2º passo) — e, quando já virou ticket (3º passo), o chip
// do ticket. Nome editável no lugar; cor opcional; "Planejar execução" abre o
// FormTicket (a página cuida disso).
import { useState } from 'react'
import { FolderOpen, Rocket, Ticket as TicketIcon, Trash2, Palette } from 'lucide-react'
import type { GrupoComIdeias, Ideia } from '@/lib/dev/ideias'
import { CORES_QUADRO } from '@/lib/tickets/quadros'
import { STATUS_INFO, type TicketStatus } from '@/lib/tickets/constantes'
import CardIdeia from './CardIdeia'

interface Props {
  item: GrupoComIdeias
  nomes: Record<string, string | undefined>
  ticket?: { numero: number; status: string; titulo: string }
  onRenomear: (id: string, nome: string) => Promise<void>
  onCor: (id: string, cor: string | null) => Promise<void>
  onEditarIdeia: (id: string, texto: string) => Promise<void>
  onTirarDoGrupo: (ideiaId: string) => void
  onArquivarIdeia: (id: string) => void
  onDesfazer?: (id: string) => void
  onPlanejar?: (item: GrupoComIdeias) => void
  onAbrirTicket?: (ticketId: string) => void
}

export default function CardGrupo({
  item, nomes, ticket, onRenomear, onCor, onEditarIdeia, onTirarDoGrupo, onArquivarIdeia, onDesfazer, onPlanejar, onAbrirTicket,
}: Props) {
  const { grupo, ideias } = item
  const planejado = !!grupo.ticket_id
  const cor = grupo.cor || '#111111'
  const [nome, setNome] = useState(grupo.nome)
  const [editandoNome, setEditandoNome] = useState(false)
  const [paleta, setPaleta] = useState(false)

  const confirmarNome = async () => {
    const n = nome.trim()
    setEditandoNome(false)
    if (!n || n === grupo.nome) { setNome(grupo.nome); return }
    await onRenomear(grupo.id, n)
  }

  const st = ticket ? STATUS_INFO[ticket.status as TicketStatus] : undefined

  return (
    <div style={{
      borderRadius: 14, overflow: 'hidden', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)',
      boxShadow: '0 2px 8px rgba(0,0,0,.05)', opacity: planejado ? .92 : 1,
    }}>
      <div style={{ padding: '12px 12px 10px', background: cor + '14', borderBottom: `1px solid ${cor}33` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 28, height: 28, flex: 'none', borderRadius: 8, background: cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {planejado ? <Rocket size={15} /> : <FolderOpen size={15} />}
          </span>
          {editandoNome ? (
            <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onBlur={confirmarNome}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmarNome(); if (e.key === 'Escape') { setEditandoNome(false); setNome(grupo.nome) } }}
              maxLength={120}
              style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, padding: '3px 8px', borderRadius: 6, border: '1px solid #111', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)', outline: 'none' }} />
          ) : (
            <span onClick={() => { if (!planejado) { setNome(grupo.nome); setEditandoNome(true) } }} title={planejado ? undefined : 'Clique para renomear'}
              style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, color: 'var(--portal-text,#111)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: planejado ? 'default' : 'text' }}>
              {grupo.nome}
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 800, padding: '1px 8px', borderRadius: 999, background: 'var(--portal-bg,#f1f1f1)', color: 'var(--portal-text-muted,#777)' }}>{ideias.length}</span>
          {!planejado && (
            <button onClick={() => setPaleta((p) => !p)} title="Cor do grupo"
              style={{ display: 'flex', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#888)', padding: 2 }}>
              <Palette size={14} />
            </button>
          )}
        </div>
        {paleta && !planejado && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {['#111111', ...CORES_QUADRO].map((c) => (
              <button key={c} onClick={() => { onCor(grupo.id, c === '#111111' ? null : c); setPaleta(false) }} title={c}
                style={{ width: 20, height: 20, borderRadius: '50%', background: c, border: c === cor ? '2px solid var(--portal-text,#111)' : '2px solid transparent', cursor: 'pointer', padding: 0 }} />
            ))}
          </div>
        )}
        {ticket && (
          <button onClick={() => onAbrirTicket?.(grupo.ticket_id!)} title={ticket.titulo}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 800, cursor: 'pointer',
              border: `1.5px solid ${st?.cor || '#111'}`, background: st?.fundo || 'transparent', color: st?.cor || 'var(--portal-text,#111)',
            }}>
            <TicketIcon size={12} /> Ticket #{ticket.numero} · {st?.label || ticket.status}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10 }}>
        {ideias.length === 0 && (
          <div style={{ padding: '10px 6px', fontSize: 12.5, color: 'var(--portal-text-muted,#aaa)', textAlign: 'center' }}>
            Grupo vazio — selecione ideias em Captadas e use &quot;Mover para grupo&quot;.
          </div>
        )}
        {ideias.map((i: Ideia) => (
          <CardIdeia key={i.id} ideia={i} autor={nomes[i.autor_id]} apagada={planejado}
            onEditar={onEditarIdeia}
            onTirarDoGrupo={planejado ? undefined : onTirarDoGrupo}
            onArquivar={planejado ? undefined : onArquivarIdeia} />
        ))}
      </div>
      {!planejado && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px 10px', borderTop: '1px solid var(--portal-border,#eee)' }}>
          {onDesfazer && (
            <button onClick={() => onDesfazer(grupo.id)} title="Desfazer o grupo (as ideias voltam para Captadas)"
              style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#999)', fontSize: 12, padding: 4 }}>
              <Trash2 size={13} /> desfazer
            </button>
          )}
          <span style={{ flex: 1 }} />
          {onPlanejar && (
            <button onClick={() => onPlanejar(item)} disabled={ideias.length === 0}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', fontSize: 12.5, fontWeight: 800,
                background: '#111', color: '#fff', cursor: ideias.length ? 'pointer' : 'default', opacity: ideias.length ? 1 : .4,
              }}>
              <Rocket size={13} /> Planejar execução →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
