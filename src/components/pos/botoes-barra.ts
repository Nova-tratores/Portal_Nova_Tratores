// Botões da barra do POS (Técnicos, Projetos, Mais): mesmo tamanho e visual.
import type { CSSProperties } from "react";

export const BTN_BARRA: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px", borderRadius: 10,
  border: "1px solid var(--border, #E4D9C8)", background: "var(--surface, #fefefe)", color: "var(--portal-text, #111827)",
  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
  boxShadow: "0 1px 2px rgba(16,24,40,.05)",
};
