'use client';
import { useConta } from './ContaProvider';

/** Dropdown de conta (Todas / Nova / Castro). Lê e grava no ContaProvider. */
export default function ContaSelector({ label = 'Conta' }: { label?: string }) {
  const { conta, setConta, contas } = useConta();
  if (contas.length === 0) return null;
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>{label}</label>
      <select
        value={conta}
        onChange={(e) => setConta(e.target.value)}
        style={{
          padding: '6px 12px',
          border: '1px solid #d1d5db',
          borderRadius: 6,
          fontSize: 13,
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        <option value="">Todas</option>
        {contas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
    </div>
  );
}
