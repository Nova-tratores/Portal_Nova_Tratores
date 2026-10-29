'use client'
// Assuntos da Gestão Pós Vendas como abas fechadas (José, 29/10/2026: "esses módulos que a gente tem eu quero deixar
// fechado e não do jeito que está, como se fosse abas" — nos dois lados, Resultados e Equipe). Os cartões ficam
// no topo e só o assunto clicado abre embaixo; a escolha fica guardada no navegador.
// O Tratorilson manda "ir até" uma parte (evento `cpv-ir` com o id): a aba que tem esse id abre sozinha.
import { useEffect, useRef, useState } from 'react'

export interface AbaAssunto { id: string; cor: string; ic: string; titulo: string; sub?: string; alvos?: string[]; n?: number }

export function useAbaAssunto(chave: string, abas: AbaAssunto[]) {
  const [atual, setAtual] = useState<string>(abas[0].id)
  useEffect(() => {
    try {
      const s = localStorage.getItem(`cpv-assunto-${chave}`)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lê a escolha guardada depois de montar (SSR)
      if (s && abas.some((a) => a.id === s)) setAtual(s)
    } catch { /* sem localStorage: fica a primeira */ }
    const ir = (e: Event) => {
      const alvo = String((e as CustomEvent).detail || '')
      const a = abas.find((x) => x.alvos?.includes(alvo))
      if (a) setAtual(a.id)
    }
    window.addEventListener('cpv-ir', ir)
    return () => window.removeEventListener('cpv-ir', ir)
  }, [chave, abas])
  const trocar = (id: string) => {
    setAtual(id)
    try { localStorage.setItem(`cpv-assunto-${chave}`, id) } catch { /* ignora */ }
  }
  return [atual, trocar] as const
}

/** Leva a faixa das abas para logo abaixo do cabeçalho fixo do portal (José, 29/10/2026: "não centraliza direito,
 *  fica muito pra baixo"): mede o que está grudado no topo e rola o contêiner certo (o portal rola por dentro). */
function levarAoTopo(el: HTMLElement) {
  let topoFixo = 0
  for (const y of [2, 30, 60]) {
    for (const x of document.elementsFromPoint(window.innerWidth / 2, y)) {
      const p = getComputedStyle(x).position
      if ((p === 'fixed' || p === 'sticky') && !el.contains(x)) topoFixo = Math.max(topoFixo, x.getBoundingClientRect().bottom)
    }
  }
  topoFixo = Math.min(topoFixo, window.innerHeight / 3)
  let pai: HTMLElement | null = el.parentElement
  while (pai && !(/(auto|scroll)/.test(getComputedStyle(pai).overflowY) && pai.scrollHeight > pai.clientHeight)) pai = pai.parentElement
  const dif = el.getBoundingClientRect().top - Math.max(topoFixo, pai ? pai.getBoundingClientRect().top : 0) - 10
  if (pai) pai.scrollBy({ top: dif, behavior: 'smooth' })
  else window.scrollBy({ top: dif, behavior: 'smooth' })
}

/** Clicar abre o assunto e já leva a tela até ele (José, 29/10/2026: "quando a gente clicar já centralizar nas informações"). */
export function AbasAssuntos({ abas, atual, onTroca }: { abas: AbaAssunto[]; atual: string; onTroca: (id: string) => void }) {
  const raiz = useRef<HTMLDivElement>(null)
  const clicar = (id: string) => {
    onTroca(id)
    setTimeout(() => { if (raiz.current) levarAoTopo(raiz.current) }, 60)
  }
  return (
    <div ref={raiz} className="aa-abas" role="tablist">
      <style>{ESTILO_AA}</style>
      {abas.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={atual === a.id} className={`aa-aba ${atual === a.id ? 'on' : ''}`}
          style={{ '--c': a.cor } as React.CSSProperties} onClick={() => clicar(a.id)} title={a.sub}>
          <em aria-hidden><i className={`fas ${a.ic}`} />{!!a.n && <u>{a.n}</u>}</em>
          <b>{a.titulo}</b>
        </button>
      ))}
    </div>
  )
}

// botões das abas (José, 29/10/2026, 3ª volta: "esses botões estão ruins"): faixa única, todos da mesma altura,
// círculo com o ícone + título; a escolhida fica cheia na cor dela; a frase de cada uma aparece ao passar o mouse
const ESTILO_AA = `
.aa-abas { display: flex; gap: 6px; margin-bottom: 18px; padding: 6px; border-radius: 16px; overflow-x: auto; scrollbar-width: thin; scroll-margin-top: 90px;
  background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); box-shadow: 0 1px 2px rgba(15,23,42,.04) }
.aa-aba { flex: 1 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 10px; height: 46px; padding: 0 16px 0 6px; border-radius: 12px; border: 0;
  background: transparent; color: #334155; font: inherit; white-space: nowrap; cursor: pointer; transition: background .2s, color .2s }
.aa-aba:hover { background: color-mix(in srgb, var(--c) 9%, transparent); color: var(--c) }
.aa-aba em { position: relative; flex-shrink: 0; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 14px;
  background: color-mix(in srgb, var(--c) 13%, transparent); color: var(--c); transition: background .2s, color .2s }
.aa-aba b { font-size: 14.5px; font-weight: 600 }
.aa-aba.on { background: var(--c); color: #fefefe; box-shadow: 0 6px 16px -8px var(--c) }
.aa-aba.on em { background: rgba(255,255,255,.22); color: #fefefe }
.aa-aba em u { position: absolute; top: -5px; right: -7px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 99px; display: grid; place-items: center; text-decoration: none;
  font-size: 11px; font-weight: 700; color: #fefefe; background: #f59e0b; box-shadow: 0 0 0 2px var(--portal-bg-card, #fefefe) }
.aa-conteudo { animation: aaEntra .3s ease both }
@keyframes aaEntra { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@media (max-width: 640px) { .aa-aba { height: 40px; padding-right: 12px } .aa-aba em { width: 30px; height: 30px; font-size: 13px } .aa-aba b { font-size: 13.5px } }
`
