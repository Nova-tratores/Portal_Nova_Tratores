'use client';
// Caixa explicativa usada em todas as telas da demonstração do CRM:
// conta O PORQUÊ daquela tela/número existir, no lugar onde ele aparece.
export default function Ideia({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--portal-bg-card)',
        border: '1px solid var(--portal-border)',
        borderLeft: '5px solid #1B7A5F',
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 16,
        fontSize: 13.5,
        lineHeight: 1.55,
        color: 'var(--portal-text)',
      }}
    >
      <strong style={{ color: '#1B7A5F' }}>💡 {titulo}</strong>
      <div style={{ marginTop: 4, color: 'var(--portal-text-secondary)' }}>{children}</div>
    </div>
  );
}
