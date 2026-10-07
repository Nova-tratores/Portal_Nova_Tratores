"use client";
// Aviso "O que mudou": aparece uma vez para quem usa o módulo, depois que o
// responsável publica a novidade de uma versão. "Entendi" registra a leitura.
// Montado no layout do portal; sem novidade (ou sem a migration) não desenha nada.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ArtigoView from "./Artigo";
import { mdParaBlocos } from "@/lib/conhecimento/blocos";
import { marcarNovidadesLidas, novidadesPendentes, type NovidadeApi } from "@/lib/conhecimento/client";
import { corModulo, rotuloModulo } from "@/lib/conhecimento/modulos";

export default function Novidades() {
  const pathname = usePathname() || "";
  const [pendentes, setPendentes] = useState<NovidadeApi[]>([]);
  const [fechado, setFechado] = useState(false);

  useEffect(() => {
    let vivo = true;
    // espera a tela assentar (e a sessão existir) antes de perguntar
    const t = setTimeout(() => {
      novidadesPendentes().then((r) => { if (vivo) setPendentes(r.pendentes); }).catch(() => {});
    }, 2500);
    return () => { vivo = false; clearTimeout(t); };
  }, []);

  if (fechado || pendentes.length === 0 || pathname.startsWith("/conhecimento/novidades")) return null;

  const entendi = () => {
    setFechado(true);
    marcarNovidadesLidas(pendentes.map((n) => n.id)).catch(() => {});
  };

  return (
    <div role="dialog" aria-label="O que mudou no portal"
      style={{ position: "fixed", right: 18, bottom: 18, zIndex: 2500, width: "min(420px, calc(100vw - 36px))", maxHeight: "70vh", display: "flex", flexDirection: "column", background: "var(--portal-bg-card)", border: "1px solid var(--portal-border)", borderRadius: 16, boxShadow: "0 24px 60px -12px rgba(0,0,0,0.35)", fontFamily: "Inter, sans-serif" }}>
      <header style={{ padding: "12px 16px", borderBottom: "1px solid var(--portal-border)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 18 }}>🆕</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--portal-text)" }}>O que mudou no portal</div>
          <div style={{ fontSize: 11, color: "var(--portal-text-muted)" }}>nas telas que você usa</div>
        </div>
      </header>
      <div style={{ overflowY: "auto", padding: "10px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        {pendentes.map((n) => (
          <section key={n.id}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: corModulo(n.modulo) }}>{rotuloModulo(n.modulo)}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--portal-text)", margin: "2px 0 6px" }}>{n.titulo}</div>
            <ArtigoView corpo={mdParaBlocos(n.texto)} compacto />
          </section>
        ))}
      </div>
      <footer style={{ padding: "10px 16px", borderTop: "1px solid var(--portal-border)", display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/conhecimento/novidades" onClick={entendi} style={{ fontSize: 12, color: "#0369a1", fontWeight: 700, textDecoration: "none" }}>ver histórico</Link>
        <button type="button" onClick={entendi} style={{ marginLeft: "auto", padding: "8px 18px", background: "#0369a1", color: "#fefefe", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Entendi</button>
      </footer>
    </div>
  );
}
