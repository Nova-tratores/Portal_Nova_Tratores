'use client'
// Separação de assuntos do Painel — 2ª leva de opções (José, 19/10/2026: "remove tudo que tá lá no teste e me
// dê mais 5 opções inovadoras"). Cada demo é uma área com rolagem própria para sentir o efeito de verdade.
import { useEffect, useRef, useState } from 'react'

const MUDO = 'var(--portal-text-muted, #64748b)'
type Sec = { n: number; cor: string; ic: string; titulo: string; sub: string; chave: string }
const SECOES: Sec[] = [
  { n: 1, cor: '#2563eb', ic: 'fa-chart-column', titulo: 'Faturamento por período', sub: 'semana, mês ou ano: o resto da tela segue', chave: 'R$ 54.013 no mês' },
  { n: 2, cor: '#0f766e', ic: 'fa-sack-dollar', titulo: 'Para onde foi o dinheiro', sub: 'o que entrou, o que saiu e o simulador', chave: 'ficaram R$ 39 de cada 100' },
  { n: 3, cor: '#d97706', ic: 'fa-hourglass-half', titulo: 'Dinheiro parado', sub: 'OS feitas e ainda não faturadas', chave: 'R$ 79.449 em 35 OS' },
  { n: 4, cor: '#7c3aed', ic: 'fa-users-gear', titulo: 'Apoio ao pós-vendas', sub: 'Garantia e Outros', chave: '26 garantias esperando' },
]
const css = (c: string) => ({ '--c': c } as React.CSSProperties)
const nn = (n: number) => String(n).padStart(2, '0')

/** Conteúdo de mentira de um assunto (só para ver a separação). */
function Conteudo({ s }: { s: Sec }) {
  return (
    <div className="nx-cont">
      <div className="nx-cards">{[0, 1, 2].map((i) => <div key={i}><small>{s.titulo.split(' ')[0]}</small><b>{s.chave.split(' ')[0] === 'R$' ? s.chave.split(' ').slice(0, 2).join(' ') : s.chave}</b></div>)}</div>
      <div className="nx-lista">{[0, 1, 2, 3].map((i) => <span key={i} />)}</div>
    </div>
  )
}

/** Qual assunto está visível dentro de uma área com rolagem (para as opções que acompanham a rolagem). */
function useAtual(raiz: React.RefObject<HTMLDivElement | null>) {
  const [atual, setAtual] = useState(1)
  useEffect(() => {
    const el = raiz.current
    if (!el) return
    const obs = new IntersectionObserver((ents) => {
      const vis = ents.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (vis[0]) setAtual(Number((vis[0].target as HTMLElement).dataset.n))
    }, { root: el, rootMargin: '0px 0px -65% 0px' })
    el.querySelectorAll('[data-n]').forEach((x) => obs.observe(x))
    return () => obs.disconnect()
  }, [raiz])
  return atual
}
const irPara = (raiz: HTMLDivElement | null, n: number) => raiz?.querySelector(`[data-n="${n}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

// N1 — assunto que recolhe, com o número-chave no título: dá para ver o resumo de tudo sem rolar
export function N1() {
  const [abertos, setAbertos] = useState<number[]>([1])
  return (
    <div className="nx-area nx-solta">
      {SECOES.map((s) => {
        const on = abertos.includes(s.n)
        return (
          <section key={s.n} className={`nx1 ${on ? 'on' : ''}`} style={css(s.cor)}>
            <button type="button" className="nx1-cab" onClick={() => setAbertos((a) => (on ? a.filter((x) => x !== s.n) : [...a, s.n]))}>
              <span className="nx-ic"><i className={`fas ${s.ic}`} /></span>
              <div><b>{s.titulo}</b><small>{s.sub}</small></div>
              <strong>{s.chave}</strong>
              <i className={`fas fa-chevron-down nx1-seta`} />
            </button>
            {on && <div className="nx1-corpo"><Conteudo s={s} /></div>}
          </section>
        )
      })}
    </div>
  )
}

// N2 — o título do assunto gruda no topo enquanto você está nele, com a barrinha de quanto já rolou
export function N2() {
  const raiz = useRef<HTMLDivElement>(null)
  const [prog, setProg] = useState<Record<number, number>>({})
  const aoRolar = () => {
    const el = raiz.current
    if (!el) return
    const p: Record<number, number> = {}
    el.querySelectorAll<HTMLElement>('[data-n]').forEach((x) => {
      const top = x.offsetTop - el.scrollTop, h = x.offsetHeight
      p[Number(x.dataset.n)] = Math.max(0, Math.min(1, -top / Math.max(1, h - 60)))
    })
    setProg(p)
  }
  return (
    <div className="nx-area" ref={raiz} onScroll={aoRolar}>
      {SECOES.map((s) => (
        <section key={s.n} data-n={s.n} className="nx2" style={css(s.cor)}>
          <div className="nx2-cab">
            <span className="nx-ic"><i className={`fas ${s.ic}`} /></span>
            <b>{s.titulo}</b><small>{s.sub}</small>
            <em>{s.n} de {SECOES.length}</em>
            <i className="nx2-prog" style={{ transform: `scaleX(${prog[s.n] || 0})` }} />
          </div>
          <Conteudo s={s} /><Conteudo s={s} />
        </section>
      ))}
    </div>
  )
}

// N3 — trilho de navegação ao lado: bolinhas com os assuntos; a do assunto atual acende e cresce ao rolar
export function N3() {
  const raiz = useRef<HTMLDivElement>(null)
  const atual = useAtual(raiz)
  return (
    <div className="nx3">
      <nav className="nx3-trilho">
        {SECOES.map((s) => (
          <button key={s.n} type="button" className={atual === s.n ? 'on' : atual > s.n ? 'feito' : ''} style={css(s.cor)} onClick={() => irPara(raiz.current, s.n)}>
            <span><i className={`fas ${s.ic}`} /></span><b>{s.titulo}</b>
          </button>
        ))}
      </nav>
      <div className="nx-area" ref={raiz}>
        {SECOES.map((s) => (
          <section key={s.n} data-n={s.n} className="nx3-sec" style={css(s.cor)}>
            <h4><i className={`fas ${s.ic}`} /> {s.titulo} <small>{s.sub}</small></h4>
            <Conteudo s={s} /><Conteudo s={s} />
          </section>
        ))}
      </div>
    </div>
  )
}

// N4 — o fundo da tela muda suave de cor conforme o assunto (faixas de ambiente)
export function N4() {
  const raiz = useRef<HTMLDivElement>(null)
  const atual = useAtual(raiz)
  const cor = SECOES.find((s) => s.n === atual)?.cor || '#2563eb'
  return (
    <div className="nx-area nx4" ref={raiz} style={css(cor)}>
      {SECOES.map((s) => (
        <section key={s.n} data-n={s.n} className={`nx4-sec ${atual === s.n ? 'on' : ''}`} style={css(s.cor)}>
          <div className="nx4-cab"><em>{nn(s.n)}</em><div><b>{s.titulo}</b><small>{s.sub}</small></div></div>
          <Conteudo s={s} /><Conteudo s={s} />
        </section>
      ))}
    </div>
  )
}

// N5 — um assunto por vez: abas grandes com o número-chave de cada um; trocar desliza o conteúdo
export function N5() {
  const [atual, setAtual] = useState(1)
  const [dir, setDir] = useState(1)
  const s = SECOES.find((x) => x.n === atual)!
  return (
    <div className="nx-solta">
      <div className="nx5-abas">
        {SECOES.map((x) => (
          <button key={x.n} type="button" className={x.n === atual ? 'on' : ''} style={css(x.cor)} onClick={() => { setDir(x.n > atual ? 1 : -1); setAtual(x.n) }}>
            <span className="nx-ic"><i className={`fas ${x.ic}`} /></span>
            <div><b>{x.titulo}</b><small>{x.chave}</small></div>
          </button>
        ))}
      </div>
      <div key={atual} className="nx5-corpo" style={{ ...css(s.cor), '--d': `${dir * 40}px` } as React.CSSProperties}>
        <Conteudo s={s} />
      </div>
    </div>
  )
}

export const ESTILO_NX = `
@keyframes nxEntra { from { opacity: 0; transform: translateY(8px) } }
.nx-area { height: 430px; overflow-y: auto; background: var(--portal-bg, #f8fafc); border-radius: 16px; padding: 0 16px 16px; position: relative; scroll-behavior: smooth }
.nx-solta { background: var(--portal-bg, #f8fafc); border-radius: 16px; padding: 14px 16px; display: grid; gap: 10px }
.nx-ic { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; flex-shrink: 0; background: color-mix(in srgb, var(--c) 12%, #fefefe); color: var(--c) }
.nx-cont { display: grid; gap: 10px; margin: 12px 0 }
.nx-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px } .nx-cards > div { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 14px; padding: 12px 14px; display: grid } .nx-cards small { font-size: 11px; font-weight: 800; text-transform: uppercase; color: ${MUDO} } .nx-cards b { font-size: 18px; color: var(--portal-text, #0f172a) }
.nx-lista { display: grid; gap: 6px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 14px; padding: 12px } .nx-lista span { height: 12px; border-radius: 6px; background: var(--portal-bg-secondary, #f1f5f9) } .nx-lista span:nth-child(2) { width: 80% } .nx-lista span:nth-child(3) { width: 60% } .nx-lista span:nth-child(4) { width: 70% }
.nx1 { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; overflow: hidden; transition: box-shadow .25s } .nx1.on { box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 35%, transparent), 0 10px 24px rgba(15,23,42,.08) }
.nx1-cab { width: 100%; display: flex; gap: 12px; align-items: center; border: none; background: transparent; padding: 12px 16px; font-family: inherit; text-align: left; cursor: pointer } .nx1-cab:hover { background: color-mix(in srgb, var(--c) 5%, transparent) }
.nx1-cab > div { flex: 1; display: grid } .nx1-cab b { font-size: 15.5px; color: var(--portal-text, #0f172a) } .nx1-cab small { font-size: 12.5px; color: ${MUDO} }
.nx1-cab strong { font-size: 15px; color: var(--c); background: color-mix(in srgb, var(--c) 9%, transparent); border-radius: 99px; padding: 4px 12px; white-space: nowrap }
.nx1-seta { color: ${MUDO}; transition: transform .3s } .nx1.on .nx1-seta { transform: rotate(180deg) }
.nx1-corpo { padding: 0 16px 6px; animation: nxEntra .35s both }
.nx2 { position: relative }
.nx2-cab { position: sticky; top: 0; z-index: 2; display: flex; gap: 10px; align-items: center; padding: 12px 4px 10px; background: color-mix(in srgb, var(--portal-bg, #f8fafc) 88%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid color-mix(in srgb, var(--c) 25%, var(--portal-border, #e2e8f0)) }
.nx2-cab b { font-size: 16px; color: var(--portal-text, #0f172a) } .nx2-cab small { font-size: 12.5px; color: ${MUDO} } .nx2-cab em { margin-left: auto; font-style: normal; font-size: 11.5px; font-weight: 800; color: var(--c) }
.nx2-prog { position: absolute; left: 0; right: 0; bottom: -1px; height: 3px; background: var(--c); transform-origin: left; transition: transform .1s linear }
.nx3 { display: grid; grid-template-columns: 210px 1fr; gap: 12px } @media (max-width: 800px) { .nx3 { grid-template-columns: 1fr } .nx3-trilho { display: none } }
.nx3-trilho { display: grid; align-content: start; gap: 4px; position: relative; padding: 8px 0 }
.nx3-trilho::before { content: ''; position: absolute; left: 21px; top: 26px; bottom: 26px; width: 2px; background: var(--portal-border, #e2e8f0) }
.nx3-trilho button { position: relative; display: flex; gap: 10px; align-items: center; border: none; background: transparent; padding: 6px 4px; font-family: inherit; text-align: left; cursor: pointer; border-radius: 10px }
.nx3-trilho button span { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; background: var(--portal-bg-card, #fefefe); border: 2px solid var(--portal-border, #e2e8f0); color: ${MUDO}; font-size: 13px; transition: all .3s }
.nx3-trilho button b { font-size: 13px; color: ${MUDO}; transition: color .3s }
.nx3-trilho button.feito span { border-color: color-mix(in srgb, var(--c) 45%, transparent); color: var(--c) }
.nx3-trilho button.on span { background: var(--c); border-color: var(--c); color: #fefefe; transform: scale(1.12); box-shadow: 0 0 0 5px color-mix(in srgb, var(--c) 18%, transparent) } .nx3-trilho button.on b { color: var(--portal-text, #0f172a) }
.nx3-sec { padding-top: 14px } .nx3-sec h4 { margin: 0; font-size: 16px; display: flex; gap: 8px; align-items: baseline } .nx3-sec h4 i { color: var(--c) } .nx3-sec h4 small { font-size: 12.5px; font-weight: 600; color: ${MUDO} }
.nx4 { background: color-mix(in srgb, var(--c) 6%, var(--portal-bg, #f8fafc)); transition: background .6s ease }
.nx4-sec { padding-top: 18px; opacity: .55; transition: opacity .4s } .nx4-sec.on { opacity: 1 }
.nx4-cab { display: flex; gap: 12px; align-items: center } .nx4-cab em { font-style: normal; font-size: 34px; font-weight: 900; color: color-mix(in srgb, var(--c) 45%, transparent); line-height: 1 } .nx4-cab b { display: block; font-size: 17px; color: var(--portal-text, #0f172a) } .nx4-cab small { font-size: 12.5px; color: ${MUDO} }
.nx5-abas { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px } @media (max-width: 800px) { .nx5-abas { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
.nx5-abas button { display: flex; gap: 10px; align-items: center; border: 1px solid var(--portal-border, #e5e7eb); background: var(--portal-bg-card, #fefefe); border-radius: 14px; padding: 10px 12px; font-family: inherit; text-align: left; cursor: pointer; transition: all .25s }
.nx5-abas button > div { min-width: 0; display: grid } .nx5-abas b { font-size: 13.5px; color: var(--portal-text, #0f172a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .nx5-abas small { font-size: 12px; font-weight: 800; color: var(--c) }
.nx5-abas button:hover { transform: translateY(-2px) } .nx5-abas button.on { background: var(--c); border-color: var(--c); box-shadow: 0 10px 22px color-mix(in srgb, var(--c) 30%, transparent) } .nx5-abas button.on b, .nx5-abas button.on small { color: #fefefe } .nx5-abas button.on .nx-ic { background: rgba(255,255,255,.2); color: #fefefe }
.nx5-corpo { animation: nx5Desliza .4s cubic-bezier(.2,.8,.2,1) both } @keyframes nx5Desliza { from { opacity: 0; transform: translateX(var(--d)) } }
`
