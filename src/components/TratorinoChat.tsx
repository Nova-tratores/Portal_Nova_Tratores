"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";

const MASCOTE_IMG = (process.env.NEXT_PUBLIC_SUPABASE_URL || "") + "/storage/v1/object/public/catalogo/mascote2-removebg-preview.png";

interface Msg { role: "user" | "assistant"; content: string; proposta?: any; feito?: boolean; abrirUrl?: string; moderacao?: boolean }

const FONTE = "'Montserrat', sans-serif";
const LAUNCHER = 132;
const WIN_W = 384, WIN_H = 600;
const SAUDACAO: Msg = { role: "assistant", content: "Oi! Eu sou o Tratorilson, o mecânico da Nova Tratores.\nPosso te ajudar com o portal: peças, catálogo, ordens, PPV, orçamentos, requisições… O que você precisa?" };

// Renderiza markdown leve: **negrito**, `código`, e links [texto](url) — preservando quebras de linha
function renderConteudo(text: string): Array<string | React.ReactElement> {
  const out: Array<string | React.ReactElement> = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(<strong key={k++} style={{ fontWeight: 800 }}>{m[1]}</strong>);
    } else if (m[2] !== undefined) {
      out.push(<code key={k++} style={{ background: "#f1f5f9", color: "#dc2626", padding: "1px 6px", borderRadius: 5, fontSize: "0.92em", fontWeight: 700 }}>{m[2]}</code>);
    } else {
      const url = m[4];
      const blank = url.startsWith("/api/") || url.startsWith("http");
      out.push(<a key={k++} href={url} target={blank ? "_blank" : "_self"} rel="noreferrer" style={{ color: "#dc2626", fontWeight: 700, textDecoration: "underline" }}>{m[3]}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

interface TratorilsonProps { userName?: string; userId?: string; isAdmin?: boolean; modulos?: string[] }

export default function TratorinoChat({ userName = "", userId = "", isAdmin = false, modulos = [] }: TratorilsonProps) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([SAUDACAO]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mascoteErro, setMascoteErro] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [winPos, setWinPos] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const posRef = useRef(pos); posRef.current = pos;
  const winRef = useRef(winPos); winRef.current = winPos;

  // Posição inicial do mascote (persistida)
  useEffect(() => {
    try {
      const s = localStorage.getItem("tratorilson_pos");
      if (s) { setPos(JSON.parse(s)); return; }
    } catch {}
    setPos({ x: window.innerWidth - LAUNCHER - 14, y: Math.round(window.innerHeight / 2 - LAUNCHER / 2) });
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 150); }, [open]);
  useEffect(() => { bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" }); }, [msgs, loading]);

  const openChat = useCallback(() => {
    const lx = posRef.current?.x ?? (window.innerWidth - 150);
    const ly = posRef.current?.y ?? 120;
    let x = lx + LAUNCHER + 12;
    if (x + WIN_W > window.innerWidth - 8) x = lx - WIN_W - 12;
    if (x < 8) x = clamp((window.innerWidth - WIN_W) / 2, 8, window.innerWidth - WIN_W - 8);
    const y = clamp(ly + LAUNCHER / 2 - WIN_H / 2, 8, window.innerHeight - WIN_H - 8);
    setWinPos({ x: Math.round(x), y: Math.round(y) });
    setOpen(true);
  }, []);

  // --- Drag do mascote (clica = abre, arrasta = move) ---
  const lDrag = useRef({ down: false, moved: false, sx: 0, sy: 0, bx: 0, by: 0 });
  const lDown = (e: React.PointerEvent) => {
    if (!pos) return;
    lDrag.current = { down: true, moved: false, sx: e.clientX, sy: e.clientY, bx: pos.x, by: pos.y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const lMove = (e: React.PointerEvent) => {
    const d = lDrag.current; if (!d.down) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    setPos({ x: clamp(d.bx + dx, 8, window.innerWidth - LAUNCHER - 8), y: clamp(d.by + dy, 8, window.innerHeight - LAUNCHER - 8) });
  };
  const lUp = () => {
    const d = lDrag.current; if (!d.down) return; d.down = false;
    if (!d.moved) openChat();
    else { try { localStorage.setItem("tratorilson_pos", JSON.stringify(posRef.current)); } catch {} }
  };

  // --- Drag da janela pelo cabeçalho ---
  const wDrag = useRef({ down: false, sx: 0, sy: 0, bx: 0, by: 0 });
  const wDown = (e: React.PointerEvent) => {
    if (!winPos) return;
    // Não inicia arraste se o clique foi num botão (fechar/limpar) — senão "rouba" o clique
    if ((e.target as HTMLElement).closest("button")) return;
    wDrag.current = { down: true, sx: e.clientX, sy: e.clientY, bx: winPos.x, by: winPos.y };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const wMove = (e: React.PointerEvent) => {
    const d = wDrag.current; if (!d.down) return;
    setWinPos({ x: clamp(d.bx + (e.clientX - d.sx), 8, window.innerWidth - WIN_W - 8), y: clamp(d.by + (e.clientY - d.sy), 8, window.innerHeight - WIN_H - 8) });
  };
  const wUp = () => { wDrag.current.down = false; };

  const enviar = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    const texto = input.trim();
    if (!texto || loading) return;
    const base = msgs;
    const novas = [...msgs, { role: "user" as const, content: texto }];
    setMsgs(novas);
    setInput("");
    setLoading(true);
    try {
      const r = await fetch("/api/assistente/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: novas.filter((m) => m !== SAUDACAO), userName, userId, isAdmin, modulos }),
      });
      const j = await r.json();
      if (j.bloqueado) {
        // Apaga a mensagem imprópria do usuário e mostra o aviso
        setMsgs([...base, { role: "assistant", content: j.reply, moderacao: true }]);
      } else {
        setMsgs((m) => [...m, { role: "assistant", content: j.reply || "Não consegui responder agora.", proposta: j.proposta }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "assistant", content: "Deu ruim na conexão. Tenta de novo?" }]);
    }
    setLoading(false);
  }, [input, loading, msgs]);

  const confirmarProposta = useCallback(async (idx: number, proposta: any) => {
    setLoading(true);
    setMsgs((ms) => ms.map((m, i) => (i === idx ? { ...m, feito: true } : m)));
    try {
      const r = await fetch("/api/assistente/executar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ proposta, userName }) });
      const j = await r.json();
      if (r.ok) { const L: any = { orcamento: "Orçamento", ppv: "PPV", os: "OS", requisicao: "Requisição" }; setMsgs((ms) => [...ms, { role: "assistant", content: `Pronto! ${L[proposta.tipo] || ""} ${j.numero || ""} criado.`, abrirUrl: j.abrirUrl }]); }
      else setMsgs((ms) => [...ms, { role: "assistant", content: `Não consegui criar: ${j.error || "erro"}` }]);
    } catch { setMsgs((ms) => [...ms, { role: "assistant", content: "Erro de conexão ao criar." }]); }
    setLoading(false);
  }, [userName]);

  const cancelarProposta = useCallback((idx: number) => {
    setMsgs((ms) => ms.map((m, i) => (i === idx ? { ...m, feito: true } : m)).concat([{ role: "assistant", content: "Beleza, cancelei. Quer ajustar alguma coisa?" }]));
  }, []);

  const brl = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const Avatar = ({ size, anim }: { size: number; anim?: boolean }) => (
    <div className={!mascoteErro && anim ? (loading ? "mascote-think" : "mascote-anim") : ""} style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {!mascoteErro ? <img src={MASCOTE_IMG} alt="Tratorilson" draggable={false} onError={() => setMascoteErro(true)} style={{ width: "100%", height: "100%", objectFit: "contain", filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.28))", pointerEvents: "none" }} /> : <i className="fas fa-robot" style={{ fontSize: size * 0.5, color: "#dc2626" }} />}
    </div>
  );

  return (
    <>
      <style>{`
        @keyframes trtFade { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes trtMsg { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes trtDot { 0%, 60%, 100% { transform: translateY(0); opacity: .4; } 30% { transform: translateY(-4px); opacity: 1; } }
        @keyframes trtRing { 0% { transform: scale(.9); opacity: .55; } 70% { transform: scale(1.5); opacity: 0; } 100% { opacity: 0; } }
        .trt-win { animation: trtFade .22s ease-out; }
        .trt-bubble { animation: trtMsg .25s ease-out; }
        .trt-dot { width: 7px; height: 7px; border-radius: 50%; background: #dc2626; display: inline-block; animation: trtDot 1.2s infinite; }
        .trt-scroll::-webkit-scrollbar { width: 7px; }
        .trt-scroll::-webkit-scrollbar-thumb { background: #d4dae3; border-radius: 8px; }
        .trt-icon-btn { border: none; background: rgba(255,255,255,0.16); color: #fff; width: 32px; height: 32px; border-radius: 9px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .15s; }
        .trt-icon-btn:hover { background: rgba(255,255,255,0.32); }
      `}</style>

      {/* Mascote flutuante (arrastável; clique abre) */}
      {!open && pos && (
        <div
          onPointerDown={lDown} onPointerMove={lMove} onPointerUp={lUp}
          onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          title="Arraste para mover · clique para falar com o Tratorilson"
          style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 59000, width: LAUNCHER, height: LAUNCHER, cursor: "grab", touchAction: "none", userSelect: "none" }}
        >
          {/* halo */}
          <span style={{ position: "absolute", inset: 14, borderRadius: "50%", background: "radial-gradient(circle, rgba(220,38,38,0.22), transparent 70%)" }} />
          <span style={{ position: "absolute", inset: 22, borderRadius: "50%", border: "2px solid rgba(220,38,38,0.35)", animation: "trtRing 2.4s ease-out infinite" }} />
          <Avatar size={LAUNCHER} anim />
          {/* status online */}
          <span style={{ position: "absolute", top: 18, right: 22, background: "#22c55e", border: "2.5px solid #fff", width: 16, height: 16, borderRadius: "50%", boxShadow: "0 1px 4px rgba(0,0,0,.3)" }} />
          {/* tooltip */}
          {hover && (
            <div style={{ position: "absolute", right: LAUNCHER - 6, top: "50%", transform: "translateY(-50%)", whiteSpace: "nowrap", background: "#0f172a", color: "#fff", padding: "7px 12px", borderRadius: 10, fontSize: 12.5, fontWeight: 600, fontFamily: FONTE, boxShadow: "0 6px 18px rgba(0,0,0,.25)" }}>
              Fale com o Tratorilson
            </div>
          )}
        </div>
      )}

      {/* Janela de chat */}
      {open && winPos && (
        <div className="trt-win" style={{ position: "fixed", left: winPos.x, top: winPos.y, zIndex: 59000, width: WIN_W, maxWidth: "calc(100vw - 16px)", height: WIN_H, maxHeight: "calc(100vh - 16px)", background: "#fff", borderRadius: 20, boxShadow: "0 24px 70px rgba(15,23,42,0.32)", display: "flex", flexDirection: "column", overflow: "hidden", border: "1px solid #e9ecf2", fontFamily: FONTE }}>
          {/* Header (arrastável) */}
          <div onPointerDown={wDown} onPointerMove={wMove} onPointerUp={wUp} style={{ background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 60%, #7f1d1d 100%)", padding: "13px 14px", display: "flex", alignItems: "center", gap: 11, cursor: "grab", touchAction: "none", position: "relative" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Avatar size={40} anim />
            </div>
            <div style={{ flex: 1, color: "#fff", minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.15, letterSpacing: 0.2 }}>Tratorilson</div>
              <div style={{ fontSize: 11.5, opacity: 0.92, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
                Assistente de IA · online
              </div>
            </div>
            <button onClick={() => { setMsgs([SAUDACAO]); setInput(""); }} title="Limpar conversa" className="trt-icon-btn" style={{ marginRight: 4 }}><i className="fas fa-trash" /></button>
            <button onClick={() => setOpen(false)} title="Fechar" className="trt-icon-btn"><i className="fas fa-times" /></button>
          </div>

          {/* Mensagens */}
          <div ref={bodyRef} className="trt-scroll" style={{ flex: 1, overflow: "auto", padding: "16px 14px", background: "linear-gradient(180deg, #f7f8fb 0%, #eef1f6 100%)", display: "flex", flexDirection: "column", gap: 12 }}>
            {msgs.map((m, i) => (
              <div key={i} className="trt-bubble" style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: 6 }}>
                <div style={{
                  maxWidth: "88%", padding: "10px 14px", borderRadius: 16, fontSize: 13.5, lineHeight: 1.55, whiteSpace: "pre-wrap",
                  background: m.moderacao ? "#fffbeb" : m.role === "user" ? "linear-gradient(135deg, #ef4444, #dc2626)" : "#fff",
                  color: m.moderacao ? "#92400e" : m.role === "user" ? "#fff" : "#1e293b",
                  border: m.moderacao ? "1px solid #fcd34d" : m.role === "user" ? "none" : "1px solid #e8edf3",
                  boxShadow: m.role === "user" ? "0 4px 12px rgba(220,38,38,0.22)" : "0 2px 8px rgba(15,23,42,0.05)",
                  borderBottomRightRadius: m.role === "user" ? 5 : 16, borderBottomLeftRadius: m.role === "user" ? 16 : 5,
                }}>
                  {m.moderacao && <i className="fas fa-triangle-exclamation" style={{ marginRight: 7, color: "#d97706" }} />}
                  {m.role === "assistant" ? renderConteudo(m.content) : m.content}
                </div>

                {m.abrirUrl && (
                  <a href={m.abrirUrl} style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 15px", borderRadius: 11, background: "linear-gradient(135deg, #0ea5a4, #0d9488)", color: "#fff", textDecoration: "none", fontSize: 13, fontWeight: 700, boxShadow: "0 4px 12px rgba(13,148,136,0.3)" }}><i className="fas fa-up-right-from-square" /> Abrir / Imprimir</a>
                )}

                {m.proposta && !m.feito && (
                  <div style={{ width: "92%", border: "1px solid #fecaca", borderRadius: 15, overflow: "hidden", background: "#fff", boxShadow: "0 6px 18px rgba(15,23,42,0.08)" }}>
                    <div style={{ padding: "11px 14px", background: "linear-gradient(135deg, #fef2f2, #fee2e2)", borderBottom: "1px solid #fee2e2", fontSize: 13, fontWeight: 800, color: "#991b1b", display: "flex", alignItems: "center", gap: 8 }}>
                      <i className="fas fa-file-circle-plus" />
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
                      <div style={{ maxHeight: 220, overflow: "auto" }}>
                        {(m.proposta.resumo || []).map((f: any, k: number) => (
                          <div key={k} style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: "1px solid #f5f7fa", fontSize: 12.5 }}>
                            <span style={{ color: "#94a3b8", minWidth: 80, fontWeight: 700 }}>{f.label}</span>
                            <span style={{ flex: 1 }}>{f.valor}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8, padding: 12 }}>
                      <button onClick={() => cancelarProposta(i)} style={{ flex: 1, padding: "10px", borderRadius: 11, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 700, cursor: "pointer", fontSize: 13 }}>Cancelar</button>
                      <button onClick={() => confirmarProposta(i, m.proposta)} disabled={loading} style={{ flex: 1.4, padding: "10px", borderRadius: 11, border: "none", background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff", fontWeight: 800, cursor: "pointer", fontSize: 13, opacity: loading ? 0.6 : 1, boxShadow: "0 4px 12px rgba(220,38,38,0.3)" }}>Confirmar e criar</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "12px 16px", borderRadius: 16, borderBottomLeftRadius: 5, background: "#fff", border: "1px solid #e8edf3", display: "flex", alignItems: "center", gap: 5, boxShadow: "0 2px 8px rgba(15,23,42,0.05)" }}>
                  <span className="trt-dot" style={{ animationDelay: "0s" }} />
                  <span className="trt-dot" style={{ animationDelay: ".18s" }} />
                  <span className="trt-dot" style={{ animationDelay: ".36s" }} />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={enviar} style={{ display: "flex", gap: 9, padding: "12px 12px 8px", borderTop: "1px solid #eef0f3", background: "#fff" }}>
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} placeholder="Escreva sua mensagem…" style={{ flex: 1, padding: "12px 16px", borderRadius: 14, border: "1px solid #e2e8f0", fontSize: 14, outline: "none", background: "#f8fafc", fontFamily: FONTE }} onFocus={(e) => (e.target.style.borderColor = "#dc2626")} onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")} />
            <button type="submit" disabled={loading || !input.trim()} style={{ width: 48, height: 48, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff", cursor: "pointer", fontSize: 16, opacity: loading || !input.trim() ? 0.45 : 1, flexShrink: 0, boxShadow: "0 4px 12px rgba(220,38,38,0.3)" }}><i className="fas fa-paper-plane" /></button>
          </form>
          <div style={{ textAlign: "center", fontSize: 10.5, color: "#94a3b8", padding: "0 0 9px", background: "#fff", fontFamily: FONTE }}>
            IA · pode cometer erros, confira dados importantes
          </div>
        </div>
      )}
    </>
  );
}
