'use client'
// Tribunal de defesas e Ocorrências: dois botões no topo do Centro, ao lado do Pódio, que abrem em JANELA
// (José, 20/10/2026). A janela é desenhada pela aba Mecânicos (RadarOcorrencias), que tem os dados;
// os números dos botões vêm de lá também (ficam guardados aqui depois da 1ª leitura).
import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useAutorizacoes } from './AutorizacoesJanela'

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

/** Os atalhos num botão só que abre um CÍRCULO no centro da tela, com o fundo desfocado e o Tratorilson no meio
 *  (José, 21/10/2026: "junta esses botões em um ícone e quando clica abre um círculo com esses botões, inclusive o
 *  do Tratorilson no centro da tela, e borra o fundo"). */
export function MenuRadialMec({ onAbrir, podio, onPodio, onTratorilson }: { onAbrir: (m: Exclude<ModalMec, null>) => void; podio: boolean; onPodio: () => void; onTratorilson: () => void }) {
  const { modal, pendentes, ocorrencias } = useModalMec()
  const au = useAutorizacoes()
  const [aberto, setAberto] = useState(false)
  useEffect(() => {
    if (!aberto) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aberto])
  const itens: { k: string; t: string; sub: string; ic: string; cor: string; n?: number; on: boolean; ir: () => void }[] = [
    { k: 'podio', t: 'Pódio', sub: 'vencedor de cada mês', ic: 'fa-trophy', cor: '#b45309', on: podio, ir: onPodio },
    { k: 'tribunal', t: 'Tribunal', sub: pendentes ? `${pendentes} para julgar` : 'defesas dos mecânicos', ic: 'fa-gavel', cor: '#92400e', n: pendentes || 0, on: modal === 'tribunal', ir: () => onAbrir('tribunal') },
    { k: 'ocorrencias', t: 'Ocorrências', sub: ocorrencias == null ? 'linha do tempo e motivos' : `${ocorrencias} no mês`, ic: 'fa-clipboard-list', cor: '#be123c', on: modal === 'ocorrencias', ir: () => onAbrir('ocorrencias') },
    { k: 'liga', t: 'Liga', sub: 'como funciona', ic: 'fa-ranking-star', cor: '#475569', on: modal === 'liga', ir: () => onAbrir('liga') },
    { k: 'comissoes', t: 'Comissões', sub: 'regras e valores fixos', ic: 'fa-sack-dollar', cor: '#047857', on: modal === 'comissoes', ir: () => onAbrir('comissoes') },
    ...(au.diretor || au.abertos.length > 0 ? [{ k: 'autorizacoes', t: 'Autorizações', sub: au.abertos.length ? `${au.abertos.length} para autorizar` : 'nada esperando', ic: 'fa-signature', cor: '#1d4ed8', n: au.abertos.length, on: modal === 'autorizacoes', ir: () => onAbrir('autorizacoes') }] : []),
  ]
  const avisos = itens.reduce((s, x) => s + (x.n || 0), 0)
  const R = 190
  const ir = (f: () => void) => { setAberto(false); f() }
  return (
    <>
      <style>{ESTILO_MR}</style>
      <button type="button" className={`mr-bt ${aberto ? 'on' : ''}`} onClick={() => setAberto(true)} title="Pódio, Tribunal, Ocorrências, Liga, Comissões e o Tratorilson">
        <span className="mr-bt-ic"><i className="fas fa-circle-nodes" /></span>
        <span className="mr-bt-t"><b>Atalhos</b><small>pódio, tribunal, ocorrências e Tratorilson</small></span>
        {avisos > 0 && <span className="mr-n">{avisos}</span>}
      </button>
      {aberto && typeof document !== 'undefined' && createPortal(
        <div className="mr-fundo" role="dialog" aria-modal="true" aria-label="Atalhos" onClick={() => setAberto(false)}>
          <div className="mr-roda" onClick={(e) => e.stopPropagation()}>
            <span className="mr-aro" aria-hidden />
            {itens.map((x, i) => {
              const a = (-90 + (i * 360) / itens.length) * (Math.PI / 180)
              return (
                <button key={x.k} type="button" className={`mr-i ${x.on ? 'on' : ''}`} style={{ '--c': x.cor, '--x': `${Math.cos(a) * R}px`, '--y': `${Math.sin(a) * R}px`, animationDelay: `${60 + i * 45}ms` } as React.CSSProperties} onClick={() => ir(x.ir)}>
                  <span className="mr-i-ic"><i className={`fas ${x.ic}`} />{!!x.n && <em>{x.n}</em>}</span>
                  <b>{x.t}</b><small>{x.sub}</small>
                </button>
              )
            })}
            <button type="button" className="mr-centro" onClick={() => ir(onTratorilson)}>
              <span><i className="fas fa-robot" /></span>
              <b>Tratorilson</b><small>perguntas frequentes</small>
            </button>
          </div>
          <button type="button" className="mr-x" onClick={() => setAberto(false)} aria-label="fechar">×</button>
        </div>,
        document.body,
      )}
    </>
  )
}

const ESTILO_MR = `
.mr-bt { position: relative; display: inline-flex; gap: 10px; align-items: center; min-height: 56px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #0f172a); border-radius: 999px; padding: 6px 20px 6px 7px; font-family: inherit; text-align: left; cursor: pointer; box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 6px 18px rgba(15,23,42,.05); transition: transform .15s, box-shadow .2s, border-color .2s }
.mr-bt:hover, .mr-bt.on { transform: translateY(-1px); border-color: #93c5fd; box-shadow: 0 8px 20px rgba(15,23,42,.09) }
.mr-bt-ic { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-size: 17px; color: #fefefe; background: linear-gradient(135deg, #2563eb, #7c3aed) }
.mr-bt-t { display: grid; line-height: 1.15 } .mr-bt-t b { font-size: 15px; font-weight: 600 } .mr-bt-t small { font-size: 12px; color: var(--portal-text-muted, #64748b); white-space: nowrap }
.mr-n { position: absolute; top: -7px; right: -7px; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 99px; display: grid; place-items: center; font-size: 12px; font-weight: 700; color: #fefefe; background: #f59e0b; box-shadow: 0 0 0 3px var(--portal-bg, #f8fafc) }
.mr-fundo { position: fixed; inset: 0; z-index: 9800; display: grid; place-items: center; background: rgba(15,23,42,.38); backdrop-filter: blur(9px); -webkit-backdrop-filter: blur(9px); animation: mrFundo .25s both }
.mr-roda { position: relative; width: 520px; height: 520px; max-width: 96vw; max-height: 96vw }
.mr-aro { position: absolute; inset: 70px; border-radius: 50%; border: 1.5px dashed rgba(255,255,255,.35); animation: mrGira 40s linear infinite }
.mr-i { position: absolute; left: 50%; top: 50%; width: 132px; display: grid; justify-items: center; gap: 2px; border: 0; background: transparent; font-family: inherit; color: #fefefe; cursor: pointer; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))); animation: mrSai .45s cubic-bezier(.2,.9,.3,1.25) both }
.mr-i-ic { position: relative; width: 74px; height: 74px; border-radius: 50%; display: grid; place-items: center; font-size: 26px; color: var(--c); background: #fefefe; box-shadow: 0 12px 30px -10px rgba(0,0,0,.45); transition: transform .2s, background .2s, color .2s }
.mr-i:hover .mr-i-ic, .mr-i:focus-visible .mr-i-ic { transform: scale(1.1); background: var(--c); color: #fefefe }
.mr-i.on .mr-i-ic { box-shadow: 0 0 0 4px var(--c), 0 12px 30px -10px rgba(0,0,0,.45) }
.mr-i-ic em { position: absolute; top: -4px; right: -4px; min-width: 24px; height: 24px; padding: 0 6px; border-radius: 99px; display: grid; place-items: center; font-style: normal; font-size: 12.5px; font-weight: 700; color: #fefefe; background: #f59e0b; box-shadow: 0 0 0 3px #fefefe }
.mr-i b { margin-top: 6px; font-size: 15px; font-weight: 600; text-shadow: 0 1px 6px rgba(0,0,0,.4) } .mr-i small { font-size: 12px; opacity: .9; text-align: center; text-shadow: 0 1px 6px rgba(0,0,0,.4) }
.mr-centro { position: absolute; left: 50%; top: 50%; width: 170px; height: 170px; transform: translate(-50%, -50%); border-radius: 50%; border: 0; display: grid; place-content: center; justify-items: center; gap: 2px; font-family: inherit; color: #fefefe; cursor: pointer; background: radial-gradient(circle at 30% 25%, #38bdf8, #0369a1 70%); box-shadow: 0 0 0 10px rgba(255,255,255,.12), 0 20px 50px -12px rgba(3,105,161,.8); animation: mrCentro .4s cubic-bezier(.2,.9,.3,1.25) both; transition: transform .2s }
.mr-centro:hover { transform: translate(-50%, -50%) scale(1.05) }
.mr-centro span { font-size: 40px; animation: mrFlutua 3s ease-in-out infinite } .mr-centro b { font-size: 17px; font-weight: 600 } .mr-centro small { font-size: 12.5px; opacity: .9 }
.mr-x { position: fixed; top: 22px; right: 26px; width: 46px; height: 46px; border-radius: 50%; border: 1px solid rgba(255,255,255,.4); background: rgba(255,255,255,.12); color: #fefefe; font-size: 26px; line-height: 1; cursor: pointer }
@keyframes mrFundo { from { opacity: 0 } }
@keyframes mrSai { from { opacity: 0; transform: translate(-50%, -50%) scale(.3) } }
@keyframes mrCentro { from { opacity: 0; transform: translate(-50%, -50%) scale(.5) } }
@keyframes mrGira { to { transform: rotate(360deg) } }
@keyframes mrFlutua { 50% { transform: translateY(-4px) } }
@media (max-width: 600px) { .mr-roda { transform: scale(.72) } .mr-bt-t small { display: none } }
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
