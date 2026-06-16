'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import CatalogoNovo from '@/components/ppv/CatalogoNovo'

interface ProdutoBusca {
  codigo: string
  descricao: string
  preco: number
  empresa?: string
  origem: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (codigo: string, descricao: string, preco: number) => void
}

export default function ModalBuscaProdutoOrc({ open, onClose, onSelect }: Props) {
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<ProdutoBusca[]>([])
  const [buscando, setBuscando] = useState(false)
  const [mensagem, setMensagem] = useState('Digite para pesquisar produtos...')
  const [verCatalogo, setVerCatalogo] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      setTermo('')
      setResultados([])
      setVerCatalogo(false)
      setMensagem('Digite para pesquisar produtos...')
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [open])

  const buscar = useCallback(async (t: string) => {
    if (t.trim().length < 2) {
      setResultados([])
      setMensagem('Digite ao menos 2 caracteres...')
      return
    }
    setBuscando(true)
    setMensagem('')
    try {
      const res = await fetch(`/api/ppv/produtos?termo=${encodeURIComponent(t.trim())}`)
      const data: ProdutoBusca[] = await res.json()
      setResultados(data)
      if (data.length === 0) setMensagem('Nenhum produto encontrado.')
    } catch {
      setMensagem('Erro na busca.')
    }
    setBuscando(false)
  }, [])

  function handleChange(value: string) {
    setTermo(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => buscar(value), 400)
  }

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(127,29,29,0.5)', backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        width: verCatalogo ? 1060 : 750, maxWidth: '96vw', height: verCatalogo ? '88vh' : undefined,
        maxHeight: verCatalogo ? '88vh' : 520, display: 'flex', flexDirection: 'column',
        borderRadius: 12, background: '#FFFAF5', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 32px', borderBottom: '1px solid rgba(251,146,60,0.3)',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>Buscar Produto</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => setVerCatalogo(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid #fecaca', background: verCatalogo ? '#dc2626' : '#fff', color: verCatalogo ? '#fff' : '#dc2626', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <i className="fas fa-book-open" /> Catálogo Jivo
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: '#94a3b8', cursor: 'pointer' }}>&times;</button>
          </div>
        </div>
        {verCatalogo ? (
          <div style={{ flex: 1, overflow: 'hidden', padding: 12, minHeight: 0 }}>
            <CatalogoNovo onSelecionarPeca={(p) => { setVerCatalogo(false); setTermo(p.code); buscar(p.code) }} />
          </div>
        ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 32px' }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              ref={inputRef}
              type="text"
              value={termo}
              onChange={e => handleChange(e.target.value)}
              onKeyUp={e => e.key === 'Enter' && buscar(termo)}
              placeholder="Código ou nome do produto..."
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 10,
                border: '2px solid #dc2626', fontSize: 14, outline: 'none',
                fontFamily: "'Poppins', sans-serif",
              }}
            />
          </div>
          <div style={{ maxHeight: 320, overflow: 'auto', borderRadius: 8, border: '1px solid rgba(251,146,60,0.3)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,237,213,0.4)' }}>
                  <th style={modalThStyle}>CÓDIGO</th>
                  <th style={modalThStyle}>DESCRIÇÃO</th>
                  <th style={{ ...modalThStyle, textAlign: 'right' }}>PREÇO</th>
                  <th style={{ ...modalThStyle, textAlign: 'center' }}>EMPRESA</th>
                </tr>
              </thead>
              <tbody>
                {buscando ? (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
                    Buscando...
                  </td></tr>
                ) : resultados.length > 0 ? (
                  resultados.map((p, i) => (
                    <tr
                      key={i}
                      onClick={() => { onSelect(p.codigo, p.descricao, p.preco); onClose() }}
                      style={{ cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fff7ed')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{p.codigo}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, color: '#475569', maxWidth: 300 }}>
                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descricao}</div>
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: '#1e293b', textAlign: 'right' }}>
                        R$ {p.preco.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        {p.empresa ? (
                          <span style={{
                            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: p.empresa.toLowerCase().includes('castro') ? '#DBEAFE' : '#FEE2E2',
                            color: p.empresa.toLowerCase().includes('castro') ? '#2563EB' : '#DC2626',
                          }}>
                            {p.empresa.toLowerCase().includes('castro') ? 'CASTRO' : 'NOVA'}
                          </span>
                        ) : <span style={{ color: '#d4d4d4' }}>—</span>}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={4} style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
                    {mensagem}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

const modalThStyle: React.CSSProperties = {
  padding: '10px 14px', fontSize: 10, fontWeight: 800,
  color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1,
  borderBottom: '1px solid rgba(251,146,60,0.3)', textAlign: 'left',
}
