"use client";

import { useState, useRef, useEffect } from "react";
import type { KanbanItem } from "@/lib/ppv/types";
import { normalizarStatus, formatarDataFrontend, formatarMoeda } from "@/lib/ppv/utils";
import { STATUS_COLORS, STATUS_OPTIONS, type StatusKey } from "@/lib/ppv/constants";

interface KanbanCardProps {
  item: KanbanItem;
  onClick: () => void;
  onStatusChange?: (id: string, newStatus: string) => void;
}

export default function KanbanCard({ item, onClick, onStatusChange }: KanbanCardProps) {
  const statusNorm = normalizarStatus(item.status) as StatusKey;
  const colors = STATUS_COLORS[statusNorm] || { text: "#64748B", bg: "#FFFFFF" };
  const valorFmt = item.valor ? formatarMoeda(parseFloat(String(item.valor))) : "R$ 0,00";
  const dataFmt = formatarDataFrontend(item.data);

  const bgCard = statusNorm === "Fechado" ? "#ecfdf5" : statusNorm === "Cancelado" ? "#fef2f2" : "#FFFAF5";

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
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

      <div className="mb-2 text-sm font-semibold leading-snug text-slate-800">
        {item.cliente || "Sem Cliente"}
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

      <div className="mt-2.5 text-right text-sm font-bold text-slate-800">
        {valorFmt}
      </div>
    </div>
  );
}
