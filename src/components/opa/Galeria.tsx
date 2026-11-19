'use client'
// Galeria do Opa: foto GRANDE logo de cara + miniaturas embaixo (José, 19/11/2026: "quando eu clicar em um
// produto, abre a foto grandona já, podendo ir para o lado ou clicar para ficar só a foto"). Setas ou deslizar
// o dedo trocam; clicar na foto chama onAmpliar (tela cheia com zoom = Visualizador). Usada na ficha das
// Peças S/Estoque e na do Patrimônio Loja.

import { useRef, useState } from 'react'
import { Camera, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

export interface FotoGaleria { id: string; src?: string; mini?: string }

export default function Galeria({ fotos, larga, onAmpliar, acao, onAdicionar, adicionando = false, desabilitado = false }: {
  fotos: FotoGaleria[]
  larga: boolean
  onAmpliar: (i: number) => void
  /** botão sobre a foto grande (ex.: "Tirar foto", "Trocar"), para a foto que está aparecendo */
  acao?: { rotulo: string; icone: React.ReactNode; onClick: (fotoId: string) => void; ocupadoId?: string | null }
  /** sem isto não aparece o botão de pôr foto */
  onAdicionar?: () => void
  adicionando?: boolean
  desabilitado?: boolean
}) {
  const [i, setI] = useState(0)
  const toque = useRef<number | null>(null)
  const n = fotos.length
  // se uma foto sai, "atual" (abaixo) segura o número dentro da lista — sem efeito para corrigir o estado
  const ir = (d: number) => setI((x) => (Math.min(x, n - 1) + d + n) % n)
  const altura = larga ? 460 : 300

  const adicionar = onAdicionar && (
    <button type="button" onClick={onAdicionar} disabled={desabilitado} style={{ flex: 'none', width: n ? 72 : '100%', height: n ? 72 : altura, borderRadius: n ? 10 : 16, border: '1.5px dashed var(--portal-border)', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text-secondary)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: n ? 12 : 15, fontFamily: 'inherit', cursor: 'pointer' }}>
      {adicionando ? <Loader2 size={n ? 18 : 28} style={{ animation: 'spin 1s linear infinite' }} /> : <Camera size={n ? 18 : 28} />} {n ? 'Foto' : 'Sem foto — clique para pôr uma'}
    </button>
  )
  if (!n) return adicionar || <div style={{ padding: 16, borderRadius: 16, border: '1px solid var(--portal-border)', color: 'var(--portal-text-muted)', fontSize: 14 }}>Sem foto.</div>

  const atual = Math.min(i, n - 1)
  const f = fotos[atual]
  const pilula: React.CSSProperties = { position: 'absolute', fontSize: 12.5, fontFamily: 'inherit', color: '#fefefe', background: 'rgba(17,17,17,.55)', border: 'none', borderRadius: 999, padding: '4px 10px' }
  const seta = (lado: 'esq' | 'dir'): React.CSSProperties => ({
    position: 'absolute', top: '50%', [lado === 'esq' ? 'left' : 'right']: 12, transform: 'translateY(-50%)',
    width: 44, height: 44, borderRadius: 22, border: 'none', background: 'rgba(17,17,17,.55)', color: '#fefefe',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  })
  const ocupada = acao?.ocupadoId === f.id

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'relative', height: altura, borderRadius: 16, overflow: 'hidden', background: '#111111' }}
        onTouchStart={(e) => { toque.current = e.touches[0].clientX }}
        onTouchEnd={(e) => {
          if (toque.current == null) return
          const dx = e.changedTouches[0].clientX - toque.current
          toque.current = null
          if (Math.abs(dx) > 40) ir(dx < 0 ? 1 : -1)
        }}>
        <button type="button" onClick={() => onAmpliar(atual)} aria-label="Ver a foto em tela cheia" style={{ width: '100%', height: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'zoom-in', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {f.src || f.mini ? <img src={f.src || f.mini} alt={`Foto ${atual + 1}`} style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: ocupada ? 0.5 : 1 }} />
            : <Loader2 size={28} color="#fefefe" style={{ animation: 'spin 1s linear infinite' }} />}
        </button>
        {n > 1 && <>
          <button type="button" aria-label="Foto anterior" onClick={() => ir(-1)} style={seta('esq')}><ChevronLeft size={24} /></button>
          <button type="button" aria-label="Próxima foto" onClick={() => ir(1)} style={seta('dir')}><ChevronRight size={24} /></button>
        </>}
        <span style={{ ...pilula, bottom: 10, left: 12 }}>{atual + 1} / {n}</span>
        {acao && (
          <button type="button" onClick={() => acao.onClick(f.id)} disabled={desabilitado} style={{ ...pilula, top: 10, right: 10, display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', cursor: 'pointer' }}>
            {ocupada ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : acao.icone} {acao.rotulo}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
        {fotos.map((ft, k) => (
          <button key={ft.id} type="button" onClick={() => setI(k)} aria-label={`Foto ${k + 1}`} aria-pressed={k === atual} style={{ flex: 'none', width: 72, height: 72, padding: 0, borderRadius: 10, overflow: 'hidden', cursor: 'pointer', background: 'var(--portal-bg-secondary)', border: k === atual ? '2px solid #64748B' : '1px solid var(--portal-border)', opacity: k === atual ? 1 : 0.7 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {(ft.mini || ft.src) && <img src={ft.mini || ft.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </button>
        ))}
        {adicionar}
      </div>
    </div>
  )
}
