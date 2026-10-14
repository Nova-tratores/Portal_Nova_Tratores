"use client";
// Antes de faturar: confere se a OS / os pedidos do portal estão iguais no Omie
// (José, 14/10/2026). Mostra carregando enquanto lê; se achar diferença, mostra
// lado a lado e pergunta se quer deixar o Omie igual ao portal.
import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import type { ResultadoConferencia } from "@/lib/omie/conferencia";

type Alvo = { tipo: "os"; osId: string } | { tipo: "ppv"; ppvId: string };
interface Resposta { os: ResultadoConferencia | null; ppvs: ResultadoConferencia[]; error?: string }
type Fase = "conferindo" | "ok" | "divergente" | "atualizando" | "erro";

const PASSOS_OS = ["Lendo a OS no Omie…", "Conferindo serviços, horas e km…", "Conferindo categoria, conta e departamentos…", "Conferindo os pedidos de peças…"];
const PASSOS_PPV = ["Lendo o pedido no Omie…", "Conferindo peças, quantidades e valores…", "Conferindo categoria, parcelas e departamentos…"];

export default function ConferenciaOmie({ alvo, cor = "#0F8B8D", onOk, onCancelar }: {
  alvo: Alvo; cor?: string; onOk: () => void; onCancelar: () => void;
}) {
  const [fase, setFase] = useState<Fase>("conferindo");
  const [res, setRes] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [passo, setPasso] = useState(0);
  const [tentativa, setTentativa] = useState(0);
  const passos = alvo.tipo === "os" ? PASSOS_OS : PASSOS_PPV;
  const url = alvo.tipo === "os" ? `/api/pos/ordens/${encodeURIComponent(alvo.osId)}/conferir-omie` : `/api/ppv/pedidos/conferir-omie?id=${encodeURIComponent(alvo.ppvId)}`;
  const chave = alvo.tipo === "os" ? alvo.osId : alvo.ppvId;

  // texto do carregando vai andando (a conferência é uma chamada só)
  useEffect(() => {
    if (fase !== "conferindo" && fase !== "atualizando") return;
    const t = setInterval(() => setPasso((p) => p + 1), 1600);
    return () => clearInterval(t);
  }, [fase]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(url, { headers: await authHeaders() });
        const j: Resposta = await r.json().catch(() => ({ os: null, ppvs: [], error: "Resposta inválida do servidor." }));
        if (!vivo) return;
        if (!r.ok || j.error) { setErro(j.error || `Erro ${r.status}`); setFase("erro"); return; }
        setRes(j);
        const docs = [j.os, ...j.ppvs].filter(Boolean) as ResultadoConferencia[];
        if (docs.some((d) => d.erro)) { setFase("divergente"); return; }
        if (docs.every((d) => !d.divergencias.length)) { setFase("ok"); setTimeout(() => { if (vivo) onOk(); }, 900); return; }
        setFase("divergente");
      } catch { if (vivo) { setErro("Falha de conexão ao conferir com o Omie."); setFase("erro"); } }
    })();
    return () => { vivo = false; };
    // onOk muda a cada render do pai; a conferência roda uma vez por tentativa
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, chave, tentativa]);

  const docs = res ? ([res.os, ...res.ppvs].filter(Boolean) as ResultadoConferencia[]) : [];
  const comDiv = docs.filter((d) => d.divergencias.length);
  const comErro = docs.filter((d) => d.erro);
  const naoAjustaveis = comDiv.flatMap((d) => d.divergencias.filter((x) => !x.ajustavel));

  const atualizar = async () => {
    setFase("atualizando"); setPasso(0); setAviso("");
    try {
      const body = alvo.tipo === "os"
        ? { os: !!res?.os?.divergencias.length, ppvs: (res?.ppvs || []).filter((p) => p.divergencias.length).map((p) => p.doc) }
        : { id: alvo.ppvId };
      const r = await fetch(url.split("?")[0], { method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j: Resposta = await r.json().catch(() => ({ os: null, ppvs: [], error: "Resposta inválida do servidor." }));
      if (!r.ok || j.error) { setErro(j.error || `Erro ${r.status}`); setFase("erro"); return; }
      // junta: o que foi atualizado substitui; o resto fica como estava
      const novo: Resposta = alvo.tipo === "os"
        ? { os: j.os || res?.os || null, ppvs: (res?.ppvs || []).map((p) => j.ppvs.find((x) => x.doc === p.doc) || p) }
        : j;
      setRes(novo);
      const todos = [novo.os, ...novo.ppvs].filter(Boolean) as ResultadoConferencia[];
      const erros = todos.filter((d) => d.erro);
      if (erros.length) { setAviso(erros.map((d) => `${d.doc}: ${d.erro}`).join(" · ")); setFase("divergente"); return; }
      if (todos.every((d) => !d.divergencias.length)) { setFase("ok"); setTimeout(onOk, 1100); return; }
      setAviso("O Omie foi atualizado, mas algumas diferenças continuaram. Confira abaixo.");
      setFase("divergente");
    } catch { setErro("Falha de conexão ao atualizar o Omie."); setFase("erro"); }
  };

  const btn: React.CSSProperties = { padding: "11px 16px", borderRadius: 8, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100020, background: "rgba(15,23,42,.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <style>{`@keyframes confGira { to { transform: rotate(360deg) } } @keyframes confPulsa { 0%,100% { opacity: .55 } 50% { opacity: 1 } }`}</style>
      {(fase === "conferindo" || fase === "atualizando" || fase === "ok") ? (
        <div style={{ background: "var(--surface, #fefefe)", borderRadius: 16, padding: "34px 40px", width: 400, maxWidth: "100%", textAlign: "center", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
          {fase === "ok" ? (
            <div style={{ width: 64, height: 64, margin: "0 auto 16px", borderRadius: "50%", background: "#dcfce7", color: "#15803d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}><i className="fas fa-check" /></div>
          ) : (
            <div style={{ width: 64, height: 64, margin: "0 auto 16px", position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `5px solid color-mix(in srgb, ${cor} 15%, transparent)`, borderTopColor: cor, animation: "confGira .9s linear infinite" }} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marcas/omie.png" alt="" style={{ position: "absolute", inset: 0, margin: "auto", height: 18, width: "auto", top: "50%", transform: "translateY(-50%)" }} />
            </div>
          )}
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--portal-text, #1e293b)" }}>
            {fase === "ok" ? "Tudo igual ao Omie" : fase === "atualizando" ? "Atualizando o Omie…" : "Conferindo com o Omie"}
          </div>
          <div style={{ fontSize: 13, color: "#64748b", marginTop: 6, minHeight: 18, animation: fase === "ok" ? undefined : "confPulsa 1.6s ease-in-out infinite" }}>
            {fase === "ok" ? "Pode seguir com o faturamento." : fase === "atualizando" ? "Deixando o Omie igual ao portal e conferindo de novo." : passos[passo % passos.length]}
          </div>
        </div>
      ) : fase === "erro" ? (
        <div style={{ background: "var(--surface, #fefefe)", borderRadius: 14, padding: 24, width: 460, maxWidth: "100%", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#991b1b", marginBottom: 8 }}><i className="fas fa-triangle-exclamation" /> Não consegui conferir com o Omie</div>
          <div style={{ fontSize: 13.5, color: "#7f1d1d", lineHeight: 1.5 }}>{erro}</div>
          <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 10 }}>Sem a conferência o faturamento não segue. Tente de novo em instantes.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button type="button" onClick={() => { setErro(""); setFase("conferindo"); setPasso(0); setTentativa((t) => t + 1); }} style={{ ...btn, flex: 1, background: cor, color: "#fefefe" }}>Tentar de novo</button>
            <button type="button" onClick={onCancelar} style={{ ...btn, background: "var(--portal-bg-secondary, #f1f5f9)", color: "#334155" }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <div style={{ background: "var(--surface, #fefefe)", borderRadius: 14, width: 860, maxWidth: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--border, #eef0f3)", background: "#fffbeb" }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fef3c7", color: "#b45309", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}><i className="fas fa-code-compare" /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16.5, fontWeight: 800, color: "#78350f" }}>{comErro.length && !comDiv.length ? "Não deu para conferir tudo" : "O Omie está diferente do portal"}</div>
              <div style={{ fontSize: 12.5, color: "#92400e" }}>Antes de faturar, o Omie precisa estar igual ao que está no portal.</div>
            </div>
          </div>
          <div style={{ padding: "14px 20px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
            {aviso && <div style={{ fontSize: 13, color: "#9a3412", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "8px 12px" }}>{aviso}</div>}
            {docs.map((d) => (
              <div key={d.doc} style={{ border: "1px solid var(--border, #e2e8f0)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", background: "var(--portal-bg-secondary, #f8fafc)", fontSize: 13.5, fontWeight: 800 }}>
                  <span>{d.tipo} {d.doc}</span>
                  {d.numeroOmie && <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>· Omie nº {d.numeroOmie}</span>}
                  <span style={{ flex: 1 }} />
                  {d.erro ? <span style={{ fontSize: 11.5, fontWeight: 800, color: "#b91c1c" }}><i className="fas fa-circle-xmark" /> não conferido</span>
                    : d.pulado ? <span style={{ fontSize: 11.5, fontWeight: 700, color: "#64748b" }}>{d.pulado}</span>
                      : d.divergencias.length ? <span style={{ fontSize: 11.5, fontWeight: 800, color: "#b45309" }}>{d.divergencias.length} diferença{d.divergencias.length > 1 ? "s" : ""}</span>
                        : <span style={{ fontSize: 11.5, fontWeight: 800, color: "#15803d" }}><i className="fas fa-check" /> igual</span>}
                </div>
                {d.erro && <div style={{ padding: "8px 12px", fontSize: 12.5, color: "#991b1b" }}>{d.erro}</div>}
                {d.divergencias.length > 0 && (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: .4 }}>
                        <th style={{ padding: "6px 12px", width: "34%" }}>O quê</th><th style={{ padding: "6px 12px" }}>No portal</th><th style={{ padding: "6px 12px" }}>No Omie</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.divergencias.map((x) => (
                        <tr key={x.campo} style={{ borderTop: "1px solid var(--border, #f1f5f9)" }}>
                          <td style={{ padding: "7px 12px", fontWeight: 600 }}>{x.rotulo}{!x.ajustavel && <span style={{ marginLeft: 6, fontSize: 10.5, color: "#b91c1c" }}>(corrigir à mão)</span>}</td>
                          <td style={{ padding: "7px 12px", color: "#15803d", fontWeight: 600 }}>{x.portal}</td>
                          <td style={{ padding: "7px 12px", color: "#b45309" }}>{x.omie}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--border, #eef0f3)", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: "#64748b" }}>
              {comErro.length ? "Algum documento não pôde ser conferido — tente de novo antes de faturar." : naoAjustaveis.length ? "Há diferenças que precisam ser corrigidas à mão." : "Quer deixar o Omie igual ao portal?"}
            </div>
            {comErro.length > 0 && <button type="button" onClick={() => { setFase("conferindo"); setPasso(0); setAviso(""); setTentativa((t) => t + 1); }} style={{ ...btn, background: "var(--portal-bg-secondary, #f1f5f9)", color: "#334155" }}><i className="fas fa-rotate" /> Conferir de novo</button>}
            {comDiv.length > 0 && !naoAjustaveis.length && (
              <button type="button" onClick={atualizar} style={{ ...btn, background: cor, color: "#fefefe", boxShadow: `0 4px 12px color-mix(in srgb, ${cor} 35%, transparent)` }}>
                <i className="fas fa-arrows-rotate" /> Sim, atualizar o Omie igual ao portal
              </button>
            )}
            <button type="button" onClick={onCancelar} style={{ ...btn, background: "var(--portal-bg-secondary, #f1f5f9)", color: "#334155" }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
