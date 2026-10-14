"use client";
// Janela "Substituir no Omie" (José, 13/10/2026): trocar a OS ou um pedido de
// venda que a OS tem no Omie. Passos: o que trocar → como (duplicar ou escolher
// outro) → motivo → "Tem certeza?". O substituído é SEMPRE cancelado no Omie e o
// "Nº do pedido do cliente" é refeito dos dois lados. Servidor:
// POST /api/pos/ordens/[id]/substituir (lib/pos/substituir-omie.ts).
import { useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "@/lib/auth/client";

interface Props {
  osId: string;
  ordemOmie: string;
  pedidos: { ppvId: string; numero: string }[];
  onClose: () => void;
  onFeito: () => void;
}
type Alvo = { tipo: "os" } | { tipo: "pedido"; ppvId: string; numero: string };
const semZeros = (n: string) => String(n || "").trim().replace(/^0+(?=\d)/, "");

export default function SubstituirOmieModal({ osId, ordemOmie, pedidos, onClose, onFeito }: Props) {
  const [alvo, setAlvo] = useState<Alvo | null>(pedidos.length === 0 ? { tipo: "os" } : null);
  const [modo, setModo] = useState<"duplicar" | "outro" | null>(null);
  const [numeroNovo, setNumeroNovo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState<{ antigo: string; novo: string; avisos: string[] } | null>(null);

  const nomeAlvo = !alvo ? "" : alvo.tipo === "os" ? `a OS ${semZeros(ordemOmie)}` : `o pedido de venda ${semZeros(alvo.numero)}`;
  const nomeCurto = !alvo ? "" : alvo.tipo === "os" ? "OS" : "pedido";
  const outroDoc = alvo?.tipo === "os" ? "pedido(s) de venda" : "OS";
  const prontoPraConfirmar = !!alvo && !!modo && (modo === "duplicar" || !!semZeros(numeroNovo)) && motivo.trim().length >= 3;

  const executar = async () => {
    if (!alvo || !modo) return;
    setEnviando(true); setErro("");
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/substituir`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ alvo: alvo.tipo, ppvId: alvo.tipo === "pedido" ? alvo.ppvId : undefined, modo, numeroNovo, motivo }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) { setErro(j.erro || j.error || `Erro ${r.status}`); setConfirmando(false); }
      else { setFeito({ antigo: j.antigo, novo: j.novo, avisos: j.avisos || [] }); onFeito(); }
    } catch { setErro("Falha de conexão. Confira no Omie antes de tentar de novo."); setConfirmando(false); }
    setEnviando(false);
  };

  const opcao = (ativo: boolean, onClick: () => void, icone: string, titulo: string, sub: string) => (
    <button type="button" onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 11, cursor: "pointer", fontFamily: "inherit",
        border: `1.5px solid ${ativo ? "#0369A1" : "var(--border, #e2e8f0)"}`, background: ativo ? "color-mix(in srgb, #0369A1 7%, var(--surface, #fefefe))" : "var(--surface, #fefefe)" }}>
      <span style={{ width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, background: ativo ? "#0369A1" : "color-mix(in srgb, #0369A1 10%, transparent)", color: ativo ? "#fefefe" : "#0369A1" }}>
        <i className={`fas ${icone}`} style={{ fontSize: 13 }} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 13.5, fontWeight: 800, color: "var(--portal-text, #0f172a)" }}>{titulo}</span>
        <span style={{ display: "block", fontSize: 11.5, color: "var(--portal-text-muted, #64748b)", marginTop: 1 }}>{sub}</span>
      </span>
      {ativo && <i className="fas fa-check" style={{ color: "#0369A1" }} />}
    </button>
  );
  const passo = (n: number, t: string) => (
    <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .5, color: "var(--portal-text-muted, #64748b)", margin: "4px 0 6px" }}>{n}. {t}</div>
  );

  return createPortal(
    <div onClick={enviando ? undefined : onClose} style={{ position: "fixed", inset: 0, zIndex: 100004, background: "rgba(15,23,42,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, maxWidth: "96vw", maxHeight: "88vh", overflowY: "auto", background: "var(--surface, #fefefe)", borderRadius: 16, border: "1px solid var(--border, #e2e8f0)", boxShadow: "0 30px 80px rgba(0,0,0,.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 18px", borderBottom: "1px solid var(--border, #e2e8f0)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marcas/omie.png" alt="Omie" style={{ height: 16 }} />
          <b style={{ flex: 1, fontSize: 14.5 }}>Substituir no Omie</b>
          {!enviando && <button type="button" onClick={onClose} style={{ border: "none", background: "transparent", color: "#94a3b8", fontSize: 18, cursor: "pointer" }}>×</button>}
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 10 }}>
          {feito ? (
            <>
              <div style={{ textAlign: "center", padding: "6px 0" }}>
                <i className="fas fa-circle-check" style={{ fontSize: 34, color: "#16a34a" }} />
                <div style={{ fontSize: 15, fontWeight: 800, marginTop: 8 }}>{nomeCurto === "OS" ? "OS substituída" : "Pedido substituído"}</div>
                <div style={{ fontSize: 13, color: "var(--portal-text-muted, #64748b)", marginTop: 4 }}>
                  <s>{feito.antigo}</s> cancelado no Omie → agora é o <b style={{ color: "var(--portal-text, #0f172a)" }}>{feito.novo}</b>
                </div>
                <div style={{ fontSize: 12, color: "var(--portal-text-muted, #64748b)", marginTop: 4 }}>O “Nº do pedido do cliente” foi atualizado na OS e no(s) pedido(s).</div>
              </div>
              {feito.avisos.length > 0 && (
                <div style={{ fontSize: 12, color: "#92400E", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 9, padding: "8px 10px" }}>
                  <b>Atenção:</b> {feito.avisos.join(" · ")}
                </div>
              )}
              <button type="button" onClick={onClose} style={{ padding: "9px 12px", borderRadius: 9, border: "none", background: "#0369A1", color: "#fefefe", fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>Fechar</button>
            </>
          ) : confirmando && alvo && modo ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 800 }}>Tem certeza?</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                {modo === "duplicar"
                  ? <li>O Omie vai <b>duplicar</b> {nomeAlvo} e a cópia passa a ser {alvo.tipo === "os" ? "a OS" : "o pedido"} desta ordem.</li>
                  : <li>{alvo.tipo === "os" ? "A OS" : "O pedido"} <b>{semZeros(numeroNovo)}</b> do Omie passa a ser {alvo.tipo === "os" ? "a OS" : "o pedido"} desta ordem.</li>}
                <li><b style={{ color: "#b91c1c" }}>{nomeAlvo.charAt(0).toUpperCase() + nomeAlvo.slice(1)} será CANCELAD{alvo.tipo === "os" ? "A" : "O"} no Omie.</b></li>
                <li>O “Nº do pedido do cliente” é refeito: {alvo.tipo === "os" ? "a nova OS recebe o nº do(s) pedido(s) e os pedidos recebem o nº da nova OS" : "a OS recebe o nº do novo pedido e o novo pedido recebe o nº da OS"}.</li>
              </ul>
              <div style={{ fontSize: 12, color: "var(--portal-text-muted, #64748b)" }}>Motivo: “{motivo.trim()}”</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setConfirmando(false)} disabled={enviando} style={{ flex: 1, padding: "9px 12px", borderRadius: 9, border: "1px solid var(--border, #e2e8f0)", background: "transparent", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "var(--portal-text, #0f172a)" }}>Voltar</button>
                <button type="button" onClick={executar} disabled={enviando} style={{ flex: 1.4, padding: "9px 12px", borderRadius: 9, border: "none", background: "#b91c1c", color: "#fefefe", fontWeight: 800, cursor: enviando ? "wait" : "pointer", fontFamily: "inherit" }}>
                  {enviando ? <><i className="fas fa-spinner fa-spin" /> Substituindo no Omie…</> : <>Sim, substituir e cancelar {nomeCurto === "OS" ? "a antiga" : "o antigo"}</>}
                </button>
              </div>
            </>
          ) : (
            <>
              {passo(1, "O que você quer trocar?")}
              {ordemOmie && opcao(alvo?.tipo === "os", () => { setAlvo({ tipo: "os" }); setModo(null); setNumeroNovo(""); }, "fa-wrench", `Ordem de serviço ${semZeros(ordemOmie)}`, "Troca a OS do Omie desta ordem")}
              {pedidos.map((p) => opcao(alvo?.tipo === "pedido" && alvo.ppvId === p.ppvId, () => { setAlvo({ tipo: "pedido", ppvId: p.ppvId, numero: p.numero }); setModo(null); setNumeroNovo(""); },
                "fa-box", `Pedido de venda ${semZeros(p.numero)}`, `Peças do ${p.ppvId}`))}

              {alvo && (
                <>
                  {passo(2, "Como?")}
                  {opcao(modo === "duplicar", () => setModo("duplicar"), "fa-clone", `Duplicar ${alvo.tipo === "os" ? "a OS" : "o pedido"} e usar a cópia`, `Cria uma cópia de ${nomeAlvo} no Omie (pra corrigir lá) e cancela ${alvo.tipo === "os" ? "a atual" : "o atual"}`)}
                  {opcao(modo === "outro", () => setModo("outro"), "fa-right-left", `Escolher ${alvo.tipo === "os" ? "outra OS" : "outro pedido"} que já existe`, `Você informa o nº no Omie; ${nomeAlvo} é cancelad${alvo.tipo === "os" ? "a" : "o"}`)}
                  {modo === "outro" && (
                    <input autoFocus value={numeroNovo} onChange={(e) => setNumeroNovo(e.target.value.replace(/\D/g, ""))} inputMode="numeric"
                      placeholder={`Nº ${alvo.tipo === "os" ? "da OS" : "do pedido"} no Omie`}
                      style={{ padding: "9px 12px", borderRadius: 9, border: "1.5px solid var(--border, #cbd5e1)", fontSize: 14, fontFamily: "inherit", background: "var(--surface, #fefefe)", color: "var(--portal-text, #0f172a)" }} />
                  )}
                </>
              )}

              {alvo && modo && (
                <>
                  {passo(3, "Motivo")}
                  <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Ex.: pedido saiu com a peça errada"
                    style={{ padding: "9px 12px", borderRadius: 9, border: "1.5px solid var(--border, #cbd5e1)", fontSize: 13, fontFamily: "inherit", resize: "vertical", background: "var(--surface, #fefefe)", color: "var(--portal-text, #0f172a)" }} />
                  <div style={{ fontSize: 11.5, color: "var(--portal-text-muted, #64748b)" }}>
                    Depois o “Nº do pedido do cliente” do {outroDoc} é atualizado sozinho. Documento já faturado não pode ser substituído aqui.
                  </div>
                </>
              )}

              {erro && <div style={{ fontSize: 12.5, color: "#b91c1c", background: "#fee2e2", borderRadius: 9, padding: "8px 10px" }}><i className="fas fa-circle-exclamation" /> {erro}</div>}

              <button type="button" disabled={!prontoPraConfirmar} onClick={() => setConfirmando(true)}
                style={{ marginTop: 4, padding: "10px 12px", borderRadius: 9, border: "none", background: prontoPraConfirmar ? "#0369A1" : "#94A3B8", color: "#fefefe", fontWeight: 800, cursor: prontoPraConfirmar ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
                Continuar
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
