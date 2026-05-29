"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listarRegistros } from "@/lib/feedbacks/api";
import type { FeedbackRegistro, TipoFeedback } from "@/lib/feedbacks/types";

type Fonte = "todos" | TipoFeedback;
type View = "geral" | "dia";

interface StatsTecnico {
  tecnico: string;
  total: number;
  satisfeitos: number;
  insatisfeitos: number;
  notaMedia: number | null;
  pctSatisfeitos: number;
}

interface StatsCliente {
  nome: string;
  total: number;
  notaMedia: number | null;
  ultimoContato: string;
}

function dataRef(r: FeedbackRegistro): string {
  return r.data_contato || r.data_servico || r.ultimo_servico || r.criado_em;
}

function escapeCSV(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function gerarCSV(rows: FeedbackRegistro[]): string {
  const headers = [
    "id","tipo","nome","telefone","trator","tecnico","codigo_omie","data_contato",
    "servico","data_servico","status_cliente","nota","feedback","nps","melhoria",
    "ultimo_servico","motivo","prioridade","acao","sem_resposta","revisao_confirmada",
    "criado_em",
  ];
  const linhas = [headers.join(",")];
  for (const r of rows) {
    linhas.push(headers.map((h) => escapeCSV((r as unknown as Record<string, unknown>)[h])).join(","));
  }
  return linhas.join("\n");
}

function baixarCSV(rows: FeedbackRegistro[], nome: string) {
  const csv = "﻿" + gerarCSV(rows);  // BOM para Excel BR
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}

export default function RelatoriosPage() {
  const [registros, setRegistros] = useState<FeedbackRegistro[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [fonte, setFonte] = useState<Fonte>("todos");
  const [view, setView] = useState<View>("geral");
  const [dataDe, setDataDe] = useState("");
  const [dataAte, setDataAte] = useState("");
  const [diaEscolhido, setDiaEscolhido] = useState(() => new Date().toISOString().slice(0, 10));

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

  const filtradas = useMemo(() => {
    return registros.filter((r) => {
      if (fonte !== "todos" && r.tipo !== fonte) return false;
      const d = dataRef(r);
      if (dataDe && d && d < dataDe) return false;
      if (dataAte && d && d > dataAte) return false;
      return true;
    });
  }, [registros, fonte, dataDe, dataAte]);

  const statsTecnico = useMemo<StatsTecnico[]>(() => {
    const map = new Map<string, StatsTecnico>();
    for (const r of filtradas) {
      if (!r.tecnico) continue;
      let s = map.get(r.tecnico);
      if (!s) {
        s = { tecnico: r.tecnico, total: 0, satisfeitos: 0, insatisfeitos: 0, notaMedia: null, pctSatisfeitos: 0 };
        map.set(r.tecnico, s);
      }
      s.total++;
      if (r.status_cliente === "Satisfeito") s.satisfeitos++;
      if (r.status_cliente === "Insatisfeito") s.insatisfeitos++;
    }
    for (const s of map.values()) {
      const notas = filtradas.filter((r) => r.tecnico === s.tecnico).map((r) => r.nota).filter((n): n is number => n !== null && n !== undefined);
      s.notaMedia = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null;
      s.pctSatisfeitos = s.total > 0 ? Math.round((s.satisfeitos / s.total) * 100) : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [filtradas]);

  const topClientes = useMemo<StatsCliente[]>(() => {
    const map = new Map<string, StatsCliente>();
    for (const r of filtradas) {
      let s = map.get(r.nome);
      if (!s) {
        s = { nome: r.nome, total: 0, notaMedia: null, ultimoContato: "" };
        map.set(r.nome, s);
      }
      s.total++;
      const d = dataRef(r);
      if (d > s.ultimoContato) s.ultimoContato = d;
    }
    for (const s of map.values()) {
      const notas = filtradas.filter((r) => r.nome === s.nome).map((r) => r.nota).filter((n): n is number => n !== null && n !== undefined);
      s.notaMedia = notas.length ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10 : null;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 20);
  }, [filtradas]);

  const doDia = useMemo(() => filtradas.filter((r) => dataRef(r).startsWith(diaEscolhido)), [filtradas, diaEscolhido]);

  return (
    <div style={{ paddingTop: 20, fontFamily: "Inter, sans-serif" }}>
      <div style={topoStyle}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: "var(--portal-text)", margin: 0, flex: 1 }}>
          📊 Relatórios
        </h1>
        <button onClick={() => baixarCSV(filtradas, `relatorio-feedbacks-${new Date().toISOString().slice(0,10)}.csv`)} style={btnPrimario}>
          ⬇ Exportar CSV ({filtradas.length})
        </button>
      </div>

      {/* Pills de view */}
      <div style={pillsStyle}>
        {[
          { v: "geral", label: "Geral" },
          { v: "dia",   label: "Por dia" },
        ].map((p) => (
          <button
            key={p.v}
            onClick={() => setView(p.v as View)}
            style={{
              ...pillStyle,
              background: view === p.v ? "#dc2626" : "transparent",
              color: view === p.v ? "#fff" : "var(--portal-text-secondary)",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={filtrosStyle}>
        <FiltroCampo label="Fonte">
          <select value={fonte} onChange={(e) => setFonte(e.target.value as Fonte)} style={filtroInput}>
            <option value="todos">Todos (CRM+RFM)</option>
            <option value="crm">Apenas CRM</option>
            <option value="rfm">Apenas RFM</option>
          </select>
        </FiltroCampo>
        {view === "geral" ? (
          <>
            <FiltroCampo label="Data de">
              <input type="date" value={dataDe} onChange={(e) => setDataDe(e.target.value)} style={filtroInput} />
            </FiltroCampo>
            <FiltroCampo label="Data até">
              <input type="date" value={dataAte} onChange={(e) => setDataAte(e.target.value)} style={filtroInput} />
            </FiltroCampo>
          </>
        ) : (
          <FiltroCampo label="Dia">
            <input type="date" value={diaEscolhido} onChange={(e) => setDiaEscolhido(e.target.value)} style={filtroInput} />
          </FiltroCampo>
        )}
      </div>

      {erro && <div style={erroStyle}>{erro}</div>}

      {loading ? (
        <div style={vazioStyle}>Carregando…</div>
      ) : view === "geral" ? (
        <>
          {/* Cards de totais */}
          <div style={statsGrid}>
            <StatCard icon="📊" label="Total" value={filtradas.length} />
            <StatCard icon="🔴" label="CRM" value={filtradas.filter((r) => r.tipo === "crm").length} />
            <StatCard icon="🟡" label="RFM" value={filtradas.filter((r) => r.tipo === "rfm").length} />
            <StatCard icon="★" label="Nota média" value={(() => {
              const notas = filtradas.map((r) => r.nota).filter((n): n is number => n !== null && n !== undefined);
              return notas.length ? (Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 10) / 10).toString() : "—";
            })()} />
            <StatCard icon="😊" label="% Satisfeitos" value={(() => {
              const comStatus = filtradas.filter((r) => r.status_cliente);
              if (!comStatus.length) return "—";
              const sat = comStatus.filter((r) => r.status_cliente === "Satisfeito").length;
              return `${Math.round((sat / comStatus.length) * 100)}%`;
            })()} />
          </div>

          {/* Tabela técnicos */}
          <div style={secaoStyle}>
            <h2 style={tituloSecaoStyle}>👷 Performance por Técnico</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={tabelaStyle}>
                <thead>
                  <tr>
                    <Th>Técnico</Th><Th>Total</Th><Th>Satisfeitos</Th><Th>Insatisfeitos</Th><Th>Nota média</Th><Th>% Satisfação</Th>
                  </tr>
                </thead>
                <tbody>
                  {statsTecnico.map((s) => (
                    <tr key={s.tecnico}>
                      <Td><strong>{s.tecnico}</strong></Td>
                      <Td>{s.total}</Td>
                      <Td>{s.satisfeitos}</Td>
                      <Td>{s.insatisfeitos}</Td>
                      <Td>{s.notaMedia ?? "—"}</Td>
                      <Td><span style={badgePctStyle(s.pctSatisfeitos)}>{s.pctSatisfeitos}%</span></Td>
                    </tr>
                  ))}
                  {statsTecnico.length === 0 && (
                    <tr><Td colSpan={6}><em style={{ color: "var(--portal-text-muted)" }}>Sem dados.</em></Td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top clientes */}
          <div style={secaoStyle}>
            <h2 style={tituloSecaoStyle}>🏆 Top 20 Clientes</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={tabelaStyle}>
                <thead>
                  <tr><Th>Cliente</Th><Th>Total</Th><Th>Nota média</Th><Th>Último contato</Th></tr>
                </thead>
                <tbody>
                  {topClientes.map((s) => (
                    <tr key={s.nome}>
                      <Td><strong>{s.nome}</strong></Td>
                      <Td>{s.total}</Td>
                      <Td>{s.notaMedia ?? "—"}</Td>
                      <Td>{s.ultimoContato.slice(0, 10) || "—"}</Td>
                    </tr>
                  ))}
                  {topClientes.length === 0 && (
                    <tr><Td colSpan={4}><em style={{ color: "var(--portal-text-muted)" }}>Sem dados.</em></Td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        // View por dia
        <div style={secaoStyle}>
          <h2 style={tituloSecaoStyle}>
            Registros em {diaEscolhido.split("-").reverse().join("/")} — {doDia.length}
          </h2>
          <div style={{ overflowX: "auto" }}>
            <table style={tabelaStyle}>
              <thead>
                <tr><Th>Tipo</Th><Th>Cliente</Th><Th>Técnico</Th><Th>Serviço/Motivo</Th><Th>Nota</Th></tr>
              </thead>
              <tbody>
                {doDia.map((r) => (
                  <tr key={r.id}>
                    <Td><span style={tipoBadge(r.tipo)}>{r.tipo.toUpperCase()}</span></Td>
                    <Td><strong>{r.nome}</strong></Td>
                    <Td>{r.tecnico || "—"}</Td>
                    <Td>{r.tipo === "crm" ? (r.servico || "—") : (r.motivo || "—")}</Td>
                    <Td>{r.nota ?? "—"}</Td>
                  </tr>
                ))}
                {doDia.length === 0 && (
                  <tr><Td colSpan={5}><em style={{ color: "var(--portal-text-muted)" }}>Nada nesse dia.</em></Td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FiltroCampo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "var(--portal-text-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
function StatCard({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div style={{ background: "var(--portal-bg-card)", border: "1px solid var(--portal-border)", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "var(--portal-text-muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--portal-text)" }}>{value}</div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{ textAlign: "left", padding: "10px 12px", background: "#fafafa", borderBottom: "1.5px solid var(--portal-border)", fontSize: 11, fontWeight: 700, color: "var(--portal-text-secondary)", textTransform: "uppercase", letterSpacing: 0.4 }}>
      {children}
    </th>
  );
}
function Td({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <td colSpan={colSpan} style={{ padding: "10px 12px", borderBottom: "1px solid var(--portal-border)", fontSize: 12, color: "var(--portal-text)" }}>
      {children}
    </td>
  );
}
function badgePctStyle(pct: number): React.CSSProperties {
  const cor = pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#dc2626";
  const bg = pct >= 80 ? "#d1fae5" : pct >= 50 ? "#fef3c7" : "#fee2e2";
  return { background: bg, color: cor, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 };
}
function tipoBadge(tipo: TipoFeedback): React.CSSProperties {
  return {
    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
    background: tipo === "crm" ? "#fef2f2" : "#fef3c7",
    color: tipo === "crm" ? "#b91c1c" : "#92400e",
    letterSpacing: 0.3, display: "inline-block",
  };
}

const topoStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 16 };
const pillsStyle: React.CSSProperties = { display: "flex", gap: 6, marginBottom: 16 };
const pillStyle: React.CSSProperties = {
  padding: "8px 18px", border: "1.5px solid var(--portal-border)",
  borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer",
  fontFamily: "Inter, sans-serif",
};
const filtrosStyle: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12, padding: 16, background: "var(--portal-bg-card)",
  border: "1px solid var(--portal-border)", borderRadius: 12, marginBottom: 20,
};
const filtroInput: React.CSSProperties = {
  width: "100%", padding: "8px 12px",
  border: "1px solid var(--portal-border)", borderRadius: 8,
  fontSize: 12, background: "var(--portal-bg-card)", color: "var(--portal-text)",
  fontFamily: "Inter, sans-serif", outline: "none",
};
const statsGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12, marginBottom: 24,
};
const secaoStyle: React.CSSProperties = { marginBottom: 28 };
const tituloSecaoStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 800, color: "var(--portal-text)",
  textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12,
};
const tabelaStyle: React.CSSProperties = {
  width: "100%", borderCollapse: "collapse",
  background: "var(--portal-bg-card)",
  border: "1px solid var(--portal-border)", borderRadius: 10,
  fontFamily: "Inter, sans-serif",
};
const btnPrimario: React.CSSProperties = {
  padding: "9px 18px", background: "linear-gradient(135deg, #dc2626, #b91c1c)",
  color: "#fff", border: "none", borderRadius: 10,
  fontSize: 13, fontWeight: 700, cursor: "pointer",
  boxShadow: "0 2px 8px rgba(185,28,28,0.25)", fontFamily: "Inter, sans-serif",
};
const vazioStyle: React.CSSProperties = {
  padding: 60, textAlign: "center", color: "var(--portal-text-muted)",
  fontSize: 14, fontStyle: "italic",
};
const erroStyle: React.CSSProperties = {
  marginBottom: 12, padding: "10px 14px",
  background: "#fee2e2", color: "#991b1b", borderRadius: 10, fontSize: 13,
};
