'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { Truck, ImagePlus, List, Map as MapIcon, Download, SearchCheck } from 'lucide-react'
import { useAtalhoDuplo } from '@/lib/visual-estoque/useAtalhoDuplo'
import MenuImagem from '@/components/visual-estoque/MenuImagem'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Cálculos puros (espelham src/lib/visual-estoque/frota.ts; replicados aqui para
// recálculo ao vivo no client sem importar o módulo server-side).
const anoAtual = new Date().getFullYear()
function calcIpva(valor: number, ano: number | null, tipo: string, comb: string): number {
  if (ano && ano > 0 && anoAtual - ano >= 20) return 0
  const t = (tipo || '').toUpperCase()
  let a = 0.04
  if (t.includes('CAMINHAO') || t.includes('CAMINHÃO')) a = 0.015
  if (comb === 'eletrico' || comb === 'hibrido') a = 0.03
  return valor * a
}

interface Veiculo {
  id: number
  placa: string
  descricao: string
  tipo_veiculo: string
  frota_tipo: string
  modelo: string
  ano: number | null
  hodometro: number | null
  ativo: boolean
  combustivel: string
  tem_seguro: boolean
  valor_mercado: number
  data_valor: string | null
  ipva_estimado: number
  seguro_estimado: number
  imagem_url: string
  img_tamanho: number
  ambiente: string
  pos_x: number
  pos_y: number
}

interface FrotaData {
  ambientes: Record<string, Veiculo[]>
  inativos: Veiculo[]
  veiculos: Veiculo[]
  resumo: { totalVeiculos: number; valorFipe: number; totalIpva: number; totalSeguro: number; custoAnual: number; custoOportunidade: number }
}

const AMB: Record<string, { label: string; color: string }> = {
  garagem: { label: 'Garagem', color: '#2563EB' },
  campo: { label: 'Em Campo', color: '#059669' },
  manutencao: { label: 'Manutenção', color: '#D97706' },
  fartura: { label: 'Fartura', color: '#7C3AED' },
  barracao: { label: 'Barracão', color: '#6B7280' },
}

export default function FrotaPage() {
  const { userProfile } = useAuth()
  const { pode, loading: pLoading } = usePermissoes(userProfile?.id)
  const [data, setData] = useState<FrotaData | null>(null)
  const [loading, setLoading] = useState(true)
  const [sel, setSel] = useState<Veiculo | null>(null)
  const [modoLista, setModoLista] = useState(false)
  const [menuImagem, setMenuImagem] = useState(false)
  const [consultando, setConsultando] = useState(false)
  const [dragging, setDragging] = useState<{ v: Veiculo; curX: number; curY: number } | null>(null)
  const zonesRef = useRef<Record<string, HTMLDivElement | null>>({})
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const recarregar = useCallback(() => {
    setLoading(true)
    fetch('/api/visual-estoque/frota')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])
  useEffect(() => { recarregar() }, [recarregar])

  useAtalhoDuplo('q', () => { if (sel) setMenuImagem(true) })

  const todos = data ? [...Object.values(data.ambientes).flat(), ...data.inativos] : []

  // Auto-save debounced dos campos editáveis do veículo selecionado.
  const editarCampo = useCallback((patch: Partial<Veiculo>) => {
    setSel(prev => {
      if (!prev) return prev
      const novo = { ...prev, ...patch }
      novo.ipva_estimado = calcIpva(novo.valor_mercado, novo.ano, novo.tipo_veiculo, novo.combustivel)
      novo.seguro_estimado = novo.tem_seguro ? novo.valor_mercado * 0.05 : 0
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        fetch('/api/visual-estoque/frota/dados', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id_placa: novo.id, modelo: novo.modelo, ano: novo.ano, hodometro: novo.hodometro,
            valor_mercado: novo.valor_mercado, data_valor: novo.data_valor, ativo: novo.ativo,
            frota_tipo: novo.frota_tipo, combustivel: novo.combustivel, tem_seguro: novo.tem_seguro,
          }),
        }).then(() => recarregar())
      }, 800)
      return novo
    })
  }, [recarregar])

  const handleDragStart = useCallback((e: React.MouseEvent, v: Veiculo) => {
    e.preventDefault()
    setDragging({ v, curX: e.clientX, curY: e.clientY })
    const onMove = (ev: MouseEvent) => setDragging(prev => prev ? { ...prev, curX: ev.clientX, curY: ev.clientY } : null)
    const onUp = (ev: MouseEvent) => {
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
      let target: string | null = null
      for (const [amb, el] of Object.entries(zonesRef.current)) {
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) { target = amb; break }
      }
      if (target) {
        const el = zonesRef.current[target]!
        const r = el.getBoundingClientRect()
        const posX = Math.max(0, Math.min(92, ((ev.clientX - r.left) / r.width) * 100))
        const posY = Math.max(0, Math.min(88, ((ev.clientY - r.top) / r.height) * 100))
        fetch('/api/visual-estoque/frota/mover', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_placa: v.id, ambiente: target, pos_x: posX, pos_y: posY }),
        })
        setData(prev => {
          if (!prev) return prev
          const amb = { ...prev.ambientes }
          for (const k of Object.keys(amb)) amb[k] = amb[k].filter(x => x.id !== v.id)
          if (!amb[target!]) amb[target!] = []
          amb[target!] = [...amb[target!], { ...v, ambiente: target!, pos_x: posX, pos_y: posY }]
          return { ...prev, ambientes: amb }
        })
      }
      setDragging(null)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  async function consultarPlaca() {
    if (!sel) return
    setConsultando(true)
    try {
      const r = await fetch('/api/visual-estoque/frota/consultar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_placa: sel.id, placa: sel.placa || sel.descricao }),
      })
      const d = await r.json()
      if (!d.ok) alert(d.mensagem || 'Não foi possível consultar a placa.')
      else recarregar()
    } finally { setConsultando(false) }
  }

  function exportarCSV() {
    const head = ['Placa', 'Tipo', 'Modelo', 'Ano', 'Hodômetro', 'Combustível', 'Ambiente', 'Seguro', 'Status', 'Valor FIPE', 'IPVA/ano']
    const linhas = todos.map(v => [
      v.descricao, v.tipo_veiculo, v.modelo, v.ano ?? '', v.hodometro ?? '', v.combustivel,
      AMB[v.ambiente]?.label || v.ambiente, v.tem_seguro ? 'Sim' : 'Não', v.ativo ? 'Ativo' : 'Inativo',
      v.valor_mercado, v.ipva_estimado.toFixed(2),
    ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(';'))
    const csv = '﻿' + [head.join(';'), ...linhas].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'frota.csv'; a.click()
  }

  if (!pLoading && userProfile && !pode('consulta-estoque', 'frota')) return <SemPermissao />

  const renderZone = (ambiente: string, style: React.CSSProperties) => {
    const lista = data?.ambientes[ambiente] || []
    const cfg = AMB[ambiente]
    return (
      <div ref={el => { zonesRef.current[ambiente] = el }} style={{ position: 'absolute', ...style, borderRadius: 8, border: `2px dashed ${cfg.color}40`, background: `${cfg.color}08`, overflow: 'visible' }}>
        <div style={{ position: 'absolute', top: 4, left: 8, fontSize: 9, fontWeight: 800, color: `${cfg.color}90`, textTransform: 'uppercase', letterSpacing: 1 }}>{cfg.label}</div>
        {lista.map(v => (
          <div key={v.id} style={{ position: 'absolute', left: `${v.pos_x}%`, top: `${v.pos_y}%`, cursor: 'grab', zIndex: sel?.id === v.id ? 10 : 1 }}
            onMouseDown={e => handleDragStart(e, v)} onClick={() => setSel(v)}>
            {v.imagem_url ? (
              <img src={v.imagem_url} alt={v.descricao} draggable={false} style={{ width: v.img_tamanho || 80, height: 'auto', pointerEvents: 'none', filter: sel?.id === v.id ? 'drop-shadow(0 0 6px #dc2626)' : 'none' }} />
            ) : (
              <div style={{ width: 60, height: 44, borderRadius: 6, background: '#E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Truck size={20} color="#9CA3AF" /></div>
            )}
            <div style={{ fontSize: 8, color: '#6B7280', textAlign: 'center', maxWidth: 80, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{v.descricao}</div>
          </div>
        ))}
      </div>
    )
  }

  const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 12, marginTop: 4 }
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 130px)', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {/* HUD */}
        <div style={{ position: 'sticky', top: 0, zIndex: 20, display: 'flex', alignItems: 'center', padding: '8px 16px', background: 'rgba(255,255,255,0.95)', borderBottom: '1px solid var(--portal-border, #e5e5e5)', backdropFilter: 'blur(8px)', fontSize: 12, flexWrap: 'wrap', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px' }}>
            <span style={{ fontWeight: 800, fontSize: 18 }}>{data?.resumo.totalVeiculos || 0}</span>
            <span style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600 }}>Veículos</span>
          </div>
          <div style={{ width: 1, height: 24, background: '#E5E7EB' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}><span style={{ fontWeight: 800, fontSize: 14, color: '#059669' }}>{fmt(data?.resumo.valorFipe || 0)}</span><span style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600 }}>FIPE</span></div>
          <div style={{ width: 1, height: 24, background: '#E5E7EB' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}><span style={{ fontWeight: 800, fontSize: 14, color: '#D97706' }}>{fmt(data?.resumo.totalIpva || 0)}</span><span style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600 }}>IPVA/ano</span></div>
          <div style={{ width: 1, height: 24, background: '#E5E7EB' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }}><span style={{ fontWeight: 800, fontSize: 14, color: '#7C3AED' }}>{fmt(data?.resumo.totalSeguro || 0)}</span><span style={{ color: '#9CA3AF', fontSize: 10, fontWeight: 600 }}>Seguro/ano</span></div>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={() => setModoLista(m => !m)} style={btnHud}>{modoLista ? <><MapIcon size={13} /> Mapa</> : <><List size={13} /> Lista</>}</button>
            <button onClick={exportarCSV} style={btnHud}><Download size={13} /> CSV</button>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 80, textAlign: 'center', color: '#9CA3AF' }}>Carregando frota...</div>
        ) : modoLista ? (
          <div style={{ padding: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--portal-bg, #fafafa)' }}>
                <tr>{['Placa', 'Tipo', 'Modelo', 'Ano', 'Hodômetro', 'Ambiente', 'FIPE', 'IPVA'].map(h => <th key={h} style={{ padding: '8px 10px', fontSize: 10, fontWeight: 800, color: '#9CA3AF', textTransform: 'uppercase', textAlign: 'left' }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {todos.map(v => (
                  <tr key={v.id} onClick={() => setSel(v)} style={{ borderBottom: '1px solid var(--portal-border, #f0f0f0)', cursor: 'pointer', background: sel?.id === v.id ? '#FEF2F2' : 'transparent' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 600 }}>{v.descricao}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{v.tipo_veiculo}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{v.modelo || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{v.ano || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{v.hodometro?.toLocaleString('pt-BR') || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{AMB[v.ambiente]?.label || v.ambiente}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{fmt(v.valor_mercado)}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: '#D97706' }}>{fmt(v.ipva_estimado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ position: 'relative', width: '100%', paddingBottom: '70%', margin: '16px 0' }}>
            {renderZone('garagem', { left: '1%', top: '2%', width: '58%', height: '96%' })}
            {renderZone('campo', { left: '61%', top: '2%', width: '38%', height: '46%' })}
            {renderZone('manutencao', { left: '61%', top: '52%', width: '38%', height: '46%' })}
          </div>
        )}

        {!modoLista && !loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, padding: '0 16px 24px' }}>
            {['fartura', 'barracao'].map(amb => {
              const cfg = AMB[amb]; const lista = data?.ambientes[amb] || []
              return (
                <div key={amb} style={{ borderRadius: 12, border: `2px solid ${cfg.color}30`, overflow: 'hidden' }}>
                  <div style={{ padding: '10px 16px', background: `${cfg.color}10`, fontSize: 13, fontWeight: 700, color: cfg.color, display: 'flex', justifyContent: 'space-between' }}>{cfg.label}<span style={{ fontSize: 11, color: '#9CA3AF' }}>({lista.length})</span></div>
                  <div ref={el => { zonesRef.current[amb] = el }} style={{ position: 'relative', minHeight: 110, padding: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {lista.map(v => (
                      <div key={v.id} style={{ cursor: 'pointer', width: 80, textAlign: 'center' }} onClick={() => setSel(v)}>
                        {v.imagem_url ? <img src={v.imagem_url} alt="" style={{ width: 60, height: 44, objectFit: 'contain' }} draggable={false} /> : <Truck size={22} color="#D1D5DB" />}
                        <div style={{ fontSize: 8, color: '#9CA3AF', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{v.descricao}</div>
                      </div>
                    ))}
                    {lista.length === 0 && <div style={{ padding: 16, fontSize: 11, color: '#D1D5DB', width: '100%', textAlign: 'center' }}>Vazio</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {dragging && (
          <div style={{ position: 'fixed', left: dragging.curX - 40, top: dragging.curY - 22, opacity: 0.7, zIndex: 9999, pointerEvents: 'none' }}>
            {dragging.v.imagem_url ? <img src={dragging.v.imagem_url} style={{ width: 80, height: 'auto' }} alt="" /> : <Truck size={36} color="#9CA3AF" />}
          </div>
        )}
      </div>

      {/* Sidebar */}
      <div style={{ width: 320, borderLeft: '1px solid var(--portal-border, #e5e5e5)', background: 'var(--portal-bg-card, #fff)', overflow: 'auto' }}>
        {sel ? (
          <div style={{ padding: 16 }}>
            {sel.imagem_url && <img src={sel.imagem_url} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 10, marginBottom: 12, background: '#f9fafb' }} />}
            <div style={{ fontSize: 15, fontWeight: 800 }}>{sel.descricao}</div>
            <div style={{ fontSize: 11, color: '#9CA3AF', marginBottom: 14 }}>{sel.tipo_veiculo} · {AMB[sel.ambiente]?.label}</div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button onClick={() => setMenuImagem(true)} style={{ ...btnSide, flex: 1 }}><ImagePlus size={14} /> Imagem</button>
              <button onClick={consultarPlaca} disabled={consultando} style={{ ...btnSide, flex: 1 }}><SearchCheck size={14} /> {consultando ? '...' : 'Placa'}</button>
            </div>

            <label style={lbl}>Tipo / Categoria
              <input style={inp} value={sel.frota_tipo} onChange={e => editarCampo({ frota_tipo: e.target.value })} />
            </label>
            <label style={{ ...lbl, display: 'block', marginTop: 10 }}>Modelo
              <input style={inp} value={sel.modelo} onChange={e => editarCampo({ modelo: e.target.value })} />
            </label>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <label style={{ ...lbl, flex: 1 }}>Ano<input style={inp} type="number" value={sel.ano ?? ''} onChange={e => editarCampo({ ano: e.target.value ? parseInt(e.target.value) : null })} /></label>
              <label style={{ ...lbl, flex: 1 }}>Hodômetro<input style={inp} type="number" value={sel.hodometro ?? ''} onChange={e => editarCampo({ hodometro: e.target.value ? parseInt(e.target.value) : null })} /></label>
            </div>
            <label style={{ ...lbl, display: 'block', marginTop: 10 }}>Combustível
              <select style={inp} value={sel.combustivel} onChange={e => editarCampo({ combustivel: e.target.value })}>
                {['flex', 'gasolina', 'diesel', 'eletrico', 'hibrido', 'etanol'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={{ ...lbl, display: 'block', marginTop: 10 }}>Valor FIPE
              <input style={inp} type="number" value={sel.valor_mercado} onChange={e => editarCampo({ valor_mercado: Number(e.target.value) })} />
            </label>

            <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={sel.tem_seguro} onChange={e => editarCampo({ tem_seguro: e.target.checked })} /> Seguro</label>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}><input type="checkbox" checked={sel.ativo} onChange={e => editarCampo({ ativo: e.target.checked })} /> Ativo</label>
            </div>

            <div style={{ marginTop: 16, borderTop: '1px solid var(--portal-border, #f0f0f0)', paddingTop: 12 }}>
              {[{ l: 'IPVA estimado', v: fmt(sel.ipva_estimado), c: '#D97706' }, { l: 'Seguro estimado', v: fmt(sel.seguro_estimado), c: '#7C3AED' }].map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}><span style={{ fontSize: 11, color: '#9CA3AF' }}>{r.l}</span><span style={{ fontSize: 12, fontWeight: 700, color: r.c }}>{r.v}</span></div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ padding: 32, textAlign: 'center', color: '#D1D5DB', fontSize: 12 }}>
            <Truck size={32} color="#E5E7EB" style={{ margin: '0 auto 12px' }} />
            Clique em um veículo para ver e editar os detalhes.
          </div>
        )}
      </div>

      {menuImagem && sel && (
        <MenuImagem
          item={{ id: sel.id, descricao: sel.descricao, imagem_url: sel.imagem_url, img_tamanho: sel.img_tamanho }}
          endpointImagem="/api/visual-estoque/frota/imagem"
          chaveId="id_placa"
          endpointTamanho="/api/visual-estoque/frota/mover"
          montarBodyTamanho={(t) => ({ id_placa: sel.id, ambiente: sel.ambiente, pos_x: sel.pos_x, pos_y: sel.pos_y, img_tamanho: t })}
          onClose={() => setMenuImagem(false)}
          onImagemAlterada={(url) => setSel(prev => prev ? { ...prev, imagem_url: url } : prev)}
          onTamanhoAlterado={(t) => setSel(prev => prev ? { ...prev, img_tamanho: t } : prev)}
        />
      )}
    </div>
  )
}

const btnHud: React.CSSProperties = { padding: '6px 12px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 11, fontWeight: 600, background: '#fff', cursor: 'pointer', color: '#6B7280', display: 'flex', alignItems: 'center', gap: 6 }
const btnSide: React.CSSProperties = { padding: '9px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }
