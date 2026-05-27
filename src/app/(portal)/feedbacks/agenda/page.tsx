"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listarRegistros } from "@/lib/feedbacks/api";
import type { FeedbackRegistro } from "@/lib/feedbacks/types";

type StatusAgenda = "vencido" | "proximo" | "em_dia";

interface ItemAgenda {
  cliente: string;
  telefone: string | null;
  trator: string | null;
  tecnico: string | null;
  ultimaData: string;       // ISO YYYY-MM-DD
  ultimoTipo: "crm" | "rfm";
  diasDesdeUltimo: number;
  diasParaPrevisao: number;  // negativo = vencido
  status: StatusAgenda;
  ultimoFeedback: string | null;
}

const PRAZO_DIAS = 30;     // janela default de follow-up
const PROXIMO_DIAS = 7;    // dentro de 7 dias = "próximo"

function dataRef(r: FeedbackRegistro): string {
  return r.data_contato || r.data_servico || r.ultimo_servico || "";
}

function agrupar(registros: FeedbackRegistro[]): ItemAgenda[] {
  const map = new Map<string, ItemAgenda>();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  for (const r of registros) {
    const d = dataRef(r);
    if (!d) continue;
    const chave = (r.nome || "").trim().toUpperCase();
    if (!chave) continue;

    const existente = map.get(chave);
    if (existente && existente.ultimaData >= d) continue;

    const data = new Date(d);
    const previsao = new Date(data.getTime() + PRAZO_DIAS * 86400000);
    const diasParaPrevisao = Math.floor((previsao.getTime() - hoje.getTime()) / 86400000);
    const diasDesdeUltimo = Math.floor((hoje.getTime() - data.getTime()) / 86400000);

    let status: StatusAgenda;
    if (diasParaPrevisao < 0)      status = "vencido";
    else if (diasParaPrevisao <= PROXIMO_DIAS) status = "proximo";
    else                            status = "em_dia";

    map.set(chave, {
      cliente: r.nome,
      telefone: r.telefone,
      trator: r.trator,
      tecnico: r.tecnico,
      ultimaData: d,
      ultimoTipo: r.tipo,
      diasDesdeUltimo,
      diasParaPrevisao,
      status,
      ultimoFeedback: r.feedback || r.motivo,
    });
  }

  return Array.from(map.values()).sort((a, b) => a.diasParaPrevisao - b.diasParaPrevisao);
}

function fmtData(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

function linkWhatsApp(item: ItemAgenda): string | null {
  if (!item.telefone) return null;
  const digits = item.telefone.replace(/\D/g, "");
  if (!digits) return null;
  const tel = digits.startsWith("55") ? digits : "55" + digits;
  const msg = encodeURIComponent(
    `Olá, aqui é da Nova Tratores. Faz cerca de ${item.diasDesdeUltimo} dias do nosso último contato — passando pra verificar como está tudo aí. Podemos conversar?`
  );
  return `https://wa.me/${tel}?text=${msg}`;
}

const CORES_STATUS: Record<StatusAgenda, { bg: string; fg: string; label: string; emoji: string }> = {
  vencido:  { bg: "#fee2e2", fg: "#991b1b", label: "Vencido",     emoji: "🔴" },
  proximo:  { bg: "#fef3c7", fg: "#92400e", label: "Próximo 7d",  emoji: "🟡" },
  em_dia:   { bg: "#d1fae5", fg: "#065f46", label: "Em dia",      emoji: "🟢" },
};

export default function AgendaPage() {
  const [registros, setRegistros] = useState<FeedbackRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<"todos" | StatusAgenda>("todos");

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [crm, rfm] = await Promise.all([listarRegistros("crm"), listarRegistros("rfm")]);
      setRegistros([...crm, ...rfm]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);

  const itens = useMemo(() => agrupar(registros), [registros]);

  const stats = useMemo(() => ({
    vencido: itens.filter((i) => i.status === "vencido").length,
    proximo: itens.filter((i) => i.status === "proximo").length,
    em_dia:  itens.filter((i) => i.status === "em_dia").length,
    total:   itens.length,
  }), [itens]);

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    return itens.filter((i) => {
      if (statusFiltro !== "todos" && i.status !== statusFiltro) return false;
      if (q && !(i.cliente.toLowerCase().includes(q) || (i.trator || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [itens, filtro, statusFiltro]);

  return (
    <div style={{ paddingTop: 20, fontFamily: "Inter, sans-serif" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--portal-text)", margin: 0, marginBottom: 14 }}>
        📞 Agenda — Follow-up de feedback
      </h1>

      {erro && <div style={erroStyle}>{erro}</div>}

      {/* Stats cards */}
      <div style={statsGrid}>
        <StatCard cor="#dc2626" bg="#fef2f2" label="Vencidos" value={stats.vencido} ativo={statusFiltro === "vencido"} onClick={() => setStatusFiltro(statusFiltro === "vencido" ? "todos" : "vencido")} />
        <StatCard cor="#92400e" bg="#fef3c7" label="Próximos 7 dias" value={stats.proximo} ativo={statusFiltro === "proximo"} onClick={() => setStatusFiltro(statusFiltro === "proximo" ? "todos" : "proximo")} />
        <StatCard cor="#065f46" bg="#d1fae5" label="Em dia" value={stats.em_dia} ativo={statusFiltro === "em_dia"} onClick={() => setStatusFiltro(statusFiltro === "em_dia" ? "todos" : "em_dia")} />
        <StatCard cor="#525252" bg="#f3f4f6" label="Total" value={stats.total} ativo={statusFiltro === "todos"} onClick={() => setStatusFiltro("todos")} />
      </div>

      <input
        type="text"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="🔍 Buscar cliente ou equipamento…"
        style={inputBusca}
      />

      {loading ? (
        <div style={vazioStyle}>Carregando…</div>
      ) : filtrados.length === 0 ? (
        <div style={vazioStyle}>
          {itens.length === 0
            ? "Nenhum cliente na agenda (cadastre feedbacks CRM/RFM para começar)."
            : "Nenhum cliente nesse filtro."}
        </div>
      ) : (
        <div style={listaStyle}>
          {filtrados.map((item) => {
            const cor = CORES_STATUS[item.status];
            const wpp = linkWhatsApp(item);
            return (
              <div key={item.cliente} style={{ ...itemStyle, borderLeft: `4px solid ${cor.fg}` }}>
                {/* Bloco dias */}
                <div style={{ textAlign: "center", flexShrink: 0, minWidth: 80 }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: cor.fg }}>
                    {item.diasParaPrevisao < 0 ? `+${Math.abs(item.diasParaPrevisao)}` : item.diasParaPrevisao}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--portal-text-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                    {item.diasParaPrevisao < 0 ? "dias atrasado" : "dias restantes"}
                  </div>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <strong style={{ fontSize: 14, color: "var(--portal-text)" }}>{item.cliente}</strong>
                    <span style={{ ...statusChipStyle, background: cor.bg, color: cor.fg }}>
                      {cor.emoji} {cor.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--portal-text-secondary)", display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span>Último contato: {fmtData(item.ultimaData)} ({item.diasDesdeUltimo}d atrás)</span>
                    {item.tecnico && <span>· 👷 {item.tecnico}</span>}
                    {item.trator && <span>· 🚜 {item.trator}</span>}
                  </div>
                  {item.ultimoFeedback && (
                    <div style={{ fontSize: 11, color: "var(--portal-text-secondary)", marginTop: 4, fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      &ldquo;{item.ultimoFeedback}&rdquo;
                    </div>
                  )}
                </div>

                {/* Ações */}
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {wpp ? (
                    <a href={wpp} target="_blank" rel="noopener" style={btnWpp}>📱 WhatsApp</a>
                  ) : (
                    <span style={{ ...btnWpp, opacity: 0.4, cursor: "not-allowed" }} title="Sem telefone cadastrado">📱 WhatsApp</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatCard({ cor, bg, label, value, ativo, onClick }: { cor: string; bg: string; label: string; value: number; ativo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: ativo ? cor : bg,
        color: ativo ? "#fff" : cor,
        border: `2px solid ${cor}`,
        borderRadius: 12,
        padding: "16px 18px",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "Inter, sans-serif",
        transition: "all 0.15s",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4, opacity: 0.85 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{value}</div>
    </button>
  );
}

const statsGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12, marginBottom: 16,
};
const inputBusca: React.CSSProperties = {
  width: "100%", padding: "12px 16px", marginBottom: 16,
  border: "1.5px solid var(--portal-border)", borderRadius: 10,
  fontSize: 13, background: "var(--portal-bg-card)", color: "var(--portal-text)",
  fontFamily: "Inter, sans-serif", outline: "none",
};
const listaStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 };
const itemStyle: React.CSSProperties = {
  background: "var(--portal-bg-card)", border: "1px solid var(--portal-border)",
  borderRadius: 10, padding: "14px 18px",
  display: "flex", alignItems: "center", gap: 16,
  boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
};
const statusChipStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
  textTransform: "uppercase", letterSpacing: 0.3,
};
const btnWpp: React.CSSProperties = {
  padding: "8px 14px", background: "#25d366", color: "#fff",
  border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600,
  cursor: "pointer", textDecoration: "none", display: "inline-block",
  fontFamily: "Inter, sans-serif",
};
const vazioStyle: React.CSSProperties = {
  padding: 60, textAlign: "center", color: "var(--portal-text-muted)",
  fontSize: 14, fontStyle: "italic",
};
const erroStyle: React.CSSProperties = {
  marginBottom: 12, padding: "10px 14px",
  background: "#fee2e2", color: "#991b1b", borderRadius: 10, fontSize: 13,
};
