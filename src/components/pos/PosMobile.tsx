"use client";
// Versão MOBILE do POS (Opção A): tela pensada pro celular — busca, chips de
// fase que rolam na horizontal, e a lista de OS em CARTÕES grandes (nada de
// kanban de colunas). Reaproveita os mesmos dados e o mesmo drawer de detalhe.
// A versão de PC não usa este componente, então ela não muda.
import { Fragment, useMemo, useState } from "react";
import type { KanbanCard } from "@/lib/pos/types";
import { PHASE_COLORS, PHASE_SHORT } from "./PhaseAccordion";
import { PHASES } from "@/lib/pos/constants";

// Ordem canônica das fases (Concluída/Cancelada por último). Fase desconhecida vai pro fim.
const ordemFase = (s: string) => { const i = PHASES.indexOf(s); return i === -1 ? 998 : i; };

interface Props {
  orders: KanbanCard[];
  searchTerm: string;
  onSearchChange: (v: string) => void;
  onCardClick: (order: KanbanCard) => void;
  onNewOS: () => void;
  podeCriar: boolean;
  loading: boolean;
}

const cor = (s: string) => PHASE_COLORS[s] || "#64748b";
const curto = (s: string) => PHASE_SHORT[s] || s;
const dataBR = (d: string) => {
  if (!d) return "";
  const p = d.split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : d;
};

export default function PosMobile({ orders, searchTerm, onSearchChange, onCardClick, onNewOS, podeCriar, loading }: Props) {
  const [fase, setFase] = useState<string>("TODAS");

  // Fases presentes (com contagem), na ordem que aparecem.
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
        return `${o.id} ${o.cliente} ${o.tecnico} ${o.servSolicitado}`.toLowerCase().includes(q);
      })
      // Mesma ordem do PC: agrupadas por fase (Concluída/Cancelada por último),
      // nunca misturando cancelada com aberta. Sort estável mantém a ordem dentro da fase.
      .sort((a, b) => ordemFase(a.status) - ordemFase(b.status));
  }, [orders, fase, searchTerm]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 64px)", background: "#f1f5f9" }}>
      {/* Topo fixo: título + busca */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "12px 14px 10px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: "#0f172a" }}>Ordens de Serviço</span>
          <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>{filtradas.length}</span>
        </div>
        <div style={{ position: "relative" }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 15 }} />
          <input value={searchTerm} onChange={(e) => onSearchChange(e.target.value)} placeholder="Buscar OS, cliente, técnico…"
            style={{ width: "100%", padding: "12px 14px 12px 40px", borderRadius: 12, border: "1.5px solid #e2e8f0", fontSize: 16, outline: "none", boxSizing: "border-box", background: "#f8fafc" }} />
          {searchTerm && (
            <button onClick={() => onSearchChange("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}><i className="fas fa-times" /></button>
          )}
        </div>
      </div>

      {/* Fase — dropdown (mais limpo no celular que a fila de chips) */}
      <div style={{ padding: "10px 14px", background: "#fff", borderBottom: "1px solid #eef2f7", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: fase === "TODAS" ? "#0f172a" : cor(fase), flexShrink: 0 }} />
        <select value={fase} onChange={(e) => setFase(e.target.value)}
          style={{ flex: 1, padding: "11px 12px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 15, background: "#f8fafc", color: "#0f172a", fontWeight: 600, outline: "none" }}>
          <option value="TODAS">Todas as fases ({orders.length})</option>
          {fasesPresentes.map(([s, n]) => <option key={s} value={s}>{curto(s)} ({n})</option>)}
        </select>
      </div>

      {/* Lista de cartões */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px 96px", WebkitOverflowScrolling: "touch" }}>
        {loading && orders.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}><i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }} />Carregando…</div>
        ) : filtradas.length === 0 ? (
          <div style={{ textAlign: "center", padding: 50, color: "#94a3b8" }}>
            <i className="fas fa-inbox" style={{ fontSize: 34, display: "block", marginBottom: 12, color: "#cbd5e1" }} />
            Nenhuma OS {fase !== "TODAS" ? "nesta fase" : ""}{searchTerm ? " para essa busca" : ""}.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtradas.map((o, idx) => {
              const c = cor(o.status);
              const atraso = Number(o.diasAtraso) || 0;
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
                <button onClick={() => onCardClick(o)} style={{
                  textAlign: "left", display: "flex", padding: 0, borderRadius: 14, border: "1px solid #e7ebf0", background: "#fff", cursor: "pointer",
                  overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
                }}>
                  <div style={{ width: 5, background: c, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, padding: "13px 14px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 15.5, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.cliente || "Sem cliente"}</span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a", flexShrink: 0 }}>R$ {o.valor || "0,00"}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "7px 0", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: `${c}18`, color: c }}>{curto(o.status)}</span>
                      {atraso > 0 && <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: "#fee2e2", color: "#dc2626" }}><i className="fas fa-clock" style={{ marginRight: 4 }} />{atraso}d atraso</span>}
                      {o.servicoInterno && <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "#eef2ff", color: "#4338ca" }}>INTERNA</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12.5, color: "#64748b", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, color: "#dc2626" }}>{o.id}</span>
                      {o.tecnico && <span><i className="fas fa-user-gear" style={{ marginRight: 4, opacity: .7 }} />{o.tecnico}</span>}
                      {o.data && <span><i className="fas fa-calendar" style={{ marginRight: 4, opacity: .7 }} />{dataBR(o.data)}</span>}
                      <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                        {o.temPPV && <i className="fas fa-boxes" style={{ color: "#dc2626" }} title="Tem PPV" />}
                        {o.temReq && <i className="fas fa-clipboard-list" style={{ color: "#f97316" }} title="Tem requisição" />}
                        {o.temRel && <i className="fas fa-file-lines" style={{ color: "#0ea5e9" }} title="Tem relatório" />}
                      </span>
                    </div>
                  </div>
                </button>
                </Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Botão flutuante Nova OS */}
      {podeCriar && (
        <button onClick={onNewOS} title="Nova OS" style={{
          position: "fixed", right: 18, bottom: 22, zIndex: 20, width: 58, height: 58, borderRadius: "50%", border: "none",
          background: "#dc2626", color: "#fff", fontSize: 24, cursor: "pointer", boxShadow: "0 8px 22px rgba(220,38,38,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <i className="fas fa-plus" />
        </button>
      )}
    </div>
  );
}
