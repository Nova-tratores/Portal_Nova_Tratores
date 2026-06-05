'use client'
import { useEffect, useState } from 'react'
import { X, Bell, BellOff, Lock, Loader2, Save, CheckCircle2 } from 'lucide-react'
import { MODULOS_NOTIFICAVEIS } from '@/lib/notif/prefs'

interface Props {
  userId: string
  onClose: () => void
}

export default function NotifPrefsModal({ userId, onClose }: Props) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')
  const [silenciados, setSilenciados] = useState<Set<string>>(new Set())
  const [obrigatorios, setObrigatorios] = useState<Set<string>>(new Set())
  const [categoria, setCategoria] = useState<string | null>(null)
  const [salvoOK, setSalvoOK] = useState(false)

  useEffect(() => {
    let alive = true
    const carregar = async () => {
      try {
        const res = await fetch(`/api/perfil/notif-prefs?user_id=${userId}`)
        const data = await res.json()
        if (!alive) return
        setSilenciados(new Set<string>(data.silenciados || []))
        setObrigatorios(new Set<string>(data.obrigatorios || []))
        setCategoria(data.categoria || null)
      } catch {
        if (alive) setErro('Erro ao carregar preferências.')
      } finally {
        if (alive) setLoading(false)
      }
    }
    carregar()
    return () => { alive = false }
  }, [userId])

  const toggle = (modulo: string) => {
    if (obrigatorios.has(modulo)) return
    setSalvoOK(false)
    setSilenciados((prev) => {
      const nv = new Set(prev)
      if (nv.has(modulo)) nv.delete(modulo); else nv.add(modulo)
      return nv
    })
  }

  const salvar = async () => {
    setSaving(true)
    setErro('')
    try {
      const res = await fetch('/api/perfil/notif-prefs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, silenciados: [...silenciados] }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErro(data.error || 'Falha ao salvar.')
        return
      }
      setSilenciados(new Set<string>(data.silenciados || []))
      setSalvoOK(true)
      setTimeout(() => setSalvoOK(false), 2500)
    } catch {
      setErro('Erro de conexão.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--portal-bg-card)', borderRadius: 18,
          maxWidth: 480, width: '100%', maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: '1px solid var(--portal-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'linear-gradient(135deg,#dc2626,#991b1b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bell size={16} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>
                Minhas notificações
              </div>
              <div style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                {categoria ? `Cargo: ${categoria}` : 'Configure o que você quer receber'}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 6, color: 'var(--portal-text-secondary)',
          }}>
            <X size={20} />
          </button>
        </div>

        {/* Corpo */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 22px' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Loader2 size={20} className="spin" color="var(--portal-text-muted)" />
            </div>
          ) : (
            <>
              <p style={{ fontSize: 12, color: 'var(--portal-text-secondary)', margin: '0 0 14px' }}>
                Desmarque os módulos que <strong>não</strong> quer receber notificação.
                Os com <Lock size={11} style={{ display: 'inline', verticalAlign: 'middle' }} /> são obrigatórios pro seu cargo.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MODULOS_NOTIFICAVEIS.map((m) => {
                  const ativo = !silenciados.has(m.id)
                  const trancado = obrigatorios.has(m.id)
                  return (
                    <label
                      key={m.id}
                      onClick={(e) => { if (trancado) e.preventDefault() }}
                      title={trancado ? `Notificações de ${m.nome} são obrigatórias pro cargo "${categoria || 'admin'}".` : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 12px', borderRadius: 10,
                        background: trancado ? 'var(--portal-bg-secondary)' : (ativo ? '#f0fdf4' : 'var(--portal-bg-card)'),
                        border: `1px solid ${trancado ? 'var(--portal-border)' : (ativo ? '#86efac' : 'var(--portal-border)')}`,
                        cursor: trancado ? 'not-allowed' : 'pointer',
                        opacity: trancado ? 0.85 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={ativo || trancado}
                        disabled={trancado}
                        onChange={() => toggle(m.id)}
                        style={{ width: 16, height: 16, cursor: trancado ? 'not-allowed' : 'pointer' }}
                      />
                      <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--portal-text)' }}>
                        {m.nome}
                      </div>
                      {trancado ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#92400e', background: '#fef3c7', padding: '3px 8px', borderRadius: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                          <Lock size={10} /> obrigatório
                        </span>
                      ) : ativo ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#16a34a' }}>
                          <Bell size={12} />
                        </span>
                      ) : (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: 'var(--portal-text-muted)' }}>
                          <BellOff size={12} /> silenciado
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>

              {erro && (
                <div style={{ marginTop: 12, padding: 10, background: '#fef2f2', borderRadius: 8, color: '#b91c1c', fontSize: 12 }}>
                  {erro}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px', borderTop: '1px solid var(--portal-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        }}>
          {salvoOK ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#16a34a', fontSize: 12, fontWeight: 600 }}>
              <CheckCircle2 size={14} /> Preferências salvas.
            </span>
          ) : <span />}
          <button
            onClick={salvar}
            disabled={loading || saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: 'linear-gradient(135deg,#dc2626,#991b1b)', color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: (loading || saving) ? 'default' : 'pointer',
              opacity: (loading || saving) ? 0.6 : 1,
            }}
          >
            {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
            Salvar preferências
          </button>
        </div>
      </div>
    </div>
  )
}
