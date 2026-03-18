'use client'
import { useState, useCallback } from 'react'
import { AlertCircle, AlertTriangle, Info } from 'lucide-react'

const VARIANTS = {
  danger: { Icon: AlertCircle, color: '#ef4444', btnBg: '#ef4444' },
  warning: { Icon: AlertTriangle, color: '#f59e0b', btnBg: '#f59e0b' },
  info: { Icon: Info, color: '#0ea5e9', btnBg: '#0ea5e9' },
}

export function useConfirm() {
  const [state, setState] = useState({ isOpen: false, config: {}, resolve: null })

  const confirm = useCallback((config) => {
    return new Promise((resolve) => {
      setState({ isOpen: true, config, resolve })
    })
  }, [])

  const handleConfirm = () => {
    state.resolve?.(true)
    setState({ isOpen: false, config: {}, resolve: null })
  }

  const handleClose = () => {
    state.resolve?.(false)
    setState({ isOpen: false, config: {}, resolve: null })
  }

  const cfg = state.config
  const v = VARIANTS[cfg.variant || 'warning']

  const ConfirmDialog = state.isOpen ? (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(8px)', zIndex: 99998, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s ease' }} onClick={handleClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '28px', padding: '40px', maxWidth: '440px', width: '90%', textAlign: 'center', boxShadow: '0 40px 80px rgba(0,0,0,0.2)', animation: 'zoomIn 0.25s ease' }}>
        <v.Icon size={52} color={v.color} style={{ margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: '22px', color: '#1e293b', margin: '0 0 10px', fontWeight: '600' }}>{cfg.title || 'Confirmar ação?'}</h3>
        <p style={{ fontSize: '15px', color: '#64748b', margin: '0 0 28px', lineHeight: '1.6' }}>{cfg.message || 'Esta ação não pode ser desfeita.'}</p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button onClick={handleClose} style={{ padding: '12px 28px', borderRadius: '14px', border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', cursor: 'pointer', fontSize: '15px' }}>Cancelar</button>
          <button onClick={handleConfirm} style={{ padding: '12px 28px', borderRadius: '14px', border: 'none', background: v.btnBg, color: '#fff', cursor: 'pointer', fontSize: '15px' }}>{cfg.confirmText || 'Confirmar'}</button>
        </div>
      </div>
      <style jsx global>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes zoomIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  ) : null

  return { confirm, ConfirmDialog }
}
