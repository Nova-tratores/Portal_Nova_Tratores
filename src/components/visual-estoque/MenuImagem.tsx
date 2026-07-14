'use client'
import { useEffect, useState } from 'react'
import { X, Search, Image as ImageIcon, ZoomIn, RotateCw, Plus, Minus } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

// Menu de gestão de imagem (aberto via atalho QQ). Genérico para produtos do
// pátio e veículos da frota: o pai informa os endpoints e a identidade do item.
// Porta o "menu secreto" de patio.ejs / frota.ejs.
//
// - endpointImagem: POST { [chaveId]: id, imagem_url } para gravar a imagem.
// - endpointTamanho: POST para persistir img_tamanho (no pátio é /mover; o pai
//   monta o corpo via montarBodyTamanho). Opcional.
// - endpointBuscar: GET ?termo= -> { ok, imagens: string[] } (Bing).
// - endpointCopiar: GET -> lista de { descricao, imagem_url } para copiar.

interface ItemImagem {
  id: number
  descricao: string
  imagem_url: string
  img_tamanho: number
}

interface Props {
  item: ItemImagem
  endpointImagem: string
  chaveId: string
  endpointTamanho?: string
  montarBodyTamanho?: (tamanho: number) => Record<string, unknown>
  endpointBuscar?: string
  endpointCopiar?: string
  onClose: () => void
  onImagemAlterada: (url: string) => void
  onTamanhoAlterado: (tamanho: number) => void
}

export default function MenuImagem({
  item, endpointImagem, chaveId, endpointTamanho, montarBodyTamanho,
  endpointBuscar = '/api/visual-estoque/buscar-imagem',
  endpointCopiar = '/api/visual-estoque/produtos-imagens',
  onClose, onImagemAlterada, onTamanhoAlterado,
}: Props) {
  const [url, setUrl] = useState('')
  const [rotacao, setRotacao] = useState(0)
  const [tamanho, setTamanho] = useState(item.img_tamanho || 80)
  const [resultados, setResultados] = useState<string[]>([])
  const [buscando, setBuscando] = useState(false)
  const [copiarLista, setCopiarLista] = useState<{ descricao: string; imagem_url: string }[]>([])
  const [filtroCopiar, setFiltroCopiar] = useState('')
  const [aba, setAba] = useState<'principal' | 'copiar'>('principal')

  useEffect(() => { setTamanho(item.img_tamanho || 80) }, [item.img_tamanho])

  async function salvarImagem(novaUrl: string) {
    if (!novaUrl) return
    await fetch(endpointImagem, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ [chaveId]: item.id, imagem_url: novaUrl }),
    })
    onImagemAlterada(novaUrl)
  }

  async function salvarTamanho(novo: number) {
    const clamp = Math.max(30, Math.min(300, novo))
    setTamanho(clamp)
    onTamanhoAlterado(clamp)
    if (endpointTamanho && montarBodyTamanho) {
      await fetch(endpointTamanho, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(montarBodyTamanho(clamp)),
      })
    }
  }

  async function buscarInternet() {
    setBuscando(true); setResultados([])
    try {
      const r = await fetch(`${endpointBuscar}?termo=${encodeURIComponent(item.descricao)}`, { headers: await authHeaders() })
      const d = await r.json()
      setResultados(d.imagens || [])
    } finally { setBuscando(false) }
  }

  async function abrirCopiar() {
    setAba('copiar')
    if (copiarLista.length === 0) {
      const r = await fetch(endpointCopiar, { headers: await authHeaders() })
      const d = await r.json()
      setCopiarLista(Array.isArray(d) ? d.filter((x: any) => x.imagem_url) : [])
    }
  }

  const copiarFiltrado = copiarLista
    .filter(c => c.descricao.toLowerCase().includes(filtroCopiar.toLowerCase()))
    .slice(0, 60)

  const box: React.CSSProperties = { border: '1px solid #e5e5e5', borderRadius: 8, padding: '8px 10px', fontSize: 12, width: '100%' }
  const btn: React.CSSProperties = { padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: 460, maxHeight: '85vh', overflow: 'auto', background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800 }}>Imagem · {item.descricao.substring(0, 38)}</div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>

        {/* Preview */}
        <div style={{ textAlign: 'center', marginBottom: 14, background: '#f9fafb', borderRadius: 10, padding: 12 }}>
          {item.imagem_url ? (
            <img src={item.imagem_url} alt="" style={{ maxHeight: 140, maxWidth: '100%', objectFit: 'contain', transform: `rotate(${rotacao}deg)` }} />
          ) : <ImageIcon size={48} color="#D1D5DB" />}
        </div>

        {/* Controles rápidos */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <button style={btn} onClick={() => salvarTamanho(tamanho - 20)}><Minus size={14} /> Menor</button>
          <span style={{ ...btn, cursor: 'default' }}>{tamanho}px</span>
          <button style={btn} onClick={() => salvarTamanho(tamanho + 20)}><Plus size={14} /> Maior</button>
          <button style={btn} onClick={() => setRotacao(r => (r + 90) % 360)}><RotateCw size={14} /> Girar</button>
          {item.imagem_url && (
            <button style={btn} onClick={() => window.open(item.imagem_url, '_blank')}><ZoomIn size={14} /> Zoom</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button style={{ ...btn, flex: 1, justifyContent: 'center', background: aba === 'principal' ? '#FEF2F2' : '#fff' }} onClick={() => setAba('principal')}>URL / Internet</button>
          <button style={{ ...btn, flex: 1, justifyContent: 'center', background: aba === 'copiar' ? '#FEF2F2' : '#fff' }} onClick={abrirCopiar}>Copiar de outro</button>
        </div>

        {aba === 'principal' ? (
          <>
            {/* URL direta */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input style={box} placeholder="Colar URL da imagem..." value={url} onChange={e => setUrl(e.target.value)} />
              <button style={btn} onClick={() => salvarImagem(url)}>Salvar</button>
            </div>

            {/* Buscar internet */}
            <button style={{ ...btn, width: '100%', justifyContent: 'center', marginBottom: 12 }} onClick={buscarInternet} disabled={buscando}>
              <Search size={14} /> {buscando ? 'Buscando...' : 'Buscar na internet'}
            </button>
            {resultados.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {resultados.map((u, i) => (
                  <img key={i} src={u} alt="" onClick={() => salvarImagem(u)}
                    style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 8, cursor: 'pointer', border: '1px solid #e5e5e5' }} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <input style={{ ...box, marginBottom: 10 }} placeholder="Filtrar..." value={filtroCopiar} onChange={e => setFiltroCopiar(e.target.value)} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {copiarFiltrado.map((c, i) => (
                <img key={i} src={c.imagem_url} alt={c.descricao} title={c.descricao} onClick={() => salvarImagem(c.imagem_url)}
                  style={{ width: '100%', height: 64, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: '1px solid #e5e5e5' }} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
