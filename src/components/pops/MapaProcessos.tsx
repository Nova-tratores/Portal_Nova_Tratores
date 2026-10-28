'use client'
// POPs — Mapa de processos: um POP para cada processo da empresa (pedido de 22/10/2026).
// Dono, prioridade e prazo são editados aqui (admin de POPs ou dono da área); a situação
// sai sozinha do POP ligado. "Criar POP" duplica o modelo do sistema quando há.
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Pencil, FileText, AlertTriangle } from 'lucide-react'
import { chamar, cartao, campo, rotulo, botao, botaoClaro, chip, Modal, br, COR_POPS, pagina, vazio } from './comum'
import { SITUACAO_INFO, PRIORIDADES, type Situacao, type Prioridade, type ResumoMapa } from '@/lib/pops/processos'

interface Processo {
  id: string; area_id: string; titulo: string; tela: string | null; prioridade: Prioridade
  dono_id: string | null; prazo: string | null; observacao: string | null; arquivado: boolean
  situacao: Situacao; atrasado: boolean
  pop: { id: string; codigo: string; titulo: string } | null
  modelo: { id: string; codigo: string } | null
  modelo_codigo: string | null
  pode_editar: boolean; pode_criar_pop: boolean
}
interface Area { id: string; sigla: string; nome: string }
interface Usuario { id: string; nome: string; avatar_url: string | null }
interface Resp { processos: Processo[]; resumo: ResumoMapa; hoje: string; areas: Area[]; usuarios: Usuario[]; eu: { userId: string; admin: boolean; areasQueEdito: string[] } }

const COR_PRIORIDADE: Record<Prioridade, string> = { alta: '#b91c1c', media: '#d97706', baixa: '#6b7280' }
const ORDEM_PRIORIDADE: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2 }

export default function MapaProcessos() {
  const [d, setD] = useState<Resp | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [f, setF] = useState({ area: '', situacao: '', prioridade: '', dono: '', q: '', meus: false })
  const [editar, setEditar] = useState<Processo | null>(null)
  const [incluirEm, setIncluirEm] = useState<Area | null>(null)

  const carregar = useCallback(async () => {
    try { setD(await chamar<Resp>('/api/pops/processos')); setErro(null) } catch (e) { setErro((e as Error).message) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const usuarioPor = useMemo(() => new Map((d?.usuarios || []).map((u) => [u.id, u])), [d])
  const lista = useMemo(() => {
    if (!d) return []
    const q = f.q.trim().toLowerCase()
    return d.processos.filter((p) =>
      (!f.area || p.area_id === f.area) && (!f.situacao || (f.situacao === 'atrasado' ? p.atrasado : p.situacao === f.situacao))
      && (!f.prioridade || p.prioridade === f.prioridade)
      && (!f.dono || (f.dono === 'sem' ? !p.dono_id : p.dono_id === f.dono))
      && (!f.meus || p.dono_id === d.eu.userId)
      && (!q || p.titulo.toLowerCase().includes(q) || (p.pop?.codigo || '').toLowerCase().includes(q)))
  }, [d, f])

  const mudar = async (p: Processo, campos: Record<string, unknown>) => {
    setSalvando(p.id); setAviso(null)
    try { await chamar('/api/pops/processos', { method: 'PATCH', json: { id: p.id, ...campos } }); await carregar() }
    catch (e) { setAviso((e as Error).message) } finally { setSalvando(null) }
  }
  const criarPop = async (p: Processo) => {
    setSalvando(p.id); setAviso(null)
    try {
      const r = await chamar<{ codigo: string }>('/api/pops/processos', { method: 'PATCH', json: { id: p.id, acao: 'criar_pop' } })
      setAviso(`POP ${r.codigo} criado em rascunho${p.modelo ? ` a partir do modelo ${p.modelo.codigo}` : ''}. Abra o POP para escrever os passos.`)
      window.dispatchEvent(new Event('pops-mudou'))
      await carregar()
    } catch (e) { setAviso((e as Error).message) } finally { setSalvando(null) }
  }

  if (erro) return <div style={pagina}><div style={vazio}>{erro}</div></div>
  if (!d) return <div style={pagina}><div style={vazio}>Carregando o mapa de processos…</div></div>

  const r = d.resumo
  const filtro = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }))
  const areasVisiveis = d.areas.filter((a) => !f.area || a.id === f.area)

  return (
    <div style={pagina}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: 'var(--portal-text,#111)' }}>Mapa de processos</h1>
          <div style={{ fontSize: 13, color: 'var(--portal-text-secondary,#666)', marginTop: 3 }}>
            Um POP para cada processo. A situação muda sozinha quando o POP avança; o dono e o prazo são definidos aqui.
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div style={{ ...cartao, display: 'grid', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 18 }}>
          <div><span style={{ fontSize: 28, fontWeight: 900, color: COR_POPS }}>{r.prontos}</span><span style={{ fontSize: 15, color: 'var(--portal-text-secondary,#666)' }}> de {r.total} processos com POP publicado ({r.pct}%)</span></div>
          {r.atrasados > 0 && <button onClick={() => filtro('situacao', f.situacao === 'atrasado' ? '' : 'atrasado')} style={{ ...chip('#b91c1c', '#b91c1c1a'), border: 'none', cursor: 'pointer' }}><AlertTriangle size={12} /> {r.atrasados} com prazo vencido</button>}
          {r.semDono > 0 && <button onClick={() => filtro('dono', f.dono === 'sem' ? '' : 'sem')} style={{ ...chip('#6b7280', '#6b72801a'), border: 'none', cursor: 'pointer' }}>{r.semDono} sem dono</button>}
        </div>
        <div style={{ height: 10, borderRadius: 999, overflow: 'hidden', display: 'flex', background: 'var(--portal-bg-secondary,#f3f4f6)' }} aria-hidden="true">
          {(['publicado', 'publicado_editando', 'em_revisao', 'rascunho', 'sem_pop'] as Situacao[]).map((s) => r.porSituacao[s] ? (
            <div key={s} title={`${SITUACAO_INFO[s].label}: ${r.porSituacao[s]}`} style={{ width: `${(r.porSituacao[s] / Math.max(1, r.total)) * 100}%`, background: SITUACAO_INFO[s].cor }} />
          ) : null)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(['sem_pop', 'rascunho', 'em_revisao', 'publicado_editando', 'publicado'] as Situacao[]).map((s) => (
            <button key={s} onClick={() => filtro('situacao', f.situacao === s ? '' : s)}
              style={{ ...chip(SITUACAO_INFO[s].cor, `${SITUACAO_INFO[s].cor}1a`), border: f.situacao === s ? `2px solid ${SITUACAO_INFO[s].cor}` : '2px solid transparent', cursor: 'pointer' }}>
              {SITUACAO_INFO[s].label}: {r.porSituacao[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 0 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--portal-text-muted,#999)' }} />
          <input id="mp-busca" value={f.q} onChange={(e) => filtro('q', e.target.value)} placeholder="Buscar processo ou código do POP…" style={{ ...campo, paddingLeft: 30 }} />
        </div>
        <select id="mp-area" value={f.area} onChange={(e) => filtro('area', e.target.value)} style={{ ...campo, width: 'auto' }}>
          <option value="">Todas as áreas</option>
          {d.areas.map((a) => <option key={a.id} value={a.id}>{a.sigla} · {a.nome}</option>)}
        </select>
        <select id="mp-prio" value={f.prioridade} onChange={(e) => filtro('prioridade', e.target.value)} style={{ ...campo, width: 'auto' }}>
          <option value="">Toda prioridade</option>
          {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select id="mp-dono" value={f.dono} onChange={(e) => filtro('dono', e.target.value)} style={{ ...campo, width: 'auto', maxWidth: 220 }}>
          <option value="">Qualquer dono</option>
          <option value="sem">Sem dono</option>
          {d.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
        </select>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--portal-text,#111)' }}>
          <input id="mp-meus" type="checkbox" checked={f.meus} onChange={(e) => filtro('meus', e.target.checked)} /> Só os meus
        </label>
      </div>

      {aviso && <div style={{ ...cartao, padding: '10px 14px', marginBottom: 12, fontSize: 13 }} role="status">{aviso}</div>}

      {areasVisiveis.map((a) => {
        const ps = lista.filter((p) => p.area_id === a.id)
          .sort((x, y) => ORDEM_PRIORIDADE[x.prioridade] - ORDEM_PRIORIDADE[y.prioridade] || SITUACAO_INFO[x.situacao].ordem - SITUACAO_INFO[y.situacao].ordem)
        const todos = d.processos.filter((p) => p.area_id === a.id)
        const prontos = todos.filter((p) => p.situacao === 'publicado' || p.situacao === 'publicado_editando').length
        const edito = d.eu.areasQueEdito.includes(a.id)
        if (!ps.length && !edito) return null
        return (
          <section key={a.id} style={{ ...cartao, padding: 0, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--portal-border,#e5e7eb)' }}>
              <div style={{ fontWeight: 900, fontSize: 15, color: 'var(--portal-text,#111)' }}>
                {a.sigla} · {a.nome} <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--portal-text-secondary,#666)' }}>— {prontos} de {todos.length} publicados</span>
              </div>
              {edito && <button style={botaoClaro()} onClick={() => setIncluirEm(a)}><Plus size={14} /> Incluir processo</button>}
            </div>
            {!ps.length ? <div style={{ padding: 16, fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Nenhum processo com esses filtros.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 900 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--portal-text-secondary,#666)', fontSize: 11.5, textTransform: 'uppercase', letterSpacing: .3 }}>
                      <th style={th}>Processo</th><th style={th}>Prioridade</th><th style={th}>Dono</th><th style={th}>Prazo</th><th style={th}>Situação</th><th style={th}>POP</th><th style={th} />
                    </tr>
                  </thead>
                  <tbody>
                    {ps.map((p) => {
                      const dono = p.dono_id ? usuarioPor.get(p.dono_id) : null
                      const ocupado = salvando === p.id
                      return (
                        <tr key={p.id} style={{ borderTop: '1px solid var(--portal-border,#eee)', opacity: ocupado ? .55 : 1 }}>
                          <td style={td}>
                            <div style={{ fontWeight: 700, color: 'var(--portal-text,#111)' }}>{p.titulo}</div>
                            <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {p.tela && <Link href={p.tela} style={{ color: 'inherit' }}>{p.tela}</Link>}
                              {p.modelo && !p.pop && <span>modelo {p.modelo.codigo}</span>}
                              {p.observacao && <span title={p.observacao}>· {p.observacao.slice(0, 60)}{p.observacao.length > 60 ? '…' : ''}</span>}
                            </div>
                          </td>
                          <td style={td}>
                            {p.pode_editar ? (
                              <select aria-label="Prioridade" value={p.prioridade} disabled={ocupado} onChange={(e) => mudar(p, { prioridade: e.target.value })}
                                style={{ ...campo, width: 'auto', padding: '5px 8px', fontWeight: 700, color: COR_PRIORIDADE[p.prioridade] }}>
                                {PRIORIDADES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                              </select>
                            ) : <span style={chip(COR_PRIORIDADE[p.prioridade], `${COR_PRIORIDADE[p.prioridade]}1a`)}>{PRIORIDADES.find((x) => x.id === p.prioridade)?.label}</span>}
                          </td>
                          <td style={td}>
                            {p.pode_editar ? (
                              <select aria-label="Dono" value={p.dono_id || ''} disabled={ocupado} onChange={(e) => mudar(p, { dono_id: e.target.value || null })} style={{ ...campo, width: 180, padding: '5px 8px' }}>
                                <option value="">— sem dono —</option>
                                {d.usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                              </select>
                            ) : <span style={{ color: dono ? 'var(--portal-text,#111)' : 'var(--portal-text-muted,#999)' }}>{dono?.nome || 'sem dono'}</span>}
                          </td>
                          <td style={td}>
                            {p.pode_editar ? (
                              <input aria-label="Prazo" type="date" value={p.prazo || ''} disabled={ocupado} onChange={(e) => mudar(p, { prazo: e.target.value || null })}
                                style={{ ...campo, width: 150, padding: '5px 8px', color: p.atrasado ? '#b91c1c' : undefined, fontWeight: p.atrasado ? 800 : 400 }} />
                            ) : <span style={{ color: p.atrasado ? '#b91c1c' : undefined, fontWeight: p.atrasado ? 800 : 400 }}>{br(p.prazo)}</span>}
                            {p.atrasado && <div style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700 }}>vencido</div>}
                          </td>
                          <td style={td}><span style={chip(SITUACAO_INFO[p.situacao].cor, `${SITUACAO_INFO[p.situacao].cor}1a`)}>{SITUACAO_INFO[p.situacao].label}</span></td>
                          <td style={td}>
                            {p.pop ? <Link href={`/pops/${p.pop.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 800, color: COR_POPS }}><FileText size={14} /> {p.pop.codigo}</Link>
                              : p.pode_criar_pop ? <button style={botao(COR_POPS)} disabled={ocupado} onClick={() => criarPop(p)}><Plus size={14} /> {p.modelo ? 'Criar a partir do modelo' : 'Criar POP'}</button>
                              : <span style={{ color: 'var(--portal-text-muted,#999)', fontSize: 12.5 }}>falta criar</span>}
                          </td>
                          <td style={{ ...td, width: 44 }}>
                            {p.pode_editar && <button aria-label="Editar processo" title="Editar processo" onClick={() => setEditar(p)} style={{ ...botaoClaro(), padding: '6px 8px', minHeight: 30 }}><Pencil size={14} /></button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}

      <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)', marginTop: 6 }}>
        Quem muda dono, prioridade e prazo: admin de POPs ou o dono de POPs da área. Cada mudança fica no registro de atividades.
      </div>

      {editar && <ModalEditar p={editar} onFechar={() => setEditar(null)} onSalvo={async () => { setEditar(null); await carregar() }} />}
      {incluirEm && <ModalIncluir area={incluirEm} onFechar={() => setIncluirEm(null)} onSalvo={async () => { setIncluirEm(null); await carregar() }} />}
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 12px', fontWeight: 700, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'middle' }

function ModalEditar({ p, onFechar, onSalvo }: { p: Processo; onFechar: () => void; onSalvo: () => void }) {
  const [titulo, setTitulo] = useState(p.titulo)
  const [tela, setTela] = useState(p.tela || '')
  const [obs, setObs] = useState(p.observacao || '')
  const [pops, setPops] = useState<Array<{ id: string; codigo: string; titulo: string }>>([])
  const [popId, setPopId] = useState(p.pop?.id || '')
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  useEffect(() => {
    chamar<{ pops: Array<{ id: string; codigo: string; titulo: string; eh_template: boolean }> }>(`/api/pops?area=${p.area_id}`)
      .then((r) => setPops(r.pops.filter((x) => !x.eh_template))).catch(() => {})
  }, [p.area_id])
  const salvar = async (extra?: Record<string, unknown>) => {
    setOcupado(true); setMsg(null)
    try {
      await chamar('/api/pops/processos', { method: 'PATCH', json: { id: p.id, titulo, tela, observacao: obs, ...extra } })
      if ((popId || null) !== (p.pop?.id || null)) await chamar('/api/pops/processos', { method: 'PATCH', json: { id: p.id, acao: 'vincular', pop_id: popId || null } })
      onSalvo()
    } catch (e) { setMsg((e as Error).message); setOcupado(false) }
  }
  return (
    <Modal titulo="Editar processo" onFechar={onFechar}>
      <div style={{ display: 'grid', gap: 12 }}>
        <label><span style={rotulo}>Processo</span><input id="ed-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} style={campo} /></label>
        <label><span style={rotulo}>Tela no portal (opcional)</span><input id="ed-tela" value={tela} onChange={(e) => setTela(e.target.value)} placeholder="/pos" style={campo} /></label>
        <label><span style={rotulo}>Observação</span><textarea id="ed-obs" value={obs} onChange={(e) => setObs(e.target.value)} rows={3} style={{ ...campo, resize: 'vertical' }} /></label>
        <label><span style={rotulo}>POP deste processo</span>
          <select id="ed-pop" value={popId} onChange={(e) => setPopId(e.target.value)} style={campo}>
            <option value="">— nenhum —</option>
            {pops.map((x) => <option key={x.id} value={x.id}>{x.codigo} · {x.titulo}</option>)}
          </select>
        </label>
        {msg && <div style={{ color: '#b91c1c', fontSize: 13 }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <button style={botaoClaro()} disabled={ocupado} onClick={() => salvar({ arquivado: true })}>Tirar do mapa</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={botaoClaro()} onClick={onFechar}>Cancelar</button>
            <button style={botao(COR_POPS)} disabled={ocupado || titulo.trim().length < 3} onClick={() => salvar()}>Salvar</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function ModalIncluir({ area, onFechar, onSalvo }: { area: Area; onFechar: () => void; onSalvo: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [tela, setTela] = useState('')
  const [prioridade, setPrioridade] = useState<Prioridade>('media')
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const salvar = async () => {
    setOcupado(true); setMsg(null)
    try { await chamar('/api/pops/processos', { json: { area_id: area.id, titulo, tela, prioridade } }); onSalvo() }
    catch (e) { setMsg((e as Error).message); setOcupado(false) }
  }
  return (
    <Modal titulo={`Incluir processo · ${area.sigla}`} onFechar={onFechar}>
      <div style={{ display: 'grid', gap: 12 }}>
        <label><span style={rotulo}>Processo</span><input id="in-titulo" autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Lavagem da máquina antes da entrega" style={campo} /></label>
        <label><span style={rotulo}>Tela no portal (opcional)</span><input id="in-tela" value={tela} onChange={(e) => setTela(e.target.value)} placeholder="/pos" style={campo} /></label>
        <label><span style={rotulo}>Prioridade</span>
          <select id="in-prio" value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)} style={campo}>
            {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        {msg && <div style={{ color: '#b91c1c', fontSize: 13 }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={botaoClaro()} onClick={onFechar}>Cancelar</button>
          <button style={botao(COR_POPS)} disabled={ocupado || titulo.trim().length < 3} onClick={salvar}>Incluir</button>
        </div>
      </div>
    </Modal>
  )
}
