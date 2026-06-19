'use client';
import { useState } from 'react';
import { Upload, Loader2, Download, X, ImagePlus } from 'lucide-react';
import type { GarantiaAnexo } from '@/lib/garantias/types';

interface Props {
  garantiaId: string;
  fotos: GarantiaAnexo[];
  enviadoPor?: string;
  onChange?: () => void;
  readOnly?: boolean;
}

function extDe(url: string): string {
  const m = url.split('?')[0].match(/\.([a-zA-Z0-9]{3,4})$/);
  return m ? m[1] : 'jpg';
}

async function baixarUma(f: GarantiaAnexo, setBaixando: (v: string | null) => void) {
  setBaixando(f.id);
  try {
    const res = await fetch(f.url);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = f.nome_arquivo || `foto.${extDe(f.url)}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
  } catch {
    window.open(f.url, '_blank');
  } finally {
    setBaixando(null);
  }
}

// Galeria de fotos que o garantista anexa direto na garantia (categoria
// 'foto_garantista'). Útil quando a garantia é criada manualmente e a OS não
// tem as fotos do relatório do técnico.
export default function GarantiaFotosGarantista({ garantiaId, fotos, enviadoPor, onChange, readOnly }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);

  async function enviar(files: FileList) {
    setEnviando(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('categoria', 'foto_garantista');
        if (enviadoPor) fd.append('enviado_por', enviadoPor);
        const res = await fetch(`/api/garantias/${garantiaId}/anexos`, { method: 'POST', body: fd });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          alert(d.error || 'Falha ao enviar a foto.');
        }
      }
      onChange?.();
    } finally {
      setEnviando(false);
    }
  }

  async function remover(f: GarantiaAnexo) {
    if (!confirm('Remover esta foto?')) return;
    const res = await fetch(`/api/garantias/${garantiaId}/anexos?anexo=${f.id}`, { method: 'DELETE' });
    if (res.ok) onChange?.();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {!readOnly && (
        <label
          style={{
            display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
            padding: '7px 12px', borderRadius: 8, border: '1px dashed var(--portal-border)',
            background: 'var(--portal-bg-input)', fontSize: 12, fontWeight: 600,
            color: 'var(--portal-text-secondary)', cursor: enviando ? 'default' : 'pointer',
          }}
        >
          {enviando ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
          {enviando ? 'Enviando...' : 'Adicionar fotos'}
          <input
            type="file"
            accept="image/*"
            multiple
            style={{ display: 'none' }}
            disabled={enviando}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) enviar(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      )}

      {fotos.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--portal-text-muted)' }}>
          <ImagePlus size={14} /> Nenhuma foto adicionada pelo garantista.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
          {fotos.map((f) => (
            <div
              key={f.id}
              style={{ border: '1px solid var(--portal-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--portal-bg-secondary)' }}
            >
              <a href={f.url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={f.nome_arquivo || 'Foto'} style={{ width: '100%', height: 84, objectFit: 'cover', display: 'block' }} />
              </a>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', gap: 4 }}>
                <button
                  onClick={() => baixarUma(f, setBaixando)}
                  disabled={baixando === f.id}
                  title="Baixar"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-secondary)', display: 'flex' }}
                >
                  {baixando === f.id ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
                </button>
                {!readOnly && (
                  <button
                    onClick={() => remover(f)}
                    title="Remover"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex' }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
