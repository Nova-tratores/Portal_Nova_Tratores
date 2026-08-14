"use client";
// Tarefas do PPV: atribui uma tarefa a um usuário do portal (com texto + anexos),
// notifica o atribuído, e mostra a linha do tempo (criada → visto → remarcado →
// concluída) com data/hora. O atribuído marca "visto" ao abrir, e pode
// "Lembrar depois" ou "Concluir".
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "@/lib/auth/client";
import SelecionarUsuarioModal from "./SelecionarUsuarioModal";

interface Evento { id: number; tipo: string; detalhe: string | null; autor: string | null; criado_em: string }
interface Anexo { id: number; tipo: string; url: string | null; nome_arquivo: string | null; comentario: string | null; autor: string | null; created_at: string }
interface Tarefa {
  id: number; id_pedido: string; atribuido_a: string; criado_por: string | null; descricao: string | null;
  status: string; lembrar_em: string | null; visto_em: string | null; concluido_em: string | null; concluido_por: string | null; criado_em: string;
  eventos: Evento[]; anexos: Anexo[];
}

const dt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR") : "");
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const EV = {
  criada: { i: "fa-plus", cor: "#e8730c", txt: "criou a tarefa" },
  visto: { i: "fa-eye", cor: "#2563eb", txt: "visualizou" },
  remarcado: { i: "fa-clock", cor: "#b45309", txt: "remarcou" },
  concluida: { i: "fa-check", cor: "#0f9d58", txt: "concluiu" },
  comentario: { i: "fa-comment", cor: "#64748b", txt: "comentou" },
} as Record<string, { i: string; cor: string; txt: string }>;

export default function TarefasModal({
  open, ppvId, userName, onClose, onChanged, showToast,
}: {
  open: boolean;
  ppvId: string | null;
  userName?: string;
  onClose: () => void;
  onChanged?: () => void;
  showToast: (tipo: "success" | "error", msg: string) => void;
}) {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [loading, setLoading] = useState(false);
  const [atribuido, setAtribuido] = useState("");
  const [descricao, setDescricao] = useState("");
  const [criando, setCriando] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [acaoId, setAcaoId] = useState<number | null>(null); // tarefa em ação (spinner)
  const [lembrar, setLembrar] = useState<Record<number, string>>({});
  const fileRef = useRef<Record<number, HTMLInputElement | null>>({});
  const vistoFeito = useRef<Set<number>>(new Set());

  const carregar = useCallback(async () => {
    if (!ppvId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/ppv/tarefas?id=${encodeURIComponent(ppvId)}`, { headers: { ...(await authHeaders()) } });
      const j = await r.json();
      if (r.ok) {
        setTarefas(j.tarefas || []);
        // Marca "visto" nas tarefas atribuídas a mim (uma vez).
        for (const t of (j.tarefas || []) as Tarefa[]) {
          if (t.atribuido_a === userName && !t.visto_em && !vistoFeito.current.has(t.id)) {
            vistoFeito.current.add(t.id);
            fetch(`/api/ppv/tarefas/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ acao: "visto", userName }) }).catch(() => {});
          }
        }
      } else console.error("[TarefasModal]", j?.error);
    } catch (e) { console.error("[TarefasModal]", e); }
    setLoading(false);
  }, [ppvId, userName]);

  useEffect(() => { if (open) { setAtribuido(""); setDescricao(""); vistoFeito.current = new Set(); carregar(); } }, [open, carregar]);

  if (!open || typeof document === "undefined") return null;

  const criar = async () => {
    if (!ppvId || !atribuido || !descricao.trim()) { showToast("error", "Escolha o usuário e escreva a tarefa."); return; }
    setCriando(true);
    try {
      const r = await fetch(`/api/ppv/tarefas`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ id: ppvId, atribuidoA: atribuido, descricao, userName }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Falha ao criar a tarefa.");
      showToast("success", `Tarefa atribuída a ${atribuido}.`);
      setAtribuido(""); setDescricao("");
      await carregar(); onChanged?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro."); }
    setCriando(false);
  };

  const acao = async (id: number, acaoNome: "concluir" | "remarcar", lembrarEm?: string) => {
    setAcaoId(id);
    try {
      const r = await fetch(`/api/ppv/tarefas/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ acao: acaoNome, lembrarEm, userName }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Falha na ação.");
      showToast("success", acaoNome === "concluir" ? "Tarefa concluída." : "Tarefa remarcada.");
      await carregar(); onChanged?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro."); }
    setAcaoId(null);
  };

  const anexarArquivo = async (tarefa: Tarefa, file: File) => {
    if (!ppvId) return;
    try {
      const fd = new FormData();
      fd.append("id", ppvId); fd.append("id_tarefa", String(tarefa.id)); fd.append("autor", userName || ""); fd.append("file", file);
      const r = await fetch(`/api/ppv/anexos`, { method: "POST", headers: { ...(await authHeaders()) }, body: fd });
      if (!r.ok) throw new Error((await r.json())?.error || "Falha no anexo.");
      showToast("success", "Anexo enviado.");
      await carregar();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro no anexo."); }
  };

  const badgeStatus = (t: Tarefa) => t.status === "concluida"
    ? { txt: "Concluída", bg: "#eaf7ef", fg: "#0f9d58" }
    : t.lembrar_em ? { txt: "Remarcada", bg: "#fff7ed", fg: "#b45309" }
    : t.visto_em ? { txt: "Vista", bg: "#eef3fb", fg: "#2563eb" }
    : { txt: "Pendente", bg: "#f1f5f9", fg: "#64748b" };

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70000, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", width: "100%", maxWidth: 620, maxHeight: "86vh", borderRadius: 8, boxShadow: "0 24px 60px rgba(0,0,0,.3)", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: '-apple-system,"Segoe UI",Roboto,Arial,sans-serif' }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid #eef0f3" }}>
          <span style={{ width: 34, height: 34, borderRadius: 6, background: "#e8730c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}><i className="fas fa-list-check" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b" }}>Tarefas {ppvId ? `— PPV ${ppvId}` : ""}</div>
            <div style={{ fontSize: 12, color: "#94a3b8" }}>Atribua a um usuário; ele é notificado e marca visto/concluído</div>
          </div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 6, width: 32, height: 32, cursor: "pointer", color: "#475569", fontSize: 18 }}>×</button>
        </div>

        <div style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Criar nova tarefa */}
          <div style={{ border: "1px solid #E2E8F0", borderRadius: 6, padding: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 10 }}>Nova tarefa</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input readOnly value={atribuido} onClick={() => setPickerOpen(true)} placeholder="Escolher usuário do portal…" style={{ flex: 1, height: 34, border: "1px solid #d1d5db", borderRadius: 4, padding: "0 10px", fontSize: 13.5, cursor: "pointer", outline: "none" }} />
              <button type="button" onClick={() => setPickerOpen(true)} style={{ flexShrink: 0, width: 40, borderRadius: 4, border: "1px solid #E2E8F0", background: "#fff", color: "#334155", cursor: "pointer" }}><i className="fas fa-search" /></button>
            </div>
            <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} placeholder="O que precisa ser feito neste pedido…" style={{ width: "100%", border: "1px solid #d1d5db", borderRadius: 4, padding: 10, fontSize: 13.5, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box", outline: "none" }} />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
              <button onClick={criar} disabled={criando || !atribuido || !descricao.trim()} style={{ padding: "9px 18px", borderRadius: 6, border: "none", background: atribuido && descricao.trim() ? "#e8730c" : "#f3c99a", color: "#fff", fontSize: 13.5, fontWeight: 700, cursor: atribuido && descricao.trim() ? "pointer" : "not-allowed" }}>
                {criando ? "Criando…" : "Criar tarefa"}
              </button>
            </div>
          </div>

          {/* Lista */}
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Carregando…</div>
          ) : tarefas.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Nenhuma tarefa neste pedido.</div>
          ) : tarefas.map((t) => {
            const b = badgeStatus(t);
            const souEu = t.atribuido_a === userName;
            const pendente = t.status !== "concluida";
            return (
              <div key={t.id} style={{ border: "1px solid #E2E8F0", borderLeft: "3px solid #e8730c", borderRadius: 6, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 30, height: 30, borderRadius: "50%", background: "#e8730c", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{iniciais(t.atribuido_a)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "#1e293b" }}>{t.atribuido_a}{souEu ? " (você)" : ""}</div>
                    <div style={{ fontSize: 11.5, color: "#94a3b8" }}>por {t.criado_por || "—"} · {dt(t.criado_em)}</div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 4, background: b.bg, color: b.fg }}>{b.txt}</span>
                </div>

                {t.descricao && <div style={{ fontSize: 13.5, color: "#334155", marginBottom: 10, whiteSpace: "pre-wrap" }}>{t.descricao}</div>}

                {/* Linha do tempo */}
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                  {t.eventos.map((e) => {
                    const cfg = EV[e.tipo] || EV.comentario;
                    return (
                      <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#64748b" }}>
                        <i className={`fas ${cfg.i}`} style={{ color: cfg.cor, fontSize: 11, width: 14, textAlign: "center" }} />
                        <span><b style={{ color: "#334155" }}>{e.autor || "—"}</b> {cfg.txt}{e.detalhe ? ` — ${e.detalhe}` : ""} · {dt(e.criado_em)}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Anexos da tarefa */}
                {t.anexos.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                    {t.anexos.map((a) => (
                      <div key={a.id} style={{ fontSize: 12.5, color: "#475569", display: "flex", alignItems: "center", gap: 6 }}>
                        {a.tipo === "midia"
                          ? <><i className="fas fa-paperclip" style={{ color: "#94a3b8" }} /><a href={a.url || "#"} target="_blank" rel="noreferrer" style={{ color: "#2563eb" }}>{a.nome_arquivo || "arquivo"}</a></>
                          : <><i className="fas fa-comment" style={{ color: "#94a3b8" }} /><span>{a.comentario}</span></>}
                        <span style={{ color: "#cbd5e1", fontSize: 11 }}>· {a.autor}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ações */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
                  <input ref={(el) => { fileRef.current[t.id] = el; }} type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) anexarArquivo(t, f); e.currentTarget.value = ""; }} />
                  <button onClick={() => fileRef.current[t.id]?.click()} style={{ fontSize: 12.5, fontWeight: 600, color: "#334155", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 4, padding: "6px 12px", cursor: "pointer" }}><i className="fas fa-paperclip" style={{ marginRight: 6 }} />Anexar</button>
                  {souEu && pendente && (
                    <>
                      <input type="datetime-local" value={lembrar[t.id] || ""} onChange={(e) => setLembrar((s) => ({ ...s, [t.id]: e.target.value }))} style={{ height: 30, border: "1px solid #E2E8F0", borderRadius: 4, padding: "0 8px", fontSize: 12.5 }} />
                      <button disabled={acaoId === t.id || !lembrar[t.id]} onClick={() => acao(t.id, "remarcar", new Date(lembrar[t.id]).toISOString())} style={{ fontSize: 12.5, fontWeight: 600, color: "#b45309", background: "#fff", border: "1px solid #fed7aa", borderRadius: 4, padding: "6px 12px", cursor: lembrar[t.id] ? "pointer" : "not-allowed" }}><i className="fas fa-clock" style={{ marginRight: 6 }} />Lembrar depois</button>
                      <button disabled={acaoId === t.id} onClick={() => acao(t.id, "concluir")} style={{ fontSize: 12.5, fontWeight: 700, color: "#fff", background: "#0f9d58", border: "none", borderRadius: 4, padding: "6px 14px", cursor: "pointer" }}>{acaoId === t.id ? "…" : <><i className="fas fa-check" style={{ marginRight: 6 }} />Concluir</>}</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <SelecionarUsuarioModal open={pickerOpen} atual={atribuido} onClose={() => setPickerOpen(false)} onSelect={(nome) => setAtribuido(nome)} />
    </div>,
    document.body,
  );
}
