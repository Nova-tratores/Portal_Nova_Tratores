'use client'
// Simulador do "Para onde foi o dinheiro" mais simples — PÁGINA DE TESTE (José, 21/10/2026: "esse simulador
// está muito confuso, tem que deixar algo mais fácil de entender e profissional"). Duas opções com os MESMOS
// números do Painel (contaDe do mês): A = demonstrativo (Real × Simulado), B = alavancas + resultado.
// Nada aqui muda o Painel até o José escolher.
import { useMemo, useState } from 'react'
import type { Conta } from './DinheiroOpcoes'
import { brl, Numero } from './ui'

const MUDO = 'var(--portal-text-muted, #64748b)'
const TXT = 'var(--portal-text, #0f172a)'
const BORDA = 'var(--portal-border, #e2e8f0)'
const CARTAO = 'var(--portal-bg-card, #fefefe)'
const FUNDO2 = 'var(--portal-bg-secondary, #f8fafc)'
const VERDE = '#0f766e', VERMELHO = '#b91c1c'

// ---------------------------------------------------------------- o cálculo (igual nas duas opções)

/** O que dá para mexer, em unidades do dia a dia (horas, R$, técnicos) — não em %. */
export interface Alavancas {
  horas: number        // horas faturadas no mês
  valorHora: number    // R$ médio cobrado por hora
  pecasPct: number     // peças vendidas: % a mais/menos
  descontos: number    // R$ de desconto dado nas OS
  gastos: number       // R$ de gastos (carro, almoço, materiais, terceiros não cobrados)
  reajustePct: number  // reajuste de salário (%)
  tecnicosNovos: number
}

/** Pontos de partida, tirados do mês real. */
export function base(c: Conta) {
  const sal = c.equipe.reduce((s, p) => s + p.salario - p.encargos, 0)
  const encSal = c.equipe.reduce((s, p) => s + p.encargos, 0)
  const com = c.equipe.reduce((s, p) => s + p.comissao - p.encComissao + p.prevista - p.encPrevista, 0)
  const encCom = c.equipe.reduce((s, p) => s + p.encComissao + p.encPrevista, 0)
  const resc = c.equipe.reduce((s, p) => s + p.rescisao, 0)
  const campo = c.equipe.filter((p) => p.campo && p.salario > 0.5)
  const custoTecnico = campo.length ? campo.reduce((s, p) => s + p.salario, 0) / campo.length : 0
  return {
    real: { horas: c.horas, valorHora: c.horas > 0 ? c.mo / c.horas : 0, pecasPct: 0, descontos: c.desc.total, gastos: c.gastos, reajustePct: 0, tecnicosNovos: 0 } as Alavancas,
    sal, encSal, com, encCom, resc, custoTecnico, tecnicos: campo.length,
  }
}

/** Resultado de um cenário. Comissão acompanha a mão de obra (mais horas = mais comissão); salário é fixo. */
export function simular(c: Conta, a: Alavancas) {
  const b = base(c)
  const mo = a.horas * a.valorHora
  const fatorMO = c.mo > 0 ? mo / c.mo : 1
  const receita = {
    mo, km: c.km, pecas: c.pecas * (1 + a.pecasPct / 100), outros: c.outros,
    descontoDevolvido: c.desc.total - a.descontos, // desconto que deixou de ser dado volta para o faturamento
  }
  const faturamento = receita.mo + receita.km + receita.pecas + receita.outros + receita.descontoDevolvido
  const reaj = 1 + a.reajustePct / 100
  const custos = {
    gastos: a.gastos,
    salarios: b.sal * reaj,
    encargos: b.encSal * reaj + b.encCom * fatorMO,
    comissoes: b.com * fatorMO,
    novos: a.tecnicosNovos * b.custoTecnico,
    rescisoes: b.resc,
  }
  const totalCustos = custos.gastos + custos.salarios + custos.encargos + custos.comissoes + custos.novos + custos.rescisoes
  const resultado = faturamento - totalCustos
  // empate em horas: resultado(h) = h·vh·(1 − comissão por R$ de MO) + resto = 0
  const comPorReal = c.mo > 0 ? (b.com + b.encCom) / c.mo : 0
  const resto = faturamento - receita.mo - (totalCustos - custos.comissoes - b.encCom * fatorMO)
  const margemHora = a.valorHora * (1 - comPorReal)
  const horasEmpate = margemHora > 0 ? Math.max(0, -resto / margemHora) : Infinity
  return { receita, faturamento, custos, totalCustos, resultado, margem: faturamento ? (resultado / faturamento) * 100 : 0, horasEmpate, margemHora }
}

/** Frase do empate: quantas horas para o resultado ficar zero. */
export function fraseEmpate(sim: ReturnType<typeof simular>, horasAgora: number) {
  if (!Number.isFinite(sim.horasEmpate)) return <>Com esse valor de hora a mão de obra não cobre a comissão — não há empate.</>
  if (sim.horasEmpate <= 0) return <>Peças, km e o resto do faturamento <b>já pagam todos os custos</b>, mesmo sem nenhuma hora de mão de obra.</>
  const dif = horasAgora - sim.horasEmpate
  return <>Para não dar prejuízo são precisas <b>{h1(sim.horasEmpate)}</b> faturadas no mês ({dif >= 0 ? `${h1(dif)} acima disso` : `faltam ${h1(-dif)}`}).</>
}

export const h1 = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('pt-BR')} h`
export const pct = (n: number) => `${Math.round(n)}%`
export const sinal = (n: number, f: (v: number) => string) => (Math.abs(n) < 0.5 ? '—' : `${n > 0 ? '+' : '−'}${f(Math.abs(n))}`)

// ---------------------------------------------------------------- Opção A — demonstrativo

/** Campo de número discreto, dentro da coluna "Simulado". */
function Campo({ v, onSet, passo = 1, prefixo, sufixo, min = 0 }: { v: number; onSet: (n: number) => void; passo?: number; prefixo?: string; sufixo?: string; min?: number }) {
  return (
    <span className="sa-campo">
      {prefixo && <i>{prefixo}</i>}
      <input type="number" value={Math.round(v * 100) / 100} step={passo} min={min} onChange={(e) => onSet(Math.max(min, Number(e.target.value) || 0))} />
      {sufixo && <i>{sufixo}</i>}
    </span>
  )
}

export function SimuladorDemonstrativo({ c }: { c: Conta }) {
  const b = useMemo(() => base(c), [c])
  const [a, setA] = useState<Alavancas>(b.real)
  const set = <K extends keyof Alavancas>(k: K) => (n: number) => setA((x) => ({ ...x, [k]: n }))
  const real = useMemo(() => simular(c, b.real), [c, b])
  const sim = simular(c, a)
  const mexeu = JSON.stringify(a) !== JSON.stringify(b.real)

  type Linha = { r: string; nota?: string; real: number; sim: number; campo?: React.ReactNode; custo?: boolean; total?: boolean; forte?: boolean }
  const linhas: (Linha | string)[] = [
    'Faturamento',
    { r: 'Mão de obra', nota: `${h1(a.horas)} × ${brl(a.valorHora)}`, real: real.receita.mo, sim: sim.receita.mo, campo: <><Campo v={a.horas} onSet={set('horas')} sufixo="h" /><Campo v={a.valorHora} onSet={set('valorHora')} prefixo="R$" sufixo="/h" passo={5} /></> },
    { r: 'Deslocamento (km)', real: real.receita.km, sim: sim.receita.km },
    { r: 'Peças', real: real.receita.pecas, sim: sim.receita.pecas, campo: <Campo v={a.pecasPct} onSet={set('pecasPct')} sufixo="%" min={-100} /> },
    { r: 'Outros', real: real.receita.outros, sim: sim.receita.outros },
    { r: 'Descontos dados nas OS', nota: 'o que entrou já vem descontado; dar menos desconto aumenta o faturamento', real: 0, sim: sim.receita.descontoDevolvido, campo: <Campo v={a.descontos} onSet={set('descontos')} prefixo="R$" passo={50} /> },
    { r: 'Faturamento', real: real.faturamento, sim: sim.faturamento, total: true },
    'Custos',
    { r: 'Gastos', nota: 'carro, almoço, materiais e terceiros não cobrados', real: real.custos.gastos, sim: sim.custos.gastos, custo: true, campo: <Campo v={a.gastos} onSet={set('gastos')} prefixo="R$" passo={100} /> },
    { r: 'Salários', nota: 'conta fixa do mês', real: real.custos.salarios, sim: sim.custos.salarios, custo: true, campo: <Campo v={a.reajustePct} onSet={set('reajustePct')} sufixo="% reajuste" min={-50} /> },
    { r: 'Encargos', nota: 'do salário e da comissão', real: real.custos.encargos, sim: sim.custos.encargos, custo: true },
    { r: 'Comissões', nota: 'acompanham a mão de obra', real: real.custos.comissoes, sim: sim.custos.comissoes, custo: true },
    { r: 'Técnicos novos', nota: `cada um custa ${brl(b.custoTecnico)} por mês (média da equipe)`, real: 0, sim: sim.custos.novos, custo: true, campo: <Campo v={a.tecnicosNovos} onSet={set('tecnicosNovos')} sufixo="técnico(s)" /> },
    ...(real.custos.rescisoes > 0.5 ? [{ r: 'Rescisões e acertos', real: real.custos.rescisoes, sim: sim.custos.rescisoes, custo: true }] : []),
    { r: 'Custos', real: real.totalCustos, sim: sim.totalCustos, total: true, custo: true },
    { r: 'Resultado', real: real.resultado, sim: sim.resultado, total: true, forte: true },
  ]

  return (
    <div className="sa">
      <div className="sa-topo">
        {[
          ['Faturamento', real.faturamento, sim.faturamento, false],
          ['Custos', real.totalCustos, sim.totalCustos, true],
          ['Resultado', real.resultado, sim.resultado, false],
        ].map(([r, vr, vs, custo]) => {
          const d = (vs as number) - (vr as number)
          const bom = custo ? d < 0 : d > 0
          return (
            <div key={r as string} className="sa-kpi">
              <small>{r as string}</small>
              <b style={r === 'Resultado' ? { color: (vs as number) >= 0 ? VERDE : VERMELHO } : undefined}><Numero valor={vs as number} formato={brl} /></b>
              <span>{mexeu && Math.abs(d) >= 0.5 ? <em className={bom ? 'bom' : 'ruim'}>{sinal(d, brl)} no simulado</em> : r === 'Resultado' ? `margem de ${pct(sim.margem)}` : 'real do mês'}</span>
            </div>
          )
        })}
      </div>

      <div className="sa-tab" role="table">
        <div className="sa-l sa-cab" role="row"><span /><span>Real · {c.rotulo}</span><span>Simulado</span><span>Diferença</span></div>
        {linhas.map((l, i) => typeof l === 'string'
          ? <div key={i} className="sa-grupo">{l}</div>
          : (
            <div key={i} className={`sa-l ${l.total ? 'tot' : ''} ${l.forte ? 'forte' : ''}`} role="row">
              <span className="sa-r"><b>{l.r}</b>{l.nota && <small>{l.nota}</small>}</span>
              <span>{l.real ? brl(l.custo ? -l.real : l.real) : '—'}</span>
              <span className="sa-sim">{l.campo && <span className="sa-campos">{l.campo}</span>}<strong>{l.sim || l.real ? brl(l.custo ? -l.sim : l.sim) : '—'}</strong></span>
              <span className={`sa-dif ${Math.abs(l.sim - l.real) < 0.5 ? '' : (l.custo ? l.sim < l.real : l.sim > l.real) ? 'bom' : 'ruim'}`}>{sinal(l.custo ? l.real - l.sim : l.sim - l.real, brl)}</span>
            </div>
          ))}
      </div>

      <div className="sa-rodape">
        <span><i className="fas fa-scale-balanced" /> {fraseEmpate(sim, a.horas)} Cada hora a mais deixa <b>{brl(sim.margemHora)}</b> depois da comissão.</span>
        {mexeu && <button type="button" onClick={() => setA(b.real)}><i className="fas fa-rotate-left" /> Voltar ao real</button>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Opção B — alavancas + resultado

function Alavanca({ titulo, real, v, min, max, passo, fmt, onSet }: { titulo: string; real: number; v: number; min: number; max: number; passo: number; fmt: (n: number) => string; onSet: (n: number) => void }) {
  const mudou = Math.abs(v - real) > passo / 2
  return (
    <div className={`sb-alav ${mudou ? 'on' : ''}`}>
      <div className="sb-alav-t"><span>{titulo}</span><b>{fmt(v)}</b></div>
      <input type="range" min={min} max={max} step={passo} value={v} onChange={(e) => onSet(Number(e.target.value))} />
      <div className="sb-alav-p"><small>real: {fmt(real)}</small>{mudou && <button type="button" onClick={() => onSet(real)}>voltar</button>}</div>
    </div>
  )
}

export function SimuladorAlavancas({ c }: { c: Conta }) {
  const b = useMemo(() => base(c), [c])
  const [a, setA] = useState<Alavancas>(b.real)
  const set = <K extends keyof Alavancas>(k: K) => (n: number) => setA((x) => ({ ...x, [k]: n }))
  const real = useMemo(() => simular(c, b.real), [c, b])
  const sim = simular(c, a)
  const d = sim.resultado - real.resultado
  const mexeu = JSON.stringify(a) !== JSON.stringify(b.real)
  const r = b.real
  const fat = Math.max(sim.faturamento, 1)
  const pessoal = sim.totalCustos - sim.custos.gastos
  const barra = [
    { k: 'Gastos', v: sim.custos.gastos, cor: '#94a3b8' },
    { k: 'Pessoal', v: pessoal, cor: '#475569' },
    { k: sim.resultado >= 0 ? 'Sobra' : 'Falta', v: Math.abs(sim.resultado), cor: sim.resultado >= 0 ? VERDE : VERMELHO },
  ]
  return (
    <div className="sb">
      <div className="sb-esq">
        <div className="sb-sec">Faturamento</div>
        <Alavanca titulo="Horas faturadas no mês" real={r.horas} v={a.horas} min={0} max={Math.max(40, Math.ceil(r.horas * 2))} passo={1} fmt={h1} onSet={set('horas')} />
        <Alavanca titulo="Valor médio da hora" real={r.valorHora} v={a.valorHora} min={Math.floor(r.valorHora * 0.5)} max={Math.ceil(r.valorHora * 1.6)} passo={5} fmt={brl} onSet={set('valorHora')} />
        <Alavanca titulo="Descontos dados nas OS" real={r.descontos} v={a.descontos} min={0} max={Math.max(1000, Math.ceil(r.descontos * 2))} passo={50} fmt={brl} onSet={set('descontos')} />
        <Alavanca titulo="Venda de peças" real={0} v={a.pecasPct} min={-50} max={100} passo={5} fmt={(n) => (n === 0 ? 'como está' : `${n > 0 ? '+' : ''}${n}%`)} onSet={set('pecasPct')} />
        <div className="sb-sec">Custos</div>
        <Alavanca titulo="Gastos do mês" real={r.gastos} v={a.gastos} min={0} max={Math.max(2000, Math.ceil(r.gastos * 2))} passo={100} fmt={brl} onSet={set('gastos')} />
        <Alavanca titulo="Reajuste de salário" real={0} v={a.reajustePct} min={0} max={30} passo={1} fmt={(n) => (n === 0 ? 'sem reajuste' : `+${n}%`)} onSet={set('reajustePct')} />
        <Alavanca titulo="Contratar técnicos" real={0} v={a.tecnicosNovos} min={0} max={4} passo={1} fmt={(n) => (n === 0 ? 'nenhum' : `+${n} (${brl(n * b.custoTecnico)}/mês)`)} onSet={set('tecnicosNovos')} />
      </div>

      <div className="sb-dir">
        <small>{mexeu ? 'Resultado do mês simulado' : `Resultado de ${c.rotulo}`}</small>
        <b className="sb-res" style={{ color: sim.resultado >= 0 ? VERDE : VERMELHO }}><Numero valor={sim.resultado} formato={brl} /></b>
        <span className="sb-sub">{mexeu ? <><em className={d >= 0 ? 'bom' : 'ruim'}>{sinal(d, brl)}</em> em relação ao real ({brl(real.resultado)})</> : <>margem de <b>{pct(sim.margem)}</b> sobre o faturamento</>}</span>

        <div className="sb-barra">{barra.map((x) => <i key={x.k} style={{ flexGrow: Math.max(x.v, 0.0001), background: x.cor }} title={`${x.k}: ${brl(x.v)}`} />)}</div>
        <div className="sb-conta">
          <span><small>Faturamento</small><b>{brl(sim.faturamento)}</b></span>
          {barra.map((x) => <span key={x.k}><small><i style={{ background: x.cor }} />{x.k}</small><b>{brl(x.v)}</b><em>{pct((x.v / fat) * 100)}</em></span>)}
        </div>

        <div className="sb-frases">
          <p><i className="fas fa-scale-balanced" /> {fraseEmpate(sim, a.horas)}</p>
          <p><i className="fas fa-clock" /> Cada hora a mais faturada deixa <b>{brl(sim.margemHora)}</b> depois da comissão.</p>
          <p><i className="fas fa-users" /> Salários e encargos são conta fixa: <b>{brl(sim.custos.salarios + b.encSal * (1 + a.reajustePct / 100) + sim.custos.novos)}</b> por mês, com ou sem serviço.</p>
        </div>
        {mexeu && <button type="button" className="sb-volta" onClick={() => setA(b.real)}><i className="fas fa-rotate-left" /> Voltar ao real</button>}
      </div>
    </div>
  )
}

export const ESTILO_SIM = `
.sa, .sb { color: ${TXT}; font-variant-numeric: tabular-nums }
.sa small, .sb small { color: ${MUDO} }
.bom { color: ${VERDE}; font-style: normal; font-weight: 700 } .ruim { color: ${VERMELHO}; font-style: normal; font-weight: 700 }

.sa-topo { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px }
.sa-kpi { background: ${CARTAO}; border: 1px solid ${BORDA}; border-radius: 12px; padding: 12px 16px; display: grid; gap: 2px }
.sa-kpi small { font-size: 12px } .sa-kpi b { font-size: 24px; font-weight: 700; color: ${TXT} } .sa-kpi span { font-size: 12px; color: ${MUDO} }
.sa-tab { background: ${CARTAO}; border: 1px solid ${BORDA}; border-radius: 12px; overflow: hidden }
.sa-l { display: grid; grid-template-columns: minmax(0, 1.5fr) 130px minmax(0, 1.4fr) 110px; gap: 12px; align-items: center; padding: 8px 16px; border-top: 1px solid ${BORDA}; font-size: 13.5px }
.sa-l > span:not(.sa-r) { text-align: right }
.sa-cab { background: ${FUNDO2}; border-top: 0; font-size: 11.5px; color: ${MUDO}; text-transform: uppercase; letter-spacing: .03em }
.sa-grupo { padding: 12px 16px 4px; font-size: 12px; color: ${MUDO}; text-transform: uppercase; letter-spacing: .04em; border-top: 1px solid ${BORDA} }
.sa-r { display: grid; gap: 1px; min-width: 0 } .sa-r b { font-weight: 500 } .sa-r small { font-size: 11.5px }
.sa-l.tot { background: ${FUNDO2} } .sa-l.tot .sa-r b, .sa-l.tot strong { font-weight: 700 }
.sa-l.forte { background: #f0fdfa; font-size: 15px } .sa-l.forte strong { color: ${VERDE} }
.sa-sim { display: flex; justify-content: flex-end; align-items: center; gap: 10px; flex-wrap: wrap } .sa-sim strong { font-weight: 500; min-width: 90px }
.sa-campos { display: inline-flex; gap: 6px }
.sa-campo { display: inline-flex; align-items: center; border: 1px solid ${BORDA}; border-radius: 7px; background: ${FUNDO2}; padding: 0 6px; height: 28px; transition: border-color .15s }
.sa-campo:focus-within { border-color: #2563eb; background: ${CARTAO} }
.sa-campo i { font-style: normal; font-size: 11.5px; color: ${MUDO}; white-space: nowrap }
.sa-campo input { width: 64px; border: 0; background: transparent; text-align: right; font: inherit; font-size: 13px; color: ${TXT}; outline: none; padding: 0 4px }
.sa-dif { font-size: 13px; color: ${MUDO} }
.sa-rodape { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-top: 12px; font-size: 13px; color: ${TXT} }
.sa-rodape b { font-weight: 700 } .sa-rodape i { color: ${MUDO}; margin-right: 4px }
.sa-rodape button, .sb-volta { border: 1px solid ${BORDA}; background: ${CARTAO}; color: ${TXT}; border-radius: 8px; padding: 6px 12px; font: inherit; font-size: 12.5px; cursor: pointer }

.sb { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start }
.sb-esq, .sb-dir { background: ${CARTAO}; border: 1px solid ${BORDA}; border-radius: 12px; padding: 16px }
.sb-esq { display: grid; gap: 4px }
.sb-sec { font-size: 12px; color: ${MUDO}; text-transform: uppercase; letter-spacing: .04em; padding: 8px 0 2px }
.sb-alav { padding: 8px 10px; border-radius: 10px; transition: background .2s } .sb-alav.on { background: #eff6ff }
.sb-alav-t { display: flex; justify-content: space-between; gap: 8px; font-size: 13.5px } .sb-alav-t b { font-weight: 700 }
.sb-alav input[type=range] { width: 100%; accent-color: #2563eb; margin: 6px 0 2px; cursor: pointer }
.sb-alav-p { display: flex; justify-content: space-between; align-items: center; font-size: 11.5px } .sb-alav-p button { border: 0; background: none; color: #2563eb; font: inherit; font-size: 11.5px; cursor: pointer; padding: 0 }
.sb-dir { position: sticky; top: 90px; display: grid; gap: 6px }
.sb-res { font-size: 38px; font-weight: 700; line-height: 1.1 } .sb-sub { font-size: 13px; color: ${MUDO} } .sb-sub b { color: ${TXT} }
.sb-barra { display: flex; height: 14px; border-radius: 99px; overflow: hidden; margin: 12px 0 4px; background: ${FUNDO2} } .sb-barra i { transition: flex-grow .5s ease }
.sb-conta { display: grid; gap: 0; border-top: 1px solid ${BORDA}; margin-top: 4px }
.sb-conta > span { display: grid; grid-template-columns: 1fr auto 52px; gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid ${BORDA}; font-size: 13.5px }
.sb-conta small { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: ${TXT} } .sb-conta small i { width: 10px; height: 10px; border-radius: 3px; display: inline-block }
.sb-conta b { font-weight: 500 } .sb-conta em { font-style: normal; font-size: 12px; color: ${MUDO}; text-align: right }
.sb-conta > span:first-child b { font-weight: 700 }
.sb-frases { display: grid; gap: 6px; margin-top: 10px } .sb-frases p { margin: 0; font-size: 13px; line-height: 1.45 } .sb-frases i { color: ${MUDO}; width: 18px } .sb-frases b { font-weight: 700 }
.sb-volta { justify-self: start; margin-top: 6px }
@media (max-width: 900px) { .sb { grid-template-columns: 1fr } .sb-dir { position: static } .sa-topo { grid-template-columns: 1fr } .sa-l { grid-template-columns: minmax(0, 1fr) 90px; } .sa-l > span:nth-child(2), .sa-l > span:nth-child(4) { display: none } }
`
