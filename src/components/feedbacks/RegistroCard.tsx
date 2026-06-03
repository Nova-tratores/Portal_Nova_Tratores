"use client";
import type { FeedbackRegistro } from "@/lib/feedbacks/types";

interface Props {
  registro: FeedbackRegistro;
  onEditar?: (r: FeedbackRegistro) => void;
  onExcluir?: (r: FeedbackRegistro) => void;
  onConcluir?: (r: FeedbackRegistro) => void;
  onSemResposta?: (r: FeedbackRegistro) => void;
}

// Horas decorridas desde aberto_em (negativo se aberto_em for futuro)
function horasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60));
}

function fmtTempoDecorrido(horas: number): string {
  if (horas < 1) return "agora";
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  return `${dias}d`;
}

function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

function corStatus(status: string | null): { bg: string; fg: string } {
  switch (status) {
    case "Satisfeito":    return { bg: "#d1fae5", fg: "#065f46" };
    case "Insatisfeito":  return { bg: "#fee2e2", fg: "#991b1b" };
    case "Neutro":        return { bg: "#fef3c7", fg: "#92400e" };
    case "Aguardando":    return { bg: "#dbeafe", fg: "#1e40af" };
    default:              return { bg: "#f3f4f6", fg: "#525252" };
  }
}

function corPrioridade(p: string | null): { bg: string; fg: string } {
  switch (p) {
    case "Urgente":  return { bg: "#fee2e2", fg: "#991b1b" };
    case "Normal":   return { bg: "#fef3c7", fg: "#92400e" };
    case "Inativo":  return { bg: "#f3f4f6", fg: "#525252" };
    default:         return { bg: "#f3f4f6", fg: "#525252" };
  }
}

export default function RegistroCard({ registro: r, onEditar, onExcluir, onConcluir, onSemResposta }: Props) {
  const isCrm = r.tipo === "crm";
  const corStatusObj = isCrm ? corStatus(r.status_cliente) : corPrioridade(r.prioridade);
  const emAtendimento = r.status_atendimento === "aberto" || r.status_atendimento === "em_andamento";
  const horasAberto = horasDesde(r.aberto_em);
  const atrasado = emAtendimento && horasAberto !== null && horasAberto >= 24;
  // "Sem resposta" só libera 24h após o início do atendimento (mesma regra do modal).
  const bloqueadoSemResposta = horasAberto !== null && horasAberto < 24;
  const restantesSemResp = bloqueadoSemResposta ? Math.ceil(24 - (horasAberto || 0)) : 0;

  return (
    <article style={{ ...cardStyle, ...(atrasado ? { borderColor: "#dc2626", borderWidth: 2 } : {}) }}>
      {emAtendimento && (
        <div style={atendimentoBannerStyle(atrasado)}>
          <span>
            {atrasado ? "⚠️" : "🟢"} Em atendimento por <strong>{r.atendente_nome || "—"}</strong>
            {horasAberto !== null && ` · há ${fmtTempoDecorrido(horasAberto)}`}
          </span>
          {atrasado && (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#991b1b" }}>
              ATUALIZE COM DETALHES
            </span>
          )}
        </div>
      )}
      <header style={cardHeader}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <h3 style={tituloStyle}>{r.nome}</h3>
            {r.origem_dados && <span style={origemBadgeStyle(r.origem_dados)}>{r.origem_dados}</span>}
          </div>
          <div style={subtituloStyle}>
            {r.telefone ? (
              <a href={`tel:${r.telefone}`} style={contatoLinkStyle} title="Ligar">
                {r.telefone}
              </a>
            ) : null}
            {r.email ? (
              <>
                {r.telefone ? " · " : null}
                <a href={`mailto:${r.email}`} style={contatoLinkStyle} title="Enviar e-mail">
                  {r.email}
                </a>
              </>
            ) : null}
            {r.codigo_omie && <span> · Omie #{r.codigo_omie}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {(isCrm ? r.status_cliente : r.prioridade) && (
            <span
              style={{
                fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 8,
                background: corStatusObj.bg, color: corStatusObj.fg,
                textTransform: "uppercase", letterSpacing: 0.3,
              }}
            >
              {isCrm ? r.status_cliente : r.prioridade}
            </span>
          )}
          {!isCrm && r.sem_resposta && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 8, background: "#fee2e2", color: "#991b1b" }}>
              SEM RESPOSTA
            </span>
          )}
          {r.status_atendimento === "sem_resposta" && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 8, background: "#fee2e2", color: "#991b1b" }}>
              NÃO RESPONDEU
            </span>
          )}
        </div>
      </header>

      <div style={detalhesGrid}>
        {r.trator && <Detail label="Equipamento" val={r.trator} />}
        {r.tecnico && <Detail label="Técnico" val={r.tecnico} />}
        {isCrm && r.servico && <Detail label="Serviço" val={r.servico} />}
        {isCrm && r.data_servico && <Detail label="Data serviço" val={fmtData(r.data_servico)} />}
        {!isCrm && r.ultimo_servico && <Detail label="Último serviço" val={fmtData(r.ultimo_servico)} />}
        {r.data_contato && <Detail label="Contato" val={fmtData(r.data_contato)} />}
        {isCrm && r.nota !== null && r.nota !== undefined && <Detail label="Nota" val={`★ ${r.nota}/10`} />}
        {isCrm && r.nps && <Detail label="NPS" val={r.nps} />}
        {isCrm && r.melhoria && <Detail label="Melhoria" val={r.melhoria} />}
      </div>

      {(isCrm ? r.feedback : r.motivo) && (
        <blockquote style={citaStyle}>
          {isCrm ? r.feedback : r.motivo}
        </blockquote>
      )}

      {!isCrm && r.acao && (
        <div style={{ fontSize: 12, color: "var(--portal-text-secondary)", marginTop: 6 }}>
          <strong style={{ fontWeight: 700 }}>Ação:</strong> {r.acao}
        </div>
      )}

      {emAtendimento && (onConcluir || onSemResposta) && (
        <div style={acoesAtendimentoStyle}>
          {onConcluir && (
            <button onClick={() => onConcluir(r)} style={btnAcao("#d1fae5", "#065f46")} type="button">
              ✅ Concluir atendimento
            </button>
          )}
          {onSemResposta && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button
                onClick={() => onSemResposta(r)}
                disabled={bloqueadoSemResposta}
                title={bloqueadoSemResposta ? `Disponível em ${restantesSemResp}h (após 24h do início do atendimento)` : "Marcar que o cliente não respondeu"}
                style={{ ...btnAcao("#fee2e2", "#991b1b"), opacity: bloqueadoSemResposta ? 0.5 : 1, cursor: bloqueadoSemResposta ? "not-allowed" : "pointer" }}
                type="button"
              >
                📵 Cliente sem resposta
              </button>
              {bloqueadoSemResposta && (
                <span style={{ fontSize: 10, color: "#92400e", fontStyle: "italic" }}>
                  disponível em {restantesSemResp}h
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {(onEditar || onExcluir) && (
        <footer style={footerStyle}>
          {onEditar && (
            <button onClick={() => onEditar(r)} style={btnAcao("#fef3c7", "#92400e")} type="button">
              ✎ Editar
            </button>
          )}
          {onExcluir && (
            <button onClick={() => onExcluir(r)} style={btnAcao("#fee2e2", "#991b1b")} type="button">
              🗑 Excluir
            </button>
          )}
        </footer>
      )}
    </article>
  );
}

function Detail({ label, val }: { label: string; val: string | number | null | undefined }) {
  if (!val) return null;
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--portal-text-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: "var(--portal-text)", fontWeight: 600 }}>{val}</div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--portal-bg-card)",
  border: "1px solid var(--portal-border)",
  borderRadius: 12,
  padding: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
  fontFamily: "Inter, sans-serif",
  display: "flex", flexDirection: "column", gap: 10,
};
function atendimentoBannerStyle(atrasado: boolean): React.CSSProperties {
  return {
    margin: "-16px -16px 0",
    padding: "8px 14px",
    background: atrasado ? "#fee2e2" : "#d1fae5",
    color: atrasado ? "#991b1b" : "#065f46",
    fontSize: 11,
    fontWeight: 600,
    borderRadius: "12px 12px 0 0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  };
}
const cardHeader: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8,
};
const tituloStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, color: "var(--portal-text)", margin: 0,
  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};
const subtituloStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--portal-text-secondary)", marginTop: 2,
};
const contatoLinkStyle: React.CSSProperties = {
  color: "#b91c1c",
  textDecoration: "none",
  fontWeight: 600,
};
function origemBadgeStyle(origem: string): React.CSSProperties {
  // Cores por origem: NOVA vermelho, CASTRO laranja, Portal cinza
  const up = origem.toUpperCase();
  let bg = "#f3f4f6";
  let fg = "#525252";
  if (up.includes("NOVA")) {
    bg = "#fee2e2"; fg = "#991b1b";
  } else if (up.includes("CASTRO")) {
    bg = "#fed7aa"; fg = "#9a3412";
  } else if (up.includes("OMIE")) {
    bg = "#dbeafe"; fg = "#1e40af";
  }
  return {
    fontSize: 9,
    fontWeight: 700,
    padding: "2px 7px",
    borderRadius: 5,
    background: bg,
    color: fg,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    whiteSpace: "nowrap",
  };
}
const detalhesGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 10, paddingTop: 4,
};
const citaStyle: React.CSSProperties = {
  margin: 0, padding: "10px 14px",
  background: "#f9fafb", borderLeft: "3px solid #d1d5db",
  borderRadius: 6, fontSize: 13, color: "var(--portal-text)",
  fontStyle: "italic", lineHeight: 1.55,
};
const footerStyle: React.CSSProperties = {
  display: "flex", gap: 6, paddingTop: 8, borderTop: "1px solid #f5f5f5",
};
const acoesAtendimentoStyle: React.CSSProperties = {
  display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap",
  paddingTop: 8, borderTop: "1px solid #f5f5f5",
};
function btnAcao(bg: string, fg: string): React.CSSProperties {
  return {
    padding: "6px 12px", background: bg, color: fg, border: "none",
    borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
    fontFamily: "Inter, sans-serif",
  };
}
