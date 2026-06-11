"use client";
import type { FeedbackRegistro } from "@/lib/feedbacks/types";

interface Props {
  registros: FeedbackRegistro[];
  onEditar?: (r: FeedbackRegistro) => void;
}

function dataReferencia(r: FeedbackRegistro): string {
  return r.data_contato || r.data_servico || r.ultimo_servico || r.criado_em;
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

export default function TimelineRegistros({ registros, onEditar }: Props) {
  const ordenados = [...registros].sort((a, b) => {
    const da = dataReferencia(a);
    const db = dataReferencia(b);
    return db.localeCompare(da);
  });

  if (ordenados.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--portal-text-muted)", fontSize: 13, fontStyle: "italic" }}>
        Nenhum registro deste cliente ainda.
      </div>
    );
  }

  return (
    <div style={{ position: "relative", paddingLeft: 28, fontFamily: "Inter, sans-serif" }}>
      {/* linha vertical da timeline */}
      <div style={{ position: "absolute", left: 8, top: 8, bottom: 8, width: 2, background: "#e5e5e5" }} />

      {ordenados.map((r) => {
        const isCrm = r.tipo === "crm";
        return (
          <div key={r.id} style={{ position: "relative", marginBottom: 16 }}>
            {/* bolinha */}
            <div
              style={{
                position: "absolute",
                left: -25,
                top: 8,
                width: 14, height: 14, borderRadius: 7,
                background: isCrm ? "#dc2626" : "#f59e0b",
                boxShadow: `0 0 0 3px ${isCrm ? "#fef2f2" : "#fef3c7"}`,
              }}
            />

            <div
              style={{
                background: "var(--portal-bg-card)",
                border: "1px solid var(--portal-border)",
                borderLeft: `3px solid ${isCrm ? "#dc2626" : "#f59e0b"}`,
                borderRadius: 10,
                padding: "10px 14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                      background: isCrm ? "#fef2f2" : "#fef3c7",
                      color: isCrm ? "#b91c1c" : "#92400e",
                      textTransform: "uppercase", letterSpacing: 0.3,
                    }}
                  >
                    {isCrm ? "CRM" : "RFM"}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--portal-text)" }}>
                    {fmtData(dataReferencia(r))}
                  </span>
                </div>
                {onEditar && (
                  <button
                    onClick={() => onEditar(r)}
                    style={{
                      background: "transparent", border: "none", color: "var(--portal-text-secondary)",
                      cursor: "pointer", fontSize: 11, fontWeight: 600, padding: 4,
                    }}
                  >
                    ✎ Editar
                  </button>
                )}
              </div>

              {/* Quem atendeu + status do atendimento (log) */}
              {(r.atendente_nome || r.status_atendimento) && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                  {statusAtendimentoChip(r.status_atendimento)}
                  {r.atendente_nome && (
                    <span style={{ fontSize: 11, color: "var(--portal-text-secondary)" }}>🎧 {r.atendente_nome}</span>
                  )}
                  {r.status_atendimento === "arquivado" && r.arquivado_motivo && (
                    <span style={{ fontSize: 11, color: "#92400e", fontStyle: "italic" }}>— {r.arquivado_motivo}</span>
                  )}
                </div>
              )}

              {isCrm ? (
                <>
                  {r.servico && (
                    <div style={{ fontSize: 12, color: "var(--portal-text)", marginBottom: 4 }}>
                      <strong>Serviço:</strong> {r.servico}
                    </div>
                  )}
                  {r.feedback && (
                    <blockquote style={citaStyle}>{r.feedback}</blockquote>
                  )}
                  <div style={chipsStyle}>
                    {r.status_cliente && <Chip>{r.status_cliente}</Chip>}
                    {r.nota !== null && r.nota !== undefined && <Chip>★ {r.nota}/10</Chip>}
                    {r.nps && <Chip>NPS: {r.nps}</Chip>}
                    {r.tecnico && <Chip>👷 {r.tecnico}</Chip>}
                  </div>
                </>
              ) : (
                <>
                  {r.motivo && (
                    <div style={{ fontSize: 12, color: "var(--portal-text)", marginBottom: 4 }}>
                      <strong>Motivo:</strong> {r.motivo}
                    </div>
                  )}
                  {r.acao && (
                    <div style={{ fontSize: 12, color: "var(--portal-text-secondary)" }}>
                      <strong>Ação:</strong> {r.acao}
                    </div>
                  )}
                  <div style={chipsStyle}>
                    {r.prioridade && <Chip>{r.prioridade}</Chip>}
                    {r.sem_resposta && <Chip color="#fee2e2" textColor="#991b1b">Sem resposta</Chip>}
                    {r.tecnico && <Chip>👷 {r.tecnico}</Chip>}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function statusAtendimentoChip(status: string | null | undefined): React.ReactNode {
  switch (status) {
    case "concluido":    return <Chip color="#d1fae5" textColor="#065f46">✓ Concluído</Chip>;
    case "sem_resposta": return <Chip color="#fee2e2" textColor="#991b1b">📵 Sem resposta</Chip>;
    case "arquivado":    return <Chip color="#e5e7eb" textColor="#374151">🗄️ Arquivado</Chip>;
    case "aberto":
    case "em_andamento": return <Chip color="#dbeafe" textColor="#1e40af">🟢 Em atendimento</Chip>;
    default:             return null;
  }
}

function Chip({ children, color = "#f3f4f6", textColor = "var(--portal-text-secondary)" }: { children: React.ReactNode; color?: string; textColor?: string }) {
  return (
    <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 5, background: color, color: textColor, fontWeight: 600 }}>
      {children}
    </span>
  );
}

const citaStyle: React.CSSProperties = {
  margin: "4px 0", padding: "8px 12px",
  background: "#f9fafb", borderLeft: "3px solid #d1d5db", borderRadius: 6,
  fontSize: 12, color: "var(--portal-text)", fontStyle: "italic", lineHeight: 1.5,
};
const chipsStyle: React.CSSProperties = { display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 };
