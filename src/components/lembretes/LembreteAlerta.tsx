'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Bell, Check, Clock, X } from 'lucide-react'

interface Lembrete {
  id: string
  criador_nome: string
  destinatario_id: string
  titulo: string
  descricao: string
  data_hora: string
  status: string
}

export default function LembreteAlerta({ userId }: { userId: string }) {
  const [alerta, setAlerta] = useState<Lembrete | null>(null)
  const [showAdiar, setShowAdiar] = useState(false)
  const [novaData, setNovaData] = useState('')
  const [novaHora, setNovaHora] = useState('')
  const vistoIds = useRef<Set<string>>(new Set())

  const checarLembretes = useCallback(async () => {
    if (!userId) return
    try {
      const res = await fetch(`/api/lembretes?userId=${userId}&tipo=vencidos`)
      const data = await res.json()
      if (!Array.isArray(data)) return

      // Filtra só os que são para mim e que eu ainda não vi nesta sessão
      const paraEu = data.filter(
        (l: Lembrete) => l.destinatario_id === userId && l.status === 'pendente' && !vistoIds.current.has(l.id)
      )
      if (paraEu.length > 0 && !alerta) {
        setAlerta(paraEu[0])
      }
    } catch {}
  }, [userId, alerta])

  useEffect(() => {
    if (!userId) return
    checarLembretes()
    const interval = setInterval(checarLembretes, 30000)
    return () => clearInterval(interval)
  }, [userId, checarLembretes])

  const concluir = async () => {
    if (!alerta) return
    vistoIds.current.add(alerta.id)
    await fetch('/api/lembretes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: alerta.id, status: 'concluido' }),
    })
    setAlerta(null)
    setShowAdiar(false)
  }

  const adiar = async () => {
    if (!alerta || !novaData || !novaHora) return
    vistoIds.current.add(alerta.id)
    const novaDataHora = new Date(`${novaData}T${novaHora}`).toISOString()
    await fetch('/api/lembretes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: alerta.id, data_hora: novaDataHora, status: 'pendente' }),
    })
    setAlerta(null)
    setShowAdiar(false)
    setNovaData('')
    setNovaHora('')
  }

  const dispensar = () => {
    if (alerta) vistoIds.current.add(alerta.id)
    setAlerta(null)
    setShowAdiar(false)
  }

  if (!alerta) return null

  const dt = new Date(alerta.data_hora)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(10px)', zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.3s ease-out'
    }}>
      <div style={{
        background: 'var(--portal-bg-card)', borderRadius: '28px', width: '420px',
        padding: '0', boxShadow: '0 30px 80px rgba(0,0,0,0.2)',
        overflow: 'hidden', animation: 'scaleIn 0.3s ease-out'
      }}>
        {/* Top */}
        <div style={{
          background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
          padding: '32px 32px 28px', color: '#fff', textAlign: 'center'
        }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: 'rgba(255,255,255,0.2)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', animation: 'pulse 2s infinite'
          }}>
            <Bell size={28} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 6px' }}>Lembrete!</h2>
          <p style={{ fontSize: '12px', opacity: 0.8, margin: 0 }}>
            {dt.toLocaleDateString('pt-BR')} as {dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            {alerta.criador_nome ? ` — de ${alerta.criador_nome}` : ''}
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: '28px 32px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--portal-text)', margin: '0 0 8px' }}>
            {alerta.titulo}
          </h3>
          {alerta.descricao && (
            <p style={{ fontSize: '14px', color: 'var(--portal-text-secondary)', margin: '0 0 24px', lineHeight: '1.5' }}>
              {alerta.descricao}
            </p>
          )}

          {/* Adiar form */}
          {showAdiar && (
            <div style={{
              background: 'var(--portal-bg-secondary)', borderRadius: '14px', padding: '16px',
              marginBottom: '20px', border: '1px solid var(--portal-border)'
            }}>
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--portal-text-secondary)', letterSpacing: '0.5px', display: 'block', marginBottom: '10px' }}>
                ADIAR PARA:
              </span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="date"
                  value={novaData}
                  onChange={e => setNovaData(e.target.value)}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: '10px',
                    border: '1px solid var(--portal-border)', fontSize: '13px', outline: 'none'
                  }}
                />
                <input
                  type="time"
                  value={novaHora}
                  onChange={e => setNovaHora(e.target.value)}
                  style={{
                    width: '120px', padding: '10px 12px', borderRadius: '10px',
                    border: '1px solid var(--portal-border)', fontSize: '13px', outline: 'none'
                  }}
                />
              </div>
              <button
                onClick={adiar}
                disabled={!novaData || !novaHora}
                style={{
                  marginTop: '10px', width: '100%', padding: '10px',
                  borderRadius: '10px', border: 'none',
                  background: (!novaData || !novaHora) ? 'var(--portal-border)' : '#f59e0b',
                  color: (!novaData || !novaHora) ? 'var(--portal-text-muted)' : '#fff',
                  fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                }}
              >
                <Clock size={14} /> Confirmar Adiamento
              </button>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={concluir}
              style={{
                flex: 1, padding: '14px', borderRadius: '14px', border: 'none',
                background: '#22c55e', color: '#fff', fontSize: '14px',
                fontWeight: '700', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: '0 4px 12px rgba(34,197,94,0.3)'
              }}
            >
              <Check size={18} /> Concluir
            </button>
            <button
              onClick={() => setShowAdiar(!showAdiar)}
              style={{
                flex: 1, padding: '14px', borderRadius: '14px',
                border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)',
                color: 'var(--portal-text-secondary)', fontSize: '14px', fontWeight: '700',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
            >
              <Clock size={18} /> Lembrar Depois
            </button>
          </div>

          <button
            onClick={dispensar}
            style={{
              marginTop: '10px', width: '100%', padding: '10px',
              background: 'none', border: 'none', color: 'var(--portal-text-faint)',
              fontSize: '12px', cursor: 'pointer', fontWeight: '500'
            }}
          >
            Dispensar por agora
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes scaleIn {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  )
}
