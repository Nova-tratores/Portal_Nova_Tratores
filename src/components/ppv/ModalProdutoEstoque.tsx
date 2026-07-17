"use client";

// Popup de detalhes do produto (dentro do PPV): puxa as infos do Omie via
// /api/estoque/buscar e oferece "Ver mais detalhes" que abre a tela de estoque
// já com o código filtrado.
import { useState, useEffect } from "react";
import type { BuscarResult } from "@/lib/estoque/types";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  codigo: string | null;
  descricao?: string;
  onClose: () => void;
}

interface CaractItem {
  conta_omie: string;
  codigo: string;
  descricao: string;
  caracteristicas: Record<string, unknown>;
}

function fmtRS(v: number | string | undefined) {
  const n = typeof v === "string" ? parseFloat(v) : (v ?? 0);
  return `R$ ${(isNaN(n) ? 0 : n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ModalProdutoEstoque({ open, codigo, descricao, onClose }: Props) {
  const { userProfile } = useAuth();
  const [resultados, setResultados] = useState<{ conta: string; dados: BuscarResult | null }[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [caracts, setCaracts] = useState<CaractItem[]>([]);
  const [observacao, setObservacao] = useState("");
  const [salvandoObs, setSalvandoObs] = useState(false);
  const [obsSalva, setObsSalva] = useState(false);

  useEffect(() => {
    if (!open || !codigo) return;
    setResultados([]);
    setCaracts([]);
    setObservacao("");
    setObsSalva(false);
    setCarregando(true);
    // Busca o produto nas DUAS empresas (NOVA + CASTRO) — cada uma tem seu estoque.
    const CONTAS = ["NOVA", "CASTRO"];
    Promise.all(
      CONTAS.map((c) =>
        fetch(`/api/estoque/buscar?codigo=${encodeURIComponent(codigo)}&conta=${c}`)
          .then((r) => r.json())
          .then((d) => ({ conta: c, dados: d?.erro ? null : (d as BuscarResult) }))
          .catch(() => ({ conta: c, dados: null }))
      )
    )
      .then((rs) => setResultados(rs))
      .finally(() => setCarregando(false));
    // Características (localização/ajustes) + observação, em paralelo.
    fetch(`/api/produtos/caracteristicas?codigo=${encodeURIComponent(codigo)}`)
      .then((r) => r.json())
      .then((d) => setCaracts(Array.isArray(d?.itens) ? d.itens : []))
      .catch(() => {});
    fetch(`/api/produtos/observacao?codigo=${encodeURIComponent(codigo)}`)
      .then((r) => r.json())
      .then((d) => setObservacao(d?.observacao || ""))
      .catch(() => {});
  }, [open, codigo]);

  async function salvarObs() {
    if (!codigo) return;
    setSalvandoObs(true);
    setObsSalva(false);
    try {
      await fetch("/api/produtos/observacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, observacao, atualizadoPor: userProfile?.nome || "" }),
      });
      setObsSalva(true);
    } catch { /* silencioso */ }
    setSalvandoObs(false);
  }

  if (!open) return null;

  const encontrados = resultados.filter((r) => r.dados);
  const primeiro = encontrados[0]?.dados;
  const p = primeiro?.produto;
  const nenhum = !carregando && resultados.length > 0 && encontrados.length === 0;

  const campo = (label: string, valor: React.ReactNode, tom?: "verde" | "vermelho") => (
    <div style={{ background: "#F8FAFC", padding: "12px 14px", borderRadius: 10, border: "1px solid #E2E8F0" }}>
      <div style={{ color: "#64748B", fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{label}</div>
      <div style={{ color: tom === "verde" ? "#16A34A" : tom === "vermelho" ? "#DC2626" : "#0F172A", fontSize: 19, fontWeight: 600 }}>{valor}</div>
    </div>
  );

  // Deixa as chaves de característica legíveis: "#ANDAR" -> "Andar", "TIPO" -> "Tipo".
  const rotuloCaract = (k: string) => {
    const limpo = k.replace(/^#/, "").trim();
    return limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase();
  };

  return (
    <div onClick={(ev) => { if (ev.target === ev.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 3000, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: 700, maxWidth: "96vw", maxHeight: "88vh", overflow: "auto", background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        {/* Cabeçalho */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "18px 22px", borderBottom: "1px solid #F1F5F9" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 600 }}>Produto</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#0F172A" }}>{codigo}</div>
            {(descricao || p?.descricao) && <div style={{ fontSize: 15, color: "#64748B", marginTop: 3 }}>{p?.descricao || descricao}</div>}
          </div>
          <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", fontSize: 24, lineHeight: 1, color: "#94A3B8", cursor: "pointer", flexShrink: 0 }}>&times;</button>
        </div>

        <div style={{ padding: 22 }}>
          {carregando && <div style={{ textAlign: "center", padding: 30, color: "#94A3B8", fontSize: 16 }}><i className="fas fa-spinner fa-spin" /> Carregando dados do produto...</div>}
          {nenhum && <div style={{ padding: 16, borderRadius: 10, background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: 15 }}>Produto não encontrado no cadastro da NOVA nem da CASTRO.</div>}

          {primeiro && !carregando && (
            <>
              {/* Produto (dados comuns) */}
              <div style={{ fontSize: 16, fontWeight: 700, color: "#DC2626", marginBottom: 12 }}>Produto</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
                {campo("Família", p?.familia || "—")}
                {campo("Marca", p?.marca || "N/D")}
              </div>

              {/* Estoque e Custos — por empresa (NOVA / CASTRO) */}
              <div style={{ fontSize: 16, fontWeight: 700, color: "#DC2626", marginBottom: 12 }}>Estoque e Custos</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {encontrados.map(({ conta, dados }) => {
                  const e = dados!.estoque;
                  const saldoNeg = parseFloat(String(e.saldo)) < 0;
                  return (
                    <div key={conta}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "#475569", marginBottom: 8 }}>{conta}</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                        {campo("Valor Venda", fmtRS(dados!.produto.valor_venda), "verde")}
                        {campo("CMC", fmtRS(e.cmc), "verde")}
                        {campo("Saldo", String(e.saldo ?? "—"), saldoNeg ? "vermelho" : undefined)}
                        {campo("Físico", String(e.fisico ?? "—"))}
                        {campo("Pendente", String(e.pendente ?? "—"))}
                        {campo("Reservado", String(e.reservado ?? "—"))}
                        {campo("Est. Mín.", String(e.est_min ?? "—"))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Características (localização / ajustes) */}
          {caracts.length > 0 && (
            <div style={{ marginTop: primeiro ? 18 : 0 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#DC2626", marginBottom: 12 }}>Onde encontrar / Características</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {caracts.map((c, idx) => {
                  const entries = Object.entries(c.caracteristicas || {}).filter(([, v]) => v != null && String(v).trim() !== "");
                  return (
                    <div key={idx} style={{ border: "1px solid #E2E8F0", borderRadius: 10, padding: 14, background: "#F8FAFC" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: "#475569", marginBottom: 10 }}>{c.conta_omie || "—"}</div>
                      {entries.length === 0 ? (
                        <div style={{ fontSize: 15, color: "#94A3B8" }}>Sem características cadastradas.</div>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                          {entries.map(([k, v]) => (
                            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: "#fff", border: "1px solid #E2E8F0" }}>
                              <span style={{ color: "#64748B", fontSize: 13, fontWeight: 500 }}>{rotuloCaract(k)}:</span>
                              <span style={{ color: "#0F172A", fontWeight: 600, fontSize: 16 }}>{String(v)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Observações — bloco amarelo, editável e salvo por produto (compartilha com /estoque) */}
          {!carregando && (
            <div style={{ marginTop: 18, background: "#FDE047", border: "1px solid #EAB308", borderLeft: "5px solid #CA8A04", borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#713F12", fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
                <i className="fas fa-triangle-exclamation" style={{ color: "#A16207" }} /> Observações
              </div>
              <textarea
                value={observacao}
                onChange={(ev) => { setObservacao(ev.target.value); setObsSalva(false); }}
                placeholder="Escreva aqui uma observação sobre este produto..."
                rows={3}
                style={{ width: "100%", resize: "vertical", padding: "12px 14px", borderRadius: 8, border: "1px solid #CA8A04", background: "#FDE047", color: "#713F12", fontSize: 15.5, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, marginTop: 12 }}>
                {obsSalva && <span style={{ color: "#166534", fontSize: 14.5, fontWeight: 600 }}><i className="fas fa-check" /> Salvo</span>}
                <button type="button" onClick={salvarObs} disabled={salvandoObs}
                  style={{ padding: "10px 22px", borderRadius: 8, border: "none", background: salvandoObs ? "#A16207" : "#CA8A04", color: "#fff", fontSize: 15, fontWeight: 600, cursor: salvandoObs ? "wait" : "pointer" }}>
                  {salvandoObs ? "Salvando..." : "Salvar observação"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 22px", borderTop: "1px solid #F1F5F9" }}>
          <button type="button" onClick={onClose} style={{ padding: "12px 22px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", fontSize: 15.5, fontWeight: 500, cursor: "pointer" }}>Fechar</button>
          <a href={`/estoque?codigo=${encodeURIComponent(codigo || "")}`} target="_blank" rel="noopener noreferrer"
            style={{ padding: "12px 22px", borderRadius: 10, border: "none", background: "#DC2626", color: "#fff", fontSize: 15.5, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <i className="fas fa-up-right-from-square" /> Ver mais detalhes
          </a>
        </div>
      </div>
    </div>
  );
}
