'use client'
// "Local: Sala de reunião" nos formulários de reunião e de série. Com dia/hora/duração,
// avisa ao vivo se a sala está livre (GET /api/salas/disponivel). Sem a migration, some.
import { useEffect, useState } from 'react'
import { MapPin, CheckCircle2, AlertTriangle } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { fimDaReuniao, type Sala } from '@/lib/salas/regras'

let cacheSalas: Sala[] | null = null

export default function CampoSala({ valor, onChange, dia, hora, duracaoMin, ignorarReuniao, onLivre }: {
  valor: string | null
  onChange: (salaId: string | null) => void
  dia?: string
  hora?: string
  duracaoMin?: number
  ignorarReuniao?: string
  /** true = livre · false = ocupada · null = não se sabe (sem sala/sem horário) */
  onLivre?: (livre: boolean | null) => void
}) {
  const [salas, setSalas] = useState<Sala[] | null>(cacheSalas)
  const [status, setStatus] = useState<{ livre: boolean; mensagem?: string } | null>(null)

  useEffect(() => {
    if (cacheSalas) return
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/salas?de=2000-01-01&ate=2000-01-01', { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json().catch(() => ({}))
        cacheSalas = j.migracaoFaltando ? [] : (j.salas || [])
      } catch { cacheSalas = [] }
      if (vivo) setSalas(cacheSalas)
    })()
    return () => { vivo = false }
  }, [])

  const checar = !!(valor && dia && hora && duracaoMin)
  useEffect(() => {
    if (!checar) { setStatus(null); onLivre?.(null); return }
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ sala: valor!, dia: dia!, inicio: hora!.slice(0, 5), fim: fimDaReuniao(hora!, duracaoMin!) })
        if (ignorarReuniao) qs.set('ignorar_reuniao', ignorarReuniao)
        const r = await fetch(`/api/salas/disponivel?${qs}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json().catch(() => ({}))
        if (!vivo || !r.ok) return
        setStatus({ livre: !!j.livre, mensagem: j.mensagem }); onLivre?.(!!j.livre)
      } catch { /* sem aviso */ }
    }, 350)
    return () => { vivo = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onLivre muda a cada render do pai
  }, [checar, valor, dia, hora, duracaoMin, ignorarReuniao])

  if (!salas || salas.length === 0) return null
  const rotulo: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6, color: 'var(--portal-text-secondary,#555)', textTransform: 'uppercase', letterSpacing: .3 }

  return (
    <div>
      <label style={rotulo}>Local</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button type="button" onClick={() => onChange(null)} style={pilula(!valor)}>Sem sala</button>
        {salas.map((s) => (
          <button key={s.id} type="button" onClick={() => onChange(s.id)} style={pilula(valor === s.id, s.cor)}><MapPin size={13} /> {s.nome}</button>
        ))}
      </div>
      {status && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 700, color: status.livre ? '#059669' : '#dc2626' }}>
          {status.livre ? <><CheckCircle2 size={14} /> Sala livre nesse horário</> : <><AlertTriangle size={14} /> {status.mensagem || 'Sala ocupada nesse horário'} — escolha outro horário</>}
        </div>
      )}
    </div>
  )
}

function pilula(ativo: boolean, cor = '#6b7280'): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: ativo ? `2px solid ${cor}` : '1px solid var(--portal-border,#e5e7eb)', background: ativo ? `${cor}1a` : 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)',
  }
}
