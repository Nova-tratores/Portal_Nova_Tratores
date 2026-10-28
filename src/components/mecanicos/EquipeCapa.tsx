'use client'
// Capa da equipe (José, 28/10/2026): "uma capa que mostra as horas e os km que a equipe toda fez, juntando todos os
// mecânicos, com o esperado, bem explicado, num gráfico, e a opção de abrir os cartões por técnico" — no lugar da
// caixinha (que virou ícone nos atalhos). Mesma conta das horas do resto da aba (useHorasEquipe).
// Gráfico (28/10/2026, "mais dinâmico, com ícone explicando o que cada coisa representa"): acumulado do mês dia a
// dia — área = o que a equipe fez, linhas = onde deveria estar (básica) e a ideal, marca de hoje e a projeção.
import { useMemo, useState } from 'react'
import { ResponsiveContainer, ComposedChart, Area, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'
import { somarDias, osAguardandoFaturar } from '@/lib/mecanicos/painel'
import { useHorasEquipe, C6, META_SEM, ESTILO_HO, ESTILO_HC } from './HorasOpcoes'
import { useBasePosVendas } from './useBasePosVendas'
import { useComAguardando, CaixaAguardando } from './useComAguardando'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const h1 = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString('pt-BR')}`
const corPct = (p: number) => (p >= 100 ? '#047857' : p >= 70 ? '#b45309' : '#b91c1c')
const util = (x: string) => { const w = new Date(`${x}T12:00:00Z`).getUTCDay(); return w > 0 && w < 6 }
const C = { feito: '#2563eb', esperado: '#94a3b8', ideal: '#7c3aed', proj: '#f59e0b' }

/** O que cada coisa do gráfico quer dizer (ícone + texto curto). */
const LEGENDA: { k: string; ic: string; cor: string; t: string; d: string }[] = [
  { k: 'feito', ic: 'fa-screwdriver-wrench', cor: C.feito, t: 'Feito pela equipe', d: 'horas cobradas de todos os mecânicos juntos' },
  { k: 'esperado', ic: 'fa-flag-checkered', cor: C.esperado, t: 'Meta básica', d: '4 h por dia útil de cada mecânico' },
  { k: 'ideal', ic: 'fa-crown', cor: C.ideal, t: 'Meta ideal', d: '8 h por dia útil de cada mecânico' },
  { k: 'proj', ic: 'fa-arrow-trend-up', cor: C.proj, t: 'Projeção', d: 'onde termina o mês se seguir no ritmo de hoje' },
]

type Ponto = { dia: string; rot: string; feito: number | null; esperado: number; ideal: number; proj: number | null }

export default function EquipeCapa({ mes }: { mes: string }) {
  const comAg = useComAguardando()
  const d = useHorasEquipe(mes, comAg)
  const { base } = useBasePosVendas()
  const [abrir, setAbrir] = useState(false)
  const [vista, setVista] = useState<'acumulado' | 'semana'>('acumulado')
  const hoje = hojeSP()

  // série do mês dia a dia, só com os mecânicos da capa (OS com 2 técnicos: cada um fica com a sua metade)
  const serie = useMemo(() => {
    if (!d || !base) return null
    const time = new Set(d.tecs.map((t) => t.nome))
    const n = d.tecs.length
    const [a, m] = mes.split('-').map(Number)
    const fim = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`
    const porDia = new Map<string, number>()
    for (const o of base.faturadas) {
      if (!o.data?.startsWith(mes)) continue
      const k = o.tecnicos.filter((t) => time.has(t)).length
      if (k) porDia.set(o.data, (porDia.get(o.data) || 0) + (o.horasCobradas * k) / Math.max(1, o.tecnicos.length))
    }
    if (comAg) {
      const ag = osAguardandoFaturar(base)
      for (const x of base.diasTodos) if (x.data?.startsWith(mes) && time.has(x.tecnico) && ag.has(x.os)) porDia.set(x.data, (porDia.get(x.data) || 0) + x.horas)
    }
    const limite = hoje.startsWith(mes) ? hoje : fim
    const diaBas = (META_SEM.basH / 5) * n, diaIde = (META_SEM.ideH / 5) * n
    let acum = 0, esp = 0, ide = 0, uteisAteHoje = 0, uteisMes = 0
    const pts: Ponto[] = []
    for (let x = `${mes}-01`; x <= fim; x = somarDias(x, 1)) {
      const u = util(x)
      if (u) { esp += diaBas; ide += diaIde; uteisMes++ }
      if (x <= limite) { acum += porDia.get(x) || 0; if (u) uteisAteHoje++ }
      pts.push({ dia: x, rot: x.slice(8, 10), feito: x <= limite ? Math.round(acum * 10) / 10 : null, esperado: Math.round(esp * 10) / 10, ideal: Math.round(ide * 10) / 10, proj: null })
    }
    // projeção: do hoje até o fim no ritmo médio por dia útil
    const porUtil = uteisAteHoje ? acum / uteisAteHoje : 0
    if (hoje.startsWith(mes) && hoje < fim) {
      let p = acum
      for (const pt of pts) {
        if (pt.dia < limite) continue
        if (pt.dia > limite && util(pt.dia)) p += porUtil
        pt.proj = Math.round(p * 10) / 10
      }
    }
    const fimProj = hoje.startsWith(mes) ? acum + porUtil * (uteisMes - uteisAteHoje) : acum
    return { pts, metaMes: esp, idealMes: ide, esperadoHoje: pts.find((p) => p.dia === limite)?.esperado ?? esp, feito: acum, fimProj, limite }
  }, [d, base, mes, comAg, hoje])

  if (!d) return <section className="eqc"><style>{ESTILO_EQC}</style><div className="eqc-carr"><i className="fas fa-circle-notch fa-spin" /> carregando as horas da equipe…</div></section>
  const n = d.tecs.length
  const diaBas = (META_SEM.basH / 5) * n, diaIde = (META_SEM.ideH / 5) * n
  const semanas = (d.tecs[0]?.semanas || []).map((w, k) => ({ rot: w.rot, feito: Math.round(d.tecs.reduce((s, t) => s + t.semanas[k].horas, 0) * 10) / 10, esperado: (w.uteis ?? 5) * diaBas, ideal: (w.uteis ?? 5) * diaIde }))
  const metaMes = serie?.metaMes ?? d.basica
  const idealMes = serie?.idealMes ?? d.ideal
  const esperadoHoje = serie?.esperadoHoje ?? d.basica
  const pMes = metaMes ? (d.feitas / metaMes) * 100 : 0
  const ritmo = esperadoHoje ? (d.feitas / esperadoHoje) * 100 : 0
  const bateram = d.tecs.filter((t) => t.pBas >= 100).length
  const varH = d.antFeitas ? Math.round(((d.feitas - d.antFeitas) / d.antFeitas) * 100) : null
  const kmPorH = d.feitas ? d.km / d.feitas : 0
  const pos = (v: number) => `${Math.min(100, (v / Math.max(1, idealMes)) * 100)}%`
  const nomeMes = MESES[Number(mes.slice(5, 7)) - 1]
  // zoom (José, 28/10/2026): a escala vai até a meta básica do mês e a projeção — a ideal (o dobro) achatava a área
  const topo = serie ? Math.ceil((Math.max(serie.metaMes, serie.fimProj, serie.feito) * 1.12) / 20) * 20 : undefined
  const idealCortada = !!serie && serie.idealMes > (topo || 0)

  return (
    <section className="eqc cpv-entra">
      <style>{ESTILO_EQC}</style>
      <div className="eqc-topo">
        <span className="eqc-t"><i className="fas fa-people-group" /> A equipe toda em {nomeMes} · {n} mecânicos somados</span>
        <CaixaAguardando />
      </div>
      <div className="eqc-corpo">
        <div className="eqc-nums">
          <div className="eqc-n">
            <span className="eqc-ic" style={{ '--c': C.feito } as React.CSSProperties}><i className="fas fa-clock" /></span>
            <div>
              <small>Horas feitas no mês</small>
              <b>{h1(d.feitas)} h <span className="de">de {h1(metaMes)} h</span></b>
              <i className="eqc-bar"><u style={{ width: pos(d.feitas) }} /><s style={{ left: pos(metaMes) }} title={`meta básica do mês: ${h1(metaMes)} h`} />{d.atual && <s className="hoje" style={{ left: pos(esperadoHoje) }} title={`onde deveria estar hoje: ${h1(esperadoHoje)} h`} />}</i>
              <span><em style={{ color: corPct(pMes) }}>{Math.round(pMes)}%</em> da meta básica do mês · a ideal é {h1(idealMes)} h</span>
            </div>
          </div>
          {d.atual && (
            <div className="eqc-n">
              <span className="eqc-ic" style={{ '--c': corPct(ritmo) } as React.CSSProperties}><i className="fas fa-gauge-high" /></span>
              <div>
                <small>Ritmo até hoje</small>
                <b style={{ color: corPct(ritmo) }}>{Math.round(ritmo)}%</b>
                <span>hoje a equipe deveria estar em <b>{h1(esperadoHoje)} h</b> · está {d.feitas >= esperadoHoje ? `${h1(d.feitas - esperadoHoje)} h à frente` : `${h1(esperadoHoje - d.feitas)} h atrás`}{serie && <> · nesse ritmo termina o mês com <b>{h1(serie.fimProj)} h</b></>}</span>
              </div>
            </div>
          )}
          <div className="eqc-n">
            <span className="eqc-ic" style={{ '--c': '#0d9488' } as React.CSSProperties}><i className="fas fa-road" /></span>
            <div>
              <small>Km rodados</small>
              <b>{Math.round(d.km).toLocaleString('pt-BR')} km</b>
              <span>{kmPorH ? `${h1(kmPorH)} km para cada hora feita` : 'nenhuma hora feita ainda'}</span>
            </div>
          </div>
          <div className="eqc-n">
            <span className="eqc-ic" style={{ '--c': '#7c3aed' } as React.CSSProperties}><i className="fas fa-medal" /></span>
            <div>
              <small>Mecânicos na meta</small>
              <b>{bateram} <span className="de">de {n}</span></b>
              <span>bateram a básica até hoje{varH != null && <> · horas <em style={{ color: varH >= 0 ? '#047857' : '#b91c1c' }}>{varH >= 0 ? '+' : ''}{varH}%</em> contra o mês passado</>}</span>
            </div>
          </div>
        </div>

        <div className="eqc-graf">
          <div className="eqc-graf-topo">
            <div className="eqc-vista">
              <button type="button" className={vista === 'acumulado' ? 'on' : ''} onClick={() => setVista('acumulado')}><i className="fas fa-chart-area" /> Acumulado no mês</button>
              <button type="button" className={vista === 'semana' ? 'on' : ''} onClick={() => setVista('semana')}><i className="fas fa-chart-column" /> Por semana</button>
            </div>
          </div>
          <div className="eqc-leg">
            {LEGENDA.filter((x) => vista === 'acumulado' || x.k !== 'proj').map((x) => (
              <div key={x.k} style={{ '--c': x.cor } as React.CSSProperties}>
                <span><i className={`fas ${x.ic}`} /></span>
                <p><b>{x.t}</b><small>{x.d}{x.k === 'ideal' && vista === 'acumulado' && idealCortada ? ' · sai pelo topo do gráfico' : ''}</small></p>
              </div>
            ))}
          </div>
          <div style={{ width: '100%', height: 250 }}>
            <ResponsiveContainer>
              {vista === 'acumulado' && serie ? (
                <ComposedChart data={serie.pts} margin={{ top: 14, right: 12, left: -8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="eqcFeito" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.feito} stopOpacity={0.45} /><stop offset="100%" stopColor={C.feito} stopOpacity={0.03} /></linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#eef2f6" />
                  <XAxis dataKey="rot" tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} interval={2} />
                  <YAxis tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} unit=" h" domain={[0, topo || 'auto']} allowDataOverflow />
                  <Tooltip content={<Dica />} />
                  {d.atual && <ReferenceLine x={serie.limite.slice(8, 10)} stroke="#0f172a" strokeDasharray="3 3" label={{ value: 'hoje', position: 'top', fontSize: 12, fill: '#0f172a' }} />}
                  <Line dataKey="ideal" stroke={C.ideal} strokeDasharray="6 4" dot={false} strokeWidth={2} animationDuration={900} />
                  <Line dataKey="esperado" stroke={C.esperado} dot={false} strokeWidth={2.5} animationDuration={900} />
                  <Area dataKey="feito" stroke={C.feito} strokeWidth={3} fill="url(#eqcFeito)" connectNulls={false} dot={{ r: 2.5, fill: C.feito, strokeWidth: 0 }} activeDot={{ r: 6 }} animationDuration={1300} />
                  <Line dataKey="proj" stroke={C.proj} strokeDasharray="4 4" dot={false} strokeWidth={2.5} connectNulls={false} animationBegin={1100} animationDuration={700} />
                </ComposedChart>
              ) : (
                <ComposedChart data={semanas} margin={{ top: 14, right: 12, left: -8, bottom: 0 }} barGap={3}>
                  <CartesianGrid vertical={false} stroke="#eef2f6" />
                  <XAxis dataKey="rot" tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} unit=" h" />
                  <Tooltip content={<Dica semana />} />
                  <Bar dataKey="esperado" fill="#cbd5e1" radius={[6, 6, 0, 0]} maxBarSize={34} animationDuration={700} />
                  <Bar dataKey="feito" fill={C.feito} radius={[6, 6, 0, 0]} maxBarSize={34} animationDuration={1000} />
                  <Line dataKey="ideal" stroke={C.ideal} strokeDasharray="6 4" dot={false} strokeWidth={2} />
                </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
          <p className="eqc-exp"><i className="fas fa-circle-info" /> {vista === 'acumulado'
            ? <>A área azul sobe a cada dia com as horas cobradas pela equipe. Se ela estiver <b>acima da linha cinza</b>, a equipe está no ritmo da meta básica; abaixo, está atrasada. A linha laranja mostra onde o mês termina se continuar no ritmo de hoje.</>
            : <>Cada semana: barra azul = horas da equipe, barra cinza = o esperado pelos dias úteis dela (semana cortada no começo ou no fim do mês vale menos).</>}
            {' '}{comAg ? 'Inclui as OS preenchidas que ainda esperam faturar.' : 'Conta só as OS já faturadas.'}</p>
        </div>
      </div>
      <button type="button" className={`eqc-abrir ${abrir ? 'on' : ''}`} onClick={() => setAbrir((v) => !v)}>
        <i className={`fas fa-chevron-${abrir ? 'up' : 'down'}`} /> {abrir ? 'Esconder os cartões por mecânico' : `Ver por mecânico (${n} cartões)`}
      </button>
      {abrir && <div className="eqc-cartoes" key={String(comAg)}><style>{ESTILO_HO}</style><style>{ESTILO_HC}</style><C6 d={d} /></div>}
    </section>
  )
}

/** Caixa do mouse no gráfico, com os ícones da legenda. */
function Dica({ active, payload, label, semana }: { active?: boolean; payload?: { dataKey?: string | number; value?: number | null }[]; label?: string | number; semana?: boolean }) {
  if (!active || !payload?.length) return null
  const v = (k: string) => payload.find((p) => p.dataKey === k)?.value
  const feito = v('feito'), esp = v('esperado')
  return (
    <div className="eqc-dica">
      <b>{semana ? `Semana ${label}` : `Até o dia ${label}`}</b>
      {LEGENDA.map((x) => { const val = v(x.k); return val == null ? null : <div key={x.k}><i className={`fas ${x.ic}`} style={{ color: x.cor }} /><span>{x.t}</span><em>{h1(Number(val))} h</em></div> })}
      {feito != null && esp != null && esp > 0 && <small style={{ color: feito >= esp ? '#047857' : '#b91c1c' }}>{feito >= esp ? `${h1(feito - esp)} h acima da básica` : `${h1(esp - feito)} h abaixo da básica`}</small>}
    </div>
  )
}

const ESTILO_EQC = `
.eqc { display: grid; gap: 14px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 18px; padding: 18px 20px }
.eqc-carr { padding: 30px; text-align: center; color: #475569 }
.eqc-topo { display: flex; gap: 10px 16px; align-items: center; justify-content: space-between; flex-wrap: wrap } .eqc-t { font-size: 15px; color: #334155 } .eqc-t i { color: #0891b2; margin-right: 4px }
.eqc-corpo { display: grid; grid-template-columns: minmax(290px, 1fr) minmax(0, 1.7fr); gap: 26px; align-items: start }
.eqc-nums { display: grid; gap: 12px }
.eqc-n { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 12px; align-items: start } .eqc-n + .eqc-n { border-top: 1px solid #f1f5f9; padding-top: 12px }
.eqc-ic { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; font-size: 15px; color: var(--c); background: color-mix(in srgb, var(--c) 12%, #fefefe) }
.eqc-n > div { display: grid; gap: 3px; min-width: 0 } .eqc-n small { font-size: 13px; color: #475569 } .eqc-n > div > b { font-size: 22px; font-weight: 500; color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1.2 } .eqc-n .de { font-size: 14px; color: #475569; font-weight: 400 }
.eqc-n > div > span { font-size: 13px; color: #334155; line-height: 1.45 } .eqc-n > div > span em { font-style: normal; font-weight: 600 } .eqc-n > div > span b { font-weight: 600 }
.eqc-bar { position: relative; display: block; height: 10px; border-radius: 99px; background: #eef2f6; margin: 4px 0 2px } .eqc-bar u { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #60a5fa, #2563eb); animation: eqcEnche 1.2s cubic-bezier(.2,.8,.2,1) both; transform-origin: left }
@keyframes eqcEnche { from { transform: scaleX(0) } }
.eqc-bar s { position: absolute; top: -4px; width: 3px; height: 18px; border-radius: 2px; background: #94a3b8; transform: translateX(-50%) } .eqc-bar s.hoje { background: #0f172a }
.eqc-graf { display: grid; gap: 10px; min-width: 0 }
.eqc-graf-topo { display: flex; justify-content: flex-end }
.eqc-vista { display: inline-flex; gap: 2px; background: #f1f5f9; border-radius: 99px; padding: 3px } .eqc-vista button { border: 0; background: transparent; border-radius: 99px; padding: 6px 14px; font-family: inherit; font-size: 13px; color: #334155; cursor: pointer } .eqc-vista button.on { background: #fefefe; color: #0f172a; box-shadow: 0 1px 3px rgba(15,23,42,.1) } .eqc-vista button i { margin-right: 4px; color: #2563eb }
.eqc-leg { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px }
.eqc-leg > div { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 9px; align-items: center; border-radius: 12px; padding: 7px 10px; background: color-mix(in srgb, var(--c) 7%, #fefefe) }
.eqc-leg > div > span { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--c); color: #fefefe; font-size: 13px }
.eqc-leg p { margin: 0; display: grid; line-height: 1.25 } .eqc-leg b { font-size: 13px; font-weight: 500; color: #0f172a } .eqc-leg small { font-size: 12px; color: #475569 }
.eqc-dica { background: #0f172a; color: #fefefe; border-radius: 12px; padding: 10px 12px; display: grid; gap: 5px; min-width: 210px; box-shadow: 0 10px 30px rgba(15,23,42,.25) }
.eqc-dica > b { font-size: 13px; font-weight: 500 } .eqc-dica > div { display: grid; grid-template-columns: 16px 1fr auto; gap: 8px; align-items: center; font-size: 12.5px } .eqc-dica span { color: #cbd5e1 } .eqc-dica em { font-style: normal; font-variant-numeric: tabular-nums }
.eqc-dica > small { font-size: 12px; font-weight: 600; filter: brightness(1.6) }
.eqc-exp { margin: 0; font-size: 13px; color: #334155; line-height: 1.5; background: #f8fafc; border-radius: 10px; padding: 9px 12px } .eqc-exp > i { color: #2563eb; margin-right: 4px }
.eqc-abrir { justify-self: start; display: inline-flex; gap: 8px; align-items: center; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; border-radius: 99px; padding: 8px 16px; font-family: inherit; font-size: 14px; cursor: pointer } .eqc-abrir:hover, .eqc-abrir.on { background: #dbeafe }
@media (max-width: 1000px) { .eqc-corpo { grid-template-columns: 1fr } }
`
