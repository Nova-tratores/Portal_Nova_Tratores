'use client'
// Uma ideia: texto, quem escreveu e quando. Clicar no texto edita na hora
// (Enter salva, Esc cancela). Checkbox pra selecionar e agrupar.
import { useEffect, useRef, useState } from 'react'
import { Archive, CornerUpLeft } from 'lucide-react'
import type { Ideia } from '@/lib/dev/ideias'

interface Props {
  ideia: Ideia
  autor?: string
  selecionada?: boolean
  onSelecionar?: (id: string, marcada: boolean) => void
  onEditar: (id: string, texto: string) => Promise<void>
  onArquivar?: (id: string) => void
  /** Dentro de um grupo: tirar do grupo (volta a Captadas). */
  onTirarDoGrupo?: (id: string) => void
  apagada?: boolean
}

const quando = (iso: string) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function CardIdeia({ ideia, autor, selecionada, onSelecionar, onEditar, onArquivar, onTirarDoGrupo, apagada }: Props) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(ideia.texto)
  const [salvando, setSalvando] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (editando) { ref.current?.focus(); ref.current?.setSelectionRange(texto.length, texto.length) } }, [editando]) // eslint-disable-line react-hooks/exhaustive-deps

  const confirmar = async () => {
    const t = texto.trim()
    if (!t || t === ideia.texto) { setEditando(false); setTexto(ideia.texto); return }
    setSalvando(true)
    try { await onEditar(ideia.id, t); setEditando(false) } finally { setSalvando(false) }
  }

  return (
    <div style={{
      display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 10,
      border: selecionada ? '1.5px solid #111' : '1px solid var(--portal-border,#e5e7eb)',
      background: selecionada ? 'rgba(17,17,17,.04)' : 'var(--portal-surface,#fff)',
      opacity: apagada ? .55 : 1,
    }}>
      {onSelecionar && (
        <input type="checkbox" checked={!!selecionada} onChange={(e) => onSelecionar(ideia.id, e.target.checked)}
          title="Selecionar para agrupar" style={{ marginTop: 3, cursor: 'pointer', flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editando ? (
          <textarea ref={ref} value={texto} onChange={(e) => setTexto(e.target.value)} disabled={salvando}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setEditando(false); setTexto(ideia.texto) }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); confirmar() }
            }}
            onBlur={confirmar}
            rows={Math.min(8, Math.max(2, texto.split('\n').length))}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '6px 8px', borderRadius: 8, fontSize: 13.5, lineHeight: 1.45, border: '1px solid #111', background: 'var(--portal-bg,#f9fafb)', color: 'var(--portal-text,#111)', outline: 'none', fontFamily: 'inherit' }} />
        ) : (
          <div onClick={() => { if (!apagada) { setTexto(ideia.texto); setEditando(true) } }} title={apagada ? undefined : 'Clique para editar'}
            style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--portal-text,#111)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: apagada ? 'default' : 'text' }}>
            {ideia.texto}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, fontSize: 11.5, color: 'var(--portal-text-muted,#999)' }}>
          <span>{autor?.split(' ')[0] || '—'} · {quando(ideia.created_at)}</span>
          <span style={{ flex: 1 }} />
          {onTirarDoGrupo && !apagada && (
            <button onClick={() => onTirarDoGrupo(ideia.id)} title="Tirar do grupo (volta para Captadas)"
              style={{ display: 'flex', alignItems: 'center', gap: 3, border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', padding: 2, fontSize: 11.5 }}>
              <CornerUpLeft size={12} /> tirar
            </button>
          )}
          {onArquivar && !apagada && (
            <button onClick={() => onArquivar(ideia.id)} title="Arquivar (some da lista, fica no histórico)"
              style={{ display: 'flex', alignItems: 'center', gap: 3, border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', padding: 2, fontSize: 11.5 }}>
              <Archive size={12} /> arquivar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
