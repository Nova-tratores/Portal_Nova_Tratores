'use client';
// Foto do trator (catálogo de peças pelo modelo; senão a do produto do chassi; senão o ícone).
// Rota: GET /api/catalogo/foto-maquina. Cache por modelo+chassi na sessão.
import { useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';

const cache = new Map<string, Promise<string | null>>();

function buscarFoto(modelo: string, chassi: string): Promise<string | null> {
  const k = `${modelo.toUpperCase()}|${chassi.toUpperCase().slice(-7)}`;
  let p = cache.get(k);
  if (!p) {
    p = fetchAuth(`/api/catalogo/foto-maquina?modelo=${encodeURIComponent(modelo)}&chassi=${encodeURIComponent(chassi)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.url as string) || null)
      .catch(() => null);
    cache.set(k, p);
  }
  return p;
}

export default function FotoMaquina({ modelo, chassi, largura = 96, altura = 72, cor = '#0f766e' }: {
  modelo: string | null | undefined; chassi?: string | null; largura?: number; altura?: number; cor?: string;
}) {
  const [res, setRes] = useState<{ k: string; url: string | null } | null>(null);
  const [quebrou, setQuebrou] = useState(false);
  const k = `${modelo || ''}|${chassi || ''}`;
  useEffect(() => {
    let vivo = true;
    void buscarFoto(modelo || '', chassi || '').then((url) => { if (vivo) setRes({ k, url }); });
    return () => { vivo = false; };
  }, [k, modelo, chassi]);
  const url = res?.k === k && !quebrou ? res.url : null;
  const caixa: React.CSSProperties = {
    width: largura, height: altura, borderRadius: 12, flex: 'none', overflow: 'hidden', display: 'grid', placeItems: 'center',
    background: url ? '#fefefe' : `color-mix(in srgb, ${cor} 9%, var(--surface, #fefefe))`,
    border: `1px solid ${url ? 'var(--border, #e2e8f0)' : `color-mix(in srgb, ${cor} 18%, transparent)`}`, color: cor,
  };
  return (
    <span style={caixa} title={modelo || undefined}>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt={modelo || 'Trator'} loading="lazy" onError={() => setQuebrou(true)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        : <i className="fa-solid fa-tractor" style={{ fontSize: Math.round(altura * 0.36), fontWeight: 900 }} />}
    </span>
  );
}
