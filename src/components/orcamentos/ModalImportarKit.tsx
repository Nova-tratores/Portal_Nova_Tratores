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
  onImportar: (produtos: ProdutoResolvido[], horas: number, rotulo?: string) => void
}

// Número de horas de "50H", "300 H"… (pra ordenar do menor pro maior; sem número vai pro fim).
function horasNum(h: string): number {
  const m = String(h || '').match(/\d+/)
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY
}

const badge = (tipo?: string) => ({
  label: tipo === 'manutencao' ? 'Manutenção' : tipo === 'quadriciclo' ? 'Quadriciclo' : 'Revisão',
  bg: tipo === 'manutencao' ? '#f3e8ff' : tipo === 'quadriciclo' ? '#ECFEFF' : '#fff3e6',
  fg: tipo === 'manutencao' ? '#7c3aed' : tipo === 'quadriciclo' ? '#0891b2' : '#e8730c',
})

export default function ModalImportarKit({ open, onClose, onImportar }: Props) {
  const [kits, setKits] = useState<Kit[]>([])
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [modeloSel, setModeloSel] = useState<string | null>(null)
  const [importando, setImportando] = useState<number | null>(null)
  // Revisão antes de importar: escolhe quais produtos do kit entram.
  const [preview, setPreview] = useState<{ rotulo: string; horas: number; produtos: ProdutoResolvido[] } | null>(null)
  const [sel, setSel] = useState<Record<string, boolean>>({})
  const [modoKit, setModoKit] = useState<null | 'escolher'>(null) // null = perguntar (inteiro/escolher)

  useEffect(() => {
    if (!open) return
    setBusca(''); setModeloSel(null); setImportando(null); setPreview(null); setSel({}); setModoKit(null)
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
      const rotulo = `${kit.Trator} · ${kit.Horas}`.trim()
      // Em vez de importar direto, abre a REVISÃO (todos marcados; dá pra desmarcar).
      setPreview({ rotulo, horas: horasNum(kit.Horas) === Infinity ? 0 : horasNum(kit.Horas), produtos })
      setSel(Object.fromEntries(produtos.map((p) => [p.codigo, true])))
      setModoKit(null) // volta a perguntar "inteiro ou escolher"
    } catch (e) {
      alert('Erro ao carregar kit: ' + (e instanceof Error ? e.message : String(e)))
    }
    setImportando(null)
  }

  function confirmarImport() {
    if (!preview) return
    const escolhidos = preview.produtos.filter((p) => sel[p.codigo])
    if (escolhidos.length === 0) { alert('Selecione ao menos um produto.'); return }
    onImportar(escolhidos, preview.horas, preview.rotulo)
    onClose()
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
                  background: ativo ? '#fff3e6' : 'transparent', border: ativo ? '1px solid #f5c99a' : '1px solid transparent', transition: '.1s' }}>
                <i className="fas fa-tractor" style={{ fontSize: 13, color: ativo ? '#e8730c' : '#a3a3a3' }} />
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
            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #e8730c, #c2570a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
                  {secao('Tratores', grupos.tratores, '#e8730c')}
                  {secao('Quadriciclos', grupos.quads, '#0891b2')}
                </>
              )}
            </div>
          </div>

          {/* DIREITA: horas do modelo em foco */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', background: '#fbfbfb' }}>
            {preview ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <button onClick={() => { if (modoKit === 'escolher') setModoKit(null); else setPreview(null) }} style={{ background: 'none', border: '1px solid #e5e5e5', borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer', color: '#64748b' }}>← Voltar</button>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a' }}>{preview.rotulo}</div>
                    <div style={{ fontSize: 11, color: '#a3a3a3' }}>{modoKit === 'escolher' ? 'Marque os produtos que quer importar' : `${preview.produtos.length} produtos neste kit`}</div>
                  </div>
                </div>

                {modoKit === null ? (
                  /* Escolha: kit inteiro OU escolher produtos */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 2 }}>Como quer importar este kit?</div>
                    <button onClick={() => { onImportar(preview.produtos, preview.horas, preview.rotulo); onClose() }}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, border: '1px solid #f5c99a', background: '#fff7ef', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ width: 40, height: 40, borderRadius: 8, background: '#e8730c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className="fas fa-layer-group" /></span>
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: '#9a3412' }}>Kit inteiro</span>
                        <span style={{ display: 'block', fontSize: 12, color: '#b45309' }}>Adiciona todos os {preview.produtos.length} produtos</span>
                      </span>
                    </button>
                    <button onClick={() => setModoKit('escolher')}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ width: 40, height: 40, borderRadius: 8, background: '#334155', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><i className="fas fa-hand-pointer" /></span>
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: '#1a1a1a' }}>Escolher produtos</span>
                        <span style={{ display: 'block', fontSize: 12, color: '#a3a3a3' }}>Selecione só o(s) que quiser (ex.: um produto)</span>
                      </span>
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 14, marginBottom: 8, fontSize: 12 }}>
                      <button onClick={() => setSel(Object.fromEntries(preview.produtos.map((p) => [p.codigo, true])))} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}>Marcar todos</button>
                      <button onClick={() => setSel({})} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>Desmarcar todos</button>
                    </div>
                    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {preview.produtos.map((p) => {
                        const on = !!sel[p.codigo]
                        // divs + larguras explícitas + cores #111111/#8a8a8a:
                        // imunes às regras globais do POS/modo escuro que
                        // espremiam os spans numa coluninha vertical
                        return (
                          <label key={p.codigo} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 9, border: `1px solid ${on ? '#f5c99a' : '#eee'}`, background: on ? '#fff' : '#fafafa', cursor: 'pointer' }}>
                            <input type="checkbox" checked={on} style={{ flexShrink: 0, width: 16, height: 16 }} onChange={(e) => setSel((s) => ({ ...s, [p.codigo]: e.target.checked }))} />
                            <div style={{ flex: '1 1 auto', minWidth: 0, overflow: 'hidden', textAlign: 'left' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: '#111111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.descricao || p.codigo}</div>
                              <div style={{ fontSize: 11, color: '#8a8a8a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.codigo} · {p.quantidade}x · R$ {p.preco.toFixed(2)}</div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 12, borderTop: '1px solid #f0f0f0', marginTop: 10 }}>
                      <button onClick={confirmarImport} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 9, border: 'none', background: '#e8730c', color: '#fff', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>
                        <i className="fas fa-download" /> Importar ({preview.produtos.filter((p) => sel[p.codigo]).length})
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : !modeloSel ? (
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
                        onMouseEnter={e => { if (importando === null) { e.currentTarget.style.background = '#fff3e6'; e.currentTarget.style.borderColor = '#f5c99a' } }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#eee' }}>
                        <i className={kit.tipo === 'quadriciclo' ? 'fas fa-motorcycle' : kit.tipo === 'manutencao' ? 'fas fa-wrench' : 'fas fa-clock'} style={{ fontSize: 14, color: b.fg }} />
                        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: '#1a1a1a' }}>{kit.Horas}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: b.bg, color: b.fg }}>{b.label}</span>
                        <span style={{ fontSize: 11.5, color: '#a3a3a3' }}>{kit.produtos.length} peças</span>
                        {carregando
                          ? <i className="fas fa-spinner fa-spin" style={{ fontSize: 13, color: '#e8730c' }} />
                          : <i className="fas fa-download" style={{ fontSize: 13, color: '#e8730c' }} />}
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
