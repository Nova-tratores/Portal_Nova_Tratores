'use client'
// "Como está a fila dessa pessoa" — aparece no pedido, ANTES de enviar (24/11/2026).
// A maior parte do excesso vem de pedir sem saber; com o número na frente, quem pede
// escolhe. Só números (via /api/trabalho/carga), nenhum título da fila do outro.
import { useEffect, useState } from 'react'
import { ListOrdered, AlarmClock } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

export interface Carga { id: string; nome: string; setor: string; itens: number; horas: number; atrasados: number; aceitar: number; livreEm: string; hoje: number; diasFila?: number }

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export default function CargaDaPessoa({ userId }: { userId: string }) {
  const [c, setC] = useState<Carga | null | 'erro'>(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/trabalho/carga?user=${userId}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (vivo) setC(r.ok && j.pessoas?.[0] ? j.pessoas[0] : 'erro')
      } catch { if (vivo) setC('erro') }
    })()
    return () => { vivo = false; setC(null) }
  }, [userId])
  if (!c || c === 'erro') return null
  const primeiro = c.nome.split(' ')[0]
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '9px 12px', borderRadius: 10, fontSize: 13, lineHeight: 1.45,
      background: 'rgba(37,99,235,.07)', border: '1px solid rgba(37,99,235,.25)', color: 'var(--portal-text,#111)' }}>
      <ListOrdered size={16} style={{ flex: 'none', marginTop: 1, color: '#2563eb' }} />
      <span>
        {c.itens === 0
          ? <><b>{primeiro}</b> está com a fila vazia. Seu pedido entra logo.</>
          : <><b>{primeiro}</b> tem <b>{c.itens} {c.itens === 1 ? 'item' : 'itens'}</b> na fila ({c.horas} h)
            {c.livreEm && <>, ocupada até <b>{br(c.livreEm)}</b>. Seu pedido entra depois disso, a não ser que {primeiro} mude a ordem</>}.</>}
        {c.atrasados > 0 && <> <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: 'var(--cor-atrasado-texto)', fontWeight: 700 }}><AlarmClock size={13} /> {c.atrasados} atrasado{c.atrasados > 1 ? 's' : ''}</span></>}
        {c.aceitar > 0 && <> · {c.aceitar} pedido{c.aceitar > 1 ? 's' : ''} esperando resposta</>}
      </span>
    </div>
  )
}
