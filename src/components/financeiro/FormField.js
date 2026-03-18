'use client'
import { AlertCircle } from 'lucide-react'

export default function FormField({ label, name, error, touched, icon: Icon, type = 'text', children, ...inputProps }) {
  const hasError = touched && error

  // If children are provided (custom input like select/textarea), render those instead
  if (children) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {label && <label style={{ fontSize: '11px', color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase' }}>{label}</label>}
        {children}
        {hasError && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontSize: '13px' }}>
            <AlertCircle size={14} /> <span>{error}</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && <label style={{ fontSize: '11px', color: '#94a3b8', letterSpacing: '1px', textTransform: 'uppercase' }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        {Icon && <Icon size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />}
        <input
          type={type}
          name={name}
          {...inputProps}
          style={{
            width: '100%', padding: '14px 16px', paddingLeft: Icon ? '44px' : '16px',
            borderRadius: '14px', border: `1.5px solid ${hasError ? '#ef4444' : '#e2e8f0'}`,
            background: hasError ? '#fef2f2' : '#f8fafc', color: '#1e293b', outline: 'none',
            fontSize: '15px', transition: 'border-color 0.2s, background 0.2s',
            ...(inputProps.style || {})
          }}
        />
      </div>
      {hasError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', fontSize: '13px' }}>
          <AlertCircle size={14} /> <span>{error}</span>
        </div>
      )}
    </div>
  )
}
