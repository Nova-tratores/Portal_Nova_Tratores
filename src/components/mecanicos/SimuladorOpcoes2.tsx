'use client'
// Mais 5 opções do simulador do mês — PÁGINA DE TESTE (José, 21/10/2026: "mais 5 opções, modernas, interativas,
// dinâmicas e profissionais"). Mesma conta das opções A e B (simular/base em SimuladorOpcoes.tsx).
import { useMemo, useState } from 'react'
import type { Conta } from './DinheiroOpcoes'
import { brl, Numero } from './ui'
import { base, simular, fraseEmpate, h1, pct, sinal, type Alavancas } from './SimuladorOpcoes'

const MUDO = 'var(--portal-text-muted, #64748b)'
const TXT = 'var(--portal-text, #0f172a)'
const BORDA = 'var(--portal-border, #e2e8f0)'
const CARTAO = 'var(--portal-bg-card, #fefefe)'
const FUNDO2 = 'var(--portal-bg-secondary, #f8fafc)'
const VERDE = '#0f766e', VERMELHO = '#b91c1c', AZUL = '#2563eb'
const COR = { fat: '#334155', gastos: '#94a3b8', salarios: '#64748b', encargos: '#a8b3c4', comissoes: '#7c8ba1', novos: '#cbd5e1' }

type Sim = ReturnType<typeof simular>
const useSim = (c: Conta) => {
  const b = useMemo(() => base(c), [c])
  const real = useMemo(() => simular(c, b.real), [c, b])
  return { b, real }
}

/** + valor − : passo fixo, mostra o valor no meio. */
function Passo({ rot, v, fmt, onSet, passo, min = 0, max = Infinity, mudou }: { rot: string; v: number; fmt: (n: number) => string; onSet: (n: number) => void; passo: number; min?: number; max?: number; mudou?: boolean }) {
  return (
    <div className={`s2-passo ${mudou ? 'on' : ''}`}>
      <small>{rot}</small>
      <div>
        <button type="button" aria-label={`menos ${rot}`} onClick={() => onSet(Math.max(min, Math.round((v - passo) * 100) / 100))}><i className="fas fa-minus" /></button>
        <b>{fmt(v)}</b>
        <button type="button" aria-label={`mais ${rot}`} onClick={() => onSet(Math.min(max, Math.round((v + passo) * 100) / 100))}><i className="fas fa-plus" /></button>
      </div>
    </div>
  )
}

function Controles({ a, real, set, b }: { a: Alavancas; real: Alavancas; set: <K extends keyof Alavancas>(k: K) => (n: number) => void; b: ReturnType<typeof base> }) {
  return (
    <div className="s2-ctrl">
      <Passo rot="Horas faturadas" v={a.horas} fmt={h1} passo={5} onSet={set('horas')} mudou={a.horas !== real.horas} />
      <Passo rot="Valor da hora" v={a.valorHora} fmt={brl} passo={10} onSet={set('valorHora')} mudou={Math.round(a.valorHora) !== Math.round(real.valorHora)} />
      <Passo rot="Gastos" v={a.gastos} fmt={brl} passo={250} onSet={set('gastos')} mudou={Math.round(a.gastos) !== Math.round(real.gastos)} />
      <Passo rot="Descontos" v={a.descontos} fmt={brl} passo={100} onSet={set('descontos')} mudou={Math.round(a.descontos) !== Math.round(real.descontos)} />
      <Passo rot="Técnicos novos" v={a.tecnicosNovos} fmt={(n) => (n ? `+${n}` : '0')} passo={1} max={5} onSet={set('tecnicosNovos')} mudou={a.tecnicosNovos !== 0} />
      <Passo rot="Reajuste" v={a.reajustePct} fmt={(n) => `${n}%`} passo={1} max={30} onSet={set('reajustePct')} mudou={a.reajustePct !== 0} />
      {b.custoTecnico > 0 && a.tecnicosNovos > 0 && <small className="s2-nota">cada técnico novo custa {brl(b.custoTecnico)} por mês</small>}
    </div>
  )
}

const useAlav = (real: Alavancas) => {
  const [a, setA] = useState<Alavancas>(real)
  const set = <K extends keyof Alavancas>(k: K) => (n: number) => setA((x) => ({ ...x, [k]: n }))
  return { a, setA, set, mexeu: JSON.stringify(a) !== JSON.stringify(real) }
}

// ---------------------------------------------------------------- C — Cascata

export function SimuladorCascata({ c }: { c: Conta }) {
  const { b, real } = useSim(c)
  const { a, setA, set, mexeu } = useAlav(b.real)
  const sim = simular(c, a)
  const passos = (s: Sim) => [
    { k: 'Faturamento', v: s.faturamento, cor: COR.fat, tipo: 'base' as const },
    { k: 'Gastos', v: s.custos.gastos, cor: COR.gastos, tipo: 'sai' as const },
    { k: 'Salários', v: s.custos.salarios + s.custos.novos, cor: COR.salarios, tipo: 'sai' as const },
    { k: 'Encargos', v: s.custos.encargos, cor: COR.encargos, tipo: 'sai' as const },
    { k: 'Comissões', v: s.custos.comissoes + s.custos.rescisoes, cor: COR.comissoes, tipo: 'sai' as const },
    { k: 'Resultado', v: s.resultado, cor: s.resultado >= 0 ? VERDE : VERMELHO, tipo: 'fim' as const },
  ]
  const escala = Math.max(sim.faturamento, real.faturamento, 1)
  const montar = (s: Sim) => { let topo = 0; return passos(s).map((p) => {
    if (p.tipo === 'base') { topo = p.v; return { ...p, de: 0, ate: p.v } }
    if (p.tipo === 'sai') { const r = { ...p, de: topo - p.v, ate: topo }; topo -= p.v; return r }
    return { ...p, de: Math.min(0, p.v), ate: Math.max(0, p.v) }
  }) }
  const bs = montar(sim), br = montar(real)
  const minimo = Math.min(0, ...bs.map((x) => x.de), ...br.map((x) => x.de))
  const total = escala - minimo
  const y = (v: number) => ((v - minimo) / total) * 100
  return (
    <div className="s2-c">
      <Controles a={a} real={b.real} set={set} b={b} />
      <div className="s2-c-graf">
        {bs.map((x, i) => (
          <div key={x.k} className="s2-c-col">
            <div className="s2-c-area">
              {mexeu && <span className="s2-c-fantasma" style={{ bottom: `${y(br[i].de)}%`, height: `${y(br[i].ate) - y(br[i].de)}%` }} />}
              <span className="s2-c-barra" style={{ bottom: `${y(x.de)}%`, height: `${Math.max(0.6, y(x.ate) - y(x.de))}%`, background: x.cor }}>
                <em>{x.tipo === 'sai' ? '−' : ''}{brl(Math.abs(x.v))}</em>
              </span>
              {minimo < 0 && <span className="s2-c-zero" style={{ bottom: `${y(0)}%` }} />}
            </div>
            <small>{x.k}</small>
            {mexeu && Math.abs(x.v - br[i].v) >= 0.5 && <i className={(x.tipo === 'sai' ? x.v < br[i].v : x.v > br[i].v) ? 'bom' : 'ruim'}>{sinal(x.v - br[i].v, brl)}</i>}
          </div>
        ))}
      </div>
      <div className="s2-rodape">
        <span>Sobram <b style={{ color: sim.resultado >= 0 ? VERDE : VERMELHO }}>{pct(sim.margem)}</b> do faturamento. {fraseEmpate(sim, a.horas)}</span>
        {mexeu && <button type="button" onClick={() => setA(b.real)}><i className="fas fa-rotate-left" /> Voltar ao real</button>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- D — Três cenários lado a lado

export function SimuladorCenarios({ c }: { c: Conta }) {
  const { b, real } = useSim(c)
  const r = b.real
  const iniciais: [string, string, Alavancas][] = [
    ['Mês fraco', '20% menos horas e peças', { ...r, horas: Math.round(r.horas * 0.8), pecasPct: -20 }],
    ['Como foi', `o real de ${c.rotulo}`, r],
    ['Mês bom', '20% mais horas, 10% mais peças', { ...r, horas: Math.round(r.horas * 1.2), pecasPct: 10 }],
  ]
  const [cen, setCen] = useState(iniciais.map((x) => x[2]))
  const sims = cen.map((a) => simular(c, a))
  const melhor = sims.reduce((m, s, i) => (s.resultado > sims[m].resultado ? i : m), 0)
  const escala = Math.max(...sims.map((s) => Math.abs(s.resultado)), 1)
  const setNo = (i: number) => <K extends keyof Alavancas>(k: K) => (n: number) => setCen((l) => l.map((x, j) => (j === i ? { ...x, [k]: n } : x)))
  return (
    <div className="s2-d">
      {iniciais.map(([nome, desc], i) => {
        const s = sims[i], a = cen[i]
        return (
          <div key={nome} className={`s2-d-col ${i === 1 ? 'real' : ''} ${i === melhor ? 'melhor' : ''}`}>
            <div className="s2-d-cab"><b>{nome}</b><small>{desc}</small></div>
            <div className="s2-d-res">
              <small>Resultado</small>
              <strong style={{ color: s.resultado >= 0 ? VERDE : VERMELHO }}><Numero valor={s.resultado} formato={brl} /></strong>
              <div className="s2-d-trilho"><span style={{ width: `${(Math.abs(s.resultado) / escala) * 100}%`, background: s.resultado >= 0 ? VERDE : VERMELHO }} /></div>
              <small>{pct(s.margem)} do faturamento{i !== 1 && <> · <i className={s.resultado >= real.resultado ? 'bom' : 'ruim'}>{sinal(s.resultado - real.resultado, brl)}</i> vs real</>}</small>
            </div>
            <div className="s2-d-num">
              <span><small>Faturamento</small><b>{brl(s.faturamento)}</b></span>
              <span><small>Custos</small><b>{brl(s.totalCustos)}</b></span>
            </div>
            <div className="s2-d-ctrl">
              <Passo rot="Horas" v={a.horas} fmt={h1} passo={5} onSet={setNo(i)('horas')} mudou={a.horas !== iniciais[i][2].horas} />
              <Passo rot="Hora" v={a.valorHora} fmt={brl} passo={10} onSet={setNo(i)('valorHora')} mudou={Math.round(a.valorHora) !== Math.round(iniciais[i][2].valorHora)} />
              <Passo rot="Gastos" v={a.gastos} fmt={brl} passo={250} onSet={setNo(i)('gastos')} mudou={Math.round(a.gastos) !== Math.round(iniciais[i][2].gastos)} />
              <Passo rot="Técnicos novos" v={a.tecnicosNovos} fmt={(n) => (n ? `+${n}` : '0')} passo={1} max={5} onSet={setNo(i)('tecnicosNovos')} mudou={a.tecnicosNovos !== 0} />
            </div>
            {i === melhor && <span className="s2-d-selo"><i className="fas fa-trophy" /> melhor resultado</span>}
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- E — Meta: quanto quero que sobre?

export function SimuladorMeta({ c }: { c: Conta }) {
  const { b, real } = useSim(c)
  const r = b.real
  const [meta, setMeta] = useState(() => Math.max(1000, Math.round((real.resultado * 1.2) / 1000) * 1000))
  const max = Math.max(10_000, Math.ceil((Math.abs(real.resultado) * 2) / 1000) * 1000)
  const falta = meta - real.resultado
  const resto = real.resultado - real.margemHora * r.horas
  const horasNec = real.margemHora > 0 ? (meta - resto) / real.margemHora : Infinity
  const comPorHora = r.valorHora > 0 ? 1 - real.margemHora / r.valorHora : 0 // parte da hora que vira comissão
  const vhNec = r.horas > 0 && comPorHora < 1 ? (meta - resto) / (r.horas * (1 - comPorHora)) : Infinity
  const gastosNec = r.gastos - falta
  const caminhos = [
    { ic: 'fa-clock', t: 'Faturar mais horas', v: Number.isFinite(horasNec) ? h1(Math.max(0, horasNec)) : '—', sub: falta > 0 ? `${h1(horasNec - r.horas)} a mais que ${c.rotulo}` : 'as horas de hoje já bastam', ok: falta <= 0 || Number.isFinite(horasNec), prog: Number.isFinite(horasNec) && horasNec > 0 ? r.horas / horasNec : 1 },
    { ic: 'fa-tag', t: 'Cobrar mais pela hora', v: Number.isFinite(vhNec) ? `${brl(Math.max(0, vhNec))}/h` : '—', sub: falta > 0 ? `hoje a média é ${brl(r.valorHora)}/h` : 'o valor de hoje já basta', ok: true, prog: vhNec > 0 ? r.valorHora / vhNec : 1 },
    { ic: 'fa-scissors', t: 'Gastar menos', v: gastosNec >= 0 ? brl(gastosNec) : 'não dá', sub: falta > 0 ? (gastosNec >= 0 ? `cortar ${brl(falta)} dos ${brl(r.gastos)} de gastos` : `os gastos são só ${brl(r.gastos)} — cortar tudo não chega`) : 'os gastos de hoje já cabem', ok: gastosNec >= 0, prog: gastosNec >= 0 && r.gastos > 0 ? gastosNec / r.gastos : 0 },
  ]
  return (
    <div className="s2-e">
      <div className="s2-e-meta">
        <small>Quanto você quer que sobre no mês?</small>
        <strong><Numero valor={meta} formato={brl} /></strong>
        <input type="range" min={0} max={max} step={500} value={meta} onChange={(e) => setMeta(Number(e.target.value))} />
        <div className="s2-e-esc"><span>R$ 0</span><span className="s2-e-real" style={{ left: `${Math.min(100, Math.max(0, (real.resultado / max) * 100))}%` }}>real: {brl(real.resultado)}</span><span>{brl(max)}</span></div>
        <p>{falta > 0 ? <>Faltam <b>{brl(falta)}</b> em relação a {c.rotulo}. Escolha um caminho (ou uma mistura deles):</> : <><b>Já está batendo</b> — {c.rotulo} deixou {brl(-falta)} a mais do que essa meta.</>}</p>
      </div>
      <div className="s2-e-cam">
        {caminhos.map((x) => (
          <div key={x.t} className={`s2-e-card ${x.ok ? '' : 'nao'}`}>
            <i className={`fas ${x.ic}`} />
            <small>{x.t}</small>
            <b>{x.v}</b>
            <div className="s2-e-prog"><span style={{ width: `${Math.max(0, Math.min(1, x.prog)) * 100}%` }} /></div>
            <small>{x.sub}</small>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- F — Tendência dos meses

export function SimuladorTendencia({ c }: { c: Conta }) {
  const { b, real } = useSim(c)
  const { a, setA, set, mexeu } = useAlav(b.real)
  const sim = simular(c, a)
  const meses = c.serie.slice(-6)
  const vals = meses.map((m, i) => (i === meses.length - 1 ? sim.resultado : m.resultado))
  const media = meses.length > 1 ? meses.slice(0, -1).reduce((s, m) => s + m.resultado, 0) / (meses.length - 1) : real.resultado
  const maxAbs = Math.max(...vals.map(Math.abs), ...meses.map((m) => Math.abs(m.resultado)), Math.abs(media), 1)
  const temNeg = vals.some((v) => v < 0) || meses.some((m) => m.resultado < 0)
  const y = (v: number) => (temNeg ? 50 + (v / maxAbs) * 50 : (v / maxAbs) * 100)
  const zero = temNeg ? 50 : 0
  return (
    <div className="s2-f">
      <div className="s2-f-graf">
        <span className="s2-f-media" style={{ bottom: `${y(media)}%` }}><em>média {brl(media)}</em></span>
        {meses.map((m, i) => {
          const ult = i === meses.length - 1, v = vals[i]
          return (
            <div key={m.rotulo} className={`s2-f-col ${ult ? 'ult' : ''}`}>
              <div className="s2-f-area">
                {ult && mexeu && <span className="s2-f-fantasma" style={{ bottom: `${Math.min(zero, y(m.resultado))}%`, height: `${Math.abs(y(m.resultado) - zero)}%` }} />}
                <span className="s2-f-barra" style={{ bottom: `${Math.min(zero, y(v))}%`, height: `${Math.max(0.6, Math.abs(y(v) - zero))}%`, background: v >= 0 ? (ult ? VERDE : '#99c5bf') : VERMELHO }} />
              </div>
              <b>{brl(v)}</b>
              <small>{m.rotulo}{ult && mexeu ? ' · simulado' : ''}</small>
            </div>
          )
        })}
      </div>
      <div className="s2-f-lado">
        <small>Resultado de {c.rotulo}{mexeu ? ' (simulado)' : ''}</small>
        <strong style={{ color: sim.resultado >= 0 ? VERDE : VERMELHO }}><Numero valor={sim.resultado} formato={brl} /></strong>
        <span>{sim.resultado >= media ? <><i className="bom">{sinal(sim.resultado - media, brl)}</i> acima da média dos meses anteriores</> : <><i className="ruim">{sinal(sim.resultado - media, brl)}</i> abaixo da média dos meses anteriores</>}</span>
        <Controles a={a} real={b.real} set={set} b={b} />
        {mexeu && <button type="button" className="s2-volta" onClick={() => setA(b.real)}><i className="fas fa-rotate-left" /> Voltar ao real</button>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- G — Ações rápidas

export function SimuladorAcoes({ c }: { c: Conta }) {
  const { b, real } = useSim(c)
  const r = b.real
  type Acao = { id: string; grupo: string; ic: string; t: string; d: string; f: (a: Alavancas) => Alavancas }
  const ACOES: Acao[] = [
    { id: 'h10', grupo: 'horas', ic: 'fa-clock', t: '+10 horas no mês', d: 'cerca de 2 h por técnico', f: (a) => ({ ...a, horas: a.horas + 10 }) },
    { id: 'h30', grupo: 'horas', ic: 'fa-business-time', t: '+30 horas no mês', d: 'um técnico com a agenda cheia', f: (a) => ({ ...a, horas: a.horas + 30 }) },
    { id: 'vh', grupo: 'vh', ic: 'fa-tag', t: `Hora a ${brl(Math.round((r.valorHora + 20) / 5) * 5)}`, d: `hoje a média é ${brl(r.valorHora)}`, f: (a) => ({ ...a, valorHora: Math.round((r.valorHora + 20) / 5) * 5 }) },
    { id: 'desc', grupo: 'desc', ic: 'fa-percent', t: 'Nenhum desconto', d: `deixar de dar ${brl(r.descontos)}`, f: (a) => ({ ...a, descontos: 0 }) },
    { id: 'pec', grupo: 'pec', ic: 'fa-gears', t: '+10% em peças', d: 'vender mais peças nas OS', f: (a) => ({ ...a, pecasPct: 10 }) },
    { id: 'g10', grupo: 'gastos', ic: 'fa-scissors', t: 'Cortar 10% dos gastos', d: `${brl(r.gastos * 0.1)} a menos`, f: (a) => ({ ...a, gastos: r.gastos * 0.9 }) },
    { id: 'tec', grupo: 'tec', ic: 'fa-user-plus', t: 'Contratar 1 técnico', d: `custo de ${brl(b.custoTecnico)}/mês`, f: (a) => ({ ...a, tecnicosNovos: 1 }) },
    { id: 'tecH', grupo: 'tec', ic: 'fa-user-gear', t: '1 técnico novo + 40 h', d: 'contratar e ele faturar 40 h no mês', f: (a) => ({ ...a, tecnicosNovos: 1, horas: a.horas + 40 }) },
    { id: 'rea', grupo: 'rea', ic: 'fa-hand-holding-dollar', t: 'Reajuste de 5%', d: 'nos salários da equipe', f: (a) => ({ ...a, reajustePct: 5 }) },
  ]
  const [on, setOn] = useState<string[]>([])
  const alternar = (x: Acao) => setOn((l) => (l.includes(x.id) ? l.filter((i) => i !== x.id) : [...l.filter((i) => ACOES.find((y) => y.id === i)?.grupo !== x.grupo), x.id]))
  const aplicar = (ids: string[]) => ids.reduce((a, id) => ACOES.find((x) => x.id === id)!.f(a), r)
  const sim = simular(c, aplicar(on))
  const efeito = (x: Acao) => simular(c, x.f(r)).resultado - real.resultado
  const d = sim.resultado - real.resultado
  return (
    <div className="s2-g">
      <div className="s2-g-grade">
        {ACOES.map((x) => {
          const e = efeito(x), ativo = on.includes(x.id)
          return (
            <button key={x.id} type="button" className={`s2-g-acao ${ativo ? 'on' : ''}`} onClick={() => alternar(x)} aria-pressed={ativo}>
              <i className={`fas ${x.ic}`} />
              <span><b>{x.t}</b><small>{x.d}</small></span>
              <em className={e >= 0 ? 'bom' : 'ruim'}>{sinal(e, brl)}</em>
            </button>
          )
        })}
      </div>
      <div className="s2-g-res">
        <small>{on.length ? `Com ${on.length} ${on.length === 1 ? 'ação' : 'ações'} escolhida${on.length === 1 ? '' : 's'}` : `Resultado de ${c.rotulo}`}</small>
        <strong style={{ color: sim.resultado >= 0 ? VERDE : VERMELHO }}><Numero valor={sim.resultado} formato={brl} /></strong>
        <span>{on.length ? <><i className={d >= 0 ? 'bom' : 'ruim'}>{sinal(d, brl)}</i> por mês · <i className={d >= 0 ? 'bom' : 'ruim'}>{sinal(d * 12, brl)}</i> no ano</> : <>escolha uma ou mais ações ao lado</>}</span>
        <div className="s2-g-margem"><span style={{ width: `${Math.max(0, Math.min(100, sim.margem))}%` }} /></div>
        <small>sobram {pct(sim.margem)} do faturamento ({brl(sim.faturamento)})</small>
        {on.length > 0 && <button type="button" className="s2-volta" onClick={() => setOn([])}><i className="fas fa-rotate-left" /> Limpar</button>}
      </div>
    </div>
  )
}

export const ESTILO_SIM2 = `
.s2-c, .s2-d, .s2-e, .s2-f, .s2-g { color: ${TXT}; font-variant-numeric: tabular-nums }
.s2-c small, .s2-d small, .s2-e small, .s2-f small, .s2-g small { color: ${MUDO} }
.s2-c .bom, .s2-d .bom, .s2-f .bom, .s2-g .bom { color: ${VERDE}; font-style: normal; font-weight: 600 } .s2-c .ruim, .s2-d .ruim, .s2-f .ruim, .s2-g .ruim { color: ${VERMELHO}; font-style: normal; font-weight: 600 }
.s2-volta, .s2-rodape button { border: 1px solid ${BORDA}; background: ${CARTAO}; color: ${TXT}; border-radius: 8px; padding: 6px 12px; font: inherit; font-size: 12.5px; cursor: pointer; justify-self: start }

.s2-passo { display: grid; gap: 4px; background: ${CARTAO}; border: 1px solid ${BORDA}; border-radius: 10px; padding: 8px 10px; transition: border-color .2s, background .2s }
.s2-passo.on { border-color: #93c5fd; background: #eff6ff }
.s2-passo small { font-size: 11.5px }
.s2-passo > div { display: flex; align-items: center; justify-content: space-between; gap: 6px }
.s2-passo b { font-weight: 600; font-size: 14px; white-space: nowrap }
.s2-passo button { width: 26px; height: 26px; border-radius: 7px; border: 1px solid ${BORDA}; background: ${FUNDO2}; color: ${TXT}; cursor: pointer; font-size: 10px; flex: none; transition: background .15s }
.s2-passo button:hover { background: #e2e8f0 } .s2-passo button:active { transform: scale(.94) }
.s2-ctrl { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px }
.s2-nota { grid-column: 1 / -1; font-size: 12px }
.s2-rodape { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 13px; margin-top: 10px } .s2-rodape b { font-weight: 700 }

.s2-c { background: ${CARTAO}; border: 1px solid ${BORDA}; border-radius: 14px; padding: 16px; display: grid; gap: 14px }
.s2-c-graf { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; align-items: end }
.s2-c-col { display: grid; gap: 4px; text-align: center } .s2-c-col small { font-size: 12.5px; color: ${TXT} } .s2-c-col > i { font-style: normal; font-size: 12px }
.s2-c-area { position: relative; height: 260px; border-bottom: 1px solid ${BORDA} }
.s2-c-barra { position: absolute; left: 12%; right: 12%; border-radius: 6px; transition: bottom .5s cubic-bezier(.2,.8,.2,1), height .5s cubic-bezier(.2,.8,.2,1), background .3s }
.s2-c-barra em { position: absolute; top: -20px; left: 50%; transform: translateX(-50%); font-style: normal; font-size: 12px; white-space: nowrap; color: ${TXT} }
.s2-c-fantasma { position: absolute; left: 6%; right: 6%; border: 1.5px dashed #94a3b8; border-radius: 6px; transition: all .5s }
.s2-c-zero { position: absolute; left: 0; right: 0; border-top: 1px solid #94a3b8 }

.s2-d { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px }
.s2-d-col { position: relative; background: ${CARTAO}; border: 1px solid ${BORDA}; border-radius: 14px; padding: 16px; display: grid; gap: 12px; align-content: start; transition: box-shadow .3s, border-color .3s }
.s2-d-col.real { background: ${FUNDO2} } .s2-d-col.melhor { border-color: #99c5bf; box-shadow: 0 6px 24px -12px rgba(15,118,110,.45) }
.s2-d-cab { display: grid } .s2-d-cab b { font-weight: 600; font-size: 15px } .s2-d-cab small { font-size: 12px }
.s2-d-res { display: grid; gap: 4px } .s2-d-res strong { font-size: 28px; font-weight: 700 } .s2-d-res small { font-size: 12px }
.s2-d-trilho { height: 6px; border-radius: 99px; background: ${FUNDO2}; overflow: hidden } .s2-d-trilho span { display: block; height: 100%; border-radius: 99px; transition: width .5s }
.s2-d-num { display: grid; grid-template-columns: 1fr 1fr; gap: 8px } .s2-d-num span { display: grid } .s2-d-num small { font-size: 11.5px } .s2-d-num b { font-weight: 600; font-size: 14px }
.s2-d-ctrl { display: grid; grid-template-columns: 1fr 1fr; gap: 6px }
.s2-d-selo { position: absolute; top: 14px; right: 14px; font-size: 11.5px; color: ${VERDE}; background: #f0fdfa; border-radius: 99px; padding: 2px 9px }

.s2-e { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 14px; align-items: stretch }
.s2-e-meta { background: ${CARTAO}; border: 1px solid ${BORDA}; border-radius: 14px; padding: 18px; display: grid; gap: 8px; align-content: start }
.s2-e-meta > small { font-size: 13px } .s2-e-meta strong { font-size: 36px; font-weight: 700 }
.s2-e-meta input[type=range] { width: 100%; accent-color: ${VERDE}; cursor: pointer }
.s2-e-esc { position: relative; display: flex; justify-content: space-between; font-size: 11.5px; color: ${MUDO}; height: 18px }
.s2-e-real { position: absolute; transform: translateX(-50%); color: ${TXT}; white-space: nowrap }
.s2-e-meta p { margin: 4px 0 0; font-size: 13.5px; line-height: 1.5 } .s2-e-meta p b { font-weight: 700 }
.s2-e-cam { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px }
.s2-e-card { background: ${CARTAO}; border: 1px solid ${BORDA}; border-radius: 14px; padding: 16px; display: grid; gap: 6px; align-content: start; transition: opacity .3s }
.s2-e-card > i { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: ${FUNDO2}; color: ${TXT} }
.s2-e-card b { font-size: 22px; font-weight: 700 } .s2-e-card small { font-size: 12.5px }
.s2-e-card.nao { opacity: .55 } .s2-e-card.nao b { color: ${VERMELHO} }
.s2-e-prog { height: 6px; border-radius: 99px; background: ${FUNDO2}; overflow: hidden } .s2-e-prog span { display: block; height: 100%; background: ${AZUL}; border-radius: 99px; transition: width .4s }

.s2-f { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px }
.s2-f-graf { position: relative; background: ${CARTAO}; border: 1px solid ${BORDA}; border-radius: 14px; padding: 30px 16px 14px; display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; align-items: end }
.s2-f-media { position: absolute; left: 16px; right: 16px; border-top: 1px dashed #94a3b8; margin-bottom: 52px; transition: bottom .5s; z-index: 1 } .s2-f-media em { position: absolute; right: 0; top: -18px; font-style: normal; font-size: 11.5px; color: ${MUDO} }
.s2-f-col { display: grid; gap: 3px; text-align: center } .s2-f-col b { font-size: 12.5px; font-weight: 500 } .s2-f-col small { font-size: 11.5px }
.s2-f-col.ult b { font-weight: 700 }
.s2-f-area { position: relative; height: 220px }
.s2-f-barra { position: absolute; left: 14%; right: 14%; border-radius: 6px; transition: bottom .5s, height .5s, background .3s }
.s2-f-fantasma { position: absolute; left: 6%; right: 6%; border: 1.5px dashed #94a3b8; border-radius: 6px }
.s2-f-lado { background: ${CARTAO}; border: 1px solid ${BORDA}; border-radius: 14px; padding: 16px; display: grid; gap: 8px; align-content: start }
.s2-f-lado > strong { font-size: 32px; font-weight: 700 } .s2-f-lado > span { font-size: 13px; color: ${MUDO} }
.s2-f-lado .s2-ctrl { grid-template-columns: 1fr 1fr; margin-top: 6px }

.s2-g { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 14px; align-items: start }
.s2-g-grade { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px }
.s2-g-acao { display: grid; grid-template-columns: 34px 1fr auto; gap: 10px; align-items: center; text-align: left; background: ${CARTAO}; border: 1px solid ${BORDA}; border-radius: 12px; padding: 12px; cursor: pointer; font: inherit; color: ${TXT}; transition: border-color .2s, background .2s, transform .15s }
.s2-g-acao:hover { border-color: #93c5fd; transform: translateY(-1px) } .s2-g-acao.on { border-color: ${AZUL}; background: #eff6ff }
.s2-g-acao > i { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: ${FUNDO2}; transition: background .2s, color .2s } .s2-g-acao.on > i { background: ${AZUL}; color: #fefefe }
.s2-g-acao span { display: grid; min-width: 0 } .s2-g-acao b { font-weight: 600; font-size: 13.5px } .s2-g-acao small { font-size: 12px }
.s2-g-acao em { font-size: 12.5px; white-space: nowrap }
.s2-g-res { position: sticky; top: 90px; background: ${CARTAO}; border: 1px solid ${BORDA}; border-radius: 14px; padding: 18px; display: grid; gap: 6px }
.s2-g-res strong { font-size: 36px; font-weight: 700 } .s2-g-res > span { font-size: 13px; color: ${MUDO} }
.s2-g-margem { height: 8px; border-radius: 99px; background: ${FUNDO2}; overflow: hidden; margin-top: 6px } .s2-g-margem span { display: block; height: 100%; background: ${VERDE}; border-radius: 99px; transition: width .5s }

@media (max-width: 900px) {
  .s2-d, .s2-e, .s2-e-cam, .s2-f, .s2-g { grid-template-columns: 1fr }
  .s2-c-graf { gap: 4px } .s2-c-area { height: 200px } .s2-c-barra em { font-size: 10px }
  .s2-g-res { position: static }
}
`
