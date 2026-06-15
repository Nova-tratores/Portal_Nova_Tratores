'use client'
import { useState, useEffect } from 'react'
import { X, Car, Search } from 'lucide-react'

interface Adesao { adesao_id: number; placa: string; descricao: string }
interface Pessoa { id: string; nome: string }

export default function VincularCarroModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [adesoes, setAdesoes] = useState<Adesao[]>([])
  const [portais, setPortais] = useState<Pessoa[]>([])
  const [vendedores, setVendedores] = useState<Pessoa[]>([])
  const [loading, setLoading] = useState(true)

  const [carro, setCarro] = useState<Adesao | null>(null)
  const [buscaCarro, setBuscaCarro] = useState('')
  const [tipo, setTipo] = useState<'portal' | 'vendedor'>('portal')
  const [pessoaId, setPessoaId] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/supervisor-vendas/veiculos?acao=adesoes').then(r => r.ok ? r.json() : []),
      fetch('/api/pos/lousa?modo=usuarios').then(r => r.ok ? r.json() : []),
      fetch('/api/supervisor-vendas?acao=vendedores').then(r => r.ok ? r.json() : []),
    ]).then(([ad, us, ve]) => {
      setAdesoes(Array.isArray(ad) ? ad : [])
      setPortais((Array.isArray(us) ? us : []).map((u: any) => ({ id: String(u.id), nome: u.nome })))
      setVendedores((Array.isArray(ve) ? ve : []).map((v: any) => ({ id: String(v.id), nome: v.nome })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const pessoas = tipo === 'portal' ? portais : vendedores

  const salvar = async () => {
    if (!carro || !pessoaId) return
    setSalvando(true)
    const pessoa = pessoas.find(p => p.id === pessoaId)
    const res = await fetch('/api/supervisor-vendas/carros', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placa: carro.placa, descricao: carro.descricao, adesao_id: carro.adesao_id,
        vinculo_tipo: tipo, pessoa_id: pessoaId, pessoa_nome: pessoa?.nome || '',
      }),
    })
    setSalvando(false)
    if (!res.ok) { const e = await res.json().catch(() => ({})); alert(`Erro: ${e.error || res.statusText}`); return }
    onSaved(); onClose()
  }

  const adesoesFiltradas = buscaCarro.trim()
    ? adesoes.filter(a => (a.placa + ' ' + a.descricao).toLowerCase().includes(buscaCarro.toLowerCase()))
    : adesoes

  const INP: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--portal-border, #e5e5e5)', fontSize: 13, boxSizing: 'border-box', background: 'var(--portal-bg-card, #fff)', color: 'var(--portal-text, #1a1a1a)' }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(6px)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--portal-bg-card, #fff)', borderRadius: 18, width: 480, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', padding: 26 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'linear-gradient(135deg, #dc2626, #991b1b)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Car size={20} color="#fff" /></div>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--portal-text, #1a1a1a)', margin: 0 }}>Vincular carro</h2>
          </div>
          <button onClick={onClose} style={{ background: 'var(--portal-bg-secondary, #f5f5f5)', border: 'none', borderRadius: 9, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={16} /></button>
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Carregando carros e pessoas...</div>
        ) : (
          <>
            {/* Carro */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>CARRO (Rota Exata)</label>
              {carro ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <Car size={18} color="#dc2626" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#991b1b' }}>{carro.placa}</div>
                    {carro.descricao && <div style={{ fontSize: 12, color: '#b91c1c' }}>{carro.descricao}</div>}
                  </div>
                  <button onClick={() => setCarro(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={16} /></button>
                </div>
              ) : (
                <>
                  <div style={{ position: 'relative', marginBottom: 6 }}>
                    <Search size={15} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
                    <input value={buscaCarro} onChange={e => setBuscaCarro(e.target.value)} placeholder="Buscar placa ou modelo..." style={{ ...INP, paddingLeft: 34 }} />
                  </div>
                  <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--portal-border, #eee)', borderRadius: 10 }}>
                    {adesoesFiltradas.length === 0 ? (
                      <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>Nenhum carro</div>
                    ) : adesoesFiltradas.map(a => (
                      <div key={a.adesao_id} onClick={() => setCarro(a)} style={{ padding: '9px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#fafafa' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text, #1a1a1a)' }}>{a.placa}</span>
                        {a.descricao && <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>{a.descricao}</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Tipo de pessoa */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>VINCULAR A</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['portal', 'vendedor'] as const).map(t => (
                  <button key={t} onClick={() => { setTipo(t); setPessoaId('') }} style={{
                    flex: 1, padding: '9px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    border: tipo === t ? '2px solid #dc2626' : '1px solid var(--portal-border, #e5e5e5)',
                    background: tipo === t ? '#fef2f2' : 'var(--portal-bg-card, #fff)',
                    color: tipo === t ? '#dc2626' : 'var(--portal-text-secondary, #666)',
                  }}>{t === 'portal' ? 'Usuário do portal' : 'Vendedor'}</button>
                ))}
              </div>
            </div>

            {/* Pessoa */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#9CA3AF', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>PESSOA</label>
              <select value={pessoaId} onChange={e => setPessoaId(e.target.value)} style={INP}>
                <option value="">Selecione...</option>
                {pessoas.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 11, fontSize: 14, fontWeight: 700, background: 'var(--portal-bg-secondary, #f0f0f0)', color: 'var(--portal-text-secondary, #555)', border: 'none', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={salvar} disabled={salvando || !carro || !pessoaId} style={{ flex: 1, padding: 12, borderRadius: 11, fontSize: 14, fontWeight: 700, background: 'linear-gradient(135deg, #dc2626, #991b1b)', color: '#fff', border: 'none', cursor: 'pointer', opacity: (salvando || !carro || !pessoaId) ? 0.5 : 1 }}>
                {salvando ? 'Salvando...' : 'Vincular'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
