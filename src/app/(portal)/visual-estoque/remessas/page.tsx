'use client'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { Search, RefreshCw, GitCompareArrows, AlertOctagon } from 'lucide-react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (s: string) => {
  if (!s) return '—'
  const iso = s.includes('T') ? s.split('T')[0] : s
  if (iso.includes('-')) { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}` }
  return iso
}

type Aba = 'remessas' | 'demonstracao' | 'outras-entradas'

const statusCor = (s: string): { bg: string; fg: string } => {
  switch (s) {
    case 'Devolvida': case 'Retorno': return { bg: '#ECFDF5', fg: '#059669' }
    case 'Suspeita': return { bg: '#FFFBEB', fg: '#D97706' }
    case 'Cancelada': return { bg: '#F3F4F6', fg: '#9CA3AF' }
    case 'Pendente': return { bg: '#FEF2F2', fg: '#DC2626' }
    default: return { bg: '#EFF6FF', fg: '#2563EB' }
  }
}

export default function RemessasPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading: pLoading } = usePermissoes(userProfile?.id)
  const [aba, setAba] = useState<Aba>('remessas')
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [conta, setConta] = useState('todas')
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState('todas')
  const [acao, setAcao] = useState('')

  const carregar = () => {
    setLoading(true)
    fetch(`/api/visual-estoque/remessas?modo=${aba}&conta=${conta}`)
      .then(r => r.json())
      .then(d => { setRows(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(carregar, [aba, conta])

  async function executarAcao(tipo: 'sync' | 'devolucoes' | 'suspeitas', label: string) {
    if (tipo === 'suspeitas' && !confirm('Verificar suspeitas consulta o Omie produto a produto e pode demorar vários minutos. Continuar?')) return
    setAcao(label)
    try {
      const r = await fetch('/api/visual-estoque/remessas/acoes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: tipo, conta }),
      })
      const d = await r.json()
      if (d.erro) alert(`Erro: ${d.erro}`)
      else carregar()
    } finally { setAcao('') }
  }

  const statusDisponiveis = useMemo(() => Array.from(new Set(rows.map(r => r.status).filter(Boolean))).sort(), [rows])

  const filtradas = useMemo(() => rows.filter(r => {
    if (aba === 'remessas' && statusFiltro !== 'todas' && r.status !== statusFiltro) return false
    if (busca) {
      const t = busca.toLowerCase()
      const campos = [r.destinatario, r.numero_nfe, r.numero_remessa, r.descricao_produto, r.codigo].filter(Boolean).join(' ').toLowerCase()
      if (!campos.includes(t)) return false
    }
    return true
  }), [rows, aba, statusFiltro, busca])

  if (!pLoading && userProfile && !temAcesso('consulta-estoque')) return <SemPermissao />

  const th: React.CSSProperties = { padding: '10px 12px', fontSize: 10, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap' }
  const totalValor = filtradas.reduce((s, r) => s + (Number(r.total_nfe) || (Number(r.valor_unitario) * Number(r.qtde)) || 0), 0)

  const abas: { id: Aba; label: string }[] = [
    { id: 'remessas', label: 'Remessas' },
    { id: 'demonstracao', label: 'Demonstração' },
    { id: 'outras-entradas', label: 'Outras Entradas' },
  ]

  return (
    <div style={{ padding: '20px 32px' }}>
      {/* Sub-abas */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {abas.map(a => (
          <button key={a.id} onClick={() => { setAba(a.id); setStatusFiltro('todas') }} style={{
            padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: aba === a.id ? 700 : 500,
            background: aba === a.id ? '#FEF2F2' : 'transparent', color: aba === a.id ? '#dc2626' : '#6B7280',
          }}>{a.label}</button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#9CA3AF' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar destinatário, nº ou produto..." style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 13 }} />
        </div>
        {aba === 'remessas' && statusDisponiveis.length > 0 && (
          <select value={statusFiltro} onChange={e => setStatusFiltro(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 12, fontWeight: 600, background: '#fff' }}>
            <option value="todas">Todos os status</option>
            {statusDisponiveis.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select value={conta} onChange={e => setConta(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 12, fontWeight: 600, background: '#fff' }}>
          <option value="todas">Todas</option>
          <option value="nova">Nova Tratores</option>
          <option value="castro">Castro Peças</option>
        </select>
      </div>

      {/* Ações (sync / reconciliação) */}
      {aba === 'remessas' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {([
            { tipo: 'sync', label: 'Sincronizar Omie', Icon: RefreshCw },
            { tipo: 'devolucoes', label: 'Cruzar devoluções', Icon: GitCompareArrows },
            { tipo: 'suspeitas', label: 'Verificar suspeitas', Icon: AlertOctagon },
          ] as const).map(({ tipo, label, Icon }) => (
            <button key={tipo} onClick={() => executarAcao(tipo, label)} disabled={!!acao} style={{
              padding: '8px 14px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)',
              background: '#fff', cursor: acao ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600, color: '#6B7280',
              display: 'flex', alignItems: 'center', gap: 6, opacity: acao && acao !== label ? 0.5 : 1,
            }}>
              <Icon size={14} /> {acao === label ? 'Processando...' : label}
            </button>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10 }}>
        {filtradas.length} registros · <span style={{ color: '#059669', fontWeight: 700 }}>{fmt(totalValor)}</span>
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF' }}>Carregando...</div>
      ) : (
        <div style={{ overflow: 'auto', border: '1px solid var(--portal-border, #e5e5e5)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--portal-bg, #fafafa)', borderBottom: '1px solid var(--portal-border, #e5e5e5)' }}>
              {aba === 'demonstracao' ? (
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Produto</th>
                  <th style={{ ...th, textAlign: 'left' }}>Destinatário</th>
                  <th style={{ ...th, textAlign: 'center' }}>Remessa</th>
                  <th style={{ ...th, textAlign: 'center' }}>Saída</th>
                  <th style={th}>Qtde</th>
                  <th style={th}>Valor un.</th>
                  <th style={{ ...th, textAlign: 'center' }}>Status</th>
                </tr>
              ) : (
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Destinatário</th>
                  <th style={{ ...th, textAlign: 'center' }}>Nº</th>
                  <th style={{ ...th, textAlign: 'center' }}>Data</th>
                  <th style={{ ...th, textAlign: 'center' }}>CFOP</th>
                  <th style={th}>Itens</th>
                  <th style={th}>Valor</th>
                  {aba === 'remessas' && <th style={{ ...th, textAlign: 'center' }}>Status</th>}
                </tr>
              )}
            </thead>
            <tbody>
              {filtradas.map((r, i) => aba === 'demonstracao' ? (
                <tr key={i} style={{ borderBottom: '1px solid var(--portal-border, #f0f0f0)' }}>
                  <td style={{ ...td, textAlign: 'left', maxWidth: 280, whiteSpace: 'normal' }}>
                    <div style={{ fontWeight: 600 }}>{r.descricao_produto || '—'}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF' }}>{r.codigo}</div>
                  </td>
                  <td style={{ ...td, textAlign: 'left' }}>{r.destinatario || '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{r.numero_remessa || '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{fmtData(r.data_saida)}</td>
                  <td style={td}>{r.qtde}</td>
                  <td style={td}>{fmt(r.valor_unitario)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 20, ...((c) => ({ background: c.bg, color: c.fg }))(statusCor(r.status)), fontSize: 11, fontWeight: 700 }}>{r.status}</span>
                  </td>
                </tr>
              ) : (
                <tr key={i} style={{ borderBottom: '1px solid var(--portal-border, #f0f0f0)' }}>
                  <td style={{ ...td, textAlign: 'left', maxWidth: 320, whiteSpace: 'normal', fontWeight: 600 }}>{r.destinatario || '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{r.numero_nfe || '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{fmtData(r.emissao || r.data_emissao)}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{r.cfop || '—'}</td>
                  <td style={td}>{r.qtd_itens}</td>
                  <td style={{ ...td, fontWeight: 700 }}>{fmt(r.total_nfe)}</td>
                  {aba === 'remessas' && (
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, ...((c) => ({ background: c.bg, color: c.fg }))(statusCor(r.status)), fontSize: 11, fontWeight: 700 }}>{r.status}</span>
                    </td>
                  )}
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Nenhum registro encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
