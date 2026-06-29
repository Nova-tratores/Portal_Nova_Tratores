'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { AlertTriangle, XCircle, AlertCircle } from 'lucide-react'

interface Produto {
  codigo_produto: number
  codigo: string
  descricao: string
  familia_nome: string
  estoque: number
}

export default function AlertasPage() {
  const { userProfile } = useAuth()
  const { pode, loading: pLoading } = usePermissoes(userProfile?.id)
  const [semEstoque, setSemEstoque] = useState<Produto[]>([])
  const [baixoEstoque, setBaixoEstoque] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [conta, setConta] = useState('todas')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/visual-estoque/produtos?modo=alertas&conta=${conta}`)
      .then(r => r.json())
      .then(d => {
        setSemEstoque(d.semEstoque || [])
        setBaixoEstoque(d.baixoEstoque || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [conta])

  if (!pLoading && userProfile && !pode('consulta-estoque', 'alertas')) return <SemPermissao />

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--portal-text, #1a1a1a)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={22} color="#dc2626" /> Alertas de Estoque
          </h1>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: '4px 0 0' }}>Produtos que precisam de atenção</p>
        </div>
        <select value={conta} onChange={e => setConta(e.target.value)} style={{
          padding: '10px 16px', borderRadius: 10, border: '1px solid var(--portal-border, #e5e5e5)',
          fontSize: 13, fontWeight: 600, background: 'var(--portal-bg-card, #fff)', cursor: 'pointer',
        }}>
          <option value="todas">Todas as Contas</option>
          <option value="nova">Nova Tratores</option>
          <option value="castro">Castro Peças</option>
        </select>
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Carregando alertas...</div>
      ) : (
        <>
          {/* Sem Estoque */}
          <div style={{ marginBottom: 28, borderRadius: 14, overflow: 'hidden', border: '1px solid #FECACA' }}>
            <div style={{
              padding: '16px 22px', background: '#FEF2F2', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '1px solid #FECACA',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <XCircle size={18} color="#DC2626" />
                <span style={{ fontSize: 15, fontWeight: 700, color: '#DC2626' }}>Sem Estoque</span>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                background: '#DC2626', color: '#fff',
              }}>
                {semEstoque.length} produto{semEstoque.length !== 1 ? 's' : ''}
              </span>
            </div>

            {semEstoque.length > 0 ? (
              <div style={{ background: 'var(--portal-bg-card, #fff)' }}>
                {semEstoque.map((p, i) => (
                  <div key={p.codigo_produto} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 22px',
                    borderBottom: i < semEstoque.length - 1 ? '1px solid var(--portal-border, #f0f0f0)' : 'none',
                    borderLeft: '3px solid #DC2626',
                  }}>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginRight: 8 }}>{p.codigo}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text, #1a1a1a)' }}>{p.descricao}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{p.familia_nome}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                        background: '#FEF2F2', color: '#DC2626',
                      }}>Zerado</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '32px 22px', textAlign: 'center', background: 'var(--portal-bg-card, #fff)', color: '#059669', fontSize: 13, fontWeight: 600 }}>
                Nenhum produto com estoque zerado!
              </div>
            )}
          </div>

          {/* Estoque Baixo */}
          <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid #FDE68A' }}>
            <div style={{
              padding: '16px 22px', background: '#FFFBEB', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              borderBottom: '1px solid #FDE68A',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <AlertCircle size={18} color="#D97706" />
                <span style={{ fontSize: 15, fontWeight: 700, color: '#D97706' }}>Estoque Baixo (1 a 5 unidades)</span>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                background: '#D97706', color: '#fff',
              }}>
                {baixoEstoque.length} produto{baixoEstoque.length !== 1 ? 's' : ''}
              </span>
            </div>

            {baixoEstoque.length > 0 ? (
              <div style={{ background: 'var(--portal-bg-card, #fff)' }}>
                {baixoEstoque.map((p, i) => (
                  <div key={p.codigo_produto} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 22px',
                    borderBottom: i < baixoEstoque.length - 1 ? '1px solid var(--portal-border, #f0f0f0)' : 'none',
                    borderLeft: '3px solid #D97706',
                  }}>
                    <div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', marginRight: 8 }}>{p.codigo}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text, #1a1a1a)' }}>{p.descricao}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{p.familia_nome}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                        background: '#FFFBEB', color: '#D97706',
                      }}>{p.estoque} un</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '32px 22px', textAlign: 'center', background: 'var(--portal-bg-card, #fff)', color: '#059669', fontSize: 13, fontWeight: 600 }}>
                Nenhum produto com estoque baixo!
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
