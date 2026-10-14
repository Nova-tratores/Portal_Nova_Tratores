"use client";
// Peças da CAPA dos cards do POS e do PPV (modelo escolhido pelo José, 13/10/2026):
// nº · cliente, fase em pílula + valor, bolinhas do caminho, linhas de info,
// caixa da solicitação, pílula Reservar e ícones com o nome embaixo.
import { useState, type ReactNode } from "react";

export const CAPA_MUTED = "var(--portal-text-muted, #64748b)";

export function CapaTitulo({ numero, cliente, corNumero }: { numero: string; cliente: string; corNumero?: string }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.3 }}>
      <b style={{ fontSize: 14, color: corNumero }}>{numero}</b>
      <span style={{ color: CAPA_MUTED }}> · </span>
      <span style={{ fontWeight: 600 }}>{cliente || "Sem Cliente"}</span>
    </div>
  );
}

/** Fase em pílula (o <select> fica por cima, invisível) + valor à direita. */
export function CapaFaseValor({ fase, rotulo, fases, rotuloDe, onChange, valor }: {
  fase: string; rotulo: string; fases: string[]; rotuloDe: (f: string) => string;
  onChange?: (f: string) => void; valor: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span onClick={(e) => e.stopPropagation()} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10.5, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: "color-mix(in srgb, #0369A1 11%, transparent)", color: "#0369A1", whiteSpace: "nowrap", maxWidth: 170, minWidth: 0 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{rotulo}</span>
        {onChange && <i className="fas fa-chevron-down" style={{ fontSize: 8 }} />}
        {onChange && (
          <select value={fase} onChange={(e) => onChange(e.target.value)} title="Mudar a fase"
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%" }}>
            {fases.map((f) => <option key={f} value={f}>{rotuloDe(f)}</option>)}
          </select>
        )}
      </span>
      <b style={{ fontSize: 15, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{valor}</b>
    </div>
  );
}

export interface PassoCapa { r: string; ok: boolean; atual?: boolean }
export function CapaBolinhas({ passos }: { passos: PassoCapa[] }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start" }}>
      {passos.map((p, i) => {
        const aceso = p.ok || p.atual;
        return (
          <div key={p.r} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", minWidth: 0 }}>
            {i > 0 && <div style={{ position: "absolute", top: 6, right: "50%", width: "100%", height: 2, background: aceso ? "#16a34a" : "var(--border, #e2e8f0)" }} />}
            <div style={{ width: 14, height: 14, borderRadius: 99, background: p.ok ? "#16a34a" : "var(--surface, #fefefe)", border: `2px solid ${aceso ? "#16a34a" : "#cbd5e1"}`, boxShadow: p.atual ? "0 0 0 3px rgba(22,163,74,.2)" : "none", position: "relative", zIndex: 1 }} />
            <span style={{ fontSize: 9.5, marginTop: 3, color: aceso ? "#15803d" : CAPA_MUTED, fontWeight: 700, textAlign: "center", whiteSpace: "nowrap" }}>{p.r}</span>
          </div>
        );
      })}
    </div>
  );
}

export function CapaLinha({ icone, rotulo, children }: { icone: string; rotulo: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span style={{ color: CAPA_MUTED, whiteSpace: "nowrap" }}><i className={icone} style={{ width: 14 }} /> {rotulo}</span>
      <span style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
    </div>
  );
}

export function CapaData({ children }: { children: ReactNode }) {
  return <span style={{ fontWeight: 700, color: "#92400E", background: "#FEF3C7", padding: "0 7px", borderRadius: 6 }}>{children}</span>;
}

export function CapaTexto({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, color: "var(--portal-text-secondary, #475569)", background: "var(--bg-soft, #f8fafc)", border: "1px solid var(--border, #eef2f7)", borderRadius: 7, padding: "5px 8px", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", wordBreak: "break-word" }}>
      <i className="fas fa-comment" style={{ color: CAPA_MUTED, marginRight: 5, fontSize: 10 }} />{children}
    </div>
  );
}

/** Pílula Reservar → pergunta o dia → onReservar(dataISO). Desmarcar chama onDesmarcar. */
export function CapaReservar({ reservado, onReservar, onDesmarcar }: { reservado: boolean; onReservar: (dataISO: string) => void; onDesmarcar: () => void }) {
  const [pedindo, setPedindo] = useState(false);
  const [data, setData] = useState(() => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10));
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 700, color: reservado ? "#15803D" : CAPA_MUTED, cursor: "pointer", padding: "3px 10px", borderRadius: 999, border: `1px solid ${reservado ? "#86efac" : "var(--border, #e2e8f0)"}`, background: reservado ? "#F0FDF4" : "transparent", textTransform: "none", letterSpacing: 0, margin: 0 }}>
        <input type="checkbox" checked={reservado} onChange={(e) => { if (e.target.checked) setPedindo(true); else { setPedindo(false); onDesmarcar(); } }} style={{ accentColor: "#15803D", margin: 0 }} />
        {reservado ? "Reservado" : "Reservar"}
      </label>
      {pedindo && !reservado && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 7, padding: "5px 8px" }}>
          <span style={{ fontSize: 11.5, color: "#15803D", fontWeight: 700, whiteSpace: "nowrap" }}>Pra qual dia?</span>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={{ flex: 1, minWidth: 0, fontSize: 11.5, padding: "2px 5px", border: "1px solid #BBF7D0", borderRadius: 5 }} />
          <button type="button" onClick={() => { if (data) { onReservar(data); setPedindo(false); } }} style={{ border: "none", background: "#15803D", color: "#fefefe", borderRadius: 5, padding: "3px 9px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>OK</button>
          <button type="button" onClick={() => setPedindo(false)} title="Cancelar" style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13, padding: 0 }}>×</button>
        </div>
      )}
    </div>
  );
}

export interface IconeCapa { icone: string; rotulo: string; on: boolean; titulo: string; extra?: ReactNode }
/** Rodapé: texto à esquerda e ícones com o nome embaixo (aceso = tem). */
export function CapaRodape({ esquerda, icones }: { esquerda: ReactNode; icones: IconeCapa[] }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 8, borderTop: "1px solid var(--border, #eef2f7)", paddingTop: 7 }}>
      <span style={{ fontSize: 10.5, color: CAPA_MUTED, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{esquerda}</span>
      <span style={{ display: "flex", gap: 9, flexShrink: 0 }}>
        {icones.map((x) => (
          <span key={x.rotulo} className="mc-icon-wrap" onClick={(e) => e.stopPropagation()} title={`${x.titulo}${x.on ? "" : " — não tem"}`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 26, color: x.on ? "var(--portal-text, #0f172a)" : "#cbd5e1", position: "relative" }}>
            <i className={x.icone} style={{ fontSize: 12 }} />
            <span style={{ fontSize: 8.5, fontWeight: 700, color: x.on ? "var(--portal-text-secondary, #475569)" : "#cbd5e1" }}>{x.rotulo}</span>
            {x.extra}
          </span>
        ))}
      </span>
    </div>
  );
}

const BTN: React.CSSProperties = { flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 10px", borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
export function CapaBotao({ tipo, onClick, disabled, children, title }: { tipo: "enviar" | "cobrar" | "faturar"; onClick: () => void; disabled?: boolean; children: ReactNode; title?: string }) {
  const est: React.CSSProperties = tipo === "enviar"
    ? { border: "none", color: "#fefefe", background: disabled ? "#94A3B8" : "linear-gradient(135deg, #22d3ee, #0BB7CD 55%, #0891A8)" }
    : tipo === "cobrar"
      ? { border: "1px solid #16a34a", background: "transparent", color: "#15803d" }
      : { border: "none", background: disabled ? "#94A3B8" : "#0BB7CD", color: "#fefefe" };
  return (
    <button type="button" title={title} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{ ...BTN, ...est, cursor: disabled ? "default" : "pointer" }}>{children}</button>
  );
}
