'use client'
// Aba Ocorrências → COMISSÕES em cartões (José, 17/10/2026): foto do técnico, liga, a previsão do
// mês subindo animada, de onde vem (garantido · a caminho · projeção) contra o mês passado, e o
// caminho até o dinheiro cair (fecha o mês → RH aprova → pago ~dia 20). Clique vira o cartão.
// Regras em lib/mecanicos/comissao.ts; dados em /api/mecanicos/carreira (useCarreira).
import { useState } from 'react'
import { useCarreira } from './useCarreira'
import { IconeLiga } from './CartaLiga'
import { patente } from '@/lib/mecanicos/carreira'
import type { ComissaoTecnico } from '@/lib/mecanicos/carreira-server'
import { brl, Numero } from './ui'

const MUDO = 'var(--portal-text-muted, #64748b)'
const NOME_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesCurto = (m: string) => `${NOME_MES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`
const dataBR = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const STATUS: Record<string, string> = { rascunho: 'rascunho', pendente_aprovacao: 'aguardando aprovação', aprovada: 'aprovada', lancada_omie: 'lançada no Omie', paga: 'paga' }

function Foto({ nome, url, nivel }: { nome: string; url?: string; nivel?: number }) {
  const [erro, setErro] = useState(false)
  const p = nivel != null ? patente(nivel) : null
  return (
    <span className="cm-foto" style={{ background: p?.fundo || 'linear-gradient(135deg, #0f172a, #334155)' }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto do storage do portal, já pequena */}
      {url && !erro ? <img src={url} alt={nome} onError={() => setErro(true)} /> : <b>{iniciais(nome)}</b>}
      {nivel != null && <span className="cm-liga"><IconeLiga nivel={nivel} tamanho={26} /></span>}
    </span>
  )
}

function Cartao({ c, i, mesAtual, mesAnt, foto, nivel, pontos, onCarta }: { c: ComissaoTecnico; i: number; mesAtual: string; mesAnt: string; foto?: string; nivel?: number; pontos?: PontosCartao; onCarta?: () => void }) {
  const [virado, setVirado] = useState(false)
  const antes = c.anterior.rh?.valor ?? c.anterior.total
  const alvo = Math.max(c.atual.projecao, c.atual.total + c.atual.aguardando)
  const escala = Math.max(1, alvo, antes) * 1.08
  const pct = (v: number) => `${Math.max(0, (v / escala) * 100)}%`
  const projExtra = Math.max(0, c.atual.projecao - c.atual.total - c.atual.aguardando)
  const dif = antes ? Math.round(((c.atual.projecao - antes) / antes) * 100) : null
  const rhAtual = c.atual.rh
  const passos = [
    { rot: `fecha ${mesCurto(mesAtual)}`, feito: false, sub: 'OS faturadas no mês' },
    { rot: 'RH aprova', feito: !!rhAtual && ['aprovada', 'lancada_omie', 'paga'].includes(rhAtual.status), sub: rhAtual ? STATUS[rhAtual.status] || rhAtual.status : 'ainda não lançada' },
    { rot: `pago ~${dataBR(c.atual.pagamento)}`, feito: rhAtual?.status === 'paga', sub: 'pelo Omie' },
  ]
  const mover = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 10}deg`)
    e.currentTarget.style.setProperty('--rx', `${(0.5 - (e.clientY - r.top) / r.height) * 8}deg`)
    e.currentTarget.style.setProperty('--gx', `${((e.clientX - r.left) / r.width) * 100}%`)
  }
  const soltar = (e: React.MouseEvent<HTMLDivElement>) => { e.currentTarget.style.setProperty('--ry', '0deg'); e.currentTarget.style.setProperty('--rx', '0deg') }
  return (
    <div className="cm-palco" style={{ animationDelay: `${i * 90}ms` }} onMouseMove={mover} onMouseLeave={soltar}>
      <div className={`cm-carta ${virado ? 'cm-virada' : ''}`} onClick={() => setVirado((v) => !v)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setVirado((v) => !v) }}>
        {/* frente */}
        <div className="cm-face cm-frente">
          <div className="cm-brilho" />
          <div className="cm-topo">
            <Foto nome={c.tecnico} url={foto} nivel={nivel} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <b className="cm-nome">{c.tecnico}</b>
              <span className="cm-sub">{nivel != null ? `${patente(nivel).nome} · ` : ''}{c.pct}% sobre as horas</span>
            </div>
            {dif != null && <span className={`cm-dif ${dif >= 0 ? 'up' : 'down'}`}>{dif >= 0 ? '▲' : '▼'} {Math.abs(dif)}%<small>vs {mesCurto(mesAnt)}</small></span>}
          </div>
          {pontos && (() => {
            const cor = pontos.saldo >= 90 ? '#047857' : pontos.saldo >= 70 ? '#d97706' : '#dc2626'
            const C = 2 * Math.PI * 17
            return (
              <div className="cm-pts" style={{ '--c': cor } as React.CSSProperties}>
                <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="17" className="f" /><circle cx="22" cy="22" r="17" className="v" style={{ strokeDasharray: `${(Math.max(0, Math.min(100, pontos.saldo)) / 100) * C} ${C}` }} /><text x="22" y="26.5" textAnchor="middle">{Math.round(pontos.saldo)}</text></svg>
                <div><b>{Math.round(pontos.saldo)} pontos no mês</b><small>{pontos.qtd ? `${pontos.qtd} ocorrência${pontos.qtd > 1 ? 's' : ''} · −${Math.round(pontos.descontado)}` : 'sem ocorrências'}{pontos.pendentes ? <em> · {pontos.pendentes} defesa(s) para julgar</em> : null}</small></div>
                {onCarta && <button type="button" onClick={(e) => { e.stopPropagation(); onCarta() }} title="Ver a carta do técnico"><i className="fas fa-id-badge" /> carta</button>}
              </div>
            )
          })()}
          <div className="cm-valor">
            <small>Previsão de {mesCurto(mesAtual)}</small>
            <b><Numero valor={c.atual.projecao} formato={brl} /></b>
            <span>recebe por volta de <b>{dataBR(c.atual.pagamento)}</b></span>
          </div>
          {/* barra empilhada: garantido + a caminho + projeção, com o marcador do mês passado */}
          <div className="cm-pilha">
            <div className="cm-trilho">
              <i className="g" style={{ width: pct(c.atual.total) }} title={`Garantido: ${brl(c.atual.total)}`} />
              <i className="a" style={{ width: pct(c.atual.aguardando) }} title={`A caminho: ${brl(c.atual.aguardando)}`} />
              <i className="p" style={{ width: pct(projExtra) }} title={`Projeção até o fim do mês: +${brl(projExtra)}`} />
              {antes > 0 && <span className="cm-marca" style={{ left: pct(antes) }} title={`${mesCurto(mesAnt)}: ${brl(antes)}`}><em>{mesCurto(mesAnt)}</em></span>}
            </div>
            <div className="cm-leg">
              <span><i className="g" /> Garantido <b>{brl(c.atual.total)}</b></span>
              <span><i className="a" /> A caminho <b>{brl(c.atual.aguardando)}</b></span>
              <span><i className="p" /> Projeção <b>+{brl(projExtra)}</b></span>
            </div>
          </div>
          <div className="cm-rodape"><span>{mesCurto(mesAnt)}: <b>{brl(antes)}</b> {c.anterior.rh ? `(RH, ${STATUS[c.anterior.rh.status] || c.anterior.rh.status})` : '(calculado)'}</span><span className="cm-virar"><i className="fas fa-rotate" /> detalhes</span></div>
        </div>
        {/* verso */}
        <div className="cm-face cm-verso">
          <div className="cm-v-cab"><b>{c.tecnico}</b><span>como chega a {brl(c.atual.projecao)}</span></div>
          <div className="cm-v-lin"><span>OS faturadas ({Math.round(c.atual.qtdOS * 10) / 10})</span><b>{brl(c.atual.faturadas)}</b></div>
          <div className="cm-v-lin"><span>OS internas / entrega técnica</span><b>{brl(c.atual.internas)}</b></div>
          <div className="cm-v-lin"><span>Preenchidas esperando faturar</span><b>{brl(c.atual.aguardando)}</b></div>
          <div className="cm-v-lin"><span>Ritmo até o fim do mês</span><b>+{brl(projExtra)}</b></div>
          <div className="cm-passos">
            {passos.map((p, k) => (
              <div key={k} className={p.feito ? 'ok' : ''}>
                <i>{p.feito ? <span className="fas fa-check" /> : k + 1}</i>
                <b>{p.rot}</b>
                <small>{p.sub}</small>
              </div>
            ))}
          </div>
          <small style={{ color: MUDO }}>Previsão pela regra do painel do Omie: {c.pct}% sobre o valor das horas, valor fixo em entrega técnica e montagem. O valor oficial é o do RH.</small>
        </div>
      </div>
    </div>
  )
}

/** Pontuação do mês de cada técnico (vem de Ocorrências) para aparecer no próprio cartão (José 19/10). */
export type PontosCartao = { saldo: number; qtd: number; pendentes: number; descontado: number }

export default function CarreiraComissoes({ pontos, onCarta }: { pontos?: Record<string, PontosCartao>; onCarta?: (tecnico: string) => void } = {}) {
  const { dados: d, erro } = useCarreira()
  if (erro) return <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c' }}>{erro}</div>
  if (!d) return <div className="cm-caixa" style={{ color: MUDO, textAlign: 'center' }}><style>{ESTILO}</style><i className="fas fa-circle-notch fa-spin" /> calculando as comissões…</div>
  const [ano, mm] = d.mesAtual.split('-').map(Number)
  const mesAnt = mm === 1 ? `${ano - 1}-12` : `${ano}-${String(mm - 1).padStart(2, '0')}`
  const total = d.comissoes.reduce((a, c) => a + c.atual.projecao, 0)
  const totalAnt = d.comissoes.reduce((a, c) => a + (c.anterior.rh?.valor ?? c.anterior.total), 0)
  return (
    <section className="cm-caixa cpv-entra">
      <style>{ESTILO}</style>
      <div className="cm-cab">
        <div>
          <div className="cm-rot"><i className="fas fa-sack-dollar" /> Comissões</div>
          <div className="cm-frase">Previsão de {mesCurto(d.mesAtual)}: <b><Numero valor={total} formato={brl} /></b> para a equipe <span style={{ color: MUDO }}>· {mesCurto(mesAnt)}: {brl(totalAnt)}</span></div>
        </div>
        <span className="cm-dica"><i className="fas fa-hand-pointer" /> clique no cartão para ver como chega no valor</span>
      </div>
      <div className="cm-grade">
        {d.comissoes.map((c, i) => <Cartao key={c.tecnico} c={c} i={i} mesAtual={d.mesAtual} mesAnt={mesAnt} foto={d.fotos?.[c.tecnico]} nivel={d.carreira.find((x) => x.tecnico === c.tecnico)?.nivel} pontos={pontos?.[c.tecnico]} onCarta={onCarta ? () => onCarta(c.tecnico) : undefined} />)}
        {!d.comissoes.length && <small style={{ color: MUDO }}>Nenhum técnico com % de comissão cadastrado.</small>}
      </div>
    </section>
  )
}

const ESTILO = `
.cm-pts { display: flex; gap: 10px; align-items: center; border-radius: 12px; padding: 6px 10px; margin: 2px 0 6px; background: color-mix(in srgb, var(--c) 8%, var(--portal-bg-card, #fefefe)) }
.cm-pts svg { width: 44px; height: 44px; flex-shrink: 0 } .cm-pts circle { fill: none; stroke-width: 5 } .cm-pts .f { stroke: color-mix(in srgb, var(--c) 18%, transparent) } .cm-pts .v { stroke: var(--c); stroke-linecap: round; transform: rotate(-90deg); transform-origin: 22px 22px; animation: cmPts 1.1s cubic-bezier(.2,.8,.2,1) both } @keyframes cmPts { from { stroke-dasharray: 0 107 } }
.cm-pts text { font-size: 13px; font-weight: 900; fill: var(--c) } .cm-pts > div { flex: 1; min-width: 0; display: grid } .cm-pts b { font-size: 13.5px; color: var(--c) } .cm-pts small { font-size: 11.5px; color: var(--portal-text-muted, #64748b) } .cm-pts em { font-style: normal; color: #b45309; font-weight: 800 }
.cm-pts button { border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); background: var(--portal-bg-card, #fefefe); color: var(--c); border-radius: 99px; padding: 4px 10px; font-family: inherit; font-size: 12px; font-weight: 800; cursor: pointer; white-space: nowrap } .cm-pts button:hover { background: var(--c); color: #fefefe }
.cm-caixa { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 18px 20px; box-shadow: 0 1px 3px rgba(15,23,42,.05) }
.cm-cab { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 14px }
.cm-rot { font-size: 12.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .6px; color: ${MUDO} } .cm-rot i { color: #059669; margin-right: 4px }
.cm-frase { font-size: 21px; font-weight: 800; color: var(--portal-text, #0f172a) } .cm-frase > b { color: #047857 } .cm-frase span { font-size: 14px; font-weight: 700 }
.cm-dica { font-size: 12px; color: ${MUDO} }
.cm-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(290px, 1fr)); gap: 14px }
.cm-palco { perspective: 1200px; animation: cmEntra .7s cubic-bezier(.2,1.1,.3,1) both }
@keyframes cmEntra { from { opacity: 0; transform: translateY(26px) rotateX(18deg) } to { opacity: 1; transform: none } }
.cm-palco { --rx: 0deg; --ry: 0deg; --gx: 50% }
.cm-carta { position: relative; height: 330px; transform-style: preserve-3d; transform: rotateX(var(--rx)) rotateY(var(--ry)); transition: transform .6s cubic-bezier(.2,.8,.2,1); cursor: pointer; outline: none }
.cm-palco:hover .cm-carta { transition: transform .1s linear }
.cm-carta.cm-virada { transform: rotateY(180deg) }
.cm-face { position: absolute; inset: 0; border-radius: 18px; backface-visibility: hidden; -webkit-backface-visibility: hidden; overflow: hidden; padding: 16px; display: flex; flex-direction: column; gap: 12px; border: 1px solid var(--portal-border, #e5e7eb); box-shadow: 0 6px 20px rgba(15,23,42,.08) }
.cm-frente { background: radial-gradient(120% 70% at 0% 0%, rgba(16,185,129,.16), transparent 60%), radial-gradient(90% 60% at 100% 100%, rgba(59,130,246,.10), transparent 60%), var(--portal-bg-card, #fefefe) }
.cm-brilho { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,.55) 48%, transparent 60%); background-size: 260% 100%; background-position: var(--gx) 0; opacity: 0; transition: opacity .2s }
.cm-palco:hover .cm-brilho { opacity: 1 }
.cm-topo { display: flex; gap: 12px; align-items: center }
.cm-foto { position: relative; width: 58px; height: 58px; border-radius: 50%; padding: 3px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 16px rgba(15,23,42,.18); animation: cmFoto .8s .2s cubic-bezier(.2,1.6,.4,1) both }
.cm-foto img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid #fefefe }
.cm-foto b { color: #fefefe; font-weight: 900; font-size: 18px; text-shadow: 0 1px 2px rgba(0,0,0,.35) }
.cm-liga { position: absolute; right: -6px; bottom: -6px }
@keyframes cmFoto { from { transform: scale(.4) rotate(-25deg); opacity: 0 } }
.cm-nome { display: block; font-size: 16.5px; font-weight: 900; color: var(--portal-text, #0f172a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.cm-sub { font-size: 12.5px; color: ${MUDO}; font-weight: 600 }
.cm-dif { font-size: 14px; font-weight: 900; display: grid; justify-items: end; line-height: 1.1 } .cm-dif small { font-size: 10.5px; font-weight: 700; color: ${MUDO} }
.cm-dif.up { color: #047857 } .cm-dif.down { color: #b91c1c }
.cm-valor { display: grid } .cm-valor small { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: .5px; color: ${MUDO} }
.cm-valor > b { font-size: 34px; font-weight: 900; color: #047857; font-variant-numeric: tabular-nums; line-height: 1.1; letter-spacing: -.5px }
.cm-valor > span { font-size: 12.5px; color: ${MUDO} }
.cm-pilha { display: grid; gap: 8px }
.cm-trilho { position: relative; height: 16px; border-radius: 99px; background: var(--portal-bg-secondary, #f1f5f9); display: flex; overflow: visible }
.cm-trilho > i { display: block; height: 100%; transform-origin: left; animation: cmCresce .9s cubic-bezier(.2,.8,.2,1) both }
.cm-trilho > i:first-child { border-radius: 99px 0 0 99px }
.cm-trilho i.g { background: linear-gradient(90deg, #059669, #10b981); animation-delay: .3s }
.cm-trilho i.a { background: linear-gradient(90deg, #f59e0b, #fbbf24); animation-delay: .55s }
.cm-trilho i.p { background: repeating-linear-gradient(135deg, rgba(16,185,129,.35) 0 5px, rgba(16,185,129,.12) 5px 10px); border-radius: 0 99px 99px 0; animation-delay: .8s }
@keyframes cmCresce { from { transform: scaleX(0) } }
.cm-marca { position: absolute; top: -5px; bottom: -5px; width: 2px; background: #334155; border-radius: 2px; animation: cmEntra .5s 1s both }
.cm-marca em { position: absolute; top: -16px; left: 50%; transform: translateX(-50%); font-size: 10px; font-style: normal; font-weight: 800; color: #334155; white-space: nowrap }
.cm-leg { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: ${MUDO} } .cm-leg b { color: var(--portal-text, #0f172a); font-variant-numeric: tabular-nums }
.cm-leg i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 3px; vertical-align: -1px }
.cm-leg i.g { background: #10b981 } .cm-leg i.a { background: #f59e0b } .cm-leg i.p { background: rgba(16,185,129,.35) }
.cm-rodape { margin-top: auto; display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: ${MUDO} } .cm-rodape b { color: var(--portal-text, #0f172a) }
.cm-virar { font-weight: 800; color: #059669 }
.cm-verso { transform: rotateY(180deg); background: linear-gradient(160deg, #0f172a, #134e4a); color: #e2e8f0; border-color: #134e4a; gap: 8px }
.cm-v-cab b { display: block; font-size: 16px; color: #fefefe } .cm-v-cab span { font-size: 12px; color: #94a3b8 }
.cm-v-lin { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; border-bottom: 1px dashed rgba(148,163,184,.25); padding-bottom: 4px } .cm-v-lin b { color: #6ee7b7; font-variant-numeric: tabular-nums }
.cm-passos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin: 4px 0 }
.cm-passos > div { display: grid; justify-items: center; text-align: center; gap: 2px; position: relative }
.cm-passos i { width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-style: normal; font-weight: 900; font-size: 12px; background: rgba(148,163,184,.25); color: #e2e8f0 }
.cm-passos .ok i { background: #10b981; color: #fefefe; box-shadow: 0 0 0 4px rgba(16,185,129,.25) }
.cm-passos b { font-size: 11.5px; color: #fefefe } .cm-passos small { font-size: 10.5px; color: #94a3b8 }
.cm-verso > small { font-size: 11px; color: #94a3b8 !important; margin-top: auto }
@media (prefers-reduced-motion: reduce) { .cm-palco, .cm-trilho > i, .cm-foto, .cm-marca { animation: none !important } }
`
