'use client';
import { useState, useEffect } from 'react';
import type { Montadora } from '@/lib/garantias/types';

interface Props {
  montadoraId: string | null;
  onSelect: (montadora: Montadora | null) => void;
  disabled?: boolean;
}

export default function MontadoraPicker({ montadoraId, onSelect, disabled }: Props) {
  const [montadoras, setMontadoras] = useState<Montadora[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/garantias/montadoras?ativo=true');
        const data = await res.json();
        setMontadoras(data.montadoras || []);
      } catch {
        setMontadoras([]);
      }
    })();
  }, []);

  return (
    <select
      value={montadoraId || ''}
      disabled={disabled}
      onChange={(e) => {
        const m = montadoras.find((x) => x.id === e.target.value) || null;
        onSelect(m);
      }}
      style={{
        width: '100%',
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid var(--portal-border)',
        background: 'var(--portal-bg-input)',
        color: 'var(--portal-text)',
        fontSize: 13,
        outline: 'none',
      }}
    >
      <option value="">Selecione a montadora...</option>
      {montadoras.map((m) => (
        <option key={m.id} value={m.id}>
          {m.nome}
        </option>
      ))}
    </select>
  );
}
