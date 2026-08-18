"use client";

import { useState, useMemo, memo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { KanbanItem } from "@/lib/ppv/types";
import { normalizarStatus, formatarDataFrontend, formatarMoeda } from "@/lib/ppv/utils";
import { STATUS_COLORS, STATUS_OPTIONS, rotuloStatus, type StatusKey } from "@/lib/ppv/constants";

// Preview do card no hover (com OS → descrição da OS + produtos; sem OS → produtos + observação)
interface HoverPreview {
  temOS: boolean;
  osId: string;
  osDescricao: string;
  observacao: string;
  produtos: { descricao: string; qtde: number }[];
}
const hoverCache = new Map<string, HoverPreview>();

interface PhaseViewProps {
  orders: KanbanItem[];
  searchTerm: string;
  onCardClick: (id: string) => void;
  onStatusChange?: (id: string, newStatus: string) => void;
  loading?: boolean;
  activePhase: string;
  onPhaseChange: (phase: string) => void;
  viewMode?: "cards" | "lista";
}

// Título do card: "Pré Pedido de Venda 0201" (ou "Remessa 0005").
function tituloPedido(o: KanbanItem): string {
  const isRem = (o.tipo || "").toLowerCase().includes("remessa") || (o.tipo || "").toUpperCase() === "REM";
  const numero = String(o.id || "").replace(/^(PPV|REM)-?/i, "");
  return `${isRem ? "Remessa" : "Pré Pedido de Venda"} ${numero}`;
}

export const PHASE_COLORS: Record<string, string> = {
  "Orçamento": "#B45309",
  "Orçamento enviado para o cliente e aguardando": "#C2410C",
  "Execução": "#1D4ED8",
  "Execução (Realizando Diagnóstico)": "#0369A1",
  "Execução aguardando peças (em transporte)": "#6D28D9",
  "Executada aguardando comercial": "#7C3AED",
  "Aguardando outros": "#CA8A04",
  "Aguardando ordem Técnico": "#D97706",
  "Relatório Concluído": "#0891B2",
  "Enviado Omie": "#C2570A",
  "Concluída": "#047857",
  "Cancelada": "#B91C1C",
};

export const PHASES = STATUS_OPTIONS.map((s) => s.value);

export const PHASE_SHORT: Record<string, string> = {
  "Orçamento": "Orçamento",
  "Orçamento enviado para o cliente e aguardando": "Orç. Enviado",
  "Execução": "Execução",
  "Execução (Realizando Diagnóstico)": "Diagnóstico",
  "Execução aguardando peças (em transporte)": "Aguar. Peças",
  "Executada aguardando comercial": "Aguar. Comercial",
  "Aguardando outros": "Aguar. Outros",
  "Aguardando ordem Técnico": "Aguar. Técnico",
  "Relatório Concluído": "Rel. Concluído",
  "Enviado Omie": "Enviado Omie",
  "Concluída": "Faturado",
  "Cancelada": "Cancelada",
};

// Fases abertas por padrão; só Concluída e Cancelada começam fechadas
// (fases sem nenhum pedido nem aparecem). Clica no cabeçalho pra abrir/fechar.
const COLLAPSED_DEFAULT = new Set(["Concluída", "Cancelada"]);

const MiniCard = memo(function MiniCard({
  order: o,
  onClick,
  onStatusChange,
  viewMode = "cards",
}: {
  order: KanbanItem;
  color?: string;
  onClick: () => void;
  onStatusChange?: (id: string, newStatus: string) => void;
  viewMode?: "cards" | "lista";
}) {
  const statusNorm = normalizarStatus(o.status);
  const valorFmt = o.valor ? formatarMoeda(parseFloat(String(o.valor))) : "R$ 0,00";
  const dataFmt = formatarDataFrontend(o.data);
  const isTipoRem = (o.tipo || "").toLowerCase().includes("remessa") || (o.tipo || "").toUpperCase() === "REM";
  const titulo = tituloPedido(o);
  const tituloColor = isTipoRem ? "#e8730c" : undefined; // Remessa em laranja p/ diferenciar
  const [dragging, setDragging] = useState(false);
  const dragStart = (e: React.DragEvent) => { e.dataTransfer.setData("ppv-id", o.id); e.dataTransfer.effectAllowed = "move"; setDragging(true); };
  const dragEnd = () => setDragging(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [preview, setPreview] = useState<HoverPreview | null>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);

  const onHoverEnter = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(async () => {
      const rect = cardRef.current?.getBoundingClientRect();
      if (!rect) return;
      const TW = 330;
      const left = rect.right + 12 + TW <= window.innerWidth ? rect.right + 12 : Math.max(12, rect.left - TW - 12);
      const top = Math.max(12, Math.min(rect.top, window.innerHeight - 340));
      setTipPos({ top, left });
      let data = hoverCache.get(o.id);
      if (!data) {
        try {
          const r = await fetch(`/api/ppv/hover?id=${encodeURIComponent(o.id)}`);
          if (r.ok) { data = await r.json() as HoverPreview; hoverCache.set(o.id, data); }
        } catch { /* ignore */ }
      }
      if (data) setPreview(data);
    }, 280);
  };
  const onHoverLeave = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setPreview(null);
    setTipPos(null);
  };
  useEffect(() => () => { if (hoverTimer.current) clearTimeout(hoverTimer.current); }, []);

  const previewPortal = preview && tipPos && typeof document !== "undefined" && createPortal(
        <div style={{
          position: "fixed", top: tipPos.top, left: tipPos.left, width: 330, maxHeight: "60vh", overflowY: "auto",
          zIndex: 100000, pointerEvents: "none", background: "#0f172a", color: "#e2e8f0",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.35)", padding: "12px 14px",
        }}>
          {preview.temOS && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#fbbf24", marginBottom: 6 }}>
                Descrição da OS #{preview.osId}
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 12 }}>
                {preview.osDescricao || "Sem descrição na OS."}
              </div>
            </>
          )}
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#60a5fa", marginBottom: 6 }}>
            Produtos ({preview.produtos.length})
          </div>
          {preview.produtos.length === 0 ? (
            <div style={{ fontSize: 12, color: "#94a3b8", fontStyle: "italic" }}>Nenhum produto.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {preview.produtos.map((p, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 3 }}>
                  <span style={{ wordBreak: "break-word" }}>{p.descricao}</span>
                  <span style={{ fontWeight: 700, color: "#34d399", whiteSpace: "nowrap" }}>x{p.qtde}</span>
                </div>
              ))}
            </div>
          )}
          {!preview.temOS && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#fbbf24", margin: "12px 0 6px" }}>
                Observação
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", color: preview.observacao ? "#e2e8f0" : "#94a3b8", fontStyle: preview.observacao ? "normal" : "italic" }}>
                {preview.observacao || "Sem observação."}
              </div>
            </>
          )}
        </div>,
        document.body
      );

  // ── Modo LISTA (linha compacta) ──
  if (viewMode === "lista") {
    return (
      <div ref={cardRef} className={`ppv-list-row ${dragging ? "dragging" : ""}`} draggable onDragStart={dragStart} onDragEnd={dragEnd} onClick={onClick} onMouseEnter={onHoverEnter} onMouseLeave={onHoverLeave}>
        <span className="ppv-list-titulo" style={{ color: tituloColor }}>{titulo}</span>
        <div className="ppv-list-cli">
          <span className="ppv-list-cliente">{o.cliente || "Sem Cliente"}</span>
          {o.observacao && (
            <span className="ppv-list-obs"><span className="ppv-list-lbl" style={{ marginRight: 5 }}>Observação</span>{o.observacao}</span>
          )}
        </div>
        <div className="ppv-list-field"><span className="ppv-list-lbl">Vendedor</span><span className="ppv-list-v">{o.tecnico || "?"}</span></div>
        <div className="ppv-list-field"><span className="ppv-list-lbl">Data</span><span className="ppv-list-v">{dataFmt}</span></div>
        <div className="ppv-list-field end"><span className="ppv-list-lbl">Valor</span><span className="ppv-list-valor">{valorFmt}</span></div>
        {previewPortal}
      </div>
    );
  }

  // ── Modo CARDS ──
  // Título: Nº em NEGRITO + cliente sem negrito; infos em LISTA embaixo (18/08)
  const numero = String(o.id || "").replace(/^(PPV|REM)-?/i, "");
  return (
    <div ref={cardRef} className={`ppv-mini-card ${dragging ? "dragging" : ""}`} draggable onDragStart={dragStart} onDragEnd={dragEnd} onClick={onClick} onMouseEnter={onHoverEnter} onMouseLeave={onHoverLeave}>
      <div className="ppv-mini-card-title" style={{ color: tituloColor }}>
        <b className="ppv-num-neon">{isTipoRem ? `REM ${numero}` : numero}</b>
        <span style={{ fontWeight: 400, color: "#334155" }}> — {o.cliente || "Sem Cliente"}</span>
      </div>
      {onStatusChange && (
        <div className="ppv-mini-card-phase" onClick={(e) => e.stopPropagation()}>
          <select value={statusNorm} onChange={(e) => onStatusChange(o.id, e.target.value)} className="ppv-mini-card-phase-select">
            {PHASES.map((p) => (<option key={p} value={p}>{PHASE_SHORT[p] || p}</option>))}
          </select>
        </div>
      )}
      {/* Informações em LISTA */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 9 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
          <span style={{ color: "#94a3b8" }}><span className={`ppv-mini-card-tipo ${isTipoRem ? "rem" : ""}`} style={{ marginRight: 6 }}>{isTipoRem ? "REM" : "PPV"}</span>Valor</span>
          <b style={{ color: "#0f172a", whiteSpace: "nowrap", fontSize: 15 }}>{valorFmt}</b>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
          <span style={{ color: "#94a3b8" }}><i className="fas fa-user-cog" style={{ marginRight: 5 }} />Técnico</span>
          <span style={{ color: "#334155", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.tecnico || "?"}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
          <span style={{ color: "#94a3b8" }}><i className="far fa-calendar" style={{ marginRight: 5 }} />Data</span>
          <span style={{ color: "#334155", whiteSpace: "nowrap" }}>{dataFmt}</span>
        </div>
        {o.observacao && <div className="ppv-mini-card-obs" style={{ marginTop: 2, fontSize: 13 }}>{o.observacao}</div>}
      </div>
      {/* Só quem criou — a "última ação" saiu (poluía o card) */}
      {(o.criadoPor || o.ultimoUsuario) && (
        <div style={{ marginTop: 9, fontSize: 12.5, color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <i className="far fa-user" style={{ marginRight: 4 }} /> Criado por <b style={{ color: "#475569" }}>{o.criadoPor || o.ultimoUsuario}</b>
        </div>
      )}
      {previewPortal}
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

export default function PhaseView({ orders, searchTerm, onCardClick, onStatusChange, loading, activePhase, viewMode = "cards" }: PhaseViewProps) {
  const contClass = viewMode === "lista" ? "ppv-list" : "ppv-cards-grid";
  // Soltar um card numa fase → muda a fase (arrastar). Só quando agrupado por fases.
  const dropOnPhase = (phase: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("ppv-id");
    if (id && onStatusChange) onStatusChange(id, phase);
  };
  const allowDrop = (e: React.DragEvent) => e.preventDefault();
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
      {/* Cards */}
      <main className="ppv-cards-wrapper">
        {loading ? (
          <SkeletonCards />
        ) : activePhase ? (
          <div className={contClass} onDragOver={allowDrop} onDrop={dropOnPhase(activePhase)}>
            {filtered.map((o) => (
              <MiniCard key={o.id} order={o} viewMode={viewMode} onClick={() => onCardClick(o.id)} onStatusChange={onStatusChange} />
            ))}
            {filtered.length === 0 && (
              <div className="ppv-cards-empty">Nenhum pedido nesta fase</div>
            )}
          </div>
        ) : (
          grouped && Object.entries(grouped).map(([phase, items]) => (
            <div key={phase} className="ppv-phase-group" onDragOver={allowDrop} onDrop={dropOnPhase(phase)}>
              <div className="ppv-phase-group-header" onClick={() => toggleCollapse(phase)}>
                <span style={{ display: "inline-block", transition: "transform 0.2s", transform: collapsed.has(phase) ? "rotate(-90deg)" : "rotate(0deg)", marginRight: 6 }}>
                  <i className="fas fa-chevron-down" />
                </span>
                <span className="ppv-phase-group-dot" style={{ background: PHASE_COLORS[phase] }} />
                <span className="ppv-phase-group-name">{rotuloStatus(phase)}</span>
                <span className="ppv-phase-group-count">{items.length}</span>
                <div className="ppv-phase-group-line" />
              </div>
              {!collapsed.has(phase) && (
                <div className={contClass}>
                  {items.map((o) => (
                    <MiniCard key={o.id} order={o} viewMode={viewMode} onClick={() => onCardClick(o.id)} onStatusChange={onStatusChange} />
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
