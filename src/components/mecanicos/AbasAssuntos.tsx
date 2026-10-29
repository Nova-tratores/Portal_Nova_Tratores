'use client'
// Assuntos da Gestão Pós Vendas como abas fechadas (José, 29/10/2026: "esses módulos que a gente tem eu quero deixar
// fechado e não do jeito que está, como se fosse abas" — nos dois lados, Resultados e Equipe). Os cartões ficam
// no topo e só o assunto clicado abre embaixo; a escolha fica guardada no navegador.
// O Tratorilson manda "ir até" uma parte (evento `cpv-ir` com o id): a aba que tem esse id abre sozinha.
import { useEffect, useRef, useState } from 'react'

export interface AbaAssunto { id: string; cor: string; ic: string; titulo: string; sub?: string; alvos?: string[] }

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

/** Clicar abre o assunto e já leva a tela até ele (José, 29/10/2026: "quando a gente clicar já centralizar nas informações"). */
export function AbasAssuntos({ abas, atual, onTroca }: { abas: AbaAssunto[]; atual: string; onTroca: (id: string) => void }) {
  const raiz = useRef<HTMLDivElement>(null)
  const clicar = (id: string) => {
    onTroca(id)
    setTimeout(() => raiz.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }
  return (
    <div ref={raiz} className="aa-abas" role="tablist">
      <style>{ESTILO_AA}</style>
      {abas.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={atual === a.id} className={`aa-aba ${atual === a.id ? 'on' : ''}`}
          style={{ '--c': a.cor } as React.CSSProperties} onClick={() => clicar(a.id)}>
          <em aria-hidden><i className={`fas ${a.ic}`} /></em>
          <span><b>{a.titulo}</b>{a.sub && <small>{a.sub}</small>}</span>
        </button>
      ))}
    </div>
  )
}

// círculo com o ícone e a frase do lado (José, 29/10/2026), sem caixa em volta
const ESTILO_AA = `
.aa-abas { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 28px; margin-bottom: 18px; padding: 6px 0; scroll-margin-top: 90px }
.aa-aba { display: flex; align-items: center; gap: 12px; padding: 6px 16px 6px 6px; border-radius: 99px; border: 0; background: transparent;
  color: var(--portal-text, #0f172a); font: inherit; text-align: left; cursor: pointer; transition: background .2s, transform .15s }
.aa-aba:hover { background: color-mix(in srgb, var(--c) 8%, transparent) }
.aa-aba em { flex-shrink: 0; width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; font-style: normal;
  background: color-mix(in srgb, var(--c) 13%, transparent); color: var(--c); font-size: 18px; transition: background .25s, color .25s, transform .25s, box-shadow .25s }
.aa-aba span { display: grid; gap: 1px; min-width: 0 }
.aa-aba b { font-size: 15px; font-weight: 500 }
.aa-aba small { font-size: 12px; color: var(--portal-text-muted, #64748b); line-height: 1.3 }
.aa-aba.on { background: color-mix(in srgb, var(--c) 10%, transparent) }
.aa-aba.on b { font-weight: 700; color: var(--c) }
.aa-aba.on em { background: var(--c); color: #fefefe; transform: scale(1.06); box-shadow: 0 6px 16px -6px var(--c) }
.aa-conteudo { animation: aaEntra .3s ease both }
@keyframes aaEntra { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@media (max-width: 640px) { .aa-abas { gap: 6px; justify-content: flex-start } .aa-aba small { display: none } .aa-aba em { width: 38px; height: 38px; font-size: 15px } }
`
