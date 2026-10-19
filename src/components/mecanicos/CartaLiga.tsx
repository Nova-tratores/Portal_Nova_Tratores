'use client'
// Carta do técnico estilo Yu-Gi-Oh/Pokémon (José, 17/10/2026): ao clicar num técnico na aba
// Ocorrências, a carta voa para o centro, vira, e a pontuação do mês "cai" de 100 até o saldo com
// os golpes de cada categoria. Moldura e emblema na cor da LIGA (Ferro → Diamante, calculada desde
// a primeira ocorrência do sistema). ‹ › / setas trocam de técnico; Esc fecha.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DIVISOES, DIAMANTE, NIVEL_MAX, patente, type CarreiraTecnico } from '@/lib/mecanicos/carreira'
import type { Cat, LinhaEscudo } from '@/lib/mecanicos/ocorrencias-painel'
import { useContador } from './ui'

const NOME_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesCurto = (m: string) => `${NOME_MES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

export interface DadosCartaLiga { tecnico: string; carreira?: CarreiraTecnico; escudo?: LinhaEscudo }

/** Ícone pequeno da liga (escudo da divisão + subdivisão). */
export function IconeLiga({ nivel, tamanho = 26 }: { nivel: number; tamanho?: number }) {
  const p = patente(nivel)
  return (
    <span title={p.nome} style={{ width: tamanho, height: tamanho * 1.12, background: p.fundo, fontSize: tamanho * 0.36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', clipPath: 'polygon(50% 0, 100% 18%, 100% 62%, 50% 100%, 0 62%, 0 18%)', color: '#fefefe', textShadow: '0 1px 2px rgba(0,0,0,.45)', fontWeight: 900, flexShrink: 0 }}>
      {p.sub == null ? <i className="fas fa-gem" /> : <b>{['', 'I', 'II', 'III', 'IV', 'V'][p.sub]}</b>}
    </span>
  )
}

export default function CartaLiga({ lista, inicio, nomesCat, coresCat, onFechar }: {
  lista: DadosCartaLiga[]; inicio: number; nomesCat: Record<Cat, string>; coresCat: Record<Cat, string>; onFechar: () => void
}) {
  const [i, setI] = useState(inicio)
  const [dir, setDir] = useState(1)
  const ir = (n: number) => { setDir(n); setI((x) => (x + n + lista.length) % lista.length) }
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); else if (e.key === 'ArrowRight') ir(1); else if (e.key === 'ArrowLeft') ir(-1) }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  })
  const d = lista[i]
  if (!d || typeof document === 'undefined') return null
  return createPortal(
    <div className="cl-fundo" onClick={onFechar}>
      <style>{ESTILO}</style>
      <button type="button" className="cl-nav" onClick={(e) => { e.stopPropagation(); ir(-1) }} aria-label="Anterior"><i className="fas fa-chevron-left" /></button>
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
        <Carta key={`${d.tecnico}:${i}`} d={d} dir={dir} nomesCat={nomesCat} coresCat={coresCat} />
        <div className="cl-pos">{lista.map((x, k) => <i key={x.tecnico} className={k === i ? 'on' : ''} onClick={() => { setDir(k > i ? 1 : -1); setI(k) }} />)}</div>
        <div className="cl-teclas">← → troca o técnico · Esc fecha</div>
      </div>
      <button type="button" className="cl-nav" onClick={(e) => { e.stopPropagation(); ir(1) }} aria-label="Próximo"><i className="fas fa-chevron-right" /></button>
    </div>,
    (document.fullscreenElement as HTMLElement | null) || document.body,
  )
}

function Carta({ d, dir, nomesCat, coresCat }: { d: DadosCartaLiga; dir: number; nomesCat: Record<Cat, string>; coresCat: Record<Cat, string> }) {
  const c = d.carreira, e = d.escudo
  const p = patente(c?.nivel ?? 0)
  const saldoAlvo = e ? e.saldo : 100
  // a pontuação "cai" de 100 até o saldo depois que a carta vira
  const [alvo, setAlvo] = useState(100)
  useEffect(() => { const t = setTimeout(() => setAlvo(saldoAlvo), 900); return () => clearTimeout(t) }, [saldoAlvo])
  const pts = useContador(alvo, 1600)
  const golpes = e ? (Object.keys(e.porCategoria) as Cat[]).filter((k) => e.porCategoria[k] > 0) : []
  const estrelas = p.sub == null ? 6 : 6 - p.sub // Ferro 5 = 1 estrela … Ferro 1 = 5
  const carta = useRef<HTMLDivElement>(null)
  const mover = (ev: React.MouseEvent<HTMLDivElement>) => {
    const r = ev.currentTarget.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height
    const el = carta.current; if (!el) return
    el.style.setProperty('--ry', `${(x - 0.5) * 16}deg`); el.style.setProperty('--rx', `${(0.5 - y) * 12}deg`)
    el.style.setProperty('--hx', `${x * 100}%`); el.style.setProperty('--hy', `${y * 100}%`)
  }
  const soltar = () => { const el = carta.current; if (!el) return; el.style.setProperty('--ry', '0deg'); el.style.setProperty('--rx', '0deg') }
  const sobe = c && c.seFecharAssim > c.nivel, cai = c && c.seFecharAssim < c.nivel
  return (
    <div className="cl-palco" onMouseMove={mover} onMouseLeave={soltar}>
      <div className={`cl-voa ${dir < 0 ? 'cl-voa-esq' : ''}`}>
        <div ref={carta} className="cl-carta" style={{ ['--borda' as string]: p.cor, background: p.fundo }}>
          <div className="cl-holo" />
          {/* nome + atributo */}
          <div className="cl-titulo">
            <b>{d.tecnico}</b>
            <span className="cl-atrib" style={{ background: p.fundo }}>{p.sub == null ? <i className="fas fa-gem" /> : <i className="fas fa-shield" />}</span>
          </div>
          {/* estrelas = subdivisão */}
          <div className="cl-estrelas">{Array.from({ length: estrelas }, (_, k) => <i key={k} className="fas fa-star" style={{ animationDelay: `${1000 + k * 120}ms` }} />)}</div>
          {/* arte */}
          <div className="cl-arte">
            <div className="cl-raios" style={{ background: `conic-gradient(from 0deg, transparent, ${p.cor}55, transparent 30%, ${p.cor}55, transparent 60%, ${p.cor}55, transparent)` }} />
            <span className="cl-emb" style={{ background: p.fundo }}>
              <i className={`fas ${p.sub == null ? 'fa-gem' : 'fa-shield-halved'}`} />
              <b>{iniciais(d.tecnico)}</b>
            </span>
            <div className="cl-liga-nome">{p.nome}</div>
          </div>
          {/* tipo */}
          <div className="cl-tipo">[ MECÂNICO / LIGA {p.divisao.toUpperCase()} ]</div>
          {/* texto */}
          <div className="cl-texto">
            {c?.sequencia ? <p><i className="fas fa-fire" style={{ color: '#ea580c' }} /> <b>{c.sequencia}</b> {c.sequencia === 1 ? 'mês limpo' : 'meses limpos'} seguidos.</p> : <p>Na carreira desde {c ? mesCurto(c.inicio) : '—'}. Mês limpo sobe 1 degrau.</p>}
            {golpes.length > 0
              ? <div className="cl-golpes">{golpes.map((k, n) => <span key={k} style={{ background: coresCat[k], animationDelay: `${1100 + n * 220}ms` }}>−{e!.porCategoria[k]} {nomesCat[k]}</span>)}</div>
              : <p style={{ color: '#047857' }}><b>Nenhuma ocorrência neste mês.</b></p>}
            {c && <p className={sobe ? 'cl-ok' : cai ? 'cl-mal' : ''}>{sobe ? <>Se o mês fechar assim, sobe para <b>{patente(c.seFecharAssim).nome}</b>.</> : cai ? <>Se fechar assim, cai para <b>{patente(c.seFecharAssim).nome}</b>.</> : <>Se fechar assim, fica em <b>{patente(c.seFecharAssim).nome}</b>.</>}</p>}
            {c && c.historico.length > 0 && <div className="cl-hist">{c.historico.slice(-8).map((h) => <span key={h.mes} className={h.movimento > 0 ? 'up' : h.movimento < 0 ? 'down' : ''}>{mesCurto(h.mes)} {h.movimento > 0 ? `+${h.movimento}` : h.movimento}</span>)}</div>}
          </div>
          {/* escada da liga */}
          <div className="cl-escada">
            {DIVISOES.map((dv, di) => <div key={dv.nome}>{[0, 1, 2, 3, 4].map((k) => { const n = di * 5 + k; return <i key={k} className={n <= (c?.nivel ?? 0) ? 'on' : ''} style={{ ['--c' as string]: dv.cor, animationDelay: `${800 + n * 40}ms` }} /> })}</div>)}
            <i className={`cl-dia ${(c?.nivel ?? 0) >= NIVEL_MAX ? 'on' : ''}`} style={{ ['--c' as string]: DIAMANTE.cor }} />
          </div>
          {/* atk / def */}
          <div className="cl-rodape">
            <span>PTS/<b className={alvo < 100 && pts > alvo + 0.5 ? 'cl-caindo' : ''}>{Math.round(pts)}</b></span>
            <span>OC/<b>{e?.qtd ?? 0}</b></span>
            <span>NV/<b>{(c?.nivel ?? 0) + 1}</b></span>
          </div>
        </div>
      </div>
    </div>
  )
}

const ESTILO = `
.cl-fundo { position: fixed; inset: 0; z-index: 100065; display: flex; align-items: center; justify-content: center; gap: 22px; background: radial-gradient(circle at 50% 45%, rgba(30,27,75,.6), rgba(2,6,23,.88)); backdrop-filter: blur(5px); animation: clFade .25s both }
@keyframes clFade { from { opacity: 0 } }
.cl-nav { width: 52px; height: 52px; border-radius: 50%; border: none; background: rgba(255,255,255,.14); color: #fefefe; font-size: 20px; cursor: pointer; transition: transform .15s, background .15s } .cl-nav:hover { background: rgba(255,255,255,.28); transform: scale(1.08) }
.cl-pos { display: flex; gap: 6px } .cl-pos i { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,.35); cursor: pointer } .cl-pos i.on { width: 22px; border-radius: 99px; background: #fefefe }
.cl-teclas { font-size: 12px; color: rgba(255,255,255,.65) }
.cl-palco { perspective: 1400px }
.cl-voa { animation: clVoa .9s cubic-bezier(.2,1,.3,1) both } .cl-voa-esq { animation-name: clVoaEsq }
@keyframes clVoa { 0% { opacity: 0; transform: translateX(160px) rotateY(-180deg) scale(.6) } 60% { opacity: 1 } 100% { transform: none } }
@keyframes clVoaEsq { 0% { opacity: 0; transform: translateX(-160px) rotateY(180deg) scale(.6) } 60% { opacity: 1 } 100% { transform: none } }
.cl-carta { --rx: 0deg; --ry: 0deg; --hx: 50%; --hy: 50%; position: relative; width: 340px; padding: 12px; border-radius: 16px; border: 6px solid var(--borda); box-shadow: 0 0 0 3px #1e1b18, 0 0 0 6px #d4af37, 0 30px 80px rgba(0,0,0,.55), 0 0 70px var(--borda); transform: rotateX(var(--rx)) rotateY(var(--ry)); transition: transform .08s linear; display: grid; gap: 7px; overflow: hidden; color: #0f172a }
.cl-holo { position: absolute; inset: 0; pointer-events: none; mix-blend-mode: color-dodge; opacity: .5; z-index: 2; background: radial-gradient(circle at var(--hx) var(--hy), rgba(255,255,255,.85), transparent 35%), conic-gradient(from 0deg at var(--hx) var(--hy), rgba(255,0,128,.25), rgba(0,200,255,.25), rgba(140,255,0,.25), rgba(255,200,0,.25), rgba(255,0,128,.25)) }
.cl-titulo { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: linear-gradient(180deg, #fefefe, #e7e5e4); border: 2px solid #1e1b18; border-radius: 6px; padding: 6px 10px; font-family: Georgia, 'Times New Roman', serif }
.cl-titulo b { font-size: 19px; font-weight: 900; letter-spacing: .3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.cl-atrib { width: 30px; height: 30px; border-radius: 50%; border: 2px solid #1e1b18; display: flex; align-items: center; justify-content: center; color: #fefefe; text-shadow: 0 1px 2px rgba(0,0,0,.4); flex-shrink: 0 }
.cl-estrelas { display: flex; justify-content: flex-end; gap: 3px; min-height: 18px } .cl-estrelas i { color: #f59e0b; text-shadow: 0 0 6px rgba(245,158,11,.8), 0 1px 0 #7c2d12; font-size: 15px; animation: clEstrela .5s cubic-bezier(.2,1.8,.4,1) both }
@keyframes clEstrela { from { transform: scale(0) rotate(-120deg); opacity: 0 } }
.cl-arte { position: relative; height: 190px; border: 3px solid #1e1b18; border-radius: 4px; background: radial-gradient(circle at 50% 40%, #1e293b, #020617); overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px }
.cl-raios { position: absolute; inset: -60%; animation: clGira 12s linear infinite } @keyframes clGira { to { transform: rotate(360deg) } }
.cl-emb { position: relative; width: 96px; height: 108px; clip-path: polygon(50% 0, 100% 18%, 100% 62%, 50% 100%, 0 62%, 0 18%); display: flex; flex-direction: column; align-items: center; justify-content: center; color: rgba(255,255,255,.95); text-shadow: 0 2px 4px rgba(0,0,0,.45); animation: clEmb 1s .5s cubic-bezier(.2,1.6,.4,1) both }
.cl-emb i { font-size: 30px } .cl-emb b { font-size: 20px; font-weight: 900; margin-top: 2px }
@keyframes clEmb { from { transform: scale(.2) rotate(-30deg); opacity: 0 } }
.cl-liga-nome { position: relative; font-size: 15px; font-weight: 900; color: #fefefe; text-transform: uppercase; letter-spacing: 2px; text-shadow: 0 0 12px rgba(255,255,255,.6) }
.cl-tipo { font-family: Georgia, serif; font-size: 12.5px; font-weight: 900; color: #1e1b18; padding: 0 4px }
.cl-texto { background: rgba(254,252,232,.95); border: 2px solid #1e1b18; border-radius: 4px; padding: 8px 10px; font-size: 12.5px; line-height: 1.4; display: grid; gap: 5px; min-height: 92px }
.cl-texto p { margin: 0 } .cl-ok { color: #047857 } .cl-mal { color: #b91c1c }
.cl-golpes { display: flex; flex-wrap: wrap; gap: 4px } .cl-golpes span { color: #fefefe; font-weight: 900; font-size: 11.5px; border-radius: 6px; padding: 2px 7px; animation: clGolpe .5s cubic-bezier(.2,1.6,.4,1) both }
@keyframes clGolpe { 0% { transform: scale(2.4) rotate(8deg); opacity: 0 } 60% { opacity: 1 } }
.cl-hist { display: flex; flex-wrap: wrap; gap: 3px } .cl-hist span { font-size: 10.5px; font-weight: 800; border-radius: 99px; padding: 1px 6px; background: #e7e5e4 } .cl-hist .up { background: #d1fae5; color: #047857 } .cl-hist .down { background: #fee2e2; color: #b91c1c }
.cl-escada { display: flex; gap: 3px; align-items: center } .cl-escada > div { flex: 1; display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px }
.cl-escada i { display: block; height: 7px; border-radius: 2px; background: rgba(15,23,42,.18) } .cl-escada i.on { background: var(--c); animation: clAcende .35s both } .cl-dia { width: 10px; height: 10px !important; transform: rotate(45deg) } .cl-dia.on { background: linear-gradient(135deg, #22d3ee, #a78bfa) !important }
@keyframes clAcende { from { transform: scaleX(0) } }
.cl-rodape { display: flex; justify-content: flex-end; gap: 14px; font-family: Georgia, serif; font-size: 14px; font-weight: 900; border-top: 2px solid #1e1b18; padding-top: 5px }
.cl-rodape b { font-variant-numeric: tabular-nums; font-size: 17px }
.cl-caindo { color: #dc2626; animation: clTreme .12s linear infinite } @keyframes clTreme { 50% { transform: translateX(1px) } }
.cl-mini { display: inline-flex; align-items: center; justify-content: center; clip-path: polygon(50% 0, 100% 18%, 100% 62%, 50% 100%, 0 62%, 0 18%); color: #fefefe; text-shadow: 0 1px 2px rgba(0,0,0,.45); font-weight: 900; flex-shrink: 0 }
@media (max-width: 600px) { .cl-carta { width: 290px } .cl-nav { position: absolute; bottom: 18px } .cl-nav:first-of-type { left: 18px } .cl-nav:last-of-type { right: 18px } }
@media (prefers-reduced-motion: reduce) { .cl-voa, .cl-emb, .cl-raios, .cl-estrelas i, .cl-golpes span, .cl-escada i { animation: none !important } }
`
