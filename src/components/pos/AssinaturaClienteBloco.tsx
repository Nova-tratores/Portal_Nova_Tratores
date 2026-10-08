"use client";

// Bloco "Assinatura do cliente" na OS (qualquer serviço): link pra copiar,
// envio por WhatsApp, situação, imagem da assinatura e a prova (quem, quando,
// onde, aparelho). Via /api/pos/ordens/[id]/assinatura.
import { useCallback, useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { linkWhatsapp } from "@/lib/feedbacks/telefone";
import { ProvaAssinatura } from "./ChequeRevisaoBloco";

interface Assinatura {
  os_id: string; token: string; assinatura_url: string | null; assinado_em: string | null; assinado_nome: string | null; assinado_ip: string | null;
  assinado_geo: { lat: number; lng: number; precisao_m?: number | null; obtido_em?: string | null } | null;
  assinado_dispositivo: { modelo?: string | null; plataforma?: string | null; versao?: string | null; ua?: string | null; tela?: string | null } | null;
}

/** Modal com a assinatura grande, todos os dados da prova e o mapa do local. */
function ModalAssinatura({ a, cliente, onClose }: { a: Assinatura; cliente: string; onClose: () => void }) {
  const g = a.assinado_geo, d = a.assinado_dispositivo;
  const quando = a.assinado_em ? new Date(a.assinado_em).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "medium" }) : "—";
  const maps = g ? `https://www.google.com/maps?q=${g.lat},${g.lng}` : null;
  const linha = (rot: string, val: React.ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(96px, 150px) minmax(0, 1fr)", gap: 8, padding: "6px 0", borderBottom: "1px solid #f1f5f9", fontSize: 13 }}>
      <div style={{ color: "#6b7280" }}>{rot}</div><div style={{ color: "#111827", wordBreak: "break-word" }}>{val}</div>
    </div>
  );
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "min(860px, 100%)", maxHeight: "92vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #e5e7eb", background: "#eff6ff" }}>
          <b style={{ color: "#1d4ed8", fontSize: 15 }}>Assinatura do cliente · OS {a.os_id}</b>
          <button type="button" onClick={onClose} style={{ marginLeft: "auto", border: 0, background: "transparent", fontSize: 20, cursor: "pointer", color: "#6b7280" }} aria-label="Fechar">×</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: 16, padding: 16 }}>
          <div>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, background: "#fff", padding: 12, textAlign: "center" }}>
              {a.assinatura_url
                /* eslint-disable-next-line @next/next/no-img-element */
                ? <img src={a.assinatura_url} alt="Assinatura do cliente" style={{ maxWidth: "100%", maxHeight: 180, objectFit: "contain" }} />
                : <span style={{ color: "#9ca3af" }}>sem imagem</span>}
              <div style={{ borderTop: "1px solid #111", marginTop: 8, paddingTop: 4, fontSize: 12, fontWeight: 700 }}>{a.assinado_nome || cliente}</div>
            </div>
            <div style={{ marginTop: 12 }}>
              {linha("Assinado por", <b>{a.assinado_nome || "—"}</b>)}
              {linha("Data e hora", quando)}
              {linha("Localização", g ? <>{g.lat.toFixed(6)}, {g.lng.toFixed(6)}{g.precisao_m ? ` · precisão ±${g.precisao_m} m` : ""}{g.obtido_em ? ` · GPS lido às ${new Date(g.obtido_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</> : <span style={{ color: "#b45309" }}>não informada</span>)}
              {linha("Aparelho", d ? [d.modelo, d.plataforma && d.versao ? `${d.plataforma} ${d.versao}` : d.plataforma, d.tela ? `tela ${d.tela}` : ""].filter(Boolean).join(" · ") || "—" : <span style={{ color: "#b45309" }}>não informado</span>)}
              {d?.ua && linha("Navegador", <span style={{ fontSize: 11, color: "#4b5563" }}>{d.ua}</span>)}
              {linha("IP de origem", a.assinado_ip || "—")}
              {linha("Link usado", <span style={{ fontSize: 11, color: "#4b5563" }}>/assinar/{a.token.slice(0, 8)}…</span>)}
            </div>
            {maps && (
              <a href={maps} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 12, padding: "8px 14px", background: "#2563eb", color: "#fff", borderRadius: 8, fontWeight: 700, fontSize: 13, textDecoration: "none" }}>
                Abrir no Google Maps
              </a>
            )}
          </div>
          <div style={{ minHeight: 320, border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden", background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {g
              ? <iframe title="Local da assinatura" src={`https://www.google.com/maps?q=${g.lat},${g.lng}&z=15&output=embed`} style={{ width: "100%", height: "100%", minHeight: 320, border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
              : <span style={{ color: "#9ca3af", fontSize: 13 }}>Sem localização registrada</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
interface Resp { assinatura: Assinatura; link: string; mensagemWhatsApp: string; resumo: { revisaoHoras: number | null; cliente: string } }

export default function AssinaturaClienteBloco({ osId, podeEditar }: { osId: string; podeEditar: boolean }) {
  const [r, setR] = useState<Resp | null>(null);
  const [erro, setErro] = useState("");
  const [codigo, setCodigo] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [telefone, setTelefone] = useState("");
  const [copiado, setCopiado] = useState<"link" | "msg" | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [modal, setModal] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(""); setCodigo("");
    try {
      const res = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/assinatura`, { headers: await authHeaders() });
      const j = await res.json();
      if (!res.ok) { setCodigo(j.codigo || ""); throw new Error(j.error || "falha ao carregar"); }
      setR(j);
    } catch (e) { setErro(e instanceof Error ? e.message : "erro"); } finally { setCarregando(false); }
  }, [osId]);
  useEffect(() => { carregar(); }, [carregar]);

  const reabrir = async () => {
    if (!confirm("Apagar a assinatura do cliente e gerar um link novo?")) return;
    setSalvando(true); setErro("");
    try {
      const res = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/assinatura`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ acao: "reabrir" }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "falha");
      setR(j);
    } catch (e) { setErro(e instanceof Error ? e.message : "erro"); } finally { setSalvando(false); }
  };

  const copiar = async (t: string, qual: "link" | "msg") => { try { await navigator.clipboard.writeText(t); setCopiado(qual); setTimeout(() => setCopiado(null), 1800); } catch { /* sem clipboard */ } };

  const box: React.CSSProperties = { border: "1px solid #bfdbfe", borderLeft: "5px solid #2563eb", background: "#eff6ff", borderRadius: 8, padding: "10px 12px", marginBottom: 12, fontSize: 13 };
  const btn: React.CSSProperties = { padding: "6px 10px", fontSize: 12, fontWeight: 700, borderRadius: 6, border: "1px solid #2563eb", background: "#fff", color: "#1d4ed8", cursor: "pointer" };
  const btnCheio: React.CSSProperties = { ...btn, background: "#2563eb", color: "#fff" };
  const inp: React.CSSProperties = { padding: "5px 7px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 5 };

  if (carregando) return <div style={box}>Assinatura do cliente: carregando…</div>;
  if (!r) {
    return (
      <div style={box}>
        <b style={{ color: "#1d4ed8" }}>Assinatura do cliente</b> — <span style={{ color: "#991b1b" }}>{erro}</span>
        {codigo === "tabela_ausente" && <div style={{ fontSize: 12, color: "#6b7280" }}>Falta aplicar a migration sql/os-assinaturas-cliente.sql no Supabase.</div>}
        <div style={{ marginTop: 6 }}><button type="button" style={btn} onClick={carregar}>Tentar de novo</button></div>
      </div>
    );
  }

  const a = r.assinatura;
  const assinado = !!a.assinado_em;
  const waLink = (telefone && linkWhatsapp(telefone, r.mensagemWhatsApp)) || `https://wa.me/?text=${encodeURIComponent(r.mensagemWhatsApp)}`;

  return (
    <div style={box}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <b style={{ color: "#1d4ed8" }}>Assinatura do cliente</b>
        {r.resumo.revisaoHoras && <span style={{ color: "#6b7280", fontSize: 12 }}>vai também pro cheque de revisão das {r.resumo.revisaoHoras}h</span>}
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: assinado ? "#047857" : "#b45309", background: assinado ? "#ecfdf5" : "#fffbeb", border: `1px solid ${assinado ? "#a7f3d0" : "#fde68a"}`, borderRadius: 999, padding: "2px 10px" }}>
          {assinado ? "Assinado" : "Aguardando assinatura"}
        </span>
      </div>

      {!assinado ? (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" style={btnCheio} onClick={() => copiar(r.link, "link")}>{copiado === "link" ? "Link copiado!" : "Copiar link"}</button>
            <button type="button" style={btn} onClick={() => copiar(r.mensagemWhatsApp, "msg")} title="Copia a mensagem pronta com o link">{copiado === "msg" ? "Mensagem copiada!" : "Copiar mensagem"}</button>
            <input placeholder="WhatsApp do cliente (DDD + número)" value={telefone} onChange={(e) => setTelefone(e.target.value)} style={{ ...inp, width: 230, maxWidth: "100%" }} />
            <a href={waLink} target="_blank" rel="noreferrer" style={{ ...btnCheio, background: "#25D366", borderColor: "#25D366", textDecoration: "none" }}>Enviar pelo WhatsApp</a>
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6, wordBreak: "break-all" }}>{r.link}</div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          {a.assinatura_url && (
            <button type="button" onClick={() => setModal(true)} title="Ver detalhes da assinatura" style={{ border: 0, background: "transparent", padding: 0, cursor: "zoom-in" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.assinatura_url} alt="Assinatura do cliente" style={{ height: 64, maxWidth: 240, objectFit: "contain", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 4 }} />
            </button>
          )}
          <div style={{ flex: 1, minWidth: "min(240px, 100%)" }}>
            <ProvaAssinatura c={{ assinado_em: a.assinado_em, assinado_nome: a.assinado_nome, assinado_ip: a.assinado_ip, assinado_geo: a.assinado_geo, assinado_dispositivo: a.assinado_dispositivo }} />
            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              <button type="button" style={btnCheio} onClick={() => setModal(true)}>Ver detalhes e mapa</button>
              {a.assinado_geo && <a href={`https://www.google.com/maps?q=${a.assinado_geo.lat},${a.assinado_geo.lng}`} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: "none" }}>Google Maps</a>}
              {podeEditar && <button type="button" style={btn} disabled={salvando} onClick={reabrir}>Refazer assinatura (novo link)</button>}
            </div>
          </div>
        </div>
      )}
      {modal && <ModalAssinatura a={a} cliente={r.resumo.cliente} onClose={() => setModal(false)} />}
      {erro && <div style={{ color: "#991b1b", fontSize: 12, marginTop: 6 }}>{erro}</div>}
    </div>
  );
}
