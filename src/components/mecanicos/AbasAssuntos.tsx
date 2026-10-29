'use client'
// Assuntos da Gestão Pós Vendas como abas fechadas (José, 29/10/2026: "esses módulos que a gente tem eu quero deixar
// fechado e não do jeito que está, como se fosse abas" — nos dois lados, Resultados e Equipe). Os cartões ficam
// no topo e só o assunto clicado abre embaixo; a escolha fica guardada no navegador.
// O Tratorilson manda "ir até" uma parte (evento `cpv-ir` com o id): a aba que tem esse id abre sozinha.
import { useEffect, useState } from 'react'

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

export function AbasAssuntos({ abas, atual, onTroca }: { abas: AbaAssunto[]; atual: string; onTroca: (id: string) => void }) {
  return (
    <div className="aa-abas" role="tablist">
      <style>{ESTILO_AA}</style>
      {abas.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={atual === a.id} className={`aa-aba ${atual === a.id ? 'on' : ''}`}
          style={{ '--c': a.cor } as React.CSSProperties} onClick={() => onTroca(a.id)}>
          <em aria-hidden><i className={`fas ${a.ic}`} /></em>
          <span><b>{a.titulo}</b>{a.sub && <small>{a.sub}</small>}</span>
        </button>
      ))}
    </div>
  )
}

const ESTILO_AA = `
.aa-abas { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px; margin-bottom: 16px }
.aa-aba { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; border: 1.5px solid var(--portal-border, #e5e7eb);
  background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #0f172a); font: inherit; text-align: left; cursor: pointer;
  transition: border-color .2s, background .2s, transform .15s, box-shadow .2s }
.aa-aba:hover { border-color: color-mix(in srgb, var(--c) 45%, transparent); transform: translateY(-1px) }
.aa-aba em { flex-shrink: 0; width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; font-style: normal;
  background: color-mix(in srgb, var(--c) 12%, transparent); color: var(--c); font-size: 16px; transition: background .2s, color .2s }
.aa-aba span { display: grid; gap: 2px; min-width: 0 }
.aa-aba b { font-size: 15px; font-weight: 600 }
.aa-aba small { font-size: 12px; color: var(--portal-text-muted, #64748b); line-height: 1.3 }
.aa-aba.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 7%, var(--portal-bg-card, #fefefe)); box-shadow: 0 6px 18px -10px var(--c) }
.aa-aba.on em { background: var(--c); color: #fefefe }
.aa-conteudo { animation: aaEntra .3s ease both }
@keyframes aaEntra { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@media (max-width: 640px) { .aa-abas { grid-template-columns: 1fr 1fr } .aa-aba small { display: none } .aa-aba { padding: 10px } }
`
