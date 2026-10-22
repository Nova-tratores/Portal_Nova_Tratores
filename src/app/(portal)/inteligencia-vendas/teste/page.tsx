'use client';
// PÁGINA DE TESTE da Inteligência de Vendas. A última proposta (tudo numa página só, com as
// bolinhas — CentralIV) foi aprovada e virou a tela de verdade em 21/10/2026.
export default function TestePage() {
  return (
    <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text-muted, #64748b)' }}>
      <i className="fas fa-flask" style={{ fontSize: 32, marginBottom: 12 }} />
      <p style={{ fontWeight: 700 }}>Nenhuma proposta em teste agora.</p>
      <p>A Inteligência de Vendas está toda na <a href="/inteligencia-vendas" style={{ color: '#dc2626', fontWeight: 700 }}>página principal</a>.</p>
    </div>
  );
}
