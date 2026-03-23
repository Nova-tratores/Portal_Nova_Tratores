"use client";

import { useState, useMemo, memo } from "react";
import type { KanbanItem } from "@/lib/ppv/types";
import { normalizarStatus, formatarDataFrontend, formatarMoeda } from "@/lib/ppv/utils";
import { STATUS_COLORS, STATUS_OPTIONS, type StatusKey } from "@/lib/ppv/constants";

interface PhaseViewProps {
  orders: KanbanItem[];
  searchTerm: string;
  onCardClick: (id: string) => void;
  onStatusChange?: (id: string, newStatus: string) => void;
  loading?: boolean;
}

const PHASE_COLORS: Record<string, string> = {
  Aguardando: "#C2410C",
  "Em Andamento": "#1D4ED8",
  "Aguardando Para Faturar": "#8B5CF6",
  Fechado: "#047857",
  Cancelado: "#B91C1C",
};

const PHASES = STATUS_OPTIONS.map((s) => s.value);

const PHASE_SHORT: Record<string, string> = {
  Aguardando: "Aguardando",
  "Em Andamento": "Em Andamento",
  "Aguardando Para Faturar": "Aguar. Faturar",
  Fechado: "Fechado",
  Cancelado: "Cancelado",
};

const COLLAPSED_DEFAULT = new Set(["Fechado", "Cancelado"]);

const MiniCard = memo(function MiniCard({
  order: o,
  color,
  onClick,
  onStatusChange,
}: {
  order: KanbanItem;
  color: string;
  onClick: () => void;
  onStatusChange?: (id: string, newStatus: string) => void;
}) {
  const statusNorm = normalizarStatus(o.status);
  const valorFmt = o.valor ? formatarMoeda(parseFloat(String(o.valor))) : "R$ 0,00";
  const dataFmt = formatarDataFrontend(o.data);
  const isTipoRem = (o.tipo || "").toLowerCase().includes("remessa") || (o.tipo || "").toUpperCase() === "REM";

  return (
    <div className="ppv-mini-card" style={{ borderLeftColor: color }} onClick={onClick}>
      {onStatusChange && (
        <div className="ppv-mini-card-phase" onClick={(e) => e.stopPropagation()}>
          <select
            value={statusNorm}
            onChange={(e) => onStatusChange(o.id, e.target.value)}
            className="ppv-mini-card-phase-select"
          >
            {PHASES.map((p) => (
              <option key={p} value={p}>{PHASE_SHORT[p] || p}</option>
            ))}
          </select>
        </div>
      )}
      <div className="ppv-mini-card-top">
        <span className="ppv-mini-card-id">#{o.id}</span>
        <span className="ppv-mini-card-valor">{valorFmt}</span>
      </div>
      <div className="ppv-mini-card-cliente">{o.cliente || "Sem Cliente"}</div>
      {o.observacao && <div className="ppv-mini-card-obs">{o.observacao}</div>}
      <div className="ppv-mini-card-bottom">
        <span className="ppv-mini-card-tecnico"><i className="fas fa-user-cog" /> {o.tecnico || "?"}</span>
        <span className="ppv-mini-card-data"><i className="far fa-calendar" /> {dataFmt}</span>
        <span className={`ppv-mini-card-tipo ${isTipoRem ? "rem" : ""}`}>
          {isTipoRem ? "REM" : "PPV"}
        </span>
      </div>
    </div>
  );
});

function SkeletonCards() {
  return (
    <div className="ppv-cards-grid">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="ppv-mini-card" style={{ borderLeftColor: "#E2E8F0", opacity: 0.6 }}>
          <div style={{ height: 12, width: "40%", background: "#E2E8F0", borderRadius: 4, marginBottom: 10 }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <div style={{ height: 14, width: "30%", background: "#E2E8F0", borderRadius: 4 }} />
            <div style={{ height: 14, width: "25%", background: "#E2E8F0", borderRadius: 4 }} />
          </div>
          <div style={{ height: 14, width: "70%", background: "#E2E8F0", borderRadius: 4, marginBottom: 12 }} />
          <div style={{ borderTop: "1px dashed #E2E8F0", paddingTop: 10, display: "flex", gap: 12 }}>
            <div style={{ height: 12, width: "35%", background: "#E2E8F0", borderRadius: 4 }} />
            <div style={{ height: 12, width: "25%", background: "#E2E8F0", borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PhaseView({ orders, searchTerm, onCardClick, onStatusChange, loading }: PhaseViewProps) {
  const [activePhase, setActivePhase] = useState<string>("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(COLLAPSED_DEFAULT));

  const toggleCollapse = (phase: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return orders.filter(
      (o) =>
        (!term ||
          (o.cliente || "").toLowerCase().includes(term) ||
          (o.id || "").toLowerCase().includes(term) ||
          (o.tecnico || "").toLowerCase().includes(term)) &&
        (!activePhase || normalizarStatus(o.status) === activePhase)
    );
  }, [orders, searchTerm, activePhase]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of orders) {
      const norm = normalizarStatus(o.status);
      map[norm] = (map[norm] || 0) + 1;
    }
    return map;
  }, [orders]);

  const grouped = useMemo(() => {
    if (activePhase) return null;
    const map: Record<string, KanbanItem[]> = {};
    for (const phase of PHASES) {
      const items = filtered.filter((o) => normalizarStatus(o.status) === phase);
      if (items.length > 0) map[phase] = items;
    }
    return map;
  }, [filtered, activePhase]);

  return (
    <>
      {/* Phase tabs */}
      <div className="ppv-phase-tabs">
        <button
          className={`ppv-phase-tab ${activePhase === "" ? "active" : ""}`}
          onClick={() => setActivePhase("")}
        >
          Todas <span className="ppv-phase-tab-count">{orders.length}</span>
        </button>
        {PHASES.map((phase) => (
          <button
            key={phase}
            className={`ppv-phase-tab ${activePhase === phase ? "active" : ""}`}
            onClick={() => setActivePhase(activePhase === phase ? "" : phase)}
            style={{ "--tab-color": PHASE_COLORS[phase] || "#64748B" } as React.CSSProperties}
          >
            <span className="ppv-phase-tab-dot" style={{ background: PHASE_COLORS[phase] }} />
            {PHASE_SHORT[phase] || phase}
            <span className="ppv-phase-tab-count">{counts[phase] || 0}</span>
          </button>
        ))}
      </div>

      {/* Cards */}
      <main className="ppv-cards-wrapper">
        {loading ? (
          <SkeletonCards />
        ) : activePhase ? (
          <div className="ppv-cards-grid">
            {filtered.map((o) => (
              <MiniCard
                key={o.id}
                order={o}
                color={PHASE_COLORS[normalizarStatus(o.status)] || "#64748B"}
                onClick={() => onCardClick(o.id)}
                onStatusChange={onStatusChange}
              />
            ))}
            {filtered.length === 0 && (
              <div className="ppv-cards-empty">Nenhum pedido nesta fase</div>
            )}
          </div>
        ) : (
          grouped && Object.entries(grouped).map(([phase, items]) => (
            <div key={phase} className="ppv-phase-group">
              <div className="ppv-phase-group-header" onClick={() => toggleCollapse(phase)}>
                <span style={{ display: "inline-block", transition: "transform 0.2s", transform: collapsed.has(phase) ? "rotate(-90deg)" : "rotate(0deg)", marginRight: 6 }}>
                  <i className="fas fa-chevron-down" />
                </span>
                <span className="ppv-phase-group-dot" style={{ background: PHASE_COLORS[phase] }} />
                <span className="ppv-phase-group-name">{phase}</span>
                <span className="ppv-phase-group-count">{items.length}</span>
                <div className="ppv-phase-group-line" />
              </div>
              {!collapsed.has(phase) && (
                <div className="ppv-cards-grid">
                  {items.map((o) => (
                    <MiniCard
                      key={o.id}
                      order={o}
                      color={PHASE_COLORS[phase] || "#64748B"}
                      onClick={() => onCardClick(o.id)}
                      onStatusChange={onStatusChange}
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
