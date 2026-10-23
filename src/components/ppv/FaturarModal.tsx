"use client";
// Faturamento do PPV (NF-e) no mesmo jeito do POS (José, 23/10/2026: "replicar o que fizemos no POS"):
//  1. conferência portal × Omie ("O Omie está diferente do portal");
//  2. confirmação com o que vai sair (empresa, itens, total) — "Tem certeza?";
//  3. "Faturando no Omie" com cronômetro e "Fechar e avisar no sino" (o servidor continua);
//  4. aguardando a NF-e da SEFAZ (confere sozinho e traz para o portal).
// Antes de confirmar, mostra (não bloqueia) as peças rastreadas escaneadas e nunca liberadas.
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/ppv/api";
import { authHeaders } from "@/lib/auth/client";
import ConferenciaOmie from "@/components/comum/ConferenciaOmie";
import { FaturandoTela, AguardandoNotas } from "@/components/pos/FaturarOSModal";

type Previa = { empresa?: string; total?: number; itens?: { descricao: string; quantidade: number; valorUnitario: number; valorTotal: number }[]; erro?: string };
const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

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
  const [etapa, setEtapa] = useState<"conferencia" | "confirmar" | "faturando" | "aguardando" | "erro">("conferencia");
  const [erro, setErro] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  // unidades rastreadas escaneadas no pedido mas nunca liberadas — aviso
  const [reservadasPendentes, setReservadasPendentes] = useState(0);
  // fechou durante o "Faturando": o resultado só vai para o sino
  const fechouRef = useRef(false);

  useEffect(() => {
    if (!open || !ppvId) return;
    let cancel = false;
    fechouRef.current = false;
    Promise.resolve().then(() => { if (!cancel) { setEtapa("conferencia"); setErro(""); setPrevia(null); } });
    (async () => {
      try {
        const r = await fetch(`/api/pecas/unidades?destino_ppv=${encodeURIComponent(ppvId)}&status=retirada_pendente&count=1`, { headers: await authHeaders() });
        const j = await r.json().catch(() => ({}));
        if (!cancel && r.ok) setReservadasPendentes(Number(j.total) || 0);
      } catch { /* sem aviso */ }
    })();
    return () => { cancel = true; };
  }, [open, ppvId]);

  // prévia do que vai sair (só leitura no Omie), depois da conferência
  useEffect(() => {
    if (!open || !ppvId || etapa !== "confirmar" || previa) return;
    let cancel = false;
    api.simularFaturamento(ppvId)
      .then((r) => { if (!cancel) setPrevia(r && (r as { ok?: boolean }).ok !== false ? (r as Previa) : { erro: (r as { erro?: string })?.erro || "Não consegui ler o pedido no Omie." }); })
      .catch(() => { if (!cancel) setPrevia({ erro: "Não consegui ler o pedido no Omie." }); });
    return () => { cancel = true; };
  }, [open, ppvId, etapa, previa]);

  if (!open || !ppvId) return null;
  const numero = numeroPedido ? (String(numeroPedido).replace(/^0+/, "") || String(numeroPedido)) : "";

  if (etapa === "conferencia") return <ConferenciaOmie alvo={{ tipo: "ppv", ppvId }} cor="#e8730c" onOk={() => setEtapa("confirmar")} onCancelar={onClose} />;

  const faturar = async () => {
    setEtapa("faturando"); setErro("");
    try {
      const r = await api.faturar(ppvId, "", userName); // sem categoria: usa a do pedido
      if (r.success) {
        onDone(); // marca Concluída/Faturado no drawer
        if (fechouRef.current) return; // o aviso chega no sino
        setEtapa("aguardando");
        return;
      }
      if (fechouRef.current) { showToast("error", r.error || "Não foi possível faturar — veja o aviso no sino."); return; }
      setErro(r.error || "Não foi possível faturar."); setEtapa("erro");
    } catch (e) {
      if (fechouRef.current) return;
      setErro(e instanceof Error ? e.message : "Erro ao faturar."); setEtapa("erro");
    }
  };

  if (etapa === "faturando") {
    return <FaturandoTela comOS={false} comPecas onFechar={() => {
      fechouRef.current = true;
      showToast("success", "O faturamento continua no servidor. Você recebe um aviso no sino quando a NF-e sair.");
      onClose();
    }} />;
  }

  const btn: React.CSSProperties = { padding: "11px 16px", borderRadius: 10, border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
  const casca = (conteudo: React.ReactNode) => (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 68000, background: "rgba(15,23,42,.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "8vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fefefe", color: "#1e293b", borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 30px 70px rgba(0,0,0,.35)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #eef0f3" }}>
          <i className="fas fa-bolt" style={{ color: "#e8730c" }} />
          <div style={{ flex: 1, fontSize: 16, fontWeight: 800 }}>Faturar pedido de venda{numero ? ` nº ${numero}` : ""} (NF-e)</div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 30, height: 30, cursor: "pointer", color: "#475569", fontSize: 17 }}>×</button>
        </div>
        <div style={{ padding: "18px 20px 20px" }}>{conteudo}</div>
      </div>
    </div>
  );

  if (etapa === "aguardando") {
    return casca(<AguardandoNotas osId="" comOS={false} ppvIds={[ppvId]} numeroOS="" concluida={false} onFechar={onClose}
      rodape={<><i className="fas fa-circle-info" /> O pedido já está faturado no Omie.</>} />);
  }

  if (etapa === "erro") {
    return casca(
      <div style={{ borderRadius: 10, padding: "14px 16px", background: "#fef2f2", border: "1px solid #fecaca", color: "#7f1d1d", fontSize: 13.5, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}><i className="fas fa-exclamation-circle" style={{ marginRight: 7 }} />Não foi possível faturar</div>
        <div>{erro}</div>
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <button onClick={() => { setErro(""); setPrevia(null); setEtapa("conferencia"); }} style={{ ...btn, background: "#334155", color: "#fefefe" }}>Conferir e tentar de novo</button>
          <button onClick={onClose} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Fechar</button>
        </div>
      </div>,
    );
  }

  // confirmar: o que vai sair → "Tem certeza?"
  const itens = previa?.itens || [];
  return casca(
    <>
      {!previa ? (
        <div style={{ textAlign: "center", padding: "18px 0", color: "#64748b", fontSize: 13.5 }}><i className="fas fa-spinner fa-spin" /> Lendo o pedido no Omie…</div>
      ) : previa.erro ? (
        <div style={{ marginBottom: 14, borderRadius: 10, padding: "10px 12px", background: "#fffbeb", border: "1px solid #fcd34d", color: "#92400e", fontSize: 12.5 }}>
          <i className="fas fa-triangle-exclamation" /> {previa.erro} Dá para faturar mesmo assim.
        </div>
      ) : (
        <div style={{ marginBottom: 14, border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#f8fafc", borderBottom: "1px solid #eef1f4", fontSize: 12.5, color: "#475569" }}>
            <span><i className="fas fa-building" /> {previa.empresa || "—"}</span>
            <span>{itens.length} {itens.length === 1 ? "item" : "itens"}</span>
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {itens.map((it, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "8px 14px", borderTop: i ? "1px solid #f1f5f9" : "none", fontSize: 13 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.descricao}>{it.descricao}</span>
                <span style={{ color: "#64748b", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{String(it.quantidade).replace(".", ",")} × {brl(it.valorUnitario)}</span>
                <b style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{brl(it.valorTotal)}</b>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderTop: "1px solid #eef1f4", background: "#fff7ed", fontSize: 14 }}>
            <b>Total da NF-e</b><b style={{ color: "#c2410c", fontVariantNumeric: "tabular-nums" }}>{brl(previa.total || 0)}</b>
          </div>
        </div>
      )}
      {reservadasPendentes > 0 && (
        <div style={{ marginBottom: 14, background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10, padding: "10px 12px", fontSize: 12.5, color: "#92400e", lineHeight: 1.5 }}>
          ⚠ <strong>{reservadasPendentes} peça(s) escaneada(s)</strong> neste pedido ainda aguardando liberação —{" "}
          <a href={`/ppv/liberacao/${encodeURIComponent(ppvId)}`} target="_blank" rel="noreferrer" style={{ color: "#92400e", fontWeight: 700 }}>abrir liberação</a>. Dá pra faturar mesmo assim; a pendência fica na conferência.
        </div>
      )}
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: "#ffedd5", color: "#c2410c", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}><i className="fas fa-triangle-exclamation" /></span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Tem certeza?</div>
          <div style={{ fontSize: 13, color: "#475569", marginTop: 3, lineHeight: 1.5 }}>Isto emite uma NF-e real na SEFAZ{previa?.total ? ` de ${brl(previa.total)}` : ""}.</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={faturar} disabled={!previa} style={{ ...btn, flex: 1, background: previa ? "#e8730c" : "#fdba74", color: "#fefefe", cursor: previa ? "pointer" : "wait" }}>
          <i className="fas fa-file-invoice-dollar" /> Sim, faturar
        </button>
        <button onClick={onClose} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Não</button>
      </div>
    </>,
  );
}
