'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { ChevronRight, Package, MapPin, Eye, Archive, ImagePlus, Images } from 'lucide-react'
import { useAtalhoDuplo } from '@/lib/visual-estoque/useAtalhoDuplo'
import MenuImagem from '@/components/visual-estoque/MenuImagem'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface Maquina {
  codigo_produto: number
  codigo: string
  descricao: string
  familia_nome: string
  marca: string
  cmc: number
  estoque: number
  valor_estoque: number
  custo_capital: number
  custo_dia: number
  custo_capital_mes: number
  dias_em_estoque: number
  selic_acumulada: number
  imagem_url: string
  ambiente: string
  pos_x: number
  pos_y: number
  img_tamanho: number
}

interface FamiliaVE {
  nome: string
  qtdProdutos: number
  qtdEstoque: number
  valorTotal: number
  custoCapital: number
}

interface PatioData {
  ambientes: Record<string, Maquina[]>
  familias: FamiliaVE[]
  total: number
}

const AMB_CONFIG: Record<string, { label: string; color: string }> = {
  patio: { label: 'Pátio', color: '#2563EB' },
  showroom: { label: 'Showroom', color: '#7C3AED' },
  oficina: { label: 'Oficina', color: '#6B7280' },
  oficina2: { label: 'Oficina 2', color: '#6B7280' },
  barracao: { label: 'Barracão', color: '#059669' },
  fartura: { label: 'Fartura', color: '#D97706' },
  demonstracao: { label: 'Demonstração', color: '#DC2626' },
}

export default function PatioPage() {
  const { userProfile } = useAuth()
  const { pode, loading: pLoading } = usePermissoes(userProfile?.id)
  const [data, setData] = useState<PatioData | null>(null)
  const [loading, setLoading] = useState(true)
  const [conta, setConta] = useState('todas')
  const [selecionada, setSelecionada] = useState<Maquina | null>(null)
  const [sidebarTab, setSidebarTab] = useState<'inventario' | 'detalhes'>('inventario')
  const [famAberta, setFamAberta] = useState<string | null>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null)
  const [dragging, setDragging] = useState<{ maq: Maquina; startX: number; startY: number; curX: number; curY: number } | null>(null)
  const [menuImagem, setMenuImagem] = useState(false)
  const [buscandoLote, setBuscandoLote] = useState(false)
  const [zonas, setZonas] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({})
  const [editZonas, setEditZonas] = useState(false)
  const zonesRef = useRef<Record<string, HTMLDivElement | null>>({})
  const mapaRef = useRef<HTMLDivElement | null>(null)

  const recarregar = useCallback(() => {
    setLoading(true)
    fetch(`/api/visual-estoque/produtos?modo=patio&conta=${conta}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [conta])

  useEffect(() => { recarregar() }, [recarregar])

  // Carrega config de zonas do mapa (1x).
  useEffect(() => {
    fetch('/api/visual-estoque/mapa-config?id=default')
      .then(r => r.json())
      .then(z => { if (z && typeof z === 'object') setZonas(z) })
      .catch(() => {})
  }, [])

  // Atalho secreto QQ: abre o menu de imagem da máquina selecionada.
  useAtalhoDuplo('q', () => { if (selecionada) setMenuImagem(true) })

  // Atalho secreto EE: liga/desliga edição de zonas; ao desligar, persiste.
  const salvarZonas = useCallback((z: Record<string, { x: number; y: number; w: number; h: number }>) => {
    fetch('/api/visual-estoque/mapa-config?id=default', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(z),
    }).catch(() => {})
  }, [])
  useAtalhoDuplo('e', () => {
    setEditZonas(prev => {
      if (prev) salvarZonas(zonas)
      return !prev
    })
  })

  // Drag de uma zona (mover ou redimensionar pelo canto) em coordenadas % do mapa.
  const handleZonaDrag = useCallback((e: React.MouseEvent, ambiente: string, modo: 'mover' | 'resize') => {
    e.preventDefault(); e.stopPropagation()
    const mapa = mapaRef.current
    if (!mapa) return
    const rect = mapa.getBoundingClientRect()
    const z0 = zonas[ambiente]
    const startX = e.clientX, startY = e.clientY
    const onMove = (ev: MouseEvent) => {
      const dxPct = ((ev.clientX - startX) / rect.width) * 100
      const dyPct = ((ev.clientY - startY) / rect.height) * 100
      setZonas(prev => {
        const z = prev[ambiente]; if (!z) return prev
        const novo = modo === 'mover'
          ? { ...z, x: Math.max(0, Math.min(98, z0.x + dxPct)), y: Math.max(0, Math.min(98, z0.y + dyPct)) }
          : { ...z, w: Math.max(8, Math.min(100, z0.w + dxPct)), h: Math.max(8, Math.min(100, z0.h + dyPct)) }
        return { ...prev, [ambiente]: novo }
      })
    }
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [zonas])

  // Atualiza um campo da máquina selecionada no estado local (após mudar imagem/tamanho).
  const patchSelecionada = useCallback((patch: Partial<Maquina>) => {
    setSelecionada(prev => prev ? { ...prev, ...patch } : prev)
    setData(prev => {
      if (!prev) return prev
      const novo = { ...prev.ambientes }
      for (const k of Object.keys(novo)) {
        novo[k] = novo[k].map(m => m.codigo_produto === selecionada?.codigo_produto ? { ...m, ...patch } : m)
      }
      return { ...prev, ambientes: novo }
    })
  }, [selecionada])

  async function arquivar() {
    if (!selecionada) return
    await fetch('/api/visual-estoque/produtos/arquivar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_produto: selecionada.codigo_produto, arquivado: true }),
    })
    setSelecionada(null)
    recarregar()
  }

  async function buscarImagensLote() {
    setBuscandoLote(true)
    try {
      let restantes = Infinity
      // Chama em loop (cada request processa um lote limitado) até zerar ou falhar.
      for (let i = 0; i < 30 && restantes > 0; i++) {
        const r = await fetch('/api/visual-estoque/buscar-imagens-lote', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limite: 15 }),
        })
        const d = await r.json()
        if (!d.ok) break
        restantes = d.restantes ?? 0
        if ((d.processados ?? 0) === 0) break
      }
      recarregar()
    } finally { setBuscandoLote(false) }
  }

  const handleDragStart = useCallback((e: React.MouseEvent, maq: Maquina) => {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    setDragging({ maq, startX, startY, curX: startX, curY: startY })

    const onMove = (ev: MouseEvent) => {
      setDragging(prev => prev ? { ...prev, curX: ev.clientX, curY: ev.clientY } : null)
    }

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)

      let targetAmb: string | null = null
      for (const [amb, el] of Object.entries(zonesRef.current)) {
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) {
          targetAmb = amb
          break
        }
      }

      if (targetAmb) {
        const el = zonesRef.current[targetAmb]
        if (el) {
          const r = el.getBoundingClientRect()
          const posX = Math.max(0, Math.min(92, ((ev.clientX - r.left) / r.width) * 100))
          const posY = Math.max(0, Math.min(88, ((ev.clientY - r.top) / r.height) * 100))

          fetch('/api/visual-estoque/mover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo_produto: maq.codigo_produto, ambiente: targetAmb, pos_x: posX, pos_y: posY }),
          })

          setData(prev => {
            if (!prev) return prev
            const newAmb = { ...prev.ambientes }
            for (const key of Object.keys(newAmb)) {
              newAmb[key] = newAmb[key].filter(m => m.codigo_produto !== maq.codigo_produto)
            }
            const updated = { ...maq, ambiente: targetAmb!, pos_x: posX, pos_y: posY }
            if (!newAmb[targetAmb!]) newAmb[targetAmb!] = []
            newAmb[targetAmb!] = [...newAmb[targetAmb!], updated]
            return { ...prev, ambientes: newAmb }
          })
        }
      }

      setDragging(null)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  if (!pLoading && userProfile && !pode('consulta-estoque', 'patio')) return <SemPermissao />

  const allMaquinas = data ? Object.values(data.ambientes).flat() : []
  const valorTotal = allMaquinas.reduce((s, m) => s + m.valor_estoque, 0)
  const custoCapitalTotal = allMaquinas.reduce((s, m) => s + m.custo_capital, 0)
  const custoCapitalMes = allMaquinas.reduce((s, m) => s + m.custo_capital_mes, 0)

  const famMap = new Map<string, Maquina[]>()
  allMaquinas.forEach(m => {
    const f = m.familia_nome || 'Outros'
    if (!famMap.has(f)) famMap.set(f, [])
    famMap.get(f)!.push(m)
  })
  const familias = Array.from(famMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  const renderZone = (ambiente: string, fallback: React.CSSProperties) => {
    const maquinas = data?.ambientes[ambiente] || []
    const cfg = AMB_CONFIG[ambiente] || { label: ambiente, color: '#6B7280' }
    const z = zonas[ambiente]
    const style: React.CSSProperties = z
      ? { left: `${z.x}%`, top: `${z.y}%`, width: `${z.w}%`, height: `${z.h}%` }
      : fallback

    return (
      <div
        ref={el => { zonesRef.current[ambiente] = el }}
        style={{
          position: 'absolute', ...style, borderRadius: 8,
          border: editZonas ? `2px solid ${cfg.color}` : `2px dashed ${cfg.color}40`,
          background: `${cfg.color}08`, overflow: 'visible',
        }}
      >
        <div
          onMouseDown={editZonas && z ? (e) => handleZonaDrag(e, ambiente, 'mover') : undefined}
          style={{ position: 'absolute', top: 4, left: 8, fontSize: 9, fontWeight: 800, color: `${cfg.color}90`, textTransform: 'uppercase', letterSpacing: 1, cursor: editZonas ? 'move' : 'default' }}
        >
          {cfg.label}
        </div>
        {editZonas && z && (
          <div
            onMouseDown={(e) => handleZonaDrag(e, ambiente, 'resize')}
            style={{ position: 'absolute', right: -6, bottom: -6, width: 14, height: 14, borderRadius: 4, background: cfg.color, cursor: 'nwse-resize', zIndex: 30 }}
          />
        )}
        {maquinas.map(m => (
          <div
            key={m.codigo_produto}
            style={{
              position: 'absolute', left: `${m.pos_x}%`, top: `${m.pos_y}%`, cursor: 'grab', zIndex: selecionada?.codigo_produto === m.codigo_produto ? 10 : 1,
            }}
            onMouseDown={e => handleDragStart(e, m)}
            onClick={() => { setSelecionada(m); setSidebarTab('detalhes') }}
            onMouseEnter={e => {
              const r = (e.target as HTMLElement).getBoundingClientRect()
              setTooltip({ x: r.left + r.width / 2, y: r.top - 8, text: `${m.descricao} | ${m.familia_nome} | ${m.dias_em_estoque}d` })
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            {m.imagem_url ? (
              <img
                src={m.imagem_url} alt={m.descricao} draggable={false}
                style={{
                  width: m.img_tamanho || 80, height: 'auto', pointerEvents: 'none',
                  filter: selecionada?.codigo_produto === m.codigo_produto ? 'drop-shadow(0 0 6px #dc2626)' : 'none',
                }}
              />
            ) : (
              <div style={{
                width: m.img_tamanho || 80, height: m.img_tamanho || 80, borderRadius: 8,
                background: '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Package size={24} color="#9CA3AF" />
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 130px)', overflow: 'hidden' }}>
      {/* Main map area */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {/* HUD */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', gap: 0, padding: '8px 16px',
          background: 'rgba(255,255,255,0.95)', borderBottom: '1px solid var(--portal-border, #e5e5e5)', backdropFilter: 'blur(8px)',
          fontSize: 12, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px' }}>
            <span style={{ fontWeight: 800, fontSize: 18, color: 'var(--portal-text, #1a1a1a)' }}>{data?.total || 0}</span>
            <span style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600 }}>Máquinas</span>
          </div>
          <div style={{ width: 1, height: 24, background: '#E5E7EB', margin: '0 4px' }} />
          {Object.entries(data?.ambientes || {}).map(([amb, list]) => {
            const cfg = AMB_CONFIG[amb] || { label: amb, color: '#6B7280' }
            return (
              <div key={amb} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}>
                <span style={{ fontWeight: 800, fontSize: 15, color: cfg.color }}>{list.length}</span>
                <span style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600 }}>{cfg.label}</span>
                <div style={{ width: 1, height: 24, background: '#E5E7EB', marginLeft: 6 }} />
              </div>
            )
          })}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: '#059669' }}>{fmt(valorTotal)}</span>
            <span style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600 }}>Valor</span>
          </div>
          <div style={{ width: 1, height: 24, background: '#E5E7EB', margin: '0 4px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: '#D97706' }}>{fmt(custoCapitalTotal)}</span>
            <span style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600 }}>Capital</span>
          </div>
          <div style={{ width: 1, height: 24, background: '#E5E7EB', margin: '0 4px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: '#DC2626' }}>{fmt(custoCapitalMes)}</span>
            <span style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600 }}>Capital/mês</span>
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={buscarImagensLote} disabled={buscandoLote} title="Buscar imagens das máquinas sem foto" style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)',
              fontSize: 11, fontWeight: 600, background: '#fff', cursor: buscandoLote ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, color: '#6B7280',
            }}>
              <Images size={13} /> {buscandoLote ? 'Buscando...' : 'Imagens'}
            </button>
            <select value={conta} onChange={e => setConta(e.target.value)} style={{
              padding: '6px 12px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)',
              fontSize: 11, fontWeight: 600, background: '#fff', cursor: 'pointer',
            }}>
              <option value="todas">Todas</option>
              <option value="nova">Nova Tratores</option>
              <option value="castro">Castro Peças</option>
            </select>
          </div>
        </div>

        {editZonas && (
          <div style={{ padding: '6px 16px', background: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 700, textAlign: 'center' }}>
            Modo edição de zonas — arraste o título para mover, o canto para redimensionar. Pressione E E novamente para salvar.
          </div>
        )}
        {loading ? (
          <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>Carregando pátio...</div>
        ) : (
          <>
            {/* Mapa principal */}
            <div ref={mapaRef} style={{ position: 'relative', width: '100%', paddingBottom: '80%', margin: '16px 0' }}>
              {/* Ruas */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 20, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#9CA3AF', fontWeight: 700, letterSpacing: 1 }}>
                R. Hermes Corrêa de Carvalho
              </div>
              <div style={{ position: 'absolute', top: 20, left: 0, bottom: 0, width: 20, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 8, color: '#9CA3AF', fontWeight: 700, letterSpacing: 1 }}>
                Av. São Sebastião (SP-287)
              </div>
              <div style={{ position: 'absolute', top: 20, right: 0, bottom: 0, width: 20, background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', writingMode: 'vertical-rl', fontSize: 8, color: '#9CA3AF', fontWeight: 700, letterSpacing: 1 }}>
                R. Edgar Martinelli
              </div>

              {/* Zones */}
              {renderZone('patio', { left: '2%', top: '4%', width: '44%', height: '94%' })}
              {renderZone('showroom', { left: '47%', top: '34%', width: '40%', height: '64%' })}
              {renderZone('oficina', { left: '47%', top: '4%', width: '51%', height: '29%' })}
              {zonas.oficina2 && renderZone('oficina2', { left: '88%', top: '34%', width: '11%', height: '64%' })}
            </div>

            {/* Ambientes externos */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, padding: '0 16px 24px' }}>
              {['barracao', 'fartura', 'demonstracao'].map(amb => {
                const cfg = AMB_CONFIG[amb]
                const maquinas = data?.ambientes[amb] || []
                return (
                  <div key={amb} style={{ borderRadius: 12, border: `2px solid ${cfg.color}30`, overflow: 'hidden' }}>
                    <div style={{ padding: '10px 16px', background: `${cfg.color}10`, fontSize: 13, fontWeight: 700, color: cfg.color, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      {cfg.label}
                      <span style={{ fontSize: 11, fontWeight: 500, color: '#9CA3AF' }}>({maquinas.length})</span>
                    </div>
                    <div
                      ref={el => { zonesRef.current[amb] = el }}
                      style={{ position: 'relative', minHeight: 120, padding: 8, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}
                    >
                      {maquinas.map(m => (
                        <div
                          key={m.codigo_produto}
                          style={{ cursor: 'pointer', textAlign: 'center', width: 80 }}
                          onClick={() => { setSelecionada(m); setSidebarTab('detalhes') }}
                          onMouseEnter={e => {
                            const r = (e.target as HTMLElement).getBoundingClientRect()
                            setTooltip({ x: r.left + r.width / 2, y: r.top - 8, text: m.descricao })
                          }}
                          onMouseLeave={() => setTooltip(null)}
                        >
                          {m.imagem_url ? (
                            <img src={m.imagem_url} alt={m.descricao} style={{ width: 60, height: 45, objectFit: 'contain' }} draggable={false} />
                          ) : (
                            <Package size={24} color="#D1D5DB" />
                          )}
                          <div style={{ fontSize: 8, color: '#9CA3AF', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            {m.descricao.substring(0, 20)}
                          </div>
                        </div>
                      ))}
                      {maquinas.length === 0 && <div style={{ padding: 20, fontSize: 11, color: '#D1D5DB', width: '100%', textAlign: 'center' }}>Vazio</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Tooltip */}
        {tooltip && (
          <div style={{
            position: 'fixed', left: tooltip.x, top: tooltip.y, transform: 'translate(-50%, -100%)',
            background: '#1F2937', color: '#fff', padding: '6px 12px', borderRadius: 8, fontSize: 11,
            fontWeight: 600, whiteSpace: 'nowrap', zIndex: 999, pointerEvents: 'none',
          }}>
            {tooltip.text}
          </div>
        )}

        {/* Dragging ghost */}
        {dragging && (
          <div style={{
            position: 'fixed', left: dragging.curX - 40, top: dragging.curY - 30,
            opacity: 0.7, zIndex: 9999, pointerEvents: 'none',
          }}>
            {dragging.maq.imagem_url ? (
              <img src={dragging.maq.imagem_url} style={{ width: 80, height: 'auto' }} alt="" />
            ) : (
              <Package size={40} color="#9CA3AF" />
            )}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div style={{
        width: 320, borderLeft: '1px solid var(--portal-border, #e5e5e5)', background: 'var(--portal-bg-card, #fff)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--portal-border, #e5e5e5)' }}>
          {(['inventario', 'detalhes'] as const).map(tab => (
            <button key={tab} onClick={() => setSidebarTab(tab)} style={{
              flex: 1, padding: '12px 0', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              border: 'none', background: sidebarTab === tab ? '#fff' : 'var(--portal-bg, #fafafa)',
              color: sidebarTab === tab ? '#dc2626' : '#9CA3AF',
              borderBottom: sidebarTab === tab ? '2px solid #dc2626' : '2px solid transparent',
            }}>
              {tab === 'inventario' ? 'Inventário' : 'Detalhes'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {sidebarTab === 'inventario' ? (
            <>
              {/* Header */}
              <div style={{ display: 'flex', padding: '8px 14px', fontSize: 9, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid var(--portal-border, #f0f0f0)' }}>
                <span style={{ flex: 1 }}>Família</span>
                <span style={{ width: 40, textAlign: 'center' }}>Qtd</span>
                <span style={{ width: 80, textAlign: 'right' }}>Valor</span>
              </div>
              {familias.map(([nome, prods]) => {
                const valorFam = prods.reduce((s, p) => s + p.valor_estoque, 0)
                const open = famAberta === nome
                return (
                  <div key={nome}>
                    <div
                      onClick={() => setFamAberta(open ? null : nome)}
                      style={{
                        display: 'flex', alignItems: 'center', padding: '10px 14px', cursor: 'pointer',
                        borderBottom: '1px solid var(--portal-border, #f0f0f0)',
                        background: open ? '#FEF2F2' : 'transparent',
                      }}
                    >
                      <ChevronRight size={12} color="#9CA3AF" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: '0.15s', marginRight: 6 }} />
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--portal-text, #1a1a1a)' }}>{nome}</span>
                      <span style={{ width: 40, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#6B7280' }}>{prods.length}</span>
                      <span style={{ width: 80, textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#059669' }}>{fmt(valorFam)}</span>
                    </div>
                    {open && prods.map(p => (
                      <div
                        key={p.codigo_produto}
                        onClick={() => { setSelecionada(p); setSidebarTab('detalhes') }}
                        style={{
                          padding: '8px 14px 8px 32px', cursor: 'pointer', fontSize: 11,
                          borderBottom: '1px solid var(--portal-border, #f8f8f8)',
                          color: selecionada?.codigo_produto === p.codigo_produto ? '#dc2626' : '#6B7280',
                          fontWeight: selecionada?.codigo_produto === p.codigo_produto ? 700 : 400,
                          background: selecionada?.codigo_produto === p.codigo_produto ? '#FEF2F2' : 'transparent',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}
                      >
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.descricao.length > 35 ? p.descricao.substring(0, 35) + '...' : p.descricao}
                        </span>
                        {p.ambiente === 'demonstracao' && (
                          <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 4, background: '#FEF2F2', color: '#DC2626', fontWeight: 700 }}>DEMO</span>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })}
            </>
          ) : selecionada ? (
            <div style={{ padding: 16 }}>
              {selecionada.imagem_url && (
                <img src={selecionada.imagem_url} alt={selecionada.descricao} style={{ width: '100%', maxHeight: 180, objectFit: 'contain', borderRadius: 10, marginBottom: 14, background: '#f9fafb' }} />
              )}
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text, #1a1a1a)', marginBottom: 4 }}>{selecionada.descricao}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 16 }}>{selecionada.codigo} · {selecionada.familia_nome}{selecionada.marca ? ` · ${selecionada.marca}` : ''}</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {[
                  { l: 'Dias em estoque', v: `${selecionada.dias_em_estoque} dias` },
                  { l: 'CMC', v: fmt(selecionada.cmc) },
                  { l: 'Valor estoque', v: fmt(selecionada.valor_estoque) },
                  { l: 'Selic acumulada', v: `${(selecionada.selic_acumulada * 100).toFixed(2)}%` },
                  { l: 'Custo capital', v: fmt(selecionada.custo_capital), c: '#D97706' },
                  { l: 'Capital/mês', v: fmt(selecionada.custo_capital_mes), c: '#DC2626' },
                  { l: 'Custo/dia', v: fmt(selecionada.custo_dia) },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--portal-border, #f0f0f0)' }}>
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>{r.l}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: r.c || 'var(--portal-text, #1a1a1a)' }}>{r.v}</span>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: '#F3F4F6', display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#6B7280' }}>
                <MapPin size={14} /> {AMB_CONFIG[selecionada.ambiente]?.label || selecionada.ambiente}
              </div>

              <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
                <button onClick={() => setMenuImagem(true)} style={{
                  flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)',
                  background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#6B7280',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <ImagePlus size={14} /> Imagem
                </button>
                <button onClick={arquivar} style={{
                  flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #FECACA',
                  background: '#FEF2F2', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#DC2626',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  <Archive size={14} /> Arquivar
                </button>
              </div>
            </div>
          ) : (
            <div style={{ padding: 32, textAlign: 'center', color: '#D1D5DB', fontSize: 12 }}>
              <Eye size={32} color="#E5E7EB" style={{ margin: '0 auto 12px' }} />
              Clique em uma máquina para ver detalhes.
            </div>
          )}
        </div>
      </div>

      {/* Menu de imagem (atalho QQ ou botão Imagem) */}
      {menuImagem && selecionada && (
        <MenuImagem
          item={{ id: selecionada.codigo_produto, descricao: selecionada.descricao, imagem_url: selecionada.imagem_url, img_tamanho: selecionada.img_tamanho }}
          endpointImagem="/api/visual-estoque/imagem"
          chaveId="codigo_produto"
          endpointTamanho="/api/visual-estoque/mover"
          montarBodyTamanho={(t) => ({ codigo_produto: selecionada.codigo_produto, ambiente: selecionada.ambiente, pos_x: selecionada.pos_x, pos_y: selecionada.pos_y, img_tamanho: t })}
          onClose={() => setMenuImagem(false)}
          onImagemAlterada={(url) => patchSelecionada({ imagem_url: url })}
          onTamanhoAlterado={(t) => patchSelecionada({ img_tamanho: t })}
        />
      )}
    </div>
  )
}
