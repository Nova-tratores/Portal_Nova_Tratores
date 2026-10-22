'use client'
// Opções do bloco de escolher o período (Dia / Semana / Mês / Ano + barras) — página de teste
// (José, 19/10/2026: "faz lá no teste agora opções para esse"). Cada opção funciona de verdade com
// os dados reais: escolhe o período ali dentro e o resumo muda. Nada aqui muda o Painel.
import { useEffect, useMemo, useRef, useState } from 'react'
import { periodos, andarPeriodo, segundaDa, type Escala } from '@/lib/mecanicos/painel'
import { somar, MESES, type PorDia } from '@/lib/mecanicos/fita'
import { brl, horas, Numero, useContador } from './ui'
import type { OSFaturada } from '@/lib/mecanicos/painel'
import { JanelaOSParada } from './ParadoOpcoes'

const MUDO = 'var(--portal-text-muted, #64748b)'
const AZUL = '#2563eb'
const ESCALAS: [Escala, string][] = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano']]
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
function somaDias(d: string, n: number) { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
function diaSem(d: string) { return new Date(`${d}T12:00:00Z`).getUTCDay() }
function ultimoDia(a: number, m: number) { return new Date(Date.UTC(a, m, 0)).getUTCDate() }
const br = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`
const k = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v > 0 ? String(Math.round(v)) : '')
function rotuloPeriodo(e: Escala, de: string, ate: string) {
  if (e === 'dia') return `${SEM[diaSem(de)]} ${br(de)}`
  if (e === 'semana') return `Semana ${br(de)} – ${br(ate)}`
  if (e === 'mes') return `${MESES[Number(de.slice(5, 7)) - 1]} de ${de.slice(0, 4)}`
  return `Ano de ${de.slice(0, 4)}`
}
const NOME_ANT: Record<Escala, string> = { dia: 'mesmo dia da semana passada', semana: 'semana anterior', mes: 'mês anterior', ano: 'ano anterior' }

/** Resumo do período escolhido (comum às opções): total, OS, horas, ticket e comparação com o anterior. */
function Resumo({ porDia, escala, refDia, hoje }: { porDia: PorDia; escala: Escala; refDia: string; hoje: string }) {
  const p = periodos(escala, refDia, 1)[0]
  const ate = p.ate > hoje ? hoje : p.ate
  const s = somar(porDia, p.de, ate)
  const pa = periodos(escala, escala === 'dia' ? somaDias(refDia, -7) : andarPeriodo(escala, refDia, -1), 1)[0]
  const andamento = p.ate > hoje
  // período em andamento: compara com o mesmo trecho do anterior
  const ateAnt = andamento ? somaDias(pa.de, Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${p.de}T12:00:00Z`)) / 86_400_000)) : pa.ate
  const sa = somar(porDia, pa.de, ateAnt)
  const dif = sa.bruto > 0 ? Math.round(((s.bruto - sa.bruto) / sa.bruto) * 100) : null
  return (
    <div className="so-res" key={`${escala}:${p.de}`}>
      <div className="so-res-tit"><b>{maiuscula(rotuloPeriodo(escala, p.de, p.ate))}</b>{andamento && <span className="so-vivo"><i /> em andamento</span>}</div>
      <div className="so-res-nums">
        <div><small>Faturado</small><b className="so-big"><Numero valor={s.bruto} formato={brl} /></b></div>
        <div><small>OS</small><b><Numero valor={s.os} formato={(v) => String(Math.round(v))} /></b></div>
        <div><small>Horas cobradas</small><b>{horas(s.horas)}</b></div>
        <div><small>Ticket médio</small><b>{brl(s.os ? s.bruto / s.os : 0)}</b></div>
        <div><small>vs {NOME_ANT[escala]}{andamento ? ' (mesmo trecho)' : ''}</small><b style={{ color: dif == null ? MUDO : dif >= 0 ? '#047857' : '#b91c1c' }}>{dif == null ? '—' : `${dif >= 0 ? '▲' : '▼'} ${Math.abs(dif)}%`}</b><span>{brl(sa.bruto)}</span></div>
      </div>
    </div>
  )
}

/** Abas com pílula deslizante (usada em várias opções). */
function Abas({ escala, onEscala }: { escala: Escala; onEscala: (e: Escala) => void }) {
  const i = ESCALAS.findIndex(([e]) => e === escala)
  return (
    <div className="so-abas">
      <span className="so-pilula" style={{ transform: `translateX(${i * 100}%)` }} />
      {ESCALAS.map(([e, r]) => <button key={e} type="button" className={e === escala ? 'on' : ''} onClick={() => onEscala(e)}>{r}</button>)}
    </div>
  )
}

// ============================================================================
type ModoComp = 'anterior' | 'ano' | 'escolhido' | 'datas'
const NOME_UNID: Record<Escala, [string, string]> = { dia: ['dia', 'dias'], semana: ['semana', 'semanas'], mes: ['mês', 'meses'], ano: ['ano', 'anos'] }
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const curtoDe = (e: Escala, de: string) => e === 'dia' ? `${SEM[diaSem(de)]} ${de.slice(8)}/${de.slice(5, 7)}` : e === 'semana' ? `sem. ${br(de)}` : e === 'mes' ? `${MESES[Number(de.slice(5, 7)) - 1].slice(0, 3)}/${de.slice(2, 4)}` : de.slice(0, 4)

/** O período com que B é comparado para cada A: anterior, mesmo do ano passado ou um escolhido. */
function periodoB(e: Escala, de: string, modo: ModoComp, escolhido: string | null) {
  if (modo === 'escolhido' && escolhido) return periodos(e, escolhido, 1)[0]
  if (modo === 'ano') return periodos(e, e === 'ano' ? andarPeriodo('ano', de, -1) : `${Number(de.slice(0, 4)) - 1}${de.slice(4)}`, 1)[0]
  return periodos(e, e === 'dia' ? somaDias(de, -7) : andarPeriodo(e, de, -1), 1)[0]
}
function nomeComp(e: Escala, modo: ModoComp) {
  if (modo === 'ano') return `mesmo ${NOME_UNID[e][0]} do ano passado`
  if (modo === 'escolhido') return `o ${NOME_UNID[e][0]} escolhido para comparar`
  if (modo === 'datas') return 'as datas escolhidas'
  return e === 'dia' ? 'mesmo dia da semana passada' : `${NOME_UNID[e][0]} anterior`
}

/** Quadro A × B: faturado, OS, horas e ticket lado a lado, com a diferença em R$ e em %. */
function Comparativo({ porDia, a, b, hoje, rotA, rotB }: { porDia: PorDia; a: { de: string; ate: string }; b: { de: string; ate: string }; hoje: string; rotA: string; rotB: string }) {
  const andamento = a.ate > hoje
  const ateA = andamento ? hoje : a.ate
  // período em andamento: B só até o mesmo ponto (senão compara meio mês com mês inteiro)
  const dias = Math.round((Date.parse(`${ateA}T12:00:00Z`) - Date.parse(`${a.de}T12:00:00Z`)) / 86_400_000)
  const ateB = andamento && b.ate > somaDias(b.de, dias) ? somaDias(b.de, dias) : b.ate
  const sa = somar(porDia, a.de, ateA), sb = somar(porDia, b.de, ateB)
  const linhas: [string, number, number, (v: number) => string][] = [
    ['Faturado', sa.bruto, sb.bruto, brl], ['OS faturadas', sa.os, sb.os, (v) => String(Math.round(v))], ['Horas cobradas', sa.horas, sb.horas, horas],
    ['Ticket médio (faturado ÷ OS)', sa.os ? sa.bruto / sa.os : 0, sb.os ? sb.bruto / sb.os : 0, brl],
  ]
  return (
    <div className="so-cmp" key={`${a.de}:${b.de}`}>
      <div className="so-cmp-cab">
        <span className="so-cmp-a"><i /> A · {rotA}{andamento ? ' (até hoje)' : ''}</span>
        <b>×</b>
        <span className="so-cmp-b"><i /> B · {rotB}{andamento && ateB !== b.ate ? ` (até o mesmo ponto: ${br(ateB)})` : ''}</span>
      </div>
      <table className="so-cmp-tab">
        <thead><tr><th /><th>A</th><th>B</th><th>Diferença</th><th /></tr></thead>
        <tbody>
          {linhas.map(([r, va, vb, f], i) => {
            const d = va - vb, p = vb ? Math.round((d / vb) * 100) : null, max = Math.max(va, vb, 1)
            return (
              <tr key={r} style={{ animationDelay: `${i * 70}ms` }}>
                <td>{r}</td>
                <td className="so-cmp-va"><b><Numero valor={va} formato={f} /></b></td>
                <td className="so-cmp-vb">{f(vb)}</td>
                <td style={{ color: d >= 0 ? '#047857' : '#b91c1c', fontWeight: 900 }}>{d >= 0 ? '▲ +' : '▼ −'}{f(Math.abs(d))}{p != null && <small> ({d >= 0 ? '+' : ''}{p}%)</small>}</td>
                <td className="so-cmp-bars"><span><i className="a" style={{ width: `${(va / max) * 100}%` }} /></span><span><i className="b" style={{ width: `${(vb / max) * 100}%` }} /></span></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="so-cmp-frase">
        {sb.bruto > 0
          ? <>{rotA} faturou <b>{brl(sa.bruto)}</b>, {sa.bruto >= sb.bruto ? <b style={{ color: '#047857' }}>{brl(sa.bruto - sb.bruto)} a mais</b> : <b style={{ color: '#b91c1c' }}>{brl(sb.bruto - sa.bruto)} a menos</b>} que {rotB} ({sa.bruto >= sb.bruto ? '+' : ''}{Math.round(((sa.bruto - sb.bruto) / sb.bruto) * 100)}%). {sa.os !== sb.os && <>Foram {sa.os} OS contra {sb.os}{sa.os && sb.os ? <>, com ticket médio de {brl(sa.bruto / sa.os)} contra {brl(sb.bruto / sb.os)}</> : null}.</>}</>
          : <>{rotB} não teve faturamento para comparar.</>}
      </p>
    </div>
  )
}

/** S1 — Barras com comparação (escolhida pelo José, 19/10): abas, setas, barras com valor e ▲▼, e a
 *  função de COMPARAR (período anterior · mesmo período do ano passado · qualquer outro escolhido). */
export function SeletorBarras({ porDia, hoje }: { porDia: PorDia; hoje: string }) {
  const [escala, setEscala] = useState<Escala>('mes')
  const [ref, setRef] = useState(hoje)
  const [modo, setModo] = useState<ModoComp>('anterior')
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [escolhendo, setEscolhendo] = useState(false)
  const sel = periodos(escala, ref, 1)[0]
  const cols = useMemo(() => {
    const n = { dia: 14, semana: 10, mes: 12, ano: 4 }[escala]
    return periodos(escala, ref > hoje ? hoje : ref, n).map((b) => {
      const atual = somar(porDia, b.de, b.ate > hoje ? hoje : b.ate).bruto
      const pb = periodoB(escala, b.de, modo === 'escolhido' ? 'anterior' : modo, null)
      const antes = somar(porDia, pb.de, pb.ate).bruto
      return { ...b, atual, antes, futuro: b.de > hoje }
    })
  }, [escala, ref, porDia, hoje, modo])
  const max = Math.max(1, ...cols.flatMap((c) => [c.atual, modo === 'escolhido' ? 0 : c.antes]))
  const b = periodoB(escala, sel.de, modo, escolhido)
  const trocarEscala = (e: Escala) => { setEscala(e); setRef(hoje); setEscolhido(null); setEscolhendo(false); if (modo === 'escolhido') setModo('anterior') }
  const clicar = (de: string) => {
    if (escolhendo) { setEscolhido(de); setModo('escolhido'); setEscolhendo(false) } else setRef(de)
  }
  const legendaCinza = modo === 'escolhido' ? null : nomeComp(escala, modo)
  return (
    <div className="so-caixa">
      <div className="so-topo">
        <Abas escala={escala} onEscala={trocarEscala} />
        <div className="so-nav">
          <button type="button" onClick={() => setRef(andarPeriodo(escala, ref, -1))} title={`${maiuscula(NOME_UNID[escala][0])} anterior`}><i className="fas fa-chevron-left" /></button>
          <button type="button" onClick={() => setRef(hoje)}>agora</button>
          <button type="button" disabled={sel.ate >= hoje} onClick={() => setRef(andarPeriodo(escala, ref, 1))} title={`Próximo ${NOME_UNID[escala][0]}`}><i className="fas fa-chevron-right" /></button>
        </div>
      </div>

      {/* comparar */}
      <div className="so-comp">
        <span className="so-comp-rot"><i className="fas fa-code-compare" /> Comparar com</span>
        {(['anterior', 'ano'] as const).map((m) => <button key={m} type="button" className={modo === m && !escolhendo ? 'on' : ''} onClick={() => { setModo(m); setEscolhendo(false) }}>{nomeComp(escala, m)}</button>)}
        <button type="button" className={`${modo === 'escolhido' || escolhendo ? 'on laranja' : ''} ${escolhendo ? 'piscando' : ''}`} onClick={() => setEscolhendo((v) => !v)}>
          <i className="fas fa-hand-pointer" /> {escolhendo ? `clique na barra do ${NOME_UNID[escala][0]} para comparar…` : modo === 'escolhido' && escolhido ? `outro ${NOME_UNID[escala][0]}: ${curtoDe(escala, escolhido)} (trocar)` : `outro ${NOME_UNID[escala][0]} (escolher)`}
        </button>
      </div>

      <div className={`so-barras ${escolhendo ? 'escolhendo' : ''}`} key={`${escala}:${cols[0]?.de}:${modo}`}>
        {cols.map((c, i) => {
          const on = c.de === sel.de, ehB = modo === 'escolhido' && c.de === escolhido
          const p = !c.futuro && modo !== 'escolhido' && c.antes > 0 ? Math.round(((c.atual - c.antes) / c.antes) * 100) : null
          return (
            <button key={c.de} type="button" disabled={c.futuro} className={`so-col ${on ? 'on' : ''} ${ehB ? 'ehb' : ''}`} onClick={() => clicar(c.de)}
              title={`${maiuscula(rotuloPeriodo(escala, c.de, c.ate))}: ${brl(c.atual)}${modo !== 'escolhido' ? ` · ${legendaCinza}: ${brl(c.antes)}` : ''}`}>
              {on && <span className="so-tag">A</span>}{ehB && <span className="so-tag b">B</span>}
              <em>{k(c.atual)}</em>
              <span className="so-par">
                {modo !== 'escolhido' && <i className="b" style={{ height: `${(c.antes / max) * 100}%` }} />}
                <i className="a" style={{ height: `${Math.max(2, (c.atual / max) * 100)}%`, animationDelay: `${i * 40}ms` }} />
              </span>
              <small>{curtoDe(escala, c.de)}</small>
              {p != null && <span className={`so-delta ${p >= 0 ? 'up' : 'down'}`}>{p >= 0 ? '▲' : '▼'}{Math.abs(p)}%</span>}
            </button>
          )
        })}
      </div>
      <div className="so-leg">
        <span><i style={{ background: AZUL }} /> <b>barra azul</b> = quanto faturou no {NOME_UNID[escala][0]}</span>
        {legendaCinza && <span><i style={{ background: '#cbd5e1' }} /> <b>barra cinza</b> = {legendaCinza}</span>}
        {legendaCinza && <span><b style={{ color: '#047857' }}>▲</b>/<b style={{ color: '#b91c1c' }}>▼</b> = quanto o azul ficou acima ou abaixo do cinza</span>}
        <span><b className="so-tag-leg">A</b> = {NOME_UNID[escala][0]} escolhido{modo === 'escolhido' ? <> · <b className="so-tag-leg b">B</b> = comparado</> : null} · clique numa barra para escolher</span>
      </div>
      <Comparativo porDia={porDia} a={sel} b={b} hoje={hoje} rotA={maiuscula(rotuloPeriodo(escala, sel.de, sel.ate))} rotB={rotuloPeriodo(escala, b.de, b.ate)} />
    </div>
  )
}

/** S2 — Calendário de calor: o mês em grade; clique no dia, na semana (linha) ou no nome do mês. */
export function SeletorCalendario({ porDia, hoje }: { porDia: PorDia; hoje: string }) {
  const [mes, setMes] = useState(hoje.slice(0, 7))
  const [escala, setEscala] = useState<Escala>('dia')
  const [ref, setRef] = useState(hoje)
  const [a, m] = mes.split('-').map(Number)
  const n = ultimoDia(a, m)
  const ini = `${mes}-01`
  const vazio = (diaSem(ini) + 6) % 7
  const dias = Array.from({ length: n }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)
  const max = Math.max(1, ...dias.map((d) => porDia[d]?.[0] || 0))
  const semanas: string[][] = []
  const celulas = [...Array(vazio).fill(''), ...dias]
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7))
  const sel = periodos(escala, ref, 1)[0]
  const dentro = (d: string) => d >= sel.de && d <= sel.ate
  const andaMes = (x: number) => { const mm = m + x, y = a + Math.floor((mm - 1) / 12), r = ((mm - 1) % 12 + 12) % 12 + 1; setMes(`${y}-${String(r).padStart(2, '0')}`) }
  return (
    <div className="so-caixa so-cal-lado">
      <div className="so-cal">
        <div className="so-cal-cab">
          <button type="button" onClick={() => andaMes(-1)}><i className="fas fa-chevron-left" /></button>
          <button type="button" className={`so-cal-mes ${escala === 'mes' && sel.de === ini ? 'on' : ''}`} onClick={() => { setEscala('mes'); setRef(ini) }} title="Escolher o mês inteiro">{MESES[m - 1]} {a} <small>{brl(somar(porDia, ini, `${mes}-${n}`).bruto)}</small></button>
          <button type="button" disabled={mes >= hoje.slice(0, 7)} onClick={() => andaMes(1)}><i className="fas fa-chevron-right" /></button>
        </div>
        <div className="so-cal-grade">
          <span /> {['S', 'T', 'Q', 'Q', 'S', 'S', 'D'].map((x, i) => <span key={i} className="so-cal-sem">{x}</span>)}
          {semanas.map((linha, li) => {
            const seg = linha.find(Boolean) ? segundaDa(linha.find(Boolean)!) : ''
            return [
              <button key={`s${li}`} type="button" className={`so-cal-linha ${escala === 'semana' && sel.de === seg ? 'on' : ''}`} onClick={() => { setEscala('semana'); setRef(seg) }} title="Escolher a semana"><i className="fas fa-arrow-right" /></button>,
              ...Array.from({ length: 7 }, (_, j) => {
                const d = linha[j]
                if (!d) return <span key={`${li}-${j}`} />
                const v = porDia[d]?.[0] || 0, fut = d > hoje
                return (
                  <button key={d} type="button" disabled={fut} className={`so-dia ${dentro(d) ? 'sel' : ''} ${d === hoje ? 'hoje' : ''}`} onClick={() => { setEscala('dia'); setRef(d) }}
                    style={{ background: fut ? 'transparent' : v ? `rgba(37,99,235,${0.12 + 0.75 * Math.sqrt(v / max)})` : undefined, color: v > max * 0.45 ? '#fefefe' : undefined }}>
                    <b>{Number(d.slice(8))}</b><small>{k(v)}</small>
                  </button>
                )
              }),
            ]
          })}
        </div>
        <div className="so-cal-dica">clique num <b>dia</b>, na <b>seta</b> (semana) ou no <b>nome do mês</b></div>
      </div>
      <Resumo porDia={porDia} escala={escala} refDia={ref} hoje={hoje} />
    </div>
  )
}

/** Até onde somar B para comparar com A: se A ainda está em andamento, B só até o mesmo ponto. */
function ateComparavel(a: { de: string; ate: string }, b: { de: string; ate: string }, hoje: string) {
  if (a.ate <= hoje) return b.ate
  const dias = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${a.de}T12:00:00Z`)) / 86_400_000)
  const lim = somaDias(b.de, dias)
  return lim < b.ate ? lim : b.ate
}
/** Pedaços de um período para as barrinhas: semana/mês → dias, ano → meses. */
function pedacos(e: Escala, p: { de: string; ate: string }) {
  if (e === 'ano') return periodos('mes', `${p.de.slice(0, 4)}-12-01`, 12)
  if (e === 'dia') return []
  const out: { de: string; ate: string }[] = []
  for (let d = p.de; d <= p.ate && out.length < 31; d = somaDias(d, 1)) out.push({ de: d, ate: d })
  return out
}

/** O dia a dia ABERTO: horas, km e peças separados (o PorDia só tem bruto/horas/OS). */
type Det = { bruto: number; os: number; horas: number; servico: number; km: number; kmValor: number; pecas: number; outros: number }
type FatDet = Pick<OSFaturada, 'data' | 'bruto' | 'horasCobradas' | 'servico' | 'km' | 'kmValor' | 'pecas' | 'outros'> & Partial<Pick<OSFaturada, 'os' | 'numeroOmie' | 'cliente' | 'tecnicos'>>

/** Por que A ficou acima/abaixo de B, em poucas frases (o "?" do Tratorilson na comparação, José 19/10). */
type Motivo = { ic: string; cor: string; txt: React.ReactNode }
function explicarDiferenca(fat: FatDet[], a: { de: string; ate: string }, b: { de: string; ate: string }, rotA: string, rotB: string, andamento: boolean): Motivo[] {
  const da = fat.filter((o) => o.data >= a.de && o.data <= a.ate), db = fat.filter((o) => o.data >= b.de && o.data <= b.ate)
  const soma = (l: FatDet[], k: 'bruto' | 'servico' | 'kmValor' | 'pecas' | 'outros' | 'horasCobradas') => l.reduce((s, o) => s + (o[k] || 0), 0)
  const A = soma(da, 'bruto'), B = soma(db, 'bruto'), d = A - B
  const verde = '#047857', verm = '#b91c1c'
  const sinal = (v: number) => (v >= 0 ? 'a mais' : 'a menos')
  const pc = (x: number, y: number) => (y ? ` (${x >= y ? '+' : ''}${Math.round(((x - y) / y) * 100)}%)` : '')
  const out: Motivo[] = []
  if (!da.length && !db.length) return [{ ic: 'fa-circle-info', cor: MUDO, txt: <>Nenhuma OS faturada nos dois períodos.</> }]
  out.push({ ic: d >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down', cor: d >= 0 ? verde : verm, txt: <><b>{rotA}</b> faturou <b>{brl(A)}</b>, <b style={{ color: d >= 0 ? verde : verm }}>{brl(Math.abs(d))} {sinal(d)}</b> que {rotB} ({brl(B)}){pc(A, B)}.{andamento && <> Como A ainda está em andamento, B foi contado só até o mesmo ponto.</>}</> })
  // o que mais pesou na diferença
  const partes = ([['Mão de obra (horas)', 'servico'], ['Deslocamento (km)', 'kmValor'], ['Peças', 'pecas'], ['Outros (requisições, extras)', 'outros']] as const)
    .map(([rot, k]) => ({ rot, a: soma(da, k), b: soma(db, k) })).map((x) => ({ ...x, d: x.a - x.b })).filter((x) => Math.abs(x.d) >= 1).sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
  if (partes.length) {
    const [p1, p2] = partes
    out.push({ ic: 'fa-scale-unbalanced', cor: p1.d >= 0 ? verde : verm, txt: <>O que mais pesou: <b>{p1.rot}</b>, {brl(Math.abs(p1.d))} {sinal(p1.d)} ({brl(p1.a)} × {brl(p1.b)}){p2 && <>; depois <b>{p2.rot.toLowerCase()}</b>, {brl(Math.abs(p2.d))} {sinal(p2.d)}</>}.</> })
  }
  const hA = soma(da, 'horasCobradas'), hB = soma(db, 'horasCobradas')
  if (hA || hB) {
    const vhA = hA ? soma(da, 'servico') / hA : 0, vhB = hB ? soma(db, 'servico') / hB : 0
    out.push({ ic: 'fa-clock', cor: '#7c3aed', txt: <>Horas cobradas: <b>{horas(hA)}</b> contra {horas(hB)}{pc(hA, hB)}{vhA > 0 && vhB > 0 && <>; valor médio da hora {brl(vhA)} contra {brl(vhB)}</>}.</> })
  }
  const tA = da.length ? A / da.length : 0, tB = db.length ? B / db.length : 0
  out.push({ ic: 'fa-file-invoice', cor: '#0f172a', txt: <><b>{da.length} OS</b> contra {db.length}{da.length && db.length ? <>; ticket médio {brl(tA)} contra {brl(tB)}{tA > tB * 1.15 ? ' (OS maiores)' : tA < tB * 0.85 ? ' (OS menores)' : ''}</> : null}.</> })
  // quem mais mudou (OS com 2 técnicos divide o valor)
  const porTec = (l: FatDet[]) => { const m = new Map<string, number>(); for (const o of l) { const ts = o.tecnicos?.length ? o.tecnicos : []; for (const t of ts) m.set(t, (m.get(t) || 0) + o.bruto / ts.length) } return m }
  const ta = porTec(da), tb = porTec(db)
  const tecs = [...new Set([...ta.keys(), ...tb.keys()])].map((t) => ({ t, a: ta.get(t) || 0, b: tb.get(t) || 0 })).map((x) => ({ ...x, d: x.a - x.b })).sort((x, y) => Math.abs(y.d) - Math.abs(x.d))
  if (tecs.length && Math.abs(tecs[0].d) >= 1) {
    const t = tecs[0]
    out.push({ ic: 'fa-user-gear', cor: t.d >= 0 ? verde : verm, txt: <>Quem mais mudou: <b>{t.t}</b>, {brl(Math.abs(t.d))} {sinal(t.d)} ({brl(t.a)} × {brl(t.b)}){tecs[1] && Math.abs(tecs[1].d) >= 1 ? <>; depois {tecs[1].t}, {brl(Math.abs(tecs[1].d))} {sinal(tecs[1].d)}</> : null}.</> })
  }
  // a maior OS do lado que ganhou
  const lado = d >= 0 ? da : db
  const maior = [...lado].sort((x, y) => y.bruto - x.bruto)[0]
  if (maior && Math.abs(d) >= 1) {
    const nome = maior.numeroOmie ? `OS ${String(maior.numeroOmie).replace(/^0+(?=\d)/, '')}` : maior.os || 'uma OS'
    out.push({ ic: 'fa-star', cor: '#d97706', txt: <>A maior OS de {d >= 0 ? rotA : rotB} foi <b>{nome}</b>{maior.cliente ? <> ({maior.cliente})</> : null}, de <b>{brl(maior.bruto)}</b>{maior.bruto >= Math.abs(d) * 0.5 ? <>: sozinha ela explica {Math.min(100, Math.round((maior.bruto / Math.abs(d)) * 100))}% da diferença</> : null}.</> })
  }
  return out
}

/** Balão com as OS faturadas de um dia/mês do gráfico (José 19/10: "passar o mouse já mostra as OS e clicar abre o modal"). */
function OSDoDia({ lista, titulo, lado, onAbrir }: { lista: FatDet[]; titulo: string; lado: 'esq' | 'dir'; onAbrir: (o: FatDet) => void }) {
  const ord = [...lista].sort((a, b) => b.bruto - a.bruto)
  const tot = ord.reduce((s, o) => s + o.bruto, 0)
  return (
    <div className={`so-osd ${lado}`} role="dialog">
      <div className="so-osd-cab"><b>{titulo}</b><span>{ord.length} OS · {brl(tot)}</span></div>
      {ord.length ? (
        <div className="so-osd-lista">
          {ord.slice(0, 8).map((o, i) => (
            <button key={(o.os || '') + i} type="button" onClick={() => onAbrir(o)} style={{ animationDelay: `${i * 30}ms` }}>
              <b>{o.numeroOmie ? `OS ${String(o.numeroOmie).replace(/^0+(?=\d)/, '')}` : o.os}</b>
              <span>{o.cliente || '—'}{o.tecnicos?.length ? ` · ${o.tecnicos.join(' + ')}` : ''}</span>
              <strong>{brl(o.bruto)}</strong>
            </button>
          ))}
          {ord.length > 8 && <small>+ {ord.length - 8} OS menores</small>}
        </div>
      ) : <small className="so-osd-nada">nenhuma OS faturada</small>}
    </div>
  )
}

/** Botão "?" com a explicação do Tratorilson. */
function PorQue({ motivos }: { motivos: Motivo[] }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="so-pq" onMouseLeave={() => setAberto(false)}>
      <button type="button" className={`so-pq-btn ${aberto ? 'on' : ''}`} onClick={() => setAberto((v) => !v)} onMouseEnter={() => setAberto(true)} title="Por que a diferença? (Tratorilson)" aria-expanded={aberto}><i className="fas fa-question" /></button>
      {aberto && (
        <div className="so-pq-balao" role="dialog">
          <div className="so-pq-cab"><span><i className="fas fa-robot" /></span><div><b>Tratorilson explica</b><small>as principais diferenças entre A e B</small></div></div>
          <ul>{motivos.map((m, i) => <li key={i} style={{ animationDelay: `${i * 60}ms` }}><i className={`fas ${m.ic}`} style={{ color: m.cor }} /><span>{m.txt}</span></li>)}</ul>
        </div>
      )}
    </div>
  )
}
const vazio = (): Det => ({ bruto: 0, os: 0, horas: 0, servico: 0, km: 0, kmValor: 0, pecas: 0, outros: 0 })
function detPorDia(faturadas: FatDet[]) {
  const m: Record<string, Det> = {}
  for (const o of faturadas) {
    const x = (m[o.data] ||= vazio())
    x.bruto += o.bruto; x.os++; x.horas += o.horasCobradas || 0; x.servico += o.servico || 0; x.km += o.km || 0; x.kmValor += o.kmValor || 0; x.pecas += o.pecas || 0; x.outros += o.outros || 0
  }
  return m
}
function somarDet(m: Record<string, Det>, de: string, ate: string): Det {
  const s = vazio()
  for (const [d, x] of Object.entries(m)) if (d >= de && d <= ate) for (const c of Object.keys(s) as (keyof Det)[]) s[c] += x[c]
  return s
}
type Metrica = 'bruto' | 'servico' | 'kmValor' | 'pecas' | 'os'
const METRICAS: { m: Metrica; rot: string; ic: string; cor: string; f: (v: number) => string; sub?: (s: Det) => string }[] = [
  { m: 'bruto', rot: 'Faturado', ic: 'fa-sack-dollar', cor: AZUL, f: brl },
  { m: 'servico', rot: 'Horas', ic: 'fa-clock', cor: '#7c3aed', f: brl, sub: (s) => `${horas(s.horas)} cobradas` },
  { m: 'kmValor', rot: 'Km', ic: 'fa-road', cor: '#0891b2', f: brl, sub: (s) => `${Math.round(s.km).toLocaleString('pt-BR')} km rodados` },
  { m: 'pecas', rot: 'Peças', ic: 'fa-gears', cor: '#d97706', f: brl },
  { m: 'os', rot: 'OS', ic: 'fa-file-invoice', cor: '#0f172a', f: (v) => String(Math.round(v)) },
]
const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null)
function Delta({ a, b }: { a: number; b: number }) {
  const p = pct(a, b)
  if (p == null) return <span className="so-dl nada">—</span>
  return <span className={`so-dl ${p >= 0 ? 'up' : 'down'}`}>{p >= 0 ? '▲' : '▼'} {Math.abs(p)}%</span>
}

/** Quadro A × B aberto: faturado, horas (R$ e h), km (R$ e km), peças, outros, OS e ticket.
 *  Sem comparação (soA), mostra só os números de A. */
function ComparativoDet({ sa, sb, rotA, rotB, andamento, ateB, soA }: { sa: Det; sb: Det; rotA: string; rotB: string; andamento: boolean; ateB: string | null; soA?: boolean }) {
  const linhas: { rot: string; dica?: string; ic: string; cor: string; a: number; b: number; f: (v: number) => string; subA?: string; subB?: string }[] = [
    { rot: 'Faturado', ic: 'fa-sack-dollar', cor: AZUL, a: sa.bruto, b: sb.bruto, f: brl },
    { rot: 'Horas', ic: 'fa-clock', cor: '#7c3aed', a: sa.servico, b: sb.servico, f: brl, subA: horas(sa.horas), subB: horas(sb.horas) },
    { rot: 'Km', ic: 'fa-road', cor: '#0891b2', a: sa.kmValor, b: sb.kmValor, f: brl, subA: `${Math.round(sa.km).toLocaleString('pt-BR')} km`, subB: `${Math.round(sb.km).toLocaleString('pt-BR')} km` },
    { rot: 'Peças', ic: 'fa-gears', cor: '#d97706', a: sa.pecas, b: sb.pecas, f: brl },
    { rot: 'Outros', dica: 'requisições, extras, descontos', ic: 'fa-receipt', cor: '#64748b', a: sa.outros, b: sb.outros, f: brl },
    { rot: 'OS faturadas', ic: 'fa-file-invoice', cor: '#0f172a', a: sa.os, b: sb.os, f: (v) => String(Math.round(v)) },
    { rot: 'Ticket médio', dica: 'faturado ÷ OS', ic: 'fa-scale-balanced', cor: '#0f766e', a: sa.os ? sa.bruto / sa.os : 0, b: sb.os ? sb.bruto / sb.os : 0, f: brl },
  ]
  const d = sa.bruto - sb.bruto
  return (
    <div className={`so-cx ${soA ? 'so-cx-soa' : ''}`}>
      <div className="so-cx-cab">
        <div className="so-cx-p a"><em>A</em><div><b>{rotA}</b>{andamento && <small>até hoje</small>}</div></div>
        {!soA && <><span className="so-cx-vs">vs</span>
        <div className="so-cx-p b"><em>B</em><div><b>{rotB}</b>{ateB && <small>até o mesmo ponto: {br(ateB)}</small>}</div></div></>}
      </div>
      <div className="so-cx-lista">
        <div className="so-cx-tit"><span /><span>A</span>{!soA && <><span>B</span><span>Diferença</span><span>A × B</span></>}</div>
        {linhas.map((l, i) => {
          const df = l.a - l.b, p = pct(l.a, l.b), max = Math.max(l.a, l.b, 1), igual = Math.abs(df) < 0.5
          return (
            <div key={l.rot} className="so-cx-l" style={{ '--c': l.cor, animationDelay: `${i * 60}ms` } as React.CSSProperties}>
              <div className="so-cx-n"><span><i className={`fas ${l.ic}`} /></span><div><b>{l.rot}</b>{l.dica && <small>{l.dica}</small>}</div></div>
              <div className="so-cx-va"><b><Numero valor={l.a} formato={l.f} /></b>{l.subA && <small>{l.subA}</small>}</div>
              {!soA && <>
                <div className="so-cx-vb"><b>{l.f(l.b)}</b>{l.subB && <small>{l.subB}</small>}</div>
                <div><span className={`so-cx-df ${igual ? 'igual' : df >= 0 ? 'up' : 'down'}`}>{igual ? 'igual' : <>{df >= 0 ? '▲ +' : '▼ −'}{l.f(Math.abs(df))}</>}</span>{!igual && p != null && <small className="so-cx-pc">{df >= 0 ? '+' : ''}{p}%</small>}</div>
                <div className="so-cx-bars"><span><i className="a" style={{ width: `${(l.a / max) * 100}%` }} /></span><span><i className="b" style={{ width: `${(l.b / max) * 100}%` }} /></span></div>
              </>}
            </div>
          )
        })}
      </div>
      {!soA && (
        <p className="so-cx-frase"><i className="fas fa-lightbulb" />
          <span>{sb.bruto > 0
            ? <>{rotA} faturou <b>{brl(sa.bruto)}</b>, {d >= 0 ? <b style={{ color: '#047857' }}>{brl(d)} a mais</b> : <b style={{ color: '#b91c1c' }}>{brl(-d)} a menos</b>} que {rotB}. Em horas foram {brl(sa.servico)} ({horas(sa.horas)}) contra {brl(sb.servico)}; em km {brl(sa.kmValor)} contra {brl(sb.kmValor)}; em peças {brl(sa.pecas)} contra {brl(sb.pecas)}.</>
            : <>{rotB} não teve faturamento para comparar.</>}</span>
        </p>
      )}
    </div>
  )
}

/** S3 — Cartões de período (escolhida pelo José, 19/10): cartões das últimas semanas/meses/anos com
 *  horas, km e peças separados; escolhe O QUE comparar (faturado/horas/km/peças/OS) e CONTRA O QUÊ
 *  (período anterior, mesmo período do ano passado ou qualquer outro cartão). A = azul, B = laranja. */
export function SeletorCartoes({ faturadas, hoje, escala: escalaC, refDia, onMudar, carregando, onAtualizar }: {
  faturadas: FatDet[]; hoje: string
  /** no Painel: o período é controlado de fora (o resto da tela segue o cartão escolhido) */
  escala?: Escala; refDia?: string; onMudar?: (e: Escala, ref: string) => void
  carregando?: boolean; onAtualizar?: () => void
}) {
  const [escalaL, setEscalaL] = useState<Escala>('semana')
  const [refL, setRefL] = useState(hoje)
  const escala = escalaC ?? escalaL, ref = refDia ?? refL
  const mudar = (e: Escala, r: string) => { if (onMudar) onMudar(e, r); else { setEscalaL(e); setRefL(r) } }
  const [modo, setModo] = useState<ModoComp>('anterior')
  const [metrica, setMetrica] = useState<Metrica>('bruto')
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const [escolhendo, setEscolhendo] = useState(false)
  const [comparar, setComparar] = useState(false)
  const [diaFoco, setDiaFoco] = useState<string | null>(null)
  const [osAberta, setOsAberta] = useState<FatDet | null>(null)
  const [detalhes, setDetalhes] = useState(false)
  // B por datas livres (qualquer intervalo, de qualquer ano)
  const [bDe, setBDe] = useState(() => somaDias(hoje, -13))
  const [bAte, setBAte] = useState(() => somaDias(hoje, -7))
  const det = useMemo(() => detPorDia(faturadas), [faturadas])
  const M = METRICAS.find((x) => x.m === metrica) || METRICAS[0]
  const lista = useMemo(() => {
    // o período escolhido fica NO CENTRO (José, 21/10/2026: "coloca ele no centro"): metade antes, metade depois;
    // os que ainda não chegaram aparecem apagados e sem clique
    const n = { dia: 9, semana: 7, mes: 7, ano: 5 }[escala]
    return periodos(escala, andarPeriodo(escala, ref, Math.floor(n / 2)), n).map((c) => {
      const s = somarDet(det, c.de, c.ate > hoje ? hoje : c.ate)
      const pb = modo === 'datas' ? { de: bDe, ate: bAte } : periodoB(escala, c.de, modo, escolhido)
      const sb = somarDet(det, pb.de, modo === 'datas' ? pb.ate : ateComparavel(c, pb, hoje))
      return { ...c, s, sb, agora: c.ate > hoje && c.de <= hoje, futuro: c.de > hoje }
    })
  }, [escala, ref, det, hoje, modo, escolhido, bDe, bAte])
  const sel = periodos(escala, ref, 1)[0]
  const b = modo === 'datas' ? { de: bDe, ate: bAte } : periodoB(escala, sel.de, modo, escolhido)
  const ateB = modo === 'datas' ? b.ate : ateComparavel(sel, b, hoje)
  /** ◀ ▶ do B: anda um período (ou o mesmo tamanho, nas datas livres) */
  const andarB = (n: number) => {
    setEscolhendo(false)
    if (modo === 'datas') {
      const tam = Math.round((Date.parse(`${bAte}T12:00:00Z`) - Date.parse(`${bDe}T12:00:00Z`)) / 86_400_000) + 1
      setBDe(somaDias(bDe, n * tam)); setBAte(somaDias(bAte, n * tam)); return
    }
    setEscolhido(escala === 'dia' ? somaDias(b.de, n) : andarPeriodo(escala, b.de, n)); setModo('escolhido')
  }
  const fmtData = (d: string) => `${br(d)}/${d.slice(2, 4)}`
  const sa = somarDet(det, sel.de, sel.ate > hoje ? hoje : sel.ate), sb = somarDet(det, b.de, ateB)
  // barrinhas A × B alinhadas (1º dia com 1º dia, seg com seg, jan com jan…) na métrica escolhida
  const pa = pedacos(escala, sel), pbs = pedacos(escala, b)
  const barras = pa.map((p, i) => {
    const q = pbs[i]
    return { p, va: p.de > hoje ? null : somarDet(det, p.de, p.ate > hoje ? hoje : p.ate)[metrica], vb: q && q.de <= ateB ? somarDet(det, q.de, q.ate > ateB ? ateB : q.ate)[metrica] : 0 }
  })
  const maxD = Math.max(1, ...barras.flatMap((x) => [x.va || 0, x.vb]))
  const zero = (d: Det) => d.bruto < 0.5 && d.os === 0
  const vazio = zero(sa) && (!comparar || zero(sb))
  const rotA = maiuscula(rotuloPeriodo(escala, sel.de, sel.ate)), rotB = modo === 'datas' ? `${fmtData(b.de)} a ${fmtData(b.ate)}` : rotuloPeriodo(escala, b.de, b.ate)
  const textoComp = modo === 'escolhido' ? `B (${curtoDe(escala, b.de)})` : modo === 'datas' ? `B (${br(b.de)}–${br(b.ate)})` : nomeComp(escala, modo)
  const trocarEscala = (e: Escala) => { mudar(e, hoje); setEscolhido(null); setEscolhendo(false); if (modo === 'escolhido') setModo('anterior') }
  const clicar = (de: string) => { if (escolhendo) { setEscolhido(de); setModo('escolhido'); setEscolhendo(false) } else mudar(escala, de) }
  const nomePedaco = (d: string) => escala === 'ano' ? MESES[Number(d.slice(5, 7)) - 1].slice(0, 3) : escala === 'semana' ? `${SEM[diaSem(d)]} ${d.slice(8)}` : d.slice(8)
  const trilhoC = useRef<HTMLDivElement>(null)
  // desfocar os outros cartões (José, 21/10/2026: "coloca uma opção para desborrar tudo") — fica lembrado neste navegador
  const [foco, setFoco] = useState(() => { try { return localStorage.getItem('so-foco') !== '0' } catch { return true } })
  const trocarFoco = () => setFoco((v) => { try { localStorage.setItem('so-foco', v ? '0' : '1') } catch { /* sem localStorage */ } return !v })
  useEffect(() => { const el = trilhoC.current; const on = el?.querySelector<HTMLElement>('.so-card.on'); if (el && on) el.scrollLeft = on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2 }, [escala, ref, modo, escolhido, metrica, bDe, bAte])
  const kk = (v: number) => (metrica === 'os' ? (v ? String(Math.round(v)) : '') : k(v))
  return (
    <div className="so-caixa so-g">
      {/* filtros (José 19/10: "mais clean e fácil de ver que ali tem filtro"): dois grupos com nome, mesmo estilo */}
      <div className="so-filtros">
        <div className="so-fg">
          <small><i className="fas fa-calendar-days" /> Período</small>
          <div className="so-seg">
            {ESCALAS.map(([e, rot]) => <button key={e} type="button" className={e === escala ? 'on' : ''} onClick={() => trocarEscala(e)}>{rot}</button>)}
          </div>
        </div>
        <div className="so-fg">
          <small><i className="fas fa-filter" /> Mostrar nos cartões</small>
          <div className="so-seg">
            {METRICAS.map((x) => <button key={x.m} type="button" className={metrica === x.m ? 'on' : ''} style={{ '--c': x.cor } as React.CSSProperties} onClick={() => setMetrica(x.m)}><i className={`fas ${x.ic}`} />{x.rot}</button>)}
          </div>
        </div>
        <div className="so-fdir">
          <small>{escolhendo ? <b style={{ color: '#c2410c' }}>clique no cartão que vai ser o B</b> : 'clique num cartão para abrir os detalhes dele'}</small>
          <button type="button" className={`so-foco ${foco ? 'on' : ''}`} onClick={trocarFoco} title={foco ? 'Os outros cartões estão desfocados: clique para ver todos nítidos' : 'Clique para desfocar os outros cartões e destacar o escolhido'}><span aria-hidden><i /></span>destacar o escolhido</button>
          {onAtualizar && <button type="button" className="so-atualiza" onClick={onAtualizar} disabled={carregando} title="Buscar os dados de novo"><i className={`fas fa-rotate ${carregando ? 'fa-spin' : ''}`} /> atualizar</button>}
        </div>
      </div>
      <div className={`so-ab2 ${comparar ? '' : 'off'}`}>
        <div className="so-ab2-linha">
          <div className="so-ab2-chip a">
            <em>A</em>
            <div><small>período escolhido</small><b>{rotA}</b></div>
          </div>
          {comparar ? (
            <>
              <span className="so-ab2-vs"><i className="fas fa-right-left" /></span>
              <div className="so-ab2-chip b">
                <button type="button" className="so-ab2-seta" onClick={() => andarB(-1)} title="B um período para trás"><i className="fas fa-chevron-left" /></button>
                <em>B</em>
                <div><small>comparando com</small><b>{rotB}</b></div>
                <button type="button" className="so-ab2-seta" onClick={() => andarB(1)} title="B um período para frente"><i className="fas fa-chevron-right" /></button>
              </div>
            </>
          ) : <span className="so-ab2-sem"><i className="fas fa-eye-slash" /> sem comparação: mostrando só o período A</span>}
          {comparar && <PorQue motivos={explicarDiferenca(faturadas, { de: sel.de, ate: sel.ate > hoje ? hoje : sel.ate }, { de: b.de, ate: ateB }, rotA, rotB, sel.ate > hoje)} />}
          <button type="button" className={`so-ab2-chave ${comparar ? 'on' : ''}`} onClick={() => { setComparar((v) => !v); setEscolhendo(false) }} title={comparar ? 'Tirar a comparação' : 'Comparar com outro período'}>
            <span><i /></span>{comparar ? 'comparando' : 'comparar'}
          </button>
        </div>
        {comparar && (
          <div className="so-ab2-op">
            <small>B é:</small>
            <div className="so-ab2-seg">
              {(['anterior', 'ano'] as const).map((m) => <button key={m} type="button" className={modo === m && !escolhendo ? 'on' : ''} onClick={() => { setModo(m); setEscolhendo(false) }}><i className={`fas ${m === 'ano' ? 'fa-calendar-days' : 'fa-backward-step'}`} /> {nomeComp(escala, m)}</button>)}
              <button type="button" className={`${modo === 'escolhido' || escolhendo ? 'on' : ''} ${escolhendo ? 'piscando' : ''}`} onClick={() => setEscolhendo((v) => !v)}>
                <i className="fas fa-hand-pointer" /> {escolhendo ? 'clique num cartão…' : 'escolher no cartão'}
              </button>
              <button type="button" className={modo === 'datas' ? 'on' : ''} onClick={() => { if (modo !== 'datas') { setBDe(b.de); setBAte(b.ate > hoje ? hoje : b.ate) } setModo('datas'); setEscolhendo(false) }}><i className="fas fa-calendar-plus" /> datas livres</button>
            </div>
            {modo === 'datas' && (
              <span className="so-ab-datas">
                de <input type="date" value={bDe} max={bAte} onChange={(e) => e.target.value && setBDe(e.target.value)} />
                até <input type="date" value={bAte} min={bDe} max={hoje} onChange={(e) => e.target.value && setBAte(e.target.value)} />
              </span>
            )}
          </div>
        )}
      </div>

      <div className={`so-cards ${escolhendo ? 'escolhendo' : ''} ${foco ? 'foco' : ''}`} ref={trilhoC} key={`${escala}:${modo}:${escolhido}:${metrica}`}>
        {lista.map((c, i) => {
          const ehA = c.de === sel.de, ehB = comparar && c.de === b.de && !ehA
          const p = comparar ? pct(c.s[metrica], c.sb[metrica]) : null
          return (
            <button key={c.de} type="button" disabled={c.futuro} className={`so-card ${ehA ? 'on' : ''} ${ehB ? 'ehb' : ''} ${c.futuro ? 'futuro' : ''} ${c.agora ? 'atual' : ''}`} style={{ animationDelay: `${i * 50}ms` }} onClick={() => clicar(c.de)}>
              {ehA && <span className="so-tag">A</span>}{ehB && <span className="so-tag b">B</span>}
              <small>{rotuloPeriodo(escala, c.de, c.ate)}{c.agora && <span className="so-vivo"><i /> agora</span>}</small>
              <u style={{ color: M.cor }}><i className={`fas ${M.ic}`} /> {M.rot}</u>
              <b>{c.futuro ? '—' : <Numero valor={c.s[metrica]} formato={M.f} />}</b>
              {M.sub && !c.futuro && <span>{M.sub(c.s)}</span>}
              {c.futuro && <span>ainda não chegou</span>}
              {comparar && !c.futuro && (p != null
                ? <em className={p >= 0 ? 'up' : 'down'}>{p >= 0 ? '▲' : '▼'} {Math.abs(p)}% <i>vs {textoComp}{c.agora ? ' (mesmo trecho)' : ''}</i></em>
                : <em className="nada"><i>sem {textoComp} para comparar</i></em>)}
              {/* de onde veio o dinheiro: faixa dividida + uma linha por item (oculto até clicar em "detalhes") */}
              {detalhes && <div className="so-mix">
                <div className="so-mix-faixa" title="De onde veio o faturado: horas · km · peças · outros">
                  {([['servico', '#7c3aed'], ['kmValor', '#0891b2'], ['pecas', '#d97706'], ['outros', '#94a3b8']] as const).map(([q, cor]) => c.s.bruto > 0 && c.s[q] > 0 && <i key={q} style={{ width: `${(c.s[q] / c.s.bruto) * 100}%`, background: cor }} />)}
                </div>
                {METRICAS.filter((x) => x.m !== metrica).map((x) => {
                  const pq = comparar ? pct(c.s[x.m], c.sb[x.m]) : null
                  return (
                    <div key={x.m} className="so-mix-l" style={{ '--c': x.cor } as React.CSSProperties}>
                      <span className="so-mix-n"><i />{x.m === 'bruto' ? 'Total' : x.rot}</span>
                      <b>{x.f(c.s[x.m])}</b>
                      <small>{x.m === 'servico' ? horas(c.s.horas) : x.m === 'kmValor' ? `${Math.round(c.s.km).toLocaleString('pt-BR')} km` : ''}</small>
                      <span className={`so-mix-d ${pq == null ? '' : pq >= 0 ? 'up' : 'down'}`}>{pq == null ? '' : `${pq >= 0 ? '▲' : '▼'}${Math.abs(pq)}%`}</span>
                    </div>
                  )
                })}
              </div>}
            </button>
          )
        })}
      </div>
      <div className="so-leg">
        <span><b>Em cada cartão:</b> o número grande é <b style={{ color: M.cor }}>{M.rot.toLowerCase()}</b>{comparar && <> · <b style={{ color: '#047857' }}>▲</b>/<b style={{ color: '#b91c1c' }}>▼</b> quanto subiu ou caiu contra {textoComp}</>}</span>
        <button type="button" className={`so-det ${detalhes ? 'on' : ''}`} onClick={() => setDetalhes((v) => !v)}><i className={`fas ${detalhes ? 'fa-eye-slash' : 'fa-eye'}`} /> {detalhes ? 'esconder' : 'mostrar'} horas, km e peças nos cartões</button>
      </div>

      <div className="so-kpis" key={`${sel.de}:${b.de}`}>
        {METRICAS.map((x, i) => (
          <button key={x.m} type="button" className={`so-kpi ${metrica === x.m ? 'on' : ''}`} style={{ '--c': x.cor, animationDelay: `${i * 60}ms` } as React.CSSProperties} onClick={() => setMetrica(x.m)}>
            <div className="so-kpi-cab">
              <span className="so-kpi-ic"><i className={`fas ${x.ic}`} /></span>
              <small>{x.rot}</small>
              {comparar && <Delta a={sa[x.m]} b={sb[x.m]} />}
            </div>
            <b><Numero valor={sa[x.m]} formato={x.f} /></b>
            <span className="so-kpi-sub">{x.sub ? x.sub(sa) : <>&nbsp;</>}</span>
            {comparar && <div className="so-kpi-ab">
              {([['A', sa[x.m], 'a'], ['B', sb[x.m], 'b']] as const).map(([l, v, c]) => (
                <div key={l}><em>{l}</em><span><i className={c} style={{ width: `${(v / Math.max(sa[x.m], sb[x.m], 1)) * 100}%` }} /></span><strong>{x.f(v)}</strong></div>
              ))}
            </div>}
            <span className="so-kpi-pe">{metrica === x.m ? <><i className="fas fa-check" /> comparando por {x.rot.toLowerCase()}</> : <>clique para comparar por {x.rot.toLowerCase()}</>}</span>
          </button>
        ))}
      </div>

      {/* período zerado (e nada para comparar): esconde as barras do dia a dia e o quadro A × B (José, 19/10) */}
      {vazio && <div className="so-vazio"><i className="fas fa-hourglass-start" /> Nada faturado em {rotA.toLowerCase().startsWith('semana') ? 'nesta ' : ''}{rotA}{sel.ate > hoje ? ' até agora' : ''}.</div>}
      {!vazio && barras.length > 1 && (
        <div className="so-dias-box" key={`${sel.de}:${b.de}:${metrica}`}>
          <div className="so-leg">
            <span><i style={{ background: M.cor }} /> <b>A</b> · {rotA}</span>
            {comparar && <span><i style={{ background: '#fdba74' }} /> <b>B</b> · {rotB}</span>}
            <span>— {M.rot.toLowerCase()} {escala === 'ano' ? 'mês a mês' : 'dia a dia'}{comparar && <>, lado a lado{escala === 'semana' ? ' (seg com seg, ter com ter…)' : escala === 'mes' ? ' (dia 1 com dia 1…)' : ''}</>}</span>
          </div>
          <div className="so-dias">
            {barras.map((x, i) => (
              <div key={x.p.de} className={`so-d ${x.va == null ? 'fut' : ''} ${diaFoco === x.p.de ? 'foco' : ''}`} onMouseEnter={() => setDiaFoco(x.p.de)} onMouseLeave={() => setDiaFoco(null)}>
                {diaFoco === x.p.de && <OSDoDia lista={faturadas.filter((o) => o.data >= x.p.de && o.data <= x.p.ate)} titulo={nomePedaco(x.p.de)} lado={i > barras.length / 2 ? 'dir' : 'esq'} onAbrir={setOsAberta} />}
                <em style={{ color: M.cor }}>{x.va ? kk(x.va) : ''}</em>
                <div className="so-d-par">
                  <span className="a" style={{ background: M.cor, height: `${x.va ? Math.max(2, (x.va / maxD) * 100) : 0}%`, animationDelay: `${i * 30}ms` }} />
                  {comparar && <span className="b" style={{ height: `${x.vb ? Math.max(2, (x.vb / maxD) * 100) : 0}%`, animationDelay: `${i * 30 + 15}ms` }} />}
                </div>
                <small>{nomePedaco(x.p.de)}</small>
              </div>
            ))}
          </div>
        </div>
      )}
      {osAberta && <JanelaOSParada key={osAberta.os} faturadaEm={osAberta.data} onFechar={() => setOsAberta(null)}
        p={{ os: osAberta.os || '', tipo: 'preenchida', status: 'Faturada', cliente: osAberta.cliente || '', tecnicos: osAberta.tecnicos || [], dataRef: osAberta.data, dias: 0, maoDeObra: osAberta.servico, deslocamento: osAberta.kmValor, pecas: osAberta.pecas, total: osAberta.bruto, garantia: false }} />}
      {!vazio && <ComparativoDet key={`c${sel.de}:${b.de}:${comparar}`} soA={!comparar} sa={sa} sb={sb} rotA={rotA} rotB={rotB} andamento={sel.ate > hoje} ateB={sel.ate > hoje && ateB !== b.ate ? ateB : null} />}
    </div>
  )
}

/** S4 — Régua deslizante: uma janela que se arrasta sobre os últimos 120 dias; o tamanho vem de Dia/Semana/Mês. */
export function SeletorRegua({ porDia, hoje }: { porDia: PorDia; hoje: string }) {
  const [escala, setEscala] = useState<'dia' | 'semana' | 'mes'>('semana')
  const N = 120
  const dias = useMemo(() => Array.from({ length: N }, (_, i) => somaDias(hoje, i - N + 1)), [hoje])
  const tam = { dia: 1, semana: 7, mes: 30 }[escala]
  const [fim, setFim] = useState(N - 1) // índice do último dia da janela
  const ini = Math.max(0, fim - tam + 1)
  const max = Math.max(1, ...dias.map((d) => porDia[d]?.[0] || 0))
  const caixa = useRef<HTMLDivElement>(null)
  const arrasta = (clientX: number) => { const r = caixa.current?.getBoundingClientRect(); if (!r) return; const i = Math.round(((clientX - r.left) / r.width) * (N - 1)); setFim(Math.min(N - 1, Math.max(tam - 1, i + Math.floor(tam / 2)))) }
  const de = dias[ini], ate = dias[fim]
  const s = somar(porDia, de, ate)
  const v = useContador(s.bruto, 500)
  return (
    <div className="so-caixa">
      <div className="so-topo">
        <div className="so-abas so-abas3"><span className="so-pilula" style={{ transform: `translateX(${['dia', 'semana', 'mes'].indexOf(escala) * 100}%)` }} />{(['dia', 'semana', 'mes'] as const).map((e) => <button key={e} type="button" className={e === escala ? 'on' : ''} onClick={() => { setEscala(e); setFim(N - 1) }}>{e === 'dia' ? '1 dia' : e === 'semana' ? '7 dias' : '30 dias'}</button>)}</div>
        <small style={{ color: MUDO }}>arraste a janela azul pelos últimos 120 dias</small>
      </div>
      <div className="so-regua" ref={caixa} onMouseDown={(e) => { arrasta(e.clientX); const mv = (ev: MouseEvent) => arrasta(ev.clientX); const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up) }; window.addEventListener('mousemove', mv); window.addEventListener('mouseup', up) }}>
        {dias.map((d, i) => <i key={d} className={i >= ini && i <= fim ? 'on' : ''} style={{ height: `${Math.max(2, ((porDia[d]?.[0] || 0) / max) * 100)}%`, opacity: [0, 6].includes(diaSem(d)) ? 0.5 : 1 }} />)}
        <span className="so-janela" style={{ left: `${(ini / N) * 100}%`, width: `${((fim - ini + 1) / N) * 100}%` }}><em>{br(de)}{tam > 1 ? ` – ${br(ate)}` : ''}</em></span>
      </div>
      <div className="so-regua-meses">{dias.filter((d) => d.endsWith('-01')).map((d) => <span key={d} style={{ left: `${(dias.indexOf(d) / N) * 100}%` }}>{MESES[Number(d.slice(5, 7)) - 1].slice(0, 3)}</span>)}</div>
      <div className="so-regua-res"><b>{brl(v)}</b><span>{s.os} OS · {horas(s.horas)} · ticket {brl(s.os ? s.bruto / s.os : 0)}</span><small>de {br(de)} a {br(ate)}</small></div>
    </div>
  )
}

/** S5 — Linha do tempo com zoom: anos → meses → dias, entrando ao clicar; trilha de volta em cima. */
export function SeletorZoom({ porDia, hoje }: { porDia: PorDia; hoje: string }) {
  const [nivel, setNivel] = useState<'anos' | 'meses' | 'dias'>('meses')
  const [ano, setAno] = useState(hoje.slice(0, 4))
  const [mes, setMes] = useState(hoje.slice(0, 7))
  const [sel, setSel] = useState<{ escala: Escala; ref: string }>({ escala: 'mes', ref: hoje })
  const itens = useMemo(() => {
    if (nivel === 'anos') return Array.from({ length: 4 }, (_, i) => { const y = Number(hoje.slice(0, 4)) - 3 + i; return { chave: String(y), rot: String(y), de: `${y}-01-01`, ate: `${y}-12-31` } })
    if (nivel === 'meses') return Array.from({ length: 12 }, (_, i) => { const mm = String(i + 1).padStart(2, '0'); return { chave: `${ano}-${mm}`, rot: MESES[i].slice(0, 3), de: `${ano}-${mm}-01`, ate: `${ano}-${mm}-${ultimoDia(Number(ano), i + 1)}` } })
    const [a, m] = mes.split('-').map(Number)
    return Array.from({ length: ultimoDia(a, m) }, (_, i) => { const d = `${mes}-${String(i + 1).padStart(2, '0')}`; return { chave: d, rot: String(i + 1), de: d, ate: d } })
  }, [nivel, ano, mes, hoje])
  const vals = itens.map((x) => somar(porDia, x.de, x.ate > hoje ? hoje : x.ate).bruto)
  const max = Math.max(1, ...vals)
  const clicar = (x: { de: string }) => {
    if (nivel === 'anos') { setAno(x.de.slice(0, 4)); setNivel('meses'); setSel({ escala: 'ano', ref: x.de }) }
    else if (nivel === 'meses') { setMes(x.de.slice(0, 7)); setNivel('dias'); setSel({ escala: 'mes', ref: x.de }) }
    else setSel({ escala: 'dia', ref: x.de })
  }
  const selP = periodos(sel.escala, sel.ref, 1)[0]
  return (
    <div className="so-caixa">
      <div className="so-trilha">
        <button type="button" onClick={() => setNivel('anos')} className={nivel === 'anos' ? 'on' : ''}><i className="fas fa-layer-group" /> Anos</button>
        <i className="fas fa-chevron-right" /><button type="button" onClick={() => { setNivel('meses'); setSel({ escala: 'ano', ref: `${ano}-01-01` }) }} className={nivel === 'meses' ? 'on' : ''}>{ano}</button>
        {nivel === 'dias' && <><i className="fas fa-chevron-right" /><button type="button" className="on" onClick={() => setSel({ escala: 'mes', ref: `${mes}-01` })}>{MESES[Number(mes.slice(5, 7)) - 1]}</button></>}
        <small>clique numa barra para entrar nela</small>
      </div>
      <div className={`so-zoom so-zoom-${nivel}`} key={`${nivel}:${ano}:${mes}`}>
        {itens.map((x, i) => {
          const fut = x.de > hoje, on = x.de >= selP.de && x.ate <= selP.ate
          return (
            <button key={x.chave} type="button" disabled={fut} className={`so-zcol ${on ? 'on' : ''}`} onClick={() => clicar(x)}>
              <em>{k(vals[i])}</em>
              <span style={{ height: `${Math.max(2, (vals[i] / max) * 100)}%`, animationDelay: `${i * 25}ms` }} />
              <small>{x.rot}</small>
            </button>
          )
        })}
      </div>
      <Resumo porDia={porDia} escala={sel.escala} refDia={sel.ref} hoje={hoje} />
    </div>
  )
}

export const ESTILO_SO = `
/* o período escolhido em destaque, os outros desfocados (José, 21/10/2026: "destaca o que está mostrando borrando os outros"); passar o mouse traz de volta */
.so-cards .so-card { transition: filter .25s, opacity .25s, transform .25s }
.so-cards.foco:not(.escolhendo) .so-card:not(.on):not(.ehb):not(.atual):not(:hover):not(:focus-visible) { filter: blur(1.6px) grayscale(.35); opacity: .5 }
.so-cards .so-card.on { transform: scale(1.03); z-index: 1 }
.so-cards .so-card.futuro { opacity: .3; cursor: default; filter: none }
/* o cartão do período ATUAL (o de hoje) sempre marcado em verde, mesmo sem estar escolhido */
.so-cards .so-card.atual:not(.on) { border-color: #16a34a; box-shadow: 0 0 0 2px #16a34a33; filter: none; opacity: 1 }
.so-foco { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 5px 12px 5px 6px; font-family: inherit; font-size: 13px; font-weight: 600; color: #0f172a; cursor: pointer }
.so-foco > span { position: relative; width: 30px; height: 18px; border-radius: 99px; background: #cbd5e1; transition: background .2s } .so-foco > span i { position: absolute; top: 3px; left: 3px; width: 12px; height: 12px; border-radius: 50%; background: #fefefe; transition: transform .25s } .so-foco.on > span { background: #2563eb } .so-foco.on > span i { transform: translateX(12px) }

.so-comp { display: flex; gap: 6px; flex-wrap: wrap; align-items: center }
.so-comp-rot { font-size: 12.5px; font-weight: 900; color: ${MUDO}; margin-right: 4px }
.so-comp button { border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: ${MUDO}; border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 12.5px; font-weight: 800; cursor: pointer; transition: all .2s }
.so-comp button.on { background: #0f172a; color: #fefefe; border-color: #0f172a } .so-comp button.on.laranja { background: #f97316; border-color: #f97316 }
.so-comp button.piscando { animation: soPisca 1s ease-in-out infinite } @keyframes soPisca { 50% { box-shadow: 0 0 0 5px rgba(249,115,22,.3) } }
.so-barras.escolhendo .so-col:not(:disabled):hover { background: #ffedd5; outline: 2px dashed #f97316 }
.so-col { position: relative } .so-tag { position: absolute; top: -2px; right: 6px; background: ${AZUL}; color: #fefefe; font-size: 10px; font-weight: 900; border-radius: 6px; padding: 0 5px } .so-tag.b { background: #f97316 }
.so-col.ehb .so-par .a { background: #f97316 !important; box-shadow: 0 0 14px rgba(249,115,22,.45) } .so-col.ehb small { color: #c2410c; font-weight: 900 }
.so-delta { font-size: 10.5px; font-weight: 900; border-radius: 99px; padding: 0 5px } .so-delta.up { color: #047857; background: #ecfdf5 } .so-delta.down { color: #b91c1c; background: #fef2f2 }
.so-tag-leg { background: ${AZUL}; color: #fefefe; border-radius: 5px; padding: 0 5px; font-size: 10.5px } .so-tag-leg.b { background: #f97316 }
.so-cmp { border-top: 1px dashed var(--portal-border, #e5e7eb); padding-top: 10px; display: grid; gap: 8px; animation: soEntra .45s both }
.so-cmp-cab { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; font-size: 15px; font-weight: 900 } .so-cmp-cab > b { color: ${MUDO} }
.so-cmp-cab span { display: inline-flex; align-items: center; gap: 6px } .so-cmp-cab i { width: 12px; height: 12px; border-radius: 4px; display: inline-block } .so-cmp-a i { background: ${AZUL} } .so-cmp-b i { background: #94a3b8 }
.so-cmp-tab { width: 100%; border-collapse: collapse; font-size: 13.5px; font-variant-numeric: tabular-nums }
.so-cmp-tab th { text-align: left; font-size: 11px; text-transform: uppercase; color: ${MUDO}; padding: 4px 8px }
.so-cmp-tab td { padding: 7px 8px; border-top: 1px solid var(--portal-border, #f1f5f9) } .so-cmp-tab tbody tr { animation: soEntra .4s both }
.so-cmp-va b { color: ${AZUL}; font-size: 15px } .so-cmp-vb { color: ${MUDO} } .so-cmp-tab small { font-weight: 700 }
.so-cmp-bars { width: 28% } .so-cmp-bars span { display: block; height: 7px; border-radius: 99px; background: var(--portal-bg-secondary, #f1f5f9); overflow: hidden; margin: 2px 0 } .so-cmp-bars i { display: block; height: 100%; border-radius: 99px; transform-origin: left; animation: soLado .8s both } .so-cmp-bars i.a { background: ${AZUL} } .so-cmp-bars i.b { background: #94a3b8 }
@keyframes soLado { from { transform: scaleX(0) } }
.so-cmp-frase { margin: 0; font-size: 13.5px; color: var(--portal-text, #334155); background: var(--portal-bg-secondary, #f8fafc); border-radius: 10px; padding: 8px 12px }
.so-caixa { min-width: 0; overflow: hidden; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 14px 16px; display: grid; gap: 12px }
.so-topo { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap }
.so-abas { position: relative; display: grid; grid-template-columns: repeat(4, 1fr); background: var(--portal-bg-secondary, #f1f5f9); border-radius: 12px; padding: 3px; min-width: 300px } .so-abas3 { grid-template-columns: repeat(3, 1fr) }
.so-pilula { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / 4); border-radius: 9px; background: ${AZUL}; box-shadow: 0 4px 12px rgba(37,99,235,.35); transition: transform .45s cubic-bezier(.3,1.3,.5,1) } .so-abas3 .so-pilula { width: calc((100% - 6px) / 3) }
.so-abas button { position: relative; z-index: 1; border: none; background: transparent; font-family: inherit; font-size: 13.5px; font-weight: 800; color: ${MUDO}; padding: 7px 10px; cursor: pointer; transition: color .3s } .so-abas button.on { color: #fefefe }
.so-nav { display: flex; gap: 4px } .so-nav button { border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 10px; padding: 6px 12px; font-family: inherit; font-weight: 800; color: var(--portal-text, #334155); cursor: pointer } .so-nav button:disabled { opacity: .35 } .so-nav button:hover:not(:disabled) { border-color: ${AZUL}; color: ${AZUL} }
.so-barras { display: flex; gap: 6px; height: 170px; align-items: flex-end }
.so-col { flex: 1; height: 100%; display: flex; flex-direction: column; align-items: center; gap: 3px; border: none; background: transparent; border-radius: 10px; padding: 4px 0; cursor: pointer; font-family: inherit; transition: background .2s } .so-col:hover:not(:disabled) { background: var(--portal-bg-secondary, #f1f5f9) } .so-col:disabled { opacity: .35; cursor: default }
.so-col em { font-style: normal; font-size: 11px; font-weight: 800; color: ${MUDO}; height: 14px } .so-col.on em { color: ${AZUL} }
.so-par { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 3px }
.so-par i { width: 34%; max-width: 22px; border-radius: 5px 5px 0 0; transform-origin: bottom; animation: soSobe .7s cubic-bezier(.2,.8,.2,1) both } .so-par .b { background: #e2e8f0 } .so-par .a { background: #93c5fd } .so-col.on .so-par .a { background: ${AZUL}; box-shadow: 0 0 14px rgba(37,99,235,.45) }
@keyframes soSobe { from { transform: scaleY(0) } }
.so-col small { font-size: 11.5px; font-weight: 700; color: ${MUDO}; white-space: nowrap } .so-col.on small { color: ${AZUL}; font-weight: 900 }
.so-leg { display: flex; gap: 14px; font-size: 12px; color: ${MUDO} } .so-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; vertical-align: -1px }
.so-res { border-top: 1px dashed var(--portal-border, #e5e7eb); padding-top: 10px; display: grid; gap: 8px; animation: soEntra .45s both } @keyframes soEntra { from { opacity: 0; transform: translateY(8px) } }
.so-res-tit { display: flex; gap: 10px; align-items: center } .so-res-tit b { font-size: 18px }
.so-vivo { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; font-weight: 800; color: #16a34a } .so-vivo i { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; animation: soPulso 1.6s infinite } @keyframes soPulso { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,.6) } 70% { box-shadow: 0 0 0 7px rgba(22,163,74,0) } 100% { box-shadow: none } }
.so-res-nums { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px }
.so-res-nums > div { background: var(--portal-bg-secondary, #f8fafc); border-radius: 12px; padding: 8px 12px; display: grid } .so-res-nums small { font-size: 11px; font-weight: 800; text-transform: uppercase; color: ${MUDO} } .so-res-nums b { font-size: 18px; font-variant-numeric: tabular-nums } .so-res-nums span { font-size: 11.5px; color: ${MUDO} }
.so-big { font-size: 24px !important; color: ${AZUL} }
.so-cal-lado { grid-template-columns: minmax(300px, 420px) 1fr; align-items: start } @media (max-width: 900px) { .so-cal-lado { grid-template-columns: 1fr } }
.so-cal-cab { display: flex; align-items: center; gap: 6px } .so-cal-cab > button { border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 10px; padding: 6px 10px; cursor: pointer }
.so-cal-mes { flex: 1; font-family: inherit; font-size: 15px; font-weight: 900; text-transform: capitalize } .so-cal-mes small { font-weight: 700; color: ${MUDO}; margin-left: 6px } .so-cal-mes.on { background: ${AZUL} !important; color: #fefefe } .so-cal-mes.on small { color: #dbeafe }
.so-cal-grade { display: grid; grid-template-columns: 24px repeat(7, 1fr); gap: 4px; margin-top: 8px }
.so-cal-sem { text-align: center; font-size: 10.5px; font-weight: 800; color: ${MUDO} }
.so-cal-linha { border: none; background: transparent; color: #cbd5e1; cursor: pointer; border-radius: 6px } .so-cal-linha:hover, .so-cal-linha.on { color: ${AZUL}; background: #dbeafe }
.so-dia { aspect-ratio: 1; border: 1px solid transparent; border-radius: 10px; background: var(--portal-bg-secondary, #f1f5f9); display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; font-family: inherit; cursor: pointer; transition: transform .15s; color: var(--portal-text, #0f172a) } .so-dia:hover:not(:disabled) { transform: scale(1.1) } .so-dia:disabled { border: 1px dashed var(--portal-border, #e2e8f0); color: #cbd5e1; cursor: default }
.so-dia b { font-size: 12.5px } .so-dia small { font-size: 9.5px; opacity: .85 }
.so-dia.sel { box-shadow: 0 0 0 3px #f59e0b } .so-dia.hoje { outline: 2px solid #16a34a; outline-offset: 1px }
.so-cal-dica { font-size: 12px; color: ${MUDO}; margin-top: 8px }
.so-cards { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 8px; scroll-snap-type: x mandatory }
.so-card { position: relative; flex: 1 0 190px; scroll-snap-align: start; display: grid; gap: 3px; text-align: left; border: 1px solid var(--portal-border, #e5e7eb); background: var(--portal-bg-card, #fefefe); border-radius: 14px; padding: 10px 12px; font-family: inherit; cursor: pointer; animation: soEntra .45s both; transition: transform .2s, box-shadow .2s, border-color .2s }
.so-card:hover { transform: translateY(-3px); box-shadow: 0 8px 18px rgba(15,23,42,.1) } .so-card.on { border-color: ${AZUL}; box-shadow: 0 0 0 2px ${AZUL}, 0 10px 22px rgba(37,99,235,.2); background: linear-gradient(160deg, #eff6ff, var(--portal-bg-card, #fefefe)) }
.so-card small { font-size: 12px; font-weight: 800; color: ${MUDO}; display: flex; gap: 6px; align-items: center; flex-wrap: wrap } .so-card small .so-vivo { font-size: 10.5px } .so-card b { font-size: 19px; font-variant-numeric: tabular-nums; color: var(--portal-text, #0f172a) } .so-card span { font-size: 11.5px; color: ${MUDO} }
.so-card em { justify-self: start; font-style: normal; font-size: 11.5px; font-weight: 900; border-radius: 99px; padding: 1px 8px } .so-card em i { font-style: normal; font-weight: 700; opacity: .8 } .so-card em.nada { color: ${MUDO}; background: var(--portal-bg-secondary, #f1f5f9); font-weight: 700 } .so-card em.up { color: #047857; background: #ecfdf5 } .so-card em.down { color: #b91c1c; background: #fef2f2 }
.so-g .so-cards { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 8px; overflow: visible; padding: 4px 2px 6px }
.so-g .so-card { min-width: 0; padding: 10px 12px } .so-g .so-card small { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block } .so-g .so-card b { font-size: clamp(16px, 1.45vw, 21px); white-space: nowrap }
@media (max-width: 900px) { .so-g .so-cards { grid-auto-columns: minmax(150px, 1fr); overflow-x: auto; scrollbar-width: none } .so-g .so-cards::-webkit-scrollbar { display: none } } .so-g .so-card span { font-size: 13px } .so-g .so-card em { font-size: 12.5px }
.so-card u { text-decoration: none; font-size: 11.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .03em }
.so-mix { display: grid; gap: 3px; margin-top: 6px; padding-top: 8px; border-top: 1px dashed var(--portal-border, #e5e7eb) }
.so-mix-faixa { display: flex; height: 7px; border-radius: 99px; overflow: hidden; background: var(--portal-bg-secondary, #f1f5f9); margin-bottom: 4px } .so-mix-faixa i { display: block; height: 100%; transform-origin: left; animation: soLado .8s both }
.so-mix-l { display: grid; grid-template-columns: 1fr auto 46px; column-gap: 6px; align-items: baseline; padding: 2px 0 }
.so-mix-n { font-size: 12px; font-weight: 800; color: var(--portal-text, #334155); display: inline-flex; align-items: center; gap: 6px } .so-mix-n i { width: 8px; height: 8px; border-radius: 3px; background: var(--c) }
.so-g .so-card .so-mix-l b { font-size: 13.5px; font-weight: 900; color: var(--portal-text, #0f172a); text-align: right; font-variant-numeric: tabular-nums }
.so-g .so-card .so-mix-l small { grid-column: 1 / 3; font-size: 10.5px; font-weight: 700; color: ${MUDO}; margin: -2px 0 0 14px; display: block } .so-g .so-card .so-mix-l small:empty { display: none }
.so-mix-d { grid-row: 1; grid-column: 3; font-size: 10.5px; font-weight: 900; text-align: right } .so-g .so-card .so-mix-d { font-size: 10.5px; color: ${MUDO} } .so-g .so-card .so-mix-d.up { color: #047857 } .so-g .so-card .so-mix-d.down { color: #b91c1c }
.so-ab2 { display: grid; gap: 10px; border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 12px; background: linear-gradient(100deg, rgba(37,99,235,.06), transparent 45%, rgba(249,115,22,.07)); transition: background .3s } .so-ab2.off { background: linear-gradient(100deg, rgba(37,99,235,.06), transparent 60%) }
.so-ab2-linha { display: flex; gap: 10px; align-items: center; flex-wrap: wrap }
.so-ab2-chip { flex: 1 1 240px; min-width: 0; display: flex; gap: 10px; align-items: center; background: var(--portal-bg-card, #fefefe); border-radius: 14px; padding: 8px 12px; box-shadow: 0 1px 2px rgba(15,23,42,.06), 0 6px 16px rgba(15,23,42,.05); animation: soEntra .35s both }

.so-ab2-chip > em { font-style: normal; width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center; font-weight: 900; font-size: 15px; color: #fefefe } .so-ab2-chip.a > em { background: ${AZUL}; box-shadow: 0 4px 12px rgba(37,99,235,.35) } .so-ab2-chip.b > em { background: #f97316; box-shadow: 0 4px 12px rgba(249,115,22,.35) }
.so-ab2-chip > div { flex: 1; min-width: 0 } .so-ab2-chip small { display: block; font-size: 10.5px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: ${MUDO} } .so-ab2-chip b { display: block; font-size: 16px; color: var(--portal-text, #0f172a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.so-ab2-seta { flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%; border: none; background: #fff7ed; color: #c2410c; cursor: pointer; transition: all .2s } .so-ab2-seta:hover { background: #f97316; color: #fefefe; transform: scale(1.1) }
.so-ab2-vs { width: 34px; height: 34px; flex-shrink: 0; border-radius: 50%; display: grid; place-items: center; background: var(--portal-bg-card, #fefefe); color: ${MUDO}; box-shadow: 0 2px 8px rgba(15,23,42,.1); animation: soGira .5s both } @keyframes soGira { from { transform: rotate(-180deg) scale(.5); opacity: 0 } }
.so-ab2-sem { flex: 1 1 240px; font-size: 13.5px; font-weight: 700; color: ${MUDO}; display: inline-flex; gap: 8px; align-items: center; animation: soEntra .3s both }
.so-pq { position: relative }
.so-pq-btn { width: 34px; height: 34px; border-radius: 50%; border: 1px solid #fdba74; background: #fff7ed; color: #c2410c; font-size: 14px; cursor: pointer; animation: soPqPulso 2.4s ease-in-out 3; transition: all .2s } .so-pq-btn:hover, .so-pq-btn.on { background: #f97316; color: #fefefe; border-color: #f97316 }
@keyframes soPqPulso { 50% { box-shadow: 0 0 0 6px rgba(249,115,22,.18) } }
.so-pq-balao { position: absolute; right: 0; top: calc(100% + 8px); z-index: 60; width: min(480px, 86vw); background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; box-shadow: 0 20px 44px rgba(15,23,42,.2); padding: 14px 16px; display: grid; gap: 10px; animation: soPqAbre .25s cubic-bezier(.2,1.1,.3,1) both }
@keyframes soPqAbre { from { opacity: 0; transform: translateY(-6px) scale(.97) } }
.so-pq-cab { display: flex; gap: 10px; align-items: center } .so-pq-cab > span { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: #0369a1; color: #fefefe } .so-pq-cab b { display: block; font-size: 14.5px; color: var(--portal-text, #0f172a) } .so-pq-cab small { font-size: 12px; color: ${MUDO} }
.so-pq-balao ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px } .so-pq-balao li { display: grid; grid-template-columns: 18px 1fr; gap: 8px; font-size: 13.5px; line-height: 1.45; color: var(--portal-text, #334155); animation: soEntra .3s both } .so-pq-balao li > i { margin-top: 3px; text-align: center }
.so-ab2-chave { display: inline-flex; gap: 8px; align-items: center; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 6px 12px 6px 6px; font-family: inherit; font-size: 13px; font-weight: 800; color: ${MUDO}; cursor: pointer }
.so-ab2-chave > span { width: 34px; height: 20px; border-radius: 99px; background: #cbd5e1; position: relative; transition: background .25s } .so-ab2-chave > span i { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fefefe; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .25s cubic-bezier(.3,1.5,.5,1) }
.so-ab2-chave.on { color: #c2410c } .so-ab2-chave.on > span { background: #f97316 } .so-ab2-chave.on > span i { transform: translateX(14px) }
.so-ab2-op { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; animation: soEntra .3s both } .so-ab2-op > small { font-size: 12px; font-weight: 900; color: ${MUDO}; text-transform: uppercase }
.so-ab2-seg { display: inline-flex; flex-wrap: wrap; gap: 2px; background: var(--portal-bg-secondary, #f1f5f9); border-radius: 12px; padding: 3px }
.so-ab2-seg button { border: none; background: transparent; color: ${MUDO}; border-radius: 9px; padding: 6px 12px; font-family: inherit; font-size: 13px; font-weight: 800; cursor: pointer; transition: all .2s } .so-ab2-seg button:hover { color: #c2410c } .so-ab2-seg button.on { background: var(--portal-bg-card, #fefefe); color: #c2410c; box-shadow: 0 1px 2px rgba(15,23,42,.08), 0 4px 10px rgba(249,115,22,.18) }
.so-ab2-seg button.piscando { animation: soPisca 1s ease-in-out infinite }
.so-det { margin-left: auto; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 4px 12px; font-family: inherit; font-size: 12.5px; font-weight: 800; color: ${MUDO}; cursor: pointer } .so-det:hover, .so-det.on { color: ${AZUL}; border-color: ${AZUL} }
.so-mix { animation: soEntra .3s both }
.so-cx { display: grid; gap: 12px; border-top: 1px dashed var(--portal-border, #e5e7eb); padding-top: 14px; animation: soEntra .45s both }
.so-cx-cab { display: flex; gap: 10px; align-items: center; flex-wrap: wrap }
.so-cx-p { display: flex; gap: 10px; align-items: center; border-radius: 14px; padding: 8px 14px; flex: 1 1 260px } .so-cx-p.a { background: #eff6ff } .so-cx-p.b { background: #fff7ed }
.so-cx-p > em { font-style: normal; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font-weight: 900; color: #fefefe; flex-shrink: 0 } .so-cx-p.a > em { background: ${AZUL} } .so-cx-p.b > em { background: #f97316 }
.so-cx-p b { display: block; font-size: 16px; color: #0f172a } .so-cx-p small { font-size: 12px; font-weight: 700; color: ${MUDO} }
.so-cx-vs { font-size: 13px; font-weight: 900; color: ${MUDO}; text-transform: uppercase }
.so-cx-lista { display: grid; gap: 6px } .so-cx-tit, .so-cx-l { display: grid; grid-template-columns: minmax(170px, 1.3fr) 1fr 1fr 1fr minmax(120px, 1.4fr); gap: 12px; align-items: center }
.so-cx-soa .so-cx-tit, .so-cx-soa .so-cx-l { grid-template-columns: minmax(170px, 1fr) 2fr }
.so-cx-tit { padding: 0 14px; font-size: 11px; font-weight: 900; letter-spacing: .05em; text-transform: uppercase; color: ${MUDO} }
.so-cx-l { position: relative; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #eef2f7); border-radius: 14px; padding: 10px 14px; overflow: hidden; animation: soEntra .4s both; transition: transform .2s, box-shadow .2s }
.so-cx-l:hover { transform: translateX(3px); box-shadow: 0 6px 16px rgba(15,23,42,.07) }
.so-cx-n { display: flex; gap: 10px; align-items: center } .so-cx-n > span { width: 32px; height: 32px; flex-shrink: 0; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 13%, transparent); color: var(--c) }
.so-cx-n b { display: block; font-size: 14.5px; color: var(--portal-text, #0f172a) } .so-cx-n small { font-size: 11.5px; color: ${MUDO} }
.so-cx-va b { font-size: 18px; font-weight: 900; color: ${AZUL}; font-variant-numeric: tabular-nums } .so-cx-vb b { font-size: 15px; font-weight: 800; color: #c2410c; font-variant-numeric: tabular-nums }
.so-cx-va small, .so-cx-vb small { display: block; font-size: 11.5px; font-weight: 700; color: ${MUDO} }
.so-cx-df { display: inline-block; font-size: 13.5px; font-weight: 900; border-radius: 99px; padding: 3px 10px; font-variant-numeric: tabular-nums } .so-cx-df.up { color: #047857; background: #ecfdf5 } .so-cx-df.down { color: #b91c1c; background: #fef2f2 } .so-cx-df.igual { color: ${MUDO}; background: var(--portal-bg-secondary, #f1f5f9) }
.so-cx-pc { display: block; margin: 2px 0 0 10px; font-size: 12px; font-weight: 800; color: ${MUDO} }
.so-cx-bars { display: grid; gap: 4px } .so-cx-bars span { height: 9px; border-radius: 99px; background: var(--portal-bg-secondary, #f1f5f9); overflow: hidden } .so-cx-bars i { display: block; height: 100%; border-radius: 99px; transform-origin: left; animation: soLado .9s cubic-bezier(.2,.8,.2,1) both } .so-cx-bars i.a { background: var(--c) } .so-cx-bars i.b { background: #fdba74 }
.so-cx-frase { margin: 0; display: flex; gap: 10px; align-items: flex-start; font-size: 14.5px; line-height: 1.5; color: var(--portal-text, #334155); background: linear-gradient(100deg, #eff6ff, #fff7ed); border-radius: 14px; padding: 12px 16px } .so-cx-frase > i { color: #f59e0b; font-size: 18px; margin-top: 2px }
@media (max-width: 900px) { .so-cx-tit { display: none } .so-cx-l { grid-template-columns: 1fr 1fr } .so-cx-bars { grid-column: 1 / -1 } }
.so-ab-datas { display: inline-flex; gap: 6px; align-items: center; font-size: 13px; font-weight: 800; color: #c2410c; animation: soEntra .3s both } .so-ab-datas input { border: 1px solid #fdba74; border-radius: 8px; padding: 4px 8px; font-family: inherit; font-size: 13px; background: #fefefe; color: #0f172a }
.so-cards { contain: inline-size }

.so-g .so-comp button { font-size: 13.5px; padding: 6px 14px } .so-g .so-comp-rot { font-size: 13.5px } .so-g .so-leg { font-size: 13px }
.so-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px }
.so-kpi { --c: ${AZUL}; position: relative; display: grid; gap: 6px; text-align: left; font-family: inherit; cursor: pointer; border: 1px solid var(--portal-border, #e5e7eb); background: var(--portal-bg-card, #fefefe); border-radius: 16px; padding: 14px 14px 10px; overflow: hidden; animation: soEntra .45s both; transition: transform .2s, box-shadow .2s, background .2s }
.so-kpi::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 4px; background: var(--c) }
.so-kpi:hover { transform: translateY(-3px); box-shadow: 0 10px 22px rgba(15,23,42,.1) }
.so-kpi.on { background: color-mix(in srgb, var(--c) 7%, var(--portal-bg-card, #fefefe)); box-shadow: 0 0 0 2px var(--c), 0 12px 24px color-mix(in srgb, var(--c) 22%, transparent) }
.so-kpi-cab { display: flex; align-items: center; gap: 8px }
.so-kpi-ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 14%, transparent); color: var(--c); font-size: 15px; transition: transform .25s } .so-kpi:hover .so-kpi-ic, .so-kpi.on .so-kpi-ic { transform: scale(1.1) rotate(-6deg) }
.so-kpi-cab small { flex: 1; font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: .03em; color: var(--c) } .so-kpi-cab .so-dl { font-size: 13px; padding: 2px 9px }
.so-kpi > b { font-size: 28px; line-height: 1.05; font-variant-numeric: tabular-nums; color: var(--portal-text, #0f172a) }
.so-kpi-sub { font-size: 13px; color: ${MUDO}; margin-top: -4px }
.so-kpi-ab { display: grid; gap: 4px } .so-kpi-ab > div { display: grid; grid-template-columns: 14px 1fr auto; gap: 6px; align-items: center }
.so-kpi-ab em { font-style: normal; font-size: 11px; font-weight: 900; color: ${MUDO} } .so-kpi-ab span { height: 8px; border-radius: 99px; background: var(--portal-bg-secondary, #f1f5f9); overflow: hidden }
.so-kpi-ab span i { display: block; height: 100%; border-radius: 99px; transform-origin: left; animation: soLado .8s both } .so-kpi-ab i.a { background: var(--c) } .so-kpi-ab i.b { background: #fdba74 }
.so-kpi-ab strong { font-size: 12.5px; font-variant-numeric: tabular-nums; color: var(--portal-text, #334155); min-width: 60px; text-align: right }
.so-kpi-pe { font-size: 11.5px; font-weight: 800; color: ${MUDO}; opacity: .75; border-top: 1px dashed var(--portal-border, #e5e7eb); padding-top: 6px } .so-kpi.on .so-kpi-pe { color: var(--c); opacity: 1 }
.so-atualiza { border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 5px 12px; font-family: inherit; font-weight: 800; font-size: 12.5px; color: var(--portal-text, #334155); cursor: pointer } .so-atualiza:hover:not(:disabled) { border-color: ${AZUL}; color: ${AZUL} }
.so-dl { font-weight: 900; border-radius: 99px; padding: 0 7px; font-size: 12px } .so-dl.up { color: #047857; background: #ecfdf5 } .so-dl.down { color: #b91c1c; background: #fef2f2 } .so-dl.nada { color: ${MUDO} }
.so-cmp-g .so-cmp-tab { font-size: 14.5px } .so-cmp-g .so-cmp-va b { font-size: 16.5px } .so-cmp-g td small { display: block; font-size: 12px; color: ${MUDO}; font-weight: 700 } .so-cmp-g .so-cmp-frase { font-size: 14.5px }
.so-g .so-d em { font-size: 12px } .so-g .so-d small { font-size: 12px } .so-g .so-dias { height: 160px }
.so-vazio { display: flex; gap: 8px; align-items: center; font-size: 13.5px; font-weight: 700; color: var(--portal-text-muted, #64748b); background: var(--portal-bg-secondary, #f8fafc); border: 1px dashed var(--portal-border, #e2e8f0); border-radius: 12px; padding: 10px 14px; animation: soEntra .35s both }
.so-filtros { display: flex; gap: 14px 22px; align-items: flex-end; flex-wrap: wrap; padding-bottom: 12px; border-bottom: 1px solid var(--portal-border, #eef2f7) }
.so-fg { display: grid; gap: 5px } .so-fg > small { font-size: 11px; font-weight: 900; letter-spacing: .05em; text-transform: uppercase; color: ${MUDO}; display: flex; gap: 6px; align-items: center } .so-fg > small i { color: ${AZUL} }
.so-seg { display: inline-flex; gap: 2px; background: var(--portal-bg-secondary, #f1f5f9); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 12px; padding: 3px; flex-wrap: wrap }
.so-seg button { --c: ${AZUL}; display: inline-flex; gap: 6px; align-items: center; border: none; background: transparent; border-radius: 9px; padding: 7px 14px; font-family: inherit; font-size: 13.5px; font-weight: 700; color: ${MUDO}; cursor: pointer; transition: background .2s, color .2s, box-shadow .2s }
.so-seg button i { font-size: 12px; opacity: .7 } .so-seg button:hover { color: var(--portal-text, #0f172a) }
.so-seg button.on { background: var(--portal-bg-card, #fefefe); color: var(--c); box-shadow: 0 1px 2px rgba(15,23,42,.1), 0 2px 8px rgba(15,23,42,.06) } .so-seg button.on i { opacity: 1 }
.so-fdir { margin-left: auto; display: flex; gap: 10px; align-items: center } .so-fdir small { font-size: 12.5px; color: ${MUDO} }
.so-d { position: relative; cursor: pointer } .so-d.foco { background: var(--portal-bg-secondary, #f1f5f9) }
.so-osd { position: absolute; bottom: calc(100% + 6px); z-index: 40; width: 330px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 14px; box-shadow: 0 18px 40px rgba(15,23,42,.2); padding: 10px; display: grid; gap: 6px; text-align: left; animation: soEntra .2s both; cursor: default } .so-osd.esq { left: 0 } .so-osd.dir { right: 0 }
.so-osd::after { content: ''; position: absolute; left: 0; right: 0; bottom: -8px; height: 8px }
.so-osd-cab { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 0 4px } .so-osd-cab b { font-size: 13.5px; text-transform: capitalize } .so-osd-cab span { font-size: 12px; font-weight: 800; color: ${AZUL} }
.so-osd-lista { display: grid; gap: 2px; max-height: 260px; overflow-y: auto }
.so-osd-lista button { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 8px; align-items: center; border: none; background: transparent; border-radius: 9px; padding: 6px 6px; font-family: inherit; font-size: 12.5px; text-align: left; cursor: pointer; animation: soEntra .25s both } .so-osd-lista button:hover { background: #eff6ff }
.so-osd-lista button b { white-space: nowrap } .so-osd-lista button span { color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .so-osd-lista button strong { font-variant-numeric: tabular-nums }
.so-osd-lista small, .so-osd-nada { font-size: 12px; color: ${MUDO}; padding: 2px 6px }
.so-dias-box { display: grid; gap: 6px; animation: soEntra .4s both } .so-leg { flex-wrap: wrap }
.so-card.ehb { border-color: #f97316; box-shadow: 0 0 0 2px #f97316, 0 10px 22px rgba(249,115,22,.2); background: linear-gradient(160deg, #fff7ed, var(--portal-bg-card, #fefefe)) }
.so-cards.escolhendo .so-card:hover { outline: 2px dashed #f97316; background: #fff7ed }
.so-dias { display: flex; gap: 4px; height: 140px; align-items: flex-end }
.so-d { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 2px; border-radius: 8px; transition: background .15s } .so-d:hover { background: var(--portal-bg-secondary, #f1f5f9) } .so-d.fut { opacity: .35 }
.so-d em { font-style: normal; font-size: 11px; font-weight: 800; color: ${AZUL}; height: 13px } .so-d small { font-size: 11px; font-weight: 700; color: ${MUDO}; white-space: nowrap }
.so-d-par { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 2px } .so-d-par span { width: 38%; max-width: 26px; border-radius: 4px 4px 0 0; transform-origin: bottom; animation: soSobe .6s both } .so-d-par .a { background: ${AZUL} } .so-d-par .b { background: #fdba74 }
.so-regua { position: relative; height: 110px; display: flex; gap: 1px; align-items: flex-end; cursor: ew-resize; user-select: none; border-bottom: 2px solid var(--portal-border, #e2e8f0) }
.so-regua i { flex: 1; background: #cbd5e1; border-radius: 2px 2px 0 0; transition: background .15s } .so-regua i.on { background: ${AZUL} }
.so-janela { position: absolute; top: -6px; bottom: -2px; border: 2px solid ${AZUL}; border-radius: 8px; background: rgba(37,99,235,.08); transition: left .12s, width .25s; pointer-events: none; box-shadow: 0 0 0 4px rgba(37,99,235,.12) }
.so-janela em { position: absolute; top: -22px; left: 50%; transform: translateX(-50%); font-style: normal; font-size: 11px; font-weight: 900; color: #fefefe; background: ${AZUL}; border-radius: 6px; padding: 1px 7px; white-space: nowrap }
.so-regua-meses { position: relative; height: 16px } .so-regua-meses span { position: absolute; font-size: 11px; font-weight: 800; color: ${MUDO}; text-transform: capitalize }
.so-regua-res { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap } .so-regua-res b { font-size: 28px; color: ${AZUL}; font-variant-numeric: tabular-nums } .so-regua-res span { font-size: 13px; color: var(--portal-text, #334155) } .so-regua-res small { margin-left: auto; font-size: 12px; color: ${MUDO} }
.so-trilha { display: flex; align-items: center; gap: 6px; flex-wrap: wrap } .so-trilha > i { font-size: 10px; color: ${MUDO} } .so-trilha small { margin-left: auto; font-size: 12px; color: ${MUDO} }
.so-trilha button { border: none; background: var(--portal-bg-secondary, #f1f5f9); border-radius: 99px; padding: 5px 12px; font-family: inherit; font-weight: 800; font-size: 13px; color: var(--portal-text, #334155); cursor: pointer; text-transform: capitalize } .so-trilha button.on { background: ${AZUL}; color: #fefefe }
.so-zoom { display: flex; gap: 4px; height: 170px; align-items: flex-end; animation: soZoom .4s cubic-bezier(.2,.9,.3,1) both } @keyframes soZoom { from { opacity: 0; transform: scale(.92) } }
.so-zcol { flex: 1; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 3px; border: none; background: transparent; border-radius: 8px; font-family: inherit; cursor: pointer; padding: 3px 0 } .so-zcol:hover:not(:disabled) { background: var(--portal-bg-secondary, #f1f5f9) } .so-zcol:disabled { opacity: .3; cursor: default }
.so-zcol em { font-style: normal; font-size: 10.5px; font-weight: 800; color: ${MUDO}; height: 13px } .so-zcol span { width: 70%; max-width: 40px; background: #93c5fd; border-radius: 5px 5px 0 0; transform-origin: bottom; animation: soSobe .6s both } .so-zcol.on span { background: ${AZUL}; box-shadow: 0 0 12px rgba(37,99,235,.45) } .so-zcol small { font-size: 11px; color: ${MUDO}; font-weight: 700; text-transform: capitalize }
.so-zoom-dias .so-zcol em { font-size: 9px }
`
