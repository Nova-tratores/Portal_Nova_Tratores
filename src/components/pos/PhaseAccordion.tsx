"use client";

import { useState, useMemo, memo, useCallback } from "react";
import { PHASES } from "@/lib/pos/constants";
import { diasEntre } from "@/lib/pos/utils";
import type { KanbanCard } from "@/lib/pos/types";

interface PhaseViewProps {
  orders: KanbanCard[];
  searchTerm: string;
  onCardClick: (order: KanbanCard) => void;
  onPhaseChange?: (orderId: string, newPhase: string) => void;
}

const PHASE_COLORS: Record<string, string> = {
  "Orçamento": "#3B82F6",
  "Orçamento enviado para o cliente e aguardando": "#60A5FA",
  "Aguardando ordem Técnico": "#0EA5E9",
  "Execução": "#F59E0B",
  "Execução (Realizando Diagnóstico)": "#F97316",
  "Execução aguardando peças (em transporte)": "#FB923C",
  "Relatório Atualizado": "#06B6D4",
  "Aguardando outros": "#A855F7",
  "Executada": "#8B5CF6",
  "Relatório Concluído": "#A78BFA",
  "Executada aguardando comercial": "#C084FC",
  "Concluída": "#10B981",
  "Cancelada": "#EF4444",
};

const PHASE_SHORT: Record<string, string> = {
  "Orçamento": "Orçamento",
  "Orçamento enviado para o cliente e aguardando": "Orç. Enviado",
  "Aguardando ordem Técnico": "Aguard. Técnico",
  "Execução": "Execução",
  "Execução (Realizando Diagnóstico)": "Diagnóstico",
  "Execução aguardando peças (em transporte)": "Aguard. Peças",
  "Relatório Atualizado": "Rel. Atualizado",
  "Aguardando outros": "Aguard. Outros",
  "Executada": "Executada",
  "Relatório Concluído": "Rel. Concluído",
  "Executada aguardando comercial": "Aguard. Comercial",
  "Concluída": "Concluída",
  "Cancelada": "Cancelada",
};

const S_ICON_COLOR = { color: "#1E3A5F" } as const;

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

const MiniCard = memo(function MiniCard({ order: o, color, onClick, onPhaseChange }: { order: KanbanCard; color: string; onClick: () => void; onPhaseChange?: (orderId: string, newPhase: string) => void }) {
  const diasFase = diasEntre(o.dataFase);
  const borderStyle = useMemo(() => ({ borderLeftColor: color }), [color]);

  const temReqInfo = o.reqInfo && o.reqInfo.length > 0;

  return (
    <div className="mini-card" style={{ ...borderStyle, position: "relative", overflow: "visible" }} onClick={onClick}>
      {onPhaseChange && (
        <div className="mini-card-phase" onClick={(e) => e.stopPropagation()}>
          <select
            value={o.status}
            onChange={(e) => onPhaseChange(o.id, e.target.value)}
            className="mini-card-phase-select"
          >
            {PHASES.map((p) => (
              <option key={p} value={p}>{PHASE_SHORT[p] || p}</option>
            ))}
          </select>
        </div>
      )}
      <div className="mini-card-top">
        <span className="mini-card-id">#{o.id}</span>
        <span className="mini-card-valor">R$ {o.valor}</span>
      </div>
      <div className="mini-card-cliente">{o.cliente}</div>
      <div className="mini-card-servico">{o.servSolicitado}</div>
      {(o.previsaoExecucao || o.previsaoFaturamento) && (
        <div className="mini-card-dates">
          {o.previsaoExecucao && (
            <span className="mini-card-date exec"><i className="fas fa-wrench" /> {formatDateBR(o.previsaoExecucao)}</span>
          )}
          {o.previsaoFaturamento && (
            <span className="mini-card-date fat"><i className="fas fa-file-invoice-dollar" /> {formatDateBR(o.previsaoFaturamento)}</span>
          )}
        </div>
      )}
      {o.diasAtraso > 0 && !['execu', 'orçamento', 'orcamento', 'aguardando cliente'].some(s => (o.status || '').toLowerCase().includes(s)) && (
        <div className="mini-card-atraso">
          <i className="fas fa-exclamation-circle" /> {o.diasAtraso}d atrasado — cobrar {o.tecnico}
        </div>
      )}
      <div className="mini-card-bottom">
        <span className="mini-card-tecnico"><i className="fas fa-user-cog" /> {o.tecnico}</span>
        <span className="mini-card-dias">{diasFase}d</span>
        <span className="mini-card-icons">
          {o.temPPV && <i className="fas fa-box" style={S_ICON_COLOR} />}

          {/* Ícone REQ — tooltip no hover */}
          <span className="mc-icon-wrap" onClick={(e) => e.stopPropagation()}>
            <i className="fas fa-shopping-cart" style={{ color: o.temReq ? "#1E3A5F" : "var(--border)" }} />
            {temReqInfo && (
              <div className="mc-tooltip">
                <div className="mc-tooltip-arrow" />
                <div style={{ fontSize: 9, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Requisições ({o.reqInfo!.length})
                </div>
                {o.reqInfo!.map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <span style={{ fontWeight: 700, color: "#fbbf24" }}>#{r.id}</span>
                    <span style={{ fontWeight: 700, color: "#34d399" }}>
                      R$ {r.valor.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </span>

          {/* Ícone REL — tooltip no hover */}
          <span className="mc-icon-wrap" onClick={(e) => e.stopPropagation()}>
            <i className="fas fa-file-alt" style={{ color: o.temRel ? "#1E3A5F" : "var(--border)" }} />
            {o.temRel && (
              <div className="mc-tooltip">
                <div className="mc-tooltip-arrow" />
                <div style={{ fontSize: 9, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                  Relatório Técnico
                </div>
                <div style={{ color: "#e2e8f0", fontSize: 12 }}>
                  {o.relTecnico ? (
                    <>Preenchido por <span style={{ fontWeight: 700, color: "#60a5fa" }}>{o.relTecnico}</span></>
                  ) : "Relatório anexado"}
                </div>
              </div>
            )}
          </span>
        </span>
      </div>
    </div>
  );
});

const COLLAPSED_DEFAULT = new Set(["Concluída", "Cancelada"]);

export default function PhaseView({ orders, searchTerm, onCardClick, onPhaseChange }: PhaseViewProps) {
  const [activePhase, setActivePhase] = useState<string>("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(COLLAPSED_DEFAULT));

  const toggleCollapse = useCallback((phase: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }, []);

  // Pre-compute lowercase search term once
  const searchLower = useMemo(() => searchTerm.toLowerCase(), [searchTerm]);

  const filtered = useMemo(() => {
    return orders.filter(
      (o) =>
        (!searchLower ||
          o.cliente.toLowerCase().includes(searchLower) ||
          o.id.includes(searchLower) ||
          o.servSolicitado.toLowerCase().includes(searchLower)) &&
        (!activePhase || o.status === activePhase)
    );
  }, [orders, searchLower, activePhase]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of orders) {
      map[o.status] = (map[o.status] || 0) + 1;
    }
    return map;
  }, [orders]);

  // Group by phase for "Todas" view
  const grouped = useMemo(() => {
    if (activePhase) return null;
    const map: Record<string, KanbanCard[]> = {};
    for (const phase of PHASES) {
      const items = filtered.filter((o) => o.status === phase);
      if (items.length > 0) map[phase] = items;
    }
    return map;
  }, [filtered, activePhase]);

  // Stable click handlers per card (avoid inline arrow in .map)
  const handleCardClick = useCallback((o: KanbanCard) => onCardClick(o), [onCardClick]);

  return (
    <>
      {/* Phase tabs */}
      <div className="phase-tabs">
        <button
          className={`phase-tab ${activePhase === "" ? "active" : ""}`}
          onClick={() => setActivePhase("")}
        >
          Todas <span className="phase-tab-count">{orders.length}</span>
        </button>
        {PHASES.map((phase) => (
          <button
            key={phase}
            className={`phase-tab ${activePhase === phase ? "active" : ""}`}
            onClick={() => setActivePhase(activePhase === phase ? "" : phase)}
            style={{ "--tab-color": PHASE_COLORS[phase] || "#64748B" } as React.CSSProperties}
          >
            <span className="phase-tab-dot" style={{ background: PHASE_COLORS[phase] }} />
            {PHASE_SHORT[phase] || phase}
            <span className="phase-tab-count">{counts[phase] || 0}</span>
          </button>
        ))}
      </div>

      {/* Cards */}
      <main className="cards-wrapper">
        {activePhase ? (
          /* Single phase grid */
          <div className="cards-grid">
            {filtered.map((o) => (
              <MiniCard
                key={o.id}
                order={o}
                color={PHASE_COLORS[o.status] || "#64748B"}
                onClick={() => handleCardClick(o)}
                onPhaseChange={onPhaseChange}
              />
            ))}
            {filtered.length === 0 && (
              <div className="cards-empty">Nenhuma ordem nesta fase</div>
            )}
          </div>
        ) : (
          /* Grouped view */
          grouped && Object.entries(grouped).map(([phase, items]) => (
            <div key={phase} className="phase-group">
              <div className="phase-group-header" onClick={() => toggleCollapse(phase)} style={{ cursor: "pointer" }}>
                <span className="phase-group-chevron" style={{ display: "inline-block", transition: "transform 0.2s", transform: collapsed.has(phase) ? "rotate(-90deg)" : "rotate(0deg)", marginRight: 6 }}>
                  <i className="fas fa-chevron-down" />
                </span>
                <span className="phase-group-dot" style={{ background: PHASE_COLORS[phase] }} />
                <span className="phase-group-name">{phase}</span>
                <span className="phase-group-count">{items.length}</span>
                <div className="phase-group-line" />
              </div>
              {!collapsed.has(phase) && (
                <div className="cards-grid">
                  {items.map((o) => (
                    <MiniCard
                      key={o.id}
                      order={o}
                      color={PHASE_COLORS[phase] || "#64748B"}
                      onClick={() => handleCardClick(o)}
                      onPhaseChange={onPhaseChange}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </main>
    </>
  );
}
