'use client'
// Celular: pílulas com o nome (e a contagem) de cada coluna do painel/kanban.
// As colunas continuam lado a lado rolando de lado (scroll-snap, uma por tela);
// a pílula mostra em qual coluna a pessoa está e leva direto às outras.
// No computador NÃO renderiza nada.
import { useEffect, useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'

// alvoSel: seletor CSS do contêiner que rola de lado (ex.: '.fin-h-cols')
// itemSel: seletor das colunas DENTRO dele (ex.: '.fin-h-col')
// colunas: [{ rotulo, qtd }] na mesma ordem das colunas
export default function SeletorColunasMobile({ alvoSel, itemSel, colunas, cor = '#c5e29f', style }) {
  const isMobile = useIsMobile()
  const [ativa, setAtiva] = useState(0)

  useEffect(() => {
    if (!isMobile) return
    const alvo = document.querySelector(alvoSel)
    if (!alvo) return
    const aoRolar = () => {
      const itens = Array.from(alvo.querySelectorAll(`:scope > ${itemSel}`))
      const base = alvo.getBoundingClientRect().left
      let melhor = 0, dist = Infinity
      itens.forEach((el, i) => {
        const d = Math.abs(el.getBoundingClientRect().left - base)
        if (d < dist) { dist = d; melhor = i }
      })
      setAtiva(melhor)
    }
    alvo.addEventListener('scroll', aoRolar, { passive: true })
    return () => alvo.removeEventListener('scroll', aoRolar)
  }, [isMobile, alvoSel, itemSel])

  if (!isMobile) return null

  const irPara = (i) => {
    const alvo = document.querySelector(alvoSel)
    const el = alvo?.querySelectorAll(`:scope > ${itemSel}`)[i]
    if (!alvo || !el) return
    alvo.scrollTo({ left: alvo.scrollLeft + el.getBoundingClientRect().left - alvo.getBoundingClientRect().left, behavior: 'smooth' })
    setAtiva(i)
  }

  return (
    <div className="m-rolar-x" role="tablist" aria-label="Colunas" style={{ gap: '8px', marginBottom: '12px', paddingBottom: '2px', ...style }}>
      {colunas.map((c, i) => {
        const on = i === ativa
        return (
          <button key={c.rotulo} type="button" role="tab" aria-selected={on} onClick={() => irPara(i)} style={{
            minHeight: '40px', padding: '0 14px', borderRadius: '999px', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap',
            fontSize: '13px', fontWeight: on ? 700 : 500, fontFamily: 'inherit',
            // #111111/#fefefe: o modo escuro não remapeia essas duas
            background: on ? cor : 'var(--portal-bg-card)', color: on ? '#111111' : 'var(--portal-text)',
            border: `1px solid ${on ? cor : 'var(--portal-border)'}`,
          }}>
            {c.rotulo}
            {c.qtd != null && (
              <span style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums', background: on ? 'rgba(255,255,255,.75)' : 'var(--portal-bg-secondary)', color: on ? '#111111' : 'var(--portal-text-secondary)', borderRadius: '999px', padding: '1px 8px' }}>{c.qtd}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
