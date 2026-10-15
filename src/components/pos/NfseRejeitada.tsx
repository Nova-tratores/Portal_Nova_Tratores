"use client";
// NFS-e rejeitada pelo sistema nacional: mostra o erro de forma legível, explica o
// E0240 (CEP do tomador) e oferece corrigir o cliente e REENVIAR (ReenviarOS do Omie).
import { useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import EditarClienteOmie from "@/components/clientes/EditarClienteOmie";

/** "… E0240 : O CEP informado … · ERRO · …" → [{ codigo, texto }] */
export function errosDaNfse(msg: string): { codigo: string; texto: string }[] {
  const out: { codigo: string; texto: string }[] = [];
  const re = /\b(E\d{3,4})\s*:\s*([^·]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(msg))) {
    const texto = m[2].trim().replace(/\.$/, "");
    if (!out.some((o) => o.codigo === m![1])) out.push({ codigo: m[1], texto });
  }
  return out;
}

const DICAS: Record<string, string> = {
  E0240: "O CEP do cliente está errado ou é o CEP geral da cidade (termina em 000). Corrija o CEP no cadastro do cliente e reenvie.",
};

export default function NfseRejeitada({ osId, erro, cnpj, onReenviada }: {
  osId: string; erro: string; cnpj?: string | null; onReenviada: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [verTudo, setVerTudo] = useState(false);
  const erros = errosDaNfse(erro);

  const reenviar = async () => {
    if (!window.confirm("Reenviar a NFS-e ao sistema nacional pelo Omie?\n\nConfira antes se o cadastro do cliente já foi corrigido.")) return;
    setEnviando(true); setMsg(null);
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(osId)}/nfse-reenviar`, { method: "POST", headers: await authHeaders() });
      const j = await r.json().catch(() => ({}));
      setMsg({ ok: !!j.ok, texto: j.mensagem || j.error || `Erro ${r.status}` });
      if (j.ok) onReenviada();
    } catch { setMsg({ ok: false, texto: "Sem conexão." }); }
    setEnviando(false);
  };

  return (
    <div style={{ margin: "0 0 8px", border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 10, padding: "9px 10px" }}>
      {erros.length ? erros.map((e) => (
        <div key={e.codigo} style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 12, color: "#991b1b", lineHeight: 1.45 }}><b>{e.codigo}</b> · {e.texto}</div>
          {DICAS[e.codigo] && <div style={{ fontSize: 11.5, color: "#7f1d1d", marginTop: 3, lineHeight: 1.45, display: "flex", gap: 5 }}><i className="fas fa-lightbulb" style={{ marginTop: 2, color: "#b45309" }} />{DICAS[e.codigo]}</div>}
        </div>
      )) : <div style={{ fontSize: 12, color: "#991b1b", lineHeight: 1.45 }}>{erro.slice(0, 220)}</div>}
      {erros.length > 0 && (
        <button type="button" onClick={() => setVerTudo((v) => !v)} style={{ border: "none", background: "none", padding: 0, fontSize: 10.5, color: "#b91c1c", cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" }}>
          {verTudo ? "esconder a mensagem completa" : "ver a mensagem completa"}
        </button>
      )}
      {verTudo && <div style={{ fontSize: 10.5, color: "#7f1d1d", marginTop: 4, lineHeight: 1.4, wordBreak: "break-word" }}>{erro}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {cnpj && <EditarClienteOmie doc={cnpj} estilo={{ flex: 1 }} />}
        <button type="button" onClick={reenviar} disabled={enviando}
          style={{ flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, height: 32, padding: "0 12px", borderRadius: 8, border: "none", background: "#b91c1c", color: "#fefefe", fontSize: 12, fontWeight: 800, cursor: enviando ? "wait" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
          <i className={`fas ${enviando ? "fa-spinner fa-spin" : "fa-rotate-right"}`} /> {enviando ? "Reenviando…" : "Reenviar NFS-e"}
        </button>
      </div>
      {msg && <div style={{ fontSize: 11, marginTop: 6, fontWeight: 600, color: msg.ok ? "#15803d" : "#b91c1c" }}>{msg.texto}</div>}
    </div>
  );
}
