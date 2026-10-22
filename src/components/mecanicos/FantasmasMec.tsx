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
  }), { horas: 0, km: 0, dias: 0, alertas: 0, kmCarro: 0 }) : null

  return (
    <section className="fan">
      <style>{ESTILO_FAN}</style>
      {eq && (
        <div className="fan-hero">
          <div className="fan-hero-txt">
            <span className="fan-fant" aria-hidden><i className="fas fa-ghost" /></span>
            <div>
              <b>O que não aparece na OS</b>
              <small>carro (rastreador) × relatório do técnico × OS cobrada × tempário Mahindra</small>
            </div>
            {d && d.osSemAnalise.length > 0 && !analisando && <button type="button" className="fan-bt" onClick={() => void analisar()}><i className="fas fa-wand-magic-sparkles" />Analisar {d.osSemAnalise.length} OS no tempário</button>}
            {analisando && (
              <div className="fan-prog"><span>Tratorilson analisando… {analisando.feitas} de {analisando.total}</span><i style={{ width: `${analisando.total ? (analisando.feitas / analisando.total) * 100 : 0}%` }} /></div>
            )}
          </div>
          <div className="fan-kpis">
            <div className="fan-kpi" style={{ '--k': '#dc2626', '--d': '0ms' } as React.CSSProperties}><small>Horas fantasmas</small><b><Conta v={eq.horas} fmt={h} /></b><em>acima do tempário + apontadas e não cobradas</em></div>
            <div className="fan-kpi" style={{ '--k': '#7c3aed', '--d': '90ms' } as React.CSSProperties}><small>Km fantasma</small><b><Conta v={eq.km} fmt={km} /></b><em>{eq.kmCarro ? `${Math.round((eq.km / eq.kmCarro) * 100)}% do km dos carros` : 'carro × relatórios'}</em></div>
            <div className="fan-kpi" style={{ '--k': '#d97706', '--d': '180ms' } as React.CSSProperties}><small>Dias de carro sem OS</small><b><Conta v={eq.dias} fmt={(n) => String(Math.round(n))} /></b><em>carro rodou mais de 5 km e nenhuma OS</em></div>
            <div className="fan-kpi" style={{ '--k': '#0f172a', '--d': '270ms' } as React.CSSProperties}><small>OS com alerta</small><b><Conta v={eq.alertas} fmt={(n) => String(Math.round(n))} /></b><em>fora do tempo do tempário</em></div>
          </div>
        </div>
      )}
      {erro && <p className="fan-erro">{erro}</p>}
      {d?.semTabela && <p className="fan-aviso">Para guardar a análise do tempário falta rodar o SQL <b>sql/posvendas-tempario.sql</b>.</p>}
      {!d ? <div className="fan-esq">{[0, 1].map((k) => <div key={k} className="fan-esq-c" />)}</div> : (
        <div className="fan-lista">{d.tecnicos.map((t, k) => <CartaoTecnico key={t.tecnico} t={t} ordem={k} />)}</div>
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

export function CartaoTecnico({ t, ordem = 0 }: { t: TecnicoFantasma; ordem?: number }) {
  const [aberto, setAberto] = useState<'os' | 'dias' | null>(null)
  const x = t.totais
  const maxH = Math.max(x.ligadoH, x.horasRel, x.horasCobradas, x.horasPrevistas, 1)
  const maxK = Math.max(x.kmCarro, x.kmRel, x.kmCobrado, 1)
  const alertas = t.os.filter((o) => ['muito_acima', 'acima', 'rapido'].includes(o.situacao))
  const fantH = x.acimaTempario + x.naoCobradas
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
      <div className="fan-blocos">
        <div className="fan-bloco">
          <span className="fan-rot">Horas</span>
          <Barra rot="Carro ligado" v={x.ligadoH} max={maxH} cor="#94a3b8" fmt={h} atraso={b0 + 100} dica="tempo com o motor do carro ligado no mês (rastreador)" />
          <Barra rot="Relatório" v={x.horasRel} max={maxH} cor="#2563eb" fmt={h} atraso={b0 + 180} base={x.horasCobradas} dica="a parte listrada foi apontada e não cobrada" />
          <Barra rot="Cobrado na OS" v={x.horasCobradas} max={maxH} cor="#059669" fmt={h} atraso={b0 + 260} />
          <Barra rot="Tempário" v={x.horasPrevistas} max={maxH} cor="#7c3aed" fmt={h} atraso={b0 + 340} dica={`previsão das OS já analisadas (${h(x.horasRelAnalisadas)} apontadas nelas)`} />
          <div className="fan-chips">
            {x.acimaTempario > 0 && <span className="v">+{h(x.acimaTempario)} acima do tempário</span>}
            {x.naoCobradas > 0 && <span className="a">{h(x.naoCobradas)} não cobradas</span>}
            {x.ligadoSemOS > 0 && <span className="n">{h(x.ligadoSemOS)} ligado sem OS</span>}
            {x.osSemAnalise > 0 && <span className="n">{x.osSemAnalise} OS sem análise</span>}
          </div>
        </div>
        <div className="fan-bloco">
          <span className="fan-rot">Quilômetros</span>
          <Barra rot="Carro" v={x.kmCarro} max={maxK} cor="#94a3b8" fmt={km} atraso={b0 + 140} base={x.kmRel} dica="a parte listrada o carro rodou e não está em nenhum relatório" />
          <Barra rot="Relatório" v={x.kmRel} max={maxK} cor="#2563eb" fmt={km} atraso={b0 + 220} base={x.kmCobrado} dica="a parte listrada está no relatório e não foi cobrada" />
          <Barra rot="Cobrado na OS" v={x.kmCobrado} max={maxK} cor="#059669" fmt={km} atraso={b0 + 300} />
          <div className="fan-chips">
            {x.kmFantasma > 0 && <span className="v">{km(x.kmFantasma)} fora dos relatórios</span>}
            {x.kmSemOS > 0 && <span className="a">{km(x.kmSemOS)} em {x.diasCarroSemOS} dia{x.diasCarroSemOS === 1 ? '' : 's'} sem OS</span>}
            {x.kmRel > x.kmCobrado && <span className="n">{km(x.kmRel - x.kmCobrado)} não cobrados</span>}
          </div>
        </div>
      </div>
      {/* gráfico do mês tirado do cartão (José, 21/10/2026); o dia a dia continua na aba "Dia a dia" */}
      {alertas.length > 0 && (
        <div className="fan-alertas">
          {alertas.slice(0, 4).map((o) => <div key={o.os} className={`fan-al ${SIT[o.situacao].cls}`}><span className="fan-pulso" /><b>{o.os}</b><span>{o.cliente}</span><span>{o.alertas[0]?.texto}</span></div>)}
        </div>
      )}
      <div className="fan-abas">
        <button type="button" className={aberto === 'os' ? 'on' : ''} onClick={() => setAberto(aberto === 'os' ? null : 'os')}>Ordens de serviço ({t.os.length})</button>
        <button type="button" className={aberto === 'dias' ? 'on' : ''} onClick={() => setAberto(aberto === 'dias' ? null : 'dias')}>Dia a dia</button>
      </div>
      {aberto === 'os' && <TabelaOS os={t.os} />}
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

function TabelaOS({ os }: { os: OSFantasma[] }) {
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
          {o.alertas.filter((a) => a.nivel !== 'azul').map((a, i) => <div key={i} className={`fan-tr-al ${a.nivel}`}>{a.texto}</div>)}
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
.fan-kpi::before { content: ''; position: absolute; left: 0; top: 0; height: 3px; width: 100%; background: var(--k); transform-origin: left; animation: fanCresce .9s var(--d) cubic-bezier(.2,.8,.2,1) both }
.fan-kpi small { font-size: 12.5px; color: #64748b } .fan-kpi b { font-size: 28px; font-weight: 500; color: var(--k); font-variant-numeric: tabular-nums; letter-spacing: -.5px } .fan-kpi em { font-style: normal; font-size: 12px; color: #94a3b8 }
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
.fan-al { display: grid; grid-template-columns: 10px 64px minmax(0, 150px) 1fr; gap: 10px; font-size: 13px; border-radius: 12px; padding: 8px 12px; align-items: baseline; animation: fanSobe .4s both } .fan-al b { font-weight: 500 } .fan-al span:nth-child(3) { color: #475569; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
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
