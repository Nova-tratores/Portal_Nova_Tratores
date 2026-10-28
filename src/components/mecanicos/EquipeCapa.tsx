'use client'
// Capa da equipe (José, 28/10/2026): "uma capa que mostra as horas e os km que a equipe toda fez, juntando todos os
// mecânicos, com o esperado, bem explicado, num gráfico, e a opção de abrir os cartões por técnico" — no lugar da
// caixinha (que virou ícone nos atalhos). Mesma conta das horas do resto da aba (useHorasEquipe).
import { useState } from 'react'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { somarDias } from '@/lib/mecanicos/painel'
import { useHorasEquipe, C6, META_SEM, ESTILO_HO, ESTILO_HC } from './HorasOpcoes'
import { useComAguardando, CaixaAguardando } from './useComAguardando'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const h1 = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString('pt-BR')}`
const corPct = (p: number) => (p >= 100 ? '#047857' : p >= 70 ? '#b45309' : '#b91c1c')
const uteisEntre = (de: string, ate: string) => { let k = 0; for (let x = de; x <= ate; x = somarDias(x, 1)) { const w = new Date(`${x}T12:00:00Z`).getUTCDay(); if (w > 0 && w < 6) k++ } return k }

export default function EquipeCapa({ mes }: { mes: string }) {
  const comAg = useComAguardando()
  const d = useHorasEquipe(mes, comAg)
  const [abrir, setAbrir] = useState(false)
  if (!d) return <section className="eqc"><style>{ESTILO_EQC}</style><div className="eqc-carr"><i className="fas fa-circle-notch fa-spin" /> carregando as horas da equipe…</div></section>
  const hoje = hojeSP()
  const n = d.tecs.length
  // esperado: 4 h por dia útil de cada mecânico (20 h/semana = básica); ideal 8 h
  const diaBas = (META_SEM.basH / 5) * n, diaIde = (META_SEM.ideH / 5) * n
  const semanas = (d.tecs[0]?.semanas || []).map((w, k) => {
    const uteis = w.uteis ?? 5
    const passados = w.fechada ? uteis : w.atual ? uteisEntre(w.de, hoje) : 0
    return { rot: w.rot, feito: Math.round(d.tecs.reduce((s, t) => s + t.semanas[k].horas, 0) * 10) / 10, basica: uteis * diaBas, ideal: uteis * diaIde, ateHoje: passados * diaBas }
  })
  const esperadoHoje = d.atual ? semanas.reduce((s, w) => s + w.ateHoje, 0) : d.basica
  const pBas = d.basica ? (d.feitas / d.basica) * 100 : 0
  const ritmo = esperadoHoje ? (d.feitas / esperadoHoje) * 100 : 0
  const bateram = d.tecs.filter((t) => t.pBas >= 100).length
  const varH = d.antFeitas ? Math.round(((d.feitas - d.antFeitas) / d.antFeitas) * 100) : null
  const kmPorH = d.feitas ? d.km / d.feitas : 0
  const pos = (v: number) => `${Math.min(100, (v / Math.max(1, d.ideal)) * 100)}%`
  return (
    <section className="eqc cpv-entra">
      <style>{ESTILO_EQC}</style>
      <div className="eqc-topo">
        <span className="eqc-t">A equipe toda em {MESES[Number(mes.slice(5, 7)) - 1]} · {n} mecânicos somados</span>
        <CaixaAguardando />
      </div>
      <div className="eqc-corpo">
        <div className="eqc-nums">
          <div className="eqc-n">
            <small>Horas feitas</small>
            <b>{h1(d.feitas)} h</b>
            <i className="eqc-bar"><u style={{ width: pos(d.feitas) }} /><s style={{ left: pos(d.basica) }} title={`meta básica: ${h1(d.basica)} h`} />{d.atual && <s className="hoje" style={{ left: pos(esperadoHoje) }} title={`onde deveria estar hoje: ${h1(esperadoHoje)} h`} />}</i>
            <span><em style={{ color: corPct(pBas) }}>{Math.round(pBas)}%</em> da meta básica do mês ({h1(d.basica)} h) · a ideal é {h1(d.ideal)} h</span>
          </div>
          {d.atual && (
            <div className="eqc-n">
              <small>Ritmo até hoje</small>
              <b style={{ color: corPct(ritmo) }}>{Math.round(ritmo)}%</b>
              <span>para chegar na básica, hoje a equipe deveria estar em <b>{h1(esperadoHoje)} h</b> · está {d.feitas >= esperadoHoje ? `${h1(d.feitas - esperadoHoje)} h à frente` : `${h1(esperadoHoje - d.feitas)} h atrás`}</span>
            </div>
          )}
          <div className="eqc-n">
            <small>Km rodados</small>
            <b>{Math.round(d.km).toLocaleString('pt-BR')} km</b>
            <span>{kmPorH ? `${h1(kmPorH)} km para cada hora feita` : 'nenhuma hora feita ainda'}</span>
          </div>
          <div className="eqc-n">
            <small>Mecânicos na meta</small>
            <b>{bateram} <span className="de">de {n}</span></b>
            <span>bateram a básica do mês{varH != null && <> · horas <em style={{ color: varH >= 0 ? '#047857' : '#b91c1c' }}>{varH >= 0 ? '+' : ''}{varH}%</em> contra o mês passado</>}</span>
          </div>
        </div>
        <div className="eqc-graf">
          <div className="eqc-leg"><span><i style={{ background: '#2563eb' }} />feito pela equipe</span><span><i style={{ background: '#cbd5e1' }} />esperado (básica)</span><span><i className="linha" />ideal</span></div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <ComposedChart data={semanas} margin={{ top: 6, right: 8, left: -12, bottom: 0 }} barGap={3}>
                <CartesianGrid vertical={false} stroke="#eef2f6" />
                <XAxis dataKey="rot" tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} unit=" h" />
                <Tooltip formatter={(v, nm) => [`${h1(Number(v))} h`, nm === 'feito' ? 'Feito pela equipe' : nm === 'basica' ? 'Esperado (básica)' : 'Ideal']} labelFormatter={(l) => `Semana ${l}`} />
                <Bar dataKey="basica" fill="#cbd5e1" radius={[6, 6, 0, 0]} maxBarSize={34} />
                <Bar dataKey="feito" fill="#2563eb" radius={[6, 6, 0, 0]} maxBarSize={34} />
                <Line dataKey="ideal" stroke="#7c3aed" strokeDasharray="5 4" dot={false} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="eqc-exp">Em cada semana, a barra azul são as horas cobradas por <b>todos os mecânicos juntos</b> e a cinza é o esperado: <b>4 h por dia útil de cada um</b> (20 h por semana, a meta básica). A linha roxa é a ideal (8 h por dia útil). Semana cortada no começo ou no fim do mês vale pelos dias úteis dela. {comAg ? 'Inclui as OS preenchidas que ainda esperam faturar.' : 'Conta só as OS já faturadas.'}</p>
        </div>
      </div>
      <button type="button" className={`eqc-abrir ${abrir ? 'on' : ''}`} onClick={() => setAbrir((v) => !v)}>
        <i className={`fas fa-chevron-${abrir ? 'up' : 'down'}`} /> {abrir ? 'Esconder os cartões por mecânico' : `Ver por mecânico (${n} cartões)`}
      </button>
      {abrir && <div className="eqc-cartoes" key={String(comAg)}><style>{ESTILO_HO}</style><style>{ESTILO_HC}</style><C6 d={d} /></div>}
    </section>
  )
}

const ESTILO_EQC = `
.eqc { display: grid; gap: 14px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 18px; padding: 18px 20px }
.eqc-carr { padding: 30px; text-align: center; color: #475569 }
.eqc-topo { display: flex; gap: 10px 16px; align-items: center; justify-content: space-between; flex-wrap: wrap } .eqc-t { font-size: 15px; color: #334155 }
.eqc-corpo { display: grid; grid-template-columns: minmax(280px, 1fr) minmax(0, 1.6fr); gap: 24px; align-items: start }
.eqc-nums { display: grid; gap: 12px }
.eqc-n { display: grid; gap: 3px } .eqc-n + .eqc-n { border-top: 1px solid #f1f5f9; padding-top: 12px }
.eqc-n > small { font-size: 13px; color: #475569 } .eqc-n > b { font-size: 22px; font-weight: 500; color: #0f172a; font-variant-numeric: tabular-nums; line-height: 1.2 } .eqc-n > b .de { font-size: 15px; color: #475569; font-weight: 400 }
.eqc-n > span { font-size: 13px; color: #334155; line-height: 1.45 } .eqc-n > span em { font-style: normal; font-weight: 600 } .eqc-n > span b { font-weight: 600 }
.eqc-bar { position: relative; display: block; height: 10px; border-radius: 99px; background: #eef2f6; margin: 4px 0 2px } .eqc-bar u { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #60a5fa, #2563eb) }
.eqc-bar s { position: absolute; top: -4px; width: 3px; height: 18px; border-radius: 2px; background: #0f172a; transform: translateX(-50%) } .eqc-bar s.hoje { background: #f59e0b }
.eqc-graf { display: grid; gap: 6px; min-width: 0 }
.eqc-leg { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: #475569 } .eqc-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px } .eqc-leg i.linha { width: 14px; height: 0; border-top: 2px dashed #7c3aed; border-radius: 0; vertical-align: 3px }
.eqc-exp { margin: 0; font-size: 13px; color: #334155; line-height: 1.5; background: #f8fafc; border-radius: 10px; padding: 9px 12px }
.eqc-abrir { justify-self: start; display: inline-flex; gap: 8px; align-items: center; border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; border-radius: 99px; padding: 8px 16px; font-family: inherit; font-size: 14px; cursor: pointer } .eqc-abrir:hover, .eqc-abrir.on { background: #dbeafe }
@media (max-width: 1000px) { .eqc-corpo { grid-template-columns: 1fr } }
`
