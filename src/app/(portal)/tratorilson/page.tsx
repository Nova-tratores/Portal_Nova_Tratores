'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { authHeaders } from '@/lib/auth/client'
import { useRouter } from 'next/navigation'
import { Bot, Loader2, Save, X, Search } from 'lucide-react'

interface LogRow {
  id: number; created_at: string; user_nome: string | null; tipo: string
  pergunta: string | null; resposta: string | null; modelo: string | null; tokens: number
}
interface Dados {
  limite: number; tokensMes: number; solicitacoesMes: number
  porUsuario: { nome: string; tokens: number; solicitacoes: number }[]
  usuarios: string[]; logs: LogRow[]
}

const nf = (n: number) => (Number(n) || 0).toLocaleString('pt-BR')
const fmtData = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const fmtDia = (v: unknown) => {
  const s = String(v ?? '').slice(0, 10)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || '—')
}

export default function TratorilsonPainel() {
  const { userProfile } = useAuth()
  const { isAdmin, loading: loadingPerm } = usePermissoes(userProfile?.id)
  const router = useRouter()

  const [dados, setDados] = useState<Dados | null>(null)
  const [loading, setLoading] = useState(true)
  const [usuario, setUsuario] = useState('')
  const [desde, setDesde] = useState('')
  const [ate, setAte] = useState('')
  const [limiteInput, setLimiteInput] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [detalhe, setDetalhe] = useState<LogRow | null>(null)

  // Fase 1: testador de "atualizar OS pelo relatório"
  const [osNum, setOsNum] = useState('541')
  const [proposta, setProposta] = useState<Record<string, unknown> | null>(null)
  const [gerando, setGerando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [msgAplic, setMsgAplic] = useState('')
  const [loteRodando, setLoteRodando] = useState(false)
  const [loteResult, setLoteResult] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    if (!loadingPerm && userProfile && !isAdmin) router.push('/dashboard')
  }, [loadingPerm, isAdmin, userProfile, router])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams()
      if (usuario) qs.set('usuario', usuario)
      if (desde) qs.set('desde', desde)
      if (ate) qs.set('ate', ate)
      const res = await fetch(`/api/tratorilson?${qs.toString()}`, { headers: { ...(await authHeaders()) } })
      const j = await res.json()
      if (res.ok) { setDados(j); setLimiteInput(j.limite ? String(j.limite) : '') }
    } catch { /* noop */ } finally { setLoading(false) }
  }, [usuario, desde, ate])

  useEffect(() => { if (isAdmin) carregar() }, [isAdmin, carregar])

  const salvarLimite = async () => {
    setSalvando(true)
    try {
      await fetch('/api/tratorilson', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ limite_tokens_mes: parseInt(limiteInput || '0', 10) || 0 }),
      })
      await carregar()
    } finally { setSalvando(false) }
  }

  const gerarPrevia = async () => {
    const id = osNum.trim(); if (!id) return
    setGerando(true); setProposta(null); setMsgAplic('')
    try {
      const res = await fetch(`/api/pos/ordens/${encodeURIComponent(id)}/atualizar-relatorio`, { headers: { ...(await authHeaders()) } })
      const j = await res.json()
      setProposta(j.proposta || { ok: false, erro: j.erro || 'Falha ao gerar prévia' })
    } catch { setProposta({ ok: false, erro: 'Erro de conexão' }) } finally { setGerando(false) }
  }

  const aplicar = async () => {
    const id = osNum.trim(); if (!id || !proposta?.ok) return
    if (!confirm(`Aplicar as mudanças na OS ${id}?`)) return
    setAplicando(true); setMsgAplic('')
    try {
      const res = await fetch(`/api/pos/ordens/${encodeURIComponent(id)}/atualizar-relatorio?aplicar=1`, { method: 'POST', headers: { ...(await authHeaders()) } })
      const j = await res.json()
      setMsgAplic(j.aplicado ? `✓ Aplicado na OS ${id}. Confira na tela da OS.` : `Erro: ${j.erro || 'falha ao aplicar'}`)
    } catch { setMsgAplic('Erro de conexão') } finally { setAplicando(false) }
  }

  const processarLote = async () => {
    if (!confirm('Processar TODAS as OS em "Relatório Concluído"?\nAs normais vão pra "Enviar Omie" e as de garantia pra "Preenchido".')) return
    setLoteRodando(true); setLoteResult(null)
    try {
      const res = await fetch('/api/pos/ordens/atualizar-relatorio-lote', { method: 'POST', headers: { ...(await authHeaders()) } })
      const j = await res.json()
      setLoteResult(res.ok ? j : { erro: j.error || 'Falha' })
    } catch { setLoteResult({ erro: 'Erro de conexão' }) } finally { setLoteRodando(false) }
  }

  if (loadingPerm || !userProfile) return null
  if (!isAdmin) return null

  const limite = dados?.limite || 0
  const usados = dados?.tokensMes || 0
  const restante = limite > 0 ? Math.max(0, limite - usados) : null
  const pct = limite > 0 ? Math.min(100, (usados / limite) * 100) : 0
  const corBarra = pct >= 90 ? '#dc2626' : pct >= 70 ? '#d97706' : '#16a34a'

  const card: React.CSSProperties = { background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 14, padding: '16px 18px' }
  const rotulo: React.CSSProperties = { fontSize: 12, color: 'var(--portal-text-muted)', fontWeight: 600 }
  const valor: React.CSSProperties = { fontSize: 26, fontWeight: 800, color: 'var(--portal-text)', marginTop: 2 }

  return (
    <div style={{ padding: 24, width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(135deg,#dc2626,#991b1b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bot size={20} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>Tratorilson — Acompanhamento</h1>
          <div style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Solicitações e consumo de tokens do assistente (mês corrente)</div>
        </div>
      </div>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 16 }}>
        <div style={card}><div style={rotulo}>Solicitações no mês</div><div style={valor}>{nf(dados?.solicitacoesMes || 0)}</div></div>
        <div style={card}><div style={rotulo}>Tokens no mês</div><div style={valor}>{nf(usados)}</div></div>
        <div style={card}>
          <div style={rotulo}>Limite mensal (tokens)</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input type="number" min={0} value={limiteInput} onChange={(e) => setLimiteInput(e.target.value)} placeholder="0 = sem limite"
              style={{ flex: 1, padding: '7px 9px', border: '1px solid var(--portal-border)', borderRadius: 8, fontSize: 14, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)' }} />
            <button onClick={salvarLimite} disabled={salvando} title="Salvar limite"
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#dc2626,#991b1b)', color: '#fff', fontWeight: 700, cursor: salvando ? 'default' : 'pointer' }}>
              {salvando ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            </button>
          </div>
        </div>
        <div style={card}>
          <div style={rotulo}>Restante</div>
          <div style={{ ...valor, color: restante === null ? 'var(--portal-text-muted)' : corBarra }}>{restante === null ? '—' : nf(restante)}</div>
          {limite > 0 && (
            <div style={{ height: 6, background: 'var(--portal-bg-secondary)', borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: corBarra, transition: 'width .3s' }} />
            </div>
          )}
        </div>
      </div>

      {/* Fase 1 — atualizar OS pelo relatório do técnico (teste) */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--portal-text)' }}>Atualizar OS pelo relatório <span style={{ fontSize: 11, color: 'var(--portal-text-muted)', fontWeight: 500 }}>(teste — prévia antes de gravar)</span></div>
          <div style={{ flex: 1 }} />
          <input value={osNum} onChange={(e) => setOsNum(e.target.value)} placeholder="Nº da OS" style={{ width: 110, padding: '7px 9px', border: '1px solid var(--portal-border)', borderRadius: 8, fontSize: 14, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)' }} />
          <button onClick={gerarPrevia} disabled={gerando} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#dc2626,#991b1b)', color: '#fff', fontWeight: 700, cursor: gerando ? 'default' : 'pointer' }}>
            {gerando ? <Loader2 size={14} className="spin" /> : <Bot size={14} />} Gerar prévia
          </button>
          <button onClick={processarLote} disabled={loteRodando} title='Processa TODAS de "Relatório Concluído"' style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontWeight: 700, cursor: loteRodando ? 'default' : 'pointer' }}>
            {loteRodando ? <Loader2 size={14} className="spin" /> : <Bot size={14} />} Processar todas
          </button>
        </div>

        {loteResult && (() => {
          /* eslint-disable @typescript-eslint/no-explicit-any */
          const L = loteResult as any
          if (L.erro) return <div style={{ marginTop: 12, padding: 10, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>{String(L.erro)}</div>
          const erros = Array.isArray(L.resultados) ? L.resultados.filter((r: any) => !r.ok) : []
          return (
            <div style={{ marginTop: 12, padding: 10, background: 'var(--portal-bg-secondary)', borderRadius: 8, fontSize: 13 }}>
              <div style={{ fontWeight: 700, color: 'var(--portal-text)' }}>
                Lote: {L.ok}/{L.total} atualizadas · {L.paraEnviarOmie} → Enviar Omie · {L.paraPreenchido} → Preenchido{L.erros ? ` · ${L.erros} com erro` : ''}
              </div>
              {erros.length > 0 && (
                <div style={{ marginTop: 6, color: '#b91c1c', fontSize: 12 }}>
                  {erros.map((r: any, i: number) => <div key={i}>OS {r.os}: {r.erro}</div>)}
                </div>
              )}
            </div>
          )
        })()}

        {proposta && !(proposta as { ok?: boolean }).ok && (
          <div style={{ marginTop: 12, padding: 10, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>{String((proposta as { erro?: string }).erro || 'Falha')}</div>
        )}

        {proposta && (proposta as { ok?: boolean }).ok && (() => {
          /* eslint-disable @typescript-eslint/no-explicit-any */
          const p = proposta as any
          const linha = (rot: string, antes: unknown, depois: unknown) => {
            const mudou = String(antes ?? '') !== String(depois ?? '')
            return (
              <div style={{ display: 'flex', gap: 8, fontSize: 13, padding: '4px 0', flexWrap: 'wrap' }}>
                <span style={{ width: 110, color: 'var(--portal-text-muted)' }}>{rot}</span>
                <span style={{ color: 'var(--portal-text-secondary)', textDecoration: mudou ? 'line-through' : 'none' }}>{String(antes ?? '') || '—'}</span>
                {mudou && <span style={{ color: 'var(--portal-text-muted)' }}>→</span>}
                {mudou && <span style={{ color: '#16a34a', fontWeight: 600 }}>{String(depois ?? '') || '—'}</span>}
              </div>
            )
          }
          return (
            <div style={{ marginTop: 12 }}>
              {Array.isArray(p.duvidas) && p.duvidas.length > 0 && (
                <div style={{ padding: 10, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 4 }}>⚠ Dúvidas do Tratorilson</div>
                  {p.duvidas.map((d: string, i: number) => <div key={i} style={{ fontSize: 12.5, color: '#92400e' }}>• {d}</div>)}
                </div>
              )}
              {linha('Horas', p.antes?.qtdHoras, p.qtdHoras)}
              {linha('KM', p.antes?.qtdKm, p.qtdKm)}
              {linha('Data início', fmtDia(p.antes?.previsaoExecucao), fmtDia(p.dataInicio))}
              {linha('Data fim', fmtDia(p.antes?.dataFimServico), fmtDia(p.dataFim))}
              {linha('Projeto', p.antes?.projeto, p.projeto)}
              <div style={{ display: 'flex', gap: 8, fontSize: 13, padding: '4px 0' }}>
                <span style={{ width: 110, color: 'var(--portal-text-muted)' }}>Horímetro</span>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>{String(p.horimetro || '') || '—'}</span>
                <span style={{ color: 'var(--portal-text-muted)', fontSize: 11 }}>(do relatório)</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--portal-text-muted)', marginBottom: 4 }}>Descrição — ANTES</div>
                  <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', background: 'var(--portal-bg-secondary)', padding: 10, borderRadius: 8, color: 'var(--portal-text-secondary)', maxHeight: 280, overflowY: 'auto' }}>{p.antes?.servSolicitado || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>Descrição — DEPOIS</div>
                  <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', background: '#f0fdf4', border: '1px solid #86efac', padding: 10, borderRadius: 8, color: 'var(--portal-text)', maxHeight: 280, overflowY: 'auto' }}>{p.servSolicitado || '—'}</div>
                </div>
              </div>
              {Array.isArray(p.devolucoes) && p.devolucoes.length > 0 && (
                <div style={{ marginTop: 12, padding: 10, background: '#eff6ff', border: '1px solid #93c5fd', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>↩ Devoluções no PPV{p.ppvId ? ` ${p.ppvId}` : ''} ({p.devolucoes.length})</div>
                  {p.devolucoes.map((d: any, i: number) => (
                    <div key={i} style={{ fontSize: 12.5, color: '#1e3a5f' }}>• {d.quantidade}x {d.codigo} — {d.descricao} <span style={{ color: '#2563eb' }}>({d.motivo})</span></div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <button onClick={aplicar} disabled={aplicando} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: aplicando ? 'default' : 'pointer' }}>
                  {aplicando ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Aplicar na OS {osNum}
                </button>
                {msgAplic && <span style={{ fontSize: 13, color: msgAplic.startsWith('✓') ? '#16a34a' : '#b91c1c' }}>{msgAplic}</span>}
              </div>
            </div>
          )
        })()}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', marginTop: 18 }}>
        <div>
          <div style={rotulo}>Usuário</div>
          <select value={usuario} onChange={(e) => setUsuario(e.target.value)} style={{ padding: '7px 9px', border: '1px solid var(--portal-border)', borderRadius: 8, fontSize: 13, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)' }}>
            <option value="">Todos</option>
            {(dados?.usuarios || []).map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <div style={rotulo}>De</div>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ padding: '7px 9px', border: '1px solid var(--portal-border)', borderRadius: 8, fontSize: 13, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)' }} />
        </div>
        <div>
          <div style={rotulo}>Até</div>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={{ padding: '7px 9px', border: '1px solid var(--portal-border)', borderRadius: 8, fontSize: 13, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)' }} />
        </div>
        <button onClick={carregar} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontWeight: 600, cursor: 'pointer' }}>
          <Search size={14} /> Filtrar
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 16, marginTop: 14, alignItems: 'start' }}>
        {/* Lista */}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--portal-border)', fontWeight: 700, fontSize: 13, color: 'var(--portal-text)' }}>
            Solicitações {loading && <Loader2 size={12} className="spin" style={{ verticalAlign: 'middle' }} />}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ color: 'var(--portal-text-muted)', textAlign: 'left' }}>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Data</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Usuário</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Função</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600 }}>Pergunta</th>
                  <th style={{ padding: '8px 12px', fontWeight: 600, textAlign: 'right' }}>Tokens</th>
                </tr>
              </thead>
              <tbody>
                {(dados?.logs || []).map((l) => (
                  <tr key={l.id} onClick={() => setDetalhe(l)} style={{ borderTop: '1px solid var(--portal-border)', cursor: 'pointer' }}>
                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--portal-text-secondary)' }}>{fmtData(l.created_at)}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--portal-text)' }}>{l.user_nome || '—'}</td>
                    <td style={{ padding: '8px 12px' }}><span style={{ fontSize: 11, background: 'var(--portal-bg-secondary)', padding: '2px 7px', borderRadius: 6, color: 'var(--portal-text-secondary)' }}>{l.tipo}</span></td>
                    <td style={{ padding: '8px 12px', color: 'var(--portal-text-secondary)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.pergunta || ''}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--portal-text)' }}>{nf(l.tokens)}</td>
                  </tr>
                ))}
                {(!loading && (dados?.logs || []).length === 0) && (
                  <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: 'var(--portal-text-muted)' }}>Nenhuma solicitação registrada ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Por usuário */}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--portal-border)', fontWeight: 700, fontSize: 13, color: 'var(--portal-text)' }}>Por usuário (mês)</div>
          <div>
            {(dados?.porUsuario || []).map((u) => (
              <div key={u.nome} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '9px 14px', borderTop: '1px solid var(--portal-border)', fontSize: 13 }}>
                <span style={{ color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.nome}</span>
                <span style={{ color: 'var(--portal-text-secondary)', whiteSpace: 'nowrap' }}>{nf(u.tokens)} tok · {u.solicitacoes}</span>
              </div>
            ))}
            {(dados?.porUsuario || []).length === 0 && <div style={{ padding: 20, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 12 }}>—</div>}
          </div>
        </div>
      </div>

      {/* Detalhe */}
      {detalhe && (
        <div onClick={() => setDetalhe(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--portal-bg-card)', borderRadius: 14, maxWidth: 640, width: '100%', maxHeight: '85vh', overflowY: 'auto', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, color: 'var(--portal-text)' }}>{detalhe.user_nome || '—'} · {fmtData(detalhe.created_at)}</div>
              <button onClick={() => setDetalhe(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--portal-text-secondary)' }}><X size={20} /></button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginBottom: 12 }}>{detalhe.tipo} · {detalhe.modelo || '—'} · {nf(detalhe.tokens)} tokens</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)', marginBottom: 4 }}>Pergunta</div>
            <div style={{ fontSize: 13, color: 'var(--portal-text)', whiteSpace: 'pre-wrap', background: 'var(--portal-bg-secondary)', padding: 10, borderRadius: 8, marginBottom: 12 }}>{detalhe.pergunta || '—'}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)', marginBottom: 4 }}>Resposta</div>
            <div style={{ fontSize: 13, color: 'var(--portal-text)', whiteSpace: 'pre-wrap', background: 'var(--portal-bg-secondary)', padding: 10, borderRadius: 8 }}>{detalhe.resposta || '—'}</div>
          </div>
        </div>
      )}
    </div>
  )
}
