'use client';
import { useState } from 'react';
import { Upload, FileCheck, Loader2 } from 'lucide-react';
import type { ChecklistField as TField } from '@/lib/garantias/types';

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--portal-border)',
  background: 'var(--portal-bg-input)',
  color: 'var(--portal-text)',
  fontSize: 13,
  outline: 'none',
};

interface Props {
  campo: TField;
  valor: unknown;
  onChange?: (valor: unknown) => void;
  readOnly?: boolean;
  onUpload?: (file: File) => Promise<string>;
}

export default function ChecklistField({ campo, valor, onChange, readOnly, onUpload }: Props) {
  const [uploading, setUploading] = useState(false);
  const disabled = readOnly || !onChange;

  // Seção: cabeçalho, sem input
  if (campo.tipo === 'secao') {
    return (
      <div
        style={{
          marginTop: 8,
          paddingBottom: 6,
          borderBottom: '2px solid var(--portal-border)',
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--portal-text)',
          textTransform: 'uppercase',
          letterSpacing: 0.4,
        }}
      >
        {campo.label}
      </div>
    );
  }

  const label = (
    <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--portal-text-secondary)' }}>
      {campo.label}
      {campo.obrigatorio && <span style={{ color: '#dc2626' }}> *</span>}
    </label>
  );

  let control: React.ReactNode = null;

  if (campo.tipo === 'texto') {
    control = (
      <textarea
        value={(valor as string) || ''}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        rows={2}
        style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
      />
    );
  } else if (campo.tipo === 'numero') {
    control = (
      <input
        type="number"
        value={(valor as number | string) ?? ''}
        onChange={(e) => onChange?.(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={disabled}
        style={inputStyle}
      />
    );
  } else if (campo.tipo === 'data') {
    control = (
      <input
        type="date"
        value={(valor as string) || ''}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        style={inputStyle}
      />
    );
  } else if (campo.tipo === 'checkbox') {
    control = (
      <div style={{ display: 'flex', gap: 8 }}>
        {['Sim', 'Não'].map((opt) => {
          const ativo = valor === opt;
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => onChange?.(opt)}
              style={{
                flex: 1,
                padding: '7px 10px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: disabled ? 'default' : 'pointer',
                border: `1px solid ${ativo ? (opt === 'Sim' ? '#16a34a' : '#dc2626') : 'var(--portal-border)'}`,
                background: ativo ? (opt === 'Sim' ? '#16a34a' : '#dc2626') : 'var(--portal-bg-input)',
                color: ativo ? '#fff' : 'var(--portal-text-secondary)',
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    );
  } else if (campo.tipo === 'select') {
    control = (
      <select
        value={(valor as string) || ''}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        style={inputStyle}
      >
        <option value="">Selecione...</option>
        {(campo.opcoes || []).map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>
    );
  } else if (campo.tipo === 'file') {
    const url = valor as string;
    control = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#16a34a', fontWeight: 600 }}
          >
            <FileCheck size={14} /> Arquivo anexado
          </a>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>Nenhum arquivo</span>
        )}
        {!disabled && onUpload && (
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid var(--portal-border)',
              background: 'var(--portal-bg-hover)',
              fontSize: 12,
              cursor: 'pointer',
              color: 'var(--portal-text-secondary)',
            }}
          >
            {uploading ? <Loader2 size={13} className="spin" /> : <Upload size={13} />}
            {url ? 'Trocar' : 'Enviar'}
            <input
              type="file"
              style={{ display: 'none' }}
              disabled={uploading}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                try {
                  const novaUrl = await onUpload(f);
                  onChange?.(novaUrl);
                } finally {
                  setUploading(false);
                  e.target.value = '';
                }
              }}
            />
          </label>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label}
      {control}
      {campo.ajuda && (
        <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>{campo.ajuda}</span>
      )}
    </div>
  );
}
