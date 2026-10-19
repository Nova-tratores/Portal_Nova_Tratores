'use client'
// Horas da equipe no mês, no topo de Ocorrências (José, 19/10/2026: "coloca isso aqui lá em cima, mas de
// uma forma diferente. Lá em ocorrências e tira do painel"). Mesma conta do Painel (montarPainel do mês):
// cada medidor mostra quanto daquela hora é da meta do mês.
import { useMemo } from 'react'
import { montarPainel } from '@/lib/mecanicos/painel'
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

/** mes = 'YYYY-MM' (o mês escolhido em Ocorrências). */
export default function HorasEquipe({ mes }: { mes: string }) {
  const { base } = useBasePosVendas()
  const hoje = hojeSP()
  const t = useMemo(() => {
    if (!base) return null
    const ref = hoje.startsWith(mes) ? hoje : `${mes}-15`
    return montarPainel(base, 'mes', ref, hoje).total
  }, [base, mes, hoje])
  if (!t) return <div className="he he-carr"><style>{ESTILO}</style><i className="fas fa-circle-notch fa-spin" /> carregando as horas da equipe…</div>
  const pct = (v: number) => (t.meta > 0 ? (v / t.meta) * 100 : null)
  const itens = [
    { rot: 'Faturadas', dica: 'horas cobradas nas OS faturadas', v: t.faturadas, cor: COR.faturadas, p: pct(t.faturadas) },
    { rot: 'Aguardando faturar', dica: 'OS preenchidas ainda não faturadas (contam na meta)', v: t.aguardando, cor: COR_AGUARDANDO, p: pct(t.aguardando) },
    { rot: 'Internas', dica: 'horas em OS internas (não são cobradas)', v: t.internas, cor: COR.internas, p: pct(t.internas) },
    { rot: 'Ociosas', dica: 'meta menos o que foi trabalhado', v: t.ociosas, cor: '#94a3b8', p: pct(t.ociosas) },
  ]
  return (
    <section className="he cpv-entra">
      <style>{ESTILO}</style>
      <div className="he-tit">
        <b><i className="fas fa-clock" /> Horas da equipe no mês</b>
        <small>meta {horas(t.meta)} · trabalhadas no app {horas(t.trabalhadas)} · o % é da meta do mês</small>
      </div>
      <div className="he-itens">
        {itens.map((x, i) => (
          <div key={x.rot} className="he-it" title={x.dica} style={{ animationDelay: `${i * 80}ms` }}>
            <Anel pct={x.p} cor={x.cor} atraso={i * 80} />
            <div><small>{x.rot}</small><b>{horas(x.v)}</b></div>
          </div>
        ))}
        <div className="he-it" title="km cobrados nas OS faturadas" style={{ animationDelay: '320ms' }}>
          <span className="he-km"><i className="fas fa-road" /></span>
          <div><small>Km cobrados</small><b>{kmFmt(t.km)}</b></div>
        </div>
      </div>
    </section>
  )
}

const ESTILO = `
.he { display: flex; gap: 12px 24px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; padding: 4px 2px 14px; border-bottom: 1px solid var(--portal-border, #eef2f7) }
.he-carr { font-size: 13px; color: ${MUDO} }
.he-tit { display: grid; gap: 2px; min-width: 200px } .he-tit b { font-size: 15px; color: var(--portal-text, #0f172a) } .he-tit b i { color: #0891b2; margin-right: 4px } .he-tit small { font-size: 12px; color: ${MUDO} }
.he-itens { display: flex; gap: 10px 22px; flex-wrap: wrap; align-items: center; flex: 1 }
.he-it { display: flex; gap: 10px; align-items: center; animation: cpvEntra .45s both }
.he-it small { display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: ${MUDO} } .he-it b { font-size: 18px; font-variant-numeric: tabular-nums; color: var(--portal-text, #0f172a) }
.he-anel { width: 46px; height: 46px; flex-shrink: 0 }
.he-km { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, ${COR.km} 12%, transparent); color: ${COR.km}; font-size: 17px }
`
