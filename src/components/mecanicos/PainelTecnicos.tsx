'use client'
// Painel do pós-vendas por técnico (José, 16/10/2026): horas faturadas × internas × ociosas
// contra a meta (40 h/semana, seg–sex), km e valor gerado (serviço, km, peças; bruto, custo
// de terceiros e líquido), por semana ou mês, com evolução e ficha de cada técnico.
// Dados: GET /api/mecanicos/painel. Regras em lib/mecanicos/painel.ts.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, Cell, ComposedChart, Line, CartesianGrid, PieChart, Pie, Legend,
} from 'recharts'
import { authHeaders } from '@/lib/auth/client'
import type { LinhaTecnico, OSFaturada, DiaRegistrado } from '@/lib/mecanicos/painel'
import { brl, brl2, horas, kmFmt, COR, Kpi, Cartao, EstilosCPV } from './ui'

interface Resp {
  tipo: 'semana' | 'mes'; ref: string; periodo: { de: string; ate: string; rotulo: string }
  linhas: LinhaTecnico[]; total: LinhaTecnico
  serie: { rotulo: string; de: string; ate: string; total: LinhaTecnico; porTecnico: Record<string, { faturadas: number; internas: number; ociosas: number; bruto: number; liquido: number; km: number }> }[]
  os: OSFaturada[]; dias: DiaRegistrado[]
}

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const somar = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const somarMes = (dia: string, n: number) => { const [a, m] = dia.split('-').map(Number); const k = a * 12 + m - 1 + n; return `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}-15` }
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const primeiroNome = (n: string) => n.split(' ').slice(0, 2).join(' ')

export default function PainelTecnicos() {
  const [tipo, setTipo] = useState<'semana' | 'mes'>('semana')
  const [ref, setRef] = useState(hojeSP)
  const [d, setD] = useState<Resp | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [foco, setFoco] = useState<string>('Equipe')
  const [ficha, setFicha] = useState<string | null>(null)
  const [listaOS, setListaOS] = useState<{ titulo: string; os: OSFaturada[] } | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const r = await fetch(`/api/mecanicos/painel?tipo=${tipo}&ref=${ref}`, { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      setD(j)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha') } finally { setCarregando(false) }
  }, [tipo, ref])
  useEffect(() => { let vivo = true; Promise.resolve().then(() => { if (vivo) void carregar() }); return () => { vivo = false } }, [carregar])

  const tecnicos = useMemo(() => (d?.linhas || []).filter((l) => l.tecnico !== 'Sem técnico'), [d])
  const rotuloPeriodo = d ? (tipo === 'semana' ? `Semana de ${br(d.periodo.de)} a ${br(d.periodo.ate)}` : `${MESES[Number(d.periodo.de.slice(5, 7)) - 1]} de ${d.periodo.de.slice(0, 4)}`) : ''
  const andar = (n: number) => setRef((r) => (tipo === 'semana' ? somar(r, 7 * n) : somarMes(r, n)))

  const meta = tecnicos[0]?.meta || (tipo === 'semana' ? 40 : 0)
  const dadosMeta = tecnicos.map((l) => ({ nome: primeiroNome(l.tecnico), tecnico: l.tecnico, Faturadas: l.faturadas, Internas: l.internas, Ociosas: l.ociosas, pct: l.meta ? Math.round(((l.faturadas + l.internas) / l.meta) * 100) : 0 }))
  const dadosValor = (d?.linhas || []).map((l) => ({ nome: primeiroNome(l.tecnico), tecnico: l.tecnico, Serviço: l.servico, Km: l.kmValor, Peças: l.pecas, Outros: Math.max(0, l.outros), custo: l.custo, liquido: l.liquido }))
  const dadosSerie = (d?.serie || []).map((b) => {
    const x = foco === 'Equipe' ? { bruto: b.total.bruto, liquido: b.total.liquido, faturadas: b.total.faturadas } : { bruto: b.porTecnico[foco]?.bruto || 0, liquido: b.porTecnico[foco]?.liquido || 0, faturadas: b.porTecnico[foco]?.faturadas || 0 }
    return { rotulo: b.rotulo, Bruto: x.bruto, Líquido: x.liquido, 'Horas faturadas': x.faturadas }
  })
  const t = d?.total
  const composicao = t ? [
    { nome: 'Serviço', valor: t.servico, cor: COR.servico }, { nome: 'Km', valor: t.kmValor, cor: COR.km },
    { nome: 'Peças', valor: t.pecas, cor: COR.pecas }, { nome: 'Outros', valor: Math.max(0, t.outros), cor: COR.outros },
  ].filter((x) => x.valor > 0) : []

  const osDoTecnico = (tec: string) => (d?.os || []).filter((o) => (o.tecnicos.length ? o.tecnicos : ['Sem técnico']).includes(tec))

  return (
    <div>
      <EstilosCPV />
      {/* período */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'inline-flex', background: 'var(--portal-bg-secondary, #f1f5f9)', borderRadius: 10, padding: 3 }}>
          {(['semana', 'mes'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setTipo(k)} style={{ border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', background: tipo === k ? 'var(--portal-bg-card, #fefefe)' : 'transparent', color: tipo === k ? '#0369a1' : 'var(--portal-text-muted, #64748b)', boxShadow: tipo === k ? '0 1px 3px rgba(15,23,42,.12)' : 'none' }}>{k === 'semana' ? 'Semana' : 'Mês'}</button>
          ))}
        </div>
        <button type="button" onClick={() => andar(-1)} aria-label="Anterior" style={btnSeta}><i className="fas fa-chevron-left" /></button>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text, #0f172a)', minWidth: 210, textAlign: 'center' }}>{rotuloPeriodo || '…'}</div>
        <button type="button" onClick={() => andar(1)} aria-label="Próximo" style={btnSeta}><i className="fas fa-chevron-right" /></button>
        <button type="button" onClick={() => setRef(hojeSP())} style={{ ...btnSeta, width: 'auto', padding: '0 12px', fontSize: 12.5, fontWeight: 700 }}>Hoje</button>
        {carregando && <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)' }}><i className="fas fa-spinner fa-spin" /> carregando…</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--portal-text-muted, #94a3b8)' }}>Meta: 8 h por dia útil (seg–sex){tipo === 'semana' ? ' = 40 h' : ''}</span>
      </div>
      {erro && <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', marginBottom: 12 }}>{erro}</div>}

      {t && (
        <>
          {/* indicadores */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Kpi titulo="Horas faturadas" valor={t.faturadas} formato={horas} cor={COR.faturadas} icone="fa-file-invoice-dollar" sub={t.meta ? `${Math.round((t.faturadas / t.meta) * 100)}% da meta da equipe (${horas(t.meta)})` : undefined} />
            <Kpi titulo="Horas internas" valor={t.internas} formato={horas} cor={COR.internas} icone="fa-house" atraso={60} sub="em OS interna (relatório do app)" />
            <Kpi titulo="Horas ociosas" valor={t.ociosas} formato={horas} cor="#64748b" icone="fa-hourglass-half" atraso={120} sub={`trabalhadas no app: ${horas(t.trabalhadas)}${t.extras ? ` · fim de semana ${horas(t.extras)}` : ''}`} />
            <Kpi titulo="Km cobrados" valor={t.km} formato={kmFmt} cor={COR.km} icone="fa-road" atraso={180} sub={`${brl(t.kmValor)} em deslocamento`} />
            <Kpi titulo="Faturado (bruto)" valor={t.bruto} formato={brl} cor="#0369a1" icone="fa-sack-dollar" atraso={240} destaque sub={`${Math.round(t.os)} OS faturadas`} />
            <Kpi titulo="Líquido" valor={t.liquido} formato={brl} cor={COR.liquido} icone="fa-chart-line" atraso={300} destaque sub={`custo de terceiros ${brl(t.custo)}`} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 14, marginBottom: 14 }}>
            {/* meta de horas */}
            <Cartao titulo={<>Meta de horas por técnico <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>· {horas(meta)} cada</span></>} atraso={120}>
              <div style={{ height: Math.max(180, dadosMeta.length * 48 + 40) }}>
                <ResponsiveContainer>
                  <BarChart data={dadosMeta} layout="vertical" margin={{ left: 8, right: 36 }}>
                    <XAxis type="number" hide domain={[0, (dm: number) => Math.max(dm, meta) * 1.05]} />
                    <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 12.5, fontWeight: 700 }} />
                    <Tooltip formatter={(v: number) => horas(v)} cursor={{ fill: 'rgba(148,163,184,.12)' }} />
                    <ReferenceLine x={meta} stroke="#0f172a" strokeDasharray="5 4" label={{ value: `meta ${horas(meta)}`, position: 'top', fontSize: 11 }} />
                    <Bar dataKey="Faturadas" stackId="h" fill={COR.faturadas} radius={[6, 0, 0, 6]} animationDuration={900} onClick={(x: { tecnico?: string }) => x.tecnico && setFicha(x.tecnico)} cursor="pointer" />
                    <Bar dataKey="Internas" stackId="h" fill={COR.internas} animationDuration={900} />
                    <Bar dataKey="Ociosas" stackId="h" fill={COR.ociosas} radius={[0, 6, 6, 0]} animationDuration={900}
                      label={{ position: 'right', fontSize: 11.5, fontWeight: 800, formatter: (_: number, __: unknown, i?: number) => (i != null && dadosMeta[i] ? `${dadosMeta[i].pct}%` : '') } as never} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Legenda itens={[['Faturadas', COR.faturadas], ['Internas', COR.internas], ['Ociosas', COR.ociosas]]} />
            </Cartao>

            {/* valor gerado */}
            <Cartao titulo="Valor gerado por técnico" atraso={180} extra={<span style={{ fontSize: 11.5, color: 'var(--portal-text-muted, #94a3b8)' }}>clique na barra para ver as OS</span>}>
              <div style={{ height: Math.max(180, dadosValor.length * 48 + 40) }}>
                <ResponsiveContainer>
                  <BarChart data={dadosValor} layout="vertical" margin={{ left: 8, right: 70 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="nome" width={110} tick={{ fontSize: 12.5, fontWeight: 700 }} />
                    <Tooltip formatter={(v: number) => brl2(v)} cursor={{ fill: 'rgba(148,163,184,.12)' }} />
                    {(['Serviço', 'Km', 'Peças', 'Outros'] as const).map((k, i, arr) => (
                      <Bar key={k} dataKey={k} stackId="v" fill={k === 'Serviço' ? COR.servico : k === 'Km' ? COR.km : k === 'Peças' ? COR.pecas : COR.outros}
                        radius={i === 0 ? [6, 0, 0, 6] : i === arr.length - 1 ? [0, 6, 6, 0] : 0} animationDuration={900} cursor="pointer"
                        onClick={(x: { tecnico?: string }) => x.tecnico && setListaOS({ titulo: x.tecnico, os: osDoTecnico(x.tecnico) })}
                        {...(i === arr.length - 1 ? { label: { position: 'right', fontSize: 11.5, fontWeight: 800, formatter: (_: number, __: unknown, j?: number) => (j != null && dadosValor[j] ? brl(dadosValor[j].Serviço + dadosValor[j].Km + dadosValor[j].Peças + dadosValor[j].Outros) : '') } as never } : {})} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <Legenda itens={[['Serviço', COR.servico], ['Km', COR.km], ['Peças', COR.pecas], ['Outros', COR.outros]]} />
            </Cartao>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 460px), 1fr))', gap: 14, marginBottom: 14 }}>
            {/* evolução */}
            <Cartao titulo={`Evolução — últimas ${tipo === 'semana' ? '8 semanas' : '6 meses'}`} atraso={240}
              extra={<select value={foco} onChange={(e) => setFoco(e.target.value)} style={{ border: '1px solid var(--portal-border, #e2e8f0)', borderRadius: 8, padding: '5px 8px', fontSize: 12.5, fontWeight: 700, background: 'var(--portal-bg-card, #fefefe)', color: 'var(--portal-text, #0f172a)' }}>
                <option value="Equipe">Equipe toda</option>
                {(d?.linhas || []).map((l) => <option key={l.tecnico} value={l.tecnico}>{l.tecnico}</option>)}
              </select>}>
              <div style={{ height: 260 }}>
                <ResponsiveContainer>
                  <ComposedChart data={dadosSerie} margin={{ left: 0, right: 8, top: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.25)" />
                    <XAxis dataKey="rotulo" tick={{ fontSize: 11.5 }} />
                    <YAxis yAxisId="v" tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} width={42} />
                    <YAxis yAxisId="h" orientation="right" tick={{ fontSize: 11 }} width={34} />
                    <Tooltip formatter={(v: number, n: string) => (n === 'Horas faturadas' ? horas(v) : brl2(v))} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="v" dataKey="Bruto" fill="#0369a1" radius={[6, 6, 0, 0]} animationDuration={900} />
                    <Line yAxisId="v" dataKey="Líquido" stroke={COR.liquido} strokeWidth={2.5} dot={{ r: 3 }} animationDuration={1100} />
                    <Line yAxisId="h" dataKey="Horas faturadas" stroke={COR.faturadas} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} animationDuration={1100} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </Cartao>

            {/* composição */}
            <Cartao titulo="De onde veio o faturamento" atraso={300}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ width: 210, height: 210 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={composicao} dataKey="valor" nameKey="nome" innerRadius={58} outerRadius={92} paddingAngle={2} animationDuration={900}>
                        {composicao.map((c) => <Cell key={c.nome} fill={c.cor} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => brl2(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ flex: 1, minWidth: 180, display: 'grid', gap: 8 }}>
                  {composicao.map((c) => (
                    <div key={c.nome} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c.cor }} />
                      <span style={{ flex: 1, color: 'var(--portal-text, #0f172a)' }}>{c.nome}</span>
                      <b style={{ fontVariantNumeric: 'tabular-nums' }}>{brl(c.valor)}</b>
                      <span style={{ width: 38, textAlign: 'right', color: 'var(--portal-text-muted, #64748b)', fontSize: 12 }}>{t.bruto ? Math.round((c.valor / t.bruto) * 100) : 0}%</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--portal-border, #e2e8f0)', paddingTop: 8, display: 'grid', gap: 4, fontSize: 13 }}>
                    <div style={{ display: 'flex' }}><span style={{ flex: 1 }}>Bruto</span><b>{brl(t.bruto)}</b></div>
                    <div style={{ display: 'flex', color: COR.custo }}><span style={{ flex: 1 }}>− Custo de terceiros</span><b>{brl(t.custo)}</b></div>
                    <div style={{ display: 'flex', color: COR.liquido, fontSize: 14.5 }}><span style={{ flex: 1, fontWeight: 800 }}>= Líquido</span><b>{brl(t.liquido)}</b></div>
                  </div>
                </div>
              </div>
            </Cartao>
          </div>

          {/* tabela */}
          <Cartao titulo="Técnicos" atraso={360}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 820 }}>
                <thead>
                  <tr style={{ color: 'var(--portal-text-muted, #64748b)', fontSize: 11, textTransform: 'uppercase', letterSpacing: .4, textAlign: 'right' }}>
                    {['Técnico', 'Trabalhadas', 'Faturadas', 'Internas', 'Ociosas', 'Km', 'Serviço', 'Km R$', 'Peças', 'Bruto', 'Custo', 'Líquido'].map((h, i) => <th key={h} style={{ padding: '6px 8px', textAlign: i ? 'right' : 'left', fontWeight: 800 }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {d!.linhas.map((l) => (
                    <tr key={l.tecnico} className="cpv-linha" style={{ borderTop: '1px solid var(--portal-border, #f1f5f9)', cursor: 'pointer' }} onClick={() => setFicha(l.tecnico)}>
                      <td style={{ padding: '9px 8px', fontWeight: 800, color: 'var(--portal-text, #0f172a)' }}>{l.tecnico}</td>
                      <td style={td}>{horas(l.trabalhadas)}</td>
                      <td style={{ ...td, color: COR.faturadas, fontWeight: 800 }}>{horas(l.faturadas)}</td>
                      <td style={td}>{horas(l.internas)}</td>
                      <td style={{ ...td, color: l.ociosas > l.meta * 0.5 ? '#b91c1c' : 'inherit' }}>{l.tecnico === 'Sem técnico' ? '—' : horas(l.ociosas)}</td>
                      <td style={td}>{kmFmt(l.km)}</td>
                      <td style={td}>{brl(l.servico)}</td>
                      <td style={td}>{brl(l.kmValor)}</td>
                      <td style={td}>{brl(l.pecas)}</td>
                      <td style={{ ...td, fontWeight: 800 }}>{brl(l.bruto)}</td>
                      <td style={{ ...td, color: COR.custo }}>{l.custo ? brl(l.custo) : '—'}</td>
                      <td style={{ ...td, fontWeight: 800, color: COR.liquido }}>{brl(l.liquido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted, #94a3b8)', marginTop: 8, lineHeight: 1.5 }}>
              Trabalhadas = relatório do app (seg–sex). Faturadas = horas cobradas nas OS faturadas no período (OS com 2 técnicos: pelo que cada um registrou; valor e km meio a meio). Ociosas = meta − faturadas − internas. Custo = requisições da OS. &quot;Sem técnico&quot; = OS aberta direto no Omie.
            </div>
          </Cartao>
        </>
      )}

      {ficha && d && <FichaTecnico tecnico={ficha} linha={d.linhas.find((l) => l.tecnico === ficha)} dias={d.dias.filter((x) => x.tecnico === ficha)} os={osDoTecnico(ficha)} onFechar={() => setFicha(null)} />}
      {listaOS && <ListaOS titulo={listaOS.titulo} os={listaOS.os} onFechar={() => setListaOS(null)} />}
    </div>
  )
}

const btnSeta: React.CSSProperties = { width: 34, height: 34, borderRadius: 9, border: '1px solid var(--portal-border, #e2e8f0)', background: 'var(--portal-bg-card, #fefefe)', color: 'var(--portal-text, #334155)', cursor: 'pointer', fontFamily: 'inherit' }
const td: React.CSSProperties = { padding: '9px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

function Legenda({ itens }: { itens: [string, string][] }) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>
      {itens.map(([n, c]) => <span key={n} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{n}</span>)}
    </div>
  )
}

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
    document.body,
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

function ListaOS({ titulo, os, onFechar }: { titulo: string; os: OSFaturada[]; onFechar: () => void }) {
  return <Janela titulo={<>OS faturadas · {titulo}</>} onFechar={onFechar}><TabelaOS os={os} /></Janela>
}

function FichaTecnico({ tecnico, linha, dias, os, onFechar }: { tecnico: string; linha?: LinhaTecnico; dias: DiaRegistrado[]; os: OSFaturada[]; onFechar: () => void }) {
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
          <Kpi titulo="Líquido" valor={linha.liquido} formato={brl} cor={COR.liquido} destaque atraso={240} sub={`bruto ${brl(linha.bruto)}`} />
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
