'use client'
// Ajustes da etiqueta TÉRMICA (rolo): prévia na proporção real, largura,
// altura, intervalo, ajuste fino e girar — os mesmos para Peças e Patrimônio
// (ficam salvos neste navegador a cada mudança, pelo dono do estado).

import { LIMITES, TERMICA_PADRAO, type AjusteTermica } from '@/lib/opa-pecas/etiqueta-termica'
import { INP, LARANJA } from './comum'

type CampoTerm = 'largura' | 'altura' | 'intervalo' | 'x' | 'y'

export default function AjustesTermica({ term, setTerm, n, exemplo }: {
  term: AjusteTermica
  setTerm: React.Dispatch<React.SetStateAction<AjusteTermica>>
  /** quantas etiquetas vão sair */
  n: number
  exemplo: { codigo: string; descricao: string }
}) {
  const mudaTerm = (k: CampoTerm, v: string) => setTerm((t) => ({ ...t, [k]: Number(String(v).replace(',', '.')) || 0 }))
  // ao sair do campo, volta para dentro dos limites (evita 120 × 130 por engano)
  const limitar = (k: CampoTerm) => setTerm((t) => ({ ...t, [k]: Math.min(LIMITES[k][1], Math.max(LIMITES[k][0], t[k])) }))
  // prévia sempre cabe na janela (até 300 × 150 px), na proporção real
  const escala = Math.min(300 / Math.max(1, term.largura), 150 / Math.max(1, term.altura))
  return (
    <>
          {/* prévia na proporção real (QR à esquerda, texto à direita) */}
          <div style={{ display: 'flex', justifyContent: 'center', margin: '0 0 12px' }}>
            <div style={{ width: term.largura * escala, height: term.altura * escala, border: '1.5px dashed var(--portal-border)', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6, padding: 5, background: '#fff', color: '#111', overflow: 'hidden', boxSizing: 'border-box' }}>
              <div style={{ height: '100%', aspectRatio: '1', background: 'repeating-linear-gradient(45deg,#111 0 3px,#fff 3px 6px)', flexShrink: 0 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: Math.max(10, term.altura * escala * 0.2), overflow: 'hidden', whiteSpace: 'nowrap' }}>{exemplo.codigo}</div>
                <div style={{ fontSize: Math.max(8, term.altura * escala * 0.11), fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exemplo.descricao}</div>
              </div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6, marginBottom: 10 }}>
            {([['largura', 'Largura'], ['altura', 'Altura'], ['intervalo', 'Intervalo'], ['x', '→ lado'], ['y', '↓ cima']] as const).map(([k, rot]) => (
              <label key={k} style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-secondary)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {rot} (mm)
                <input type="number" inputMode="decimal" step={k === 'largura' || k === 'altura' ? 1 : 0.5} min={LIMITES[k][0]} max={LIMITES[k][1]}
                  value={term[k]} onChange={(e) => mudaTerm(k, e.target.value)} onBlur={() => limitar(k)} style={{ ...INP, padding: '6px 6px', minWidth: 0 }} />
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-secondary)' }}>Girar:</span>
            {([0, 90, 180, 270] as const).map((g) => (
              <button key={g} type="button" aria-pressed={term.rotacao === g} onClick={() => setTerm((t) => ({ ...t, rotacao: g }))} style={{
                padding: '5px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 800, fontFamily: 'inherit', cursor: 'pointer',
                border: '1.5px solid ' + (term.rotacao === g ? '#111827' : 'var(--portal-border)'),
                background: term.rotacao === g ? '#111827' : 'var(--portal-bg-card)', color: term.rotacao === g ? '#fff' : 'var(--portal-text)',
              }}>{g}°</button>
            ))}
            <button type="button" onClick={() => setTerm({ ...TERMICA_PADRAO })} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: LARANJA, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5 }}>
              Voltar ao padrão (70 × 30, intervalo 5)
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', lineHeight: 1.55, padding: '8px 10px', borderRadius: 8, background: 'var(--portal-bg-secondary)', marginBottom: 12 }}>
            {n === 1 ? 'Sai 1 etiqueta' : `Saem ${n} etiquetas, uma por etiqueta do rolo`} — cada uma ocupa {term.altura + term.intervalo} mm do rolo ({term.altura} + {term.intervalo} de intervalo).
            {' '}Na janela de impressão: impressora <b>ROGERIA</b>, margens <b>Nenhuma</b>, escala <b>100%</b> e <b>sem</b> “Cabeçalhos e rodapés”.
            {' '}Saiu de cabeça pra baixo: <b>180°</b>; de lado: <b>90°</b>. Torta: “→ lado” / “↓ cima”.
          </div>
        </>
  )
}
