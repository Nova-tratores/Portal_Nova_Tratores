"use client";
import type { FeedbackRegistro } from "@/lib/feedbacks/types";
import { COR_CRM, COR_CRM_BG, COR_CRM_FG, COR_RFM, COR_RFM_BG, COR_RFM_FG } from "@/lib/feedbacks/cores";

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
                background: isCrm ? COR_CRM : COR_RFM,
                boxShadow: `0 0 0 3px ${isCrm ? COR_CRM_BG : COR_RFM_BG}`,
              }}
            />

            <div
              style={{
                background: "var(--portal-bg-card)",
                border: "1px solid var(--portal-border)",
                borderRadius: 16,
                padding: "12px 16px",
                boxShadow: "0 1px 2px rgba(16,24,40,0.04), 0 6px 16px -10px rgba(16,24,40,0.14)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: 12, fontWeight: 500, padding: "1px 10px", borderRadius: 999,
                      background: isCrm ? COR_CRM_BG : COR_RFM_BG,
                      color: isCrm ? COR_CRM_FG : COR_RFM_FG,
                      border: `1px solid ${isCrm ? COR_CRM : COR_RFM}`,
                    }}
                  >
                    {isCrm ? "CRM" : "RFM"}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--portal-text)" }}>
                    {fmtData(dataReferencia(r))}
                  </span>
                </div>
                {onEditar && (
                  <button
                    onClick={() => onEditar(r)}
                    style={{
                      background: "transparent", border: "none", color: "var(--portal-text-secondary)",
                      cursor: "pointer", fontSize: 11, fontWeight: 500, padding: 4,
                    }}
                  >
                    <i className="fa-solid fa-pen" /> Editar
                  </button>
                )}
              </div>

              {/* Quem atendeu + status do atendimento (log) */}
              {(r.atendente_nome || r.status_atendimento) && (
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                  {statusAtendimentoChip(r.status_atendimento)}
                  {r.atendente_nome && (
                    <span style={{ fontSize: 11, color: "var(--portal-text-secondary)" }}><i className="fa-solid fa-headset" /> {r.atendente_nome}</span>
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
                      <strong style={{ fontWeight: 500 }}>Serviço:</strong> {r.servico}
                    </div>
                  )}
                  {r.feedback && (
                    <blockquote style={citaStyle}>{r.feedback}</blockquote>
                  )}
                  <div style={chipsStyle}>
                    {r.status_cliente && <Chip>{r.status_cliente}</Chip>}
                    {r.nota !== null && r.nota !== undefined && <Chip><i className="fa-solid fa-star" /> {r.nota}/10</Chip>}
                    {r.nps && <Chip>NPS: {r.nps}</Chip>}
                    {r.tecnico && <Chip><i className="fa-solid fa-user-gear" /> {r.tecnico}</Chip>}
                  </div>
                </>
              ) : (
                <>
                  {r.motivo && (
                    <div style={{ fontSize: 12, color: "var(--portal-text)", marginBottom: 4 }}>
                      <strong style={{ fontWeight: 500 }}>Motivo:</strong> {r.motivo}
                    </div>
                  )}
                  {r.acao && (
                    <div style={{ fontSize: 12, color: "var(--portal-text-secondary)" }}>
                      <strong style={{ fontWeight: 500 }}>O que foi conversado:</strong> {r.acao}
                    </div>
                  )}
                  <div style={chipsStyle}>
                    {r.prioridade && <Chip>{r.prioridade}</Chip>}
                    {r.sem_resposta && <Chip color="#fee2e2" textColor="#991b1b">Sem resposta</Chip>}
                    {r.tecnico && <Chip><i className="fa-solid fa-user-gear" /> {r.tecnico}</Chip>}
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
    case "concluido":    return <Chip color="#d1fae5" textColor="#065f46"><i className="fa-solid fa-circle-check" /> Concluído</Chip>;
    case "sem_resposta": return <Chip color="#fee2e2" textColor="#991b1b"><i className="fa-solid fa-phone-slash" /> Sem resposta</Chip>;
    case "arquivado":    return <Chip color="#e5e7eb" textColor="#374151"><i className="fa-solid fa-box-archive" /> Arquivado</Chip>;
    case "aberto":
    case "em_andamento": return <Chip color="#dbeafe" textColor="#1e40af"><i className="fa-solid fa-circle" style={{ fontSize: 7, color: "#16a34a" }} /> Em atendimento</Chip>;
    default:             return null;
  }
}

function Chip({ children, color = "#f3f4f6", textColor = "var(--portal-text-secondary)" }: { children: React.ReactNode; color?: string; textColor?: string }) {
  return (
    <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: color, color: textColor, fontWeight: 500, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)" }}>
      {children}
    </span>
  );
}

const citaStyle: React.CSSProperties = {
  margin: "4px 0", padding: "8px 12px",
  background: "var(--portal-bg-secondary)", border: "1px solid var(--portal-border)", borderRadius: 10,
  fontSize: 12, color: "var(--portal-text)", fontStyle: "italic", lineHeight: 1.5,
};
const chipsStyle: React.CSSProperties = { display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 };
