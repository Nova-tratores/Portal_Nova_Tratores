"use client";
import { useState, useEffect, useCallback, useRef } from "react";

interface Peca { id: number; code: string; name: string; reference: string; qtd: number | null; unit: string | null; compravel?: boolean; figura?: any; figura_id?: string }
interface Figura { id: string; code: string; name: string; secao: string; thumb_url: string | null; image_url: string | null; hotspots?: { reference: string; x: number; y: number }[]; pecas?: Peca[] }
interface Secao { secao: string; ordem: number; figuras: number; thumb?: string | null }
interface Modelo { slug: string; nome: string; image_url: string | null; figuras?: number; marca?: string | null; tipo?: string | null; manual_url?: string | null; manual_nome?: string | null }
interface Marca { slug: string; nome: string; logo_url: string | null; modelos: number; tipos: string[] }

// Mascote do assistente (mecânico Nova Tratores). Se não existir no storage, cai no ícone.

// Quando embutido no fluxo de adicionar peças, recebe onSelecionarPeca; senão, copia o código.
export default function CatalogoNovo({ onSelecionarPeca, userName }: { onSelecionarPeca?: (p: { code: string; name: string }) => void; userName?: string }) {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [marcaSel, setMarcaSel] = useState<Marca | null>(null);
  const [tipoSel, setTipoSel] = useState<string>(""); // "" = todos os tipos
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

  // Navegação: marcas → modelos (filtrando por tipo) → sistemas → figura.
  const vista = busca.trim().length >= 2 ? "busca"
    : figura ? "figura"
    : secaoAtual ? "figuras"
    : modeloSel ? "secoes"
    : marcaSel ? "modelos"
    : "marcas";
  const mq = modeloSel ? `&modelo=${encodeURIComponent(modeloSel.nome)}` : "";

  useEffect(() => {
    fetch("/api/catalogo?acao=modelos").then((r) => r.json()).then((d) => {
      const lista: Modelo[] = Array.isArray(d) ? d : [];
      setModelos(lista);
    }).catch(() => {});
    fetch("/api/catalogo?acao=marcas").then((r) => r.json()).then((d) => {
      const lista: Marca[] = Array.isArray(d) ? d : [];
      setMarcas(lista);
      if (lista.length === 1) setMarcaSel(lista[0]); // uma marca só → entra direto
    }).catch(() => {});
  }, []);

  // Modelos da marca escolhida, respeitando o filtro de tipo
  const modelosDaMarca = modelos.filter((m) => m.marca === marcaSel?.nome);
  const tiposDaMarca = [...new Set(modelosDaMarca.map((m) => m.tipo).filter(Boolean))] as string[];
  const modelosVisiveis = tipoSel ? modelosDaMarca.filter((m) => m.tipo === tipoSel) : modelosDaMarca;
  // Na tela inicial as marcas ficam abertas (modelos à mostra), com o filtro de tipo valendo pra todas.
  const tiposTodos = [...new Set(modelos.map((m) => m.tipo).filter(Boolean))].sort() as string[];
  const porTipo = (lista: Modelo[]) => (tipoSel ? lista.filter((m) => m.tipo === tipoSel) : lista);

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

  const voltar = () => {
    if (figura) setFigura(null);
    else if (secaoAtual) setSecaoAtual("");
    else if (modeloSel) { setModeloSel(null); if (marcas.length > 1) setMarcaSel(null); } // volta pra tela inicial (marcas abertas)
    else if (marcaSel && marcas.length > 1) setMarcaSel(null);
  };
  const irParaMarcas = () => { setMarcaSel(null); setTipoSel(""); setModeloSel(null); setSecaoAtual(""); setFigura(null); };

  const abrirModelo = (m: Modelo) => {
    if (!marcaSel) setMarcaSel(marcas.find((mc) => mc.nome === m.marca) || null);
    setModeloSel(m); setSecaoAtual(""); setFigura(null);
  };

  // Card de modelo (usado na tela inicial e dentro da marca)
  const cardModelo = (m: Modelo) => (
    <button key={m.slug} className="cat-card" onClick={() => abrirModelo(m)} style={{ padding: 0, borderRadius: 14, border: "1px solid #e9ecf1", background: "#fff", cursor: "pointer", overflow: "hidden", textAlign: "left" }}>
      <div style={{ height: 184, background: "linear-gradient(180deg,#fbfcfe,#eef2f7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 14, position: "relative" }}>
        {m.tipo && <span style={{ position: "absolute", top: 10, left: 10, fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: .6, padding: "3px 9px", borderRadius: 999, background: "#0f172a", color: "#fff", opacity: .82 }}>{m.tipo}</span>}
        {m.manual_url && <span title="Tem manual de instrução" style={{ position: "absolute", top: 10, right: 10, width: 24, height: 24, borderRadius: 7, background: "#dc2626", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}><i className="fas fa-book" /></span>}
        {m.image_url && !imgErro[m.slug] ? <img src={m.image_url} alt={m.nome} onError={() => setImgErro((s) => ({ ...s, [m.slug]: true }))} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <i className="fas fa-tractor" style={{ fontSize: 46, color: "#cbd5e1" }} />}
      </div>
      <div style={{ padding: "13px 15px", borderTop: "1px solid #f0f2f6", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{m.nome}</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>{m.figuras || 0} figuras</div>
        </div>
        <i className="fas fa-chevron-right" style={{ fontSize: 12, color: "#cbd5e1" }} />
      </div>
    </button>
  );

  // Chips de tipo (Todos / Trator / Implemento / Autopropelido)
  const chipsTipo = (tipos: string[], universo: Modelo[]) => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {["", ...tipos].map((t) => {
        const ativo = tipoSel === t;
        const n = t ? universo.filter((m) => m.tipo === t).length : universo.length;
        return (
          <button key={t || "todos"} onClick={() => setTipoSel(t)}
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 15px", borderRadius: 999, border: `1.5px solid ${ativo ? "#dc2626" : "#e3e8ef"}`, background: ativo ? "#dc2626" : "#fff", color: ativo ? "#fff" : "#475569", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .12s" }}>
            {t || "Todos"}
            <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 999, background: ativo ? "rgba(255,255,255,.22)" : "#f1f5f9", color: ativo ? "#fff" : "#94a3b8" }}>{n}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f7f8fa", borderRadius: 14, overflow: "hidden", color: "#0f172a", fontFamily: "'Inter','Segoe UI',system-ui,sans-serif" }}>
      <style>{`
        .cat-card{transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;box-shadow:0 1px 2px rgba(16,24,40,.05);}
        .cat-card:hover{transform:translateY(-2px);box-shadow:0 12px 26px rgba(16,24,40,.10);border-color:#d3dae5;}
        .cat-back:hover{background:#eef1f6 !important;color:#0f172a !important;}
        .cat-add{transition:filter .15s,transform .08s;}
        .cat-add:hover{filter:brightness(1.08);}
        .cat-add:active{transform:scale(.92);}
        .cat-input:focus{border-color:#dc2626 !important;box-shadow:0 0 0 3px rgba(220,38,38,.12);}
        .cat-row:hover{background:#f8fafc;}
        .cat-crumb{cursor:pointer;transition:color .12s;}
        .cat-crumb:hover{color:#dc2626;text-decoration:underline;}
        .cat-scroll::-webkit-scrollbar{width:9px;height:9px;}
        .cat-scroll::-webkit-scrollbar-thumb{background:#d7dde6;border-radius:8px;}
        .cat-scroll::-webkit-scrollbar-thumb:hover{background:#c2cad6;}
      `}</style>

      {/* Barra superior: busca + breadcrumb */}
      <div style={{ padding: "13px 18px", borderBottom: "1px solid #e9ecf1", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", background: "#fff" }}>
        <div style={{ position: "relative", flex: "1 1 300px", maxWidth: 480 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#9aa4b2", fontSize: 13 }} />
          <input className="cat-input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={modeloSel ? `Buscar em ${modeloSel.nome}…` : "Buscar peça por nome ou código…"}
            style={{ width: "100%", padding: "11px 14px 11px 38px", borderRadius: 10, border: "1px solid #e3e8ef", fontSize: 14, boxSizing: "border-box", outline: "none", background: "#f8fafc", transition: "border-color .15s, box-shadow .15s" }} />
          {busca && <button onClick={() => setBusca("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", cursor: "pointer", color: "#9aa4b2" }}><i className="fas fa-times" /></button>}
        </div>
        {vista !== "busca" && (
          <div style={{ fontSize: 13, color: "#64748b", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {(secaoAtual || figura || modeloSel || (marcaSel && marcas.length > 1)) && <button className="cat-back" onClick={voltar} style={{ display: "flex", alignItems: "center", gap: 7, border: "1px solid #e3e8ef", background: "#fff", color: "#334155", borderRadius: 9, padding: "7px 13px", cursor: "pointer", fontSize: 13, fontWeight: 600, transition: "background .15s,color .15s" }}><i className="fas fa-arrow-left" style={{ fontSize: 11 }} /> Voltar</button>}
            <span className="cat-crumb" onClick={irParaMarcas} style={{ fontWeight: 600 }}>Catálogo</span>
            {marcaSel && <><span style={{ color: "#cbd5e1" }}>›</span><span className="cat-crumb" onClick={() => { setModeloSel(null); setSecaoAtual(""); setFigura(null); }}>{marcaSel.nome}</span></>}
            {modeloSel && <><span style={{ color: "#cbd5e1" }}>›</span><span className="cat-crumb" onClick={() => { setSecaoAtual(""); setFigura(null); }}>{modeloSel.nome}</span></>}
            {secaoAtual && <><span style={{ color: "#cbd5e1" }}>›</span><span className="cat-crumb" onClick={() => setFigura(null)}>{secaoAtual}</span></>}
            {figura && <><span style={{ color: "#cbd5e1" }}>›</span><span style={{ fontWeight: 700, color: "#0f172a" }}>{figura.code} · {figura.name}</span></>}
          </div>
        )}
      </div>

      <div className="cat-scroll" style={{ flex: 1, overflow: "auto", position: "relative" }}>
        {loading && <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(247,248,250,0.72)", zIndex: 5, fontSize: 13, color: "#64748b" }}><i className="fas fa-circle-notch fa-spin" style={{ marginRight: 8, color: "#dc2626" }} /> Carregando…</div>}

        {/* ===== BUSCA ===== */}
        {vista === "busca" && (
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 12.5, color: "#94a3b8", marginBottom: 12, fontWeight: 500 }}>{resultados.length} resultado(s) para “{busca.trim()}”{modeloSel ? ` em ${modeloSel.nome}` : ""}</div>
            {resultados.length === 0 ? (
              <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}><i className="fas fa-magnifying-glass" style={{ fontSize: 26, display: "block", marginBottom: 10, color: "#cbd5e1" }} />Nenhuma peça encontrada.</div>
            ) : (
              <div style={{ background: "#fff", border: "1px solid #e9ecf1", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,.04)" }}>
                {resultados.map((p) => (
                  <div key={p.id} className="cat-row" style={{ display: "flex", alignItems: "center", gap: 14, padding: "11px 14px", borderBottom: "1px solid #f1f4f8", transition: "background .12s" }}>
                    <code style={{ fontSize: 12.5, fontWeight: 700, color: "#dc2626", background: "#fef2f2", padding: "4px 9px", borderRadius: 7, whiteSpace: "nowrap" }}>{p.code}</code>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{p.name}</div>
                      {p.figura && <button onClick={() => { setBusca(""); abrirFigura(p.figura_id!); }} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontSize: 11.5, color: "#2563eb", fontWeight: 600 }}>{p.figura.secao} · {p.figura.code} {p.figura.name} →</button>}
                    </div>
                    <span style={{ fontSize: 12.5, color: "#64748b", whiteSpace: "nowrap" }}>{p.qtd} {p.unit}</span>
                    <button className="cat-add" onClick={() => addPeca({ code: p.code, name: p.name })} title={onSelecionarPeca ? "Adicionar ao lançamento" : "Adicionar ao carrinho"}
                      style={{ border: "none", background: "#dc2626", color: "#fff", borderRadius: 8, width: 32, height: 32, cursor: "pointer", flexShrink: 0 }}><i className="fas fa-plus" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== TELA INICIAL: marcas abertas, com os modelos à mostra ===== */}
        {vista === "marcas" && (
          <div style={{ padding: 18 }}>
            {tiposTodos.length > 1 && chipsTipo(tiposTodos, modelos)}

            {marcas.map((mc) => {
              const lista = porTipo(modelos.filter((m) => m.marca === mc.nome));
              if (lista.length === 0) return null; // marca sem modelo neste tipo
              return (
                <div key={mc.slug} style={{ marginBottom: 26 }}>
                  {/* Cabeçalho da marca (clicável = ver só ela) */}
                  <div onClick={() => setMarcaSel(mc)} title={`Ver só ${mc.nome}`}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", borderRadius: 12, background: "#fff", border: "1px solid #e9ecf1", marginBottom: 14, cursor: "pointer", boxShadow: "0 1px 2px rgba(16,24,40,.05)" }}>
                    {mc.logo_url && !imgErro[`marca:${mc.slug}`]
                      ? <img src={mc.logo_url} alt={mc.nome} onError={() => setImgErro((s) => ({ ...s, [`marca:${mc.slug}`]: true }))} style={{ height: 36, maxWidth: 120, objectFit: "contain" }} />
                      : <div style={{ fontSize: 18, fontWeight: 900, color: "#0f172a", letterSpacing: 1 }}>{mc.nome}</div>}
                    <div style={{ width: 1, height: 28, background: "#eef1f6" }} />
                    <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>
                      {lista.length} {lista.length === 1 ? "modelo" : "modelos"}
                      {tipoSel ? ` · ${tipoSel}` : mc.tipos.length ? ` · ${mc.tipos.join(" · ")}` : ""}
                    </div>
                    <i className="fas fa-chevron-right" style={{ marginLeft: "auto", fontSize: 12, color: "#cbd5e1" }} />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 18 }}>
                    {lista.map(cardModelo)}
                  </div>
                </div>
              );
            })}
            {marcas.length === 0 && <div style={{ padding: 30, color: "#94a3b8" }}>Nenhuma marca com catálogo.</div>}
          </div>
        )}

        {/* ===== MODELOS DA MARCA (com filtro por tipo) ===== */}
        {vista === "modelos" && marcaSel && (
          <div style={{ padding: 18 }}>
            {/* Cabeçalho da marca */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", borderRadius: 14, background: "#fff", border: "1px solid #e9ecf1", marginBottom: 16 }}>
              {marcaSel.logo_url && !imgErro[`marca:${marcaSel.slug}`] && (
                <img src={marcaSel.logo_url} alt={marcaSel.nome} onError={() => setImgErro((s) => ({ ...s, [`marca:${marcaSel.slug}`]: true }))} style={{ height: 40, maxWidth: 130, objectFit: "contain" }} />
              )}
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", lineHeight: 1.15 }}>{marcaSel.nome}</div>
                <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 2 }}>{modelosVisiveis.length} de {modelosDaMarca.length} modelos</div>
              </div>
            </div>

            {/* Filtro por tipo — só aparece se a marca tiver mais de um */}
            {tiposDaMarca.length > 1 && chipsTipo(tiposDaMarca, modelosDaMarca)}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 18 }}>
              {modelosVisiveis.map(cardModelo)}
              {modelosVisiveis.length === 0 && <div style={{ padding: 30, color: "#94a3b8" }}>Nenhum modelo neste tipo.</div>}
            </div>
          </div>
        )}

        {/* ===== SISTEMAS DO TRATOR ===== */}
        {vista === "secoes" && modeloSel && (
          <div style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 18, padding: 18, borderRadius: 14, background: "#fff", border: "1px solid #e9ecf1", marginBottom: 20, position: "relative", overflow: "hidden", boxShadow: "0 1px 2px rgba(16,24,40,.05)" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: "#dc2626" }} />
              <div style={{ width: 120, height: 84, borderRadius: 10, overflow: "hidden", background: "linear-gradient(180deg,#fbfcfe,#eef2f7)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid #eef1f6", marginLeft: 6 }}>
                {modeloSel.image_url && !imgErro[modeloSel.slug] ? <img src={modeloSel.image_url} alt={modeloSel.nome} onError={() => setImgErro((s) => ({ ...s, [modeloSel.slug]: true }))} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <i className="fas fa-tractor" style={{ fontSize: 32, color: "#cbd5e1" }} />}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", letterSpacing: 1.2, textTransform: "uppercase" }}>{modeloSel.marca || "Trator"}</div>
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.15, color: "#0f172a" }}>{modeloSel.nome}</div>
                <div style={{ fontSize: 12.5, color: "#94a3b8", marginTop: 3 }}>{secoes.reduce((a, s) => a + s.figuras, 0)} figuras · {secoes.length} sistemas</div>
              </div>
              {/* Manual de instrução — ao lado da foto, quando o modelo tem */}
              {modeloSel.manual_url && (
                <a href={modeloSel.manual_url} target="_blank" rel="noopener noreferrer"
                  title={modeloSel.manual_nome || "Abrir o manual de instrução (PDF)"}
                  style={{
                    marginLeft: "auto", marginRight: 6, display: "flex", alignItems: "center", gap: 9,
                    padding: "11px 18px", borderRadius: 11, border: "none",
                    background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff",
                    fontSize: 13.5, fontWeight: 700, textDecoration: "none",
                    boxShadow: "0 4px 12px rgba(220,38,38,.28)", flexShrink: 0,
                  }}>
                  <i className="fas fa-book" style={{ fontSize: 15 }} />
                  <span style={{ lineHeight: 1.2 }}>
                    Manual de instrução
                    <span style={{ display: "block", fontSize: 10.5, fontWeight: 500, opacity: 0.85 }}>Abrir o PDF</span>
                  </span>
                </a>
              )}
            </div>

            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, margin: "2px 2px 12px" }}>Sistemas</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(186px, 1fr))", gap: 14 }}>
              {secoes.map((s) => (
                <button key={s.secao} className="cat-card" onClick={() => abrirSecao(s.secao)} style={{ textAlign: "left", padding: 0, borderRadius: 12, border: "1px solid #e9ecf1", background: "#fff", cursor: "pointer", overflow: "hidden" }}>
                  <div style={{ height: 116, background: "linear-gradient(180deg,#fbfcfe,#eef2f7)", display: "flex", alignItems: "center", justifyContent: "center", borderBottom: "1px solid #f0f2f6", padding: 10 }}>
                    {s.thumb ? <img src={s.thumb} alt={s.secao} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <div style={{ width: 44, height: 44, borderRadius: 11, background: (corSecao[s.secao] || "#64748b") + "18", color: corSecao[s.secao] || "#64748b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17 }}><i className="fas fa-gears" /></div>}
                  </div>
                  <div style={{ padding: "11px 13px" }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, color: "#0f172a" }}>{s.secao}</div>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 1 }}>{s.figuras} figura{s.figuras !== 1 ? "s" : ""}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ===== FIGURAS DA SEÇÃO ===== */}
        {vista === "figuras" && (
          <div style={{ padding: 18, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(176px, 1fr))", gap: 14 }}>
            {figuras.map((f) => (
              <button key={f.id} className="cat-card" onClick={() => abrirFigura(f.id)} style={{ padding: 0, borderRadius: 12, border: "1px solid #e9ecf1", background: "#fff", cursor: "pointer", overflow: "hidden", textAlign: "left" }}>
                <div style={{ height: 134, background: "linear-gradient(180deg,#fbfcfe,#eef2f7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 8 }}>
                  {f.thumb_url || f.image_url ? <img src={f.thumb_url || f.image_url || ""} alt={f.name} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <i className="fas fa-image" style={{ fontSize: 26, color: "#cbd5e1" }} />}
                </div>
                <div style={{ padding: "9px 11px", borderTop: "1px solid #f0f2f6" }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#dc2626", letterSpacing: 0.3 }}>{f.code}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3, color: "#0f172a", marginTop: 1 }}>{f.name}</div>
                </div>
              </button>
            ))}
            {figuras.length === 0 && !loading && <div style={{ padding: 30, color: "#94a3b8", gridColumn: "1/-1" }}>Nenhuma figura nesta seção.</div>}
          </div>
        )}

        {/* ===== DETALHE DA FIGURA (vista explodida + peças) ===== */}
        {vista === "figura" && figura && (
          <div style={{ display: "flex", gap: 0, height: "100%", flexWrap: "wrap", background: "#fff" }}>
            <div style={{ flex: "1 1 360px", minWidth: 300, padding: 18, borderRight: "1px solid #eef0f3" }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#dc2626", letterSpacing: 0.5 }}>{figura.code}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#0f172a" }}>{figura.name}</div>
              </div>
              <div style={{ position: "relative", width: "100%", background: "linear-gradient(180deg,#fbfcfe,#f1f4f8)", borderRadius: 12, overflow: "hidden", border: "1px solid #eef1f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {figura.image_url ? (
                  <>
                    <img src={figura.image_url} alt={figura.name} onLoad={(e) => setImgDim({ w: (e.target as HTMLImageElement).naturalWidth || 1, h: (e.target as HTMLImageElement).naturalHeight || 1 })} style={{ width: "100%", display: "block" }} />
                    {(figura.hotspots || []).map((h) => {
                      const ativo = refHover === h.reference;
                      return (
                        <button key={h.reference} onClick={() => { setRefHover(h.reference); rowRefs.current[h.reference]?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }}
                          onMouseEnter={() => setRefHover(h.reference)} onMouseLeave={() => setRefHover(null)}
                          style={{ position: "absolute", left: `${(h.x / imgDim.w) * 100}%`, top: `${(h.y / imgDim.h) * 100}%`, transform: "translate(-50%,-50%)", width: ativo ? 26 : 20, height: ativo ? 26 : 20, borderRadius: "50%", border: "2px solid #fff", background: ativo ? "#dc2626" : "rgba(37,99,235,0.9)", color: "#fff", fontSize: ativo ? 12 : 10, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 5px rgba(0,0,0,0.4)", transition: "all .12s", zIndex: ativo ? 3 : 2 }}>{h.reference}</button>
                      );
                    })}
                  </>
                ) : <div style={{ padding: 50, color: "#cbd5e1" }}><i className="fas fa-image" style={{ fontSize: 36 }} /></div>}
              </div>
            </div>

            <div style={{ flex: "1 1 340px", minWidth: 300, display: "flex", flexDirection: "column", maxHeight: "100%" }}>
              <div style={{ display: "flex", padding: "12px 16px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #eef0f3", background: "#fafbfc", position: "sticky", top: 0, zIndex: 1 }}>
                <span style={{ width: 40 }}>Ref</span><span style={{ width: 124 }}>Código</span><span style={{ flex: 1 }}>Nome</span><span style={{ width: 46 }}>Qtd</span><span style={{ width: 36 }} />
              </div>
              <div className="cat-scroll" style={{ overflow: "auto", flex: 1 }}>
                {(figura.pecas || []).map((p) => {
                  const ativo = refHover === p.reference;
                  return (
                    <div key={p.id} ref={(el) => { rowRefs.current[p.reference] = el; }} onMouseEnter={() => setRefHover(p.reference)} onMouseLeave={() => setRefHover(null)}
                      style={{ display: "flex", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #f3f5f8", background: ativo ? "#fff7ed" : "transparent", transition: "background .12s" }}>
                      <span style={{ width: 40 }}><span style={{ display: "inline-flex", width: 23, height: 23, borderRadius: "50%", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, background: ativo ? "#dc2626" : "#eef2f7", color: ativo ? "#fff" : "#475569" }}>{p.reference}</span></span>
                      <code style={{ width: 124, fontSize: 12.5, fontWeight: 700, color: "#dc2626" }}>{p.code}</code>
                      <span style={{ flex: 1, fontSize: 13, paddingRight: 8, color: "#0f172a" }}>{p.name}</span>
                      <span style={{ width: 46, fontSize: 12, color: "#64748b" }}>{p.qtd} {p.unit}</span>
                      <button className="cat-add" onClick={() => addPeca({ code: p.code, name: p.name })} title={onSelecionarPeca ? "Adicionar ao lançamento" : "Adicionar ao carrinho"} style={{ width: 32, height: 32, border: "none", background: "#dc2626", color: "#fff", borderRadius: 8, cursor: "pointer" }}><i className="fas fa-plus" /></button>
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
        <button className="cat-add" onClick={() => setCartOpen(true)} style={{ position: "absolute", bottom: 18, right: 18, zIndex: 40, display: "flex", alignItems: "center", gap: 9, padding: "13px 19px", borderRadius: 13, border: "none", background: "linear-gradient(135deg,#ef4444,#dc2626)", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", boxShadow: "0 8px 22px rgba(220,38,38,0.40)" }}>
          <i className="fas fa-cart-shopping" /> Carrinho <span style={{ background: "#fff", color: "#dc2626", borderRadius: 20, padding: "2px 9px", fontSize: 12, fontWeight: 800 }}>{cart.reduce((s, i) => s + i.qty, 0)}</span>
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

      {toast && <div style={{ position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)", background: "#0f172a", color: "#fff", padding: "10px 18px", borderRadius: 11, fontSize: 13, fontWeight: 600, zIndex: 50, boxShadow: "0 8px 24px rgba(15,23,42,0.3)", display: "flex", alignItems: "center", gap: 8 }}><i className="fas fa-circle-check" style={{ color: "#4ade80" }} /> {toast}</div>}
    </div>
  );
}
