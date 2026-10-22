'use client'
// POPs — ajuda de ESCRITA no editor: o quadro com as regras de um bom POP e as
// sugestões em cada campo/passo (lib/pops/redacao). Só sugere; nunca bloqueia.
import { useState } from 'react'
import { ChevronDown, ChevronUp, Lightbulb, Wand2 } from 'lucide-react'
import { REGRAS_REDACAO, type DicaRedacao } from '@/lib/pops/redacao'
import { COR_POPS, cartao } from './comum'

const AMBAR = '#b45309'

export function GuiaRedacao({ total }: { total: number }) {
  // Começa aberto para quem ainda tem o que ajustar; fechado quando está tudo certo.
  const [aberto, setAberto] = useState<boolean | null>(null)
  const mostra = aberto ?? total > 0
  return (
    <div style={{ ...cartao, borderLeft: `4px solid ${total ? AMBAR : COR_POPS}`, padding: 0 }}>
      <button onClick={() => setAberto(!mostra)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', textAlign: 'left' }}>
        <Lightbulb size={16} style={{ color: total ? AMBAR : COR_POPS }} />
        <strong style={{ flex: 1, fontSize: 14 }}>Como escrever um bom POP</strong>
        <span style={{ fontSize: 12, fontWeight: 700, color: total ? AMBAR : '#047857' }}>
          {total ? `${total} sugest${total === 1 ? 'ão' : 'ões'} neste rascunho` : 'tudo certo na escrita'}
        </span>
        {mostra ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {mostra && (
        <div style={{ padding: '0 14px 12px', display: 'grid', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
            Escreva para quem vai executar sem você do lado: cada passo manda fazer UMA coisa e diz como saber que ficou certo.
          </p>
          {REGRAS_REDACAO.map((r) => (
            <div key={r.titulo} style={{ fontSize: 13, display: 'grid', gridTemplateColumns: 'minmax(170px,.9fr) 1fr 1fr', gap: 8, alignItems: 'start', borderTop: '1px solid var(--portal-border,#e5e7eb)', paddingTop: 6 }}>
              <strong>{r.titulo}</strong>
              <span style={{ color: '#b91c1c' }}>✗ {r.ruim}</span>
              <span style={{ color: '#047857' }}>✓ {r.bom}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Sugestões de um campo ou passo. `onAplicar` troca o título pela sugestão pronta. */
export function DicasCampo({ dicas, onAplicar }: { dicas: DicaRedacao[]; onAplicar?: (titulo: string) => void }) {
  if (!dicas.length) return null
  return (
    <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
      {dicas.map((d) => (
        <div key={d.regra} style={{ fontSize: 12.5, color: AMBAR, display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Lightbulb size={13} style={{ flex: '0 0 13px', marginTop: 2 }} />
          <span style={{ flex: '1 1 240px' }}>{d.texto}</span>
          {d.sugestao && onAplicar && (
            <button type="button" onClick={() => onAplicar(d.sugestao!)} title="Troca o título do passo pela sugestão"
              style={{ display: 'inline-flex', gap: 4, alignItems: 'center', border: `1px solid ${COR_POPS}`, background: 'transparent', color: COR_POPS, borderRadius: 8, padding: '2px 8px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Wand2 size={12} /> Usar “{d.sugestao}”
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
