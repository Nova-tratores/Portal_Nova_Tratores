'use client'
// Faturamento do pós-vendas AO VIVO (José, 16/10/2026): hoje, semana e mês — bruto, custo de
// terceiros (requisições da OS) e líquido, separado em serviço / km / peças — e os últimos
// faturamentos entrando na hora. Atualiza sozinho a cada 20 s enquanto a aba está aberta.
// Dados: GET /api/mecanicos/faturamento-vivo.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { authHeaders } from '@/lib/auth/client'
import type { OSFaturada } from '@/lib/mecanicos/painel'
import { brl, brl2, horas, kmFmt, COR, Kpi, Cartao, EstilosCPV, Numero, Odometro } from './ui'
import { porDiaDe, ritmoVivo, type Ritmo } from '@/lib/mecanicos/fita'
import DestaquesGiram, { montarBlocos } from './DestaquesGiram'
import { FeedLinhaTempo } from './FeedOpcoes'
import { useBasePosVendas } from './useBasePosVendas'

export interface Soma { os: number; servico: number; kmValor: number; pecas: number; outros: number; bruto: number; custo: number; liquido: number; horas: number; km: number }
export interface RespVivo { agora: string; hoje: string; dia: Soma; semana: Soma; mes: Soma; porDia: { data: string; bruto: number; liquido: number }[]; ultimos: OSFaturada[]
  /** por OS: requisições (cobradas ou não) e almoço (alimentação) */
  extras?: Record<string, { reqs: ReqDaOS[]; almoco: ReqDaOS[] }>
  /** foto de cada técnico (nome → url) */
  fotos?: Record<string, string> }
export interface ReqDaOS { id: number; tipo: string; titulo: string; valor: number; cobrado: number; status: string; nota: string | null }

const INTERVALO = 20_000
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '')

/** `compacto`: dentro do Painel dos técnicos — só hoje/semana/mês e os últimos faturamentos. */
export default function FaturamentoVivo({ compacto = false }: { compacto?: boolean }) {
  const [d, setD] = useState<RespVivo | null>(null)
  const [erro, setErro] = useState('')
  const [novos, setNovos] = useState<Set<string>>(new Set())
  const [seg, setSeg] = useState(0)
  const vistos = useRef<Set<string> | null>(null)
  // aviso animado quando entra um faturamento novo enquanto a tela está aberta
  const [aviso, setAviso] = useState<OSFaturada | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/mecanicos/faturamento-vivo', { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      const ids = (j.ultimos as OSFaturada[]).map((o) => o.os)
      if (vistos.current) {
        const chegaram = ids.filter((id) => !vistos.current!.has(id))
        setNovos(new Set(chegaram))
        if (chegaram.length) setAviso((j.ultimos as OSFaturada[]).find((o) => o.os === chegaram[0]) || null)
      }
      vistos.current = new Set(ids)
      setD(j); setErro(''); setSeg(0)
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha') }
  }, [])
  useEffect(() => {
    let vivo = true
    Promise.resolve().then(() => { if (vivo) void carregar() })
    const t = setInterval(() => { if (document.visibilityState === 'visible') void carregar() }, INTERVALO)
    const s = setInterval(() => setSeg((x) => x + 1), 1000)
    return () => { vivo = false; clearInterval(t); clearInterval(s) }
  }, [carregar])

  const bloco = (titulo: string, s: Soma, atraso: number, destaque = false) => (
    <div className="cpv-entra" style={{ animationDelay: `${atraso}ms`, borderRadius: 16, padding: '16px 18px', background: destaque ? 'linear-gradient(135deg, #0369a1, #0891b2)' : 'var(--portal-bg-card, #fefefe)', color: destaque ? '#fefefe' : 'var(--portal-text, #0f172a)', border: destaque ? 'none' : '1px solid var(--portal-border, #e5e7eb)', boxShadow: destaque ? '0 12px 28px rgba(3,105,161,.3)' : '0 1px 3px rgba(15,23,42,.05)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, opacity: .8, flex: 1 }}>{titulo}</div>
        <div style={{ fontSize: 12, opacity: .75 }}>{s.os} OS</div>
      </div>
      <div style={{ fontSize: 30, fontWeight: 900, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}><Numero valor={s.bruto} formato={brl} /></div>
      <div style={{ display: 'flex', gap: 10, fontSize: 12.5, marginTop: 2, flexWrap: 'wrap' }}>
        <span style={{ color: destaque ? '#fecaca' : COR.custo }}>− {brl(s.custo)} terceiros</span>
        <span style={{ fontWeight: 800, color: destaque ? '#bbf7d0' : COR.liquido }}>= {brl(s.liquido)} líquido</span>
      </div>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 10, background: destaque ? 'rgba(255,255,255,.2)' : 'var(--portal-bg-secondary, #f1f5f9)' }}>
        {[['servico', COR.servico], ['kmValor', COR.km], ['pecas', COR.pecas], ['outros', COR.outros]].map(([k, c]) => {
          const v = Math.max(0, s[k as keyof Soma] as number)
          return <div key={k} title={k} style={{ width: `${s.bruto ? (v / s.bruto) * 100 : 0}%`, background: destaque ? (k === 'servico' ? '#e0f2fe' : k === 'kmValor' ? '#bbf7d0' : k === 'pecas' ? '#fed7aa' : '#e2e8f0') : c, transition: 'width .9s cubic-bezier(.2,.8,.2,1)' }} />
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, fontSize: 11.5, marginTop: 6, opacity: .85, flexWrap: 'wrap' }}>
        <span>serviço {brl(s.servico)}</span><span>km {brl(s.kmValor)}</span><span>peças {brl(s.pecas)}</span>
      </div>
    </div>
  )

  if (compacto) return <VivoCompacto d={d} erro={erro} seg={seg} novos={novos} aviso={aviso} onFimAviso={() => setAviso(null)} />

  return (
    <div>
      <EstilosCPV />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <span className="cpv-pulso" style={{ width: 10, height: 10, borderRadius: 5, background: '#16a34a' }} />
        <b style={{ fontSize: 15, color: 'var(--portal-text, #0f172a)' }}>Ao vivo</b>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)' }}>
          {d ? `atualizado há ${seg}s · próxima em ${Math.max(0, Math.round(INTERVALO / 1000) - seg)}s` : 'carregando…'}
        </span>
        <button type="button" onClick={() => void carregar()} style={{ marginLeft: 'auto', border: '1px solid var(--portal-border, #e2e8f0)', background: 'var(--portal-bg-card, #fefefe)', color: 'var(--portal-text, #334155)', borderRadius: 9, padding: '6px 12px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
          <i className="fas fa-rotate" /> Atualizar
        </button>
      </div>
      {erro && <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', marginBottom: 12 }}>{erro}</div>}

      {d && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 14, marginBottom: 14 }}>
            {bloco('Hoje', d.dia, 0, true)}
            {bloco('Esta semana', d.semana, 80)}
            {bloco('Este mês', d.mes, 160)}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 14 }}>
            <Kpi titulo="Horas cobradas no mês" valor={d.mes.horas} formato={horas} cor={COR.faturadas} icone="fa-clock" />
            <Kpi titulo="Km cobrados no mês" valor={d.mes.km} formato={kmFmt} cor={COR.km} icone="fa-road" atraso={60} />
            <Kpi titulo="Ticket médio (mês)" valor={d.mes.os ? d.mes.bruto / d.mes.os : 0} formato={brl} cor="#0369a1" icone="fa-receipt" atraso={120} />
            <Kpi titulo="Margem líquida (mês)" valor={d.mes.bruto ? (d.mes.liquido / d.mes.bruto) * 100 : 0} formato={(v) => `${v.toFixed(1).replace('.', ',')}%`} cor={COR.liquido} icone="fa-percent" atraso={180} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', gap: 14 }}>
            <Cartao titulo="Faturamento dia a dia no mês" atraso={120}>
              <div style={{ height: 260 }}>
                <ResponsiveContainer>
                  <AreaChart data={d.porDia.map((x) => ({ dia: br(x.data), Bruto: x.bruto, Líquido: x.liquido }))} margin={{ left: 0, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="cpvBruto" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0369a1" stopOpacity={.45} /><stop offset="100%" stopColor="#0369a1" stopOpacity={0} /></linearGradient>
                      <linearGradient id="cpvLiq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COR.liquido} stopOpacity={.35} /><stop offset="100%" stopColor={COR.liquido} stopOpacity={0} /></linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,.25)" />
                    <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} width={42} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                    <Tooltip formatter={(v: number) => brl2(v)} />
                    <Area type="monotone" dataKey="Bruto" stroke="#0369a1" strokeWidth={2.5} fill="url(#cpvBruto)" animationDuration={1000} />
                    <Area type="monotone" dataKey="Líquido" stroke={COR.liquido} strokeWidth={2} fill="url(#cpvLiq)" animationDuration={1200} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Cartao>

            <Cartao titulo="Últimos faturamentos" atraso={180}>
              <div style={{ display: 'grid', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                {d.ultimos.length === 0 && <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #94a3b8)', padding: 12 }}>Nada faturado ainda este mês.</div>}
                {d.ultimos.map((o) => (
                  <a key={o.os} href={o.os.startsWith('OMIE') ? undefined : `/pos?id=${encodeURIComponent(o.os)}`} target="_blank" rel="noreferrer"
                    className={`cpv-linha${novos.has(o.os) ? ' cpv-novo' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, border: '1px solid var(--portal-border, #eef2f7)', textDecoration: 'none', color: 'inherit' }}>
                    <span style={{ width: 34, height: 34, borderRadius: 10, background: '#e0f2fe', color: '#0369a1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0 }}><i className="fas fa-file-invoice-dollar" /></span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 13 }}>{o.os}{novos.has(o.os) && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: '#a16207', background: '#fef9c3', borderRadius: 6, padding: '1px 6px' }}>NOVO</span>}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted, #64748b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {br(o.data)}{o.em ? ` ${hora(o.em)}` : ''} · {o.cliente || 'Omie'} · {o.tecnicos.join(' + ') || 'sem técnico'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 800, fontSize: 13.5 }}>{brl(o.bruto)}</div>
                      {o.custo > 0 && <div style={{ fontSize: 11, color: COR.liquido }}>líq. {brl(o.bruto - o.custo)}</div>}
                    </div>
                  </a>
                ))}
              </div>
            </Cartao>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted, #94a3b8)', marginTop: 10, lineHeight: 1.5 }}>
            Entra quando a OS é faturada pelo portal (na hora) ou direto no Omie (quando a conferência automática encontra, a cada ~10 min). OS interna não soma. Custo de terceiros = requisições ligadas à OS.
          </div>
        </>
      )}
    </div>
  )
}

/** "OS faturada!" — aviso que entra pela direita com um brilho de confete e some sozinho. */
function AvisoFaturou({ o, onFim }: { o: OSFaturada; onFim: () => void }) {
  // a tela redesenha a cada segundo: o tempo de sumir não pode reiniciar a cada render
  const fim = useRef(onFim)
  useEffect(() => { fim.current = onFim })
  useEffect(() => { const t = setTimeout(() => fim.current(), 7000); return () => clearTimeout(t) }, [o.os])
  const pecas = Array.from({ length: 22 }, (_, i) => i)
  return (
    <div className="fv-aviso" role="status">
      <style>{`
        .fv-aviso { position: fixed; right: 24px; top: 96px; z-index: 100040; width: 330px; background: var(--portal-bg-card, #fefefe); border: 1px solid #bbf7d0; border-left: 5px solid #16a34a; border-radius: 16px; padding: 14px 16px; box-shadow: 0 18px 44px rgba(15,23,42,.22); animation: fvEntra .55s cubic-bezier(.2,1.2,.3,1) both, fvSai .4s ease 6.6s both }
        @keyframes fvEntra { from { transform: translateX(120%) scale(.9); opacity: 0 } to { transform: none; opacity: 1 } }
        @keyframes fvSai { to { transform: translateX(120%); opacity: 0 } }
        .fv-confete { position: absolute; left: 30px; top: 22px; width: 7px; height: 11px; border-radius: 2px; opacity: 0; animation: fvVoa 1.3s cubic-bezier(.1,.7,.3,1) .25s both }
        @keyframes fvVoa { 0% { opacity: 1; transform: translate(0,0) rotate(0) } 100% { opacity: 0; transform: translate(var(--dx), var(--dy)) rotate(var(--r)) } }
      `}</style>
      {pecas.map((i) => <span key={i} className="fv-confete" style={{ background: ['#16a34a', '#0369a1', '#f59e0b', '#ea580c', '#7c3aed'][i % 5], ['--dx' as string]: `${Math.round(Math.cos(i * 0.9) * (60 + (i % 4) * 30))}px`, ['--dy' as string]: `${Math.round(Math.sin(i * 0.9) * (40 + (i % 3) * 30))}px`, ['--r' as string]: `${i * 47}deg` }} />)}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}><i className="fas fa-sack-dollar" /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: .5 }}>Acabou de faturar</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--portal-text, #0f172a)' }}>{o.os} · {brl(o.bruto)}</div>
          <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.cliente || 'Omie'} · {o.tecnicos.join(' + ') || 'sem técnico'}</div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- versão compacta (dentro do Painel)

const SEGS: [keyof Soma, string, string][] = [['servico', 'Mão de obra', COR.servico], ['kmValor', 'Deslocamento', COR.km], ['pecas', 'Peças', COR.pecas], ['outros', 'Outros', COR.outros]]
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const CORES_TEC = ['#0369a1', '#7c3aed', '#059669', '#ea580c', '#db2777', '#0891b2']
const corTec = (n: string) => CORES_TEC[[...n].reduce((s, ch) => s + ch.charCodeAt(0), 0) % CORES_TEC.length]

function quandoFoi(iso: string | null, data: string, agora: string) {
  if (!iso) return br(data)
  const min = Math.round((Date.parse(agora) - Date.parse(iso)) / 60_000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 24 * 60 && hora(iso) && data === agora.slice(0, 10)) return `hoje ${hora(iso)}`
  return `${br(data)} ${hora(iso)}`
}

export function BlocoVivo({ titulo, s, ritmo, destaque = false, atraso }: { titulo: string; s: Soma; ritmo?: Ritmo; destaque?: boolean; atraso: number }) {
  const [seg, setSeg] = useState<string | null>(null)
  const dif = ritmo && ritmo.anterior > 0 ? Math.round(((s.bruto - ritmo.anterior) / ritmo.anterior) * 100) : null
  const topo = Math.max(s.bruto, ritmo?.anteriorCheio || 0, ritmo?.projecao || 0, 1) * 1.04
  const pct = (v: number) => `${Math.min(100, (v / topo) * 100)}%`
  return (
    <div className={`bv cpv-entra ${destaque ? 'bv-dest' : ''}`} style={{ animationDelay: `${atraso}ms` }}>
      <div className="bv-cab"><span>{titulo}</span><em>{s.os} OS</em></div>
      <div className="bv-valor"><Odometro texto={brl(s.bruto)} /></div>
      {ritmo && (
        <div className="bv-comp" style={{ color: dif == null ? undefined : dif >= 0 ? (destaque ? '#bbf7d0' : '#047857') : (destaque ? '#fecaca' : '#b91c1c') }}>
          {dif == null ? <>sem base no {ritmo.rotulo}</> : <><b>{dif >= 0 ? '▲' : '▼'} {Math.abs(dif)}%</b> vs {ritmo.rotulo} ({brl(ritmo.anterior)})</>}
        </div>
      )}
      {ritmo && (
        <div className="bv-ritmo" title={`agora ${brl(s.bruto)} · ${ritmo.rotulo} ${brl(ritmo.anterior)} · anterior inteiro ${brl(ritmo.anteriorCheio)}${ritmo.projecao ? ` · projeção ${brl(ritmo.projecao)}` : ''}`}>
          {ritmo.projecao != null && ritmo.projecao > s.bruto && <i className="bv-proj" style={{ width: pct(ritmo.projecao) }} />}
          <i className="bv-atual" style={{ width: pct(s.bruto) }} />
          {ritmo.anterior > 0 && <span className="bv-marca" style={{ left: pct(ritmo.anterior) }} />}
          {ritmo.anteriorCheio > 0 && ritmo.anteriorCheio !== ritmo.anterior && <span className="bv-marca bv-cheio" style={{ left: pct(ritmo.anteriorCheio) }} />}
        </div>
      )}
      {ritmo && (
        <div className="bv-leg">
          <span><i className="bv-l-at" /> agora</span>
          {ritmo.anterior > 0 && <span><i className="bv-l-ma" /> até aqui antes</span>}
          {ritmo.projecao != null && <span><i className="bv-l-pj" /> projeção {brl(ritmo.projecao)}</span>}
        </div>
      )}
      <div className="bv-segs" onMouseLeave={() => setSeg(null)}>
        {SEGS.map(([k, , cor]) => {
          const v = Math.max(0, s[k] as number)
          if (!v) return null
          return <i key={k} style={{ width: `${s.bruto ? (v / s.bruto) * 100 : 0}%`, background: destaque ? undefined : cor, opacity: seg && seg !== k ? 0.3 : 1 }} className={destaque ? `bv-sd bv-sd-${k}` : ''} onMouseEnter={() => setSeg(k)} />
        })}
      </div>
      <div className="bv-segtxt">
        {seg ? <b>{SEGS.find(([k]) => k === seg)![1]}: {brl(Math.max(0, s[seg as keyof Soma] as number))} ({s.bruto ? Math.round((Math.max(0, s[seg as keyof Soma] as number) / s.bruto) * 100) : 0}%)</b>
          : <>MO {brl(s.servico)} · km {brl(s.kmValor)} · peças {brl(s.pecas)}</>}
      </div>
    </div>
  )
}

function VivoCompacto({ d, erro, seg, novos, aviso, onFimAviso }: { d: RespVivo | null; erro: string; seg: number; novos: Set<string>; aviso: OSFaturada | null; onFimAviso: () => void }) {
  const { base } = useBasePosVendas()
  const porDia = useMemo(() => (base ? porDiaDe(base.faturadas) : null), [base])
  const ritmo = useMemo(() => (porDia && d ? ritmoVivo(porDia, d.hoje, d.mes.bruto) : null), [porDia, d])
  const feed = d && (
    <div className="bv bv-feed cpv-entra" style={{ animationDelay: '180ms' }}>
      <div className="bv-cab"><span>Últimos faturamentos</span></div>
      <div className="fd-lista">
        {d.ultimos.length === 0 && <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #94a3b8)', padding: 12 }}>Nada faturado ainda este mês.</div>}
        {d.ultimos.slice(0, 7).map((o, i) => {
          const tec = o.tecnicos[0] || 'Omie'
          return (
            <a key={o.os} href={o.os.startsWith('OMIE') ? undefined : `/pos?id=${encodeURIComponent(o.os)}`} target="_blank" rel="noreferrer"
              className={`fd-item ${novos.has(o.os) ? 'fd-novo' : ''}`} style={{ animationDelay: `${200 + i * 50}ms` }}>
              <span className="fd-av" style={{ background: corTec(tec) }} title={o.tecnicos.join(' + ') || 'sem técnico'}>{iniciais(tec)}{o.tecnicos.length > 1 && <small>+{o.tecnicos.length - 1}</small>}</span>
              <span className="fd-txt">
                <b>{o.os}{novos.has(o.os) && <em>NOVO</em>}</b>
                <small>{o.cliente || 'Omie'}</small>
              </span>
              <span className="fd-dir">
                <b>{brl(o.bruto)}</b>
                <small>{quandoFoi(o.em, o.data, d.agora)}</small>
              </span>
            </a>
          )
        })}
      </div>
    </div>
  )
  return (
    <section style={{ marginBottom: 16 }}>
      <EstilosCPV />
      <style>{ESTILO_VIVO}</style>
      {aviso && <AvisoFaturou key={aviso.os} o={aviso} onFim={onFimAviso} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span className="cpv-pulso" style={{ width: 9, height: 9, borderRadius: 5, background: '#16a34a' }} />
        <b style={{ fontSize: 16, color: 'var(--portal-text, #0f172a)' }}>Faturamento ao vivo</b>
        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #94a3b8)' }}>{d ? `atualiza sozinho · há ${seg}s` : 'carregando…'}</span>
      </div>
      {erro && <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', marginBottom: 12 }}>{erro}</div>}
      {/* abertura escolhida pelo José na página de teste (17/10/2026): destaques que giram + feed */}
      {d && base && porDia && ritmo && (
        <div className="bv-abertura">
          <DestaquesGiram blocos={montarBlocos(d, porDia, ritmo)} faturadas={base.faturadas} porDia={porDia} hoje={d.hoje} />
          {/* últimos faturamentos em linha do tempo (José escolheu na página de teste, 18/10/2026) */}
          <div className="bv-feed-tl"><FeedLinhaTempo ultimos={d.ultimos} agora={d.agora} extras={d.extras} fotos={d.fotos} /></div>
        </div>
      )}
      {d && (!base || !porDia || !ritmo) && (
        <div className="bv-grade">
          <BlocoVivo titulo="Hoje" s={d.dia} destaque atraso={0} />
          <BlocoVivo titulo="Esta semana" s={d.semana} atraso={60} />
          <BlocoVivo titulo="Este mês" s={d.mes} atraso={120} />
          {feed}
        </div>
      )}
    </section>
  )
}

export const ESTILO_VIVO = `
.bv-feed-tl { min-height: 0; position: relative } .bv-feed-tl > div { position: absolute; inset: 0 }
@media (max-width: 1100px) { .bv-feed-tl { height: 480px } }
.bv-abertura { display: grid; grid-template-columns: minmax(0, 2.6fr) minmax(260px, 1fr); gap: 12px; align-items: stretch }
@media (max-width: 1100px) { .bv-abertura { grid-template-columns: 1fr } }
.bv-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 12px; align-items: stretch }
.bv { border-radius: 18px; padding: 14px 16px; background: var(--portal-bg-card, #fefefe); color: var(--portal-text, #0f172a); border: 1px solid var(--portal-border, #e5e7eb); box-shadow: 0 1px 3px rgba(15,23,42,.05); display: flex; flex-direction: column; gap: 6px; min-width: 0; transition: transform .2s, box-shadow .2s }
.bv:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(15,23,42,.10) }
.bv-dest { background: linear-gradient(135deg, #0369a1, #0891b2); color: #fefefe; border: none; box-shadow: 0 12px 28px rgba(3,105,161,.30) }
.bv-cab { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .6px; opacity: .85 }
.bv-cab em { font-style: normal; font-size: 12px; opacity: .8; text-transform: none; letter-spacing: 0 }
.bv-valor { font-size: 32px; font-weight: 900; margin-top: 2px }
.bv-comp { font-size: 12.5px; color: var(--portal-text-muted, #64748b) } .bv-dest .bv-comp { color: #e0f2fe }
.bv-comp b { font-weight: 900 }
.bv-ritmo { position: relative; height: 10px; border-radius: 99px; background: var(--portal-bg-secondary, #f1f5f9); margin-top: 6px }
.bv-dest .bv-ritmo { background: rgba(255,255,255,.18) }
.bv-ritmo i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; transition: width 1.1s cubic-bezier(.2,.8,.2,1); animation: bvCresce 1.1s cubic-bezier(.2,.8,.2,1) both; transform-origin: left }
@keyframes bvCresce { from { transform: scaleX(0) } }
.bv-atual { background: #0369a1 } .bv-dest .bv-atual { background: #fefefe }
.bv-proj { background: repeating-linear-gradient(45deg, rgba(3,105,161,.25) 0 6px, rgba(3,105,161,.1) 6px 12px) }
.bv-marca { position: absolute; top: -4px; bottom: -4px; width: 3px; border-radius: 2px; background: #f59e0b; transform: translateX(-50%); box-shadow: 0 0 0 2px var(--portal-bg-card, #fefefe) }
.bv-dest .bv-marca { background: #fde68a; box-shadow: none }
.bv-cheio { background: #94a3b8; width: 2px }
.bv-leg { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: var(--portal-text-muted, #94a3b8) } .bv-dest .bv-leg { color: #e0f2fe }
.bv-leg span { display: inline-flex; align-items: center; gap: 4px }
.bv-leg i { width: 10px; height: 6px; border-radius: 3px; display: inline-block }
.bv-l-at { background: #0369a1 } .bv-dest .bv-l-at { background: #fefefe } .bv-l-ma { background: #f59e0b; width: 3px !important; height: 10px !important } .bv-l-pj { background: rgba(3,105,161,.3) }
.bv-segs { display: flex; height: 8px; border-radius: 99px; overflow: hidden; gap: 2px; margin-top: 4px; background: var(--portal-bg-secondary, #f1f5f9) }
.bv-dest .bv-segs { background: rgba(255,255,255,.18) }
.bv-segs i { display: block; height: 100%; cursor: pointer; transition: opacity .15s, width .8s }
.bv-sd-servico { background: #e0f2fe } .bv-sd-kmValor { background: #bbf7d0 } .bv-sd-pecas { background: #fed7aa } .bv-sd-outros { background: #e2e8f0 }
.bv-segtxt { font-size: 12px; color: var(--portal-text-muted, #64748b); min-height: 16px } .bv-dest .bv-segtxt { color: #e0f2fe }
.bv-feed { gap: 4px }
.fd-lista { display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; max-height: 236px; overflow-y: auto; overflow-x: hidden; margin: 0 -6px; padding: 0 6px }
.fd-item { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 6px 6px; border-radius: 10px; text-decoration: none; color: inherit; animation: fdEntra .45s cubic-bezier(.2,.8,.2,1) both; transition: background .15s }
.fd-item:hover { background: var(--portal-bg-secondary, #f1f5f9) }
@keyframes fdEntra { from { opacity: 0; transform: translateX(14px) } to { opacity: 1; transform: none } }
.fd-novo { animation: fdNovo 2.4s ease both; background: #fefce8 }
@keyframes fdNovo { 0% { transform: translateX(30px); opacity: 0; background: #fde68a } 30% { transform: none; opacity: 1 } 100% { background: transparent } }
.fd-av { position: relative; width: 32px; height: 32px; border-radius: 50%; color: #fefefe; font-size: 12px; font-weight: 900; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0 }
.fd-av small { position: absolute; right: -4px; bottom: -3px; background: #0f172a; color: #fefefe; border-radius: 99px; font-size: 9px; padding: 0 4px }
.fd-txt { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.2 }
.fd-txt b { font-size: 13.5px } .fd-txt b em { font-style: normal; margin-left: 6px; font-size: 10px; font-weight: 900; color: #a16207; background: #fef9c3; border-radius: 6px; padding: 1px 5px }
.fd-txt small, .fd-dir small { font-size: 11.5px; color: var(--portal-text-muted, #94a3b8); white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.fd-dir { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2; flex-shrink: 0 }
.fd-dir b { font-size: 13.5px; font-variant-numeric: tabular-nums }
`
