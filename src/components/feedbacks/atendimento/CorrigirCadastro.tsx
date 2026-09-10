"use client";
// "Corrigir cadastro": telefone e e-mail do cliente direto no Omie, sem
// precisar abrir um atendimento. Usa a rota PATCH /api/feedbacks/cliente-omie
// (reenvia o cadastro completo ao Omie e espelha no Supabase).
import { useState } from "react";
import { normalizarTelefoneWa } from "@/lib/feedbacks/telefone";

interface Props {
  codigoOmie: string;
  nome: string;
  telefoneAtual: string | null;
  emailAtual: string | null;
  emailInterno: boolean;
  onFechar: () => void;
  onSalvo: () => void;
}

export default function CorrigirCadastro({ codigoOmie, nome, telefoneAtual, emailAtual, emailInterno, onFechar, onSalvo }: Props) {
  const [telefone, setTelefone] = useState(telefoneAtual ?? "");
  const [email, setEmail] = useState(emailInterno ? "" : (emailAtual ?? ""));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const telOk = !telefone.trim() || !!normalizarTelefoneWa(telefone);
  const emailOk = !email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const mudou = telefone.trim() !== (telefoneAtual ?? "").trim() || email.trim() !== (emailAtual ?? "").trim();

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const cadastro: Record<string, string> = {};
      if (telefone.trim() !== (telefoneAtual ?? "").trim()) cadastro.telefone1 = telefone.trim();
      if (email.trim() !== (emailAtual ?? "").trim()) cadastro.email = email.trim();
      const res = await fetch("/api/feedbacks/cliente-omie", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo_omie: codigoOmie, cadastro }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.erro || `HTTP ${res.status}`);
      onSalvo();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao gravar no Omie");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div onClick={onFechar} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--portal-bg-card)", color: "inherit", borderRadius: 16, width: "min(440px, 100%)", padding: 20, boxShadow: "0 20px 60px -20px rgba(0,0,0,.6)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.6, textTransform: "uppercase", letterSpacing: 0.8 }}>Corrigir cadastro no Omie</div>
        <h3 style={{ margin: "2px 0 12px", fontSize: 16, fontWeight: 800 }}>{nome} <span style={{ opacity: 0.5, fontWeight: 500 }}>#{codigoOmie}</span></h3>

        <label style={rotulo}>Telefone</label>
        <input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(14) 9 9999-9999" style={input} />
        {!telOk && <div style={erroTxt}>Telefone incompleto (precisa de DDD).</div>}

        <label style={rotulo}>E-mail</label>
        {emailInterno && emailAtual && <div style={{ fontSize: 11, color: "#92400e", marginBottom: 4 }}>Hoje está com o e-mail da loja ({emailAtual}). Deixe vazio se o cliente não tiver e-mail.</div>}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@exemplo.com" style={input} />
        {!emailOk && <div style={erroTxt}>E-mail inválido.</div>}

        {erro && <div style={{ ...erroTxt, marginTop: 10 }}>{erro}</div>}

        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button type="button" onClick={onFechar} style={btn("#64748b", false)}>Cancelar</button>
          <button type="button" disabled={salvando || !mudou || !telOk || !emailOk} onClick={salvar} style={{ ...btn("#d97706", true), opacity: salvando || !mudou || !telOk || !emailOk ? 0.5 : 1 }}>
            {salvando ? "Gravando no Omie…" : "Salvar no Omie"}
          </button>
        </div>
      </div>
    </div>
  );
}

const rotulo: React.CSSProperties = { display: "block", fontSize: 11, opacity: 0.65, marginTop: 10, marginBottom: 4 };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--portal-border)", fontSize: 14, background: "var(--portal-bg-card)", color: "inherit" };
const erroTxt: React.CSSProperties = { fontSize: 11, color: "#991b1b", marginTop: 4 };
function btn(cor: string, preenchido: boolean): React.CSSProperties {
  return { fontSize: 13, fontWeight: 700, padding: "8px 14px", borderRadius: 999, border: `1px solid ${cor}`, background: preenchido ? cor : "transparent", color: preenchido ? "#fff" : cor, cursor: "pointer" };
}
