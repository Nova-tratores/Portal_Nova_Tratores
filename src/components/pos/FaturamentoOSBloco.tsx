"use client";
// Faturamento da OS na coluna lateral do drawer: o "Enviar para Omie" vira
// "Faturar (NFS-e)" e depois o selo "Faturada · NFS-e nº X" — como no PPV.
// Busca a própria situação (GET /api/pos/ordens/[id]/faturar); ao abrir confere
// no Omie (o servidor limita a 1x a cada 2 min por OS). Nada aparece com o
// interruptor POS_FATURAR desligado.
import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { rotuloStatus } from "@/lib/pos/faturamento-regras";
import FaturarOSModal from "./FaturarOSModal";

interface Estado {
  habilitado: boolean; podeFaturar: boolean; podeFaturarPecas: boolean; enviadaOmie: boolean;
  bloqueio: string | null; status: string | null; erro: string | null;
  faturadoEm: string | null; faturadoPor: string | null; formaPagamento: string | null;
  nfseNumero: string | null; nfseLink: string | null;
  pecas: Array<{ id: string; pedidoOmie?: string; ok: boolean; erro?: string | null; nf?: string | null }>;
  pedidos?: Array<{ id: string; pedidoOmie: string; faturado: boolean }>;
}

const COR = {
  verde: { bg: "#f0fdf4", bd: "#bbf7d0", tx: "#15803d" },
  cinza: { bg: "#f8fafc", bd: "#e2e8f0", tx: "#475569" },
  ambar: { bg: "#fffbeb", bd: "#fcd34d", tx: "#b45309" },
  vermelho: { bg: "#fef2f2", bd: "#fecaca", tx: "#b91c1c" },
};

export default function FaturamentoOSBloco({ osId, ordemOmie, onFaturado }: {
  osId: string;
  ordemOmie: string;
  onFaturado: () => void;
}) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [aberto, setAberto] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [refaturando, setRefaturando] = useState(false);

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
      .then((j) => { if (!cancel) setEstado(j); })
      .catch(() => { /* sem bloco */ });
    return () => { cancel = true; };
  }, [osId, ordemOmie]);

  const aguardandoNota = !!estado?.faturadoEm && estado.status === "nfse_aguardando";
  useEffect(() => {
    if (!aguardandoNota) return;
    const inicio = Date.now();
    const t = setInterval(() => {
      if (Date.now() - inicio > 20 * 60_000) { clearInterval(t); return; }
      void carregar({ reconciliar: true, forcar: true });
    }, 30_000);
    return () => clearInterval(t);
  }, [aguardandoNota, carregar]);

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
  const barra = (
    <div style={{ height: 6, borderRadius: 3, background: "rgba(11,183,205,.18)", overflow: "hidden", marginTop: 8 }}>
      <div className="fat-barra" style={{ height: "100%", width: "40%", borderRadius: 3, background: "#0BB7CD" }} />
      <style>{`@keyframes fatBarra { 0% { transform: translateX(-100%) } 100% { transform: translateX(250%) } } .fat-barra { animation: fatBarra 1.4s ease-in-out infinite; }`}</style>
    </div>
  );

  // ---------- já faturada ----------
  if (estado.faturadoEm) {
    const c = COR[rot?.cor || "verde"];
    return (
      <div style={{ border: `1px solid ${c.bd}`, background: c.bg, borderRadius: 6, padding: "9px 11px", fontSize: 12.5, color: c.tx, margin: "4px 0" }}>
        <div style={{ fontWeight: 800 }}>
          <i className="fas fa-file-invoice-dollar" /> Faturada{estado.nfseNumero ? ` · NFS-e nº ${estado.nfseNumero}` : ""}
        </div>
        <div style={{ marginTop: 2 }}>
          {new Date(estado.faturadoEm).toLocaleDateString("pt-BR")}{estado.formaPagamento ? ` · ${estado.formaPagamento}` : ""}{estado.faturadoPor ? ` · ${estado.faturadoPor}` : ""}
        </div>
        {estado.status === "nfse_aguardando" ? (
          <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 6, background: "#fefefe", border: "1px solid #bae6fd", color: "#075985" }}>
            <div style={{ fontWeight: 800 }}><i className="fas fa-satellite-dish" /> Aguardando a nota do sistema nacional</div>
            <div style={{ fontSize: 11.5, marginTop: 2 }}>O portal está buscando a NFS-e. Você recebe uma notificação quando ela sair (ou se for rejeitada).</div>
            {barra}
          </div>
        ) : rot && estado.status !== "nfse_autorizada" && <div style={{ marginTop: 4, fontWeight: 700 }}>{rot.texto}</div>}
        {estado.erro && estado.status === "nfse_rejeitada" && <div style={{ marginTop: 2 }}>{estado.erro} — corrija e reenvie a nota pelo Omie.</div>}
        {estado.nfseLink && (
          <a href={estado.nfseLink} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, color: c.tx, fontWeight: 700 }}>
            <i className="fas fa-file-pdf" /> PDF da NFS-e
          </a>
        )}
        {estado.status === "nfse_aguardando" && (
          <button type="button" style={{ marginTop: 6, background: "none", border: "none", padding: 0, color: c.tx, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }} onClick={conferir} disabled={conferindo}>
            <i className={`fas ${conferindo ? "fa-spinner fa-spin" : "fa-rotate"}`} /> Conferir agora
          </button>
        )}
        {pecasPendentes.length > 0 && (
          <div style={{ marginTop: 8, padding: "7px 9px", borderRadius: 4, background: COR.ambar.bg, border: `1px solid ${COR.ambar.bd}`, color: COR.ambar.tx }}>
            <div style={{ fontWeight: 800 }}>Falta faturar o pedido de peças</div>
            <div style={{ fontSize: 11.5 }}>A OS vai para Concluída quando ele for faturado.</div>
            {pecasPendentes.map((p) => <div key={p.id}>{p.pedidoOmie ? `PV ${p.pedidoOmie.replace(/^0+/, "")}` : p.id}: {p.erro}</div>)}
            {estado.podeFaturarPecas && estado.podeFaturar && (
              <button className="os-rail-btn" style={{ marginTop: 6 }} disabled={refaturando} onClick={() => refaturarPecas(pecasPendentes.map((p) => p.id))}>
                <i className={`fas ${refaturando ? "fa-spinner fa-spin" : "fa-boxes"}`} /> Faturar o pedido
              </button>
            )}
          </div>
        )}
      </div>
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
