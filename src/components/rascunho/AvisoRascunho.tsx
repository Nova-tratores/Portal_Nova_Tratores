'use client'
// Faixa "Recuperamos o que você tinha digitado" mostrada quando um rascunho volta.
import { History, X } from 'lucide-react'

export default function AvisoRascunho({ em, onDescartar, onFechar }: { em: number | null; onDescartar: () => void; onFechar: () => void }) {
  if (!em) return null
  const quando = new Date(em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', margin: '0 0 12px', borderRadius: 10, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e3a8a', fontSize: 13 }}>
      <History size={16} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>Recuperamos o que você tinha digitado e não salvou ({quando}).</span>
      <button type="button" onClick={onDescartar} style={{ border: '1px solid #93c5fd', background: '#fefefe', color: '#1e3a8a', borderRadius: 7, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Descartar e começar do zero</button>
      <button type="button" onClick={onFechar} aria-label="Fechar aviso" style={{ border: 'none', background: 'transparent', color: '#1e3a8a', cursor: 'pointer', padding: 2, display: 'flex' }}><X size={15} /></button>
    </div>
  )
}
