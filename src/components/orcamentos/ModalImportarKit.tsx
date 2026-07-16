'use client'

import { useState, useEffect, useMemo } from 'react'
import { Package, Search } from 'lucide-react'

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

// Número de horas de "50H", "300 H"… (pra ordenar do menor pro maior; sem número vai pro fim).
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

  useEffect(() => {
    if (!open) return
    setBusca(''); setModeloSel(null); setImportando(null)
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

  // Modelos agrupados por Tratores / Quadriciclos, filtrados pela busca.
  const grupos = useMemo(() => {
    const map = new Map<string, Kit[]>()
    for (const k of kits) {
      const nome = (k.Trator || 'Sem modelo').trim()
      if (!map.has(nome)) map.set(nome, [])
      map.get(nome)!.push(k)
    }
    const t = busca.trim().toLowerCase()
    const tratores: { nome: string; kits: Kit[] }[] = []
    const quads: { nome: string; kits: Kit[] }[] = []
    for (const [nome, ks] of map) {
      if (t && !nome.toLowerCase().includes(t)) continue
      const ehQuad = ks.every((k) => k.tipo === 'quadriciclo')
      ;(ehQuad ? quads : tratores).push({ nome, kits: ks })
    }
    const ord = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt', { numeric: true })
    return { tratores: tratores.sort(ord), quads: quads.sort(ord) }
  }, [kits, busca])

  // Pré-computa os kits ordenados por modelo (uma vez) — assim passar o mouse não refiltra
  // o array inteiro a cada modelo, o que deixava a lista travada.
  const kitsPorModelo = useMemo(() => {
    const m = new Map<string, Kit[]>()
    for (const k of kits) {
      const nome = (k.Trator || '').trim()
      if (!m.has(nome)) m.set(nome, [])
      m.get(nome)!.push(k)
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => horasNum(a.Horas) - horasNum(b.Horas) || String(a.Horas).localeCompare(String(b.Horas), 'pt', { numeric: true }))
    }
    return m
  }, [kits])
  const kitsDoModelo = modeloSel ? (kitsPorModelo.get(modeloSel) || []) : []

  async function importarKit(kit: Kit) {
    setImportando(kit.id)
    try {
      // Resolve por CÓDIGO EXATO no endpoint de revisão (trator+horas): traz descrição e
      // preço certos. A busca por "termo" (ilike) falhava no quadriciclo e vinha preço 0.
      let lista: any[] = []
      try {
        const res = await fetch(`/api/ppv/revisoes?trator=${encodeURIComponent(kit.Trator)}&horas=${encodeURIComponent(kit.Horas)}`)
        if (res.ok) lista = await res.json()
      } catch { /* tenta o fallback abaixo */ }
      let produtos: ProdutoResolvido[] = (Array.isArray(lista) ? lista : []).map((p: any) => ({
        codigo: String(p.codigo), descricao: p.descricao || `Produto ${p.codigo}`, quantidade: p.quantidade || 1, preco: p.preco || 0,
      }))
      // Fallback: se o endpoint não achou o kit, usa os códigos que já temos (preço via busca).
      if (produtos.length === 0) {
        for (const p of kit.produtos) {
          if (!p.codigo) continue
          let descricao = `Produto ${p.codigo}`, preco = 0
          try {
            const arr = await (await fetch(`/api/ppv/produtos?termo=${encodeURIComponent(p.codigo)}`)).json()
            const match = Array.isArray(arr) ? arr.find((r: any) => r.codigo === p.codigo) : null
            if (match) { descricao = match.descricao || descricao; preco = match.preco || 0 }
          } catch { /* mantém fallback */ }
          produtos.push({ codigo: p.codigo, descricao, quantidade: p.quantidade || 1, preco })
        }
      }
      if (produtos.length === 0) { alert('Kit sem produtos'); setImportando(null); return }
      onImportar(produtos, horasNum(kit.Horas) === Infinity ? 0 : horasNum(kit.Horas))
      onClose()
    } catch (e) {
      alert('Erro ao importar kit: ' + (e instanceof Error ? e.message : String(e)))
    }
    setImportando(null)
  }

  if (!open) return null

  const secao = (titulo: string, lista: { nome: string; kits: Kit[] }[], cor: string) => (
    lista.length > 0 && (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10.5, fontWeight: 800, color: cor, textTransform: 'uppercase', letterSpacing: 0.6, padding: '2px 6px 6px' }}>{titulo}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {lista.map((m) => {
            const ativo = modeloSel === m.nome
            return (
              <div key={m.nome}
                onMouseEnter={() => setModeloSel((cur) => (cur === m.nome ? cur : m.nome))}
                onClick={() => setModeloSel(m.nome)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
                  background: ativo ? '#fef2f2' : 'transparent', border: ativo ? '1px solid #fecaca' : '1px solid transparent', transition: '.1s' }}>
                <i className="fas fa-tractor" style={{ fontSize: 13, color: ativo ? '#dc2626' : '#a3a3a3' }} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#1a1a1a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.nome}</span>
                <span style={{ fontSize: 11, color: '#a3a3a3' }}>{m.kits.length}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  )

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ width: 760, maxHeight: 600, display: 'flex', flexDirection: 'column', borderRadius: 16, background: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden', fontFamily: "'Poppins', sans-serif" }}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #dc2626, #b91c1c)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Package size={17} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: 15.5, fontWeight: 800, color: '#1a1a1a', margin: 0 }}>Importar Kit de Revisão</h2>
              <p style={{ fontSize: 11, color: '#a3a3a3', margin: 0 }}>Passe o mouse no modelo e escolha a hora</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 24, color: '#a3a3a3', cursor: 'pointer', lineHeight: 1 }}>&times;</button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          {/* ESQUERDA: modelos */}
          <div style={{ width: 300, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #f5f5f5' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
                <input type="text" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar modelo..." autoFocus
                  style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 9, border: '1px solid #e5e5e5', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: "'Poppins', sans-serif" }} />
              </div>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '10px 10px 16px' }}>
              {loading ? (
                <div style={{ padding: 30, textAlign: 'center', fontSize: 13, color: '#a3a3a3' }}>Carregando...</div>
              ) : grupos.tratores.length === 0 && grupos.quads.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', fontSize: 13, color: '#a3a3a3' }}>Nenhum modelo.</div>
              ) : (
                <>
                  {secao('Tratores', grupos.tratores, '#dc2626')}
                  {secao('Quadriciclos', grupos.quads, '#0891b2')}
                </>
              )}
            </div>
          </div>

          {/* DIREITA: horas do modelo em foco */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', background: '#fbfbfb' }}>
            {!modeloSel ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#cbd5e1', textAlign: 'center', gap: 10 }}>
                <i className="fas fa-hand-pointer" style={{ fontSize: 34, opacity: 0.5 }} />
                <span style={{ fontSize: 13, color: '#a3a3a3' }}>Passe o mouse num modelo à esquerda<br />para ver as horas</span>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', marginBottom: 4 }}>{modeloSel}</div>
                <div style={{ fontSize: 11, color: '#a3a3a3', marginBottom: 12 }}>Escolha a hora para importar</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {kitsDoModelo.map((kit) => {
                    const b = badge(kit.tipo)
                    const carregando = importando === kit.id
                    return (
                      <button key={kit.id} onClick={() => importarKit(kit)} disabled={importando !== null}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, border: '1px solid #eee', background: '#fff', cursor: importando !== null ? 'wait' : 'pointer', textAlign: 'left', width: '100%', opacity: importando !== null && !carregando ? 0.5 : 1, transition: '.12s' }}
                        onMouseEnter={e => { if (importando === null) { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fecaca' } }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#eee' }}>
                        <i className={kit.tipo === 'quadriciclo' ? 'fas fa-motorcycle' : kit.tipo === 'manutencao' ? 'fas fa-wrench' : 'fas fa-clock'} style={{ fontSize: 14, color: b.fg }} />
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: '#1a1a1a' }}>{kit.Horas}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: b.bg, color: b.fg }}>{b.label}</span>
                        <span style={{ fontSize: 11.5, color: '#a3a3a3' }}>{kit.produtos.length} peças</span>
                        {carregando
                          ? <i className="fas fa-spinner fa-spin" style={{ fontSize: 13, color: '#dc2626' }} />
                          : <i className="fas fa-download" style={{ fontSize: 13, color: '#dc2626' }} />}
                      </button>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
