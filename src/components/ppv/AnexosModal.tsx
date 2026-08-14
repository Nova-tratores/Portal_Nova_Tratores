"use client";
// Anexos (mídia) + comentários de um PPV. Lista, comenta e sobe arquivo.
import { useCallback, useEffect, useState } from "react";
import { api, type PPVAnexo } from "@/lib/ppv/api";

export default function AnexosModal({
  open, ppvId, autor, onClose, onChanged, showToast,
}: {
  open: boolean;
  ppvId: string | null;
  autor?: string;
  onClose: () => void;
  onChanged?: () => void;
  showToast?: (t: "success" | "error", m: string) => void;
}) {
  const [lista, setLista] = useState<PPVAnexo[]>([]);
  const [loading, setLoading] = useState(false);
  const [comentario, setComentario] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    if (!ppvId) return;
    setLoading(true);
    try { const r = await api.listarAnexos(ppvId); setLista(r.anexos); } catch { /* ignore */ }
    setLoading(false);
  }, [ppvId]);
  useEffect(() => { if (open) carregar(); }, [open, carregar]);
  if (!open) return null;

  const comentar = async () => {
    if (!ppvId || !comentario.trim()) return;
    setSalvando(true);
    try { await api.addComentario(ppvId, comentario.trim(), autor); setComentario(""); await carregar(); onChanged?.(); }
    catch (e) { showToast?.("error", e instanceof Error ? e.message : "Erro ao comentar"); }
    setSalvando(false);
  };
  const anexar = async (file?: File | null) => {
    if (!ppvId || !file) return;
    setEnviando(true);
    try { await api.addMidia(ppvId, file, autor); await carregar(); onChanged?.(); }
    catch (e) { showToast?.("error", e instanceof Error ? e.message : "Erro no upload"); }
    setEnviando(false);
  };
  const remover = async (id: number) => {
    if (!confirm("Remover este item?")) return;
    try { await api.delAnexo(id); await carregar(); onChanged?.(); } catch { /* ignore */ }
  };

  const fmt = (s: string) => { try { return new Date(s).toLocaleString("pt-BR"); } catch { return s; } };
  const ehImagem = (u: string) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(u);
  const btn: React.CSSProperties = { padding: "9px 15px", borderRadius: 4, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70000, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 6, width: "100%", maxWidth: 600, maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid #eef0f3" }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Anexos & comentários {ppvId ? `— ${ppvId}` : ""}</div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 4, width: 32, height: 32, cursor: "pointer", color: "#475569", fontSize: 18 }}>×</button>
        </div>

        {/* Entrada: comentário + upload */}
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #eef0f3", display: "flex", flexDirection: "column", gap: 10 }}>
          <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Escreva um comentário sobre este pedido…" rows={2}
            style={{ width: "100%", borderRadius: 4, border: "1px solid #d1d5db", padding: "9px 11px", fontSize: 13.5, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={comentar} disabled={salvando || !comentario.trim()} style={{ ...btn, background: "#0f766e", color: "#fff", opacity: salvando || !comentario.trim() ? 0.6 : 1 }}>
              {salvando ? "Enviando…" : "Comentar"}
            </button>
            <label style={{ ...btn, background: "#f0a22e", color: "#fff", display: "inline-flex", alignItems: "center", gap: 6, opacity: enviando ? 0.6 : 1 }}>
              {enviando ? "Enviando…" : "Anexar mídia"}
              <input type="file" accept="image/*,video/*,application/pdf" onChange={(e) => { anexar(e.target.files?.[0]); e.currentTarget.value = ""; }} disabled={enviando} style={{ display: "none" }} />
            </label>
          </div>
        </div>

        {/* Lista */}
        <div style={{ padding: "12px 20px", overflowY: "auto" }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Carregando…</div>
          ) : lista.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Nenhum anexo ou comentário ainda.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lista.map((a) => (
                <div key={a.id} style={{ border: "1px solid #eef0f3", borderRadius: 4, padding: "10px 12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: a.tipo === "midia" || a.comentario ? 6 : 0 }}>
                    <span style={{ fontSize: 11.5, color: "#94a3b8" }}>{a.autor || "—"} · {fmt(a.created_at)}</span>
                    <button onClick={() => remover(a.id)} title="Remover" style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>remover</button>
                  </div>
                  {a.tipo === "comentario" ? (
                    <div style={{ fontSize: 13.5, color: "#334155", whiteSpace: "pre-wrap" }}>{a.comentario}</div>
                  ) : a.url && ehImagem(a.url) ? (
                    <a href={a.url} target="_blank" rel="noopener noreferrer"><img src={a.url} alt={a.nome_arquivo || ""} style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 4, display: "block" }} /></a>
                  ) : (
                    <a href={a.url || "#"} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13.5, color: "#2563eb", fontWeight: 600 }}>📎 {a.nome_arquivo || "arquivo"}</a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
