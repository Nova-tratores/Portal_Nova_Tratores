'use client'
// Remarcar a reunião (José, 17/11/2026: "não consigo editar a data de quando ela fica aberta").
// Dia + hora + duração; a sala reservada anda junto e todos recebem aviso no sino.
import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { Modal, campo, rotulo, botao, botaoClaro, chamar, hojeISO } from './comum'

const DURACOES = [15, 30, 45, 60, 90, 120]

export default function RemarcarReuniao({ reuniaoId, inicio, duracaoMin, onFechar, onFeito }: {
  reuniaoId: string
  inicio: string | null
  duracaoMin: number
  onFechar: () => void
  onFeito: (aviso: string | null) => void
}) {
  const local = inicio ? new Date(inicio) : null
  const [dia, setDia] = useState(local ? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(local) : hojeISO())
  const [hora, setHora] = useState(local ? local.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '10:00')
  const [dur, setDur] = useState(duracaoMin)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const salvar = async () => {
    setSalvando(true); setErro('')
    try {
      const j = await chamar<{ aviso: string | null }>(`/api/reunioes/${reuniaoId}/acoes`, { json: { acao: 'remarcar', dia, hora, duracao_min: dur } })
      window.dispatchEvent(new Event('central-trabalho-mudou'))
      onFeito(j.aviso)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao remarcar') } finally { setSalvando(false) }
  }

  return (
    <Modal titulo="Remarcar reunião" onFechar={onFechar} largura={440}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
          <div><label style={rotulo}>Novo dia</label><input type="date" min={hojeISO()} value={dia} onChange={(e) => setDia(e.target.value)} style={campo} /></div>
          <div><label style={rotulo}>Hora</label><input type="time" step={300} value={hora} onChange={(e) => setHora(e.target.value)} style={campo} /></div>
        </div>
        <div>
          <label style={rotulo}>Duração</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DURACOES.map((m) => (
              <button key={m} onClick={() => setDur(m)} style={{ ...botaoClaro(), minHeight: 36, borderColor: dur === m ? '#2563eb' : undefined, color: dur === m ? '#2563eb' : undefined, background: dur === m ? 'color-mix(in srgb,#2563eb 10%,var(--portal-surface,#fefefe))' : undefined }}>
                {m < 60 ? `${m} min` : `${m / 60}`.replace('.', ',') + ' h'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>A sala reservada muda junto e todos os participantes recebem o aviso.</div>
        {erro && <div style={{ color: '#dc2626', fontSize: 13 }}>{erro}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onFechar} style={botaoClaro()}>Cancelar</button>
          <button onClick={salvar} disabled={salvando || !dia || !hora} style={{ ...botao('#2563eb'), opacity: salvando ? .6 : 1 }}><CalendarClock size={14} /> {salvando ? 'Remarcando…' : 'Remarcar'}</button>
        </div>
      </div>
    </Modal>
  )
}
