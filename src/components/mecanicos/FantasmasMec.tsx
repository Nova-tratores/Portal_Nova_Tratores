'use client'
// Horas e km fantasmas (José, 20/10/2026): por mecânico, cruza o carro (ligado e km), o que ele apontou no
// relatório, o que foi cobrado na OS e a previsão do tempário Mahindra — para ver para onde vão as horas e o km.
// O Tratorilson analisa as OS no tempário (botão) e aponta as que passaram muito do tempo ou foram rápidas demais.
// Visual animado (José: "deixa algo mais moderno e animado"): números contando, barras crescendo com a parte
// "fantasma" listrada e em movimento, linha do mês dia a dia, cartões entrando em cascata.
import { Fragment, useEffect, useRef, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { Fantasmas, TecnicoFantasma, OSFantasma, DiaFantasma } from '@/lib/mecanicos/fantasmas-server'
import { useVersaoAoVivo } from './useAoVivo'
import TemparioJanela from './TemparioJanela'
import FuroKmJanela from './FuroKmJanela'
import type { Divergencia } from '@/lib/mecanicos/divergencias'
import { TabelaCruzamentos, montarCruzamentos, useFuroKm } from './CruzamentosTecnico'

// Tempário fora do cartão por enquanto (José, 28/10/2026: "do tempário, deixa vazio algo como Em Desenvolvimento").
// O código continua aqui; é só virar para true quando a comparação estiver pronta.
const TEMPARIO_ATIVO = false

const h = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`
const km = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} km`
const dia = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const hora = (s: string | null) => (s ? new Date(s).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }) : '')
const SIT: Record<string, { rot: string; cls: string }> = {
  muito_acima: { rot: 'muito acima do tempário', cls: 'v' }, acima: { rot: 'acima do tempário', cls: 'a' }, rapido: { rot: 'rápido demais', cls: 'a' },
  ok: { rot: 'dentro do tempário', cls: 'ok' }, sem_previsao: { rot: 'fora do tempário', cls: 'n' }, sem_analise: { rot: 'não analisada', cls: 'n' },
}

/** Número que conta de 0 até o valor quando aparece. */
function Conta({ v, fmt }: { v: number; fmt: (n: number) => string }) {
  const [n, setN] = useState(0)
  const alvo = useRef(v)
  useEffect(() => {
    alvo.current = v
    let raf = 0
    const t0 = performance.now(), dur = 900
    const passo = (t: number) => { const p = Math.min(1, (t - t0) / dur); setN(alvo.current * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(passo) }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [v])
  return <>{fmt(n)}</>
}

export default function FantasmasMec({ mes }: { mes: string }) {
  const [d, setD] = useState<Fantasmas | null>(null)
  const [versao, setVersao] = useState(0)
  const [analisando, setAnalisando] = useState<{ feitas: number; faltam: number; total: number } | null>(null)
  const [erro, setErro] = useState('')
  const aoVivo = useVersaoAoVivo()
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/mecanicos/fantasmas?mes=${mes}${versao ? '&forcar=1' : ''}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!vivo) return
        if (!r.ok) setErro(j.error || 'Falha ao carregar'); else { setErro(''); setD(j) }
      } catch { if (vivo) setErro('Sem conexão') }
    })()
    return () => { vivo = false }
  }, [mes, versao, aoVivo])

  const analisar = async () => {
    let feitas = 0
    const total = d?.osSemAnalise.length || 0
    setAnalisando({ feitas: 0, faltam: total, total })
    for (let volta = 0; volta < 20; volta++) {
      try {
        const r = await fetch('/api/mecanicos/fantasmas', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ mes }) })
        const j = await r.json()
        if (!r.ok) { setErro(j.error || 'Falha ao analisar'); break }
        feitas += j.feitas || 0
        setAnalisando({ feitas, faltam: j.faltam, total })
        if (!j.faltam || !j.feitas) break
      } catch { setErro('Sem conexão'); break }
    }
    setAnalisando(null); setVersao((v) => v + 1)
  }

  const eq = d ? d.tecnicos.reduce((s, t) => ({
    horas: s.horas + t.totais.acimaTempario + t.totais.naoCobradas, km: s.km + t.totais.kmFantasma,
    dias: s.dias + t.totais.diasCarroSemOS, alertas: s.alertas + t.totais.osComAlerta, kmCarro: s.kmCarro + t.totais.kmCarro,
    acima: s.acima + t.totais.acimaTempario, naoCob: s.naoCob + t.totais.naoCobradas, os: s.os + t.os.length, kmSemOS: s.kmSemOS + t.totais.kmSemOS,
  }), { horas: 0, km: 0, dias: 0, alertas: 0, kmCarro: 0, acima: 0, naoCob: 0, os: 0, kmSemOS: 0 }) : null

  return (
    <section className="fan">
      <style>{ESTILO_FAN}</style>
      {eq && (
        <div className="fan-hero">
          <div className="fan-hero-txt">
            <span className="fan-fant" aria-hidden><i className="fas fa-ghost" /></span>
            <div>
              <b>O que não aparece na OS</b>
              <small>carro (rastreador) × relatório do técnico × OS cobrada{TEMPARIO_ATIVO ? ' × tempário Mahindra' : ''}</small>
            </div>
            {TEMPARIO_ATIVO && d && d.osSemAnalise.length > 0 && !analisando && <button type="button" className="fan-bt" onClick={() => void analisar()}><i className="fas fa-wand-magic-sparkles" />Analisar {d.osSemAnalise.length} OS no tempário</button>}
            {analisando && (
              <div className="fan-prog"><span>Tratorilson analisando… {analisando.feitas} de {analisando.total}</span><i style={{ width: `${analisando.total ? (analisando.feitas / analisando.total) * 100 : 0}%` }} /></div>
            )}
          </div>
          <div className="fan-kpis">
            {/* 28/10/2026 (José: "melhora esses cards"): ícone, o número e de onde ele vem numa barrinha */}
            <div className="fan-kpi" style={{ '--k': '#dc2626', '--d': '0ms' } as React.CSSProperties}>
              <span className="fan-kpi-ic"><i className="fas fa-ghost" /></span><small>Horas fantasmas</small>
              {TEMPARIO_ATIVO ? <>
                <b><Conta v={eq.horas} fmt={h} /></b>
                <div className="fan-kpi-bar">{eq.horas > 0 && <><i style={{ width: `${(eq.acima / eq.horas) * 100}%` }} /><i className="b" style={{ width: `${(eq.naoCob / eq.horas) * 100}%` }} /></>}</div>
                <em><span className="pt" /> {h(eq.acima)} acima do tempário <span className="pt b" /> {h(eq.naoCob)} apontadas e não cobradas</em>
              </> : <>
                <b><Conta v={eq.naoCob} fmt={h} /></b>
                <div className="fan-kpi-bar vazia" />
                <em>apontadas no relatório e não cobradas na OS</em>
              </>}
            </div>
            <div className="fan-kpi" style={{ '--k': '#7c3aed', '--d': '90ms' } as React.CSSProperties}>
              <span className="fan-kpi-ic"><i className="fas fa-route" /></span><small>Km fantasma</small>
              <b><Conta v={eq.km} fmt={km} /></b>
              <div className="fan-kpi-bar"><i style={{ width: `${eq.kmCarro ? Math.min(100, (eq.km / eq.kmCarro) * 100) : 0}%` }} /></div>
              <em>{eq.kmCarro ? <><b>{Math.round((eq.km / eq.kmCarro) * 100)}%</b> dos {km(eq.kmCarro)} que os carros rodaram não estão em relatório</> : 'carro × relatórios'}</em>
            </div>
            <div className="fan-kpi" style={{ '--k': '#d97706', '--d': '180ms' } as React.CSSProperties}>
              <span className="fan-kpi-ic"><i className="fas fa-car-side" /></span><small>Dias de carro sem OS</small>
              <b><Conta v={eq.dias} fmt={(n) => `${Math.round(n)} dia${Math.round(n) === 1 ? '' : 's'}`} /></b>
              <div className="fan-kpi-bar vazia" />
              <em>o carro rodou mais de 5 km e não teve OS{eq.kmSemOS > 0 ? <> · <b>{km(eq.kmSemOS)}</b> nesses dias</> : ''}</em>
            </div>
            <div className="fan-kpi" style={{ '--k': '#0f766e', '--d': '270ms' } as React.CSSProperties}>
              <span className="fan-kpi-ic"><i className="fas fa-stopwatch" /></span><small>OS com alerta</small>
              {TEMPARIO_ATIVO ? <>
                <b><Conta v={eq.alertas} fmt={(n) => `${Math.round(n)} de ${eq.os}`} /></b>
                <div className="fan-kpi-bar"><i style={{ width: `${eq.os ? (eq.alertas / eq.os) * 100 : 0}%` }} /></div>
                <em>OS fora do tempo do tempário (demorou mais ou rápido demais)</em>
              </> : <>
                <span className="fan-dev"><i className="fas fa-person-digging" /> Em desenvolvimento</span>
                <em>a comparação com o tempário Mahindra volta quando estiver pronta</em>
              </>}
            </div>
          </div>
        </div>
      )}
      {erro && <p className="fan-erro">{erro}</p>}
      {d?.semTabela && <p className="fan-aviso">Para guardar a análise do tempário falta rodar o SQL <b>sql/posvendas-tempario.sql</b>.</p>}
      {!d ? <div className="fan-esq">{[0, 1].map((k) => <div key={k} className="fan-esq-c" />)}</div> : (
        <div className="fan-lista">{d.tecnicos.map((t, k) => <CartaoTecnico key={t.tecnico} t={t} ordem={k} mes={mes} />)}</div>
      )}
    </section>
  )
}

/** Barra que cresce; `fantasma` é a parte além de `base`, listrada e andando. */
function Barra({ rot, v, max, cor, fmt, base, dica, atraso }: { rot: string; v: number; max: number; cor: string; fmt: (n: number) => string; base?: number; dica?: string; atraso: number }) {
  const w = max > 0 ? Math.min(100, (v / max) * 100) : 0
  const b = base != null && base < v ? Math.max(0, (base / max) * 100) : null
  return (
    <div className="fan-bar" title={dica} style={{ '--d': `${atraso}ms` } as React.CSSProperties}>
      <span className="fan-bar-r">{rot}</span>
      <span className="fan-bar-t">
        <i className="fan-bar-f" style={{ width: `${b ?? w}%`, background: cor }} />
        {b != null && <i className="fan-bar-g" style={{ left: `${b}%`, width: `${w - b}%`, '--c': cor } as React.CSSProperties} />}
      </span>
      <span className="fan-bar-v"><Conta v={v} fmt={fmt} /></span>
    </div>
  )
}

/** Linha do mês: uma coluna por dia — km do carro (cinza) × km do relatório (azul); dia sem OS em âmbar. */
function LinhaMes({ dias, mes }: { dias: DiaFantasma[]; mes: string }) {
  const n = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate()
  const por = new Map(dias.map((d) => [d.data, d]))
  const max = Math.max(1, ...dias.map((d) => Math.max(d.kmCarro, d.kmRel)))
  return (
    <div className="fan-mes">
      {Array.from({ length: n }, (_, k) => {
        const data = `${mes}-${String(k + 1).padStart(2, '0')}`
        const d = por.get(data)
        const sem = !!d && !d.os.length && d.kmCarro > 5
        return (
          <div key={data} className={`fan-mes-d ${sem ? 'sem' : ''} ${d?.os.length ? 'os' : ''}`} style={{ '--d': `${k * 18}ms` } as React.CSSProperties}
            title={d ? `${dia(data)} · carro ${km(d.kmCarro)}${d.ligadoH ? `, ${h(d.ligadoH)} ligado` : ''} · relatório ${km(d.kmRel)}${d.horasRel ? `, ${h(d.horasRel)}` : ''}${d.os.length ? ` · ${d.os.join(', ')}` : sem ? ' · sem OS' : ''}` : dia(data)}>
            <span className="fan-mes-c" style={{ height: `${d ? (d.kmCarro / max) * 100 : 0}%` }} />
            <span className="fan-mes-r" style={{ height: `${d ? (d.kmRel / max) * 100 : 0}%` }} />
          </div>
        )
      })}
    </div>
  )
}

export function CartaoTecnico({ t, ordem = 0, mes }: { t: TecnicoFantasma; ordem?: number; mes: string }) {
  const [aberto, setAberto] = useState<'os' | 'dias' | null>(null)
  const [furo, setFuro] = useState<Divergencia | null>(null)
  const fk = useFuroKm(t.tecnico, mes)
  const [tempario, setTempario] = useState<string | null>(null)
  const x = t.totais
  const alertas = TEMPARIO_ATIVO ? t.os.filter((o) => ['muito_acima', 'acima', 'rapido'].includes(o.situacao)) : []
  const fantH = (TEMPARIO_ATIVO ? x.acimaTempario : 0) + x.naoCobradas
  const nivel = x.kmFantasma > 400 || fantH > 8 || alertas.some((o) => o.situacao === 'muito_acima') ? 'alto' : x.kmFantasma > 150 || fantH > 3 || alertas.length ? 'medio' : 'ok'
  const ini = t.tecnico.split(' ').filter((p) => /^[A-ZÀ-Ú]/.test(p)).map((p) => p[0]).slice(0, 2).join('')
  const b0 = ordem * 120
  return (
    <article className={`fan-c ${nivel}`} style={{ '--d': `${b0}ms` } as React.CSSProperties}>
      <header className="fan-c-cab">
        <span className="fan-ini">{ini}</span>
        <div><b>{t.tecnico}</b><small>{t.os.length} OS no mês{t.placas.length ? ` · carro ${t.placas.join(', ')}` : ' · sem carro identificado'}</small></div>
        <span className={`fan-nivel ${nivel}`}>{nivel === 'alto' ? 'atenção' : nivel === 'medio' ? 'olhar' : 'em dia'}</span>
      </header>
      {/* 28/10/2026 (José escolheu a opção 5 da página teste: "isso aqui eu achei muito bom, vamos trabalhar nele"):
          uma linha por cruzamento; clicar abre o mapa do furo, as OS ou o dia a dia */}
      <TabelaCruzamentos linhas={montarCruzamentos(t, fk)} onAcao={(a, div) => (a === 'mapa' ? setFuro(div || 'geral') : setAberto(a))} />
      {/* gráfico do mês tirado do cartão (José, 21/10/2026); o dia a dia continua na aba "Dia a dia" */}
      {alertas.length > 0 && (
        <div className="fan-alertas">
          {/* 28/10/2026 (José: "ainda tá confuso pra identificar"): etiqueta do que é, e o levou × tempário em barrinhas */}
          <div className="fan-al-cab"><b>OS fora do tempo do tempário</b><span><i className="v" /> demorou mais que o tempário <i className="a" /> rápido demais (pode ter faltado etapa)</span></div>
          {alertas.slice(0, 4).map((o) => {
            const prev = (o.previstoMin || 0) / 60
            const lento = o.situacao !== 'rapido'
            const dif = o.horasRel - prev
            const mx = Math.max(o.horasRel, prev, 0.1)
            return (
              <div key={o.os} className={`fan-al2 ${lento ? 'v' : 'a'}`}>
                <span className="fan-al2-tag"><i className={`fas ${lento ? 'fa-hourglass-end' : 'fa-forward-fast'}`} /> {lento ? 'Demorou mais' : 'Rápido demais'}</span>
                <div className="fan-al2-os"><b>{o.os}</b><small>{o.cliente}</small></div>
                <div className="fan-al2-cmp">
                  <div><small>levou</small><i style={{ width: `${(o.horasRel / mx) * 100}%` }} className="lv" /><b>{h(o.horasRel)}</b></div>
                  <div><small>tempário</small><i style={{ width: `${(prev / mx) * 100}%` }} className="tp" /><b>{h(prev)}</b></div>
                </div>
                <em className="fan-al2-dif">{dif >= 0 ? '+' : '−'}{h(Math.abs(dif))}</em>
                <button type="button" className="fan-tp" onClick={() => setTempario(o.os)} title={o.alertas[0]?.texto || 'ver o que o técnico escreveu no tempário e ajustar'}><i className="fas fa-stopwatch" /> ver no tempário</button>
              </div>
            )
          })}
        </div>
      )}
      <div className="fan-abas">
        <button type="button" className={aberto === 'os' ? 'on' : ''} onClick={() => setAberto(aberto === 'os' ? null : 'os')}>Ordens de serviço ({t.os.length})</button>
        <button type="button" className={aberto === 'dias' ? 'on' : ''} onClick={() => setAberto(aberto === 'dias' ? null : 'dias')}>Dia a dia</button>
      </div>
      {aberto === 'os' && <TabelaOS os={t.os} onTempario={setTempario} />}
      {tempario && <TemparioJanela os={tempario} onFechar={() => setTempario(null)} />}
      {furo && <FuroKmJanela tecnico={t.tecnico} mes={mes} divergencia={furo} onFechar={() => setFuro(null)} />}
      {aberto === 'dias' && (
        <div className="fan-tab">
          <div className="fan-th d"><span>Dia</span><span>OS</span><span className="n">Relatório</span><span className="n">Carro ligado</span><span>Carro</span><span className="n">Km carro</span><span className="n">Km relatório</span></div>
          {t.dias.filter((dd) => dd.horasRel > 0 || dd.kmCarro > 0 || dd.ligadoH > 0).map((dd) => (
            <div key={dd.data} className={`fan-tr d ${!dd.os.length && dd.kmCarro > 5 ? 'sem' : ''}`}>
              <span>{dia(dd.data)}</span><span>{dd.os.join(', ') || (dd.kmCarro > 5 ? 'sem OS' : '—')}</span>
              <span className="n">{dd.horasRel ? h(dd.horasRel) : '—'}</span><span className="n">{dd.ligadoH ? h(dd.ligadoH) : '—'}</span>
              <span>{dd.inicio ? `${hora(dd.inicio)}–${hora(dd.fim)}` : '—'}</span>
              <span className="n">{dd.kmCarro ? km(dd.kmCarro) : '—'}</span><span className="n">{dd.kmRel ? km(dd.kmRel) : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

function TabelaOS({ os, onTempario }: { os: OSFantasma[]; onTempario: (os: string) => void }) {
  return (
    <div className="fan-tab">
      <div className="fan-th o"><span>OS</span><span>Cliente</span><span className="n">Relatório</span><span className="n">Cobrado</span><span className="n">Tempário</span><span>Situação</span><span className="n">Km rel. / cobr. / carro</span></div>
      {os.map((o) => (
        <Fragment key={o.os}>
          <div className="fan-tr o">
            <span>{o.os}<small>{o.dias.map(dia).join(', ')}</small></span><span>{o.cliente || '—'}</span>
            <span className="n">{h(o.horasRel)}</span><span className="n">{h(o.horasCobradas)}</span><span className="n">{o.previstoMin != null ? h(o.previstoMin / 60) : '—'}</span>
            <span><em className={`fan-sit ${SIT[o.situacao]?.cls || 'n'}`}>{SIT[o.situacao]?.rot || o.situacao}</em></span>
            <span className="n">{Math.round(o.kmRel)} / {Math.round(o.kmCobrado)} / {Math.round(o.kmCarro)}</span>
          </div>
          {o.alertas.filter((a) => a.nivel !== 'azul').map((a, i) => <div key={i} className={`fan-tr-al ${a.nivel}`}>{a.texto} <button type="button" className="fan-tp" onClick={() => onTempario(o.os)}><i className="fas fa-stopwatch" /> ver no tempário</button></div>)}
        </Fragment>
      ))}
    </div>
  )
}

export const ESTILO_FAN = `
@keyframes fanSobe { from { opacity: 0; transform: translateY(14px) scale(.985) } }
@keyframes fanCresce { from { transform: scaleX(0) } }
@keyframes fanColuna { from { transform: scaleY(0) } }
@keyframes fanListra { to { background-position: 28px 0 } }
@keyframes fanFlutua { 0%, 100% { transform: translateY(0) rotate(-4deg) } 50% { transform: translateY(-5px) rotate(4deg) } }
@keyframes fanPulso { 0% { box-shadow: 0 0 0 0 currentColor } 70% { box-shadow: 0 0 0 7px transparent } 100% { box-shadow: 0 0 0 0 transparent } }
@keyframes fanBrilho { from { background-position: -200% 0 } to { background-position: 200% 0 } }
.fan { display: grid; gap: 16px }
.fan-hero { position: relative; overflow: hidden; border-radius: 20px; padding: 20px 22px; background: radial-gradient(900px 260px at 0% 0%, rgba(124,58,237,.10), transparent 60%), radial-gradient(700px 240px at 100% 100%, rgba(37,99,235,.08), transparent 60%), var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); display: grid; gap: 18px; animation: fanSobe .5s both }
.fan-hero-txt { display: flex; gap: 14px; align-items: center; flex-wrap: wrap } .fan-hero-txt > div { display: grid; gap: 2px; margin-right: auto } .fan-hero-txt b { font-size: 18px; font-weight: 500; color: #0f172a } .fan-hero-txt small { font-size: 13.5px; color: #64748b }
.fan-fant { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; font-size: 20px; color: #7c3aed; background: linear-gradient(135deg, #ede9fe, #fefefe); box-shadow: 0 8px 20px rgba(124,58,237,.18); animation: fanFlutua 3.2s ease-in-out infinite }
.fan-bt { display: inline-flex; gap: 8px; align-items: center; border: none; background: linear-gradient(135deg, #0f172a, #312e81); color: #fefefe; border-radius: 99px; padding: 11px 20px; font-family: inherit; font-size: 14px; cursor: pointer; box-shadow: 0 8px 22px rgba(49,46,129,.28); transition: transform .15s, box-shadow .2s } .fan-bt:hover { transform: translateY(-1px); box-shadow: 0 12px 28px rgba(49,46,129,.36) }
.fan-prog { position: relative; min-width: 260px; height: 38px; border-radius: 99px; background: #eef2ff; overflow: hidden; display: grid; place-items: center } .fan-prog span { position: relative; z-index: 1; font-size: 13px; color: #312e81 }
.fan-prog i { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, #c7d2fe, #a5b4fc, #c7d2fe); background-size: 200% 100%; animation: fanBrilho 1.4s linear infinite; transition: width .5s }
.fan-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px } @media (max-width: 900px) { .fan-kpis { grid-template-columns: 1fr 1fr } }
.fan-kpi { position: relative; display: grid; gap: 4px; padding: 14px 16px; border-radius: 14px; background: rgba(255,255,255,.7); border: 1px solid var(--portal-border, #eef2f7); animation: fanSobe .5s var(--d) both; overflow: hidden }
.fan-kpi { grid-template-columns: 40px minmax(0, 1fr); column-gap: 12px; align-content: start } .fan-kpi > b, .fan-kpi > em, .fan-kpi-bar { grid-column: 1 / -1 }
.fan-kpi-ic { width: 40px; height: 40px; border-radius: 12px; display: grid; place-items: center; background: color-mix(in srgb, var(--k) 12%, #fefefe); color: var(--k); font-size: 16px; grid-row: 1 }
.fan-kpi > small { align-self: center; grid-row: 1 }
.fan-kpi-bar { display: flex; height: 6px; border-radius: 99px; background: #f1f5f9; overflow: hidden; margin: 2px 0 } .fan-kpi-bar.vazia { visibility: hidden }
.fan-kpi-bar i { display: block; height: 100%; background: var(--k); transform-origin: left; animation: fanCresce .9s var(--d) cubic-bezier(.2,.8,.2,1) both } .fan-kpi-bar i.b { background: color-mix(in srgb, var(--k) 40%, #fefefe) }
.fan-kpi em .pt { display: inline-block; width: 8px; height: 8px; border-radius: 2px; background: var(--k); margin: 0 1px 0 0 } .fan-kpi em .pt.b { background: color-mix(in srgb, var(--k) 40%, #fefefe); margin-left: 6px } .fan-kpi em b { font-size: inherit !important; color: #0f172a !important; font-weight: 600 !important; letter-spacing: 0 }
.fan-kpi small { font-size: 12.5px; color: #64748b } .fan-kpi b { font-size: 28px; font-weight: 500; color: var(--k); font-variant-numeric: tabular-nums; letter-spacing: -.5px } .fan-kpi em { font-style: normal; font-size: 12.5px; color: #475569; line-height: 1.45 }
.fan-erro { margin: 0; font-size: 13.5px; color: #991b1b; background: #fef2f2; border-radius: 10px; padding: 8px 12px } .fan-aviso { margin: 0; font-size: 13.5px; color: #5b21b6; background: #f5f3ff; border-radius: 10px; padding: 8px 12px }
.fan-esq { display: grid; grid-template-columns: 1fr 1fr; gap: 14px } .fan-esq-c { height: 300px; border-radius: 18px; background: linear-gradient(90deg, #f1f5f9, #f8fafc, #f1f5f9); background-size: 200% 100%; animation: fanBrilho 1.4s linear infinite }
.fan-lista { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(560px, 100%), 1fr)); gap: 14px }
.fan-c { --nv: #059669; position: relative; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 18px; padding: 18px 20px; display: grid; gap: 16px; align-content: start; box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.05); animation: fanSobe .55s var(--d) cubic-bezier(.2,.8,.2,1) both; transition: transform .2s, box-shadow .25s }
.fan-c:hover { transform: translateY(-2px); box-shadow: 0 2px 4px rgba(15,23,42,.05), 0 16px 36px rgba(15,23,42,.10) }
.fan-c.medio { --nv: #d97706 } .fan-c.alto { --nv: #dc2626 }
.fan-c-cab { display: flex; gap: 12px; align-items: center } .fan-c-cab > div { display: grid; margin-right: auto } .fan-c-cab b { font-size: 17px; font-weight: 500; color: #0f172a } .fan-c-cab small { font-size: 13px; color: #64748b }
.fan-ini { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; background: #fefefe; color: #0f172a; font-size: 14.5px; box-shadow: 0 0 0 2px var(--nv), 0 0 0 5px color-mix(in srgb, var(--nv) 16%, transparent) }
.fan-nivel { font-size: 12px; border-radius: 99px; padding: 4px 12px; color: var(--nv); background: color-mix(in srgb, var(--nv) 10%, transparent) }
.fan-blocos { display: grid; grid-template-columns: 1fr 1fr; gap: 22px } @media (max-width: 700px) { .fan-blocos { grid-template-columns: 1fr } }
.fan-bloco { display: grid; gap: 9px; align-content: start } .fan-rot { font-size: 11.5px; color: #64748b; text-transform: uppercase; letter-spacing: .6px }
.fan-bar { display: grid; grid-template-columns: 104px 1fr 72px; gap: 10px; align-items: center; font-size: 13.5px; color: #0f172a }
.fan-bar-r { color: #475569 } .fan-bar-t { position: relative; height: 10px; border-radius: 99px; background: #f1f5f9; overflow: hidden }
.fan-bar-f, .fan-bar-g { position: absolute; top: 0; bottom: 0; left: 0; transform-origin: left; animation: fanCresce 1s var(--d) cubic-bezier(.2,.8,.2,1) both }
.fan-bar-f { border-radius: 99px }
.fan-bar-g { border-radius: 0 99px 99px 0; background: repeating-linear-gradient(-45deg, color-mix(in srgb, #dc2626 75%, transparent) 0 6px, color-mix(in srgb, #dc2626 25%, transparent) 6px 12px); background-size: 28px 100%; animation: fanCresce 1s var(--d) cubic-bezier(.2,.8,.2,1) both, fanListra 1.2s linear infinite }
.fan-bar-v { text-align: right; font-variant-numeric: tabular-nums }
.fan-cmp { display: grid; gap: 6px; text-align: left; font-family: inherit; color: inherit; width: 100%; background: #f8fafc; border: 1px solid transparent; border-radius: 14px; padding: 12px 14px; animation: fanSobe .45s both; transition: border-color .2s, box-shadow .2s, transform .2s }
.fan-cmp.clica { cursor: pointer } .fan-cmp.clica:hover { background: #fefefe; border-color: #cbd5e1; box-shadow: 0 10px 24px -18px rgba(15,23,42,.5); transform: translateY(-1px) }
.fan-cmp-t { font-size: 12.5px; color: #475569 }
.fan-cmp-d { font-size: 16px; font-weight: 500; line-height: 1.3 } .fan-cmp-d i { font-size: 13px; margin-right: 3px }
.fan-cmp.v .fan-cmp-d { color: #b91c1c } .fan-cmp.a .fan-cmp-d { color: #b45309 } .fan-cmp.n .fan-cmp-d { color: #334155 } .fan-cmp.ok .fan-cmp-d { color: #15803d }
.fan-cmp-bar { height: 10px; border-radius: 99px; overflow: hidden; background: repeating-linear-gradient(135deg, #fca5a5 0 6px, #fee2e2 6px 12px) } .fan-cmp.a .fan-cmp-bar { background: repeating-linear-gradient(135deg, #fcd34d 0 6px, #fef3c7 6px 12px) } .fan-cmp.n .fan-cmp-bar { background: repeating-linear-gradient(135deg, #cbd5e1 0 6px, #f1f5f9 6px 12px) } .fan-cmp.ok .fan-cmp-bar { background: #bbf7d0 }
.fan-cmp-bar i { display: block; height: 100%; border-radius: 99px; background: #10b981; transform-origin: left; animation: fanBarra .9s cubic-bezier(.2,.8,.2,1) both }
.fan-cmp-v { display: flex; gap: 4px 14px; flex-wrap: wrap; font-size: 12.5px; color: #475569 } .fan-cmp-v i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 5px } .fan-cmp-v b { font-weight: 500; color: #0f172a; font-variant-numeric: tabular-nums }
.fan-cmp-n { font-size: 12px; color: #64748b }
.fan-cmp-a { justify-self: start; font-size: 12.5px; color: #1d4ed8; opacity: .75; transition: opacity .2s } .fan-cmp.clica:hover .fan-cmp-a { opacity: 1 } .fan-cmp-a .fa-arrow-right { font-size: 10px; transition: transform .2s } .fan-cmp.clica:hover .fa-arrow-right { transform: translateX(3px) }
.fan-rot i { color: #64748b; margin-right: 4px; font-size: 13px }
.fan-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px } .fan-chips span { font-size: 12.5px; border-radius: 99px; padding: 4px 10px; animation: fanSobe .4s .6s both }
.fan-chips .v { background: #fee2e2; color: #991b1b } .fan-chips .a { background: #fef3c7; color: #92400e } .fan-chips .n { background: #f1f5f9; color: #475569 }
.fan-mes-box { display: grid; gap: 8px; padding: 12px 14px; border-radius: 14px; background: #f8fafc }
.fan-mes-leg { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; font-size: 12px; color: #64748b } .fan-mes-leg .fan-rot { margin-right: auto } .fan-mes-leg i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 5px; vertical-align: -1px } .fan-mes-leg i.c { background: #cbd5e1 } .fan-mes-leg i.r { background: #2563eb } .fan-mes-leg i.s { background: #f59e0b }
.fan-mes { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 3px; height: 64px; align-items: end }
.fan-mes-d { position: relative; height: 100%; border-radius: 4px; cursor: default; transition: background .2s } .fan-mes-d:hover { background: #e2e8f0 }
.fan-mes-d.sem { background: color-mix(in srgb, #f59e0b 18%, transparent) } .fan-mes-d.sem .fan-mes-c { background: #f59e0b }
.fan-mes-c, .fan-mes-r { position: absolute; bottom: 0; border-radius: 3px 3px 0 0; transform-origin: bottom; animation: fanColuna .7s var(--d) cubic-bezier(.2,.8,.2,1) both }
.fan-mes-c { left: 0; right: 0; background: #cbd5e1 } .fan-mes-r { left: 25%; right: 25%; background: #2563eb }
.fan-alertas { display: grid; gap: 6px }
.fan-dev { justify-self: start; display: inline-flex; gap: 6px; align-items: center; font-size: 13.5px; color: #475569; background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 99px; padding: 5px 12px; margin: 4px 0 } .fan-dev i { color: #94a3b8 } .fan-cmp-dev { background: #fbfcfd }
.fan-al-cab { display: flex; justify-content: space-between; align-items: center; gap: 6px 12px; flex-wrap: wrap; margin-top: 4px } .fan-al-cab b { font-size: 14px; font-weight: 500; color: #0f172a } .fan-al-cab span { display: inline-flex; gap: 5px 10px; align-items: center; flex-wrap: wrap; font-size: 12px; color: #475569 } .fan-al-cab i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: -5px } .fan-al-cab i.v { background: #ef4444 } .fan-al-cab i.a { background: #f59e0b }
.fan-al2 { display: grid; grid-template-columns: 128px minmax(0, 150px) minmax(140px, 1fr) 62px auto; gap: 12px; align-items: center; border-radius: 12px; padding: 8px 12px; background: #f8fafc; border-left: 0; animation: fanSobe .4s both }
.fan-al2-tag { display: inline-flex; gap: 6px; align-items: center; justify-self: start; font-size: 12px; font-weight: 500; border-radius: 99px; padding: 3px 10px; white-space: nowrap }
.fan-al2.v .fan-al2-tag { background: #fee2e2; color: #991b1b } .fan-al2.a .fan-al2-tag { background: #fef3c7; color: #92400e }
.fan-al2-os { display: grid; min-width: 0 } .fan-al2-os b { font-size: 13.5px; font-weight: 500; color: #0f172a } .fan-al2-os small { font-size: 12px; color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.fan-al2-cmp { display: grid; gap: 4px; min-width: 0 } .fan-al2-cmp > div { display: grid; grid-template-columns: 58px minmax(0, 1fr) 50px; gap: 6px; align-items: center } .fan-al2-cmp small { font-size: 11.5px; color: #475569 } .fan-al2-cmp b { font-size: 12.5px; font-weight: 500; color: #0f172a; text-align: right; font-variant-numeric: tabular-nums }
.fan-al2-cmp i { display: block; height: 8px; border-radius: 99px; min-width: 3px; transform-origin: left; animation: fanBarra .9s cubic-bezier(.2,.8,.2,1) both } .fan-al2-cmp i.lv { background: #2563eb } .fan-al2-cmp i.tp { background: #7c3aed }
@keyframes fanBarra { from { transform: scaleX(0) } }
.fan-al2-dif { font-style: normal; font-size: 14px; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums } .fan-al2.v .fan-al2-dif { color: #b91c1c } .fan-al2.a .fan-al2-dif { color: #b45309 }
@media (max-width: 760px) { .fan-al2 { grid-template-columns: 1fr auto } .fan-al2-cmp { grid-column: 1 / -1 } }
.fan-tp { border: 1px solid #99f6e4; background: #f0fdfa; color: #0f766e; border-radius: 99px; padding: 3px 10px; font-family: inherit; font-size: 12.5px; cursor: pointer; white-space: nowrap; align-self: center } .fan-tp:hover { background: #ccfbf1 } .fan-tp i { font-size: 11px; margin-right: 2px }
.fan-al { display: grid; grid-template-columns: 10px 64px minmax(0, 150px) 1fr auto; gap: 10px; font-size: 13px; border-radius: 12px; padding: 8px 12px; align-items: baseline; animation: fanSobe .4s both } .fan-al b { font-weight: 500 } .fan-al span:nth-child(3) { color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.fan-al.v { background: #fef2f2; color: #7f1d1d } .fan-al.a { background: #fffbeb; color: #78350f }
.fan-pulso { width: 8px; height: 8px; border-radius: 50%; background: currentColor; align-self: center; animation: fanPulso 1.8s infinite }
.fan-abas { display: flex; gap: 6px } .fan-abas button { border: 1px solid var(--portal-border, #e2e8f0); background: #fefefe; color: #334155; border-radius: 99px; padding: 7px 15px; font-family: inherit; font-size: 13px; cursor: pointer; transition: all .2s } .fan-abas button:hover { border-color: #0f172a } .fan-abas button.on { background: #0f172a; border-color: #0f172a; color: #fefefe }
.fan-tab { display: grid; font-size: 13px; color: #0f172a; border: 1px solid var(--portal-border, #eef2f7); border-radius: 12px; overflow: hidden; animation: fanSobe .3s both }
.fan-th, .fan-tr { display: grid; gap: 8px; padding: 7px 12px; align-items: baseline } .fan-th { background: #f8fafc; font-size: 11.5px; color: #64748b } .fan-tr + .fan-tr, .fan-tr-al + .fan-tr { border-top: 1px solid var(--portal-border, #f1f5f9) } .fan-tr:hover { background: #f8fafc }
.fan-th.d, .fan-tr.d { grid-template-columns: 50px minmax(80px, 1fr) 70px 80px 92px 72px 82px } .fan-th.o, .fan-tr.o { grid-template-columns: 74px minmax(100px, 1fr) 66px 62px 66px 128px 104px }
.fan-th .n, .fan-tr .n { text-align: right; font-variant-numeric: tabular-nums } .fan-tr small { display: block; font-size: 11.5px; color: #94a3b8 } .fan-tr.sem { background: #fffbeb }
.fan-tr-al { font-size: 12.5px; padding: 4px 12px 8px 86px } .fan-tr-al.vermelho { color: #991b1b } .fan-tr-al.amarelo { color: #92400e }
.fan-sit { font-style: normal; font-size: 12px; border-radius: 99px; padding: 2px 8px } .fan-sit.v { background: #fee2e2; color: #991b1b } .fan-sit.a { background: #fef3c7; color: #92400e } .fan-sit.ok { background: #dcfce7; color: #166534 } .fan-sit.n { background: #f1f5f9; color: #64748b }
@media (max-width: 800px) { .fan-th { display: none } .fan-tr.d, .fan-tr.o { grid-template-columns: 1fr 1fr } .fan-tr-al { padding-left: 12px } .fan-esq { grid-template-columns: 1fr } }
@media (prefers-reduced-motion: reduce) { .fan *, .fan *::before { animation: none !important } }

/* estilo dos cartões do Faturamento por período (José, 21/10/2026): branco, sem negrito */
.fan-c { background: #fefefe !important; border: 1px solid #e2e8f0 !important; border-radius: 16px !important; transition: transform .2s, box-shadow .2s } .fan-c:hover { transform: translateY(-2px); box-shadow: 0 12px 26px -18px rgba(15,23,42,.5) }
.fan-c-cab b { font-weight: 500 !important; font-size: 16.5px } .fan-c-cab small { color: #475569 }
.fan-rot { font-weight: 500 !important; text-transform: none !important; letter-spacing: 0 !important; font-size: 14.5px !important; color: #0f172a !important }
.fan-bar-r, .fan-bar-v { font-weight: 500 !important }
.fan-kpi { background: #fefefe !important; border: 1px solid #e2e8f0 !important; border-radius: 16px !important } .fan-kpi b { font-weight: 500 !important } .fan-kpi small { font-weight: 500 !important; text-transform: none !important; letter-spacing: 0 !important; font-size: 14px !important; color: #0f172a !important }
.fan-abas button { font-weight: 500 !important } .fan-nivel { font-weight: 500 !important }
`
