'use client'
// "Destaques que giram" (José escolheu na página de teste, 17/10/2026: "gostei desse se mudar as infos
// e adicionar mais informações em cada card, também colocar títulos para o usuário entender").
// Cartões que se trocam sozinhos a cada 7 s; cada um tem TÍTULO, uma linha dizendo O QUE MOSTRA,
// o número principal, a comparação e os detalhes (lista ou minigráfico). Passar o mouse pausa.
import { useEffect, useMemo, useState } from 'react'

const MUDO = 'var(--portal-text-muted, #64748b)'
const TEMPO = 7000
const SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
function somaDias(d: string, n: number) { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
function diaSem(d: string) { return new Date(`${d}T12:00:00Z`).getUTCDay() }
function ultimoDia(a: number, m: number) { return new Date(Date.UTC(a, m, 0)).getUTCDate() }
function br(d: string) { return `${d.slice(8)}/${d.slice(5, 7)}` }
import type { OSFaturada } from '@/lib/mecanicos/painel'
import { MESES, somar, type Ritmo } from '@/lib/mecanicos/fita'
import type { Soma } from './FaturamentoVivo'
import { brl, horas, Numero } from './ui'
import DetalheDestaque from './DetalheDestaque'

export type PorDia = Record<string, [number, number, number]>
export interface Bloco { chave: 'dia' | 'semana' | 'mes'; titulo: string; s: Soma; ritmo?: Ritmo; antesNome: string; serie: number[]; serieRot: string[] }

/** Hoje / semana / mês com as séries (14 dias · 8 semanas · 6 meses) a partir do ao vivo + dia a dia. */
export function montarBlocos(d: { hoje: string; dia: Soma; semana: Soma; mes: Soma }, porDia: PorDia, ritmo: { dia: Ritmo; semana: Ritmo; mes: Ritmo }): Bloco[] {
  const hoje = d.hoje, [a, m] = hoje.split('-').map(Number)
  const dias = Array.from({ length: 14 }, (_, i) => somaDias(hoje, i - 13))
  const seg = somaDias(hoje, -((diaSem(hoje) + 6) % 7))
  const semanas = Array.from({ length: 8 }, (_, i) => somaDias(seg, (i - 7) * 7))
  const meses = Array.from({ length: 6 }, (_, i) => { const mm = m - 5 + i, y = a + Math.floor((mm - 1) / 12), mes = ((mm - 1) % 12 + 12) % 12 + 1; return `${y}-${String(mes).padStart(2, '0')}` })
  return [
    { chave: 'dia', titulo: 'Hoje', s: d.dia, ritmo: ritmo.dia, antesNome: 'o mesmo dia da semana passada', serie: dias.map((x) => porDia[x]?.[0] || 0), serieRot: [br(dias[0]), 'hoje'] },
    { chave: 'semana', titulo: 'Esta semana', s: d.semana, ritmo: ritmo.semana, antesNome: 'a semana passada', serie: semanas.map((x) => somar(porDia, x, somaDias(x, 6)).bruto), serieRot: ['8 semanas atrás', 'esta'] },
    { chave: 'mes', titulo: 'Este mês', s: d.mes, ritmo: ritmo.mes, antesNome: MESES[(m + 10) % 12], serie: meses.map((x) => somar(porDia, `${x}-01`, `${x}-31`).bruto), serieRot: [MESES[Number(meses[0].slice(5)) - 1].slice(0, 3), MESES[m - 1].slice(0, 3)] },
  ]
}

const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null)

function Var({ a, b, txt }: { a: number; b: number; txt: string }) {
  const p = pct(a, b)
  if (p == null) return <span className="dg-var neutro">sem comparação {txt}</span>
  return <span className={`dg-var ${p >= 0 ? 'sobe' : 'desce'}`}>{p >= 0 ? '▲' : '▼'} {Math.abs(p)}% {txt}</span>
}

/** Barrinhas comparando dois conjuntos (agora × antes) — usadas nos cartões de dia e semana. */
function Barrinhas({ itens }: { itens: { rot: string; a: number; b: number; destaque?: boolean }[] }) {
  const max = Math.max(1, ...itens.flatMap((x) => [x.a, x.b]))
  return (
    <div className="dg-barras">
      {itens.map((x, i) => (
        <div key={i} className={`dg-bcol ${x.destaque ? 'on' : ''}`} title={`${x.rot}: ${brl(x.a)} (antes ${brl(x.b)})`}>
          <div className="dg-bpar">
            <i className="b" style={{ height: `${(x.b / max) * 100}%` }} />
            <i className="a" style={{ height: `${(x.a / max) * 100}%`, animationDelay: `${200 + i * 60}ms` }} />
          </div>
          <small>{x.rot}</small>
        </div>
      ))}
    </div>
  )
}

/** Lista de linhas com barra (ranking). */
function Ranking({ itens, max }: { itens: { nome: string; sub?: string; valor: number; extra?: string }[]; max: number }) {
  return (
    <div className="dg-rank">
      {itens.map((x, i) => (
        <div key={x.nome + i} className="dg-rl" style={{ animationDelay: `${150 + i * 90}ms` }}>
          <span className="dg-pos">{i + 1}</span>
          <div className="dg-rmeio">
            <div className="dg-rtopo"><b>{x.nome}</b><span>{brl(x.valor)}</span></div>
            {x.sub && <small>{x.sub}</small>}
            <span className="dg-rbar"><i style={{ width: `${(x.valor / Math.max(1, max)) * 100}%`, animationDelay: `${300 + i * 90}ms` }} /></span>
          </div>
          {x.extra && <em>{x.extra}</em>}
        </div>
      ))}
    </div>
  )
}

interface Cartao { chave: string; icone: string; cor: string; titulo: string; explica: string; valor: React.ReactNode; legenda?: React.ReactNode; comp?: React.ReactNode; corpo: React.ReactNode; rodape?: React.ReactNode }

export default function DestaquesGiram({ blocos, faturadas, porDia, hoje }: { blocos: Bloco[]; faturadas: OSFaturada[]; porDia: PorDia; hoje: string }) {
  const cartoes = useMemo<Cartao[]>(() => {
    const [dia, semana, mes] = blocos
    const [a, m] = hoje.split('-').map(Number)
    const pa = m === 1 ? a - 1 : a, pm = m === 1 ? 12 : m - 1
    const nomeMes = MESES[m - 1], nomeAnt = MESES[pm - 1]
    const ini = `${hoje.slice(0, 8)}01`
    const doMes = faturadas.filter((o) => o.data >= ini && o.data <= hoje)
    const deHoje = faturadas.filter((o) => o.data === hoje).sort((x, y) => y.bruto - x.bruto)
    const out: Cartao[] = []

    // 1. hoje
    const ult7 = Array.from({ length: 7 }, (_, i) => somaDias(hoje, i - 6))
    out.push({
      chave: 'hoje', icone: 'fa-sun', cor: '#f59e0b', titulo: 'Hoje', explica: 'O que já foi faturado hoje, comparado com o mesmo dia da semana passada.',
      valor: <Numero valor={dia.s.bruto} formato={brl} />, legenda: `${dia.s.os} OS · ${horas(dia.s.horas)} cobradas`,
      comp: <Var a={dia.s.bruto} b={dia.ritmo?.anterior || 0} txt={`vs ${SEM[diaSem(hoje)]} passada (${brl(dia.ritmo?.anterior || 0)})`} />,
      corpo: deHoje.length
        ? <Ranking itens={deHoje.slice(0, 3).map((o) => ({ nome: o.os, sub: `${o.cliente || 'Omie'} · ${o.tecnicos.join(' + ') || 'sem técnico'}`, valor: o.bruto }))} max={deHoje[0].bruto} />
        : <><small className="dg-sub">Últimos 7 dias (azul = este, cinza = semana anterior):</small><Barrinhas itens={ult7.map((d) => ({ rot: SEM[diaSem(d)], a: porDia[d]?.[0] || 0, b: porDia[somaDias(d, -7)]?.[0] || 0, destaque: d === hoje }))} /></>,
      rodape: deHoje.length ? <>As OS faturadas hoje, da maior para a menor.</> : <>Nenhuma OS faturada hoje ainda.</>,
    })

    // 2. semana
    const seg = somaDias(hoje, -((diaSem(hoje) + 6) % 7))
    const semDias = Array.from({ length: 7 }, (_, i) => somaDias(seg, i))
    out.push({
      chave: 'semana', icone: 'fa-calendar-week', cor: '#2563eb', titulo: 'Esta semana', explica: 'Faturado de segunda até hoje, dia por dia, contra a semana passada.',
      valor: <Numero valor={semana.s.bruto} formato={brl} />, legenda: `${semana.s.os} OS · ticket ${brl(semana.s.os ? semana.s.bruto / semana.s.os : 0)}`,
      comp: <Var a={semana.s.bruto} b={semana.ritmo?.anterior || 0} txt={`vs mesmo trecho da semana passada (${brl(semana.ritmo?.anterior || 0)})`} />,
      corpo: <Barrinhas itens={semDias.map((d) => ({ rot: SEM[diaSem(d)], a: d <= hoje ? porDia[d]?.[0] || 0 : 0, b: porDia[somaDias(d, -7)]?.[0] || 0, destaque: d === hoje }))} />,
      rodape: <>Semana passada inteira: <b>{brl(semana.ritmo?.anteriorCheio || 0)}</b> · azul = esta semana, cinza = semana passada.</>,
    })

    // 3. mês
    const fim = `${hoje.slice(0, 8)}${String(ultimoDia(a, m)).padStart(2, '0')}`
    let passados = 0, restantes = 0
    for (let d = ini; d <= fim; d = somaDias(d, 1)) { const w = diaSem(d); if (w >= 1 && w <= 5) { if (d <= hoje) passados++; else restantes++ } }
    const cheio = mes.ritmo?.anteriorCheio || 0
    const fez = cheio ? Math.round((mes.s.bruto / cheio) * 100) : 0
    out.push({
      chave: 'mes', icone: 'fa-calendar', cor: '#8b5cf6', titulo: `Este mês (${nomeMes})`, explica: `Quanto já entrou no mês e quanto isso representa de ${nomeAnt} inteiro.`,
      valor: <Numero valor={mes.s.bruto} formato={brl} />, legenda: `${mes.s.os} OS · ${passados} dias úteis passados · ${restantes} restantes`,
      comp: <Var a={mes.s.bruto} b={mes.ritmo?.anterior || 0} txt={`vs ${nomeAnt} no mesmo ponto (${brl(mes.ritmo?.anterior || 0)})`} />,
      corpo: (
        <div className="dg-meta">
          <div className="dg-meta-top"><span>já fez <b>{fez}%</b> de {nomeAnt} inteiro</span><span>{brl(cheio)}</span></div>
          <span className="dg-meta-barra"><i style={{ width: `${Math.min(100, fez)}%` }} />{fez > 100 && <i className="extra" style={{ width: `${Math.min(100, fez - 100)}%` }} />}</span>
          <div className="dg-linhas">
            <div><span>Ritmo de agora</span><b>{brl(passados ? mes.s.bruto / passados : 0)} / dia útil</b></div>
            <div><span>Para empatar com {nomeAnt}</span><b>{cheio > mes.s.bruto && restantes ? `${brl((cheio - mes.s.bruto) / restantes)} / dia útil` : 'já passou'}</b></div>
          </div>
        </div>
      ),
    })

    // 4. projeção
    if (mes.ritmo?.projecao != null) {
      const proj = mes.ritmo.projecao
      out.push({
        chave: 'proj', icone: 'fa-bullseye', cor: '#0ea5e9', titulo: 'Previsão de fechamento', explica: `Como o mês deve terminar se o ritmo dos dias úteis continuar igual.`,
        valor: <Numero valor={proj} formato={brl} />, legenda: `ritmo de ${brl(passados ? mes.s.bruto / passados : 0)} por dia útil × ${passados + restantes} dias úteis`,
        comp: <Var a={proj} b={cheio} txt={`vs ${nomeAnt} inteiro (${brl(cheio)})`} />,
        corpo: (
          <div className="dg-linhas">
            <div><span>Já entrou</span><b>{brl(mes.s.bruto)}</b></div>
            <div><span>Ainda deve entrar</span><b>{brl(Math.max(0, proj - mes.s.bruto))}</b></div>
            <div><span>{nomeAnt} inteiro</span><b>{brl(cheio)}</b></div>
            <div><span>Diferença prevista</span><b style={{ color: proj >= cheio ? '#047857' : '#b91c1c' }}>{proj >= cheio ? '+' : '−'}{brl(Math.abs(proj - cheio))}</b></div>
          </div>
        ),
      })
    }

    // 5. técnicos
    const tec: Record<string, { v: number; os: number; h: number }> = {}
    for (const o of doMes) { const ts = o.tecnicos.length ? o.tecnicos : ['Sem técnico']; for (const t of ts) { const x = (tec[t] ||= { v: 0, os: 0, h: 0 }); x.v += o.bruto / ts.length; x.os += 1 / ts.length; x.h += o.horasCobradas / ts.length } }
    const rank = Object.entries(tec).sort((x, y) => y[1].v - x[1].v)
    if (rank.length) out.push({
      chave: 'tec', icone: 'fa-crown', cor: '#eab308', titulo: 'Quem mais faturou no mês', explica: 'Ranking dos técnicos pelo valor das OS faturadas (OS dividida entre quem fez).',
      valor: rank[0][0], legenda: `${brl(rank[0][1].v)} · ${Math.round((rank[0][1].v / Math.max(1, mes.s.bruto)) * 100)}% do mês · ${Math.round(rank[0][1].os * 10) / 10} OS`,
      corpo: <Ranking itens={rank.slice(0, 4).map(([n, x]) => ({ nome: n, sub: `${Math.round(x.os * 10) / 10} OS · ${horas(x.h)}`, valor: x.v, extra: `${Math.round((x.v / Math.max(1, mes.s.bruto)) * 100)}%` }))} max={rank[0][1].v} />,
    })

    // 6. maiores OS
    const maiores = [...doMes].sort((x, y) => y.bruto - x.bruto)
    if (maiores.length) out.push({
      chave: 'os', icone: 'fa-trophy', cor: '#a855f7', titulo: 'Maiores OS do mês', explica: 'As ordens de serviço de maior valor faturadas no mês.',
      valor: <Numero valor={maiores[0].bruto} formato={brl} />, legenda: `${maiores[0].os} · ${maiores[0].cliente || 'Omie'}`,
      corpo: <Ranking itens={maiores.slice(0, 4).map((o) => ({ nome: o.os, sub: `${(o.cliente || 'Omie').slice(0, 34)} · ${o.tecnicos.join(' + ') || 'sem técnico'} · ${br(o.data)}`, valor: o.bruto }))} max={maiores[0].bruto} />,
      rodape: <>Ticket médio do mês: <b>{brl(mes.s.os ? mes.s.bruto / mes.s.os : 0)}</b></>,
    })

    // 7. melhores dias
    const dias = Object.entries(porDia).filter(([d]) => d >= ini && d <= hoje && porDia[d][0] > 0).sort((x, y) => y[1][0] - x[1][0])
    if (dias.length) out.push({
      chave: 'dias', icone: 'fa-fire', cor: '#ef4444', titulo: 'Melhores dias do mês', explica: 'Os dias em que mais se faturou no mês.',
      valor: `${SEM[diaSem(dias[0][0])]} ${br(dias[0][0])}`, legenda: `${brl(dias[0][1][0])} em ${dias[0][1][2]} OS`,
      corpo: <Ranking itens={dias.slice(0, 4).map(([d, v]) => ({ nome: `${SEM[diaSem(d)]} ${br(d)}`, sub: `${v[2]} OS · ${horas(v[1])}`, valor: v[0] }))} max={dias[0][1][0]} />,
      rodape: <>Dias com faturamento: <b>{dias.length}</b> · média por dia com faturamento: <b>{brl(dias.reduce((s, [, v]) => s + v[0], 0) / dias.length)}</b></>,
    })

    // 8. de onde veio
    const tot = Math.max(1, mes.s.bruto)
    const partes: [string, number, string][] = [['Mão de obra', mes.s.servico, '#2563eb'], ['Deslocamento', mes.s.kmValor, '#10b981'], ['Peças', mes.s.pecas, '#f59e0b'], ['Outros', Math.max(0, mes.s.outros), '#94a3b8']]
    out.push({
      chave: 'fonte', icone: 'fa-chart-pie', cor: '#06b6d4', titulo: 'De onde veio o dinheiro do mês', explica: 'O faturado do mês dividido pelo que foi cobrado em cada OS.',
      valor: `${Math.round((mes.s.servico / tot) * 100)}% mão de obra`, legenda: `${horas(mes.s.horas)} cobradas · ${Math.round(mes.s.km).toLocaleString('pt-BR')} km`,
      corpo: (
        <div className="dg-fonte">
          <span className="dg-fbarra">{partes.map(([r, v, c], i) => v > 0 ? <i key={r} style={{ width: `${(v / tot) * 100}%`, background: c, animationDelay: `${200 + i * 120}ms` }} /> : null)}</span>
          <div className="dg-linhas">
            {partes.map(([r, v, c]) => <div key={r}><span><i style={{ background: c }} />{r}</span><b>{brl(v)} <small>{Math.round((v / tot) * 100)}%</small></b></div>)}
            <div className="dg-sep"><span>Terceiros (requisições não cobradas)</span><b style={{ color: '#b91c1c' }}>−{brl(mes.s.custo)}</b></div>
            <div><span>Sobra depois dos terceiros</span><b style={{ color: '#047857' }}>{brl(mes.s.liquido)}</b></div>
          </div>
        </div>
      ),
    })

    // 9. ritmo de OS
    const nAnt = Number(hoje.slice(8, 10))
    const fimAnt = `${pa}-${String(pm).padStart(2, '0')}-${String(Math.min(nAnt, ultimoDia(pa, pm))).padStart(2, '0')}`
    const osAnt = faturadas.filter((o) => o.data >= `${fimAnt.slice(0, 8)}01` && o.data <= fimAnt)
    const ticketAnt = osAnt.length ? osAnt.reduce((s, o) => s + o.bruto, 0) / osAnt.length : 0
    const ticket = mes.s.os ? mes.s.bruto / mes.s.os : 0
    out.push({
      chave: 'qtd', icone: 'fa-file-invoice-dollar', cor: '#10b981', titulo: 'Quantidade e valor das OS', explica: `Estamos fazendo mais OS ou OS maiores do que em ${nomeAnt}? (mesmo ponto do mês)`,
      valor: `${mes.s.os} OS`, legenda: `ticket médio ${brl(ticket)}`,
      corpo: (
        <div className="dg-linhas">
          <div><span>OS faturadas</span><b>{mes.s.os} <small>({nomeAnt}: {osAnt.length})</small></b></div>
          <div><span>Ticket médio</span><b>{brl(ticket)} <small>({nomeAnt}: {brl(ticketAnt)})</small></b></div>
          <div><span>OS por dia útil</span><b>{passados ? (mes.s.os / passados).toFixed(1).replace('.', ',') : '0'}</b></div>
          <div><span>Horas cobradas por OS</span><b>{mes.s.os ? horas(mes.s.horas / mes.s.os) : '—'}</b></div>
        </div>
      ),
      comp: <Var a={mes.s.os} b={osAnt.length} txt={`em quantidade de OS`} />,
    })
    return out
  }, [blocos, faturadas, porDia, hoje])

  const [i, setI] = useState(0)
  const [pausaMouse, setPausa] = useState(false)
  // clique no cartão da vez abre o detalhe completo (e para de girar enquanto estiver aberto)
  const [aberto, setAberto] = useState<string | null>(null)
  const pausa = pausaMouse || aberto != null
  useEffect(() => { if (pausa) return; const t = setTimeout(() => setI((x) => (x + 1) % cartoes.length), TEMPO); return () => clearTimeout(t) }, [i, cartoes.length, pausa])
  const ir = (n: number) => setI((x) => (x + n + cartoes.length) % cartoes.length)

  return (
    <div className="dg" onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)}>
      <style>{ESTILO_DG}</style>
      <div className="dg-palco">
        <button type="button" className="dg-seta esq" onClick={() => ir(-1)} aria-label="Anterior"><i className="fas fa-chevron-left" /></button>
        {cartoes.map((c, k) => {
          const pos = (k - i + cartoes.length) % cartoes.length
          const cls = pos === 0 ? 'atual' : pos === 1 ? 'prox' : pos === cartoes.length - 1 ? 'ant' : 'fora'
          return (
            <div key={c.chave} className={`dg-c ${cls}`} style={{ ['--c' as string]: c.cor }} onClick={() => (pos === 0 ? setAberto(c.chave) : setI(k))} title={pos === 0 ? 'Clique para ver o detalhe completo' : undefined}>
              {pos === 0 && <><span className="dg-luz" /><span className="dg-brilho" /></>}
              <div className="dg-c-cab">
                <span className="dg-ic"><i className={`fas ${c.icone}`} /></span>
                <div><b className="dg-tit">{c.titulo}</b><small className="dg-exp">{c.explica}</small></div>
                <span className="dg-n">{k + 1}/{cartoes.length}</span>
              </div>
              <div className="dg-c-meio">
                <div className="dg-principal" key={pos === 0 ? `on-${i}` : 'off'}>
                  <b className="dg-valor">{pos === 0 ? c.valor : null}</b>
                  {c.legenda && <span className="dg-legenda">{c.legenda}</span>}
                  {c.comp}
                </div>
                <div className="dg-corpo">{pos === 0 ? c.corpo : null}</div>
              </div>
              <div className="dg-rodape">{c.rodape}{c.rodape ? ' · ' : ''}<span className="dg-detalhe"><i className="fas fa-magnifying-glass-plus" /> clique para ver o detalhe completo e as OS</span></div>
            </div>
          )
        })}
        <button type="button" className="dg-seta dir" onClick={() => ir(1)} aria-label="Próximo"><i className="fas fa-chevron-right" /></button>
      </div>
      {/* trilho: um ícone por cartão; o da vez se abre com o nome e enche de cor até o próximo */}
      <div className="dg-nav">
        <span className="dg-trilho" />
        {cartoes.map((c, k) => (
          <button key={c.chave} type="button" className={`${k === i ? 'on' : ''} ${k < i ? 'visto' : ''}`} style={{ ['--c' as string]: c.cor }} onClick={() => setI(k)} aria-label={c.titulo}>
            {k === i && <span className={`dg-enche ${pausa ? 'parado' : ''}`} key={`e${i}-${pausa}`} />}
            <span className="dg-bola"><i className={`fas ${c.icone}`} /></span>
            <span className="dg-nome">{c.titulo}</span>
            {k !== i && <span className="dg-dica">{c.titulo}</span>}
          </button>
        ))}
      </div>
      {pausaMouse && !aberto && <div className="dg-pausa"><i className="fas fa-pause" /> pausado enquanto o mouse está em cima</div>}
      {aberto && <DetalheDestaque chave={aberto} blocos={blocos} faturadas={faturadas} porDia={porDia} hoje={hoje} onFechar={() => setAberto(null)} />}
    </div>
  )
}

const ESTILO_DG = `
.dg { position: relative; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 16px; overflow: hidden }
.dg-palco { position: relative; height: 330px; perspective: 1200px }
.dg-c { --c: #2563eb; position: absolute; top: 0; left: 50%; width: min(620px, 86%); height: 320px; margin-left: calc(min(620px, 86%) / -2); border-radius: 20px; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; background: linear-gradient(150deg, color-mix(in srgb, var(--c) 12%, var(--portal-bg-card, #fefefe)), var(--portal-bg-card, #fefefe) 65%); border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); box-shadow: 0 16px 36px rgba(15,23,42,.12); transition: transform .8s cubic-bezier(.2,.8,.2,1), opacity .8s, filter .8s; cursor: pointer; overflow: hidden }
.dg-c.atual { transform: none; opacity: 1; z-index: 3; cursor: default }
.dg-c.prox { transform: translateX(64%) scale(.78) rotateY(-22deg); opacity: .5; z-index: 2; filter: blur(.5px) }
.dg-c.ant { transform: translateX(-64%) scale(.78) rotateY(22deg); opacity: .5; z-index: 2; filter: blur(.5px) }
.dg-c.fora { transform: scale(.55); opacity: 0; z-index: 1; pointer-events: none }
.dg-c-cab { position: relative; z-index: 1; display: flex; gap: 12px; align-items: flex-start }
.dg-c-meio, .dg-rodape { position: relative; z-index: 1 }
/* borda de luz girando em volta do cartão da vez */
.dg-luz { position: absolute; inset: -2px; border-radius: 22px; padding: 2px; background: conic-gradient(from var(--ang, 0deg), transparent 0 70%, var(--c) 82%, #fefefe 88%, transparent 96%); -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor; mask-composite: exclude; animation: dgGiraLuz 4s linear infinite; pointer-events: none; z-index: 2 }
@property --ang { syntax: '<angle>'; inherits: false; initial-value: 0deg }
@keyframes dgGiraLuz { to { --ang: 360deg } }
/* brilho que atravessa o cartão de tempos em tempos */
.dg-brilho { position: absolute; inset: 0; pointer-events: none; z-index: 2; background: linear-gradient(110deg, transparent 35%, rgba(255,255,255,.55) 48%, transparent 60%); background-size: 260% 100%; animation: dgBrilho 4.5s 1s ease-in-out infinite }
@keyframes dgBrilho { 0% { background-position: 160% 0 } 40%, 100% { background-position: -100% 0 } }
.dg-c.atual .dg-ic { animation: dgPula .6s .2s cubic-bezier(.2,1.6,.4,1) both, dgIcone 3s 1s ease-in-out infinite }
@keyframes dgIcone { 50% { transform: translateY(-4px) rotate(-6deg) } }
.dg-c.atual .dg-principal > * { animation: dgSobeTxt .55s cubic-bezier(.2,.8,.2,1) both }
.dg-c.atual .dg-principal > *:nth-child(2) { animation-delay: .12s } .dg-c.atual .dg-principal > *:nth-child(3) { animation-delay: .24s }
@keyframes dgSobeTxt { from { opacity: 0; transform: translateY(12px) } }
.dg-c.atual .dg-valor { text-shadow: 0 0 0 transparent; animation: dgSobeTxt .55s both, dgValor 3s 1.2s ease-in-out infinite }
@keyframes dgValor { 50% { text-shadow: 0 0 18px color-mix(in srgb, var(--c) 45%, transparent) } }
.dg-c.atual:hover { transform: translateY(-3px) }
.dg-ic { width: 42px; height: 42px; border-radius: 13px; background: var(--c); color: #fefefe; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; box-shadow: 0 6px 16px color-mix(in srgb, var(--c) 45%, transparent) }
.dg-c.atual .dg-ic { animation: dgPula .6s .2s cubic-bezier(.2,1.6,.4,1) both } @keyframes dgPula { from { transform: scale(.4) rotate(-20deg) } }
.dg-tit { display: block; font-size: 17px; font-weight: 900; color: var(--portal-text, #0f172a) }
.dg-exp { display: block; font-size: 12.5px; color: ${MUDO}; margin-top: 2px }
.dg-n { margin-left: auto; font-size: 11.5px; font-weight: 800; color: ${MUDO}; white-space: nowrap }
.dg-c-meio { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); gap: 16px; flex: 1; min-height: 0 }
.dg-principal { display: flex; flex-direction: column; gap: 6px; justify-content: center }
.dg-valor { font-size: 30px; font-weight: 900; color: var(--portal-text, #0f172a); line-height: 1.1; font-variant-numeric: tabular-nums }
.dg-legenda { font-size: 13px; color: ${MUDO} }
.dg-var { align-self: flex-start; font-size: 12.5px; font-weight: 800; border-radius: 99px; padding: 3px 10px }
.dg-var.sobe { color: #047857; background: #ecfdf5 } .dg-var.desce { color: #b91c1c; background: #fef2f2 } .dg-var.neutro { color: ${MUDO}; background: var(--portal-bg-secondary, #f1f5f9) }
.dg-corpo { min-width: 0; display: flex; flex-direction: column; justify-content: center; animation: dgEntra .6s .25s both } @keyframes dgEntra { from { opacity: 0; transform: translateX(16px) } }
.dg-sub { font-size: 11.5px; color: ${MUDO}; margin-bottom: 4px }
.dg-rodape { font-size: 12.5px; color: ${MUDO}; border-top: 1px dashed var(--portal-border, #e5e7eb); padding-top: 8px } .dg-rodape b { color: var(--portal-text, #0f172a) }
.dg-barras { display: flex; gap: 6px; height: 140px; align-items: flex-end }
.dg-bcol { flex: 1; height: 100%; display: flex; flex-direction: column; align-items: center; gap: 4px } .dg-bcol small { font-size: 11px; color: ${MUDO}; font-weight: 700 } .dg-bcol.on small { color: var(--c); font-weight: 900 }
.dg-bpar { flex: 1; width: 100%; display: flex; align-items: flex-end; justify-content: center; gap: 3px }
.dg-bpar i { width: 40%; border-radius: 5px 5px 0 0; transform-origin: bottom; animation: dgSobe .8s cubic-bezier(.2,.8,.2,1) both } .dg-bpar .b { background: #cbd5e1 } .dg-bpar .a { background: var(--c) }
@keyframes dgSobe { from { transform: scaleY(0) } }
.dg-rank { display: grid; gap: 8px }
.dg-rl { display: flex; gap: 8px; align-items: center; animation: dgEntra .5s both }
.dg-pos { width: 22px; height: 22px; border-radius: 50%; background: var(--c); color: #fefefe; font-size: 11px; font-weight: 900; display: flex; align-items: center; justify-content: center; flex-shrink: 0 }
.dg-rmeio { flex: 1; min-width: 0; display: grid; gap: 2px } .dg-rtopo { display: flex; justify-content: space-between; gap: 8px; font-size: 13px } .dg-rtopo span { font-weight: 900; font-variant-numeric: tabular-nums; white-space: nowrap }
.dg-rmeio small { font-size: 11px; color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.dg-rbar { height: 5px; border-radius: 99px; background: var(--portal-bg-secondary, #f1f5f9); overflow: hidden } .dg-rbar i { display: block; height: 100%; background: var(--c); border-radius: 99px; transform-origin: left; animation: dgLado .8s cubic-bezier(.2,.8,.2,1) both }
@keyframes dgLado { from { transform: scaleX(0) } }
.dg-rl em { font-style: normal; font-size: 12px; font-weight: 900; color: ${MUDO}; width: 36px; text-align: right }
.dg-meta { display: grid; gap: 10px } .dg-meta-top { display: flex; justify-content: space-between; font-size: 13px } .dg-meta-top span:last-child { color: ${MUDO} }
.dg-meta-barra { position: relative; height: 14px; border-radius: 99px; background: var(--portal-bg-secondary, #f1f5f9); overflow: hidden; display: flex }
.dg-meta-barra i { display: block; height: 100%; background: var(--c); border-radius: 99px; transform-origin: left; animation: dgLado 1s .2s both } .dg-meta-barra i.extra { background: #10b981; position: absolute; left: 0; top: 0; opacity: .8 }
.dg-linhas { display: grid; gap: 6px } .dg-linhas > div { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; border-bottom: 1px dashed var(--portal-border, #eef2f7); padding-bottom: 4px }
.dg-linhas span { color: ${MUDO}; display: inline-flex; align-items: center; gap: 6px } .dg-linhas span i { width: 10px; height: 10px; border-radius: 3px; display: inline-block }
.dg-linhas b { font-variant-numeric: tabular-nums; white-space: nowrap } .dg-linhas small { color: ${MUDO}; font-weight: 600 }
.dg-sep { border-top: 1px solid var(--portal-border, #e5e7eb); padding-top: 4px }
.dg-fonte { display: grid; gap: 10px } .dg-fbarra { display: flex; height: 14px; border-radius: 99px; overflow: hidden; gap: 2px } .dg-fbarra i { display: block; height: 100%; transform-origin: left; animation: dgLado .8s both }
.dg-seta { position: absolute; top: 50%; transform: translateY(-50%); z-index: 5; width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #334155); cursor: pointer; box-shadow: 0 4px 12px rgba(15,23,42,.12) } .dg-seta.esq { left: 4px } .dg-seta.dir { right: 4px } .dg-seta:hover { background: #2563eb; color: #fefefe }
.dg-nav { position: relative; display: flex; gap: 8px; justify-content: center; align-items: center; margin-top: 14px; flex-wrap: nowrap; overflow-x: auto; padding: 22px 4px 4px }
.dg-trilho { position: absolute; left: 10%; right: 10%; top: calc(22px + 17px); height: 2px; background: repeating-linear-gradient(90deg, var(--portal-border, #e2e8f0) 0 6px, transparent 6px 10px); z-index: 0 }
.dg-nav button { --c: #2563eb; position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 0; height: 36px; padding: 0; border: none; border-radius: 99px; background: var(--portal-bg-card, #fefefe); box-shadow: 0 0 0 1px var(--portal-border, #e2e8f0); cursor: pointer; font-family: inherit; overflow: visible; transition: box-shadow .3s, transform .2s; flex-shrink: 0 }
.dg-nav button:not(.on):hover { transform: translateY(-2px) scale(1.08); box-shadow: 0 0 0 2px var(--c), 0 6px 14px color-mix(in srgb, var(--c) 30%, transparent) }
.dg-bola { position: relative; z-index: 1; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: var(--c); font-size: 14px; transition: color .3s }
.dg-nav button.visto .dg-bola { opacity: .7 }
.dg-nome { position: relative; z-index: 1; max-width: 0; overflow: hidden; white-space: nowrap; font-size: 13px; font-weight: 900; color: #fefefe; transition: max-width .5s cubic-bezier(.2,.9,.3,1), padding .5s; padding-right: 0 }
.dg-nav button.on { box-shadow: 0 6px 18px color-mix(in srgb, var(--c) 40%, transparent); background: color-mix(in srgb, var(--c) 55%, #0f172a) }
.dg-nav button.on .dg-bola { color: #fefefe } .dg-nav button.on .dg-nome { max-width: 260px; padding-right: 16px }
.dg-enche { position: absolute; inset: 0; border-radius: 99px; background: var(--c); transform-origin: left; animation: dgTempo ${TEMPO}ms linear both; z-index: 0 } .dg-enche.parado { animation-play-state: paused }
@keyframes dgTempo { from { transform: scaleX(.12) } to { transform: scaleX(1) } }
.dg-dica { position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%) translateY(4px); background: #0f172a; color: #fefefe; font-size: 11.5px; font-weight: 800; white-space: nowrap; border-radius: 8px; padding: 3px 8px; opacity: 0; pointer-events: none; transition: opacity .15s, transform .15s }
.dg-nav button:hover .dg-dica { opacity: 1; transform: translateX(-50%) }
.dg-detalhe { color: var(--c); font-weight: 800 } .dg-c.atual { cursor: pointer }
.dg-pausa { position: absolute; top: 10px; right: 14px; font-size: 11.5px; color: ${MUDO}; font-weight: 700 }
@media (max-width: 720px) { .dg-c-meio { grid-template-columns: 1fr } .dg-palco { height: 470px } .dg-c { height: 460px; width: 92%; margin-left: -46% } .dg-c.prox, .dg-c.ant { opacity: 0 } }
@media (prefers-reduced-motion: reduce) { .dg-c, .dg-bpar i, .dg-rbar i, .dg-enche, .dg-nome, .dg-luz, .dg-brilho, .dg-ic, .dg-valor { transition: none !important; animation: none !important } }
`
