"use client";
// Faturamento da OS na coluna lateral do drawer: o "Enviar para Omie" vira
// "Faturar (NFS-e)" e depois o selo "Faturada · NFS-e nº X" — como no PPV.
// Busca a própria situação (GET /api/pos/ordens/[id]/faturar); ao abrir confere
// no Omie (o servidor limita a 1x a cada 2 min por OS). Nada aparece com o
// interruptor POS_FATURAR desligado.
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import CancelarNotaModal from "./CancelarNotaModal";
import { authHeaders } from "@/lib/auth/client";
import { rotuloStatus } from "@/lib/pos/faturamento-regras";
import FaturarOSModal from "./FaturarOSModal";
import FaturarReciboModal from "./FaturarReciboModal";
import TravasFaturar, { type AjusteOS } from "./TravasFaturar";
import CancelarDocOmieModal from "./CancelarDocOmieModal";

interface Estado {
  habilitado: boolean; podeFaturar: boolean; podeFaturarPecas: boolean; enviadaOmie: boolean; podeCancelarNota?: boolean; valor?: number;
  anteriores?: Array<{ nfse: string | null; ordemOmie: string; canceladaEm: string; motivo: string; novaOmie?: string | null; omieCancelada?: boolean }>;
  bloqueio: string | null; status: string | null; erro: string | null;
  faturadoEm: string | null; faturadoPor: string | null; formaPagamento: string | null;
  nfseNumero: string | null; nfseLink: string | null;
  /** OS interna: fatura com recibo (sem NFS-e) */
  interna?: boolean; reciboNumero?: string | null;
  pecas: Array<{ id: string; pedidoOmie?: string; ok: boolean; erro?: string | null; nf?: string | null }>;
  pedidos?: Array<{ id: string; pedidoOmie: string; faturado: boolean; nf?: string | null; ncCancelada?: { nf: string | null; pedido: string; motivo: string } | null }>;
}

const COR = {
  verde: { bg: "#f0fdf4", bd: "#bbf7d0", tx: "#15803d" },
  cinza: { bg: "#f8fafc", bd: "#e2e8f0", tx: "#475569" },
  ambar: { bg: "#fffbeb", bd: "#fcd34d", tx: "#b45309" },
  vermelho: { bg: "#fef2f2", bd: "#fecaca", tx: "#b91c1c" },
};

export default function FaturamentoOSBloco({ osId, ordemOmie, onFaturado, onAtualizar, abrirAoCarregar = false, ajustarOS, documento }: {
  osId: string;
  /** travas antes de faturar: grava previsão/projeto pela tela da OS (sem a tela sobrescrever depois) */
  ajustarOS?: (c: AjusteOS) => Promise<boolean>;
  /** CPF/CNPJ do cliente (sugestões de máquina) */
  documento?: string;
  ordemOmie: string;
  /** botão Faturar da capa do card: abre a janela sozinho (uma vez) quando der para faturar */
  abrirAoCarregar?: boolean;
  onFaturado: () => void;
  /** algo mudou sem faturar (cancelou nota, duplicou a OS): recarrega o drawer */
  onAtualizar?: () => void;
}) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [aberto, setAberto] = useState(false);
  // travas (previsão hoje, projeto, localização) conferidas depois do clique em Faturar
  const [travasOk, setTravasOk] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [refaturando, setRefaturando] = useState(false);
  const [cancelarNota, setCancelarNota] = useState<null | "cancelar" | "duplicar">(null);
  // menu "⋯" abre por cima da tela (a coluna corta o que sai dela)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const menuNota = !!menuPos;
  const setMenuNota = (v: boolean | ((m: boolean) => boolean)) => { if (!(typeof v === "function" ? v(menuNota) : v)) setMenuPos(null); };
  const abrirMenu = (el: HTMLElement) => {
    if (menuPos) { setMenuPos(null); return; }
    const r = el.getBoundingClientRect();
    setMenuPos({ top: r.bottom + 6, left: Math.max(8, Math.min(window.innerWidth - 268, r.right - 260)) });
  };
  // nota de peças: qual pedido e em qual passo
  // cancelar no Omie o que ainda não foi faturado (pedido de venda ou a OS)
  const [cancelarDoc, setCancelarDoc] = useState<null | { tipo: "pedido"; ppvId: string; numero: string } | { tipo: "os"; osId: string; numero: string; pedidos: string[] }>(null);
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
    ? [...estado.pecas.filter((p) => !p.ok && !(estado.pedidos || []).some((x) => x.id === p.id && x.faturado)), ...pedidosFaltando.filter((p) => !estado.pecas.some((x) => x.id === p.id)).map((p) => ({ id: p.id, pedidoOmie: p.pedidoOmie, ok: false, erro: "ainda não faturado" }))]
    : [];
  const pedidosJaFaturados = (estado.pedidos || []).filter((p) => p.faturado);

  const numOS = ordemOmie.replace(/^0+(?=\d)/, "");
  const modalCancelarDoc = cancelarDoc && <CancelarDocOmieModal alvo={cancelarDoc}
    onClose={() => { setCancelarDoc(null); void carregar({ reconciliar: true, forcar: true }); }}
    onFeito={() => { (onAtualizar || onFaturado)(); }} />;
  const nfseAtual = estado.nfseNumero ? String(estado.nfseNumero).replace(/^0+(?=\d)/, "") : null;
  const modal = cancelarNota && <CancelarNotaModal osId={osId} numeroOS={numOS} nfse={nfseAtual} valor={estado.valor} etapaInicial={cancelarNota}
    onFechar={() => { setCancelarNota(null); void carregar(); }} onFeito={() => { void carregar(); (onAtualizar || onFaturado)(); }} />;
  const modalPedido = pedidoAlvo && <CancelarNotaModal tipo="pedido" osId={osId} ppvId={pedidoAlvo.id} numeroOS={pedidoAlvo.num} nfse={pedidoAlvo.nf} etapaInicial={pedidoAlvo.etapa}
    onFechar={() => { setPedidoAlvo(null); void carregar(); }} onFeito={() => { void carregar(); (onAtualizar || onFaturado)(); }} />;
  // NF-e de peças cancelada, falta duplicar o pedido
  const pedidosPendentes = (estado.pedidos || []).filter((p) => p.ncCancelada);
  const faixa = (cor: "ambar" | "verm", texto: React.ReactNode, acao: React.ReactNode, chave: string) => (
    <div key={chave} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 9px", borderRadius: 9, fontSize: 11.5, lineHeight: 1.35,
      background: cor === "ambar" ? "#fffbeb" : "#fef2f2", borderLeft: `3px solid ${cor === "ambar" ? "#f59e0b" : "#ef4444"}`, color: cor === "ambar" ? "#78350f" : "#7f1d1d" }}>
      <span style={{ flex: 1, minWidth: 0 }}>{texto}</span>
      {acao}
    </div>
  );
  const linkAcao = (rotulo: string, onClick: () => void, carregando = false, cor = "#0369A1") => (
    <button type="button" onClick={onClick} disabled={carregando}
      style={{ flexShrink: 0, border: "none", background: "transparent", color: cor, fontWeight: 800, fontSize: 11.5, cursor: carregando ? "wait" : "pointer", fontFamily: "inherit", padding: 0, whiteSpace: "nowrap" }}>
      {carregando ? <i className="fas fa-spinner fa-spin" /> : rotulo}
    </button>
  );
  const avisoPedidos = pedidosPendentes.map((p) => faixa("verm",
    <><b>NF-e {p.ncCancelada?.nf ? String(p.ncCancelada.nf).replace(/^0+(?=\d)/, "") : ""} cancelada</b> · falta duplicar o pedido {p.ncCancelada?.pedido}</>,
    estado.podeCancelarNota ? linkAcao("Duplicar", () => setPedidoAlvo({ id: p.id, num: String(p.ncCancelada?.pedido || ""), nf: p.ncCancelada?.nf || null, etapa: "duplicar" })) : null,
    `nc-${p.id}`));

  // OS refeita, mas a antiga continua ativa no Omie (o título dela segue aberto lá)
  const ultAnt = (estado.anteriores || []).slice(-1)[0];
  const antigaAtiva = ultAnt?.novaOmie && ultAnt.omieCancelada !== true ? ultAnt : null;
  const avisoAntiga = antigaAtiva && (
    <>
      {faixa("ambar", <><b>OS {antigaAtiva.ordemOmie}</b> ainda aberta no Omie (nota já cancelada)</>,
        estado.podeCancelarNota ? linkAcao("Cancelar", cancelarAntiga, cancelandoAntiga, "#b45309") : null, "antiga")}
      {msgAntiga && <div style={{ fontSize: 11, padding: "2px 4px", color: msgAntiga.ok ? "#15803d" : "#b91c1c", fontWeight: 600 }}>{msgAntiga.texto}</div>}
    </>
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
      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "2px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 10, background: "var(--surface, #fefefe)", border: "1px solid var(--border, #e2e8f0)" }}
          title={estado.faturadoPor ? `faturada por ${/direto/i.test(estado.faturadoPor) ? "direto no Omie" : estado.faturadoPor}` : undefined}>
          <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, background: c.bg, color: c.tx, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}><i className="fas fa-check" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: c.tx }}>Faturada</div>
            <div style={{ fontSize: 11, color: "var(--portal-text-muted, #64748b)", lineHeight: 1.35 }}>
              {new Date(estado.faturadoEm).toLocaleDateString("pt-BR")}{estado.status === "recibo_emitido" ? ` · recibo${estado.reciboNumero ? ` nº ${estado.reciboNumero}` : ""}` : estado.formaPagamento ? ` · ${estado.formaPagamento}` : ""}
            </div>
          </div>
          {estado.podeCancelarNota && estado.status !== "recibo_emitido" && (
            <div style={{ position: "relative" }}>
              <button type="button" onClick={(e) => abrirMenu(e.currentTarget)} title="Ações da nota (corrigir NFS-e / NF-e)"
                style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--border, #e2e8f0)", background: menuNota ? "#f1f5f9" : "transparent", color: "#475569", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className="fas fa-ellipsis-vertical" />
              </button>
              {menuNota && menuPos && typeof document !== "undefined" && createPortal(
                <>
                  <div onClick={() => setMenuNota(false)} style={{ position: "fixed", inset: 0, zIndex: 100040 }} />
                  <div style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 100041, width: 260, background: "#fefefe", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 14px 32px rgba(15,23,42,.22)", overflow: "hidden", color: "#0f172a" }}>
                    <div style={{ padding: "8px 12px 6px", fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: .5, color: "#94a3b8" }}>Corrigir nota</div>
                    <button type="button" onClick={() => { setMenuNota(false); setCancelarNota("cancelar"); }}
                      style={{ display: "flex", alignItems: "flex-start", gap: 9, width: "100%", padding: "9px 12px", border: "none", borderTop: "1px solid #f1f5f9", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                      <i className="fas fa-file-invoice" style={{ color: "#0369A1", marginTop: 2, width: 14 }} />
                      <span><span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#0f172a" }}>NFS-e{nfseAtual ? ` ${nfseAtual}` : ""} · serviço</span>
                        <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 1 }}>cancelar e duplicar a OS</span></span>
                    </button>
                    {(estado.pedidos || []).filter((p) => p.faturado && !p.ncCancelada).map((p) => {
                      const num = p.pedidoOmie.replace(/^0+(?=\d)/, "");
                      const nf = p.nf ? String(p.nf).replace(/^0+(?=\d)/, "") : null;
                      return (
                        <button key={p.id} type="button" onClick={() => { setMenuNota(false); setPedidoAlvo({ id: p.id, num, nf, etapa: "cancelar" }); }}
                          style={{ display: "flex", alignItems: "flex-start", gap: 9, width: "100%", padding: "9px 12px", border: "none", borderTop: "1px solid #f1f5f9", background: "transparent", cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                          <i className="fas fa-file-invoice-dollar" style={{ color: "#e8730c", marginTop: 2, width: 14 }} />
                          <span><span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: "#0f172a" }}>NF-e{nf ? ` ${nf}` : ""} · peças</span>
                            <span style={{ display: "block", fontSize: 11, color: "#64748b", marginTop: 1 }}>pedido {num} · cancelar e duplicar</span></span>
                        </button>
                      );
                    })}
                  </div>
                </>, document.body)}
            </div>
          )}
        </div>
        {pecasPendentes.length > 0 && (
          <div style={{ marginTop: 8, padding: "8px 9px", borderRadius: 8, background: COR.ambar.bg, border: `1px solid ${COR.ambar.bd}`, color: COR.ambar.tx }}>
            <div style={{ fontWeight: 800, fontSize: 12 }}><i className="fas fa-hourglass-half" /> Falta o pedido de peças</div>
            <div style={{ fontSize: 10.5, marginTop: 1 }}>A OS vai para Concluída quando ele for faturado.</div>
            {pecasPendentes.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginTop: 3 }}>
                <span style={{ flex: 1, minWidth: 0 }}><b>Pedido {p.pedidoOmie ? p.pedidoOmie.replace(/^0+(?=\d)/, "") : p.id}</b> · {p.erro}</span>
                {estado.podeFaturarPecas && (
                  <button type="button" onClick={() => setCancelarDoc({ tipo: "pedido", ppvId: p.id, numero: p.pedidoOmie ? p.pedidoOmie.replace(/^0+(?=\d)/, "") : p.id })}
                    title="Cancelar este pedido de venda no Omie (ainda não faturado)"
                    className="cancelar-discreto"
                    style={{ flexShrink: 0, border: "none", background: "none", padding: 0, color: "#a16207", fontSize: 10.5, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2 }}>
                    cancelar
                    <style>{`.cancelar-discreto:hover { color: #b91c1c !important; }`}</style>
                  </button>
                )}
              </div>
            ))}
            {estado.podeFaturarPecas && estado.podeFaturar && (
              <button type="button" disabled={refaturando} onClick={() => refaturarPecas(pecasPendentes.map((p) => p.id))}
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, width: "100%", minHeight: 34, marginTop: 7, borderRadius: 8, border: "none", background: "#0BB7CD", color: "#fefefe", fontWeight: 800, fontSize: 12.5, cursor: refaturando ? "wait" : "pointer", fontFamily: "inherit" }}>
                <i className={`fas ${refaturando ? "fa-spinner fa-spin" : "fa-file-invoice-dollar"}`} /> Faturar o pedido
              </button>
            )}
          </div>
        )}
        {modal}
        {modalCancelarDoc}
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
        title={!estado.podeFaturar ? "Você não tem a permissão \"Faturar OS\". Peça ao administrador." : estado.interna ? `OS interna: fatura no Omie com RECIBO (sem NFS-e e sem conta a receber).` : `Faturar a OS ${ordemOmie.replace(/^0+/, "")} no Omie (emite a NFS-e). A janela mostra o pedido de peças vinculado para faturar junto.`}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", minHeight: 42, padding: "8px 12px", borderRadius: 10, border: "none",
          background: !estado.podeFaturar ? "#94A3B8" : estado.interna ? "#6d28d9" : "#0BB7CD", color: "#fefefe", fontWeight: 800, fontSize: 14, cursor: estado.podeFaturar ? "pointer" : "not-allowed", fontFamily: "inherit",
          boxShadow: !estado.podeFaturar ? "none" : estado.interna ? "0 3px 10px rgba(109,40,217,.3)" : "0 3px 10px rgba(11,183,205,.35)" }}
      >
        <i className={`fas ${estado.interna ? "fa-receipt" : "fa-file-invoice-dollar"}`} /> {estado.interna ? "Faturar com recibo" : "Faturar"}
      </button>
      <div style={{ fontSize: 11, color: "var(--portal-text-muted, #64748b)", textAlign: "center", marginTop: -2 }}>
        {estado.interna ? "OS interna · sem NFS-e e sem conta a receber" : pedidosFaltando.length ? "a OS, o pedido de peças ou os dois" : "emite a NFS-e da OS"}
      </div>
      {/* cancelar no Omie (ainda não faturado) — discreto: só texto, acende no mouse */}
      {(estado.podeFaturar || estado.podeFaturarPecas) && (() => {
        const pend = (estado.pedidos || []).filter((p) => !p.faturado && !p.ncCancelada);
        const pv = (p: { id: string; pedidoOmie: string }) => p.pedidoOmie ? p.pedidoOmie.replace(/^0+(?=\d)/, "") : p.id;
        const lnk = (rot: string, titulo: string, acao: () => void) => (
          <button key={rot} type="button" onClick={acao} title={titulo} className="cancelar-discreto"
            style={{ border: "none", background: "none", padding: 0, fontSize: 11, color: "var(--portal-text-muted, #94a3b8)", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: 2 }}>
            {rot}
          </button>
        );
        return (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "2px 8px", marginTop: 4, fontSize: 11, color: "var(--portal-text-muted, #94a3b8)" }}>
            <span>cancelar:</span>
            {estado.podeFaturar && lnk(`OS ${numOS}`, "Cancelar a OS no Omie e no portal (ainda não faturada)",
              () => setCancelarDoc({ tipo: "os", osId, numero: numOS, pedidos: pend.map((p) => `PV ${pv(p)}`) }))}
            {estado.podeFaturarPecas && pend.map((p) => lnk(`PV ${pv(p)}`, `Cancelar o pedido de venda ${pv(p)} no Omie (ainda não faturado)`,
              () => setCancelarDoc({ tipo: "pedido", ppvId: p.id, numero: pv(p) })))}
            <style>{`.cancelar-discreto:hover { color: #b91c1c !important; }`}</style>
          </div>
        );
      })()}
      {modalCancelarDoc}
      {aberto && !travasOk && <TravasFaturar osId={osId} documento={documento} ajustarOS={ajustarOS}
        onOk={() => setTravasOk(true)} onCancelar={() => { setAberto(false); void carregar(); }} />}
      {aberto && travasOk && estado.interna && <FaturarReciboModal
        osId={osId}
        onClose={() => { setAberto(false); setTravasOk(false); void carregar(); }}
        onFaturado={() => { void carregar(); onFaturado(); }}
      />}
      {aberto && travasOk && !estado.interna && <FaturarOSModal
        open
        osId={osId}
        onClose={() => { setAberto(false); setTravasOk(false); void carregar(); }}
        onFaturado={() => { void carregar(); onFaturado(); }}
      />}
    </>
  );
}
