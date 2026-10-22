'use client'
// POPs — etiquetas livres do POP ("limpeza", "segurança"…). Quem cuida do POP
// adiciona (Enter ou vírgula) e tira (×); a lista /pops filtra por elas.
import { useState } from 'react'
import { Tag, X } from 'lucide-react'
import { MAX_ETIQUETAS, normalizarEtiquetas } from '@/lib/pops/regras'
import { COR_POPS, FUNDO_POPS } from './comum'

export function ChipEtiqueta({ texto, onTirar, onClick, ativa }: { texto: string; onTirar?: () => void; onClick?: () => void; ativa?: boolean }) {
  return (
    // Na lista o chip fica dentro do link da linha: o clique filtra, não abre o POP.
    <span onClick={onClick ? (e) => { e.preventDefault(); e.stopPropagation(); onClick() } : undefined} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700,
      color: ativa ? '#fff' : COR_POPS, background: ativa ? COR_POPS : FUNDO_POPS, cursor: onClick ? 'pointer' : 'default',
    }}>
      <Tag size={11} /> {texto}
      {onTirar && (
        <button onClick={(e) => { e.stopPropagation(); onTirar() }} aria-label={`Tirar ${texto}`}
          style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}><X size={12} /></button>
      )}
    </span>
  )
}

export default function EtiquetasPop({ etiquetas, editavel, onSalvar }: {
  etiquetas: string[]; editavel: boolean; onSalvar: (lista: string[]) => Promise<void>
}) {
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const salvar = async (lista: string[]) => {
    setOcupado(true)
    try { await onSalvar(normalizarEtiquetas(lista)); setTexto('') } finally { setOcupado(false) }
  }
  const adicionar = () => { if (texto.trim()) salvar([...etiquetas, ...texto.split(',')]) }

  if (!editavel && !etiquetas.length) return null
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {etiquetas.map((e) => (
        <ChipEtiqueta key={e} texto={e} onTirar={editavel && !ocupado ? () => salvar(etiquetas.filter((x) => x !== e)) : undefined} />
      ))}
      {editavel && etiquetas.length < MAX_ETIQUETAS && (
        <input value={texto} disabled={ocupado} onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); adicionar() } }}
          onBlur={adicionar}
          placeholder={etiquetas.length ? '+ etiqueta' : '+ etiqueta (ex.: limpeza)'}
          style={{ border: '1px dashed var(--portal-border,#d1d5db)', borderRadius: 999, padding: '3px 10px', fontSize: 12, width: 150, background: 'transparent', color: 'var(--portal-text,#111)' }} />
      )}
    </div>
  )
}
