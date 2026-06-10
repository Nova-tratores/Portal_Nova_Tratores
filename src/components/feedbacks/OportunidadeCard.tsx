"use client";
import type { Oportunidade, PrioridadeOportunidade } from "@/lib/feedbacks/types";
import { origemDaOportunidade } from "@/lib/feedbacks/origem";

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
  const origem = origemDaOportunidade(op);

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
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--portal-text)", lineHeight: 1.3 }}>
            {op.cliente_nome}
          </div>
          <div style={{ marginTop: 4 }}>
            <span style={origemBadgeStyle(origem)}>{origem}</span>
          </div>
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

      {(() => {
        const ui = renderizarUltimaInteracao(op);
        if (!ui) return null;
        return (
          <div
            style={{
              fontSize: 11,
              padding: "6px 8px",
              borderRadius: 6,
              background: "#f9fafb",
              border: "1px solid #e5e5e5",
              color: "var(--portal-text-secondary)",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <strong style={{ color: "var(--portal-text)" }}>Última interação:</strong> {ui}
          </div>
        );
      })()}

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

function origemBadgeStyle(origem: string): React.CSSProperties {
  const up = origem.toUpperCase();
  let bg = "#f3f4f6";
  let fg = "#525252";
  if (up.includes("NOVA")) { bg = "#fee2e2"; fg = "#991b1b"; }
  else if (up.includes("CASTRO")) { bg = "#fed7aa"; fg = "#9a3412"; }
  else if (up.includes("OMIE")) { bg = "#dbeafe"; fg = "#1e40af"; }
  else if (up.includes("TRATORES")) { bg = "#fef3c7"; fg = "#92400e"; }
  return {
    fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
    background: bg, color: fg, textTransform: "uppercase", letterSpacing: 0.3,
  };
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

function fmtData(s: string | null | undefined): string {
  if (!s) return "—";
  // Aceita ISO (YYYY-MM-DD ou completo) E formato BR (DD/MM/YYYY)
  if (/^\d{2}\/\d{2}\/\d{4}/.test(s)) {
    // já está no formato BR, só pega DD/MM/YYYY
    return s.slice(0, 10);
  }
  // ISO: pega yyyy-mm-dd e inverte sem usar Date (evita problema de fuso)
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // fallback: tenta Date mesmo
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleDateString("pt-BR");
  } catch {}
  return s;
}

// Retorna texto curto com a referência concreta da última interação:
// "OS-1234 (Manutenção · 12/03/2025)" ou "PV-5678 NOVA (12/03/2025)".
// Quando não há nenhuma interação histórica, retorna mensagem informativa
// pra deixar claro que é cliente sem histórico (não bug).
function renderizarUltimaInteracao(op: Oportunidade): string | null {
  const d = op.detalhes || {};

  function pvFormatado(): string | null {
    const numero = d.ultimo_pedido_numero as string | null | undefined;
    if (!numero) return null;
    const empresa = d.ultimo_pedido_empresa as string | null | undefined;
    const etapa = d.ultimo_pedido_etapa as string | null | undefined;
    const data = fmtData(d.ultimo_pedido as string | null);
    return `PV-${numero}${empresa ? ` ${empresa}` : ""} (${data}${etapa ? ` · ${etapa}` : ""})`;
  }

  function osFormatado(idKey: string, dataKey: string, tipoKey: string): string | null {
    const idOrdem = d[idKey] as string | null | undefined;
    if (!idOrdem) return null;
    const data = fmtData(d[dataKey] as string | null);
    const tipo = d[tipoKey] as string | null | undefined;
    const fonte = d.ultima_os_fonte as string | null | undefined;
    const empresa = d.ultima_os_empresa as string | null | undefined;
    const prefixo = fonte === "omie" ? `OS Omie #${idOrdem}${empresa ? ` ${empresa}` : ""}` : `${idOrdem}`;
    return `${prefixo}${tipo ? ` (${tipo} · ${data})` : ` (${data})`}`;
  }

  // Fallback: trator entregue (a "compra original" que justifica o cliente existir
  // em tratores). Útil quando não há OS, feedback ou PV mais recente.
  function entregaFormatado(): string | null {
    const entrega = d.entrega_data as string | null | undefined;
    const trator = d.entrega_trator as string | null | undefined;
    if (!entrega && !trator) return null;
    const data = fmtData(entrega);
    return `Entrega do trator${trator ? ` ${trator}` : ""} em ${data}`;
  }

  switch (op.regra) {
    case "R1_revisao": {
      const os = osFormatado("ultima_os_id", "ultima_os_data", "ultima_os_tipo");
      if (os) return os;
      return "Sem OS registrada no chassi/cliente desde a entrega";
    }
    case "R2_sem_os": {
      const origem = d.ultima_atividade_origem as string | null | undefined;
      if (origem === "os") {
        const os = osFormatado("ultima_os_id", "ultima_os_data", "ultima_os_tipo");
        if (os) return os;
      }
      if (origem === "feedback") {
        const data = fmtData(d.ultimo_feedback as string | null);
        return `Feedback CRM/RFM em ${data}`;
      }
      return entregaFormatado() ?? "Sem registro anterior";
    }
    case "R3_upsell": {
      const pv = pvFormatado();
      if (pv) return pv;
      return entregaFormatado() ?? "Sem registro anterior";
    }
    case "R5_pecas": {
      return pvFormatado();
    }
    default:
      return null;
  }
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
      // 1ª revisão de garantia estimada por TEMPO (trator recém-entregue).
      if (d.base_estimativa === "tempo_primeira") {
        const entrega = typeof d.entrega_data === "string"
          ? new Date(d.entrega_data).toLocaleDateString("pt-BR")
          : "";
        return `1ª revisão de garantia (${alvo}) — prevista para ${data}${atrasada}.${entrega ? ` Trator entregue em ${entrega}.` : ""}`;
      }
      const horas = d.media_horas_dia ? `${d.media_horas_dia}h/dia` : "";
      return `Revisão ${alvo} estimada para ${data}${atrasada}. Uso médio: ${horas}.`;
    }
    case "R2_sem_os": {
      const total = d.total_equipamentos as number | undefined;
      const dias = (d.dias_sem_atividade ?? d.dias_sem_os) as number | null | undefined;
      const ultima = (d.ultima_atividade ?? d.ultima_os) as string | null | undefined;
      if (ultima) {
        return `${total} equipamento(s). Último contato há ${dias} dias (${new Date(ultima).toLocaleDateString("pt-BR")}).`;
      }
      return `${total} equipamento(s). Sem qualquer contato nos últimos 2 anos.`;
    }
    case "R3_upsell": {
      const total = d.total_equipamentos as number | undefined;
      const meses = d.meses_sem_pedido as number | null | undefined;
      const semHistorico = d.sem_pedido_historico as boolean | undefined;
      if (semHistorico) {
        return `${total} trator(es). Sem nenhum pedido no histórico — cliente frio total.`;
      }
      return `${total} trator(es). Último pedido há ${meses} meses — esfriou.`;
    }
    case "R5_pecas": {
      const meses = d.meses_sem_pedido as number | undefined;
      return `Última compra de peça há ${meses} meses. Oferecer reposição ou kit de manutenção.`;
    }
    case "R6_fora_garantia": {
      const marca = d.marca as string | undefined;
      const foraPor = d.fora_por as string | undefined;
      const fim = typeof d.fim_garantia === "string" ? new Date(d.fim_garantia).toLocaleDateString("pt-BR") : "";
      const horas = d.horimetro_atual as number | null | undefined;
      const meses = d.garantia_meses as number | undefined;
      const horasGar = d.garantia_horas as number | undefined;
      const motivo = foraPor === "horas"
        ? `atingiu ${horas}h (limite ${horasGar}h)`
        : foraPor === "tempo+horas"
          ? `passou do prazo (${fim}) e das ${horasGar}h`
          : `passou do prazo de garantia (${fim})`;
      return `${marca || "Equipamento"} fora de garantia — ${motivo}. Garantia: ${meses}m / ${horasGar}h. Oferecer revisão paga ou garantia estendida.`;
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
