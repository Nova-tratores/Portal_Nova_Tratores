"use client";
// Faixa do módulo Treinamento: guias estilo Chrome (docs/padrao-telas.md) + "Como ler esta tela".
// Roxo #7c3aed. Sem título ao lado das guias.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { T2 } from "@/components/conhecimento/estiloKB";

export const ROXO = "#7c3aed";

export function TreinamentoNav({ podeGerir, conta }: { podeGerir: boolean; conta?: { minhas?: number; atrasadas?: number } }) {
  const pathname = usePathname() || "";
  const guias = [
    { href: "/treinamento", rotulo: "Minhas trilhas", icone: "fa-graduation-cap", ativo: pathname === "/treinamento" || /^\/treinamento\/[^/]+$/.test(pathname) && !pathname.startsWith("/treinamento/equipe") && !pathname.startsWith("/treinamento/editar") && !pathname.startsWith("/treinamento/trilhas"), n: conta?.minhas },
    ...(podeGerir ? [
      { href: "/treinamento/trilhas", rotulo: "Trilhas", icone: "fa-route", ativo: pathname.startsWith("/treinamento/trilhas") || pathname.startsWith("/treinamento/editar"), n: undefined },
      { href: "/treinamento/equipe", rotulo: "Equipe", icone: "fa-users", ativo: pathname.startsWith("/treinamento/equipe"), n: conta?.atrasadas },
    ] : []),
  ];
  return (
    <div style={{ background: `linear-gradient(135deg, #a78bfa, ${ROXO})`, padding: "10px clamp(12px, 2vw, 28px) 0", display: "flex", alignItems: "flex-end", gap: 6, overflowX: "auto", margin: "0 calc(-1 * clamp(12px, 2vw, 28px))", marginBottom: 18 }}>
      {guias.map((g) => (
        <Link key={g.href} href={g.href} role="tab" aria-selected={g.ativo} style={{
          display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", flexShrink: 0, borderRadius: "11px 11px 0 0", textDecoration: "none", whiteSpace: "nowrap",
          fontSize: 13.5, fontWeight: g.ativo ? 700 : 500, color: "#111111", background: g.ativo ? "#fefefe" : "rgba(255,255,255,0.30)", boxShadow: g.ativo ? "0 -2px 6px rgba(0,0,0,0.15)" : "none", transition: "0.15s",
        }}>
          <i className={`fa-solid ${g.icone}`} style={{ fontSize: 13 }} /> {g.rotulo}
          {typeof g.n === "number" && g.n > 0 && <span style={{ fontSize: 11, padding: "0 7px", borderRadius: 999, background: g.ativo ? ROXO : "rgba(0,0,0,0.12)", color: g.ativo ? "#fefefe" : "#111111" }}>{g.n}</span>}
        </Link>
      ))}
    </div>
  );
}

export function ComoLer({ itens }: { itens: React.ReactNode[] }) {
  return (
    <details style={{ marginBottom: 14, fontSize: 13.5, color: T2 }}>
      <summary style={{ cursor: "pointer", color: ROXO, listStyle: "none", display: "inline-flex", alignItems: "center", gap: 7 }}>
        <i className="fa-regular fa-circle-question" /> Como ler esta tela
      </summary>
      <ul style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.6 }}>{itens.map((i, k) => <li key={k}>{i}</li>)}</ul>
    </details>
  );
}

/** Barra de progresso fina. */
export function Barra({ pct, cor = ROXO }: { pct: number; cor?: string }) {
  return (
    <div style={{ height: 6, borderRadius: 999, background: "color-mix(in srgb, var(--portal-border, #e2e8f0) 70%, transparent)", overflow: "hidden" }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: "100%", background: cor, borderRadius: 999, transition: "width .6s ease" }} />
    </div>
  );
}

export const pagina: React.CSSProperties = { padding: "0 clamp(12px, 2vw, 28px) 32px", fontFamily: "Inter, sans-serif" };
