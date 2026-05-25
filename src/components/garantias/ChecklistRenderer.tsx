'use client';
import ChecklistField from './ChecklistField';
import type { ChecklistField as TField } from '@/lib/garantias/types';

interface Props {
  campos: TField[];
  valores: Record<string, unknown>;
  onChange?: (id: string, valor: unknown) => void;
  readOnly?: boolean;
  onUpload?: (file: File) => Promise<string>;
}

export { camposObrigatoriosFaltando } from '@/lib/garantias/checklist';

export default function ChecklistRenderer({ campos, valores, onChange, readOnly, onUpload }: Props) {
  if (!campos || campos.length === 0) {
    return (
      <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', padding: '8px 0' }}>
        Esta montadora ainda não tem checklist configurado.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {campos.map((campo) => (
        <ChecklistField
          key={campo.id}
          campo={campo}
          valor={valores[campo.id]}
          onChange={onChange ? (v) => onChange(campo.id, v) : undefined}
          readOnly={readOnly}
          onUpload={onUpload}
        />
      ))}
    </div>
  );
}
