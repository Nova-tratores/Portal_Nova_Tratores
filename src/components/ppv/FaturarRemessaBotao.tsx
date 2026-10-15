"use client";
// "Faturar remessa" (José, 15/10/2026): emite a NF-e de remessa das peças pelo portal —
// usado no PPV e no bloco de notas da OS. Confirma → carregamento com tempo → resultado.
import { useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "@/lib/auth/client";
import CronometroEstimado, { useSegundos, pctPeloTempo } from "@/components/comum/CronometroEstimado";

const ESTIMATIVA = 35;

function Faturando({ ppvId }: { ppvId: string }) {
  const s = useSegundos();
  const passos = [{ de: 0, txt: "Conferindo a remessa igual à OS" }, { de: 6, txt: "Validando no Omie" }, { de: 12, txt: "Faturando a remessa" }, { de: 18, txt: "Esperando a NF-e da SEFAZ" }];
  const atual = passos.filter((p) => s >= p.de).length - 1;
  return (
    <div style={{ padding: "28px 26px 22px", textAlign: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/marcas/omie.png" alt="Omie" style={{ height: 26, objectFit: "contain", marginBottom: 12 }} />
      <div style={{ fontSize: 16, fontWeight: 800 }}>Faturando a remessa do {ppvId}</div>
      <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 3 }}>Não feche esta janela.</div>
      <div style={{ height: 6, borderRadius: 3, background: "#e2e8f0", margin: "16px 0 14px", overflow: "hidden" }}>
        <div style={{ width: `${pctPeloTempo(s, ESTIMATIVA)}%`, height: "100%", background: "linear-gradient(90deg,#fb923c,#ea580c)", transition: "width 1s linear" }} />
      </div>
      <div style={{ display: "grid", gap: 7, textAlign: "left", margin: "0 auto 14px", maxWidth: 300 }}>
        {passos.map((p, i) => (
          <div key={p.txt} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: i < atual ? "#ea580c" : i === atual ? "#0f172a" : "#94a3b8", fontWeight: i === atual ? 700 : 500 }}>
            <i className={`fas ${i < atual ? "fa-circle-check" : i === atual ? "fa-spinner fa-spin" : "fa-circle"}`} style={{ width: 14, fontSize: i > atual ? 6 : 13 }} />
            {p.txt}
          </div>
        ))}
      </div>
      <CronometroEstimado segundos={s} estimativa={ESTIMATIVA} cor="#ea580c" />
    </div>
  );
}

export default function FaturarRemessaBotao({ ppvId, numero, onFeito, compacto = false }: { ppvId: string; numero?: string; onFeito?: () => void; compacto?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [fase, setFase] = useState<"confirmar" | "faturando" | "fim">("confirmar");
  const [res, setRes] = useState<{ ok: boolean; texto: string } | null>(null);

  const faturar = async () => {
    setFase("faturando");
    try {
      const r = await fetch("/api/ppv/pedidos/faturar-remessa", { method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify({ id: ppvId }) });
      const j = await r.json().catch(() => ({}));
      setRes(r.ok && j.ok
        ? { ok: true, texto: j.nf ? `NF-e de remessa nº ${j.nf}${j.jaFaturada ? " (já estava faturada)" : ""}.` : "Remessa faturada. A NF-e aparece no bloco de notas em instantes." }
        : { ok: false, texto: j.error || `Erro ${r.status}` });
      if (r.ok && j.ok) onFeito?.();
    } catch { setRes({ ok: false, texto: "Sem resposta. Confira no Omie antes de tentar de novo." }); }
    setFase("fim");
  };

  return (
    <>
      <button type="button" onClick={() => { setFase("confirmar"); setRes(null); setAberto(true); }}
        title="Emite a NF-e de remessa das peças no Omie"
        style={compacto
          ? { flexShrink: 0, height: 26, padding: "0 9px", borderRadius: 7, border: "none", background: "#ea580c", color: "#fefefe", fontWeight: 800, fontSize: 11, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 5 }
          : { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 36, width: "100%", borderRadius: 9, border: "none", background: "#ea580c", color: "#fefefe", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 3px 10px rgba(234,88,12,.3)" }}>
        <i className="fas fa-file-invoice" /> Faturar remessa
      </button>
      {aberto && typeof document !== "undefined" && createPortal(
        <div onClick={() => fase !== "faturando" && setAberto(false)} style={{ position: "fixed", inset: 0, zIndex: 100060, background: "rgba(15,23,42,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 420, background: "#fefefe", color: "#0f172a", borderRadius: 16, boxShadow: "0 24px 60px rgba(15,23,42,.35)", overflow: "hidden" }}>
            {fase === "faturando" && <Faturando ppvId={ppvId} />}
            {fase === "confirmar" && (
              <div style={{ padding: "20px 22px" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span style={{ width: 40, height: 40, borderRadius: 12, background: "#fff7ed", color: "#ea580c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}><i className="fas fa-file-invoice" /></span>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800 }}>Faturar a remessa{numero ? ` ${numero}` : ""}?</div>
                    <div style={{ fontSize: 12.5, color: "#64748b" }}>{ppvId} · emite a NF-e de remessa no Omie</div>
                  </div>
                </div>
                <div style={{ marginTop: 14, fontSize: 12.5, color: "#475569", lineHeight: 1.55, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px" }}>
                  Antes de faturar, o portal confere a remessa igual à OS (contrato, projeto, previsão e nº do pedido do cliente). A nota sai com CFOP de remessa e <b>não gera conta a receber</b>.
                </div>
                <div style={{ marginTop: 10, fontSize: 12.5, color: "#475569" }}><i className="fas fa-stopwatch" style={{ color: "#ea580c" }} /> Tempo estimado: <b>~0:35</b></div>
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button type="button" onClick={() => setAberto(false)} style={{ flex: 1, height: 42, borderRadius: 10, border: "1px solid #cbd5e1", background: "#fefefe", color: "#334155", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
                  <button type="button" onClick={faturar} style={{ flex: 1.4, height: 42, borderRadius: 10, border: "none", background: "#ea580c", color: "#fefefe", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Faturar remessa</button>
                </div>
              </div>
            )}
            {fase === "fim" && res && (
              <div style={{ padding: "26px 24px 20px", textAlign: "center" }}>
                <span style={{ width: 52, height: 52, borderRadius: 26, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, background: res.ok ? "#f0fdf4" : "#fef2f2", color: res.ok ? "#15803d" : "#b91c1c" }}>
                  <i className={`fas ${res.ok ? "fa-check" : "fa-circle-xmark"}`} />
                </span>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{res.ok ? "Remessa faturada" : "Não faturou"}</div>
                <div style={{ fontSize: 13, color: "#475569", marginTop: 8, lineHeight: 1.5 }}>{res.texto}</div>
                <button type="button" onClick={() => setAberto(false)} style={{ width: "100%", height: 42, marginTop: 16, borderRadius: 10, border: "none", background: "#0f172a", color: "#fefefe", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Fechar</button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
