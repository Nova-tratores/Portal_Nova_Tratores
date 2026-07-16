'use client'

import { useState, useEffect, useMemo } from 'react'
import { Package, ChevronRight, ChevronLeft, Search } from 'lucide-react'

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

// Extrai o número de horas de "50H", "300 H", "Revisão" etc. — pra ordenar do menor pro maior.
function horasNum(h: string): number {
  const m = String(h || '').match(/\d+/)
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY
}

const badge = (tipo?: string) => ({
  label: tipo === 'manutencao' ? 'Manutenção' : tipo === 'quadriciclo' ? 'Quadriciclo' : 'Revisão',
  bg: tipo === 'manutencao' ? '#f3e8ff' : tipo === 'quadriciclo' ? '#ECFEFF' : '#fef2f2',
  fg: tipo === 'manutencao' ? '#7c3aed' : tipo === 'quadriciclo' ? '#0891b2' : '#dc2626',
})

export default function ModalImportarKit({ open, onClose, onImportar }: Props) {
  const [kits, setKits] = useState<Kit[]>([])
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [modeloSel, setModeloSel] = useState<string | null>(null)
  const [importando, setImportando] = useState<number | null>(null)
  const [descMap, setDescMap] = useState<Record<string, string>>({}) // código -> descrição

  useEffect(() => {
    if (!open) return
    setBusca(''); setModeloSel(null); setImportando(null); setDescMap({})
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

  // Modelos (com contagem e tipos), filtrados pela busca
  const modelos = useMemo(() => {
    const map = new Map<string, { nome: string; kits: Kit[]; tipos: Set<string> }>()
    for (const k of kits) {
      const nome = (k.Trator || 'Sem modelo').trim()
      if (!map.has(nome)) map.set(nome, { nome, kits: [], tipos: new Set() })
      const o = map.get(nome)!
      o.kits.push(k); o.tipos.add(k.tipo || 'revisao')
    }
    let lista = [...map.values()]
    const t = busca.trim().toLowerCase()
    if (t) lista = lista.filter((m) => m.nome.toLowerCase().includes(t))
    return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt', { numeric: true }))
  }, [kits, busca])

  // Kits do modelo selecionado, ordenados por horas (menor -> maior)
  const kitsDoModelo = useMemo(() => {
    if (!modeloSel) return []
    return kits.filter((k) => (k.Trator || '').trim() === modeloSel)
      .sort((a, b) => horasNum(a.Horas) - horasNum(b.Horas) || String(a.Horas).localeCompare(String(b.Horas), 'pt', { numeric: true }))
  }, [kits, modeloSel])

  // Ao abrir um modelo, resolve as descrições dos códigos (deduplicados) em segundo plano.
  useEffect(() => {
    if (!modeloSel) return
    const codigos = [...new Set(kitsDoModelo.flatMap((k) => k.produtos.map((p) => p.codigo).filter(Boolean)))]
      .filter((c) => descMap[c] === undefined)
    if (!codigos.length) return
    let vivo = true
    ;(async () => {
      for (const cod of codigos) {
        try {
          const res = await fetch(`/api/ppv/produtos?termo=${encodeURIComponent(cod)}`)
          const arr = await res.json()
          const match = Array.isArray(arr) ? arr.find((r: any) => r.codigo === cod) : null
          if (vivo) setDescMap((m) => ({ ...m, [cod]: match?.descricao || '' }))
        } catch { if (vivo) setDescMap((m) => ({ ...m, [cod]: '' })) }
      }
    })()
    return () => { vivo = false }
  }, [modeloSel, kitsDoModelo]) // eslint-disable-line react-hooks/exhaustive-deps

  async function importarKit(kit: Kit) {
    setImportando(kit.id)
    try {
      const produtosResolvidos: ProdutoResolvido[] = []
      for (const p of kit.produtos) {
        if (!p.codigo) continue
        let descricao = descMap[p.codigo] || ''
        let preco = 0
        try {
          const res = await fetch(`/api/ppv/produtos?termo=${encodeURIComponent(p.codigo)}`)
          const arr = await res.json()
          const match = Array.isArray(arr) ? arr.find((r: any) => r.codigo === p.codigo) : null
          if (match) { descricao = match.descricao || descricao; preco = match.preco || 0 }
        } catch { /* usa o que tiver */ }
        produtosResolvidos.push({ codigo: p.codigo, descricao: descricao || `Produto ${p.codigo}`, quantidade: p.quantidade || 1, preco })
      }
      if (produtosResolvidos.length === 0) { alert('Kit sem produtos'); setImportando(null); return }
      onImportar(produtosResolvidos, horasNum(kit.Horas) === Infinity ? 0 : horasNum(kit.Horas))
      onClose()
    } catch (e) {
      alert('Erro ao importar kit: ' + (e instanceof Error ? e.message : String(e)))
    }
    setImportando(null)
  }

  if (!open) return null

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: 720, maxHeight: 620, display: 'flex', flexDirection: 'column', borderRadius: 16, background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden', fontFamily: "'Poppins', sans-serif" }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {modeloSel ? (
              <button onClick={() => setModeloSel(null)} title="Voltar aos modelos"
                style={{ width: 36, height: 36, borderRadius: 10, border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#525252', flexShrink: 0 }}>
                <ChevronLeft size={18} />
              </button>
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #dc2626, #b91c1c)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Package size={18} color="#fff" />
              </div>
            )}
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {modeloSel ? modeloSel : 'Importar Kit de Revisão'}
              </h2>
              <p style={{ fontSize: 11, color: '#a3a3a3', margin: 0 }}>
                {modeloSel ? `${kitsDoModelo.length} kit(s) — do menor pro maior` : 'Escolha o modelo'}
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: '#a3a3a3', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
        </div>

        {/* Busca (só na lista de modelos) */}
        {!modeloSel && (
          <div style={{ padding: '14px 24px', borderBottom: '1px solid #f5f5f5' }}>
            <div style={{ position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
              <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar modelo..." autoFocus
                style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: 10, border: '1px solid #e5e5e5', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: "'Poppins', sans-serif" }} />
            </div>
          </div>
        )}

        {/* Conteúdo */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 24px 20px' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#a3a3a3' }}>Carregando kits...</div>
          ) : !modeloSel ? (
            /* ===== NÍVEL 1: modelos ===== */
            modelos.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', fontSize: 13, color: '#a3a3a3' }}>Nenhum modelo encontrado.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                {modelos.map((m) => (
                  <button key={m.nome} onClick={() => setModeloSel(m.nome)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '14px 16px', borderRadius: 12, border: '1px solid #f0f0f0', background: '#fafafa', cursor: 'pointer', textAlign: 'left', transition: '.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca' }}
                    onMouseLeave={e => { e.currentTarget.style.background = '#fafafa'; e.currentTarget.style.borderColor = '#f0f0f0' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', display: 'flex', alignItems: 'center', gap: 7 }}>
                        <i className="fas fa-tractor" style={{ fontSize: 13, color: '#dc2626' }} />
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.nome}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#a3a3a3', marginTop: 3 }}>{m.kits.length} kit{m.kits.length !== 1 ? 's' : ''}</div>
                    </div>
                    <ChevronRight size={16} color="#cbd5e1" style={{ flexShrink: 0 }} />
                  </button>
                ))}
              </div>
            )
          ) : (
            /* ===== NÍVEL 2: horas do modelo + peças ===== */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {kitsDoModelo.map((kit) => {
                const b = badge(kit.tipo)
                return (
                  <div key={kit.id} style={{ border: '1px solid #f0f0f0', borderRadius: 12, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 14px', background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <i className={kit.tipo === 'quadriciclo' ? 'fas fa-motorcycle' : kit.tipo === 'manutencao' ? 'fas fa-wrench' : 'fas fa-clock'} style={{ fontSize: 13, color: b.fg }} />
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#1a1a1a' }}>{kit.Horas}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: b.bg, color: b.fg }}>{b.label}</span>
                        <span style={{ fontSize: 11, color: '#a3a3a3' }}>· {kit.produtos.length} peça{kit.produtos.length !== 1 ? 's' : ''}</span>
                      </div>
                      <button onClick={() => importarKit(kit)} disabled={importando !== null}
                        style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: importando === kit.id ? '#94a3b8' : '#dc2626', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: importando !== null ? 'wait' : 'pointer', opacity: importando !== null && importando !== kit.id ? 0.5 : 1, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {importando === kit.id ? <><i className="fas fa-spinner fa-spin" /> Importando...</> : <><i className="fas fa-download" /> Importar</>}
                      </button>
                    </div>
                    {/* peças do kit */}
                    <div style={{ padding: '6px 0' }}>
                      {kit.produtos.map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', fontSize: 12.5, borderBottom: i < kit.produtos.length - 1 ? '1px solid #f7f7f7' : 'none' }}>
                          <code style={{ fontWeight: 700, color: '#dc2626', background: '#fef2f2', padding: '2px 7px', borderRadius: 5, fontSize: 11.5, whiteSpace: 'nowrap' }}>{p.codigo}</code>
                          <span style={{ flex: 1, color: '#404040', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {descMap[p.codigo] === undefined ? <span style={{ color: '#cbd5e1' }}>…</span> : (descMap[p.codigo] || <span style={{ color: '#cbd5e1' }}>—</span>)}
                          </span>
                          <span style={{ color: '#737373', fontWeight: 600, whiteSpace: 'nowrap' }}>×{p.quantidade}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
