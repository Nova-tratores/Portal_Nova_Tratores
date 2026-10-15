"use client";
// OS INTERNA: faturar com RECIBO no Omie (José, 15/10/2026). Não emite NFS-e e não gera
// conta a receber — no Omie isso acontece quando todos os serviços estão com
// "não gerar conta a receber". Fluxo: conferência portal × Omie → resumo → faturando → recibo.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "@/lib/auth/client";
import ConferenciaOmie from "@/components/comum/ConferenciaOmie";
import CronometroEstimado, { useSegundos, pctPeloTempo } from "@/components/comum/CronometroEstimado";

interface Previa {
  ok: boolean; erro?: string; numeroOmie?: string; cliente?: string; total?: number;
  servicos?: Array<{ descricao: string; total: number; naoGeraFinanceiro: boolean }>;
  remessas?: Array<{ id: string; pedidoOmie: string; valor: number }>;
}
type Resultado = { ok: boolean; tipo: string; mensagem?: string; recibo?: string | null; concluida?: boolean; remessas?: Array<{ id: string; ok: boolean; nf?: string | null; erro?: string }> };

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ESTIMATIVA = 40;
const PASSOS = [
  { de: 0, txt: "Conferindo a OS no Omie" },
  { de: 5, txt: "Marcando os serviços sem conta a receber" },
  { de: 14, txt: "Validando a OS" },
  { de: 20, txt: "Faturando com recibo" },
  { de: 30, txt: "Buscando o nº do recibo" },
];

function Faturando({ numero }: { numero: string }) {
  const s = useSegundos();
  const atual = PASSOS.filter((p) => s >= p.de).length - 1;
  return (
    <div style={{ padding: "28px 26px 22px", textAlign: "center" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/marcas/omie.png" alt="Omie" style={{ height: 26, objectFit: "contain", marginBottom: 12 }} />
      <div style={{ fontSize: 16, fontWeight: 800 }}>Faturando a OS {numero} com recibo</div>
      <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 3 }}>Não feche esta janela.</div>
      <div style={{ height: 6, borderRadius: 3, background: "#e2e8f0", margin: "16px 0 14px", overflow: "hidden" }}>
        <div style={{ width: `${pctPeloTempo(s, ESTIMATIVA)}%`, height: "100%", background: "linear-gradient(90deg,#a78bfa,#6d28d9)", transition: "width 1s linear" }} />
      </div>
      <div style={{ display: "grid", gap: 7, textAlign: "left", margin: "0 auto 14px", maxWidth: 300 }}>
        {PASSOS.map((p, i) => (
          <div key={p.txt} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: i < atual ? "#6d28d9" : i === atual ? "#0f172a" : "#94a3b8", fontWeight: i === atual ? 700 : 500 }}>
            <i className={`fas ${i < atual ? "fa-circle-check" : i === atual ? "fa-spinner fa-spin" : "fa-circle"}`} style={{ width: 14, fontSize: i > atual ? 6 : 13 }} />
            {p.txt}
          </div>
        ))}
      </div>
      <CronometroEstimado segundos={s} estimativa={ESTIMATIVA} cor="#6d28d9" />
    </div>
  );
}

export default function FaturarReciboModal({ osId, onClose, onFaturado }: { osId: string; onClose: () => void; onFaturado: () => void }) {
  const [conferido, setConferido] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [faturando, setFaturando] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [certeza, setCerteza] = useState(false);

  useEffect(() => {
    if (!conferido) return;
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/faturar`, { method: "PATCH", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify({ previa: true }) });
        const j = await r.json().catch(() => ({}));
        if (vivo) setPrevia(r.ok ? j : { ok: false, erro: j.error || `Erro ${r.status}` });
      } catch { if (vivo) setPrevia({ ok: false, erro: "Sem conexão." }); }
    })();
    return () => { vivo = false; };
  }, [conferido, osId]);

  const faturar = async () => {
    if (!previa?.ok) return;
    setFaturando(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 150_000);
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/faturar`, {
        method: "PATCH", signal: ctrl.signal,
        headers: { ...(await authHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ totalConfirmado: previa.total || 0 }),
      });
      const j = await r.json().catch(() => ({}));
      setRes({ ok: !!j.success, tipo: j.tipo || "erro", mensagem: j.mensagem || j.error, recibo: j.recibo, concluida: j.concluida, remessas: j.remessas || [] });
      if (j.success) onFaturado();
    } catch {
      setRes({ ok: false, tipo: "desconhecido", mensagem: "O Omie não respondeu a tempo. Confira o bloco do Omie antes de tentar de novo — o portal confere sozinho." });
    } finally { clearTimeout(t); setFaturando(false); }
  };

  if (!conferido) return <ConferenciaOmie alvo={{ tipo: "os", osId }} onOk={() => setConferido(true)} onCancelar={onClose} />;
  if (typeof document === "undefined") return null;

  const marcar = (previa?.servicos || []).filter((s) => !s.naoGeraFinanceiro).length;
  return createPortal(
    <div onClick={() => !faturando && onClose()} style={{ position: "fixed", inset: 0, zIndex: 68000, background: "rgba(15,23,42,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", background: "#fefefe", color: "#0f172a", borderRadius: 16, boxShadow: "0 24px 60px rgba(15,23,42,.35)" }}>
        {faturando ? <Faturando numero={previa?.numeroOmie || ""} /> : res ? (
          <div style={{ padding: "26px 24px 20px", textAlign: "center" }}>
            <span style={{ width: 54, height: 54, borderRadius: 27, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
              background: res.ok ? "#f5f3ff" : "#fef2f2", color: res.ok ? "#6d28d9" : "#b91c1c" }}>
              <i className={`fas ${res.ok ? (res.tipo === "nfse" ? "fa-triangle-exclamation" : "fa-receipt") : "fa-circle-xmark"}`} />
            </span>
            <div style={{ fontSize: 18, fontWeight: 800 }}>
              {res.ok ? (res.tipo === "nfse" ? "Faturada — mas saiu NFS-e" : res.recibo ? `Recibo nº ${res.recibo}` : "Faturada com recibo") : "Não faturou"}
            </div>
            <div style={{ fontSize: 13, color: "#475569", marginTop: 8, lineHeight: 1.5 }}>{res.mensagem}</div>
            {res.ok && !!res.remessas?.length && (
              <div style={{ marginTop: 12, textAlign: "left", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                {res.remessas.map((r) => (
                  <div key={r.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 11px", fontSize: 12.5, background: r.ok ? "#fff7ed" : "#fef2f2", color: r.ok ? "#9a3412" : "#b91c1c" }}>
                    <i className={`fas ${r.ok ? "fa-file-invoice" : "fa-circle-exclamation"}`} style={{ marginTop: 2 }} />
                    <span>{r.ok ? <>Remessa {r.id}: <b>{r.nf ? `NF-e ${r.nf}` : "faturada (NF-e saindo)"}</b></> : <>Remessa {r.id} não faturou: {r.erro}. Fature pelo bloco de notas da OS.</>}</span>
                  </div>
                ))}
              </div>
            )}
            {res.ok && res.tipo !== "nfse" && res.concluida && (
              <div style={{ fontSize: 12.5, color: "#6d28d9", marginTop: 8, fontWeight: 600 }}>A OS foi para Concluída.</div>
            )}
            <button type="button" onClick={onClose} style={{ width: "100%", height: 42, marginTop: 18, borderRadius: 10, border: "none", background: "#0f172a", color: "#fefefe", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Fechar</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px 14px", borderBottom: "1px solid #f1f5f9" }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, background: "#f5f3ff", color: "#6d28d9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}><i className="fas fa-receipt" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>Faturar OS interna com recibo</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>Sem NFS-e e sem conta a receber.</div>
              </div>
              <button type="button" onClick={onClose} title="Fechar" style={{ width: 32, height: 32, borderRadius: 16, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#64748b", cursor: "pointer" }}><i className="fas fa-xmark" /></button>
            </div>

            {!previa ? (
              <div style={{ padding: 32, textAlign: "center", color: "#64748b", fontSize: 13 }}><i className="fas fa-spinner fa-spin" /> Lendo a OS no Omie…</div>
            ) : !previa.ok ? (
              <div style={{ margin: 20, padding: "12px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>{previa.erro}</div>
            ) : (
              <div style={{ padding: "16px 22px 20px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: .5 }}>OS nº {previa.numeroOmie}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{previa.cliente}</div>
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#6d28d9", fontVariantNumeric: "tabular-nums" }}>{brl(previa.total || 0)}</div>
                </div>

                <div style={{ marginTop: 12, border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                  {(previa.servicos || []).map((s, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "7px 11px", fontSize: 12.5, background: i % 2 ? "#f8fafc" : "#fefefe" }}>
                      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.descricao}</span>
                      <b style={{ fontVariantNumeric: "tabular-nums" }}>{brl(s.total)}</b>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "#f5f3ff", border: "1px solid #ddd6fe", fontSize: 12.5, color: "#4c1d95", lineHeight: 1.55 }}>
                  <div style={{ fontWeight: 800, marginBottom: 3 }}><i className="fas fa-circle-info" /> O que acontece</div>
                  • O Omie gera um <b>recibo</b> (não sai NFS-e).<br />
                  • Não cria conta a receber nem card no financeiro.<br />
                  {marcar > 0 && <>• {marcar} serviço(s) serão marcados como &quot;não gerar conta a receber&quot; no Omie antes de faturar.<br /></>}
                  {(previa.remessas || []).length > 0
                    ? <>• Peças: a remessa {previa.remessas!.map((r) => r.pedidoOmie || r.id).join(", ")} é <b>faturada junto</b> (NF-e de remessa).</>
                    : <>• Sem peças vinculadas.</>}
                </div>

                <label style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 14, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  <input type="checkbox" checked={certeza} onChange={(e) => setCerteza(e.target.checked)} style={{ width: 17, height: 17, margin: 0 }} />
                  Confirmo que esta OS é interna e deve sair com recibo
                </label>
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button type="button" onClick={onClose} style={{ flex: 1, height: 42, borderRadius: 10, border: "1px solid #cbd5e1", background: "#fefefe", color: "#334155", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
                  <button type="button" onClick={faturar} disabled={!certeza}
                    style={{ flex: 1.5, height: 42, borderRadius: 10, border: "none", background: certeza ? "#6d28d9" : "#c4b5fd", color: "#fefefe", fontWeight: 800, fontSize: 14, cursor: certeza ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <i className="fas fa-receipt" /> Faturar com recibo
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
