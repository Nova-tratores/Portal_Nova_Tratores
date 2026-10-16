'use client'
// Faturamento do pós-vendas AO VIVO (José, 16/10/2026): hoje, semana e mês — bruto, custo de
// terceiros (requisições da OS) e líquido, separado em serviço / km / peças — e os últimos
// faturamentos entrando na hora. Atualiza sozinho a cada 20 s enquanto a aba está aberta.
// Dados: GET /api/mecanicos/faturamento-vivo.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { authHeaders } from '@/lib/auth/client'
import type { OSFaturada } from '@/lib/mecanicos/painel'
import { brl, brl2, horas, kmFmt, COR, Kpi, Cartao, EstilosCPV, Numero } from './ui'

interface Soma { os: number; servico: number; kmValor: number; pecas: number; outros: number; bruto: number; custo: number; liquido: number; horas: number; km: number }
interface Resp { agora: string; hoje: string; dia: Soma; semana: Soma; mes: Soma; porDia: { data: string; bruto: number; liquido: number }[]; ultimos: OSFaturada[] }

const INTERVALO = 20_000
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '')

/** `compacto`: dentro do Painel dos técnicos — só hoje/semana/mês e os últimos faturamentos. */
export default function FaturamentoVivo({ compacto = false }: { compacto?: boolean }) {
  const [d, setD] = useState<Resp | null>(null)
  const [erro, setErro] = useState('')
  const [novos, setNovos] = useState<Set<string>>(new Set())
  const [seg, setSeg] = useState(0)
  const vistos = useRef<Set<string> | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/mecanicos/faturamento-vivo', { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      const ids = (j.ultimos as OSFaturada[]).map((o) => o.os)
      if (vistos.current) setNovos(new Set(ids.filter((id) => !vistos.current!.has(id))))
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

  const listaUltimos = (max: number, altura: number) => (
    <div style={{ display: 'grid', gap: 6, maxHeight: altura, overflowY: 'auto' }}>
      {d && d.ultimos.length === 0 && <div style={{ fontSize: 13, color: 'var(--portal-text-muted, #94a3b8)', padding: 12 }}>Nada faturado ainda este mês.</div>}
      {d?.ultimos.slice(0, max).map((o) => (
        <a key={o.os} href={o.os.startsWith('OMIE') ? undefined : `/pos?id=${encodeURIComponent(o.os)}`} target="_blank" rel="noreferrer"
          className={`cpv-linha${novos.has(o.os) ? ' cpv-novo' : ''}`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 10, border: '1px solid var(--portal-border, #eef2f7)', textDecoration: 'none', color: 'inherit' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>{o.os}{novos.has(o.os) && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 800, color: '#a16207', background: '#fef9c3', borderRadius: 6, padding: '1px 6px' }}>NOVO</span>}</div>
            <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {br(o.data)}{o.em ? ` ${hora(o.em)}` : ''} · {o.cliente || 'Omie'} · {o.tecnicos.join(' + ') || 'sem técnico'}
            </div>
          </div>
          <div style={{ fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap' }}>{brl(o.bruto)}</div>
        </a>
      ))}
    </div>
  )

  if (compacto) {
    return (
      <section style={{ marginBottom: 16 }}>
        <EstilosCPV />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span className="cpv-pulso" style={{ width: 9, height: 9, borderRadius: 5, background: '#16a34a' }} />
          <b style={{ fontSize: 16, color: 'var(--portal-text, #0f172a)' }}>Faturamento ao vivo</b>
          <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #94a3b8)' }}>{d ? `atualiza sozinho · há ${seg}s` : 'carregando…'}</span>
        </div>
        {erro && <div style={{ padding: '10px 12px', borderRadius: 10, background: '#fef2f2', color: '#b91c1c', marginBottom: 12 }}>{erro}</div>}
        {d && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: 12 }}>
            {bloco('Hoje', d.dia, 0, true)}
            {bloco('Esta semana', d.semana, 60)}
            {bloco('Este mês', d.mes, 120)}
            <div className="cpv-entra" style={{ animationDelay: '180ms', borderRadius: 16, padding: '12px 12px', background: 'var(--portal-bg-card, #fefefe)', border: '1px solid var(--portal-border, #e5e7eb)' }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--portal-text-muted, #64748b)', marginBottom: 8 }}>Últimos faturamentos</div>
              {listaUltimos(6, 190)}
            </div>
          </div>
        )}
      </section>
    )
  }

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
