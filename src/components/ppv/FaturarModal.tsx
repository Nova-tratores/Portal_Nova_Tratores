"use client";
// Faturamento do PPV (NF-e) — confirmação simples. Clicou "Sim" → chama o
// FaturarPedidoVenda no Omie, fecha o modal e avisa "enviado pra SEFAZ".
// Antes de confirmar, mostra (não bloqueia) quantas peças rastreadas do
// pedido foram escaneadas e nunca liberadas — rastreio de unidades.
import { useEffect, useState } from "react";
import { api } from "@/lib/ppv/api";
import { authHeaders } from "@/lib/auth/client";

export default function FaturarModal({
  open, ppvId, numeroPedido, userName, onClose, onDone, showToast,
}: {
  open: boolean;
  ppvId: string | null;
  numeroPedido?: string;   // nº do Pedido de Venda no Omie
  userName?: string;
  onClose: () => void;
  onDone: () => void;
  showToast: (tipo: "success" | "error", msg: string) => void;
}) {
  const [faturando, setFaturando] = useState(false);
  const [erro, setErro] = useState("");
  // unidades rastreadas escaneadas no pedido mas nunca liberadas — aviso
  const [reservadasPendentes, setReservadasPendentes] = useState(0);

  useEffect(() => {
    if (!open || !ppvId) return;
    setReservadasPendentes(0);
    let cancel = false;
    (async () => {
      try {
        const r = await fetch(`/api/pecas/unidades?destino_ppv=${encodeURIComponent(ppvId)}&status=retirada_pendente&count=1`, { headers: await authHeaders() });
        const j = await r.json().catch(() => ({}));
        if (!cancel && r.ok) setReservadasPendentes(Number(j.total) || 0);
      } catch { /* sem aviso */ }
    })();
    return () => { cancel = true; };
  }, [open, ppvId]);

  if (!open) return null;

  const numero = numeroPedido ? (String(numeroPedido).replace(/^0+/, "") || String(numeroPedido)) : "";

  const faturar = async () => {
    if (!ppvId) return;
    setFaturando(true); setErro("");
    try {
      const r = await api.faturar(ppvId, "", userName); // sem categoria: usa a do pedido
      if (r.success) {
        onDone(); // marca Concluída/Faturado no drawer
        showToast("success", "O pedido foi enviado para a SEFAZ, aguarde uns instantes.");
        setFaturando(false);
        onClose();
        return;
      }
      // pendente ou erro do Omie — mostra na própria tela (não fecha).
      setErro(r.error || "Não foi possível faturar.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao faturar.");
    }
    setFaturando(false);
  };

  const btn: React.CSSProperties = { padding: "11px 16px", borderRadius: 4, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" };

  return (
    <div onClick={() => !faturando && onClose()} style={{ position: "fixed", inset: 0, zIndex: 68000, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "10vh 16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 4, width: "100%", maxWidth: 460, boxShadow: "0 24px 60px rgba(0,0,0,.3)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #eef0f3" }}>
          <i className="fas fa-bolt" style={{ color: "#e8730c" }} />
          <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Faturar pedido (NF-e)</div>
          <button onClick={onClose} disabled={faturando} style={{ background: "#f1f5f9", border: "none", borderRadius: 4, width: 30, height: 30, cursor: "pointer", color: "#475569", fontSize: 17 }}>×</button>
        </div>

        <div style={{ padding: "20px 18px" }}>
          {erro ? (
            <div style={{ borderRadius: 4, padding: "14px 16px", background: "#fef2f2", border: "1px solid #fecaca", color: "#7f1d1d", fontSize: 13.5, lineHeight: 1.5 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}><i className="fas fa-exclamation-circle" style={{ marginRight: 7 }} />Não foi possível faturar</div>
              <div>{erro}</div>
              <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                <button onClick={() => setErro("")} style={{ ...btn, background: "#334155", color: "#fff" }}>Tentar de novo</button>
                <button onClick={onClose} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Fechar</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 16.5, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
                Deseja faturar o Pedido de Venda{numero ? ` nº ${numero}` : ""}?
              </div>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 18 }}>Isto emite uma NF-e real no Omie.</div>
              {/* Peças escaneadas aguardando liberação (rastreio) — não bloqueia */}
              {reservadasPendentes > 0 && (
                <div style={{ marginBottom: 14, background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 4, padding: "10px 12px", fontSize: 12.5, color: "#92400e", lineHeight: 1.5 }}>
                  ⚠ <strong>{reservadasPendentes} peça(s) escaneada(s)</strong> neste pedido ainda aguardando liberação —{" "}
                  <a href={ppvId ? `/ppv/liberacao/${encodeURIComponent(ppvId)}` : "#"} target="_blank" rel="noreferrer" style={{ color: "#92400e", fontWeight: 700 }}>
                    abrir liberação
                  </a>. Dá pra faturar mesmo assim; a pendência fica na conferência.
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={faturar} disabled={faturando} style={{ ...btn, flex: 1, background: "#e8730c", color: "#fff", cursor: faturando ? "wait" : "pointer" }}>
                  {faturando ? "Faturando…" : "Sim, faturar"}
                </button>
                <button onClick={onClose} disabled={faturando} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Não</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
