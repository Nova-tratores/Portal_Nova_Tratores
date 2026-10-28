'use client'
// Capa da equipe (José, 28/10/2026): "uma capa que mostra as horas e os km que a equipe toda fez, juntando todos os
// mecânicos, com o esperado, bem explicado, num gráfico, e a opção de abrir os cartões por técnico" — no lugar da
// caixinha (que virou ícone nos atalhos). Mesma conta das horas do resto da aba (useHorasEquipe).
// Gráfico (28/10/2026, "mais dinâmico, com ícone explicando o que cada coisa representa"): acumulado do mês dia a
// dia — área = o que a equipe fez, linhas = onde deveria estar (básica) e a ideal, marca de hoje e a projeção.
import { useEffect, useMemo, useState } from 'react'
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

type Ponto = { dia: string; rot: string; feito: number | null; esperado: number; ideal: number; proj: number | null }

export default function EquipeCapa({ mes }: { mes: string }) {
  const comAg = useComAguardando()
  const d = useHorasEquipe(mes, comAg)
  const { base } = useBasePosVendas()
  const [abrir, setAbrir] = useState(false)
  const [visao, setVisao] = useState<'mes' | 'semana'>('mes')
  const [auto, setAuto] = useState(true)
  const [parado, setParado] = useState(false)
  useEffect(() => {
    if (!auto || parado) return
    const t = setInterval(() => setVisao((v) => (v === 'mes' ? 'semana' : 'mes')), 9000)
    return () => clearInterval(t)
  }, [auto, parado, visao])
  const escolher = (v: 'mes' | 'semana') => { setAuto(false); setVisao(v) }
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
  const semanas = (d.tecs[0]?.semanas || []).map((w, k) => ({ rot: w.rot, de: w.de, uteis: w.uteis ?? 5, atual: w.atual, futuro: !w.fechada && !w.atual, feito: Math.round(d.tecs.reduce((s, t) => s + t.semanas[k].horas, 0) * 10) / 10, esperado: (w.uteis ?? 5) * diaBas, ideal: (w.uteis ?? 5) * diaIde }))
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

        <div className="eqc-sem">
          <div className="eqc-sem-cab">
            <div className="eqc-vis" role="tablist">
              {([['mes', 'Mês', 'fa-calendar'], ['semana', 'Semanas', 'fa-calendar-week']] as const).map(([k, r, ic]) => (
                <button key={k} type="button" role="tab" aria-selected={visao === k} className={visao === k ? 'on' : ''} onClick={() => escolher(k)}>
                  <i className={`fas ${ic}`} /> {r}
                  {visao === k && auto && !parado && <span className="eqc-vis-t" key={visao} />}
                </button>
              ))}
            </div>
            <span><i className="ok" /> bateu o esperado <i className="quase" /> perto <i className="baixo" /> abaixo</span>
          </div>
          <div className="eqc-palco" onMouseEnter={() => setParado(true)} onMouseLeave={() => setParado(false)}>
          <div key={visao} className={`eqc-slide ${visao}`}>
          {visao === 'mes' ? (() => {
            // o mês: a equipe toda e cada mecânico contra a meta do mês inteiro; a marca preta é onde deveria estar hoje
            const linhas = [
              { k: 'equipe', t: 'Equipe toda', sub: `${n} mecânicos`, feito: d.feitas, meta: metaMes, hoje: esperadoHoje, forte: true },
              ...d.tecs.map((tc) => ({ k: tc.nome, t: tc.nome.split(' ').slice(0, 2).join(' '), sub: 'mecânico', feito: tc.feitas, meta: metaMes / Math.max(1, n), hoje: esperadoHoje / Math.max(1, n), forte: false })),
            ]
            return linhas.map((l, i) => {
              const ritmoL = l.hoje ? (l.feito / l.hoje) * 100 : 0
              const tom = ritmoL >= 100 ? 'ok' : ritmoL >= 70 ? 'quase' : 'baixo'
              const larg = Math.max(l.meta, l.feito, 1)
              return (
                <div key={l.k} className={`eqc-w ${tom} ${l.forte ? 'forte' : ''}`} style={{ animationDelay: `${i * 70}ms` }}>
                  <div className="eqc-w-t"><b>{l.t}</b><small>{l.sub}</small></div>
                  <div className="eqc-w-bar" title={`Feito ${h1(l.feito)} h · meta do mês ${h1(l.meta)} h · hoje deveria estar em ${h1(l.hoje)} h`}>
                    <i className="esp" style={{ width: `${(l.meta / larg) * 100}%` }} />
                    <u style={{ width: `${(l.feito / larg) * 100}%`, animationDelay: `${120 + i * 70}ms` }} />
                    {d.atual && <s style={{ left: `${(l.hoje / larg) * 100}%` }} />}
                  </div>
                  <div className="eqc-w-v"><b>{h1(l.feito)} h</b><small>de {h1(l.meta)} h · {Math.round(l.meta ? (l.feito / l.meta) * 100 : 0)}%</small></div>
                </div>
              )
            })
          })() : semanas.map((w, i) => {
            const p = w.esperado ? (w.feito / w.esperado) * 100 : 0
            const tom = w.futuro ? 'fut' : p >= 100 ? 'ok' : p >= 70 ? 'quase' : 'baixo'
            const larg = Math.max(w.esperado, w.feito, 1)
            return (
              <div key={w.de} className={`eqc-w ${tom} ${w.atual ? 'agora' : ''}`} style={{ animationDelay: `${i * 80}ms` }}>
                <div className="eqc-w-t"><b>Semana {i + 1}</b><small>{w.rot}{w.uteis < 5 ? ` · ${w.uteis} dias úteis` : ''}</small>{w.atual && <em>esta semana</em>}</div>
                <div className="eqc-w-bar" title={`Feito ${h1(w.feito)} h · esperado ${h1(w.esperado)} h`}>
                  <i className="esp" style={{ width: `${(w.esperado / larg) * 100}%` }} />
                  <u style={{ width: `${(w.feito / larg) * 100}%`, animationDelay: `${150 + i * 80}ms` }} />
                </div>
                <div className="eqc-w-v">{w.futuro ? <small>ainda não chegou</small> : <><b>{h1(w.feito)} h</b><small>de {h1(w.esperado)} h · {Math.round(p)}%</small></>}</div>
              </div>
            )
          })}
          </div>
          </div>
          <p className="eqc-exp"><i className="fas fa-circle-info" /> {visao === 'mes'
            ? <>A barra colorida é o que foi feito no mês; o trilho cinza é a meta básica do mês inteiro (<b>4 h por dia útil de cada mecânico</b>) e a <b>marca preta</b> é onde deveria estar hoje. A cor diz se está no ritmo.</>
            : <>A barra colorida é o que <b>todos os mecânicos juntos</b> fizeram na semana; o trilho cinza é o esperado (<b>4 h por dia útil de cada um</b>). Encheu o trilho, bateu a meta básica.</>} {comAg ? 'Inclui as OS preenchidas que ainda esperam faturar.' : 'Conta só as OS já faturadas.'}</p>
        </div>
      </div>
      <button type="button" className={`eqc-abrir ${abrir ? 'on' : ''}`} onClick={() => setAbrir((v) => !v)}>
        <i className={`fas fa-chevron-${abrir ? 'up' : 'down'}`} /> {abrir ? 'Esconder os cartões por mecânico' : `Ver por mecânico (${n} cartões)`}
      </button>
      {abrir && <div className="eqc-cartoes" key={String(comAg)}><style>{ESTILO_HO}</style><style>{ESTILO_HC}</style><C6 d={d} /></div>}
    </section>
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
.eqc-sem { display: grid; gap: 8px; min-width: 0; align-content: start }
.eqc-sem-cab { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap } .eqc-sem-cab b { font-size: 15px; font-weight: 500; color: #0f172a }
.eqc-sem-cab span { display: inline-flex; gap: 6px 12px; align-items: center; flex-wrap: wrap; font-size: 12.5px; color: #475569 } .eqc-sem-cab i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: -6px } .eqc-sem-cab i.ok { background: #10b981 } .eqc-sem-cab i.quase { background: #f59e0b } .eqc-sem-cab i.baixo { background: #ef4444 }
.eqc-vis { display: inline-flex; gap: 2px; background: #f1f5f9; border-radius: 99px; padding: 3px }
.eqc-vis button { position: relative; overflow: hidden; border: 0; background: transparent; border-radius: 99px; padding: 6px 14px; font-family: inherit; font-size: 13.5px; color: #334155; cursor: pointer; transition: background .25s, color .25s }
.eqc-vis button i { font-size: 12px; margin-right: 3px; color: #2563eb } .eqc-vis button.on { background: #fefefe; color: #0f172a; box-shadow: 0 1px 3px rgba(15,23,42,.12) }
.eqc-vis-t { position: absolute; left: 12px; right: 12px; bottom: 2px; height: 2px; border-radius: 2px; background: #2563eb; transform-origin: left; animation: eqcTempo 9s linear both; opacity: .6 }
@keyframes eqcTempo { from { transform: scaleX(0) } }
.eqc-palco { position: relative; overflow: hidden }
.eqc-slide { display: grid; gap: 8px; animation: eqcSlide .55s cubic-bezier(.2,.8,.2,1) both } .eqc-slide.semana { animation-name: eqcSlideV }
@keyframes eqcSlide { from { opacity: 0; transform: translateX(-28px) } } @keyframes eqcSlideV { from { opacity: 0; transform: translateX(28px) } }
.eqc-w.forte { background: #fefefe; box-shadow: inset 0 0 0 1px #e2e8f0 } .eqc-w.forte .eqc-w-t b { font-weight: 600 } .eqc-w.forte .eqc-w-bar { height: 20px }
.eqc-w-bar s { position: absolute; top: -4px; bottom: -4px; width: 3px; border-radius: 2px; background: #0f172a; transform: translateX(-50%) }
.eqc-w { display: grid; grid-template-columns: 150px minmax(0, 1fr) 150px; gap: 14px; align-items: center; padding: 10px 12px; border-radius: 12px; background: #f8fafc; animation: eqcEntra .45s both }
.eqc-w.agora { background: #eff6ff; box-shadow: inset 0 0 0 1px #bfdbfe } .eqc-w.fut { opacity: .55 }
@keyframes eqcEntra { from { opacity: 0; transform: translateY(6px) } }
.eqc-w-t { display: grid; gap: 1px } .eqc-w-t b { font-size: 14px; font-weight: 500; color: #0f172a } .eqc-w-t small { font-size: 12.5px; color: #475569 } .eqc-w-t em { justify-self: start; font-style: normal; font-size: 11.5px; color: #1d4ed8; background: #dbeafe; border-radius: 99px; padding: 1px 8px; margin-top: 2px }
.eqc-w-bar { position: relative; height: 16px; border-radius: 99px; background: #eef2f6 }
.eqc-w-bar .esp { position: absolute; inset: 0 auto 0 0; border-radius: 99px; background: #dde3ea }
.eqc-w-bar u { position: absolute; inset: 0 auto 0 0; border-radius: 99px; transform-origin: left; animation: eqcEnche 1s cubic-bezier(.2,.8,.2,1) both }
.eqc-w.ok .eqc-w-bar u { background: linear-gradient(90deg, #34d399, #10b981) } .eqc-w.quase .eqc-w-bar u { background: linear-gradient(90deg, #fbbf24, #f59e0b) } .eqc-w.baixo .eqc-w-bar u { background: linear-gradient(90deg, #f87171, #ef4444) } .eqc-w.fut .eqc-w-bar u { background: #cbd5e1 }
.eqc-w-v { display: grid; justify-items: end; gap: 1px; font-variant-numeric: tabular-nums } .eqc-w-v b { font-size: 16px; font-weight: 500; color: #0f172a } .eqc-w-v small { font-size: 12.5px; color: #475569 }
.eqc-w.ok .eqc-w-v small { color: #047857 } .eqc-w.baixo .eqc-w-v small { color: #b91c1c } .eqc-w.quase .eqc-w-v small { color: #b45309 }
@media (max-width: 700px) { .eqc-w { grid-template-columns: 1fr; gap: 6px } .eqc-w-v { justify-items: start } }
.eqc-exp { margin: 0; font-size: 13px; color: #334155; line-height: 1.5; background: #f8fafc; border-radius: 10px; padding: 9px 12px } .eqc-exp > i { color: #2563eb; margin-right: 4px }
.eqc-abrir { justify-self: start; display: inline-flex; gap: 8px; align-items: center; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; border-radius: 99px; padding: 8px 16px; font-family: inherit; font-size: 14px; cursor: pointer } .eqc-abrir:hover, .eqc-abrir.on { background: #dbeafe }
@media (max-width: 1000px) { .eqc-corpo { grid-template-columns: 1fr } }
`
