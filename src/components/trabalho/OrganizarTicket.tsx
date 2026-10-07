'use client'
// CENTRAL DE TRABALHO — "Pra organizar": ticket que recebi e ainda não está
// em nenhum bloco. Escolho o bloco e a privacidade; se eu ainda não confirmei
// o ticket, confirmo (ou proponho outra data / recuso) aqui mesmo.
import { useState } from 'react'
import { X, Check, CalendarClock, CircleX, LayoutGrid } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import type { TicketVisibilidade } from '@/lib/tickets/constantes'
import EscolhaBloco, { type EscolhaBlocoValor } from './EscolhaBloco'

export interface TicketParaOrganizar {
  id: string; numero: number; titulo: string; prazo: string | null
  visibilidade: TicketVisibilidade; aceite?: string | null; solicitante_nome?: string
}

const br = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4)

export default function OrganizarTicket({ ticket, onFechar, onFeito }: {
  ticket: TicketParaOrganizar; onFechar: () => void; onFeito: () => void
}) {
  const pendente = ticket.aceite === 'pendente'
  const [valor, setValor] = useState<EscolhaBlocoValor>({ quadroId: null, visibilidade: ticket.visibilidade })
  const [modo, setModo] = useState<null | 'data' | 'recusar'>(null)
  const [novaData, setNovaData] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const enviar = async (corpo: Record<string, unknown>) => {
    setSalvando(true); setErro('')
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/acoes`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(json.error || 'Falha'); return }
      onFeito()
    } catch { setErro('Falha de conexão') } finally { setSalvando(false) }
  }
  const organizacao = { quadro_id: valor.quadroId, visibilidade: valor.visibilidade }

  const btn = (cor?: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', border: cor ? 'none' : '1px solid var(--portal-border,#e5e7eb)', background: cor || 'var(--portal-bg-card,#fff)', color: cor ? '#fff' : 'var(--portal-text,#111)', opacity: salvando ? .6 : 1 })
  const campo: React.CSSProperties = { display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)', boxSizing: 'border-box' }

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onFechar() }} style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="org-t" style={{ width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto', background: 'var(--portal-bg-card,#fff)', borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,.35)' }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '16px 18px', borderBottom: '1px solid var(--portal-border,#eee)' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#888)' }}>
              TICKET #{ticket.numero}{ticket.solicitante_nome ? ` · DE ${ticket.solicitante_nome.toUpperCase()}` : ''}
            </div>
            <h2 id="org-t" style={{ margin: '2px 0 0', fontSize: 18, color: 'var(--portal-text,#111)' }}>{ticket.titulo}</h2>
            <div style={{ fontSize: 13, color: 'var(--portal-text-secondary,#555)', marginTop: 2 }}>Prazo: <b>{ticket.prazo ? br(ticket.prazo) : 'sem data'}</b></div>
          </div>
          <button onClick={onFechar} aria-label="Fechar" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#888)', padding: 4 }}><X size={18} /></button>
        </header>

        <div style={{ padding: 18 }}>
          {modo !== 'recusar' && <EscolhaBloco valor={valor} onChange={setValor} />}
          {modo === 'data' && (
            <label style={{ display: 'block', marginTop: 14, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted,#888)' }}>Consigo fazer até
              <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} style={campo} />
            </label>
          )}
          {modo === 'recusar' && (
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted,#888)' }}>Por que não consegue? (vai para quem pediu)
              <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} autoFocus style={{ ...campo, resize: 'vertical' }} />
            </label>
          )}
          {erro && <div style={{ marginTop: 10, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        </div>

        <footer style={{ padding: '14px 18px', borderTop: '1px solid var(--portal-border,#f0f0f0)', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          {!pendente ? (
            <>
              <button style={btn()} onClick={onFechar}>Cancelar</button>
              <button style={btn('#dc2626')} disabled={salvando || !valor.quadroId} title={!valor.quadroId ? 'Escolha um bloco' : undefined}
                onClick={() => enviar({ acao: 'organizar', ...organizacao })}><LayoutGrid size={15} /> Pôr no bloco</button>
            </>
          ) : modo === null ? (
            <>
              <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button style={btn()} onClick={() => setModo('recusar')}><CircleX size={15} /> Recusar</button>
                <button style={btn()} onClick={() => setModo('data')}><CalendarClock size={15} /> Outra data</button>
              </span>
              <button style={btn('#059669')} disabled={salvando} onClick={() => enviar({ acao: 'aceite', decisao: 'confirmar', ...organizacao })}><Check size={15} /> Confirmar</button>
            </>
          ) : (
            <>
              <button style={btn()} onClick={() => { setModo(null); setErro('') }}>Voltar</button>
              {modo === 'data'
                ? <button style={btn('#059669')} disabled={salvando || !novaData} onClick={() => enviar({ acao: 'aceite', decisao: 'nova_data', data: novaData, ...organizacao })}><Check size={15} /> Confirmar com esta data</button>
                : <button style={btn('#dc2626')} disabled={salvando || !motivo.trim()} onClick={() => enviar({ acao: 'aceite', decisao: 'recusar', motivo })}><CircleX size={15} /> Recusar ticket</button>}
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
