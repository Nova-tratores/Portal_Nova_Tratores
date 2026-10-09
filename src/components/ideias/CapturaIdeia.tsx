'use client'
// 1º passo: abriu, digitou, salvou. Textarea sempre no topo, com foco ao abrir
// a página; Ctrl+Enter salva e o foco continua no campo pra próxima ideia.
import { useEffect, useRef, useState } from 'react'
import { Lightbulb, Send } from 'lucide-react'
import { IDEIA_MAX } from '@/lib/dev/ideias'

interface Props {
  /** Salva e resolve quando o servidor confirmou; rejeita com a mensagem. */
  onSalvar: (texto: string) => Promise<void>
  focarAoAbrir?: boolean
}

export default function CapturaIdeia({ onSalvar, focarAoAbrir = true }: Props) {
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (focarAoAbrir) ref.current?.focus() }, [focarAoAbrir])

  // O textarea NÃO é desabilitado durante o save: focus() num elemento disabled
  // falha e a pessoa perdia o foco entre uma ideia e outra.
  const salvar = async () => {
    const t = texto.trim()
    if (!t || salvando) return
    setSalvando(true)
    setErro('')
    setTexto('') // some na hora; volta se der erro
    try {
      await onSalvar(t)
    } catch (e) {
      setTexto(t)
      setErro(e instanceof Error ? e.message : 'Não salvou — tente de novo.')
    } finally {
      setSalvando(false)
      ref.current?.focus()
    }
  }

  const pronto = texto.trim().length > 0 && texto.length <= IDEIA_MAX

  return (
    <div style={{
      border: '1.5px solid #111', borderRadius: 14, background: 'var(--portal-surface,#fff)', padding: 12,
      boxShadow: '0 2px 10px rgba(0,0,0,.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12.5, fontWeight: 800, color: 'var(--portal-text,#111)' }}>
        <Lightbulb size={15} /> Nova ideia
        <span style={{ fontWeight: 500, color: 'var(--portal-text-muted,#888)' }}>— escreva e aperte Ctrl+Enter</span>
      </div>
      <textarea
        ref={ref}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); salvar() } }}
        placeholder="O que passou pela cabeça? Uma frase basta — agrupar e planejar vêm depois."
        rows={3}
        maxLength={IDEIA_MAX}
        style={{
          width: '100%', resize: 'vertical', minHeight: 72, padding: '10px 12px', borderRadius: 10, fontSize: 14, lineHeight: 1.45,
          border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#f9fafb)', color: 'var(--portal-text,#111)',
          outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <span style={{ fontSize: 11.5, color: erro ? '#dc2626' : 'var(--portal-text-muted,#999)', fontWeight: erro ? 700 : 500, flex: 1 }}>
          {erro || (texto.length > IDEIA_MAX * 0.9 ? `${texto.length}/${IDEIA_MAX}` : '')}
        </span>
        <button onClick={salvar} disabled={!pronto || salvando}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
            cursor: pronto && !salvando ? 'pointer' : 'default', background: '#111', color: '#fff', opacity: pronto && !salvando ? 1 : .4,
          }}>
          <Send size={14} /> {salvando ? 'Salvando…' : 'Salvar ideia'}
        </button>
      </div>
    </div>
  )
}
