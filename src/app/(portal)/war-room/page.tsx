'use client'
// War Room — pauta viva da reunião semanal de recuperação. Tela única,
// mobile-first. LÊ do /api/war-room (payload já cortado por RLS/views: a UI
// nunca esconde dado que chegou — o corte núcleo/membro vem do servidor).
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  RefreshCw, Plus, Lock, Flag, TrendingUp, Tractor, Wallet, AlertTriangle,
  Target, ClipboardList, Gavel, X, ArrowRightCircle,
} from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import UserSelect from '@/components/tickets/UserSelect'
import {
  FASES, FAROL_INFO, farolGeral, CAMPOS_MANUAIS_SNAPSHOT,
  type Farol, type WarRoomFase,
} from '@/lib/war-room/constantes'

// ---- tipos frouxos do payload agregado -----------------------------------
type Any = Record<string, unknown>
interface Payload {
  meu_nivel: 'nucleo' | 'membro' | null
  acoes: Any[]
  snapshots: Any[]
  snapshots_lite: boolean
  pauta: Any[]
  definicoes: Any[]
  ponte: { fontes: Any[]; alvo_total: number; alvo_data: string }
  ata: Any[]
  usuarios: { id: string; nome: string; avatar_url: string | null }[]
}

const BRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const pct = (f: number | null | undefined) => (f == null ? '—' : `${(f * 100).toFixed(1)}%`)
const dataBR = (iso: string | null | undefined) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR') : '—')

function FarolPill({ farol, label }: { farol: Farol | null; label: string }) {
  const info = farol ? FAROL_INFO[farol] : { cor: '#9ca3af', fundo: 'rgba(156,163,175,.12)', label: '—' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, color: info.cor, background: info.fundo }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: info.cor }} /> {label}
    </span>
  )
}

// Sparkline SVG simples (12 semanas). vals do mais antigo ao mais recente.
function Sparkline({ vals, cor = '#b91c1c' }: { vals: (number | null)[]; cor?: string }) {
  const pts = vals.filter((v): v is number => v != null)
  if (pts.length < 2) return <span style={{ fontSize: 11, color: 'var(--portal-text-muted,#9ca3af)' }}>sem histórico</span>
  const min = Math.min(...pts), max = Math.max(...pts), rng = max - min || 1
  const W = 120, H = 30
  const path = vals.map((v, i) => {
    if (v == null) return null
    const x = (i / (vals.length - 1)) * W
    const y = H - ((v - min) / rng) * H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).filter(Boolean).join(' ')
  return <svg width={W} height={H} style={{ display: 'block' }}><polyline points={path} fill="none" stroke={cor} strokeWidth={1.8} /></svg>
}

const card: React.CSSProperties = { background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#eee)', borderRadius: 12, padding: 16 }
const secTitulo: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 700, margin: '4px 0 10px', color: 'var(--portal-text,#111)' }
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)' }
const btnPrim: React.CSSProperties = { ...btn, background: '#b91c1c', color: '#fff', border: '1px solid #b91c1c' }
const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)', fontSize: 14 }

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 16, overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...card, width: '100%', maxWidth: 520, marginTop: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <strong style={{ fontSize: 16 }}>{titulo}</strong>
          <button onClick={onClose} style={{ ...btn, padding: 6 }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function WarRoomPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [modal, setModal] = useState<null | 'acao' | 'definicao' | 'decisao' | 'caixa' | 'fonte' | { virar: Any }>(null)

  const carregar = useCallback(async () => {
    setLoading(true); setErro('')
    try {
      const r = await fetch('/api/war-room', { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Falha ao carregar')
      setData(j)
    } catch (e) { setErro((e as Error).message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  if (loading) return <div style={{ padding: 24, color: 'var(--portal-text-muted,#888)' }}>Carregando o War Room…</div>
  if (erro) return <div style={{ padding: 24, color: '#dc2626' }}>{erro} <button style={btn} onClick={carregar}>Tentar de novo</button></div>
  if (!data) return null

  const nucleo = data.meu_nivel === 'nucleo'
  const snaps = data.snapshots
  const ultimo = snaps[0] as Any | undefined
  const fechado = !!ultimo?.fechado_em
  const fMargem = (ultimo?.farol_margem ?? null) as Farol | null
  const fGiro = (ultimo?.farol_giro ?? null) as Farol | null
  const fCaixa = (ultimo?.farol_caixa ?? null) as Farol | null
  const geral = farolGeral(fMargem, fGiro, fCaixa)
  const acoesVencidas = data.acoes.filter((a) => a.vencida).length
  const temCaixa = !data.snapshots_lite && ultimo && ultimo.caixa_90d != null
  // ordem cronológica p/ sparkline (mais antigo → mais recente)
  const serie = [...snaps].reverse()

  const pauta = fechado ? ((ultimo?.pauta_congelada as Any[]) || []) : data.pauta
  const totalRealizado = data.ponte.fontes.reduce((s, f) => s + (Number(f.realizado) || 0), 0)
  const gap = data.ponte.alvo_total - totalRealizado

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>War Room — recuperação</h1>
          <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>
            Snapshot da semana de {dataBR(ultimo?.semana_inicio as string)} {fechado && <span style={{ color: '#6b7280' }}>· reunião fechada</span>}
            {data.meu_nivel && <span> · seu acesso: <strong>{data.meu_nivel}</strong></span>}
          </div>
        </div>
        <button style={btn} onClick={carregar}><RefreshCw size={14} /> Atualizar</button>
      </div>

      {/* 1) Faixa de farol */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Flag size={18} color={geral ? FAROL_INFO[geral].cor : '#9ca3af'} />
          <strong style={{ fontSize: 15 }}>Farol geral:</strong> <FarolPill farol={geral} label={geral ? FAROL_INFO[geral].label : '—'} />
        </div>
        <FarolPill farol={fMargem} label={`Margem ${pct(ultimo?.margem_semana as number)}`} />
        <FarolPill farol={fGiro} label={`Giro ${ultimo?.tratores_vendidos ?? '—'} tratores`} />
        <FarolPill farol={fCaixa} label="Caixa 90d" />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: acoesVencidas ? '#dc2626' : 'var(--portal-text-muted,#888)' }}>
          <AlertTriangle size={14} /> {acoesVencidas} ações vencidas
        </span>
        {temCaixa && (
          <span style={{ fontSize: 13, color: 'var(--portal-text-muted,#666)' }}>
            Caixa 30/60/90: {BRL(Number(ultimo!.caixa_30d) || 0)} · {BRL(Number(ultimo!.caixa_60d) || 0)} · {BRL(Number(ultimo!.caixa_90d) || 0)}
          </span>
        )}
      </div>

      {/* 2) Ponte de caixa (núcleo) */}
      {nucleo && (
        <div style={card}>
          <div style={secTitulo}><Wallet size={16} /> Ponte de caixa até {dataBR(data.ponte.alvo_data)}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button style={btn} onClick={() => setModal('fonte')}><Plus size={13} /> Fonte</button>
            </span>
          </div>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Alvo <strong>{BRL(data.ponte.alvo_total)}</strong> · realizado <strong style={{ color: '#059669' }}>{BRL(totalRealizado)}</strong> ·
            falta <strong style={{ color: gap > 0 ? '#dc2626' : '#059669' }}>{BRL(Math.max(0, gap))}</strong>
          </div>
          <Barra val={totalRealizado} max={data.ponte.alvo_total} cor="#059669" />
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.ponte.fontes.length === 0 && <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Nenhuma fonte cadastrada.</div>}
            {data.ponte.fontes.map((f) => (
              <FonteLinha key={String(f.id)} fonte={f} onSalvar={carregar} />
            ))}
          </div>
        </div>
      )}

      {/* 3) Sentinelas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <SentinelaCard icone={<TrendingUp size={16} />} titulo="Margem da semana" valor={pct(ultimo?.margem_semana as number)} farol={fMargem} spark={<Sparkline vals={serie.map((s) => (s.margem_semana as number) ?? null)} />} />
        <SentinelaCard icone={<Tractor size={16} />} titulo="Tratores vendidos" valor={String(ultimo?.tratores_vendidos ?? '—')} farol={fGiro} spark={<Sparkline vals={serie.map((s) => (s.tratores_vendidos as number) ?? null)} cor="#2563eb" />} />
        <SentinelaCard icone={<Wallet size={16} />} titulo={temCaixa ? 'Caixa 90 dias' : 'Caixa (núcleo)'} valor={temCaixa ? BRL(Number(ultimo!.caixa_90d) || 0) : '—'} farol={fCaixa} spark={temCaixa ? <Sparkline vals={serie.map((s) => (s.caixa_90d as number) ?? null)} cor="#059669" /> : <span style={{ fontSize: 11, color: 'var(--portal-text-muted,#9ca3af)' }}>restrito</span>} />
      </div>
      {nucleo && !fechado && (
        <div><button style={btn} onClick={() => setModal('caixa')}><Wallet size={13} /> Digitar caixa da semana (manual)</button></div>
      )}

      {/* 4) Pauta de hoje */}
      <div style={card}>
        <div style={secTitulo}><ClipboardList size={16} /> Pauta {fechado ? '(congelada)' : 'de hoje'}
          {fechado && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'inline-flex', gap: 4, alignItems: 'center' }}><Lock size={12} /> reunião fechada em {dataBR((ultimo?.fechado_em as string)?.slice(0, 10))}</span>}
        </div>
        {pauta.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Nada urgente na pauta. 🎯</div>
          : <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pauta.map((p, i) => (
                <li key={i} style={{ fontSize: 13 }}>
                  <strong style={{ color: '#b91c1c' }}>{String(p.rotulo || p.tipo)}</strong> — {String(p.descricao)}
                  {p.prazo != null && <span style={{ color: 'var(--portal-text-muted,#888)' }}> · prazo {dataBR(String(p.prazo))}</span>}
                </li>
              ))}
            </ul>}
      </div>

      {/* 5) Definições estratégicas (núcleo) */}
      {nucleo && (
        <div style={card}>
          <div style={secTitulo}><Target size={16} /> Definições estratégicas
            <button style={{ ...btn, marginLeft: 'auto' }} onClick={() => setModal('definicao')}><Plus size={13} /> Nova</button>
          </div>
          {data.definicoes.length === 0 && <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Nenhuma definição pendente.</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.definicoes.map((d) => (
              <div key={String(d.id)} style={{ borderLeft: '3px solid #b91c1c', paddingLeft: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{String(d.tema)}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: statusCor(String(d.status)) }}>{String(d.status)}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#666)' }}>Decisão a extrair: {String(d.decisao_a_extrair)}{d.data_alvo != null && ` · alvo ${dataBR(String(d.data_alvo))}`}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6) Plano de ações por fase */}
      <div style={card}>
        <div style={secTitulo}><Crosshair16 /> Plano de ações
          {nucleo && <button style={{ ...btnPrim, marginLeft: 'auto' }} onClick={() => setModal('acao')}><Plus size={13} /> Nova ação</button>}
        </div>
        {FASES.map((fase) => {
          const doFase = data.acoes.filter((a) => a.fase === fase.id)
          if (doFase.length === 0) return null
          return (
            <div key={fase.id} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--portal-text-muted,#888)', margin: '6px 0' }}>{fase.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {doFase.map((a) => (
                  <div key={String(a.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--portal-border,#eee)', borderRadius: 8, flexWrap: 'wrap' }}>
                    <Link href={`/tickets/${a.ticket_id}`} style={{ fontWeight: 700, color: '#b91c1c', textDecoration: 'none' }}>#{String(a.numero)}</Link>
                    <span style={{ fontSize: 14, flex: 1, minWidth: 160 }}>{String(a.titulo)}</span>
                    {a.causa_raiz ? <span style={{ fontSize: 11, color: 'var(--portal-text-muted,#888)' }}>causa: {String(a.causa_raiz)}</span> : null}
                    <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#666)' }}>{String(a.dono_nome || '—')}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: statusCorTicket(String(a.status)) }}>{String(a.status)}</span>
                    <span style={{ fontSize: 12, color: a.dias_para_prazo != null && Number(a.dias_para_prazo) < 0 ? '#dc2626' : 'var(--portal-text-muted,#888)' }}>
                      {a.prazo_estrategico ? (Number(a.dias_para_prazo) < 0 ? `vencida ${-Number(a.dias_para_prazo)}d` : `${a.dias_para_prazo}d`) : 'sem prazo'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
        {data.acoes.length === 0 && <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Nenhuma ação no plano ainda.</div>}
      </div>

      {/* 7) Ata */}
      <div style={card}>
        <div style={secTitulo}><Gavel size={16} /> Ata de decisões
          {nucleo && !fechado && <button style={{ ...btn, marginLeft: 'auto' }} onClick={() => setModal('decisao')}><Plus size={13} /> Registrar decisão</button>}
        </div>
        {data.ata.length === 0 && <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Nenhuma decisão registrada.</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.ata.map((d) => (
            <div key={String(d.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, borderBottom: '1px solid var(--portal-border,#f0f0f0)', paddingBottom: 6, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--portal-text-muted,#888)', fontSize: 11 }}>{dataBR(String(d.created_at).slice(0, 10))}</span>
              <span style={{ flex: 1, minWidth: 180 }}>{String(d.descricao)}</span>
              {d.prazo != null && <span style={{ fontSize: 11, color: 'var(--portal-text-muted,#888)' }}>prazo {dataBR(String(d.prazo))}</span>}
              {nucleo && !d.acao_id && (
                <button style={{ ...btn, padding: '4px 8px' }} onClick={() => setModal({ virar: d })}><ArrowRightCircle size={13} /> Virar ação</button>
              )}
              {d.acao_id ? <span style={{ fontSize: 11, color: '#059669' }}>✓ virou ação</span> : null}
            </div>
          ))}
        </div>
      </div>

      {/* 8) Fechar reunião (núcleo) */}
      {nucleo && !fechado && ultimo && (
        <div><button style={{ ...btnPrim, background: '#059669', border: '1px solid #059669' }} onClick={() => fecharReuniao(carregar)}><Lock size={14} /> Fechar reunião da semana</button></div>
      )}

      {/* MODAIS */}
      {modal === 'acao' && <ModalAcao onClose={() => setModal(null)} onOk={carregar} />}
      {modal === 'definicao' && <ModalDefinicao onClose={() => setModal(null)} onOk={carregar} />}
      {modal === 'decisao' && <ModalDecisao definicoes={data.definicoes} onClose={() => setModal(null)} onOk={carregar} />}
      {modal === 'caixa' && <ModalCaixa atual={ultimo} onClose={() => setModal(null)} onOk={carregar} />}
      {modal === 'fonte' && <ModalFonte onClose={() => setModal(null)} onOk={carregar} />}
      {modal && typeof modal === 'object' && 'virar' in modal && <ModalVirar decisao={modal.virar} onClose={() => setModal(null)} onOk={carregar} />}
    </div>
  )
}

// ------------------------------------------------------------------ helpers UI
function Crosshair16() { return <Flag size={16} /> }
function statusCor(s: string) { return s === 'decidida' ? '#059669' : s === 'agendada' ? '#d97706' : s === 'arquivada' ? '#6b7280' : '#dc2626' }
function statusCorTicket(s: string) { return s === 'fechado' || s === 'resolvido' ? '#059669' : s === 'cancelado' ? '#6b7280' : '#d97706' }

function Barra({ val, max, cor }: { val: number; max: number; cor: string }) {
  const p = max > 0 ? Math.min(100, (val / max) * 100) : 0
  return <div style={{ height: 10, borderRadius: 999, background: 'var(--portal-border,#eee)', overflow: 'hidden' }}><div style={{ width: `${p}%`, height: '100%', background: cor }} /></div>
}

function SentinelaCard({ icone, titulo, valor, farol, spark }: { icone: React.ReactNode; titulo: string; valor: string; farol: Farol | null; spark: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--portal-text-muted,#666)' }}>{icone} {titulo}</span>
        <FarolPill farol={farol} label={farol ? FAROL_INFO[farol].label : '—'} />
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, margin: '6px 0' }}>{valor}</div>
      {spark}
    </div>
  )
}

function FonteLinha({ fonte, onSalvar }: { fonte: Any; onSalvar: () => void }) {
  const [realizado, setRealizado] = useState(String(fonte.realizado ?? 0))
  const [salvando, setSalvando] = useState(false)
  const salvar = async () => {
    setSalvando(true)
    await fetch('/api/war-room/ponte', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ id: fonte.id, realizado: Number(realizado) }) })
    setSalvando(false); onSalvar()
  }
  const meta = Number(fonte.meta) || 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, flex: 1, minWidth: 160 }}>{String(fonte.nome)}</span>
      <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>meta {BRL(meta)}</span>
      <input value={realizado} onChange={(e) => setRealizado(e.target.value)} style={{ ...inp, width: 120 }} />
      <button style={btn} disabled={salvando} onClick={salvar}>Salvar</button>
      <div style={{ width: '100%' }}><Barra val={Number(realizado) || 0} max={meta} cor="#059669" /></div>
    </div>
  )
}

// ------------------------------------------------------------------ modais
async function postJSON(url: string, body: Any) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || 'Falha')
  return j
}

async function fecharReuniao(onOk: () => void) {
  if (!confirm('Fechar a reunião da semana? A pauta será congelada e o snapshot fica imutável.')) return
  try { await postJSON('/api/war-room/snapshots/fechar', {}); onOk() } catch (e) { alert((e as Error).message) }
}

function useSubmit(fn: () => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const run = async () => { setBusy(true); setErr(''); try { await fn() } catch (e) { setErr((e as Error).message) } finally { setBusy(false) } }
  return { busy, err, run }
}

function ModalAcao({ onClose, onOk }: { onClose: () => void; onOk: () => void }) {
  const [f, setF] = useState({ titulo: '', descricao: '', dono_id: '', fase: '0_estancar' as WarRoomFase, causa_raiz: '', meta: '', prazo_estrategico: '' })
  const { busy, err, run } = useSubmit(async () => { await postJSON('/api/war-room/acoes', f); onOk(); onClose() })
  return (
    <Modal titulo="Nova ação do plano" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input placeholder="Título da ação" style={inp} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
        <textarea placeholder="Descrição (origem imutável)" style={{ ...inp, minHeight: 70 }} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        <label style={lbl}>Dono</label>
        <UserSelect value={f.dono_id} onChange={(id) => setF({ ...f, dono_id: id })} placeholder="Escolher dono da ação" />
        <label style={lbl}>Fase</label>
        <select style={inp} value={f.fase} onChange={(e) => setF({ ...f, fase: e.target.value as WarRoomFase })}>
          {FASES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <input placeholder="Causa-raiz" style={inp} value={f.causa_raiz} onChange={(e) => setF({ ...f, causa_raiz: e.target.value })} />
        <input placeholder="Meta (ex.: -15% em 90d)" style={inp} value={f.meta} onChange={(e) => setF({ ...f, meta: e.target.value })} />
        <label style={lbl}>Prazo estratégico</label>
        <input type="date" style={inp} value={f.prazo_estrategico} onChange={(e) => setF({ ...f, prazo_estrategico: e.target.value })} />
        {err && <span style={errStyle}>{err}</span>}
        <button style={btnPrim} disabled={busy} onClick={run}>{busy ? 'Criando…' : 'Criar ação'}</button>
      </div>
    </Modal>
  )
}

function ModalDefinicao({ onClose, onOk }: { onClose: () => void; onOk: () => void }) {
  const [f, setF] = useState({ tema: '', decisao_a_extrair: '', contexto: '', dados_necessarios: '', data_alvo: '' })
  const { busy, err, run } = useSubmit(async () => { await postJSON('/api/war-room/definicoes', f); onOk(); onClose() })
  return (
    <Modal titulo="Nova definição estratégica" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input placeholder="Tema" style={inp} value={f.tema} onChange={(e) => setF({ ...f, tema: e.target.value })} />
        <textarea placeholder="Qual decisão a conversa precisa produzir" style={{ ...inp, minHeight: 60 }} value={f.decisao_a_extrair} onChange={(e) => setF({ ...f, decisao_a_extrair: e.target.value })} />
        <textarea placeholder="Contexto (2–4 linhas)" style={{ ...inp, minHeight: 60 }} value={f.contexto} onChange={(e) => setF({ ...f, contexto: e.target.value })} />
        <input placeholder="Dados necessários (apoio)" style={inp} value={f.dados_necessarios} onChange={(e) => setF({ ...f, dados_necessarios: e.target.value })} />
        <label style={lbl}>Data-alvo</label>
        <input type="date" style={inp} value={f.data_alvo} onChange={(e) => setF({ ...f, data_alvo: e.target.value })} />
        {err && <span style={errStyle}>{err}</span>}
        <button style={btnPrim} disabled={busy} onClick={run}>{busy ? 'Salvando…' : 'Criar definição'}</button>
      </div>
    </Modal>
  )
}

function ModalDecisao({ definicoes, onClose, onOk }: { definicoes: Any[]; onClose: () => void; onOk: () => void }) {
  const [f, setF] = useState({ descricao: '', prazo: '', dono_id: '', definicao_id: '' })
  const { busy, err, run } = useSubmit(async () => { await postJSON('/api/war-room/decisoes', f); onOk(); onClose() })
  const pendentes = definicoes.filter((d) => d.status === 'pendente' || d.status === 'agendada')
  return (
    <Modal titulo="Registrar decisão na ata" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <textarea placeholder="A decisão tomada" style={{ ...inp, minHeight: 70 }} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        <label style={lbl}>Dono (opcional)</label>
        <UserSelect value={f.dono_id} onChange={(id) => setF({ ...f, dono_id: id })} placeholder="Responsável pela decisão" />
        <label style={lbl}>Prazo (opcional)</label>
        <input type="date" style={inp} value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} />
        {pendentes.length > 0 && <>
          <label style={lbl}>Resolve uma definição estratégica? (opcional)</label>
          <select style={inp} value={f.definicao_id} onChange={(e) => setF({ ...f, definicao_id: e.target.value })}>
            <option value="">— nenhuma —</option>
            {pendentes.map((d) => <option key={String(d.id)} value={String(d.id)}>{String(d.tema)}</option>)}
          </select>
        </>}
        {err && <span style={errStyle}>{err}</span>}
        <button style={btnPrim} disabled={busy} onClick={run}>{busy ? 'Registrando…' : 'Registrar decisão'}</button>
      </div>
    </Modal>
  )
}

function ModalCaixa({ atual, onClose, onOk }: { atual: Any | undefined; onClose: () => void; onOk: () => void }) {
  const [f, setF] = useState({
    caixa_30d: String(atual?.caixa_30d ?? ''), caixa_60d: String(atual?.caixa_60d ?? ''),
    caixa_90d: String(atual?.caixa_90d ?? ''), volume_antecipado: String(atual?.volume_antecipado ?? ''),
    margem_semana: '', tratores_vendidos: '', entradas_patio: '',
  })
  const { busy, err, run } = useSubmit(async () => {
    const body: Any = {}
    for (const c of CAMPOS_MANUAIS_SNAPSHOT) { const v = (f as Any)[c]; if (v !== '' && v != null) body[c] = v }
    const r = await fetch('/api/war-room/snapshots', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Falha')
    onOk(); onClose()
  })
  return (
    <Modal titulo="Caixa da semana (manual)" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>O saldo de caixa não é derivado automaticamente — digite os valores projetados. Os demais campos são preenchidos pelo cron (deixe em branco para manter).</div>
        {(['caixa_30d', 'caixa_60d', 'caixa_90d', 'volume_antecipado'] as const).map((c) => (
          <div key={c}><label style={lbl}>{c.replace('_', ' ')}</label>
            <input type="number" style={inp} value={String((f as Any)[c] ?? '')} onChange={(e) => setF({ ...f, [c]: e.target.value })} /></div>
        ))}
        {err && <span style={errStyle}>{err}</span>}
        <button style={btnPrim} disabled={busy} onClick={run}>{busy ? 'Salvando…' : 'Salvar caixa'}</button>
      </div>
    </Modal>
  )
}

function ModalFonte({ onClose, onOk }: { onClose: () => void; onOk: () => void }) {
  const [f, setF] = useState({ nome: '', meta: '', realizado: '', prazo: '' })
  const { busy, err, run } = useSubmit(async () => { await postJSON('/api/war-room/ponte', f); onOk(); onClose() })
  return (
    <Modal titulo="Nova fonte da ponte de caixa" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input placeholder="Nome (ex.: cobrança grandes devedores)" style={inp} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        <input type="number" placeholder="Meta (R$)" style={inp} value={f.meta} onChange={(e) => setF({ ...f, meta: e.target.value })} />
        <input type="number" placeholder="Realizado (R$)" style={inp} value={f.realizado} onChange={(e) => setF({ ...f, realizado: e.target.value })} />
        <label style={lbl}>Prazo</label>
        <input type="date" style={inp} value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} />
        {err && <span style={errStyle}>{err}</span>}
        <button style={btnPrim} disabled={busy} onClick={run}>{busy ? 'Salvando…' : 'Criar fonte'}</button>
      </div>
    </Modal>
  )
}

function ModalVirar({ decisao, onClose, onOk }: { decisao: Any; onClose: () => void; onOk: () => void }) {
  const [f, setF] = useState({ fase: '1_atacar' as WarRoomFase, dono_id: String(decisao.dono_id || ''), titulo: String(decisao.descricao || '').slice(0, 120) })
  const { busy, err, run } = useSubmit(async () => { await postJSON(`/api/war-room/decisoes/${decisao.id}/virar-acao`, f); onOk(); onClose() })
  return (
    <Modal titulo="Transformar decisão em ação" onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#666)' }}>{String(decisao.descricao)}</div>
        <input placeholder="Título da ação" style={inp} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
        <label style={lbl}>Fase</label>
        <select style={inp} value={f.fase} onChange={(e) => setF({ ...f, fase: e.target.value as WarRoomFase })}>
          {FASES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <label style={lbl}>Dono</label>
        <UserSelect value={f.dono_id} onChange={(id) => setF({ ...f, dono_id: id })} placeholder="Escolher dono" />
        {err && <span style={errStyle}>{err}</span>}
        <button style={btnPrim} disabled={busy} onClick={run}>{busy ? 'Criando…' : 'Criar ação a partir da decisão'}</button>
      </div>
    </Modal>
  )
}

const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--portal-text-muted,#888)', margin: '2px 0 -4px' }
const errStyle: React.CSSProperties = { fontSize: 13, color: '#dc2626' }
