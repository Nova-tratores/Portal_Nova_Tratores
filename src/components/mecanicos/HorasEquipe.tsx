'use client'
// Horas da equipe no mês, no topo de Ocorrências (José, 19/10/2026: "coloca lá em cima, mas de uma forma
// diferente… pode melhorar essa visualização, com mais detalhes"). Mesma conta do Painel (montarPainel do
// mês): os anéis mostram quanto de cada tipo de hora é da meta; embaixo, cada técnico numa barra contra a
// meta dele, com o mês anterior para comparar.
import { useMemo, useState } from 'react'
import { montarPainel, SEM_META, SEM_TECNICO } from '@/lib/mecanicos/painel'
import { useBasePosVendas } from './useBasePosVendas'
import { COR, horas, kmFmt, useContador } from './ui'

const MUDO = 'var(--portal-text-muted, #64748b)'
const COR_AGUARDANDO = '#f59e0b'
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

function Anel({ pct, cor, atraso }: { pct: number | null; cor: string; atraso: number }) {
  const v = useContador(Math.max(0, Math.min(100, pct ?? 0)), 1100)
  const R = 19, C = 2 * Math.PI * R
  return (
    <svg viewBox="0 0 48 48" className="he-anel" style={{ animationDelay: `${atraso}ms` }}>
      <circle cx="24" cy="24" r={R} fill="none" stroke="var(--portal-bg-secondary, #eef2f7)" strokeWidth="5" />
      <circle cx="24" cy="24" r={R} fill="none" stroke={cor} strokeWidth="5" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - v / 100)} transform="rotate(-90 24 24)" />
      <text x="24" y="28" textAnchor="middle" fontSize="11.5" fontWeight="900" fill={cor}>{pct == null ? '—' : `${Math.round(v)}%`}</text>
    </svg>
  )
}
function Dif({ a, b, inverso }: { a: number; b: number | undefined; inverso?: boolean }) {
  if (b == null || b <= 0) return null
  const p = Math.round(((a - b) / b) * 100)
  if (!p) return <em className="he-dif">= mês anterior</em>
  const bom = inverso ? p < 0 : p > 0
  return <em className={`he-dif ${bom ? 'bom' : 'ruim'}`} title={`mês anterior: ${horas(b)}`}>{p > 0 ? '▲' : '▼'} {Math.abs(p)}%</em>
}

/** mes = 'YYYY-MM' (o mês escolhido em Ocorrências). */
export default function HorasEquipe({ mes }: { mes: string }) {
  const { base } = useBasePosVendas()
  const [aberto, setAberto] = useState(true)
  const hoje = hojeSP()
  const d = useMemo(() => {
    if (!base) return null
    const ref = hoje.startsWith(mes) ? hoje : `${mes}-15`
    return montarPainel(base, 'mes', ref, hoje)
  }, [base, mes, hoje])
  if (!d) return <div className="he he-carr"><style>{ESTILO}</style><i className="fas fa-circle-notch fa-spin" /> carregando as horas da equipe…</div>
  const t = d.total
  const ant = d.serie.length >= 2 ? d.serie[d.serie.length - 2] : null
  const tAnt = ant?.total
  const pct = (v: number) => (t.meta > 0 ? (v / t.meta) * 100 : null)
  const itens = [
    { rot: 'Faturadas', dica: 'horas cobradas nas OS faturadas', v: t.faturadas, cor: COR.faturadas, p: pct(t.faturadas), a: tAnt?.faturadas },
    { rot: 'Aguardando faturar', dica: 'OS preenchidas ainda não faturadas (contam na meta)', v: t.aguardando, cor: COR_AGUARDANDO, p: pct(t.aguardando), a: tAnt?.aguardando },
    { rot: 'Internas', dica: 'horas em OS internas (não são cobradas)', v: t.internas, cor: COR.internas, p: pct(t.internas), a: tAnt?.internas, inverso: true },
    { rot: 'Ociosas', dica: 'meta menos o que foi trabalhado', v: t.ociosas, cor: '#94a3b8', p: pct(t.ociosas), a: tAnt?.ociosas, inverso: true },
  ]
  const naMeta = pct(t.faturadas + t.aguardando)
  const tecs = d.linhas.filter((l) => l.tecnico !== SEM_TECNICO && !SEM_META.has(l.tecnico))
    .map((l) => ({ l, ant: ant?.porTecnico[l.tecnico], p: l.meta > 0 ? ((l.faturadas + l.aguardando) / l.meta) * 100 : 0 }))
    .sort((a, b) => b.p - a.p)
  return (
    <section className="he cpv-entra">
      <style>{ESTILO}</style>
      <div className="he-topo">
        <div className="he-tit">
          <b><i className="fas fa-clock" /> Horas da equipe no mês</b>
          <small>meta {horas(t.meta)} ({tecs.length} técnicos) · trabalhadas no app {horas(t.trabalhadas)} · o % é da meta do mês</small>
          {naMeta != null && <span className="he-meta"><b>{Math.round(naMeta)}%</b> da meta já feita (faturadas + aguardando faturar)</span>}
        </div>
        <div className="he-itens">
          {itens.map((x, i) => (
            <div key={x.rot} className="he-it" title={x.dica} style={{ animationDelay: `${i * 80}ms` }}>
              <Anel pct={x.p} cor={x.cor} atraso={i * 80} />
              <div><small>{x.rot}</small><b>{horas(x.v)}</b><Dif a={x.v} b={x.a} inverso={x.inverso} /></div>
            </div>
          ))}
          <div className="he-it" title="km cobrados nas OS faturadas" style={{ animationDelay: '320ms' }}>
            <span className="he-km"><i className="fas fa-road" /></span>
            <div><small>Km cobrados</small><b>{kmFmt(t.km)}</b>{tAnt && tAnt.km > 0 && <em className={`he-dif ${t.km >= tAnt.km ? 'bom' : 'ruim'}`}>{t.km >= tAnt.km ? '▲' : '▼'} {Math.abs(Math.round(((t.km - tAnt.km) / tAnt.km) * 100))}%</em>}</div>
          </div>
        </div>
      </div>

      <button type="button" className="he-abre" onClick={() => setAberto((v) => !v)}>
        <i className={`fas fa-chevron-${aberto ? 'up' : 'down'}`} /> {aberto ? 'esconder' : 'ver'} por técnico
      </button>
      {aberto && (
        <div className="he-tecs">
          <div className="he-leg">
            <span><i style={{ background: COR.faturadas }} /> faturadas</span><span><i style={{ background: COR_AGUARDANDO }} /> aguardando faturar</span>
            <span><i style={{ background: COR.internas }} /> internas</span><span><i style={{ background: '#cbd5e1' }} /> ociosas</span><span className="he-leg-meta">│ meta do mês</span>
          </div>
          {tecs.map(({ l, ant: la, p }, i) => {
            const escala = Math.max(l.meta, l.faturadas + l.aguardando + l.internas + l.ociosas, 1) * 1.08
            const w = (v: number) => `${(v / escala) * 100}%`
            const pAnt = la && l.meta > 0 ? Math.round(((la.faturadas + (la.aguardando || 0)) / l.meta) * 100) : null
            return (
              <div key={l.tecnico} className="he-tec" style={{ animationDelay: `${i * 60}ms` }}>
                <div className="he-tec-n"><b>{l.tecnico}</b><small>meta {horas(l.meta)}</small></div>
                <div className="he-tec-barra" title={`faturadas ${horas(l.faturadas)} · aguardando ${horas(l.aguardando)} · internas ${horas(l.internas)} · ociosas ${horas(l.ociosas)}`}>
                  <i style={{ width: w(l.faturadas), background: COR.faturadas, animationDelay: `${i * 60}ms` }} />
                  <i style={{ width: w(l.aguardando), background: COR_AGUARDANDO, animationDelay: `${i * 60 + 80}ms` }} />
                  <i style={{ width: w(l.internas), background: COR.internas, animationDelay: `${i * 60 + 160}ms` }} />
                  <i style={{ width: w(l.ociosas), background: '#cbd5e1', animationDelay: `${i * 60 + 240}ms` }} />
                  <u style={{ left: w(l.meta) }} />
                </div>
                <div className="he-tec-p" style={{ color: p >= 80 ? '#047857' : p >= 50 ? '#b45309' : '#b91c1c' }}><b>{Math.round(p)}%</b><small>{pAnt != null ? `mês ant. ${pAnt}%` : 'da meta'}</small></div>
                <div className="he-tec-nums">
                  <span title="faturadas"><i style={{ background: COR.faturadas }} />{horas(l.faturadas)}</span>
                  <span title="aguardando faturar"><i style={{ background: COR_AGUARDANDO }} />{horas(l.aguardando)}</span>
                  <span title="internas"><i style={{ background: COR.internas }} />{horas(l.internas)}</span>
                  <span title="km cobrados"><i className="fas fa-road" style={{ color: COR.km }} />{kmFmt(l.km)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

const ESTILO = `
.he { display: grid; gap: 10px; margin-bottom: 16px; padding: 4px 2px 14px; border-bottom: 1px solid var(--portal-border, #eef2f7) }
.he-carr { font-size: 13px; color: ${MUDO} }
.he-topo { display: flex; gap: 12px 24px; align-items: center; flex-wrap: wrap }
.he-tit { display: grid; gap: 2px; min-width: 220px } .he-tit > b { font-size: 15px; color: var(--portal-text, #0f172a) } .he-tit > b i { color: #0891b2; margin-right: 4px } .he-tit small { font-size: 12px; color: ${MUDO} }
.he-meta { font-size: 12.5px; color: var(--portal-text, #334155) } .he-meta b { color: #0891b2; font-size: 14px }
.he-itens { display: flex; gap: 10px 22px; flex-wrap: wrap; align-items: center; flex: 1 }
.he-it { display: flex; gap: 10px; align-items: center; animation: cpvEntra .45s both }
.he-it small { display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: ${MUDO} } .he-it b { font-size: 18px; font-variant-numeric: tabular-nums; color: var(--portal-text, #0f172a); margin-right: 6px }
.he-dif { font-style: normal; font-size: 11.5px; font-weight: 900; border-radius: 99px; padding: 0 7px; color: ${MUDO}; background: var(--portal-bg-secondary, #f1f5f9) } .he-dif.bom { color: #047857; background: #ecfdf5 } .he-dif.ruim { color: #b91c1c; background: #fef2f2 }
.he-anel { width: 46px; height: 46px; flex-shrink: 0 }
.he-km { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, ${COR.km} 12%, transparent); color: ${COR.km}; font-size: 17px }
.he-abre { justify-self: start; border: none; background: transparent; color: #0369a1; font-family: inherit; font-size: 12.5px; font-weight: 800; cursor: pointer; padding: 2px 0 }
.he-tecs { display: grid; gap: 6px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 12px 14px; animation: cpvEntra .35s both }
.he-leg { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: ${MUDO}; margin-bottom: 4px } .he-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px } .he-leg-meta { font-weight: 900; color: #0f172a }
.he-tec { display: grid; grid-template-columns: minmax(130px, 170px) minmax(0, 1fr) 80px minmax(0, 300px); gap: 12px; align-items: center; padding: 5px 0; border-top: 1px solid var(--portal-border, #f1f5f9); animation: cpvEntra .4s both }
.he-tec-n b { display: block; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .he-tec-n small { font-size: 11.5px; color: ${MUDO} }
.he-tec-barra { position: relative; display: flex; height: 14px; border-radius: 99px; background: var(--portal-bg-secondary, #f1f5f9) }
.he-tec-barra > i { display: block; height: 100%; transform-origin: left; animation: heLado .8s cubic-bezier(.2,.8,.2,1) both } .he-tec-barra > i:first-child { border-radius: 99px 0 0 99px } @keyframes heLado { from { transform: scaleX(0) } }
.he-tec-barra > u { position: absolute; top: -4px; bottom: -4px; width: 2px; border-radius: 2px; background: #0f172a }
.he-tec-p { display: grid; text-align: right } .he-tec-p b { font-size: 17px; font-variant-numeric: tabular-nums } .he-tec-p small { font-size: 11px; color: ${MUDO} }
.he-tec-nums { display: flex; gap: 4px 12px; flex-wrap: wrap; font-size: 12.5px; font-variant-numeric: tabular-nums; color: var(--portal-text, #334155) } .he-tec-nums span { display: inline-flex; gap: 5px; align-items: center } .he-tec-nums i { width: 8px; height: 8px; border-radius: 2px; font-size: 11px }
.he-tec-nums i.fas { width: auto; height: auto }
@media (max-width: 900px) { .he-tec { grid-template-columns: 1fr 70px } .he-tec-barra { grid-column: 1 / -1; grid-row: 2 } .he-tec-nums { grid-column: 1 / -1 } }
`
