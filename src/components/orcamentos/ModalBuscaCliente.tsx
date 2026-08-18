'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

interface ClienteBusca {
  nome: string
  documento: string
  endereco: string
  cidade: string
  origem: string
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (nome: string, documento: string, endereco: string, cidade: string) => void
}

export default function ModalBuscaClienteOrc({ open, onClose, onSelect }: Props) {
  const [termo, setTermo] = useState('')
  const [resultados, setResultados] = useState<ClienteBusca[]>([])
  const [buscando, setBuscando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      setTermo('')
      setResultados([])
      setBuscando(true)
      fetch('/api/ppv/clientes?termo=a')
        .then(r => r.json())
        .then(data => setResultados(data))
        .catch(() => {})
        .finally(() => setBuscando(false))
      setTimeout(() => inputRef.current?.focus(), 200)
    }
  }, [open])

  const buscar = useCallback(async (t: string) => {
    if (t.trim().length < 1) return
    setBuscando(true)
    try {
      const res = await fetch(`/api/ppv/clientes?termo=${encodeURIComponent(t.trim())}`)
      const data = await res.json()
      setResultados(data)
    } catch { /* */ }
    setBuscando(false)
  }, [])

  function handleChange(value: string) {
    setTermo(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => buscar(value), 300)
  }

  const filtrados = useMemo(() => {
    if (!termo.trim()) return resultados
    const terms = termo.toLowerCase().split(/\s+/).filter(Boolean)
    return resultados.filter(c => {
      const text = `${c.nome} ${c.documento} ${c.cidade}`.toLowerCase()
      return terms.every(t => text.includes(t))
    })
  }, [resultados, termo])

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
        width: 800, maxHeight: 560, display: 'flex', flexDirection: 'column',
        borderRadius: 12, background: '#FFFAF5', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 32px', borderBottom: '1px solid rgba(251,146,60,0.3)',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', margin: 0 }}>Buscar Cliente</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: '#94a3b8', cursor: 'pointer' }}>&times;</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 32px' }}>
          <input
            ref={inputRef}
            type="text"
            value={termo}
            onChange={e => handleChange(e.target.value)}
            onKeyUp={e => e.key === 'Enter' && buscar(termo)}
            placeholder="Nome, CNPJ ou cidade do cliente..."
            style={{
              width: '100%', padding: '14px 16px', borderRadius: 10,
              border: '2px solid #EA580C', fontSize: 14, outline: 'none',
              fontFamily: "'Poppins', sans-serif", marginBottom: 12,
            }}
          />
          <div style={{ maxHeight: 360, overflow: 'auto', borderRadius: 8, border: '1px solid rgba(251,146,60,0.3)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(255,237,213,0.4)' }}>
                  <th style={thS}>CLIENTE</th>
                  <th style={{ ...thS, width: 150 }}>CNPJ / CPF</th>
                  <th style={{ ...thS, width: 140 }}>CIDADE</th>
                </tr>
              </thead>
              <tbody>
                {buscando ? (
                  <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
                    Buscando...
                  </td></tr>
                ) : filtrados.length > 0 ? (
                  filtrados.map((c, i) => (
                    <tr
                      key={i}
                      onClick={() => { onSelect(c.nome, c.documento, c.endereco, c.cidade); onClose() }}
                      style={{ cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fff7ed')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{c.nome}</td>
                      <td style={{ padding: '12px 14px', fontSize: 12, fontFamily: 'monospace', color: '#64748b' }}>{c.documento || '—'}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#64748b' }}>{c.cidade || '—'}</td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={3} style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#94a3b8' }}>
                    {termo ? 'Nenhum cliente encontrado.' : 'Digite para pesquisar...'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

const thS: React.CSSProperties = {
  padding: '10px 14px', fontSize: 10, fontWeight: 800,
  color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1,
  borderBottom: '1px solid rgba(251,146,60,0.3)', textAlign: 'left',
}
