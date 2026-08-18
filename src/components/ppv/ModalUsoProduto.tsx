"use client";

// Filtro por código: mostra TODOS os PPVs que usaram (ou estão usando) um
// produto, com o resumo e as informações completas do produto (reaproveita o
// ModalProdutoEstoque).
import { useEffect, useState } from "react";
import ModalProdutoEstoque from "./ModalProdutoEstoque";

interface PpvUso {
  id: string; quantidade: number; descricao: string; preco: number;
  cliente: string; tecnico: string; status: string; data: string | null;
  tipo: string; total: number;
}
interface Resp {
  codigo: string; total_ppvs: number; em_aberto: number; total_qtde: number; ppvs: PpvUso[];
}

interface Props {
  open: boolean;
  codigo: string | null;
  descricao?: string;
  onClose: () => void;
  onAbrirPpv?: (id: string) => void;
}

const emAbertoStatus = (s: string) => !/conclu|cancel/i.test(String(s || ""));
const corStatus = (s: string) => {
  if (/conclu/i.test(s)) return { bg: "#DCFCE7", fg: "#166534" };
  if (/cancel/i.test(s)) return { bg: "#F1F5F9", fg: "#64748B" };
  return { bg: "#FEE2E2", fg: "#EA580C" };
};
// A data vem em "DD/MM/AAAA HH:mm" (Brasil). new Date() não entende esse
// formato → dava "Invalid Date". Aqui parseamos manualmente; se vier ISO,
// caímos no Date normal.
const fmtData = (d: string | null) => {
  if (!d) return "—";
  const s = String(d).trim();
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[1]}/${m[2]}/${m[3]}`;
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("pt-BR");
};
const fmtRS = (v: unknown) => { const n = parseFloat(String(v ?? 0)); return `R$ ${(isNaN(n) ? 0 : n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; };

interface InfoConta { conta: string; valor_venda: unknown; saldo: unknown; cmc: unknown; familia?: string; marca?: string }

export default function ModalUsoProduto({ open, codigo, descricao, onClose, onAbrirPpv }: Props) {
  const [dados, setDados] = useState<Resp | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [soAberto, setSoAberto] = useState(false);
  const [verInfo, setVerInfo] = useState(false);
  // Informações do produto (estoque nas duas empresas) — já abertas por padrão.
  const [info, setInfo] = useState<InfoConta[] | null>(null);
  const [infoLoad, setInfoLoad] = useState(false);

  useEffect(() => {
    if (!open || !codigo) return;
    setDados(null); setSoAberto(false); setCarregando(true);
    fetch(`/api/ppv/uso-produto?codigo=${encodeURIComponent(codigo)}`)
      .then((r) => r.json())
      .then((d) => setDados(d?.error ? null : d))
      .catch(() => setDados(null))
      .finally(() => setCarregando(false));

    // Info do produto nas duas empresas (mesma fonte do popup de informações).
    setInfo(null); setInfoLoad(true);
    Promise.all(["NOVA", "CASTRO"].map((c) =>
      fetch(`/api/estoque/buscar?codigo=${encodeURIComponent(codigo)}&conta=${c}`)
        .then((r) => r.json())
        .then((d) => (d?.erro ? null : { conta: c, valor_venda: d?.produto?.valor_venda, saldo: d?.estoque?.saldo, cmc: d?.estoque?.cmc, familia: d?.produto?.familia, marca: d?.produto?.marca }))
        .catch(() => null)
    )).then((rs) => setInfo(rs.filter(Boolean) as InfoConta[])).finally(() => setInfoLoad(false));
  }, [open, codigo]);

  if (!open || !codigo) return null;

  const lista = (dados?.ppvs || []).filter((p) => !soAberto || emAbertoStatus(p.status));

  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        onClick={onClose}>
        <div style={{ background: "#fff", width: "100%", maxWidth: 1040, maxHeight: "94vh", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}
          onClick={(e) => e.stopPropagation()}>
          {/* Cabeçalho */}
          <div style={{ padding: "18px 22px", borderBottom: "1px solid rgba(0,0,0,0.5)", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#FFF7ED", color: "#EA580C", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <i className="fas fa-magnifying-glass-chart" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Histórico do produto</div>
              <div style={{ fontSize: 13, color: "#64748b", fontFamily: "ui-monospace, Menlo, monospace" }}>{codigo}{descricao ? ` · ${descricao}` : ""}</div>
            </div>
            <button onClick={() => setVerInfo(true)} title="Características, observações e mais" style={{ padding: "8px 13px", borderRadius: 9, border: "1.5px solid rgba(0,0,0,0.5)", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              <i className="fas fa-circle-info" style={{ marginRight: 6 }} />Mais detalhes
            </button>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, border: "none", background: "#f1f5f9", color: "#64748b", cursor: "pointer" }}><i className="fas fa-times" /></button>
          </div>

          {/* Informações do produto — já abertas (estoque nas duas empresas) */}
          <div style={{ padding: "14px 22px", borderBottom: "1px solid rgba(0,0,0,0.5)", background: "#fafbfc" }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#EA580C", textTransform: "uppercase", letterSpacing: .5, marginBottom: 8 }}>Informações do produto</div>
            {infoLoad ? (
              <div style={{ color: "#94a3b8", fontSize: 13 }}><i className="fas fa-spinner fa-spin" style={{ marginRight: 6 }} />Carregando…</div>
            ) : !info || info.length === 0 ? (
              <div style={{ color: "#94a3b8", fontSize: 13 }}>Produto não encontrado no cadastro da NOVA nem da CASTRO.</div>
            ) : (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {info.map((c) => {
                  const saldoNeg = parseFloat(String(c.saldo ?? 0)) < 0;
                  return (
                    <div key={c.conta} style={{ flex: "1 1 300px", border: "1px solid rgba(0,0,0,0.5)", borderRadius: 11, padding: "10px 14px", background: "#fff" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 700, color: "#475569", marginBottom: 8 }}>{c.conta}{(c.marca || c.familia) ? <span style={{ fontWeight: 500, color: "#94a3b8" }}> · {[c.marca, c.familia].filter(Boolean).join(" / ")}</span> : null}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                        {[
                          { l: "Valor Venda", v: fmtRS(c.valor_venda), cor: "#059669" },
                          { l: "CMC", v: fmtRS(c.cmc), cor: "#059669" },
                          { l: "Saldo", v: String(c.saldo ?? "—"), cor: saldoNeg ? "#EA580C" : "#0f172a" },
                        ].map((f) => (
                          <div key={f.l}>
                            <div style={{ fontSize: 10.5, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .4 }}>{f.l}</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: f.cor, fontVariantNumeric: "tabular-nums" }}>{f.v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Resumo */}
          <div style={{ display: "flex", gap: 10, padding: "14px 22px", borderBottom: "1px solid rgba(0,0,0,0.5)" }}>
            {[
              { k: "PPVs no total", v: dados?.total_ppvs ?? 0, cor: "#0f172a" },
              { k: "Em aberto", v: dados?.em_aberto ?? 0, cor: "#EA580C" },
              { k: "Qtd. somada", v: dados?.total_qtde ?? 0, cor: "#0f172a" },
            ].map((c) => (
              <div key={c.k} style={{ flex: 1, background: "#f8fafc", border: "1px solid rgba(0,0,0,0.5)", borderRadius: 11, padding: "10px 14px" }}>
                <div style={{ fontSize: 11.5, color: "#64748b", textTransform: "uppercase", letterSpacing: .5 }}>{c.k}</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: c.cor, fontVariantNumeric: "tabular-nums" }}>{c.v}</div>
              </div>
            ))}
          </div>

          {/* Filtro */}
          <div style={{ padding: "10px 22px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(0,0,0,0.5)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, color: "#475569", cursor: "pointer" }}>
              <input type="checkbox" checked={soAberto} onChange={(e) => setSoAberto(e.target.checked)} style={{ width: 16, height: 16, accentColor: "#EA580C" }} />
              Mostrar só os em aberto
            </label>
          </div>

          {/* Lista de PPVs */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {carregando ? (
              <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}><i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }} />Buscando…</div>
            ) : lista.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Nenhum PPV {soAberto ? "em aberto " : ""}usou este produto.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#94a3b8", fontSize: 11.5, textTransform: "uppercase", letterSpacing: .5 }}>
                    <th style={{ padding: "9px 22px" }}>PPV</th><th style={{ padding: "9px 8px" }}>Cliente</th>
                    <th style={{ padding: "9px 8px" }}>Status</th><th style={{ padding: "9px 8px", textAlign: "center" }}>Qtd</th>
                    <th style={{ padding: "9px 22px 9px 8px" }}>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((p) => {
                    const cs = corStatus(p.status);
                    return (
                      <tr key={p.id} onClick={() => onAbrirPpv?.(p.id)}
                        style={{ borderTop: "1px solid rgba(0,0,0,0.5)", cursor: onAbrirPpv ? "pointer" : "default" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                        <td style={{ padding: "11px 22px", fontWeight: 700, color: "#2563eb" }}>#{p.id}</td>
                        <td style={{ padding: "11px 8px", color: "#0f172a" }}>{p.cliente}{p.tecnico ? <span style={{ color: "#94a3b8" }}> · {p.tecnico}</span> : null}</td>
                        <td style={{ padding: "11px 8px" }}><span style={{ fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, background: cs.bg, color: cs.fg }}>{p.status}</span></td>
                        <td style={{ padding: "11px 8px", textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{p.quantidade}</td>
                        <td style={{ padding: "11px 22px 11px 8px", color: "#64748b", whiteSpace: "nowrap" }}>{fmtData(p.data)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <ModalProdutoEstoque open={verInfo} codigo={codigo} descricao={descricao} onClose={() => setVerInfo(false)} />
    </>
  );
}
