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

const PASSOS_OS = ["Lendo a OS no Omie", "Serviços, horas e km", "Categoria, conta e departamentos", "Pedidos de peças vinculados"];
const PASSOS_PPV = ["Lendo o pedido no Omie", "Peças, quantidades e valores", "Categoria, parcelas e departamentos"];
const PASSOS_ATUALIZAR = ["Enviando as correções ao Omie", "Conferindo de novo"];

export default function ConferenciaOmie({ alvo, cor = "#0F8B8D", onOk, onCancelar }: {
  alvo: Alvo; cor?: string; onOk: () => void; onCancelar: () => void;
}) {
  const [fase, setFase] = useState<Fase>("conferindo");
  const [res, setRes] = useState<Resposta | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [passo, setPasso] = useState(0);
  const [tentativa, setTentativa] = useState(0);
  // faturar mesmo com diferença: pede confirmação de novo
  const [confirmarCom, setConfirmarCom] = useState(false);
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
        (() => {
          const lista = fase === "atualizando" ? PASSOS_ATUALIZAR : passos;
          const atual = fase === "ok" ? lista.length : Math.min(passo, lista.length - 1);
          const pct = fase === "ok" ? 100 : Math.min(94, Math.round(((atual + 0.6) / lista.length) * 100));
          return (
          <div className="conf-card">
            <style>{`
              .conf-card { width: 440px; max-width: 100%; background: var(--surface, #fefefe); border-radius: 18px; overflow: hidden; box-shadow: 0 30px 70px rgba(15,23,42,.35); }
              .conf-topo { position: relative; padding: 26px 28px 22px; background: linear-gradient(135deg, color-mix(in srgb, ${cor} 14%, #fefefe), #fefefe 70%); border-bottom: 1px solid var(--border, #eef1f4); }
              .conf-ponte { display: flex; align-items: center; justify-content: center; gap: 14px; }
              .conf-logo { width: 64px; height: 64px; border-radius: 16px; background: #fefefe; border: 1px solid #e2e8f0; box-shadow: 0 6px 16px rgba(15,23,42,.08); display: flex; align-items: center; justify-content: center; }
              .conf-logo img { max-width: 46px; max-height: 30px; }
              .conf-fio { position: relative; width: 92px; height: 4px; border-radius: 4px; background: color-mix(in srgb, ${cor} 18%, transparent); overflow: hidden; }
              .conf-fio::after { content: ""; position: absolute; top: 0; left: -40%; width: 40%; height: 100%; border-radius: 4px; background: ${cor}; animation: confCorre 1.1s ease-in-out infinite; }
              .conf-fio.ok { background: #22c55e; } .conf-fio.ok::after { display: none; }
              .conf-titulo { margin-top: 18px; text-align: center; font-size: 17px; font-weight: 800; color: var(--portal-text, #1e293b); }
              .conf-sub { margin-top: 4px; text-align: center; font-size: 12.5px; color: #64748b; }
              .conf-passos { padding: 18px 28px 6px; display: flex; flex-direction: column; gap: 11px; }
              .conf-passo { display: flex; align-items: center; gap: 11px; font-size: 13.5px; color: #94a3b8; transition: color .2s; }
              .conf-passo .b { width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; border: 2px solid #e2e8f0; }
              .conf-passo.feito { color: var(--portal-text, #334155); } .conf-passo.feito .b { background: #22c55e; border-color: #22c55e; color: #fefefe; }
              .conf-passo.agora { color: var(--portal-text, #1e293b); font-weight: 700; } .conf-passo.agora .b { border-color: color-mix(in srgb, ${cor} 25%, transparent); border-top-color: ${cor}; animation: confGira .8s linear infinite; }
              .conf-barra { margin: 14px 28px 24px; height: 6px; border-radius: 6px; background: var(--portal-bg-secondary, #eef2f6); overflow: hidden; }
              .conf-barra > div { height: 100%; border-radius: 6px; background: linear-gradient(90deg, ${cor}, color-mix(in srgb, ${cor} 60%, #22c55e)); transition: width .6s ease; }
              @keyframes confCorre { 0% { left: -40% } 100% { left: 100% } }
            `}</style>
            <div className="conf-topo">
              <div className="conf-ponte">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="conf-logo" title="Portal"><img src="/Logo_Nova.png" alt="Portal" /></div>
                <div className={`conf-fio${fase === "ok" ? " ok" : ""}`} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <div className="conf-logo" title="Omie"><img src="/marcas/omie.png" alt="Omie" /></div>
              </div>
              <div className="conf-titulo">
                {fase === "ok" ? <><i className="fas fa-circle-check" style={{ color: "#22c55e" }} /> Tudo igual ao Omie</> : fase === "atualizando" ? "Atualizando o Omie" : "Conferindo o portal com o Omie"}
              </div>
              <div className="conf-sub">
                {fase === "ok" ? "Pode seguir com o faturamento." : fase === "atualizando" ? "Deixando o Omie igual ao portal." : "Antes de faturar, confiro se está tudo igual nos dois."}
              </div>
            </div>
            <div className="conf-passos">
              {lista.map((p, i) => (
                <div key={p} className={`conf-passo${i < atual ? " feito" : i === atual ? " agora" : ""}`}>
                  <span className="b">{i < atual && <i className="fas fa-check" />}</span>{p}
                </div>
              ))}
            </div>
            <div className="conf-barra"><div style={{ width: `${pct}%` }} /></div>
          </div>
          );
        })()
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
                          <td style={{ padding: "9px 12px", verticalAlign: "top" }}>
                            <div style={{ fontWeight: 700 }}>{x.rotulo}{!x.ajustavel && <span style={{ marginLeft: 6, fontSize: 10.5, color: "#b91c1c" }}>(corrigir à mão)</span>}</div>
                            {x.explicacao && <div style={{ fontSize: 11.5, color: "#64748b", marginTop: 3, lineHeight: 1.45 }}>{x.explicacao}</div>}
                          </td>
                          <td style={{ padding: "9px 12px", verticalAlign: "top" }}><div style={{ padding: "6px 9px", borderRadius: 7, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", fontWeight: 600, lineHeight: 1.45, wordBreak: "break-word" }}>{x.portal}</div></td>
                          <td style={{ padding: "9px 12px", verticalAlign: "top" }}><div style={{ padding: "6px 9px", borderRadius: 7, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", lineHeight: 1.45, wordBreak: "break-word" }}>{x.omie}</div></td>
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
            {(comDiv.length > 0 || comErro.length > 0) && (
              <button type="button" onClick={() => setConfirmarCom(true)} title="Faturar sem deixar o Omie igual ao portal"
                style={{ ...btn, background: "transparent", color: "#b45309", border: "1px solid #fcd34d" }}>
                Faturar com as diferenças
              </button>
            )}
            <button type="button" onClick={onCancelar} style={{ ...btn, background: "var(--portal-bg-secondary, #f1f5f9)", color: "#334155" }}>Cancelar</button>
          </div>
          {confirmarCom && (
            <div onClick={() => setConfirmarCom(false)} style={{ position: "fixed", inset: 0, zIndex: 100030, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
              <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface, #fefefe)", borderRadius: 14, width: 470, maxWidth: "100%", padding: 22, boxShadow: "0 24px 60px rgba(0,0,0,.35)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0, background: "#fef3c7", color: "#b45309", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}><i className="fas fa-triangle-exclamation" /></span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "var(--portal-text, #1e293b)" }}>Faturar com as diferenças?</div>
                    <div style={{ fontSize: 13, color: "#475569", marginTop: 6, lineHeight: 1.55 }}>
                      A nota vai sair com o que está <b>no Omie</b>, não com o que está no portal.
                      {comDiv.length > 0 && <> Ficam {comDiv.reduce((t, d) => t + d.divergencias.length, 0)} diferença(s) sem corrigir em {comDiv.map((d) => d.doc).join(", ")}.</>}
                      {comErro.length > 0 && <> {comErro.map((d) => d.doc).join(", ")} não foi conferido.</>}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setConfirmarCom(false)} style={{ ...btn, background: "var(--portal-bg-secondary, #f1f5f9)", color: "#334155" }}>Voltar</button>
                  <button type="button" onClick={() => { setConfirmarCom(false); onOk(); }} style={{ ...btn, background: "#b45309", color: "#fefefe" }}>Sim, faturar assim mesmo</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
