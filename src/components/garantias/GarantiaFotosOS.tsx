'use client';
import { useState, useEffect } from 'react';
import { Download, Loader2, ImageOff, Archive } from 'lucide-react';
import JSZip from 'jszip';

interface FotoItem {
  label: string;
  url: string;
}

interface Props {
  osId: string;
}

async function baixarBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  return res.blob();
}

function disparaDownload(blob: Blob, nome: string) {
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objUrl), 4000);
}

function extDe(url: string): string {
  const m = url.split('?')[0].match(/\.([a-zA-Z0-9]{3,4})$/);
  return m ? m[1] : 'jpg';
}

export default function GarantiaFotosOS({ osId }: Props) {
  const [fotos, setFotos] = useState<FotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [baixando, setBaixando] = useState<string | null>(null);
  const [zipando, setZipando] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/pos/fotos-tecnico?os=${encodeURIComponent(osId)}`);
        if (!res.ok) {
          if (!cancel) setFotos([]);
          return;
        }
        const data = await res.json();
        const lista: FotoItem[] = [
          ...(data.fotos || []).map((f: FotoItem) => ({ label: f.label, url: f.url })),
          ...(data.assinaturas || []).map((f: FotoItem) => ({ label: `Assinatura ${f.label}`, url: f.url })),
        ];
        if (!cancel) setFotos(lista);
      } catch {
        if (!cancel) setFotos([]);
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [osId]);

  async function baixarUma(f: FotoItem) {
    setBaixando(f.url);
    try {
      const blob = await baixarBlob(f.url);
      const nome = `${f.label.replace(/\s+/g, '_')}.${extDe(f.url)}`;
      disparaDownload(blob, nome);
    } catch {
      window.open(f.url, '_blank');
    } finally {
      setBaixando(null);
    }
  }

  async function baixarTodas() {
    setZipando(true);
    try {
      const zip = new JSZip();
      let i = 1;
      for (const f of fotos) {
        try {
          const blob = await baixarBlob(f.url);
          zip.file(`${String(i).padStart(2, '0')}_${f.label.replace(/\s+/g, '_')}.${extDe(f.url)}`, blob);
        } catch {
          /* ignora foto que falhar */
        }
        i++;
      }
      const out = await zip.generateAsync({ type: 'blob' });
      disparaDownload(out, `fotos_OS_${osId}.zip`);
    } finally {
      setZipando(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--portal-text-muted)' }}>
        <Loader2 size={14} className="spin" /> Carregando fotos da OS...
      </div>
    );
  }

  if (fotos.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--portal-text-muted)' }}>
        <ImageOff size={14} /> A OS não tem fotos no relatório do técnico.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        onClick={baixarTodas}
        disabled={zipando}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          alignSelf: 'flex-start',
          padding: '7px 12px',
          borderRadius: 8,
          border: 'none',
          background: 'linear-gradient(135deg, #0ea5e9, #0369a1)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          cursor: zipando ? 'default' : 'pointer',
          opacity: zipando ? 0.7 : 1,
        }}
      >
        {zipando ? <Loader2 size={14} className="spin" /> : <Archive size={14} />}
        Baixar todas ({fotos.length}) em .zip
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
        {fotos.map((f) => (
          <div
            key={f.url}
            style={{
              border: '1px solid var(--portal-border)',
              borderRadius: 8,
              overflow: 'hidden',
              background: 'var(--portal-bg-secondary)',
            }}
          >
            <a href={f.url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.label} style={{ width: '100%', height: 84, objectFit: 'cover', display: 'block' }} />
            </a>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--portal-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.label}
              </span>
              <button
                onClick={() => baixarUma(f)}
                disabled={baixando === f.url}
                title="Baixar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--portal-text-secondary)', display: 'flex' }}
              >
                {baixando === f.url ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
