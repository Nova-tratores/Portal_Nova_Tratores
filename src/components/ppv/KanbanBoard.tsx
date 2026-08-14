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
  { key: "Orçamento", title: "Orçamento" },
  { key: "Orçamento enviado para o cliente e aguardando", title: "Orç. Enviado" },
  { key: "Execução", title: "Execução" },
  { key: "Execução (Realizando Diagnóstico)", title: "Diagnóstico" },
  { key: "Execução aguardando peças (em transporte)", title: "Aguar. Peças" },
  { key: "Executada aguardando comercial", title: "Aguar. Comercial" },
  { key: "Aguardando outros", title: "Aguar. Outros" },
  { key: "Aguardando ordem Técnico", title: "Aguar. Técnico" },
  { key: "Relatório Concluído", title: "Rel. Concluído" },
  { key: "Enviado Omie", title: "Enviado Omie" },
  { key: "Concluída", title: "Faturado" },
  { key: "Cancelada", title: "Cancelada" },
] as const;

export default function KanbanBoard({ items, searchFilter, onCardClick, onStatusChange }: KanbanBoardProps) {
  const filter = searchFilter.toLowerCase();

  const filteredItems = items.filter((i) =>
    `${i.id}${i.cliente}${i.tecnico}`.toLowerCase().includes(filter)
  );

  const grouped = COLUMNS.map((col) => ({
    ...col,
    items: filteredItems.filter((i) => normalizarStatus(i.status) === col.key),
    colors: STATUS_COLORS[col.key] || { text: "#64748B", bg: "#F8FAFC" },
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
