'use client'
// Aviso ao vivo no formulário de reunião: alguém da lista bloqueou esse horário na agenda pessoal?
// Mostra só QUEM está indisponível (nunca o motivo). O servidor recusa de novo ao criar.
import { useEffect, useState } from 'react'
import { UserX } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { fimDaReuniao } from '@/lib/salas/regras'

export default function AvisoAgenda({ usuarios, dia, hora, duracaoMin, onBloqueado }: {
  usuarios: string[]
  dia: string
  hora: string
  duracaoMin: number
  onBloqueado?: (bloqueado: boolean) => void
}) {
  const [msg, setMsg] = useState('')
  const chave = [...new Set(usuarios.filter(Boolean))].sort().join(',')

  useEffect(() => {
    if (!chave || !dia || !hora || !duracaoMin) { setMsg(''); onBloqueado?.(false); return }
    let vivo = true
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ dia, inicio: hora.slice(0, 5), fim: fimDaReuniao(hora, duracaoMin), usuarios: chave })
        const r = await fetch(`/api/agenda/disponibilidade?${qs}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json().catch(() => ({}))
        if (!vivo || !r.ok) return
        setMsg(j.mensagem || ''); onBloqueado?.(!!(j.indisponiveis || []).length)
      } catch { /* sem aviso; o servidor confere ao criar */ }
    }, 350)
    return () => { vivo = false; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onBloqueado muda a cada render do pai
  }, [chave, dia, hora, duracaoMin])

  if (!msg) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 700 }}>
      <UserX size={15} /> {msg}. Escolha outro horário ou tire a pessoa da reunião.
    </div>
  )
}
