"use client";
import { useEffect, useState } from "react";
import { buscarHistoricoCliente, type HistoricoCliente } from "@/lib/feedbacks/api";

interface Props {
  aberto: boolean;
  nome: string;
  codigoOmie: string | null;
  onFechar: () => void;
}

const ETAPA_OS: Record<string, string> = { "10": "Em aberto", "20": "Parcial", "30": "Executada", "50": "Faturando", "60": "Faturada", "70": "Devolvida" };

function fmtData(s: string | null): string {
  if (!s) return "—";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return br ? `${br[1]}/${br[2]}/${br[3]}` : s;
}
function fmtMoeda(v: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ModalHistoricoCliente({ aberto, nome, codigoOmie, onFechar }: Props) {
  const [dados, setDados] = useState<HistoricoCliente | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setCarregando(true);
    setDados(null);
    buscarHistoricoCliente(codigoOmie, nome)
      .then(setDados)
      .finally(() => setCarregando(false));
  }, [aberto, codigoOmie, nome]);

  if (!aberto) return null;

  const totalOS = dados?.os.reduce((s, o) => s + (o.valor_total || 0), 0) ?? 0;
  const totalPV = dados?.pv.reduce((s, p) => s + (p.valor_total || 0), 0) ?? 0;

  return (
    <div style={overlay} onClick={onFechar}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        <header style={header}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85, textTransform: "uppercase", letterSpacing: 0.8 }}>
              Histórico do cliente
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: "4px 0 0" }}>{nome}</h2>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
              {codigoOmie ? `Omie #${codigoOmie}` : "sem código Omie — mostrando o que dá por nome"}
            </div>
          </div>
          <button onClick={onFechar} style={btnFechar}>✕</button>
        </header>

        <div style={body}>
          {carregando ? (
            <div style={vazio}>Carregando histórico…</div>
          ) : !dados ? (
            <div style={vazio}>Não foi possível carregar.</div>
          ) : (
            <>
              {/* Resumo */}
              <div style={resumoGrid}>
                <Resumo icon="🔧" label="Ordens de serviço" valor={String(dados.os.length)} sub={fmtMoeda(totalOS)} />
                <Resumo icon="🧾" label="Pedidos de venda" valor={String(dados.pv.length)} sub={fmtMoeda(totalPV)} />
                <Resumo icon="📦" label="Requisições/compras" valor={String(dados.requisicoes.length)} sub="" />
              </div>

              {/* Ordens de serviço */}
              <Secao titulo={`🔧 Ordens de serviço (${dados.os.length})`}>
                {dados.os.length === 0 ? <Nada /> : dados.os.map((o, i) => (
                  <Linha key={`os${i}`}
                    titulo={`OS #${o.num_os || "—"}${o.empresa ? ` · ${o.empresa}` : ""}`}
                    data={fmtData(o.data_inclusao)}
                    valor={fmtMoeda(o.valor_total)}
                    badge={o.status || ETAPA_OS[o.etapa || ""] || o.etapa || ""}
                    detalhe={o.descricao || o.servicos || (o.num_nf ? `NF ${o.num_nf}` : "")}
                  />
                ))}
              </Secao>

              {/* Pedidos de venda */}
              <Secao titulo={`🧾 Pedidos de venda (${dados.pv.length})`}>
                {dados.pv.length === 0 ? <Nada /> : dados.pv.map((p, i) => (
                  <Linha key={`pv${i}`}
                    titulo={`Pedido #${p.num_pedido || "—"}${p.empresa ? ` · ${p.empresa}` : ""}`}
                    data={fmtData(p.data_inclusao)}
                    valor={fmtMoeda(p.valor_total)}
                    badge={(p.faturado === "S" || p.faturado === "SIM") ? "Faturado" : (p.etapa || "")}
                    detalhe={p.numero_nf ? `NF ${p.numero_nf}` : ""}
                  />
                ))}
              </Secao>

              {/* Requisições / compras */}
              <Secao titulo={`📦 Requisições / compras (${dados.requisicoes.length})`}>
                {dados.requisicoes.length === 0 ? <Nada /> : dados.requisicoes.map((rq) => (
                  <Linha key={`req${rq.id}`}
                    titulo={`${rq.titulo || "Requisição"}${rq.tipo ? ` · ${rq.tipo}` : ""}`}
                    data={fmtData(rq.data)}
                    valor={fmtMoeda(rq.valor_despeza)}
                    badge={rq.status || ""}
                    detalhe={[rq.fornecedor ? `Forn.: ${rq.fornecedor}` : "", rq.ordem_servico ? `OS ${rq.ordem_servico}` : ""].filter(Boolean).join(" · ")}
                  />
                ))}
              </Secao>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Resumo({ icon, label, valor, sub }: { icon: string; label: string; valor: string; sub: string }) {
  return (
    <div style={{ background: "var(--portal-bg-card)", border: "1px solid var(--portal-border)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, color: "var(--portal-text-muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>{icon} {label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--portal-text)" }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--portal-text-secondary)" }}>{sub}</div>}
    </div>
  );
}
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--portal-text)", marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}
function Linha({ titulo, data, valor, badge, detalhe }: { titulo: string; data: string; valor: string; badge: string; detalhe: string }) {
  return (
    <div style={{ border: "1px solid var(--portal-border)", borderRadius: 8, padding: "8px 12px", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--portal-text)" }}>{titulo}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#065f46" }}>{valor}</span>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 3, fontSize: 11, color: "var(--portal-text-secondary)" }}>
        <span>📅 {data}</span>
        {badge && <span style={{ background: "#f3f4f6", borderRadius: 5, padding: "1px 7px", fontWeight: 600 }}>{badge}</span>}
        {detalhe && <span>{detalhe}</span>}
      </div>
    </div>
  );
}
function Nada() {
  return <div style={{ fontSize: 12, color: "var(--portal-text-muted)", fontStyle: "italic", padding: "4px 2px" }}>Nada registrado.</div>;
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 10000, padding: 16, fontFamily: "Inter, sans-serif",
};
const modal: React.CSSProperties = {
  background: "#fff", width: "100%", maxWidth: 720, maxHeight: "92vh",
  borderRadius: 14, display: "flex", flexDirection: "column",
  boxShadow: "0 25px 60px rgba(0,0,0,0.3)", overflow: "hidden",
};
const header: React.CSSProperties = {
  padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "flex-start",
  background: "linear-gradient(135deg, #0ea5e9, #0369a1)", color: "#fff",
};
const body: React.CSSProperties = { padding: 22, overflowY: "auto", flex: 1, background: "#fafafa" };
const btnFechar: React.CSSProperties = {
  background: "rgba(255,255,255,0.18)", color: "#fff", border: "none",
  width: 32, height: 32, borderRadius: 8, fontSize: 16, cursor: "pointer", fontWeight: 700,
};
const resumoGrid: React.CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10,
};
const vazio: React.CSSProperties = { padding: 50, textAlign: "center", color: "var(--portal-text-muted)", fontSize: 14, fontStyle: "italic" };
