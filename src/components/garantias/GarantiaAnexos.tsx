'use client';
import { fetchAuth } from '@/lib/auth/client';
import { useState } from 'react';
import { Upload, Loader2, X, FileText, ExternalLink, Camera } from 'lucide-react';
import type { GarantiaAnexo, AnexoCategoria } from '@/lib/garantias/types';

interface Props {
  garantiaId: string;
  anexos: GarantiaAnexo[];
  uploadCategoria?: AnexoCategoria;
  enviadoPor?: string;
  onChange?: () => void;
  vazioTexto?: string;
  /** Botão "Tirar foto" (abre a câmera traseira no celular). */
  camera?: boolean;
  /** Imagens viram grade de miniaturas (fotos de prova no celular). */
  galeria?: boolean;
}

const ehImagem = (a: GarantiaAnexo) =>
  (a.content_type || '').startsWith('image/') ||
  /\.(jpe?g|png|webp|gif|heic)$/i.test(a.nome_arquivo || a.url || '');

export default function GarantiaAnexos({
  garantiaId,
  anexos,
  uploadCategoria,
  enviadoPor,
  onChange,
  vazioTexto = 'Nenhum anexo.',
  camera = false,
  galeria = false,
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
      const res = await fetchAuth(`/api/garantias/${garantiaId}/anexos`, { method: 'POST', body: fd });
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
    const res = await fetchAuth(`/api/garantias/${garantiaId}/anexos?anexo=${a.id}`, { method: 'DELETE' });
    if (res.ok) onChange?.();
  }

  const imagens = galeria ? anexos.filter(ehImagem) : [];
  const arquivos = galeria ? anexos.filter((a) => !ehImagem(a)) : anexos;

  const botaoUpload = (rotulo: string, icone: React.ReactNode, extra?: React.InputHTMLAttributes<HTMLInputElement>) => (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        padding: '9px 14px',
        minHeight: 40, // alvo de toque confortável no celular
        borderRadius: 9,
        border: '1px dashed var(--portal-border)',
        background: 'var(--portal-bg-input)',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--portal-text-secondary)',
        cursor: uploading ? 'default' : 'pointer',
        flex: '1 1 auto',
      }}
    >
      {uploading ? <Loader2 size={14} className="spin" /> : icone}
      {uploading ? 'Enviando...' : rotulo}
      <input
        type="file"
        style={{ display: 'none' }}
        disabled={uploading}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) enviar(f);
          e.target.value = '';
        }}
        {...extra}
      />
    </label>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {anexos.length === 0 && (
        <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>{vazioTexto}</span>
      )}

      {/* Fotos em grade (modo galeria) */}
      {imagens.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 }}>
          {imagens.map((a) => (
            <div key={a.id} style={{ position: 'relative', aspectRatio: '1 / 1', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--portal-border)', background: 'var(--portal-bg-secondary)' }}>
              <a href={a.url} target="_blank" rel="noreferrer" style={{ display: 'block', width: '100%', height: '100%' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.nome_arquivo || 'Foto'} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </a>
              {onChange && (
                <button
                  onClick={() => remover(a)}
                  title="Remover"
                  style={{
                    position: 'absolute', top: 4, right: 4,
                    width: 24, height: 24, borderRadius: '50%',
                    border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {arquivos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {arquivos.map((a) => (
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
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', display: 'flex', minWidth: 30, minHeight: 30, alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {uploadCategoria && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* capture="environment" abre a câmera traseira direto no celular;
              no desktop vira um seletor de imagem comum. */}
          {camera && botaoUpload('Tirar foto', <Camera size={14} />, { accept: 'image/*', capture: 'environment' })}
          {botaoUpload('Anexar arquivo', <Upload size={14} />)}
        </div>
      )}
    </div>
  );
}
