"use client";

// Balões do tempário na OS (José, 20/10/2026): o Tratorilson compara as horas do relatório do técnico com o
// tempário Mahindra — levou muito mais (possíveis horas fantasmas) ou rápido demais (pode ter pulado etapa,
// risco de retrabalho) — e mostra as atividades que ele reconheceu. Via /api/pos/ordens/[id]/previsao.
import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import type { PrevisaoOS } from "@/lib/mecanicos/previsao-os-server";

const fmt = (m: number) => { const h = Math.floor(m / 60), mm = Math.round(m % 60); return h ? `${h}h${mm ? String(mm).padStart(2, "0") : ""}` : `${mm}min`; };
const COR = {
  vermelho: { bg: "#fef2f2", bd: "#fecaca", tx: "#991b1b" },
  amarelo: { bg: "#fffbeb", bd: "#fde68a", tx: "#92400e" },
  azul: { bg: "#f8fafc", bd: "#e2e8f0", tx: "#475569" },
};

export default function TemparioOSBloco({ osId }: { osId: string }) {
  const [p, setP] = useState<PrevisaoOS | null | undefined>(undefined);
  const [ver, setVer] = useState(false);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/previsao${versao ? "?refazer=1" : ""}`, { headers: await authHeaders(), cache: "no-store" });
        const j = await r.json();
        if (vivo) setP(j.previsao || null);
      } catch { if (vivo) setP(null); }
    })();
    return () => { vivo = false; };
  }, [osId, versao]);

  if (p === undefined) return <div style={{ marginTop: 12, fontSize: 12.5, color: "#94a3b8" }}>Tratorilson conferindo as horas no tempário…</div>;
  if (!p) return null;
  const prev = p.minutosPrevistos;
  const pct = prev ? Math.min(100, Math.round(((p.horasRelatorio * 60) / Math.max(prev, p.horasRelatorio * 60)) * 100)) : 0;
  return (
    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
      {p.alertas.map((a, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", background: COR[a.nivel].bg, border: `1px solid ${COR[a.nivel].bd}`, color: COR[a.nivel].tx, borderRadius: 12, padding: "10px 14px", fontSize: 13, lineHeight: 1.5 }}>
          <i className="fas fa-robot" style={{ marginTop: 3, flexShrink: 0 }} title="Tratorilson" />
          <span>{a.texto}</span>
        </div>
      ))}
      {prev != null && (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 14px", background: "#fff", display: "grid", gap: 8 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap", fontSize: 13.5, color: "#0f172a" }}>
            <span>Tempário <b style={{ fontWeight: 500 }}>{fmt(prev)}</b></span>
            <span>Relatório <b style={{ fontWeight: 500 }}>{fmt(p.horasRelatorio * 60)}</b></span>
            <span style={{ color: p.diffHoras > 0 ? "#b91c1c" : p.diffHoras < 0 ? "#047857" : "#475569" }}>{p.diffHoras > 0 ? "+" : p.diffHoras < 0 ? "−" : ""}{fmt(Math.abs(p.diffHoras) * 60)}</span>
            <button type="button" onClick={() => setVer((v) => !v)} style={{ marginLeft: "auto", border: "none", background: "none", color: "#1d4ed8", fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}>{ver ? "esconder" : `ver as ${p.atividades.length} atividades`}</button>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: "#f1f5f9", position: "relative", overflow: "hidden" }}>
            <i style={{ position: "absolute", inset: 0, width: `${Math.min(100, (prev / Math.max(prev, p.horasRelatorio * 60)) * 100)}%`, background: "#cbd5e1" }} />
            <i style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: p.situacao === "muito_acima" ? "#dc2626" : p.situacao === "acima" || p.situacao === "rapido" ? "#d97706" : "#059669", opacity: .85 }} />
          </div>
          {ver && (
            <div style={{ display: "grid", gap: 4 }}>
              {p.atividades.map((a) => (
                <div key={a.i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, fontSize: 12.5, color: "#334155", borderTop: "1px solid #f1f5f9", paddingTop: 4 }}>
                  <span>{a.atividade}{a.qtd > 1 ? ` × ${a.qtd}` : ""}<small style={{ display: "block", color: "#94a3b8" }}>“{a.porque}”</small></span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(a.minutos * a.qtd)}</span>
                </div>
              ))}
              {p.observacao && <div style={{ fontSize: 12, color: "#64748b" }}>{p.observacao}</div>}
              <button type="button" onClick={() => { setP(undefined); setVersao((v) => v + 1); }} style={{ justifySelf: "start", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 99, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}>conferir de novo</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
