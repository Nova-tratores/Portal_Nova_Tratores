'use client'
// Um bloqueio da minha agenda: quando, motivo e "Liberar horário".
import { useState } from 'react'
import { CalendarX2, Unlock } from 'lucide-react'
import { Modal, botao, botaoClaro, chamar } from '@/components/reunioes/comum'
import { localDe, addDias, type Reserva } from '@/lib/salas/regras'
import type { Bloqueio } from '@/lib/agenda/bloqueios'

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

export function quandoBloqueio(b: Pick<Bloqueio, 'inicio' | 'fim'>): string {
  const a = localDe(b.inicio), f = localDe(b.fim)
  if (a.hora === '00:00' && f.hora === '00:00') {
    const ultimo = addDias(f.dia, -1)
    return ultimo === a.dia ? `${ddmm(a.dia)} · dia inteiro` : `${ddmm(a.dia)} a ${ddmm(ultimo)} · dias inteiros`
  }
  return `${ddmm(a.dia)} · ${a.hora}–${f.hora}`
}

export default function DetalheBloqueio({ bloqueio, onFechar, onMudou }: { bloqueio: Bloqueio; onFechar: () => void; onMudou: () => void }) {
  const [liberando, setLiberando] = useState(false)
  const [erro, setErro] = useState('')
  const liberar = async () => {
    setLiberando(true); setErro('')
    try { await chamar(`/api/agenda/bloqueios/${bloqueio.id}`, { method: 'DELETE' }); onMudou() }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha') } finally { setLiberando(false) }
  }
  return (
    <Modal titulo={bloqueio.motivo || 'Indisponível'} onFechar={onFechar} largura={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CalendarX2 size={16} color="#475569" /> {quandoBloqueio(bloqueio)}</div>
        <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}>Para os outros aparece só &quot;indisponível&quot;. Ninguém consegue te colocar numa reunião nesse horário.</div>
        {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onFechar} style={botaoClaro()}>Fechar</button>
          <button onClick={liberar} disabled={liberando} style={botao('#475569')}><Unlock size={14} /> {liberando ? 'Liberando…' : 'Liberar horário'}</button>
        </div>
      </div>
    </Modal>
  )
}

/** id do bloco da grade ("b:<uuid>:<n>") → id do bloqueio. */
export const idDoBloco = (r: Reserva) => (r.id.startsWith('b:') ? r.id.split(':')[1] : null)
