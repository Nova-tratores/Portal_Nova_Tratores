"use client";

import { diasEntre } from "@/lib/pos/utils";
import type { KanbanCard } from "@/lib/pos/types";

interface OSCardProps {
  order: KanbanCard;
  onClick: (id: string) => void;
}

export default function OSCard({ order: o, onClick }: OSCardProps) {
  let borderColor = "#1E3A5F";
  if (o.status === "Aguardando ordem Técnico") borderColor = "#0EA5E9";
  else if (o.status === "Aguardando outros") borderColor = "#A855F7";
  else if (o.status.includes("Exec")) borderColor = "#F59E0B";
  else if (o.status.includes("Concluída")) borderColor = "#10B981";
  else if (o.status.includes("Cancelada")) borderColor = "#EF4444";

  const diasCriado = diasEntre(o.data);
  const diasFase = diasEntre(o.dataFase);

  return (
    <div className="card" style={{ borderLeftColor: borderColor }} onClick={() => onClick(o.id)}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <b>#{o.id}</b>
        <span style={{ fontSize: 12, fontWeight: 700 }}>R$ {o.valor}</span>
      </div>
      <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{o.cliente}</div>
      <div style={{ fontSize: 10, color: "var(--text-light)", marginBottom: 8, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>
        <i>{o.servSolicitado}</i>
      </div>
      <div style={{ fontSize: 10, color: "var(--text-light)" }}><i className="far fa-calendar-alt" /> Criado: {diasCriado} dias</div>
      <div style={{ fontSize: 10, color: "var(--primary)", marginBottom: 10 }}><i className="fas fa-clock" /> Na fase: {diasFase} dias</div>
      <div style={{ display: "flex", gap: 8, borderTop: "1px dashed var(--border)", paddingTop: 8 }}>
        <i className="fas fa-box" style={{ color: o.temPPV ? "#1E3A5F" : "var(--border)" }} />
        <i className="fas fa-shopping-cart" style={{ color: o.temReq ? "#1E3A5F" : "var(--border)" }} />
        <i className="fas fa-file-alt" style={{ color: o.temRel ? "#1E3A5F" : "var(--border)" }} />
      </div>
    </div>
  );
}
