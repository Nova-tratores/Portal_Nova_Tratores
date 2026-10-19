'use client'
// Seletor de período do Centro do Pós-Vendas (José, 16/10/2026).
//  • Abas Dia | Semana | Mês | Ano (sublinhado que desliza).
//  • Fita do tempo: cada barra é um período com a altura do que faturou; clicar ENTRA nele —
//    Anos → meses do ano → dias do mês (agrupados por semana; clicar na semana escolhe a semana).
//  • A trilha (2026 › outubro › semana…) volta de nível. Roda do mouse e ← → andam para o lado.
// Tudo calculado na tela a partir da base já baixada (sem ir ao servidor). Regras em lib/mecanicos/fita.ts.
import { useEffect, useMemo, useRef, useState } from 'react'
import { andarPeriodo, periodos, segundaDa, somarDias, type Escala } from '@/lib/mecanicos/painel'
import { barrasFita, nivelDa, semanasDoMes, somar, trilha, valorPassado, type BarraFita, type Comparar, type PorDia } from '@/lib/mecanicos/fita'
import { brl, horas } from './ui'

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const AZUL = '#0369a1'
const ESCALAS: [Escala, string][] = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano']]

export default function SeletorTempo({ escala, refDia, onMudar, porDia, desde, carregando, geradoEm, onAtualizar, destaque }: {
  escala: Escala; refDia: string; onMudar: (e: Escala, ref: string) => void
  porDia: PorDia | null; desde?: string
  carregando?: boolean; geradoEm?: string | null; onAtualizar?: () => void
  /** nome do técnico cujo faturamento a fita está mostrando (passando o mouse no cartão dele) */
  destaque?: string | null
}) {
  const [topo, setTopo] = useState(false)
  const [cal, setCal] = useState(false)
  const [calMes, setCalMes] = useState(refDia.slice(0, 7))
  const [dica, setDica] = useState<{ b: BarraFita; x: number } | null>(null)
  // comparar a fita com o passado (lembra a escolha)
  const [comparar, setComparar] = useState<Comparar>(() => {
    try { const v = typeof window === 'undefined' ? null : localStorage.getItem('cpv-fita-comparar'); return v === 'anterior' || v === 'ano' ? v : 'nao' } catch { return 'nao' }
  })
  const mudarComparar = (v: Comparar) => { setComparar(v); try { localStorage.setItem('cpv-fita-comparar', v) } catch { /* sem storage */ } }
  const [agoraMs, setAgoraMs] = useState(0)
  const rodaEm = useRef(0)
  const abasRef = useRef<HTMLDivElement>(null)
  const [traco, setTraco] = useState<{ left: number; width: number } | null>(null)
  const hoje = hojeSP()

  useEffect(() => {
    const tick = () => setAgoraMs(Date.now())
    const t0 = setTimeout(tick, 0), t = setInterval(tick, 30_000)
    return () => { clearTimeout(t0); clearInterval(t) }
  }, [geradoEm])
  // sublinhado acompanha a aba escolhida
  useEffect(() => {
    const medir = () => {
      const el = abasRef.current?.querySelector<HTMLElement>(`[data-escala="${escala}"]`)
      if (el) setTraco({ left: el.offsetLeft, width: el.offsetWidth })
    }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [escala])

  const nivel = nivelDa(escala, topo)
  const anoInicial = desde ? Number(desde.slice(0, 4)) : Number(hoje.slice(0, 4)) - 3
  const barras = useMemo(() => barrasFita(nivel, refDia, porDia || {}, hoje, anoInicial), [nivel, refDia, porDia, hoje, anoInicial])
  const semanas = useMemo(() => (nivel === 'dias' ? semanasDoMes(barras) : []), [nivel, barras])
  // no nível de anos a barra anterior já está na tela: comparar só por dias/meses
  const modoComp: Comparar = nivel === 'anos' ? 'nao' : nivel === 'meses' && comparar === 'anterior' ? 'ano' : comparar
  const passado = useMemo(() => barras.map((b) => valorPassado(b, modoComp, porDia || {})), [barras, modoComp, porDia])
  const max = Math.max(1, ...barras.map((b) => b.bruto), ...passado.map((v) => v || 0))
  const rotComp = nivel === 'dias' ? (modoComp === 'anterior' ? 'mês anterior' : 'ano passado') : 'ano passado'
  const fmtK = (v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))
  const periodo = periodos(escala, refDia, 1)[0]
  const total = porDia ? somar(porDia, periodo.de, periodo.ate > hoje ? hoje : periodo.ate) : null
  const ehAtual = periodo.ate >= hoje
  const passos = trilha(escala, refDia)
  // média dos períodos já passados e o melhor deles (coroa)
  const passados = barras.filter((b) => !b.futuro)
  const media = passados.length ? passados.reduce((s0, b) => s0 + b.bruto, 0) / passados.length : 0
  const melhor = passados.reduce<BarraFita | null>((m, b) => (b.bruto > (m?.bruto || 0) ? b : m), null)
  // total do período anterior, para o ▲▼ do topo
  const pAnt = periodos(escala, andarPeriodo(escala, refDia, -1), 1)[0]
  const totalAnt = porDia ? somar(porDia, pAnt.de, ehAtual ? andarPeriodo(escala, hoje, -1) : pAnt.ate).bruto : 0
  const difAnt = total && totalAnt > 0 ? Math.round(((total.bruto - totalAnt) / totalAnt) * 100) : null

  // atalhos de um clique
  const mesmo = (e: Escala, r: string) => escala === e && !topo && periodos(e, r, 1)[0].de === periodo.de
  const atalhos = ([
    ['Hoje', 'dia', hoje], ['Ontem', 'dia', somarDias(hoje, -1)], ['Esta semana', 'semana', hoje], ['Semana passada', 'semana', somarDias(hoje, -7)],
    ['Este mês', 'mes', hoje], ['Mês passado', 'mes', andarPeriodo('mes', hoje, -1)], ['Este ano', 'ano', hoje], ['Ano passado', 'ano', andarPeriodo('ano', hoje, -1)],
  ] as [string, Escala, string][]).map(([rotulo, e, r]) => ({ rotulo, escala: e, ref: r, ativo: mesmo(e, r) }))
  const escolher = (e: Escala, ref: string) => { setTopo(false); setDica(null); onMudar(e, ref > hoje ? hoje : ref) }
  const lado = (n: number) => { if (n > 0 && ehAtual) return; escolher(escala, andarPeriodo(escala, refDia, n)) }
  const selecionada = (b: BarraFita) => !topo && (b.escala === escala ? refDia >= b.de && refDia <= b.ate : escala === 'semana' && b.de >= periodo.de && b.de <= periodo.ate)
  const noAno = (b: BarraFita) => topo && refDia.startsWith(b.chave)
  const atualizadoHa = geradoEm && agoraMs ? Math.max(0, Math.round((agoraMs - Date.parse(geradoEm)) / 60_000)) : null

  return (
    <div className="st-caixa cpv-entra"
      onKeyDown={(e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); lado(-1) } if (e.key === 'ArrowRight') { e.preventDefault(); lado(1) } }}>
      <style>{ESTILO}</style>

      <div className="st-topo">
        <div className="st-esq">
          <div className="st-linha1">
            {/* escala */}
            <div className="st-abas" ref={abasRef} role="tablist">
              {ESCALAS.map(([e, rot]) => (
                <button key={e} type="button" role="tab" data-escala={e} aria-selected={escala === e && !topo} className={escala === e && !topo ? 'st-aba-on' : ''}
                  onClick={() => escolher(e, refDia)}>{rot}</button>
              ))}
              {traco && !topo && <span className="st-traco" style={{ left: traco.left, width: traco.width }} />}
            </div>
            {/* atalhos de um clique */}
            <div className="st-atalhos">
              {atalhos.map((a) => (
                <button key={a.rotulo} type="button" className={a.ativo ? 'on' : ''} onClick={() => escolher(a.escala, a.ref)}>{a.rotulo}</button>
              ))}
            </div>
          </div>

          {/* trilha (níveis acima) */}
          <nav className="st-trilha" aria-label="Período">
            {passos.slice(0, -1).map((p, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                {i > 0 && <i className="fas fa-chevron-right st-sep" />}
                <button type="button" className={`st-passo ${topo && i === 0 ? 'st-passo-on' : ''}`} onClick={() => (p.escala ? escolher(p.escala, p.ref) : setTopo(true))}>{p.rotulo}</button>
              </span>
            ))}
          </nav>

          {/* período escolhido: ‹ título › (clicar no título abre o calendário) */}
          <div className="st-titulo-linha">
            <button type="button" className="st-seta" onClick={() => lado(-1)} title="Período anterior (←)"><i className="fas fa-chevron-left" /></button>
            <button type="button" className={`st-titulo ${cal ? 'on' : ''}`} onClick={() => { setCalMes(refDia.slice(0, 7)); setCal(!cal) }} title="Escolher no calendário">
              <span key={`${escala}:${refDia}`}>{passos[passos.length - 1].rotulo}</span>
              <i className={`fas fa-calendar-days`} />
            </button>
            <button type="button" className="st-seta" onClick={() => lado(1)} disabled={ehAtual} title="Período seguinte (→)"><i className="fas fa-chevron-right" /></button>
            {ehAtual && !topo && <span className="st-vivo"><span className="cpv-pulso" /> em andamento</span>}
            {destaque && <span className="st-destaque" key={destaque}><i className="fas fa-user" /> fita mostrando só {destaque}</span>}
            {cal && <Calendario mes={calMes} setMes={setCalMes} porDia={porDia || {}} periodo={periodo} hoje={hoje}
              onEscolher={(e, r) => { escolher(e, r); setCal(false) }} onFechar={() => setCal(false)} />}
          </div>
        </div>

        <div className="st-total">
          {total && !topo && <>
            <div className="st-total-valor">{brl(total.bruto)}</div>
            <div className="st-total-sub">{horas(total.horas)} cobradas · {total.os} OS faturadas</div>
            {difAnt != null && <div className="st-total-sub" style={{ color: difAnt >= 0 ? '#047857' : '#b91c1c', fontWeight: 800 }}>{difAnt >= 0 ? '▲' : '▼'} {Math.abs(difAnt)}% vs {ehAtual ? 'mesmo trecho do período anterior' : 'período anterior'} ({brl(totalAnt)})</div>}
          </>}
          <div className="st-total-sub" style={{ marginTop: 2 }}>
            {carregando ? <span><i className="fas fa-circle-notch fa-spin" /> atualizando…</span>
              : atualizadoHa != null && <button type="button" className="st-link" onClick={onAtualizar} title="Buscar os números mais novos"><i className="fas fa-rotate" /> {atualizadoHa < 1 ? 'atualizado agora' : `atualizado há ${atualizadoHa} min`}</button>}
            {!ehAtual && <button type="button" className="st-link" onClick={() => escolher(escala, hoje)}><i className="fas fa-location-crosshairs" /> voltar para agora</button>}
          </div>
        </div>
      </div>

      {/* comparar com o passado */}
      {nivel !== 'anos' && (
        <div className="st-comp">
          <span><i className="fas fa-clock-rotate-left" /> Comparar com</span>
          {([['nao', 'nada'], ...(nivel === 'dias' ? [['anterior', 'mês anterior']] : []), ['ano', 'ano passado']] as [Comparar, string][]).map(([k, r]) => (
            <button key={k} type="button" className={modoComp === k ? 'on' : ''} onClick={() => mudarComparar(k)}>{r}</button>
          ))}
          {modoComp !== 'nao' && <span className="st-comp-leg"><i className="st-comp-cor" /> {rotComp} <i className="st-comp-cor st-comp-cor-atual" /> agora</span>}
        </div>
      )}

      {/* fita */}
      <div className={`st-fita-borda ${destaque ? 'st-com-destaque' : ''}`} onMouseLeave={() => setDica(null)}>
        <div key={`${nivel}:${nivel === 'anos' ? '' : nivel === 'meses' ? refDia.slice(0, 4) : refDia.slice(0, 7)}`} className="st-fita" tabIndex={0}
          onWheel={(e) => {
            if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) return
            const agora = Date.now(); if (agora - rodaEm.current < 160) return
            rodaEm.current = agora; lado(e.deltaY > 0 ? 1 : -1)
          }}
          style={{ gridTemplateColumns: `repeat(${barras.length}, minmax(0, 1fr))` }}>
          {barras.map((b, i) => {
            const sel = selecionada(b) || noAno(b)
            return (
              <button key={b.chave} type="button" className={`st-col ${sel ? 'st-sel' : ''} ${b.fimDeSemana ? 'st-fds' : ''}`} disabled={b.futuro}
                style={{ animationDelay: `${Math.min(i, 31) * 12}ms` }}
                onMouseMove={(e) => { const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect(); setDica({ b, x: Math.min(Math.max(e.clientX - r.left, 90), r.width - 90) }) }}
                onClick={() => escolher(b.escala, b.de)}>
                <span className="st-valor">{melhor === b && b.bruto > 0 && <i className="fas fa-crown st-coroa" title="melhor período" />}{b.bruto ? fmtK(b.bruto) : ''}</span>
                <span className="st-pilar">
                  {passado[i] != null && <span className="st-fantasma" style={{ height: `${passado[i]! > 0 ? Math.max(4, (passado[i]! / max) * 100) : 0}%`, animationDelay: `${Math.min(i, 31) * 18}ms` }} title={`${rotComp}: ${brl(passado[i]!)}`}>{passado[i]! > 0 && <em>{fmtK(passado[i]!)}</em>}</span>}
                  <span className="st-barra" style={{ height: `${b.bruto ? Math.max(5, (b.bruto / max) * 100) : 2}%`, animationDelay: `${Math.min(i, 31) * 18 + 60}ms` }} />
                </span>
                <span className="st-rot">{b.curto}</span>
              </button>
            )
          })}
          {!porDia && <div className="st-espera">carregando o histórico…</div>}
          {porDia && media > 0 && <div className="st-media" style={{ bottom: 20 + (media / max) * 80 }}><span>média {brl(media)}</span></div>}
        </div>

        {nivel === 'dias' && (
          <div className="st-semanas" style={{ gridTemplateColumns: `repeat(${barras.length}, minmax(0, 1fr))` }}>
            {semanas.map((s) => {
              const sel = escala === 'semana' && periodo.de === s.de
              return (
                <button key={s.de} type="button" className={`st-semana ${sel ? 'st-semana-sel' : ''}`} disabled={s.de > hoje}
                  style={{ gridColumn: `${s.ini + 1} / ${s.fim + 2}` }} onClick={() => escolher('semana', s.de)} title="Ver a semana inteira">
                  {s.rotulo}
                </button>
              )
            })}
          </div>
        )}

        {dica && (
          <div className="st-dica" style={{ left: dica.x }}>
            <b>{dica.b.rotulo}</b>
            <span>{brl(dica.b.bruto)} · {horas(dica.b.horas)} · {dica.b.os} OS</span>
            {(() => { const pv = passado[barras.indexOf(dica.b)]; if (pv == null) return null; const dif = pv > 0 ? Math.round(((dica.b.bruto - pv) / pv) * 100) : null
              return <span style={{ color: dif == null ? undefined : dif >= 0 ? '#047857' : '#b91c1c', fontWeight: 800 }}>{rotComp}: {brl(pv)}{dif != null ? ` · ${dif >= 0 ? '▲' : '▼'} ${Math.abs(dif)}%` : ''}</span> })()}
            {!dica.b.futuro && <em>{dica.b.escala === 'dia' ? 'clique para ver o dia' : 'clique para entrar'}</em>}
          </div>
        )}
      </div>
    </div>
  )
}

const ESTILO = `
.st-caixa { position: relative; min-width: 0; max-width: 100% }
.st-esq { flex: 1 1 420px; min-width: 0 }
.st-linha1 { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; justify-content: space-between }
.st-atalhos { display: flex; gap: 6px; flex-wrap: wrap; padding-bottom: 8px }
.st-atalhos button { border: 1px solid var(--portal-border, #e2e8f0); background: transparent; border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 13px; font-weight: 700; color: var(--portal-text-muted, #475569); cursor: pointer; transition: all .15s; white-space: nowrap }
.st-atalhos button:hover { border-color: #0369a1; color: #0369a1 }
.st-atalhos button.on { background: #0369a1; border-color: #0369a1; color: #fefefe }
.st-passo-on { color: #0369a1 }
.st-titulo-linha { position: relative; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 2px }
.st-titulo { display: inline-flex; align-items: center; gap: 10px; border: 1px solid transparent; background: transparent; border-radius: 12px; padding: 4px 10px; font-family: inherit; font-size: 24px; font-weight: 900; color: var(--portal-text, #0f172a); cursor: pointer; text-transform: capitalize; transition: background .15s, border-color .15s }
.st-titulo span { animation: stEntra .3s cubic-bezier(.2,.8,.2,1) both }
.st-titulo i { font-size: 15px; color: #0369a1 }
.st-titulo:hover, .st-titulo.on { background: #eff6ff; border-color: #bfdbfe }
.st-seta { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #334155); cursor: pointer; flex-shrink: 0; transition: all .15s }
.st-seta:hover:not(:disabled) { border-color: #0369a1; color: #0369a1; transform: scale(1.06) }
.st-seta:disabled { opacity: .3; cursor: default }
.cal-fora { position: fixed; inset: 0; z-index: 40 }
.cal { position: absolute; top: calc(100% + 8px); left: 40px; z-index: 41; width: 340px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 18px; padding: 14px; box-shadow: 0 24px 60px rgba(15,23,42,.22); animation: calAbre .25s cubic-bezier(.2,1.1,.3,1) both }
@keyframes calAbre { from { opacity: 0; transform: translateY(-8px) scale(.97) } to { opacity: 1; transform: none } }
.cal-cab { display: flex; align-items: center; justify-content: space-between; gap: 8px }
.cal-titulo { display: flex; gap: 6px }
.cal-titulo button { border: none; background: transparent; font-family: inherit; font-size: 17px; font-weight: 900; color: var(--portal-text, #0f172a); cursor: pointer; border-radius: 8px; padding: 2px 6px; text-transform: capitalize }
.cal-titulo button:hover { background: #eff6ff; color: #0369a1 }
.cal-total { text-align: center; font-size: 12.5px; color: var(--portal-text-muted, #64748b); margin: 4px 0 8px }
.cal-grade { display: grid; grid-template-columns: 46px repeat(7, 1fr); gap: 4px }
.cal-dsem { font-size: 10.5px; font-weight: 800; text-transform: uppercase; color: var(--portal-text-muted, #94a3b8); text-align: center }
.cal-sem { border: 1px solid var(--portal-border, #e2e8f0); background: transparent; border-radius: 8px; font-family: inherit; font-size: 10.5px; font-weight: 800; color: var(--portal-text-muted, #64748b); cursor: pointer }
.cal-sem:hover:not(:disabled), .cal-sem.on { background: #0369a1; border-color: #0369a1; color: #fefefe }
.cal-sem:disabled { opacity: .3 }
.cal-dia { aspect-ratio: 1; border: 2px solid transparent; border-radius: 9px; font-family: inherit; font-size: 12.5px; font-weight: 800; color: var(--portal-text, #0f172a); cursor: pointer; transition: transform .12s }
.cal-dia:hover:not(:disabled) { transform: scale(1.12); border-color: #0f172a }
.cal-dia:disabled { opacity: .25; cursor: default }
.cal-dia.fora { opacity: .3 }
.cal-dia.sel { border-color: #f59e0b }
.cal-dia.hoje { box-shadow: inset 0 0 0 2px #16a34a }
.cal-leg { display: flex; align-items: center; gap: 4px; justify-content: center; margin-top: 10px; font-size: 11px; color: var(--portal-text-muted, #94a3b8) }
.cal-leg i { width: 14px; height: 14px; border-radius: 4px; display: inline-block }
@media (max-width: 720px) { .st-titulo { font-size: 18px } .cal { left: 0; width: min(340px, calc(100vw - 40px)) } .st-atalhos { overflow-x: auto; flex-wrap: nowrap; max-width: 100% } }

.st-caixa { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 12px 18px 12px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(15,23,42,.05) }
.st-topo { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; justify-content: space-between }
.st-abas { position: relative; display: inline-flex; gap: 22px; border-bottom: 1px solid var(--portal-border, #e5e7eb); margin-bottom: 8px }
.st-abas button { border: none; background: transparent; font-family: inherit; font-size: 15.5px; font-weight: 700; color: var(--portal-text-muted, #64748b); padding: 6px 2px 9px; cursor: pointer; transition: color .2s }
.st-abas button:hover { color: var(--portal-text, #0f172a) }
.st-abas .st-aba-on { color: ${AZUL}; font-weight: 900 }
.st-traco { position: absolute; bottom: -1px; height: 3px; border-radius: 3px 3px 0 0; background: ${AZUL}; transition: left .35s cubic-bezier(.3,1.3,.5,1), width .35s cubic-bezier(.3,1.3,.5,1) }
.st-trilha { display: flex; align-items: center; flex-wrap: wrap; gap: 2px }
.st-sep { font-size: 11px; color: var(--portal-text-muted, #94a3b8); margin: 0 6px }
.st-passo { border: none; background: transparent; font-family: inherit; font-size: 15px; font-weight: 700; color: var(--portal-text-muted, #64748b); cursor: pointer; padding: 3px 6px; border-radius: 8px; text-transform: capitalize; transition: background .15s, color .15s }
.st-passo:hover { background: var(--portal-bg-secondary, #f1f5f9); color: ${AZUL} }
@keyframes stEntra { from { opacity: 0; transform: translateY(5px) } to { opacity: 1; transform: none } }
.st-vivo { display: inline-flex; align-items: center; gap: 6px; margin-left: 10px; font-size: 13px; font-weight: 700; color: #16a34a }
.st-vivo span { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; display: inline-block }
.st-total { text-align: right; padding-top: 4px; flex: 0 1 auto; min-width: 0; max-width: 100% }
.st-total-valor { font-size: 28px; font-weight: 900; color: var(--portal-text, #0f172a); font-variant-numeric: tabular-nums; line-height: 1.1 }
.st-total-sub { font-size: 13.5px; color: var(--portal-text-muted, #64748b); display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap }
.st-link { border: none; background: transparent; cursor: pointer; font-family: inherit; font-size: 13px; color: var(--portal-text-muted, #64748b); padding: 2px 6px; border-radius: 6px }
.st-link:hover { background: var(--portal-bg-secondary, #f1f5f9); color: ${AZUL} }
.st-fita-borda { position: relative; margin-top: 12px }
.st-destaque { margin-left: 10px; font-size: 13px; font-weight: 800; color: #7c3aed; background: #f5f3ff; border-radius: 99px; padding: 3px 10px; animation: stEntra .3s ease both }
.st-com-destaque .st-barra { background: #ddd6fe }
.st-com-destaque .st-sel .st-barra, .st-com-destaque .st-sel:hover .st-barra { background: #7c3aed !important }
.st-com-destaque .st-sel .st-rot, .st-com-destaque .st-sel .st-valor { color: #7c3aed }
.st-fita { position: relative; display: grid; gap: 4px; height: 118px; align-items: end; outline: none; animation: stZoom .35s cubic-bezier(.2,.8,.2,1) both }
@keyframes stZoom { from { opacity: 0; transform: scale(.95) } to { opacity: 1; transform: none } }
.st-media { position: absolute; left: 0; right: 0; border-top: 2px dashed rgba(245,158,11,.7); pointer-events: none; z-index: 1; transition: bottom .4s cubic-bezier(.2,.8,.2,1) }
.st-media span { position: absolute; right: 0; top: -20px; font-size: 11px; font-weight: 800; color: #b45309; background: var(--portal-bg-card, #fefefe); padding: 1px 6px; border-radius: 6px }
.st-coroa { color: #eab308; margin-right: 3px; font-size: 10px }
.st-col .st-valor:has(.st-coroa) { opacity: 1 }
.st-espera { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--portal-text-muted, #94a3b8) }
.st-col { height: 100%; min-width: 0; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; border: none; background: transparent; padding: 0; cursor: pointer; font-family: inherit; border-radius: 8px; transition: background .15s; animation: stSobe .4s cubic-bezier(.2,.8,.2,1) both }
@keyframes stSobe { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
.st-col:hover:not(:disabled) { background: var(--portal-bg-secondary, #f1f5f9) }
.st-col:disabled { cursor: default; opacity: .35 }
.st-valor { font-size: 11px; font-weight: 800; color: var(--portal-text-muted, #64748b); height: 14px; line-height: 14px; white-space: nowrap; animation: stEntra .4s .35s ease both }
.st-pilar { position: relative; width: 100%; flex: 1; display: flex; align-items: flex-end; justify-content: center; gap: 2px; max-height: calc(100% - 38px); min-height: 2px }
.st-fantasma { position: relative; width: 34%; max-width: 20px; border-radius: 4px 4px 1px 1px; background: repeating-linear-gradient(135deg, rgba(148,163,184,.45) 0 3px, rgba(148,163,184,.2) 3px 6px); border: 1px dashed #94a3b8; transform-origin: bottom; animation: stCresce .7s cubic-bezier(.2,.8,.2,1) both }
.st-fantasma em { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); font-size: 9.5px; font-style: normal; font-weight: 700; color: #94a3b8; white-space: nowrap }
.st-comp { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 10px; font-size: 12.5px; color: var(--portal-text-muted, #64748b); font-weight: 700 }
.st-comp button { border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: var(--portal-text-muted, #475569); border-radius: 99px; padding: 3px 11px; font-family: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; transition: all .15s }
.st-comp button.on { background: ${AZUL}; border-color: ${AZUL}; color: #fefefe }
.st-comp-leg { margin-left: 8px; display: inline-flex; align-items: center; gap: 5px; font-weight: 600 }
.st-comp-cor { width: 12px; height: 10px; border-radius: 2px; border: 1px dashed #94a3b8; background: rgba(148,163,184,.35); display: inline-block }
.st-comp-cor-atual { border: none; background: ${AZUL}; margin-left: 6px }
@keyframes stCresce { from { transform: scaleY(0) } to { transform: scaleY(1) } }
.st-sel .st-valor { color: ${AZUL} }
.st-barra { width: 72%; max-width: 46px; min-height: 2px; border-radius: 5px 5px 2px 2px; background: #cbd5e1; transition: height .5s cubic-bezier(.2,.8,.2,1), background .15s; transform-origin: bottom; animation: stCresce .7s cubic-bezier(.2,.8,.2,1) both }
.st-fantasma + .st-barra { width: 46%; max-width: 26px }
.st-col:hover:not(:disabled) .st-barra { background: #94a3b8 }
.st-sel .st-barra, .st-sel:hover .st-barra { background: ${AZUL} !important }
.st-fds .st-barra { background: #e2e8f0 }
.st-rot { font-size: 13px; font-weight: 700; color: var(--portal-text-muted, #64748b); height: 16px; line-height: 16px; white-space: nowrap; text-transform: capitalize }
.st-fds .st-rot { color: var(--portal-text-muted, #cbd5e1) }
.st-sel .st-rot { color: ${AZUL}; font-weight: 900 }
.st-semanas { display: grid; gap: 4px; margin-top: 6px }
.st-semana { border: 1px solid var(--portal-border, #e2e8f0); border-top: 3px solid #cbd5e1; background: transparent; border-radius: 0 0 8px 8px; font-family: inherit; font-size: 12.5px; font-weight: 700; color: var(--portal-text-muted, #64748b); padding: 4px 0; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: background .15s, color .15s, border-color .15s }
.st-semana:hover:not(:disabled) { background: var(--portal-bg-secondary, #f1f5f9); color: ${AZUL}; border-top-color: ${AZUL} }
.st-semana:disabled { opacity: .35; cursor: default }
.st-semana-sel { background: rgba(3,105,161,.08); color: ${AZUL}; border-top-color: ${AZUL}; font-weight: 900 }
.st-dica { position: absolute; bottom: calc(100% + 4px); transform: translateX(-50%); pointer-events: none; background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #0f172a); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 10px; padding: 8px 12px; font-size: 13px; white-space: nowrap; display: grid; gap: 2px; box-shadow: 0 10px 26px rgba(15,23,42,.14); z-index: 5 }
.st-dica b { text-transform: capitalize }
.st-dica span { color: var(--portal-text-muted, #475569) }
.st-dica em { font-size: 11.5px; color: ${AZUL}; font-style: normal; font-weight: 700 }
@media (max-width: 720px) { .st-passo-atual { font-size: 18px } .st-total { text-align: left } .st-total-sub { justify-content: flex-start } .st-rot { font-size: 10.5px } .st-fita { gap: 2px } .st-abas { gap: 14px } }
@media (prefers-reduced-motion: reduce) { .st-fita, .st-col, .st-passo-atual, .st-traco, .st-barra, .st-fantasma, .st-valor { animation: none !important; transition: none !important } }
`

const MESES_NOME = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/** Calendário de calor: cada dia pintado pelo faturamento. Clica no dia, na semana, no mês ou no ano. */
function Calendario({ mes, setMes, porDia, periodo, hoje, onEscolher, onFechar }: {
  mes: string; setMes: (m: string) => void; porDia: PorDia; periodo: { de: string; ate: string }; hoje: string
  onEscolher: (e: Escala, ref: string) => void; onFechar: () => void
}) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f)
  }, [onFechar])
  const [a, m] = mes.split('-').map(Number)
  const ini = `${mes}-01`
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const fim = `${mes}-${String(ultimo).padStart(2, '0')}`
  const seg0 = segundaDa(ini)
  const semanas: string[][] = []
  for (let s = seg0; s <= fim; s = somarDias(s, 7)) semanas.push(Array.from({ length: 7 }, (_, i) => somarDias(s, i)))
  const totalMes = somar(porDia, ini, fim)
  const max = Math.max(1, ...semanas.flat().filter((d) => d.startsWith(mes)).map((d) => porDia[d]?.[0] || 0))
  const cor = (v: number) => (v <= 0 ? 'var(--portal-bg-secondary, #f1f5f9)' : `rgba(3,105,161,${0.15 + 0.85 * Math.min(1, v / max)})`)
  const andar = (n: number) => { const k = a * 12 + m - 1 + n; setMes(`${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`) }
  return (
    <>
      <div className="cal-fora" onClick={onFechar} />
      <div className="cal" onClick={(e) => e.stopPropagation()}>
        <div className="cal-cab">
          <button type="button" className="st-seta" onClick={() => andar(-1)}><i className="fas fa-chevron-left" /></button>
          <div className="cal-titulo">
            <button type="button" onClick={() => onEscolher('mes', `${mes}-15` > hoje ? hoje : `${mes}-15`)} title="Ver o mês inteiro">{MESES_NOME[m - 1]}</button>
            <button type="button" onClick={() => onEscolher('ano', `${a}-06-15` > hoje ? hoje : `${a}-06-15`)} title="Ver o ano inteiro">{a}</button>
          </div>
          <button type="button" className="st-seta" onClick={() => andar(1)} disabled={`${mes}-01` > hoje.slice(0, 7) + '-01' || mes === hoje.slice(0, 7)}><i className="fas fa-chevron-right" /></button>
        </div>
        <div className="cal-total">{brl(totalMes.bruto)} no mês · {totalMes.os} OS</div>
        <div className="cal-grade">
          <span className="cal-dsem">sem.</span>
          {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => <span key={d} className="cal-dsem">{d}</span>)}
          {semanas.map((sem) => {
            const semSel = sem[0] === segundaDa(periodo.de) && periodo.ate === somarDias(periodo.de, 6)
            return (
              <span key={sem[0]} style={{ display: 'contents' }}>
                <button type="button" className={`cal-sem ${semSel ? 'on' : ''}`} disabled={sem[0] > hoje} onClick={() => onEscolher('semana', sem[0])} title="Ver a semana">
                  {sem[0].slice(8, 10)}/{sem[0].slice(5, 7)}
                </button>
                {sem.map((d) => {
                  const fora = !d.startsWith(mes), futuro = d > hoje
                  const v = porDia[d]?.[0] || 0
                  const sel = d >= periodo.de && d <= periodo.ate
                  return (
                    <button key={d} type="button" disabled={futuro} className={`cal-dia ${fora ? 'fora' : ''} ${sel ? 'sel' : ''} ${d === hoje ? 'hoje' : ''}`}
                      style={{ background: fora ? 'transparent' : cor(v), color: !fora && v > max * 0.55 ? '#fefefe' : undefined }}
                      title={`${d.slice(8, 10)}/${d.slice(5, 7)} · ${brl(v)}`} onClick={() => onEscolher('dia', d)}>
                      {Number(d.slice(8, 10))}
                    </button>
                  )
                })}
              </span>
            )
          })}
        </div>
        <div className="cal-leg"><span>menos</span>{[0, .25, .5, .75, 1].map((k) => <i key={k} style={{ background: k ? `rgba(3,105,161,${0.15 + 0.85 * k})` : 'var(--portal-bg-secondary, #f1f5f9)' }} />)}<span>mais faturamento</span></div>
      </div>
    </>
  )
}
