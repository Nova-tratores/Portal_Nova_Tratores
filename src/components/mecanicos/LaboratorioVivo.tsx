'use client'
// PÁGINA DE TESTE (José, 17/10/2026: "não quero que você já vá mudando, faz várias telas com os
// dados numa página teste para eu escolher"). Agora (20/10): 5 opções para "Horas da equipe no mês"
// (topo das Ocorrências), com a meta básica de 20 h/semana e a ideal de 40 h/semana. Nada aqui muda o Painel.
import { useState } from 'react'
import { EstilosCPV } from './ui'
import { useHorasEquipe, C1, C2, C3, C4, C5, ESTILO_HO, ESTILO_HC } from './HorasOpcoes'

const MUDO = 'var(--portal-text-muted, #64748b)'
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const andar = (m: string, n: number) => { const [a, mm] = m.split('-').map(Number); return new Date(Date.UTC(a, mm - 1 + n, 1)).toISOString().slice(0, 7) }

function Op({ n, titulo, ideia, children }: { n: string; titulo: string; ideia: string; children: React.ReactNode }) {
  const [vez, setVez] = useState(0)
  return <section className="lab-op cpv-entra"><div className="lab-cab"><span className="lab-n">{n}</span><b>{titulo}</b><small>{ideia}</small><button type="button" className="lab-play" onClick={() => setVez((v) => v + 1)}><i className="fas fa-play" /> animar de novo</button></div><div key={vez}>{children}</div></section>
}

export default function LaboratorioVivo() {
  const [mes, setMes] = useState(() => hojeSP().slice(0, 7))
  const [comAg, setComAg] = useState(false)
  const d = useHorasEquipe(mes, comAg)
  const nome = `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`
  return (
    <div style={{ padding: 'clamp(14px, 2vw, 24px) clamp(12px, 2vw, 28px)', background: 'var(--portal-bg, #f8fafc)', minHeight: '100vh' }}>
      <EstilosCPV />
      <style>{ESTILO_LAB}</style>
      <style>{ESTILO_HO}</style>
      <style>{ESTILO_HC}</style>
      <div className="lab-topo">
        <span className="lab-selo"><i className="fas fa-flask" /> página de teste</span>
        <h1>Horas da equipe no mês — cartões (5 variações do H2)</h1>
        <p>Feitas = horas faturadas + aguardando faturar (a mesma conta do Painel). Meta <b>básica</b> e esperada = <b>20 h e R$ 4 mil por semana</b> por mecânico; meta <b>ideal</b> = <b>40 h e R$ 8 mil</b>. Embaixo, a equipe somada. Quem bate a básica fica verde; quem bate a ideal, roxo.</p>
        <div className="lab-mes">
          <button type="button" onClick={() => setMes((m) => andar(m, -1))} aria-label="Mês anterior"><i className="fas fa-chevron-left" /></button>
          <b>{nome[0].toUpperCase() + nome.slice(1)}</b>
          <button type="button" disabled={mes >= hojeSP().slice(0, 7)} onClick={() => setMes((m) => andar(m, 1))} aria-label="Próximo mês"><i className="fas fa-chevron-right" /></button>
          <label className={`lab-ck ${comAg ? 'on' : ''}`}><input type="checkbox" checked={comAg} onChange={(e) => setComAg(e.target.checked)} /> Incluir OS ainda não faturadas <small>(preenchidas, esperando faturar)</small></label>
        </div>
      </div>
      {!d ? <div style={{ color: MUDO, padding: 40, textAlign: 'center' }}><i className="fas fa-circle-notch fa-spin" /> carregando…</div> : (
        <div key={`${mes}|${comAg}`} style={{ display: 'grid', gap: 22 }}>
          <Op n="C1" titulo="Rosca + semanas" ideia="o H2 refinado: bolinha da básica no anel e as semanas do mês em barrinhas com o traço de 20 h (verde quando bate)"><C1 d={d} /></Op>
          <Op n="C2" titulo="Dois anéis" ideia="anel de dentro = básica (20 h/sem), anel de fora = ideal (40 h/sem); no meio as horas feitas"><C2 d={d} /></Op>
          <Op n="C3" titulo="Foto dentro da rosca" ideia="o técnico no centro do anel e o % da básica grande embaixo"><C3 d={d} /></Op>
          <Op n="C4" titulo="Meia-lua com ponteiros" ideia="arco dividido por tipo de hora até a ideal, com os ponteiros da básica e da ideal"><C4 d={d} /></Op>
          <Op n="C5" titulo="Rosca + mini-rosca por semana" ideia="a rosca do mês e uma rosquinha por semana até 20 h: dá para ver em qual semana ele bateu"><C5 d={d} /></Op>
        </div>
      )}
    </div>
  )
}

const ESTILO_LAB = `
.lab-topo { margin-bottom: 18px; display: grid; gap: 8px } .lab-topo h1 { font-size: 22px; font-weight: 900; margin: 0; color: var(--portal-text, #0f172a) } .lab-topo p { margin: 0; font-size: 13.5px; color: ${MUDO}; max-width: 1000px }
.lab-selo { justify-self: start; font-size: 12px; font-weight: 900; color: #7c3aed; background: #f5f3ff; border: 1px dashed #c4b5fd; border-radius: 99px; padding: 3px 10px }
.lab-mes { display: inline-flex; align-items: center; gap: 8px } .lab-mes b { color: var(--portal-text, #0f172a); font-size: 14px } .lab-mes button { width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--portal-border, #e2e8f0); background: #fefefe; color: #2563eb; cursor: pointer } .lab-mes button:disabled { opacity: .35 }
.lab-ck { margin-left: 14px; display: inline-flex; gap: 7px; align-items: center; font-size: 13.5px; font-weight: 800; color: var(--portal-text, #334155); background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 99px; padding: 6px 14px; cursor: pointer; transition: all .2s } .lab-ck small { font-weight: 600; color: ${MUDO} } .lab-ck input { width: 16px; height: 16px; accent-color: #f59e0b; cursor: pointer } .lab-ck.on { background: #fffbeb; border-color: #fcd34d }
.lab-op { border: 2px dashed var(--portal-border, #cbd5e1); border-radius: 20px; padding: 14px }
.lab-cab { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 12px } .lab-cab small { color: ${MUDO}; font-size: 12.5px }
.lab-play { margin-left: auto; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: #2563eb; border-radius: 99px; padding: 4px 12px; font-family: inherit; font-size: 12px; font-weight: 800; cursor: pointer }
.lab-n { background: #0f172a; color: #fefefe; font-weight: 900; font-size: 13px; border-radius: 8px; padding: 3px 10px }
`
