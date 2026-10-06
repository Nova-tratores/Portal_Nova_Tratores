'use client';
// Modal com o QR CODE da garantia: aponta pra página pública /g/[id] (fase
// atual + histórico + fotos, sem login — a chave é o UUID, não enumerável).
// Dá pra copiar o link ou imprimir o QR pra colar na máquina/documentação.
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, MapPin, Printer, X } from 'lucide-react';
import { rotuloLocalizacao } from '@/lib/garantias/localizacao';

export default function QRGarantiaModal({ garantiaId, numero, cliente, localizacao, onClose }: {
  garantiaId: string;
  numero: string;
  /** nome do cliente — sai no modal e na impressão pra identificar o QR colado na máquina */
  cliente?: string | null;
  /** onde a peça está guardada ("MA1-P2") — sai em destaque na etiqueta impressa */
  localizacao?: string | null;
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
    // nome vem do cadastro — escapa pra não quebrar o HTML da folha
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const linhaCliente = cliente ? `<p class="cli">${esc(cliente)}</p>` : '';
    // Localização nas estantes em DESTAQUE — é o que quem guarda/procura a
    // caixa lê primeiro (ex. "MAHINDRA 1 · Prateleira 2").
    const rotuloLoc = rotuloLocalizacao(localizacao);
    const linhaLoc = rotuloLoc ? `<p class="loc">${esc(rotuloLoc)}</p>` : '';
    w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>QR ${esc(numero)}</title>
<style>body{font-family:Arial,sans-serif;display:flex;flex-direction:column;align-items:center;padding-top:30px;margin:0}img{width:64mm;height:64mm}h1{font-size:20px;margin:8px 0 2px}p{font-size:12px;color:#555;margin:2px 0}p.cli{font-size:15px;font-weight:bold;color:#111;margin:0 0 2px}p.loc{font-size:17px;font-weight:bold;color:#111;border:2.5px solid #111;padding:5px 14px;margin:8px 0 2px;letter-spacing:.5px;text-transform:uppercase}</style>
</head><body><img src="${dataUrl}" alt="QR"><h1>${esc(numero)}</h1>${linhaCliente}${linhaLoc}<p>Acompanhamento da garantia — aponte a câmera</p><script>window.onload=()=>window.print()</script></body></html>`);
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
        {cliente && (
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 4 }}>{cliente}</div>
        )}
        {rotuloLocalizacao(localizacao) && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#0f172a', border: '1.5px solid #0f172a', borderRadius: 7, padding: '3px 10px', marginTop: 6 }}>
            <MapPin size={13} /> {rotuloLocalizacao(localizacao)}
          </div>
        )}
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
