"use client";
// Toast mínimo do cockpit (sem alert()). Some sozinho.
import { useEffect } from "react";

export interface ToastMsg { tipo: "ok" | "erro" | "aviso"; texto: string }

export default function Toast({ msg, onFechar, ms = 4500 }: { msg: ToastMsg | null; onFechar: () => void; ms?: number }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onFechar, ms);
    return () => clearTimeout(t);
  }, [msg, onFechar, ms]);
  if (!msg) return null;
  const cor = msg.tipo === "ok" ? { bg: "#065f46", fg: "#fff" } : msg.tipo === "erro" ? { bg: "#991b1b", fg: "#fff" } : { bg: "#92400e", fg: "#fff" };
  return (
    <div role="status" style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: cor.bg, color: cor.fg, padding: "10px 18px", borderRadius: 999, fontSize: 13, fontWeight: 700, boxShadow: "0 10px 30px -10px rgba(0,0,0,.5)", zIndex: 1000, display: "flex", gap: 12, alignItems: "center", maxWidth: "90vw" }}>
      <span>{msg.tipo === "ok" ? "✓" : msg.tipo === "erro" ? "✕" : "!"} {msg.texto}</span>
      <button type="button" onClick={onFechar} aria-label="fechar" style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", fontSize: 14 }}>×</button>
    </div>
  );
}
