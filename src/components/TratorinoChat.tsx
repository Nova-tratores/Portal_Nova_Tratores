"use client";
import { useState, useRef, useEffect, useCallback } from "react";

const MASCOTE_IMG = (process.env.NEXT_PUBLIC_SUPABASE_URL || "") + "/storage/v1/object/public/catalogo/mascote_final.png";

interface Msg { role: "user" | "assistant"; content: string; proposta?: any; feito?: boolean; abrirUrl?: string }

const FONTE = "'Montserrat', sans-serif";
const SAUDACAO: Msg = { role: "assistant", content: "Oi! Eu sou o Tratorilson, o mecânico da Nova Tratores.\nPosso te ajudar com o portal: peças, catálogo, ordens, PPV, orçamentos, requisições… O que você precisa?" };

export default function TratorinoChat() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([SAUDACAO]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mascoteErro, setMascoteErro] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 150); }, [open]);
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, loading]);

  const enviar = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const texto = input.trim();
    if (!texto || loading) return;
    const novas = [...msgs, { role: "user" as const, content: texto }];
    setMsgs(novas);
    setInput("");
    setLoading(true);
    try {
      const r = await fetch("/api/assistente/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: novas.filter((m) => m !== SAUDACAO) }),
      });
      const j = await r.json();
      setMsgs((m) => [...m, { role: "assistant", content: j.reply || "Não consegui responder agora.", proposta: j.proposta }]);
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Deu ruim na conexão. Tenta de novo?" }]);
    }
    setLoading(false);
  }, [input, loading, msgs]);

  const confirmarProposta = useCallback(async (idx: number, proposta: any) => {
    setLoading(true);
    setMsgs((ms) => ms.map((m, i) => (i === idx ? { ...m, feito: true } : m)));
    try {
      const r = await fetch("/api/assistente/executar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposta, userName: "" }) });
      const j = await r.json();
      if (r.ok) { const L: any = { orcamento: "Orçamento", ppv: "PPV", os: "OS", requisicao: "Requisição" }; setMsgs((ms) => [...ms, { role: "assistant", content: `Pronto! ${L[proposta.tipo] || ""} ${j.numero || ""} criado.`, abrirUrl: j.abrirUrl }]); }
      else setMsgs((ms) => [...ms, { role: "assistant", content: `Não consegui criar: ${j.error || "erro"}` }]);
    } catch { setMsgs((ms) => [...ms, { role: "assistant", content: "Erro de conexão ao criar." }]); }
    setLoading(false);
  }, []);

  const cancelarProposta = useCallback((idx: number) => {
    setMsgs((ms) => ms.map((m, i) => (i === idx ? { ...m, feito: true } : m)).concat([{ role: "assistant", content: "Beleza, cancelei. Quer ajustar alguma coisa?" }]));
  }, []);

  const brl = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const Avatar = ({ size, anim }: { size: number; anim?: boolean }) => (
    <div className={!mascoteErro && anim ? (loading ? "mascote-think" : "mascote-anim") : ""} style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {!mascoteErro ? <img src={MASCOTE_IMG} alt="Tratorilson" onError={() => setMascoteErro(true)} style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.25))" }} /> : <i className="fas fa-robot" style={{ fontSize: size * 0.5, color: "#dc2626" }} />}
    </div>
  );

  return (
    <>
      {/* Botão flutuante (mascote) */}
      {!open && (
        <button onClick={() => setOpen(true)} title="Falar com o Tratorilson" style={{ position: "fixed", top: "50%", right: 6, transform: "translateY(-50%)", zIndex: 59000, border: "none", background: "transparent", cursor: "pointer", padding: 0, width: 172, height: 172 }}>
          <Avatar size={172} anim />
          <span style={{ position: "absolute", top: 22, right: 26, background: "#22c55e", border: "2px solid #fff", width: 16, height: 16, borderRadius: "50%" }} />
        </button>
      )}

      {/* Janela de chat */}
      {open && (
        <div style={{ position: "fixed", top: "50%", right: 22, transform: "translateY(-50%)", zIndex: 59000, width: 380, maxWidth: "calc(100vw - 24px)", height: 560, maxHeight: "calc(100vh - 60px)", background: "#fff", borderRadius: 18, boxShadow: "0 18px 50px rgba(0,0,0,0.28)", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #eef0f3", fontFamily: FONTE }}>
          {/* Header */}
          <div style={{ background: "linear-gradient(135deg, #dc2626, #991b1b)", padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
            <Avatar size={46} anim />
            <div style={{ flex: 1, color: "#fff" }}>
              <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.1 }}>Tratorilson</div>
              <div style={{ fontSize: 11.5, opacity: 0.9 }}>Mecânico assistente · Nova Tratores</div>
            </div>
            <button onClick={() => { setMsgs([SAUDACAO]); setInput(""); }} title="Limpar conversa" style={{ border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", width: 32, height: 32, borderRadius: 9, cursor: "pointer", marginRight: 6 }}><i className="fas fa-trash" /></button>
            <button onClick={() => setOpen(false)} title="Fechar" style={{ border: "none", background: "rgba(255,255,255,0.2)", color: "#fff", width: 32, height: 32, borderRadius: 9, cursor: "pointer" }}><i className="fas fa-times" /></button>
          </div>

          {/* Mensagens */}
          <div ref={bodyRef} style={{ flex: 1, overflow: "auto", padding: "14px", background: "#f8fafc", display: "flex", flexDirection: "column", gap: 10 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: 6 }}>
                <div style={{ maxWidth: "88%", padding: "9px 13px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.5, whiteSpace: "pre-wrap", background: m.role === "user" ? "#dc2626" : "#fff", color: m.role === "user" ? "#fff" : "#1e293b", border: m.role === "user" ? "none" : "1px solid #e8edf3", borderBottomRightRadius: m.role === "user" ? 4 : 14, borderBottomLeftRadius: m.role === "user" ? 14 : 4 }}>{m.content}</div>

                {m.abrirUrl && (
                  <a href={m.abrirUrl} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 10, background: "#0d9488", color: "#fff", textDecoration: "none", fontSize: 13, fontWeight: 700 }}><i className="fas fa-up-right-from-square" /> Abrir / Imprimir</a>
                )}

                {m.proposta && !m.feito && (
                  <div style={{ width: "92%", border: "1px solid #fecaca", borderRadius: 14, overflow: "hidden", background: "#fff" }}>
                    <div style={{ padding: "10px 14px", background: "#fef2f2", borderBottom: "1px solid #fee2e2", fontSize: 13, fontWeight: 800, color: "#991b1b" }}>
                      Criar {({ orcamento: "Orçamento", ppv: "PPV", os: "OS", requisicao: "Requisição" } as any)[m.proposta.tipo] || ""}{m.proposta.cliente?.nome ? " — " + m.proposta.cliente.nome : ""}
                    </div>
                    {m.proposta.itens ? (
                      <>
                        <div style={{ maxHeight: 180, overflow: "auto" }}>
                          {(m.proposta.itens || []).map((it: any, k: number) => (
                            <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px", borderBottom: "1px solid #f5f7fa", fontSize: 12.5 }}>
                              <code style={{ fontWeight: 700, color: "#dc2626", whiteSpace: "nowrap" }}>{it.codigo}</code>
                              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.descricao}</span>
                              <span style={{ color: "#64748b", whiteSpace: "nowrap" }}>{it.quantidade}× {brl(it.preco)}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ padding: "8px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #eef0f3", fontSize: 13 }}>
                          <span style={{ color: "#64748b" }}>Total</span>
                          <b>{brl(m.proposta.total)}</b>
                        </div>
                      </>
                    ) : (
                      <div style={{ maxHeight: 200, overflow: "auto" }}>
                        {(m.proposta.resumo || []).map((f: any, k: number) => (
                          <div key={k} style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: "1px solid #f5f7fa", fontSize: 12.5 }}>
                            <span style={{ color: "#94a3b8", minWidth: 80, fontWeight: 700 }}>{f.label}</span>
                            <span style={{ flex: 1 }}>{f.valor}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, padding: 12 }}>
                      <button onClick={() => cancelarProposta(i)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
                      <button onClick={() => confirmarProposta(i, m.proposta)} disabled={loading} style={{ flex: 1.4, padding: "10px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13, opacity: loading ? 0.6 : 1 }}>Confirmar e criar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "10px 14px", borderRadius: 14, background: "#fff", border: "1px solid #e8edf3", color: "#94a3b8", fontSize: 13 }}>Tratorilson está digitando…</div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={enviar} style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #eef0f3", background: "#fff" }}>
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Pergunte algo sobre o portal…" style={{ flex: 1, padding: "11px 14px", borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 14, outline: "none" }} />
            <button type="submit" disabled={loading || !input.trim()} style={{ width: 46, borderRadius: 12, border: "none", background: "#dc2626", color: "#fff", cursor: "pointer", fontSize: 16, opacity: loading || !input.trim() ? 0.5 : 1 }}><i className="fas fa-paper-plane" /></button>
          </form>
        </div>
      )}
    </>
  );
}
