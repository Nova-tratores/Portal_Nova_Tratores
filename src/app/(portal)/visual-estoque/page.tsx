'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { BarChart3, DollarSign, TrendingDown, Package, Layers } from 'lucide-react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtN = (v: number) => v.toLocaleString('pt-BR')

interface DashData {
  totalProdutos: number
  valorTotalEstoque: number
  custoCapitalTotal: number
  custoCapitalMes: number
  familias: { nome: string; qtdProdutos: number; qtdEstoque: number; valorTotal: number; custoCapital: number }[]
  pecas: { qtdPecas: number; qtdUnidades: number; valor: number }
  pecasTipo: { tipo: string; qtd: number; unidades: number; valor: number }[]
}

export default function VisualEstoqueDashboard() {
  const { userProfile } = useAuth()
  const { temAcesso, loading: pLoading } = usePermissoes(userProfile?.id)
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [conta, setConta] = useState('todas')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/visual-estoque/produtos?modo=dashboard&conta=${conta}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [conta])

  if (!pLoading && userProfile && !temAcesso('consulta-estoque')) return <SemPermissao />

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--portal-text, #1a1a1a)', margin: 0 }}>Visual Estoque</h1>
          <p style={{ fontSize: 13, color: 'var(--portal-text-secondary, #737373)', margin: '4px 0 0' }}>Resumo geral do estoque de máquinas e peças</p>
        </div>
        <select
          value={conta}
          onChange={e => setConta(e.target.value)}
          style={{
            padding: '10px 16px', borderRadius: 10, border: '1px solid var(--portal-border, #e5e5e5)',
            fontSize: 13, fontWeight: 600, background: 'var(--portal-bg-card, #fff)',
            color: 'var(--portal-text, #1a1a1a)', cursor: 'pointer',
          }}
        >
          <option value="todas">Todas as Contas</option>
          <option value="nova">Nova Tratores</option>
          <option value="castro">Castro Peças</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Carregando dados do estoque...</div>
      ) : !data ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF' }}>Erro ao carregar dados.</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
            {[
              { l: 'Máquinas em Estoque', v: fmtN(data.totalProdutos), icon: Package, bg: '#EFF6FF', c: '#2563EB', b: '#BFDBFE' },
              { l: 'Valor Total Estoque', v: fmt(data.valorTotalEstoque), icon: DollarSign, bg: '#ECFDF5', c: '#059669', b: '#A7F3D0' },
              { l: 'Custo Capital Acumulado', v: fmt(data.custoCapitalTotal), icon: TrendingDown, bg: '#FEF2F2', c: '#DC2626', b: '#FECACA' },
              { l: 'Custo Capital / Mês', v: fmt(data.custoCapitalMes), icon: BarChart3, bg: '#FFF7ED', c: '#EA580C', b: '#FED7AA' },
            ].map((c, i) => (
              <div key={i} style={{ padding: '20px 22px', borderRadius: 14, background: c.bg, border: `1px solid ${c.b}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <c.icon size={18} color={c.c} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{c.l}</span>
                </div>
                <div style={{ fontSize: 24, fontWeight: 800, color: c.c }}>{c.v}</div>
              </div>
            ))}
          </div>

          {/* Famílias */}
          <div style={{ background: 'var(--portal-bg-card, #fff)', borderRadius: 14, border: '1px solid var(--portal-border, #e5e5e5)', marginBottom: 24, overflow: 'hidden' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--portal-border, #e5e5e5)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Layers size={18} color="#dc2626" />
              <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)' }}>Máquinas por Família</span>
              <span style={{ fontSize: 12, color: '#9CA3AF', fontWeight: 500 }}>({data.familias.length})</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--portal-bg, #fafafa)' }}>
                  {['Família', 'Produtos', 'Estoque', 'Valor Total', 'Custo Capital'].map(h => (
                    <th key={h} style={{ padding: '10px 18px', fontSize: 10, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, textAlign: 'left', borderBottom: '1px solid var(--portal-border, #e5e5e5)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.familias.map(f => (
                  <tr key={f.nome} style={{ borderBottom: '1px solid var(--portal-border, #f0f0f0)' }}>
                    <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)' }}>{f.nome}</td>
                    <td style={{ padding: '12px 18px', fontSize: 13, color: '#6B7280' }}>{f.qtdProdutos}</td>
                    <td style={{ padding: '12px 18px', fontSize: 13, color: '#6B7280' }}>{fmtN(f.qtdEstoque)}</td>
                    <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 600, color: '#059669' }}>{fmt(f.valorTotal)}</td>
                    <td style={{ padding: '12px 18px', fontSize: 13, fontWeight: 600, color: '#DC2626' }}>{fmt(f.custoCapital)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Peças resumo + por tipo */}
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
            <div style={{ background: 'var(--portal-bg-card, #fff)', borderRadius: 14, border: '1px solid var(--portal-border, #e5e5e5)', padding: 22 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Package size={16} color="#dc2626" /> Peças
              </div>
              {[
                { l: 'Itens distintos', v: fmtN(data.pecas.qtdPecas) },
                { l: 'Unidades total', v: fmtN(data.pecas.qtdUnidades) },
                { l: 'Valor em estoque', v: fmt(data.pecas.valor) },
              ].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: i < 2 ? '1px solid var(--portal-border, #f0f0f0)' : 'none' }}>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>{r.l}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)' }}>{r.v}</span>
                </div>
              ))}
            </div>

            <div style={{ background: 'var(--portal-bg-card, #fff)', borderRadius: 14, border: '1px solid var(--portal-border, #e5e5e5)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--portal-border, #e5e5e5)', fontSize: 14, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)' }}>
                Peças por Tipo
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 0 }}>
                {data.pecasTipo.map(t => (
                  <div key={t.tipo} style={{ padding: '14px 18px', borderBottom: '1px solid var(--portal-border, #f0f0f0)', borderRight: '1px solid var(--portal-border, #f0f0f0)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)', marginBottom: 4 }}>{t.tipo}</div>
                    <div style={{ fontSize: 11, color: '#6B7280' }}>{t.qtd} itens · {fmtN(t.unidades)} un</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#059669', marginTop: 2 }}>{fmt(t.valor)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
