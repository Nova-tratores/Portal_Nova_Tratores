"use client";

import { useState, useMemo } from "react";
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
  "Execução Procurando peças": "#F97316",
  "Execução aguardando peças (em transporte)": "#FB923C",
  "Aguardando outros": "#A855F7",
  "Executada": "#8B5CF6",
  "Executada aguardando cliente": "#A78BFA",
  "Executada aguardando comercial": "#C084FC",
  "Concluída": "#10B981",
  "Cancelada": "#EF4444",
};

const PHASE_SHORT: Record<string, string> = {
  "Orçamento": "Orçamento",
  "Orçamento enviado para o cliente e aguardando": "Orç. Enviado",
  "Aguardando ordem Técnico": "Aguard. Técnico",
  "Execução": "Execução",
  "Execução Procurando peças": "Proc. Peças",
  "Execução aguardando peças (em transporte)": "Aguard. Peças",
  "Aguardando outros": "Aguard. Outros",
  "Executada": "Executada",
  "Executada aguardando cliente": "Aguard. Cliente",
  "Executada aguardando comercial": "Aguard. Comercial",
  "Concluída": "Concluída",
  "Cancelada": "Cancelada",
};

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function MiniCard({ order: o, color, onClick, onPhaseChange }: { order: KanbanCard; color: string; onClick: () => void; onPhaseChange?: (orderId: string, newPhase: string) => void }) {
  const diasFase = diasEntre(o.dataFase);

  return (
    <div className="mini-card" style={{ borderLeftColor: color }} onClick={onClick}>
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
      {o.diasAtraso > 0 && (
        <div className="mini-card-atraso">
          <i className="fas fa-exclamation-circle" /> {o.diasAtraso}d atrasado — cobrar {o.tecnico}
        </div>
      )}
      <div className="mini-card-bottom">
        <span className="mini-card-tecnico"><i className="fas fa-user-cog" /> {o.tecnico}</span>
        <span className="mini-card-dias">{diasFase}d</span>
        <span className="mini-card-icons">
          {o.temPPV && <i className="fas fa-box" style={{ color: "#1E3A5F" }} />}
          {o.temReq && <i className="fas fa-shopping-cart" style={{ color: "#1E3A5F" }} />}
          {o.temRel && <i className="fas fa-file-alt" style={{ color: "#1E3A5F" }} />}
        </span>
      </div>
    </div>
  );
}

const COLLAPSED_DEFAULT = new Set(["Concluída", "Cancelada"]);

export default function PhaseView({ orders, searchTerm, onCardClick, onPhaseChange }: PhaseViewProps) {
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
          o.cliente.toLowerCase().includes(term) ||
          o.id.includes(term) ||
          o.servSolicitado.toLowerCase().includes(term)) &&
        (!activePhase || o.status === activePhase)
    );
  }, [orders, searchTerm, activePhase]);

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
                onClick={() => onCardClick(o)}
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
                      onClick={() => onCardClick(o)}
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
