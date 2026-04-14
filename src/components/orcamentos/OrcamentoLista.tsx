'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, FileText, Edit3, Trash2, Eye, Plus, FilterX, Package, Wrench } from 'lucide-react'

interface Orcamento {
  id: number
  numero: string
  tipo: string
  cliente_nome: string
  cliente_cidade: string
  total: number
  status: string
  criado_por: string
  created_at: string
}

interface Props {
  onNovo: () => void
  onEditar: (id: number) => void
}

export default function OrcamentoLista({ onNovo, onEditar }: Props) {
  const [lista, setLista] = useState<Orcamento[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  useEffect(() => { carregar() }, [])

  async function carregar() {
    setLoading(true)
    const { data } = await supabase
      .from('orcamentos')
      .select('id, numero, tipo, cliente_nome, cliente_cidade, total, status, criado_por, created_at')
      .order('id', { ascending: false })
    setLista(data || [])
    setLoading(false)
  }

  async function excluir(id: number) {
    if (!confirm('Tem certeza que deseja excluir este orçamento?')) return
    await supabase.from('orcamentos').delete().eq('id', id)
    carregar()
  }

  async function verPDF(id: number) {
    const { data } = await supabase.from('orcamentos').select('*').eq('id', id).single()
    if (!data) return

    const res = await fetch('/api/orcamentos/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numero: data.numero,
        cliente: data.cliente_nome,
        documento: data.cliente_documento,
        endereco: data.cliente_endereco,
        cidade: data.cliente_cidade,
        observacao: data.observacao,
        validade: data.validade,
        itens: data.itens || [],
        maoObra: data.mao_obra,
        deslocamento: data.deslocamento,
        userName: data.criado_por,
        dataEmissao: data.created_at,
      }),
    })
    const result = await res.json()
    if (result.html) {
      const win = window.open('', '_blank')
      if (win) { win.document.write(result.html); win.document.close() }
    }
  }

  const listaFiltrada = lista.filter(item => {
    const matchBusca = !busca ||
      item.cliente_nome?.toLowerCase().includes(busca.toLowerCase()) ||
      item.numero?.toLowerCase().includes(busca.toLowerCase())
    const matchTipo = !filtroTipo || item.tipo === filtroTipo
    const matchStatus = !filtroStatus || item.status === filtroStatus
    return matchBusca && matchTipo && matchStatus
  })

  const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const tipoLabel: Record<string, string> = { pecas: 'Peças', 'mao-de-obra': 'Mão de Obra', completo: 'Completo' }
  const tipoIcon = (t: string) => t === 'pecas' ? <Package size={14} /> : t === 'mao-de-obra' ? <Wrench size={14} /> : <><Package size={12} /><Wrench size={12} /></>
  const statusColors: Record<string, { bg: string; color: string; border: string }> = {
    rascunho: { bg: '#f5f5f5', color: '#737373', border: '#e5e5e5' },
    ativo: { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    aprovado: { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
    rejeitado: { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    expirado: { bg: '#fefce8', color: '#a16207', border: '#fde68a' },
  }

  if (loading) {
    return (
      <div style={{ padding: '80px 40px', textAlign: 'center', fontFamily: "'Poppins', sans-serif" }}>
        <p style={{ color: '#a3a3a3', fontSize: 15, letterSpacing: 2 }}>Carregando orçamentos...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1200, margin: '0 auto', fontFamily: "'Poppins', sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#1a1a1a', margin: 0 }}>Orçamentos</h1>
          <p style={{ fontSize: 13, color: '#737373', marginTop: 4 }}>{lista.length} orçamento{lista.length !== 1 ? 's' : ''} cadastrado{lista.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={onNovo} style={{
          padding: '10px 24px', borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
          color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          boxShadow: '0 4px 12px rgba(220,38,38,0.2)',
        }}>
          <Plus size={16} /> Novo Orçamento
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
            <input
              type="text"
              placeholder="Buscar por cliente ou número..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              style={{
                width: '100%', padding: '10px 14px 10px 40px', borderRadius: 10,
                border: '1px solid #e5e5e5', fontSize: 13, outline: 'none',
                fontFamily: "'Poppins', sans-serif",
              }}
            />
          </div>
        </div>
        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          style={{
            padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e5e5',
            fontSize: 13, outline: 'none', fontFamily: "'Poppins', sans-serif",
            cursor: 'pointer', color: filtroTipo ? '#1a1a1a' : '#a3a3a3',
          }}
        >
          <option value="">Todos os tipos</option>
          <option value="pecas">Peças</option>
          <option value="mao-de-obra">Mão de Obra</option>
          <option value="completo">Completo</option>
        </select>
        <select
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value)}
          style={{
            padding: '10px 14px', borderRadius: 10, border: '1px solid #e5e5e5',
            fontSize: 13, outline: 'none', fontFamily: "'Poppins', sans-serif",
            cursor: 'pointer', color: filtroStatus ? '#1a1a1a' : '#a3a3a3',
          }}
        >
          <option value="">Todos os status</option>
          <option value="ativo">Ativo</option>
          <option value="aprovado">Aprovado</option>
          <option value="rejeitado">Rejeitado</option>
          <option value="expirado">Expirado</option>
        </select>
        {(busca || filtroTipo || filtroStatus) && (
          <button
            onClick={() => { setBusca(''); setFiltroTipo(''); setFiltroStatus('') }}
            style={{
              padding: '10px 16px', borderRadius: 10, border: 'none',
              background: '#f5f5f5', color: '#737373', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <FilterX size={14} /> Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      <div style={{
        background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0',
        overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#fafafa' }}>
              <th style={thStyle}>NÚMERO</th>
              <th style={thStyle}>TIPO</th>
              <th style={thStyle}>CLIENTE</th>
              <th style={thStyle}>CIDADE</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>VALOR</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>STATUS</th>
              <th style={thStyle}>DATA</th>
              <th style={thStyle}>CRIADO POR</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>AÇÕES</th>
            </tr>
          </thead>
          <tbody>
            {listaFiltrada.map(item => {
              const sc = statusColors[item.status] || statusColors.ativo
              return (
                <tr key={item.id} style={{ borderBottom: '1px solid #f5f5f5', transition: '0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                >
                  <td style={{ ...tdStyle, fontWeight: 700, color: '#dc2626' }}>{item.numero}</td>
                  <td style={tdStyle}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12,
                      background: '#f5f5f5', padding: '3px 10px', borderRadius: 6, fontWeight: 600, color: '#525252',
                    }}>
                      {tipoIcon(item.tipo)} {tipoLabel[item.tipo] || item.tipo}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{item.cliente_nome}</td>
                  <td style={{ ...tdStyle, color: '#737373' }}>{item.cliente_cidade || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>R$ {fmt(item.total)}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
                      background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`,
                      textTransform: 'capitalize',
                    }}>
                      {item.status}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: '#737373', fontSize: 12 }}>
                    {new Date(item.created_at).toLocaleDateString('pt-BR')}
                  </td>
                  <td style={{ ...tdStyle, color: '#737373', fontSize: 12 }}>{item.criado_por || '—'}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button onClick={() => verPDF(item.id)} title="Ver PDF" style={actionBtn}>
                        <Eye size={15} color="#737373" />
                      </button>
                      <button onClick={() => onEditar(item.id)} title="Editar" style={actionBtn}>
                        <Edit3 size={15} color="#737373" />
                      </button>
                      <button onClick={() => excluir(item.id)} title="Excluir" style={actionBtn}>
                        <Trash2 size={15} color="#ef4444" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {listaFiltrada.length === 0 && (
          <div style={{ padding: '60px 40px', textAlign: 'center' }}>
            <FileText size={40} color="#e5e5e5" style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 15, color: '#a3a3a3', fontWeight: 500 }}>
              {lista.length === 0 ? 'Nenhum orçamento criado ainda.' : 'Nenhum resultado para os filtros aplicados.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px', fontSize: 10, fontWeight: 800,
  color: '#a3a3a3', textTransform: 'uppercase', letterSpacing: 1,
  borderBottom: '2px solid #f0f0f0', textAlign: 'left',
}

const tdStyle: React.CSSProperties = {
  padding: '14px 16px', fontSize: 13, color: '#1a1a1a',
}

const actionBtn: React.CSSProperties = {
  background: 'none', border: '1px solid #f0f0f0', borderRadius: 8,
  padding: 6, cursor: 'pointer', display: 'flex', alignItems: 'center',
  transition: '0.15s',
}
