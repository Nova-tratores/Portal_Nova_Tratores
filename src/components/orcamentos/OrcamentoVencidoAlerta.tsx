'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react'

interface OrcVencido {
  id: number
  numero: string
  cliente_nome: string
  total: number
  validade: number
  created_at: string
}

/**
 * Aviso de orçamento vencido — aparece "na cara" do criador (overlay sobre tudo),
 * no mesmo estilo do LembreteAlerta. Quando um orçamento ativo passa da validade
 * (padrão 15 dias), pergunta ao criador se foi aprovado ou se expirou e atualiza
 * o status. Montado globalmente no PortalLayout.
 */
export default function OrcamentoVencidoAlerta({ userName }: { userName: string }) {
  const [alerta, setAlerta] = useState<OrcVencido | null>(null)
  const [salvando, setSalvando] = useState(false)
  // Orçamentos adiados nesta sessão (Decidir depois) — reaparecem no próximo acesso
  const adiados = useRef<Set<number>>(new Set())

  const checar = useCallback(async () => {
    if (!userName) return
    try {
      const { data } = await supabase
        .from('orcamentos')
        .select('id, numero, cliente_nome, total, validade, created_at, status, criado_por')
        .eq('status', 'ativo')
        .eq('criado_por', userName)
      if (!Array.isArray(data)) return
      const agora = Date.now()
      const vencidos = data.filter(o => {
        const dias = Number(o.validade) || 15
        const limite = new Date(o.created_at).getTime() + dias * 86400000
        return limite <= agora && !adiados.current.has(o.id)
      })
      setAlerta(prev => prev || (vencidos[0] as OrcVencido) || null)
    } catch {}
  }, [userName])

  useEffect(() => {
    if (!userName) return
    checar()
    const interval = setInterval(checar, 60000)
    return () => clearInterval(interval)
  }, [userName, checar])

  const decidir = async (novoStatus: 'aprovado' | 'expirado') => {
    if (!alerta) return
    setSalvando(true)
    adiados.current.add(alerta.id)
    await supabase
      .from('orcamentos')
      .update({ status: novoStatus, updated_at: new Date().toISOString() })
      .eq('id', alerta.id)
    setAlerta(null)
    setSalvando(false)
  }

  const adiar = () => {
    if (alerta) adiados.current.add(alerta.id)
    setAlerta(null)
  }

  if (!alerta) return null

  const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const dias = Number(alerta.validade) || 15

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(10px)', zIndex: 99999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'fadeIn 0.3s ease-out'
    }}>
      <div style={{
        background: 'var(--portal-bg-card)', borderRadius: '28px', width: '440px',
        padding: '0', boxShadow: '0 30px 80px rgba(0,0,0,0.2)',
        overflow: 'hidden', animation: 'scaleIn 0.3s ease-out'
      }}>
        {/* Top */}
        <div style={{
          background: 'linear-gradient(135deg, #d97706, #b45309)',
          padding: '32px 32px 28px', color: '#fff', textAlign: 'center'
        }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '16px',
            background: 'rgba(255,255,255,0.2)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', animation: 'pulse 2s infinite'
          }}>
            <AlertTriangle size={28} />
          </div>
          <h2 style={{ fontSize: '20px', fontWeight: '700', margin: '0 0 6px' }}>Orçamento vencido</h2>
          <p style={{ fontSize: '12px', opacity: 0.85, margin: 0 }}>
            Passaram os {dias} dias de validade
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: '28px 32px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--portal-text)', margin: '0 0 4px' }}>
            {alerta.numero} — {alerta.cliente_nome}
          </h3>
          <p style={{ fontSize: '14px', color: 'var(--portal-text-secondary)', margin: '0 0 22px', lineHeight: '1.5' }}>
            Valor R$ {fmt(alerta.total)}. Este orçamento foi <strong>aprovado</strong> pelo cliente ou
            deve ser marcado como <strong>expirado</strong>?
          </p>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => decidir('aprovado')}
              disabled={salvando}
              style={{
                flex: 1, padding: '14px', borderRadius: '14px', border: 'none',
                background: '#22c55e', color: '#fff', fontSize: '14px',
                fontWeight: '700', cursor: 'pointer', opacity: salvando ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: '0 4px 12px rgba(34,197,94,0.3)'
              }}
            >
              <CheckCircle2 size={18} /> Foi Aprovado
            </button>
            <button
              onClick={() => decidir('expirado')}
              disabled={salvando}
              style={{
                flex: 1, padding: '14px', borderRadius: '14px', border: 'none',
                background: '#F97316', color: '#fff', fontSize: '14px', fontWeight: '700',
                cursor: 'pointer', opacity: salvando ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                boxShadow: '0 4px 12px rgba(239,68,68,0.3)'
              }}
            >
              <XCircle size={18} /> Expirou
            </button>
          </div>

          <button
            onClick={adiar}
            disabled={salvando}
            style={{
              marginTop: '10px', width: '100%', padding: '10px',
              background: 'none', border: 'none', color: 'var(--portal-text-faint)',
              fontSize: '12px', cursor: 'pointer', fontWeight: '500',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
            }}
          >
            <Clock size={13} /> Decidir depois
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
