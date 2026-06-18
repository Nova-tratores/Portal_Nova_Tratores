'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Car, Search } from 'lucide-react'

interface Adesao { adesao_id: number; placa: string; descricao: string }
interface Pessoa { id: string; nome: string; tipo: 'portal' | 'vendedor' }
interface Classif { categoria: string; ativo: boolean; pessoa_id: string | null; pessoa_nome: string; vinculo_tipo: string }

const norm = (p: string) => (p || '').replace(/[-\s]/g, '').toUpperCase()

export default function VincularCarroModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [adesoes, setAdesoes] = useState<Adesao[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [classMap, setClassMap] = useState<Record<string, Classif>>({})
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [salvandoPlaca, setSalvandoPlaca] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/supervisor-vendas/veiculos?acao=adesoes').then(r => r.ok ? r.json() : []),
      fetch('/api/supervisor-vendas/carros?todos=1').then(r => r.ok ? r.json() : []),
      fetch('/api/pos/lousa?modo=usuarios').then(r => r.ok ? r.json() : []),
      fetch('/api/supervisor-vendas?acao=vendedores').then(r => r.ok ? r.json() : []),
    ]).then(([ad, cl, us, ve]) => {
      setAdesoes(Array.isArray(ad) ? ad : [])
      const map: Record<string, Classif> = {}
      for (const c of (Array.isArray(cl) ? cl : [])) {
        map[norm(c.placa)] = { categoria: c.categoria || 'comercial', ativo: c.ativo !== false, pessoa_id: c.pessoa_id || null, pessoa_nome: c.pessoa_nome || '', vinculo_tipo: c.vinculo_tipo || 'portal' }
      }
      setClassMap(map)
      const ps: Pessoa[] = [
        ...(Array.isArray(us) ? us : []).map((u: any) => ({ id: String(u.id), nome: u.nome, tipo: 'portal' as const })),
        ...(Array.isArray(ve) ? ve : []).map((v: any) => ({ id: String(v.id), nome: v.nome, tipo: 'vendedor' as const })),
      ]
      setPessoas(ps)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const salvar = async (a: Adesao, partial: Partial<Classif>) => {
    const key = norm(a.placa)
    const atual = classMap[key] || { categoria: 'comercial', ativo: true, pessoa_id: null, pessoa_nome: '', vinculo_tipo: 'portal' }
    const novo = { ...atual, ...partial }
    setClassMap(prev => ({ ...prev, [key]: novo }))
    setSalvandoPlaca(a.placa)
    try {
      await fetch('/api/supervisor-vendas/carros', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placa: a.placa, descricao: a.descricao, adesao_id: a.adesao_id,
          categoria: novo.categoria, ativo: novo.ativo,
          pessoa_id: novo.pessoa_id, pessoa_nome: novo.pessoa_nome, vinculo_tipo: novo.vinculo_tipo,
        }),
      })
      onSaved()
    } catch { /* */ }
    setSalvandoPlaca(null)
  }

  const lista = busca.trim()
    ? adesoes.filter(a => (a.placa + ' ' + a.descricao).toLowerCase().includes(busca.toLowerCase()))
    : adesoes

  const catBtn = (active: boolean, cor: string): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700, cursor: 'pointer',
    border: active ? `1.5px solid ${cor}` : '1px solid var(--portal-border, #e5e5e5)',
    background: active ? cor : 'transparent', color: active ? '#fff' : 'var(--portal-text-secondary, #888)',
  })

  if (typeof document === 'undefined') return null

  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--portal-bg-card, #fff)', borderRadius: 18, width: 620, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '22px 24px', borderBottom: '1px solid var(--portal-border, #eee)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #dc2626, #991b1b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Car size={20} color="#fff" /></div>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--portal-text, #1a1a1a)', margin: 0 }}>Carros</h2>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>Classifique e escolha quais aparecem no mapa</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'var(--portal-bg-secondary, #f5f5f5)', border: 'none', borderRadius: 9, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--portal-border, #eee)' }}>
          <div style={{ position: 'relative' }}>
            <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar placa ou modelo..." style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 13, boxSizing: 'border-box', background: 'var(--portal-bg-card, #fff)', color: 'var(--portal-text, #1a1a1a)' }} />
          </div>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando carros e pessoas...</div>
          ) : lista.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Nenhum carro</div>
          ) : lista.map(a => {
            const c = classMap[norm(a.placa)]
            const cat = c?.categoria || ''
            const isComercial = cat === 'comercial'
            const pessoaVal = c?.pessoa_id ? `${c.vinculo_tipo}:${c.pessoa_id}` : ''
            return (
              <div key={a.adesao_id} style={{ padding: '11px 24px', borderBottom: '1px solid var(--portal-border, #f1f5f9)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 150px', minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)' }}>{a.placa}</div>
                  {a.descricao && <div style={{ fontSize: 11, color: '#94a3b8' }}>{a.descricao}</div>}
                </div>

                <div style={{ display: 'flex', gap: 5 }}>
                  <button onClick={() => salvar(a, { categoria: 'comercial' })} style={catBtn(cat === 'comercial', '#dc2626')}>Comercial</button>
                  <button onClick={() => salvar(a, { categoria: 'oficina' })} style={catBtn(cat === 'oficina', '#0d9488')}>Oficina</button>
                </div>

                {isComercial && (
                  <>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary, #666)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={c?.ativo !== false} onChange={e => salvar(a, { ativo: e.target.checked })} style={{ width: 15, height: 15, accentColor: '#dc2626' }} />
                      Exibir
                    </label>
                    <select
                      value={pessoaVal}
                      onChange={e => {
                        const v = e.target.value
                        if (!v) { salvar(a, { pessoa_id: null, pessoa_nome: '' }); return }
                        const [tipo, id] = v.split(':')
                        const p = pessoas.find(x => x.tipo === tipo && x.id === id)
                        salvar(a, { pessoa_id: id, pessoa_nome: p?.nome || '', vinculo_tipo: tipo })
                      }}
                      style={{ flex: '0 0 150px', padding: '6px 8px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 12, background: 'var(--portal-bg-card, #fff)', color: 'var(--portal-text, #1a1a1a)' }}
                    >
                      <option value="">Sem dono</option>
                      {pessoas.map(p => <option key={`${p.tipo}:${p.id}`} value={`${p.tipo}:${p.id}`}>{p.nome}</option>)}
                    </select>
                  </>
                )}
                {salvandoPlaca === a.placa && <span style={{ fontSize: 10, color: '#94a3b8' }}>salvando…</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}
