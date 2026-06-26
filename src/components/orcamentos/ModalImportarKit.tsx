'use client'

import { useState, useEffect } from 'react'
import { Package, ChevronRight, Search } from 'lucide-react'

interface KitProduto { codigo: string; quantidade: number }
interface Kit {
  id: number
  Trator: string
  Cod_Trator?: string
  Horas: string
  tipo?: string
  produtos: KitProduto[]
}

interface ProdutoResolvido {
  codigo: string
  descricao: string
  quantidade: number
  preco: number
}

interface Props {
  open: boolean
  onClose: () => void
  onImportar: (produtos: ProdutoResolvido[], horas: number) => void
}

export default function ModalImportarKit({ open, onClose, onImportar }: Props) {
  const [kits, setKits] = useState<Kit[]>([])
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [importando, setImportando] = useState<number | null>(null)

  useEffect(() => {
    if (!open) return
    setBusca('')
    setImportando(null)
    carregarKits()
  }, [open])

  async function carregarKits() {
    setLoading(true)
    try {
      const res = await fetch('/api/ppv/revisoes/gerenciar')
      const data = await res.json()
      setKits(Array.isArray(data) ? data : [])
    } catch { setKits([]) }
    setLoading(false)
  }

  async function importarKit(kit: Kit) {
    setImportando(kit.id)
    try {
      const codigos = kit.produtos.map(p => p.codigo).filter(Boolean)
      if (codigos.length === 0) { alert('Kit sem produtos'); setImportando(null); return }

      const produtosResolvidos: ProdutoResolvido[] = []
      for (const p of kit.produtos) {
        if (!p.codigo) continue
        try {
          const res = await fetch(`/api/ppv/produtos?termo=${encodeURIComponent(p.codigo)}`)
          const results = await res.json()
          const match = Array.isArray(results) ? results.find((r: any) => r.codigo === p.codigo) : null
          produtosResolvidos.push({
            codigo: p.codigo,
            descricao: match?.descricao || `Produto ${p.codigo}`,
            quantidade: p.quantidade || 1,
            preco: match?.preco || 0,
          })
        } catch {
          produtosResolvidos.push({
            codigo: p.codigo, descricao: `Produto ${p.codigo}`,
            quantidade: p.quantidade || 1, preco: 0,
          })
        }
      }

      const horas = parseFloat(kit.Horas) || 0
      onImportar(produtosResolvidos, horas)
      onClose()
    } catch (e) {
      alert('Erro ao importar kit: ' + (e instanceof Error ? e.message : String(e)))
    }
    setImportando(null)
  }

  // Agrupar kits por trator
  const filtrados = kits.filter(k => {
    if (!busca) return true
    const t = busca.toLowerCase()
    return (k.Trator || '').toLowerCase().includes(t) ||
           (k.Horas || '').toLowerCase().includes(t) ||
           (k.tipo || '').toLowerCase().includes(t)
  })

  const porTrator = new Map<string, Kit[]>()
  for (const k of filtrados) {
    const nome = k.Trator || 'Sem trator'
    if (!porTrator.has(nome)) porTrator.set(nome, [])
    porTrator.get(nome)!.push(k)
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: 700, maxHeight: 600, display: 'flex', flexDirection: 'column',
        borderRadius: 16, background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 28px', borderBottom: '1px solid #f0f0f0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Package size={18} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a', margin: 0 }}>Importar Kit de Revisão</h2>
              <p style={{ fontSize: 11, color: '#a3a3a3', margin: 0 }}>Selecione um kit para popular os itens do orçamento</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: '#a3a3a3', cursor: 'pointer' }}>&times;</button>
        </div>

        {/* Busca */}
        <div style={{ padding: '16px 28px', borderBottom: '1px solid #f5f5f5' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar trator, horas, tipo..."
              style={{
                width: '100%', padding: '10px 14px 10px 36px', borderRadius: 10,
                border: '1px solid #e5e5e5', fontSize: 13, outline: 'none',
                fontFamily: "'Poppins', sans-serif",
              }}
            />
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 28px 20px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#a3a3a3' }}>Carregando kits...</div>
          ) : porTrator.size === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#a3a3a3' }}>Nenhum kit encontrado.</div>
          ) : (
            Array.from(porTrator.entries()).map(([trator, kitsDoTrator]) => (
              <div key={trator} style={{ marginBottom: 16 }}>
                <div style={{
                  fontSize: 12, fontWeight: 800, color: '#737373', textTransform: 'uppercase',
                  letterSpacing: 0.5, marginBottom: 8, paddingLeft: 4,
                }}>
                  {trator}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {kitsDoTrator.map(kit => (
                    <button
                      key={kit.id}
                      onClick={() => importarKit(kit)}
                      disabled={importando !== null}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px', borderRadius: 10,
                        border: '1px solid #f0f0f0', background: '#fafafa',
                        cursor: importando !== null ? 'wait' : 'pointer',
                        transition: '0.15s', opacity: importando !== null && importando !== kit.id ? 0.5 : 1,
                        fontFamily: "'Poppins', sans-serif", width: '100%', textAlign: 'left',
                      }}
                      onMouseEnter={e => { if (!importando) e.currentTarget.style.background = '#fef2f2' }}
                      onMouseLeave={e => { if (!importando) e.currentTarget.style.background = '#fafafa' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>
                            {kit.Horas}
                            <span style={{
                              marginLeft: 8, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                              background: kit.tipo === 'manutencao' ? '#f3e8ff' : kit.tipo === 'quadriciclo' ? '#ECFEFF' : '#fef2f2',
                              color: kit.tipo === 'manutencao' ? '#7c3aed' : kit.tipo === 'quadriciclo' ? '#0891b2' : '#dc2626',
                            }}>
                              {kit.tipo === 'manutencao' ? 'Manutenção' : kit.tipo === 'quadriciclo' ? 'Quadriciclo' : 'Revisão'}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: '#a3a3a3', marginTop: 2 }}>
                            {kit.produtos.length} produto{kit.produtos.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#a3a3a3' }}>
                        {importando === kit.id ? (
                          <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>Importando...</span>
                        ) : (
                          <ChevronRight size={16} />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
