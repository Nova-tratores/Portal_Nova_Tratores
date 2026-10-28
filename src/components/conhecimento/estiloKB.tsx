// Visual "Estilo POS NewPortal" (docs/estilo-pos-newportal.md) na Base de conhecimento e no
// aviso "O que mudou" — José, 23/10/2026. Cartão branco de cantos 16, sem negrito (máx. 500),
// sem caixa alta, sem faixa colorida do lado: a cor do módulo vai no ícone em quadradinho.

import { corModulo, iconeModulo } from "@/lib/conhecimento/modulos";

export const T1 = "var(--portal-text, #0f172a)";
export const T2 = "var(--portal-text-secondary, #475569)";
export const T3 = "var(--portal-text-muted, #94a3b8)";
export const AZUL = "#2563eb";

/** CSS do hover dos cartões (inline não tem :hover). Montar uma vez por tela. */
export const CSS_KB = `
.kb-card { transition: box-shadow .25s, transform .25s, border-color .25s }
.kb-card.kb-hover:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55);
  border-color: color-mix(in srgb, var(--kb-cor, #2563eb) 35%, var(--portal-border, #e2e8f0)) }
.kb-btn:hover { border-color: color-mix(in srgb, var(--kb-cor, #2563eb) 40%, var(--portal-border, #e2e8f0)) }
`;

export const card: React.CSSProperties = {
  background: "var(--portal-bg-card, #fefefe)", border: "1px solid var(--portal-border, #e2e8f0)",
  borderRadius: 16, padding: "16px 18px 14px", boxShadow: "none",
};

export const tituloPagina: React.CSSProperties = {
  margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-.01em", color: T1, display: "flex", alignItems: "center", gap: 12,
};

export const tituloSecao: React.CSSProperties = {
  margin: "0 0 10px", fontSize: 16, fontWeight: 500, color: T1, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
};

export function botao(cor = AZUL, cheio = false): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 7, height: 40, padding: "0 14px", borderRadius: 11, cursor: "pointer",
    fontFamily: "inherit", fontSize: 14, fontWeight: 400, whiteSpace: "nowrap", textDecoration: "none",
    border: `1px solid ${cheio ? cor : "var(--portal-border, #e2e8f0)"}`,
    background: cheio ? cor : "var(--portal-bg-card, #fefefe)", color: cheio ? "#fefefe" : T1,
    ["--kb-cor" as string]: cor,
  };
}

/** Pílula de filtro/aba: mostra a cor mesmo sem estar escolhida. */
export function pilula(cor: string, on: boolean): React.CSSProperties {
  return {
    display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 12px", borderRadius: 999, cursor: "pointer",
    fontFamily: "inherit", fontSize: 13.5, fontWeight: 400, whiteSpace: "nowrap",
    border: `1px solid ${on ? `color-mix(in srgb, ${cor} 45%, transparent)` : "var(--portal-border, #e2e8f0)"}`,
    background: on ? `color-mix(in srgb, ${cor} 9%, var(--portal-bg-card, #fefefe))` : "var(--portal-bg-card, #fefefe)",
    color: on ? T1 : T2,
  };
}

export function contador(cor: string): React.CSSProperties {
  return { fontSize: 12, padding: "0 8px", borderRadius: 999, background: `color-mix(in srgb, ${cor} 12%, var(--portal-bg-card, #fefefe))`, color: T1, fontVariantNumeric: "tabular-nums" };
}

/** Etiqueta pequena (rascunho, nova, pode estar desatualizado…): fundo clarinho da cor, sem caixa alta. */
export function Selo({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 12, padding: "2px 9px", borderRadius: 999, whiteSpace: "nowrap", color: cor, background: `color-mix(in srgb, ${cor} 10%, var(--portal-bg-card, #fefefe))`, border: `1px solid color-mix(in srgb, ${cor} 20%, transparent)` }}>
      {children}
    </span>
  );
}

/** Ícone em quadradinho na cor (40 px no título, 32 nas seções e cartões). */
export function Icone({ icone, cor, tam = 40 }: { icone: string; cor: string; tam?: number }) {
  return (
    <span style={{
      width: tam, height: tam, borderRadius: tam >= 40 ? 11 : 9, flex: "none", display: "grid", placeItems: "center",
      fontSize: tam >= 40 ? 16 : 13.5, color: cor,
      background: `color-mix(in srgb, ${cor} 9%, var(--portal-bg-card, #fefefe))`,
      border: `1px solid color-mix(in srgb, ${cor} 18%, transparent)`,
    }}>
      <i className={`fa-solid ${icone}`} />
    </span>
  );
}

export function IconeModulo({ modulo, tam = 32 }: { modulo: string; tam?: number }) {
  return <Icone icone={iconeModulo(modulo)} cor={corModulo(modulo)} tam={tam} />;
}

export const vazio: React.CSSProperties = { ...card, padding: 40, textAlign: "center", color: T3, fontSize: 14 };

export const campo: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--portal-border, #e2e8f0)",
  background: "var(--portal-bg-card, #fefefe)", color: T1, fontSize: 14, fontFamily: "inherit", outline: "none",
};

export const dataBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
