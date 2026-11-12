'use client';
// Botão "Enviar foto" do módulo Site: escolhe (ou tira, no celular) a foto, diminui no próprio aparelho para no máximo
// 2000 px (foto de celular passa de 8 MB) e manda para /api/site/upload. Devolve as URLs públicas.
import { useRef, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { botao } from './ui';

async function diminuir(arq: File): Promise<Blob> {
  if (arq.size < 1.5 * 1024 * 1024 && arq.type !== 'image/png') return arq;
  const img = await createImageBitmap(arq).catch(() => null);
  if (!img) return arq;
  const k = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  const ctx = c.getContext('2d');
  if (!ctx) return arq;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  // PNG com fundo transparente (recorte de máquina) continua PNG; o resto vira JPG
  const tipo = arq.type === 'image/png' && arq.size < 6 * 1024 * 1024 ? 'image/png' : 'image/jpeg';
  return new Promise((ok) => c.toBlob((b) => ok(b || arq), tipo, 0.86));
}

export default function EnviarFoto({ pasta, varias = false, rotulo = 'Enviar foto', onEnviada, cor = '#d97706' }: {
  pasta: string; varias?: boolean; rotulo?: string; onEnviada: (urls: string[]) => void; cor?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(0);
  const [erro, setErro] = useState('');

  async function enviar(lista: FileList | null) {
    if (!lista?.length) return;
    setErro('');
    const arqs = [...lista].slice(0, 10);
    setEnviando(arqs.length);
    const urls: string[] = [];
    for (const a of arqs) {
      const blob = await diminuir(a);
      const fd = new FormData();
      fd.append('pasta', pasta);
      fd.append('arquivo', new File([blob], a.name.replace(/\.\w+$/, blob.type === 'image/png' ? '.png' : blob.type === 'image/webp' ? '.webp' : '.jpg'), { type: blob.type || a.type }));
      const r = await fetchAuth('/api/site/upload', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) urls.push(j.url); else setErro(j.erro || 'Não consegui enviar a foto.');
      setEnviando((n) => n - 1);
    }
    if (urls.length) onEnviada(urls);
    if (input.current) input.current.value = '';
  }

  return (
    <span style={{ display: 'inline-grid', gap: 4 }}>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple={varias} hidden onChange={(e) => enviar(e.target.files)} />
      <button type="button" style={botao(cor, false)} disabled={enviando > 0} onClick={() => input.current?.click()}>
        <i className="fa-solid fa-camera" style={{ fontWeight: 900 }} />{enviando ? `Enviando${enviando > 1 ? ` (${enviando})` : ''}…` : rotulo}
      </button>
      {erro && <span style={{ fontSize: 12, color: '#dc2626' }}>{erro}</span>}
    </span>
  );
}
