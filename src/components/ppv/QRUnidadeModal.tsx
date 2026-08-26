'use client';
// Modal com o QR de uma UNIDADE rastreada (aponta pra página pública /p/[id]).
// Padrão do QRGarantiaModal: QR grande + copiar link + imprimir avulso.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Printer, X } from 'lucide-react';
import { urlDaUnidade, urlDaUnidadeLegivel } from '@/lib/ppv/etiquetas-html';

export default function QRUnidadeModal({ unidadeId, numero, codigo, onClose }: {
  unidadeId: string;
  numero: string;
  codigo: string;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = useState('');
  const [copiado, setCopiado] = useState(false);
  // Dois usos do MESMO endereço, cada um na forma que serve:
  //  · urlQR       — maiúscula, que é o que encolhe o QR (modo alfanumérico).
  //                  Igual à da etiqueta: a unidade tem um endereço só.
  //  · urlLegivel  — a de sempre, que é a que aparece e é copiada. Maiúscula
  //                  colada numa conversa parece grito e não ajuda ninguém.
  // As duas abrem a mesma página; a rota ignora a caixa.
  const urlQR = typeof window !== 'undefined' ? urlDaUnidade(window.location.origin, unidadeId) : '';
  const url = typeof window !== 'undefined' ? urlDaUnidadeLegivel(window.location.origin, unidadeId) : '';

  useEffect(() => {
    if (!urlQR) return;
    QRCode.toDataURL(urlQR, { width: 520, margin: 2 }).then(setDataUrl).catch(() => setDataUrl(''));
  }, [urlQR]);

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
<style>body{font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center;padding-top:30px;margin:0}img{width:50mm;height:50mm}h1{font-size:18px;margin:8px 0 2px}p{font-size:12px;color:#555;margin:2px 0}</style>
</head><body><img src="${dataUrl}" alt="QR"><h1>${numero} · ${codigo}</h1><p>Rastreio de peça — aponte a câmera</p><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', width: 'min(340px, 94vw)', boxShadow: '0 18px 60px rgba(0,0,0,.35)', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <strong style={{ fontSize: 14, color: '#0f172a' }}>{numero} · {codigo}</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}><X size={18} /></button>
        </div>
        {dataUrl
          ? /* eslint-disable-next-line @next/next/no-img-element */
            <img src={dataUrl} alt="QR Code da unidade" style={{ width: 220, height: 220, display: 'block', margin: '0 auto' }} />
          : <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13 }}>Gerando…</div>}
        {/* o endereço à vista e clicável: dá pra abrir na hora, conferir se é a
            peça certa e copiar sabendo o que está copiando */}
        {url && (
          <a
            href={url} target="_blank" rel="noreferrer"
            title="Abrir a página de rastreio desta peça"
            style={{
              display: 'block', marginTop: 10, fontSize: 10.5, lineHeight: 1.4,
              color: '#0ea5e9', wordBreak: 'break-all', textDecoration: 'none',
            }}
          >
            {url}
          </a>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 10 }}>
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
