"use client";

import type { KanbanItem } from "@/lib/ppv/types";
import { normalizarStatus } from "@/lib/ppv/utils";
import { STATUS_COLORS } from "@/lib/ppv/constants";
import KanbanColumn from "./KanbanColumn";

interface KanbanBoardProps {
  items: KanbanItem[];
  searchFilter: string;
  onCardClick: (id: string) => void;
  onStatusChange?: (id: string, newStatus: string) => void;
}

const COLUMNS = [
  { key: "Aguardando", title: "Aguardando" },
  { key: "Em Andamento", title: "Em Andamento" },
  { key: "Aguardando Para Faturar", title: "Aguar. Faturar" },
  { key: "Fechado", title: "Fechado" },
  { key: "Cancelado", title: "Cancelado" },
] as const;

export default function KanbanBoard({ items, searchFilter, onCardClick, onStatusChange }: KanbanBoardProps) {
  const filter = searchFilter.toLowerCase();

  const filteredItems = items.filter((i) =>
    `${i.id}${i.cliente}${i.tecnico}`.toLowerCase().includes(filter)
  );

  const grouped = COLUMNS.map((col) => ({
    ...col,
    items: filteredItems.filter((i) => normalizarStatus(i.status) === col.key),
    colors: STATUS_COLORS[col.key],
  }));

  return (
    <div className="flex h-full gap-5 overflow-x-auto pb-2.5">
      {grouped.map((col) => (
        <KanbanColumn
          key={col.key}
          title={col.title}
          columnKey={col.key}
          color={col.colors.text}
          bgBadge={col.colors.bg}
          items={col.items}
          onCardClick={onCardClick}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  );
}
