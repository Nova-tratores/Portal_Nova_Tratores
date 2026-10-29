'use client'
// Editor das linhas da etiqueta TÉRMICA do PPV (José, 29/10/2026): mostrar ou
// esconder cada linha, mudar a ordem, o tamanho da fonte e o negrito — com a
// prévia de verdade (o mesmo HTML que vai para a impressora). O dono do estado
// guarda o layout neste navegador.

import { ChevronDown, ChevronUp, Minus, Plus, RotateCcw } from 'lucide-react'
import {
  FONTE_MAX, FONTE_MIN, fontesPadrao, htmlTermica, layoutPadrao, NOME_CAMPO,
  type AjusteTermica, type ItemTermica, type LayoutCampo,
} from '@/lib/opa-pecas/etiqueta-termica'

const PX_MM = 96 / 25.4
// QR de mentira na prévia (o de verdade depende do registro da unidade)
const QR_FALSO = '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="#bbb"/><rect x="1" y="1" width="3" height="3" fill="#000"/><rect x="6" y="1" width="3" height="3" fill="#000"/><rect x="1" y="6" width="3" height="3" fill="#000"/></svg>'

export default function EditorEtiquetaTermica({ layout, setLayout, term, exemplo }: {
  layout: LayoutCampo[]
  setLayout: (l: LayoutCampo[]) => void
  term: AjusteTermica
  exemplo: ItemTermica
}) {
  const auto = fontesPadrao(term.altura, exemplo.locGrande !== false)
  const muda = (i: number, p: Partial<LayoutCampo>) => setLayout(layout.map((l, k) => (k === i ? { ...l, ...p } : l)))
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= layout.length) return
    const n = layout.slice()
    ;[n[i], n[j]] = [n[j], n[i]]
    setLayout(n)
  }
  const fonte = (i: number, d: number) => {
    const atual = layout[i].fonte || auto[layout[i].campo]
    muda(i, { fonte: Math.min(FONTE_MAX, Math.max(FONTE_MIN, atual + d)) })
  }

  // prévia: a etiqueta inteira cabe em 320 px de largura
  const deLado = term.rotacao === 90 || term.rotacao === 270
  const PW = deLado ? term.altura + term.intervalo : term.largura
  const PH = deLado ? term.largura : term.altura + term.intervalo
  const escala = 320 / (PW * PX_MM)
  const html = htmlTermica([{ ...exemplo, layout, qr: exemplo.semQr ? '' : QR_FALSO }], term)
    .replace('</style>', `body{margin:0!important;zoom:${escala}} .pg{outline:none!important;margin:0!important}</style>`)

  const btn: React.CSSProperties = {
    width: 26, height: 26, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    border: '1px solid var(--portal-border)', borderRadius: 6, background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: 'pointer',
  }
  return (
    <div style={{ border: '1px solid var(--portal-border)', borderRadius: 10, padding: 10, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--portal-text)' }}>Linhas da etiqueta</span>
        <button type="button" onClick={() => setLayout(layoutPadrao())} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#EA580C', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>
          <RotateCcw size={12} /> Voltar ao padrão
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
        <iframe title="Prévia da etiqueta" srcDoc={html} tabIndex={-1}
          style={{ width: 320, height: Math.ceil(PH * PX_MM * escala), border: '1.5px dashed var(--portal-border)', borderRadius: 6, background: '#fff', pointerEvents: 'none' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {layout.map((l, i) => (
          <div key={l.campo} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', borderRadius: 8, background: l.ver ? 'transparent' : 'var(--portal-bg-secondary)', opacity: l.ver ? 1 : 0.6 }}>
            <button type="button" title="Subir" aria-label={`Subir ${NOME_CAMPO[l.campo]}`} disabled={i === 0} onClick={() => mover(i, -1)} style={{ ...btn, opacity: i === 0 ? 0.35 : 1 }}><ChevronUp size={14} /></button>
            <button type="button" title="Descer" aria-label={`Descer ${NOME_CAMPO[l.campo]}`} disabled={i === layout.length - 1} onClick={() => mover(i, 1)} style={{ ...btn, opacity: i === layout.length - 1 ? 0.35 : 1 }}><ChevronDown size={14} /></button>
            <label style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: 'var(--portal-text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={l.ver} onChange={(e) => muda(i, { ver: e.target.checked })} />
              {NOME_CAMPO[l.campo]}
            </label>
            <button type="button" title="Diminuir a fonte" aria-label="Diminuir a fonte" onClick={() => fonte(i, -0.5)} style={btn}><Minus size={13} /></button>
            <button type="button" title="Clique para voltar ao automático" onClick={() => muda(i, { fonte: 0 })}
              style={{ ...btn, width: 64, fontSize: 12, fontWeight: 700, color: l.fonte ? 'var(--portal-text)' : 'var(--portal-text-muted)' }}>
              {(l.fonte || auto[l.campo]).toLocaleString('pt-BR')} pt{l.fonte ? '' : '*'}
            </button>
            <button type="button" title="Aumentar a fonte" aria-label="Aumentar a fonte" onClick={() => fonte(i, 0.5)} style={btn}><Plus size={13} /></button>
            <button type="button" title="Negrito" aria-pressed={l.negrito} onClick={() => muda(i, { negrito: !l.negrito })}
              style={{ ...btn, fontWeight: 900, background: l.negrito ? '#111827' : 'var(--portal-bg-card)', color: l.negrito ? '#fff' : 'var(--portal-text)' }}>N</button>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', lineHeight: 1.5, marginTop: 8 }}>
        * tamanho automático (acompanha a altura da etiqueta) — clique no número para voltar a ele.
        {' '}Marca e modelo vêm do cadastro da Omie (peça sem eles sai sem a linha); “Outra empresa” só sai na etiqueta juntada (NOVA + CASTRO). Tudo fica salvo neste computador.
      </div>
    </div>
  )
}
