'use client'
// Aba "Pódio" do Centro do Pós-Vendas (José, 20/10/2026): o pódio do mês só aparece depois que a comissão
// daquele mês é fechada no RH, mostra o vencedor com os detalhes de cada um e quem bateu a meta IDEAL
// (merece bônus). Dá para voltar nos meses anteriores e ver quem sempre ganha ou perde.
// Conta só OS FATURADAS (montarPainel sem as aguardando). Metas por mecânico na semana: básica 20 h e
// R$ 4 mil; ideal 40 h e R$ 8 mil — no mês, × semanas do mês (dias ÷ 7).
import { useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import { montarPainel, SEM_META, SEM_TECNICO } from '@/lib/mecanicos/painel'
import type { MesPodio } from '@/lib/mecanicos/podio-server'
import { useBasePosVendas } from './useBasePosVendas'
import { useCarreira } from './useCarreira'
import { brl, brl2, horas, useContador } from './ui'
import { chaveDoTecnico } from '@/lib/mecanicos/comissao-detalhe'

/** O nome do RH pode ser mais longo ("Nicolas da Silva Dario" × "Nicolas Dario"). */
function porNome<T>(m: Record<string, T>, nome: string): T | undefined {
  if (m[nome] !== undefined) return m[nome]
  const k = Object.keys(m).find((x) => chaveDoTecnico(x, nome))
  return k ? m[k] : undefined
}

const MUDO = 'var(--portal-text-muted, #64748b)'
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const nomeMes = (m: string) => { const t = `${MESES[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`; return t[0].toUpperCase() + t.slice(1) }
const curto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1].slice(0, 3)}/${m.slice(2, 4)}`
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const primeiro = (n: string) => n.split(' ')[0]
const META = { basH: 20, basV: 4000, ideH: 40, ideV: 8000 }

interface Colocado {
  nome: string; foto?: string; pos: number
  faturado: number; horas: number; os: number; km: number
  basV: number; ideV: number; basH: number; ideH: number
  pV: number; pH: number; bateuBasica: boolean; bonus: boolean
  comissao: { valor: number; status: string } | null; pontos: number; ocorrencias: number
  /** OS internas do mês (serviço da loja, cortesia…): aparecem à parte e NÃO contam no pódio */
  internaValor: number; internaHoras: number; internaOS: number
}
export interface MesMontado { mes: string; fechado: boolean; pendentes: string[]; lista: Colocado[] }

let cacheApi: { meses: MesPodio[]; em: number } | null = null
function usePodioApi() {
  const [dados, setDados] = useState<MesPodio[] | null>(() => (cacheApi && Date.now() - cacheApi.em < 5 * 60_000 ? cacheApi.meses : null))
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    if (dados) return
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/mecanicos/podio', { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Falha ao carregar o pódio')
        cacheApi = { meses: j.meses, em: Date.now() }
        if (vivo) setDados(j.meses)
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao carregar o pódio') }
    })()
    return () => { vivo = false }
  }, [dados])
  return { dados, erro }
}

function Foto({ c, tam }: { c: { nome: string; foto?: string }; tam: number }) {
  const [erro, setErro] = useState(false)
  // eslint-disable-next-line @next/next/no-img-element
  return c.foto && !erro ? <img className="pd-foto" style={{ width: tam, height: tam }} src={c.foto} alt={c.nome} onError={() => setErro(true)} /> : <span className="pd-foto ini" style={{ width: tam, height: tam, fontSize: tam * 0.34 }}>{iniciais(c.nome)}</span>
}
function Num({ v, f }: { v: number; f: (n: number) => string }) { return <>{f(useContador(v, 1200))}</> }

/** A conta (pura) de cada mês do pódio — só OS faturadas. */
export function montarMesesPodio(base: import('@/lib/mecanicos/painel').BaseDados, api: MesPodio[], fotos: Record<string, string>, hoje: string): MesMontado[] {
  return api.map((m) => {
    const [a, mm] = m.mes.split('-').map(Number)
    const dias = new Date(Date.UTC(a, mm, 0)).getUTCDate(), sem = dias / 7
    const d = montarPainel(base, 'mes', hoje.startsWith(m.mes) ? hoje : `${m.mes}-15`, hoje, false)
    const lista = d.linhas.filter((l) => l.tecnico !== SEM_TECNICO && !SEM_META.has(l.tecnico) && (l.bruto > 0 || l.faturadas > 0))
      .map((l) => {
        const basV = META.basV * sem, ideV = META.ideV * sem, basH = META.basH * sem, ideH = META.ideH * sem
        return {
          nome: l.tecnico, foto: fotos[l.tecnico], pos: 0,
          faturado: l.bruto, horas: l.faturadas, os: l.os, km: l.km, basV, ideV, basH, ideH,
          pV: (l.bruto / basV) * 100, pH: (l.faturadas / basH) * 100,
          bateuBasica: l.bruto >= basV && l.faturadas >= basH, bonus: l.bruto >= ideV && l.faturadas >= ideH,
          ...(() => {
            const ints = (base.internasFechadas || []).filter((x) => x.data.startsWith(m.mes) && x.tecnicos.includes(l.tecnico))
            return { internaValor: ints.reduce((s, x) => s + x.valor / Math.max(1, x.tecnicos.length), 0), internaHoras: l.internas, internaOS: ints.reduce((s, x) => s + 1 / Math.max(1, x.tecnicos.length), 0) }
          })(),
          comissao: porNome(m.comissao, l.tecnico) || null, pontos: porNome(m.pontos, l.tecnico) || 0, ocorrencias: porNome(m.ocorrencias, l.tecnico) || 0,
        }
      })
      .sort((x, y) => y.faturado - x.faturado)
      .map((c, i) => ({ ...c, pos: i + 1 }))
    return { mes: m.mes, fechado: m.fechado, pendentes: m.pendentes, lista }
  })
}

export default function PodioMeses() {
  const { base } = useBasePosVendas()
  const { dados: car } = useCarreira()
  const { dados: api, erro } = usePodioApi()
  const hoje = hojeSP()

  const meses = useMemo<MesMontado[] | null>(() => (base && api ? montarMesesPodio(base, api, car?.fotos || {}, hoje) : null), [base, api, car, hoje])

  const fechados = useMemo(() => (meses || []).filter((m) => m.fechado && m.lista.length), [meses])
  const [sel, setSel] = useState<string | null>(null)
  const atual = meses?.find((m) => m.mes === (sel || fechados[0]?.mes)) || null

  if (erro) return <div className="pd-vazio"><style>{ESTILO_PD}</style><i className="fas fa-triangle-exclamation" /> {erro}</div>
  if (!meses) return <div className="pd-vazio"><style>{ESTILO_PD}</style><i className="fas fa-circle-notch fa-spin" /> montando o pódio dos meses…</div>
  return (
    <div className="pd">
      <style>{ESTILO_PD}</style>
      {/* meses por ano: embaixo de cada um o vencedor, ou por que ainda não abriu (José, 20/10/2026) */}
      <div className="pd-meses">
        {Object.entries([...meses].reverse().reduce<Record<string, MesMontado[]>>((g, m) => { (g[m.mes.slice(0, 4)] ||= []).push(m); return g }, {})).map(([ano, lista]) => (
          <div key={ano} className="pd-ano">
            <span className="pd-ano-rot">{ano}</span>
            <div className="pd-ano-meses">
              {lista.map((m) => {
                const abre = m.fechado && m.lista.length > 0
                const andamento = m.mes >= hoje.slice(0, 7)
                return (
                  <button key={m.mes} type="button" disabled={!abre} className={`${m.mes === atual?.mes ? 'on' : ''} ${abre ? '' : 'trava'}`} onClick={() => setSel(m.mes)}
                    title={abre ? `Pódio de ${nomeMes(m.mes)}` : andamento ? 'Mês em andamento: o pódio abre quando a comissão for fechada no RH' : `Esperando fechar a comissão no RH${m.pendentes.length ? `: ${m.pendentes.join(', ')}` : ''}`}>
                    <b>{MESES[Number(m.mes.slice(5, 7)) - 1].slice(0, 3)}</b>
                    <small>{abre ? primeiro(m.lista[0].nome) : andamento ? 'em andamento' : 'comissão em aberto'}</small>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      {meses.filter((m) => !m.fechado).slice(0, 1).map((m) => (
        <p key={m.mes} className="pd-trava"><b>{nomeMes(m.mes)}</b>: o pódio abre quando a comissão do mês for fechada no RH{m.pendentes.length ? ` (falta: ${m.pendentes.join(', ')})` : m.mes >= hoje.slice(0, 7) ? ' — o mês ainda está em andamento' : ''}.</p>
      ))}
      {atual ? <Podio m={atual} key={atual.mes} /> : <div className="pd-vazio">Nenhum mês com a comissão fechada ainda.</div>}
      {fechados.length > 1 && <Historico meses={fechados} />}
    </div>
  )
}

/** O pódio de um mês: vencedor em destaque, 2º e 3º nos degraus, o resto embaixo — cada um com os detalhes. */
export function Podio({ m }: { m: MesMontado }) {
  const [p1, p2, p3, ...resto] = m.lista
  const v = p1
  return (
    <section className="pd-mes">
      <div className="pd-venc">
        <div className="pd-confete">{Array.from({ length: 22 }, (_, k) => <i key={k} style={{ left: `${(k * 41) % 100}%`, background: ['#f59e0b', '#2563eb', '#dc2626', '#059669', '#7c3aed'][k % 5], animationDelay: `${(k % 11) * 120}ms` }} />)}</div>
        <i className="fas fa-trophy pd-trofeu" />
        <div><small>Vencedor de {nomeMes(m.mes)}</small><b>{v.nome}</b><span>faturou <Num v={v.faturado} f={brl} /> · {horas(v.horas)} faturadas · {Math.round(v.os)} OS</span></div>
        {v.bonus && <span className="pd-bonus grande"><i className="fas fa-gift" /> Bateu a meta ideal: bônus</span>}
      </div>
      <div className="pd-palco">
        {[p2, p1, p3].map((c, k) => c ? <Degrau key={c.nome} c={c} lugar={k === 1 ? 1 : k === 0 ? 2 : 3} /> : <div key={k} />)}
      </div>
      {resto.length > 0 && <div className="pd-resto">{resto.map((c) => <Linha key={c.nome} c={c} />)}</div>}
      <p className="pd-leg">Conta só OS faturadas <b>cobradas do cliente</b>; as internas aparecem à parte e não contam. Metas por mecânico na semana: <b>básica</b> 20 h e R$ 4 mil · <b>ideal</b> 40 h e R$ 8 mil (no mês: × {(m.lista[0]?.basH / 20).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} semanas). <b>Bônus</b> = bateu a ideal nas horas e no faturado.</p>
    </section>
  )
}

function Medidor({ rot, v, bas, ide, f }: { rot: string; v: number; bas: number; ide: number; f: (n: number) => string }) {
  const topo = Math.max(ide, v) || 1
  const cls = v >= ide ? 'ideal' : v >= bas ? 'ok' : ''
  return (
    <div className={`pd-med ${cls}`}>
      <div><small>{rot}</small><b>{f(v)}</b></div>
      <span className="pd-med-bar"><i style={{ width: `${Math.min(100, (v / topo) * 100)}%` }} /><u style={{ left: `${(bas / topo) * 100}%` }} title={`básica ${f(bas)}`} /><u className="i" style={{ left: `${Math.min(99.4, (ide / topo) * 100)}%` }} title={`ideal ${f(ide)}`} /></span>
      <em>{Math.round((v / bas) * 100)}% da básica · {Math.round((v / ide) * 100)}% da ideal</em>
    </div>
  )
}
function Detalhes({ c }: { c: Colocado }) {
  return (
    <div className="pd-det">
      <Medidor rot="Faturado" v={c.faturado} bas={c.basV} ide={c.ideV} f={brl} />
      <Medidor rot="Horas faturadas" v={c.horas} bas={c.basH} ide={c.ideH} f={horas} />
      <div className="pd-num">
        <span><small>OS</small><b>{Math.round(c.os * 10) / 10}</b></span>
        <span><small>Comissão</small><b>{c.comissao ? brl2(c.comissao.valor) : '—'}</b></span>
        <span className={c.pontos ? 'ruim' : 'bom'}><small>Pontos</small><b>{100 - c.pontos}</b></span>
      </div>
      {(c.internaValor > 0 || c.internaHoras > 0) && <div className="pd-int" title="OS internas (serviço da loja, cortesia, garantia a receber, entrega técnica): não contam no pódio"><i className="fas fa-house-chimney" /> Internas (não contam): <b>{horas(c.internaHoras)}</b> · <b>{brl(c.internaValor)}</b> · {Math.round(c.internaOS * 10) / 10} OS</div>}
      <div className="pd-selos">
        {c.bonus ? <span className="pd-bonus"><i className="fas fa-gift" /> bônus: bateu a ideal</span> : c.bateuBasica ? <span className="pd-sel ok"><i className="fas fa-medal" /> bateu a básica</span> : <span className="pd-sel">não bateu a básica</span>}
        {c.ocorrencias > 0 && <span className="pd-sel oc"><i className="fas fa-shield-halved" /> {c.ocorrencias} ocorrência{c.ocorrencias > 1 ? 's' : ''}</span>}
      </div>
    </div>
  )
}
function Degrau({ c, lugar }: { c: Colocado; lugar: 1 | 2 | 3 }) {
  const cor = lugar === 1 ? 'ouro' : lugar === 2 ? 'prata' : 'bronze'
  return (
    <div className={`pd-col l${lugar}`} style={{ animationDelay: `${lugar === 1 ? 300 : lugar === 2 ? 150 : 450}ms` }}>
      <div className="pd-pessoa"><Foto c={c} tam={lugar === 1 ? 92 : 72} />{lugar === 1 && <i className="fas fa-crown pd-coroa" />}<b>{c.nome}</b></div>
      <Detalhes c={c} />
      <div className={`pd-degrau ${cor}`}><span>{lugar}º</span></div>
    </div>
  )
}
function Linha({ c }: { c: Colocado }) {
  return (
    <div className="pd-lin">
      <span className="pd-pos">{c.pos}º</span><Foto c={c} tam={44} /><b className="pd-lin-n">{c.nome}</b>
      <div className="pd-lin-det"><Detalhes c={c} /></div>
    </div>
  )
}

/** Quem sempre ganha ou perde: posições de cada um em todos os meses fechados. */
export function Historico({ meses }: { meses: MesMontado[] }) {
  const ordem = [...meses].reverse()
  const pessoas = useMemo(() => {
    const m = new Map<string, { nome: string; foto?: string; pos: (number | null)[]; ouro: number; prata: number; bronze: number; ultimo: number; bonus: number; fat: number }>()
    ordem.forEach((mes, k) => {
      for (const c of mes.lista) {
        const x = m.get(c.nome) || { nome: c.nome, foto: c.foto, pos: Array(ordem.length).fill(null), ouro: 0, prata: 0, bronze: 0, ultimo: 0, bonus: 0, fat: 0 }
        x.pos[k] = c.pos; x.fat += c.faturado
        if (c.pos === 1) x.ouro++; else if (c.pos === 2) x.prata++; else if (c.pos === 3) x.bronze++
        if (c.pos === mes.lista.length && mes.lista.length > 1) x.ultimo++
        if (c.bonus) x.bonus++
        m.set(c.nome, x)
      }
    })
    return [...m.values()].map((x) => { const v = x.pos.filter((p): p is number => p != null); return { ...x, media: v.reduce((s, p) => s + p, 0) / Math.max(1, v.length) } })
      .sort((a, b) => b.ouro - a.ouro || a.media - b.media)
  }, [ordem])
  return (
    <section className="pd-hist">
      <h3><i className="fas fa-ranking-star" /> Quem sempre ganha ou perde <small>{meses.length} meses com a comissão fechada</small></h3>
      <table>
        <thead><tr><th>Mecânico</th><th className="c" title="1º lugar"><i className="fas fa-trophy" style={{ color: '#d4a017' }} /></th><th className="c" title="2º lugar"><i className="fas fa-medal" style={{ color: '#94a3b8' }} /></th><th className="c" title="3º lugar"><i className="fas fa-medal" style={{ color: '#c2774a' }} /></th><th className="c" title="último lugar">último</th><th className="c">bônus</th><th className="c">posição média</th>{ordem.map((m) => <th key={m.mes} className="c">{curto(m.mes)}</th>)}</tr></thead>
        <tbody>
          {pessoas.map((x, i) => (
            <tr key={x.nome} style={{ animationDelay: `${i * 60}ms` }}>
              <td><span className="pd-h-n"><Foto c={x} tam={32} /><b>{x.nome}</b></span></td>
              <td className="c forte">{x.ouro || '—'}</td><td className="c">{x.prata || '—'}</td><td className="c">{x.bronze || '—'}</td>
              <td className={`c ${x.ultimo ? 'ruim' : ''}`}>{x.ultimo || '—'}</td>
              <td className="c">{x.bonus ? <span className="pd-bonus mini"><i className="fas fa-gift" /> {x.bonus}</span> : '—'}</td>
              <td className="c forte">{x.media.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}º</td>
              {x.pos.map((p, k) => <td key={k} className="c"><span className={`pd-bola p${p ?? 0}`}>{p ? `${p}º` : '·'}</span></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

export const ESTILO_PD = `
@keyframes pdEntra { from { opacity: 0; transform: translateY(14px) } } @keyframes pdSobe { from { transform: scaleY(0) } } @keyframes pdCai { 0% { transform: translateY(-20px) rotate(0); opacity: 0 } 15% { opacity: 1 } 100% { transform: translateY(170px) rotate(540deg); opacity: 0 } }
@keyframes pdBrilho { 50% { box-shadow: 0 0 0 4px rgba(245,158,11,.25), 0 16px 40px rgba(245,158,11,.25) } }
.pd { display: grid; gap: 16px; color: var(--portal-text, #0f172a) }
.pd-vazio { padding: 40px; text-align: center; color: ${MUDO}; background: var(--portal-bg-card, #fefefe); border-radius: 18px }
.pd-meses { display: flex; gap: 14px; flex-wrap: wrap; align-items: stretch; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 18px; padding: 10px 14px; box-shadow: 0 6px 18px rgba(15,23,42,.05) }
.pd-ano { display: flex; gap: 10px; align-items: center } .pd-ano + .pd-ano { padding-left: 14px; border-left: 1px solid var(--portal-border, #e2e8f0) }
.pd-ano-rot { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 11.5px; font-weight: 900; letter-spacing: .08em; color: ${MUDO} }
.pd-ano-meses { display: flex; gap: 4px; flex-wrap: wrap }
.pd-meses button { display: grid; justify-items: center; gap: 1px; min-width: 76px; border: 1px solid transparent; background: transparent; border-radius: 14px; padding: 7px 10px; font-family: inherit; cursor: pointer; transition: background .2s, border-color .2s, transform .15s }
.pd-meses button b { font-size: 14px; font-weight: 900; color: var(--portal-text, #0f172a); text-transform: capitalize } .pd-meses button small { font-size: 11px; font-weight: 700; color: #b45309; white-space: nowrap }
.pd-meses button:not(:disabled):hover { background: #fffbeb; border-color: #fde68a; transform: translateY(-1px) }
.pd-meses button.on { background: linear-gradient(135deg, #fde68a, #f59e0b); border-color: #f59e0b; box-shadow: 0 6px 16px rgba(245,158,11,.3) } .pd-meses button.on b { color: #451a03 } .pd-meses button.on small { color: #78350f }
.pd-meses button.trava { cursor: not-allowed } .pd-meses button.trava b { color: ${MUDO}; opacity: .7 } .pd-meses button.trava small { color: ${MUDO}; font-weight: 600; opacity: .8 }
.pd-trava { margin: 0; font-size: 13.5px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 9px 14px }
.pd-mes { display: grid; gap: 18px; background: var(--portal-bg-card, #fefefe); border-radius: 22px; padding: 22px; box-shadow: 0 12px 30px rgba(15,23,42,.06); animation: pdEntra .5s both }
.pd-venc { position: relative; overflow: hidden; display: flex; gap: 18px; align-items: center; flex-wrap: wrap; padding: 18px 22px; border-radius: 18px; background: linear-gradient(120deg, #fef3c7, #fde68a 60%, #fcd34d); animation: pdBrilho 3s ease-in-out infinite }
.pd-venc > div:not(.pd-confete) { display: grid; flex: 1; min-width: 220px; position: relative } .pd-venc small { font-size: 13px; font-weight: 900; color: #92400e; text-transform: uppercase; letter-spacing: .05em } .pd-venc b { font-size: 28px; font-weight: 900; color: #0f172a } .pd-venc span { font-size: 14px; color: #78350f }
.pd-trofeu { position: relative; font-size: 46px; color: #b45309; filter: drop-shadow(0 6px 10px rgba(180,83,9,.35)) }
.pd-confete { position: absolute; inset: -20px 0 auto; height: 200px; pointer-events: none } .pd-confete i { position: absolute; top: 0; width: 7px; height: 11px; border-radius: 2px; animation: pdCai 2.8s ease-in infinite }
.pd-bonus { position: relative; display: inline-flex; gap: 6px; align-items: center; font-size: 13px; font-weight: 900; color: #fefefe; background: linear-gradient(135deg, #8b5cf6, #6d28d9); border-radius: 99px; padding: 5px 13px; box-shadow: 0 6px 16px rgba(124,58,237,.35) }
.pd-bonus.grande { font-size: 15px; padding: 8px 18px } .pd-bonus.mini { font-size: 12px; padding: 2px 9px; box-shadow: none }
.pd-palco { display: grid; grid-template-columns: 1fr 1.15fr 1fr; gap: 16px; align-items: end }
.pd-col { display: grid; gap: 10px; justify-items: stretch; animation: pdEntra .6s both }
.pd-pessoa { display: grid; justify-items: center; gap: 6px; position: relative } .pd-pessoa b { font-size: 16px; text-align: center } .pd-col.l1 .pd-pessoa b { font-size: 19px }
.pd-coroa { position: absolute; top: -22px; font-size: 24px; color: #d4a017; filter: drop-shadow(0 3px 6px rgba(212,160,23,.5)) }
.pd-foto { border-radius: 50%; object-fit: cover; border: 4px solid #fefefe; box-shadow: 0 8px 20px rgba(15,23,42,.2); flex: none } .pd-foto.ini { display: grid; place-items: center; background: linear-gradient(135deg, #2563eb, #7c3aed); color: #fefefe; font-weight: 900 }
.pd-degrau { display: grid; place-items: center; border-radius: 14px 14px 6px 6px; transform-origin: bottom; animation: pdSobe .9s cubic-bezier(.2,.8,.2,1) both; box-shadow: inset 0 2px 0 rgba(255,255,255,.6) } .pd-degrau span { font-size: 26px; font-weight: 900; color: rgba(15,23,42,.55) }
.pd-col.l1 .pd-degrau { height: 90px } .pd-col.l2 .pd-degrau { height: 64px } .pd-col.l3 .pd-degrau { height: 46px }
.pd-degrau.ouro { background: linear-gradient(180deg, #fde68a, #e9be3c) } .pd-degrau.prata { background: linear-gradient(180deg, #f1f5f9, #cbd5e1) } .pd-degrau.bronze { background: linear-gradient(180deg, #f6d2ad, #d39462) }
.pd-det { display: grid; gap: 8px; background: var(--portal-bg, #f8fafc); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; padding: 12px 14px }
.pd-col.l1 .pd-det { background: #fffbeb; border-color: #fde68a }
.pd-med { display: grid; gap: 4px } .pd-med > div { display: flex; justify-content: space-between; align-items: baseline } .pd-med small { font-size: 12.5px; font-weight: 800; color: ${MUDO} } .pd-med b { font-size: 17px; font-weight: 900; font-variant-numeric: tabular-nums }
.pd-med em { font-style: normal; font-size: 12px; color: ${MUDO} } .pd-med.ok em, .pd-med.ok b { color: #047857 } .pd-med.ideal em, .pd-med.ideal b { color: #6d28d9 }
.pd-med-bar { position: relative; display: block; height: 9px; border-radius: 99px; background: #e2e8f0 } .pd-med-bar i { display: block; height: 100%; border-radius: 99px; background: #60a5fa; transform-origin: left; animation: pdSobe .9s both; animation-name: pdLarga } @keyframes pdLarga { from { transform: scaleX(0) } }
.pd-med.ok .pd-med-bar i { background: #10b981 } .pd-med.ideal .pd-med-bar i { background: #7c3aed } .pd-med-bar u { position: absolute; top: -3px; width: 3px; height: 15px; border-radius: 2px; background: #0f172a; transform: translateX(-50%) } .pd-med-bar u.i { background: #7c3aed }
.pd-num { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px } .pd-num span { display: grid; text-align: center; background: var(--portal-bg-card, #fefefe); border-radius: 10px; padding: 6px 4px } .pd-num small { font-size: 11.5px; color: ${MUDO}; font-weight: 700 } .pd-num b { font-size: 15px } .pd-num .ruim b { color: #dc2626 } .pd-num .bom b { color: #059669 }
.pd-int { font-size: 12px; color: #6d28d9; background: #f5f3ff; border-radius: 10px; padding: 6px 10px; text-align: center } .pd-int i { margin-right: 4px }
.pd-selos { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center }
.pd-sel { font-size: 12px; font-weight: 800; border-radius: 99px; padding: 3px 10px; background: #f1f5f9; color: ${MUDO} } .pd-sel.ok { background: #ecfdf5; color: #047857 } .pd-sel.oc { background: #fef2f2; color: #b91c1c }
.pd-resto { display: grid; gap: 10px }
.pd-lin { display: grid; grid-template-columns: 44px 44px 180px 1fr; gap: 14px; align-items: center; padding: 10px 14px; border-radius: 16px; border: 1px solid var(--portal-border, #e2e8f0); animation: pdEntra .5s .5s both }
.pd-pos { font-size: 22px; font-weight: 900; color: ${MUDO}; text-align: center } .pd-lin-n { font-size: 15px }
.pd-lin .pd-det { grid-template-columns: 1fr 1fr 1.1fr auto; align-items: center; background: none; border: none; padding: 0 }
.pd-leg { margin: 0; font-size: 12.5px; color: ${MUDO} }
.pd-hist { background: var(--portal-bg-card, #fefefe); border-radius: 22px; padding: 18px 20px; box-shadow: 0 12px 30px rgba(15,23,42,.06); overflow-x: auto }
.pd-hist h3 { margin: 0 0 12px; font-size: 17px; font-weight: 900; display: flex; gap: 8px; align-items: baseline } .pd-hist h3 i { color: #d4a017 } .pd-hist h3 small { font-size: 12.5px; font-weight: 600; color: ${MUDO} }
.pd-hist table { width: 100%; border-collapse: collapse; font-size: 14px } .pd-hist th { font-size: 12.5px; font-weight: 800; color: ${MUDO}; padding: 8px; border-bottom: 1px solid var(--portal-border, #e2e8f0); text-align: left; white-space: nowrap }
.pd-hist td { padding: 8px; border-bottom: 1px solid var(--portal-border, #f1f5f9) } .pd-hist tr { animation: pdEntra .4s both } .pd-hist .c { text-align: center } .pd-hist .forte { font-weight: 900 } .pd-hist .ruim { color: #dc2626; font-weight: 900 }
.pd-h-n { display: flex; gap: 10px; align-items: center }
.pd-bola { display: inline-grid; place-items: center; min-width: 32px; height: 26px; border-radius: 99px; font-size: 12.5px; font-weight: 900; background: #f1f5f9; color: ${MUDO} }
.pd-bola.p1 { background: linear-gradient(135deg, #fde68a, #e9be3c); color: #78350f } .pd-bola.p2 { background: linear-gradient(135deg, #f1f5f9, #cbd5e1); color: #334155 } .pd-bola.p3 { background: linear-gradient(135deg, #f6d2ad, #d39462); color: #7c2d12 }
@media (max-width: 900px) { .pd-palco { grid-template-columns: 1fr } .pd-col.l1 { order: -1 } .pd-lin { grid-template-columns: 36px 40px 1fr } .pd-lin-det { grid-column: 1 / -1 } .pd-lin .pd-det { grid-template-columns: 1fr } }
`
