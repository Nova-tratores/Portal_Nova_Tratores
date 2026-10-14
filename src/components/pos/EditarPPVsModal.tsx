"use client";
// Janela "PPVs vinculados" da OS (José, 14/10/2026): escolher quais PPVs ficam
// vinculados; ao desvincular, perguntar se mantém o PPV ativo ou cancela (com
// motivo). Grava em POST /api/pos/ordens/[id]/ppvs.
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "@/lib/auth/client";

interface PPVResumo { id: string; cliente: string; status: string; valor: number; pedidoOmie: string; osId: string; tipo: string; data: string; nfNumero: string }
type Destino = "manter" | "cancelar";

const brl = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const semZeros = (s: string) => String(s || "").replace(/^0+(?=\d)/, "");
const norm = (s: string) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const AZUL = "#0369A1";

export default function EditarPPVsModal({ osId, cliente, vinculados, onClose, onSalvo }: {
  osId: string; cliente: string; vinculados: string[]; onClose: () => void; onSalvo: (novaLista: string) => void;
}) {
  const [todos, setTodos] = useState<PPVResumo[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(vinculados));
  const [destino, setDestino] = useState<Record<string, Destino>>({});
  const [motivo, setMotivo] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch("/api/ppv/pedidos").then((r) => r.json()).then((l: PPVResumo[]) => { if (vivo) setTodos(Array.isArray(l) ? l : []); }).catch(() => { if (vivo) setTodos([]); });
    return () => { vivo = false; };
  }, []);

  const porId = useMemo(() => new Map((todos || []).map((p) => [p.id, p])), [todos]);
  // candidatos: os vinculados + os do mesmo cliente que estão em aberto + o que bater na busca
  const lista = useMemo(() => {
    if (!todos) return [];
    const q = norm(busca);
    const fechado = (p: PPVResumo) => ["Cancelada", "Concluída"].includes(p.status);
    const doCliente = todos.filter((p) => norm(p.cliente) === norm(cliente) && !fechado(p));
    const achados = q ? todos.filter((p) => norm(p.id).includes(q) || norm(p.cliente).includes(q) || semZeros(p.pedidoOmie) === q.replace(/^0+/, "")).slice(0, 30) : [];
    const ids = new Set<string>([...vinculados, ...doCliente.map((p) => p.id), ...achados.map((p) => p.id)]);
    return [...ids].map((id) => porId.get(id) || { id, cliente: "", status: "", valor: 0, pedidoOmie: "", osId: "", tipo: "", data: "", nfNumero: "" })
      .sort((a, b) => Number(vinculados.includes(b.id)) - Number(vinculados.includes(a.id)) || b.id.localeCompare(a.id));
  }, [todos, busca, cliente, vinculados, porId]);

  const saindo = vinculados.filter((id) => !marcados.has(id));
  const entrando = [...marcados].filter((id) => !vinculados.includes(id));
  const faltaMotivo = saindo.some((id) => destino[id] === "cancelar" && !String(motivo[id] || "").trim());
  const semEscolha = saindo.some((id) => !destino[id]);
  const mudou = saindo.length + entrando.length > 0;

  const alternar = (id: string) => setMarcados((m) => { const n = new Set(m); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const salvar = async () => {
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/ppvs`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ vincular: entrando, desvincular: saindo.map((id) => ({ id, cancelar: destino[id] === "cancelar", motivo: motivo[id] || "" })) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(j.error || `Erro ${r.status}`); setSalvando(false); return; }
      if (j.avisos?.length) alert(j.avisos.join("\n"));
      onSalvo(String(j.ppv || ""));
      onClose();
    } catch { setErro("Falha de conexão."); }
    setSalvando(false);
  };

  const chip = (t: string, cor: string, bg: string) => <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 8px", borderRadius: 999, color: cor, background: bg, whiteSpace: "nowrap" }}>{t}</span>;

  return createPortal(
    <div onClick={salvando ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 100006, background: "rgba(15,23,42,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 640, maxWidth: "96vw", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "var(--surface, #fefefe)", borderRadius: 16, border: "1px solid var(--border, #e2e8f0)", boxShadow: "0 30px 80px rgba(0,0,0,.35)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--border, #e2e8f0)" }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: `color-mix(in srgb, ${AZUL} 12%, transparent)`, color: AZUL, display: "flex", alignItems: "center", justifyContent: "center" }}><i className="fas fa-boxes" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--portal-text, #0f172a)" }}>PPVs vinculados à {osId}</div>
            <div style={{ fontSize: 12, color: "var(--portal-text-muted, #64748b)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Marque os pedidos de peças desta OS · {cliente}</div>
          </div>
          {!salvando && <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 20, color: "#94a3b8", cursor: "pointer" }}>×</button>}
        </div>

        <div style={{ padding: "12px 20px 4px" }}>
          <div style={{ position: "relative" }}>
            <i className="fas fa-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 12 }} />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar outro PPV (nº do PPV, do pedido no Omie ou cliente)…"
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 32px", borderRadius: 10, border: "1px solid var(--border, #cbd5e1)", fontSize: 13, background: "var(--surface, #fefefe)", color: "var(--portal-text, #0f172a)", fontFamily: "inherit", marginBottom: 0 }} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          {!todos && <div style={{ fontSize: 13, color: "#64748b", padding: 12 }}><i className="fas fa-spinner fa-spin" /> Carregando os PPVs…</div>}
          {todos && lista.length === 0 && <div style={{ fontSize: 13, color: "#64748b", padding: 12 }}>Nenhum PPV em aberto deste cliente. Use a busca para achar outro.</div>}
          {lista.map((p) => {
            const on = marcados.has(p.id);
            const sai = vinculados.includes(p.id) && !on;
            const entra = !vinculados.includes(p.id) && on;
            const outraOS = p.osId && p.osId !== osId ? p.osId : "";
            return (
              <div key={p.id} style={{ border: `1.5px solid ${sai ? "#fca5a5" : on ? AZUL : "var(--border, #e2e8f0)"}`, borderRadius: 12, background: sai ? "#fff7f7" : on ? `color-mix(in srgb, ${AZUL} 5%, var(--surface, #fefefe))` : "var(--surface, #fefefe)", transition: "border-color .15s" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", cursor: "pointer", margin: 0, textTransform: "none", letterSpacing: 0, fontWeight: 400 }}>
                  <input type="checkbox" checked={on} onChange={() => alternar(p.id)} style={{ width: 18, height: 18, accentColor: AZUL, margin: 0, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <b style={{ fontSize: 14, color: "var(--portal-text, #0f172a)" }}>{p.id}</b>
                      {p.status && chip(p.status === "Concluída" ? "Faturado" : p.status, "#334155", "var(--portal-bg-secondary, #f1f5f9)")}
                      {p.pedidoOmie && chip(`pedido ${semZeros(p.pedidoOmie)}`, "#0B6E70", "#e0f2f1")}
                      {p.tipo === "Remessa" && chip("Remessa", "#7c3aed", "#ede9fe")}
                      {entra && chip("vai vincular", "#15803d", "#dcfce7")}
                      {sai && chip("vai desvincular", "#b91c1c", "#fee2e2")}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--portal-text-muted, #64748b)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.cliente}{outraOS ? ` · está na ${outraOS} (sai de lá)` : ""}
                    </div>
                  </div>
                  <b style={{ fontSize: 13, color: "var(--portal-text, #0f172a)", whiteSpace: "nowrap" }}>{brl(p.valor)}</b>
                </label>

                {sai && (
                  <div style={{ padding: "0 12px 12px 42px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "#7f1d1d" }}>E o {p.id}?</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {([["manter", "fa-circle-check", "Manter ativo", "Fica sem OS, pode ser usado depois"], ["cancelar", "fa-ban", "Cancelar o PPV", p.pedidoOmie ? `Cancela também o pedido ${semZeros(p.pedidoOmie)} no Omie` : "Marca como cancelado"]] as const).map(([k, ic, t, sub]) => {
                        const ativo = destino[p.id] === k;
                        const cor = k === "cancelar" ? "#b91c1c" : "#15803d";
                        return (
                          <button key={k} type="button" onClick={() => setDestino((d) => ({ ...d, [p.id]: k }))}
                            style={{ flex: "1 1 200px", textAlign: "left", display: "flex", gap: 10, alignItems: "center", padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                              border: `1.5px solid ${ativo ? cor : "var(--border, #e2e8f0)"}`, background: ativo ? `color-mix(in srgb, ${cor} 8%, var(--surface, #fefefe))` : "var(--surface, #fefefe)" }}>
                            <i className={`fas ${ic}`} style={{ color: cor }} />
                            <span><span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--portal-text, #0f172a)" }}>{t}</span><span style={{ display: "block", fontSize: 11, color: "#64748b" }}>{sub}</span></span>
                          </button>
                        );
                      })}
                    </div>
                    {destino[p.id] === "cancelar" && (
                      <textarea value={motivo[p.id] || ""} onChange={(e) => setMotivo((m) => ({ ...m, [p.id]: e.target.value }))} rows={2} autoFocus
                        placeholder="Motivo do cancelamento (obrigatório)"
                        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${String(motivo[p.id] || "").trim() ? "var(--border, #cbd5e1)" : "#fca5a5"}`, fontSize: 13, fontFamily: "inherit", resize: "vertical", marginBottom: 0, background: "var(--surface, #fefefe)", color: "var(--portal-text, #0f172a)" }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--border, #e2e8f0)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: 1, fontSize: 12, color: erro ? "#b91c1c" : "#64748b", minWidth: 180 }}>
            {erro || (!mudou ? "Nada mudou ainda." : semEscolha ? "Escolha Manter ou Cancelar para cada PPV que sai." : faltaMotivo ? "Escreva o motivo do cancelamento." : `${entrando.length ? `+${entrando.length} vinculado(s)` : ""}${entrando.length && saindo.length ? " · " : ""}${saindo.length ? `−${saindo.length} desvinculado(s)` : ""}`)}
          </div>
          <button type="button" onClick={onClose} disabled={salvando} style={{ padding: "9px 16px", borderRadius: 10, border: "1px solid var(--border, #cbd5e1)", background: "transparent", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "var(--portal-text, #0f172a)" }}>Cancelar</button>
          <button type="button" onClick={salvar} disabled={!mudou || semEscolha || faltaMotivo || salvando}
            style={{ padding: "9px 18px", borderRadius: 10, border: "none", background: !mudou || semEscolha || faltaMotivo ? "#94a3b8" : AZUL, color: "#fefefe", fontWeight: 800, cursor: salvando ? "wait" : "pointer", fontFamily: "inherit" }}>
            {salvando ? <><i className="fas fa-spinner fa-spin" /> Salvando…</> : "Salvar vínculos"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
