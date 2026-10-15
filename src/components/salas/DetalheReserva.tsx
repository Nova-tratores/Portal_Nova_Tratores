'use client'
// Uma reserva: quem, quando, para quê. Quem reservou (ou admin) altera/cancela;
// reserva de reunião do portal muda pela própria reunião.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, User, Pencil, Ban, ExternalLink } from 'lucide-react'
import { Modal, botao, botaoClaro, chamar } from '@/components/reunioes/comum'
import { localDe, type Reserva } from '@/lib/salas/regras'

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export default function DetalheReserva({ reserva, podeMexer, onFechar, onEditar, onMudou }: {
  reserva: Reserva
  podeMexer: boolean
  onFechar: () => void
  onEditar: () => void
  onMudou: () => void
}) {
  const router = useRouter()
  const [cancelando, setCancelando] = useState(false)
  const [erro, setErro] = useState('')
  const a = localDe(reserva.inicio), b = localDe(reserva.fim)
  const quando = `${SEMANA[new Date(a.dia + 'T12:00:00Z').getUTCDay()]}, ${a.dia.slice(8, 10)}/${a.dia.slice(5, 7)} · ${a.hora}–${b.hora}`

  const cancelar = async () => {
    if (!window.confirm('Cancelar esta reserva? O horário fica livre para outros.')) return
    setCancelando(true); setErro('')
    try { await chamar(`/api/salas/reservas/${reserva.id}`, { method: 'DELETE' }); onMudou() }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao cancelar') } finally { setCancelando(false) }
  }

  return (
    <Modal titulo={reserva.titulo} onFechar={onFechar} largura={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14, color: 'var(--portal-text,#111)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CalendarClock size={16} color="#0891b2" /> {quando}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><User size={16} color="#0891b2" /> Reservado por <b>{reserva.responsavel_nome || '—'}</b></div>
        {reserva.descricao && <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--portal-bg,#f9fafb)', whiteSpace: 'pre-wrap', fontSize: 13.5 }}>{reserva.descricao}</div>}
        {reserva.reuniao_id && (
          <div style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(124,58,237,.08)', fontSize: 13 }}>
            📋 Reserva da <b>reunião nº {reserva.reuniao_numero ?? '—'}</b>. Horário e cancelamento mudam pela própria reunião.
          </div>
        )}
        {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          {reserva.reuniao_id && <button onClick={() => router.push(`/reunioes/${reserva.reuniao_id}`)} style={botao('#7c3aed')}><ExternalLink size={14} /> Abrir a reunião</button>}
          {!reserva.reuniao_id && podeMexer && (
            <>
              <button onClick={cancelar} disabled={cancelando} style={botaoClaro()}><Ban size={14} /> {cancelando ? 'Cancelando…' : 'Cancelar reserva'}</button>
              <button onClick={onEditar} style={botao('#0891b2')}><Pencil size={14} /> Alterar</button>
            </>
          )}
          {!reserva.reuniao_id && !podeMexer && <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}>Só quem reservou (ou um admin) altera ou cancela.</span>}
        </div>
      </div>
    </Modal>
  )
}
