"use client";

import OSCard from "./OSCard";
import type { KanbanCard } from "@/lib/pos/types";

interface KanbanGridProps {
  orders: KanbanCard[];
  onCardClick: (id: string) => void;
}

export default function KanbanGrid({ orders, onCardClick }: KanbanGridProps) {
  return (
    <main className="kanban-wrapper">
      <div className="card-grid">
        {orders.map((o) => (
          <OSCard key={o.id} order={o} onClick={onCardClick} />
        ))}
      </div>
    </main>
  );
}
