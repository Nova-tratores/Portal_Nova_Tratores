'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Image, X, ChevronLeft, ChevronRight, Camera, Wrench, User } from 'lucide-react'

interface FotoItem {
  label: string
  url: string
  categoria: string
}

interface Assinatura {
  label: string
  url: string
}

interface OSFotos {
  os: string
  tecnico: string
  tipoServico: string
  diagnostico: string
  servicoRealizado: string
  chassis: string
  horimetro: string
  fotos: FotoItem[]
  assinaturas: Assinatura[]
  totalFotos: number
}

interface OSListItem {
  os: string
  tecnico: string
  tipoServico: string
  totalFotos: number
  thumb: string
}

export default function FotosTecnicosPage() {
  const [busca, setBusca] = useState('')
  const [lista, setLista] = useState<OSListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [osSelecionada, setOsSelecionada] = useState<OSFotos | null>(null)
  const [loadingOS, setLoadingOS] = useState(false)
  const [fotoExpandida, setFotoExpandida] = useState<{ url: string; label: string } | null>(null)
  const [fotoIdx, setFotoIdx] = useState(0)

  useEffect(() => {
    fetch('/api/pos/fotos-tecnico')
      .then(r => r.json())
      .then(setLista)
      .catch(() => setLista([]))
      .finally(() => setLoading(false))
  }, [])

  const abrirOS = useCallback(async (osId: string) => {
    setLoadingOS(true)
    try {
      const res = await fetch(`/api/pos/fotos-tecnico?os=${encodeURIComponent(osId)}`)
      if (res.ok) {
        const data = await res.json()
        setOsSelecionada(data)
      }
    } catch { /* */ }
    setLoadingOS(false)
  }, [])

  const expandirFoto = (foto: { url: string; label: string }, idx: number) => {
    setFotoExpandida(foto)
    setFotoIdx(idx)
  }

  const navFoto = (dir: number) => {
    if (!osSelecionada) return
    const todas = osSelecionada.fotos
    const novoIdx = (fotoIdx + dir + todas.length) % todas.length
    setFotoIdx(novoIdx)
    setFotoExpandida({ url: todas[novoIdx].url, label: todas[novoIdx].label })
  }

  const listaFiltrada = busca.length >= 2
    ? lista.filter(item =>
      item.os.toLowerCase().includes(busca.toLowerCase()) ||
      item.tecnico.toLowerCase().includes(busca.toLowerCase())
    )
    : lista

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#1E293B', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Camera size={24} color="#C41E2A" />
            Fotos dos Tecnicos
          </h1>
          <p style={{ fontSize: 13, color: '#64748B', margin: '4px 0 0' }}>
            Visualize as fotos anexadas pelos tecnicos em cada ordem de servico
          </p>
        </div>
        <div style={{ fontSize: 13, color: '#94A3B8', fontWeight: 600 }}>
          {lista.length} relatorio(s)
        </div>
      </div>

      {/* Barra de busca */}
      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 400 }}>
        <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94A3B8' }} />
        <input
          type="text"
          placeholder="Buscar por OS ou tecnico..."
          value={busca}
          onChange={e => setBusca(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px 10px 38px', borderRadius: 10,
            border: '1px solid #E2E8F0', fontSize: 14, outline: 'none',
            background: '#fff', boxSizing: 'border-box',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* Lista de OS */}
        <div style={{ width: 340, flexShrink: 0 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Carregando...</div>
          ) : listaFiltrada.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>
              {busca ? 'Nenhum resultado' : 'Nenhum relatorio encontrado'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' }}>
              {listaFiltrada.map(item => (
                <div
                  key={item.os}
                  onClick={() => abrirOS(item.os)}
                  style={{
                    background: osSelecionada?.os === item.os ? '#EFF6FF' : '#fff',
                    border: `1px solid ${osSelecionada?.os === item.os ? '#3B82F6' : '#F1F5F9'}`,
                    borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                    transition: 'all 0.15s',
                  }}
                >
                  {item.thumb ? (
                    <img
                      src={item.thumb}
                      alt=""
                      style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                    />
                  ) : (
                    <div style={{
                      width: 48, height: 48, borderRadius: 8, background: '#F1F5F9',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Image size={20} color="#CBD5E1" />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>{item.os}</div>
                    <div style={{ fontSize: 12, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.tecnico || 'Sem tecnico'}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: '#3B82F6', background: '#EFF6FF',
                    padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                  }}>
                    {item.totalFotos} foto{item.totalFotos !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detalhe da OS */}
        <div style={{ flex: 1 }}>
          {loadingOS ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>Carregando fotos...</div>
          ) : !osSelecionada ? (
            <div style={{
              textAlign: 'center', padding: 60, color: '#94A3B8',
              background: '#FAFBFC', borderRadius: 16, border: '1px dashed #E2E8F0',
            }}>
              <Camera size={40} color="#E2E8F0" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600 }}>Selecione uma OS para ver as fotos</div>
            </div>
          ) : (
            <div>
              {/* Info da OS */}
              <div style={{
                background: '#fff', borderRadius: 14, padding: '16px 20px', marginBottom: 16,
                border: '1px solid #F1F5F9', display: 'flex', gap: 24, flexWrap: 'wrap',
              }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Ordem</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#1E293B' }}>{osSelecionada.os}</div>
                </div>
                {osSelecionada.tecnico && (
                  <div>
                    <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Tecnico</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={14} /> {osSelecionada.tecnico}
                    </div>
                  </div>
                )}
                {osSelecionada.tipoServico && (
                  <div>
                    <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Tipo</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Wrench size={14} /> {osSelecionada.tipoServico}
                    </div>
                  </div>
                )}
                {osSelecionada.chassis && (
                  <div>
                    <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Chassis</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{osSelecionada.chassis}</div>
                  </div>
                )}
                {osSelecionada.horimetro && (
                  <div>
                    <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Horimetro</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>{osSelecionada.horimetro}</div>
                  </div>
                )}
                <div style={{ marginLeft: 'auto' }}>
                  <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Fotos</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#3B82F6' }}>{osSelecionada.totalFotos}</div>
                </div>
              </div>

              {/* Grid de fotos por categoria */}
              {osSelecionada.fotos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8', background: '#FAFBFC', borderRadius: 12 }}>
                  Nenhuma foto anexada nesta OS
                </div>
              ) : (
                (() => {
                  const categorias: Record<string, FotoItem[]> = {}
                  osSelecionada.fotos.forEach(f => {
                    if (!categorias[f.categoria]) categorias[f.categoria] = []
                    categorias[f.categoria].push(f)
                  })
                  let globalIdx = 0
                  return Object.entries(categorias).map(([cat, fotos]) => (
                    <div key={cat} style={{ marginBottom: 20 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 10,
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <Camera size={14} /> {cat} ({fotos.length})
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                        {fotos.map(foto => {
                          const idx = globalIdx++
                          return (
                            <div
                              key={foto.label}
                              onClick={() => expandirFoto(foto, idx)}
                              style={{
                                borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                                border: '1px solid #F1F5F9', background: '#fff',
                                transition: 'transform 0.15s, box-shadow 0.15s',
                              }}
                              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)' }}
                              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none' }}
                            >
                              <img
                                src={foto.url}
                                alt={foto.label}
                                style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }}
                              />
                              <div style={{ padding: '6px 10px', fontSize: 11, fontWeight: 600, color: '#475569' }}>
                                {foto.label}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))
                })()
              )}

              {/* Assinaturas */}
              {osSelecionada.assinaturas.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 10 }}>
                    Assinaturas
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {osSelecionada.assinaturas.map(ass => (
                      <div key={ass.label} style={{
                        background: '#fff', borderRadius: 10, border: '1px solid #F1F5F9',
                        padding: 12, textAlign: 'center',
                      }}>
                        <img src={ass.url} alt={ass.label} style={{ maxWidth: 200, maxHeight: 80 }} />
                        <div style={{ fontSize: 11, color: '#64748B', fontWeight: 600, marginTop: 6 }}>{ass.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal foto expandida */}
      {fotoExpandida && (
        <div
          onClick={() => setFotoExpandida(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, cursor: 'pointer',
          }}
        >
          <button
            onClick={e => { e.stopPropagation(); setFotoExpandida(null) }}
            style={{
              position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.15)',
              border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer',
            }}
          >
            <X size={24} color="#fff" />
          </button>

          <button
            onClick={e => { e.stopPropagation(); navFoto(-1) }}
            style={{
              position: 'absolute', left: 20, background: 'rgba(255,255,255,0.15)',
              border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer',
            }}
          >
            <ChevronLeft size={28} color="#fff" />
          </button>

          <div onClick={e => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: '85vw' }}>
            <img
              src={fotoExpandida.url}
              alt={fotoExpandida.label}
              style={{ maxHeight: '80vh', maxWidth: '85vw', borderRadius: 8, objectFit: 'contain' }}
            />
            <div style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginTop: 12 }}>
              {fotoExpandida.label}
              <span style={{ color: 'rgba(255,255,255,0.5)', marginLeft: 8 }}>
                {fotoIdx + 1} / {osSelecionada?.fotos.length || 0}
              </span>
            </div>
          </div>

          <button
            onClick={e => { e.stopPropagation(); navFoto(1) }}
            style={{
              position: 'absolute', right: 20, background: 'rgba(255,255,255,0.15)',
              border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer',
            }}
          >
            <ChevronRight size={28} color="#fff" />
          </button>
        </div>
      )}
    </div>
  )
}
