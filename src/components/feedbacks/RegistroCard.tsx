"use client";
import { TAG_NAO_CONTATAR, type FeedbackRegistro, type StatusAtendimento } from "@/lib/feedbacks/types";
import type { UltimaOS } from "@/lib/feedbacks/api";
import styles from "./feedbacks.module.css";

const TAG_PENDENCIA = "!!#Pendências Cadastrais#!!";

interface Props {
  registro: FeedbackRegistro;
  // Última OS (oficina) do cliente — quem foi o último técnico e quando.
  ultimaOS?: UltimaOS | null;
  // Tags do cliente (de feedback_clientes_info) — para ícones e a caveira.
  clienteTags?: string[];
  onEditar?: (r: FeedbackRegistro) => void;
  onExcluir?: (r: FeedbackRegistro) => void;
  // Muda o status de atendimento do registro (concluir, reabrir, sem-resposta…).
  onMudarAtendimento?: (r: FeedbackRegistro, novo: StatusAtendimento) => void;
  // Arquiva o atendimento com justificativa (cliente que não vale a pena).
  onArquivar?: (r: FeedbackRegistro) => void;
  // Abre o histórico completo do cliente (OS, pedidos, requisições).
  onVerHistorico?: (r: FeedbackRegistro) => void;
  // 💀 Caveira: alterna "não contatar" no cliente.
  onCaveira?: (r: FeedbackRegistro) => void;
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

export default function RegistroCard({ registro: r, ultimaOS, clienteTags, onEditar, onExcluir, onMudarAtendimento, onArquivar, onVerHistorico, onCaveira }: Props) {
  const isCrm = r.tipo === "crm";
  const corStatusObj = isCrm ? corStatus(r.status_cliente) : corPrioridade(r.prioridade);
  const emAtendimento = r.status_atendimento === "aberto" || r.status_atendimento === "em_andamento";
  const horasAberto = horasDesde(r.aberto_em);
  const atrasado = emAtendimento && horasAberto !== null && horasAberto >= 24;
  // "Sem resposta" só libera 24h após o início do atendimento (mesma regra do modal).
  const bloqueadoSemResposta = horasAberto !== null && horasAberto < 24;
  const restantesSemResp = bloqueadoSemResposta ? Math.ceil(24 - (horasAberto || 0)) : 0;
  const clicavel = !!onVerHistorico;
  const tags = clienteTags || [];
  const naoContatar = tags.includes(TAG_NAO_CONTATAR);
  // Falta info cadastral: sem e-mail e sem telefone, ou marcado com pendência cadastral.
  const faltaInfo = (!r.email && !r.telefone) || tags.includes(TAG_PENDENCIA);
  // Cor de acento da faixa do topo: CRM vermelho, RFM laranja; atrasado força vermelho.
  const acento = atrasado ? "#dc2626" : isCrm ? "#dc2626" : "#f59e0b";

  return (
    <article
      onClick={onVerHistorico ? () => onVerHistorico(r) : undefined}
      className={`${styles.card} ${clicavel ? styles.clickable : ""}`}
      title={clicavel ? "Clique para ver o histórico do cliente (OS, pedidos, requisições)" : undefined}
      style={{
        ...cardStyle,
        ["--fb-accent" as string]: acento,
        ...(atrasado ? { borderColor: "#fca5a5" } : {}),
      }}
    >
      {clicavel && <span className={styles.hint}>📜 ver histórico</span>}
      {(r.atendente_nome || r.status_atendimento === "arquivado") && (() => {
        // Banner conforme o status do atendimento.
        let bg = "#d1fae5", fg = "#065f46", txt = "🟢 Em atendimento por";
        if (r.status_atendimento === "arquivado") {
          bg = "#e5e7eb"; fg = "#374151"; txt = r.atendente_nome ? "🗄️ Arquivado por" : "🗄️ Arquivado";
        } else if (emAtendimento) {
          if (atrasado) { bg = "#fee2e2"; fg = "#991b1b"; txt = "⚠️ Em atendimento por"; }
        } else if (r.status_atendimento === "concluido") {
          bg = "#f3f4f6"; fg = "#374151"; txt = "✓ Concluído por";
        } else if (r.status_atendimento === "sem_resposta") {
          bg = "#fee2e2"; fg = "#991b1b"; txt = "📵 Sem resposta — atendido por";
        }
        return (
          <div style={{ ...atendimentoBannerBase, background: bg, color: fg, flexDirection: "column", alignItems: "flex-start" }}>
            <span>
              {txt}{r.atendente_nome ? <> <strong>{r.atendente_nome}</strong></> : null}
              {emAtendimento && horasAberto !== null && ` · há ${fmtTempoDecorrido(horasAberto)}`}
              {atrasado && <strong style={{ marginLeft: 8, color: "#991b1b" }}>· ATUALIZE COM DETALHES</strong>}
            </span>
            {r.status_atendimento === "arquivado" && r.arquivado_motivo && (
              <span style={{ fontStyle: "italic", opacity: 0.85 }}>Motivo: {r.arquivado_motivo}</span>
            )}
          </div>
        );
      })()}
      <header style={cardHeader}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {naoContatar && <span title="Cliente marcado como 'não contatar'" style={{ fontSize: 14 }}>💀</span>}
            {faltaInfo && <span title="Faltam informações cadastrais (sem contato e/ou pendência cadastral)" style={{ fontSize: 13 }}>⚠️</span>}
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
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {(isCrm ? r.status_cliente : r.prioridade) && (
            <span className={styles.pill} style={{ background: corStatusObj.bg, color: corStatusObj.fg, textTransform: "uppercase" }}>
              {isCrm ? r.status_cliente : r.prioridade}
            </span>
          )}
          {!isCrm && r.sem_resposta && (
            <span className={styles.pill} style={{ background: "#fee2e2", color: "#991b1b" }}>SEM RESPOSTA</span>
          )}
          {r.status_atendimento === "sem_resposta" && (
            <span className={styles.pill} style={{ background: "#fee2e2", color: "#991b1b" }}>NÃO RESPONDEU</span>
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

      {ultimaOS && (ultimaOS.tecnico || ultimaOS.data) && (
        <div style={ultimaOSStyle}>
          🔧 <strong>Último serviço:</strong>{" "}
          {ultimaOS.tecnico || "técnico não informado"}
          {ultimaOS.data ? ` · ${fmtData(ultimaOS.data)}` : ""}
          {ultimaOS.tipo ? ` · ${ultimaOS.tipo}` : ""}
        </div>
      )}

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

      {onMudarAtendimento && (
        <div style={acoesAtendimentoStyle} onClick={(e) => e.stopPropagation()}>
          {r.status_atendimento === "arquivado" ? (
            <button onClick={() => onMudarAtendimento(r, "em_andamento")} style={btnAcao("#e5e7eb", "#374151")} type="button">
              ♻️ Desarquivar
            </button>
          ) : (
          <>
          {/* Concluir / Reabrir */}
          {r.status_atendimento === "concluido" ? (
            <button onClick={() => onMudarAtendimento(r, "em_andamento")} style={btnAcao("#f3f4f6", "#525252")} type="button">
              ↩️ Reabrir
            </button>
          ) : (
            <button onClick={() => onMudarAtendimento(r, "concluido")} style={btnAcao("#d1fae5", "#065f46")} type="button">
              ✅ Concluir
            </button>
          )}
          {/* Sem resposta / Respondeu */}
          {r.status_atendimento === "sem_resposta" ? (
            <button onClick={() => onMudarAtendimento(r, "em_andamento")} style={btnAcao("#d1fae5", "#065f46")} type="button">
              🔔 Respondeu
            </button>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button
                onClick={() => onMudarAtendimento(r, "sem_resposta")}
                disabled={bloqueadoSemResposta}
                title={bloqueadoSemResposta ? `Disponível em ${restantesSemResp}h (após 24h do início do atendimento)` : "Marcar que o cliente não respondeu"}
                style={{ ...btnAcao("#fee2e2", "#991b1b"), opacity: bloqueadoSemResposta ? 0.5 : 1, cursor: bloqueadoSemResposta ? "not-allowed" : "pointer" }}
                type="button"
              >
                📵 Sem resposta
              </button>
              {bloqueadoSemResposta && (
                <span style={{ fontSize: 10, color: "#92400e", fontStyle: "italic" }}>
                  disponível em {restantesSemResp}h
                </span>
              )}
            </div>
          )}
          {onArquivar && (
            <button onClick={() => onArquivar(r)} style={btnAcao("#e5e7eb", "#374151")} type="button" title="Arquivar este atendimento (com justificativa)">
              🗄️ Arquivar
            </button>
          )}
          </>
          )}
        </div>
      )}

      {(onEditar || onExcluir || onCaveira) && (
        <footer style={footerStyle} onClick={(e) => e.stopPropagation()}>
          {onEditar && (
            <button onClick={() => onEditar(r)} style={btnAcao("#fef3c7", "#92400e")} type="button">
              📝 Preencher atendimento
            </button>
          )}
          {onCaveira && (
            <button
              onClick={() => onCaveira(r)}
              style={btnAcao(naoContatar ? "#d1fae5" : "#1f2937", naoContatar ? "#065f46" : "#fff")}
              type="button"
              title={naoContatar ? "Reativar contato com este cliente" : "Marcar cliente como 'não contatar' (não vale a pena)"}
            >
              {naoContatar ? "↩ Reativar contato" : "💀 Não contatar"}
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
  fontFamily: "Inter, sans-serif",
  display: "flex", flexDirection: "column", gap: 10,
};
const atendimentoBannerBase: React.CSSProperties = {
  margin: "-16px -16px 0",
  padding: "9px 14px 8px",
  fontSize: 11,
  fontWeight: 600,
  borderRadius: 0,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};
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
const ultimaOSStyle: React.CSSProperties = {
  fontSize: 11.5, color: "var(--portal-text-secondary)",
  background: "#f9fafb", border: "1px solid #eee",
  borderRadius: 6, padding: "6px 10px",
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
