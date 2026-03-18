"use client";

import { PHASES } from "@/lib/pos/constants";
import type { KanbanCard } from "@/lib/pos/types";

interface FilterBarProps {
  orders: KanbanCard[];
  activePhase: string;
  onPhaseChange: (phase: string) => void;
}

export default function FilterBar({ orders, activePhase, onPhaseChange }: FilterBarProps) {
  return (
    <div className="filter-bar">
      {PHASES.map((phase) => {
        const count = orders.filter((o) => o.status === phase).length;
        return (
          <button key={phase} className={`filter-btn ${activePhase === phase ? "active" : ""}`} onClick={() => onPhaseChange(phase)} title={phase}>
            {phase.toUpperCase()} <span className="badge">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
