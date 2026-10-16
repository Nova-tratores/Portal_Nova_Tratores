"use client";
import { casaBusca } from '@/lib/texto';
// Versão MOBILE do PPV (Opção A): lista de pedidos em cartões grandes, busca,
// fase em dropdown e botão flutuante de Novo Lançamento. Desktop não usa isto.
import { Fragment, useMemo, useState } from "react";
import type { KanbanItem } from "@/lib/ppv/types";
import { PHASE_COLORS, PHASE_SHORT, PHASES } from "./PhaseView";

// Ordem canônica das fases (Concluída/Cancelada por último). Fase desconhecida vai pro fim.
const ordemFase = (s: string) => { const i = PHASES.indexOf(s); return i === -1 ? 998 : i; };

interface Props {
  orders: KanbanItem[];
  searchTerm: string;
  onSearchChange: (v: string) => void;
  onCardClick: (id: string) => void;
  onNovo: () => void;
  podeCriar: boolean;
  loading: boolean;
  /** liberação de peças por QR (rastreio): botão por card quando permitido */
  podeLiberar?: boolean;
  onLiberar?: (id: string) => void;
  /** ações do menu do PC (produtos, kits, sync) — no celular abrem numa folha */
  menu?: { icone: string; label: string; onClick: () => void; disabled?: boolean }[];
  avisoMenu?: string;
}

const cor = (s: string) => PHASE_COLORS[s] || "#64748b";
const curto = (s: string) => PHASE_SHORT[s] || s;
const dataBR = (d: string) => {
  if (!d) return "";
  const m = String(d).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[1]}/${m[2]}`;
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : d;
};
const rs = (v: number) => `R$ ${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PPVMobile({ orders, searchTerm, onSearchChange, onCardClick, onNovo, podeCriar, loading, podeLiberar, onLiberar, menu = [], avisoMenu }: Props) {
  const [fase, setFase] = useState("TODAS");
  const [menuAberto, setMenuAberto] = useState(false);

  const fasesPresentes = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) m.set(o.status, (m.get(o.status) || 0) + 1);
    return [...m.entries()].sort((a, b) => ordemFase(a[0]) - ordemFase(b[0]));
  }, [orders]);

  const filtradas = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return orders
      .filter((o) => {
        if (fase !== "TODAS" && o.status !== fase) return false;
        if (!q) return true;
        return casaBusca(q, o.id, o.cliente, o.tecnico);
      })
      // Mesma ordem do PC: agrupadas por fase (Concluída/Cancelada por último),
      // sem misturar cancelada com aberta. Sort estável mantém a ordem dentro da fase.
      .sort((a, b) => ordemFase(a.status) - ordemFase(b.status));
  }, [orders, fase, searchTerm]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "var(--portal-bg, #f1f5f9)" }}>
      {/* Topo: título + busca */}
      <div style={{ background: "var(--portal-bg-card, #fff)", borderBottom: "1px solid var(--portal-border, #e2e8f0)", padding: "12px 14px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "var(--portal-text, #0f172a)", flex: 1 }}>Peças (PPV)</span>
          <span style={{ fontSize: 13, color: "var(--portal-text-secondary, #64748b)", fontWeight: 600 }}>{filtradas.length} pedido{filtradas.length === 1 ? "" : "s"}</span>
          {menu.length > 0 && (
            <button type="button" onClick={() => setMenuAberto(true)} aria-label="Mais ações (produtos, kits, preços)" title="Mais ações"
              style={{ width: 42, height: 42, borderRadius: 10, border: "1px solid var(--portal-border, #e2e8f0)", background: "var(--portal-bg-card, #fff)", color: "var(--portal-text, #0f172a)", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className="fas fa-ellipsis-vertical" />
            </button>
          )}
        </div>
        <div style={{ position: "relative" }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 15 }} />
          <input value={searchTerm} onChange={(e) => onSearchChange(e.target.value)} placeholder="Buscar PPV, cliente, técnico…"
            style={{ width: "100%", padding: "12px 14px 12px 40px", borderRadius: 12, border: "1.5px solid #e2e8f0", fontSize: 16, outline: "none", boxSizing: "border-box", background: "#f8fafc" }} />
          {searchTerm && <button onClick={() => onSearchChange("")} aria-label="Limpar busca" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}><i className="fas fa-times" /></button>}
        </div>
      </div>

      {/* Fase — dropdown */}
      <div style={{ padding: "10px 14px", background: "var(--portal-bg-card, #fff)", borderBottom: "1px solid var(--portal-border, #eef2f7)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: fase === "TODAS" ? "#0f172a" : cor(fase), flexShrink: 0 }} />
        <select value={fase} onChange={(e) => setFase(e.target.value)}
          style={{ flex: 1, padding: "11px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 15, background: "#f8fafc", color: "#0f172a", fontWeight: 600, outline: "none" }}>
          <option value="TODAS">Todas as fases ({orders.length})</option>
          {fasesPresentes.map(([s, n]) => <option key={s} value={s}>{curto(s)} ({n})</option>)}
        </select>
      </div>

      {/* Lista */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 96px", WebkitOverflowScrolling: "touch" }}>
        {loading && orders.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}><i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }} />Carregando…</div>
        ) : filtradas.length === 0 ? (
          <div style={{ textAlign: "center", padding: 50, color: "#94a3b8" }}>
            <i className="fas fa-inbox" style={{ fontSize: 34, display: "block", marginBottom: 12, color: "#cbd5e1" }} />
            Nenhum PPV {fase !== "TODAS" ? "nesta fase" : ""}{searchTerm ? " para essa busca" : ""}.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtradas.map((o, idx) => {
              const c = cor(o.status);
              const remessa = /remessa/i.test(o.tipo || "");
              // Cabeçalho da fase quando muda (só em "Todas") — leitura em grupos, como no PC.
              const header = fase === "TODAS" && (idx === 0 || filtradas[idx - 1].status !== o.status);
              return (
                <Fragment key={o.id}>
                {header && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 2px 0", marginTop: idx === 0 ? 0 : 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />
                    <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, color: "#475569" }}>{curto(o.status)}</span>
                  </div>
                )}
                <div style={{ display: "flex", borderRadius: 14, border: "1px solid #e7ebf0", background: "#fff", overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,0.04)" }}>
                  <button onClick={() => onCardClick(o.id)} style={{
                    textAlign: "left", display: "flex", flex: 1, minWidth: 0, padding: 0, border: "none", background: "transparent", cursor: "pointer",
                  }}>
                    <div style={{ width: 5, background: c, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0, padding: "13px 14px" }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontSize: 15.5, fontWeight: 700, color: "#0f172a", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflowWrap: "anywhere", lineHeight: 1.3 }}>{o.cliente || "Sem cliente"}</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", flexShrink: 0 }}>{rs(o.valor)}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "7px 0", flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: `${c}18`, color: c }}>{curto(o.status)}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: remessa ? "#eef2ff" : "#fef2f2", color: remessa ? "#4338ca" : "#dc2626" }}>{remessa ? "REMESSA" : "PEDIDO"}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12.5, color: "#64748b", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 800, color: "#c2410c" }}>{o.id}</span>
                        {o.tecnico && <span><i className="fas fa-user-gear" style={{ marginRight: 4, opacity: .7 }} />{o.tecnico}</span>}
                        {o.data && <span><i className="fas fa-calendar" style={{ marginRight: 4, opacity: .7 }} />{dataBR(o.data)}</span>}
                      </div>
                    </div>
                  </button>
                  {podeLiberar && onLiberar && (
                    <button onClick={() => onLiberar(o.id)} title="Liberação de peças (QR)" style={{
                      width: 46, border: "none", borderLeft: "1px solid #eef2f7", background: "#f8fafc", color: "#2563eb",
                      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 17,
                    }}>
                      <i className="fas fa-qrcode" />
                    </button>
                  )}
                </div>
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {podeCriar && (
        <button onClick={onNovo} title="Novo Lançamento" aria-label="Novo Lançamento" style={{
          position: "fixed", right: 18, bottom: 22, zIndex: 20, width: 58, height: 58, borderRadius: "50%", border: "none",
          background: "#EA580C", color: "#fefefe", fontSize: 24, cursor: "pointer", boxShadow: "0 8px 22px rgba(234,88,12,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <i className="fas fa-plus" />
        </button>
      )}

      {/* Folha com as ações do menu do PC */}
      {menuAberto && (
        <div className="m-folha-fundo" onClick={() => setMenuAberto(false)} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(15,23,42,.45)", display: "flex" }}>
          <div className="m-folha" onClick={(e) => e.stopPropagation()} style={{ background: "var(--portal-bg-card, #fff)", padding: "8px 14px 18px", boxShadow: "0 -10px 30px rgba(0,0,0,.2)" }}>
            <div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--portal-border, #e2e8f0)", margin: "4px auto 10px" }} />
            <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
              <span style={{ flex: 1, fontSize: 16, fontWeight: 800, color: "var(--portal-text, #0f172a)" }}>Mais ações</span>
              <button type="button" onClick={() => setMenuAberto(false)} aria-label="Fechar" style={{ width: 44, height: 44, border: "none", borderRadius: 10, background: "var(--portal-bg-secondary, #f1f5f9)", color: "var(--portal-text, #0f172a)", fontSize: 18, cursor: "pointer" }}><i className="fas fa-times" /></button>
            </div>
            {menu.map((m) => (
              <button key={m.label} type="button" disabled={m.disabled} onClick={() => { setMenuAberto(false); m.onClick(); }}
                style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", minHeight: 52, padding: "0 6px", border: "none", borderBottom: "1px solid var(--portal-border, #eef2f7)", background: "transparent", color: "var(--portal-text, #0f172a)", fontSize: 15, fontWeight: 600, textAlign: "left", cursor: m.disabled ? "not-allowed" : "pointer", opacity: m.disabled ? 0.6 : 1, fontFamily: "inherit" }}>
                <i className={`fas ${m.icone}`} style={{ width: 22, textAlign: "center", color: "#EA580C", fontSize: 16 }} /> {m.label}
              </button>
            ))}
            {avisoMenu && <div style={{ padding: "10px 6px 0", fontSize: 13, fontWeight: 600, color: avisoMenu.startsWith("Erro") ? "#DC2626" : "#065F46" }}>{avisoMenu}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
