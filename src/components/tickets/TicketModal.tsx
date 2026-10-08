'use client'
// Janela do ticket: abre por cima da lista/quadro ao clicar no cartão, sem
// trocar de página. O conteúdo é o mesmo da página /tickets/[id].
// zIndex 900: as janelas internas do ticket (transferir, quadro) ficam por cima.
import { useEffect } from 'react'
import TicketDetalhe from './TicketDetalhe'

interface Props {
  id: string
  onFechar: () => void
  onMudou?: () => void
}

export default function TicketModal({ id, onFechar, onMudou }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', esc); document.body.style.overflow = antes }
  }, [onFechar])

  return (
    <div onClick={onFechar} role="dialog" aria-modal="true" className="ct-tm-fundo"
      style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,.5)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '24px 12px', overflowY: 'auto' }}>
      {/* Celular: janela quase em tela cheia (menos margem e menos acolchoado). */}
      <style>{`@media (max-width: 600px){.ct-tm-fundo{padding:8px 6px !important}.ct-tm-caixa{padding:10px !important;border-radius:12px !important}}`}</style>
      <div onClick={(e) => e.stopPropagation()} className="ct-tm-caixa"
        style={{ minWidth: 0, width: '100%', maxWidth: 1080, background: 'var(--portal-bg,#f6f6f6)', borderRadius: 16, padding: 16, boxShadow: '0 24px 70px rgba(0,0,0,.35)' }}>
        <TicketDetalhe id={id} onFechar={onFechar} onMudou={onMudou} />
      </div>
    </div>
  )
}
