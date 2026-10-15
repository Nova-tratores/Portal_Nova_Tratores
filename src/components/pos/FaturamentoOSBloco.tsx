"use client";
// Faturamento da OS na coluna lateral do drawer: o "Enviar para Omie" vira
// "Faturar (NFS-e)" e depois o selo "Faturada · NFS-e nº X" — como no PPV.
// Busca a própria situação (GET /api/pos/ordens/[id]/faturar); ao abrir confere
// no Omie (o servidor limita a 1x a cada 2 min por OS). Nada aparece com o
// interruptor POS_FATURAR desligado.
import { useCallback, useEffect, useState } from "react";
import CancelarNotaModal from "./CancelarNotaModal";
import { authHeaders } from "@/lib/auth/client";
import { rotuloStatus } from "@/lib/pos/faturamento-regras";
import FaturarOSModal from "./FaturarOSModal";

interface Estado {
  habilitado: boolean; podeFaturar: boolean; podeFaturarPecas: boolean; enviadaOmie: boolean; podeCancelarNota?: boolean; valor?: number;
  anteriores?: Array<{ nfse: string | null; ordemOmie: string; canceladaEm: string; motivo: string; novaOmie?: string | null; omieCancelada?: boolean }>;
  bloqueio: string | null; status: string | null; erro: string | null;
  faturadoEm: string | null; faturadoPor: string | null; formaPagamento: string | null;
  nfseNumero: string | null; nfseLink: string | null;
  pecas: Array<{ id: string; pedidoOmie?: string; ok: boolean; erro?: string | null; nf?: string | null }>;
  pedidos?: Array<{ id: string; pedidoOmie: string; faturado: boolean; nf?: string | null; ncCancelada?: { nf: string | null; pedido: string; motivo: string } | null }>;
}

const COR = {
  verde: { bg: "#f0fdf4", bd: "#bbf7d0", tx: "#15803d" },
  cinza: { bg: "#f8fafc", bd: "#e2e8f0", tx: "#475569" },
  ambar: { bg: "#fffbeb", bd: "#fcd34d", tx: "#b45309" },
  vermelho: { bg: "#fef2f2", bd: "#fecaca", tx: "#b91c1c" },
};

export default function FaturamentoOSBloco({ osId, ordemOmie, onFaturado, onAtualizar, abrirAoCarregar = false }: {
  osId: string;
  ordemOmie: string;
  /** botão Faturar da capa do card: abre a janela sozinho (uma vez) quando der para faturar */
  abrirAoCarregar?: boolean;
  onFaturado: () => void;
  /** algo mudou sem faturar (cancelou nota, duplicou a OS): recarrega o drawer */
  onAtualizar?: () => void;
}) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [aberto, setAberto] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [refaturando, setRefaturando] = useState(false);
  const [cancelarNota, setCancelarNota] = useState<null | "cancelar" | "duplicar">(null);
  const [menuNota, setMenuNota] = useState(false);
  // nota de peças: qual pedido e em qual passo
  const [pedidoAlvo, setPedidoAlvo] = useState<null | { id: string; num: string; nf: string | null; etapa: "cancelar" | "duplicar" }>(null);
  const [cancelandoAntiga, setCancelandoAntiga] = useState(false);
  const [msgAntiga, setMsgAntiga] = useState<{ ok: boolean; texto: string } | null>(null);
  const cancelarAntiga = async () => {
    setCancelandoAntiga(true); setMsgAntiga(null);
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/refaturar`, { method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify({ acao: "cancelar_antiga" }) });
      const j = await r.json().catch(() => ({}));
      setMsgAntiga(j.ok ? { ok: true, texto: `OS ${j.antiga} cancelada no Omie.` } : { ok: false, texto: j.erro || "Não foi possível cancelar." });
      void carregar(); onAtualizar?.();
    } catch { setMsgAntiga({ ok: false, texto: "Sem resposta do servidor. Confira no Omie antes de tentar de novo." }); }
    setCancelandoAntiga(false);
  };

  const carregar = useCallback(async (opts: { reconciliar?: boolean; forcar?: boolean } = {}) => {
    try {
      const q = opts.reconciliar ? `?reconciliar=1${opts.forcar ? "&forcar=1" : ""}` : "";
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/faturar${q}`, { headers: await authHeaders() });
      if (!r.ok) { setEstado(null); return; }
      setEstado(await r.json());
    } catch { /* sem bloco */ }
  }, [osId]);

  // 1ª leitura ao abrir a OS (confere no Omie); as demais vêm de carregar()
  useEffect(() => {
    if (!osId || !ordemOmie) return;
    let cancel = false;
    authHeaders()
      .then((h) => fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/faturar?reconciliar=1`, { headers: h }))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancel) return;
        setEstado(j);
        if (abrirAoCarregar && j?.habilitado && j?.enviadaOmie && j?.podeFaturar && !j?.faturadoEm) setAberto(true);
      })
      .catch(() => { /* sem bloco */ });
    return () => { cancel = true; };
  }, [osId, ordemOmie, abrirAoCarregar]);

  if (!estado || !estado.habilitado || !estado.enviadaOmie) return null;

  const conferir = async () => {
    setConferindo(true);
    await carregar({ reconciliar: true, forcar: true });
    setConferindo(false);
    onFaturado();
  };

  const refaturarPecas = async (ids: string[]) => {
    if (!confirm(`Tem certeza? Vai faturar ${ids.length === 1 ? "o pedido de peças" : "os pedidos de peças"} ${ids.join(", ")} no Omie (emite NF-e real).`)) return;
    setRefaturando(true);
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/faturar/pecas`, {
        method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify({ ppvIds: ids }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) alert(j.mensagem || j.error || "Não foi possível faturar as peças.");
    } catch { alert("Falha de conexão — confira o pedido no PPV antes de tentar de novo."); }
    setRefaturando(false);
    await carregar();
  };

  const rot = rotuloStatus(estado.status);
  const pedidosFaltando = (estado.pedidos || []).filter((p) => !p.faturado);
  const pecasPendentes = estado.faturadoEm
    ? [...estado.pecas.filter((p) => !p.ok), ...pedidosFaltando.filter((p) => !estado.pecas.some((x) => x.id === p.id)).map((p) => ({ id: p.id, pedidoOmie: p.pedidoOmie, ok: false, erro: "ainda não faturado" }))]
    : [];
  const pedidosJaFaturados = (estado.pedidos || []).filter((p) => p.faturado);

  const numOS = ordemOmie.replace(/^0+(?=\d)/, "");
  const nfseAtual = estado.nfseNumero ? String(estado.nfseNumero).replace(/^0+(?=\d)/, "") : null;
  const modal = cancelarNota && <CancelarNotaModal osId={osId} numeroOS={numOS} nfse={nfseAtual} valor={estado.valor} etapaInicial={cancelarNota}
    onFechar={() => { setCancelarNota(null); void carregar(); }} onFeito={() => { void carregar(); (onAtualizar || onFaturado)(); }} />;
  const modalPedido = pedidoAlvo && <CancelarNotaModal tipo="pedido" osId={osId} ppvId={pedidoAlvo.id} numeroOS={pedidoAlvo.num} nfse={pedidoAlvo.nf} etapaInicial={pedidoAlvo.etapa}
    onFechar={() => { setPedidoAlvo(null); void carregar(); }} onFeito={() => { void carregar(); (onAtualizar || onFaturado)(); }} />;
  // NF-e de peças cancelada, falta duplicar o pedido
  const pedidosPendentes = (estado.pedidos || []).filter((p) => p.ncCancelada);
  const avisoPedidos = pedidosPendentes.map((p) => (
    <div key={`nc-${p.id}`} style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#7f1d1d", borderRadius: 10, padding: "9px 10px", fontSize: 12, margin: "4px 0" }}>
      <div style={{ fontWeight: 800 }}><i className="fas fa-ban" /> NF-e {p.ncCancelada?.nf ? String(p.ncCancelada.nf).replace(/^0+(?=\d)/, "") : ""} de peças cancelada</div>
      <div style={{ fontSize: 11, marginTop: 2 }}>pedido {p.ncCancelada?.pedido} · falta duplicar o pedido para emitir a nota certa</div>
      {estado.podeCancelarNota && (
        <button type="button" onClick={() => setPedidoAlvo({ id: p.id, num: String(p.ncCancelada?.pedido || ""), nf: p.ncCancelada?.nf || null, etapa: "duplicar" })}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", minHeight: 32, marginTop: 7, borderRadius: 8, border: "none", background: "#0369A1", color: "#fefefe", fontWeight: 800, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
          <i className="fas fa-clone" /> Duplicar o pedido
        </button>
      )}
    </div>
  ));

  // OS refeita, mas a antiga continua ativa no Omie (o título dela segue aberto lá)
  const ultAnt = (estado.anteriores || []).slice(-1)[0];
  const antigaAtiva = ultAnt?.novaOmie && ultAnt.omieCancelada !== true ? ultAnt : null;
  const avisoAntiga = antigaAtiva && (
    <div style={{ border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 12, padding: "10px 11px", margin: "4px 0" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <span style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "#fef3c7", color: "#b45309", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}><i className="fas fa-clock-rotate-left" /></span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, color: "#78350f" }}>Falta cancelar a OS {antigaAtiva.ordemOmie}</div>
          <div style={{ fontSize: 11, color: "#92400e", marginTop: 2, lineHeight: 1.45 }}>A nota já foi cancelada; no Omie a OS e o título ainda estão abertos.</div>
        </div>
      </div>
      {msgAntiga && <div style={{ fontSize: 11, marginTop: 7, padding: "6px 8px", borderRadius: 8, background: msgAntiga.ok ? "#f0fdf4" : "#fef2f2", color: msgAntiga.ok ? "#15803d" : "#b91c1c", fontWeight: 600 }}>{msgAntiga.texto}</div>}
      {estado.podeCancelarNota && (
        <button type="button" onClick={cancelarAntiga} disabled={cancelandoAntiga}
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", height: 34, marginTop: 8, borderRadius: 9, border: "1px solid #f59e0b", background: "#fefefe", color: "#b45309", fontWeight: 800, fontSize: 12.5, cursor: cancelandoAntiga ? "wait" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
          <i className={`fas ${cancelandoAntiga ? "fa-spinner fa-spin" : "fa-ban"}`} /> {cancelandoAntiga ? "Cancelando no Omie…" : "Cancelar no Omie"}
        </button>
      )}
    </div>
  );

  // ---------- nota cancelada: falta duplicar a OS ----------
  if (estado.status === "nfse_cancelada") {
    const ult = (estado.anteriores || []).slice(-1)[0];
    return (
      <div style={{ border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 10, padding: "10px 11px", fontSize: 12, color: "#7f1d1d", margin: "2px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <i className="fas fa-ban" />
          <span style={{ fontWeight: 800, flex: 1 }}>NFS-e {ult?.nfse || nfseAtual || ""} cancelada</span>
        </div>
        <div style={{ marginTop: 3, fontSize: 11, opacity: .9 }}>
          {ult?.canceladaEm ? `em ${new Date(ult.canceladaEm).toLocaleDateString("pt-BR")} · ` : ""}falta duplicar a OS {numOS} para emitir a nota certa
        </div>
        {estado.podeCancelarNota && (
          <button type="button" onClick={() => setCancelarNota("duplicar")}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", minHeight: 36, marginTop: 8, borderRadius: 9, border: "none", background: "#0369A1", color: "#fefefe", fontWeight: 800, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 3px 10px rgba(3,105,161,.3)" }}>
            <i className="fas fa-clone" /> Duplicar a OS
          </button>
        )}
        {modal}
      </div>
    );
  }

  // ---------- já faturada ----------
  if (estado.faturadoEm) {
    const c = COR[rot?.cor || "verde"];
    return (
      <>
      {avisoAntiga}
      {avisoPedidos}
      {modalPedido}
      <div style={{ border: `1px solid ${c.bd}`, background: c.bg, borderRadius: 9, padding: "8px 10px", fontSize: 12, color: c.tx, margin: "2px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <i className="fas fa-circle-check" />
          <span style={{ fontWeight: 800, flex: 1 }}>OS faturada</span>
        </div>
        <div style={{ marginTop: 3, fontSize: 11, opacity: .9 }}>
          {new Date(estado.faturadoEm).toLocaleDateString("pt-BR")}{estado.formaPagamento ? ` · ${estado.formaPagamento}` : ""}
          {estado.faturadoPor ? ` · ${/direto/i.test(estado.faturadoPor) ? "faturada direto no Omie" : estado.faturadoPor}` : ""}
        </div>
        {pecasPendentes.length > 0 && (
          <div style={{ marginTop: 8, padding: "8px 9px", borderRadius: 8, background: COR.ambar.bg, border: `1px solid ${COR.ambar.bd}`, color: COR.ambar.tx }}>
            <div style={{ fontWeight: 800, fontSize: 12 }}><i className="fas fa-hourglass-half" /> Falta o pedido de peças</div>
            <div style={{ fontSize: 10.5, marginTop: 1 }}>A OS vai para Concluída quando ele for faturado.</div>
            {pecasPendentes.map((p) => <div key={p.id} style={{ fontSize: 11, marginTop: 3 }}><b>Pedido {p.pedidoOmie ? p.pedidoOmie.replace(/^0+(?=\d)/, "") : p.id}</b> · {p.erro}</div>)}
            {estado.podeFaturarPecas && estado.podeFaturar && (
              <button type="button" disabled={refaturando} onClick={() => refaturarPecas(pecasPendentes.map((p) => p.id))}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", minHeight: 34, marginTop: 7, borderRadius: 8, border: "none", background: "#0BB7CD", color: "#fefefe", fontWeight: 800, fontSize: 12.5, cursor: refaturando ? "wait" : "pointer", fontFamily: "inherit" }}>
                <i className={`fas ${refaturando ? "fa-spinner fa-spin" : "fa-file-invoice-dollar"}`} /> Faturar o pedido
              </button>
            )}
          </div>
        )}
        {estado.podeCancelarNota && (
          <div style={{ position: "relative", marginTop: 8 }}>
            <button type="button" onClick={() => setMenuNota((m) => !m)}
              style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", minHeight: 30, padding: "0 10px", borderRadius: 8, border: "1px solid color-mix(in srgb, currentColor 25%, transparent)", background: "#fefefe", color: "#334155", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              <i className="fas fa-sliders" style={{ color: "#64748b" }} />
              <span style={{ flex: 1, textAlign: "left" }}>Ações da nota</span>
              <i className="fas fa-chevron-down" style={{ fontSize: 10, color: "#94a3b8", transform: menuNota ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            </button>
            {menuNota && (
              <>
                <div onClick={() => setMenuNota(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 41, background: "#fefefe", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 12px 28px rgba(15,23,42,.18)", overflow: "hidden" }}>
                  <button type="button" onClick={() => { setMenuNota(false); setCancelarNota("cancelar"); }}
                    style={{ display: "flex", alignItems: "flex-start", gap: 9, width: "100%", padding: "10px 12px", border: "none", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                    <i className="fas fa-file-circle-xmark" style={{ color: "#dc2626", marginTop: 2 }} />
                    <span><span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: "#0f172a" }}>Cancelar a NFS-e{nfseAtual ? ` ${nfseAtual}` : ""}</span>
                      <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 1 }}>no sistema nacional · depois duplica a OS</span></span>
                  </button>
                  {(estado.pedidos || []).filter((p) => p.faturado && !p.ncCancelada).map((p) => {
                    const num = p.pedidoOmie.replace(/^0+(?=\d)/, "");
                    const nf = p.nf ? String(p.nf).replace(/^0+(?=\d)/, "") : null;
                    return (
                      <button key={p.id} type="button" onClick={() => { setMenuNota(false); setPedidoAlvo({ id: p.id, num, nf, etapa: "cancelar" }); }}
                        style={{ display: "flex", alignItems: "flex-start", gap: 9, width: "100%", padding: "10px 12px", border: "none", borderTop: "1px solid #f1f5f9", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                        <i className="fas fa-boxes-stacked" style={{ color: "#e8730c", marginTop: 2 }} />
                        <span><span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: "#0f172a" }}>Cancelar a NF-e{nf ? ` ${nf}` : ""} de peças</span>
                          <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 1 }}>pedido {num} · pelo Omie · depois duplica o pedido</span></span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
        {modal}
      </div>
      </>
    );
  }

  // ---------- faturamento sem resposta clara ----------
  if (estado.status === "desconhecido" || estado.status === "faturando") {
    return (
      <div style={{ border: `1px solid ${COR.ambar.bd}`, background: COR.ambar.bg, color: COR.ambar.tx, borderRadius: 6, padding: "9px 11px", fontSize: 12.5, margin: "4px 0" }}>
        <div style={{ fontWeight: 800 }}><i className="fas fa-hourglass-half" /> {rot?.texto}</div>
        {estado.erro && <div style={{ marginTop: 2 }}>{estado.erro}</div>}
        <button className="os-rail-btn" style={{ marginTop: 6 }} onClick={conferir} disabled={conferindo}>
          <i className={`fas ${conferindo ? "fa-spinner fa-spin" : "fa-rotate"}`} /> Conferir no Omie
        </button>
      </div>
    );
  }

  // ---------- bloqueada (interna, garantia, cancelada…) ----------
  if (estado.bloqueio) {
    return (
      <div title={estado.bloqueio} style={{ border: `1px solid ${COR.cinza.bd}`, background: COR.cinza.bg, color: COR.cinza.tx, borderRadius: 6, padding: "7px 10px", fontSize: 12, margin: "4px 0" }}>
        <i className="fas fa-file-invoice-dollar" /> {estado.bloqueio}
      </div>
    );
  }

  // ---------- pode faturar ----------
  return (
    <>
      {avisoAntiga}
      {avisoPedidos}
      {modalPedido}
      {pedidosJaFaturados.length > 0 && (
        <div style={{ border: `1px solid ${COR.verde.bd}`, background: COR.verde.bg, color: COR.verde.tx, borderRadius: 6, padding: "7px 10px", fontSize: 12, margin: "4px 0" }}>
          <i className="fas fa-check" /> Pedido de peças {pedidosJaFaturados.map((p) => `PV ${p.pedidoOmie.replace(/^0+/, "")}`).join(", ")} já faturado — falta a OS.
        </div>
      )}
      {estado.status === "erro" && estado.erro && (
        <div style={{ border: `1px solid ${COR.vermelho.bd}`, background: COR.vermelho.bg, color: COR.vermelho.tx, borderRadius: 6, padding: "7px 10px", fontSize: 12, margin: "4px 0" }}>
          Último faturamento não saiu: {estado.erro}
        </div>
      )}
      <button
        type="button"
        onClick={() => setAberto(true)}
        disabled={!estado.podeFaturar}
        title={estado.podeFaturar ? `Faturar a OS ${ordemOmie.replace(/^0+/, "")} no Omie (emite a NFS-e). A janela mostra o pedido de peças vinculado para faturar junto.` : "Você não tem a permissão \"Faturar OS\". Peça ao administrador."}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 42, padding: "8px 12px", borderRadius: 10, border: "none",
          background: estado.podeFaturar ? "#0BB7CD" : "#94A3B8", color: "#fefefe", fontWeight: 800, fontSize: 14, cursor: estado.podeFaturar ? "pointer" : "not-allowed", fontFamily: "inherit",
          boxShadow: estado.podeFaturar ? "0 3px 10px rgba(11,183,205,.35)" : "none" }}
      >
        <i className="fas fa-file-invoice-dollar" /> Faturar
      </button>
      <div style={{ fontSize: 11, color: "var(--portal-text-muted, #64748b)", textAlign: "center", marginTop: -2 }}>
        {pedidosFaltando.length ? "a OS, o pedido de peças ou os dois" : "emite a NFS-e da OS"}
      </div>
      {aberto && <FaturarOSModal
        open
        osId={osId}
        onClose={() => { setAberto(false); void carregar(); }}
        onFaturado={() => { void carregar(); onFaturado(); }}
      />}
    </>
  );
}
