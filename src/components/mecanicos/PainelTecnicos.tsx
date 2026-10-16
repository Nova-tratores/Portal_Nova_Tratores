'use client'
// Painel do pós-vendas (José, 16/10/2026) — uma história só, de cima para baixo:
//  1. Faturamento ao vivo (hoje · semana · mês)
//  2. Fita do tempo (escolhe o período)
//  3. A CONTA do período: faturado − terceiros − gastos (abastecimento/alimentação) = resultado
//  4. Um CARTÃO por técnico: horas × meta, faturado, gastos, km, pontos de ocorrência e resultado
//  5. Evolução com UM gráfico (escolhe o que ver; clicar na barra vai para aquele período)
// Dados: base inteira de GET /api/mecanicos/base (gravada no banco), calculada na tela por montarPainel.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell, CartesianGrid } from 'recharts'
import type { LinhaTecnico, OSFaturada, DiaRegistrado } from '@/lib/mecanicos/painel'
import { brl, brl2, horas, kmFmt, COR, Kpi, Cartao, EstilosCPV, Numero } from './ui'
import SeletorTempo from './SeletorTempo'
import FaturamentoVivo from './FaturamentoVivo'
import { montarPainel, pesosPorOS, SEM_TECNICO, type Escala, type PainelMontado } from '@/lib/mecanicos/painel'
import { porDiaDe } from '@/lib/mecanicos/fita'
import { faixa } from '@/lib/mecanicos/ocorrencias-painel'
import { authHeaders } from '@/lib/auth/client'
import { useBasePosVendas } from './useBasePosVendas'

type Resp = PainelMontado & { geradoEm?: string }
type Metrica = 'bruto' | 'resultado' | 'faturadas' | 'gastos'

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
interface OSInterna { os: string; cliente: string; motivo: string; horas: number; tecnicos: string[] }
const TXT = 'var(--portal-text, #0f172a)', MUDO = 'var(--portal-text-muted, #64748b)'
const COR_GASTO = '#ea580c'
const COR_RESULT = '#0f766e'
const METRICAS: [Metrica, string][] = [['bruto', 'Faturado'], ['resultado', 'Resultado'], ['faturadas', 'Horas faturadas'], ['gastos', 'Gastos']]

export default function PainelTecnicos() {
  const [tipo, setTipo] = useState<Escala>('semana')
  const [ref, setRef] = useState(hojeSP)
  const [metrica, setMetrica] = useState<Metrica>('bruto')
  const [ficha, setFicha] = useState<string | null>(null)
  const [listaOS, setListaOS] = useState<{ titulo: string; os: OSFaturada[] } | null>(null)
  const [verInternas, setVerInternas] = useState(false)
  const [pontos, setPontos] = useState<Record<string, number>>({})

  // base baixada uma vez; cada período é calculado aqui mesmo (troca de data instantânea)
  const { base, carregando, erro, recarregar } = useBasePosVendas()
  const pesos = useMemo(() => (base ? pesosPorOS(base.diasTodos) : undefined), [base])
  const porDia = useMemo(() => (base ? porDiaDe(base.faturadas) : null), [base])
  const d: Resp | null = useMemo(() => (base ? { ...montarPainel(base, tipo, ref, hojeSP(), pesos), geradoEm: base.geradoEm } : null), [base, tipo, ref, pesos])

  // pontos de ocorrência do mês do período (escudo de 100)
  const mesRef = ref.slice(0, 7)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/mecanicos/ocorrencias-painel?mes=${mesRef}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (r.ok && vivo) setPontos(Object.fromEntries((j.linhas || []).map((l: { tecnico: string; saldo: number }) => [l.tecnico, l.saldo])))
      } catch { /* sem pontos: o cartão não mostra o selo */ }
    })()
    return () => { vivo = false }
  }, [mesRef])

  const t = d?.total
  const g = d?.gastos
  const resultado = t && g ? t.liquido - g.foraDasOS : 0
  const tecnicos = useMemo(() => (d?.linhas || []).filter((l) => l.tecnico !== SEM_TECNICO), [d])
  const semTecnico = d?.linhas.find((l) => l.tecnico === SEM_TECNICO)
  const osDoTecnico = (tec: string) => (d?.os || []).filter((o) => (o.tecnicos.length ? o.tecnicos : [SEM_TECNICO]).includes(tec))
  const gastoDe = (tec: string) => d?.gastos.porPessoa.find((p) => p.pessoa === tec)

  const serie = (d?.serie || []).map((b, i) => {
    const gs = d!.gastosSerie[i]
    const v = metrica === 'bruto' ? b.total.bruto : metrica === 'faturadas' ? b.total.faturadas : metrica === 'gastos' ? gs?.total || 0 : b.total.liquido - (gs ? gs.total : 0)
    return { rotulo: b.rotulo, de: b.de, valor: Math.round(v * 10) / 10, atual: ref >= b.de && ref <= b.ate }
  })
  const corMetrica = metrica === 'bruto' ? '#0369a1' : metrica === 'faturadas' ? COR.faturadas : metrica === 'gastos' ? COR_GASTO : COR_RESULT

  return (
    <div>
      <EstilosCPV />
      <style>{ESTILO}</style>
      <FaturamentoVivo compacto />
      <SeletorTempo escala={tipo} refDia={ref} onMudar={(e, r) => { setTipo(e); setRef(r) }} porDia={porDia} desde={base?.de} carregando={carregando} geradoEm={base?.geradoEm} onAtualizar={() => void recarregar()} />
      {erro && <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', marginBottom: 12 }}>{erro}</div>}
      {!d && carregando && <div style={{ padding: 40, textAlign: 'center', color: MUDO }}><i className="fas fa-circle-notch fa-spin" /> carregando o histórico…</div>}

      {t && g && (
        <>
          {/* 3. a conta do período */}
          <section className="pt-conta cpv-entra">
            <button type="button" className="pt-passo" onClick={() => setListaOS({ titulo: 'período', os: d!.os })} title="Ver as OS faturadas">
              <span className="pt-rot">Faturado</span>
              <span className="pt-val" style={{ color: '#0369a1' }}><Numero valor={t.bruto} formato={brl} /></span>
              <span className="pt-sub">{Math.round(t.os)} OS · serviço {brl(t.servico)} · km {brl(t.kmValor)} · peças {brl(t.pecas)}</span>
              <span className="pt-mini">{[['servico', COR.servico], ['kmValor', COR.km], ['pecas', COR.pecas], ['outros', COR.outros]].map(([k, c]) => <i key={k} style={{ width: `${t.bruto ? (Math.max(0, t[k as keyof LinhaTecnico] as number) / t.bruto) * 100 : 0}%`, background: c }} />)}</span>
            </button>
            <span className="pt-op">−</span>
            <div className="pt-passo">
              <span className="pt-rot">Custo de terceiros</span>
              <span className="pt-val" style={{ color: COR.custo }}><Numero valor={t.custo} formato={brl} /></span>
              <span className="pt-sub">requisições ligadas às OS</span>
            </div>
            <span className="pt-op">−</span>
            <div className="pt-passo">
              <span className="pt-rot">Gastos do pós-vendas</span>
              <span className="pt-val" style={{ color: COR_GASTO }}><Numero valor={g.foraDasOS} formato={brl} /></span>
              <span className="pt-sub">abastecimento {brl(g.abastecimento)} · alimentação {brl(g.alimentacao)}{g.total > g.foraDasOS ? ` (${brl(g.total - g.foraDasOS)} já nas OS)` : ''}</span>
            </div>
            <span className="pt-op">=</span>
            <div className="pt-passo pt-final" style={{ background: resultado >= 0 ? '#f0fdfa' : '#fef2f2', borderColor: resultado >= 0 ? '#99f6e4' : '#fecaca' }}>
              <span className="pt-rot">Resultado</span>
              <span className="pt-val" style={{ color: resultado >= 0 ? COR_RESULT : '#b91c1c' }}><Numero valor={resultado} formato={brl} /></span>
              <span className="pt-sub">{t.bruto ? `${Math.round((resultado / t.bruto) * 100)}% do faturado` : '—'}</span>
            </div>
          </section>

          {/* horas da equipe */}
          <section className="pt-horas cpv-entra" style={{ animationDelay: '80ms' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 16, color: TXT }}>Horas da equipe</b>
              <span style={{ fontSize: 13.5, color: MUDO }}>meta {horas(t.meta)} ({horas(tecnicos[0]?.meta || 0)} por técnico) · trabalhadas no app {horas(t.trabalhadas)}</span>
            </div>
            <BarraHoras faturadas={t.faturadas} internas={t.internas} ociosas={t.ociosas} meta={t.meta} grande />
            <div className="pt-legenda">
              <span><i style={{ background: COR.faturadas }} /> Faturadas <b>{horas(t.faturadas)}</b></span>
              <button type="button" onClick={() => setVerInternas(true)}><i style={{ background: COR.internas }} /> Internas <b>{horas(t.internas)}</b> · {d!.internas.length} OS <u>ver</u></button>
              <span><i style={{ background: COR.ociosas }} /> Ociosas <b>{horas(t.ociosas)}</b></span>
              <span><i style={{ background: COR.km }} /> Km cobrados <b>{kmFmt(t.km)}</b></span>
            </div>
          </section>

          {/* 4. um cartão por técnico */}
          <div className="pt-cards">
            {tecnicos.map((l, i) => {
              const gp = gastoDe(l.tecnico)
              const res = l.liquido - (gp?.foraDasOS || 0)
              const pts = pontos[l.tecnico]
              const pct = l.meta ? Math.round(((l.faturadas + l.internas) / l.meta) * 100) : 0
              return (
                <button key={l.tecnico} type="button" className="pt-card cpv-entra" style={{ animationDelay: `${120 + i * 60}ms` }} onClick={() => setFicha(l.tecnico)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="pt-nome">{l.tecnico}</span>
                    {pts != null && <span className="pt-pts" style={{ color: { ok: '#047857', atencao: '#b45309', critico: '#b91c1c' }[faixa(pts)], background: { ok: '#ecfdf5', atencao: '#fffbeb', critico: '#fef2f2' }[faixa(pts)] }} title="Pontos de ocorrência no mês (começa com 100)"><i className="fas fa-shield-halved" /> {pts}</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
                    <span style={{ fontSize: 24, fontWeight: 900, color: pct >= 80 ? '#047857' : pct >= 50 ? '#b45309' : '#b91c1c' }}>{pct}%</span>
                    <span style={{ fontSize: 13, color: MUDO }}>da meta · {horas(l.faturadas)} faturadas{l.internas ? ` + ${horas(l.internas)} internas` : ''}</span>
                  </div>
                  <BarraHoras faturadas={l.faturadas} internas={l.internas} ociosas={l.ociosas} meta={l.meta} />
                  <div className="pt-nums">
                    <span><small>Faturado</small><b style={{ color: '#0369a1' }}>{brl(l.bruto)}</b></span>
                    <span><small>Gastos</small><b style={{ color: COR_GASTO }}>{brl(gp?.total || 0)}</b></span>
                    <span><small>Km</small><b>{kmFmt(l.km)}</b></span>
                    <span><small>Resultado</small><b style={{ color: res >= 0 ? COR_RESULT : '#b91c1c' }}>{brl(res)}</b></span>
                  </div>
                  <span className="pt-abrir">ver detalhes <i className="fas fa-chevron-right" /></span>
                </button>
              )
            })}
          </div>
          {semTecnico && semTecnico.bruto > 0 && (
            <button type="button" className="pt-sem" onClick={() => setListaOS({ titulo: 'sem técnico (abertas direto no Omie)', os: osDoTecnico(SEM_TECNICO) })}>
              <i className="fas fa-circle-info" /> {brl(semTecnico.bruto)} faturados em {Math.round(semTecnico.os)} OS sem técnico (abertas direto no Omie) <u>ver</u>
            </button>
          )}

          {/* 5. evolução */}
          <Cartao titulo="Evolução" atraso={200}
            extra={<div className="pt-metricas">{METRICAS.map(([k, r]) => <button key={k} type="button" className={metrica === k ? 'pt-m-on' : ''} onClick={() => setMetrica(k)}>{r}</button>)}</div>}>
            <div style={{ height: 240 }}>
              <ResponsiveContainer>
                <BarChart data={serie} margin={{ left: 0, right: 8, top: 18 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.25)" />
                  <XAxis dataKey="rotulo" tick={{ fontSize: 12.5 }} />
                  <YAxis tick={{ fontSize: 11.5 }} width={48} tickFormatter={(v: number) => (metrica === 'faturadas' ? `${v}h` : v >= 1000 || v <= -1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip formatter={(v: number) => (metrica === 'faturadas' ? horas(v) : brl2(v))} cursor={{ fill: 'rgba(148,163,184,.12)' }} />
                  {metrica === 'resultado' && <ReferenceLine y={0} stroke="#94a3b8" />}
                  <Bar dataKey="valor" name={METRICAS.find(([k]) => k === metrica)![1]} radius={[6, 6, 0, 0]} animationDuration={700} cursor="pointer"
                    onClick={(x: { de?: string }) => x.de && setRef(x.de)}
                    label={{ position: 'top', fontSize: 11, fill: '#64748b', formatter: (v: number) => (metrica === 'faturadas' ? `${Math.round(v)}h` : Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : '') } as never}>
                    {serie.map((s, i) => <Cell key={i} fill={s.atual ? corMetrica : `${corMetrica}66`} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ fontSize: 12, color: MUDO }}>Clique numa barra para ir para aquele período. Resultado = líquido − todos os gastos do período.</div>
          </Cartao>
        </>
      )}

      {ficha && d && <FichaTecnico tecnico={ficha} linha={d.linhas.find((l) => l.tecnico === ficha)} dias={d.dias.filter((x) => x.tecnico === ficha)} os={osDoTecnico(ficha)} gasto={gastoDe(ficha)} onFechar={() => setFicha(null)} />}
      {listaOS && <ListaOS titulo={listaOS.titulo} os={listaOS.os} onFechar={() => setListaOS(null)} />}
      {verInternas && <ListaInternas internas={d?.internas || []} onFechar={() => setVerInternas(false)} />}
    </div>
  )
}

/** Barra de horas: faturadas + internas + ociosas contra a meta. */
function BarraHoras({ faturadas, internas, ociosas, meta, grande = false }: { faturadas: number; internas: number; ociosas: number; meta: number; grande?: boolean }) {
  const total = Math.max(meta, faturadas + internas + ociosas, 1)
  const pct = (v: number) => `${(v / total) * 100}%`
  return (
    <div className="pt-barra" style={{ height: grande ? 18 : 10 }} title={`faturadas ${horas(faturadas)} · internas ${horas(internas)} · ociosas ${horas(ociosas)} · meta ${horas(meta)}`}>
      <i style={{ width: pct(faturadas), background: COR.faturadas }} />
      <i style={{ width: pct(internas), background: COR.internas }} />
      <i style={{ width: pct(ociosas), background: COR.ociosas }} />
    </div>
  )
}

const ESTILO = `
.pt-conta { display: flex; align-items: stretch; gap: 8px; flex-wrap: wrap; margin-bottom: 14px }
.pt-passo { flex: 1 1 200px; display: flex; flex-direction: column; gap: 3px; text-align: left; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 14px 16px; font-family: inherit; color: inherit; min-width: 0 }
button.pt-passo { cursor: pointer; transition: box-shadow .2s, transform .2s }
button.pt-passo:hover { box-shadow: 0 8px 20px rgba(15,23,42,.08); transform: translateY(-2px) }
.pt-final { border-width: 2px }
.pt-rot { font-size: 12.5px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--portal-text-muted, #64748b) }
.pt-val { font-size: 28px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1.15 }
.pt-sub { font-size: 12.5px; color: var(--portal-text-muted, #64748b) }
.pt-mini { display: flex; height: 6px; border-radius: 4px; overflow: hidden; margin-top: 6px; background: var(--portal-bg-secondary, #f1f5f9) }
.pt-mini i, .pt-barra i { display: block; height: 100%; transition: width .8s cubic-bezier(.2,.8,.2,1) }
.pt-op { align-self: center; font-size: 26px; font-weight: 900; color: var(--portal-text-muted, #94a3b8) }
.pt-horas { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 14px 16px; margin-bottom: 14px }
.pt-barra { display: flex; border-radius: 6px; overflow: hidden; margin: 10px 0 8px; background: var(--portal-bg-secondary, #f1f5f9) }
.pt-legenda { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13.5px; color: var(--portal-text-muted, #475569) }
.pt-legenda > * { display: inline-flex; align-items: center; gap: 6px; border: none; background: transparent; font-family: inherit; font-size: 13.5px; color: inherit; padding: 0 }
.pt-legenda button { cursor: pointer } .pt-legenda button:hover { color: #0369a1 }
.pt-legenda i { width: 11px; height: 11px; border-radius: 3px; display: inline-block }
.pt-legenda b { color: var(--portal-text, #0f172a) }
.pt-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; margin-bottom: 12px }
.pt-card { text-align: left; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 14px 16px 12px; cursor: pointer; font-family: inherit; color: inherit; transition: box-shadow .2s, transform .2s, border-color .2s; min-width: 0 }
.pt-card:hover { box-shadow: 0 10px 24px rgba(15,23,42,.09); transform: translateY(-2px); border-color: #93c5fd }
.pt-nome { font-size: 16.5px; font-weight: 900; color: var(--portal-text, #0f172a); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
.pt-pts { font-size: 12.5px; font-weight: 800; border-radius: 99px; padding: 2px 9px; white-space: nowrap }
.pt-nums { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; margin-top: 4px }
.pt-nums span { display: flex; flex-direction: column }
.pt-nums small { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: var(--portal-text-muted, #94a3b8) }
.pt-nums b { font-size: 16px; font-variant-numeric: tabular-nums; color: var(--portal-text, #0f172a) }
.pt-abrir { display: block; margin-top: 10px; font-size: 12.5px; font-weight: 800; color: #0369a1; opacity: .7 }
.pt-card:hover .pt-abrir { opacity: 1 }
.pt-sem { display: block; width: 100%; text-align: left; border: 1px dashed var(--portal-border, #cbd5e1); background: transparent; border-radius: 12px; padding: 9px 12px; font-family: inherit; font-size: 13px; color: var(--portal-text-muted, #64748b); cursor: pointer; margin-bottom: 14px }
.pt-sem:hover { color: #0369a1; border-color: #0369a1 }
.pt-metricas { display: flex; gap: 4px; flex-wrap: wrap }
.pt-metricas button { border: 1px solid var(--portal-border, #e2e8f0); background: transparent; border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 13px; font-weight: 700; color: var(--portal-text-muted, #64748b); cursor: pointer }
.pt-metricas .pt-m-on { background: #0369a1; border-color: #0369a1; color: #fefefe }
@media (max-width: 720px) { .pt-op { display: none } .pt-val { font-size: 23px } }
`

const btnSeta: React.CSSProperties = { width: 34, height: 34, borderRadius: 9, border: '1px solid var(--portal-border, #e2e8f0)', background: 'var(--portal-bg-card, #fefefe)', color: 'var(--portal-text, #334155)', cursor: 'pointer', fontFamily: 'inherit' }


function Janela({ titulo, children, onFechar, largura = 760 }: { titulo: React.ReactNode; children: React.ReactNode; onFechar: () => void; largura?: number }) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div onClick={onFechar} style={{ position: 'fixed', inset: 0, zIndex: 100050, background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="cpv-entra" style={{ width: '100%', maxWidth: largura, maxHeight: '90vh', overflowY: 'auto', background: 'var(--portal-bg-card, #fefefe)', color: 'var(--portal-text, #0f172a)', borderRadius: 16, boxShadow: '0 24px 60px rgba(15,23,42,.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--portal-border, #e2e8f0)', position: 'sticky', top: 0, background: 'var(--portal-bg-card, #fefefe)' }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>{titulo}</div>
          <button type="button" onClick={onFechar} aria-label="Fechar" style={{ ...btnSeta, borderRadius: 17 }}><i className="fas fa-xmark" /></button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>,
    (document.fullscreenElement as HTMLElement | null) || document.body,
  )
}

function TabelaOS({ os }: { os: OSFaturada[] }) {
  if (!os.length) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--portal-text-muted, #94a3b8)', fontSize: 13 }}>Nenhuma OS faturada no período.</div>
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {os.map((o) => (
        <a key={o.os} href={o.os.startsWith('OMIE') ? undefined : `/pos?id=${encodeURIComponent(o.os)}`} target="_blank" rel="noreferrer" className="cpv-linha"
          style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--portal-border, #e2e8f0)', borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>{o.os}{o.numeroOmie && !o.os.startsWith('OMIE') ? <span style={{ fontWeight: 600, color: 'var(--portal-text-muted, #64748b)' }}> · Omie {o.numeroOmie}</span> : null}</div>
            <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{br(o.data)} · {o.cliente || 'cliente no Omie'} · {horas(o.horasCobradas)} · {kmFmt(o.km)}{o.tecnicos.length > 1 ? ` · ${o.tecnicos.join(' + ')}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, whiteSpace: 'nowrap' }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>{brl2(o.bruto)}</div>
            <div style={{ color: 'var(--portal-text-muted, #64748b)' }}>serv {brl(o.servico)} · km {brl(o.kmValor)} · peças {brl(o.pecas)}</div>
            {o.custo > 0 && <div style={{ color: COR.custo }}>custo {brl2(o.custo)} → líquido {brl2(o.bruto - o.custo)}</div>}
          </div>
        </a>
      ))}
    </div>
  )
}

function ListaInternas({ internas, onFechar }: { internas: OSInterna[]; onFechar: () => void }) {
  return (
    <Janela titulo="OS internas no período" onFechar={onFechar}>
      <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)', marginBottom: 12, lineHeight: 1.5 }}>
        Conta como interna (não cobrada do cliente): tipo de serviço interno no portal, conta corrente interna no Omie
        ou Nº do Contrato de Venda interno (entrega técnica, cortesia, pré-entrega…). Contrato “-pgo” não é interno: a montadora paga.
        As horas são as do relatório do app no período.
      </div>
      {!internas.length ? <div style={{ padding: 20, textAlign: 'center', color: 'var(--portal-text-muted, #94a3b8)', fontSize: 13 }}>Nenhuma hora em OS interna no período.</div> : (
        <div style={{ display: 'grid', gap: 8 }}>
          {internas.map((o) => (
            <a key={o.os} href={`/pos?id=${encodeURIComponent(o.os)}`} target="_blank" rel="noreferrer" className="cpv-linha"
              style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', border: '1px solid var(--portal-border, #e2e8f0)', borderLeft: `4px solid ${COR.internas}`, borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 13.5 }}>{o.os} <span style={{ fontWeight: 700, fontSize: 11.5, color: COR.internas, background: 'rgba(139,92,246,.1)', borderRadius: 99, padding: '1px 8px', marginLeft: 4 }}>{o.motivo}</span></div>
                <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.cliente || '—'} · {o.tecnicos.join(' + ')}</div>
              </div>
              <div style={{ fontWeight: 900, fontSize: 15, color: COR.internas, whiteSpace: 'nowrap' }}>{horas(o.horas)}</div>
            </a>
          ))}
        </div>
      )}
    </Janela>
  )
}

function ListaOS({ titulo, os, onFechar }: { titulo: string; os: OSFaturada[]; onFechar: () => void }) {
  return <Janela titulo={<>OS faturadas · {titulo}</>} onFechar={onFechar}><TabelaOS os={os} /></Janela>
}

function FichaTecnico({ tecnico, linha, dias, os, gasto, onFechar }: { tecnico: string; linha?: LinhaTecnico; dias: DiaRegistrado[]; os: OSFaturada[]; gasto?: { abastecimento: number; alimentacao: number; total: number; litros: number; foraDasOS: number }; onFechar: () => void }) {
  const porDia = Object.entries(dias.reduce<Record<string, { cliente: number; interna: number }>>((m, x) => {
    const k = (m[x.data] ||= { cliente: 0, interna: 0 }); if (x.interna) k.interna += x.horas; else k.cliente += x.horas; return m
  }, {})).sort().map(([data, v]) => ({ dia: br(data), Cliente: Math.round(v.cliente * 10) / 10, Interna: Math.round(v.interna * 10) / 10 }))
  return (
    <Janela titulo={tecnico} onFechar={onFechar} largura={860}>
      {linha && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
          <Kpi titulo="Faturadas" valor={linha.faturadas} formato={horas} cor={COR.faturadas} sub={linha.meta ? `${Math.round(((linha.faturadas + linha.internas) / linha.meta) * 100)}% da meta` : undefined} />
          <Kpi titulo="Internas" valor={linha.internas} formato={horas} cor={COR.internas} atraso={60} />
          <Kpi titulo="Ociosas" valor={linha.ociosas} formato={horas} cor="#64748b" atraso={120} />
          <Kpi titulo="Km" valor={linha.km} formato={kmFmt} cor={COR.km} atraso={180} />
          <Kpi titulo="Gastos" valor={gasto?.total || 0} formato={brl} cor={COR_GASTO} atraso={210} sub={`abastec. ${brl(gasto?.abastecimento || 0)} · alim. ${brl(gasto?.alimentacao || 0)}`} />
          <Kpi titulo="Resultado" valor={linha.liquido - (gasto?.foraDasOS || 0)} formato={brl} cor={COR_RESULT} destaque atraso={240} sub={`bruto ${brl(linha.bruto)} · líquido ${brl(linha.liquido)}`} />
        </div>
      )}
      <div style={{ fontSize: 13.5, fontWeight: 800, margin: '4px 0 8px' }}>Horas registradas no app, por dia</div>
      {porDia.length ? (
        <div style={{ height: 200, marginBottom: 14 }}>
          <ResponsiveContainer>
            <BarChart data={porDia}>
              <XAxis dataKey="dia" tick={{ fontSize: 11.5 }} />
              <YAxis tick={{ fontSize: 11 }} width={30} />
              <Tooltip formatter={(v: number) => horas(v)} />
              <ReferenceLine y={8} stroke="#0f172a" strokeDasharray="5 4" label={{ value: '8 h', position: 'right', fontSize: 11 }} />
              <Bar dataKey="Cliente" stackId="d" fill={COR.faturadas} radius={[0, 0, 0, 0]} animationDuration={800} />
              <Bar dataKey="Interna" stackId="d" fill={COR.internas} radius={[6, 6, 0, 0]} animationDuration={800} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #94a3b8)', marginBottom: 14 }}>Nenhum relatório do app no período.</div>}
      <div style={{ fontSize: 13.5, fontWeight: 800, margin: '4px 0 8px' }}>OS faturadas no período</div>
      <TabelaOS os={os} />
    </Janela>
  )
}
