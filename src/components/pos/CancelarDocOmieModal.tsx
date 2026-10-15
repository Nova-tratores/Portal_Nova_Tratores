"use client";
// Cancelar no Omie o que ainda NÃO foi faturado (José, 15/10/2026): o pedido de venda de
// peças (CancelarPedidoVenda → PPV fica Cancelada) ou a OS inteira (CancelarOS → OS
// Cancelada no portal, com opção de levar junto os pedidos não faturados).
import { useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "@/lib/auth/client";
import CronometroEstimado, { useSegundos } from "@/components/comum/CronometroEstimado";

type Alvo = { tipo: "pedido"; ppvId: string; numero: string } | { tipo: "os"; osId: string; numero: string; pedidos: string[] };

function Cancelando({ texto }: { texto: string }) {
  const s = useSegundos();
  return (
    <div style={{ padding: "30px 26px 24px", textAlign: "center" }}>
      <span style={{ width: 52, height: 52, borderRadius: 26, margin: "0 auto 12px", background: "#fef2f2", color: "#b91c1c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>
        <i className="fas fa-spinner fa-spin" />
      </span>
      <div style={{ fontSize: 16, fontWeight: 800 }}>{texto}</div>
      <div style={{ fontSize: 12.5, color: "#64748b", margin: "4px 0 14px" }}>Não feche esta janela.</div>
      <CronometroEstimado segundos={s} estimativa={20} cor="#b91c1c" />
    </div>
  );
}

export default function CancelarDocOmieModal({ alvo, onClose, onFeito }: { alvo: Alvo; onClose: () => void; onFeito: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [levarPedidos, setLevarPedidos] = useState(true);
  const [certeza, setCerteza] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; texto: string; avisos?: string[] } | null>(null);
  const ehOS = alvo.tipo === "os";
  const nome = ehOS ? `a OS ${alvo.numero}` : `o pedido de venda ${alvo.numero}`;
  const pode = motivo.trim().length >= 5 && certeza && !enviando;

  const cancelar = async () => {
    setEnviando(true);
    try {
      const h = { ...(await authHeaders()), "Content-Type": "application/json" };
      const r = alvo.tipo === "os"
        ? await fetch(`/api/pos/ordens/${encodeURIComponent(alvo.osId)}/cancelar-omie`, { method: "POST", headers: h, body: JSON.stringify({ motivo: motivo.trim(), cancelarPedidos: levarPedidos }) })
        : await fetch("/api/ppv/pedidos/cancelar", { method: "POST", headers: h, body: JSON.stringify({ id: alvo.ppvId, motivo: motivo.trim() }) });
      const j = await r.json().catch(() => ({}));
      const ok = r.ok && (j.ok || j.success);
      setRes(ok
        ? { ok: true, texto: ehOS ? `OS ${alvo.numero} cancelada no Omie e no portal.${j.pedidosCancelados?.length ? ` Pedidos cancelados: ${j.pedidosCancelados.join(", ")}.` : ""}` : `Pedido ${alvo.numero} cancelado no Omie. O PPV ficou como Cancelada.`, avisos: j.avisos }
        : { ok: false, texto: j.erro || j.error || `Erro ${r.status}` });
      if (ok) onFeito();
    } catch { setRes({ ok: false, texto: "Sem conexão. Confira no Omie antes de tentar de novo." }); }
    setEnviando(false);
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div onClick={() => !enviando && onClose()} style={{ position: "fixed", inset: 0, zIndex: 100050, background: "rgba(15,23,42,.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "#fefefe", color: "#0f172a", borderRadius: 16, boxShadow: "0 24px 60px rgba(15,23,42,.35)", overflow: "hidden" }}>
        {enviando ? <Cancelando texto={`Cancelando ${nome} no Omie`} /> : res ? (
          <div style={{ padding: "26px 24px 20px", textAlign: "center" }}>
            <span style={{ width: 52, height: 52, borderRadius: 26, margin: "0 auto 12px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 21, background: res.ok ? "#f0fdf4" : "#fef2f2", color: res.ok ? "#15803d" : "#b91c1c" }}>
              <i className={`fas ${res.ok ? "fa-check" : "fa-circle-xmark"}`} />
            </span>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{res.ok ? "Cancelado" : "Não cancelou"}</div>
            <div style={{ fontSize: 13, color: "#475569", marginTop: 8, lineHeight: 1.5 }}>{res.texto}</div>
            {!!res.avisos?.length && (
              <div style={{ marginTop: 10, textAlign: "left", fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 9, padding: "8px 10px", lineHeight: 1.5 }}>
                {res.avisos.map((a) => <div key={a}>• {a}</div>)}
              </div>
            )}
            <button type="button" onClick={onClose} style={{ width: "100%", height: 42, marginTop: 16, borderRadius: 10, border: "none", background: "#0f172a", color: "#fefefe", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Fechar</button>
          </div>
        ) : (
          <div style={{ padding: "20px 22px" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: "#fef2f2", color: "#b91c1c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}><i className="fas fa-ban" /></span>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>Cancelar {nome}</div>
                <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 2, lineHeight: 1.45 }}>
                  {ehOS ? "Cancela a OS no Omie (ainda não faturada) e a OS do portal vai para Cancelada." : "Cancela o pedido no Omie (ainda não faturado) e o PPV fica como Cancelada."}
                </div>
              </div>
            </div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: .5, margin: "16px 0 6px" }}>Motivo *</label>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} autoFocus placeholder="Ex.: peças não foram usadas / serviço não será feito / lançado em duplicidade"
              style={{ width: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid #cbd5e1", padding: "9px 11px", fontSize: 13.5, fontFamily: "inherit", resize: "vertical", outline: "none" }} />
            {ehOS && alvo.pedidos.length > 0 && (
              <label style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 12, fontSize: 13, cursor: "pointer" }}>
                <input type="checkbox" checked={levarPedidos} onChange={(e) => setLevarPedidos(e.target.checked)} style={{ width: 16, height: 16, margin: "2px 0 0" }} />
                <span>Cancelar também os pedidos de venda desta OS ainda não faturados <span style={{ color: "#64748b" }}>({alvo.pedidos.join(", ")})</span></span>
              </label>
            )}
            <label style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 12, fontSize: 13, fontWeight: 700, cursor: "pointer", color: "#991b1b" }}>
              <input type="checkbox" checked={certeza} onChange={(e) => setCerteza(e.target.checked)} style={{ width: 16, height: 16, margin: "2px 0 0" }} />
              Entendo que {nome} será cancelado no Omie e isso não se desfaz.
            </label>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button type="button" onClick={onClose} style={{ flex: 1, height: 42, borderRadius: 10, border: "1px solid #cbd5e1", background: "#fefefe", color: "#334155", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Voltar</button>
              <button type="button" onClick={cancelar} disabled={!pode}
                style={{ flex: 1.4, height: 42, borderRadius: 10, border: "none", background: pode ? "#b91c1c" : "#fca5a5", color: "#fefefe", fontWeight: 800, fontSize: 14, cursor: pode ? "pointer" : "not-allowed", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <i className="fas fa-ban" /> Cancelar no Omie
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
