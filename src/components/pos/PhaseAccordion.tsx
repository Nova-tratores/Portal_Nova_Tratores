"use client";

import { useState, useMemo, memo, useCallback, useEffect } from "react";
import { PHASES } from "@/lib/pos/constants";
import { diasEntre } from "@/lib/pos/utils";
import type { KanbanCard } from "@/lib/pos/types";
import { STATUS_COR, STATUS_LABEL } from "@/lib/garantias/constants";
import type { GarantiaStatus } from "@/lib/garantias/types";

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

const MiniCard = memo(function MiniCard({ order: o, color, onClick, onPhaseChange, garantiaStatus }: { order: KanbanCard; color: string; onClick: () => void; onPhaseChange?: (orderId: string, newPhase: string) => void; garantiaStatus?: GarantiaStatus }) {
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
        {o.servicoInterno && (
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: "#7C3AED", background: "#F3E8FF", border: "1px solid #DDD6FE", borderRadius: 5, padding: "1px 6px", textTransform: "uppercase" }}>
            <i className="fas fa-tools" style={{ marginRight: 3 }} />Interna
          </span>
        )}
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

          {/* Ícone GARANTIA — tooltip no hover */}
          <span className="mc-icon-wrap" onClick={(e) => e.stopPropagation()}>
            <i className="fas fa-shield-halved" style={{ color: garantiaStatus ? (STATUS_COR[garantiaStatus] || "#1E3A5F") : "var(--border)" }} />
            {garantiaStatus && (
              <div className="mc-tooltip">
                <div className="mc-tooltip-arrow" />
                <div style={{ fontSize: 9, fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                  Garantia
                </div>
                <div style={{ color: "#e2e8f0", fontSize: 12 }}>{STATUS_LABEL[garantiaStatus]}</div>
              </div>
            )}
          </span>
        </span>
      </div>
    </div>
  );
});

// Começa tudo colapsado pra não poluir — clica no cabeçalho da fase pra abrir.
const COLLAPSED_DEFAULT = new Set(PHASES);

export default function PhaseView({ orders, searchTerm, onCardClick, onPhaseChange }: PhaseViewProps) {
  const [activePhase, setActivePhase] = useState<string>("");
  const [escopo, setEscopo] = useState<"externas" | "internas">("externas");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(COLLAPSED_DEFAULT));
  const [garantiaMap, setGarantiaMap] = useState<Record<string, GarantiaStatus>>({});

  // Separa ordens externas (vão pro Omie) das internas (só remessa quando precisar)
  const totInternas = useMemo(() => orders.filter((o) => o.servicoInterno).length, [orders]);
  const totExternas = orders.length - totInternas;
  const escopoOrders = useMemo(
    () => orders.filter((o) => (escopo === "internas" ? !!o.servicoInterno : !o.servicoInterno)),
    [orders, escopo]
  );

  // Carrega quais OS têm garantia (para o ícone de escudo no card)
  useEffect(() => {
    fetch("/api/garantias")
      .then((r) => r.json())
      .then((d) => {
        const m: Record<string, GarantiaStatus> = {};
        for (const g of d.garantias || []) {
          if (g.id_ordem && !m[g.id_ordem]) m[g.id_ordem] = g.status;
        }
        setGarantiaMap(m);
      })
      .catch(() => {});
  }, []);

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
    return escopoOrders.filter(
      (o) =>
        (!searchLower ||
          o.cliente.toLowerCase().includes(searchLower) ||
          o.id.includes(searchLower) ||
          o.servSolicitado.toLowerCase().includes(searchLower)) &&
        (!activePhase || o.status === activePhase)
    );
  }, [escopoOrders, searchLower, activePhase]);


  // Group by phase for "Todas" view
  const grouped = useMemo(() => {
    if (activePhase) return null;
    const map: Record<string, KanbanCard[]> = {};
    const phasesSet = new Set(PHASES);
    for (const phase of PHASES) {
      const items = filtered.filter((o) => o.status === phase);
      if (items.length > 0) map[phase] = items;
    }
    // Ordens com status desconhecido — não deixa sumir
    const orphans = filtered.filter((o) => !phasesSet.has(o.status));
    if (orphans.length > 0) map["Outros"] = orphans;
    return map;
  }, [filtered, activePhase]);

  // Stable click handlers per card (avoid inline arrow in .map)
  const handleCardClick = useCallback((o: KanbanCard) => onCardClick(o), [onCardClick]);

  return (
    <>
      {/* Escopo: Externas x Internas — barra horizontal (boxed) */}
      <div style={{ padding: "12px 30px", display: "flex", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "inline-flex", gap: 4, background: "#EEF1F5", padding: 4, borderRadius: 10 }}>
          {([
            { v: "externas" as const, label: "Externas", icon: "fa-globe", count: totExternas, color: "#1E3A5F" },
            { v: "internas" as const, label: "Internas", icon: "fa-tools", count: totInternas, color: "#7C3AED" },
          ]).map((t) => {
            const active = escopo === t.v;
            return (
              <button key={t.v} onClick={() => { setEscopo(t.v); setActivePhase(""); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 22px", borderRadius: 8,
                  border: active ? `1.5px solid ${t.color}` : "1.5px solid transparent",
                  background: active ? "#fff" : "transparent",
                  color: active ? t.color : "var(--portal-text-secondary)",
                  fontWeight: 700, fontSize: 13, cursor: "pointer",
                  boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none", transition: "all 0.15s",
                }}>
                <i className={`fas ${t.icon}`} /> {t.label}
                <span style={{ background: active ? `${t.color}1f` : "rgba(0,0,0,0.06)", color: active ? t.color : "var(--portal-text-secondary)", padding: "1px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{t.count}</span>
              </button>
            );
          })}
        </div>
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
                garantiaStatus={garantiaMap[o.id]}
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
                      garantiaStatus={garantiaMap[o.id]}
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
