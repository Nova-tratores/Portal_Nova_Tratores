'use client'
import { createContext, useContext, useState, useCallback } from 'react'
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react'

const ToastContext = createContext()

const ICONS = {
  success: { Icon: CheckCircle, color: '#22c55e', bg: '#f0fdf4', border: '#bbf7d0' },
  error: { Icon: AlertCircle, color: '#ef4444', bg: '#fef2f2', border: '#fecaca' },
  warning: { Icon: AlertTriangle, color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  info: { Icon: Info, color: '#0ea5e9', bg: '#f0f9ff', border: '#bae6fd' },
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((type, message) => {
    const id = Date.now() + Math.random()
    setToasts(prev => {
      const next = [...prev, { id, type, message }]
      return next.slice(-3) // max 3
    })
    setTimeout(() => removeToast(id), 5000)
  }, [removeToast])

  const toast = {
    success: (msg) => addToast('success', msg),
    error: (msg) => addToast('error', msg),
    warning: (msg) => addToast('warning', msg),
    info: (msg) => addToast('info', msg),
  }

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast Container */}
      <div style={{ position: 'fixed', top: '24px', right: '24px', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: '12px', pointerEvents: 'none', maxWidth: '420px', width: '100%' }}>
        {toasts.map(t => {
          const cfg = ICONS[t.type] || ICONS.info
          const Icon = cfg.Icon
          return (
            <div key={t.id} style={{
              background: cfg.bg, border: `1px solid ${cfg.border}`, borderRadius: '16px',
              padding: '16px 20px', display: 'flex', alignItems: 'flex-start', gap: '12px',
              boxShadow: '0 10px 40px rgba(0,0,0,0.12)', pointerEvents: 'auto',
              animation: 'toastSlideIn 0.3s ease'
            }}>
              <Icon size={22} color={cfg.color} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span style={{ flex: 1, fontSize: '14px', color: '#1e293b', lineHeight: '1.5' }}>{t.message}</span>
              <button onClick={() => removeToast(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
                <X size={16} color="#94a3b8" />
              </button>
            </div>
          )
        })}
      </div>
      <style jsx global>{`
        @keyframes toastSlideIn { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: translateX(0); } }
      `}</style>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
