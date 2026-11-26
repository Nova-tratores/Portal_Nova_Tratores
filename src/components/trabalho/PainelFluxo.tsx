'use client'
// PAINEL DE FLUXO (melhorias 6.2, 25/11/2026) — na Visão geral, para a gerência (só admin).
// "Números grandes, rótulo com o valor junto do gráfico, nada de legenda para decifrar."
//  · Entrou × saiu por semana: barras lado a lado com o valor em cima (azul = entrou, laranja = saiu;
//    cores validadas para daltonismo e para o tema escuro — skill dataviz).
//  · Abertos, idade média, parados 30+ dias, % de prazos cumpridos no mês, horas em reunião no mês.
//  · Gargalos: as 5 pessoas com mais semanas de fila — só números, nunca títulos.
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { PainelFluxo as Dados } from '@/lib/trabalho/painel-server'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const nf = (n: number) => String(n).replace('.', ',')

const CSS = `.pf{--pf-entrou:#2a78d6;--pf-saiu:#eb6834;--pf-grade:#e5e7eb;--pf-muted:#64748b;display:flex;flex-direction:column;gap:14px;margin-bottom:22px}
[data-theme="dark"] .pf{--pf-entrou:#3987e5;--pf-saiu:#d95926;--pf-grade:#2f2f2f;--pf-muted:#94a3b8}
.pf-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(170px,100%),1fr));gap:10px}
.pf-kpi{padding:14px 16px;border-radius:14px;border:1px solid var(--portal-border,#e5e7eb);background:var(--portal-surface,#fff)}
.pf-kpi b{display:block;font-size:28px;font-weight:500;line-height:1.1;color:var(--portal-text,#0f172a);font-variant-numeric:tabular-nums}
.pf-kpi span{font-size:13px;color:var(--pf-muted)}
.pf-card{padding:16px;border-radius:14px;border:1px solid var(--portal-border,#e5e7eb);background:var(--portal-surface,#fff)}
.pf-card h3{margin:0 0 4px;font-size:15px;font-weight:500;color:var(--portal-text,#0f172a)}
.pf-leg{display:flex;gap:14px;font-size:12.5px;color:var(--portal-text-secondary,#475569);margin-bottom:6px}
.pf-leg i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.pf-dica{position:absolute;pointer-events:none;padding:6px 9px;border-radius:8px;font-size:12.5px;background:var(--portal-text,#0f172a);color:var(--portal-surface,#fff);white-space:nowrap;transform:translate(-50%,-110%)}
.pf-grid2{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:14px}
@media (max-width:900px){.pf-grid2{grid-template-columns:1fr}}`

function Barras({ semanas }: { semanas: Dados['semanas'] }) {
  const [dica, setDica] = useState<{ x: number; y: number; t: string } | null>(null)
  const W = 640, H = 210, base = 180, topo = 22
  const max = Math.max(1, ...semanas.flatMap((s) => [s.entrou, s.saiu]))
  const grupo = W / semanas.length
  const larg = Math.min(22, grupo / 3)
  const alt = (v: number) => (v / max) * (base - topo)
  // Barra com as pontas de cima arredondadas (4 px) e a base reta, apoiada no eixo.
  const barra = (x: number, v: number) => {
    const h = alt(v); if (h <= 0) return ''
    const r = Math.min(4, h, larg / 2), y = base - h
    return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + larg - r}Q${x + larg},${y} ${x + larg},${y + r}V${base}Z`
  }
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Pedidos que entraram e saíram por semana" style={{ display: 'block', overflow: 'visible' }}>
        <line x1={0} x2={W} y1={base} y2={base} stroke="var(--pf-grade)" strokeWidth={1} />
        {semanas.map((s, k) => {
          const cx = k * grupo + grupo / 2
          const xE = cx - larg - 1, xS = cx + 1   // 2 px de respiro entre as barras
          const ultima = k === semanas.length - 1
          return (
            <g key={s.segunda}>
              {[{ x: xE, v: s.entrou, cor: 'var(--pf-entrou)', nome: 'entraram' }, { x: xS, v: s.saiu, cor: 'var(--pf-saiu)', nome: 'saíram' }].map((b) => (
                <g key={b.nome}>
                  <path d={barra(b.x, b.v)} fill={b.cor} />
                  {/* valor em cima da barra (texto na cor do texto, não da série) */}
                  <text x={b.x + larg / 2} y={base - alt(b.v) - 5} textAnchor="middle" fontSize={11} fill="var(--portal-text-secondary,#475569)">{b.v}</text>
                  {/* área de toque maior que a barra */}
                  <rect x={b.x - 2} y={topo - 10} width={larg + 4} height={base - topo + 10} fill="transparent"
                    onMouseEnter={() => setDica({ x: ((b.x + larg / 2) / W) * 100, y: ((base - alt(b.v)) / H) * 100, t: `Semana de ${br(s.segunda)}: ${b.v} ${b.nome}` })}
                    onMouseLeave={() => setDica(null)} />
                </g>
              ))}
              <text x={cx} y={base + 18} textAnchor="middle" fontSize={11} fill="var(--pf-muted)">{ultima ? 'esta semana' : br(s.segunda)}</text>
            </g>
          )
        })}
      </svg>
      {dica && <span className="pf-dica" style={{ left: `${dica.x}%`, top: `${dica.y}%` }}>{dica.t}</span>}
    </div>
  )
}

export default function PainelFluxo() {
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/trabalho/painel', { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (vivo) { if (r.ok) setD(j); else setErro(j.error || 'Não deu para montar o painel') }
      } catch { if (vivo) setErro('Falha de conexão') }
    })()
    return () => { vivo = false }
  }, [])

  if (erro) return <div style={{ marginBottom: 16, fontSize: 13, color: '#dc2626' }}>{erro}</div>
  if (!d) return <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--portal-text-muted,#64748b)' }}>Montando o painel…</div>

  const mesNome = MESES[Number(d.mes.slice(5, 7)) - 1]
  const ent = d.semanas.reduce((s, x) => s + x.entrou, 0), sai = d.semanas.reduce((s, x) => s + x.saiu, 0)
  const kpi = (valor: string, rotulo: string) => <div className="pf-kpi"><b>{valor}</b><span>{rotulo}</span></div>

  return (
    <section className="pf" aria-label="Painel de fluxo">
      <style href="painel-fluxo" precedence="default">{CSS}</style>
      <div className="pf-kpis">
        {kpi(String(d.abertos), 'pedidos abertos')}
        {kpi(`${d.idadeMedia} dias`, 'idade média dos abertos')}
        {kpi(String(d.parados30), 'parados há mais de 30 dias')}
        {kpi(d.prazos.pct == null ? '—' : `${d.prazos.pct}%`, d.prazos.total ? `prazos cumpridos em ${mesNome} (${d.prazos.cumpridos} de ${d.prazos.total})` : `nenhum prazo concluído em ${mesNome}`)}
        {kpi(`${nf(d.reuniaoHoras)} h`, `de pessoas em reunião em ${mesNome} (${d.reunioes} ${d.reunioes === 1 ? 'reunião' : 'reuniões'})`)}
      </div>
      <div className="pf-grid2">
        <div className="pf-card">
          <h3>Entrou × saiu por semana</h3>
          <div style={{ fontSize: 13, color: 'var(--pf-muted)', marginBottom: 8 }}>
            Nas últimas 8 semanas entraram <b style={{ fontWeight: 500, color: 'var(--portal-text,#0f172a)' }}>{ent}</b> e saíram <b style={{ fontWeight: 500, color: 'var(--portal-text,#0f172a)' }}>{sai}</b>
            {ent > sai ? ` — a fila cresceu ${ent - sai}.` : ent < sai ? ` — a fila diminuiu ${sai - ent}.` : '.'}
          </div>
          <div className="pf-leg"><span><i style={{ background: 'var(--pf-entrou)' }} />entraram</span><span><i style={{ background: 'var(--pf-saiu)' }} />saíram (concluídos)</span></div>
          <Barras semanas={d.semanas} />
          <details style={{ marginTop: 8, fontSize: 12.5, color: 'var(--portal-text-secondary,#475569)' }}>
            <summary style={{ cursor: 'pointer' }}>Ver em tabela</summary>
            <table style={{ marginTop: 6, borderCollapse: 'collapse', fontVariantNumeric: 'tabular-nums' }}>
              <thead><tr><th style={{ textAlign: 'left', padding: '2px 12px 2px 0', fontWeight: 500 }}>Semana de</th><th style={{ padding: '2px 12px', fontWeight: 500 }}>Entraram</th><th style={{ padding: '2px 12px', fontWeight: 500 }}>Saíram</th></tr></thead>
              <tbody>{d.semanas.map((s) => <tr key={s.segunda}><td style={{ padding: '2px 12px 2px 0' }}>{br(s.segunda)}</td><td style={{ textAlign: 'center' }}>{s.entrou}</td><td style={{ textAlign: 'center' }}>{s.saiu}</td></tr>)}</tbody>
            </table>
          </details>
        </div>
        <div className="pf-card">
          <h3>Gargalos</h3>
          <div style={{ fontSize: 13, color: 'var(--pf-muted)', marginBottom: 8 }}>Quem tem mais semanas de fila (só números)</div>
          {d.gargalos.length === 0 && <div style={{ fontSize: 13, color: 'var(--pf-muted)' }}>Ninguém com fila.</div>}
          {d.gargalos.map((g) => (
            <div key={g.nome} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, alignItems: 'baseline', padding: '7px 0', borderTop: '1px solid var(--portal-border,#eef2f7)' }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.nome}</span>
                <span style={{ fontSize: 12, color: 'var(--pf-muted)' }}>{g.setor} · {g.itens} {g.itens === 1 ? 'pedido' : 'pedidos'}</span>
              </span>
              <span style={{ fontSize: 18, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{nf(g.semanas)} <small style={{ fontSize: 12, fontWeight: 400, color: 'var(--pf-muted)' }}>sem.</small></span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
