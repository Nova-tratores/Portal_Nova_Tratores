'use client'
// Modal de confirmação simples (tela no meio). Usado no financeiro pra confirmar
// a troca de fase (ex.: "Cliente sem boleto").
export default function ConfirmarFaseModal({ open, mensagem, confirmLabel = 'Sim', cancelLabel = 'Cancelar', onConfirm, onCancel }) {
  if (!open) return null
  return (
    <div onClick={onCancel} style={{ position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 16, width: '100%', maxWidth: 440, boxShadow: '0 24px 60px rgba(0,0,0,.3)', padding: '28px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 17.5, fontWeight: 700, color: 'var(--portal-text)', lineHeight: 1.45, marginBottom: 22 }}>{mensagem}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onConfirm} style={{ padding: '12px 26px', borderRadius: 12, border: 'none', background: '#e8730c', color: '#fff', fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}>{confirmLabel}</button>
          <button onClick={onCancel} style={{ padding: '12px 22px', borderRadius: 12, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  )
}
