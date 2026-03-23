"use client";

import { useState } from "react";
import type { KanbanItem } from "@/lib/ppv/types";
import KanbanCard from "./KanbanCard";

interface KanbanColumnProps {
  title: string;
  columnKey: string;
  color: string;
  bgBadge: string;
  items: KanbanItem[];
  onCardClick: (id: string) => void;
  onStatusChange?: (id: string, newStatus: string) => void;
}

export default function KanbanColumn({ title, columnKey, color, bgBadge, items, onCardClick, onStatusChange }: KanbanColumnProps) {
  const [dragOver, setDragOver] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const itemId = e.dataTransfer.getData("ppv-id");
    const fromStatus = e.dataTransfer.getData("ppv-status");
    if (itemId && fromStatus !== columnKey && onStatusChange) {
      onStatusChange(itemId, columnKey);
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex min-w-[300px] max-w-[320px] flex-col rounded-xl border-2 transition-all ${
        dragOver ? "border-dashed border-red-400 bg-red-50/30" : "border-orange-200/50 bg-[#FFFAF5]/50"
      }`}
      style={{ height: "100%" }}
    >
      <div
        className="flex items-center justify-between rounded-t-xl border-b border-orange-200/50 bg-[#FFF8F2] px-4 py-3.5 text-xs font-bold uppercase"
        style={{ color }}
      >
        {title}
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ backgroundColor: bgBadge, color }}
        >
          {items.length}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {items.map((item) => (
          <KanbanCard
            key={item.id}
            item={item}
            onClick={() => onCardClick(item.id)}
            onStatusChange={onStatusChange}
          />
        ))}
        {dragOver && items.length === 0 && (
          <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-red-300 py-8 text-xs text-red-400">
            Solte aqui
          </div>
        )}
      </div>
    </div>
  );
}
