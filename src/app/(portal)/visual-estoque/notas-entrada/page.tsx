'use client'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { Search, X } from 'lucide-react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtData = (s: string) => {
  if (!s) return '—'
  const iso = s.includes('T') ? s.split('T')[0] : s
  if (iso.includes('-')) { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}` }
  return iso
}

interface Nota {
  id: number
  numero_nfe: string
  serie_nfe: string
  emissao_nfe: string
  status: string
  fornecedor: string
  fornecedor_cnpj: string
  total_nfe: number
  qtd_maquinas: number
  qtd_itens: number
  conta_omie: string
}

export default function NotasEntradaPage() {
  const { userProfile } = useAuth()
  const { pode, loading: pLoading } = usePermissoes(userProfile?.id)
  const [notas, setNotas] = useState<Nota[]>([])
  const [loading, setLoading] = useState(true)
  const [conta, setConta] = useState('todas')
  const [status, setStatus] = useState('todas')
  const [busca, setBusca] = useState('')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/visual-estoque/notas-entrada?conta=${conta}`)
      .then(r => r.json())
      .then(d => { setNotas(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [conta])

  const filtradas = useMemo(() => notas.filter(n => {
    if (status === 'recebidas' && n.status !== 'Recebida') return false
    if (status === 'faturadas' && n.status !== 'Faturada') return false
    if (busca) {
      const t = busca.toLowerCase()
      if (!n.fornecedor.toLowerCase().includes(t) && !(n.numero_nfe || '').toLowerCase().includes(t)) return false
    }
    return true
  }), [notas, status, busca])

  const totalValor = filtradas.reduce((s, n) => s + n.total_nfe, 0)
  const totalMaquinas = filtradas.reduce((s, n) => s + n.qtd_maquinas, 0)

  if (!pLoading && userProfile && !pode('consulta-estoque', 'notas-entrada')) return <SemPermissao />

  const statusCor = (s: string) => s === 'Recebida' ? { bg: '#ECFDF5', fg: '#059669' } : { bg: '#FFFBEB', fg: '#D97706' }
  const th: React.CSSProperties = { padding: '10px 12px', fontSize: 10, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap' }

  return (
    <div style={{ padding: '20px 32px' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#9CA3AF' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar fornecedor ou nº NF..." style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 13 }} />
        </div>
        {(['todas', 'faturadas', 'recebidas'] as const).map(s => (
          <button key={s} onClick={() => setStatus(s)} style={{
            padding: '8px 14px', borderRadius: 8, border: `1px solid ${status === s ? '#dc2626' : 'var(--portal-border, #e5e5e5)'}`,
            background: status === s ? '#FEF2F2' : '#fff', color: status === s ? '#dc2626' : '#6B7280', fontSize: 12, fontWeight: 700, cursor: 'pointer', textTransform: 'capitalize',
          }}>{s === 'todas' ? 'Todas' : s === 'faturadas' ? 'Pendentes' : 'Recebidas'}</button>
        ))}
        <select value={conta} onChange={e => setConta(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 12, fontWeight: 600, background: '#fff' }}>
          <option value="todas">Todas</option>
          <option value="nova">Nova Tratores</option>
          <option value="castro">Castro Peças</option>
        </select>
        {(busca || status !== 'todas') && (
          <button onClick={() => { setBusca(''); setStatus('todas') }} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6B7280' }}>
            <X size={14} /> Limpar
          </button>
        )}
      </div>

      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10 }}>
        {filtradas.length} notas · {totalMaquinas} máquinas · <span style={{ color: '#059669', fontWeight: 700 }}>{fmt(totalValor)}</span>
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF' }}>Carregando notas...</div>
      ) : (
        <div style={{ overflow: 'auto', border: '1px solid var(--portal-border, #e5e5e5)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--portal-bg, #fafafa)', borderBottom: '1px solid var(--portal-border, #e5e5e5)' }}>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Fornecedor</th>
                <th style={{ ...th, textAlign: 'center' }}>NF</th>
                <th style={{ ...th, textAlign: 'center' }}>Emissão</th>
                <th style={th}>Máquinas</th>
                <th style={th}>Itens</th>
                <th style={th}>Valor</th>
                <th style={{ ...th, textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(n => {
                const c = statusCor(n.status)
                return (
                  <tr key={`${n.conta_omie}-${n.id}`} style={{ borderBottom: '1px solid var(--portal-border, #f0f0f0)' }}>
                    <td style={{ ...td, textAlign: 'left', maxWidth: 360, whiteSpace: 'normal' }}>
                      <div style={{ fontWeight: 600, color: 'var(--portal-text, #1a1a1a)' }}>{n.fornecedor || '—'}</div>
                      <div style={{ fontSize: 10, color: '#9CA3AF' }}>{n.fornecedor_cnpj}</div>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>{n.numero_nfe}{n.serie_nfe ? `/${n.serie_nfe}` : ''}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{fmtData(n.emissao_nfe)}</td>
                    <td style={td}>{n.qtd_maquinas || '—'}</td>
                    <td style={td}>{n.qtd_itens || '—'}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{fmt(n.total_nfe)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, background: c.bg, color: c.fg, fontSize: 11, fontWeight: 700 }}>{n.status || '—'}</span>
                    </td>
                  </tr>
                )
              })}
              {filtradas.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Nenhuma nota encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
