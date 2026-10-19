'use client'
// Aba "Padrões" de /atividades: onde o usuário passa por várias telas para
// juntar as informações de UM caso (quebra-cabeça) → candidatos a trazer a
// informação para a tela anterior. Dados de /api/uso/padroes (lib/uso/padroes.ts).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Puzzle, ArrowRight, Repeat, Clock, Users } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { Painel, Tile, useTemaEscuro, type Tema } from '@/components/comum/PainelBarras'
import type { Agregado } from '@/lib/ppv/relacao'
import { fluxoDaTela, type Card, type ResumoPadroes, type ParTelas } from '@/lib/uso/padroes'

const TEMA: Tema = {
  accent: '#dc2626', accentDark: '#f87171', accentText: '#fff',
  surface: '#ffffff', border: '#f0f0f0', text: '#1a1a1a', textLight: '#a3a3a3',
  bg: '#fafafa', primaryLight: '#fef2f2', primaryText: '#dc2626',
}

type Resp = ResumoPadroes & {
  periodo: { de: string; ate: string }
  eventosLidos: number; eventosTruncados: boolean
  migracaoFaltando: boolean; monitorLigado: boolean; podeVerTodos: boolean; podeEditar: boolean
  erro?: string
}

const STATUS: Array<{ v: Card['status']; label: string; cor: string; bg: string }> = [
  { v: 'nova', label: 'Nova', cor: '#737373', bg: '#f5f5f5' },
  { v: 'em_analise', label: 'Em análise', cor: '#b45309', bg: '#fffbeb' },
  { v: 'feito', label: 'Feito', cor: '#047857', bg: '#ecfdf5' },
  { v: 'descartado', label: 'Descartado', cor: '#a3a3a3', bg: '#fafafa' },
]

const PRESETS = [{ label: '7 dias', dias: 7 }, { label: '30 dias', dias: 30 }, { label: '90 dias', dias: 90 }]
function isoDia(d: Date): string { return d.toISOString().slice(0, 10) }
function hojeLocal(): string { return isoDia(new Date(Date.now() - 3 * 3600 * 1000)) }
function menosDias(ate: string, n: number): string { return isoDia(new Date(new Date(ate + 'T12:00:00Z').getTime() - (n - 1) * 86400000)) }
const n = (v: number) => v.toLocaleString('pt-BR')
const tempo = (s: number) => (s < 90 ? `${s} s` : `${Math.round(s / 60)} min`)

const th: React.CSSProperties = { fontSize: '10px', fontWeight: 700, color: '#a3a3a3', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '10px 14px', textAlign: 'left', background: '#fafafa', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }
const td: React.CSSProperties = { fontSize: '13px', color: '#1a1a1a', padding: '9px 14px', borderBottom: '1px solid #f5f5f5', verticalAlign: 'top' }
const card: React.CSSProperties = { background: '#ffffff', borderRadius: '16px', border: '1px solid #f0f0f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', overflow: 'hidden' }
const inp: React.CSSProperties = { padding: '8px 12px', borderRadius: '10px', background: '#fafafa', border: '1px solid #e5e5e5', color: '#1a1a1a', fontSize: '13px', fontFamily: 'Inter', outline: 'none' }
const titulo: React.CSSProperties = { fontSize: '15px', fontWeight: 800, color: '#1a1a1a', margin: '0 0 4px' }
const sub: React.CSSProperties = { fontSize: '12px', color: '#a3a3a3', margin: '0 0 14px' }

/** Mini gráfico semanal; a semana do "feito" ganha uma linha. */
function Serie({ serie, feitoEm }: { serie: Card['serie']; feitoEm: string | null }) {
  const max = Math.max(1, ...serie.map((s) => s.n))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '34px' }}>
      {serie.map((s) => {
        const corte = feitoEm && s.semana <= feitoEm && feitoEm < isoDia(new Date(new Date(s.semana + 'T12:00:00Z').getTime() + 7 * 86400000))
        return (
          <div key={s.semana} title={`semana de ${s.semana.slice(8, 10)}/${s.semana.slice(5, 7)}: ${s.n}`} style={{
            flex: 1, minWidth: '4px', height: `${Math.max(2, (s.n / max) * 34)}px`, borderRadius: '2px',
            background: feitoEm && s.semana > feitoEm ? '#10b981' : '#fca5a5',
            outline: corte ? '2px solid #047857' : undefined,
          }} />
        )
      })}
    </div>
  )
}

function CardOportunidade({ c, podeEditar, onSalvar }: { c: Card; podeEditar: boolean; onSalvar: (c: Card, status: Card['status'], nota: string) => Promise<void> }) {
  const [nota, setNota] = useState(c.nota || '')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { setNota(c.nota || '') }, [c.nota])
  const st = STATUS.find((s) => s.v === c.status) || STATUS[0]
  const salvar = async (status: Card['status']) => { setSalvando(true); try { await onSalvar(c, status, nota) } finally { setSalvando(false) } }
  return (
    <div style={{ ...card, padding: '16px 18px', opacity: c.status === 'descartado' ? 0.55 : 1, display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: c.origem === 'telas' ? '#dc2626' : '#7c3aed' }}>
          {c.origem === 'telas' ? 'Telas' : 'Ações'}
        </span>
        <span style={{ fontSize: '11px', fontWeight: 700, color: st.cor, background: st.bg, borderRadius: '999px', padding: '2px 8px' }}>{st.label}</span>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#a3a3a3' }} title="(mesmo caso + 2 × idas-e-voltas) × √pessoas">score {n(c.score)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', fontSize: '14px', fontWeight: 700, color: '#1a1a1a', wordBreak: 'break-word' }}>
        <code>{c.de}</code><ArrowRight size={14} color="#a3a3a3" /><code>{c.para}</code>
      </div>
      <div style={{ fontSize: '12px', color: '#525252' }}>{c.motivo}</div>
      <div style={{ fontSize: '13px', color: '#1a1a1a', background: '#fef2f2', borderRadius: '10px', padding: '8px 10px' }}>💡 {c.sugestao}</div>
      <div style={{ fontSize: '11px', color: '#a3a3a3' }}>Quem mais faz: {c.nomes.join(', ') || '—'}</div>
      <Serie serie={c.serie} feitoEm={c.status === 'feito' ? c.feito_em : null} />
      {c.status === 'feito' && (
        <div style={{ fontSize: '12px', color: '#047857' }}>
          Feito em {c.feito_em ? c.feito_em.split('-').reverse().join('/') : '—'}{c.por ? ` por ${c.por}` : ''} ·
          {' '}antes {c.antesPorSemana ?? '—'}/sem → depois {c.depoisPorSemana ?? 'aguardando semana completa'}{c.depoisPorSemana !== null ? '/sem' : ''}
        </div>
      )}
      {podeEditar && (
        <>
          <textarea value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (o que foi feito, ideia, por que descartou…)" rows={2}
            style={{ ...inp, resize: 'vertical', fontSize: '12px' }} />
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {STATUS.map((s) => (
              <button key={s.v} disabled={salvando} onClick={() => salvar(s.v)} style={{
                ...inp, padding: '5px 10px', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
                background: c.status === s.v ? s.bg : '#fff', color: s.cor, border: `1px solid ${c.status === s.v ? s.cor : '#e5e5e5'}`,
              }}>{s.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

type ColPar = 'n' | 'pessoas' | 'pctSaida' | 'pctMesmo' | 'pctVolta' | 'gapMedioS' | 'score'

export default function PadroesAba({ usuarios }: { usuarios: { id: string; nome: string }[] }) {
  const dark = useTemaEscuro()
  const [ate, setAte] = useState(hojeLocal())
  const [de, setDe] = useState(menosDias(hojeLocal(), 30))
  const [usuario, setUsuario] = useState('')
  const [dados, setDados] = useState<Resp | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [mostrar, setMostrar] = useState<'abertas' | 'todas'>('abertas')
  const [ordem, setOrdem] = useState<{ col: ColPar; desc: boolean }>({ col: 'score', desc: true })
  const [semHub, setSemHub] = useState(true)
  const [tela, setTela] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('')
    try {
      const qs = new URLSearchParams({ de, ate }); if (usuario) qs.set('usuario', usuario)
      const r = await fetch(`/api/uso/padroes?${qs}`, { headers: await authHeaders(), cache: 'no-store' })
      const d = (await r.json()) as Resp
      if (!r.ok || d.erro) { setErro(d.erro || `Erro ${r.status}`); setDados(null); return }
      setDados(d)
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }, [de, ate, usuario])
  useEffect(() => { carregar() }, [carregar])

  const salvar = useCallback(async (c: Card, status: Card['status'], nota: string) => {
    const r = await fetch('/api/uso/padroes/oportunidades', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ chave: c.chave, status, nota }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { alert(d.erro || `Erro ${r.status}`); return }
    await carregar()
  }, [carregar])

  const cards = useMemo(() => (dados?.cards || [])
    .filter((c) => mostrar === 'todas' || (c.status !== 'feito' && c.status !== 'descartado')), [dados, mostrar])
  const cardsTelas = cards.filter((c) => c.origem === 'telas')
  const cardsAcoes = cards.filter((c) => c.origem === 'acoes')

  const pares = useMemo(() => {
    const l = (dados?.pares || []).filter((p) => !semHub || !p.hub)
    const k = ordem.col
    return [...l].sort((a, b) => (ordem.desc ? (b[k] as number) - (a[k] as number) : (a[k] as number) - (b[k] as number))).slice(0, 80)
  }, [dados, ordem, semHub])

  const telaEfetiva = tela || dados?.pares.find((p) => !p.hub)?.de || ''
  const fluxo = useMemo(() => fluxoDaTela(dados?.pares || [], telaEfetiva), [dados, telaEfetiva])
  const ag = (l: Array<{ rota: string; n: number }>): Agregado[] => l.map((x) => ({ chave: x.rota, label: x.rota, n: x.n, valor: x.n, ids: [] }))

  const thOrd = (col: ColPar, label: string) => (
    <th style={th} onClick={() => setOrdem((o) => ({ col, desc: o.col === col ? !o.desc : true }))}>
      {label}{ordem.col === col ? (ordem.desc ? ' ▼' : ' ▲') : ''}
    </th>
  )

  const t = dados?.totais
  return (
    <div>
      {/* Filtros */}
      <div style={{ ...card, padding: '14px 20px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        {PRESETS.map((p) => {
          const ativo = de === menosDias(ate, p.dias)
          return <button key={p.dias} onClick={() => setDe(menosDias(ate, p.dias))} style={{ ...inp, cursor: 'pointer', fontWeight: 600, background: ativo ? '#fef2f2' : '#fafafa', border: ativo ? '1px solid #fecaca' : '1px solid #e5e5e5', color: ativo ? '#dc2626' : '#737373' }}>{p.label}</button>
        })}
        <input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} style={inp} />
        <span style={{ color: '#a3a3a3', fontSize: '12px' }}>até</span>
        <input type="date" value={ate} max={hojeLocal()} onChange={(e) => { setAte(e.target.value); if (de > e.target.value) setDe(e.target.value) }} style={inp} />
        {dados?.podeVerTodos !== false && (
          <select value={usuario} onChange={(e) => setUsuario(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            <option value="">Todos os usuários</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        )}
        <button onClick={carregar} disabled={carregando} style={{ ...inp, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', color: '#737373' }}>
          <RefreshCw size={13} className={carregando ? 'animate-spin' : ''} /> {carregando ? 'Carregando…' : 'Atualizar'}
        </button>
      </div>

      <div style={{ ...card, padding: '12px 18px', marginBottom: '20px', fontSize: '12px', color: '#525252', lineHeight: 1.55 }}>
        <strong>Como ler:</strong> cada card é um caminho que as pessoas repetem para juntar as informações de um caso.
        <strong> Telas</strong> = de qual tela foram para qual (mesmo cliente/OS/chassi nas duas, ou ida e volta logo em seguida).
        <strong> Ações</strong> = mexeram numa coisa e, em até 30 min, noutra (histórico de atividades).
        Quanto mais pessoas e mais idas-e-voltas, maior o score. Marque <em>Feito</em> quando a informação for trazida para a tela anterior: o gráfico mostra se o caminho diminuiu depois.
      </div>

      {erro && <div style={{ ...card, padding: '14px 20px', marginBottom: '20px', color: '#dc2626', fontSize: '13px' }}>{erro}</div>}
      {dados?.migracaoFaltando && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '12px', padding: '10px 16px', marginBottom: '20px', fontSize: '12px', color: '#92400e' }}>
          A captura das jornadas entre telas ainda não está instalada no banco (aplicar <code>sql/portal-uso-transicoes.sql</code>). Por enquanto aparecem só as <strong>sequências de ações</strong>, e não dá para salvar o status das oportunidades.
        </div>
      )}
      {dados && !dados.monitorLigado && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '12px', padding: '10px 16px', marginBottom: '20px', fontSize: '12px', color: '#92400e' }}>
          O monitor está <strong>desligado</strong> neste ambiente (liga sozinho em produção; no local, <code>USO_MONITOR=on</code>).
        </div>
      )}
      {dados?.eventosTruncados && (
        <div style={{ fontSize: '12px', color: '#92400e', marginBottom: '12px' }}>Período com muitas atividades: as sequências de ações usaram as primeiras {n(dados.eventosLidos)}. Encurte o período para ver tudo.</div>
      )}

      {dados && t && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '24px' }}>
            <Tile tema={TEMA} label="Trocas de tela" valor={n(t.transicoes)} sub={`${n(t.pessoas)} pessoas`} destaque />
            <Tile tema={TEMA} label="No mesmo caso" valor={t.transicoes ? `${Math.round((t.mesmoCaso / t.transicoes) * 100)}%` : '—'} sub={`${n(t.mesmoCaso)} trocas`} />
            <Tile tema={TEMA} label="Idas e voltas" valor={n(t.voltas)} sub="A → B → A em até 5 min" />
            <Tile tema={TEMA} label="Tempo médio por tela" valor={t.transicoes ? tempo(t.gapMedioS) : '—'} sub="antes de trocar" />
            <Tile tema={TEMA} label="Sequências de ações" valor={n(t.sequencias)} sub="histórico de atividades" />
          </div>

          {/* Oportunidades */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <Puzzle size={18} color="#dc2626" />
            <h3 style={{ ...titulo, margin: 0 }}>Oportunidades</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
              {(['abertas', 'todas'] as const).map((m) => (
                <button key={m} onClick={() => setMostrar(m)} style={{ ...inp, padding: '5px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 600, background: mostrar === m ? '#fef2f2' : '#fafafa', color: mostrar === m ? '#dc2626' : '#737373', border: mostrar === m ? '1px solid #fecaca' : '1px solid #e5e5e5' }}>
                  {m === 'abertas' ? 'Em aberto' : 'Todas (com feitas/descartadas)'}
                </button>
              ))}
            </div>
          </div>

          {[['Entre telas', cardsTelas, 'Ainda sem jornadas gravadas no período — elas começam a aparecer depois que a migration for aplicada e o pessoal usar o portal.'],
            ['Entre ações', cardsAcoes, 'Nenhuma sequência de ações repetida no período.']].map(([nome, lista, vazio]) => (
            <div key={nome as string} style={{ marginBottom: '24px' }}>
              <p style={{ ...sub, fontWeight: 700, color: '#737373', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '11px' }}>{nome as string}</p>
              {(lista as Card[]).length === 0
                ? <div style={{ ...card, padding: '14px 18px', fontSize: '12px', color: '#a3a3a3' }}>{vazio as string}</div>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
                    {(lista as Card[]).map((c) => <CardOportunidade key={c.chave} c={c} podeEditar={dados.podeEditar && !dados.migracaoFaltando} onSalvar={salvar} />)}
                  </div>
                )}
            </div>
          ))}

          {/* Fluxo de uma tela */}
          {dados.telas.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <h3 style={{ ...titulo, margin: 0 }}>Fluxo de uma tela</h3>
                <select value={telaEfetiva} onChange={(e) => setTela(e.target.value)} style={{ ...inp, cursor: 'pointer', maxWidth: '100%' }}>
                  {dados.telas.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px' }}>
                <Painel tema={TEMA} titulo="De onde as pessoas chegam" sub={`→ ${telaEfetiva}`} itens={ag(fluxo.entradas)} metrica="n" horizontal dark={dark} />
                <Painel tema={TEMA} titulo="Para onde vão em seguida" sub={`${telaEfetiva} →`} itens={ag(fluxo.saidas)} metrica="n" horizontal dark={dark} />
              </div>
            </div>
          )}

          {/* Pares de telas */}
          {dados.pares.length > 0 && (
            <div style={{ ...card, marginBottom: '24px' }}>
              <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h3 style={{ ...titulo, margin: 0 }}>Caminhos entre telas</h3>
                <label style={{ fontSize: '12px', color: '#737373', display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto', cursor: 'pointer' }}>
                  <input type="checkbox" checked={semHub} onChange={(e) => setSemHub(e.target.checked)} /> esconder saídas do dashboard
                </label>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '860px' }}>
                  <thead><tr>
                    <th style={{ ...th, cursor: 'default' }}>De → Para</th>
                    {thOrd('n', 'Vezes')}{thOrd('pessoas', 'Pessoas')}{thOrd('pctSaida', '% das saídas')}
                    {thOrd('pctMesmo', 'Mesmo caso')}{thOrd('pctVolta', 'Ida e volta')}{thOrd('gapMedioS', 'Tempo antes')}{thOrd('score', 'Score')}
                  </tr></thead>
                  <tbody>
                    {pares.map((p: ParTelas) => (
                      <tr key={p.chave} style={{ opacity: p.hub ? 0.55 : 1 }}>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }} title={p.nomes.join(', ')}>{p.de} <span style={{ color: '#a3a3a3' }}>→</span> {p.para}</td>
                        <td style={td}>{n(p.n)}</td>
                        <td style={td}><Users size={11} style={{ verticalAlign: '-1px' }} /> {p.pessoas}</td>
                        <td style={td}>{p.pctSaida}%</td>
                        <td style={td}>{p.pctMesmo}%</td>
                        <td style={td}><Repeat size={11} style={{ verticalAlign: '-1px' }} /> {p.pctVolta}%</td>
                        <td style={td}><Clock size={11} style={{ verticalAlign: '-1px' }} /> {tempo(p.gapMedioS)}</td>
                        <td style={{ ...td, fontWeight: 700 }}>{p.hub ? '—' : n(p.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Sequências de ações */}
          {dados.sequencias.length > 0 && (
            <div style={{ ...card, marginBottom: '24px' }}>
              <div style={{ padding: '14px 18px' }}>
                <h3 style={titulo}>Sequências de ações</h3>
                <p style={{ ...sub, margin: 0 }}>Mesma pessoa, uma coisa e depois outra em até 30 min (ações repetidas na mesma coisa contam como um passo).</p>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '640px' }}>
                  <thead><tr>{['Primeiro', 'Depois', 'Vezes', 'Pessoas', 'Intervalo médio', 'Quem mais faz'].map((h) => <th key={h} style={{ ...th, cursor: 'default' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {dados.sequencias.slice(0, 50).map((s) => (
                      <tr key={s.chave}>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>{s.de}</td>
                        <td style={{ ...td, fontFamily: 'monospace', fontSize: '12px' }}>{s.para}</td>
                        <td style={td}>{n(s.n)}</td>
                        <td style={td}>{s.pessoas}</td>
                        <td style={td}>{tempo(s.gapMedioS)}</td>
                        <td style={{ ...td, color: '#737373' }}>{s.nomes.join(', ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
