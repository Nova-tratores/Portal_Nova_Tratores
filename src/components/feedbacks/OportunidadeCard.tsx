"use client";
import type { Oportunidade, PrioridadeOportunidade } from "@/lib/feedbacks/types";

const CORES_PRIORIDADE: Record<PrioridadeOportunidade, { bg: string; fg: string }> = {
  Urgente: { bg: "#fef2f2", fg: "#b91c1c" },
  Normal:  { bg: "#fef3c7", fg: "#92400e" },
  Baixa:   { bg: "#f0fdf4", fg: "#15803d" },
};

interface Props {
  op: Oportunidade;
  onAtender: (op: Oportunidade) => void;
  onDispensar: (op: Oportunidade) => void;
}

export default function OportunidadeCard({ op, onAtender, onDispensar }: Props) {
  const cor = CORES_PRIORIDADE[op.prioridade];
  const detalhes = renderizarDetalhes(op);

  const disabled = op.status !== "aberta";

  return (
    <article
      style={{
        background: "var(--portal-bg-card)",
        border: "1px solid var(--portal-border)",
        borderLeft: `4px solid ${cor.fg}`,
        borderRadius: 12,
        padding: "14px 16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: "Inter, sans-serif",
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--portal-text)", lineHeight: 1.3, flex: 1 }}>
          {op.cliente_nome}
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 8,
            background: cor.bg,
            color: cor.fg,
            textTransform: "uppercase",
            letterSpacing: 0.3,
            whiteSpace: "nowrap",
          }}
        >
          {op.prioridade}
        </span>
      </header>

      {op.trator && (
        <div style={{ fontSize: 12, color: "var(--portal-text-secondary)" }}>
          🚜 {op.trator}
        </div>
      )}

      <div style={{ fontSize: 12, color: "var(--portal-text-secondary)", lineHeight: 1.55 }}>
        {detalhes}
      </div>

      {op.status === "aberta" && (
        <footer style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <button
            onClick={() => onAtender(op)}
            style={btnStyle("#10b981", "#fff")}
            title="Entrar em contato com o cliente — marca como atendida"
          >
            ✓ Atender
          </button>
          <button
            onClick={() => onDispensar(op)}
            style={btnStyle("#f3f4f6", "#525252")}
            title="Descartar essa oportunidade — não interessa ou cliente já foi atendido por outro caminho"
          >
            ✕ Dispensar
          </button>
        </footer>
      )}

      {op.status !== "aberta" && (
        <div style={{ fontSize: 11, color: "var(--portal-text-muted)", fontStyle: "italic" }}>
          Status: {op.status}
          {op.dispensada_motivo && ` — "${op.dispensada_motivo}"`}
        </div>
      )}
    </article>
  );
}

function btnStyle(bg: string, fg: string): React.CSSProperties {
  return {
    flex: 1,
    padding: "8px 6px",
    border: "none",
    borderRadius: 8,
    background: bg,
    color: fg,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    transition: "filter 0.15s",
    fontFamily: "Inter, sans-serif",
  };
}

function renderizarDetalhes(op: Oportunidade): string {
  const d = op.detalhes || {};
  switch (op.regra) {
    case "R1_revisao": {
      const alvo = d.revisao_alvo || "";
      const data = typeof d.data_estimada === "string"
        ? new Date(d.data_estimada).toLocaleDateString("pt-BR")
        : "";
      const atrasada = d.atrasada ? " (ATRASADA)" : "";
      const horas = d.media_horas_dia ? `${d.media_horas_dia}h/dia` : "";
      return `Revisão ${alvo} estimada para ${data}${atrasada}. Uso médio: ${horas}.`;
    }
    case "R2_sem_os": {
      const total = d.total_equipamentos as number | undefined;
      const dias = d.dias_sem_os as number | null | undefined;
      const ultima = d.ultima_os as string | null | undefined;
      if (ultima) {
        return `${total} equipamentos. Última OS há ${dias} dias (${new Date(ultima).toLocaleDateString("pt-BR")}).`;
      }
      return `${total} equipamentos. Sem OS nos últimos 2 anos.`;
    }
    case "R3_upsell": {
      const meses = d.meses_desde_compra as number | undefined;
      const modelo = d.modelo as string | undefined;
      return `Comprou ${modelo} há ${meses} meses. Possível up-sell de implemento.`;
    }
    case "R4_followup": {
      const dias = d.dias_desde_ultimo as number | undefined;
      const tecnico = d.tecnico as string | null | undefined;
      const ultimo = d.ultimo_contato as string | undefined;
      const dataFmt = ultimo ? new Date(ultimo).toLocaleDateString("pt-BR") : "";
      return `Último contato há ${dias} dias (${dataFmt})${tecnico ? `, técnico ${tecnico}` : ""}.`;
    }
    default:
      return JSON.stringify(d);
  }
}
