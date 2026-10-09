'use client'

// Aba "Faturamento semanal" de /clientes/relatorios: OS e pedidos de peças
// faturados de segunda até o dia do envio, por técnico, com km do relatório ×
// km cobrado. (Etapa 1: visualização. Envio por e-mail vem nas próximas.)
import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Wrench, Package, Gauge, AlertTriangle, RefreshCw, Users } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import type { RelatorioFaturamento } from '@/lib/clientes/relatorio-faturamento'
import { TECNICO_BALCAO, segundaDaSemana, isoDia } from '@/lib/clientes/relatorio-faturamento'

const R$ = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const km = (v: number | null | undefined) => v == null ? '—' : `${(Math.round(v * 10) / 10).toLocaleString('pt-BR')} km`
const dataBR = (iso: string) => { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}` : iso }
const dataBRano = (iso: string) => { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : iso }
const somaDias = (iso: string, n: number) => { const [a, m, d] = iso.split('-').map(Number); return isoDia(new Date(a, m - 1, d + n)) }

const CARD: React.CSSProperties = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, boxShadow: '0 1px 2px rgba(16,24,40,0.05)' }
const LBL: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: '#94A3B8' }
const TH: React.CSSProperties = { padding: '9px 12px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748B', textAlign: 'left', background: '#F8FAFC', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }
const TD: React.CSSProperties = { padding: '9px 12px', fontSize: 13, color: '#0f172a', borderBottom: '1px solid #F1F5F9', verticalAlign: 'top' }
const NUM: React.CSSProperties = { ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

function DifKm({ rel, cob }: { rel: number | null; cob: number | null }) {
  if (rel == null || cob == null) return <span style={{ color: '#CBD5E1' }}>—</span>
  const d = Math.round((cob - rel) * 10) / 10
  if (!d) return <span style={{ color: '#047857', fontWeight: 700 }}>ok</span>
  return <span style={{ color: d > 0 ? '#B45309' : '#B91C1C', fontWeight: 700 }}>{d > 0 ? '+' : ''}{d.toLocaleString('pt-BR')}</span>
}

export default function RelatorioFaturamentoSemanal({ diaEnvio = 5 }: { diaEnvio?: number }) {
  const hoje = isoDia(new Date())
  const [semana, setSemana] = useState(segundaDaSemana(hoje))
  const [dados, setDados] = useState<RelatorioFaturamento | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async (seg: string) => {
    setCarregando(true); setErro('')
    try {
      const r = await fetch(`/api/clientes/relatorio-faturamento?semana=${seg}&dia=${diaEnvio}`, { headers: await authHeaders() })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error || j?.erro || `Erro ${r.status}`)
      setDados(j)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar')
    } finally {
      setCarregando(false)
    }
  }, [diaEnvio])

  useEffect(() => {
    let vivo = true
    Promise.resolve().then(() => { if (vivo) carregar(semana) })
    return () => { vivo = false }
  }, [semana, carregar])

  const ehAtual = semana === segundaDaSemana(hoje)
  const t = dados?.totais

  return (
    <div>
      {/* Seletor de semana */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', ...CARD, borderRadius: 12, overflow: 'hidden' }}>
          <button onClick={() => setSemana(s => somaDias(s, -7))} title="Semana anterior"
            style={{ width: 40, height: 42, border: 'none', background: 'transparent', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={18} /></button>
          <div style={{ padding: '0 14px', textAlign: 'center', minWidth: 210 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
              {dados ? `${dataBR(dados.inicio)} a ${dataBRano(dados.fim)}` : `Semana de ${dataBRano(semana)}`}
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8' }}>{ehAtual ? 'Semana atual (até hoje)' : 'Segunda até o dia do envio'}</div>
          </div>
          <button onClick={() => setSemana(s => somaDias(s, 7))} disabled={ehAtual} title="Próxima semana"
            style={{ width: 40, height: 42, border: 'none', background: 'transparent', cursor: ehAtual ? 'default' : 'pointer', color: ehAtual ? '#E2E8F0' : '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={18} /></button>
        </div>
        {!ehAtual && (
          <button onClick={() => setSemana(segundaDaSemana(hoje))}
            style={{ height: 42, padding: '0 14px', borderRadius: 12, border: '1px solid #E5E7EB', background: '#fff', fontSize: 13, fontWeight: 600, color: '#334155', cursor: 'pointer' }}>Esta semana</button>
        )}
        <button onClick={() => carregar(semana)} disabled={carregando} title="Atualizar"
          style={{ width: 42, height: 42, borderRadius: 12, border: '1px solid #E5E7EB', background: '#fff', color: '#64748B', cursor: carregando ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <RefreshCw size={16} style={carregando ? { animation: 'spin 1s linear infinite' } : undefined} />
        </button>
      </div>

      {erro && <div style={{ padding: '12px 14px', borderRadius: 12, background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{erro}</div>}
      {carregando && !dados && <div style={{ padding: 60, textAlign: 'center', color: '#94A3B8' }}>Montando o relatório…</div>}

      {dados && t && (
        <div style={{ opacity: carregando ? 0.55 : 1, transition: 'opacity 0.2s' }}>
          {dados.avisos.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 14px', borderRadius: 12, background: '#FFFBEB', border: '1px solid #FDE68A', marginBottom: 14 }}>
              {dados.avisos.map((a, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: '#92400E' }}><AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} /> {a}</div>
              ))}
            </div>
          )}

          {/* Indicadores */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(200px, 100%), 1fr))', gap: 12, marginBottom: 18 }}>
            {[
              { rot: 'Ordens de serviço', val: R$(t.valor_servico), sub: `${t.os} OS faturada${t.os === 1 ? '' : 's'}`, icone: <Wrench size={16} />, cor: '#1D4ED8', fundo: '#EFF6FF' },
              { rot: 'Pedidos de peças', val: R$(t.valor_pecas), sub: `${t.pv} pedido${t.pv === 1 ? '' : 's'} faturado${t.pv === 1 ? '' : 's'}`, icone: <Package size={16} />, cor: '#C2410C', fundo: '#FFF7ED' },
              { rot: 'Km rodado', val: km(t.km_relatorio), sub: `Cobrado nas OS: ${km(t.km_cobrado)}`, icone: <Gauge size={16} />, cor: '#047857', fundo: '#ECFDF5' },
            ].map(c => (
              <div key={c.rot} style={{ ...CARD, padding: '14px 16px', position: 'relative' }}>
                <span style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 9, background: c.fundo, color: c.cor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.icone}</span>
                <div style={LBL}>{c.rot}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.cor, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{c.val}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>{c.sub}</div>
              </div>
            ))}
            <div style={{ ...CARD, padding: '14px 16px', border: 'none', background: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 100%)' }}>
              <div style={{ ...LBL, color: '#FECACA' }}>Total da semana</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#fefefe', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{R$(t.total)}</div>
              <div style={{ fontSize: 12, color: '#FECACA', marginTop: 6 }}>Serviços + peças</div>
            </div>
          </div>

          {/* Por técnico */}
          <div style={{ ...CARD, overflow: 'hidden', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #F1F5F9', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
              <Users size={16} color="#DC2626" /> Por técnico
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                <thead><tr>
                  <th style={TH}>Técnico</th>
                  <th style={{ ...TH, textAlign: 'right' }}>OS</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Serviços</th>
                  <th style={{ ...TH, textAlign: 'right' }} title="Do relatório do técnico; sem relatório no app, o km do Omie">Km rodado</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Km cobrado</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Dif.</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Pedidos</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Peças</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Total</th>
                </tr></thead>
                <tbody>
                  {dados.por_tecnico.length === 0 ? (
                    <tr><td colSpan={9} style={{ ...TD, textAlign: 'center', color: '#94A3B8', padding: 28 }}>Nada faturado nesta semana.</td></tr>
                  ) : dados.por_tecnico.map(l => {
                    const balcao = l.tecnico === TECNICO_BALCAO
                    return (
                      <tr key={l.tecnico} style={balcao ? { background: '#FAFAFA' } : undefined}>
                        <td style={{ ...TD, fontWeight: 700, color: balcao ? '#64748B' : '#0f172a' }}>{l.tecnico}</td>
                        <td style={NUM}>{l.os || '—'}</td>
                        <td style={NUM}>{l.valor_servico ? R$(l.valor_servico) : '—'}</td>
                        <td style={NUM}>{l.os ? km(l.km_relatorio) : '—'}</td>
                        <td style={NUM}>{l.os ? km(l.km_cobrado) : '—'}</td>
                        <td style={NUM}>{l.os ? <DifKm rel={l.km_relatorio} cob={l.km_cobrado} /> : '—'}</td>
                        <td style={NUM}>{l.pv || '—'}</td>
                        <td style={NUM}>{l.valor_pecas ? R$(l.valor_pecas) : '—'}</td>
                        <td style={{ ...NUM, fontWeight: 800 }}>{R$(l.total)}</td>
                      </tr>
                    )
                  })}
                  {dados.por_tecnico.length > 0 && (
                    <tr style={{ background: '#F8FAFC' }}>
                      <td style={{ ...TD, fontWeight: 800 }}>Total</td>
                      <td style={{ ...NUM, fontWeight: 800 }}>{t.os}</td>
                      <td style={{ ...NUM, fontWeight: 800 }}>{R$(t.valor_servico)}</td>
                      <td style={{ ...NUM, fontWeight: 800 }}>{km(t.km_relatorio)}</td>
                      <td style={{ ...NUM, fontWeight: 800 }}>{km(t.km_cobrado)}</td>
                      <td style={NUM}><DifKm rel={t.km_relatorio} cob={t.km_cobrado} /></td>
                      <td style={{ ...NUM, fontWeight: 800 }}>{t.pv}</td>
                      <td style={{ ...NUM, fontWeight: 800 }}>{R$(t.valor_pecas)}</td>
                      <td style={{ ...NUM, fontWeight: 800, color: '#DC2626' }}>{R$(t.total)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ordens de serviço */}
          <div style={{ ...CARD, overflow: 'hidden', marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #F1F5F9', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
              <Wrench size={16} color="#1D4ED8" /> Ordens de serviço faturadas <span style={{ fontWeight: 600, color: '#94A3B8' }}>({dados.os.length})</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                <thead><tr>
                  <th style={TH}>Data</th><th style={TH}>OS</th><th style={TH}>Cliente</th><th style={TH}>Técnico</th>
                  <th style={{ ...TH, textAlign: 'right' }} title="Do relatório do técnico; sem relatório no app, o km do Omie">Km rodado</th><th style={{ ...TH, textAlign: 'right' }}>Km cobrado</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Dif.</th><th style={{ ...TH, textAlign: 'right' }}>Valor</th>
                </tr></thead>
                <tbody>
                  {dados.os.length === 0 ? (
                    <tr><td colSpan={8} style={{ ...TD, textAlign: 'center', color: '#94A3B8', padding: 24 }}>Nenhuma OS faturada.</td></tr>
                  ) : dados.os.map(o => (
                    <tr key={`${o.empresa}-${o.num_os}`}>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>{dataBR(o.data_faturamento)}</td>
                      <td style={{ ...TD, fontWeight: 700, whiteSpace: 'nowrap' }}>{o.num_os}{o.empresa !== 'Nova Tratores' && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: '#1D4ED8' }}>CASTRO</span>}</td>
                      <td style={TD}>{o.cliente}</td>
                      <td style={TD}>{o.tecnico || <span style={{ color: '#94A3B8' }}>—</span>}{o.tecnico2 && <span style={{ color: '#94A3B8' }}> + {o.tecnico2}</span>}
                        {!o.tem_relatorio && <div style={{ fontSize: 11, color: '#B45309' }}>sem relatório no app{o.km_origem === 'omie' ? ' — km do Omie' : ''}</div>}</td>
                      <td style={NUM}>{km(o.km_relatorio)}{o.km_origem === 'omie' && <div style={{ fontSize: 10.5, color: '#94A3B8', fontWeight: 600 }}>do Omie</div>}</td>
                      <td style={NUM}>{km(o.km_cobrado)}</td>
                      <td style={NUM}>{o.km_origem === 'omie' ? <span style={{ color: '#CBD5E1' }}>—</span> : <DifKm rel={o.km_relatorio} cob={o.km_cobrado} />}</td>
                      <td style={{ ...NUM, fontWeight: 700 }}>{R$(o.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pedidos de peças */}
          <div style={{ ...CARD, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #F1F5F9', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
              <Package size={16} color="#C2410C" /> Pedidos de peças faturados <span style={{ fontWeight: 600, color: '#94A3B8' }}>({dados.pv.length})</span>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 500, color: '#94A3B8' }}>só itens da família Peças (máquinas ficam de fora)</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead><tr>
                  <th style={TH}>Data</th><th style={TH}>Pedido</th><th style={TH}>Cliente</th><th style={TH}>Técnico</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Itens</th><th style={{ ...TH, textAlign: 'right' }}>Valor peças</th>
                </tr></thead>
                <tbody>
                  {dados.pv.length === 0 ? (
                    <tr><td colSpan={6} style={{ ...TD, textAlign: 'center', color: '#94A3B8', padding: 24 }}>Nenhum pedido de peças faturado.</td></tr>
                  ) : dados.pv.map(p => (
                    <tr key={`${p.empresa}-${p.num_pedido}`}>
                      <td style={{ ...TD, whiteSpace: 'nowrap' }}>{dataBR(p.data_faturamento)}</td>
                      <td style={{ ...TD, fontWeight: 700, whiteSpace: 'nowrap' }}>{p.num_pedido}{p.empresa !== 'Nova Tratores' && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, color: '#1D4ED8' }}>CASTRO</span>}</td>
                      <td style={TD}>{p.cliente || <span style={{ color: '#94A3B8' }}>—</span>}</td>
                      <td style={TD}>
                        {p.tecnico || <span style={{ color: '#94A3B8' }}>Balcão</span>}
                        {p.origem_tecnico === 'os' && p.num_os && <div style={{ fontSize: 11, color: '#94A3B8' }}>pela OS {p.num_os}</div>}
                      </td>
                      <td style={NUM}>{p.itens}</td>
                      <td style={{ ...NUM, fontWeight: 700 }}>{R$(p.valor_pecas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
