'use client'
// Seletor de período do Centro do Pós-Vendas (José, 16/10/2026).
//  • Abas Dia | Semana | Mês | Ano (sublinhado que desliza).
//  • Fita do tempo: cada barra é um período com a altura do que faturou; clicar ENTRA nele —
//    Anos → meses do ano → dias do mês (agrupados por semana; clicar na semana escolhe a semana).
//  • A trilha (2026 › outubro › semana…) volta de nível. Roda do mouse e ← → andam para o lado.
// Tudo calculado na tela a partir da base já baixada (sem ir ao servidor). Regras em lib/mecanicos/fita.ts.
import { useEffect, useMemo, useRef, useState } from 'react'
import { andarPeriodo, periodos, type Escala } from '@/lib/mecanicos/painel'
import { barrasFita, nivelDa, semanasDoMes, somar, trilha, type BarraFita, type PorDia } from '@/lib/mecanicos/fita'
import { brl, horas } from './ui'

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const AZUL = '#0369a1'
const ESCALAS: [Escala, string][] = [['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano']]

export default function SeletorTempo({ escala, refDia, onMudar, porDia, desde, carregando, geradoEm, onAtualizar }: {
  escala: Escala; refDia: string; onMudar: (e: Escala, ref: string) => void
  porDia: PorDia | null; desde?: string
  carregando?: boolean; geradoEm?: string | null; onAtualizar?: () => void
}) {
  const [topo, setTopo] = useState(false)
  const [dica, setDica] = useState<{ b: BarraFita; x: number } | null>(null)
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
  const max = Math.max(1, ...barras.map((b) => b.bruto))
  const periodo = periodos(escala, refDia, 1)[0]
  const total = porDia ? somar(porDia, periodo.de, periodo.ate > hoje ? hoje : periodo.ate) : null
  const ehAtual = periodo.ate >= hoje
  const passos = trilha(escala, refDia)

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
        <div style={{ minWidth: 0 }}>
          {/* escala */}
          <div className="st-abas" ref={abasRef} role="tablist">
            {ESCALAS.map(([e, rot]) => (
              <button key={e} type="button" role="tab" data-escala={e} aria-selected={escala === e && !topo} className={escala === e && !topo ? 'st-aba-on' : ''}
                onClick={() => escolher(e, refDia)}>{rot}</button>
            ))}
            {traco && !topo && <span className="st-traco" style={{ left: traco.left, width: traco.width }} />}
          </div>
          {/* trilha: clicar volta para aquele nível */}
          <nav className="st-trilha" aria-label="Período">
            {passos.map((p, i) => {
              const atual = topo ? i === 0 : i === passos.length - 1
              return (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                  {i > 0 && <i className="fas fa-chevron-right st-sep" />}
                  <button type="button" className={`st-passo ${atual ? 'st-passo-atual' : ''}`}
                    onClick={() => (p.escala ? escolher(p.escala, p.ref) : setTopo(true))}>{p.rotulo}</button>
                </span>
              )
            })}
            {ehAtual && !topo && <span className="st-vivo"><span className="cpv-pulso" /> em andamento</span>}
          </nav>
        </div>

        <div className="st-total">
          {total && !topo && <>
            <div className="st-total-valor">{brl(total.bruto)}</div>
            <div className="st-total-sub">{horas(total.horas)} cobradas · {total.os} OS faturadas</div>
          </>}
          <div className="st-total-sub" style={{ marginTop: 2 }}>
            {carregando ? <span><i className="fas fa-circle-notch fa-spin" /> atualizando…</span>
              : atualizadoHa != null && <button type="button" className="st-link" onClick={onAtualizar} title="Buscar os números mais novos"><i className="fas fa-rotate" /> {atualizadoHa < 1 ? 'atualizado agora' : `atualizado há ${atualizadoHa} min`}</button>}
            {!ehAtual && <button type="button" className="st-link" onClick={() => escolher(escala, hoje)}><i className="fas fa-location-crosshairs" /> voltar para agora</button>}
          </div>
        </div>
      </div>

      {/* fita */}
      <div className="st-fita-borda" onMouseLeave={() => setDica(null)}>
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
                <span className="st-valor">{b.bruto ? (b.bruto >= 1000 ? `${Math.round(b.bruto / 1000)}k` : Math.round(b.bruto)) : ''}</span>
                <span className="st-barra" style={{ height: `${b.bruto ? Math.max(5, (b.bruto / max) * 100) : 2}%` }} />
                <span className="st-rot">{b.curto}</span>
              </button>
            )
          })}
          {!porDia && <div className="st-espera">carregando o histórico…</div>}
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
            {!dica.b.futuro && <em>{dica.b.escala === 'dia' ? 'clique para ver o dia' : 'clique para entrar'}</em>}
          </div>
        )}
      </div>
    </div>
  )
}

const ESTILO = `
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
.st-passo-atual { font-size: 22px; font-weight: 900; color: var(--portal-text, #0f172a); animation: stEntra .3s cubic-bezier(.2,.8,.2,1) both }
@keyframes stEntra { from { opacity: 0; transform: translateY(5px) } to { opacity: 1; transform: none } }
.st-vivo { display: inline-flex; align-items: center; gap: 6px; margin-left: 10px; font-size: 13px; font-weight: 700; color: #16a34a }
.st-vivo span { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; display: inline-block }
.st-total { text-align: right; padding-top: 4px }
.st-total-valor { font-size: 28px; font-weight: 900; color: var(--portal-text, #0f172a); font-variant-numeric: tabular-nums; line-height: 1.1 }
.st-total-sub { font-size: 13.5px; color: var(--portal-text-muted, #64748b); display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap }
.st-link { border: none; background: transparent; cursor: pointer; font-family: inherit; font-size: 13px; color: var(--portal-text-muted, #64748b); padding: 2px 6px; border-radius: 6px }
.st-link:hover { background: var(--portal-bg-secondary, #f1f5f9); color: ${AZUL} }
.st-fita-borda { position: relative; margin-top: 12px }
.st-fita { position: relative; display: grid; gap: 4px; height: 118px; align-items: end; outline: none; animation: stZoom .35s cubic-bezier(.2,.8,.2,1) both }
@keyframes stZoom { from { opacity: 0; transform: scale(.95) } to { opacity: 1; transform: none } }
.st-espera { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--portal-text-muted, #94a3b8) }
.st-col { height: 100%; min-width: 0; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; border: none; background: transparent; padding: 0; cursor: pointer; font-family: inherit; border-radius: 8px; transition: background .15s; animation: stSobe .4s cubic-bezier(.2,.8,.2,1) both }
@keyframes stSobe { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: none } }
.st-col:hover:not(:disabled) { background: var(--portal-bg-secondary, #f1f5f9) }
.st-col:disabled { cursor: default; opacity: .35 }
.st-valor { font-size: 11.5px; font-weight: 700; color: var(--portal-text-muted, #94a3b8); height: 14px; line-height: 14px; white-space: nowrap; opacity: 0; transition: opacity .15s }
.st-col:hover .st-valor, .st-sel .st-valor { opacity: 1 }
.st-sel .st-valor { color: ${AZUL} }
.st-barra { width: 72%; max-width: 46px; min-height: 2px; border-radius: 5px 5px 2px 2px; background: #cbd5e1; transition: height .4s cubic-bezier(.2,.8,.2,1), background .15s; max-height: calc(100% - 38px) }
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
@media (prefers-reduced-motion: reduce) { .st-fita, .st-col, .st-passo-atual, .st-traco { animation: none !important; transition: none !important } }
`
