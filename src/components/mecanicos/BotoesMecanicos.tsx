'use client'
// Tribunal de defesas e Ocorrências: dois botões no topo do Centro, ao lado do Pódio, que abrem em JANELA
// (José, 20/10/2026). A janela é desenhada pela aba Mecânicos (RadarOcorrencias), que tem os dados;
// os números dos botões vêm de lá também (ficam guardados aqui depois da 1ª leitura).
import { useSyncExternalStore } from 'react'
import { useAutorizacoes } from './AutorizacoesJanela'
import CaixinhaMec from './CaixinhaMec'

export type ModalMec = 'tribunal' | 'ocorrencias' | 'liga' | 'comissoes' | 'autorizacoes' | null
let estado: { modal: ModalMec; pendentes: number | null; ocorrencias: number | null } = { modal: null, pendentes: null, ocorrencias: null }
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }
export function abrirModalMec(m: ModalMec) { estado = { ...estado, modal: m }; avisar() }
export function contagensMec(pendentes: number, ocorrencias: number) {
  if (estado.pendentes === pendentes && estado.ocorrencias === ocorrencias) return
  estado = { ...estado, pendentes, ocorrencias }; avisar()
}
export function useModalMec() { return useSyncExternalStore(assinar, () => estado, () => estado) }

export default function BotoesMecanicos({ onAbrir, podio, onPodio }: { onAbrir: (m: Exclude<ModalMec, null>) => void; podio: boolean; onPodio: () => void }) {
  const { modal, pendentes, ocorrencias } = useModalMec()
  const abrir = onAbrir
  const au = useAutorizacoes()
  return (
    <div className="bm">
      <style>{ESTILO_BM}</style>
      <button type="button" className={`bm-b pod ${podio ? 'on' : ''}`} onClick={onPodio} title="Pódio de cada mês (abre quando a comissão do mês é fechada no RH)">
        <span className="bm-ic"><i className="fas fa-trophy" /></span>
        <span className="bm-t"><b>Pódio</b><small>vencedor de cada mês</small></span>
      </button>
      <span className="bm-sep" aria-hidden />
      <button type="button" className={`bm-b trib ${modal === 'tribunal' ? 'on' : ''}`} onClick={() => abrir('tribunal')} title="Julgar as defesas dos mecânicos">
        <span className="bm-ic"><i className="fas fa-gavel" /></span>
        <span className="bm-t"><b>Tribunal</b><small>{pendentes == null ? 'defesas dos mecânicos' : pendentes ? `${pendentes} para julgar` : 'nada para julgar'}</small></span>
        {!!pendentes && <span className="bm-n">{pendentes}</span>}
      </button>
      <button type="button" className={`bm-b oc ${modal === 'ocorrencias' ? 'on' : ''}`} onClick={() => abrir('ocorrencias')} title="Linha do tempo, o que mais tira pontos e os últimos meses">
        <span className="bm-ic"><i className="fas fa-clipboard-list" /></span>
        <span className="bm-t"><b>Ocorrências</b><small>{ocorrencias == null ? 'linha do tempo e motivos' : `${ocorrencias} no mês`}</small></span>
      </button>
      <span className="bm-sep" aria-hidden />
      <button type="button" className={`bm-b liga ${modal === 'liga' ? 'on' : ''}`} onClick={() => abrir('liga')} title="Como funciona a liga (Ferro → Diamante)">
        <span className="bm-ic"><i className="fas fa-ranking-star" /></span>
        <span className="bm-t"><b>Liga</b><small>como funciona</small></span>
      </button>
      <button type="button" className={`bm-b com ${modal === 'comissoes' ? 'on' : ''}`} onClick={() => abrir('comissoes')} title="O que paga, o que não paga, as metas e os valores fixos">
        <span className="bm-ic"><i className="fas fa-sack-dollar" /></span>
        <span className="bm-t"><b>Comissões</b><small>regras e valores fixos</small></span>
      </button>
      {(au.diretor || au.abertos.length > 0) && (
        <button type="button" className={`bm-b aut ${modal === 'autorizacoes' ? 'on' : ''}`} onClick={() => abrir('autorizacoes')} title="Comissões esperando a autorização do diretor">
          <span className="bm-ic"><i className="fas fa-signature" /></span>
          <span className="bm-t"><b>Autorizações</b><small>{au.abertos.length ? `${au.abertos.length} para autorizar` : 'nada esperando'}</small></span>
          {au.abertos.length > 0 && <span className="bm-n">{au.abertos.length}</span>}
        </button>
      )}
    </div>
  )
}

/** Atalhos do Centro: uma fileira de ícones simples, com o número de pendentes em cima (José, 28/10/2026: "troca
 *  por um dropdown, ou coloca uns ícones simples ali" — antes era um botão que abria um círculo no meio da tela). */
export function MenuRadialMec({ onAbrir, podio, onPodio, onTratorilson }: { onAbrir: (m: Exclude<ModalMec, null>) => void; podio: boolean; onPodio: () => void; onTratorilson: () => void }) {
  const { modal, pendentes, ocorrencias } = useModalMec()
  const au = useAutorizacoes()
  const itens: { k: string; t: string; sub: string; ic: string; cor: string; n?: number; on: boolean; ir: () => void }[] = [
    { k: 'podio', t: 'Pódio', sub: 'vencedor de cada mês', ic: 'fa-trophy', cor: '#b45309', on: podio, ir: onPodio },
    { k: 'tribunal', t: 'Tribunal', sub: pendentes ? `${pendentes} defesas para julgar` : 'defesas dos mecânicos', ic: 'fa-gavel', cor: '#92400e', n: pendentes || 0, on: modal === 'tribunal', ir: () => onAbrir('tribunal') },
    { k: 'ocorrencias', t: 'Ocorrências', sub: ocorrencias == null ? 'linha do tempo e motivos' : `${ocorrencias} no mês`, ic: 'fa-clipboard-list', cor: '#be123c', on: modal === 'ocorrencias', ir: () => onAbrir('ocorrencias') },
    { k: 'liga', t: 'Liga', sub: 'como funciona', ic: 'fa-ranking-star', cor: '#475569', on: modal === 'liga', ir: () => onAbrir('liga') },
    { k: 'comissoes', t: 'Comissões', sub: 'regras e valores fixos', ic: 'fa-sack-dollar', cor: '#047857', on: modal === 'comissoes', ir: () => onAbrir('comissoes') },
    ...(au.diretor || au.abertos.length > 0 ? [{ k: 'autorizacoes', t: 'Autorizações', sub: au.abertos.length ? `${au.abertos.length} para autorizar` : 'nada esperando', ic: 'fa-signature', cor: '#1d4ed8', n: au.abertos.length, on: modal === 'autorizacoes', ir: () => onAbrir('autorizacoes') }] : []),
    { k: 'tratorilson', t: 'Tratorilson', sub: 'perguntas frequentes', ic: 'fa-robot', cor: '#0369a1', on: false, ir: onTratorilson },
  ]
  return (
    <nav className="mi" aria-label="Atalhos">
      <style>{ESTILO_MR}</style>
      {itens.map((x) => (
        <span key={x.k} style={{ display: 'contents' }}>
        <button type="button" className={`mi-b ${x.on ? 'on' : ''}`} style={{ '--c': x.cor } as React.CSSProperties} onClick={x.ir} aria-label={`${x.t}: ${x.sub}`}>
          <i className={`fas ${x.ic}`} />
          {!!x.n && <em>{x.n}</em>}
          <span className="mi-dica" role="tooltip"><b>{x.t}</b><small>{x.sub}</small></span>
        </button>
        {/* a caixinha dos técnicos logo depois do Tribunal (José, 28/10/2026) */}
        {x.k === 'tribunal' && <CaixinhaMec icone />}
        </span>
      ))}
    </nav>
  )
}

const ESTILO_MR = `
.mi { display: inline-flex; gap: 2px; align-items: center; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 999px; padding: 4px }
.mi-b { position: relative; width: 40px; height: 40px; border-radius: 50%; border: 0; background: transparent; color: #64748b; font-size: 16px; cursor: pointer; display: grid; place-items: center; transition: background .15s, color .15s }
.mi-b:hover, .mi-b:focus-visible { background: color-mix(in srgb, var(--c) 10%, transparent); color: var(--c); outline: none }
.mi-b.on { background: var(--c); color: #fefefe }
.mi-b em { position: absolute; top: -3px; right: -3px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 99px; display: grid; place-items: center; font-style: normal; font-size: 11px; font-weight: 600; color: #fefefe; background: #f59e0b; box-shadow: 0 0 0 2px var(--portal-bg-card, #fefefe) }
.mi-dica { position: absolute; top: calc(100% + 8px); left: 50%; transform: translate(-50%, -4px); z-index: 50; display: grid; gap: 1px; padding: 7px 11px; border-radius: 10px; background: #0f172a; color: #fefefe; white-space: nowrap; text-align: center; pointer-events: none; opacity: 0; transition: opacity .15s, transform .15s }
.mi-dica b { font-size: 13px; font-weight: 600 } .mi-dica small { font-size: 11.5px; color: #cbd5e1 }
.mi-b:hover .mi-dica, .mi-b:focus-visible .mi-dica { opacity: 1; transform: translate(-50%, 0) }
`

const ESTILO_BM = `
.bm { display: flex; gap: 8px }
.bm-b { --cc: #be123c; position: relative; display: inline-flex; gap: 10px; align-items: center; height: 100%; min-height: 56px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #0f172a); border-radius: 999px; padding: 6px 20px 6px 7px; font-family: inherit; text-align: left; cursor: pointer; box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 6px 18px rgba(15,23,42,.05); transition: border-color .2s, box-shadow .2s, transform .15s }
.bm-b.trib { --cc: #92400e } .bm-b.liga { --cc: #475569 } .bm-b.com { --cc: #047857 } .bm-b.aut { --cc: #1d4ed8 } .bm-b.pod { --cc: #b45309 } .bm-b.pod.on { box-shadow: 0 6px 18px rgba(180,83,9,.18) }
.bm-sep { width: 1px; align-self: stretch; margin: 8px 2px; background: var(--portal-border, #e2e8f0) }
.bm-b:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--cc) 40%, transparent); box-shadow: 0 8px 20px rgba(15,23,42,.09) }
.bm-b.on { background: color-mix(in srgb, var(--cc) 8%, #fefefe); border-color: color-mix(in srgb, var(--cc) 45%, transparent) }
.bm-ic { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-size: 16px; color: var(--cc); background: color-mix(in srgb, var(--cc) 11%, transparent); transition: all .2s } .bm-b:hover .bm-ic, .bm-b.on .bm-ic { background: var(--cc); color: #fefefe }
.bm-t { display: grid; line-height: 1.15 } .bm-t b { font-size: 14.5px; font-weight: 900 } .bm-t small { font-size: 11.5px; font-weight: 600; color: var(--portal-text-muted, #64748b); white-space: nowrap }
.bm-n { position: absolute; top: -7px; right: -7px; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 99px; display: grid; place-items: center; font-size: 12px; font-weight: 900; color: #fefefe; background: #f59e0b; box-shadow: 0 0 0 3px var(--portal-bg, #f8fafc) }
@media (max-width: 900px) { .bm-t small { display: none } .bm-b { padding-right: 12px } }
`
