'use client'
// Opções do bloco "Para onde foi o dinheiro" — página de teste (José, 19/10/2026: "agora nesse aqui,
// precisamos melhorar também"; "não precisa ter o bloco de terceiros, ele entra para gastos"; "me dá
// mais opções interativas e dinâmicas"). Mesmos números do Painel; nada aqui muda o Painel.
import { useEffect, useState } from 'react'
import { SEM_META, GRUPOS, GRUPO_GARANTIA, type PainelMontado } from '@/lib/mecanicos/painel'

/** Por que a pessoa entra na conta sem ser de campo (José, 21/10/2026: "por que esses estão como pessoal?") */
const membrosDe = (nome: string) => Object.entries(GRUPOS).filter(([, g]) => g === nome).map(([p]) => p)
export const rotuloApoio = (nome: string) => {
  if (nome === GRUPO_GARANTIA) return 'cuida das garantias · salário do pós-vendas, sem meta de horas'
  if (membrosDe(nome).length) return `grupo ${nome} · sem meta de horas`
  return 'no RH do pós-vendas · nenhuma OS no período'
}
import { brl, horas, kmFmt, Numero, useContador } from './ui'
import { LadoDireito } from './LadoDireitoOpcoes'

const MUDO = 'var(--portal-text-muted, #64748b)'
export const CE = { mo: '#0369a1', km: '#16a34a', pecas: '#ea580c', outros: '#94a3b8' }
export const CS = { gastos: '#dc2626', pessoal: '#7c3aed', ficou: '#0f766e', faltou: '#b91c1c' }

/** A conta do período: entrou − gastos (terceiros das OS + carro, almoço, materiais) − pessoal = ficou. */
export type Conta = {
  rotulo: string
  bruto: number; mo: number; km: number; pecas: number; outros: number; horas: number; kmRod: number; nOS: number; comNota: number; recibo: number
  gastos: number; gDet: [string, number][]
  pessoal: number; pCat: [string, number][]; comissaoPrev: number
  /** para o simulador: salário, comissão do RH e rescisões separados, e quantas pessoas recebem salário */
  salario: number; comissaoRH: number; rescisao: number; pessoas: number
  /** quem entra no Pessoal (RH): salário + encargos do mês inteiro, comissões e rescisão de cada um */
  equipe: PessoaConta[]
  /** descontos dados nas OS do período (o que entrou já é depois deles) */
  desc: { hora: number; km: number; geral: number; pecas: number; total: number; nOS: number; maiores: { os: string; numero: string | null; cliente: string; valor: number }[] }
  resultado: number
  ant: { bruto: number; gastos: number; pessoal: number; resultado: number } | null
  serie: { rotulo: string; bruto: number; gastos: number; pessoal: number; resultado: number }[]
}
/** Uma pessoa do Pessoal. campo = técnico de campo (tem OS no período); senão é apoio/oficina. */
export type PessoaConta = { nome: string; salario: number; encargos: number; encComissao: number; encPrevista: number; comissao: number; prevista: number; rescisao: number; campo: boolean }
export function contaDe(d: PainelMontado, rotulo: string): Conta {
  const t = d.total, g = d.gastos, eq = d.equipe
  const pessoal = eq.total || 0
  const resultado = t.liquido - g.foraDasOS - pessoal
  const serie = d.serie.map((b, i) => {
    const tt = b.total, ga = d.gastosSerie[i]?.total || 0, pe = d.equipeSerie[i] || 0
    return { rotulo: b.rotulo, bruto: tt.bruto, gastos: tt.custo + ga, pessoal: pe, resultado: tt.liquido - ga - pe }
  })
  const naOS = Math.max(0, g.total - g.foraDasOS)
  return {
    rotulo, bruto: t.bruto, mo: t.servico, km: t.kmValor, pecas: t.pecas, outros: Math.max(0, t.outros), horas: t.faturadas, kmRod: t.km, nOS: Math.round(t.os),
    comNota: d.notas.comNota, recibo: d.notas.recibo,
    gastos: t.custo + g.foraDasOS,
    gDet: [
      ['Requisições não cobradas (terceiros nas OS)', t.custo], ['Abastecimento', g.abastecimento], ['Manutenção do carro', g.manutencao], ['Alimentação', g.alimentacao], ['Materiais da oficina', g.materiais],
      ...(naOS > 0.5 ? [['Já contado nas requisições (desconta)', -naOS] as [string, number]] : []),
    ],
    pessoal, pCat: [['Salários', eq.salario - (eq.encargos || 0)], ['Comissão lançada no RH', eq.comissao - (eq.encComissao || 0)], ['Comissão prevista', eq.comissaoPrevista - (eq.encPrevista || 0)], ['Encargos (salário e comissão)', (eq.encargos || 0) + (eq.encComissao || 0) + (eq.encPrevista || 0)], ['Rescisões e acertos', eq.rescisao]],
    comissaoPrev: eq.comissaoPrevista,
    salario: eq.salario, comissaoRH: eq.comissao, rescisao: eq.rescisao,
    pessoas: Object.values(eq.detalhe || {}).filter((x) => x.salario > 0.5).length,
    desc: (() => {
      const r = { hora: 0, km: 0, geral: 0, pecas: 0, total: 0, nOS: 0, maiores: [] as Conta['desc']['maiores'] }
      for (const o of d.os) {
        const x = o.descontos
        if (!x) continue
        const t = x.hora + x.km + x.geral + x.pecas
        if (t <= 0.009) continue
        r.hora += x.hora; r.km += x.km; r.geral += x.geral; r.pecas += x.pecas; r.total += t; r.nOS++
        r.maiores.push({ os: o.os, numero: o.numeroOmie, cliente: o.cliente, valor: t })
      }
      r.maiores.sort((a, b) => b.valor - a.valor); r.maiores = r.maiores.slice(0, 6)
      return r
    })(),
    equipe: Object.entries(eq.detalhe || {}).map(([nome, x]) => ({
      nome, salario: x.salario, encargos: x.encargos || 0, encComissao: x.encComissao || 0, encPrevista: x.encPrevista || 0, comissao: x.comissao, prevista: x.comissaoPrevista, rescisao: x.rescisao,
      campo: !SEM_META.has(nome) && d.linhas.some((l) => l.tecnico === nome && (l.bruto > 0 || l.faturadas > 0 || l.trabalhadas > 0)),
    })).sort((a, b) => Number(b.campo) - Number(a.campo) || (b.salario + b.comissao + b.prevista) - (a.salario + a.comissao + a.prevista)),
    resultado, ant: serie.length >= 2 ? serie[serie.length - 2] : null, serie,
  }
}

const pct = (a: number, b: number) => (b ? Math.round(((a - b) / Math.abs(b)) * 100) : null)
/** ▲▼ contra o período anterior. inverso = custo (subir é ruim). */
function Dif({ a, b, inverso }: { a: number; b: number | undefined; inverso?: boolean }) {
  if (b == null) return null
  const p = pct(a, b)
  if (p == null || p === 0) return <span className="dx-dif">= anterior</span>
  const bom = inverso ? p < 0 : p > 0
  return <span className={`dx-dif ${bom ? 'bom' : 'ruim'}`} title={`período anterior: ${brl(b)}`}>{p > 0 ? '▲' : '▼'} {Math.abs(p)}% <i>vs anterior</i></span>
}
const entradas = (c: Conta) => ([['Mão de obra', c.mo, CE.mo, `${horas(c.horas)} cobradas`], ['Deslocamento', c.km, CE.km, kmFmt(c.kmRod)], ['Outros', c.outros, CE.outros, 'requisições, extras']] as [string, number, string, string][]).filter(([, v]) => v > 0.5)
const saidas = (c: Conta) => ([['Gastos', c.gastos, CS.gastos, 'terceiros, carro, almoço, materiais'], ['Pessoal', c.pessoal, CS.pessoal, 'salário + comissão']] as [string, number, string, string][])
const por100 = (c: Conta) => (c.bruto ? (c.resultado / c.bruto) * 100 : 0)
const nomeFim = (c: Conta) => (c.resultado >= 0 ? 'Ficou' : 'Faltou')
const corFim = (c: Conta) => (c.resultado >= 0 ? CS.ficou : CS.faltou)
const detDe = (c: Conta): Record<string, [string, number][]> => ({ Entrou: entradas(c).map(([r, v]) => [r, v]), Gastos: c.gDet, Pessoal: c.pCat })

// ============================================================================
/** D1 — Cascata: Entrou desce degrau por degrau até o que Ficou. */
export function DinheiroCascata({ c }: { c: Conta }) {
  const [aberto, setAberto] = useState<string | null>(null)
  const lo = Math.min(0, c.resultado), hi = Math.max(c.bruto, 1)
  const y = (v: number) => ((v - lo) / (hi - lo)) * 100
  // cada degrau começa onde o anterior terminou
  const degraus = saidas(c).reduce<{ r: string; v: number; cor: string; sub: string; de: number; ate: number }[]>((out, [r, v, cor, sub]) => {
    const ate = out.length ? out[out.length - 1].de : c.bruto
    return [...out, { r, v, cor, sub, de: ate - v, ate }]
  }, [])
  // fatias da coluna Entrou (mão de obra, km, peças, outros), empilhadas
  const fatiasE = entradas(c).reduce<{ r: string; v: number; cor: string; base: number; h: number }[]>((out, [r, v, cor]) => {
    const ult = out[out.length - 1]
    return [...out, { r, v, cor, base: ult ? ult.base + ult.h : 0, h: c.bruto ? (v / c.bruto) * 100 : 0 }]
  }, [])
  const ant = c.ant
  const det = detDe(c)
  const cols = [
    { k: 'Entrou', de: 0, ate: c.bruto, cor: '', liga: c.bruto },
    ...degraus.map((d) => ({ k: d.r, de: d.de, ate: d.ate, cor: d.cor, liga: d.de })),
    { k: nomeFim(c), de: 0, ate: c.resultado, cor: corFim(c), liga: 0 },
  ]
  const nomes = [
    { k: 'Entrou', v: c.bruto, cor: '#0f172a', sinal: '', sub: `${c.nOS} OS`, dif: <Dif a={c.bruto} b={ant?.bruto} /> },
    ...degraus.map((d) => ({ k: d.r, v: d.v, cor: d.cor, sinal: '−', sub: d.sub, dif: <Dif a={d.v} b={d.r === 'Gastos' ? ant?.gastos : ant?.pessoal} inverso /> })),
    { k: nomeFim(c), v: c.resultado, cor: corFim(c), sinal: '=', sub: `R$ ${Math.round(por100(c))} de cada R$ 100`, dif: <Dif a={c.resultado} b={ant?.resultado} /> },
  ]
  const ultimo = cols.length - 1
  return (
    <div className="dx-caixa">
      <Frase c={c} />
      <div className="dx-cascata" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
        {cols.map((k, i) => (
          <div className={`dx-cc ${aberto === k.k ? 'on' : ''}`} key={k.k} onClick={() => setAberto(aberto === k.k ? null : k.k)}>
            <div className="dx-cc-area">
              <div className="dx-cc-bar" style={{ bottom: `${y(Math.min(k.de, k.ate))}%`, height: `${Math.max(0.8, y(Math.max(k.de, k.ate)) - y(Math.min(k.de, k.ate)))}%`, background: k.cor, animationDelay: `${i * 220}ms` }}>
                {i === 0 && fatiasE.map((f) => <i key={f.r} title={`${f.r}: ${brl(f.v)}`} style={{ bottom: `${f.base}%`, height: `${f.h}%`, background: f.cor }} />)}
              </div>
              {i < ultimo && <div className="dx-cc-liga" style={{ bottom: `${y(k.liga)}%`, animationDelay: `${i * 220 + 200}ms` }} />}
            </div>
          </div>
        ))}
      </div>
      <div className="dx-cascata-n" style={{ gridTemplateColumns: `repeat(${cols.length}, 1fr)` }}>
        {nomes.map((n, i) => (
          <button type="button" key={n.k} className={aberto === n.k ? 'on' : ''} onClick={() => setAberto(aberto === n.k ? null : n.k)} style={{ animationDelay: `${i * 220 + 300}ms` }}>
            <small>{n.sinal && <em>{n.sinal}</em>}{n.k}</small>
            <b style={{ color: n.cor }}><Numero valor={n.v} formato={brl} /></b>
            <span>{n.sub}</span>
            {i > 0 && i < ultimo && c.bruto > 0 && <span>{Math.round((n.v / c.bruto) * 100)}% do que entrou</span>}
            {n.dif}
          </button>
        ))}
      </div>
      {aberto && det[aberto] && <Detalhe titulo={aberto} itens={det[aberto]} onFechar={() => setAberto(null)} />}
    </div>
  )
}

// ============================================================================
/** D2 — Cofrinho de R$ 100: 100 moedas pintadas por onde cada real foi parar. */
export function DinheiroCofrinho({ c }: { c: Conta }) {
  const [foco, setFoco] = useState<string | null>(null)
  const partes = [...saidas(c).map(([r, v, cor, sub]) => ({ r, v, cor, sub })), { r: nomeFim(c), v: Math.max(0, c.resultado), cor: CS.ficou, sub: 'para a empresa' }]
  const base = partes.reduce((s, p) => s + p.v, 0) || 1
  // arredonda para 100 moedas (maior resto)
  const brutas = partes.map((p) => (p.v / base) * 100), inteiras = brutas.map(Math.floor)
  let falta = 100 - inteiras.reduce((s, x) => s + x, 0)
  brutas.map((b, i) => [b - Math.floor(b), i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (falta > 0) { inteiras[i]++; falta-- } })
  const moedas = partes.flatMap((p, i) => Array.from({ length: inteiras[i] }, () => p))
  return (
    <div className="dx-caixa">
      <Frase c={c} />
      <div className="dx-cofre">
        <div className="dx-moedas">
          {moedas.map((p, i) => <i key={i} className={foco && foco !== p.r ? 'apaga' : ''} style={{ background: p.cor, animationDelay: `${i * 14}ms` }} onMouseEnter={() => setFoco(p.r)} onMouseLeave={() => setFoco(null)} title={`${p.r}: R$ 1 de cada 100`} />)}
        </div>
        <div className="dx-cofre-leg">
          <small>Cada bolinha = <b>R$ 1</b> de cada <b>R$ 100</b> que entraram ({brl(c.bruto)} no período)</small>
          {partes.map((p, i) => (
            <div key={p.r} className={`dx-cofre-l ${foco === p.r ? 'on' : ''}`} onMouseEnter={() => setFoco(p.r)} onMouseLeave={() => setFoco(null)} style={{ '--c': p.cor, animationDelay: `${i * 120}ms` } as React.CSSProperties}>
              <span className="dx-cofre-n">{inteiras[i]}</span>
              <div><b>{p.r}</b><small>{p.sub}</small></div>
              <strong>{brl(p.v)}</strong>
            </div>
          ))}
          {c.resultado < 0 && <p className="dx-alerta"><i className="fas fa-triangle-exclamation" /> Os custos passaram do que entrou: faltaram {brl(-c.resultado)}.</p>}
        </div>
      </div>
      <div className="dx-entrou">
        <small>De onde vieram os R$ 100:</small>
        {entradas(c).map(([r, v, cor]) => <span key={r} style={{ '--c': cor } as React.CSSProperties}><i />{r} <b>R$ {Math.round((v / (c.bruto || 1)) * 100)}</b></span>)}
      </div>
    </div>
  )
}

// ============================================================================
/** D3 — Conta em cartões: Entrou − Gastos − Pessoal = Ficou; cada cartão abre o detalhe. */
export function DinheiroConta({ c }: { c: Conta }) {
  const [aberto, setAberto] = useState<string | null>(null)
  const ant = c.ant, det = detDe(c)
  const cards: { k: string; sinal: string; v: number; cor: string; ic: string; sub: string; det: [string, number][]; dif: React.ReactNode }[] = [
    { k: 'Entrou', sinal: '', v: c.bruto, cor: '#0369a1', ic: 'fa-arrow-down', sub: `${c.nOS} OS · com nota ${brl(c.comNota)}`, det: det.Entrou, dif: <Dif a={c.bruto} b={ant?.bruto} /> },
    { k: 'Gastos', sinal: '−', v: c.gastos, cor: CS.gastos, ic: 'fa-receipt', sub: 'terceiros, carro, almoço, materiais', det: det.Gastos, dif: <Dif a={c.gastos} b={ant?.gastos} inverso /> },
    { k: 'Pessoal', sinal: '−', v: c.pessoal, cor: CS.pessoal, ic: 'fa-users', sub: 'salário + comissão', det: det.Pessoal, dif: <Dif a={c.pessoal} b={ant?.pessoal} inverso /> },
    { k: nomeFim(c), sinal: '=', v: c.resultado, cor: corFim(c), ic: 'fa-piggy-bank', sub: `R$ ${Math.round(por100(c))} de cada R$ 100`, det: [], dif: <Dif a={c.resultado} b={ant?.resultado} /> },
  ]
  return (
    <div className="dx-caixa">
      <Frase c={c} />
      <div className="dx-conta">
        {cards.map((k, i) => (
          <div key={k.k} className="dx-conta-par">
            {k.sinal && <span className="dx-sinal" style={{ animationDelay: `${i * 150}ms` }}>{k.sinal}</span>}
            <button type="button" className={`dx-ck ${aberto === k.k ? 'on' : ''} ${i === cards.length - 1 ? 'fim' : ''}`} style={{ '--c': k.cor, animationDelay: `${i * 150}ms` } as React.CSSProperties} onClick={() => k.det.length && setAberto(aberto === k.k ? null : k.k)}>
              <span className="dx-ck-ic"><i className={`fas ${k.ic}`} /></span>
              <small>{k.k}</small>
              <b><Numero valor={k.v} formato={brl} /></b>
              <span>{k.sub}</span>
              {i > 0 && i < cards.length - 1 && c.bruto > 0 && <div className="dx-ck-barra"><i style={{ width: `${Math.min(100, (k.v / c.bruto) * 100)}%` }} /><em>{Math.round((k.v / c.bruto) * 100)}% do que entrou</em></div>}
              {k.dif}
              {k.det.length > 0 && <u>{aberto === k.k ? 'fechar' : 'ver detalhe'} <i className={`fas fa-chevron-${aberto === k.k ? 'up' : 'down'}`} /></u>}
            </button>
          </div>
        ))}
      </div>
      {aberto && (() => { const k = cards.find((x) => x.k === aberto); return k ? <Detalhe titulo={k.k} itens={k.det} cor={k.cor} onFechar={() => setAberto(null)} /> : null })()}
    </div>
  )
}

// ============================================================================
/** D4 — Régua única: uma barra do que entrou e outra de para onde foi, rótulos sempre legíveis. */
export function DinheiroRegua({ c }: { c: Conta }) {
  const [foco, setFoco] = useState<string | null>(null)
  const ant = c.ant
  const partes = [
    ...saidas(c).map(([r, v, cor, sub]) => ({ r, v, cor, sub, a: r === 'Gastos' ? ant?.gastos : ant?.pessoal, inverso: true })),
    { r: nomeFim(c), v: Math.abs(c.resultado), cor: corFim(c), sub: 'para a empresa', a: ant?.resultado, inverso: false },
  ]
  const base = partes.reduce((s, p) => s + p.v, 0) || 1
  const ents = entradas(c)
  return (
    <div className="dx-caixa">
      <Frase c={c} />
      <div className="dx-regua">
        <div className="dx-regua-t"><small>Entrou</small><b><Numero valor={c.bruto} formato={brl} /></b><Dif a={c.bruto} b={ant?.bruto} /></div>
        <div className="dx-regua-barra fina">
          {ents.map(([r, v, cor], i) => <i key={r} style={{ width: `${(v / (c.bruto || 1)) * 100}%`, background: cor, animationDelay: `${i * 100}ms` }} title={`${r}: ${brl(v)}`} />)}
        </div>
        <div className="dx-regua-ents">{ents.map(([r, v, cor, sub]) => <span key={r} style={{ '--c': cor } as React.CSSProperties}><i />{r} <b>{brl(v)}</b>{sub && <small>{sub}</small>}</span>)}</div>
        <div className="dx-regua-seta"><i className="fas fa-arrow-down" /> e foi para:</div>
        <div className="dx-regua-barra">
          {partes.map((p, i) => (
            <i key={p.r} className={foco && foco !== p.r ? 'apaga' : ''} style={{ width: `${(p.v / base) * 100}%`, background: p.cor, animationDelay: `${300 + i * 140}ms` }} onMouseEnter={() => setFoco(p.r)} onMouseLeave={() => setFoco(null)}>
              {(p.v / base) * 100 >= 9 && <span>{Math.round((p.v / base) * 100)}%</span>}
            </i>
          ))}
        </div>
        <div className="dx-regua-pecas">
          {partes.map((p, i) => (
            <div key={p.r} className={`dx-rp ${foco === p.r ? 'on' : ''}`} style={{ '--c': p.cor, animationDelay: `${500 + i * 120}ms` } as React.CSSProperties} onMouseEnter={() => setFoco(p.r)} onMouseLeave={() => setFoco(null)}>
              <small><i />{p.r}</small>
              <b>{brl(p.v)}</b>
              <span>{p.sub} · R$ {Math.round((p.v / (c.bruto || 1)) * 100)} de cada 100</span>
              <Dif a={p.v} b={p.a} inverso={p.inverso} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
/** D5 — Simulador "e se…" (José: "muito foda esse, consegue colocar mais dados e opções de simulador?"):
 *  cada entrada, gasto e custo de pessoal tem a sua régua; cenários prontos (melhor/pior/média dos
 *  últimos períodos); meta "quero ficar com R$ X de cada 100"; e o resultado lado a lado com o real. */

/** Uma régua do simulador: % para cima ou para baixo, com o antes → depois embaixo. */
export function RegSim({ v, onSet, rot, ic, cor, min, max, antes, depois, extra, dica, claro }: { v: number; onSet: (n: number) => void; rot: string; ic: string; cor: string; min: number; max: number; antes: string; depois: string; extra?: string; dica?: string; claro?: boolean }) {
  if (claro) return (
    <label className={`dx-sim-r claro ${v !== 0 ? 'mexeu' : ''}`} style={{ '--c': cor } as React.CSSProperties} data-dica={`${rot.toUpperCase()} — ${dica ? `${dica} ` : ''}Como foi no mês: ${antes}.${v !== 0 ? ` No simulado: ${depois} (${v > 0 ? '+' : ''}${v}%).` : ''} Arraste a bolinha para a direita para simular mais, para a esquerda para simular menos: o resto da conta (o que sobra, o empate, a meta) muda junto. O X volta ao que foi.`}>
      <span><i className={`fas ${ic}`} /> {rot} <b className="dx-sim-pill">{v === 0 ? 'como foi' : `${v > 0 ? '+' : ''}${v}%`}</b>{v !== 0 && <button type="button" className="dx-sim-x" title="voltar ao real" onClick={(e) => { e.preventDefault(); onSet(0) }}><i className="fas fa-xmark" /></button>}</span>
      <input type="range" min={min} max={max} step={5} value={v} onChange={(e) => onSet(Number(e.target.value))} style={{ '--p': `${((v - min) / (max - min)) * 100}%` } as React.CSSProperties} />
      <small className="dx-sim-cf"><span>Como foi <b>{antes}</b></span>{v !== 0 ? <span>Simulado <b>{depois}</b></span> : <span>arraste para simular</span>}{extra && <em>{extra}</em>}</small>
    </label>
  )
  return (
    <label className={`dx-sim-r ${v !== 0 ? 'mexeu' : ''}`} style={{ '--c': cor } as React.CSSProperties} data-dica={dica || undefined}>
      <span><i className={`fas ${ic}`} /> {rot} <b>{v > 0 ? '+' : ''}{v}%</b>{v !== 0 && <button type="button" className="dx-sim-x" title="voltar ao real" onClick={(e) => { e.preventDefault(); onSet(0) }}><i className="fas fa-xmark" /></button>}</span>
      <input type="range" min={min} max={max} step={5} value={v} onChange={(e) => onSet(Number(e.target.value))} style={{ '--p': `${((v - min) / (max - min)) * 100}%` } as React.CSSProperties} />
      <small>{antes} → <b>{depois}</b>{extra && <> · {extra}</>}</small>
    </label>
  )
}

type Sim = Record<string, number>
const SIM_ZERO: Sim = {}
/** Toda a conta do simulador (estado + cenário), para o simulador de hoje e para a versão nova usarem a MESMA conta. */
export function useSimulacao(c: Conta) {
  const [m, setM] = useState<Sim>(SIM_ZERO)
  const [tec, setTec] = useState(0)
  const [fora, setFora] = useState<string[]>([])
  const [prev, setPrev] = useState(true)
  const [meta, setMeta] = useState(40)
  const [cen, setCen] = useState('real')
  const val = (k: string) => m[k] || 0
  const set = (k: string) => (n: number) => { setM((x) => ({ ...x, [k]: n })); setCen('') }
  const vh = c.horas > 0 ? c.mo / c.horas : 0
  // valor da hora de TABELA (configuração do POS, hoje R$ 200) — José, 21/10/2026: "a hora não é 185, é 200".
  // A média cobrada (vh) fica abaixo da tabela por causa de descontos e da garantia paga a R$ 100/h.
  const [vhTab, setVhTab] = useState(200)
  useEffect(() => { let vivo = true; fetch('/api/pos/configuracoes').then((r) => r.json()).then((j) => { if (vivo && Number(j.valor_hora) > 0) setVhTab(Number(j.valor_hora)) }).catch(() => {}); return () => { vivo = false } }, [])
  const vkm = c.kmRod > 0 ? c.km / c.kmRod : 0
  // pessoal: só quem está marcado na lista; técnico novo custa a média do salário dos técnicos de campo
  const dentro = c.equipe.filter((p) => !fora.includes(p.nome))
  const campo = dentro.filter((p) => p.campo && p.salario > 0.5)
  const baseCusto = campo.length ? campo : dentro.filter((p) => p.salario > 0.5)
  const custoTec = baseCusto.length ? baseCusto.reduce((s, p) => s + p.salario, 0) / baseCusto.length : 0
  const somaP = (f: (p: PessoaConta) => number) => dentro.reduce((s, p) => s + f(p), 0)
  const salBase = c.equipe.length ? somaP((p) => p.salario) : c.salario
  const comBase = c.equipe.length ? somaP((p) => p.comissao) : c.comissaoRH
  const prevBase = c.equipe.length ? somaP((p) => p.prevista) : c.comissaoPrev
  const rescBase = c.equipe.length ? somaP((p) => p.rescisao) : c.rescisao
  // ---- cenário
  const horasS = c.horas * (1 + val('horas') / 100), vhS = vh * (1 + val('vh') / 100)
  const ent = {
    mo: vh > 0 ? horasS * vhS : c.mo * (1 + val('horas') / 100) * (1 + val('vh') / 100),
    km: c.km * (1 + val('km') / 100), pecas: c.pecas * (1 + val('pecas') / 100), outros: c.outros * (1 + val('outros') / 100),
  }
  // descontos: o que entrou já vem descontado; dar menos desconto devolve a diferença para o faturamento
  const DESC: [keyof Conta['desc'] & ('hora' | 'km' | 'geral' | 'pecas'), string, string][] = [['hora', 'Desconto na hora', 'fa-clock'], ['km', 'Desconto no km', 'fa-road'], ['geral', 'Desconto geral da OS', 'fa-tags']]
  const descS = DESC.reduce((s, [k]) => s + c.desc[k] * (1 + val(`d_${k}`) / 100), 0)
  // peças ficam fora do faturado (José, 28/10/2026): nem elas nem o desconto nelas entram na conta
  const voltaDesc = DESC.reduce((s, [k]) => s + c.desc[k], 0) - descS
  const bruto = ent.mo + ent.km + ent.outros + voltaDesc
  const gItens = c.gDet.map(([r, v], i) => ({ r, v, k: `g${i}`, s: v > 0 ? v * (1 + val(`g${i}`) / 100) : v }))
  const gastos = gItens.reduce((s, x) => s + x.s, 0)
  const pItens = {
    salario: salBase * (1 + val('sal') / 100) + tec * custoTec,
    comissao: (comBase + (prev ? prevBase : 0)) * (1 + val('com') / 100),
    rescisao: rescBase,
  }
  const pessoal = pItens.salario + pItens.comissao + pItens.rescisao
  const ficou = bruto - gastos - pessoal
  const p100 = bruto ? (ficou / bruto) * 100 : 0
  const dif = ficou - c.resultado
  const mudou = Object.values(m).some((x) => x !== 0) || tec !== 0 || !prev || fora.length > 0
  // ---- empate e meta: gastos crescem junto com o faturamento (proporção do cenário), pessoal é fixo
  const taxaG = bruto ? gastos / bruto : 0
  const precisa = (r100: number) => { const den = 1 - taxaG - r100 / 100; return den > 0 ? pessoal / den : Infinity }
  // META = passar o período anterior (José, 23/10/2026: "a meta é passar o mês passado"). A meta em %
  // ("quero que sobre R$ X de cada 100") ficou só na página de teste (alvoPct).
  const empate = precisa(0), alvoPct = precisa(meta)
  const anterior = c.serie.length > 1 ? c.serie[c.serie.length - 2] : null
  const alvo = anterior && anterior.bruto > 0 ? anterior.bruto : Infinity
  const vhTabS = vhTab * (1 + val('vh') / 100)
  const horasPara = (b: number) => (vhTabS > 0 && Number.isFinite(b) ? (b - bruto) / vhTabS : 0)
  const aplicarMeta = () => {
    if (!Number.isFinite(alvo) || vh <= 0) return
    const moNovo = ent.mo + (alvo - bruto)
    setM((x) => ({ ...x, horas: Math.round((moNovo / (vh * (1 + (x.vh || 0) / 100)) / c.horas - 1) * 100) })); setCen('')
  }
  // ---- cenários prontos a partir dos últimos períodos
  const hist = c.serie.slice(0, -1).filter((s) => s.bruto > 0)
  const r100 = (s: { bruto: number; resultado: number }) => s.resultado / s.bruto
  const media = hist.length ? { bruto: hist.reduce((a, s) => a + s.bruto, 0) / hist.length, gastos: hist.reduce((a, s) => a + s.gastos, 0) / hist.length, pessoal: hist.reduce((a, s) => a + s.pessoal, 0) / hist.length } : null
  const melhor = hist.length ? hist.reduce((a, s) => (r100(s) > r100(a) ? s : a)) : null
  const pior = hist.length ? hist.reduce((a, s) => (r100(s) < r100(a) ? s : a)) : null
  const lim = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)))
  const aplicar = (nome: string, s: { bruto: number; gastos: number; pessoal: number } | null) => {
    setTec(0); setPrev(true); setFora([]); setCen(nome)
    if (!s) { setM(SIM_ZERO); return }
    const fe = lim((s.bruto / (c.bruto || 1) - 1) * 100, -80, 150), fg = lim((s.gastos / (c.gastos || 1) - 1) * 100, -80, 150), fp = lim((s.pessoal / (c.pessoal || 1) - 1) * 100, -50, 50)
    const novo: Sim = { horas: fe, km: fe, pecas: fe, outros: fe, sal: fp, com: fp }
    c.gDet.forEach(([, v], i) => { if (v > 0) novo[`g${i}`] = fg })
    setM(novo)
  }
  const somaG = gItens.filter((x) => x.v > 0)
  const comparar: [string, number, number, string, boolean][] = [
    ['Entrou', c.bruto, bruto, '#0369a1', false], ['Gastos', c.gastos, gastos, CS.gastos, true], ['Pessoal', c.pessoal, pessoal, CS.pessoal, true], [ficou >= 0 ? 'Ficou' : 'Faltou', c.resultado, ficou, ficou >= 0 ? CS.ficou : CS.faltou, false],
  ]
  const maxC = Math.max(1, ...comparar.flatMap(([, a, b]) => [Math.abs(a), Math.abs(b)]))
  const nTec = campo.length + tec
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  return { m, setM, tec, setTec, fora, setFora, prev, setPrev, meta, setMeta, cen, setCen, val, set, vh, vhTab, vkm, dentro, campo, custoTec, salBase, comBase, prevBase, rescBase, horasS, vhS, ent, DESC, descS, voltaDesc, bruto, gItens, gastos, pItens, pessoal, ficou, p100, dif, mudou, taxaG, empate, alvo, alvoPct, anterior, vhTabS, horasPara, aplicarMeta, hist, r100, media, melhor, pior, aplicar, somaG, comparar, maxC, nTec, cap }
}
export type Simulacao = ReturnType<typeof useSimulacao>

/** `claro`: versão para entender de primeira (José, 21/10/2026: "gostei muito desse, achei completo, só achei
 *  difícil de entender de primeira") — guia de 3 passos, a conta Entrou − Gastos − Pessoal = Sobrou nas abas,
 *  "Como foi × Simulado" em tudo e o lado direito em blocos numerados com títulos que dizem o que é. */
export function DinheiroSimulador({ c, semFrase, claro, forma }: { c: Conta; semFrase?: boolean; claro?: boolean; /** lado direito em outra forma (1 extrato, 2 medidor, 3 cascata) — página de teste */ forma?: 1 | 2 | 3 }) {
  const [aba, setAba] = useState<'ent' | 'des' | 'gas' | 'pes'>('ent')
  const { m, setM, tec, setTec, fora, setFora, prev, setPrev, meta, setMeta, cen, setCen, val, set, vh, vhTab, vkm, dentro, campo, custoTec, salBase, comBase, prevBase, rescBase, horasS, vhS, ent, DESC, descS, voltaDesc, bruto, gItens, gastos, pItens, pessoal, ficou, p100, dif, mudou, taxaG, empate, alvo, anterior, vhTabS, horasPara, aplicarMeta, hist, r100, media, melhor, pior, aplicar, somaG, comparar, maxC, nTec, cap } = useSimulacao(c)
  // José, 21/10/2026: "divide as informações para os dois lados" — no modo claro, os indicadores (3)
  // descem para a esquerda, embaixo dos controles; à direita ficam o resultado, a conta, o empate (4) e a meta (5).
  // empate e meta, escritos por extenso (José 19/10: "difícil de compreender, aumenta a fonte e diz o que significa em % e dados")
  const alvosEl = (() => {
            const pctTxt = (v: number) => `${Math.round(v)}%`
            const sobeTxt = (alvoV: number) => (bruto > 0.5 ? ` (+${pctTxt(((alvoV - bruto) / bruto) * 100)} sobre o que entrou)` : '')
            const hTxt = (alvoV: number) => (vhS > 0 && alvoV > bruto ? <> ≈ <b>{horas(horasPara(alvoV))}</b> a mais de horas cobradas, a {brl(vhS)}/h</> : null)
            const gA = Number.isFinite(alvo) ? taxaG * alvo : 0
            return (
              <div className="dx-alvos" id="sim-alvos">
                {claro && <div className="dx-res-t"><b>4</b> Quanto precisa faturar para não ter prejuízo</div>}
                <div className="dx-alvo">
                  <small><i className="fas fa-scale-balanced" /> {claro ? 'Faturar isso paga todas as contas (sobra R$ 0)' : 'Ponto de empate: sobra R$ 0'}</small>
                  <b className="dx-alvo-v">{Number.isFinite(empate) ? <Numero valor={empate} formato={brl} /> : '—'}</b>
                  <p>É quanto precisa <b>faturar só para pagar os custos</b>: os gastos (hoje <b>{pctTxt(taxaG * 100)}</b> de tudo que entra) e o pessoal fixo de <b>{brl(pessoal)}</b>.</p>
                  {Number.isFinite(empate) && (bruto >= empate
                    ? <span className="dx-alvo-st bom"><i className="fas fa-circle-check" /> passou do empate em <b>{brl(bruto - empate)}</b></span>
                    : <span className="dx-alvo-st ruim"><i className="fas fa-circle-exclamation" /> faltam <b>{brl(empate - bruto)}</b>{sobeTxt(empate)}{hTxt(empate)}</span>)}
                  {!Number.isFinite(empate) && <span className="dx-alvo-st ruim">os gastos já comem tudo que entra</span>}
                  {Number.isFinite(empate) && <div className="dx-sim-trilho"><i style={{ width: `${Math.min(100, (bruto / Math.max(empate * 1.5, bruto, 1)) * 100)}%` }} /><em style={{ left: `${(empate / Math.max(empate * 1.5, bruto, 1)) * 100}%` }} /></div>}
                  {claro && Number.isFinite(empate) && <div className="dx-trilho-leg"><span><i className="fat" /> faturado: <b>{brl(bruto)}</b></span><span><i className="emp" /> precisa para não ter prejuízo: <b>{brl(empate)}</b></span></div>}
                </div>
                {claro && <div className="dx-res-t"><b>5</b> Meta: passar {anterior ? anterior.rotulo : 'o período anterior'}</div>}
                <div className="dx-alvo meta">
                  {!claro && <small><i className="fas fa-bullseye" /> Meta</small>}
                  {!Number.isFinite(alvo)
                    ? <span className="dx-alvo-st">sem faturamento no período anterior para comparar</span>
                    : <>
                      <b className="dx-alvo-v">{bruto >= alvo ? <>passou {anterior?.rotulo}</> : <>precisa faturar <Numero valor={alvo} formato={brl} /></>}</b>
                      <p>A meta é <b>faturar mais do que {anterior?.rotulo}</b>, que fechou com <b>{brl(alvo)}</b>.{' '}
                        {bruto >= alvo ? <>Já passou em <b>{brl(bruto - alvo)}</b>.</> : <>Faltam <b>{brl(alvo - bruto)}</b>{sobeTxt(alvo)}{hTxt(alvo)}.</>}</p>
                      {alvo > bruto && vh > 0 && <button type="button" onClick={aplicarMeta}><i className="fas fa-wand-magic-sparkles" /> aplicar nas horas cobradas</button>}
                    </>}
                </div>
              </div>
            )
          })()
  const indicadoresEl = (
              <section className="dx-card">
                <div className="dx-res-t"><b>3</b> Indicadores do mês <small>passe o mouse para ver a conta</small></div>
                <div className="dx-ind">
                  <div data-dica="Quanto entrou, em média, por OS faturada: o que entrou ÷ número de OS."><small className="dx-cn" style={{ '--c': '#2563eb' } as React.CSSProperties}><i className="fas fa-file-invoice-dollar dx-ic" aria-hidden />Ticket médio por OS</small><b>{brl(c.nOS ? bruto / c.nOS : 0)}</b><span>{c.nOS} OS faturadas</span></div>
                  <div data-dica="O que entrou ÷ técnicos de campo (os que tiveram OS no período, mais os contratados no simulador)."><small className="dx-cn" style={{ '--c': '#7c3aed' } as React.CSSProperties}><i className="fas fa-user-gear dx-ic" aria-hidden />Faturamento por técnico</small><b>{brl(nTec ? bruto / nTec : 0)}</b><span>{nTec} técnicos de campo</span></div>
                  <div data-dica={`Se cobrar 1 hora a mais na tabela (${brl(vhTabS)}), sobra isso para a empresa depois de tirar a parte dos gastos (R$ ${Math.round(taxaG * 100)} a cada R$ 100 que entram). Salário não muda com 1 hora a mais, por isso não entra aqui.`}><small className="dx-cn" style={{ '--c': '#0891b2' } as React.CSSProperties}><i className="fas fa-clock dx-ic" aria-hidden />Cada hora a mais deixa</small><b>{brl(vhTabS * (1 - taxaG))}</b><span>hora de {brl(vhTabS)}, tirando os gastos</span></div>
                  <div data-dica="De cada R$ 100 que entraram, quanto foi para gastos (combustível, carro, alimentação, materiais) e quanto para pessoal (salários + comissões)."><small className="dx-cn" style={{ '--c': '#ea580c' } as React.CSSProperties}><i className="fas fa-chart-pie dx-ic" aria-hidden />De cada R$ 100</small><b>R$ {Math.round(taxaG * 100)} <em>gastos</em> · R$ {bruto ? Math.round((pessoal / bruto) * 100) : 0} <em>pessoal</em></b><span>o resto sobra para a empresa</span></div>
                </div>
              </section>
  )
  return (
    <div className={`dx-caixa ${claro ? 'claro' : ''}`}>
      {!semFrase && !claro && <Frase c={c} />}
      {claro && (() => {
        // uma linha curta no lugar da frase grande e do guia: o mês, quanto sobrou de cada R$ 100 e o mês anterior
        const ant = c.ant && c.ant.bruto > 0 ? Math.round((c.ant.resultado / c.ant.bruto) * 100) : null
        const agora = c.bruto > 0.5 ? Math.round((c.resultado / c.bruto) * 100) : null
        const d = ant != null && agora != null ? agora - ant : null
        return (
          <div className="dx-resumo">
            <span>{c.rotulo.replace(/^./, (x) => x.toUpperCase())}</span>
            {agora != null && <span>sobraram <b style={{ color: c.resultado >= 0 ? CS.ficou : CS.faltou }}>R$ {agora}</b> de cada R$ 100</span>}
            {d != null && <span className={`dx-resumo-d ${d >= 0 ? 'bom' : 'ruim'}`} data-dica={`No mês anterior sobraram R$ ${ant} de cada R$ 100.`}>{d >= 0 ? '▲' : '▼'} {Math.abs(d)} {Math.abs(d) === 1 ? 'ponto' : 'pontos'} vs mês anterior (R$ {ant})</span>}
          </div>
        )
      })()}
      {(() => {
        const botoes = <>
          <button type="button" className={cen === 'real' ? 'on' : ''} onClick={() => aplicar('real', null)} data-dica="Os números de verdade do período, sem nenhuma simulação.">Real ({cap(c.rotulo)})</button>
          {melhor && <button type="button" className={cen === 'melhor' ? 'on' : ''} onClick={() => aplicar('melhor', melhor)} title={`R$ ${Math.round(r100(melhor) * 100)} de cada 100`}>Melhor: {cap(melhor.rotulo)}</button>}
          {pior && <button type="button" className={cen === 'pior' ? 'on' : ''} onClick={() => aplicar('pior', pior)} title={`R$ ${Math.round(r100(pior) * 100)} de cada 100`}>Pior: {cap(pior.rotulo)}</button>}
          {media && <button type="button" className={cen === 'media' ? 'on' : ''} onClick={() => aplicar('media', media)}>Média dos últimos {hist.length}</button>}
          <button type="button" data-dica="Simula cobrar 20% mais horas, no mesmo valor de hora." className={cen === 'mais20' ? 'on' : ''} onClick={() => { aplicar('mais20', null); setM({ horas: 20 }); setCen('mais20') }}>+20% de horas</button>
          {c.desc.total > 0.5 && <button type="button" className={cen === 'semdesc' ? 'on' : ''} onClick={() => { aplicar('semdesc', null); setM({ d_hora: -100, d_km: -100, d_geral: -100, d_pecas: -100 }); setCen('semdesc') }}>Sem nenhum desconto (+{brl(c.desc.total - c.desc.pecas)})</button>}
          <button type="button" className={cen === 'corta' ? 'on' : ''} onClick={() => { const g: Sim = {}; c.gDet.forEach(([, v], i) => { if (v > 0) g[`g${i}`] = -20 }); setTec(0); setPrev(true); setM(g); setCen('corta') }}>Cortar 20% dos gastos</button>
        </>
        // José, 21/10/2026: "deixa guardado essas infos" — no modo claro os atalhos ficam recolhidos
        if (claro) return (
          <details className="dx-atalhos-d">
            <summary><i className="fas fa-wand-magic-sparkles" /> Atalhos: cenários prontos <small>melhor e pior mês, média, mais horas, sem desconto, cortar gastos</small><i className="fas fa-chevron-down" /></summary>
            <div className="dx-sim-cen">{botoes}</div>
          </details>
        )
        return <div className="dx-sim-cen"><small><i className="fas fa-wand-magic-sparkles" /> Cenários prontos:</small>{botoes}</div>
      })()}
      <div className="dx-sim">
        <div className="dx-sim-ctrl">
          {claro && <small className="dx-sim-conta-t">A conta do mês. Clique numa parte para mexer nela:</small>}
          {claro ? (
            <div className="dx-sim-conta">
              {([['ent', 'Entrou', '#0369a1', bruto, ''], ['gas', 'Gastos', CS.gastos, gastos, '−'], ['pes', 'Pessoal', CS.pessoal, pessoal, '−']] as const).map(([k, r, cor, v, op]) => (
                <span key={k} className="dx-sim-conta-i">
                  {op && <em>{op}</em>}
                  <button type="button" className={aba === k ? 'on' : ''} style={{ '--c': cor } as React.CSSProperties} onClick={() => setAba(k)} data-c={k} data-dica={({ ent: `ENTROU — tudo o que entrou no mês nas OS faturadas: mão de obra (horas × valor da hora), deslocamento (km), peças vendidas junto com a OS e outros. Já é DEPOIS dos descontos (${brl(descS)}). Clique para simular esses valores.`, gas: `GASTOS — o que o pós-vendas gastou no mês: combustível, manutenção do carro, almoço e materiais da oficina, mais requisições de terceiros que não foram cobradas do cliente. Só entra o que chegou ao financeiro. Clique para simular.`, pes: `PESSOAL — salários e encargos (conta fixa do mês inteiro, com ou sem serviço) e as comissões dos técnicos (a lançada no RH ou, sem ela, a prevista pela regra da ficha). Clique para ver quem está na conta e simular.` } as Record<string, string>)[k]}><span className="dx-cn"><i className={`fas ${({ ent: 'fa-sack-dollar', gas: 'fa-receipt', pes: 'fa-users' } as Record<string, string>)[k]} dx-ic`} aria-hidden />{r}</span><b>{brl(v)}</b></button>
                </span>
              ))}
              <span className="dx-sim-conta-i"><em>=</em><span className="dx-sim-conta-r" style={{ '--c': ficou >= 0 ? CS.ficou : CS.faltou } as React.CSSProperties} data-dica={`${ficou >= 0 ? 'SOBROU' : 'FALTOU'} — o que fica para a empresa: Entrou (${brl(bruto)}) − Gastos (${brl(gastos)}) − Pessoal (${brl(pessoal)}) = ${brl(ficou)}. É R$ ${Math.round(p100)} de cada R$ 100 que entraram.`}><span className="dx-cn"><i className="fas fa-piggy-bank dx-ic" aria-hidden />{ficou >= 0 ? 'Sobrou' : 'Faltou'}</span><b>{brl(ficou)}</b></span></span>
              <button type="button" className={`dx-sim-conta-desc ${aba === 'des' ? 'on' : ''}`} onClick={() => setAba('des')} data-dica={`DESCONTOS — o que foi dado de desconto nas OS e nos pedidos de peças do mês (${brl(descS)}). O "Entrou" já está depois deles. Clique para ver os maiores descontos e simular dar menos (aumenta o que entra) ou mais (diminui).`}><i className="fas fa-tags" /> Descontos dados: <b>{brl(descS)}</b> <small>(já tirados do que entrou)</small></button>
            </div>
          ) : (
          <div className="dx-sim-abas">
            {([['ent', 'Entradas', 'fa-arrow-down', '#0369a1', bruto], ['des', 'Descontos', 'fa-tags', '#d97706', descS], ['gas', 'Gastos', 'fa-receipt', CS.gastos, gastos], ['pes', 'Pessoal', 'fa-users', CS.pessoal, pessoal]] as const).map(([k, r, ic, cor, v]) => (
              <button key={k} type="button" className={aba === k ? 'on' : ''} style={{ '--c': cor } as React.CSSProperties} onClick={() => setAba(k)} data-dica={{ ent: 'Tudo o que entrou no período: mão de obra, deslocamento, peças e outros das OS faturadas.', des: 'Descontos dados nas OS e nos pedidos de peças — no portal e no Omie. O que entrou já está DEPOIS do desconto.', gas: 'Gastos do pós-vendas no período: combustível, manutenção dos carros, alimentação e materiais.', pes: 'Salários + encargos e comissões de quem trabalha no pós-vendas.' }[k]}><i className={`fas ${ic}`} /> {r}<b>{brl(v)}</b></button>
            ))}
          </div>
          )}
          {claro && <small className="dx-sim-sub">{({ ent: 'O que entrou nas OS faturadas do mês. Arraste para simular mais horas, hora mais cara, mais km ou mais peças.', des: 'Descontos dados nas OS e nos pedidos. O que entrou já é depois deles: dar menos desconto aumenta o que entra.', gas: 'Combustível, carro, almoço e materiais do pós-vendas. Arraste para simular cortar ou gastar mais.', pes: 'Salários, encargos e comissões de quem é do pós-vendas. Desmarque alguém, dê reajuste ou contrate técnicos.' } as Record<string, string>)[aba]}</small>}
          <div className="dx-sim-grupo" key={aba}>
            {aba === 'ent' && <>
              <RegSim claro={claro} v={val('horas')} onSet={set('horas')} rot="Horas cobradas" ic="fa-clock" cor={CE.mo} min={-60} max={150} antes={horas(c.horas)} depois={horas(horasS)} extra={`${brl(ent.mo)} de mão de obra`} dica="Horas de mão de obra que foram cobradas nas OS faturadas no período. Arraste para simular mais (ou menos) horas cobradas — a mão de obra muda junto, no valor médio da hora." />
              <RegSim claro={claro} v={val('vh')} onSet={set('vh')} rot="Valor da hora" ic="fa-tag" cor={CE.mo} min={-30} max={60} antes={`${brl(vh)}/h`} depois={`${brl(vhS)}/h`} extra={`média cobrada · tabela ${brl(vhTabS)}/h`} dica={`A hora de tabela é ${brl(vhTab)}. A média que realmente entrou foi ${brl(vh)}/h: mão de obra ÷ horas cobradas. Fica abaixo da tabela por causa dos descontos e da garantia (a montadora paga R$ 100/h). Arraste para simular cobrar mais ou menos por hora.`} />
              <RegSim claro={claro} dica="Quilômetros de deslocamento cobrados nas OS do período, ao valor do km. Arraste para simular mais ou menos km cobrado." v={val('km')} onSet={set('km')} rot="Km rodados" ic="fa-road" cor={CE.km} min={-60} max={150} antes={kmFmt(c.kmRod)} depois={kmFmt(c.kmRod * (1 + val('km') / 100))} extra={`${brl(vkm)}/km · ${brl(ent.km)}`} />
              <RegSim claro={claro} v={val('outros')} onSet={set('outros')} rot="Outros (requisições, extras)" ic="fa-receipt" cor={CE.outros} min={-100} max={150} antes={brl(c.outros)} depois={brl(ent.outros)} />
            </>}
            {aba === 'des' && <>
              <div className="dx-sim-desc">
                <b><i className="fas fa-tags" /> Descontos dados no período: {brl(c.desc.total)}</b>
                <small>{c.desc.nOS} OS com desconto · {c.bruto > 0 ? `R$ ${Math.round((c.desc.total / c.bruto) * 100)} para cada R$ 100 que entraram` : ''}. O que entrou já é depois do desconto: diminuir o desconto aumenta o que entra; aumentar, diminui.</small>
              </div>
              {c.desc.total <= 0.5
                ? <small className="dx-sim-nota">Nenhum desconto dado nas OS deste período.</small>
                : DESC.filter(([k]) => c.desc[k] > 0.5).map(([k, r, ic]) => (
                  <RegSim claro={claro} key={k} v={val(`d_${k}`)} onSet={set(`d_${k}`)} rot={r} ic={ic} cor="#d97706" min={-100} max={100} antes={brl(c.desc[k])} depois={brl(c.desc[k] * (1 + val(`d_${k}`) / 100))} extra={val(`d_${k}`) !== 0 ? `${val(`d_${k}`) < 0 ? '+' : '−'}${brl(Math.abs(c.desc[k] * val(`d_${k}`) / 100))} no faturamento` : undefined} />
                ))}
              {c.desc.maiores.length > 0 && (
                <div className="dx-sim-eq">
                  <div className="dx-sim-eq-cab"><b><i className="fas fa-ranking-star" style={{ color: '#d97706' }} /> Maiores descontos do período</b></div>
                  {c.desc.maiores.map((o) => (
                    <div key={o.os} className="dx-sim-desc-l"><span>{o.numero ? `OS ${o.numero}` : o.os}</span><em>{o.cliente || 'cliente no Omie'}</em><strong>{brl(o.valor)}</strong></div>
                  ))}
                </div>
              )}
            </>}
            {aba === 'gas' && <>
              {somaG.map((x) => <RegSim claro={claro} key={x.k} v={val(x.k)} onSet={set(x.k)} rot={x.r} ic="fa-minus" cor={CS.gastos} min={-100} max={100} antes={brl(x.v)} depois={brl(x.s)} />)}
              {gItens.filter((x) => x.v < 0).map((x) => <small key={x.k} className="dx-sim-nota">{x.r}: {brl(x.v)} (fixo)</small>)}
            </>}
            {aba === 'pes' && <>
              {c.equipe.length > 0 && (
                <div className="dx-sim-eq">
                  <div className="dx-sim-eq-cab">
                    <b><i className="fas fa-users" /> Quem está sendo contado</b>
                    <small>Vem do RH. Salário + encargos é conta fixa: entra o mês inteiro, mesmo vendo só uma semana ou um dia. Comissão (sem encargos): a lançada no RH e, sem ela, a prevista pela mesma regra da ficha do técnico. Os encargos da comissão ficam na coluna Encargos. Desmarque para simular sem a pessoa.</small>
                  </div>
                  <div className="dx-sim-eq-l tit"><span /><span>Pessoa</span><span>Salário</span><span>Encargos</span><span>Comissão</span><span>Total</span></div>
                  {c.equipe.map((p) => {
                    const on = !fora.includes(p.nome)
                    const com = p.comissao + (prev ? p.prevista : 0)
                    const comSemEnc = p.comissao - p.encComissao + (prev ? p.prevista - p.encPrevista : 0)
                    const encTot = p.encargos + p.encComissao + (prev ? p.encPrevista : 0)
                    return (
                      <label key={p.nome} className={`dx-sim-eq-l ${on ? '' : 'off'}`}>
                        <input type="checkbox" checked={on} onChange={() => { setFora((f) => (on ? [...f, p.nome] : f.filter((x) => x !== p.nome))); setCen('') }} />
                        <span><b>{p.nome}</b><em className={p.campo ? 'campo' : 'apoio'}>{p.campo ? 'técnico de campo' : rotuloApoio(p.nome)}</em></span>
                        <span>{brl(p.salario - p.encargos)}</span>
                        <span title="encargos do salário + da comissão">{brl(encTot)}</span>
                        <span title={p.comissao > 0 ? 'lançada no RH (sem encargos)' : p.prevista > 0 ? 'prevista pela regra da ficha do técnico (ainda não no RH, sem encargos)' : ''}>{brl(comSemEnc)}{p.comissao <= 0 && p.prevista > 0 && prev && <small> prev.</small>}{p.rescisao > 0.5 && <small> + resc. {brl(p.rescisao)}</small>}</span>
                        <strong>{brl(p.salario + com + p.rescisao)}</strong>
                      </label>
                    )
                  })}
                  <div className="dx-sim-eq-l tot"><span /><span>{dentro.length} de {c.equipe.length} pessoas · {campo.length} técnicos de campo</span><span>{brl(dentro.reduce((s, p) => s + p.salario - p.encargos, 0))}</span><span>{brl(dentro.reduce((s, p) => s + p.encargos + p.encComissao + (prev ? p.encPrevista : 0), 0))}</span><span>{brl(dentro.reduce((s, p) => s + p.comissao - p.encComissao + (prev ? p.prevista - p.encPrevista : 0), 0))}</span><strong>{brl(salBase + comBase + (prev ? prevBase : 0) + rescBase)}</strong></div>
                </div>
              )}
              <RegSim claro={claro} dica="Salário + encargos de quem está marcado na lista acima, no mês inteiro. Arraste para simular um reajuste (ou corte)." v={val('sal')} onSet={set('sal')} rot="Salários + encargos (reajuste)" ic="fa-money-check-dollar" cor={CS.pessoal} min={-30} max={50} antes={brl(salBase)} depois={brl(salBase * (1 + val('sal') / 100))} />
              <div className="dx-sim-tec" style={{ '--c': CS.pessoal } as React.CSSProperties}>
                <span><i className="fas fa-user-plus" /> Contratar técnicos</span>
                <div><button type="button" onClick={() => { setTec((t) => Math.max(0, t - 1)); setCen('') }}>−</button><b>+{tec}</b><button type="button" onClick={() => { setTec((t) => Math.min(10, t + 1)); setCen('') }}>+</button></div>
                <small>cada novo custa {brl(custoTec)} no período (média do salário + encargos dos técnicos de campo){tec > 0 && <> · +{brl(tec * custoTec)}</>}</small>
              </div>
              <RegSim claro={claro} dica="Comissão dos técnicos no período: a lançada no RH e, sem ela, a prevista pela regra. Arraste para simular pagar mais ou menos comissão." v={val('com')} onSet={set('com')} rot="Comissão" ic="fa-percent" cor={CS.pessoal} min={-100} max={100} antes={brl(comBase + (prev ? prevBase : 0))} depois={brl(pItens.comissao)} />
              <label className="dx-sim-chk"><input type="checkbox" checked={prev} onChange={(e) => { setPrev(e.target.checked); setCen('') }} /> contar a comissão prevista ({brl(prevBase)})</label>
              {rescBase > 0.5 && <small className="dx-sim-nota">Rescisões e acertos: {brl(rescBase)} (fixo)</small>}
            </>}
          </div>
          {mudou && <button type="button" className="dx-sim-zera" onClick={() => aplicar('real', null)}><i className="fas fa-rotate-left" /> voltar tudo ao real</button>}
          {claro && <div className="dx-esq-blocos">{indicadoresEl}</div>}
        </div>

        <div className={`dx-sim-res ${claro ? 'claro' : ''}`}>
          {claro && forma ? <LadoDireito forma={forma} d={{ rotulo: c.rotulo, real: { entrou: c.bruto, gastos: c.gastos, pessoal: c.pessoal, sobrou: c.resultado }, sim: { entrou: bruto, gastos, pessoal, sobrou: ficou }, mudou, empate, alvo, anterior: anterior ? { rotulo: anterior.rotulo, entrou: anterior.bruto, sobrou: anterior.resultado } : null, taxaG, horasPara, valorHora: vhS, aplicarMeta }} /> : claro ? (() => {
            // José, 21/10/2026: "melhora essa tela aqui" — blocos 1 a 3 em cartões, com a composição do que entrou
            const partes = (e: number, g: number, p: number) => [
              { k: 'Gastos', v: Math.max(0, g), cor: CS.gastos },
              { k: 'Pessoal', v: Math.max(0, p), cor: CS.pessoal },
              { k: e - g - p >= 0 ? 'Sobrou' : 'Faltou', v: Math.abs(e - g - p), cor: e - g - p >= 0 ? CS.ficou : CS.faltou },
            ]
            const Pilha = ({ rot, e, g, p }: { rot: string; e: number; g: number; p: number }) => (
              <div className="dx-pilha-l"><small>{rot}</small><div className="dx-pilha">{partes(e, g, p).map((x) => <i key={x.k} style={{ flexGrow: Math.max(x.v, 0.0001), background: x.cor }} title={`${x.k}: ${brl(x.v)} (${e ? Math.round((x.v / e) * 100) : 0}%)`}>{e && x.v / e >= 0.1 ? `${Math.round((x.v / e) * 100)}%` : ''}</i>)}</div></div>
            )
            const linhas: [string, string, number, number, string, boolean][] = [
              ['Entrou', '', c.bruto, bruto, '#0369a1', false],
              ['Gastos', '−', c.gastos, gastos, CS.gastos, true],
              ['Pessoal', '−', c.pessoal, pessoal, CS.pessoal, true],
              [ficou >= 0 ? 'Sobrou' : 'Faltou', '=', c.resultado, ficou, ficou >= 0 ? CS.ficou : CS.faltou, false],
            ]
            return <>
              <section className="dx-card">
                <div className="dx-res-t"><b>1</b> Quanto sobrou para a empresa</div>
                <div className="dx-card-topo">
                  <div><small>{mudou ? 'No mês simulado sobraria' : `Em ${c.rotulo} sobrou`}</small><strong style={{ color: ficou >= 0 ? CS.ficou : CS.faltou }}><Numero valor={ficou} formato={brl} /></strong></div>
                  <p>{bruto > 0.5 ? <>De cada <b>R$ 100</b> que entraram, {ficou >= 0 ? <>sobraram <b style={{ color: CS.ficou }}>R$ {Math.round(p100)}</b> para a empresa.</> : <>faltaram <b style={{ color: CS.faltou }}>R$ {Math.abs(Math.round(p100))}</b>.</>}</> : 'Ainda não entrou nada no mês.'}
                    {mudou && <span className={`dx-card-dif ${dif >= 0 ? 'bom' : 'ruim'}`}>{dif >= 0 ? '+' : '−'}{brl(Math.abs(dif))} em relação ao que foi</span>}</p>
                </div>
                <Pilha rot={mudou ? 'Como foi' : 'Para onde foi cada R$ 100'} e={c.bruto} g={c.gastos} p={c.pessoal} />
                {mudou && <Pilha rot="Simulado" e={bruto} g={gastos} p={pessoal} />}
                <div className="dx-pilha-leg">{partes(bruto, gastos, pessoal).map((x) => <span key={x.k}><i style={{ background: x.cor }} />{x.k}</span>)}</div>
              </section>

              <section className="dx-card">
                <div className="dx-res-t"><b>2</b> A conta, linha a linha</div>
                <div className="dx-tab">
                  <div className="dx-tab-l cab"><span /><span>Como foi</span><span>Simulado</span><span>Diferença</span></div>
                  {linhas.map(([r, op, a, b, cor, custo]) => {
                    const d = b - a, bom = custo ? d < 0 : d > 0, igual = Math.abs(d) < 1
                    return (
                      <div key={r} className={`dx-tab-l ${op === '=' ? 'tot' : ''}`}>
                        <span><em>{op}</em><i style={{ background: cor }} />{r}</span>
                        <span>{brl(a)}</span>
                        <span>{igual ? <small>igual</small> : brl(b)}</span>
                        <span className={igual ? '' : bom ? 'bom' : 'ruim'}>{igual ? '—' : `${d > 0 ? '+' : '−'}${brl(Math.abs(d))}`}</span>
                      </div>
                    )
                  })}
                </div>
              </section>

            </>
          })() : <>
          <small>{claro ? (mudou ? 'No mês simulado sobraria' : `Em ${c.rotulo} sobrou`) : mudou ? 'Nesse cenário ficaria' : 'Ficou de verdade'}</small>
          <b style={{ color: ficou >= 0 ? CS.ficou : CS.faltou }}><Numero valor={ficou} formato={brl} /></b>
          <div className={`dx-sim-medidor ${p100 >= 35 ? 'dentro' : ''}`} data-dica="De cada R$ 100 que entraram, quanto sobrou para a empresa depois de pagar gastos e pessoal."><i style={{ width: `${Math.max(0, Math.min(100, p100))}%`, background: ficou >= 0 ? CS.ficou : CS.faltou }} /><span>{bruto > 0.5 ? `R$ ${Math.round(p100)} de cada R$ 100 (${Math.round(p100)}%)` : 'nada entrou ainda'}</span></div>
          {mudou && <span className={`dx-dif ${dif >= 0 ? 'bom' : 'ruim'}`}>{dif >= 0 ? '▲ +' : '▼ −'}{brl(Math.abs(dif))} contra o real</span>}

          <div className="dx-sim-cmp">
            <div className="dx-sim-cmp-cab"><span /><span>{claro ? 'como foi' : 'real'}</span><span>{claro ? 'simulado' : 'cenário'}</span></div>
            {comparar.map(([r, a, b, cor, custo]) => {
              const d = b - a, bom = custo ? d < 0 : d > 0
              return (
                <div key={r} className="dx-sim-cmp-l" style={{ '--c': cor } as React.CSSProperties} data-dica={({ Entrou: 'O que entrou: real × no cenário que você montou.', Gastos: 'Gastos do pós-vendas: real × cenário.', Pessoal: 'Salários, encargos e comissões: real × cenário.', Ficou: 'O que sobrou para a empresa: entrou − gastos − pessoal.', Faltou: 'Faltou dinheiro: gastos + pessoal passaram do que entrou.' } as Record<string, string>)[r]}>
                  <span>{r}</span>
                  <div><i className="r" style={{ width: `${(Math.abs(a) / maxC) * 100}%` }} /><i className="c" style={{ width: `${(Math.abs(b) / maxC) * 100}%` }} /></div>
                  <b>{brl(b)}</b>
                  <em className={Math.abs(d) < 1 ? '' : bom ? 'bom' : 'ruim'}>{Math.abs(d) < 1 ? '=' : `${d > 0 ? '+' : '−'}${brl(Math.abs(d))}`}</em>
                </div>
              )
            })}
          </div>

          <div className="dx-sim-kpis">
            <div data-dica="Quanto entrou, em média, por OS faturada: o que entrou ÷ número de OS."><small>Ticket médio</small><b>{brl(c.nOS ? bruto / c.nOS : 0)}</b><span>{c.nOS} OS</span></div>
            <div data-dica="O que entrou ÷ técnicos de campo (os que tiveram OS no período, mais os contratados no simulador)."><small>Faturamento por técnico</small><b>{brl(nTec ? bruto / nTec : 0)}</b><span>{nTec} técnicos</span></div>
            <div data-dica={`Se cobrar 1 hora a mais na tabela (${brl(vhTabS)}), sobra isso para a empresa depois de tirar a parte dos gastos (R$ ${Math.round(taxaG * 100)} a cada R$ 100 que entram). Salário não muda com 1 hora a mais, por isso não entra aqui.`}><small>Cada hora a mais deixa</small><b>{brl(vhTabS * (1 - taxaG))}</b><span>hora de {brl(vhTabS)}, já tirando os gastos</span></div>
            <div data-dica="De cada R$ 100 que entraram, quanto foi para gastos (combustível, carro, alimentação, materiais) e quanto para pessoal (salários + comissões)."><small>Gastos por R$ 100</small><b>R$ {Math.round(taxaG * 100)}</b><span>pessoal: R$ {bruto ? Math.round((pessoal / bruto) * 100) : 0}</span></div>
          </div>

          </>}
          {!(claro && forma) && alvosEl}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
/** D6 — Balança: Entrou de um lado, Gastos + Pessoal do outro; ligue e desligue cada peso e veja pender. */
export function DinheiroBalanca({ c }: { c: Conta }) {
  const pesos = [
    { k: 'gastos', r: 'Gastos', v: c.gastos, cor: CS.gastos },
    { k: 'salario', r: 'Salários', v: c.pessoal - c.comissaoPrev, cor: CS.pessoal },
    { k: 'prev', r: 'Comissão prevista', v: c.comissaoPrev, cor: '#a78bfa' },
  ].filter((p) => p.v > 0.5)
  const [fora, setFora] = useState<string[]>([])
  const saiu = pesos.filter((p) => !fora.includes(p.k)).reduce((s, p) => s + p.v, 0)
  const sobra = c.bruto - saiu
  const ang = Math.max(-14, Math.min(14, ((saiu - c.bruto) / Math.max(c.bruto, saiu, 1)) * 40))
  const v = useContador(sobra, 700)
  return (
    <div className="dx-caixa">
      <Frase c={c} />
      <div className="dx-bal">
        <div className="dx-bal-cena">
          <div className="dx-bal-viga" style={{ transform: `rotate(${ang}deg)` }}>
            <div className="dx-bal-prato e" style={{ transform: `rotate(${-ang}deg)` }}>
              <div className="dx-bal-pilha">{entradas(c).map(([r, val, cor]) => <i key={r} title={`${r}: ${brl(val)}`} style={{ flexGrow: val, background: cor }} />)}</div>
              <small>Entrou</small><b>{brl(c.bruto)}</b>
            </div>
            <div className="dx-bal-prato s" style={{ transform: `rotate(${-ang}deg)` }}>
              <div className="dx-bal-pilha">{pesos.filter((p) => !fora.includes(p.k)).map((p) => <i key={p.k} title={`${p.r}: ${brl(p.v)}`} style={{ flexGrow: p.v, background: p.cor }} />)}</div>
              <small>Saiu</small><b>{brl(saiu)}</b>
            </div>
          </div>
          <div className="dx-bal-pe" />
        </div>
        <div className="dx-bal-lado">
          <small>Tire ou ponha os pesos:</small>
          {pesos.map((p) => {
            const on = !fora.includes(p.k)
            return (
              <button key={p.k} type="button" className={`dx-bal-peso ${on ? 'on' : ''}`} style={{ '--c': p.cor } as React.CSSProperties} onClick={() => setFora((f) => (on ? [...f, p.k] : f.filter((x) => x !== p.k)))}>
                <span className="dx-bal-chave"><i /></span><b>{p.r}</b><strong>{brl(p.v)}</strong>
              </button>
            )
          })}
          <div className={`dx-bal-res ${sobra >= 0 ? 'bom' : 'ruim'}`}>
            <small>{sobra >= 0 ? 'Sobrou' : 'Faltou'}</small>
            <b>{brl(Math.abs(v))}</b>
            <span>{c.bruto ? `R$ ${Math.round((sobra / c.bruto) * 100)} de cada R$ 100` : ''}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
/** D7 — Rio animado: o dinheiro corre da esquerda (de onde veio) para a direita (para onde foi), sem parar;
 *  passe o mouse num lado para ver só o caminho dele. */
export function DinheiroRio({ c }: { c: Conta }) {
  const [foco, setFoco] = useState<string | null>(null)
  const E = entradas(c).map(([r, v, cor]) => ({ r, v, cor }))
  const S = [...saidas(c).map(([r, v, cor]) => ({ r, v, cor })), ...(c.resultado >= 0 ? [{ r: 'Ficou', v: c.resultado, cor: CS.ficou }] : [])]
  if (c.resultado < 0) E.push({ r: 'Faltou', v: -c.resultado, cor: CS.faltou })
  const W = 1000, H = 320, GAP = 10, X0 = 170, X1 = W - 170
  const tot = Math.max(1, E.reduce((s, x) => s + x.v, 0))
  const esc = (H - GAP * (Math.max(E.length, S.length) - 1)) / tot
  const nos = (lista: { r: string; v: number; cor: string }[]) => lista.reduce<{ r: string; v: number; cor: string; y: number; h: number }[]>((out, x) => {
    const ult = out[out.length - 1]
    return [...out, { ...x, y: ult ? ult.y + ult.h + GAP : 0, h: Math.max(2, x.v * esc) }]
  }, [])
  const NE = nos(E), NS = nos(S)
  const totS = Math.max(1, S.reduce((s, x) => s + x.v, 0))
  // cada entrada se divide nas saídas na mesma proporção
  const fitas = NE.flatMap((e, i) => NS.map((s, j) => {
    const v = e.v * (s.v / totS)
    const offE = NS.slice(0, j).reduce((a, x) => a + e.v * (x.v / totS), 0) * esc
    const offS = NE.slice(0, i).reduce((a, x) => a + x.v * (s.v / totS), 0) * esc
    const w = v * esc, y0 = e.y + offE + w / 2, y1 = s.y + offS + w / 2
    return { e: e.r, s: s.r, v, w, cor: s.cor, d: `M${X0},${y0} C${(X0 + X1) / 2},${y0} ${(X0 + X1) / 2},${y1} ${X1},${y1}` }
  }))
  const liga = (f: { e: string; s: string }) => !foco || f.e === foco || f.s === foco
  const somaFoco = foco ? fitas.filter((f) => f.e === foco || f.s === foco) : []
  return (
    <div className="dx-caixa">
      <Frase c={c} />
      <div className="dx-rio">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {fitas.map((f, i) => (
            <g key={i} style={{ opacity: liga(f) ? 1 : 0.08, transition: 'opacity .25s' }}>
              <path d={f.d} stroke={f.cor} strokeWidth={Math.max(1, f.w)} fill="none" opacity={0.28} className="dx-rio-f" style={{ animationDelay: `${i * 40}ms` }} />
              {f.w > 3 && <path d={f.d} stroke="#fefefe" strokeWidth={Math.max(1, Math.min(4, f.w / 4))} fill="none" strokeDasharray="2 22" strokeLinecap="round" className="dx-rio-gota" style={{ animationDuration: `${2.2 + (i % 3) * 0.5}s` }} opacity={0.75} />}
            </g>
          ))}
          {NE.map((n, i) => <rect key={n.r} x={X0 - 14} y={n.y} width={14} height={n.h} rx={4} fill={n.cor} className="dx-rio-no" style={{ animationDelay: `${i * 80}ms` }} onMouseEnter={() => setFoco(n.r)} onMouseLeave={() => setFoco(null)} />)}
          {NS.map((n, i) => <rect key={n.r} x={X1} y={n.y} width={14} height={n.h} rx={4} fill={n.cor} className="dx-rio-no" style={{ animationDelay: `${i * 80 + 200}ms` }} onMouseEnter={() => setFoco(n.r)} onMouseLeave={() => setFoco(null)} />)}
        </svg>
        <div className="dx-rio-rot e">{NE.map((n) => <button type="button" key={n.r} style={{ top: `${((n.y + n.h / 2) / H) * 100}%`, '--c': n.cor } as React.CSSProperties} className={foco === n.r ? 'on' : ''} onMouseEnter={() => setFoco(n.r)} onMouseLeave={() => setFoco(null)}><b>{brl(n.v)}</b><small>{n.r}</small></button>)}</div>
        <div className="dx-rio-rot s">{NS.map((n) => <button type="button" key={n.r} style={{ top: `${((n.y + n.h / 2) / H) * 100}%`, '--c': n.cor } as React.CSSProperties} className={foco === n.r ? 'on' : ''} onMouseEnter={() => setFoco(n.r)} onMouseLeave={() => setFoco(null)}><b>{brl(n.v)}</b><small>{n.r}</small></button>)}</div>
      </div>
      <div className="dx-rio-dica">
        {foco
          ? <>{E.some((x) => x.r === foco) ? <>Dos {brl(E.find((x) => x.r === foco)!.v)} de <b>{foco}</b>: </> : <>Os {brl(S.find((x) => x.r === foco)!.v)} de <b>{foco}</b> vieram de: </>}
            {somaFoco.map((f) => <span key={f.e + f.s}><i style={{ background: E.some((x) => x.r === foco) ? f.cor : (NE.find((n) => n.r === f.e)?.cor || '#999') }} />{E.some((x) => x.r === foco) ? f.s : f.e} <b>{brl(f.v)}</b></span>)}</>
          : <><i className="fas fa-hand-pointer" /> Passe o mouse num lado do rio para ver o caminho daquele dinheiro.</>}
      </div>
    </div>
  )
}

// ============================================================================
/** D8 — Histórico: os últimos períodos lado a lado (entrou × saiu e o que ficou de cada R$ 100);
 *  clique num período para abrir a conta dele. */
export function DinheiroHistorico({ c }: { c: Conta }) {
  const [sel, setSel] = useState(c.serie.length - 1)
  const s = c.serie
  const max = Math.max(1, ...s.flatMap((x) => [x.bruto, x.gastos + x.pessoal]))
  const x = s[sel] || s[s.length - 1]
  if (!x) return null
  return (
    <div className="dx-caixa">
      <Frase c={c} />
      <div className="dx-hist">
        {s.map((p, i) => {
          const r100 = p.bruto ? Math.round((p.resultado / p.bruto) * 100) : 0
          return (
            <button key={p.rotulo} type="button" className={`dx-hc ${i === sel ? 'on' : ''}`} onClick={() => setSel(i)}>
              <em className={p.resultado >= 0 ? 'bom' : 'ruim'}>R$ {r100}</em>
              <div className="dx-hc-par">
                <i className="e" style={{ height: `${(p.bruto / max) * 100}%`, animationDelay: `${i * 70}ms` }} />
                <span className="s" style={{ height: `${((p.gastos + p.pessoal) / max) * 100}%`, animationDelay: `${i * 70 + 35}ms` }}>
                  <i style={{ flexGrow: p.gastos, background: CS.gastos }} /><i style={{ flexGrow: p.pessoal, background: CS.pessoal }} />
                </span>
              </div>
              <small>{p.rotulo}</small>
            </button>
          )
        })}
      </div>
      <div className="dx-leg"><span><i style={{ background: '#0369a1' }} /> entrou</span><span><i style={{ background: CS.gastos }} /> gastos</span><span><i style={{ background: CS.pessoal }} /> pessoal</span><span>em cima: quanto ficou de cada R$ 100</span></div>
      <div className="dx-hist-conta" key={sel}>
        <b>{x.rotulo}</b>
        <span>Entrou <strong style={{ color: '#0369a1' }}>{brl(x.bruto)}</strong></span><em>−</em>
        <span>Gastos <strong style={{ color: CS.gastos }}>{brl(x.gastos)}</strong></span><em>−</em>
        <span>Pessoal <strong style={{ color: CS.pessoal }}>{brl(x.pessoal)}</strong></span><em>=</em>
        <span>{x.resultado >= 0 ? 'Ficou' : 'Faltou'} <strong style={{ color: x.resultado >= 0 ? CS.ficou : CS.faltou }}><Numero valor={x.resultado} formato={brl} /></strong></span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- comuns
function Frase({ c }: { c: Conta }) {
  const v = useContador(Math.round(por100(c)), 1000)
  return (
    <div className="dx-frase">
      <div>
        <small>Para onde foi o dinheiro · {c.rotulo}</small>
        {c.bruto < 0.5 ? <h3>Ainda não entrou nada{c.resultado < 0 ? <>: os custos do período já somam <b style={{ color: CS.faltou }}>{brl(-c.resultado)}</b></> : null}</h3> : <h3>De cada <b>R$ 100</b> que entraram, {c.resultado >= 0
          ? <>ficaram <b style={{ color: CS.ficou }}>R$ {Math.round(v)}</b> para a empresa</>
          : <>faltaram <b style={{ color: CS.faltou }}>R$ {Math.abs(Math.round(v))}</b>: o pós-vendas não se pagou</>}</h3>}
      </div>
      {c.ant && c.ant.bruto > 0 && (() => { const a = Math.round((c.ant.resultado / c.ant.bruto) * 100), d = Math.round(por100(c)) - a; return <span className={`dx-frase-ant ${d >= 0 ? 'bom' : 'ruim'}`}>{d >= 0 ? '▲' : '▼'} {Math.abs(d)} <small>vs período anterior (R$ {a})</small></span> })()}
    </div>
  )
}
function Detalhe({ titulo, itens, cor, onFechar }: { titulo: string; itens: [string, number][]; cor?: string; onFechar: () => void }) {
  const lista = itens.filter(([, v]) => Math.abs(v) > 0.5)
  const max = Math.max(1, ...lista.map(([, v]) => Math.abs(v)))
  return (
    <div className="dx-det" style={{ '--c': cor || '#0f172a' } as React.CSSProperties}>
      <div className="dx-det-cab"><b>{titulo}: de onde vem esse número</b><button type="button" onClick={onFechar}><i className="fas fa-xmark" /></button></div>
      {lista.length ? lista.map(([r, v], i) => (
        <div key={r} className="dx-det-l" style={{ animationDelay: `${i * 60}ms` }}><span>{r}</span><div><i style={{ width: `${(Math.abs(v) / max) * 100}%` }} /></div><b>{brl(v)}</b></div>
      )) : <small style={{ color: MUDO }}>Nada lançado neste período.</small>}
    </div>
  )
}

export const ESTILO_DX = `
.dx-caixa { display: grid; gap: 14px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 16px 18px; min-width: 0 }
.dx-frase { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap }
.dx-frase small { font-size: 11.5px; font-weight: 900; letter-spacing: .05em; text-transform: uppercase; color: ${MUDO} } .dx-frase h3 { margin: 2px 0 0; font-size: 21px; font-weight: 700; color: var(--portal-text, #0f172a) }
.dx-frase-ant { font-size: 18px; font-weight: 900; border-radius: 12px; padding: 6px 12px } .dx-frase-ant small { font-size: 12px; font-weight: 700; text-transform: none; letter-spacing: 0 } .dx-frase-ant.bom { color: #047857; background: #ecfdf5 } .dx-frase-ant.ruim { color: #b91c1c; background: #fef2f2 }
.dx-dif { font-size: 12px; font-weight: 900; border-radius: 99px; padding: 1px 8px; color: ${MUDO}; background: var(--portal-bg-secondary, #f1f5f9); justify-self: start } .dx-dif i { font-style: normal; font-weight: 700; opacity: .8 } .dx-dif.bom { color: #047857; background: #ecfdf5 } .dx-dif.ruim { color: #b91c1c; background: #fef2f2 }
.dx-leg { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: ${MUDO} } .dx-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px }
@keyframes dxSobe { from { transform: scaleY(0) } } @keyframes dxLado { from { transform: scaleX(0) } } @keyframes dxEntra { from { opacity: 0; transform: translateY(8px) } } @keyframes dxPop { from { opacity: 0; transform: scale(.3) } }
.dx-cascata { display: grid; gap: 14px; height: 240px; border-bottom: 2px solid var(--portal-border, #e2e8f0) }
.dx-cc { position: relative; cursor: pointer } .dx-cc-area { position: absolute; inset: 0 }
.dx-cc-bar { position: absolute; left: 8%; right: 8%; border-radius: 8px; overflow: hidden; transform-origin: bottom; animation: dxSobe .7s cubic-bezier(.2,.8,.2,1) both; transition: filter .2s, box-shadow .2s } .dx-cc:hover .dx-cc-bar, .dx-cc.on .dx-cc-bar { filter: brightness(1.08); box-shadow: 0 8px 20px rgba(15,23,42,.18) }
.dx-cc-bar > i { position: absolute; left: 0; right: 0 }
.dx-cc-liga { position: absolute; left: 92%; width: calc(16% + 14px); border-top: 2px dashed #94a3b8; animation: dxEntra .4s both }
.dx-cascata-n { display: grid; gap: 14px }
.dx-cascata-n button { display: grid; gap: 2px; justify-items: center; text-align: center; border: 1px solid transparent; background: transparent; border-radius: 12px; padding: 6px 4px; font-family: inherit; cursor: pointer; animation: dxEntra .45s both; transition: background .2s } .dx-cascata-n button:hover, .dx-cascata-n button.on { background: var(--portal-bg-secondary, #f8fafc); border-color: var(--portal-border, #e2e8f0) }
.dx-cascata-n small { font-size: 12.5px; font-weight: 900; text-transform: uppercase; color: ${MUDO} } .dx-cascata-n small em { font-style: normal; margin-right: 4px } .dx-cascata-n b { font-size: 20px; font-variant-numeric: tabular-nums } .dx-cascata-n span { font-size: 12px; color: ${MUDO} } .dx-cascata-n .dx-dif { justify-self: center }
.dx-cofre { display: grid; grid-template-columns: minmax(240px, 340px) 1fr; gap: 22px; align-items: center } @media (max-width: 800px) { .dx-cofre { grid-template-columns: 1fr } }
.dx-moedas { display: grid; grid-template-columns: repeat(10, 1fr); gap: 5px } .dx-moedas i { aspect-ratio: 1; border-radius: 50%; box-shadow: inset 0 -3px 0 rgba(0,0,0,.18), inset 0 2px 0 rgba(255,255,255,.35); animation: dxPop .35s cubic-bezier(.3,1.6,.5,1) both; transition: opacity .2s, transform .2s; cursor: pointer } .dx-moedas i.apaga { opacity: .15 } .dx-moedas i:hover { transform: scale(1.2) }
.dx-cofre-leg { display: grid; gap: 8px } .dx-cofre-leg > small { font-size: 13px; color: ${MUDO} }
.dx-cofre-l { display: grid; grid-template-columns: 54px 1fr auto; gap: 12px; align-items: center; border: 1px solid var(--portal-border, #e5e7eb); border-left: 5px solid var(--c); border-radius: 12px; padding: 8px 12px; animation: dxEntra .4s both; transition: transform .2s, box-shadow .2s } .dx-cofre-l.on { transform: translateX(4px); box-shadow: 0 6px 16px rgba(15,23,42,.08) }
.dx-cofre-n { font-size: 26px; font-weight: 900; color: var(--c); text-align: center } .dx-cofre-l b { display: block; font-size: 15px } .dx-cofre-l small { font-size: 12px; color: ${MUDO} } .dx-cofre-l strong { font-size: 16px; font-variant-numeric: tabular-nums }
.dx-entrou { display: flex; gap: 8px 16px; flex-wrap: wrap; align-items: center; font-size: 13px; padding-top: 10px; border-top: 1px dashed var(--portal-border, #e5e7eb) } .dx-entrou > small { font-weight: 900; color: ${MUDO} } .dx-entrou span { display: inline-flex; gap: 6px; align-items: center } .dx-entrou span i { width: 10px; height: 10px; border-radius: 3px; background: var(--c) }
.dx-alerta { margin: 0; color: #b91c1c; font-weight: 800; font-size: 13px }
.dx-conta { display: flex; gap: 8px; align-items: stretch; flex-wrap: wrap } .dx-conta-par { display: flex; gap: 8px; align-items: center; flex: 1 1 210px }
.dx-sinal { font-size: 26px; font-weight: 900; color: ${MUDO}; animation: dxPop .4s both }
.dx-ck { flex: 1; position: relative; display: grid; gap: 4px; text-align: left; font-family: inherit; cursor: pointer; border: 1px solid var(--portal-border, #e5e7eb); background: var(--portal-bg-card, #fefefe); border-radius: 16px; padding: 14px; overflow: hidden; animation: dxEntra .45s both; transition: transform .2s, box-shadow .2s }
.dx-ck::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 4px; background: var(--c) } .dx-ck:hover { transform: translateY(-3px); box-shadow: 0 10px 22px rgba(15,23,42,.1) } .dx-ck.on { box-shadow: 0 0 0 2px var(--c) } .dx-ck.fim { background: color-mix(in srgb, var(--c) 8%, var(--portal-bg-card, #fefefe)) }
.dx-ck-ic { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 14%, transparent); color: var(--c) }
.dx-ck small { font-size: 12.5px; font-weight: 900; text-transform: uppercase; color: var(--c) } .dx-ck > b { font-size: 24px; font-variant-numeric: tabular-nums; color: var(--portal-text, #0f172a) } .dx-ck > span { font-size: 12.5px; color: ${MUDO} }
.dx-ck-barra { display: grid; gap: 2px } .dx-ck-barra i { display: block; height: 6px; border-radius: 99px; background: var(--c); transform-origin: left; animation: dxLado .8s both } .dx-ck-barra em { font-style: normal; font-size: 11.5px; font-weight: 800; color: ${MUDO} }
.dx-ck u { text-decoration: none; font-size: 12px; font-weight: 800; color: var(--c) }
.dx-det { border: 1px solid var(--portal-border, #e5e7eb); border-radius: 14px; padding: 12px 14px; display: grid; gap: 6px; animation: dxEntra .3s both }
.dx-det-cab { display: flex; justify-content: space-between; align-items: center } .dx-det-cab button { border: none; background: transparent; cursor: pointer; color: ${MUDO}; font-size: 16px }
.dx-det-l { display: grid; grid-template-columns: minmax(160px, 1fr) 2fr auto; gap: 10px; align-items: center; font-size: 13.5px; animation: dxEntra .3s both } .dx-det-l div { height: 8px; border-radius: 99px; background: var(--portal-bg-secondary, #f1f5f9); overflow: hidden } .dx-det-l div i { display: block; height: 100%; background: var(--c); transform-origin: left; animation: dxLado .7s both } .dx-det-l b { font-variant-numeric: tabular-nums }
.dx-regua { display: grid; gap: 10px }
.dx-regua-t { display: flex; gap: 12px; align-items: baseline; flex-wrap: wrap } .dx-regua-t small { font-size: 12.5px; font-weight: 900; text-transform: uppercase; color: ${MUDO} } .dx-regua-t b { font-size: 28px; color: #0369a1; font-variant-numeric: tabular-nums }
.dx-regua-barra { display: flex; height: 54px; border-radius: 14px; overflow: hidden; gap: 3px } .dx-regua-barra.fina { height: 14px; border-radius: 99px; gap: 2px }
.dx-regua-barra i { position: relative; display: grid; place-items: center; transform-origin: left; animation: dxLado .7s cubic-bezier(.2,.8,.2,1) both; transition: opacity .2s; cursor: pointer } .dx-regua-barra i.apaga { opacity: .25 } .dx-regua-barra i span { color: #fefefe; font-weight: 900; font-size: 17px; text-shadow: 0 1px 2px rgba(0,0,0,.25) }
.dx-regua-ents { display: flex; gap: 6px 18px; flex-wrap: wrap; font-size: 13px } .dx-regua-ents span { display: inline-flex; gap: 6px; align-items: baseline } .dx-regua-ents i { width: 10px; height: 10px; border-radius: 3px; background: var(--c); align-self: center } .dx-regua-ents small { color: ${MUDO} }
.dx-regua-seta { font-size: 13px; font-weight: 800; color: ${MUDO} }
.dx-regua-pecas { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px }
.dx-rp { display: grid; gap: 3px; border: 1px solid var(--portal-border, #e5e7eb); border-top: 4px solid var(--c); border-radius: 14px; padding: 10px 12px; animation: dxEntra .45s both; transition: transform .2s, box-shadow .2s } .dx-rp.on { transform: translateY(-3px); box-shadow: 0 10px 22px rgba(15,23,42,.1) }
.dx-rp small { font-size: 12.5px; font-weight: 900; text-transform: uppercase; color: var(--c); display: inline-flex; gap: 6px; align-items: center } .dx-rp small i { width: 10px; height: 10px; border-radius: 3px; background: var(--c) } .dx-rp b { font-size: 22px; font-variant-numeric: tabular-nums } .dx-rp > span { font-size: 12.5px; color: ${MUDO} }
.dx-sim { display: grid; grid-template-columns: minmax(260px, 1fr) minmax(260px, 1fr); gap: 20px } @media (max-width: 800px) { .dx-sim { grid-template-columns: 1fr } }
.dx-sim-cen { display: flex; gap: 6px; flex-wrap: wrap; align-items: center } .dx-sim-cen > small { font-size: 12.5px; font-weight: 900; color: ${MUDO}; margin-right: 4px } .dx-sim-cen > small i { color: #7c3aed }
.dx-sim-cen button { border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 12.5px; font-weight: 800; color: var(--portal-text, #334155); cursor: pointer; transition: all .2s }
.dx-sim-eq { display: grid; gap: 3px; border: 1px solid var(--portal-border, #e5e7eb); border-radius: 14px; padding: 10px 12px; background: var(--portal-bg-card, #fefefe) }
.dx-sim-eq-cab { display: grid; gap: 2px; margin-bottom: 6px } .dx-sim-eq-cab b { font-size: 14px } .dx-sim-eq-cab b i { color: ${CS.pessoal} } .dx-sim-eq-cab small { font-size: 12px; color: ${MUDO} }
.dx-sim-eq-l { display: grid; grid-template-columns: 22px minmax(0, 1.6fr) 1fr 1fr 1fr 1fr; gap: 8px; align-items: center; font-size: 13px; font-variant-numeric: tabular-nums; padding: 4px 2px; border-radius: 8px; cursor: pointer; transition: opacity .2s, background .2s } .dx-sim-eq-l:hover:not(.tit):not(.tot) { background: var(--portal-bg-secondary, #f8fafc) }
.dx-sim-eq-l > span:not(:nth-child(2)), .dx-sim-eq-l > strong { text-align: right } .dx-sim-eq-l.off { opacity: .4 } .dx-sim-eq-l.off b { text-decoration: line-through }
.dx-sim-eq-l b { display: block; font-size: 13px } .dx-sim-eq-l em { font-style: normal; font-size: 10.5px; font-weight: 800; border-radius: 99px; padding: 0 6px } .dx-sim-eq-l em.campo { color: #6d28d9; background: #f5f3ff } .dx-sim-eq-l em.apoio { color: ${MUDO}; background: var(--portal-bg-secondary, #f1f5f9) }
.dx-sim-eq-l small { font-size: 10.5px; color: ${MUDO} }
.dx-sim-eq-l.tit { cursor: default; font-size: 10.5px; font-weight: 900; text-transform: uppercase; color: ${MUDO} } .dx-sim-eq-l.tot { cursor: default; border-top: 1px dashed var(--portal-border, #e5e7eb); padding-top: 6px; font-weight: 800; font-size: 12.5px } .dx-sim-cen button:hover { border-color: #7c3aed; color: #7c3aed } .dx-sim-cen button.on { background: #0f172a; border-color: #0f172a; color: #fefefe }
.dx-sim-desc { display: grid; gap: 3px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 10px 12px } .dx-sim-desc b { font-size: 14px; color: #92400e } .dx-sim-desc small { font-size: 12px; color: #78350f }
.dx-sim-desc-l { display: grid; grid-template-columns: 90px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 13px; padding: 3px 2px } .dx-sim-desc-l span { font-weight: 800 } .dx-sim-desc-l em { font-style: normal; color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .dx-sim-desc-l strong { color: #b45309; font-variant-numeric: tabular-nums }
.dx-sim-abas { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; background: var(--portal-bg-secondary, #f1f5f9); border-radius: 14px; padding: 4px }
.dx-sim-abas button { display: grid; gap: 1px; justify-items: center; border: none; background: transparent; border-radius: 11px; padding: 7px 4px; font-family: inherit; font-size: 13px; font-weight: 800; color: ${MUDO}; cursor: pointer; transition: all .2s } .dx-sim-abas button i { color: var(--c) } .dx-sim-abas button b { font-size: 12px; color: var(--portal-text, #334155); font-variant-numeric: tabular-nums }
.dx-sim-abas button.on { background: var(--portal-bg-card, #fefefe); color: var(--c); box-shadow: 0 1px 2px rgba(15,23,42,.08), 0 4px 12px rgba(15,23,42,.08) }
.dx-sim-grupo { display: grid; gap: 14px; animation: dxEntra .3s both }
.dx-guia { list-style: none; margin: 0 0 4px; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px }
.dx-guia li { display: flex; gap: 10px; align-items: flex-start; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 12px; padding: 10px 12px; font-size: 13px; line-height: 1.4; color: var(--portal-text, #0f172a) }
.dx-guia li > b { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: #0f172a; color: #fefefe; font-size: 12px }
.dx-guia strong { font-weight: 700 }
.dx-sim-conta-t { font-size: 12.5px; color: ${MUDO} }
.dx-sim-conta { display: flex; flex-wrap: wrap; align-items: stretch; gap: 6px; background: var(--portal-bg-secondary, #f1f5f9); border-radius: 14px; padding: 6px }
.dx-sim-conta-i { display: flex; align-items: center; gap: 6px; flex: 1 1 0; min-width: 0 }
.dx-sim-conta-i > em { font-style: normal; font-size: 18px; color: ${MUDO}; flex: none }
.dx-sim-conta-i > button, .dx-sim-conta-r { flex: 1; display: grid; gap: 1px; justify-items: center; border: 1px solid transparent; background: transparent; border-radius: 11px; padding: 7px 6px; font-family: inherit; cursor: pointer; color: var(--portal-text, #0f172a); transition: background .2s, box-shadow .2s, border-color .2s }
.dx-sim-conta-i > button small, .dx-sim-conta-r small { font-size: 12px; color: var(--c) } .dx-sim-conta-i > button b, .dx-sim-conta-r b { font-size: 14px; font-variant-numeric: tabular-nums }
.dx-sim-conta-i > button:hover { background: var(--portal-bg-card, #fefefe) }
.dx-sim-conta-i > button.on { background: var(--portal-bg-card, #fefefe); border-color: var(--c); box-shadow: 0 4px 12px rgba(15,23,42,.08) }
.dx-sim-conta-r { cursor: default; background: var(--portal-bg-card, #fefefe) } .dx-sim-conta-r b { color: var(--c) }
.dx-sim-conta-desc { flex-basis: 100%; border: 0; background: transparent; font-family: inherit; font-size: 12.5px; color: var(--portal-text, #0f172a); cursor: pointer; text-align: left; padding: 2px 8px; border-radius: 8px } .dx-sim-conta-desc i { color: #d97706 } .dx-sim-conta-desc small { color: ${MUDO} } .dx-sim-conta-desc.on { background: #fffbeb }
.dx-sim-sub { font-size: 12.5px; color: ${MUDO}; line-height: 1.45 }
.dx-sim-pill { font-size: 11.5px; font-weight: 600; border-radius: 99px; padding: 1px 8px; background: var(--portal-bg-secondary, #f1f5f9); color: ${MUDO} } .dx-sim-r.mexeu .dx-sim-pill { background: var(--c); color: #fefefe }
.dx-sim-cf { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: ${MUDO} } .dx-sim-cf b { color: var(--portal-text, #0f172a); font-weight: 600 } .dx-sim-cf em { font-style: normal }
.dx-res-t { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13.5px; font-weight: 700; color: var(--portal-text, #0f172a); margin-top: 6px } .dx-res-t > b { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: #0f172a; color: #fefefe; font-size: 11.5px } .dx-res-t small { font-weight: 400; font-size: 12px; color: ${MUDO} }
@media (max-width: 800px) { .dx-guia { grid-template-columns: 1fr } }
.dx-sim-r.mexeu > span { color: var(--c) } .dx-sim-x { border: none; background: var(--portal-bg-secondary, #f1f5f9); color: ${MUDO}; width: 20px; height: 20px; border-radius: 50%; cursor: pointer; font-size: 10px; margin-left: 4px }
.dx-sim-r small b { color: var(--portal-text, #0f172a) }
.dx-sim-nota { font-size: 12px; color: ${MUDO} }
.dx-sim-tec { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center } .dx-sim-tec > span { font-size: 13.5px; font-weight: 800; color: var(--portal-text, #334155) } .dx-sim-tec > span i { color: var(--c) } .dx-sim-tec small { grid-column: 1 / -1; font-size: 12px; color: ${MUDO} }
.dx-sim-tec > div { display: flex; align-items: center; gap: 8px } .dx-sim-tec button { width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--c); background: var(--portal-bg-card, #fefefe); color: var(--c); font-size: 17px; font-weight: 900; cursor: pointer; transition: all .2s } .dx-sim-tec button:hover { background: var(--c); color: #fefefe } .dx-sim-tec b { font-size: 20px; min-width: 24px; text-align: center }
.dx-sim-cmp { display: grid; gap: 5px; border-top: 1px dashed var(--portal-border, #e5e7eb); padding-top: 10px }
.dx-sim-cmp-cab, .dx-sim-cmp-l { display: grid; grid-template-columns: 72px 1fr 96px 90px; gap: 8px; align-items: center } .dx-sim-cmp-cab span { font-size: 10.5px; font-weight: 900; text-transform: uppercase; color: ${MUDO} }
.dx-sim-cmp-l > span { font-size: 13px; font-weight: 800 } .dx-sim-cmp-l > div { display: grid; gap: 3px } .dx-sim-cmp-l > div i { display: block; height: 6px; border-radius: 99px; transition: width .4s cubic-bezier(.2,.8,.2,1) } .dx-sim-cmp-l i.r { background: #cbd5e1 } .dx-sim-cmp-l i.c { background: var(--c) }
.dx-sim-cmp-l > b { font-size: 13.5px; text-align: right; font-variant-numeric: tabular-nums } .dx-sim-cmp-l > em { font-style: normal; font-size: 12px; font-weight: 900; text-align: right; color: ${MUDO}; font-variant-numeric: tabular-nums } .dx-sim-cmp-l > em.bom { color: #047857 } .dx-sim-cmp-l > em.ruim { color: #b91c1c }
.dx-sim-kpis { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px } .dx-sim-kpis > div { background: var(--portal-bg-card, #fefefe); border-radius: 12px; padding: 8px 10px; display: grid } .dx-sim-kpis small { font-size: 11px; font-weight: 900; text-transform: uppercase; color: ${MUDO} } .dx-sim-kpis b { font-size: 17px; font-variant-numeric: tabular-nums } .dx-sim-kpis span { font-size: 11.5px; color: ${MUDO} }
.dx-alvos { display: grid; gap: 0 }
/* José, 21/10/2026: "melhora a fonte e remove os ícones" — só no modo claro */
.dx-caixa.claro i.fas:not(.fa-chevron-down):not(.fa-xmark):not(.dx-ic) { display: none }
.dx-resumo { display: flex; gap: 8px 18px; align-items: center; flex-wrap: wrap; font-size: 15px; color: #334155; margin-bottom: 4px }
.dx-resumo > span:first-child { font-size: 16px; font-weight: 600; color: #0f172a } .dx-resumo b { font-weight: 600 }
.dx-resumo-d { font-size: 13.5px; border-radius: 99px; padding: 3px 10px } .dx-resumo-d.bom { color: #166534; background: #dcfce7 } .dx-resumo-d.ruim { color: #991b1b; background: #fee2e2 }
/* cartões no estilo dos do Faturamento por período (José, 21/10/2026): ícone no quadradinho, título ao lado, valor grande sem negrito */
.dx-cn { display: inline-flex !important; align-items: center; gap: 10px; font-size: 15px !important; font-weight: 500 !important; color: #0f172a !important; filter: none !important }
.dx-ic { width: 34px; height: 34px; border-radius: 10px; display: grid !important; place-items: center; font-size: 15px; color: var(--c); background: color-mix(in srgb, var(--c) 12%, #fefefe); border: 1px solid color-mix(in srgb, var(--c) 22%, #fefefe); flex: none }
.dx-caixa.claro .dx-sim-conta { background: transparent; padding: 0; gap: 10px }
.dx-caixa.claro .dx-sim-conta-i > button, .dx-caixa.claro .dx-sim-conta-r { justify-items: start; gap: 8px; background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 16px; transition: transform .2s, box-shadow .2s, border-color .2s }
.dx-caixa.claro .dx-sim-conta-i > button:hover { background: #fefefe; transform: translateY(-2px); border-color: color-mix(in srgb, var(--c) 40%, #e2e8f0); box-shadow: 0 12px 26px -18px rgba(15,23,42,.5) }
.dx-caixa.claro .dx-sim-conta-i > button.on { border-color: var(--c); box-shadow: 0 0 0 1px var(--c), 0 12px 26px -18px var(--c) }
.dx-caixa.claro .dx-sim-conta-i > button b, .dx-caixa.claro .dx-sim-conta-r b { font-size: 24px !important; font-weight: 500 !important; color: #0f172a }
.dx-caixa.claro .dx-sim-conta-r b { color: var(--c) }
.dx-caixa.claro .dx-ind > div { background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px; padding: 14px 16px; gap: 8px; transition: transform .2s, box-shadow .2s }
.dx-caixa.claro .dx-ind > div:hover { transform: translateY(-2px); box-shadow: 0 12px 26px -18px rgba(15,23,42,.5) }
.dx-caixa.claro .dx-ind b { font-size: 24px !important; font-weight: 500 !important } .dx-caixa.claro .dx-ind b em { font-weight: 400 }
.dx-caixa.claro .dx-card { border-radius: 16px }
.dx-caixa.claro .dx-res-t { font-weight: 500 !important }
.dx-caixa.claro { font-size: 15px; color: #0f172a }
.dx-caixa.claro .dx-guia li { font-size: 14px }
.dx-caixa.claro .dx-atalhos-d > summary { font-size: 15px } .dx-caixa.claro .dx-atalhos-d > summary small { font-size: 13.5px }
.dx-caixa.claro .dx-sim-cen button { font-size: 13.5px; font-weight: 500; padding: 6px 14px }
.dx-caixa.claro .dx-sim-conta-t, .dx-caixa.claro .dx-sim-sub { font-size: 14px; color: #334155 }
.dx-caixa.claro .dx-sim-conta-i > button small, .dx-caixa.claro .dx-sim-conta-r small { font-size: 13.5px; font-weight: 500 }
.dx-caixa.claro .dx-sim-conta-i > button b, .dx-caixa.claro .dx-sim-conta-r b { font-size: 18px; font-weight: 700 }
.dx-caixa.claro .dx-sim-conta-desc { font-size: 14px } .dx-caixa.claro .dx-sim-conta-desc small { font-size: 13px }
.dx-caixa.claro .dx-sim-r > span { font-size: 15px; font-weight: 600; color: #0f172a }
.dx-caixa.claro .dx-sim-pill { font-size: 12.5px; font-weight: 500; padding: 2px 10px }
.dx-caixa.claro .dx-sim-cf { font-size: 13.5px; color: #475569 } .dx-caixa.claro .dx-sim-cf b { font-weight: 600; color: #0f172a }
.dx-caixa.claro .dx-sim-nota, .dx-caixa.claro .dx-sim-chk { font-size: 14px; font-weight: 500; color: #334155 }
.dx-caixa.claro .dx-sim-tec > span { font-size: 15px; font-weight: 600 } .dx-caixa.claro .dx-sim-tec small { font-size: 13px }
.dx-caixa.claro .dx-sim-desc b { font-size: 15px } .dx-caixa.claro .dx-sim-desc small { font-size: 13.5px }
.dx-caixa.claro .dx-sim-eq-cab b { font-size: 15px } .dx-caixa.claro .dx-sim-eq-cab small { font-size: 13px }
.dx-caixa.claro .dx-sim-eq-l { font-size: 14px } .dx-caixa.claro .dx-sim-eq-l b { font-size: 14px; font-weight: 600 } .dx-caixa.claro .dx-sim-eq-l em { font-size: 11.5px; font-weight: 500 } .dx-caixa.claro .dx-sim-eq-l.tit { font-size: 12.5px; font-weight: 600; text-transform: none }
.dx-caixa.claro .dx-sim-desc-l { font-size: 14px }
.dx-caixa.claro .dx-res-t { font-size: 16px; font-weight: 700 } .dx-caixa.claro .dx-res-t small { font-size: 13px }
.dx-caixa.claro .dx-card-topo small { font-size: 14px } .dx-caixa.claro .dx-card-topo strong { font-size: 38px } .dx-caixa.claro .dx-card-topo p { font-size: 16px }
.dx-caixa.claro .dx-pilha { height: 30px } .dx-caixa.claro .dx-pilha i { font-size: 13px } .dx-caixa.claro .dx-pilha-l small, .dx-caixa.claro .dx-pilha-leg { font-size: 14px }
.dx-caixa.claro .dx-tab-l { font-size: 15.5px; padding: 9px 4px } .dx-caixa.claro .dx-tab-l.cab { font-size: 13.5px } .dx-caixa.claro .dx-tab-l small { font-size: 13.5px }
.dx-caixa.claro .dx-ind small { font-size: 14px } .dx-caixa.claro .dx-ind b { font-size: 22px } .dx-caixa.claro .dx-ind b em { font-size: 14px } .dx-caixa.claro .dx-ind span { font-size: 13.5px }
.dx-caixa.claro .dx-alvo > small, .dx-caixa.claro .dx-alvo.meta > small { font-size: 14px } .dx-caixa.claro .dx-alvo-v { font-size: 28px } .dx-caixa.claro .dx-alvo p { font-size: 15px } .dx-caixa.claro .dx-alvo-st { font-size: 15px }
.dx-caixa.claro .dx-trilho-leg { font-size: 14px } .dx-caixa.claro .dx-alvo-q { font-size: 15px } .dx-caixa.claro .dx-alvo-q em { font-size: 14px }
.dx-caixa.claro .dx-alvo-conta small { font-size: 13.5px } .dx-caixa.claro .dx-alvo-conta b { font-size: 17px }
/* contraste (José, 21/10/2026: "o contraste de informações também"): nenhum texto em cinza claro */
.dx-caixa.claro { --portal-text-muted: #475569 }
.dx-caixa.claro [data-dica]:hover::after, .ld [data-dica]:hover::after { font-size: 14px; line-height: 1.55; max-width: 380px; padding: 12px 14px; border-radius: 10px }
.dx-caixa.claro small, .dx-caixa.claro .dx-sim-sub, .dx-caixa.claro .dx-sim-conta-t { color: #475569 }
.dx-caixa.claro .dx-sim-conta { background: #e9eef4 }
.dx-caixa.claro .dx-sim-conta-i > button small, .dx-caixa.claro .dx-sim-conta-r small { font-weight: 600; filter: brightness(.8) }
.dx-caixa.claro .dx-sim-conta-i > em { color: #334155 }
.dx-caixa.claro .dx-sim-pill { background: #e2e8f0; color: #334155 }
.dx-caixa.claro .dx-sim-cf { color: #334155 }
.dx-caixa.claro .dx-tab-l small, .dx-caixa.claro .dx-tab-l.cab { color: #334155 } .dx-caixa.claro .dx-tab-l > span:first-child em { color: #334155 } .dx-caixa.claro .dx-tab-l { border-top-color: #e2e8f0 }
.dx-caixa.claro .dx-tab-l .bom { color: #166534 } .dx-caixa.claro .dx-tab-l .ruim { color: #991b1b }
.dx-caixa.claro .dx-ind > div { background: #f8fafc; border-color: #e2e8f0 } .dx-caixa.claro .dx-ind small, .dx-caixa.claro .dx-ind span, .dx-caixa.claro .dx-ind b em { color: #334155 }
.dx-caixa.claro .dx-card-topo small, .dx-caixa.claro .dx-pilha-l small, .dx-caixa.claro .dx-pilha-leg { color: #334155 }
.dx-caixa.claro .dx-alvo > small, .dx-caixa.claro .dx-alvo.meta > small, .dx-caixa.claro .dx-alvo-q em, .dx-caixa.claro .dx-alvo-conta small, .dx-caixa.claro .dx-trilho-leg { color: #334155 }
.dx-caixa.claro .dx-guia li, .dx-caixa.claro .dx-atalhos-d > summary small { color: #334155 }
.dx-caixa.claro .dx-sim-eq-l em.apoio { color: #334155; background: #e2e8f0 } .dx-caixa.claro .dx-sim-eq-l small { color: #334155 }
.dx-caixa.claro .dx-sim-res { background: #eef2f6 }


.dx-atalhos-d { border: 1px solid var(--portal-border, #e2e8f0); border-radius: 12px; background: var(--portal-bg-card, #fefefe) }
.dx-atalhos-d > summary { list-style: none; display: flex; align-items: center; gap: 8px; padding: 9px 14px; font-size: 13.5px; font-weight: 600; color: #0f172a; cursor: pointer } .dx-atalhos-d > summary::-webkit-details-marker { display: none }
.dx-atalhos-d > summary small { font-weight: 400; color: #64748b; font-size: 12.5px } .dx-atalhos-d > summary > i:first-child { color: #7c3aed } .dx-atalhos-d > summary > i:last-child { margin-left: auto; color: #64748b; transition: transform .2s } .dx-atalhos-d[open] > summary > i:last-child { transform: rotate(180deg) }
.dx-atalhos-d > .dx-sim-cen { padding: 0 14px 12px }
.dx-esq-blocos { display: grid; gap: 10px; margin-top: 8px; padding-top: 14px; border-top: 1px dashed var(--portal-border, #e2e8f0) }
.dx-esq-blocos .dx-card .dx-res-t { margin-top: 0 }
.dx-sim-res.claro { gap: 10px }
.dx-card { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 12px; padding: 14px 16px; display: grid; gap: 10px; color: #0f172a }
.dx-card .dx-res-t { margin-top: 0 }
.dx-card-topo { display: grid; gap: 8px }
.dx-card-topo > div { display: grid } .dx-card-topo small { font-size: 13px; color: #475569 } .dx-card-topo strong { font-size: 34px; font-weight: 700; line-height: 1.1; font-variant-numeric: tabular-nums }
.dx-card-topo p { margin: 0; font-size: 15px; color: #1e293b; display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center } .dx-card-topo p b { font-weight: 700 }
.dx-card-dif { justify-self: start; font-size: 13px; font-weight: 600; border-radius: 99px; padding: 2px 10px } .dx-card-dif.bom { color: #14532d; background: #dcfce7 } .dx-card-dif.ruim { color: #7f1d1d; background: #fee2e2 }
.dx-pilha-l { display: grid; gap: 4px } .dx-pilha-l small { font-size: 12.5px; color: #475569 }
.dx-pilha { display: flex; height: 26px; border-radius: 8px; overflow: hidden; background: #f1f5f9 }
.dx-pilha i { display: flex; align-items: center; justify-content: center; min-width: 0; font-style: normal; font-size: 12px; font-weight: 600; color: #fefefe; transition: flex-grow .5s cubic-bezier(.2,.8,.2,1) }
.dx-pilha-leg { display: flex; gap: 16px; flex-wrap: wrap; font-size: 13px; color: #334155 } .dx-pilha-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: -1px }
.dx-tab { display: grid; font-variant-numeric: tabular-nums }
.dx-tab-l { display: grid; grid-template-columns: minmax(0, 1.2fr) 1fr 1fr 1fr; gap: 10px; align-items: center; padding: 8px 4px; border-top: 1px solid #f1f5f9; font-size: 14px }
.dx-tab-l > span:not(:first-child) { text-align: right }
.dx-tab-l > span:first-child { display: flex; align-items: center; gap: 8px } .dx-tab-l > span:first-child em { font-style: normal; width: 10px; color: #64748b } .dx-tab-l > span:first-child i { width: 10px; height: 10px; border-radius: 3px; flex: none }
.dx-tab-l.cab { border-top: 0; font-size: 12.5px; color: #475569; padding-top: 0 }
.dx-tab-l.tot { border-top: 1px solid #cbd5e1; font-weight: 700 }
.dx-tab-l small { font-size: 12.5px; color: #64748b } .dx-tab-l .bom { color: #15803d; font-weight: 600 } .dx-tab-l .ruim { color: #b91c1c; font-weight: 600 }
.dx-ind { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px }
.dx-ind > div { background: #f8fafc; border: 1px solid #eef2f6; border-radius: 10px; padding: 10px 12px; display: grid; gap: 2px }
.dx-ind small { font-size: 13px; color: #475569 } .dx-ind b { font-size: 20px; font-weight: 700; color: #0f172a; font-variant-numeric: tabular-nums } .dx-ind b em { font-style: normal; font-size: 13px; font-weight: 400; color: #475569 } .dx-ind span { font-size: 12.5px; color: #475569 }
/* paleta do modo claro (José, 21/10/2026: "muda a cor, paleta de cor, está muito difícil de ler") */
.dx-caixa.claro .dx-alvos { gap: 4px }
.dx-caixa.claro .dx-alvo { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 12px; padding: 14px 16px; gap: 8px; margin-top: 4px }
.dx-caixa.claro .dx-alvo > small, .dx-caixa.claro .dx-alvo.meta > small { font-size: 13px; font-weight: 500; text-transform: none; letter-spacing: 0; color: #475569 }
.dx-caixa.claro .dx-alvo > small i { color: #475569 }
.dx-caixa.claro .dx-alvo-v { font-size: 26px; font-weight: 700; color: #0f172a }
.dx-caixa.claro .dx-alvo p { font-size: 14px; color: #1e293b }
.dx-caixa.claro .dx-alvo p b, .dx-caixa.claro .dx-alvo-st b { font-weight: 700 }
.dx-caixa.claro .dx-alvo-st { font-size: 14px; font-weight: 500; padding: 8px 12px }
.dx-caixa.claro .dx-alvo-st.bom { color: #14532d; background: #dcfce7 } .dx-caixa.claro .dx-alvo-st.ruim { color: #7f1d1d; background: #fee2e2 }
.dx-caixa.claro .dx-sim-trilho { height: 12px; background: #e2e8f0; margin-top: 4px } .dx-caixa.claro .dx-sim-trilho i { background: #0f766e }
.dx-caixa.claro .dx-sim-trilho em { top: -5px; height: 22px; width: 4px; background: #0f172a; box-shadow: 0 0 0 2px #fefefe }
.dx-trilho-leg { display: flex; flex-wrap: wrap; gap: 6px 18px; font-size: 13px; color: #334155 } .dx-trilho-leg b { color: #0f172a; font-weight: 700 }
.dx-trilho-leg i { display: inline-block; vertical-align: middle; margin-right: 4px } .dx-trilho-leg i.fat { width: 14px; height: 8px; border-radius: 99px; background: #0f766e } .dx-trilho-leg i.emp { width: 4px; height: 14px; border-radius: 2px; background: #0f172a }
.dx-caixa.claro .dx-alvo-q { font-size: 14px; font-weight: 500; color: #0f172a }
.dx-caixa.claro .dx-alvo-q em { font-size: 13px; font-weight: 400; color: #475569 }
.dx-caixa.claro .dx-alvo-q input { border: 1px solid #94a3b8; color: #0f172a; font-weight: 700; height: 32px }
.dx-caixa.claro .dx-alvo-q input:focus { outline: 2px solid #0f766e; outline-offset: 1px; border-color: #0f766e }
.dx-caixa.claro .dx-alvo-conta { background: #f1f5f9; padding: 10px 14px; gap: 8px 14px }
.dx-caixa.claro .dx-alvo-conta small { font-size: 12.5px; font-weight: 500; text-transform: none; color: #475569 }
.dx-caixa.claro .dx-alvo-conta b { font-size: 16px; font-weight: 700; color: #0f172a } .dx-caixa.claro .dx-alvo-conta .sobra b { color: #0f766e }
.dx-caixa.claro .dx-alvo-conta em { font-size: 16px; font-weight: 500; color: #475569 }
.dx-alvo { display: grid; gap: 6px; padding: 12px 2px; border-top: 1px dashed var(--portal-border, #e5e7eb); animation: dxEntra .4s both }
.dx-alvo > small { font-size: 11.5px; font-weight: 900; text-transform: uppercase; letter-spacing: .04em; color: #0369a1 } .dx-alvo.meta > small { color: #dc2626 }
.dx-alvo-v { font-size: 20px; font-weight: 900; color: var(--portal-text, #0f172a); font-variant-numeric: tabular-nums; line-height: 1.1 }
.dx-alvo p { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--portal-text, #334155) }
.dx-alvo-st { font-size: 13px; font-weight: 700; border-radius: 10px; padding: 6px 10px } .dx-alvo-st.bom { color: #047857; background: #ecfdf5 } .dx-alvo-st.ruim { color: #b91c1c; background: #fef2f2 }
.dx-alvo-q { font-size: 14px; font-weight: 800; display: flex; gap: 6px; align-items: center; flex-wrap: wrap } .dx-alvo-q > span { display: inline-flex; align-items: center; gap: 4px } .dx-alvo-q em { font-style: normal; font-size: 12.5px; font-weight: 700; color: ${MUDO}; width: 100% }
.dx-alvo-q input { width: 62px; border: 1px solid #fca5a5; border-radius: 8px; padding: 2px 6px; font-family: inherit; font-size: 15px; font-weight: 900; text-align: center; color: #b91c1c; background: #fefefe }
.dx-alvo-conta { display: flex; gap: 6px 10px; flex-wrap: wrap; align-items: center; background: var(--portal-bg-secondary, #f8fafc); border-radius: 12px; padding: 8px 12px } .dx-alvo-conta span { display: grid } .dx-alvo-conta small { font-size: 11px; font-weight: 800; text-transform: uppercase; color: ${MUDO} } .dx-alvo-conta b { font-size: 14px; font-variant-numeric: tabular-nums } .dx-alvo-conta em { font-style: normal; font-weight: 900; color: ${MUDO} } .dx-alvo-conta .sobra b { color: ${CS.ficou} }
.dx-alvo button { justify-self: start; border: none; background: #0f172a; color: #fefefe; border-radius: 99px; padding: 7px 14px; font-family: inherit; font-size: 13px; font-weight: 800; cursor: pointer }
.dx-sim-meta { display: flex; gap: 10px; align-items: flex-start; border-top: 1px dashed var(--portal-border, #e5e7eb); padding-top: 10px } .dx-sim-meta > i { font-size: 20px; color: #dc2626; margin-top: 2px } .dx-sim-meta > div { flex: 1; display: grid; gap: 5px } .dx-sim-meta span { font-size: 14px; font-weight: 800 } .dx-sim-meta small { font-size: 12.5px; color: ${MUDO} } .dx-sim-meta small b { color: var(--portal-text, #0f172a) }
.dx-sim-meta input { width: 62px; border: 2px solid #dc2626; border-radius: 8px; padding: 2px 6px; font-family: inherit; font-size: 15px; font-weight: 900; text-align: center; color: #b91c1c; background: #fefefe }
.dx-sim-meta button { justify-self: start; border: none; background: #0f172a; color: #fefefe; border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 12.5px; font-weight: 800; cursor: pointer }
.dx-sim-ctrl { display: grid; gap: 14px; align-content: start }
.dx-sim-r { display: grid; gap: 4px } .dx-sim-r > span { font-size: 13.5px; font-weight: 800; color: var(--portal-text, #334155); display: flex; gap: 6px; align-items: center } .dx-sim-r > span i { color: var(--c) } .dx-sim-r > span b { margin-left: auto; color: var(--c); font-size: 15px } .dx-sim-r small { font-size: 12px; color: ${MUDO} }
.dx-sim-r input { -webkit-appearance: none; appearance: none; height: 8px; border-radius: 99px; background: linear-gradient(90deg, var(--c) var(--p), var(--portal-bg-secondary, #e2e8f0) var(--p)); cursor: pointer }
.dx-sim-r input::-webkit-slider-thumb { -webkit-appearance: none; width: 22px; height: 22px; border-radius: 50%; background: #fefefe; border: 3px solid var(--c); box-shadow: 0 2px 6px rgba(0,0,0,.2); transition: transform .15s } .dx-sim-r input::-webkit-slider-thumb:hover { transform: scale(1.15) }
.dx-sim-r input::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fefefe; border: 3px solid var(--c) }
.dx-sim-chk { font-size: 13px; font-weight: 700; color: var(--portal-text, #334155); display: flex; gap: 8px; align-items: center; cursor: pointer }
.dx-sim-zera { justify-self: start; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 5px 12px; font-family: inherit; font-weight: 800; font-size: 12.5px; color: ${MUDO}; cursor: pointer; animation: dxEntra .3s both }
.dx-sim-res { display: grid; gap: 8px; align-content: start; background: var(--portal-bg-secondary, #f8fafc); border-radius: 16px; padding: 16px } .dx-sim-res > small { font-size: 12px; font-weight: 900; text-transform: uppercase; color: ${MUDO} } .dx-sim-res > b { font-size: 36px; font-variant-numeric: tabular-nums; transition: color .3s }
[data-dica] { position: relative }
[data-dica]:hover::after { content: attr(data-dica); position: absolute; left: 50%; bottom: calc(100% + 10px); transform: translateX(-50%); z-index: 50; width: max-content; max-width: 300px; white-space: normal; text-align: left; background: #0f172a; color: #f8fafc; font-size: 12.5px; font-weight: 400; line-height: 1.45; letter-spacing: 0; text-transform: none; padding: 9px 12px; border-radius: 10px; box-shadow: 0 10px 28px rgba(15,23,42,.3); pointer-events: none; animation: dxDica .15s .25s both }
[data-dica]:hover::before { content: ''; position: absolute; left: 50%; bottom: calc(100% + 4px); transform: translateX(-50%); border: 6px solid transparent; border-top-color: #0f172a; z-index: 50; pointer-events: none; animation: dxDica .15s .25s both }
@keyframes dxDica { from { opacity: 0; transform: translate(-50%, 4px) } }
.dx-sim-medidor { position: relative; height: 26px; border-radius: 99px; background: var(--portal-bg-card, #e2e8f0); overflow: visible } .dx-sim-medidor i { display: block; height: 100%; border-radius: 99px; transition: width .4s cubic-bezier(.2,.8,.2,1), background .3s } .dx-sim-medidor span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13.5px; font-weight: 600; color: #0f172a } .dx-sim-medidor.dentro span { justify-content: flex-start; padding-left: 16px; color: #fefefe; text-shadow: 0 1px 2px rgba(0,0,0,.25) }
.dx-sim-empate { display: flex; gap: 10px; align-items: flex-start; border-top: 1px dashed var(--portal-border, #e5e7eb); padding-top: 10px } .dx-sim-empate > i { font-size: 20px; color: #0369a1; margin-top: 2px } .dx-sim-empate > div { flex: 1; display: grid; gap: 4px } .dx-sim-empate b { font-size: 14.5px } .dx-sim-empate small { font-size: 12.5px; color: ${MUDO} }
.dx-sim-trilho { position: relative; height: 10px; border-radius: 99px; background: var(--portal-bg-card, #e2e8f0) } .dx-sim-trilho i { display: block; height: 100%; border-radius: 99px; background: #0369a1; transition: width .4s } .dx-sim-trilho em { position: absolute; top: -4px; width: 3px; height: 18px; background: #0f172a; border-radius: 2px; transition: left .4s }
.dx-bal { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; align-items: center } @media (max-width: 800px) { .dx-bal { grid-template-columns: 1fr } }
.dx-bal-cena { position: relative; height: 260px }
.dx-bal-viga { position: absolute; left: 6%; right: 6%; top: 60px; height: 8px; border-radius: 99px; background: #334155; transform-origin: 50% 50%; transition: transform .8s cubic-bezier(.3,1.4,.5,1) }
.dx-bal-prato { position: absolute; top: 8px; width: 34%; display: grid; justify-items: center; gap: 2px; transform-origin: 50% 0; transition: transform .8s cubic-bezier(.3,1.4,.5,1) } .dx-bal-prato.e { left: -4% } .dx-bal-prato.s { right: -4% }
.dx-bal-prato::before { content: ''; width: 2px; height: 26px; background: #94a3b8 }
.dx-bal-pilha { width: 100%; height: 90px; display: flex; flex-direction: column-reverse; border-radius: 0 0 40px 40px; overflow: hidden; border: 3px solid #334155; border-top: none; background: var(--portal-bg-secondary, #f8fafc) } .dx-bal-pilha i { display: block; flex-basis: 0; transition: flex-grow .5s }
.dx-bal-prato small { font-size: 11.5px; font-weight: 900; text-transform: uppercase; color: ${MUDO}; margin-top: 4px } .dx-bal-prato b { font-size: 17px; font-variant-numeric: tabular-nums }
.dx-bal-pe { position: absolute; left: 50%; top: 64px; bottom: 0; width: 70px; transform: translateX(-50%); clip-path: polygon(45% 0, 55% 0, 100% 100%, 0 100%); background: linear-gradient(#475569, #1e293b) }
.dx-bal-lado { display: grid; gap: 8px } .dx-bal-lado > small { font-size: 12.5px; font-weight: 900; color: ${MUDO} }
.dx-bal-peso { display: flex; gap: 10px; align-items: center; border: 1px solid var(--portal-border, #e5e7eb); border-left: 5px solid var(--c); background: var(--portal-bg-card, #fefefe); border-radius: 12px; padding: 8px 12px; font-family: inherit; cursor: pointer; text-align: left; transition: opacity .2s } .dx-bal-peso:not(.on) { opacity: .5 } .dx-bal-peso b { flex: 1; font-size: 14px } .dx-bal-peso strong { font-variant-numeric: tabular-nums }
.dx-bal-chave { width: 34px; height: 20px; border-radius: 99px; background: #cbd5e1; position: relative; transition: background .25s } .dx-bal-chave i { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fefefe; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform .25s cubic-bezier(.3,1.5,.5,1) } .dx-bal-peso.on .dx-bal-chave { background: var(--c) } .dx-bal-peso.on .dx-bal-chave i { transform: translateX(14px) }
.dx-bal-res { border-radius: 14px; padding: 10px 14px; display: grid } .dx-bal-res.bom { background: #ecfdf5; color: #047857 } .dx-bal-res.ruim { background: #fef2f2; color: #b91c1c } .dx-bal-res small { font-size: 12px; font-weight: 900; text-transform: uppercase } .dx-bal-res b { font-size: 28px; font-variant-numeric: tabular-nums } .dx-bal-res span { font-size: 12.5px; font-weight: 700 }
.dx-rio { position: relative; height: 340px } .dx-rio svg { position: absolute; inset: 10px 0; width: 100%; height: calc(100% - 20px); overflow: visible }
.dx-rio-f { animation: dxEntra .8s both } .dx-rio-gota { animation: dxCorre 2.4s linear infinite } @keyframes dxCorre { to { stroke-dashoffset: -96 } }
.dx-rio-no { cursor: pointer; animation: dxPop .4s both }
.dx-rio-rot { position: absolute; top: 10px; bottom: 10px; width: 16% } .dx-rio-rot.e { left: 0 } .dx-rio-rot.s { right: 0 }
.dx-rio-rot button { position: absolute; transform: translateY(-50%); display: grid; border: none; background: transparent; font-family: inherit; cursor: pointer; padding: 2px 4px; border-radius: 8px; transition: background .2s } .dx-rio-rot.e button { right: 6px; text-align: right } .dx-rio-rot.s button { left: 6px; text-align: left }
.dx-rio-rot button b { font-size: 15px; color: var(--c); font-variant-numeric: tabular-nums } .dx-rio-rot button small { font-size: 11.5px; font-weight: 800; color: ${MUDO} } .dx-rio-rot button.on { background: var(--portal-bg-secondary, #f1f5f9) }
.dx-rio-dica { min-height: 24px; display: flex; gap: 6px 14px; flex-wrap: wrap; align-items: center; font-size: 13.5px; color: var(--portal-text, #334155) } .dx-rio-dica span { display: inline-flex; gap: 6px; align-items: center } .dx-rio-dica span i { width: 10px; height: 10px; border-radius: 3px }
.dx-hist { display: flex; gap: 8px; height: 220px; align-items: stretch }
.dx-hc { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; border: 1px solid transparent; background: transparent; border-radius: 12px; padding: 6px 2px; font-family: inherit; cursor: pointer; transition: background .2s } .dx-hc:hover { background: var(--portal-bg-secondary, #f8fafc) } .dx-hc.on { background: var(--portal-bg-secondary, #f1f5f9); border-color: var(--portal-border, #e2e8f0) }
.dx-hc em { font-style: normal; font-size: 13px; font-weight: 900; border-radius: 99px; padding: 0 8px } .dx-hc em.bom { color: #047857; background: #ecfdf5 } .dx-hc em.ruim { color: #b91c1c; background: #fef2f2 }
.dx-hc-par { flex: 1; width: 100%; display: flex; gap: 4px; align-items: flex-end; justify-content: center }
.dx-hc-par > i, .dx-hc-par > span { width: 36%; max-width: 30px; border-radius: 6px 6px 0 0; transform-origin: bottom; animation: dxSobe .7s cubic-bezier(.2,.8,.2,1) both } .dx-hc-par > i { background: #0369a1 } .dx-hc-par > span { display: flex; flex-direction: column-reverse; overflow: hidden } .dx-hc-par > span i { flex-basis: 0; display: block }
.dx-hc.on .dx-hc-par > i { box-shadow: 0 0 14px rgba(3,105,161,.45) }
.dx-hc small { font-size: 11.5px; font-weight: 800; color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; text-transform: capitalize } .dx-hc.on small { color: var(--portal-text, #0f172a) }
.dx-hist-conta { display: flex; gap: 8px 12px; flex-wrap: wrap; align-items: baseline; background: var(--portal-bg-secondary, #f8fafc); border-radius: 14px; padding: 12px 16px; animation: dxEntra .35s both } .dx-hist-conta > b { font-size: 15px; text-transform: capitalize; margin-right: 6px } .dx-hist-conta span { font-size: 13px; color: ${MUDO} } .dx-hist-conta strong { font-size: 17px; font-variant-numeric: tabular-nums; margin-left: 4px } .dx-hist-conta em { font-style: normal; font-weight: 900; color: ${MUDO} }
`
