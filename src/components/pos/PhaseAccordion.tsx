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
  "Relatório Concluído - Garantia": "#0D9488",
  "Enviar Omie": "#F59E0B",
  "Enviado Para Omie": "#0EA5E9",
  "Preenchido Garantia": "#14B8A6",
  "Executada aguardando comercial": "#C084FC",
  "Concluída": "#10B981",
  "Cancelada": "#EF4444",
};

// Seção virtual do quadro: as ordens na fase "Relatório Concluído" que têm
// garantia são separadas neste grupo próprio (não é um status real do banco).
const FASE_CONCLUIDO = "Relatório Concluído";
const FASE_CONCLUIDO_GAR = "Relatório Concluído - Garantia";

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
  "Enviar Omie": "Enviar Omie",
  "Enviado Para Omie": "Enviado Omie",
  "Preenchido Garantia": "Preench. Garantia",
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

const MiniCard = memo(function MiniCard({ order: o, color, onClick, onPhaseChange, garantiaStatus, onDescEnter, onDescLeave }: { order: KanbanCard; color: string; onClick: () => void; onPhaseChange?: (orderId: string, newPhase: string) => void; garantiaStatus?: GarantiaStatus; onDescEnter?: (rect: DOMRect, texto: string) => void; onDescLeave?: () => void }) {
  const diasFase = diasEntre(o.dataFase);
  const borderStyle = useMemo(() => ({ borderLeftColor: color }), [color]);

  const temReqInfo = o.reqInfo && o.reqInfo.length > 0;

  return (
    <div className="mini-card" style={{ ...borderStyle, position: "relative", overflow: "visible" }} onClick={onClick}
      onMouseEnter={(e) => onDescEnter?.(e.currentTarget.getBoundingClientRect(), o.servSolicitado || "")}
      onMouseLeave={() => onDescLeave?.()}>
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
          {o.temPPV && <i className="fas fa-box" style={S_ICON_COLOR} title="PPV vinculado" />}

          {/* Ícone REQ — tooltip no hover */}
          <span className="mc-icon-wrap" onClick={(e) => e.stopPropagation()}>
            <i className="fas fa-shopping-cart" title={o.temReq ? "Requisição vinculada" : "Sem requisição"} style={{ color: o.temReq ? "#1E3A5F" : "var(--border)" }} />
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
            <i className="fas fa-file-alt" title={o.temRel ? "Relatório técnico anexado" : "Sem relatório técnico"} style={{ color: o.temRel ? "#1E3A5F" : "var(--border)" }} />
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
            <i className="fas fa-shield-halved" title={garantiaStatus ? `Garantia: ${STATUS_LABEL[garantiaStatus]}` : "Sem garantia"} style={{ color: garantiaStatus ? (STATUS_COR[garantiaStatus] || "#1E3A5F") : "var(--border)" }} />
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

// Fases abertas por padrão; só "Concluída" e "Cancelada" começam fechadas.
const COLLAPSED_DEFAULT = new Set(["Concluída", "Cancelada"]);
// Fases que aparecem no quadro mas SEM mostrar a contagem no cabeçalho.
const SEM_CONTAGEM = new Set(["Concluída", "Cancelada"]);

export default function PhaseView({ orders, searchTerm, onCardClick, onPhaseChange }: PhaseViewProps) {
  const [activePhase, setActivePhase] = useState<string>("");
  const [escopo, setEscopo] = useState<"externas" | "internas">("externas");
  const [tecnicoFiltro, setTecnicoFiltro] = useState<string>("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(COLLAPSED_DEFAULT));
  const [garantiaMap, setGarantiaMap] = useState<Record<string, GarantiaStatus>>({});
  // Tooltip com a Descrição do Serviço completa ao passar o mouse no card
  const [descTip, setDescTip] = useState<{ texto: string; top: number; left: number } | null>(null);

  // Separa ordens externas (vão pro Omie) das internas (só remessa quando precisar)
  const totInternas = useMemo(() => orders.filter((o) => o.servicoInterno).length, [orders]);
  const totExternas = orders.length - totInternas;
  const escopoOrders = useMemo(
    () => orders.filter((o) => (escopo === "internas" ? !!o.servicoInterno : !o.servicoInterno)),
    [orders, escopo]
  );

  // Lista de técnicos disponíveis no escopo atual (para o filtro)
  const tecnicos = useMemo(() => {
    const set = new Set<string>();
    for (const o of escopoOrders) { const t = (o.tecnico || "").trim(); if (t) set.add(t); }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [escopoOrders]);

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

  // Mostra o tooltip da descrição ao lado do card (posição fixa, fora do fluxo)
  const onDescEnter = useCallback((rect: DOMRect, texto: string) => {
    if (!texto || !texto.trim()) { setDescTip(null); return; }
    const TW = 320;
    const left = rect.right + 12 + TW <= window.innerWidth ? rect.right + 12 : Math.max(12, rect.left - TW - 12);
    const top = Math.max(12, Math.min(rect.top, window.innerHeight - 260));
    setDescTip({ texto, top, left });
  }, []);
  const onDescLeave = useCallback(() => setDescTip(null), []);

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
        (!activePhase || o.status === activePhase) &&
        (!tecnicoFiltro || (o.tecnico || "").trim() === tecnicoFiltro)
    );
  }, [escopoOrders, searchLower, activePhase, tecnicoFiltro]);


  // Group by phase for "Todas" view
  const grouped = useMemo(() => {
    if (activePhase) return null;
    const map: Record<string, KanbanCard[]> = {};
    const phasesSet = new Set(PHASES);
    for (const phase of PHASES) {
      const items = filtered.filter((o) => o.status === phase);
      if (phase === FASE_CONCLUIDO) {
        // separa as concluídas: sem garantia ficam na fase; com garantia vão pro grupo próprio
        const semGar = items.filter((o) => !garantiaMap[o.id]);
        const comGar = items.filter((o) => garantiaMap[o.id]);
        if (semGar.length > 0) map[FASE_CONCLUIDO] = semGar;
        if (comGar.length > 0) map[FASE_CONCLUIDO_GAR] = comGar;
      } else if (phase === "Enviar Omie" || phase === "Enviado Para Omie" || phase === "Preenchido Garantia" || items.length > 0) {
        // As filas do Tratorilson aparecem sempre (mesmo vazias).
        map[phase] = items;
      }
    }
    // Ordens com status desconhecido — não deixa sumir
    const orphans = filtered.filter((o) => !phasesSet.has(o.status));
    if (orphans.length > 0) map["Outros"] = orphans;
    return map;
  }, [filtered, activePhase, garantiaMap]);

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
              <button key={t.v} onClick={() => { setEscopo(t.v); setActivePhase(""); setTecnicoFiltro(""); }}
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

        {/* Filtro por técnico */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <i className="fas fa-user-cog" style={{ color: "var(--portal-text-secondary)", fontSize: 13 }} />
          <select
            value={tecnicoFiltro}
            onChange={(e) => setTecnicoFiltro(e.target.value)}
            title="Filtrar por técnico"
            style={{
              padding: "8px 12px", borderRadius: 8,
              border: tecnicoFiltro ? "1.5px solid #1E3A5F" : "1.5px solid var(--border)",
              background: "#fff", color: "var(--portal-text)", fontWeight: 600, fontSize: 13,
              cursor: "pointer", maxWidth: 240,
            }}
          >
            <option value="">Todos os técnicos</option>
            {tecnicos.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {tecnicoFiltro && (
            <button
              onClick={() => setTecnicoFiltro("")}
              title="Limpar filtro de técnico"
              style={{ border: "none", background: "transparent", color: "var(--portal-text-secondary)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 4 }}
            >
              <i className="fas fa-times" />
            </button>
          )}
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
                onDescEnter={onDescEnter}
                onDescLeave={onDescLeave}
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
                {!SEM_CONTAGEM.has(phase) && <span className="phase-group-count">{items.length}</span>}
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
                      onDescEnter={onDescEnter}
                      onDescLeave={onDescLeave}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </main>

      {/* Tooltip: Descrição do Serviço completa ao passar o mouse no card */}
      {descTip && (
        <div style={{
          position: "fixed", top: descTip.top, left: descTip.left, width: 320, maxHeight: "50vh", overflowY: "auto",
          zIndex: 100000, pointerEvents: "none", background: "#0f172a", color: "#e2e8f0",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.35)", padding: "12px 14px",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#fbbf24", marginBottom: 6 }}>Descrição do Serviço</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{descTip.texto}</div>
        </div>
      )}
    </>
  );
}
