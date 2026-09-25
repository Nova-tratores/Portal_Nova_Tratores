'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link2, Check, X, RefreshCw, Search, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

// Guia "Vínculos" do /dashboard-agro: sugestões de vínculo CAR↔cliente geradas
// pelas visitas presenciais com GPS do CRM (sql/agro-visitas-vinculo.sql).
// NADA aqui vira vínculo sozinho: Aceitar chama a RPC agro_decidir_sugestao
// pela rota /api/agro/vinculos/sugestoes com o usuário da sessão.

const VERDE = '#16a34a'
const VERDE_ESCURO = '#15803d'

type Sugestao = {
  cod_car: string; cliente_ref: string; cliente_omie_id: string; cliente_nome: string | null; propriedade_nome: string | null
  n_presenciais: number; primeira_visita: string | null; ultima_visita: string | null; vendedores: string[] | null
  gps_accuracy_media: number | null; score: number; motivo: string | null; status: string
  decidido_por: string | null; decidido_em: string | null
  municipio: string; municipio_ibge: number; area_ha: number; area_util_ha: number | null
  cultura_nome: string | null; confianca: string | null; score_oportunidade: number | null; credito_36m: number | null
}

const CONF_COR: Record<string, string> = { alta: VERDE, media: '#d97706', baixa: '#6b7280' }

function fmtData(d?: string | null) {
  if (!d) return '—'
  const [y, m, dd] = d.slice(0, 10).split('-')
  return `${dd}/${m}/${y}`
}
function fmtHa(n?: number | null) {
  return n == null ? '—' : Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' ha'
}

const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, verticalAlign: 'top', borderBottom: '1px solid var(--portal-border,#e5e7eb)', color: 'var(--portal-text,#111111)' }
const th: React.CSSProperties = { ...td, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary,#374151)', background: 'var(--portal-bg-secondary,#f3f4f6)', whiteSpace: 'nowrap', position: 'sticky', top: 0 }

// Colunas ordenáveis (clique no cabeçalho: A→Z, Z→A, volta ao padrão por score)
type Col = 'score' | 'cliente' | 'cod_car' | 'municipio' | 'area_ha' | 'cultura' | 'n_presenciais' | 'ultima_visita' | 'vendedores' | 'motivo' | 'status'
const COLUNAS: { col: Col; rotulo: string; centro?: boolean }[] = [
  { col: 'score', rotulo: 'Score' }, { col: 'cliente', rotulo: 'Cliente' }, { col: 'cod_car', rotulo: 'CAR' }, { col: 'municipio', rotulo: 'Município' },
  { col: 'area_ha', rotulo: 'Área' }, { col: 'cultura', rotulo: 'Cultura (perfil)' }, { col: 'n_presenciais', rotulo: 'Visitas', centro: true },
  { col: 'ultima_visita', rotulo: 'Última' }, { col: 'vendedores', rotulo: 'Vendedor(es)' }, { col: 'motivo', rotulo: 'Por quê' }, { col: 'status', rotulo: 'Decisão' },
]
function valorCol(s: Sugestao, col: Col): string | number {
  switch (col) {
    case 'score': return Number(s.score)
    case 'cliente': return (s.cliente_nome || '').toLocaleLowerCase('pt-BR')
    case 'cod_car': return s.cod_car
    case 'municipio': return (s.municipio || '').toLocaleLowerCase('pt-BR')
    case 'area_ha': return Number(s.area_ha || 0)
    case 'cultura': return (s.cultura_nome || 'zzz').toLocaleLowerCase('pt-BR')   // sem cultura vai pro fim
    case 'n_presenciais': return Number(s.n_presenciais || 0)
    case 'ultima_visita': return s.ultima_visita || ''
    case 'vendedores': return (s.vendedores || []).join(', ').toLocaleLowerCase('pt-BR')
    case 'motivo': return (s.motivo || '').toLocaleLowerCase('pt-BR')
    case 'status': return s.status
  }
}
const botao = (cor: string, cheio: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
  border: `1px solid ${cor}`, background: cheio ? cor : 'transparent', color: cheio ? '#fefefe' : cor, cursor: 'pointer',
})

export default function VinculosSugeridos() {
  const [status, setStatus] = useState<'pendente' | 'aceita' | 'rejeitada' | 'todas'>('pendente')
  const [municipio, setMunicipio] = useState('')
  const [q, setQ] = useState('')
  const [dados, setDados] = useState<Sugestao[]>([])
  const [totais, setTotais] = useState<Record<string, number>>({})
  const [municipios, setMunicipios] = useState<{ ibge: number; nome: string }[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)   // chave "cod_car|cliente_ref|aceitar"
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [ordem, setOrdem] = useState<{ col: Col; dir: 'asc' | 'desc' }>({ col: 'score', dir: 'desc' })

  const ordenarPor = (col: Col) => setOrdem((o) => {
    if (o.col !== col) return { col, dir: col === 'score' || col === 'area_ha' || col === 'n_presenciais' || col === 'ultima_visita' ? 'desc' : 'asc' }
    return { col, dir: o.dir === 'asc' ? 'desc' : 'asc' }
  })

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null)
    try {
      const p = new URLSearchParams({ status })
      if (municipio) p.set('municipio', municipio)
      if (q.trim()) p.set('q', q.trim())
      const r = await fetch(`/api/agro/vinculos/sugestoes?${p}`, { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setDados(j.sugestoes || []); setTotais(j.totais || {})
      if (!municipio) setMunicipios(j.municipios || [])
    } catch (e: any) {
      setErro(e?.message || 'Falha ao carregar'); setDados([])
    } finally { setCarregando(false) }
  }, [status, municipio, q])

  useEffect(() => { const t = setTimeout(carregar, q ? 400 : 0); return () => clearTimeout(t) }, [carregar, q])

  const decidir = async (s: Sugestao, aceitar: boolean) => {
    const chave = `${s.cod_car}|${s.cliente_ref}`
    setOcupado(chave); setConfirmando(null)
    try {
      const r = await fetch('/api/agro/vinculos/sugestoes', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ cod_car: s.cod_car, cliente_ref: s.cliente_ref, aceitar }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`)
      setDados((d) => d.filter((x) => !(x.cod_car === s.cod_car && x.cliente_ref === s.cliente_ref)))
      setTotais((t) => ({ ...t, pendente: Math.max((t.pendente || 0) - 1, 0), [aceitar ? 'aceita' : 'rejeitada']: (t[aceitar ? 'aceita' : 'rejeitada'] || 0) + 1 }))
    } catch (e: any) {
      setErro(e?.message || 'Falha ao gravar a decisão')
    } finally { setOcupado(null) }
  }

  const carsAmbiguos = new Set(
    Object.entries(dados.reduce<Record<string, number>>((acc, s) => { acc[s.cod_car] = (acc[s.cod_car] || 0) + 1; return acc }, {}))
      .filter(([, n]) => n > 1).map(([c]) => c),
  )

  const ordenados = useMemo(() => {
    const dir = ordem.dir === 'asc' ? 1 : -1
    return [...dados].sort((a, b) => {
      const va = valorCol(a, ordem.col), vb = valorCol(b, ordem.col)
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR')
      return c !== 0 ? c * dir : Number(b.score) - Number(a.score)   // empate: score maior primeiro
    })
  }, [dados, ordem])

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 16px 60px' }}>
      {/* cabeçalho */}
      <div style={{ background: 'var(--portal-bg-card,#fefefe)', border: '1px solid var(--portal-border,#e5e7eb)', borderTop: `4px solid ${VERDE}`, borderRadius: 10, padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <Link2 size={24} style={{ color: VERDE }} />
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: 'var(--portal-text,#111111)' }}>Vínculos CAR ↔ cliente sugeridos pelas visitas</h1>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: .6, padding: '3px 9px', borderRadius: 999, background: 'rgba(245,158,11,0.16)', color: '#b45309', border: '1px solid #f59e0b' }}>
            SUGESTÃO — CONFIRME ANTES DE USAR
          </span>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5, color: 'var(--portal-text-secondary,#374151)' }}>
          Uma visita presencial com GPS do CRM que cai dentro do polígono de um imóvel rural (CAR) ativo vira uma sugestão de que aquele CAR é daquele cliente.
          Nada vira vínculo sem alguém aceitar aqui. Quem aceita fica registrado, e o vínculo passa a contar no perfil do imóvel.
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 13, color: 'var(--portal-text,#111111)' }}>
          <b>Pendentes: {totais.pendente || 0}</b><span>Aceitas: {totais.aceita || 0}</span><span>Rejeitadas: {totais.rejeitada || 0}</span>
        </div>
      </div>

      {/* filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        {(['pendente', 'aceita', 'rejeitada', 'todas'] as const).map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} style={{ ...botao(status === s ? VERDE_ESCURO : '#6b7280', status === s), textTransform: 'capitalize' }}>{s}</button>
        ))}
        <select value={municipio} onChange={(e) => setMunicipio(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg-input,#fefefe)', color: 'var(--portal-text,#111111)', fontSize: 13 }}>
          <option value="">Todos os municípios</option>
          {municipios.map((m) => <option key={m.ibge} value={String(m.ibge)}>{m.nome}</option>)}
        </select>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 6, padding: '4px 8px', background: 'var(--portal-bg-input,#fefefe)' }}>
          <Search size={14} style={{ color: 'var(--portal-text-muted,#6b7280)' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="cliente, propriedade ou CAR" style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, color: 'var(--portal-text,#111111)', minWidth: 200 }} />
        </div>
        <button type="button" onClick={carregar} title="Recarregar" style={botao('#6b7280', false)}><RefreshCw size={13} /> Atualizar</button>
      </div>

      {erro && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 8, marginBottom: 12, background: 'rgba(220,38,38,0.10)', borderLeft: '4px solid #dc2626', color: 'var(--portal-text,#111111)', fontSize: 13 }}>
          <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: 2 }} /><span>{erro}</span>
        </div>
      )}

      {/* tabela */}
      <div style={{ overflowX: 'auto', background: 'var(--portal-bg-card,#fefefe)', border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
          <thead>
            <tr>
              {COLUNAS.map((c) => {
                const ativa = ordem.col === c.col
                return (
                  <th key={c.col} style={{ ...th, cursor: 'pointer', userSelect: 'none', color: ativa ? VERDE_ESCURO : th.color }}
                      onClick={() => ordenarPor(c.col)} title={`Ordenar por ${c.rotulo} (${ativa && ordem.dir === 'asc' ? 'Z→A' : 'A→Z'})`}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {c.rotulo}
                      {ativa ? (ordem.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ArrowUpDown size={12} style={{ opacity: .35 }} />}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {carregando && <tr><td colSpan={11} style={{ ...td, textAlign: 'center', color: 'var(--portal-text-muted,#6b7280)' }}>Carregando…</td></tr>}
            {!carregando && dados.length === 0 && <tr><td colSpan={11} style={{ ...td, textAlign: 'center', color: 'var(--portal-text-muted,#6b7280)' }}>Nenhuma sugestão neste filtro.</td></tr>}
            {ordenados.map((s) => {
              const chave = `${s.cod_car}|${s.cliente_ref}`
              const ambiguo = carsAmbiguos.has(s.cod_car)
              return (
                <tr key={chave} style={{ background: ambiguo ? 'rgba(245,158,11,0.06)' : undefined }}>
                  <td style={{ ...td, fontWeight: 800, fontSize: 15 }}>{Number(s.score).toFixed(1)}</td>
                  <td style={td}>
                    <div style={{ fontWeight: 700 }}>{s.cliente_nome || `cliente ${s.cliente_ref}`}</div>
                    {s.propriedade_nome && s.propriedade_nome !== s.cliente_nome && <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#6b7280)' }}>{s.propriedade_nome}</div>}
                    <div style={{ fontSize: 11, color: 'var(--portal-text-muted,#6b7280)' }}>Omie {s.cliente_omie_id}</div>
                  </td>
                  <td style={{ ...td, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }} title={s.cod_car}>
                    {s.cod_car.slice(0, 11)}…{s.cod_car.slice(-6)}
                    {ambiguo && <div style={{ fontSize: 11, color: '#b45309', fontWeight: 700 }}>⚠ vários clientes</div>}
                  </td>
                  <td style={td}>{s.municipio}</td>
                  <td style={td}>{fmtHa(s.area_ha)}<div style={{ fontSize: 11, color: 'var(--portal-text-muted,#6b7280)' }}>útil {fmtHa(s.area_util_ha)}</div></td>
                  <td style={td}>
                    {s.cultura_nome || <span style={{ color: 'var(--portal-text-muted,#6b7280)' }}>diversificado</span>}
                    {s.confianca && <div style={{ fontSize: 11, fontWeight: 700, color: CONF_COR[s.confianca] || '#6b7280' }}>confiança {s.confianca}</div>}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>{s.n_presenciais}<div style={{ fontSize: 11, color: 'var(--portal-text-muted,#6b7280)' }}>GPS {s.gps_accuracy_media != null ? `${Math.round(Number(s.gps_accuracy_media))} m` : '—'}</div></td>
                  <td style={td}>{fmtData(s.ultima_visita)}</td>
                  <td style={{ ...td, fontSize: 12 }}>{(s.vendedores || []).join(', ')}</td>
                  <td style={{ ...td, fontSize: 12, maxWidth: 260, color: 'var(--portal-text-secondary,#374151)' }}>{s.motivo}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {s.status !== 'pendente' ? (
                      <span style={{ fontSize: 12 }}>
                        <b style={{ color: s.status === 'aceita' ? VERDE : '#dc2626', textTransform: 'capitalize' }}>{s.status}</b>
                        <div style={{ fontSize: 11, color: 'var(--portal-text-muted,#6b7280)' }}>{s.decidido_por} · {fmtData(s.decidido_em)}</div>
                      </span>
                    ) : confirmando?.startsWith(chave) ? (
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                        {confirmando.endsWith('|1') ? 'Vincular este CAR ao cliente?' : 'Rejeitar sugestão?'}
                        <button type="button" disabled={ocupado === chave} onClick={() => decidir(s, confirmando.endsWith('|1'))} style={botao(confirmando.endsWith('|1') ? VERDE : '#dc2626', true)}>Sim</button>
                        <button type="button" onClick={() => setConfirmando(null)} style={botao('#6b7280', false)}>Não</button>
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button type="button" disabled={ocupado === chave} onClick={() => setConfirmando(`${chave}|1`)} style={botao(VERDE, true)}><Check size={13} /> Aceitar</button>
                        <button type="button" disabled={ocupado === chave} onClick={() => setConfirmando(`${chave}|0`)} style={botao('#dc2626', false)}><X size={13} /> Rejeitar</button>
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--portal-text-muted,#6b7280)' }}>
        {dados.length} sugestão(ões) no filtro · linhas em âmbar = o mesmo CAR recebeu visitas de mais de um cliente (decida com cuidado) · gerado por <code>scripts/agro/sugerir_vinculos_visitas.py</code>
      </div>
    </div>
  )
}
