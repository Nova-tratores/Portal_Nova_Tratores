"use client";
// Bloco "Notas fiscais" da coluna da OS: a NFS-e da OS e a NF-e de cada pedido
// de peças (PPV) — número, situação e PDF/DANFE. Enquanto a NFS-e não volta do
// sistema nacional, mostra a barrinha e confere sozinho a cada 30 s.
// Dados: GET /api/pos/ordens/[id]/faturar (NFS-e) e /api/ppv/nf-sefaz (NF-e).
import { useCallback, useEffect, useMemo, useState } from "react";
import { authHeaders } from "@/lib/auth/client";

interface EstadoNfse {
  habilitado: boolean; faturadoEm: string | null; status: string | null; erro: string | null;
  nfseNumero: string | null; nfseLink: string | null;
}
interface NfPedido { faturado: boolean; numero?: string; emitidaEm?: string; canceladaEm?: string; erro?: string }

const semZeros = (n: string | null | undefined) => String(n || "").replace(/^0+(?=\d)/, "");

export default function NotasFiscaisBloco({ osId, ppvIds, ppvOmieMap }: {
  osId: string;
  ppvIds: string[];
  ppvOmieMap: Record<string, string>;
}) {
  const [nfse, setNfse] = useState<EstadoNfse | null>(null);
  const [nfs, setNfs] = useState<Record<string, NfPedido>>({});
  const [abrindo, setAbrindo] = useState<string | null>(null);

  const carregarNfse = useCallback(async (conferir = false) => {
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/faturar${conferir ? "?reconciliar=1&forcar=1" : ""}`, { headers: await authHeaders() });
      if (r.ok) setNfse(await r.json());
    } catch { /* sem bloco */ }
  }, [osId]);

  // pedidos que já estão no Omie (só esses podem ter NF-e)
  const chavePedidos = useMemo(() => ppvIds.filter((pid) => ppvOmieMap[pid]).join(","), [ppvIds, ppvOmieMap]);
  const pedidos = chavePedidos ? chavePedidos.split(",") : [];
  const carregarNfs = useCallback(async (refresh = false) => {
    const ids = chavePedidos ? chavePedidos.split(",") : [];
    if (!ids.length) return;
    const h = await authHeaders();
    const pares = await Promise.all(ids.map(async (pid) => {
      try {
        const r = await fetch(`/api/ppv/nf-sefaz?id=${encodeURIComponent(pid)}${refresh ? "&refresh=1" : ""}`, { headers: h });
        return [pid, r.ok ? await r.json() : { faturado: false }] as const;
      } catch { return [pid, { faturado: false }] as const; }
    }));
    setNfs(Object.fromEntries(pares));
  }, [chavePedidos]);

  useEffect(() => {
    let vivo = true;
    Promise.resolve().then(() => { if (vivo) { void carregarNfse(); void carregarNfs(); } });
    return () => { vivo = false; };
  }, [carregarNfse, carregarNfs]);

  // nota ainda vindo: confere a cada 30 s (até 20 min com a OS aberta)
  const aguardandoNfse = !!nfse?.faturadoEm && nfse.status === "nfse_aguardando";
  useEffect(() => {
    if (!aguardandoNfse) return;
    const inicio = Date.now();
    const t = setInterval(() => {
      if (Date.now() - inicio > 20 * 60_000) { clearInterval(t); return; }
      void carregarNfse(true);
    }, 30_000);
    return () => clearInterval(t);
  }, [aguardandoNfse, carregarNfse]);

  const abrirDanfe = async (pid: string) => {
    setAbrindo(pid);
    const w = window.open("", "_blank");
    try {
      const r = await fetch(`/api/ppv/nf-sefaz?id=${encodeURIComponent(pid)}&danfe=1`, { headers: await authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.url) { w?.close(); alert(j.error || "Não consegui obter o PDF da nota no Omie."); }
      else if (w) w.location.href = j.url; else window.open(j.url, "_blank");
    } catch { w?.close(); alert("Erro de conexão ao buscar a nota."); }
    setAbrindo(null);
  };

  const temOS = !!nfse?.faturadoEm;
  if (!temOS && !pedidos.length) return null;

  const chip = (txt: string, cor: string, bg: string) => (
    <span style={{ fontSize: 10.5, fontWeight: 800, padding: "1px 7px", borderRadius: 999, color: cor, background: bg, whiteSpace: "nowrap" }}>{txt}</span>
  );
  const linkPdf = (rotulo: string, onClick: () => void, carregando = false) => (
    <button type="button" onClick={onClick} disabled={carregando} title={rotulo}
      style={{ background: "none", border: "none", padding: 0, color: "#0891A8", fontSize: 11.5, fontWeight: 800, cursor: carregando ? "wait" : "pointer", fontFamily: "inherit", flexShrink: 0 }}>
      {carregando ? <i className="fas fa-spinner fa-spin" /> : "PDF"}
    </button>
  );
  const linha = (chave: string, titulo: string, sub: React.ReactNode, direita: React.ReactNode, primeira: boolean) => (
    <div key={chave} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 2px", borderTop: primeira ? "none" : "1px solid var(--border)" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{titulo}</div>
        <div style={{ fontSize: 10.5, color: "var(--portal-text-muted)", marginTop: 1, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>{sub}</div>
      </div>
      {direita}
    </div>
  );

  const st = nfse?.status;

  return (
    <div style={{ margin: "4px 0 8px", padding: 10, borderRadius: 12, border: "1px solid color-mix(in srgb, #16a34a 35%, var(--border))", background: "color-mix(in srgb, #16a34a 5%, var(--surface))", display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marcas/nfse.png" alt="NFS-e" style={{ height: 17, width: "auto", display: "block" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--portal-text-muted)" }}>notas fiscais</span>
      </div>
      <div style={{ padding: "2px 10px", borderRadius: 9, background: "var(--surface)", border: "1px solid var(--border)" }}>
        {temOS && linha("nfse",
          st === "nfse_aguardando" ? "NFS-e" : `NFS-e ${semZeros(nfse?.nfseNumero) || ""}`.trim(),
          st === "nfse_aguardando" ? <>serviço · {chip("aguardando o sistema nacional", "#075985", "#e0f2fe")}</>
            : st === "nfse_rejeitada" ? <>serviço · {chip("rejeitada", "#b91c1c", "#fee2e2")}</>
            : <>serviço · {chip("autorizada", "#047857", "#d1fae5")}</>,
          nfse?.nfseLink ? <a href={nfse.nfseLink} target="_blank" rel="noreferrer" style={{ color: "#0891A8", fontSize: 11.5, fontWeight: 800, textDecoration: "none" }}>PDF</a> : null,
          true)}
        {temOS && st === "nfse_aguardando" && (
          <div style={{ padding: "0 2px 8px" }}>
            <div style={{ height: 5, borderRadius: 3, background: "rgba(11,183,205,.18)", overflow: "hidden" }}>
              <div className="nf-barra" style={{ height: "100%", width: "40%", borderRadius: 3, background: "#0BB7CD" }} />
            </div>
            <div style={{ fontSize: 10.5, color: "var(--portal-text-muted)", marginTop: 4 }}>Buscando a nota… você recebe uma notificação quando sair.</div>
            <style>{`@keyframes nfBarra { 0% { transform: translateX(-100%) } 100% { transform: translateX(250%) } } .nf-barra { animation: nfBarra 1.4s ease-in-out infinite; }`}</style>
          </div>
        )}
        {temOS && st === "nfse_rejeitada" && nfse?.erro && <div style={{ fontSize: 10.5, color: "#b91c1c", padding: "0 2px 8px" }}>{nfse.erro} — corrija e reenvie pelo Omie.</div>}
        {pedidos.map((pid, i) => {
          const nf = nfs[pid];
          const ok = !!nf?.faturado && !nf.canceladaEm;
          return linha(pid,
            ok && nf?.numero ? `NF-e ${semZeros(nf.numero)}` : "NF-e",
            <>peças · pedido {semZeros(ppvOmieMap[pid])} · {nf === undefined ? "conferindo…" : ok ? (nf.emitidaEm ? `emitida ${String(nf.emitidaEm).slice(0, 10)}` : chip("emitida", "#047857", "#d1fae5")) : nf?.canceladaEm ? chip("cancelada", "#b91c1c", "#fee2e2") : chip("não faturada", "#b45309", "#fef3c7")}</>,
            ok ? linkPdf(`Imprimir a NF-e do pedido ${semZeros(ppvOmieMap[pid])}`, () => abrirDanfe(pid), abrindo === pid) : null,
            !temOS && i === 0);
        })}
      </div>
    </div>
  );
}
