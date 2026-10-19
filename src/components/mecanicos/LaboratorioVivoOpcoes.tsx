'use client'
// 3ª leva da página de teste do "Faturamento ao vivo" (José, 17/10/2026: "sem tema de roça ou coisas
// do tipo, eu quero algo animado, que mostre muitas informações e que fique fácil de ver e entender").
// Visual de painel moderno, neutro, denso de informação e sempre vivo. Dados reais.
import { useEffect, useMemo, useState } from 'react'
import type { OSFaturada } from '@/lib/mecanicos/painel'
import { MESES } from '@/lib/mecanicos/fita'
import type { Soma } from './FaturamentoVivo'
import { brl, horas, Numero, useContador } from './ui'

export type { Bloco, PorDia } from './DestaquesGiram'
import type { Bloco, PorDia } from './DestaquesGiram'

const MUDO = 'var(--portal-text-muted, #64748b)'
const AZUL = '#2563eb'
const PARTES: [keyof Soma, string, string][] = [['servico', 'Mão de obra', '#2563eb'], ['kmValor', 'Deslocamento', '#10b981'], ['pecas', 'Peças', '#f59e0b'], ['outros', 'Outros', '#94a3b8']]
const CORES = ['#2563eb', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444']
const corDe = (n: string) => CORES[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % CORES.length]
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null)

function Delta({ a, b, rot }: { a: number; b: number; rot?: string }) {
  const p = pct(a, b)
  if (p == null) return <span className="l3-delta neutro">sem base{rot ? ` ${rot}` : ''}</span>
  return <span className={`l3-delta ${p >= 0 ? 'sobe' : 'desce'}`}>{p >= 0 ? '▲' : '▼'} {Math.abs(p)}%{rot ? <small> {rot}</small> : null}</span>
}

/** Linha que se desenha (sparkline) com a última bolinha pulsando. */
function Faisca({ valores, cor = AZUL, alt = 46 }: { valores: number[]; cor?: string; alt?: number }) {
  const max = Math.max(1, ...valores), W = 200
  const pts = valores.map((v, i) => [valores.length > 1 ? (i / (valores.length - 1)) * W : W / 2, alt - 4 - (v / max) * (alt - 10)])
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const ult = pts[pts.length - 1] || [0, alt]
  return (
    <svg viewBox={`0 0 ${W} ${alt}`} preserveAspectRatio="none" className="l3-faisca" style={{ height: alt }}>
      <path d={`${d} L${W},${alt} L0,${alt} Z`} fill={cor} opacity=".10" />
      <path d={d} fill="none" stroke={cor} strokeWidth="2.2" pathLength={1} className="l3-desenha" vectorEffect="non-scaling-stroke" />
      <circle cx={ult[0]} cy={ult[1]} r="3.5" fill={cor} className="l3-pulso" />
    </svg>
  )
}

/** Anel de progresso animado. */
function Anel({ valor, max, cor, tam = 64, espessura = 7, children }: { valor: number; max: number; cor: string; tam?: number; espessura?: number; children?: React.ReactNode }) {
  const v = useContador(max > 0 ? Math.min(1.5, valor / max) : 0, 1500)
  const R = (tam - espessura) / 2, C = 2 * Math.PI * R
  return (
    <span className="l3-anel" style={{ width: tam, height: tam }}>
      <svg width={tam} height={tam} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={tam / 2} cy={tam / 2} r={R} fill="none" stroke="var(--portal-bg-secondary, #eef2f7)" strokeWidth={espessura} />
        <circle cx={tam / 2} cy={tam / 2} r={R} fill="none" stroke={cor} strokeWidth={espessura} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, v))} />
        {v > 1 && <circle cx={tam / 2} cy={tam / 2} r={R} fill="none" stroke="#10b981" strokeWidth={espessura} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - (v - 1))} opacity=".85" />}
      </svg>
      <span className="l3-anel-txt">{children}</span>
    </span>
  )
}

/** Barra empilhada da composição (MO / km / peças / outros) que cresce. */
function Composicao({ s, fina = false }: { s: Soma; fina?: boolean }) {
  const tot = Math.max(1, PARTES.reduce((a, [k]) => a + Math.max(0, s[k] as number), 0))
  return (
    <span className={`l3-comp ${fina ? 'fina' : ''}`}>
      {PARTES.map(([k, r, c], i) => { const v = Math.max(0, s[k] as number); return v > 0 ? <i key={k} title={`${r}: ${brl(v)} (${Math.round((v / tot) * 100)}%)`} style={{ width: `${(v / tot) * 100}%`, background: c, animationDelay: `${300 + i * 120}ms` }} /> : null })}
    </span>
  )
}

// =====================================================================================
/** 1 — Painel de comando: 3 cartões ricos (valor, Δ, faísca da série, anel do período passado, composição). */
export function PainelComando({ blocos }: { blocos: Bloco[] }) {
  return (
    <div className="l3-cmd">
      {blocos.map((b, i) => {
        const r = b.ritmo
        return (
          <div key={b.chave} className="l3-cartao" style={{ animationDelay: `${i * 100}ms` }}>
            <div className="l3-c-topo"><span>{b.titulo}</span><em>{b.s.os} OS · {horas(b.s.horas)}</em></div>
            <div className="l3-c-meio">
              <div style={{ flex: 1, minWidth: 0 }}>
                <b className="l3-c-val"><Numero valor={b.s.bruto} formato={brl} /></b>
                {r && <Delta a={b.s.bruto} b={r.anterior} rot={`vs ${b.antesNome} no mesmo ponto`} />}
              </div>
              {r && r.anteriorCheio > 0 && <Anel valor={b.s.bruto} max={r.anteriorCheio} cor={AZUL}><b>{Math.round((b.s.bruto / r.anteriorCheio) * 100)}%</b><small>do {b.chave === 'mes' ? 'mês' : b.chave === 'semana' ? 'sem.' : 'dia'} passado</small></Anel>}
            </div>
            <Faisca valores={b.serie} />
            <div className="l3-c-serie"><span>{b.serieRot[0]}</span><span>{b.serieRot[b.serieRot.length - 1]}</span></div>
            <Composicao s={b.s} />
            <div className="l3-c-rodape">
              <span>ticket <b>{brl(b.s.os ? b.s.bruto / b.s.os : 0)}</b></span>
              <span>líquido <b>{brl(b.s.liquido)}</b></span>
              {r?.projecao != null && <span>projeção <b>{brl(r.projecao)}</b></span>}
            </div>
          </div>
        )
      })}
      <div className="l3-leg">{PARTES.map(([, r, c]) => <span key={r}><i style={{ background: c }} />{r}</span>)}</div>
    </div>
  )
}

/** 2 — Tabela viva: tudo lado a lado, números contando, barras de comparação dentro das células. */
export function TabelaViva({ blocos }: { blocos: Bloco[] }) {
  const colunas = ['Período', 'Agora', 'Mesmo ponto antes', 'Variação', 'Período passado inteiro', 'Projeção', 'OS', 'Ticket médio', 'Mão de obra', 'Deslocamento', 'Peças']
  return (
    <div className="l3-tab-caixa">
      <table className="l3-tab">
        <thead><tr>{colunas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {blocos.map((b, i) => {
            const r = b.ritmo, max = Math.max(b.s.bruto, r?.anterior || 0, 1)
            return (
              <tr key={b.chave} style={{ animationDelay: `${i * 120}ms` }}>
                <td><b>{b.titulo}</b></td>
                <td><b className="l3-t-azul"><Numero valor={b.s.bruto} formato={brl} /></b><span className="l3-t-barra"><i style={{ width: `${(b.s.bruto / max) * 100}%`, background: AZUL }} /></span></td>
                <td>{brl(r?.anterior || 0)}<span className="l3-t-barra"><i style={{ width: `${((r?.anterior || 0) / max) * 100}%`, background: '#94a3b8' }} /></span></td>
                <td>{r ? <Delta a={b.s.bruto} b={r.anterior} /> : '—'}</td>
                <td>{brl(r?.anteriorCheio || 0)}<small className="l3-t-sub">{r?.anteriorCheio ? `já fez ${Math.round((b.s.bruto / r.anteriorCheio) * 100)}%` : ''}</small></td>
                <td>{r?.projecao != null ? brl(r.projecao) : '—'}</td>
                <td><Numero valor={b.s.os} formato={(v) => String(Math.round(v))} /></td>
                <td>{brl(b.s.os ? b.s.bruto / b.s.os : 0)}</td>
                <td>{brl(b.s.servico)}</td>
                <td>{brl(b.s.kmValor)}</td>
                <td>{brl(b.s.pecas)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** 3 — Carrossel de destaques: cartões de "notícia" que se trocam sozinhos a cada 5 s. */
export function Destaques({ blocos, faturadas, porDia, hoje }: { blocos: Bloco[]; faturadas: OSFaturada[]; porDia: PorDia; hoje: string }) {
  const itens = useMemo(() => {
    const mes = blocos[2], ini = `${hoje.slice(0, 8)}01`
    const doMes = faturadas.filter((o) => o.data >= ini && o.data <= hoje)
    const tec: Record<string, number> = {}
    for (const o of doMes) for (const t of o.tecnicos.length ? o.tecnicos : ['Sem técnico']) tec[t] = (tec[t] || 0) + o.bruto / Math.max(1, o.tecnicos.length)
    const top = Object.entries(tec).sort((a, b) => b[1] - a[1])[0]
    const maior = [...doMes].sort((a, b) => b.bruto - a.bruto)[0]
    const dias = Object.entries(porDia).filter(([d]) => d >= ini && d <= hoje).sort((a, b) => b[1][0] - a[1][0])[0]
    const tot = Math.max(1, mes.s.bruto)
    const out: { icone: string; cor: string; titulo: string; valor: string; texto: string }[] = []
    for (const b of blocos) if (b.ritmo) { const p = pct(b.s.bruto, b.ritmo.anterior); out.push({ icone: b.chave === 'dia' ? 'fa-sun' : b.chave === 'semana' ? 'fa-calendar-week' : 'fa-calendar', cor: p == null ? '#64748b' : p >= 0 ? '#10b981' : '#ef4444', titulo: b.titulo, valor: brl(b.s.bruto), texto: p == null ? `Sem faturamento em ${b.antesNome} no mesmo ponto.` : `${Math.abs(p)}% ${p >= 0 ? 'acima' : 'abaixo'} de ${b.antesNome} no mesmo ponto (${brl(b.ritmo.anterior)}).` }) }
    if (top) out.push({ icone: 'fa-crown', cor: '#f59e0b', titulo: 'Quem mais faturou no mês', valor: top[0], texto: `${brl(top[1])} — ${Math.round((top[1] / tot) * 100)}% do mês.` })
    if (maior) out.push({ icone: 'fa-trophy', cor: '#8b5cf6', titulo: 'Maior OS do mês', valor: brl(maior.bruto), texto: `${maior.os} · ${maior.cliente || 'Omie'} · ${maior.tecnicos.join(' + ') || 'sem técnico'}.` })
    if (dias) out.push({ icone: 'fa-fire', cor: '#ef4444', titulo: 'Melhor dia do mês', valor: `${dias[0].slice(8)}/${dias[0].slice(5, 7)}`, texto: `${brl(dias[1][0])} em ${dias[1][2]} OS.` })
    out.push({ icone: 'fa-chart-pie', cor: '#06b6d4', titulo: 'De onde veio o mês', valor: `${Math.round((mes.s.servico / tot) * 100)}% mão de obra`, texto: `deslocamento ${Math.round((mes.s.kmValor / tot) * 100)}% · peças ${Math.round((mes.s.pecas / tot) * 100)}% · ticket médio ${brl(mes.s.os ? mes.s.bruto / mes.s.os : 0)}.` })
    if (mes.ritmo?.projecao != null) out.push({ icone: 'fa-bullseye', cor: AZUL, titulo: 'Se continuar assim', valor: brl(mes.ritmo.projecao), texto: `é como o mês deve fechar — ${mes.ritmo.anteriorCheio ? `${pct(mes.ritmo.projecao, mes.ritmo.anteriorCheio)! >= 0 ? 'acima' : 'abaixo'} de ${mes.antesNome} inteiro (${brl(mes.ritmo.anteriorCheio)})` : ''}.` })
    return out
  }, [blocos, faturadas, porDia, hoje])
  const [i, setI] = useState(0)
  const [pausa, setPausa] = useState(false)
  useEffect(() => { if (pausa) return; const t = setInterval(() => setI((x) => (x + 1) % itens.length), 5000); return () => clearInterval(t) }, [itens.length, pausa])
  return (
    <div className="l3-carr" onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}>
      <div className="l3-carr-palco">
        {itens.map((it, k) => {
          const pos = (k - i + itens.length) % itens.length
          const cls = pos === 0 ? 'atual' : pos === 1 ? 'prox' : pos === itens.length - 1 ? 'ant' : 'fora'
          return (
            <div key={k} className={`l3-dest ${cls}`} style={{ ['--c' as string]: it.cor }} onClick={() => setI(k)}>
              <span className="l3-dest-ic"><i className={`fas ${it.icone}`} /></span>
              <small>{it.titulo}</small>
              <b>{it.valor}</b>
              <p>{it.texto}</p>
            </div>
          )
        })}
      </div>
      <div className="l3-carr-pontos">{itens.map((_, k) => <i key={k} className={k === i ? 'on' : ''} onClick={() => setI(k)}>{k === i && !pausa && <em />}</i>)}</div>
    </div>
  )
}

/** 4 — Anéis concêntricos: dia, semana e mês como % do mesmo trecho do período passado (100% = igual). */
export function Aneis({ blocos }: { blocos: Bloco[] }) {
  const cores = ['#ef4444', '#f59e0b', AZUL]
  return (
    <div className="l3-aneis">
      <div className="l3-aneis-graf">
        {blocos.map((b, i) => <span key={b.chave} className="l3-aneis-pos" style={{ inset: i * 22 }}><Anel valor={b.s.bruto} max={b.ritmo?.anterior || 0} cor={cores[i]} tam={220 - i * 44} espessura={16} /></span>)}
        <span className="l3-aneis-centro"><small>mês</small><b><Numero valor={blocos[2].s.bruto} formato={brl} /></b></span>
      </div>
      <div className="l3-aneis-leg">
        {blocos.map((b, i) => {
          const r = b.ritmo, p = r && r.anterior > 0 ? Math.round((b.s.bruto / r.anterior) * 100) : null
          return (
            <div key={b.chave}>
              <i style={{ background: cores[i] }} />
              <div><b>{b.titulo}</b><span><Numero valor={b.s.bruto} formato={brl} /> · {b.s.os} OS</span><small>{p == null ? `sem base em ${b.antesNome}` : `${p}% do que ${b.antesNome} tinha no mesmo ponto (${brl(r!.anterior)})`}</small></div>
            </div>
          )
        })}
        <small style={{ color: MUDO }}>O anel fecha a volta quando empata com o período passado; a volta verde por cima é o que passou dele.</small>
      </div>
    </div>
  )
}

/** 5 — Mosaico: o mês dividido em blocos por técnico e por tipo (tamanho = valor). */
export function Mosaico({ faturadas, hoje, total }: { faturadas: OSFaturada[]; hoje: string; total: number }) {
  const ini = `${hoje.slice(0, 8)}01`
  const tec: Record<string, Soma> = {}
  for (const o of faturadas) {
    if (o.data < ini || o.data > hoje) continue
    const ts = o.tecnicos.length ? o.tecnicos : ['Sem técnico'], n = ts.length
    for (const t of ts) {
      const x = (tec[t] ||= { os: 0, servico: 0, kmValor: 0, pecas: 0, outros: 0, bruto: 0, custo: 0, liquido: 0, horas: 0, km: 0 })
      x.os += 1 / n; x.servico += o.servico / n; x.kmValor += o.kmValor / n; x.pecas += o.pecas / n; x.outros += Math.max(0, o.outros) / n; x.bruto += o.bruto / n
    }
  }
  const lista = Object.entries(tec).sort((a, b) => b[1].bruto - a[1].bruto)
  const [sel, setSel] = useState<string | null>(null)
  return (
    <div className="l3-mosaico-caixa">
      <div className="l3-mosaico">
        {lista.map(([n, s], i) => (
          <div key={n} className="l3-mt" style={{ flexGrow: Math.max(1, s.bruto), animationDelay: `${i * 90}ms`, borderColor: corDe(n) }} onMouseEnter={() => setSel(n)} onMouseLeave={() => setSel(null)}>
            <div className="l3-mt-cab"><span style={{ background: corDe(n) }}>{iniciais(n)}</span><b>{n}</b><em>{Math.round((s.bruto / Math.max(1, total)) * 100)}%</em></div>
            <b className="l3-mt-val">{brl(s.bruto)}</b>
            <div className="l3-mt-partes">{PARTES.map(([k, r, c]) => { const v = s[k] as number; return v > 0 ? <span key={k} style={{ flexGrow: v, background: c }} title={`${r}: ${brl(v)}`} /> : null })}</div>
            <small>{Math.round(s.os * 10) / 10} OS · ticket {brl(s.os ? s.bruto / s.os : 0)}</small>
          </div>
        ))}
      </div>
      <div className="l3-mos-info">{sel ? (() => { const s = tec[sel]; return <><b>{sel}</b>: {brl(s.bruto)} — mão de obra {brl(s.servico)} · deslocamento {brl(s.kmValor)} · peças {brl(s.pecas)}</> })() : <>O tamanho de cada bloco é quanto o técnico faturou no mês; a faixa colorida embaixo é de onde veio. Passe o mouse.</>}</div>
      <div className="l3-leg">{PARTES.map(([, r, c]) => <span key={r}><i style={{ background: c }} />{r}</span>)}</div>
    </div>
  )
}

/** 6 — Pequenos múltiplos: 6 indicadores do mês dia a dia, cada um com linha que se desenha e variação. */
export function Multiplos({ porDia, faturadas, hoje }: { porDia: PorDia; faturadas: OSFaturada[]; hoje: string }) {
  const [a, m] = hoje.split('-').map(Number)
  const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1
  const n = Number(hoje.slice(8, 10))
  const dia = (y: number, mm: number, d: number) => `${y}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const serie = (y: number, mm: number, f: (d: string) => number) => Array.from({ length: n }, (_, i) => f(dia(y, mm, i + 1)))
  const porOS = (d: string) => faturadas.filter((o) => o.data === d)
  const ind: { titulo: string; cor: string; f: (d: string) => number; soma: boolean; fmt: (v: number) => string }[] = [
    { titulo: 'Faturado por dia', cor: AZUL, f: (d) => porDia[d]?.[0] || 0, soma: true, fmt: brl },
    { titulo: 'OS faturadas por dia', cor: '#8b5cf6', f: (d) => porDia[d]?.[2] || 0, soma: true, fmt: (v) => String(Math.round(v)) },
    { titulo: 'Horas cobradas por dia', cor: '#06b6d4', f: (d) => porDia[d]?.[1] || 0, soma: true, fmt: horas },
    { titulo: 'Mão de obra por dia', cor: '#2563eb', f: (d) => porOS(d).reduce((s, o) => s + o.servico, 0), soma: true, fmt: brl },
    { titulo: 'Peças por dia', cor: '#f59e0b', f: (d) => porOS(d).reduce((s, o) => s + o.pecas, 0), soma: true, fmt: brl },
    { titulo: 'Ticket médio do dia', cor: '#10b981', f: (d) => { const l = porOS(d); return l.length ? l.reduce((s, o) => s + o.bruto, 0) / l.length : 0 }, soma: false, fmt: brl },
  ]
  return (
    <div className="l3-mult">
      {ind.map((x, i) => {
        const sa = serie(a, m, x.f), sb = serie(pa, pm, x.f)
        const va = x.soma ? sa.reduce((s, v) => s + v, 0) : sa.filter(Boolean).reduce((s, v, _, arr) => s + v / arr.length, 0)
        const vb = x.soma ? sb.reduce((s, v) => s + v, 0) : sb.filter(Boolean).reduce((s, v, _, arr) => s + v / arr.length, 0)
        return (
          <div key={x.titulo} className="l3-m" style={{ animationDelay: `${i * 80}ms` }}>
            <small>{x.titulo}</small>
            <div className="l3-m-val"><b>{x.fmt(va)}</b><Delta a={va} b={vb} rot={`vs ${MESES[pm - 1].slice(0, 3)}`} /></div>
            <Faisca valores={sa} cor={x.cor} alt={40} />
            <span className="l3-m-sub">{x.soma ? 'no mês até hoje' : 'média dos dias com faturamento'} · {MESES[pm - 1].slice(0, 3)}: {x.fmt(vb)}</span>
          </div>
        )
      })}
    </div>
  )
}

/** 7 — Quadro ao vivo: KPIs grandes no topo + linha acumulada do mês + as últimas OS chegando. */
export function QuadroVivo({ blocos, porDia, hoje, ultimos, agora }: { blocos: Bloco[]; porDia: PorDia; hoje: string; ultimos: OSFaturada[]; agora: string }) {
  const [a, m] = hoje.split('-').map(Number)
  const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate(), n = Number(hoje.slice(8, 10))
  let acA = 0, acB = 0
  const A: number[] = [], B: number[] = []
  for (let d = 1; d <= dias; d++) {
    acB += porDia[`${pa}-${String(pm).padStart(2, '0')}-${String(d).padStart(2, '0')}`]?.[0] || 0; B.push(acB)
    if (d <= n) { acA += porDia[`${hoje.slice(0, 8)}${String(d).padStart(2, '0')}`]?.[0] || 0; A.push(acA) }
  }
  const max = Math.max(1, ...A, ...B, blocos[2].ritmo?.projecao || 0)
  const W = 600, H = 170
  const xy = (v: number, i: number) => `${(i / (dias - 1)) * W},${H - 6 - (v / max) * (H - 16)}`
  const dA = A.map((v, i) => `${i ? 'L' : 'M'}${xy(v, i)}`).join(' '), dB = B.map((v, i) => `${i ? 'L' : 'M'}${xy(v, i)}`).join(' ')
  const proj = blocos[2].ritmo?.projecao
  const [vez, setVez] = useState(0)
  useEffect(() => { const t = setInterval(() => setVez((v) => v + 1), 4000); return () => clearInterval(t) }, [])
  const destaque = ultimos.length ? ultimos[vez % Math.min(6, ultimos.length)] : null
  return (
    <div className="l3-quadro">
      <div className="l3-q-kpis">
        {blocos.map((b) => <div key={b.chave}><small>{b.titulo}</small><b><Numero valor={b.s.bruto} formato={brl} /></b>{b.ritmo && <Delta a={b.s.bruto} b={b.ritmo.anterior} />}</div>)}
        <div><small>OS no mês</small><b><Numero valor={blocos[2].s.os} formato={(v) => String(Math.round(v))} /></b><span className="l3-q-sub">ticket {brl(blocos[2].s.os ? blocos[2].s.bruto / blocos[2].s.os : 0)}</span></div>
      </div>
      <div className="l3-q-graf">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <path d={`${dA} L${xy(A[A.length - 1] || 0, A.length - 1).split(',')[0]},${H} L0,${H} Z`} fill={AZUL} opacity=".1" />
          <path d={dB} fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
          <path d={dA} fill="none" stroke={AZUL} strokeWidth="3" pathLength={1} className="l3-desenha" vectorEffect="non-scaling-stroke" />
          {proj != null && A.length > 0 && <path d={`M${xy(A[A.length - 1], A.length - 1)} L${xy(proj, dias - 1)}`} stroke={AZUL} strokeWidth="2" strokeDasharray="2 5" fill="none" vectorEffect="non-scaling-stroke" />}
          {A.length > 0 && <circle cx={xy(A[A.length - 1], A.length - 1).split(',')[0]} cy={xy(A[A.length - 1], A.length - 1).split(',')[1]} r="5" fill={AZUL} className="l3-pulso" />}
        </svg>
        <div className="l3-q-leg"><span><i style={{ background: AZUL }} /> {MESES[m - 1]} acumulado</span><span><i style={{ background: '#94a3b8' }} /> {MESES[pm - 1]}</span>{proj != null && <span>projeção: <b>{brl(proj)}</b></span>}</div>
      </div>
      {destaque && (
        <div key={`${destaque.os}-${vez}`} className="l3-q-chega">
          <span className="l3-q-av" style={{ background: corDe(destaque.tecnicos[0] || 'Omie') }}>{iniciais(destaque.tecnicos[0] || 'Omie')}</span>
          <span><b>{destaque.os}</b> · {destaque.cliente || 'Omie'} · {destaque.tecnicos.join(' + ') || 'sem técnico'}</span>
          <b className="l3-q-v">{brl(destaque.bruto)}</b>
          <small>{destaque.em && destaque.data === agora.slice(0, 10) ? `hoje ${destaque.em.slice(11, 16)}` : `${destaque.data.slice(8)}/${destaque.data.slice(5, 7)}`}</small>
        </div>
      )}
    </div>
  )
}

/** 8 — Barras por técnico: este mês contra o mês passado no mesmo ponto, empilhado por tipo. */
export function BarrasTecnicos({ faturadas, hoje }: { faturadas: OSFaturada[]; hoje: string }) {
  const [a, m] = hoje.split('-').map(Number)
  const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1
  const n = Number(hoje.slice(8, 10))
  const fimAnt = `${pa}-${String(pm).padStart(2, '0')}-${String(Math.min(n, new Date(Date.UTC(pa, pm, 0)).getUTCDate())).padStart(2, '0')}`
  const soma = (de: string, ate: string) => {
    const r: Record<string, Soma> = {}
    for (const o of faturadas) {
      if (o.data < de || o.data > ate) continue
      const ts = o.tecnicos.length ? o.tecnicos : ['Sem técnico'], k = ts.length
      for (const t of ts) { const x = (r[t] ||= { os: 0, servico: 0, kmValor: 0, pecas: 0, outros: 0, bruto: 0, custo: 0, liquido: 0, horas: 0, km: 0 }); x.os += 1 / k; x.servico += o.servico / k; x.kmValor += o.kmValor / k; x.pecas += o.pecas / k; x.outros += Math.max(0, o.outros) / k; x.bruto += o.bruto / k; x.horas += o.horasCobradas / k }
    }
    return r
  }
  const A = soma(`${hoje.slice(0, 8)}01`, hoje), B = soma(`${fimAnt.slice(0, 8)}01`, fimAnt)
  const nomes = [...new Set([...Object.keys(A), ...Object.keys(B)])].sort((x, y) => (A[y]?.bruto || 0) - (A[x]?.bruto || 0))
  const max = Math.max(1, ...nomes.map((t) => Math.max(A[t]?.bruto || 0, B[t]?.bruto || 0)))
  return (
    <div className="l3-bt">
      {nomes.map((t, i) => {
        const s = A[t], sb = B[t]
        return (
          <div key={t} className="l3-bt-lin" style={{ animationDelay: `${i * 90}ms` }}>
            <span className="l3-bt-av" style={{ background: corDe(t) }}>{iniciais(t)}</span>
            <div className="l3-bt-meio">
              <div className="l3-bt-nome"><b>{t}</b><span>{s ? `${Math.round(s.os * 10) / 10} OS · ${horas(s.horas)}` : 'sem OS'}</span><b className="l3-bt-v"><Numero valor={s?.bruto || 0} formato={brl} /></b>{sb && <Delta a={s?.bruto || 0} b={sb.bruto} />}</div>
              <span className="l3-bt-barra">{s && PARTES.map(([k, r, c], j) => { const v = s[k] as number; return v > 0 ? <i key={k} title={`${r}: ${brl(v)}`} style={{ width: `${(v / max) * 100}%`, background: c, animationDelay: `${300 + i * 90 + j * 80}ms` }} /> : null })}</span>
              <span className="l3-bt-barra fina"><i style={{ width: `${((sb?.bruto || 0) / max) * 100}%`, background: '#cbd5e1' }} /></span>
            </div>
          </div>
        )
      })}
      <div className="l3-leg">{PARTES.map(([, r, c]) => <span key={r}><i style={{ background: c }} />{r}</span>)}<span><i style={{ background: '#cbd5e1' }} />{MESES[pm - 1]} no mesmo ponto</span></div>
    </div>
  )
}

export const ESTILO_OPCOES = `
.l3-delta { font-size: 12px; font-weight: 800; white-space: nowrap; border-radius: 99px; padding: 2px 8px; display: inline-block }
.l3-delta.sobe { color: #047857; background: #ecfdf5 } .l3-delta.desce { color: #b91c1c; background: #fef2f2 } .l3-delta.neutro { color: ${MUDO}; background: var(--portal-bg-secondary, #f1f5f9) }
.l3-delta small { font-weight: 600; opacity: .8 }
.l3-faisca { width: 100%; display: block }
.l3-desenha { stroke-dasharray: 1; stroke-dashoffset: 1; animation: l3Desenha 1.6s .2s cubic-bezier(.3,.7,.3,1) forwards }
@keyframes l3Desenha { to { stroke-dashoffset: 0 } }
.l3-pulso { animation: l3Pulso 1.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center } @keyframes l3Pulso { 50% { transform: scale(1.7); opacity: .55 } }
.l3-anel { position: relative; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0 }
.l3-anel-txt { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; line-height: 1.05 } .l3-anel-txt b { font-size: 14px } .l3-anel-txt small { font-size: 8.5px; color: ${MUDO} }
.l3-comp { display: flex; height: 8px; border-radius: 99px; overflow: hidden; background: var(--portal-bg-secondary, #f1f5f9); gap: 2px } .l3-comp.fina { height: 5px }
.l3-comp i { display: block; height: 100%; transform-origin: left; animation: l3Cresce .8s cubic-bezier(.2,.8,.2,1) both } @keyframes l3Cresce { from { transform: scaleX(0) } }
.l3-leg { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: ${MUDO}; grid-column: 1 / -1 } .l3-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px }
.l3-cmd { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px }
.l3-cartao { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 14px 16px; display: grid; gap: 8px; animation: cpvEntra .5s both; transition: transform .2s, box-shadow .2s }
.l3-cartao:hover { transform: translateY(-3px); box-shadow: 0 14px 30px rgba(15,23,42,.10) }
.l3-c-topo { display: flex; justify-content: space-between; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; color: ${MUDO} } .l3-c-topo em { font-style: normal; text-transform: none; letter-spacing: 0; font-weight: 600 }
.l3-c-meio { display: flex; gap: 10px; align-items: center } .l3-c-val { display: block; font-size: 28px; font-weight: 900; color: var(--portal-text, #0f172a); font-variant-numeric: tabular-nums; margin-bottom: 4px }
.l3-c-serie { display: flex; justify-content: space-between; font-size: 10px; color: ${MUDO}; margin-top: -6px }
.l3-c-rodape { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: ${MUDO} } .l3-c-rodape b { color: var(--portal-text, #0f172a) }
.l3-tab-caixa { overflow-x: auto; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px }
.l3-tab { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums }
.l3-tab th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: ${MUDO}; padding: 10px 12px; border-bottom: 1px solid var(--portal-border, #e5e7eb); white-space: nowrap }
.l3-tab td { padding: 12px; border-bottom: 1px solid var(--portal-border, #f1f5f9); white-space: nowrap; vertical-align: top }
.l3-tab tbody tr { animation: cpvEntra .5s both; transition: background .15s } .l3-tab tbody tr:hover { background: var(--portal-bg-secondary, #f8fafc) }
.l3-t-azul { color: ${AZUL}; font-size: 15px } .l3-t-barra { display: block; height: 5px; border-radius: 99px; background: var(--portal-bg-secondary, #f1f5f9); margin-top: 5px; min-width: 90px; overflow: hidden }
.l3-t-barra i { display: block; height: 100%; border-radius: 99px; transform-origin: left; animation: l3Cresce 1s .3s both } .l3-t-sub { display: block; font-size: 11px; color: ${MUDO} }
.l3-carr { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 16px; overflow: hidden }
.l3-carr-palco { position: relative; height: 200px; perspective: 1000px }
.l3-dest { --c: ${AZUL}; position: absolute; top: 0; left: 50%; width: min(440px, 80%); height: 190px; margin-left: calc(min(440px, 80%) / -2); border-radius: 18px; padding: 16px 18px; background: linear-gradient(150deg, color-mix(in srgb, var(--c) 14%, var(--portal-bg-card, #fefefe)), var(--portal-bg-card, #fefefe) 70%); border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); box-shadow: 0 12px 30px rgba(15,23,42,.10); transition: transform .7s cubic-bezier(.2,.8,.2,1), opacity .7s; cursor: pointer; display: grid; align-content: start; gap: 4px }
.l3-dest.atual { transform: none; opacity: 1; z-index: 3 } .l3-dest.prox { transform: translateX(62%) scale(.82) rotateY(-18deg); opacity: .55; z-index: 2 } .l3-dest.ant { transform: translateX(-62%) scale(.82) rotateY(18deg); opacity: .55; z-index: 2 } .l3-dest.fora { transform: scale(.6); opacity: 0; z-index: 1; pointer-events: none }
.l3-dest-ic { width: 38px; height: 38px; border-radius: 12px; background: var(--c); color: #fefefe; display: flex; align-items: center; justify-content: center; font-size: 17px; box-shadow: 0 6px 14px color-mix(in srgb, var(--c) 40%, transparent) }
.l3-dest small { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: ${MUDO}; margin-top: 4px } .l3-dest b { font-size: 26px; font-weight: 900; color: var(--portal-text, #0f172a) } .l3-dest p { margin: 0; font-size: 13.5px; color: var(--portal-text, #334155) }
.l3-carr-pontos { display: flex; justify-content: center; gap: 6px; margin-top: 10px }
.l3-carr-pontos i { position: relative; width: 8px; height: 8px; border-radius: 99px; background: var(--portal-border, #cbd5e1); cursor: pointer; overflow: hidden; transition: width .3s } .l3-carr-pontos i.on { width: 34px }
.l3-carr-pontos em { position: absolute; inset: 0; background: ${AZUL}; transform-origin: left; animation: l3Tempo 5s linear both } @keyframes l3Tempo { from { transform: scaleX(0) } }
.l3-aneis { display: flex; gap: 24px; align-items: center; flex-wrap: wrap; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 16px 20px }
.l3-aneis-graf { position: relative; width: 220px; height: 220px; flex-shrink: 0 } .l3-aneis-pos { position: absolute; display: flex; align-items: center; justify-content: center }
.l3-aneis-centro { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center } .l3-aneis-centro small { font-size: 10px; text-transform: uppercase; color: ${MUDO}; font-weight: 800 } .l3-aneis-centro b { font-size: 15px }
.l3-aneis-leg { display: grid; gap: 12px; flex: 1; min-width: 260px } .l3-aneis-leg > div { display: flex; gap: 10px } .l3-aneis-leg > div > i { width: 12px; height: 12px; border-radius: 4px; margin-top: 4px; flex-shrink: 0 }
.l3-aneis-leg b { display: block; font-size: 14px } .l3-aneis-leg span { display: block; font-size: 20px; font-weight: 900 } .l3-aneis-leg small { font-size: 12.5px; color: ${MUDO} }
.l3-mosaico-caixa { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 14px; display: grid; gap: 10px }
.l3-mosaico { display: flex; flex-wrap: wrap; gap: 8px }
.l3-mt { flex-basis: 160px; min-height: 120px; border-radius: 14px; border: 2px solid; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; background: var(--portal-bg, #f8fafc); animation: l3Pop .6s cubic-bezier(.2,1.3,.4,1) both; transition: transform .2s } .l3-mt:hover { transform: scale(1.02) }
@keyframes l3Pop { from { transform: scale(.7); opacity: 0 } }
.l3-mt-cab { display: flex; align-items: center; gap: 6px; font-size: 13px } .l3-mt-cab span { width: 24px; height: 24px; border-radius: 50%; color: #fefefe; font-size: 10px; font-weight: 900; display: flex; align-items: center; justify-content: center } .l3-mt-cab em { margin-left: auto; font-style: normal; font-weight: 900; color: ${MUDO} }
.l3-mt-val { font-size: 22px; font-weight: 900 } .l3-mt-partes { display: flex; height: 8px; border-radius: 99px; overflow: hidden; gap: 2px; margin-top: auto } .l3-mt small { font-size: 11.5px; color: ${MUDO} }
.l3-mos-info { font-size: 13px; color: ${MUDO} } .l3-mos-info b { color: var(--portal-text, #0f172a) }
.l3-mult { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px }
.l3-m { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 12px 14px; display: grid; gap: 4px; animation: cpvEntra .5s both }
.l3-m > small { font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .4px; color: ${MUDO} } .l3-m-val { display: flex; align-items: center; gap: 8px; flex-wrap: wrap } .l3-m-val b { font-size: 22px; font-weight: 900 } .l3-m-sub { font-size: 11.5px; color: ${MUDO} }
.l3-quadro { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 14px 16px; display: grid; gap: 12px }
.l3-q-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px } .l3-q-kpis > div { display: grid; gap: 2px; border-left: 3px solid ${AZUL}; padding-left: 10px }
.l3-q-kpis small { font-size: 11.5px; font-weight: 800; text-transform: uppercase; color: ${MUDO} } .l3-q-kpis b { font-size: 22px; font-weight: 900 } .l3-q-sub { font-size: 12px; color: ${MUDO} }
.l3-q-graf svg { width: 100%; height: 170px; display: block } .l3-q-leg { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: ${MUDO} } .l3-q-leg i { display: inline-block; width: 14px; height: 4px; border-radius: 2px; margin-right: 5px; vertical-align: 2px } .l3-q-leg b { color: var(--portal-text, #0f172a) }
.l3-q-chega { display: flex; align-items: center; gap: 10px; background: var(--portal-bg-secondary, #f8fafc); border-radius: 12px; padding: 8px 12px; font-size: 13px; animation: l3Chega .6s cubic-bezier(.2,1.2,.4,1) both }
@keyframes l3Chega { from { transform: translateY(14px); opacity: 0 } }
.l3-q-av { width: 30px; height: 30px; border-radius: 50%; color: #fefefe; font-size: 11px; font-weight: 900; display: flex; align-items: center; justify-content: center; flex-shrink: 0 } .l3-q-v { margin-left: auto; font-size: 15px; color: ${AZUL} } .l3-q-chega small { color: ${MUDO} }
.l3-bt { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 14px 16px; display: grid; gap: 12px }
.l3-bt-lin { display: flex; gap: 10px; align-items: center; animation: cpvEntra .5s both } .l3-bt-av { width: 34px; height: 34px; border-radius: 50%; color: #fefefe; font-size: 12px; font-weight: 900; display: flex; align-items: center; justify-content: center; flex-shrink: 0 }
.l3-bt-meio { flex: 1; display: grid; gap: 4px; min-width: 0 } .l3-bt-nome { display: flex; gap: 10px; align-items: center; font-size: 13.5px; flex-wrap: wrap } .l3-bt-nome span { color: ${MUDO}; font-size: 12px } .l3-bt-v { margin-left: auto; font-size: 15px }
.l3-bt-barra { display: flex; height: 14px; border-radius: 99px; overflow: hidden; background: var(--portal-bg-secondary, #f1f5f9); gap: 2px } .l3-bt-barra.fina { height: 5px }
.l3-bt-barra i { display: block; height: 100%; transform-origin: left; animation: l3Cresce .8s cubic-bezier(.2,.8,.2,1) both }
@media (prefers-reduced-motion: reduce) { .l3-desenha, .l3-pulso, .l3-comp i, .l3-carr-pontos em, .l3-bt-barra i, .l3-t-barra i { animation: none !important; stroke-dashoffset: 0 } }
`
