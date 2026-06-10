'use client'
import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { Search, Package, X } from 'lucide-react'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface Produto {
  codigo_produto: number
  codigo: string
  descricao: string
  familia_nome: string
  marca: string
  tipo: string
  cmc: number
  estoque: number
  valor_estoque: number
  custo_capital: number
  dias_em_estoque: number
  imagem_url: string
  conta_omie: string
}

function nivelEstoque(est: number) {
  if (est <= 0) return 'critico'
  if (est <= 5) return 'baixo'
  if (est <= 20) return 'medio'
  return 'alto'
}

function labelEstoque(est: number) {
  if (est <= 0) return 'Sem estoque'
  if (est <= 5) return `${est} un`
  return `${est} un`
}

const badgeColors: Record<string, { bg: string; c: string }> = {
  critico: { bg: '#FEF2F2', c: '#DC2626' },
  baixo: { bg: '#FFFBEB', c: '#D97706' },
  medio: { bg: '#EFF6FF', c: '#2563EB' },
  alto: { bg: '#ECFDF5', c: '#059669' },
}

export default function ShowroomPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading: pLoading } = usePermissoes(userProfile?.id)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'maquinas' | 'pecas'>('todos')
  const [filtroEstoque, setFiltroEstoque] = useState<'' | 'disponivel' | 'sem'>('')
  const [conta, setConta] = useState('todas')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/visual-estoque/produtos?conta=${conta}`)
      .then(r => r.json())
      .then(d => { setProdutos(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [conta])

  const filtrados = useMemo(() => {
    let list = produtos
    if (filtroTipo === 'maquinas') list = list.filter(p => p.tipo !== 'Peças')
    if (filtroTipo === 'pecas') list = list.filter(p => p.tipo === 'Peças')
    if (filtroEstoque === 'disponivel') list = list.filter(p => p.estoque > 0)
    if (filtroEstoque === 'sem') list = list.filter(p => p.estoque <= 0)
    if (busca.trim()) {
      const q = busca.toLowerCase()
      list = list.filter(p => p.descricao.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
    }
    return list
  }, [produtos, filtroTipo, filtroEstoque, busca])

  const temFiltro = busca || filtroEstoque || filtroTipo !== 'todos'

  if (!pLoading && userProfile && !temAcesso('consulta-estoque')) return <SemPermissao />

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--portal-text, #1a1a1a)', margin: 0 }}>Showroom</h1>
          <p style={{ fontSize: 13, color: '#9CA3AF', margin: '4px 0 0' }}>
            {loading ? 'Carregando...' : `${filtrados.length} produto${filtrados.length !== 1 ? 's' : ''} encontrado${filtrados.length !== 1 ? 's' : ''}`}
          </p>
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

      {/* Filtros */}
      <div style={{
        display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24, flexWrap: 'wrap',
        padding: '16px 20px', borderRadius: 12, background: 'var(--portal-bg-card, #fff)',
        border: '1px solid var(--portal-border, #e5e5e5)',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={16} color="#9CA3AF" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text" value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome ou código..."
            style={{
              width: '100%', padding: '10px 12px 10px 36px', borderRadius: 8,
              border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 13,
              background: 'var(--portal-bg, #fafafa)',
            }}
          />
        </div>

        {(['todos', 'maquinas', 'pecas'] as const).map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)} style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: filtroTipo === t ? '2px solid #dc2626' : '1px solid var(--portal-border, #e5e5e5)',
            background: filtroTipo === t ? '#FEF2F2' : 'var(--portal-bg, #fafafa)',
            color: filtroTipo === t ? '#dc2626' : '#6B7280',
          }}>
            {t === 'todos' ? 'Todos' : t === 'maquinas' ? 'Máquinas' : 'Peças'}
          </button>
        ))}

        <select value={filtroEstoque} onChange={e => setFiltroEstoque(e.target.value as any)} style={{
          padding: '10px 14px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)',
          fontSize: 12, fontWeight: 600, background: 'var(--portal-bg, #fafafa)', cursor: 'pointer',
        }}>
          <option value="">Todos</option>
          <option value="disponivel">Disponível</option>
          <option value="sem">Sem estoque</option>
        </select>

        {temFiltro && (
          <button onClick={() => { setBusca(''); setFiltroTipo('todos'); setFiltroEstoque('') }} style={{
            padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: '1px solid #FECACA', background: '#FEF2F2', color: '#dc2626',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <X size={14} /> Limpar
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Carregando produtos...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ padding: 80, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)', marginBottom: 4 }}>Nenhum produto encontrado</h3>
          <p style={{ fontSize: 13, color: '#9CA3AF' }}>Tente ajustar os filtros.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {filtrados.map(p => {
            const nivel = nivelEstoque(p.estoque)
            const bc = badgeColors[nivel]
            return (
              <div key={p.codigo_produto} style={{
                borderRadius: 14, overflow: 'hidden', background: 'var(--portal-bg-card, #fff)',
                border: '1px solid var(--portal-border, #e5e5e5)', transition: '0.15s',
              }}>
                {/* Imagem */}
                <div style={{ height: 160, background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--portal-border, #f0f0f0)' }}>
                  {p.imagem_url ? (
                    <img src={p.imagem_url} alt={p.descricao} style={{ maxHeight: 140, maxWidth: '90%', objectFit: 'contain' }} />
                  ) : (
                    <Package size={48} color="#D1D5DB" />
                  )}
                </div>

                {/* Info */}
                <div style={{ padding: '14px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }}>{p.codigo}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)', margin: '4px 0', lineHeight: 1.3, minHeight: 34 }}>
                    {p.descricao.length > 50 ? p.descricao.substring(0, 50) + '...' : p.descricao}
                  </div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 10 }}>{p.familia_nome}</div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                      background: bc.bg, color: bc.c,
                    }}>
                      {labelEstoque(p.estoque)}
                    </span>
                    {p.dias_em_estoque > 0 && (
                      <span style={{ fontSize: 10, color: '#9CA3AF' }}>{p.dias_em_estoque} dias</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingTop: 8, borderTop: '1px solid var(--portal-border, #f0f0f0)' }}>
                    <span style={{ color: '#6B7280' }}>{fmt(p.cmc)} /un</span>
                    <span style={{ fontWeight: 700, color: '#059669' }}>{fmt(p.valor_estoque)}</span>
                  </div>

                  {p.custo_capital > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginTop: 6, padding: '6px 8px', borderRadius: 6, background: '#FFFBEB' }}>
                      <span style={{ color: '#B45309' }}>Custo capital</span>
                      <span style={{ fontWeight: 700, color: '#B45309' }}>{fmt(p.custo_capital)}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
