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
  assinado_geo: { lat: number; lng: number; precisao_m?: number | null } | null;
  assinado_dispositivo: { modelo?: string | null; plataforma?: string | null; versao?: string | null } | null;
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
            <input placeholder="WhatsApp do cliente (DDD + número)" value={telefone} onChange={(e) => setTelefone(e.target.value)} style={{ ...inp, width: 230 }} />
            <a href={waLink} target="_blank" rel="noreferrer" style={{ ...btnCheio, background: "#25D366", borderColor: "#25D366", textDecoration: "none" }}>Enviar pelo WhatsApp</a>
          </div>
          <div style={{ fontSize: 11, color: "#6b7280", marginTop: 6, wordBreak: "break-all" }}>{r.link}</div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          {a.assinatura_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={a.assinatura_url} alt="Assinatura do cliente" style={{ height: 64, maxWidth: 240, objectFit: "contain", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: 4 }} />
          )}
          <div style={{ flex: 1, minWidth: 240 }}>
            <ProvaAssinatura c={{ assinado_em: a.assinado_em, assinado_nome: a.assinado_nome, assinado_ip: a.assinado_ip, assinado_geo: a.assinado_geo, assinado_dispositivo: a.assinado_dispositivo }} />
            {podeEditar && <button type="button" style={{ ...btn, marginTop: 6 }} disabled={salvando} onClick={reabrir}>Refazer assinatura (novo link)</button>}
          </div>
        </div>
      )}
      {erro && <div style={{ color: "#991b1b", fontSize: 12, marginTop: 6 }}>{erro}</div>}
    </div>
  );
}
