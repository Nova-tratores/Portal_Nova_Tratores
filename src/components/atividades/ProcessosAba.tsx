'use client'
// Aba "Processos" de /atividades: Fluxograma | Organograma (?vista=organograma).
// Fluxograma = caminho REAL das OS do Pós-venda, montado das trocas de fase gravadas (logs_ppo). Fases em coluna na ordem do quadro; setas para baixo/à direita =
// avanço, à esquerda em vermelho = volta (retrabalho). Dados de /api/processos/os.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RefreshCw, Workflow, Network } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { Tile, type Tema } from '@/components/comum/PainelBarras'
import { faseOS } from '@/lib/pos/relacao'
import Organograma from './Organograma'
import type { ResumoProcesso, SetaProcesso, FaseProcesso, TipoAtor } from '@/lib/processos/mineracao'

const TEMA: Tema = {
  accent: '#0369A1', accentDark: '#38bdf8', accentText: '#fff',
  // variáveis do tema do portal: no escuro os números dos quadros somem com cor fixa
  surface: 'var(--portal-bg-card)', border: 'var(--portal-border)', text: 'var(--portal-text)', textLight: 'var(--portal-text-muted)',
  bg: 'var(--portal-bg-secondary)', primaryLight: '#f0f9ff', primaryText: '#0369A1',
}

type Resp = ResumoProcesso & { linhasLidas: number; error?: string }

const PRESETS = [{ label: '30 dias', dias: 30 }, { label: '90 dias', dias: 90 }, { label: '180 dias', dias: 180 }, { label: 'Tudo', dias: 0 }]
const isoDia = (d: Date) => d.toISOString().slice(0, 10)
const n = (v: number) => v.toLocaleString('pt-BR')
const pct = (v: number) => `${Math.round(v * 100)}%`
function tempo(h: number | null): string {
  if (h == null) return '—'
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`
  if (h < 48) return `${Math.round(h)} h`
  return `${(h / 24).toLocaleString('pt-BR', { maximumFractionDigits: h < 240 ? 1 : 0 })} d`
}
/** Tempo só quando medido em pelo menos 3 passagens (com a entrada na fase registrada). */
const tempoMed = (x: { medianaH: number | null; medidas: number }) => (x.medidas >= 3 ? tempo(x.medianaH) : '—')
const SELO: Record<TipoAtor, { txt: string; cor: string; bg: string }> = {
  pessoa: { txt: 'pessoa', cor: '#0369A1', bg: '#f0f9ff' },
  robo: { txt: 'automático', cor: '#737373', bg: '#f5f5f5' },
  compartilhado: { txt: 'login compartilhado', cor: '#b45309', bg: '#fffbeb' },
}

const card: React.CSSProperties = { background: '#ffffff', borderRadius: '16px', border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }
const th: React.CSSProperties = { fontSize: '10px', fontWeight: 700, color: '#a3a3a3', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '10px 14px', textAlign: 'left', background: '#fafafa', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { fontSize: '13px', color: 'var(--portal-text)', padding: '9px 14px', borderBottom: '1px solid #f5f5f5', verticalAlign: 'top' }
const inp: React.CSSProperties = { padding: '8px 12px', borderRadius: '10px', background: '#fafafa', border: '1px solid #e5e5e5', color: 'var(--portal-text)', fontSize: '13px', fontFamily: 'Inter', outline: 'none' }
const titulo: React.CSSProperties = { fontSize: '15px', fontWeight: 800, color: 'var(--portal-text)', margin: '0 0 4px' }
const sub: React.CSSProperties = { fontSize: '12px', color: '#a3a3a3', margin: 0 }

// ---- desenho ----
const W = 760, BOX_W = 250, BOX_H = 46, GAP = 18, TOPO = 16
const CX = W / 2

function Fluxograma({ fases, setas, minN, sel, onSel }: { fases: FaseProcesso[]; setas: SetaProcesso[]; minN: number; sel: string | null; onSel: (f: string | null) => void }) {
  const [hover, setHover] = useState<string | null>(null)
  const pos = new Map(fases.map((f, i) => [f.fase, i]))
  const yDe = (i: number) => TOPO + i * (BOX_H + GAP)
  const visiveis = setas.filter((s) => s.n >= minN && pos.has(s.de) && pos.has(s.para))
  const max = Math.max(1, ...visiveis.map((s) => s.n))
  const H = TOPO * 2 + fases.length * (BOX_H + GAP)
  // setas com o mesmo lado e saída próxima se espalham um pouco para não sobrepor
  const deslocamento = new Map<string, number>()
  const porLado: Record<string, number> = {}
  for (const s of [...visiveis].sort((a, b) => Math.abs(pos.get(a.para)! - pos.get(a.de)!) - Math.abs(pos.get(b.para)! - pos.get(b.de)!))) {
    const lado = s.volta ? 'e' : 'd'
    const k = `${lado}${pos.get(s.de)}`
    porLado[k] = (porLado[k] || 0) + 1
    deslocamento.set(`${s.de}>${s.para}`, porLado[k])
  }
  const ligado = (s: SetaProcesso) => !sel || s.de === sel || s.para === sel

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, display: 'block', margin: '0 auto' }} role="img" aria-label="Fluxograma das OS">
      <defs>
        <marker id="pf-seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#0369A1" /></marker>
        <marker id="pf-volta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#dc2626" /></marker>
      </defs>
      {visiveis.map((s) => {
        const i = pos.get(s.de)!, j = pos.get(s.para)!
        const k = `${s.de}>${s.para}`
        const largura = 1.2 + 9 * Math.sqrt(s.n / max)
        const cor = s.volta ? '#dc2626' : '#0369A1'
        const ativo = hover === k
        const op = ligado(s) ? (ativo ? 1 : 0.55) : 0.08
        const desl = (deslocamento.get(k) || 1) * 5
        let d: string, lx: number, ly: number
        if (j === i + 1) {
          const x = CX + (desl - 5) * 2
          d = `M${x},${yDe(i) + BOX_H} L${x},${yDe(j) - 2}`; lx = x + 8; ly = yDe(i) + BOX_H + GAP / 2 + 4
        } else {
          const lado = s.volta ? -1 : 1
          const x0 = CX + lado * BOX_W / 2
          const y0 = yDe(i) + BOX_H / 2 + (s.volta ? -6 : 6), y1 = yDe(j) + BOX_H / 2 + (s.volta ? 6 : -6)
          const bojo = lado * (28 + Math.abs(j - i) * 13 + desl)
          d = `M${x0},${y0} C${x0 + bojo},${y0} ${x0 + bojo},${y1} ${x0 + lado * 3},${y1}`
          lx = x0 + bojo * 0.78; ly = (y0 + y1) / 2 + 4
        }
        return (
          <g key={k} onMouseEnter={() => setHover(k)} onMouseLeave={() => setHover(null)} style={{ cursor: 'default' }}>
            <path d={d} fill="none" stroke={cor} strokeWidth={largura} strokeOpacity={op} markerEnd={`url(#${s.volta ? 'pf-volta' : 'pf-seta'})`} />
            <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
            {(ativo || (ligado(s) && s.n >= max * 0.08)) && op > 0.1 && (
              <text x={lx} y={ly} fontSize={11} fontWeight={700} fill={cor} textAnchor={s.volta && j !== i + 1 ? 'end' : 'start'}>{n(s.n)}</text>
            )}
            <title>{`${faseOS(s.de).label} → ${faseOS(s.para).label}\n${n(s.n)} vezes em ${n(s.casos)} OS${s.volta ? ' (volta)' : ''}\nTempo parado antes de passar (mediana): ${tempoMed(s)} — medido em ${n(s.medidas)}\nAutomático: ${n(s.robo)}${s.quem.length ? '\nQuem passou: ' + s.quem.slice(0, 4).map(([q, c]) => `${q} (${c})`).join(', ') : ''}`}</title>
          </g>
        )
      })}
      {fases.map((f, i) => {
        const fo = faseOS(f.fase)
        const y = yDe(i)
        const ativo = sel === f.fase
        return (
          <g key={f.fase} onClick={() => onSel(ativo ? null : f.fase)} style={{ cursor: 'pointer' }}>
            <rect x={CX - BOX_W / 2} y={y} width={BOX_W} height={BOX_H} rx={10} fill={fo.bg} stroke={ativo ? fo.text : '#e5e5e5'} strokeWidth={ativo ? 2.5 : 1} />
            <text x={CX - BOX_W / 2 + 12} y={y + 19} fontSize={13} fontWeight={800} fill={fo.text}>{fo.label}</text>
            <text x={CX - BOX_W / 2 + 12} y={y + 36} fontSize={11} fill="#525252">{`${n(f.casos)} OS · fica ${tempoMed(f)}`}</text>
            {f.paradosAgora > 0 && f.fase !== 'Concluída' && f.fase !== 'Cancelada' && (
              <text x={CX + BOX_W / 2 - 12} y={y + 28} fontSize={11} fontWeight={700} fill="#b45309" textAnchor="end">{`${n(f.paradosAgora)} parada${f.paradosAgora > 1 ? 's' : ''}`}</text>
            )}
            <title>{`${f.fase}\n${n(f.casos)} OS passaram · ${n(f.entradas)} entradas · ${n(f.saidas)} saídas\nTempo parado (mediana): ${tempoMed(f)} — medido em ${n(f.medidas)}\nComeçaram aqui: ${n(f.inicios)}\nParadas nela agora: ${n(f.paradosAgora)}`}</title>
          </g>
        )
      })}
    </svg>
  )
}

function ListaSetas({ itens, campo }: { itens: SetaProcesso[]; campo: 'de' | 'para' }) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 12px', fontSize: '12px' }}>
      {itens.slice(0, 8).map((s) => (
        <li key={s.de + s.para} style={{ padding: '3px 0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: s.volta ? '#dc2626' : 'var(--portal-text)' }}>{s.volta ? '↩ ' : ''}{faseOS(s[campo]).label}</span>
          <span style={{ color: '#737373', whiteSpace: 'nowrap' }}>{n(s.n)} · {tempoMed(s)}</span>
        </li>
      ))}
      {!itens.length && <li style={{ color: '#a3a3a3' }}>nenhuma</li>}
    </ul>
  )
}

function DetalheFase({ f, setas }: { f: FaseProcesso; setas: SetaProcesso[] }) {
  const fo = faseOS(f.fase)
  const saem = setas.filter((s) => s.de === f.fase)
  const entram = setas.filter((s) => s.para === f.fase)
  return (
    <div style={{ ...card, padding: '14px 16px', borderTop: `4px solid ${fo.text}` }}>
      <h3 style={{ ...titulo, color: fo.text }}>{fo.label}</h3>
      <p style={{ ...sub, marginBottom: 10 }}>{n(f.casos)} OS passaram · fica {tempoMed(f)} (mediana de {n(f.medidas)}) · {n(f.paradosAgora)} nela agora</p>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: '1px' }}>Quem tira a OS daqui</div>
      <ul style={{ listStyle: 'none', padding: 0, margin: '4px 0 12px', fontSize: '12px' }}>
        {f.quemMove.map(([q, c, t]) => (
          <li key={q} style={{ padding: '3px 0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>{q} {t !== 'pessoa' && <span style={{ fontSize: '10px', color: SELO[t].cor, background: SELO[t].bg, borderRadius: 6, padding: '1px 6px' }}>{SELO[t].txt}</span>}</span>
            <span style={{ color: '#737373' }}>{n(c)} ({pct(c / Math.max(1, f.saidas))})</span>
          </li>
        ))}
        {!f.quemMove.length && <li style={{ color: '#a3a3a3' }}>ninguém (fase final)</li>}
      </ul>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: '1px' }}>Vai para</div>
      <ListaSetas itens={saem} campo="para" />
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: '1px' }}>Vem de</div>
      <ListaSetas itens={entram} campo="de" />
    </div>
  )
}

export default function ProcessosAba() {
  const sp = useSearchParams()
  const router = useRouter()
  const vista = sp.get('vista') === 'organograma' ? 'organograma' : 'fluxograma'
  const trocar = (v: 'fluxograma' | 'organograma') => {
    const p = new URLSearchParams(sp.toString())
    p.set('tab', 'processos')
    if (v === 'organograma') p.set('vista', v); else p.delete('vista')
    router.replace(`?${p}`, { scroll: false })
  }
  const botao = (v: 'fluxograma' | 'organograma', rotulo: string, icone: React.ReactNode) => (
    <button key={v} onClick={() => trocar(v)} style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', fontFamily: 'Inter', fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
      background: vista === v ? '#0369A1' : 'transparent', color: vista === v ? '#fff' : 'var(--portal-text-muted)', borderRadius: 8,
    }}>{icone}{rotulo}</button>
  )
  return (
    <div>
      <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 10, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', marginBottom: 16 }}>
        {botao('fluxograma', 'Fluxograma', <Workflow size={14} />)}
        {botao('organograma', 'Organograma', <Network size={14} />)}
      </div>
      {vista === 'organograma' ? <Organograma /> : <FluxogramaOS />}
    </div>
  )
}

function FluxogramaOS() {
  const [dias, setDias] = useState(0)
  const [minN, setMinN] = useState(5)
  const [sel, setSel] = useState<string | null>(null)
  const [dados, setDados] = useState<Resp | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const p = new URLSearchParams()
      if (dias) { const ate = new Date(Date.now() - 3 * 3600000); p.set('ate', isoDia(ate)); p.set('de', isoDia(new Date(ate.getTime() - (dias - 1) * 86400000))) }
      const r = await fetch(`/api/processos/os?${p}`, { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || `Erro ${r.status}`)
      setDados(j)
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }, [dias])
  useEffect(() => { carregar() }, [carregar])

  const faseSel = useMemo(() => dados?.fases.find((f) => f.fase === sel) || null, [dados, sel])
  const voltas = useMemo(() => (dados?.setas || []).filter((s) => s.volta).reduce((a, s) => a + s.n, 0), [dados])

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
        <Workflow size={18} color="#0369A1" />
        <strong style={{ fontSize: '14px' }}>OS do Pós-venda</strong>
        <span style={{ fontSize: '12px', color: '#a3a3a3' }}>— o caminho real, montado das trocas de fase gravadas</span>
        <div style={{ flex: 1 }} />
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => setDias(p.dias)} style={{ ...inp, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, background: dias === p.dias ? '#0369A1' : '#fafafa', color: dias === p.dias ? '#fff' : 'var(--portal-text)' }}>{p.label}</button>
        ))}
        <label style={{ fontSize: '12px', display: 'flex', gap: 6, alignItems: 'center' }} title="Esconde as setas com pouco movimento para o desenho ficar legível">
          setas com ao menos
          <input type="number" min={1} value={minN} onChange={(e) => setMinN(Math.max(1, Number(e.target.value) || 1))} style={{ ...inp, width: 64, padding: '5px 8px' }} />
        </label>
        <button onClick={carregar} disabled={carregando} style={{ ...inp, padding: '6px 10px', cursor: 'pointer' }} title="Atualizar"><RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /></button>
      </div>

      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 16px', marginBottom: 12, fontSize: 13, color: '#b91c1c' }}>{erro}</div>}
      {!dados && carregando && <div style={{ padding: 40, textAlign: 'center', color: '#a3a3a3' }}>Montando o fluxo…</div>}

      {dados && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '16px' }}>
            <Tile tema={TEMA} label="OS no histórico" valor={n(dados.casos)} sub={dados.periodo.de ? `desde ${new Date(dados.periodo.de).toLocaleDateString('pt-BR')}` : undefined} />
            <Tile tema={TEMA} label="Trocas de fase" valor={n(dados.eventos)} sub={`${pct(dados.pctRobo)} feitas pelo automático`} cor="#737373" />
            <Tile tema={TEMA} label="OS que voltaram" valor={n(dados.casosComVolta)} sub={`${pct(dados.casosComVolta / Math.max(1, dados.casos))} das OS · ${n(voltas)} voltas`} cor="#dc2626" />
            <Tile tema={TEMA} label="Caminho mais comum" valor={dados.caminhos[0] ? `${pct(dados.caminhos[0].n / Math.max(1, dados.casos))}` : '—'} sub="das OS seguem o 1º caminho abaixo" cor="#047857" />
          </div>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: '16px' }}>
            <div style={{ ...card, flex: '1 1 520px', padding: '14px 12px', minWidth: 0 }}>
              <h3 style={{ ...titulo, padding: '0 6px' }}>Fluxograma real</h3>
              <p style={{ ...sub, padding: '0 6px 10px' }}>
                Fases na ordem do quadro. Azul = avança (à direita quando pula fases), <span style={{ color: '#dc2626' }}>vermelho = volta</span>. Espessura = quantas vezes.
                Passe o mouse numa seta para ver tempo e quem passa; clique numa fase para ver o detalhe.
              </p>
              <Fluxograma fases={dados.fases} setas={dados.setas} minN={minN} sel={sel} onSel={setSel} />
            </div>
            <div style={{ flex: '0 1 300px', minWidth: 260, position: 'sticky', top: 100 }}>
              {faseSel ? <DetalheFase f={faseSel} setas={dados.setas} /> : (
                <div style={{ ...card, padding: '14px 16px', fontSize: '12px', color: '#737373', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--portal-text)' }}>Como ler</strong><br />
                  “Fica X” = tempo que a OS costuma ficar parada naquela fase (mediana).<br />
                  “N paradas” = OS cuja última troca registrada deixou ali.<br />
                  O que acontece fora do portal (telefone, WhatsApp) não aparece; logins compartilhados escondem quem fez.
                  <br /><br />Clique numa fase para ver quem tira a OS dali e para onde ela vai.
                </div>
              )}
              {dados.criadores.length > 0 && (
                <div style={{ ...card, padding: '14px 16px', marginTop: 12 }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: '1px' }}>Quem abre as OS</div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', fontSize: '12px' }}>
                    {dados.criadores.map(([q, c, t]) => (
                      <li key={q} style={{ padding: '3px 0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>{q} {t !== 'pessoa' && <span style={{ fontSize: '10px', color: SELO[t].cor, background: SELO[t].bg, borderRadius: 6, padding: '1px 6px' }}>{SELO[t].txt}</span>}</span>
                        <span style={{ color: '#737373' }}>{n(c)} ({pct(c / Math.max(1, dados.casos))})</span>
                      </li>
                    ))}
                  </ul>
                  <p style={{ ...sub, marginTop: 6, fontSize: 11 }}>Primeiro registro de cada OS no histórico (o histórico começa em 01/2026; OS mais antigas aparecem pelo primeiro movimento).</p>
                </div>
              )}
            </div>
          </div>

          <div style={{ ...card, marginBottom: '16px' }}>
            <div style={{ padding: '14px 18px' }}>
              <h3 style={titulo}>Caminhos mais comuns</h3>
              <p style={sub}>Sequência de fases que cada OS percorreu (do começo do histórico até a última troca).</p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Caminho</th><th style={th}>OS</th><th style={th}>%</th></tr></thead>
                <tbody>
                  {dados.caminhos.map((c, i) => (
                    <tr key={i}>
                      <td style={td}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                          {c.fases.map((f, k) => {
                            const fo = faseOS(f)
                            return (
                              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                {k > 0 && <span style={{ color: '#a3a3a3' }}>→</span>}
                                <span style={{ fontSize: 11, fontWeight: 700, color: fo.text, background: fo.bg, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>{fo.label}</span>
                              </span>
                            )
                          })}
                        </div>
                      </td>
                      <td style={{ ...td, fontWeight: 700 }}>{n(c.n)}</td>
                      <td style={{ ...td, color: '#737373' }}>{pct(c.n / Math.max(1, dados.casos))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ ...card, marginBottom: '16px' }}>
            <div style={{ padding: '14px 18px' }}>
              <h3 style={titulo}>Quem move as OS</h3>
              <p style={sub}>Quantas trocas de fase cada um fez e para onde mais leva a OS.</p>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead><tr>{['Quem', 'Trocas', 'OS', '% das trocas', 'Mais leva para'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {dados.atores.map((a) => (
                    <tr key={a.quem}>
                      <td style={{ ...td, fontWeight: 600 }}>
                        {a.quem}{' '}
                        {a.tipo !== 'pessoa' && <span style={{ fontSize: 10, color: SELO[a.tipo].cor, background: SELO[a.tipo].bg, borderRadius: 6, padding: '1px 6px', fontWeight: 600 }}>{SELO[a.tipo].txt}</span>}
                      </td>
                      <td style={td}>{n(a.n)}</td>
                      <td style={td}>{n(a.casos)}</td>
                      <td style={{ ...td, color: '#737373' }}>{pct(a.n / Math.max(1, dados.eventos))}</td>
                      <td style={{ ...td, fontSize: 12 }}>{a.para.map(([f, c]) => `${faseOS(f).label} (${n(c)})`).join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
