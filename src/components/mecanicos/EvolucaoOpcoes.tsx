'use client'
// Opções da seção "Evolução" do Painel (página de teste, José 19/10/2026: "pode remover o que já tem
// e vamos testar novos para esse aqui"). Todas com os dados reais da base do Painel.
//   E1 linha do tempo com média · E2 quatro cartões com minigráfico · E3 para onde foi o dinheiro
//   E4 um gráfico por técnico · E5 corrida dos técnicos (ranking acumulado, com play)
import { useEffect, useMemo, useRef, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Area, Line, Bar, BarChart, LineChart, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, Cell } from 'recharts'
import { montarPainel, SEM_META, SEM_TECNICO, type Escala, type PainelMontado } from '@/lib/mecanicos/painel'
import { useBasePosVendas } from './useBasePosVendas'
import { brl, horas, useContador } from './ui'
import { useComAguardando } from './useComAguardando'

const MUDO = 'var(--portal-text-muted, #64748b)'
const TX = 'var(--portal-text, #0f172a)'
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const k = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))
const CORES = { fat: '#0369a1', res: '#0f766e', hor: '#7c3aed', gas: '#ea580c', ter: '#94a3b8', pes: '#db2777' }
const PALETA = ['#0369a1', '#0f766e', '#7c3aed', '#ea580c', '#db2777', '#ca8a04', '#0891b2', '#16a34a', '#dc2626', '#475569']

export interface PontoEvo { rotulo: string; de: string; fat: number; ter: number; gas: number; pes: number; res: number; hor: number; meta: number; atual: boolean }
export interface DadosEvo { pontos: PontoEvo[]; tecnicos: string[]; porTec: Record<string, { rotulo: string; fat: number; hor: number }[]> }

/** Série do Painel já pronta para os gráficos (mesma conta do Painel: resultado = líquido − gastos − pessoal). */
export function useEvolucao(escala: Escala, n?: number): { dados: DadosEvo | null; carregando: boolean; erro: string } {
  const { base, carregando, erro } = useBasePosVendas()
  const comAg = useComAguardando()
  const dados = useMemo<DadosEvo | null>(() => {
    if (!base) return null
    const hoje = hojeSP()
    const d = montarPainel(base, escala, hoje, hoje, comAg)
    const serie = n ? d.serie.slice(-n) : d.serie
    const off = d.serie.length - serie.length
    const pontos = serie.map((b, i) => {
      const gas = d.gastosSerie[i + off]?.total || 0, pes = d.equipeSerie[i + off] || 0
      const fat = b.total.bruto, ter = Math.max(0, b.total.bruto - b.total.liquido)
      return { rotulo: b.rotulo, de: b.de, fat, ter, gas, pes, res: b.total.liquido - gas - pes, hor: b.total.faturadas, meta: b.total.meta, atual: hoje >= b.de && hoje <= b.ate }
    })
    const tecnicos = d.linhas.filter((l) => l.tecnico !== SEM_TECNICO && !SEM_META.has(l.tecnico)).map((l) => l.tecnico)
    const porTec: DadosEvo['porTec'] = {}
    for (const t of tecnicos) porTec[t] = serie.map((b) => ({ rotulo: b.rotulo, fat: b.porTecnico[t]?.bruto || 0, hor: b.porTecnico[t]?.faturadas || 0 }))
    return { pontos, tecnicos, porTec }
  }, [base, escala, n, comAg])
  return { dados, carregando, erro }
}

function Dica({ active, payload, label }: { active?: boolean; payload?: { payload: PontoEvo }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const linha = (cor: string, nome: string, v: string) => <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18 }}><span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 3, background: cor, marginRight: 6 }} />{nome}</span><b>{v}</b></div>
  return (
    <div className="ev-dica">
      <b style={{ fontSize: 13.5 }}>{label}{p.atual ? ' · em andamento' : ''}</b>
      {linha(CORES.fat, 'Faturado', brl(p.fat))}
      {linha(CORES.ter, 'Terceiros', brl(p.ter))}
      {linha(CORES.gas, 'Gastos', brl(p.gas))}
      {linha(CORES.pes, 'Pessoal', brl(p.pes))}
      {linha(CORES.res, 'Resultado', brl(p.res))}
      {linha(CORES.hor, 'Horas faturadas', horas(p.hor))}
    </div>
  )
}

const Vazio = ({ txt }: { txt: string }) => <div style={{ padding: 30, textAlign: 'center', color: MUDO }}>{txt}</div>

// ── E1 · linha do tempo com média ───────────────────────────────────────────
export function E1({ d }: { d: DadosEvo }) {
  const media = d.pontos.reduce((a, p) => a + p.fat, 0) / Math.max(1, d.pontos.length)
  return (
    <div style={{ height: 300 }}>
      <ResponsiveContainer>
        <ComposedChart data={d.pontos} margin={{ left: 0, right: 12, top: 16 }}>
          <defs><linearGradient id="evFat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={CORES.fat} stopOpacity={0.35} /><stop offset="1" stopColor={CORES.fat} stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.25)" />
          <XAxis dataKey="rotulo" tick={{ fontSize: 12.5 }} />
          <YAxis tick={{ fontSize: 11.5 }} width={48} tickFormatter={k} />
          <Tooltip content={<Dica />} />
          <ReferenceLine y={media} stroke={CORES.fat} strokeDasharray="6 4" label={{ value: `média ${k(media)}`, position: 'insideTopRight', fontSize: 11.5, fill: CORES.fat }} />
          <ReferenceLine y={0} stroke="#94a3b8" />
          <Area type="monotone" dataKey="fat" name="Faturado" stroke={CORES.fat} strokeWidth={3} fill="url(#evFat)" animationDuration={1200} />
          <Line type="monotone" dataKey="res" name="Resultado" stroke={CORES.res} strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 7 }} animationDuration={1400} />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="ev-leg"><span><i style={{ background: CORES.fat }} />Faturado</span><span><i style={{ background: CORES.res }} />Resultado (sobrou)</span><span><i style={{ background: 'transparent', borderTop: `2px dashed ${CORES.fat}`, height: 0 }} />média do faturado</span><small>passe o mouse num ponto para ver tudo daquele período</small></div>
    </div>
  )
}

// ── E2 · quatro cartões com minigráfico ─────────────────────────────────────
const METS: { id: 'fat' | 'res' | 'hor' | 'gas'; nome: string; cor: string; fmt: (v: number) => string; bomSubir: boolean }[] = [
  { id: 'fat', nome: 'Faturado', cor: CORES.fat, fmt: brl, bomSubir: true },
  { id: 'res', nome: 'Resultado', cor: CORES.res, fmt: brl, bomSubir: true },
  { id: 'hor', nome: 'Horas faturadas', cor: CORES.hor, fmt: horas, bomSubir: true },
  { id: 'gas', nome: 'Gastos', cor: CORES.gas, fmt: brl, bomSubir: false },
]
export function E2({ d }: { d: DadosEvo }) {
  const [aberto, setAberto] = useState<(typeof METS)[number]['id'] | null>(null)
  const ult = d.pontos[d.pontos.length - 1], ant = d.pontos[d.pontos.length - 2]
  const m = METS.find((x) => x.id === aberto)
  return (
    <div>
      <div className="ev-cards">
        {METS.map((x, i) => {
          const v = ult?.[x.id] ?? 0, a = ant?.[x.id] ?? 0
          const varPct = a ? ((v - a) / Math.abs(a)) * 100 : null
          const bom = varPct == null ? null : (varPct >= 0) === x.bomSubir
          return (
            <button key={x.id} type="button" className={`ev-card ${aberto === x.id ? 'on' : ''}`} style={{ ['--k' as string]: x.cor, animationDelay: `${i * 80}ms` }} onClick={() => setAberto(aberto === x.id ? null : x.id)}>
              <small>{x.nome}</small>
              <b>{x.fmt(v)}</b>
              <span style={{ color: bom == null ? MUDO : bom ? '#15803d' : '#dc2626' }}>{varPct == null ? 'sem período anterior' : `${varPct >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(varPct))}% vs anterior`}</span>
              <div style={{ height: 46, marginTop: 6 }}>
                <ResponsiveContainer><LineChart data={d.pontos}><Line type="monotone" dataKey={x.id} stroke={x.cor} strokeWidth={2.5} dot={false} animationDuration={1000} /></LineChart></ResponsiveContainer>
              </div>
            </button>
          )
        })}
      </div>
      {m && (
        <div className="ev-aberto" style={{ height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={d.pontos} margin={{ left: 0, right: 8, top: 18 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.25)" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 12.5 }} /><YAxis tick={{ fontSize: 11.5 }} width={48} tickFormatter={m.id === 'hor' ? (v: number) => `${v}h` : k} />
              <Tooltip content={<Dica />} cursor={{ fill: 'rgba(148,163,184,.12)' }} />
              <Bar dataKey={m.id} radius={[6, 6, 0, 0]} animationDuration={700}>{d.pontos.map((p, i) => <Cell key={i} fill={p.atual ? m.cor : `${m.cor}66`} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── E3 · para onde foi o dinheiro em cada período ───────────────────────────
export function E3({ d }: { d: DadosEvo }) {
  const dados = d.pontos.map((p) => ({ ...p, sobra: Math.max(0, p.res), falta: Math.min(0, p.res) }))
  return (
    <div style={{ height: 320 }}>
      <ResponsiveContainer>
        <BarChart data={dados} margin={{ left: 0, right: 8, top: 10 }} stackOffset="sign">
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.25)" />
          <XAxis dataKey="rotulo" tick={{ fontSize: 12.5 }} /><YAxis tick={{ fontSize: 11.5 }} width={48} tickFormatter={k} />
          <Tooltip content={<Dica />} cursor={{ fill: 'rgba(148,163,184,.12)' }} />
          <ReferenceLine y={0} stroke="#64748b" />
          <Bar dataKey="ter" stackId="a" fill={CORES.ter} name="Terceiros" animationDuration={600} />
          <Bar dataKey="gas" stackId="a" fill={CORES.gas} name="Gastos" animationDuration={800} />
          <Bar dataKey="pes" stackId="a" fill={CORES.pes} name="Pessoal" animationDuration={1000} />
          <Bar dataKey="sobra" stackId="a" fill={CORES.res} name="Sobrou" radius={[6, 6, 0, 0]} animationDuration={1200} />
          <Bar dataKey="falta" stackId="a" fill="#dc2626" name="Faltou" animationDuration={1200} />
        </BarChart>
      </ResponsiveContainer>
      <div className="ev-leg"><span><i style={{ background: CORES.ter }} />Terceiros</span><span><i style={{ background: CORES.gas }} />Gastos</span><span><i style={{ background: CORES.pes }} />Pessoal</span><span><i style={{ background: CORES.res }} />Sobrou</span><span><i style={{ background: '#dc2626' }} />Faltou (prejuízo)</span><small>a altura da barra é o faturado; as cores mostram para onde ele foi</small></div>
    </div>
  )
}

// ── E4 · um gráfico por técnico ─────────────────────────────────────────────
export function E4({ d }: { d: DadosEvo }) {
  const [met, setMet] = useState<'fat' | 'hor'>('fat')
  const max = Math.max(1, ...d.tecnicos.flatMap((t) => d.porTec[t].map((x) => x[met])))
  return (
    <div>
      <div className="ev-pills">{([['fat', 'Faturado'], ['hor', 'Horas faturadas']] as const).map(([id, r]) => <button key={id} type="button" className={met === id ? 'on' : ''} onClick={() => setMet(id)}>{r}</button>)}</div>
      <div className="ev-multi">
        {d.tecnicos.map((t, i) => {
          const s = d.porTec[t], tot = s.reduce((a, x) => a + x[met], 0)
          const cor = PALETA[i % PALETA.length]
          return (
            <div key={t} className="ev-mini" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="ev-mini-cab"><b>{t.split(' ').slice(0, 2).join(' ')}</b><span style={{ color: cor }}>{met === 'fat' ? brl(tot) : horas(tot)}</span></div>
              <div style={{ height: 70 }}>
                <ResponsiveContainer>
                  <BarChart data={s} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                    <YAxis hide domain={[0, max]} />
                    <Tooltip formatter={(v: number) => (met === 'fat' ? brl(v) : horas(v))} labelFormatter={(l) => String(l)} cursor={{ fill: 'rgba(148,163,184,.12)' }} />
                    <XAxis dataKey="rotulo" hide />
                    <Bar dataKey={met} fill={cor} radius={[3, 3, 0, 0]} animationDuration={800} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 12, color: MUDO, marginTop: 8 }}>Mesma escala em todos os gráficos: dá para comparar a altura direto.</div>
    </div>
  )
}

// ── E5 · corrida dos técnicos ───────────────────────────────────────────────
export function E5({ d }: { d: DadosEvo }) {
  const n = d.pontos.length
  const [passo, setPasso] = useState(n - 1)
  const [tocando, setTocando] = useState(false)
  useEffect(() => {
    if (!tocando) return
    const t = setInterval(() => setPasso((p) => { if (p >= n - 1) { setTocando(false); return p } return p + 1 }), 1100)
    return () => clearInterval(t)
  }, [tocando, n])
  const linhas = d.tecnicos.map((t, i) => ({ t, cor: PALETA[i % PALETA.length], v: d.porTec[t].slice(0, passo + 1).reduce((a, x) => a + x.fat, 0) })).sort((a, b) => b.v - a.v)
  const max = Math.max(1, ...linhas.map((l) => l.v))
  return (
    <div>
      <div className="ev-corrida-cab">
        <button type="button" className="ev-play" onClick={() => { if (passo >= n - 1) setPasso(0); setTocando((x) => !x) }}><i className={`fas ${tocando ? 'fa-pause' : 'fa-play'}`} /> {tocando ? 'pausar' : 'ver a corrida'}</button>
        <input type="range" min={0} max={n - 1} value={passo} onChange={(e) => { setTocando(false); setPasso(Number(e.target.value)) }} style={{ flex: 1 }} />
        <b style={{ fontSize: 15, color: TX, minWidth: 120, textAlign: 'right' }}>até {d.pontos[passo]?.rotulo}</b>
      </div>
      <div className="ev-corrida" style={{ height: linhas.length * 40 }}>
        {linhas.map((l, pos) => (
          <div key={l.t} className="ev-raia" style={{ transform: `translateY(${pos * 40}px)` }}>
            <span className="ev-pos">{pos + 1}º</span>
            <span className="ev-nome">{l.t.split(' ').slice(0, 2).join(' ')}</span>
            <span className="ev-trilho"><span style={{ width: `${(l.v / max) * 100}%`, background: l.cor }} /></span>
            <b className="ev-v">{brl(l.v)}</b>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: MUDO, marginTop: 8 }}>Faturamento acumulado de cada técnico desde o 1º período do gráfico. Arraste a régua ou aperte play.</div>
    </div>
  )
}

/** Série do Painel já montado → pontos do gráfico (mesma conta do Painel). */
export function pontosDoPainel(d: PainelMontado, ref: string): PontoEvo[] {
  return d.serie.map((b, i) => {
    const gas = d.gastosSerie[i]?.total || 0, pes = d.equipeSerie[i] || 0
    return { rotulo: b.rotulo, de: b.de, fat: b.total.bruto, ter: Math.max(0, b.total.bruto - b.total.liquido), gas, pes, res: b.total.liquido - gas - pes, hor: b.total.faturadas, meta: b.total.meta, atual: ref >= b.de && ref <= b.ate }
  })
}

/** Ponto do período escolhido: pulsa em volta (anel que cresce e some). */
function PontoVivo(props: { cx?: number; cy?: number; payload?: PontoEvo; cor: string }) {
  const { cx, cy, payload, cor } = props
  if (cx == null || cy == null) return null
  if (!payload?.atual) return <circle cx={cx} cy={cy} r={4} fill="var(--portal-bg-card, #fefefe)" stroke={cor} strokeWidth={2.5} />
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={cor} opacity={0.35}>
        <animate attributeName="r" values="6;16;6" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values=".4;0;.4" dur="2s" repeatCount="indefinite" />
      </circle>
      <circle cx={cx} cy={cy} r={6} fill={cor} stroke="var(--portal-bg-card, #fefefe)" strokeWidth={2.5} />
    </g>
  )
}

function Contando({ v, fmt }: { v: number; fmt: (x: number) => string }) { return <>{fmt(useContador(v, 600))}</> }

/**
 * Evolução animada (E1 escolhida pelo José em 19/10/2026: "pode ser esse, mas deixa animado").
 * A linha se desenha quando aparece na tela; o período atual pulsa; passar o mouse troca os
 * números do painel de cima (contando); clicar num ponto vai para aquele período.
 */
export function EvolucaoViva({ pontos, onIr }: { pontos: PontoEvo[]; onIr?: (de: string) => void }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [visto, setVisto] = useState(0)
  const [foco, setFoco] = useState<number | null>(null)
  useEffect(() => {
    const el = caixa.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((es) => { if (es[0]?.isIntersecting) { setVisto((x) => x + 1); io.disconnect() } }, { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const atual = Math.max(0, pontos.findIndex((p) => p.atual))
  const p = pontos[foco ?? (pontos[atual] ? atual : pontos.length - 1)]
  const media = pontos.reduce((a, x) => a + x.fat, 0) / Math.max(1, pontos.length)
  const ant = pontos[(foco ?? atual) - 1]
  const varFat = ant?.fat ? ((p.fat - ant.fat) / ant.fat) * 100 : null
  const sobra = p.fat ? (p.res / p.fat) * 100 : null
  return (
    <div ref={caixa} className="evv">
      <div className="evv-topo" key={p.rotulo}>
        <div className="evv-per"><small>{foco == null ? (p.atual ? 'período atual' : 'último período') : 'período'}</small><b>{p.rotulo}</b>
          {varFat != null && <span style={{ color: varFat >= 0 ? '#15803d' : '#dc2626' }}>{varFat >= 0 ? '▲' : '▼'} {Math.abs(Math.round(varFat))}% no faturado</span>}</div>
        <div className="evv-num" style={{ ['--k' as string]: CORES.fat }}><small>Faturado</small><b><Contando v={p.fat} fmt={brl} /></b></div>
        <div className="evv-num" style={{ ['--k' as string]: p.res >= 0 ? CORES.res : '#dc2626' }}><small>{p.res >= 0 ? 'Sobrou' : 'Faltou'}</small><b><Contando v={p.res} fmt={brl} /></b>{sobra != null && <em>{Math.round(sobra)} de cada R$ 100</em>}</div>
        <div className="evv-num" style={{ ['--k' as string]: CORES.hor }}><small>Horas faturadas</small><b><Contando v={p.hor} fmt={horas} /></b></div>
        <div className="evv-num" style={{ ['--k' as string]: CORES.gas }}><small>Gastos</small><b><Contando v={p.gas} fmt={brl} /></b></div>
      </div>
      <div style={{ height: 300 }} key={visto} onMouseLeave={() => setFoco(null)}>
        <ResponsiveContainer>
          <ComposedChart data={pontos} margin={{ left: 0, right: 14, top: 16 }}
            onMouseMove={(e: { activeTooltipIndex?: number }) => { if (typeof e?.activeTooltipIndex === 'number') setFoco(e.activeTooltipIndex) }}
            onClick={(e: { activeTooltipIndex?: number }) => { const i = e?.activeTooltipIndex; if (typeof i === 'number' && pontos[i]) onIr?.(pontos[i].de) }}>
            <defs>
              <linearGradient id="evvFat" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={CORES.fat} stopOpacity={0.38} /><stop offset="1" stopColor={CORES.fat} stopOpacity={0.02} /></linearGradient>
              <filter id="evvBrilho" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.25)" />
            <XAxis dataKey="rotulo" tick={{ fontSize: 12.5 }} />
            <YAxis tick={{ fontSize: 11.5 }} width={48} tickFormatter={k} />
            <Tooltip content={() => null} cursor={{ stroke: CORES.fat, strokeWidth: 1.5, strokeDasharray: '4 4' }} />
            <ReferenceLine y={media} stroke={CORES.fat} strokeDasharray="6 4" label={{ value: `média ${k(media)}`, position: 'insideTopRight', fontSize: 11.5, fill: CORES.fat }} />
            <ReferenceLine y={0} stroke="#94a3b8" />
            <Area type="monotone" dataKey="fat" name="Faturado" stroke={CORES.fat} strokeWidth={3} fill="url(#evvFat)" filter="url(#evvBrilho)"
              animationDuration={1600} animationEasing="ease-out" dot={(pp: object) => <PontoVivo key={`f${(pp as { index: number }).index}`} {...pp} cor={CORES.fat} />} activeDot={{ r: 8, stroke: '#fefefe', strokeWidth: 3 }} />
            <Line type="monotone" dataKey="res" name="Resultado" stroke={CORES.res} strokeWidth={3} animationBegin={500} animationDuration={1600} animationEasing="ease-out"
              dot={(pp: object) => <PontoVivo key={`r${(pp as { index: number }).index}`} {...pp} cor={CORES.res} />} activeDot={{ r: 8, stroke: '#fefefe', strokeWidth: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="ev-leg"><span><i style={{ background: CORES.fat }} />Faturado</span><span><i style={{ background: CORES.res }} />Sobrou (resultado)</span><span><i style={{ background: 'transparent', borderTop: `2px dashed ${CORES.fat}`, height: 0 }} />média do faturado</span><small>passe o mouse para ver cada período · clique para ir até ele</small></div>
    </div>
  )
}

/** Envolve uma opção com a carga dos dados reais. */
export function ComDados({ escala, n, children }: { escala: Escala; n?: number; children: (d: DadosEvo) => React.ReactNode }) {
  const { dados, carregando, erro } = useEvolucao(escala, n)
  if (erro) return <Vazio txt={erro} />
  if (!dados || carregando) return <Vazio txt="Carregando os dados do Painel…" />
  if (!dados.pontos.length) return <Vazio txt="Sem períodos para mostrar." />
  return <>{children(dados)}</>
}

export const ESTILO_EV = `
.evv-topo { display: grid; grid-template-columns: minmax(150px, 1.1fr) repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 10px; animation: evSobe .3s ease both }
@media (max-width: 900px) { .evv-topo { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
.evv-per { display: grid; align-content: center } .evv-per small { font-size: 11.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: ${MUDO} } .evv-per b { font-size: 22px; font-weight: 900; color: ${TX} } .evv-per span { font-size: 12.5px; font-weight: 800 }
.evv-num { border: 1px solid var(--portal-border, #e2e8f0); border-left: 4px solid var(--k); border-radius: 12px; padding: 8px 12px; background: var(--portal-bg-card, #fefefe); display: grid; gap: 1px }
.evv-num small { font-size: 12px; font-weight: 700; color: ${MUDO} } .evv-num b { font-size: 20px; font-weight: 900; color: var(--k); font-variant-numeric: tabular-nums; letter-spacing: -.02em } .evv-num em { font-style: normal; font-size: 11.5px; color: ${MUDO} }

.ev-dica { background: #111111; color: #fefefe; border-radius: 12px; padding: 10px 12px; font-size: 12.5px; display: grid; gap: 3px; min-width: 210px; box-shadow: 0 12px 30px rgba(0,0,0,.25) }
.ev-leg { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; font-size: 12.5px; color: ${TX}; margin-top: 6px }
.ev-leg i { display: inline-block; width: 12px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: middle } .ev-leg small { color: ${MUDO}; margin-left: auto }
.ev-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 12px }
.ev-card { text-align: left; border: 1px solid var(--portal-border, #e2e8f0); border-top: 4px solid var(--k); border-radius: 16px; background: var(--portal-bg-card, #fefefe); padding: 13px 15px 8px; cursor: pointer; font-family: inherit; display: grid; gap: 2px; animation: evSobe .45s ease both; transition: transform .2s, box-shadow .2s }
.ev-card:hover, .ev-card.on { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(15,23,42,.10) } .ev-card.on { border-color: var(--k) }
.ev-card small { font-size: 12.5px; font-weight: 800; color: ${MUDO} } .ev-card b { font-size: 24px; font-weight: 900; color: ${TX}; letter-spacing: -.02em } .ev-card span { font-size: 12.5px; font-weight: 700 }
.ev-aberto { margin-top: 12px; animation: evSobe .35s ease both }
@keyframes evSobe { from { opacity: 0; transform: translateY(10px) } }
.ev-pills { display: flex; gap: 4px; margin-bottom: 10px } .ev-pills button { border: 1px solid var(--portal-border, #e2e8f0); background: transparent; border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 13px; font-weight: 700; color: ${MUDO}; cursor: pointer } .ev-pills .on { background: #0369a1; border-color: #0369a1; color: #fefefe }
.ev-multi { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(210px, 100%), 1fr)); gap: 10px }
.ev-mini { border: 1px solid var(--portal-border, #e2e8f0); border-radius: 12px; padding: 9px 10px 4px; background: var(--portal-bg-card, #fefefe); animation: evSobe .4s ease both }
.ev-mini-cab { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: ${TX} } .ev-mini-cab span { font-weight: 800 }
.ev-corrida-cab { display: flex; gap: 12px; align-items: center; margin-bottom: 12px }
.ev-play { border: none; background: #0369a1; color: #fefefe; border-radius: 99px; padding: 7px 14px; font-family: inherit; font-size: 13px; font-weight: 800; cursor: pointer; white-space: nowrap }
.ev-corrida { position: relative }
.ev-raia { position: absolute; left: 0; right: 0; height: 34px; display: grid; grid-template-columns: 34px 150px 1fr 110px; gap: 10px; align-items: center; transition: transform .7s cubic-bezier(.2,.8,.2,1) }
.ev-pos { font-size: 13px; font-weight: 900; color: ${MUDO} } .ev-nome { font-size: 13.5px; font-weight: 800; color: ${TX}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.ev-trilho { height: 22px; border-radius: 8px; background: var(--portal-bg-secondary, #f1f5f9); overflow: hidden } .ev-trilho span { display: block; height: 100%; border-radius: 8px; transition: width .7s cubic-bezier(.2,.8,.2,1) }
.ev-v { font-size: 13.5px; color: ${TX}; text-align: right; font-variant-numeric: tabular-nums }
@media (prefers-reduced-motion: reduce) { .ev-card, .ev-mini, .ev-aberto { animation: none } .ev-raia, .ev-trilho span { transition: none } }
`
