"use client";
// Popup do Tratorilson quando ele fica em dúvida da prioridade ao organizar a semana de tickets da pessoa
// (José, 29/10/2026). Uma pergunta por vez: "Qual destes é mais urgente?" com os tickets como botões.
// Responder reorganiza a semana na hora (/api/tickets/tratorilson, lib/tickets/tratorilson-server.ts).
import { useEffect, useState } from "react";
import { fetchAuth } from "@/lib/auth/client";

interface Pergunta { id: string; pergunta: string; tickets: { id: string; numero: number; titulo: string }[] }

const MEIA_HORA = 30 * 60_000;

export default function PerguntaTratorilson() {
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    let ultima = 0;
    const ler = () => {
      if (Date.now() - ultima < 60_000) return;
      ultima = Date.now();
      fetchAuth("/api/tickets/tratorilson").then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (vivo) setPergunta((j?.perguntas || [])[0] || null); })
        .catch(() => { /* sem rede: pergunta na próxima */ });
    };
    ler();
    const t = setInterval(ler, MEIA_HORA);
    const foco = () => { if (document.visibilityState === "visible") ler(); };
    document.addEventListener("visibilitychange", foco);
    return () => { vivo = false; clearInterval(t); document.removeEventListener("visibilitychange", foco); };
  }, []);

  if (!pergunta) return null;

  const responder = async (ticketId: string | null) => {
    setEnviando(true);
    await fetchAuth("/api/tickets/tratorilson", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "responder", perguntaId: pergunta.id, ticketId }),
    }).catch(() => null);
    setEnviando(false);
    setPergunta(null);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Pergunta do Tratorilson"
      style={{ position: "fixed", inset: 0, zIndex: 9500, background: "rgba(15,23,42,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ width: "100%", maxWidth: 460, background: "var(--surface, #fff)", color: "var(--portal-text, #0f172a)", borderRadius: 18, padding: "20px 22px", boxShadow: "0 24px 60px rgba(15,23,42,.35)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ width: 34, height: 34, borderRadius: 10, background: "#EEF2FF", color: "#4F46E5", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <i className="fa-solid fa-robot" />
          </span>
          <span style={{ fontSize: 15 }}>Tratorilson</span>
        </div>
        <p style={{ fontSize: 15, margin: "8px 0 14px", lineHeight: 1.45 }}>{pergunta.pergunta}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pergunta.tickets.map((t) => (
            <button key={t.id} type="button" disabled={enviando} onClick={() => void responder(t.id)}
              style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border, #e2e8f0)", background: "transparent", color: "inherit", cursor: "pointer", fontSize: 14 }}>
              <span style={{ color: "#7c3aed", marginRight: 6 }}>#{t.numero}</span>{t.titulo}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <span style={{ fontSize: 12, color: "var(--portal-text-muted, #64748b)" }}>O escolhido entra primeiro na sua semana.</span>
          <button type="button" disabled={enviando} onClick={() => void responder(null)}
            style={{ border: "none", background: "transparent", color: "var(--portal-text-muted, #64748b)", cursor: "pointer", fontSize: 13 }}>
            Tanto faz
          </button>
        </div>
      </div>
    </div>
  );
}
