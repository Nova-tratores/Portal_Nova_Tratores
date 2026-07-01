"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { KanbanItem } from "@/lib/ppv/types";
import { normalizarStatus, formatarDataFrontend, formatarMoeda } from "@/lib/ppv/utils";
import { STATUS_COLORS, STATUS_OPTIONS, type StatusKey } from "@/lib/ppv/constants";
import { useClienteEtiquetas } from "@/hooks/useClienteEtiquetas";

interface HoverPreview {
  temOS: boolean;
  osId: string;
  osDescricao: string;
  observacao: string;
  produtos: { descricao: string; qtde: number }[];
}
// Cache por PPV pra não refazer a busca a cada hover
const hoverCache = new Map<string, HoverPreview>();

interface KanbanCardProps {
  item: KanbanItem;
  onClick: () => void;
  onStatusChange?: (id: string, newStatus: string) => void;
}

export default function KanbanCard({ item, onClick, onStatusChange }: KanbanCardProps) {
  const statusNorm = normalizarStatus(item.status) as StatusKey;
  const colors = STATUS_COLORS[statusNorm] || { text: "#64748B", bg: "#FFFFFF" };
  const valorBruto = item.valor ? parseFloat(String(item.valor)) : 0;
  const desconto = item.desconto || 0;
  const valorFinal = desconto > 0 ? valorBruto * (1 - desconto / 100) : valorBruto;
  const valorFmt = formatarMoeda(valorFinal);
  const dataFmt = formatarDataFrontend(item.data);

  const bgCard = statusNorm === "Concluída" ? "#ecfdf5" : statusNorm === "Cancelada" ? "#fef2f2" : "#FFFAF5";
  const { getEtiquetas } = useClienteEtiquetas();
  const etiquetasCli = getEtiquetas(item.cliente || '');

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Preview no hover (descrição da OS / produtos / observação) ──
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
      let data = hoverCache.get(item.id);
      if (!data) {
        try {
          const r = await fetch(`/api/ppv/hover?id=${encodeURIComponent(item.id)}`);
          if (r.ok) { data = await r.json() as HoverPreview; hoverCache.set(item.id, data); }
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

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("ppv-id", item.id);
    e.dataTransfer.setData("ppv-status", statusNorm);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleStatusSelect(newStatus: string) {
    setDropdownOpen(false);
    if (newStatus !== statusNorm && onStatusChange) {
      onStatusChange(item.id, newStatus);
    }
  }

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      className="cursor-pointer rounded-xl border border-orange-200/60 p-5 shadow-[0_2px_5px_rgba(0,0,0,0.02)] transition-all hover:-translate-y-1 hover:border-red-300 hover:shadow-[0_10px_20px_rgba(0,0,0,0.08)]"
      style={{ borderLeftWidth: 4, borderLeftColor: colors.text, backgroundColor: bgCard }}
    >
      <div className="mb-2.5 flex items-center justify-between">
        <span className="rounded bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-600">
          #{item.id}
        </span>

        {/* Dropdown de status */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={(e) => { e.stopPropagation(); setDropdownOpen(!dropdownOpen); }}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase transition-colors hover:opacity-80"
            style={{ color: colors.text, backgroundColor: colors.bg }}
            title="Alterar fase"
          >
            {statusNorm}
            <i className="fas fa-chevron-down text-[8px]" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded-lg border border-orange-200 bg-white py-1 shadow-xl">
              {STATUS_OPTIONS.map((opt) => {
                const optColors = STATUS_COLORS[opt.value as StatusKey];
                const isActive = opt.value === statusNorm;
                return (
                  <button
                    key={opt.value}
                    onClick={(e) => { e.stopPropagation(); handleStatusSelect(opt.value); }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] transition-colors hover:bg-orange-50 ${isActive ? "font-bold" : ""}`}
                  >
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: optColors.text }}
                    />
                    <span style={{ color: isActive ? optColors.text : "#334155" }}>
                      {opt.label}
                    </span>
                    {isActive && <i className="fas fa-check ml-auto text-[10px]" style={{ color: optColors.text }} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="mb-2 text-sm font-semibold leading-snug text-slate-800" style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <span>{item.cliente || "Sem Cliente"}</span>
        {etiquetasCli.map(e => (
          <span key={e.id} style={{ display: "inline-block", padding: "1px 6px", borderRadius: 8, fontSize: 9, fontWeight: 700, background: e.cor, color: "#fff", lineHeight: "14px" }}>{e.nome}</span>
        ))}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-dashed border-orange-200/60 pt-2.5">
        <span className="flex items-center gap-1 rounded-md border border-orange-200/50 bg-orange-50/50 px-2 py-1 text-[10px] text-slate-500">
          <i className="fas fa-user-cog" /> {item.tecnico || "?"}
        </span>
        <span className="flex items-center gap-1 rounded-md border border-orange-200/50 bg-orange-50/50 px-2 py-1 text-[10px] text-slate-500">
          <i className="far fa-calendar" /> {dataFmt}
        </span>
      </div>

      {item.observacao && (
        <div className="mt-1.5 border-t border-orange-100 pt-1.5 text-[11px] italic text-slate-400">
          {item.observacao}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-end gap-2">
        {desconto > 0 && (
          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
            -{desconto}%
          </span>
        )}
        <span className="text-sm font-bold text-slate-800">{valorFmt}</span>
      </div>

      {/* Preview no hover: com OS → descrição da OS + produtos; sem OS → produtos + observação */}
      {preview && tipPos && typeof document !== "undefined" && createPortal(
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
      )}
    </div>
  );
}
