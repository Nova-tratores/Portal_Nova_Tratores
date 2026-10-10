'use client'
// POPs — decisão da revisão (só para o aprovador designado ou o admin do módulo).
import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { botao, campo, cartao, chamar } from './comum'

export default function PainelRevisao({ ticketId, numero, changelog, onDecidido }: {
  ticketId: string; numero: number; changelog: string; onDecidido: (aprovado: boolean) => void
}) {
  const [parecer, setParecer] = useState('')
  const [enviando, setEnviando] = useState<'' | 'aprovar' | 'reprovar'>('')
  const [erro, setErro] = useState('')

  const decidir = async (acao: 'aprovar' | 'reprovar') => {
    if (acao === 'reprovar' && !parecer.trim()) { setErro('Diga o que precisa mudar.'); return }
    setEnviando(acao); setErro('')
    try {
      await chamar(`/api/pops/revisao/${ticketId}`, { json: { acao, parecer } })
      window.dispatchEvent(new Event('pops-mudou'))
      onDecidido(acao === 'aprovar')
    } catch (e) { setErro((e as Error).message); setEnviando('') }
  }

  return (
    <div style={{ ...cartao, borderLeft: '4px solid #d97706', display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 800, fontSize: 15 }}>A v{numero} está esperando a sua aprovação</div>
      {changelog && <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}><strong>O que mudou:</strong> {changelog}</div>}
      <textarea value={parecer} onChange={(e) => setParecer(e.target.value)} rows={2} maxLength={2000} style={{ ...campo, resize: 'vertical' }}
        placeholder="Parecer (obrigatório para reprovar)" />
      {erro && <div style={{ color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => decidir('aprovar')} disabled={!!enviando} style={botao('#059669')}>
          <Check size={15} /> {enviando === 'aprovar' ? 'Publicando…' : 'Aprovar e publicar'}
        </button>
        <button onClick={() => decidir('reprovar')} disabled={!!enviando} style={botao('#b91c1c')}>
          <X size={15} /> {enviando === 'reprovar' ? 'Devolvendo…' : 'Devolver para ajustes'}
        </button>
      </div>
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>
        Ao aprovar, esta versão passa a valer e a anterior fica obsoleta (execuções antigas continuam na versão delas).
      </div>
    </div>
  )
}
