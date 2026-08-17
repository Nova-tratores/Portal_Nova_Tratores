'use client'
// Selo da PREFERÊNCIA DE ENVIO do cliente, pra mostrar na capa do card.
// metodo: 'email' | 'whatsapp' | (vazio) → "Sem preferência".
import { Mail, MessageCircle, AlertTriangle } from 'lucide-react'

export default function PrefEnvioBadge({ metodo }) {
  const m = String(metodo || '').toLowerCase()
  const cfg = m === 'email'
    ? { txt: 'Email', cor: '#2563eb', bg: 'rgba(37,99,235,.12)', Icon: Mail }
    : m === 'whatsapp'
      ? { txt: 'WhatsApp', cor: '#16a34a', bg: 'rgba(22,163,74,.12)', Icon: MessageCircle }
      : { txt: 'Sem preferência', cor: '#b45309', bg: 'rgba(180,83,9,.12)', Icon: AlertTriangle }
  const { txt, cor, bg, Icon } = cfg
  return (
    <span title={m ? `Envio preferido: ${txt}` : 'Cliente sem preferência de envio cadastrada'}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 11px', borderRadius: 999, background: bg, color: cor, fontSize: 12.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>
      <Icon size={14} /> {m ? `Preferência: ${txt}` : txt}
    </span>
  )
}
