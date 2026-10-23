'use client'
// Lado direito do simulador ★ em 3 formas (José, 21/10/2026: "troca a forma que mostra essas informações").
// Mostra o mesmo que os blocos 1, 2, 4 e 5: quanto sobrou, a conta como foi × simulado, quanto precisa para
// não ter prejuízo e a meta. Novidade das três: o empate e a meta viram UMA régua ("onde você está").
import { useState } from 'react'
import { Numero, brl, horas } from './ui'

const TXT = '#0f172a', SEG = '#334155'
const COR = { entrou: '#0369a1', gastos: '#dc2626', pessoal: '#7c3aed', sobrou: '#0f766e', faltou: '#b91c1c' }

export interface DadosLado {
  rotulo: string
  real: { entrou: number; gastos: number; pessoal: number; sobrou: number }
  sim: { entrou: number; gastos: number; pessoal: number; sobrou: number }
  mudou: boolean
  empate: number          // faturamento que deixa R$ 0
  alvo: number            // faturamento que bate a meta (= o que faturou o período anterior)
  /** a META é passar o período anterior (José, 23/10/2026) */
  anterior: { rotulo: string; entrou: number; sobrou: number } | null
  taxaG: number           // gastos ÷ faturamento
  horasPara: (alvo: number) => number
  valorHora: number
  aplicarMeta: () => void
}

const pct = (v: number, t: number) => (t ? Math.round((v / t) * 100) : 0)
const dif = (a: number, b: number, custo = false) => {
  const d = b - a
  if (Math.abs(d) < 1) return null
  return <em className={(custo ? d < 0 : d > 0) ? 'bom' : 'ruim'}>{d > 0 ? '+' : '−'}{brl(Math.abs(d))}</em>
}

// ---------------------------------------------------------------- "?" que explica (José, 23/10/2026:
// "coloca um botão em cada coisa para explicar, de forma simples")

function Explica({ texto }: { texto: string }) {
  const [aberto, setAberto] = useState(false)
  return (
    <span className="ld-x">
      <button type="button" className={`ld-x-b ${aberto ? 'on' : ''}`} onClick={(e) => { e.stopPropagation(); setAberto((v) => !v) }} aria-label="o que é isso?" aria-expanded={aberto}>?</button>
      {aberto && <span className="ld-x-t" role="note" onClick={() => setAberto(false)}>{texto}</span>}
    </span>
  )
}

const EXPLICA = {
  regua: 'Esta barra mostra onde o faturamento do mês está. Vermelho: ainda não pagou as contas. Amarelo: já pagou as contas, mas ainda não passou o mês passado. Verde: passou o mês passado.',
  prejuizo: 'É quanto precisa faturar para pagar tudo: os gastos (combustível, carro, almoço, materiais) e o pessoal (salários e comissões). Abaixo disso o mês dá prejuízo.',
  meta: 'A meta é faturar mais do que o mês passado. Passou o mês passado, bateu a meta.',
  faturou: 'É o que entrou de faturamento até agora, somando todas as OS faturadas do período.',
  entrou: 'Tudo o que entrou nas OS faturadas: mão de obra, km, peças e outros, já depois dos descontos.',
  gastos: 'O que se gasta para fazer os serviços: combustível, carro, almoço, materiais e terceiros que não foram cobrados do cliente.',
  pessoal: 'Salários e encargos (fixos todo mês) mais as comissões dos técnicos.',
  sobrou: 'O que fica para a empresa depois de pagar tudo: o que entrou, menos os gastos, menos o pessoal.',
  medidor: 'De cada R$ 100 que entraram, quanto sobrou para a empresa depois de pagar gastos e pessoal.',
}

// ---------------------------------------------------------------- a régua (empate + meta juntos)
// Prejuízo = não se paga; meta = passar o período anterior (José, 23/10/2026).

function Regua({ d }: { d: DadosLado }) {
  const fat = d.sim.entrou
  const temAlvo = Number.isFinite(d.alvo), temEmp = Number.isFinite(d.empate)
  const max = Math.max(fat, temAlvo ? d.alvo : 0, temEmp ? d.empate : 0, 1) * 1.12
  const p = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`
  const emp = temEmp ? d.empate : max
  // mês passado abaixo do "se pagar": a meta só conta depois de pagar as contas
  const alvo = temAlvo ? Math.max(d.alvo, emp) : max
  const zona = fat < emp ? 'prejuizo' : fat < alvo ? 'abaixo' : 'acima'
  const ant = d.anterior?.rotulo || 'o período anterior'
  return (
    <div className="ld-regua">
      <div className="ld-regua-t">
        <b className="ld-t" style={{ '--c': '#2563eb' } as React.CSSProperties}><i className="fas fa-bullseye ld-ic" aria-hidden />Onde o mês está <Explica texto={EXPLICA.regua} /></b>
        {temAlvo && <span className="ld-meta">meta: passar {ant} ({brl(d.alvo)}) <Explica texto={EXPLICA.meta} /></span>}
      </div>
      <div className="ld-trilha">
        <i className="z1" style={{ left: 0, width: p(emp) }} />
        <i className="z2" style={{ left: p(emp), width: `calc(${p(alvo)} - ${p(emp)})` }} />
        <i className="z3" style={{ left: p(alvo), right: 0 }} />
        <span className="ld-pino" style={{ left: p(fat) }}><b>faturou {brl(fat)}</b></span>
        {temEmp && <span className="ld-marca" style={{ left: p(emp) }} />}
        {temAlvo && <span className="ld-marca" style={{ left: p(alvo) }} />}
      </div>
      <div className="ld-escala">
        {temEmp && <span style={{ left: p(emp) }}><small>se paga a partir de <Explica texto={EXPLICA.prejuizo} /></small><b>{brl(d.empate)}</b></span>}
        {temAlvo && <span style={{ left: p(alvo) }}><small>meta: passar {ant} <Explica texto={EXPLICA.meta} /></small><b>{brl(d.alvo)}</b></span>}
      </div>
      <div className="ld-zonas"><span><i className="z1" />prejuízo</span><span><i className="z2" />pagou as contas, abaixo de {ant}</span><span><i className="z3" />passou {ant}</span><Explica texto={EXPLICA.faturou} /></div>
      <p className={`ld-frase ${zona}`}>
        {zona === 'prejuizo' && <>O mês está no <b>prejuízo</b>: faltam <b>{brl(emp - fat)}</b> para pagar todas as contas{d.valorHora > 0 ? <> — cerca de <b>{horas(d.horasPara(emp))}</b> a mais</> : null}.</>}
        {zona === 'abaixo' && <>Já pagou as contas, mas ainda <b>não passou {ant}</b>: faltam <b>{brl(alvo - fat)}</b>{d.valorHora > 0 ? <> — cerca de <b>{horas(d.horasPara(alvo))}</b> a mais</> : null}.</>}
        {zona === 'acima' && <>Bateu a meta: faturou <b>{brl(fat - d.alvo)}</b> a mais que {ant}, e <b>{brl(fat - emp)}</b> acima do que paga as contas.</>}
      </p>
      {zona !== 'acima' && temAlvo && d.valorHora > 0 && <button type="button" className="ld-bt" onClick={d.aplicarMeta}>Simular as horas que faltam para passar {ant}</button>}
      {!temAlvo && <p className="ld-frase">Sem faturamento no período anterior para comparar.</p>}
      <small className="ld-nota">Gastos crescem junto com o faturamento (hoje R$ {Math.round(d.taxaG * 100)} de cada R$ 100); salários são fixos.</small>
    </div>
  )
}

// ---------------------------------------------------------------- forma 1: extrato

function Extrato({ d }: { d: DadosLado }) {
  const s = d.sim, r = d.real
  const linhas: [string, string, number, number, string, boolean][] = [
    ['Entrou', '', r.entrou, s.entrou, COR.entrou, false],
    ['Gastos', '−', r.gastos, s.gastos, COR.gastos, true],
    ['Pessoal', '−', r.pessoal, s.pessoal, COR.pessoal, true],
  ]
  return (
    <div className="ld-cartao">
      <div className="ld-t" style={{ '--c': '#0f766e' } as React.CSSProperties}><i className="fas fa-file-invoice ld-ic" aria-hidden />Extrato de {d.rotulo}</div>
      <div className={`ld-ext ${d.mudou ? 'duas' : ''}`}>
        {d.mudou && <div className="ld-ext-l cab"><span /><span>como foi</span><span>simulado</span></div>}
        {linhas.map(([n, op, a, b, cor, custo]) => (
          <div key={n} className="ld-ext-l" data-dica={({ Entrou: `ENTROU — tudo o que entrou no mês nas OS faturadas (mão de obra, km, peças e outros), já depois dos descontos.${d.mudou ? ` Como foi: ${brl(a)}; simulado: ${brl(b)}.` : ''}`, Gastos: `GASTOS — combustível, carro, almoço, materiais e terceiros não cobrados. É R$ ${pct(b, s.entrou)} de cada R$ 100 que entraram.`, Pessoal: `PESSOAL — salários e encargos (fixos) mais as comissões. É R$ ${pct(b, s.entrou)} de cada R$ 100 que entraram.` } as Record<string, string>)[n]}>
            <span><em>{op}</em>{n}<i style={{ background: cor }} /><Explica texto={n === 'Entrou' ? EXPLICA.entrou : n === 'Gastos' ? EXPLICA.gastos : EXPLICA.pessoal} /></span>
            {d.mudou && <span className="ant">{brl(a)}</span>}
            <span><b>{brl(b)}</b>{d.mudou && dif(a, b, custo)}</span>
          </div>
        ))}
        <div className="ld-ext-l tot" data-dica={`${s.sobrou >= 0 ? 'SOBROU' : 'FALTOU'} — o que fica para a empresa depois de pagar tudo: Entrou − Gastos − Pessoal = ${brl(s.sobrou)}.${d.mudou ? ` Como foi: ${brl(r.sobrou)}.` : ''}`}>
          <span><em>=</em>{s.sobrou >= 0 ? 'Sobrou' : 'Faltou'}<Explica texto={EXPLICA.sobrou} /></span>
          {d.mudou && <span className="ant">{brl(r.sobrou)}</span>}
          <span><b style={{ color: s.sobrou >= 0 ? COR.sobrou : COR.faltou }}><Numero valor={s.sobrou} formato={brl} /></b>{d.mudou && dif(r.sobrou, s.sobrou)}</span>
        </div>
      </div>
      <p className="ld-resumo">De cada <b>R$ 100</b> que entraram, <b>R$ {pct(s.gastos, s.entrou)}</b> foram para gastos, <b>R$ {pct(s.pessoal, s.entrou)}</b> para o pessoal e <b style={{ color: s.sobrou >= 0 ? COR.sobrou : COR.faltou }}>R$ {pct(s.sobrou, s.entrou)}</b> {s.sobrou >= 0 ? 'sobraram' : 'faltaram'}.</p>
    </div>
  )
}

// ---------------------------------------------------------------- forma 2: medidor

function Medidor({ d }: { d: DadosLado }) {
  const s = d.sim, r = d.real
  const p100 = s.entrou ? (s.sobrou / s.entrou) * 100 : 0
  const ang = (Math.max(0, Math.min(100, p100)) / 100) * 180 - 90
  const R = 90, arco = (a0: number, a1: number) => {
    const pt = (a: number) => [110 + R * Math.cos(((a - 180) * Math.PI) / 180), 110 + R * Math.sin(((a - 180) * Math.PI) / 180)]
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1)
    return `M${x0},${y0} A${R},${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1}`
  }
  const pAnt = d.anterior && d.anterior.entrou > 0 ? Math.round((d.anterior.sobrou / d.anterior.entrou) * 100) : null
  return (
    <div className="ld-cartao">
      <div className="ld-t" style={{ '--c': '#0f766e' } as React.CSSProperties}><i className="fas fa-gauge ld-ic" aria-hidden />Quanto sobrou em {d.rotulo}</div>
      <div className="ld-med">
        <svg viewBox="0 0 220 130" aria-hidden>
          <path d={arco(0, 180)} stroke="#bbf7d0" strokeWidth="18" fill="none" />
          <line x1="110" y1="110" x2="110" y2="34" stroke={TXT} strokeWidth="4" strokeLinecap="round" style={{ transform: `rotate(${ang}deg)`, transformOrigin: '110px 110px', transition: 'transform .7s cubic-bezier(.2,.8,.2,1)' }} />
          <circle cx="110" cy="110" r="7" fill={TXT} />
          <text x="20" y="128" fontSize="11" fill={SEG}>R$ 0</text><text x="178" y="128" fontSize="11" fill={SEG}>R$ 100</text>
        </svg>
        <div className="ld-med-v"><b style={{ color: s.sobrou >= 0 ? COR.sobrou : COR.faltou }}>R$ {Math.round(p100)}</b><span>de cada R$ 100 sobraram <Explica texto={EXPLICA.medidor} />{pAnt != null ? <><br />({d.anterior!.rotulo}: R$ {pAnt})</> : null}</span></div>
      </div>
      <div className="ld-blocos">
        {([['Entrou', r.entrou, s.entrou, COR.entrou, false], ['Gastos', r.gastos, s.gastos, COR.gastos, true], ['Pessoal', r.pessoal, s.pessoal, COR.pessoal, true], [s.sobrou >= 0 ? 'Sobrou' : 'Faltou', r.sobrou, s.sobrou, s.sobrou >= 0 ? COR.sobrou : COR.faltou, false]] as const).map(([n, a, b, cor, custo]) => (
          <div key={n} style={{ borderTopColor: cor }}><small>{n} <Explica texto={n === 'Entrou' ? EXPLICA.entrou : n === 'Gastos' ? EXPLICA.gastos : n === 'Pessoal' ? EXPLICA.pessoal : EXPLICA.sobrou} /></small><b>{brl(b)}</b>{d.mudou ? (dif(a, b, custo) || <span>igual</span>) : <span>{pct(Math.abs(b), s.entrou)}% do que entrou</span>}</div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- forma 3: cascata deitada

function Cascata({ d }: { d: DadosLado }) {
  const s = d.sim, r = d.real
  const max = Math.max(s.entrou, r.entrou, 1)
  const w = (v: number) => `${(Math.abs(v) / max) * 100}%`
  const passos = [
    { n: 'Entrou', a: r.entrou, b: s.entrou, de: 0, v: s.entrou, cor: COR.entrou, custo: false },
    { n: '− Gastos', a: r.gastos, b: s.gastos, de: s.entrou - s.gastos, v: s.gastos, cor: COR.gastos, custo: true },
    { n: '− Pessoal', a: r.pessoal, b: s.pessoal, de: s.entrou - s.gastos - s.pessoal, v: s.pessoal, cor: COR.pessoal, custo: true },
    { n: s.sobrou >= 0 ? '= Sobrou' : '= Faltou', a: r.sobrou, b: s.sobrou, de: 0, v: s.sobrou, cor: s.sobrou >= 0 ? COR.sobrou : COR.faltou, custo: false },
  ]
  return (
    <div className="ld-cartao">
      <div className="ld-t" style={{ '--c': '#0f766e' } as React.CSSProperties}><i className="fas fa-chart-simple ld-ic" aria-hidden />Do que entrou até o que sobrou · {d.rotulo}</div>
      <div className="ld-casc">
        {passos.map((x) => (
          <div key={x.n} className="ld-casc-l">
            <span>{x.n} <Explica texto={x.n.includes('Gastos') ? EXPLICA.gastos : x.n.includes('Pessoal') ? EXPLICA.pessoal : x.n === 'Entrou' ? EXPLICA.entrou : EXPLICA.sobrou} /></span>
            <div className="ld-casc-trilho"><i style={{ left: w(Math.max(0, x.de)), width: w(x.v), background: x.cor }} /></div>
            <span><b>{brl(x.b)}</b>{d.mudou && dif(x.a, x.b, x.custo)}</span>
          </div>
        ))}
      </div>
      <p className="ld-resumo">Sobraram <b style={{ color: s.sobrou >= 0 ? COR.sobrou : COR.faltou }}>R$ {pct(s.sobrou, s.entrou)}</b> de cada R$ 100 que entraram.{d.mudou ? <> Como foi: R$ {pct(r.sobrou, r.entrou)}.</> : null}</p>
    </div>
  )
}

export function LadoDireito({ forma, d }: { forma: 1 | 2 | 3; d: DadosLado }) {
  return (
    <div className="ld">
      {forma === 1 ? <Extrato d={d} /> : forma === 2 ? <Medidor d={d} /> : <Cascata d={d} />}
      <div className="ld-cartao"><Regua d={d} /></div>
    </div>
  )
}

export const ESTILO_LD = `
.ld-x { position: relative; display: inline-flex; vertical-align: middle; margin-left: 4px }
.ld-x-b { width: 18px; height: 18px; border-radius: 50%; border: 1px solid #cbd5e1; background: #fefefe; color: #475569; font: 500 11px/1 inherit; font-family: inherit; display: grid; place-items: center; cursor: pointer; padding: 0 }
.ld-x-b:hover, .ld-x-b.on { border-color: #2563eb; color: #2563eb; background: #eff6ff }
.ld-x-t { position: absolute; left: 50%; top: calc(100% + 8px); transform: translateX(-50%); z-index: 70; width: max-content; max-width: 280px; white-space: normal; text-align: left; background: #0f172a; color: #f8fafc; font-size: 13.5px; font-weight: 400; line-height: 1.5; padding: 9px 12px; border-radius: 10px; box-shadow: 0 10px 30px rgba(15,23,42,.3); cursor: pointer; text-transform: none; letter-spacing: 0 }
.ld { display: grid; gap: 12px; color: ${TXT}; font-size: 15px; font-variant-numeric: tabular-nums }
.ld b { font-weight: 700 } .ld .bom { color: #166534; font-style: normal; font-weight: 600; font-size: 13.5px } .ld .ruim { color: #991b1b; font-style: normal; font-weight: 600; font-size: 13.5px }
.ld-cartao { background: #fefefe; border: 1px solid #e2e8f0; border-radius: 14px; padding: 18px 20px; display: grid; gap: 12px }
.ld-t { display: inline-flex; align-items: center; gap: 10px; font-size: 16.5px; font-weight: 500 !important; color: ${TXT} }
.ld-ic { width: 36px; height: 36px; border-radius: 10px; display: grid; place-items: center; font-size: 15px; color: var(--c); background: color-mix(in srgb, var(--c) 12%, #fefefe); border: 1px solid color-mix(in srgb, var(--c) 22%, #fefefe); flex: none }
.ld-cartao { border-radius: 16px; transition: box-shadow .2s } .ld-cartao:hover { box-shadow: 0 14px 30px -20px rgba(15,23,42,.45) }
.ld-ext-l b, .ld-escala b, .ld-med-v b, .ld-blocos b, .ld-casc-l b { font-weight: 500 } .ld-ext-l.tot { font-weight: 500 } .ld-ext-l.tot b { font-weight: 600 }
.ld-resumo { margin: 0; font-size: 15px; line-height: 1.55; color: #1e293b }

.ld-ext { display: grid }
.ld-ext-l { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: baseline; padding: 10px 0; border-bottom: 1px dashed #cbd5e1; font-size: 16px }
.ld-ext.duas .ld-ext-l { grid-template-columns: minmax(80px, 1fr) 110px minmax(200px, auto); gap: 18px }
/* José, 21/10/2026: "bugou aqui" — no simulado o total grande passava por cima do "como foi" */
.ld-ext.duas .ld-ext-l.tot b { font-size: 21px } .ld-ext-l > span:last-child { flex-wrap: wrap; gap: 2px 8px; min-width: 0 }
.ld-ext-l .ant { white-space: nowrap }
.ld-ext-l > span:not(:first-child) { text-align: right } .ld-ext-l > span:last-child { display: flex; gap: 8px; justify-content: flex-end; align-items: baseline }
.ld-ext-l > span:first-child { display: flex; align-items: center; gap: 8px } .ld-ext-l > span:first-child em { font-style: normal; width: 14px; color: ${SEG} } .ld-ext-l > span:first-child i { width: 10px; height: 10px; border-radius: 3px; order: -1 }
.ld-ext-l .ant { color: ${SEG}; font-size: 14.5px }
.ld-ext-l.cab { font-size: 13px; color: ${SEG}; padding: 0 0 6px; border-bottom: 1px solid #e2e8f0 }
.ld-ext-l.tot { border-bottom: 0; border-top: 2px solid ${TXT}; margin-top: 2px; font-size: 18px; font-weight: 700 } .ld-ext-l.tot b { font-size: 26px }

.ld-med { display: grid; grid-template-columns: 220px 1fr; gap: 16px; align-items: center }
.ld-med svg { width: 100%; max-width: 240px }
.ld-med-v { display: grid; gap: 4px } .ld-med-v b { font-size: 40px; line-height: 1 } .ld-med-v span { font-size: 15px; color: ${SEG}; line-height: 1.4 }
.ld-blocos { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px }
.ld-blocos > div { display: grid; gap: 2px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: 4px solid; border-radius: 10px; padding: 10px 12px }
.ld-blocos small { font-size: 13.5px; color: ${SEG} } .ld-blocos b { font-size: 18px } .ld-blocos span { font-size: 13px; color: ${SEG} }

.ld-casc { display: grid; gap: 12px }
.ld-casc-l { display: grid; grid-template-columns: 96px minmax(0, 1fr) 170px; gap: 12px; align-items: center; font-size: 15px }
.ld-casc-l > span:last-child { display: flex; gap: 8px; justify-content: flex-end; align-items: baseline }
.ld-casc-trilho { position: relative; height: 26px; background: #f1f5f9; border-radius: 6px }
.ld-casc-trilho i { position: absolute; top: 0; bottom: 0; border-radius: 6px; transition: left .6s cubic-bezier(.2,.8,.2,1), width .6s cubic-bezier(.2,.8,.2,1) }
.ld-casc-l:last-child { border-top: 2px solid ${TXT}; padding-top: 10px } .ld-casc-l:last-child b { font-size: 20px }

.ld-regua { display: grid; gap: 10px }
.ld-regua-t { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px } .ld-regua-t > b { font-size: 16px }
.ld-meta { font-size: 14.5px; color: #1e293b; display: inline-flex; align-items: center; gap: 6px }
.ld-meta input { width: 56px; height: 32px; border: 1px solid #94a3b8; border-radius: 8px; text-align: center; font-family: inherit; font-size: 15px; font-weight: 700; color: ${TXT} } .ld-meta input:focus { outline: 2px solid #0f766e; border-color: #0f766e }
.ld-trilha { position: relative; height: 22px; border-radius: 99px; margin: 34px 0 0; overflow: visible }
.ld-trilha > i { position: absolute; top: 0; bottom: 0; transition: left .6s, width .6s } .ld-trilha > i.z1 { border-radius: 99px 0 0 99px } .ld-trilha > i.z3 { border-radius: 0 99px 99px 0 }
.ld-trilha .z1, .ld-zonas .z1 { background: #fecaca } .ld-trilha .z2, .ld-zonas .z2 { background: #fde68a } .ld-trilha .z3, .ld-zonas .z3 { background: #bbf7d0 }
.ld-pino { position: absolute; top: -6px; bottom: -6px; width: 4px; margin-left: -2px; background: ${TXT}; border-radius: 2px; transition: left .6s cubic-bezier(.2,.8,.2,1) }
.ld-pino b { position: absolute; bottom: calc(100% + 4px); left: 50%; transform: translateX(-50%); white-space: nowrap; background: ${TXT}; color: #fefefe; font-size: 13px; border-radius: 6px; padding: 3px 8px }
.ld-marca { position: absolute; top: 0; bottom: 0; width: 2px; background: #fefefe; transition: left .6s }
.ld-escala { position: relative; height: 40px }
.ld-escala span { position: absolute; transform: translateX(-50%); display: grid; text-align: center; white-space: nowrap; transition: left .6s } .ld-escala small { font-size: 12.5px; color: ${SEG} } .ld-escala b { font-size: 15px }
.ld-escala span:first-child:last-child, .ld-escala span:first-child { transform: translateX(-60%) } .ld-escala span:last-child:not(:first-child) { transform: translateX(-40%) }
.ld-zonas { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13.5px; color: ${SEG} } .ld-zonas i { display: inline-block; width: 12px; height: 12px; border-radius: 3px; margin-right: 6px; vertical-align: -1px }
.ld-frase { margin: 0; border-radius: 10px; padding: 10px 14px; font-size: 15px; line-height: 1.5 } .ld-frase.prejuizo { background: #fee2e2; color: #7f1d1d } .ld-frase.abaixo { background: #fef3c7; color: #78350f } .ld-frase.acima { background: #dcfce7; color: #14532d }
.ld-bt { justify-self: start; border: 0; background: ${TXT}; color: #fefefe; border-radius: 99px; padding: 8px 16px; font-family: inherit; font-size: 14px; cursor: pointer }
.ld-nota { font-size: 13px; color: ${SEG} }
@media (max-width: 700px) { .ld-med { grid-template-columns: 1fr } .ld-blocos { grid-template-columns: repeat(2, minmax(0, 1fr)) } .ld-casc-l { grid-template-columns: 80px minmax(0, 1fr) 120px } .ld-ext.duas .ld-ext-l { grid-template-columns: minmax(0, 1fr) 90px 130px } }
`
