'use client'
// Cards dos técnicos — 2ª leva (José, 19/10/2026: "apaga esse, estão todos ridículos e me surpreenda").
// Metas: R$ 20 mil/mês por mecânico, 20 h/semana, comparando com a ideal de 40 h/semana.
// Dados reais: base do pós-vendas (mês atual) + comissões e fotos (useCarreira).
import { useMemo, useState } from 'react'
import { montarPainel, SEM_META, SEM_TECNICO } from '@/lib/mecanicos/painel'
import { useBasePosVendas } from './useBasePosVendas'
import { useCarreira } from './useCarreira'
import { IconeLiga } from './CartaLiga'
import { useComAguardando } from './useComAguardando'
import { brl, horas, Odometro, useContador } from './ui'

const MUDO = 'var(--portal-text-muted, #64748b)'
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const dataBR = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—')
const primeiro = (n: string) => n.split(' ')[0]
/** Metas por mecânico na SEMANA (José, 20/10/2026): básica 20 h e R$ 4 mil; ideal 40 h e R$ 8 mil. No mês = × semanas (dias ÷ 7). */
export type Metas = { valorSemana: number; valorIdealSemana: number; horasSemana: number; horasIdeal: number }
export const METAS_PADRAO: Metas = { valorSemana: 4000, valorIdealSemana: 8000, horasSemana: 20, horasIdeal: 40 }
const CORES_LIGA = [['#e5e7eb', '#6b7280'], ['#f6d2ad', '#9a5b2b'], ['#f8fafc', '#94a3b8'], ['#fde68a', '#b7860b'], ['#cffafe', '#3b82c4']]
const LIGAS = ['Ferro', 'Bronze', 'Prata', 'Ouro', 'Diamante']

export type CardDados = {
  nome: string; foto?: string; nivel?: number
  faturado: number; horas: number; os: number; km: number
  /** pontos do mês (começa com 100; ocorrência que vale desconta) */
  pontos?: number
  /** OS internas do mês (não contam nas metas): horas do app e valor */
  internaHoras: number; internaValor: number
  metaValor: number; idealValor: number; metaHoras: number; idealHoras: number; fracao: number
  projValor: number; projHoras: number
  comissao: number | null; pagamento: string | null; pct: number | null
  /** acumulado dia a dia do mês (índice 0 = dia 1) */
  diaValor: number[]; diaHoras: number[]; diasMes: number; diaHoje: number
  /** horas cobradas + aguardando desta semana (seg → hoje) e a meta semanal */
  horasSemana: number; metaSemana: number; idealSemana: number
}

export function useCardsTecnicos(metas: Metas) {
  const { base } = useBasePosVendas()
  const { dados: car } = useCarreira()
  const comAg = useComAguardando()
  return useMemo(() => {
    if (!base) return null
    const hoje = hojeSP()
    const d = montarPainel(base, 'mes', hoje, hoje, comAg)
    const [a, m] = hoje.split('-').map(Number)
    const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate()
    const fracao = Math.min(1, Number(hoje.slice(8, 10)) / diasMes)
    const semanas = diasMes / 7
    const diaHoje = Number(hoje.slice(8, 10))
    // faturado e horas cobradas dia a dia de cada técnico (OS com 2 técnicos divide)
    const porDia = new Map<string, { v: number[]; h: number[] }>()
    for (const o of base.faturadas) {
      if (!o.data.startsWith(hoje.slice(0, 7))) continue
      const k = Number(o.data.slice(8, 10)) - 1, n = Math.max(1, o.tecnicos.length)
      for (const t of o.tecnicos) {
        const x = porDia.get(t) || { v: Array(diasMes).fill(0), h: Array(diasMes).fill(0) }
        x.v[k] += o.bruto / n; x.h[k] += (o.horasCobradas || 0) / n; porDia.set(t, x)
      }
    }
    const acum = (l: number[]) => l.reduce<number[]>((out, v, i) => { out.push((out[i - 1] || 0) + v); return out }, [])
    // quem já saiu do RH antes deste mês não ganha cartão, mesmo com OS no mês (José, 21/10/2026: "tira o Nicolas,
    // ele não é mais técnico nosso"); as OS dele continuam no total da equipe
    const saiu = (t: string) => { const e = (base.equipe || []).find((x) => x.pessoa === t); return !!e?.demissao && e.demissao < hoje.slice(0, 7) }
    return d.linhas.filter((l) => l.tecnico !== SEM_TECNICO && !SEM_META.has(l.tecnico) && !saiu(l.tecnico)).map((l): CardDados => {
      const c = car?.comissoes.find((x) => x.tecnico === l.tecnico)
      const h = l.faturadas + l.aguardando
      return {
        nome: l.tecnico, foto: car?.fotos?.[l.tecnico], nivel: car?.carreira.find((x) => x.tecnico === l.tecnico)?.nivel,
        pontos: car ? Math.max(0, 100 - (car.pontosMes?.[l.tecnico] || 0)) : undefined,
        internaHoras: l.internas,
        internaValor: (base.internasFechadas || []).filter((x) => x.data.startsWith(hoje.slice(0, 7)) && x.tecnicos.includes(l.tecnico)).reduce((s, x) => s + x.valor / Math.max(1, x.tecnicos.length), 0),
        faturado: l.bruto, horas: h, os: Math.round(l.os), km: l.km,
        metaValor: metas.valorSemana * semanas, idealValor: metas.valorIdealSemana * semanas, metaHoras: metas.horasSemana * semanas, idealHoras: metas.horasIdeal * semanas, fracao,
        projValor: fracao > 0 ? l.bruto / fracao : 0, projHoras: fracao > 0 ? h / fracao : 0,
        comissao: c ? c.atual.projecao : null, pagamento: c ? c.atual.pagamento : null, pct: c ? c.pct : null,
        diaValor: acum(porDia.get(l.tecnico)?.v || Array(diasMes).fill(0)),
        // horas: as cobradas dia a dia + as que aguardam faturar somadas no dia de hoje
        diaHoras: acum((porDia.get(l.tecnico)?.h || Array(diasMes).fill(0)).map((v, i) => (i === diaHoje - 1 ? v + l.aguardando : v))),
        diasMes, diaHoje,
        // semana de segunda até hoje (se a segunda caiu no mês anterior, conta do dia 1)
        ...(() => {
          const w = new Date(`${hoje}T12:00:00Z`).getUTCDay(), seg = Math.max(1, diaHoje - (w === 0 ? 6 : w - 1))
          const ac = acum((porDia.get(l.tecnico)?.h || Array(diasMes).fill(0)).map((v, i) => (i === diaHoje - 1 ? v + l.aguardando : v)))
          return { horasSemana: Math.max(0, (ac[diaHoje - 1] || 0) - (seg > 1 ? ac[seg - 2] || 0 : 0)), metaSemana: metas.horasSemana, idealSemana: metas.horasIdeal }
        })(),
      }
    }).sort((x, y) => y.faturado - x.faturado)
  }, [base, car, metas, comAg])
}

function situacao(v: number, meta: number, fracao: number) {
  const r = meta * fracao > 0 ? v / (meta * fracao) : 0
  return r >= 1 ? { txt: 'no ritmo', cor: '#059669', fundo: '#ecfdf5' } : r >= 0.75 ? { txt: 'quase lá', cor: '#d97706', fundo: '#fffbeb' } : { txt: 'abaixo do ritmo', cor: '#dc2626', fundo: '#fef2f2' }
}
function FotoImg({ c, className }: { c: CardDados; className?: string }) {
  const [erro, setErro] = useState(false)
  // eslint-disable-next-line @next/next/no-img-element
  return c.foto && !erro ? <img className={className} src={c.foto} alt={c.nome} onError={() => setErro(true)} /> : <span className={`${className || ''} sx-ini`}>{iniciais(c.nome)}</span>
}
/** Selo da pontuação do mês (escudo de 100 pontos das Ocorrências). */
function SeloPontos({ p, className }: { p?: number; className?: string }) {
  if (p == null) return null
  const cor = p >= 90 ? '#059669' : p >= 70 ? '#d97706' : '#dc2626'
  return <span className={`sx-pts ${className || ''}`} style={{ '--pc': cor } as React.CSSProperties} title="Pontuação do mês: começa com 100 e cada ocorrência que vale desconta"><b>{p}</b><small>pts</small><em><i style={{ width: `${Math.max(0, Math.min(100, p))}%` }} /></em></span>
}
function inclinar(e: React.MouseEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height
  e.currentTarget.style.setProperty('--ry', `${(x - 0.5) * 14}deg`); e.currentTarget.style.setProperty('--rx', `${(0.5 - y) * 10}deg`)
  e.currentTarget.style.setProperty('--mx', `${x * 100}%`); e.currentTarget.style.setProperty('--my', `${y * 100}%`)
}
function soltar(e: React.MouseEvent<HTMLElement>) { e.currentTarget.style.setProperty('--ry', '0deg'); e.currentTarget.style.setProperty('--rx', '0deg') }

// ============================================================================
/** Velocímetro: arco de 240°, zonas, marca de "até hoje", marca da meta ideal e ponteiro que varre ao entrar. */
function Velocimetro({ v, meta, ideal, fracao, f, rot, cor }: { v: number; meta: number; ideal?: number; fracao: number; f: (n: number) => string; rot: string; cor: string }) {
  const topo = Math.max(ideal || meta * 1.25, v * 1.05, 1)
  const ang = (n: number) => -120 + Math.min(1, n / topo) * 240
  const anim = useContador(v, 1400)
  const R = 46
  const pt = (a: number, r: number) => { const t = ((a - 90) * Math.PI) / 180; return [Math.cos(t) * r, Math.sin(t) * r] }
  const arco = (a0: number, a1: number, r: number) => { const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r); return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}` }
  const aMeta = ang(meta), aHoje = ang(meta * fracao), aV = ang(anim)
  return (
    <div className="vel">
      <svg viewBox="-66 -58 132 96">
        <path d={arco(-120, 120, R)} stroke="#e2e8f0" strokeWidth="9" fill="none" strokeLinecap="round" />
        <path d={arco(-120, aMeta, R)} stroke={`color-mix(in srgb, ${cor} 18%, transparent)`} strokeWidth="9" fill="none" />
        <path d={arco(-120, Math.max(-119.9, aV), R)} stroke={cor} strokeWidth="9" fill="none" strokeLinecap="round" />
        {Array.from({ length: 13 }, (_, i) => { const a = -120 + i * 20, [x0, y0] = pt(a, R - 9), [x1, y1] = pt(a, R - (i % 3 ? 12 : 15)); return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#94a3b8" strokeWidth={i % 3 ? .7 : 1.2} /> })}
        {(() => { const [x0, y0] = pt(aHoje, R - 6), [x1, y1] = pt(aHoje, R + 6); return <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" /> })()}
        {(() => { const [x0, y0] = pt(aMeta, R - 6), [x1, y1] = pt(aMeta, R + 7); const [tx, ty] = pt(aMeta, R + 13); return <g><line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#0f172a" strokeWidth="2.4" strokeLinecap="round" /><text x={tx} y={ty + 2} fontSize="6" fontWeight="900" textAnchor="middle" fill="#0f172a">META</text></g> })()}
        {ideal != null && (() => { const a = ang(ideal), [x0, y0] = pt(a, R - 6), [x1, y1] = pt(a, R + 7); const [tx, ty] = pt(a, R + 13); return <g><line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#7c3aed" strokeWidth="2.4" strokeLinecap="round" /><text x={tx} y={ty + 2} fontSize="6" fontWeight="900" textAnchor="middle" fill="#7c3aed">IDEAL</text></g> })()}
        <g style={{ transform: `rotate(${aV}deg)`, transition: 'transform .1s linear' }}>
          <path d="M-2.4,0 L0,-40 L2.4,0 Z" fill="#0f172a" />
        </g>
        <circle r="6" fill="#0f172a" /><circle r="2.4" fill="#fefefe" />
        <text y="22" fontSize="12" fontWeight="900" textAnchor="middle" fill="#0f172a">{f(anim)}</text>
        <text y="31" fontSize="6.5" fontWeight="800" textAnchor="middle" fill="#64748b">{rot} · {Math.round((v / Math.max(1, meta)) * 100)}% da meta</text>
      </svg>
    </div>
  )
}

/** S1 — Painel de instrumentos: foto em destaque, dois velocímetros (valor e horas, com a ideal de 40 h) e a comissão rodando no hodômetro. */
export function S1({ cards }: { cards: CardDados[] }) {
  return (
    <div className="s1-grade">
      {cards.map((c, i) => {
        const sv = situacao(c.faturado, c.metaValor, c.fracao)
        return (
          <article key={c.nome} className="s1" style={{ animationDelay: `${i * 110}ms` }} onMouseMove={inclinar} onMouseLeave={soltar}>
            <div className="s1-foto">
              <FotoImg c={c} />
              <div className="s1-veu" />
              <div className="s1-nome"><b>{c.nome}</b><span>{c.os} OS · {Math.round(c.km)} km · {horas(c.horas)}</span></div>
              {c.nivel != null && <span className="s1-liga"><IconeLiga nivel={c.nivel} tamanho={36} /></span>}
              <span className="s1-sit" style={{ color: sv.cor, background: sv.fundo }}>● {sv.txt}</span>
            </div>
            <div className="s1-vels">
              <Velocimetro v={c.faturado} meta={c.metaValor} fracao={c.fracao} f={brl} rot="faturado" cor="#2563eb" />
              <Velocimetro v={c.horas} meta={c.metaHoras} ideal={c.idealHoras} fracao={c.fracao} f={horas} rot="horas" cor="#0891b2" />
            </div>
            <div className="s1-pag">
              <div><small>Comissão prevista</small>{c.comissao != null ? <b><Odometro texto={brl(c.comissao)} /></b> : <b className="vazio">—</b>}</div>
              <div className="s1-dia"><i className="fas fa-calendar-check" /><b>{dataBR(c.pagamento)}</b><small>dia do pagamento</small></div>
            </div>
            <div className="s1-proj">no ritmo de hoje fecha o mês com <b>{brl(c.projValor)}</b> e <b>{horas(c.projHoras)}</b></div>
          </article>
        )
      })}
    </div>
  )
}

// ============================================================================
/** S2 — Corrida da meta: todos os técnicos numa pista até a bandeira (R$ 20 mil) e outra pista de horas com 20 h e 40 h. */
export function S2({ cards }: { cards: CardDados[] }) {
  const [foco, setFoco] = useState<string | null>(null)
  const pista = (tipo: 'valor' | 'horas') => {
    const meta = tipo === 'valor' ? cards[0]?.metaValor || 1 : cards[0]?.metaHoras || 1
    const ideal = tipo === 'horas' ? cards[0]?.idealHoras : undefined
    const topo = Math.max(ideal || meta, ...cards.map((c) => (tipo === 'valor' ? c.faturado : c.horas))) * 1.06
    const p = (n: number) => `${Math.min(100, (n / topo) * 100)}%`
    const fr = cards[0]?.fracao || 0
    return (
      <div className="s2-pista">
        <div className="s2-rot"><i className={`fas ${tipo === 'valor' ? 'fa-sack-dollar' : 'fa-clock'}`} /> {tipo === 'valor' ? 'Faturado no mês' : 'Horas no mês'}</div>
        <div className="s2-area">
          <span className="s2-linha hoje" style={{ left: p(meta * fr) }}><em>até hoje</em></span>
          <span className="s2-linha meta" style={{ left: p(meta) }}><em>🏁 meta {tipo === 'valor' ? brl(meta) : horas(meta)}</em></span>
          {ideal != null && <span className="s2-linha ideal" style={{ left: p(ideal) }}><em>ideal {horas(ideal)}</em></span>}
          {cards.map((c, i) => {
            const v = tipo === 'valor' ? c.faturado : c.horas
            const s = situacao(v, meta, fr)
            return (
              <div key={c.nome} className={`s2-raia ${foco && foco !== c.nome ? 'apaga' : ''}`} onMouseEnter={() => setFoco(c.nome)} onMouseLeave={() => setFoco(null)}>
                <i className="s2-rastro" style={{ width: p(v), background: `linear-gradient(90deg, transparent, ${s.cor})`, animationDelay: `${i * 120}ms` }} />
                <span className="s2-carro" style={{ left: p(v), animationDelay: `${i * 120}ms`, borderColor: s.cor }}><FotoImg c={c} /></span>
                <span className="s2-val" style={{ left: p(v) }}><b>{primeiro(c.nome)}</b> {tipo === 'valor' ? brl(v) : horas(v)}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  return (
    <div className="s2">
      {pista('valor')}
      {pista('horas')}
      <div className="s2-pags">
        {cards.map((c) => <div key={c.nome} className={foco === c.nome ? 'on' : ''} onMouseEnter={() => setFoco(c.nome)} onMouseLeave={() => setFoco(null)}><FotoImg c={c} className="s2-mini" /><span><b>{primeiro(c.nome)}</b><small>recebe {c.comissao != null ? brl(c.comissao) : '—'} em {dataBR(c.pagamento)}</small></span></div>)}
      </div>
    </div>
  )
}

// ============================================================================
/** S3 — Crachá holográfico: cartão na cor da liga, que inclina e brilha com o mouse; saldo da comissão e metas em anéis finos. */
function AnelFino({ pct, cor, rot, sub }: { pct: number; cor: string; rot: string; sub: string }) {
  const v = useContador(Math.max(0, Math.min(100, pct)), 1300)
  const C = 2 * Math.PI * 22
  return (
    <div className="s3-anel">
      <svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="22" fill="none" stroke="rgba(15,23,42,.12)" strokeWidth="5" /><circle cx="28" cy="28" r="22" fill="none" stroke={cor} strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)} transform="rotate(-90 28 28)" /><text x="28" y="32" textAnchor="middle" fontSize="12" fontWeight="900" fill="#0f172a">{Math.round(v)}%</text></svg>
      <div><b>{rot}</b><small>{sub}</small></div>
    </div>
  )
}
export function S3({ cards }: { cards: CardDados[] }) {
  return (
    <div className="s3-grade">
      {cards.map((c, i) => {
        const liga = c.nivel != null ? Math.min(4, Math.floor(c.nivel / 5)) : 0
        const [ca, cb] = CORES_LIGA[liga]
        return (
          <article key={c.nome} className="s3" style={{ '--la': ca, '--lb': cb, animationDelay: `${i * 110}ms` } as React.CSSProperties} onMouseMove={inclinar} onMouseLeave={soltar}>
            <div className="s3-holo" />
            <div className="s3-topo">
              <span className="s3-chip" />
              <span className="s3-liga">{LIGAS[liga]}{c.nivel != null && <IconeLiga nivel={c.nivel} tamanho={22} />}</span>
            </div>
            <div className="s3-meio">
              <FotoImg c={c} className="s3-foto" />
              <div><small>Técnico</small><b>{c.nome}</b><span>{c.os} OS · {Math.round(c.km)} km</span></div>
            </div>
            <div className="s3-saldo"><small>comissão prevista</small><b>{c.comissao != null ? <Odometro texto={brl(c.comissao)} /> : '—'}</b><span>cai em {dataBR(c.pagamento)}</span></div>
            <div className="s3-metas">
              <AnelFino pct={(c.faturado / Math.max(1, c.metaValor)) * 100} cor="#2563eb" rot={brl(c.faturado)} sub={`de ${brl(c.metaValor)}`} />
              <AnelFino pct={(c.horas / Math.max(1, c.metaHoras)) * 100} cor="#0891b2" rot={horas(c.horas)} sub={`meta ${horas(c.metaHoras)} · ideal ${Math.round((c.horas / Math.max(1, c.idealHoras)) * 100)}%`} />
            </div>
          </article>
        )
      })}
    </div>
  )
}

// ============================================================================
// 3ª leva (José 19/10: "coloca mais 5")

/** S4 — Tanques: dois tanques verticais enchendo com líquido em onda (valor e horas), marcas de meta e ideal. */
function Tanque({ v, meta, ideal, f, rot, cor, atraso }: { v: number; meta: number; ideal?: number; f: (n: number) => string; rot: string; cor: string; atraso: number }) {
  const topo = Math.max((ideal || meta) * 1.12, v * 1.05, 1)
  const p = (n: number) => Math.min(100, (n / topo) * 100)
  return (
    <div className="s4-tq">
      <div className="s4-vidro" style={{ '--c': cor } as React.CSSProperties}>
        <div className="s4-liq" style={{ height: `${p(v)}%`, animationDelay: `${atraso}ms` }}><i className="s4-onda" /><i className="s4-onda b" /></div>
        <span className="s4-marca meta" style={{ bottom: `${p(meta)}%` }}><em>meta</em></span>
        {ideal != null && <span className="s4-marca ideal" style={{ bottom: `${p(ideal)}%` }}><em>ideal</em></span>}
        <b className="s4-pct">{Math.round((v / Math.max(1, meta)) * 100)}%</b>
      </div>
      <small>{rot}</small><strong>{f(v)}</strong>
    </div>
  )
}
export function S4({ cards }: { cards: CardDados[] }) {
  return (
    <div className="s4-grade">
      {cards.map((c, i) => (
        <article key={c.nome} className="s4" style={{ animationDelay: `${i * 100}ms` }}>
          <div className="s4-topo"><span className="s4-foto"><FotoImg c={c} /></span><div><b>{c.nome}</b><small>{c.os} OS · {Math.round(c.km)} km</small></div>{c.nivel != null && <IconeLiga nivel={c.nivel} tamanho={28} />}</div>
          <div className="s4-tanques">
            <Tanque v={c.faturado} meta={c.metaValor} f={brl} rot="faturado" cor="#2563eb" atraso={i * 100} />
            <Tanque v={c.horas} meta={c.metaHoras} ideal={c.idealHoras} f={horas} rot="horas" cor="#06b6d4" atraso={i * 100 + 150} />
            <div className="s4-pag"><i className="fas fa-coins" /><small>comissão</small><b>{c.comissao != null ? brl(c.comissao) : '—'}</b><span>cai {dataBR(c.pagamento)}</span></div>
          </div>
        </article>
      ))}
    </div>
  )
}

/** S5 — Pódio: os técnicos em degraus da altura do % da meta; quem passou da meta ganha confete. */
export function S5({ cards, onAbrir }: { cards: CardDados[]; onAbrir?: (c: CardDados) => void }) {
  const ord = [...cards].sort((a, b) => b.faturado / b.metaValor - a.faturado / a.metaValor)
  const max = Math.max(1, ...ord.map((c) => c.faturado / c.metaValor))
  return (
    <div className="s5">
      <div className="s5-palco">
        {ord.map((c, i) => {
          const pct = c.faturado / c.metaValor
          const bateu = pct >= 1
          return (
            <div key={c.nome} className={`s5-col ${onAbrir ? 'abre' : ''}`} style={{ animationDelay: `${i * 140}ms` }} onClick={onAbrir ? () => onAbrir(c) : undefined} title={onAbrir ? `Abrir a ficha completa de ${c.nome}` : undefined}>
              {bateu && <div className="s5-confete">{Array.from({ length: 14 }, (_, k) => <i key={k} style={{ left: `${(k * 37) % 100}%`, background: ['#f59e0b', '#2563eb', '#dc2626', '#059669', '#7c3aed'][k % 5], animationDelay: `${k * 90}ms` }} />)}</div>}
              <span className="s5-foto"><FotoImg c={c} />{c.nivel != null && <span className="s5-liga"><IconeLiga nivel={c.nivel} tamanho={24} /></span>}</span>
              <b>{primeiro(c.nome)}</b>
              <SeloPontos p={c.pontos} />
              <div className={`s5-degrau ${i === 0 ? 'ouro' : i === 1 ? 'prata' : i === 2 ? 'bronze' : ''}`} style={{ height: `${118 + (pct / max) * 120}px`, animationDelay: `${i * 140}ms` }}>
                <em>{i + 1}º</em>
                <strong>{Math.round(pct * 100)}%</strong>
                <small>{brl(c.faturado)}</small>
                <small>{horas(c.horas)} · ideal {Math.round((c.horas / Math.max(1, c.idealHoras)) * 100)}%</small>
              </div>
              <div className="s5-pag">recebe <b>{c.comissao != null ? brl(c.comissao) : '—'}</b> em {dataBR(c.pagamento)}</div>
            </div>
          )
        })}
      </div>
      <p className="s5-leg">altura do degrau = % da meta de {brl(cards[0]?.metaValor || 0)}; confete = já bateu a meta do mês</p>
    </div>
  )
}

/** S6 — Placar de virar (split-flap): números grandes em plaquinhas que viram, como placar de aeroporto. */
function Flap({ texto }: { texto: string }) {
  return <span className="s6-flap">{texto.split('').map((ch, i) => <span key={i} className={/\d/.test(ch) ? 'd' : 's'} style={{ animationDelay: `${i * 70}ms` }}>{ch}</span>)}</span>
}
export function S6({ cards }: { cards: CardDados[] }) {
  return (
    <div className="s6-grade">
      {cards.map((c, i) => {
        const sv = situacao(c.faturado, c.metaValor, c.fracao)
        return (
          <article key={c.nome} className="s6" style={{ animationDelay: `${i * 100}ms` }}>
            <div className="s6-topo"><span className="s6-foto"><FotoImg c={c} /></span><div><b>{c.nome}</b><span style={{ color: sv.cor }}>● {sv.txt}</span></div>{c.nivel != null && <IconeLiga nivel={c.nivel} tamanho={28} />}</div>
            <div className="s6-linha"><small>Faturado</small><Flap texto={brl(c.faturado)} /><em>meta {brl(c.metaValor)}</em></div>
            <div className="s6-barra"><i style={{ width: `${Math.min(100, (c.faturado / c.metaValor) * 100)}%` }} /></div>
            <div className="s6-linha"><small>Horas</small><Flap texto={`${Math.round(c.horas)} h`} /><em>meta {Math.round(c.metaHoras)} h · ideal {Math.round(c.idealHoras)} h</em></div>
            <div className="s6-barra h"><i style={{ width: `${Math.min(100, (c.horas / c.idealHoras) * 100)}%` }} /><u style={{ left: `${(c.metaHoras / c.idealHoras) * 100}%` }} /></div>
            <div className="s6-linha pag"><small>Comissão</small><Flap texto={c.comissao != null ? brl(c.comissao) : '—'} /><em>paga em {dataBR(c.pagamento)}</em></div>
          </article>
        )
      })}
    </div>
  )
}

/** S7 — Radar de desempenho: teia com 5 eixos (valor, horas, OS, km, ritmo) e a forma do técnico contra a meta. */
export function S7({ cards }: { cards: CardDados[] }) {
  const maxOS = Math.max(1, ...cards.map((c) => c.os)), maxKm = Math.max(1, ...cards.map((c) => c.km))
  const eixos = ['Valor', 'Horas', 'OS', 'Km', 'Ritmo']
  const pt = (k: number, r: number) => { const a = (Math.PI * 2 * k) / 5 - Math.PI / 2; return [Math.cos(a) * r, Math.sin(a) * r] }
  return (
    <div className="s7-grade">
      {cards.map((c, i) => {
        const vals = [c.faturado / c.metaValor, c.horas / c.metaHoras, c.os / maxOS, c.km / maxKm, c.projValor / c.metaValor].map((v) => Math.max(0.04, Math.min(1.25, v)))
        const forma = vals.map((v, k) => pt(k, v * 44).join(',')).join(' ')
        const meta = [0, 1, 2, 3, 4].map((k) => pt(k, 44 * (k < 2 || k === 4 ? 1 : 1)).join(',')).join(' ')
        const sv = situacao(c.faturado, c.metaValor, c.fracao)
        return (
          <article key={c.nome} className="s7" style={{ animationDelay: `${i * 100}ms` }}>
            <div className="s7-topo"><span className="s7-foto"><FotoImg c={c} /></span><div><b>{c.nome}</b><span style={{ color: sv.cor }}>● {sv.txt}</span></div>{c.nivel != null && <IconeLiga nivel={c.nivel} tamanho={26} />}</div>
            <svg viewBox="-72 -60 144 124" className="s7-teia">
              {[0.25, 0.5, 0.75, 1].map((f) => <polygon key={f} points={[0, 1, 2, 3, 4].map((k) => pt(k, 44 * f).join(',')).join(' ')} fill="none" stroke="#e2e8f0" strokeWidth={f === 1 ? 1.4 : .7} />)}
              {[0, 1, 2, 3, 4].map((k) => { const [x, y] = pt(k, 44); const [tx, ty] = pt(k, 54); return <g key={k}><line x1="0" y1="0" x2={x} y2={y} stroke="#e2e8f0" strokeWidth=".7" /><text x={tx} y={ty + 2} fontSize="7" fontWeight="800" textAnchor="middle" fill="#64748b">{eixos[k]}</text></g> })}
              <polygon points={meta} fill="none" stroke="#0f172a" strokeDasharray="3 2" strokeWidth="1" />
              <polygon points={forma} fill="rgba(37,99,235,.22)" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" className="s7-forma" />
              {vals.map((v, k) => { const [x, y] = pt(k, v * 44); return <circle key={k} cx={x} cy={y} r="2.6" fill="#2563eb" stroke="#fefefe" strokeWidth="1" /> })}
            </svg>
            <div className="s7-nums">
              <span><small>Faturado</small><b>{brl(c.faturado)}</b></span><span><small>Horas</small><b>{horas(c.horas)}</b></span>
              <span><small>Comissão</small><b className="v">{c.comissao != null ? brl(c.comissao) : '—'}</b></span><span><small>Paga em</small><b>{dataBR(c.pagamento)}</b></span>
            </div>
          </article>
        )
      })}
      <p className="s7-leg">a linha tracejada é a meta (100%); quanto mais a forma azul passa dela, melhor. Ritmo = como fecha o mês no passo de hoje.</p>
    </div>
  )
}

/** S8 — HUD de jogo: barra de XP até a meta de valor, energia em blocos de 10 h (até a ideal) e moedas da comissão. */
export function S8({ cards }: { cards: CardDados[] }) {
  return (
    <div className="s8-grade">
      {cards.map((c, i) => {
        const blocos = Math.max(1, Math.round(c.idealHoras / 10)), cheios = Math.min(blocos, Math.round(c.horas / 10)), blocoMeta = Math.round(c.metaHoras / 10)
        const xp = Math.min(1, c.faturado / c.metaValor)
        return (
          <article key={c.nome} className="s8" style={{ animationDelay: `${i * 100}ms` }}>
            <div className="s8-avatar"><FotoImg c={c} /><span className="s8-lv">{c.nivel != null ? <IconeLiga nivel={c.nivel} tamanho={30} /> : null}</span></div>
            <div className="s8-corpo">
              <div className="s8-nome"><b>{c.nome}</b><span>{c.os} OS · {Math.round(c.km)} km</span></div>
              <div className="s8-rot"><small>XP do mês</small><em>{brl(c.faturado)} / {brl(c.metaValor)}</em></div>
              <div className="s8-xp"><i style={{ width: `${xp * 100}%` }} /><span>{Math.round(xp * 100)}%</span></div>
              <div className="s8-rot"><small>Energia (horas)</small><em>{horas(c.horas)} · meta {Math.round(c.metaHoras)} h · ideal {Math.round(c.idealHoras)} h</em></div>
              <div className="s8-energia">{Array.from({ length: blocos }, (_, k) => <i key={k} className={`${k < cheios ? 'on' : ''} ${k === blocoMeta - 1 ? 'meta' : ''}`} style={{ animationDelay: `${k * 40}ms` }} />)}</div>
              <div className="s8-moedas"><span className="s8-moeda" /><b>{c.comissao != null ? brl(c.comissao) : '—'}</b><small>de comissão · cai em {dataBR(c.pagamento)}</small></div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

export const ESTILO_CT2 = `
@keyframes s4Sobe { from { height: 0 } } @keyframes s4Onda { to { transform: translateX(-50%) } } @keyframes s5Sobe { from { transform: scaleY(0) } } @keyframes s5Cai { 0% { transform: translateY(-40px) rotate(0); opacity: 0 } 20% { opacity: 1 } 100% { transform: translateY(160px) rotate(540deg); opacity: 0 } }
@keyframes s6Vira { 0% { transform: rotateX(90deg) } 60% { transform: rotateX(-15deg) } 100% { transform: rotateX(0) } } @keyframes s7Abre { from { transform: scale(0); opacity: 0 } } @keyframes s8Liga { from { opacity: .1; transform: scaleY(.3) } } @keyframes s8Gira { to { transform: rotateY(360deg) } }
.s4-grade, .s6-grade, .s7-grade, .s8-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(310px, 1fr)); gap: 16px }
.s4, .s6, .s7, .s8 { background: var(--portal-bg-card, #fefefe); border-radius: 22px; padding: 16px; box-shadow: 0 2px 4px rgba(15,23,42,.05), 0 16px 36px rgba(15,23,42,.08); animation: sxEntra .6s cubic-bezier(.2,.8,.2,1) both }
.s4-topo, .s6-topo, .s7-topo { display: flex; gap: 12px; align-items: center; margin-bottom: 12px } .s4-topo > div, .s6-topo > div, .s7-topo > div { flex: 1; min-width: 0; display: grid } .s4-topo b, .s6-topo b, .s7-topo b { font-size: 16px } .s4-topo small { font-size: 12px; color: ${MUDO} } .s6-topo span, .s7-topo span { font-size: 12px; font-weight: 800 }
.s4-foto, .s6-foto, .s7-foto { width: 52px; height: 52px; border-radius: 50%; overflow: hidden; flex-shrink: 0; box-shadow: 0 4px 12px rgba(15,23,42,.2) } .s4-foto img, .s6-foto img, .s7-foto img, .s4-foto .sx-ini, .s6-foto .sx-ini, .s7-foto .sx-ini { width: 100%; height: 100%; object-fit: cover; font-size: 17px }
.s4-tanques { display: grid; grid-template-columns: 1fr 1fr 1.1fr; gap: 10px; align-items: end }
.s4-tq { display: grid; justify-items: center; gap: 2px } .s4-tq small { font-size: 11px; font-weight: 900; text-transform: uppercase; color: ${MUDO} } .s4-tq strong { font-size: 14px; font-variant-numeric: tabular-nums }
.s4-vidro { position: relative; width: 64px; height: 150px; border-radius: 18px; background: linear-gradient(90deg, #f1f5f9, #fefefe 40%, #f1f5f9); border: 2px solid #cbd5e1; overflow: hidden; box-shadow: inset 0 2px 8px rgba(15,23,42,.08) }
.s4-liq { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(180deg, color-mix(in srgb, var(--c) 75%, #fefefe), var(--c)); animation: s4Sobe 1.6s cubic-bezier(.2,.8,.2,1) both }
.s4-onda { position: absolute; top: -6px; left: 0; width: 200%; height: 12px; background: radial-gradient(circle at 10px -2px, transparent 9px, color-mix(in srgb, var(--c) 75%, #fefefe) 10px) 0 0 / 20px 12px repeat-x; animation: s4Onda 2.4s linear infinite } .s4-onda.b { top: -4px; opacity: .5; animation-duration: 3.6s }
.s4-marca { position: absolute; left: -2px; right: -2px; height: 0; border-top: 2px solid #0f172a; z-index: 2 } .s4-marca em { position: absolute; right: 3px; top: -13px; font-style: normal; font-size: 8.5px; font-weight: 900; color: #0f172a; background: rgba(255,255,255,.8); border-radius: 4px; padding: 0 3px } .s4-marca.ideal { border-top: 2px dashed #7c3aed } .s4-marca.ideal em { color: #7c3aed }
.s4-pct { position: absolute; left: 0; right: 0; bottom: 8px; text-align: center; font-size: 15px; color: #fefefe; text-shadow: 0 1px 3px rgba(0,0,0,.4); z-index: 3 }
.s4-pag { display: grid; justify-items: center; gap: 2px; text-align: center; background: linear-gradient(170deg, #fffbeb, #fef3c7); border-radius: 16px; padding: 12px 8px; align-self: stretch; align-content: center } .s4-pag i { font-size: 24px; color: #d97706 } .s4-pag small { font-size: 10.5px; font-weight: 900; text-transform: uppercase; color: #92400e } .s4-pag b { font-size: 17px; color: #78350f } .s4-pag span { font-size: 11.5px; color: #92400e }
.s5 { background: linear-gradient(180deg, #eff6ff, var(--portal-bg-card, #fefefe)); border-radius: 22px; padding: 20px 18px 12px; box-shadow: 0 16px 36px rgba(15,23,42,.08) }
.s5-palco { display: flex; gap: 14px; justify-content: center; align-items: flex-end; min-height: 380px }
.s5-col.abre { cursor: pointer; transition: transform .2s } .s5-col.abre:hover { transform: translateY(-6px) } .s5-col.abre:hover .s5-degrau { filter: brightness(1.04); box-shadow: inset 0 2px 0 rgba(255,255,255,.6), 0 12px 26px rgba(15,23,42,.14) }
.sx-pts { display: inline-grid; grid-template-columns: auto auto; align-items: baseline; column-gap: 3px; row-gap: 4px; color: var(--pc); background: #fefefe; border-radius: 12px; padding: 6px 10px 7px; white-space: nowrap; line-height: 1 }
.sx-pts b { font-size: 24px; font-weight: 500; font-variant-numeric: tabular-nums } .sx-pts small { font-size: 11px; color: #64748b }
.sx-pts em { grid-column: 1 / -1; display: block; width: 64px; height: 5px; border-radius: 99px; background: color-mix(in srgb, var(--pc) 15%, #e2e8f0); overflow: hidden } .sx-pts em i { display: block; height: 100%; border-radius: 99px; background: var(--pc) }
.s5-col { position: relative; display: grid; justify-items: center; gap: 6px; width: 150px; animation: sxEntra .6s both }
.s5-foto { position: relative; width: 66px; height: 66px; border-radius: 50%; overflow: visible } .s5-foto img, .s5-foto .sx-ini { width: 66px; height: 66px; border-radius: 50%; object-fit: cover; border: 3px solid #fefefe; box-shadow: 0 6px 16px rgba(15,23,42,.25); font-size: 20px } .s5-liga { position: absolute; right: -10px; bottom: -6px }
.s5-col > b { font-size: 14px }
.s5-degrau { width: 100%; display: grid; align-content: start; justify-items: center; gap: 1px; padding-top: 10px; border-radius: 14px 14px 4px 4px; background: linear-gradient(180deg, #e2e8f0, #cbd5e1); transform-origin: bottom; animation: s5Sobe 1s cubic-bezier(.2,.8,.2,1) both; box-shadow: inset 0 2px 0 rgba(255,255,255,.6) }
.s5-degrau.ouro { background: linear-gradient(180deg, #fde68a, #e9be3c) } .s5-degrau.prata { background: linear-gradient(180deg, #f8fafc, #cbd5e1) } .s5-degrau.bronze { background: linear-gradient(180deg, #f6d2ad, #d39462) }
.s5-degrau em { font-style: normal; font-size: 20px; font-weight: 900; color: rgba(15,23,42,.6) } .s5-degrau strong { font-size: 24px; color: #0f172a } .s5-degrau small { font-size: 11.5px; color: rgba(15,23,42,.7); font-weight: 700 }
.s5-pag { font-size: 12px; color: #047857; text-align: center } .s5-pag b { color: #065f46 }
.s5-confete { position: absolute; inset: -30px 0 auto; height: 200px; pointer-events: none; overflow: hidden } .s5-confete i { position: absolute; top: 0; width: 7px; height: 11px; border-radius: 2px; animation: s5Cai 2.4s ease-in infinite }
.s5-leg { margin: 8px 0 0; text-align: center; font-size: 12px; color: ${MUDO} }
.s6 { background: linear-gradient(170deg, #f8fafc, #eef2f7) }
.s6-linha { display: grid; grid-template-columns: 74px 1fr; align-items: center; gap: 2px 10px; margin-top: 10px } .s6-linha small { font-size: 11px; font-weight: 900; text-transform: uppercase; color: ${MUDO} } .s6-linha em { grid-column: 2; font-style: normal; font-size: 11.5px; color: ${MUDO} }
.s6-flap { display: inline-flex; gap: 2px; perspective: 300px } .s6-flap span { display: inline-grid; place-items: center; min-width: 20px; height: 32px; padding: 0 3px; border-radius: 5px; background: linear-gradient(180deg, #334155 50%, #1e293b 50%); color: #fefefe; font-size: 19px; font-weight: 900; font-variant-numeric: tabular-nums; box-shadow: 0 2px 4px rgba(15,23,42,.3); transform-origin: center; animation: s6Vira .6s cubic-bezier(.3,1.4,.5,1) both } .s6-flap span.s { background: transparent; color: #334155; box-shadow: none; min-width: 6px; padding: 0 }
.s6-linha.pag .s6-flap span.d { background: linear-gradient(180deg, #047857 50%, #065f46 50%) }
.s6-barra { position: relative; height: 6px; border-radius: 99px; background: #e2e8f0; margin: 6px 0 0 84px } .s6-barra i { display: block; height: 100%; border-radius: 99px; background: #2563eb; transform-origin: left; animation: sxLado 1.2s both } .s6-barra.h i { background: #06b6d4 } .s6-barra u { position: absolute; top: -4px; bottom: -4px; width: 2px; background: #0f172a }
.s7-teia { width: 100%; max-height: 220px } .s7-forma { transform-origin: center; transform-box: fill-box; animation: s7Abre 1s cubic-bezier(.3,1.4,.5,1) both }
.s7-nums { display: grid; grid-template-columns: 1fr 1fr; gap: 6px } .s7-nums span { display: grid; background: var(--portal-bg-secondary, #f8fafc); border-radius: 10px; padding: 6px 10px } .s7-nums small { font-size: 10.5px; font-weight: 900; text-transform: uppercase; color: ${MUDO} } .s7-nums b { font-size: 15px } .s7-nums b.v { color: #047857 }
.s7-leg { grid-column: 1 / -1; margin: 0; font-size: 12px; color: ${MUDO} }
.s8 { display: flex; gap: 14px; background: linear-gradient(135deg, #eef2ff, #f0f9ff) }
.s8-avatar { position: relative; width: 84px; height: 84px; flex-shrink: 0 } .s8-avatar img, .s8-avatar .sx-ini { width: 84px; height: 84px; border-radius: 22px; object-fit: cover; border: 3px solid #fefefe; box-shadow: 0 8px 18px rgba(37,99,235,.25); font-size: 24px } .s8-lv { position: absolute; right: -10px; bottom: -10px }
.s8-corpo { flex: 1; min-width: 0; display: grid; gap: 4px } .s8-nome b { display: block; font-size: 16px } .s8-nome span { font-size: 12px; color: ${MUDO} }
.s8-rot { display: flex; justify-content: space-between; gap: 6px; margin-top: 4px } .s8-rot small { font-size: 10.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .05em; color: #4338ca } .s8-rot em { font-style: normal; font-size: 11px; color: ${MUDO}; text-align: right }
.s8-xp { position: relative; height: 16px; border-radius: 99px; background: #e0e7ff; overflow: hidden; box-shadow: inset 0 1px 3px rgba(67,56,202,.2) } .s8-xp i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #6366f1, #22d3ee); transform-origin: left; animation: sxLado 1.4s cubic-bezier(.2,.8,.2,1) both } .s8-xp span { position: absolute; inset: 0; display: grid; place-items: center; font-size: 10.5px; font-weight: 900; color: #1e1b4b }
.s8-energia { display: flex; gap: 3px } .s8-energia i { flex: 1; height: 14px; border-radius: 4px; background: #e2e8f0; animation: s8Liga .4s both } .s8-energia i.on { background: linear-gradient(180deg, #34d399, #059669); box-shadow: 0 0 6px rgba(16,185,129,.5) } .s8-energia i.meta { outline: 2px solid #0f172a; outline-offset: 1px }
.s8-moedas { display: flex; gap: 8px; align-items: center; margin-top: 4px } .s8-moeda { width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fff7c2, #f59e0b 60%, #b45309); box-shadow: 0 2px 4px rgba(180,83,9,.4); animation: s8Gira 3s linear infinite } .s8-moedas b { font-size: 17px; color: #92400e } .s8-moedas small { font-size: 11.5px; color: ${MUDO} }
`

// ============================================================================
// Estilos de contador para o S1 (José 19/10: "centraliza as fotos e troca os estilos dos contadores")
export type EstiloContador = 'anel' | 'segmentos' | 'regua' | 'duplo' | 'vivo'

/** Anel de 270° grosso, número grande no meio, marcas de "até hoje", meta e ideal por fora. */
function ContAnel({ v, meta, ideal, fracao, f, rot, cor }: { v: number; meta: number; ideal?: number; fracao: number; f: (n: number) => string; rot: string; cor: string }) {
  const topo = Math.max((ideal || meta) * 1.08, v * 1.05, 1)
  const anim = useContador(v, 1400)
  const R = 40, C = 2 * Math.PI * R, arc = C * 0.75
  const frac = (n: number) => Math.min(1, n / topo)
  const marca = (n: number, c: string, rotulo?: string) => {
    const a = (-225 + frac(n) * 270) * (Math.PI / 180)
    const p = (r: number) => [Math.cos(a) * r, Math.sin(a) * r]
    const [x0, y0] = p(R - 9), [x1, y1] = p(R + 9), [tx, ty] = p(R + 16)
    return <g><line x1={x0} y1={y0} x2={x1} y2={y1} stroke={c} strokeWidth="2.6" strokeLinecap="round" />{rotulo && <text x={tx} y={ty + 2} fontSize="6" fontWeight="900" textAnchor="middle" fill={c}>{rotulo}</text>}</g>
  }
  return (
    <svg viewBox="-64 -60 128 112" className="ct2">
      <circle r={R} fill="none" stroke="#eef2f7" strokeWidth="13" strokeDasharray={`${arc} ${C}`} transform="rotate(135)" strokeLinecap="round" />
      <circle r={R} fill="none" stroke={cor} strokeWidth="13" strokeDasharray={`${arc * frac(anim)} ${C}`} transform="rotate(135)" strokeLinecap="round" style={{ filter: `drop-shadow(0 2px 4px ${cor}55)` }} />
      {marca(meta * fracao, '#f59e0b')}{marca(meta, '#0f172a', 'META')}{ideal != null && marca(ideal, '#7c3aed', 'IDEAL')}
      <text y="2" fontSize="15" fontWeight="900" textAnchor="middle" fill="#0f172a">{f(anim)}</text>
      <text y="14" fontSize="8" fontWeight="900" textAnchor="middle" fill={cor}>{Math.round((v / Math.max(1, meta)) * 100)}% da meta</text>
      <text y="44" fontSize="7" fontWeight="800" textAnchor="middle" fill="#64748b">{rot.toUpperCase()}</text>
    </svg>
  )
}

/** Arco de LEDs: 20 segmentos que acendem até o valor (cor muda quando passa a meta). */
function ContSegmentos({ v, meta, ideal, fracao, f, rot, cor }: { v: number; meta: number; ideal?: number; fracao: number; f: (n: number) => string; rot: string; cor: string }) {
  const topo = Math.max((ideal || meta) * 1.08, v * 1.05, 1)
  const n = 22, acesos = Math.round(Math.min(1, v / topo) * n), segMeta = Math.round((meta / topo) * n), segHoje = Math.round(((meta * fracao) / topo) * n), segIdeal = ideal != null ? Math.round((ideal / topo) * n) : -1
  const anim = useContador(v, 1300)
  return (
    <svg viewBox="-62 -56 124 100" className="ct2">
      {Array.from({ length: n }, (_, k) => {
        const a = (-200 + (k / (n - 1)) * 220) * (Math.PI / 180)
        const x = Math.cos(a) * 44, y = Math.sin(a) * 44
        const on = k < acesos, passou = k >= segMeta
        return <rect key={k} x={x - 3.4} y={y - 7} width="6.8" height="14" rx="2.4" transform={`rotate(${(a * 180) / Math.PI + 90} ${x} ${y})`}
          fill={on ? (passou ? '#059669' : cor) : '#e2e8f0'} stroke={k === segMeta - 1 ? '#0f172a' : k === segIdeal - 1 ? '#7c3aed' : k === segHoje - 1 ? '#f59e0b' : 'none'} strokeWidth="1.6"
          className="ct2-led" style={{ animationDelay: `${k * 45}ms` }} />
      })}
      <text y="0" fontSize="15" fontWeight="900" textAnchor="middle" fill="#0f172a">{f(anim)}</text>
      <text y="12" fontSize="8" fontWeight="900" textAnchor="middle" fill={cor}>{Math.round((v / Math.max(1, meta)) * 100)}% da meta</text>
      <text y="30" fontSize="7" fontWeight="800" textAnchor="middle" fill="#64748b">{rot.toUpperCase()}</text>
    </svg>
  )
}

/** Régua: faixa horizontal com escala, ponteiro triangular que desliza e as marcas embaixo. */
function ContRegua({ v, meta, ideal, fracao, f, rot, cor }: { v: number; meta: number; ideal?: number; fracao: number; f: (n: number) => string; rot: string; cor: string }) {
  const topo = Math.max((ideal || meta) * 1.08, v * 1.05, 1)
  const p = (n: number) => `${Math.min(100, (n / topo) * 100)}%`
  const anim = useContador(v, 1300)
  return (
    <div className="ct2-regua" style={{ '--c': cor } as React.CSSProperties}>
      <div className="ct2-r-t"><small>{rot}</small><b>{f(anim)}</b><em>{Math.round((v / Math.max(1, meta)) * 100)}% da meta</em></div>
      <div className="ct2-r-trilho">
        <i className="ct2-r-cheio" style={{ width: p(v) }} />
        {Array.from({ length: 11 }, (_, k) => <u key={k} style={{ left: `${k * 10}%` }} />)}
        <span className="ct2-r-pont" style={{ left: p(v) }} />
      </div>
      <div className="ct2-r-marcas">
        <span style={{ left: p(meta * fracao), color: '#d97706' }}>▲ hoje</span>
        <span style={{ left: p(meta), color: '#0f172a' }}>▲ meta</span>
        {ideal != null && <span style={{ left: p(ideal), color: '#7c3aed' }}>▲ ideal</span>}
      </div>
    </div>
  )
}

/** Duplo: um só medidor com dois arcos (fora = faturado, dentro = horas). */
function ContDuplo({ c }: { c: CardDados }) {
  const fv = Math.min(1, c.faturado / (c.metaValor * 1.25)), fh = Math.min(1, c.horas / (c.idealHoras * 1.05))
  const av = useContador(fv, 1400), ah = useContador(fh, 1600)
  const arco = (r: number) => { const C = 2 * Math.PI * r; return { C, a: C * 0.75 } }
  const o = arco(46), d = arco(32)
  const mh = Math.min(1, c.metaHoras / (c.idealHoras * 1.05)), mv = Math.min(1, c.metaValor / (c.metaValor * 1.25))
  const marca = (r: number, f: number, cor: string) => { const a = (135 + f * 270) * (Math.PI / 180); return <line x1={Math.cos(a) * (r - 7)} y1={Math.sin(a) * (r - 7)} x2={Math.cos(a) * (r + 7)} y2={Math.sin(a) * (r + 7)} stroke={cor} strokeWidth="2.4" strokeLinecap="round" /> }
  return (
    <div className="ct2-duplo">
      <svg viewBox="-60 -60 120 108" className="ct2">
        <circle r="46" fill="none" stroke="#e0e7ff" strokeWidth="10" strokeDasharray={`${o.a} ${o.C}`} transform="rotate(135)" strokeLinecap="round" />
        <circle r="46" fill="none" stroke="#2563eb" strokeWidth="10" strokeDasharray={`${o.a * av} ${o.C}`} transform="rotate(135)" strokeLinecap="round" />
        <circle r="32" fill="none" stroke="#cffafe" strokeWidth="10" strokeDasharray={`${d.a} ${d.C}`} transform="rotate(135)" strokeLinecap="round" />
        <circle r="32" fill="none" stroke="#06b6d4" strokeWidth="10" strokeDasharray={`${d.a * ah} ${d.C}`} transform="rotate(135)" strokeLinecap="round" />
        {marca(46, mv, '#0f172a')}{marca(32, mh, '#0f172a')}{marca(32, 1 / 1.05, '#7c3aed')}
        <text y="-2" fontSize="12" fontWeight="900" textAnchor="middle" fill="#2563eb">{brl(c.faturado)}</text>
        <text y="12" fontSize="11" fontWeight="900" textAnchor="middle" fill="#0891b2">{horas(c.horas)}</text>
      </svg>
      <div className="ct2-d-leg"><span><i style={{ background: '#2563eb' }} />faturado · {Math.round((c.faturado / c.metaValor) * 100)}% de {brl(c.metaValor)}</span><span><i style={{ background: '#06b6d4' }} />horas · {Math.round((c.horas / c.metaHoras) * 100)}% da meta · {Math.round((c.horas / c.idealHoras) * 100)}% da ideal</span></div>
    </div>
  )
}

// ============================================================================
/** Contador vivo (José 19/10: "algo inovador e de fácil compreensão, interativo, dinâmico e animado"):
 *  uma frase que explica, a curva do mês contra o ritmo da meta (e a ideal nas horas), alterna sozinho
 *  entre valor e horas, e passar o mouse no gráfico mostra cada dia. */
/** Horas da semana contra a meta de 20 h (e a ideal de 40 h); bateu = destaque verde com medalha. */
function SemanaHoras({ c }: { c: CardDados }) {
  const bateuSem = c.horasSemana >= c.metaSemana, bateuMes = c.horas >= c.metaHoras
  const topo = Math.max(c.idealSemana, c.horasSemana)
  return (
    <div className={`sh ${bateuSem ? 'ok' : ''}`}>
      {(bateuSem || bateuMes) && <div className="sh-selo"><i className="fas fa-medal" /> {bateuSem ? `Bateu as ${c.metaSemana} h da semana` : `Bateu a meta de horas do mês`}{bateuSem && bateuMes ? ' e a do mês' : ''}</div>}
      <div className="sh-lin"><small>Horas nesta semana</small><b>{horas(c.horasSemana)}</b><em>de {c.metaSemana} h · ideal {c.idealSemana} h</em></div>
      <div className="sh-bar">
        <i style={{ width: `${Math.min(100, (c.horasSemana / topo) * 100)}%` }} />
        <span className="sh-meta" style={{ left: `${(c.metaSemana / topo) * 100}%` }} title={`meta ${c.metaSemana} h`} />
        <span className="sh-ideal" style={{ left: `${Math.min(99.5, (c.idealSemana / topo) * 100)}%` }} title={`ideal ${c.idealSemana} h`} />
      </div>
    </div>
  )
}
/** Faturado e horas do mês lado a lado, parados (José, 22/10/2026: "tira essa animação e só coloca as
 *  informações de hora e valor faturado; tira a legenda de meta na capa do card"). A meta continua no detalhe. */
function ContVivo({ c }: { c: CardDados }) {
  return (
    <div className="cv">
      <div className="cv-par">
        <div><small><i className="fas fa-sack-dollar" /> Faturado no mês</small><b>{brl(c.faturado)}</b></div>
        <div><small><i className="fas fa-clock" /> Horas no mês</small><b>{horas(c.horas)}</b></div>
      </div>
    </div>
  )
}

/** S1 com outro estilo de contador. */
/** `semFoto`: cabeçalho branco sem a foto (José, 21/10/2026: "melhora esse card, não precisa mostrar as fotos"). */
/** `capa`: capa limpa — nome, pontos, a comissão e "Ver comissão" (José, 27/10/2026: "tira esse monte de informação da capa, só deixa óbvio que ali é a comissão e que é pra clicar"). */
export function S1Estilo({ cards, contador, onAbrir, semFoto, capa }: { cards: CardDados[]; contador: EstiloContador; onAbrir?: (c: CardDados) => void; semFoto?: boolean; capa?: boolean }) {
  return (
    <div className="s1-grade">
      {cards.map((c, i) => {
        const sv = situacao(c.faturado, c.metaValor, c.fracao)
        const par = (Comp: typeof ContAnel) => <div className="s1-vels"><Comp v={c.faturado} meta={c.metaValor} fracao={c.fracao} f={brl} rot="faturado" cor="#2563eb" /><Comp v={c.horas} meta={c.metaHoras} ideal={c.idealHoras} fracao={c.fracao} f={horas} rot="horas" cor="#0891b2" /></div>
        if (capa) return (
          <article key={c.nome} className={`s1 s1-capa ${onAbrir ? 'abre' : ''}`} style={{ animationDelay: `${i * 110}ms` }} onClick={onAbrir ? () => onAbrir(c) : undefined}
            role={onAbrir ? 'button' : undefined} tabIndex={onAbrir ? 0 : undefined} onKeyDown={onAbrir ? (e) => { if (e.key === 'Enter') onAbrir(c) } : undefined}>
            <div className="s1c-topo"><span className="s1-sit" style={{ color: sv.cor, background: sv.fundo }}>● {sv.txt}</span><SeloPontos p={c.pontos} /></div>
            <div className="s1c-nome"><b>{c.nome}</b>{c.nivel != null && <IconeLiga nivel={c.nivel} tamanho={34} />}</div>
            <div className="s1c-com">
              <small>Comissão prevista</small>
              {c.comissao != null ? <b><Odometro texto={brl(c.comissao)} /></b> : <b className="vazio">—</b>}
              <span><i className="fas fa-calendar-check" /> paga em {dataBR(c.pagamento)}</span>
            </div>
            {/* o mês em 3 números com a barra até a meta básica (José, 28/10/2026: "coloca algumas informações a mais") */}
            <div className="s1c-nums">
              {([['Faturado', brl(c.faturado), c.metaValor ? c.faturado / c.metaValor : 0, '#2563eb'], ['Horas', horas(c.horas), c.metaHoras ? c.horas / c.metaHoras : 0, '#0891b2']] as const).map(([r, v, p, cor]) => (
                <div key={r} title={`${Math.round(p * 100)}% da meta básica do mês`}><small>{r}</small><b>{v}</b><i><u style={{ width: `${Math.min(100, p * 100)}%`, background: cor }} /></i></div>
              ))}
              <div><small>OS</small><b>{c.os}</b><em>{Math.round(c.km).toLocaleString('pt-BR')} km</em></div>
            </div>
            {onAbrir && <span className="s1c-ver">Abrir ficha <i className="fas fa-arrow-right" /></span>}
          </article>
        )
        return (
          <article key={c.nome} className={`s1 ${onAbrir ? 'abre' : ''} ${c.horasSemana >= c.metaSemana || c.horas >= c.metaHoras ? 'meta-h' : ''}`} style={{ animationDelay: `${i * 110}ms` }} onMouseMove={inclinar} onMouseLeave={soltar}
            onClick={onAbrir ? (e) => { if (!(e.target as HTMLElement).closest('button, svg')) onAbrir(c) } : undefined}>
            <div className={`s1-foto ${semFoto ? 'sem' : ''}`} onClick={onAbrir ? () => onAbrir(c) : undefined}>
              {!semFoto && <FotoImg c={c} />}
              {!semFoto && <div className="s1-veu" />}
              <div className="s1-nome"><b>{c.nome}</b><span title="Só OS faturadas e cobradas do cliente"><i className="fas fa-user-tie" /> {c.os} OS · {Math.round(c.km)} km · {horas(c.horas)}</span>{(c.internaHoras > 0 || c.internaValor > 0) && <span className="s1-int" title="OS internas (serviço da loja, cortesia, entrega técnica): não contam nas metas"><i className="fas fa-house-chimney" /> internas, não contam: {horas(c.internaHoras)}{c.internaValor > 0 ? ` · ${brl(c.internaValor)}` : ''}</span>}</div>
              {c.nivel != null && <span className="s1-liga"><IconeLiga nivel={c.nivel} tamanho={36} /></span>}
              <span className="s1-sit" style={{ color: sv.cor, background: sv.fundo }}>● {sv.txt}</span>
              <SeloPontos p={c.pontos} className="s1-pts" />
              {onAbrir && <span className="s1-ver"><i className="fas fa-up-right-and-down-left-from-center" /> ficha completa</span>}
            </div>
            {contador === 'anel' && par(ContAnel)}
            {contador === 'segmentos' && par(ContSegmentos)}
            {contador === 'regua' && <div className="ct2-reguas"><ContRegua v={c.faturado} meta={c.metaValor} fracao={c.fracao} f={brl} rot="Faturado" cor="#2563eb" /><ContRegua v={c.horas} meta={c.metaHoras} ideal={c.idealHoras} fracao={c.fracao} f={horas} rot="Horas" cor="#0891b2" /></div>}
            {contador === 'duplo' && <ContDuplo c={c} />}
            {contador === 'vivo' && <SemanaHoras c={c} />}
            {contador === 'vivo' && <ContVivo c={c} />}
            <div className="s1-pag">
              <div><small>Comissão prevista</small>{c.comissao != null ? <b><Odometro texto={brl(c.comissao)} /></b> : <b className="vazio">—</b>}</div>
              <div className="s1-dia"><i className="fas fa-calendar-check" /><b>{dataBR(c.pagamento)}</b><small>dia do pagamento</small></div>
            </div>
            <div className="s1-proj">no ritmo de hoje fecha o mês com <b>{brl(c.projValor)}</b> e <b>{horas(c.projHoras)}</b></div>
          </article>
        )
      })}
    </div>
  )
}

export const ESTILO_CT3 = `
@keyframes cvTraça { from { stroke-dashoffset: 1 } } @keyframes cvBarra { from { transform: scaleX(0) } to { transform: scaleX(1) } } @keyframes cvPulso { 0% { r: 4.5 } 50% { r: 7 } 100% { r: 4.5 } }
.cv { display: grid; gap: 6px; padding: 12px 16px 4px }
.cv-par { display: grid; grid-template-columns: 1fr 1fr; gap: 10px }
.cv-par > div { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--portal-border, #e2e8f0); border-radius: 12px; background: var(--portal-bg-card, #fefefe) }
.cv-par small { font-size: 12.5px; color: var(--portal-text-secondary, #475569) } .cv-par small i { color: #2563eb; margin-right: 4px } .cv-par > div:last-child small i { color: #0891b2 }
.cv-par b { font-size: 22px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums; color: var(--portal-text, #0f172a) }
.cv-abas { position: relative; display: flex; gap: 4px; background: #eef2f7; border-radius: 12px; padding: 3px }
.cv-abas button { flex: 1; border: none; background: transparent; border-radius: 9px; padding: 6px 8px; font-family: inherit; font-size: 12.5px; font-weight: 800; color: ${MUDO}; cursor: pointer; transition: all .25s } .cv-abas button.on { background: #fefefe; color: var(--c); box-shadow: 0 2px 6px rgba(15,23,42,.1) }
.cv-auto { position: absolute; left: 6px; right: 6px; bottom: 1px; height: 2px; border-radius: 99px; overflow: hidden } .cv-auto i { display: block; height: 100%; background: var(--c); opacity: .5; transform-origin: left; animation: cvBarra 6s linear both }
.cv-num { display: flex; align-items: baseline; gap: 10px; animation: sxEntra .4s both } .cv-num b { font-size: 30px; font-weight: 900; color: #0f172a; font-variant-numeric: tabular-nums; letter-spacing: -.02em }
.cv-pct { font-size: 13px; font-weight: 900; color: var(--c); background: color-mix(in srgb, var(--c) 10%, transparent); border-radius: 99px; padding: 2px 10px } .cv-pct.ok { color: #047857; background: #ecfdf5 }
.cv-frase { margin: 0; font-size: 13px; line-height: 1.45; color: var(--portal-text, #334155); animation: sxEntra .45s .1s both } .cv-frase em { font-style: normal; font-weight: 800 } .cv-frase em.ok { color: #047857 } .cv-frase em.ruim { color: #dc2626 }
.cv-graf { width: 100%; height: auto; overflow: visible; cursor: crosshair } .cv-linha { stroke-dasharray: 1; animation: cvTraça 1.4s cubic-bezier(.2,.8,.2,1) both } .cv-area { animation: sxEntra .8s .5s both } .cv-hoje { animation: cvPulso 1.8s ease-in-out infinite }
.cv-dica { min-height: 18px; font-size: 12px; color: ${MUDO} } .cv-dica b { color: var(--portal-text, #0f172a) }

@keyframes ct2Led { from { opacity: 0 } }
.ct2 { width: 100%; height: auto; overflow: visible } .ct2-led { animation: ct2Led .3s both }
.ct2-reguas { display: grid; gap: 14px; padding: 14px 18px 4px }
.ct2-r-t { display: flex; gap: 8px; align-items: baseline } .ct2-r-t small { font-size: 11px; font-weight: 900; text-transform: uppercase; color: var(--c) } .ct2-r-t b { font-size: 20px; font-variant-numeric: tabular-nums } .ct2-r-t em { margin-left: auto; font-style: normal; font-size: 12px; font-weight: 800; color: ${MUDO} }
.ct2-r-trilho { position: relative; height: 14px; border-radius: 99px; background: #eef2f7; margin-top: 4px } .ct2-r-cheio { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; background: linear-gradient(90deg, color-mix(in srgb, var(--c) 55%, #fefefe), var(--c)); transform-origin: left; animation: sxLado 1.3s cubic-bezier(.2,.8,.2,1) both }
.ct2-r-trilho u { position: absolute; top: 3px; bottom: 3px; width: 1px; background: rgba(15,23,42,.15) }
.ct2-r-pont { position: absolute; top: -9px; width: 0; height: 0; margin-left: -7px; border: 7px solid transparent; border-top-color: #0f172a; animation: sxCorre 1.3s cubic-bezier(.2,.8,.2,1) both }
.ct2-r-marcas { position: relative; height: 16px } .ct2-r-marcas span { position: absolute; transform: translateX(-50%); font-size: 10px; font-weight: 900; white-space: nowrap }
.ct2-duplo { display: grid; grid-template-columns: 150px 1fr; gap: 10px; align-items: center; padding: 10px 16px 0 } .ct2-d-leg { display: grid; gap: 8px; font-size: 12.5px; color: var(--portal-text, #334155) } .ct2-d-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px }
`

export const ESTILO_CT = `
@keyframes sxEntra { from { opacity: 0; transform: translateY(18px) scale(.97) } } @keyframes sxLado { from { transform: scaleX(0) } } @keyframes sxCorre { from { left: 0 } } @keyframes sxHolo { to { background-position: 200% 0 } }
.sx-ini { display: grid; place-items: center; width: 100%; height: 100%; background: linear-gradient(135deg, #1e3a8a, #0ea5e9); color: #fefefe; font-weight: 900; font-size: 28px }
.s1-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; perspective: 1200px }
.s1.meta-h { border: 2px solid #10b981 }
.sh { margin: 12px 16px 0; padding: 10px 12px; border-radius: 14px; background: var(--portal-bg, #f8fafc); border: 1px solid var(--portal-border, #e2e8f0); display: grid; gap: 7px; transition: background .3s }
.sh.ok { background: linear-gradient(120deg, #ecfdf5, #d1fae5); border-color: #6ee7b7 }
.sh-selo { justify-self: start; display: inline-flex; gap: 6px; align-items: center; font-size: 12px; font-weight: 900; color: #fefefe; background: linear-gradient(135deg, #10b981, #047857); border-radius: 99px; padding: 3px 11px; box-shadow: 0 4px 12px rgba(16,185,129,.35); animation: shPula .5s cubic-bezier(.2,1.6,.4,1) both }
@keyframes shPula { from { transform: scale(.6); opacity: 0 } }
.sh-lin { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap } .sh-lin small { font-size: 12px; font-weight: 800; color: ${MUDO} } .sh-lin b { font-size: 16px; font-weight: 900; font-variant-numeric: tabular-nums } .sh-lin em { font-style: normal; font-size: 12px; color: ${MUDO} }
.sh.ok .sh-lin b { color: #047857 }
.sh-bar { position: relative; height: 9px; border-radius: 99px; background: #e2e8f0; overflow: visible } .sh-bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #38bdf8, #0891b2); transform-origin: left; animation: shCresce 1s cubic-bezier(.2,.9,.3,1) both }
.sh.ok .sh-bar i { background: linear-gradient(90deg, #34d399, #059669) } @keyframes shCresce { from { transform: scaleX(0) } }
.sh-meta, .sh-ideal { position: absolute; top: -3px; width: 3px; height: 15px; border-radius: 2px; background: #0f172a; transform: translateX(-50%) } .sh-ideal { background: #7c3aed }
.s1 { --rx: 0deg; --ry: 0deg; background: var(--portal-bg-card, #fefefe); border-radius: 24px; overflow: hidden; border: 1px solid #e2e8f0; transform: rotateX(var(--rx)) rotateY(var(--ry)); transition: transform .25s ease, border-color .25s; animation: sxEntra .6s cubic-bezier(.2,.8,.2,1) both } .s1:hover { border-color: #cbd5e1 }
.s1-foto { position: relative; height: 210px; overflow: hidden } .s1-foto img, .s1-foto .sx-ini { width: 100%; height: 100%; object-fit: cover; object-position: center center; transition: transform .6s } .s1:hover .s1-foto img { transform: scale(1.06) }
.s1-veu { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(15,23,42,0) 35%, rgba(15,23,42,.78)) }
.s1-nome { position: absolute; left: 18px; bottom: 14px; right: 70px; color: #fefefe } .s1-nome b { display: block; font-size: 22px; letter-spacing: -.01em; text-shadow: 0 2px 8px rgba(0,0,0,.4) } .s1-nome span { font-size: 12.5px; opacity: .9 }
.s1-liga { position: absolute; right: 14px; bottom: 10px; filter: drop-shadow(0 4px 10px rgba(0,0,0,.4)) }
.s1.abre { cursor: pointer } .s1-nome .s1-int { display: block; margin-top: 2px; font-size: 12px; opacity: .85 } .s1-nome span i { font-size: 11px; margin-right: 3px; opacity: .8 } .s1-pts { position: absolute; top: 12px; right: 12px } .s1-ver { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%) scale(.9); opacity: 0; background: rgba(15,23,42,.72); color: #fefefe; font-size: 12.5px; font-weight: 800; border-radius: 99px; padding: 7px 14px; transition: opacity .25s, transform .25s; pointer-events: none; white-space: nowrap } .s1.abre:hover .s1-ver { opacity: 1; transform: translate(-50%, -50%) scale(1) }
.s1-capa { display: grid; gap: 14px; padding: 16px 18px; transform: none !important }
.s1c-topo { display: flex; justify-content: space-between; align-items: center; gap: 8px } .s1-capa .s1-sit { position: static }
.s1c-nome { display: flex; justify-content: space-between; align-items: center; gap: 8px } .s1c-nome b { font-size: 21px; font-weight: 500; color: #0f172a }
.s1c-com { display: grid; gap: 2px; border-radius: 16px; padding: 14px 16px; background: #ecfdf5 } .s1c-com small { font-size: 13px; color: #047857 } .s1c-com b { font-size: 26px; font-weight: 500; color: #065f46; font-variant-numeric: tabular-nums } .s1c-com b .odo, .s1c-com b .odo span { font-size: 26px; color: #065f46 } .s1c-com b.vazio { color: #94a3b8 } .s1c-com span { font-size: 12.5px; color: #475569 } .s1c-com span i { color: #059669; margin-right: 3px }
.s1c-nums { display: grid; grid-template-columns: 1fr 1fr auto; gap: 14px; align-items: end }
.s1c-nums > div { display: grid; gap: 3px; min-width: 0 } .s1c-nums small { font-size: 12.5px; color: #475569 } .s1c-nums b { font-size: 15.5px; font-weight: 500; color: #0f172a; font-variant-numeric: tabular-nums; white-space: nowrap }
.s1c-nums i { display: block; height: 5px; border-radius: 99px; background: #eef2f6; overflow: hidden } .s1c-nums u { display: block; height: 100%; border-radius: 99px; transition: width .8s ease }
.s1c-nums em { font-style: normal; font-size: 12px; color: #64748b; white-space: nowrap; line-height: 5px }
.s1c-ver { justify-self: end; display: inline-flex; align-items: center; gap: 6px; padding: 2px 0; color: #1d4ed8; font-size: 13.5px; font-weight: 500; border-top: 0 } .s1-capa:hover .s1c-ver { color: #1e40af } .s1-capa:hover .s1c-ver i { transform: translateX(3px) } .s1c-ver i { transition: transform .2s }
.s1-sit { position: absolute; top: 12px; left: 12px; font-size: 12px; font-weight: 900; border-radius: 99px; padding: 4px 10px }
.s1-vels { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 10px 10px 0 } .vel svg { width: 100%; height: auto; overflow: visible }
.s1-pag { display: flex; justify-content: space-between; align-items: center; gap: 10px; margin: 4px 16px 0; padding: 12px 14px; border-radius: 16px; background: linear-gradient(120deg, #ecfdf5, #f0fdfa) }
.s1-pag small { display: block; font-size: 11px; font-weight: 900; text-transform: uppercase; color: #047857 } .s1-pag b { font-size: 24px; color: #065f46; font-variant-numeric: tabular-nums } .s1-pag b.vazio { color: ${MUDO} }
.s1-dia { display: grid; justify-items: center; background: #fefefe; border-radius: 12px; padding: 6px 10px; box-shadow: 0 2px 8px rgba(4,120,87,.12) } .s1-dia i { color: #059669 } .s1-dia b { font-size: 16px; color: #065f46 } .s1-dia small { font-size: 9.5px; text-transform: none; color: ${MUDO}; font-weight: 700 }
.s1-proj { font-size: 12.5px; color: ${MUDO}; padding: 10px 18px 16px } .s1-proj b { color: var(--portal-text, #0f172a) }
.s2 { display: grid; gap: 18px; background: var(--portal-bg-card, #fefefe); border-radius: 22px; padding: 18px 20px; box-shadow: 0 12px 30px rgba(15,23,42,.06) }
.s2-rot { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: .05em; color: ${MUDO}; margin-bottom: 8px } .s2-rot i { color: #2563eb; margin-right: 6px }
.s2-area { position: relative; display: grid; gap: 10px; padding: 26px 0 6px; background: repeating-linear-gradient(90deg, transparent 0 calc(10% - 1px), rgba(148,163,184,.18) calc(10% - 1px) 10%) }
.s2-linha { position: absolute; top: 0; bottom: 0; width: 0; border-left: 2px dashed; z-index: 0 } .s2-linha em { position: absolute; top: 0; left: 4px; white-space: nowrap; font-style: normal; font-size: 11px; font-weight: 900 }
.s2-linha.hoje { border-color: #f59e0b } .s2-linha.hoje em { color: #b45309 } .s2-linha.meta { border-color: #0f172a; border-left-style: solid } .s2-linha.meta em { color: #0f172a; left: auto; right: 4px } .s2-linha.ideal { border-color: #7c3aed } .s2-linha.ideal em { color: #7c3aed; left: auto; right: 4px }
.s2-raia { position: relative; height: 46px; border-radius: 99px; background: var(--portal-bg-secondary, #f1f5f9); transition: opacity .25s } .s2-raia.apaga { opacity: .3 }
.s2-rastro { position: absolute; left: 0; top: 50%; height: 6px; margin-top: -3px; border-radius: 99px; opacity: .55; transform-origin: left; animation: sxLado 1.4s cubic-bezier(.2,.8,.2,1) both }
.s2-carro { position: absolute; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid; overflow: hidden; background: #fefefe; box-shadow: 0 6px 14px rgba(15,23,42,.25); z-index: 2; animation: sxCorre 1.4s cubic-bezier(.2,.8,.2,1) both } .s2-carro img, .s2-carro .sx-ini { width: 100%; height: 100%; object-fit: cover; font-size: 15px }
.s2-val { position: absolute; top: 50%; transform: translate(28px, -50%); white-space: nowrap; font-size: 12.5px; color: var(--portal-text, #334155); z-index: 2; animation: sxCorre 1.4s cubic-bezier(.2,.8,.2,1) both } .s2-val b { font-size: 13px }
.s2-pags { display: flex; gap: 10px; flex-wrap: wrap; border-top: 1px dashed var(--portal-border, #e5e7eb); padding-top: 14px }
.s2-pags > div { display: flex; gap: 8px; align-items: center; border-radius: 99px; padding: 4px 12px 4px 4px; background: #ecfdf5; transition: transform .2s } .s2-pags > div.on { transform: translateY(-2px); box-shadow: 0 6px 14px rgba(4,120,87,.18) }
.s2-mini { width: 30px; height: 30px; border-radius: 50%; object-fit: cover; font-size: 11px } .s2-pags b { display: block; font-size: 12.5px } .s2-pags small { font-size: 11.5px; color: #047857; font-weight: 700 }
.s3-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 20px; perspective: 1200px }
.s3 { --rx: 0deg; --ry: 0deg; --mx: 50%; --my: 50%; position: relative; aspect-ratio: 1.42; display: grid; grid-template-rows: auto 1fr auto auto; gap: 8px; padding: 16px 18px; border-radius: 22px; overflow: hidden; background: linear-gradient(135deg, var(--la), var(--lb)); box-shadow: 0 20px 40px rgba(15,23,42,.18), inset 0 1px 0 rgba(255,255,255,.6); transform: rotateX(var(--rx)) rotateY(var(--ry)); transition: transform .2s ease; animation: sxEntra .6s cubic-bezier(.2,.8,.2,1) both }
.s3-holo { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle at var(--mx) var(--my), rgba(255,255,255,.55), transparent 40%), linear-gradient(115deg, transparent 30%, rgba(255,0,170,.12), rgba(0,200,255,.14), rgba(255,230,0,.12), transparent 70%); background-size: 100% 100%, 200% 100%; mix-blend-mode: overlay; animation: sxHolo 6s linear infinite }
.s3-topo { position: relative; display: flex; justify-content: space-between; align-items: center }
.s3-chip { width: 42px; height: 32px; border-radius: 7px; background: linear-gradient(135deg, #fde68a, #b7860b); box-shadow: inset 0 0 0 1px rgba(0,0,0,.2); position: relative } .s3-chip::after { content: ''; position: absolute; inset: 8px 6px; border: 1px solid rgba(0,0,0,.25); border-radius: 3px }
.s3-liga { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; color: rgba(15,23,42,.75) }
.s3-meio { position: relative; display: flex; gap: 12px; align-items: center } .s3-foto { width: 64px; height: 64px; border-radius: 16px; object-fit: cover; border: 2px solid rgba(255,255,255,.8); box-shadow: 0 6px 14px rgba(15,23,42,.25); font-size: 20px; overflow: hidden }
.s3-meio small { display: block; font-size: 10.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .1em; color: rgba(15,23,42,.55) } .s3-meio b { display: block; font-size: 19px; color: #0f172a } .s3-meio span { font-size: 12px; color: rgba(15,23,42,.65) }
.s3-saldo { position: relative; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; background: rgba(255,255,255,.55); backdrop-filter: blur(6px); border-radius: 14px; padding: 8px 12px } .s3-saldo small { font-size: 11px; font-weight: 900; text-transform: uppercase; color: #047857 } .s3-saldo b { font-size: 22px; color: #065f46; font-variant-numeric: tabular-nums } .s3-saldo span { font-size: 12px; color: rgba(15,23,42,.65); margin-left: auto }
.s3-metas { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 8px }
.s3-anel { display: flex; gap: 8px; align-items: center; background: rgba(255,255,255,.55); border-radius: 14px; padding: 6px 8px } .s3-anel svg { width: 52px; height: 52px; flex-shrink: 0 } .s3-anel b { display: block; font-size: 14px; color: #0f172a } .s3-anel small { font-size: 10.5px; color: rgba(15,23,42,.65) }
@media (prefers-reduced-motion: reduce) { .s1, .s3 { transform: none !important } .s3-holo { animation: none } }

/* estilo dos cartões do Faturamento por período (José, 21/10/2026): sem negrito */
.cv-num b { font-weight: 500 !important } .cv-pct { font-weight: 500 !important } .cv-frase b { font-weight: 600 }
.sh-lin small { font-weight: 500 !important; color: #475569 !important } .sh-lin b { font-weight: 500 !important; font-size: 18px !important } .sh-lin em { color: #475569 }
.cv-abas button { font-weight: 500 !important }
.s1-nome b { font-weight: 600 !important }

/* cartão do mecânico SEM foto, no estilo dos cartões do Faturamento por período (21/10/2026) */
.s1-foto.sem { height: auto !important; min-height: 0 !important; display: grid !important; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "sit pts" "nome liga"; gap: 10px 12px; align-items: start; padding: 16px 18px 12px !important; background: #fefefe !important; border-bottom: 1px solid #f1f5f9 }
.s1-foto.sem .s1-sit, .s1-foto.sem .s1-pts, .s1-foto.sem .s1-liga, .s1-foto.sem .s1-nome, .s1-foto.sem .s1-ver { position: static !important; transform: none !important; inset: auto !important }
.s1-foto.sem .s1-sit { grid-area: sit; justify-self: start } .s1-foto.sem .s1-pts { grid-area: pts; justify-self: end } .s1-foto.sem .s1-liga { grid-area: liga; align-self: center }
.s1-foto.sem .s1-nome { grid-area: nome; color: #0f172a !important; text-shadow: none !important; display: grid; gap: 4px }
.s1-foto.sem .s1-nome b { font-size: 21px !important; font-weight: 500 !important; color: #0f172a !important }
.s1-foto.sem .s1-nome span { color: #475569 !important; font-size: 13.5px !important; font-weight: 400 !important; text-shadow: none !important }
.s1-foto.sem .s1-nome span i { color: #94a3b8 }
.s1-foto.sem .s1-ver { display: none !important }
.s1 { background: #fefefe }
.s1-pag b { font-weight: 500 !important } .s1-pag small { text-transform: none !important; letter-spacing: 0 !important; font-weight: 500 !important; font-size: 13px !important }
`
