"use client";
import { useState } from "react";

interface Props {
  valor: number | null;
  onChange: (v: number | null) => void;
  max?: number;
}

export default function StarsRating({ valor, onChange, max = 10 }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const ativo = hover ?? valor ?? 0;

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
      {Array.from({ length: max }, (_, i) => {
        const n = i + 1;
        const preenchida = n <= ativo;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(valor === n ? null : n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(null)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 22,
              padding: 2,
              lineHeight: 1,
              color: preenchida ? "#f59e0b" : "#e5e5e5",
              transition: "transform 0.1s",
              transform: preenchida ? "scale(1.05)" : "scale(1)",
            }}
            title={`${n} / ${max}`}
          >
            ★
          </button>
        );
      })}
      <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 600, color: "var(--portal-text-secondary)" }}>
        {valor ? `${valor}/${max}` : "—"}
      </span>
    </div>
  );
}
