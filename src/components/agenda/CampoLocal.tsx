'use client'
// Campo "Local" do compromisso (José, 16/10/2026): locais pré-definidos (Sala de Reunião,
// Sala Pós Vendas, Sala Irneh…) num clique, texto livre continua valendo, e qualquer
// pessoa cria / renomeia / tira locais aqui mesmo. API: /api/agenda/locais.
import { useCallback, useEffect, useState } from 'react'
import { MapPin, Pencil, Plus, Settings2, Trash2, Check, X } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

interface Local { id: string; nome: string }

async function api<T>(url: string, metodo = 'GET', corpo?: unknown): Promise<T> {
  const r = await fetch(url, { method: metodo, cache: 'no-store', headers: { ...(await authHeaders()), ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Falha (${r.status})`)
  return j as T
}

export default function CampoLocal({ valor, onChange }: { valor: string; onChange: (v: string) => void }) {
  const [locais, setLocais] = useState<Local[]>([])
  const [gerenciar, setGerenciar] = useState(false)
  const [novo, setNovo] = useState('')
  const [editando, setEditando] = useState<{ id: string; nome: string } | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    try { setLocais((await api<{ locais: Local[] }>('/api/agenda/locais')).locais || []) } catch { /* sem locais */ }
  }, [])
  useEffect(() => {
    let vivo = true
    Promise.resolve().then(() => { if (vivo) void carregar() })
    return () => { vivo = false }
  }, [carregar])

  const acao = async (fn: () => Promise<unknown>) => {
    setErro('')
    try { await fn(); await carregar() } catch (e) { setErro(e instanceof Error ? e.message : 'Falhou') }
  }
  const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

  return (
    <div className="gc-campo-ic" style={{ alignItems: 'flex-start' }}>
      <MapPin size={18} style={{ marginTop: 8 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <input placeholder="Adicionar local (ou escolha abaixo)" value={valor} maxLength={200} onChange={(e) => onChange(e.target.value)} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {locais.map((l) => {
            const on = igual(valor, l.nome)
            return (
              <button key={l.id} type="button" onClick={() => onChange(on ? '' : l.nome)}
                style={{ border: `1px solid ${on ? '#1a73e8' : 'var(--portal-border,#dadce0)'}`, background: on ? 'rgba(26,115,232,.1)' : 'transparent', color: on ? '#1a73e8' : 'var(--portal-text,#3c4043)', borderRadius: 999, padding: '3px 10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {l.nome}
              </button>
            )
          })}
          <button type="button" onClick={() => setGerenciar((g) => !g)} title="Criar, renomear ou tirar locais"
            style={{ border: 'none', background: 'none', color: 'var(--portal-text-muted,#70757a)', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
            <Settings2 size={13} /> {gerenciar ? 'fechar' : 'locais'}
          </button>
        </div>
        {gerenciar && (
          <div style={{ marginTop: 8, border: '1px solid var(--portal-border,#dadce0)', borderRadius: 10, padding: 8 }}>
            {locais.map((l) => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 2px' }}>
                {editando?.id === l.id ? (
                  <>
                    <input value={editando.nome} maxLength={80} autoFocus onChange={(e) => setEditando({ id: l.id, nome: e.target.value })} style={{ flex: 1 }}
                      onKeyDown={(e) => { if (e.key === 'Enter') void acao(() => api('/api/agenda/locais', 'PATCH', editando)).then(() => setEditando(null)) }} />
                    <button type="button" className="gc-icone" aria-label="Salvar" onClick={() => void acao(() => api('/api/agenda/locais', 'PATCH', editando)).then(() => setEditando(null))}><Check size={15} /></button>
                    <button type="button" className="gc-icone" aria-label="Cancelar" onClick={() => setEditando(null)}><X size={15} /></button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 13 }}>{l.nome}</span>
                    <button type="button" className="gc-icone" aria-label={`Renomear ${l.nome}`} onClick={() => setEditando({ id: l.id, nome: l.nome })}><Pencil size={14} /></button>
                    <button type="button" className="gc-icone" aria-label={`Tirar ${l.nome}`} onClick={() => { if (confirm(`Tirar "${l.nome}" da lista de locais?`)) void acao(() => api(`/api/agenda/locais?id=${encodeURIComponent(l.id)}`, 'DELETE')) }}><Trash2 size={14} /></button>
                  </>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <input placeholder="Novo local (ex.: Oficina, Showroom)" value={novo} maxLength={80} onChange={(e) => setNovo(e.target.value)} style={{ flex: 1 }}
                onKeyDown={(e) => { if (e.key === 'Enter' && novo.trim()) void acao(() => api('/api/agenda/locais', 'POST', { nome: novo })).then(() => setNovo('')) }} />
              <button type="button" disabled={!novo.trim()} onClick={() => void acao(() => api('/api/agenda/locais', 'POST', { nome: novo })).then(() => setNovo(''))}
                style={{ border: 'none', background: '#1a73e8', color: '#fefefe', borderRadius: 8, padding: '0 12px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                <Plus size={14} /> Criar
              </button>
            </div>
            {erro && <div className="gc-erro" style={{ marginTop: 6 }}>{erro}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
