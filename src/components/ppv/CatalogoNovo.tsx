"use client";
import { useState, useEffect, useCallback, useRef } from "react";

interface Peca { id: number; code: string; name: string; reference: string; qtd: number | null; unit: string | null; compravel?: boolean; figura?: any; figura_id?: string }
interface Figura { id: string; code: string; name: string; secao: string; thumb_url: string | null; image_url: string | null; hotspots?: { reference: string; x: number; y: number }[]; pecas?: Peca[] }
interface Secao { secao: string; ordem: number; figuras: number; thumb?: string | null }
interface Modelo { slug: string; nome: string; image_url: string | null; figuras?: number }

// Quando embutido no fluxo de adicionar peças, recebe onSelecionarPeca; senão, copia o código.
export default function CatalogoNovo({ onSelecionarPeca, userName }: { onSelecionarPeca?: (p: { code: string; name: string }) => void; userName?: string }) {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [modeloSel, setModeloSel] = useState<Modelo | null>(null);
  const [secoes, setSecoes] = useState<Secao[]>([]);
  const [secaoAtual, setSecaoAtual] = useState<string>("");
  const [figuras, setFiguras] = useState<Figura[]>([]);
  const [figura, setFigura] = useState<Figura | null>(null);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<Peca[]>([]);
  const [loading, setLoading] = useState(false);
  const [refHover, setRefHover] = useState<string | null>(null);
  const [imgDim, setImgDim] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [toast, setToast] = useState("");
  const [imgErro, setImgErro] = useState<Record<string, boolean>>({});
  const [roboOn, setRoboOn] = useState(false);
  const [roboQ, setRoboQ] = useState("");
  const [roboData, setRoboData] = useState<{ modelo: string | null; termos: string[]; pecas: Peca[] } | null>(null);
  const [roboLoading, setRoboLoading] = useState(false);
  // Carrinho (só no modo avulso — sem onSelecionarPeca)
  const [cart, setCart] = useState<{ code: string; name: string; qty: number }[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cliQ, setCliQ] = useState("");
  const [cliRes, setCliRes] = useState<any[]>([]);
  const [cliSel, setCliSel] = useState<any | null>(null);
  const [criando, setCriando] = useState(false);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const addToCart = useCallback((p: { code: string; name: string }) => {
    setCart((prev) => {
      const i = prev.findIndex((x) => x.code === p.code);
      if (i >= 0) { const c = [...prev]; c[i] = { ...c[i], qty: c[i].qty + 1 }; return c; }
      return [...prev, { code: p.code, name: p.name, qty: 1 }];
    });
    setToast(`No carrinho: ${p.code}`); setTimeout(() => setToast(""), 1400);
  }, []);
  const setQty = (code: string, q: number) => setCart((prev) => prev.map((x) => (x.code === code ? { ...x, qty: Math.max(1, q) } : x)));
  const removeFromCart = (code: string) => setCart((prev) => prev.filter((x) => x.code !== code));

  // busca de cliente (no carrinho)
  useEffect(() => {
    if (!cartOpen) return;
    const q = cliQ.trim();
    if (q.length < 2) { setCliRes([]); return; }
    const t = setTimeout(async () => { try { const r = await fetch(`/api/ppv/clientes?termo=${encodeURIComponent(q)}`); setCliRes(r.ok ? await r.json() : []); } catch { setCliRes([]); } }, 300);
    return () => clearTimeout(t);
  }, [cliQ, cartOpen]);

  const criarDoc = useCallback(async (tipoDoc: "ppv" | "orcamento") => {
    if (!cliSel) { setToast("Escolha o cliente."); setTimeout(() => setToast(""), 2200); return; }
    if (cart.length === 0) return;
    setCriando(true);
    try {
      const r = await fetch("/api/catalogo/criar-doc", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: tipoDoc, items: cart.map((c) => ({ codigo: c.code, descricao: c.name, quantidade: c.qty })), cliente: cliSel, userName: userName || "" }),
      });
      const j = await r.json();
      if (r.ok) {
        setToast(tipoDoc === "ppv" ? `PPV ${j.id || ""} criado!` : `Orçamento ${j.numero || ""} criado!`);
        setCart([]); setCliSel(null); setCliQ(""); setCartOpen(false);
      } else setToast(j.error || "Erro ao criar.");
    } catch { setToast("Erro de conexão."); }
    setCriando(false);
    setTimeout(() => setToast(""), 3500);
  }, [cliSel, cart, userName]);

  const perguntarRobo = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    const q = roboQ.trim();
    if (q.length < 2) return;
    setRoboLoading(true); setRoboData(null);
    try { const r = await fetch(`/api/catalogo?acao=robo&q=${encodeURIComponent(q)}`); setRoboData(r.ok ? await r.json() : { modelo: null, termos: [], pecas: [] }); }
    catch { setRoboData({ modelo: null, termos: [], pecas: [] }); }
    setRoboLoading(false);
  }, [roboQ]);

  const vista = busca.trim().length >= 2 ? "busca" : figura ? "figura" : secaoAtual ? "figuras" : modeloSel ? "secoes" : "modelos";
  const mq = modeloSel ? `&modelo=${encodeURIComponent(modeloSel.nome)}` : "";

  useEffect(() => {
    fetch("/api/catalogo?acao=modelos").then((r) => r.json()).then((d) => {
      const lista = Array.isArray(d) ? d : [];
      setModelos(lista);
      if (lista.length === 1) setModeloSel(lista[0]); // 1 trator → entra direto
    }).catch(() => {});
  }, []);

  // carrega seções do trator selecionado
  useEffect(() => {
    if (!modeloSel) { setSecoes([]); return; }
    fetch(`/api/catalogo?acao=secoes&modelo=${encodeURIComponent(modeloSel.nome)}`).then((r) => r.json()).then((d) => setSecoes(Array.isArray(d) ? d : [])).catch(() => {});
  }, [modeloSel]);

  const abrirSecao = useCallback(async (s: string) => {
    setSecaoAtual(s); setFigura(null); setLoading(true);
    try {
      const r = await fetch(`/api/catalogo?acao=figuras&secao=${encodeURIComponent(s)}${mq}`);
      setFiguras(r.ok ? await r.json() : []);
    } catch { setFiguras([]); }
    setLoading(false);
  }, [mq]);

  const abrirFigura = useCallback(async (id: string) => {
    setLoading(true); setRefHover(null);
    try {
      const r = await fetch(`/api/catalogo/figura/${id}`);
      const f = r.ok ? await r.json() : null;
      setFigura(f);
      if (f && !secaoAtual) setSecaoAtual(f.secao);
    } catch { setFigura(null); }
    setLoading(false);
  }, [secaoAtual]);

  // busca (debounce) — dentro do trator selecionado
  useEffect(() => {
    const q = busca.trim();
    if (q.length < 2) { setResultados([]); return; }
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/catalogo?acao=busca&q=${encodeURIComponent(q)}${mq}`); setResultados(r.ok ? await r.json() : []); } catch { setResultados([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [busca, mq]);

  const addPeca = useCallback((p: { code: string; name: string }) => {
    if (onSelecionarPeca) { onSelecionarPeca(p); setToast(`Adicionado: ${p.code}`); setTimeout(() => setToast(""), 2200); }
    else addToCart(p); // modo avulso → carrinho
  }, [onSelecionarPeca, addToCart]);

  const corSecao: Record<string, string> = { Motor: "#dc2626", "Transmissão": "#2563eb", "Sistema Hidráulico": "#7c3aed", "Eixo Dianteiro": "#0891b2", "Elétrica": "#ca8a04", Lataria: "#0d9488", Freio: "#be123c", Embreagem: "#9333ea", "Diferencial": "#0369a1", "Direção": "#65a30d" };

  const voltar = () => { if (figura) setFigura(null); else if (secaoAtual) setSecaoAtual(""); else if (modelos.length > 1) setModeloSel(null); };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#fff", borderRadius: 14, overflow: "hidden", color: "#1e293b" }}>
      {/* Barra: busca + breadcrumb */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #eef0f3", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 280px", maxWidth: 460 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13 }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={modeloSel ? `Buscar em ${modeloSel.nome}…` : "Buscar peça por nome ou código…"}
            style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, boxSizing: "border-box", outline: "none" }} />
          {busca && <button onClick={() => setBusca("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8" }}><i className="fas fa-times" /></button>}
        </div>
        {vista !== "busca" && (
          <div style={{ fontSize: 13, color: "#64748b", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {(secaoAtual || figura || (modeloSel && modelos.length > 1)) && <button onClick={voltar} style={{ display: "flex", alignItems: "center", gap: 6, border: "none", background: "#dc2626", color: "#fff", borderRadius: 9, padding: "7px 13px", cursor: "pointer", fontSize: 13, fontWeight: 700, boxShadow: "0 2px 7px rgba(220,38,38,0.35)" }}><i className="fas fa-arrow-left" /> Voltar</button>}
            <span onClick={() => { if (modelos.length > 1) setModeloSel(null); setSecaoAtual(""); setFigura(null); }} style={{ cursor: "pointer", fontWeight: 700 }}>Catálogo</span>
            {modeloSel && <><span>›</span><span onClick={() => { setSecaoAtual(""); setFigura(null); }} style={{ cursor: "pointer" }}>{modeloSel.nome}</span></>}
            {secaoAtual && <><span>›</span><span onClick={() => setFigura(null)} style={{ cursor: "pointer" }}>{secaoAtual}</span></>}
            {figura && <><span>›</span><span style={{ fontWeight: 700, color: "#1e293b" }}>{figura.code} · {figura.name}</span></>}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => setRoboOn(true)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px rgba(124,58,237,0.35)" }}><i className="fas fa-robot" /> Assistente</button>
      </div>

      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        {loading && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.6)", zIndex: 5, fontSize: 13, color: "#64748b" }}>Carregando…</div>}

        {/* ===== ROBÔ / ASSISTENTE ===== */}
        {roboOn && (
          <div style={{ position: "absolute", inset: 0, background: "#fff", zIndex: 10, overflow: "auto" }}>
            <div style={{ maxWidth: 780, margin: "0 auto", padding: "22px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <div style={{ width: 46, height: 46, borderRadius: 12, background: "linear-gradient(135deg,#7c3aed,#6d28d9)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}><i className="fas fa-robot" /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 17, fontWeight: 800 }}>Assistente de Peças</div>
                  <div style={{ fontSize: 12.5, color: "#94a3b8" }}>Descreva a peça que você precisa, com suas palavras.</div>
                </div>
                <button onClick={() => setRoboOn(false)} style={{ border: "none", background: "#f1f5f9", borderRadius: 9, width: 34, height: 34, cursor: "pointer", color: "#475569" }}><i className="fas fa-times" /></button>
              </div>
              <form onSubmit={perguntarRobo} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={roboQ} onChange={(e) => setRoboQ(e.target.value)} autoFocus placeholder="Ex: bomba d'água do 6065 · junta do cabeçote · filtro de óleo do Jivo" style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 14, outline: "none" }} />
                <button type="submit" style={{ padding: "0 20px", borderRadius: 10, border: "none", background: "#7c3aed", color: "#fff", fontWeight: 700, cursor: "pointer" }}>Perguntar</button>
              </form>
              <div style={{ fontSize: 11.5, color: "#cbd5e1", marginBottom: 14 }}>Dica: cite o trator pra filtrar (ex: “do 6065”, “do Jivo”).</div>

              {roboLoading && <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}>Procurando…</div>}
              {roboData && (
                <div>
                  <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 10 }}>
                    {roboData.modelo ? <b>Trator: {roboData.modelo} · </b> : null}
                    {roboData.pecas.length} peça(s){roboData.termos.length ? ` para “${roboData.termos.join(" ")}”` : ""}
                  </div>
                  {roboData.pecas.length === 0 ? (
                    <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>Não achei nada. Tente outras palavras ou cite outro trator.</div>
                  ) : roboData.pecas.map((p) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", borderBottom: "1px solid #f1f5f9" }}>
                      <code style={{ fontSize: 13, fontWeight: 800, color: "#dc2626", background: "#fef2f2", padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>{p.code}</code>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                        {p.figura && <button onClick={() => { setRoboOn(false); abrirFigura(p.figura_id!); }} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontSize: 11.5, color: "#2563eb" }}>{p.figura.modelo} · {p.figura.secao} · {p.figura.code} →</button>}
                      </div>
                      <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{p.qtd} {p.unit}</span>
                      <button onClick={() => addPeca({ code: p.code, name: p.name })} title={onSelecionarPeca ? "Adicionar" : "Copiar código"} style={{ border: "none", background: "#dc2626", color: "#fff", borderRadius: 8, width: 30, height: 30, cursor: "pointer", flexShrink: 0 }}><i className="fas fa-plus" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== BUSCA ===== */}
        {vista === "busca" && (
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>{resultados.length} resultado(s) para “{busca.trim()}”{modeloSel ? ` em ${modeloSel.nome}` : ""}</div>
            {resultados.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>Nenhuma peça encontrada.</div>
            ) : resultados.map((p) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderBottom: "1px solid #f1f5f9", borderRadius: 8 }}>
                <code style={{ fontSize: 13, fontWeight: 800, color: "#dc2626", background: "#fef2f2", padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>{p.code}</code>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                  {p.figura && <button onClick={() => { setBusca(""); abrirFigura(p.figura_id!); }} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontSize: 11.5, color: "#2563eb" }}>{p.figura.secao} · {p.figura.code} {p.figura.name} →</button>}
                </div>
                <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap" }}>{p.qtd} {p.unit}</span>
                <button onClick={() => addPeca({ code: p.code, name: p.name })} title={onSelecionarPeca ? "Adicionar ao lançamento" : "Copiar código"}
                  style={{ border: "none", background: "#dc2626", color: "#fff", borderRadius: 8, width: 30, height: 30, cursor: "pointer", flexShrink: 0 }}><i className="fas fa-plus" /></button>
              </div>
            ))}
          </div>
        )}

        {/* ===== TRATORES ===== */}
        {vista === "modelos" && (
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 2px 12px" }}>Tratores</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {modelos.map((m) => (
                <button key={m.slug} onClick={() => { setModeloSel(m); setSecaoAtual(""); setFigura(null); }} style={{ padding: 0, borderRadius: 16, border: "1px solid #e8edf3", background: "#fff", cursor: "pointer", overflow: "hidden", textAlign: "left", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div style={{ height: 200, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {m.image_url && !imgErro[m.slug] ? <img src={m.image_url} alt={m.nome} onError={() => setImgErro((s) => ({ ...s, [m.slug]: true }))} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <i className="fas fa-tractor" style={{ fontSize: 48, color: "#cbd5e1" }} />}
                  </div>
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ fontSize: 18, fontWeight: 900 }}>{m.nome}</div>
                    <div style={{ fontSize: 12.5, color: "#94a3b8" }}>{m.figuras || 0} figuras</div>
                  </div>
                </button>
              ))}
              {modelos.length === 0 && <div style={{ padding: 30, color: "#94a3b8" }}>Nenhum trator cadastrado.</div>}
            </div>
          </div>
        )}

        {/* ===== SISTEMAS DO TRATOR ===== */}
        {vista === "secoes" && modeloSel && (
          <div style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, borderRadius: 16, background: "linear-gradient(135deg, #fef2f2, #ffffff)", border: "1px solid #fee2e2", marginBottom: 18 }}>
              <div style={{ width: 110, height: 80, borderRadius: 12, overflow: "hidden", background: "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #fde2e2" }}>
                {modeloSel.image_url && !imgErro[modeloSel.slug] ? <img src={modeloSel.image_url} alt={modeloSel.nome} onError={() => setImgErro((s) => ({ ...s, [modeloSel.slug]: true }))} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <i className="fas fa-tractor" style={{ fontSize: 32, color: "#fca5a5" }} />}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#dc2626", letterSpacing: 1, textTransform: "uppercase" }}>Trator</div>
                <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.1 }}>{modeloSel.nome}</div>
                <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 2 }}>{secoes.reduce((a, s) => a + s.figuras, 0)} figuras · {secoes.length} sistemas</div>
              </div>
            </div>

            <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 2px 10px" }}>Sistemas</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
              {secoes.map((s) => (
                <button key={s.secao} onClick={() => abrirSecao(s.secao)} style={{ textAlign: "left", padding: 0, borderRadius: 14, border: "1px solid #e8edf3", background: "#fff", cursor: "pointer", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                  <div style={{ height: 112, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #eef0f3" }}>
                    {s.thumb ? <img src={s.thumb} alt={s.secao} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <div style={{ width: 40, height: 40, borderRadius: 10, background: (corSecao[s.secao] || "#64748b") + "1a", color: corSecao[s.secao] || "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}><i className="fas fa-gears" /></div>}
                  </div>
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{s.secao}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>{s.figuras} figura{s.figuras !== 1 ? "s" : ""}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ===== FIGURAS DA SEÇÃO ===== */}
        {vista === "figuras" && (
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
            {figuras.map((f) => (
              <button key={f.id} onClick={() => abrirFigura(f.id)} style={{ padding: 0, borderRadius: 14, border: "1px solid #e8edf3", background: "#fff", cursor: "pointer", overflow: "hidden", textAlign: "left" }}>
                <div style={{ height: 130, background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {f.thumb_url || f.image_url ? <img src={f.thumb_url || f.image_url || ""} alt={f.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <i className="fas fa-image" style={{ fontSize: 28, color: "#cbd5e1" }} />}
                </div>
                <div style={{ padding: "8px 10px" }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: "#dc2626" }}>{f.code}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{f.name}</div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ===== DETALHE DA FIGURA (vista explodida + peças) ===== */}
        {vista === "figura" && figura && (
          <div style={{ display: "flex", gap: 0, height: "100%", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 340px", minWidth: 300, padding: 16, borderRight: "1px solid #eef0f3" }}>
              <div style={{ position: "relative", width: "100%", background: "#f8fafc", borderRadius: 12, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {figura.image_url ? (
                  <>
                    <img src={figura.image_url} alt={figura.name} onLoad={(e) => setImgDim({ w: (e.target as HTMLImageElement).naturalWidth || 1, h: (e.target as HTMLImageElement).naturalHeight || 1 })} style={{ width: "100%", display: "block" }} />
                    {(figura.hotspots || []).map((h) => {
                      const ativo = refHover === h.reference;
                      return (
                        <button key={h.reference} onClick={() => { setRefHover(h.reference); rowRefs.current[h.reference]?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }}
                          onMouseEnter={() => setRefHover(h.reference)} onMouseLeave={() => setRefHover(null)}
                          style={{ position: "absolute", left: `${(h.x / imgDim.w) * 100}%`, top: `${(h.y / imgDim.h) * 100}%`, transform: "translate(-50%,-50%)", width: ativo ? 26 : 20, height: ativo ? 26 : 20, borderRadius: "50%", border: "2px solid #fff", background: ativo ? "#dc2626" : "rgba(37,99,235,0.85)", color: "#fff", fontSize: ativo ? 12 : 10, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,0.4)", transition: "all .12s", zIndex: ativo ? 3 : 2 }}>{h.reference}</button>
                      );
                    })}
                  </>
                ) : <div style={{ padding: 50, color: "#cbd5e1" }}><i className="fas fa-image" style={{ fontSize: 36 }} /></div>}
              </div>
            </div>

            <div style={{ flex: "1 1 320px", minWidth: 300, display: "flex", flexDirection: "column", maxHeight: "100%" }}>
              <div style={{ display: "flex", padding: "10px 14px", fontSize: 11, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #eef0f3" }}>
                <span style={{ width: 36 }}>Ref</span><span style={{ width: 120 }}>Código</span><span style={{ flex: 1 }}>Nome</span><span style={{ width: 44 }}>Qtd</span><span style={{ width: 34 }} />
              </div>
              <div style={{ overflow: "auto", flex: 1 }}>
                {(figura.pecas || []).map((p) => {
                  const ativo = refHover === p.reference;
                  return (
                    <div key={p.id} ref={(el) => { rowRefs.current[p.reference] = el; }} onMouseEnter={() => setRefHover(p.reference)} onMouseLeave={() => setRefHover(null)}
                      style={{ display: "flex", alignItems: "center", padding: "9px 14px", borderBottom: "1px solid #f5f7fa", background: ativo ? "#fff7ed" : "transparent" }}>
                      <span style={{ width: 36 }}><span style={{ display: "inline-flex", width: 22, height: 22, borderRadius: "50%", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, background: ativo ? "#dc2626" : "#eef2f7", color: ativo ? "#fff" : "#475569" }}>{p.reference}</span></span>
                      <code style={{ width: 120, fontSize: 12.5, fontWeight: 700, color: "#dc2626" }}>{p.code}</code>
                      <span style={{ flex: 1, fontSize: 13, paddingRight: 8 }}>{p.name}</span>
                      <span style={{ width: 44, fontSize: 12, color: "#64748b" }}>{p.qtd} {p.unit}</span>
                      <button onClick={() => addPeca({ code: p.code, name: p.name })} title={onSelecionarPeca ? "Adicionar ao lançamento" : "Copiar código"} style={{ width: 30, height: 30, border: "none", background: "#dc2626", color: "#fff", borderRadius: 8, cursor: "pointer" }}><i className="fas fa-plus" /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Botão flutuante do carrinho (modo avulso) */}
      {!onSelecionarPeca && cart.length > 0 && !cartOpen && (
        <button onClick={() => setCartOpen(true)} style={{ position: "absolute", bottom: 16, right: 16, zIndex: 40, display: "flex", alignItems: "center", gap: 8, padding: "12px 18px", borderRadius: 14, border: "none", background: "#dc2626", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer", boxShadow: "0 6px 20px rgba(220,38,38,0.45)" }}>
          <i className="fas fa-cart-shopping" /> Carrinho <span style={{ background: "#fff", color: "#dc2626", borderRadius: 20, padding: "1px 9px", fontSize: 12 }}>{cart.reduce((s, i) => s + i.qty, 0)}</span>
        </button>
      )}

      {/* Gaveta do carrinho */}
      {!onSelecionarPeca && cartOpen && (
        <div style={{ position: "absolute", inset: 0, zIndex: 45, display: "flex", justifyContent: "flex-end" }}>
          <div onClick={() => setCartOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} />
          <div style={{ position: "relative", width: 420, maxWidth: "94%", height: "100%", background: "#fff", boxShadow: "-8px 0 30px rgba(0,0,0,0.2)", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid #eef0f3", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 16, fontWeight: 800 }}><i className="fas fa-cart-shopping" style={{ color: "#dc2626", marginRight: 8 }} />Carrinho ({cart.reduce((s, i) => s + i.qty, 0)})</div>
              <button onClick={() => setCartOpen(false)} style={{ border: "none", background: "#f1f5f9", borderRadius: 9, width: 32, height: 32, cursor: "pointer", color: "#475569" }}><i className="fas fa-times" /></button>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
              {cart.length === 0 ? <div style={{ padding: 30, textAlign: "center", color: "#94a3b8" }}>Carrinho vazio.</div> : cart.map((it) => (
                <div key={it.code} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid #f5f7fa" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</div>
                    <code style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>{it.code}</code>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button onClick={() => setQty(it.code, it.qty - 1)} style={{ width: 26, height: 26, border: "1px solid #e2e8f0", background: "#fff", borderRadius: 7, cursor: "pointer" }}>−</button>
                    <input value={it.qty} onChange={(e) => setQty(it.code, parseInt(e.target.value) || 1)} style={{ width: 38, textAlign: "center", border: "1px solid #e2e8f0", borderRadius: 7, padding: "4px 0", fontSize: 13 }} />
                    <button onClick={() => setQty(it.code, it.qty + 1)} style={{ width: 26, height: 26, border: "1px solid #e2e8f0", background: "#fff", borderRadius: 7, cursor: "pointer" }}>+</button>
                  </div>
                  <button onClick={() => removeFromCart(it.code)} style={{ border: "none", background: "transparent", color: "#cbd5e1", cursor: "pointer", padding: 4 }} title="Remover"><i className="fas fa-trash" /></button>
                </div>
              ))}
            </div>

            <div style={{ borderTop: "1px solid #eef0f3", padding: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Cliente</div>
              {cliSel ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, background: "#f0fdf4", border: "1px solid #bbf7d0", marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cliSel.nome}</div>
                    <div style={{ fontSize: 11.5, color: "#64748b" }}>{cliSel.documento}{cliSel.cidade ? ` · ${cliSel.cidade}` : ""}</div>
                  </div>
                  <button onClick={() => { setCliSel(null); setCliQ(""); }} style={{ border: "none", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Trocar</button>
                </div>
              ) : (
                <div style={{ position: "relative", marginBottom: 12 }}>
                  <input value={cliQ} onChange={(e) => setCliQ(e.target.value)} placeholder="Buscar cliente (nome ou CNPJ)…" style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13.5, boxSizing: "border-box", outline: "none" }} />
                  {cliRes.length > 0 && (
                    <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 4, maxHeight: 200, overflow: "auto", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 -6px 20px rgba(0,0,0,0.12)", zIndex: 5 }}>
                      {cliRes.map((c, i) => (
                        <button key={i} onClick={() => { setCliSel(c); setCliRes([]); }} style={{ display: "block", width: "100%", textAlign: "left", border: "none", background: "transparent", padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid #f1f5f9" }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{c.nome}</div>
                          <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.documento}{c.cidade ? ` · ${c.cidade}` : ""}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button disabled={criando || cart.length === 0 || !cliSel} onClick={() => criarDoc("orcamento")} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "1.5px solid #ea580c", background: "#fff", color: "#ea580c", fontWeight: 800, fontSize: 13.5, cursor: "pointer", opacity: criando || !cliSel ? 0.5 : 1 }}><i className="fas fa-file-invoice" /> Orçamento</button>
                <button disabled={criando || cart.length === 0 || !cliSel} onClick={() => criarDoc("ppv")} style={{ flex: 1, padding: "12px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: "pointer", opacity: criando || !cliSel ? 0.5 : 1 }}><i className="fas fa-box" /> PPV</button>
              </div>
              <div style={{ fontSize: 11, color: "#cbd5e1", marginTop: 8, textAlign: "center" }}>Os preços são puxados do Omie ao criar o documento.</div>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "absolute", bottom: 16, left: "50%", transform: "translateX(-50%)", background: "#1e293b", color: "#fff", padding: "8px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 50 }}>{toast}</div>}
    </div>
  );
}
