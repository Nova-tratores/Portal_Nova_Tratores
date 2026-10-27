"use client";
// Bloco "Notas fiscais" da coluna da OS: a NFS-e da OS e a NF-e de cada pedido
// de peças (PPV) — número, situação e PDF/DANFE. Enquanto a NFS-e não volta do
// sistema nacional, mostra a barrinha e confere sozinho a cada 30 s.
// Dados: GET /api/pos/ordens/[id]/faturar (NFS-e) e /api/ppv/nf-sefaz (NF-e).
import FaturarRemessaBotao from "@/components/ppv/FaturarRemessaBotao";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "@/lib/auth/client";
import NfseRejeitada from "./NfseRejeitada";
import type { DocAnterior } from "@/lib/pos/omie-anteriores";

interface EstadoNfse {
  habilitado: boolean; faturadoEm: string | null; status: string | null; erro: string | null;
  nfseNumero: string | null; nfseLink: string | null;
  /** OS interna faturada com recibo (sem NFS-e) */
  reciboNumero?: string | null;
  /** pedidos de peças faturados pela OS (ok = foi para a SEFAZ) */
  pecas?: { id: string; ok: boolean }[];
  /** NFS-e canceladas desta OS */
  anteriores?: { nfse: string | null; canceladaEm: string; nfseLink: string | null; chave: string | null; motivo?: string; novaOmie?: string | null; omieCancelada?: boolean }[];
}
/** situação conferida direto no sistema nacional */
interface SituacaoGov { nfse: string; chave: string; atual: boolean; situacao: string; conferidoEm: string }
interface NfPedido { faturado: boolean; numero?: string; emitidaEm?: string; canceladaEm?: string; erro?: string; remessa?: boolean; numeroRemessa?: string }

const semZeros = (n: string | null | undefined) => String(n || "").replace(/^0+(?=\d)/, "");

export default function NotasFiscaisBloco({ osId, ordemOmie = "", anteriores: docsAnteriores = [], ppvIds, ppvOmieMap, esperandoDesde = null, clienteDoc = null }: {
  osId: string;
  /** nº da OS no Omie hoje (a nota de serviço sai dela) */
  ordemOmie?: string;
  /** OS e pedidos cancelados ao corrigir a nota — a NF-e cancelada do pedido antigo vem daqui */
  anteriores?: DocAnterior[];
  /** CNPJ/CPF do cliente — para corrigir o cadastro quando a NFS-e volta rejeitada */
  clienteDoc?: string | null;
  ppvIds: string[];
  ppvOmieMap: Record<string, string>;
  /** acabou de faturar (timestamp): já mostra "aguardando a nota" e confere de 15 em 15 s */
  esperandoDesde?: number | null;
}) {
  const [nfse, setNfse] = useState<EstadoNfse | null>(null);
  const [nfs, setNfs] = useState<Record<string, NfPedido>>({});
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [gov, setGov] = useState<Record<string, SituacaoGov> | null>(null);
  const [consultandoGov, setConsultandoGov] = useState(false);
  const consultarGov = useCallback(async () => {
    setConsultandoGov(true);
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/nfse-situacao`, { headers: await authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setGov(Object.fromEntries(((j.notas || []) as SituacaoGov[]).map((n) => [n.nfse, n])));
    } catch { /* sem consulta */ }
    setConsultandoGov(false);
  }, [osId]);

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
    Promise.resolve().then(() => { if (vivo) { void carregarNfse(); void carregarNfs(); void consultarGov(); } });
    return () => { vivo = false; };
  }, [carregarNfse, carregarNfs, consultarGov]);

  const esperando = !!esperandoDesde;
  const pedidosFaturados = useMemo(() => new Set((nfse?.pecas || []).filter((p) => p.ok).map((p) => p.id)), [nfse]);
  const nfseOk = !!nfse?.nfseNumero || nfse?.status === "nfse_autorizada" || nfse?.status === "nfse_rejeitada" || nfse?.status === "recibo_emitido";
  const pedidoAguardando = (pid: string) => esperando && pedidosFaturados.has(pid) && !(nfs[pid]?.faturado && !nfs[pid]?.canceladaEm);
  const falta = esperando && (!nfseOk || pedidos.some(pedidoAguardando));
  useEffect(() => {
    if (!esperandoDesde) return;
    let vivo = true;
    Promise.resolve().then(() => { if (vivo) { void carregarNfse(true); void carregarNfs(true); } });
    return () => { vivo = false; };
  }, [esperandoDesde, carregarNfse, carregarNfs]);
  useEffect(() => {
    if (!falta || !esperandoDesde) return;
    const t = setInterval(() => {
      if (Date.now() - esperandoDesde > 20 * 60_000) { clearInterval(t); return; }
      void carregarNfse(true); void carregarNfs(true);
    }, 15_000);
    return () => clearInterval(t);
  }, [falta, esperandoDesde, carregarNfse, carregarNfs]);

  // nota ainda vindo: confere a cada 30 s (até 20 min com a OS aberta)
  const aguardandoNfse = !!nfse?.faturadoEm && nfse.status === "nfse_aguardando";
  // o bloco do Omie está faturando: este bloco ESPERA junto (não diz "ainda não emitida" — José, 27/10/2026)
  const faturandoAgora = nfse?.status === "faturando" || nfse?.status === "desconhecido";
  useEffect(() => {
    if (!faturandoAgora) return;
    const t = setInterval(() => { void carregarNfse(); void carregarNfs(true); }, 15_000);
    return () => clearInterval(t);
  }, [faturandoAgora, carregarNfse, carregarNfs]);
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

  const temOS = !!nfse?.faturadoEm || (esperando && !!nfse?.habilitado);
  const pedidosCancelados = docsAnteriores.filter((d) => d.tipo === "pedido" && d.nota);
  if (!temOS && !pedidos.length && !(nfse?.anteriores || []).length && !pedidosCancelados.length) return null;

  const chip = (txt: string, cor: string, bg: string) => (
    <span style={{ fontSize: 10.5, fontWeight: 800, padding: "1px 7px", borderRadius: 999, color: cor, background: bg, whiteSpace: "nowrap" }}>{txt}</span>
  );
  // botão de imprimir com cara de botão: ícone + "Imprimir", fundo e borda
  const estiloImprimir: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 12px", borderRadius: 8,
    border: "1px solid #0891A8", background: "#0891A8", color: "#fefefe", fontSize: 11.5, fontWeight: 800,
    textDecoration: "none", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap", boxShadow: "0 1px 2px rgba(8,145,168,.25)",
  };
  // nota cancelada: mesmo botão, mas discreto (só contorno)
  const estiloImprimirSecundario: React.CSSProperties = { ...estiloImprimir, background: "transparent", color: "#0891A8", boxShadow: "none" };
  const linkPdf = (rotulo: string, onClick: () => void, carregando = false) => (
    <button type="button" onClick={onClick} disabled={carregando} title={rotulo}
      style={{ ...estiloImprimir, cursor: carregando ? "wait" : "pointer" }}>
      <i className={`fas ${carregando ? "fa-spinner fa-spin" : "fa-print"}`} /> {carregando ? "Abrindo…" : "Imprimir"}
    </button>
  );
  const linha = (chave: string, titulo: string, sub: React.ReactNode, direita: React.ReactNode, primeira: boolean, rodape?: React.ReactNode) => rodape ? (
    <div key={chave} style={{ borderTop: primeira ? "none" : "1px solid var(--border)" }}>
      {linhaSo(chave, titulo, sub, direita, true)}
      {rodape}
    </div>
  ) : linhaSo(chave, titulo, sub, direita, primeira);
  // coluna estreita: título e situação em cima, o botão de imprimir embaixo na largura toda
  // (ao lado, o botão espremia o número: "NFS- / e 82")
  const linhaSo = (chave: string, titulo: string, sub: React.ReactNode, direita: React.ReactNode, primeira: boolean) => (
    <div key={chave} style={{ padding: "9px 2px", borderTop: primeira ? "none" : "1px solid var(--border)" }}>
      <div style={{ fontSize: 13.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{titulo}</div>
      <div style={{ fontSize: 11, color: "var(--portal-text-muted)", marginTop: 2, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", lineHeight: 1.5 }}>{sub}</div>
      {direita ? <div className="nf-acoes" style={{ marginTop: 8 }}>{direita}</div> : null}
    </div>
  );

  const st = esperando && !nfseOk ? "nfse_aguardando" : nfse?.status;
  const COR_GOV: Record<string, [string, string, string]> = {
    autorizada: ["autorizada no governo", "#047857", "#d1fae5"], cancelada: ["cancelada no governo", "#b91c1c", "#fee2e2"],
    substituida: ["substituída no governo", "#92400e", "#fef3c7"], nao_encontrada: ["não encontrada no governo", "#92400e", "#fef3c7"],
  };
  /** ícone (prédio do governo) com a situação e os detalhes num balão ao passar o mouse */
  const dicaNota = (num: string | null | undefined, extras: React.ReactNode = null) => {
    const g = num ? gov?.[String(num).replace(/^0+(?=\d)/, "")] : null;
    const cor = g && COR_GOV[g.situacao] ? COR_GOV[g.situacao] : null;
    return (
      <DicaNota cor={cor ? cor[1] : "#64748b"} fundo={cor ? cor[2] : "#f1f5f9"} carregando={consultandoGov && !g}>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4, color: "#64748b", marginBottom: 6 }}>Sistema nacional</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: cor ? cor[1] : "#334155" }}>
          {consultandoGov && !g ? "Conferindo…" : cor ? cor[0].replace(" no governo", "") : "Situação indisponível"}
        </div>
        {g && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>conferido às {new Date(g.conferidoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>}
        {extras}
        <button type="button" onClick={() => void consultarGov()} disabled={consultandoGov}
          style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fefefe", color: "#0891A8", fontSize: 12, fontWeight: 700, cursor: consultandoGov ? "wait" : "pointer", fontFamily: "inherit" }}>
          <i className={`fas fa-rotate${consultandoGov ? " fa-spin" : ""}`} /> Conferir agora
        </button>
      </DicaNota>
    );
  };
  const anteriores = nfse?.anteriores || [];

  return (
    <div style={{ margin: "4px 0 8px", padding: 10, borderRadius: 12, border: "1px solid color-mix(in srgb, #16a34a 35%, var(--border))", background: "color-mix(in srgb, #16a34a 5%, var(--surface))", display: "flex", flexDirection: "column", gap: 7 }}>
      {/* linha de ações: Imprimir estica, o ícone do governo fica do lado */}
      <style>{`.nf-acoes { display: flex; } .nf-acoes > span { display: flex !important; width: 100%; gap: 6px; align-items: stretch; }
        .nf-acoes > button, .nf-acoes > a, .nf-acoes > span > a, .nf-acoes > span > button { flex: 1; }
        .nf-acoes > span > span { flex: none; display: flex; } .nf-acoes > span > span > button { width: 32px !important; height: auto !important; min-height: 30px; }`}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marcas/nfse.png" alt="NFS-e" style={{ height: 17, width: "auto", display: "block" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--portal-text-muted)" }}>notas fiscais</span>
      </div>
      <div style={{ padding: "2px 10px", borderRadius: 9, background: "var(--surface)", border: "1px solid var(--border)" }}>
        {temOS && st === "recibo_emitido" && linha("recibo", `Recibo${nfse?.reciboNumero ? ` nº ${nfse.reciboNumero}` : ""}`,
          <>serviço · {chip("OS interna · sem NFS-e", "#6d28d9", "#ede9fe")}</>,
          linkPdf(`Recibo de prestação de serviço${nfse?.reciboNumero ? ` nº ${nfse.reciboNumero}` : ""}`, () => window.open(`/api/pos/ordens/${encodeURIComponent(osId)}/recibo`, "_blank")), true)}
        {temOS && st !== "nfse_cancelada" && st !== "recibo_emitido" && linha("nfse",
          st === "nfse_aguardando" ? "NFS-e" : `NFS-e ${semZeros(nfse?.nfseNumero) || ""}`.trim(),
          st === "nfse_aguardando" ? <>serviço · {chip("aguardando o sistema nacional", "#075985", "#e0f2fe")}</>
            : st === "nfse_rejeitada" ? <>serviço · {chip("rejeitada", "#b91c1c", "#fee2e2")}</>
            : <>serviço{ordemOmie ? ` · OS ${semZeros(ordemOmie)}` : ""} · {chip("autorizada", "#047857", "#d1fae5")}</>,
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            {nfse?.nfseLink ? <a href={nfse.nfseLink} target="_blank" rel="noreferrer" title={`Imprimir a NFS-e ${semZeros(nfse?.nfseNumero)}`} style={estiloImprimir}><i className="fas fa-print" /> Imprimir</a> : null}
            {st !== "nfse_aguardando" && nfse?.nfseNumero ? dicaNota(nfse.nfseNumero) : null}
          </span>,
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
        {temOS && st === "nfse_rejeitada" && <NfseRejeitada osId={osId} erro={nfse?.erro || "O sistema nacional recusou a nota."} cnpj={clienteDoc} onReenviada={() => { void carregarNfse(); }} />}
        {/* OS ainda sem nota: diz de qual OS a NFS-e vai sair (José, 23/10/2026: "bloco de NF confuso") */}
        {!temOS && ordemOmie && linha("nfse-pendente", "NFS-e",
          <>serviço · OS {semZeros(ordemOmie)} · {faturandoAgora ? chip("sendo gerada…", "#075985", "#e0f2fe") : chip("ainda não emitida", "#b45309", "#fef3c7")}</>, null, true)}
        {pedidos.map((pid, i) => {
          const nf = nfs[pid];
          const ok = !!nf?.faturado && !nf.canceladaEm;
          // OS interna: as peças vão como REMESSA — a nota é a NF-e de remessa (faturada no Omie)
          const rem = !!nf?.remessa;
          return linha(pid,
            ok && nf?.numero ? `NF-e ${rem ? "de remessa " : ""}${semZeros(nf.numero)}` : rem ? "NF-e de remessa" : "NF-e",
            <>{rem ? <>peças · remessa {semZeros(nf?.numeroRemessa || ppvOmieMap[pid])}</> : <>peças · pedido {semZeros(ppvOmieMap[pid])}</>} · {pedidoAguardando(pid) ? chip("aguardando a SEFAZ", "#075985", "#e0f2fe") : nf === undefined ? "conferindo…" : ok ? (nf.emitidaEm ? `emitida ${String(nf.emitidaEm).slice(0, 10)}` : chip("emitida", "#047857", "#d1fae5")) : nf?.canceladaEm ? chip("cancelada", "#b91c1c", "#fee2e2") : faturandoAgora ? chip("aguardando o faturamento da OS", "#075985", "#e0f2fe") : rem ? chip("remessa ainda não faturada", "#6d28d9", "#ede9fe") : chip("ainda não emitida", "#b45309", "#fef3c7")}</>,
            ok ? linkPdf(`Imprimir a NF-e ${rem ? "da remessa" : "do pedido"} ${semZeros(nf?.numeroRemessa || ppvOmieMap[pid])}`, () => abrirDanfe(pid), abrindo === pid) : null,
            !temOS && !ordemOmie && i === 0,
            // remessa ainda não faturada: botão de largura inteira embaixo
            !ok && rem && nf && !nf.canceladaEm
              ? <div style={{ padding: "0 2px 9px" }}><FaturarRemessaBotao ppvId={pid} numero={semZeros(nf.numeroRemessa || ppvOmieMap[pid])} onFeito={() => { void carregarNfs(true); }} /></div>
              : null);
        })}
        {pedidos.some(pedidoAguardando) && (
          <div style={{ padding: "0 2px 8px" }}>
            <div style={{ height: 5, borderRadius: 3, background: "rgba(232,115,12,.18)", overflow: "hidden" }}>
              <div className="nf-barra" style={{ height: "100%", width: "40%", borderRadius: 3, background: "#e8730c" }} />
            </div>
            <div style={{ fontSize: 10.5, color: "var(--portal-text-muted)", marginTop: 4 }}>Buscando a NF-e na SEFAZ…</div>
            <style>{`@keyframes nfBarra { 0% { transform: translateX(-100%) } 100% { transform: translateX(250%) } } .nf-barra { animation: nfBarra 1.4s ease-in-out infinite; }`}</style>
          </div>
        )}
      </div>
      {(anteriores.length > 0 || pedidosCancelados.length > 0) && (
        <>
          <div style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: .4, color: "var(--portal-text-muted)", padding: "4px 2px 0" }}>Canceladas</div>
          <div style={{ padding: "2px 10px", borderRadius: 9, background: "var(--surface)", border: "1px dashed var(--border)", opacity: .85 }}>
            {anteriores.map((a, i) => {
              const osAntiga = docsAnteriores.find((d) => d.tipo === "os" && d.nota === semZeros(a.nfse))?.numero;
              return linha(`ant-${i}`, `NFS-e ${semZeros(a.nfse) || ""}`.trim(),
                <>serviço{osAntiga ? ` · OS ${osAntiga}` : ""} · {chip("cancelada", "#b91c1c", "#fee2e2")}{a.novaOmie ? <> · refeita na OS {semZeros(a.novaOmie)}</> : null}</>,
                <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  {a.nfseLink ? <a href={a.nfseLink} target="_blank" rel="noreferrer" title={`Ver a NFS-e cancelada ${semZeros(a.nfse)}`} style={estiloImprimirSecundario}><i className="fas fa-print" /> Imprimir</a> : null}
                  {dicaNota(a.nfse, (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #f1f5f9", fontSize: 12.5, color: "#334155", lineHeight: 1.55 }}>
                      {a.canceladaEm && <div><b>Cancelada em</b> {new Date(a.canceladaEm).toLocaleDateString("pt-BR")}</div>}
                      {a.motivo && <div style={{ marginTop: 4 }}><b>Motivo:</b> {a.motivo.replace(/^\d\s*-\s*/, "")}</div>}
                      {a.novaOmie && <div style={{ marginTop: 4 }}><b>Refeita na OS</b> nº {semZeros(a.novaOmie)}</div>}
                    </div>
                  ))}
                </span>,
                i === 0);
            })}
            {pedidosCancelados.map((d, i) => linha(`ped-ant-${d.numero}`, `NF-e ${d.nota}`,
              <>peças · pedido {d.numero} · {chip("cancelada", "#b91c1c", "#fee2e2")}{d.novo ? <> · refeito no pedido {d.novo}</> : null}</>,
              null, anteriores.length === 0 && i === 0))}
          </div>
        </>
      )}
    </div>
  );
}

/** Ícone discreto que abre um balão legível ao passar o mouse (ou tocar). */
function DicaNota({ cor, fundo, carregando, children }: { cor: string; fundo: string; carregando: boolean; children: React.ReactNode }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const fechar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abrir = () => {
    if (fechar.current) clearTimeout(fechar.current);
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const largura = 270;
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(window.innerWidth - largura - 8, r.right - largura)) });
  };
  const sair = () => { fechar.current = setTimeout(() => setPos(null), 180); };
  const aberto = !!pos;
  return (
    <span style={{ display: "inline-flex" }} onMouseEnter={abrir} onMouseLeave={sair}>
      <button ref={btn} type="button" onClick={() => (pos ? setPos(null) : abrir())} title="Situação no sistema nacional"
        style={{ width: 22, height: 22, borderRadius: 7, border: "none", background: fundo, color: cor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, cursor: "pointer", padding: 0 }}>
        <i className={`fas ${carregando ? "fa-spinner fa-spin" : "fa-landmark"}`} />
      </button>
      {aberto && pos && typeof document !== "undefined" && createPortal(
        <div onMouseEnter={abrir} onMouseLeave={sair}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 100050, width: 270, padding: "12px 14px", borderRadius: 12, background: "#fefefe", border: "1px solid #e2e8f0", boxShadow: "0 14px 34px rgba(15,23,42,.22)", textAlign: "left", color: "#1e293b" }}>
          {children}
        </div>, document.body)}
    </span>
  );
}
