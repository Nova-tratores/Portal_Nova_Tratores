'use client';
// Modal com o QR CODE da garantia: aponta pra página pública /g/[id] (fase
// atual + histórico + fotos, sem login — a chave é o UUID, não enumerável).
// Dá pra copiar o link ou imprimir o QR pra colar na máquina/documentação.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Printer, X } from 'lucide-react';

export default function QRGarantiaModal({ garantiaId, numero, onClose }: {
  garantiaId: string;
  numero: string;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState('');
  const [copiado, setCopiado] = useState(false);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/g/${garantiaId}` : '';

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { width: 520, margin: 2 }).then(setDataUrl).catch(() => setDataUrl(''));
  }, [url]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch { /* clipboard bloqueado */ }
  };

  const imprimir = () => {
    if (!dataUrl) return;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>QR ${numero}</title>
<style>body{font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center;padding-top:30px;margin:0}img{width:64mm;height:64mm}h1{font-size:20px;margin:8px 0 2px}p{font-size:12px;color:#555;margin:2px 0}</style>
</head><body><img src="${dataUrl}" alt="QR"><h1>${numero}</h1><p>Acompanhamento da garantia — aponte a câmera</p><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', width: 'min(360px, 94vw)', boxShadow: '0 18px 60px rgba(0,0,0,.35)', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong style={{ fontSize: 14, color: '#0f172a' }}>QR Code · {numero}</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={18} /></button>
        </div>
        {dataUrl
          ? /* eslint-disable-next-line @next/next/no-img-element */
            <img src={dataUrl} alt="QR Code da garantia" style={{ width: 240, height: 240, display: 'block', margin: '0 auto' }} />
          : <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Gerando…</div>}
        <div style={{ fontSize: 11.5, color: '#64748b', margin: '6px 0 12px', lineHeight: 1.5 }}>
          Quem escanear vê a <strong>fase atual</strong>, o histórico e as <strong>fotos</strong> da garantia — sem precisar de login.
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          <button onClick={copiar} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            <Copy size={13} /> {copiado ? 'Copiado!' : 'Copiar link'}
          </button>
          <button onClick={imprimir} disabled={!dataUrl} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#111827', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            <Printer size={13} /> Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
