'use client'
// Opções do botão que troca "Painel do pós-vendas" × "Ocorrências" — página de teste (José, 19/10/2026:
// "limpa o teste e coloca opções de botões diferentes"). Cada opção funciona (clique troca).
import { useState } from 'react'

const MUDO = 'var(--portal-text-muted, #64748b)'
type Aba = 'painel' | 'ocorrencias' | 'podio'
const ITENS: { id: Aba; rot: string; sub: string; ic: string; cor: string; numero: string }[] = [
  { id: 'painel', rot: 'Painel do pós-vendas', sub: 'dinheiro, horas e gastos', ic: 'fa-chart-column', cor: '#0369a1', numero: 'R$ 54 mil no mês' },
  { id: 'ocorrencias', rot: 'Mecânicos', sub: 'pontos, ligas e comissões', ic: 'fa-bullseye', cor: '#7c3aed', numero: '3 ocorrências hoje' },
]
const css = (c: string) => ({ '--c': c } as React.CSSProperties)

function useAba() { return useState<Aba>('painel') }
function Resultado({ aba }: { aba: Aba }) {
  const it = ITENS.find((x) => x.id === aba)!
  return <div className="mo-res" key={aba} style={css(it.cor)}><i className={`fas ${it.ic}`} /> abriu: <b>{it.rot}</b></div>
}

/** B1 — Segmentado com pílula branca que desliza (limpo, estilo iOS). */
export function B1() {
  const [aba, setAba] = useAba()
  const i = ITENS.findIndex((x) => x.id === aba)
  return (
    <div className="mo-demo">
      <div className="b1">
        <span className="b1-pilula" style={{ transform: `translateX(${i * 100}%)` }} />
        {ITENS.map((x) => <button key={x.id} type="button" className={aba === x.id ? 'on' : ''} style={css(x.cor)} onClick={() => setAba(x.id)}><i className={`fas ${x.ic}`} /><span><b>{x.rot}</b><small>{x.sub}</small></span></button>)}
      </div>
      <Resultado aba={aba} />
    </div>
  )
}

/** B2 — Abas de texto com o sublinhado colorido que corre até a escolhida. */
export function B2() {
  const [aba, setAba] = useAba()
  const i = ITENS.findIndex((x) => x.id === aba)
  return (
    <div className="mo-demo">
      <div className="b2">
        {ITENS.map((x) => <button key={x.id} type="button" className={aba === x.id ? 'on' : ''} style={css(x.cor)} onClick={() => setAba(x.id)}><i className={`fas ${x.ic}`} />{x.rot}<em>{x.numero}</em></button>)}
        <span className="b2-linha" style={{ left: `${i * 50}%`, background: ITENS[i].cor }} />
      </div>
      <Resultado aba={aba} />
    </div>
  )
}

/** B3 — Dois cartões grandes com um número de cada lado; o escolhido ganha a cor e o ✓. */
export function B3() {
  const [aba, setAba] = useAba()
  return (
    <div className="mo-demo">
      <div className="b3">
        {ITENS.map((x) => (
          <button key={x.id} type="button" className={aba === x.id ? 'on' : ''} style={css(x.cor)} onClick={() => setAba(x.id)}>
            <span className="b3-ic"><i className={`fas ${x.ic}`} /></span>
            <span className="b3-t"><b>{x.rot}</b><small>{x.sub}</small><em>{x.numero}</em></span>
            <i className="fas fa-circle-check b3-ok" />
          </button>
        ))}
      </div>
      <Resultado aba={aba} />
    </div>
  )
}

/** B4 — Pílulas compactas: a escolhida pinta inteira na cor e o ícone dá um pulinho. */
export function B4() {
  const [aba, setAba] = useAba()
  return (
    <div className="mo-demo">
      <div className="b4">
        {ITENS.map((x) => <button key={x.id} type="button" className={aba === x.id ? 'on' : ''} style={css(x.cor)} onClick={() => setAba(x.id)}><i key={`${x.id}${aba}`} className={`fas ${x.ic}`} />{x.rot}</button>)}
      </div>
      <Resultado aba={aba} />
    </div>
  )
}

/** B5 — Chave grande: Painel ⇄ Ocorrências, o botão redondo leva o ícone de um lado para o outro. */
export function B5() {
  const [aba, setAba] = useAba()
  const on = aba === 'ocorrencias'
  const it = ITENS.find((x) => x.id === aba)!
  return (
    <div className="mo-demo">
      <div className="b5">
        <button type="button" className={!on ? 'on' : ''} onClick={() => setAba('painel')}>{ITENS[0].rot}</button>
        <button type="button" className={`b5-chave ${on ? 'dir' : ''}`} style={css(it.cor)} onClick={() => setAba(on ? 'painel' : 'ocorrencias')} aria-label="trocar"><span><i className={`fas ${it.ic}`} /></span></button>
        <button type="button" className={on ? 'on' : ''} onClick={() => setAba('ocorrencias')}>{ITENS[1].rot}</button>
      </div>
      <Resultado aba={aba} />
    </div>
  )
}

/** A chave B5 de verdade (escolhida 19/10), controlada pelo Centro do Pós-Vendas. */
export function ChaveModo({ aba, onAba }: { aba: Aba; onAba: (a: Aba) => void }) {
  const on = aba === 'ocorrencias'
  const it = ITENS.find((x) => x.id === aba)!
  return (
    <div className="b5" role="tablist">
      <button type="button" role="tab" aria-selected={!on} className={!on ? 'on' : ''} onClick={() => onAba('painel')}>{ITENS[0].rot}</button>
      <button type="button" className={`b5-chave ${on ? 'dir' : ''}`} style={css(it.cor)} onClick={() => onAba(on ? 'painel' : 'ocorrencias')} title={on ? 'Ir para o Painel' : 'Ir para Mecânicos'}><span><i className={`fas ${it.ic}`} /></span></button>
      <button type="button" role="tab" aria-selected={on} className={on ? 'on' : ''} onClick={() => onAba('ocorrencias')}>{ITENS[1].rot}</button>
    </div>
  )
}

/** B6 — Abas estilo Chrome numa faixa com degradê (o padrão das outras telas do portal). */
export function B6() {
  const [aba, setAba] = useAba()
  return (
    <div className="mo-demo">
      <div className="b6">
        {ITENS.map((x) => <button key={x.id} type="button" className={aba === x.id ? 'on' : ''} style={css(x.cor)} onClick={() => setAba(x.id)}><i className={`fas ${x.ic}`} />{x.rot}</button>)}
      </div>
      <div className="b6-folha"><Resultado aba={aba} /></div>
    </div>
  )
}

/** B7 — Dock: ícones redondos que crescem ao passar o mouse, com o nome aparecendo; o escolhido tem o pontinho. */
export function B7() {
  const [aba, setAba] = useAba()
  return (
    <div className="mo-demo">
      <div className="b7">
        {ITENS.map((x) => <button key={x.id} type="button" className={aba === x.id ? 'on' : ''} style={css(x.cor)} onClick={() => setAba(x.id)}><span><i className={`fas ${x.ic}`} /></span><b>{x.rot}</b></button>)}
      </div>
      <Resultado aba={aba} />
    </div>
  )
}

export const ESTILO_MO = `
@keyframes moEntra { from { opacity: 0; transform: translateY(6px) } } @keyframes moPulo { 0% { transform: scale(1) } 40% { transform: scale(1.35) rotate(-8deg) } 100% { transform: scale(1) } }
.mo-demo { display: grid; gap: 12px; background: color-mix(in srgb, var(--portal-bg, #f8fafc) 95%, #0f172a); border-radius: 16px; padding: 18px }
.mo-res { font-size: 13px; color: ${MUDO}; animation: moEntra .3s both } .mo-res i, .mo-res b { color: var(--c) }
.b1 { position: relative; display: grid; grid-template-columns: 1fr 1fr; width: min(620px, 100%); background: var(--portal-bg-secondary, #e9edf3); border-radius: 16px; padding: 4px }
.b1-pilula { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc(50% - 4px); background: var(--portal-bg-card, #fefefe); border-radius: 12px; box-shadow: 0 1px 2px rgba(15,23,42,.08), 0 6px 16px rgba(15,23,42,.08); transition: transform .45s cubic-bezier(.3,1.3,.5,1) }
.b1 button { position: relative; z-index: 1; display: flex; gap: 10px; align-items: center; border: none; background: transparent; padding: 10px 14px; font-family: inherit; text-align: left; cursor: pointer; color: ${MUDO} }
.b1 button i { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: transparent; transition: all .3s } .b1 button b { display: block; font-size: 14.5px } .b1 button small { font-size: 12px }
.b1 button.on { color: var(--portal-text, #0f172a) } .b1 button.on i { background: color-mix(in srgb, var(--c) 12%, transparent); color: var(--c) }
.b2 { position: relative; display: grid; grid-template-columns: 1fr 1fr; width: min(620px, 100%); border-bottom: 1px solid var(--portal-border, #e2e8f0) }
.b2 button { display: flex; gap: 8px; align-items: center; justify-content: center; border: none; background: transparent; padding: 12px 10px; font-family: inherit; font-size: 15px; font-weight: 700; color: ${MUDO}; cursor: pointer; transition: color .25s } .b2 button i { transition: transform .3s }
.b2 button em { font-style: normal; font-size: 11.5px; font-weight: 800; border-radius: 99px; padding: 1px 8px; background: var(--portal-bg-secondary, #eef2f7) }
.b2 button.on { color: var(--c) } .b2 button.on em { background: color-mix(in srgb, var(--c) 12%, transparent) } .b2 button:hover i { transform: translateY(-2px) }
.b2-linha { position: absolute; bottom: -1px; width: 50%; height: 3px; border-radius: 99px; transition: left .4s cubic-bezier(.3,1.2,.5,1), background .4s }
.b3 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: min(720px, 100%) }
.b3 button { position: relative; display: flex; gap: 14px; align-items: center; text-align: left; border: 2px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 18px; padding: 14px 16px; font-family: inherit; cursor: pointer; transition: all .3s }
.b3 button:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(15,23,42,.08) }
.b3-ic { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; font-size: 19px; background: var(--portal-bg-secondary, #f1f5f9); color: ${MUDO}; transition: all .3s }
.b3-t { display: grid } .b3-t b { font-size: 15px; color: var(--portal-text, #0f172a) } .b3-t small { font-size: 12.5px; color: ${MUDO} } .b3-t em { font-style: normal; font-size: 12.5px; font-weight: 800; color: var(--c); margin-top: 3px }
.b3-ok { position: absolute; top: 10px; right: 12px; color: var(--c); font-size: 18px; opacity: 0; transform: scale(.4); transition: all .35s cubic-bezier(.3,1.6,.5,1) }
.b3 button.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 5%, var(--portal-bg-card, #fefefe)); box-shadow: 0 10px 24px color-mix(in srgb, var(--c) 18%, transparent) } .b3 button.on .b3-ic { background: var(--c); color: #fefefe } .b3 button.on .b3-ok { opacity: 1; transform: scale(1) }
.b4 { display: flex; gap: 8px; flex-wrap: wrap }
.b4 button { display: inline-flex; gap: 8px; align-items: center; border: 1.5px solid color-mix(in srgb, var(--c) 35%, transparent); background: var(--portal-bg-card, #fefefe); color: var(--c); border-radius: 99px; padding: 9px 18px; font-family: inherit; font-size: 14px; font-weight: 800; cursor: pointer; transition: all .3s }
.b4 button:hover { background: color-mix(in srgb, var(--c) 8%, var(--portal-bg-card, #fefefe)) } .b4 button.on { background: var(--c); border-color: var(--c); color: #fefefe; box-shadow: 0 8px 18px color-mix(in srgb, var(--c) 30%, transparent) } .b4 button.on i { animation: moPulo .5s ease }
.b5 { display: flex; gap: 14px; align-items: center }
.b5 > button:not(.b5-chave) { border: none; background: transparent; font-family: inherit; font-size: 15px; font-weight: 700; color: ${MUDO}; cursor: pointer; transition: color .25s } .b5 > button.on { color: var(--portal-text, #0f172a); font-weight: 900 }
.b5-chave { position: relative; width: 92px; height: 46px; border-radius: 99px; border: none; background: var(--c); cursor: pointer; transition: background .4s; box-shadow: inset 0 2px 6px rgba(0,0,0,.15) }
.b5-chave span { position: absolute; top: 4px; left: 4px; width: 38px; height: 38px; border-radius: 50%; background: #fefefe; display: grid; place-items: center; color: var(--c); box-shadow: 0 2px 6px rgba(0,0,0,.25); transition: transform .45s cubic-bezier(.3,1.4,.5,1), color .4s } .b5-chave.dir span { transform: translateX(46px) }
.b6 { display: flex; gap: 4px; padding: 8px 10px 0; border-radius: 14px 14px 0 0; background: linear-gradient(135deg, #38bdf8, #0369a1) }
.b6 button { display: inline-flex; gap: 8px; align-items: center; border: none; background: rgba(255,255,255,.3); color: #111111; border-radius: 11px 11px 0 0; padding: 9px 18px; font-family: inherit; font-size: 13.5px; font-weight: 500; cursor: pointer; transition: background .2s } .b6 button:hover { background: rgba(255,255,255,.5) }
.b6 button.on { background: #fefefe; font-weight: 700; box-shadow: 0 -2px 6px rgba(0,0,0,.15) } .b6 button.on i { color: var(--c) }
.b6-folha { background: #fefefe; border-radius: 0 0 14px 14px; padding: 12px 14px; margin-top: -12px }
.b7 { display: flex; gap: 16px; align-items: flex-end; padding: 10px 18px 8px; border-radius: 22px; background: color-mix(in srgb, var(--portal-bg-card, #fefefe) 80%, transparent); backdrop-filter: blur(10px); box-shadow: 0 8px 24px rgba(15,23,42,.1); width: fit-content }
.b7 button { position: relative; display: grid; justify-items: center; gap: 4px; border: none; background: transparent; font-family: inherit; cursor: pointer }
.b7 button span { width: 50px; height: 50px; border-radius: 16px; display: grid; place-items: center; font-size: 20px; color: #fefefe; background: linear-gradient(140deg, color-mix(in srgb, var(--c) 70%, #fefefe), var(--c)); box-shadow: 0 6px 14px color-mix(in srgb, var(--c) 35%, transparent); transition: transform .3s cubic-bezier(.3,1.5,.5,1) }
.b7 button:hover span { transform: translateY(-8px) scale(1.18) } .b7 button b { font-size: 12px; color: ${MUDO}; transition: color .25s } .b7 button.on b { color: var(--portal-text, #0f172a) }
.b7 button.on::after { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--c) }
`
