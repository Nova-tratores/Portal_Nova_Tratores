'use client';
import { useState } from 'react';
import { Upload, Loader2, X, FileText, ExternalLink } from 'lucide-react';
import type { GarantiaAnexo, AnexoCategoria } from '@/lib/garantias/types';

interface Props {
  garantiaId: string;
  anexos: GarantiaAnexo[];
  uploadCategoria?: AnexoCategoria;
  enviadoPor?: string;
  onChange?: () => void;
  vazioTexto?: string;
}

export default function GarantiaAnexos({
  garantiaId,
  anexos,
  uploadCategoria,
  enviadoPor,
  onChange,
  vazioTexto = 'Nenhum anexo.',
}: Props) {
  const [uploading, setUploading] = useState(false);

  async function enviar(file: File) {
    if (!uploadCategoria) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('categoria', uploadCategoria);
      if (enviadoPor) fd.append('enviado_por', enviadoPor);
      const res = await fetch(`/api/garantias/${garantiaId}/anexos`, { method: 'POST', body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || 'Falha ao enviar o anexo.');
        return;
      }
      onChange?.();
    } finally {
      setUploading(false);
    }
  }

  async function remover(a: GarantiaAnexo) {
    if (!confirm('Remover este anexo?')) return;
    const res = await fetch(`/api/garantias/${garantiaId}/anexos?anexo=${a.id}`, { method: 'DELETE' });
    if (res.ok) onChange?.();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {anexos.length === 0 ? (
        <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>{vazioTexto}</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {anexos.map((a) => (
            <div
              key={a.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 9px',
                borderRadius: 8,
                border: '1px solid var(--portal-border)',
                background: 'var(--portal-bg-secondary)',
              }}
            >
              <FileText size={15} color="var(--portal-text-muted)" />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.nome_arquivo || 'Arquivo'}
              </span>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11, color: '#0ea5e9', fontWeight: 600 }}
              >
                <ExternalLink size={13} /> Abrir
              </a>
              {onChange && (
                <button
                  onClick={() => remover(a)}
                  title="Remover"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {uploadCategoria && (
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            alignSelf: 'flex-start',
            padding: '7px 12px',
            borderRadius: 8,
            border: '1px dashed var(--portal-border)',
            background: 'var(--portal-bg-input)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--portal-text-secondary)',
            cursor: uploading ? 'default' : 'pointer',
          }}
        >
          {uploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
          {uploading ? 'Enviando...' : 'Anexar arquivo'}
          <input
            type="file"
            style={{ display: 'none' }}
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) enviar(f);
              e.target.value = '';
            }}
          />
        </label>
      )}
    </div>
  );
}
