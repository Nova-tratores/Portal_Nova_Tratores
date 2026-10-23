"use client";
// Aviso "O que mudou": aparece uma vez para quem usa o módulo, depois que o
// responsável publica a novidade de uma versão. "Entendi" registra a leitura.
// Montado no layout do portal; sem novidade (ou sem a migration) não desenha nada.
// Visual: docs/estilo-pos-newportal.md (cartão branco, ícone do módulo em quadradinho, sem negrito).

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ArtigoView from "./Artigo";
import { AZUL, botao, CSS_KB, dataBR, Icone, IconeModulo, T1, T2, T3 } from "./estiloKB";
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
      style={{ position: "fixed", right: 18, bottom: 18, zIndex: 2500, width: "min(440px, calc(100vw - 36px))", maxHeight: "72vh", display: "flex", flexDirection: "column", background: "var(--portal-bg-card, #fefefe)", border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 16, boxShadow: "0 24px 48px -24px rgba(15,23,42,.55)", fontFamily: "Inter, system-ui, sans-serif", fontWeight: 400, color: T1 }}>
      <style>{CSS_KB}</style>
      <header style={{ padding: "16px 18px 12px", display: "flex", alignItems: "center", gap: 12 }}>
        <Icone icone="fa-wand-magic-sparkles" cor={AZUL} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 500, letterSpacing: "-.01em" }}>O que mudou no portal</div>
          <div style={{ fontSize: 13, color: T2 }}>
            {pendentes.length === 1 ? "1 novidade" : `${pendentes.length} novidades`} nas telas que você usa
          </div>
        </div>
        <button type="button" onClick={entendi} aria-label="Fechar" style={{ width: 32, height: 32, borderRadius: 9, border: "1px solid var(--portal-border, #e2e8f0)", background: "transparent", color: T3, cursor: "pointer", display: "grid", placeItems: "center" }}>
          <i className="fa-solid fa-xmark" />
        </button>
      </header>
      <div style={{ overflowY: "auto", padding: "0 18px 4px", display: "flex", flexDirection: "column", gap: 10 }}>
        {pendentes.map((n) => (
          <section key={n.id} style={{ border: "1px solid var(--portal-border, #e2e8f0)", borderRadius: 14, padding: "12px 14px", background: "var(--portal-bg-card, #fefefe)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <IconeModulo modulo={n.modulo} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 500, lineHeight: 1.3 }}>{n.titulo}</div>
                <div style={{ fontSize: 12.5, color: T2, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ color: corModulo(n.modulo) }}>{rotuloModulo(n.modulo)}</span>
                  {n.publicado_em && <span>· {dataBR(n.publicado_em)}</span>}
                </div>
              </div>
            </div>
            <ArtigoView corpo={mdParaBlocos(n.texto)} compacto />
          </section>
        ))}
      </div>
      <footer style={{ padding: "12px 18px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <Link href="/conhecimento/novidades" onClick={entendi} className="kb-btn" style={botao()}>
          <i className="fa-solid fa-clock-rotate-left" style={{ color: AZUL }} /> Ver histórico
        </Link>
        <button type="button" onClick={entendi} style={{ ...botao(AZUL, true), marginLeft: "auto" }}>Entendi</button>
      </footer>
    </div>
  );
}
