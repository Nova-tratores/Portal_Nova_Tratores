"use client";

// Quadro para assinar com o dedo (ou mouse). Compartilhado pela assinatura do
// cliente na OS (/assinar/<token>) e pelo passo "assinatura" dos POPs.
// O pai lê o PNG por ref (`png()`) e limpa por `limpar()`.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";

export interface CanvasAssinaturaRef {
  limpar: () => void;
  /** PNG (data URL) do que foi desenhado, ou null se está vazio. */
  png: () => string | null;
  /** Blob PNG (para subir no storage), ou null se está vazio. */
  blob: () => Promise<Blob | null>;
}

interface Props {
  temTraco: boolean;
  onTraco: (tem: boolean) => void;
  altura?: number;
}

const CanvasAssinatura = forwardRef<CanvasAssinaturaRef, Props>(function CanvasAssinatura({ temTraco, onTraco, altura = 220 }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const desenhando = useRef(false);
  const ultimo = useRef<{ x: number; y: number } | null>(null);
  const tracou = useRef(false);

  const preparar = useCallback(() => {
    const c = canvasRef.current; if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2.6; ctx.strokeStyle = "#1c2a7a";
  }, []);
  useEffect(() => { preparar(); window.addEventListener("resize", preparar); return () => window.removeEventListener("resize", preparar); }, [preparar]);

  const limpar = useCallback(() => {
    const c = canvasRef.current; const ctx = c?.getContext("2d");
    if (c && ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore(); }
    tracou.current = false; onTraco(false);
  }, [onTraco]);

  useImperativeHandle(ref, () => ({
    limpar,
    png: () => (canvasRef.current && tracou.current ? canvasRef.current.toDataURL("image/png") : null),
    blob: () => new Promise((ok) => {
      const c = canvasRef.current;
      if (!c || !tracou.current) { ok(null); return; }
      c.toBlob((b) => ok(b), "image/png");
    }),
  }), [limpar]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = e.currentTarget.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const inicio = (e: React.PointerEvent<HTMLCanvasElement>) => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); desenhando.current = true; ultimo.current = pos(e); };
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!desenhando.current || !ultimo.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext("2d"); if (!ctx) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(ultimo.current.x, ultimo.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ultimo.current = p;
    if (!tracou.current) { tracou.current = true; onTraco(true); }
  };
  const fim = () => { desenhando.current = false; ultimo.current = null; };

  return (
    <div style={{ position: "relative", marginTop: 4 }}>
      <canvas
        ref={canvasRef}
        onPointerDown={inicio} onPointerMove={mover} onPointerUp={fim} onPointerCancel={fim} onPointerLeave={fim}
        style={{ width: "100%", height: altura, border: "2px dashed #9ca3af", borderRadius: 10, background: "#fff", touchAction: "none", display: "block" }}
      />
      {!temTraco && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", pointerEvents: "none", fontSize: 14 }}>assine aqui</div>}
      <div style={{ position: "absolute", left: 16, right: 16, bottom: 44, borderTop: "1px solid #e5e7eb", pointerEvents: "none" }} />
    </div>
  );
});

export default CanvasAssinatura;
