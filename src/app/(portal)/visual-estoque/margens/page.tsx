'use client'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { Search, X, TrendingDown } from 'lucide-react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (v: number) => `${v.toFixed(1)}%`

interface Margem {
  codigo: string
  descricao: string
  familia_nome: string
  marca: string
  estoque: number
  dias_em_estoque: number
  valor_unitario: number
  cmc: number
  custo_capital: number
  capital_unitario: number
  custo_total: number
  margem_real: number
  margem_pct: number
}

export default function MargensPage() {
  const { userProfile } = useAuth()
  const { pode, loading: pLoading } = usePermissoes(userProfile?.id)
  const [produtos, setProdutos] = useState<Margem[]>([])
  const [loading, setLoading] = useState(true)
  const [conta, setConta] = useState('todas')
  const [busca, setBusca] = useState('')
  const [familia, setFamilia] = useState('todas')
  const [soNegativa, setSoNegativa] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/visual-estoque/margens?conta=${conta}`)
      .then(r => r.json())
      .then(d => { setProdutos(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [conta])

  const familias = useMemo(() => Array.from(new Set(produtos.map(p => p.familia_nome).filter(Boolean))).sort(), [produtos])

  const filtrados = useMemo(() => produtos.filter(p => {
    if (soNegativa && p.margem_real >= 0) return false
    if (familia !== 'todas' && p.familia_nome !== familia) return false
    if (busca) {
      const t = busca.toLowerCase()
      if (!p.descricao.toLowerCase().includes(t) && !(p.codigo || '').toLowerCase().includes(t)) return false
    }
    return true
  }), [produtos, soNegativa, familia, busca])

  const negativas = filtrados.filter(p => p.margem_real < 0).length

  if (!pLoading && userProfile && !pode('consulta-estoque', 'margens')) return <SemPermissao />

  const th: React.CSSProperties = { padding: '10px 12px', fontSize: 10, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 12, textAlign: 'right', whiteSpace: 'nowrap' }

  return (
    <div style={{ padding: '20px 32px' }}>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#9CA3AF' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou código..." style={{
            width: '100%', padding: '8px 12px 8px 32px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 13,
          }} />
        </div>
        <select value={familia} onChange={e => setFamilia(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 12, fontWeight: 600, background: '#fff' }}>
          <option value="todas">Todas as famílias</option>
          {familias.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <button onClick={() => setSoNegativa(s => !s)} style={{
          padding: '8px 14px', borderRadius: 8, border: `1px solid ${soNegativa ? '#DC2626' : 'var(--portal-border, #e5e5e5)'}`,
          background: soNegativa ? '#FEF2F2' : '#fff', color: soNegativa ? '#DC2626' : '#6B7280', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <TrendingDown size={14} /> Só margem negativa
        </button>
        <select value={conta} onChange={e => setConta(e.target.value)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 12, fontWeight: 600, background: '#fff' }}>
          <option value="todas">Todas</option>
          <option value="nova">Nova Tratores</option>
          <option value="castro">Castro Peças</option>
        </select>
        {(busca || familia !== 'todas' || soNegativa) && (
          <button onClick={() => { setBusca(''); setFamilia('todas'); setSoNegativa(false) }} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#6B7280' }}>
            <X size={14} /> Limpar
          </button>
        )}
      </div>

      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10 }}>
        {filtrados.length} produtos · <span style={{ color: '#DC2626', fontWeight: 700 }}>{negativas} com margem negativa</span>
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF' }}>Carregando margens...</div>
      ) : (
        <div style={{ overflow: 'auto', border: '1px solid var(--portal-border, #e5e5e5)', borderRadius: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: 'var(--portal-bg, #fafafa)', borderBottom: '1px solid var(--portal-border, #e5e5e5)' }}>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Produto</th>
                <th style={th}>Estoque</th>
                <th style={th}>Dias</th>
                <th style={th}>Preço venda</th>
                <th style={th}>CMC</th>
                <th style={th}>Capital/un</th>
                <th style={th}>Custo total</th>
                <th style={th}>Margem R$</th>
                <th style={th}>Margem %</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p, i) => {
                const neg = p.margem_real < 0
                return (
                  <tr key={`${p.codigo}-${i}`} style={{ borderBottom: '1px solid var(--portal-border, #f0f0f0)', background: neg ? '#FEF2F2' : 'transparent' }}>
                    <td style={{ ...td, textAlign: 'left', maxWidth: 320, whiteSpace: 'normal' }}>
                      <div style={{ fontWeight: 600, color: 'var(--portal-text, #1a1a1a)' }}>{p.descricao}</div>
                      <div style={{ fontSize: 10, color: '#9CA3AF' }}>{p.codigo} · {p.familia_nome}</div>
                    </td>
                    <td style={td}>{p.estoque}</td>
                    <td style={td}>{p.dias_em_estoque}</td>
                    <td style={td}>{fmt(p.valor_unitario)}</td>
                    <td style={td}>{fmt(p.cmc)}</td>
                    <td style={{ ...td, color: '#D97706' }}>{fmt(p.capital_unitario)}</td>
                    <td style={td}>{fmt(p.custo_total)}</td>
                    <td style={{ ...td, fontWeight: 700, color: neg ? '#DC2626' : '#059669' }}>{fmt(p.margem_real)}</td>
                    <td style={{ ...td, fontWeight: 700, color: neg ? '#DC2626' : '#059669' }}>{pct(p.margem_pct)}</td>
                  </tr>
                )
              })}
              {filtrados.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>Nenhum produto encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
