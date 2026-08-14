"use client";
// Seleciona o Vendedor entre TODOS os usuários do portal (financeiro_usu), com
// foto (avatar_url), função e busca por nome/função.
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Usuario { nome: string; funcao?: string | null; avatarUrl?: string | null }

// Cor do avatar (fallback iniciais) derivada do nome — dá variedade sem libs.
function corDoNome(nome: string): string {
  const cores = ["#e2730c", "#2563eb", "#0f9d58", "#dc2626", "#7c3aed", "#0891b2", "#b45309", "#be185d"];
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  return cores[h % cores.length];
}
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

export default function SelecionarUsuarioModal({
  open, atual, onClose, onSelect,
}: {
  open: boolean;
  atual?: string;
  onClose: () => void;
  onSelect: (nome: string) => void;
}) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(false);
  const [semFoto, setSemFoto] = useState<Record<string, boolean>>({}); // avatar que falhou → iniciais

  useEffect(() => {
    if (!open) return;
    setBusca(""); setSemFoto({}); setLoading(true);
    supabase.from("financeiro_usu").select("nome, funcao, avatar_url, ativo").order("nome").then(({ data, error }) => {
      if (error) console.error("[SelecionarUsuario] carregar:", error.message);
      setUsuarios((data || [])
        // Não mostra usuários inativos (ativo === false). Mantém true/null.
        .filter((u: { nome?: string; ativo?: boolean | null }) => u.nome && u.ativo !== false)
        .map((u: { nome: string; funcao?: string | null; avatar_url?: string | null }) => ({ nome: u.nome, funcao: u.funcao, avatarUrl: u.avatar_url })));
      setLoading(false);
    });
  }, [open]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter((u) => u.nome.toLowerCase().includes(q) || (u.funcao || "").toLowerCase().includes(q));
  }, [usuarios, busca]);

  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70000, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 10, width: "100%", maxWidth: 480, maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid #eef0f3" }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Escolher vendedor</div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 6, width: 30, height: 30, cursor: "pointer", color: "#475569", fontSize: 17 }}>×</button>
        </div>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid #eef0f3", position: "relative" }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 30, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13 }} />
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou função…"
            style={{ width: "100%", borderRadius: 6, border: "1px solid #d1d5db", padding: "9px 11px 9px 32px", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ overflowY: "auto", padding: "6px 0" }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Carregando…</div>
          ) : filtrados.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Nenhum usuário encontrado.</div>
          ) : filtrados.map((u) => {
            const temFoto = !!u.avatarUrl && !semFoto[u.nome];
            const sel = u.nome === atual;
            return (
              <button key={u.nome} onClick={() => { onSelect(u.nome); onClose(); }}
                style={{ display: "flex", alignItems: "center", gap: 11, width: "100%", textAlign: "left", padding: "9px 18px", border: "none", borderLeft: sel ? "3px solid #2563eb" : "3px solid transparent", background: sel ? "#eff6ff" : "transparent", cursor: "pointer" }}
                onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = "#f8fafc"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = sel ? "#eff6ff" : "transparent"; }}>
                {temFoto ? (
                  <img src={u.avatarUrl as string} alt="" onError={() => setSemFoto((s) => ({ ...s, [u.nome]: true }))}
                    style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: "1px solid #eef0f3" }} />
                ) : (
                  <span style={{ width: 36, height: 36, borderRadius: "50%", background: corDoNome(u.nome), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, flexShrink: 0 }}>
                    {iniciais(u.nome)}
                  </span>
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.nome}</span>
                  {u.funcao && <span style={{ display: "block", fontSize: 11.5, color: "#94a3b8" }}>{u.funcao}</span>}
                </span>
                {sel && <i className="fas fa-check" style={{ color: "#2563eb", fontSize: 12, flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
        <div style={{ padding: "8px 18px", borderTop: "1px solid #eef0f3", fontSize: 11.5, color: "#94a3b8" }}>{filtrados.length} usuário(s)</div>
      </div>
    </div>
  );
}
