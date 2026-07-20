"use client";

import { useEffect, useState, useCallback } from "react";

interface Carrinho { id: string; nome: string; cliente: string; modelo: string; modelo_slug: string; servico: string; status: string; criado_por?: string; criado_em: string; atualizado_em: string; expira_em: string; total_itens?: number }
interface Item { id: string; codigo: string; descricao: string; qtd: number; cadastrado: boolean }
interface Hist { id: string; quem: string; acao: string; detalhe: string; quando: string }

const ACAO_LABEL: Record<string, string> = {
  criar: "Criou o carrinho", add_item: "Adicionou peça", rem_item: "Removeu peça",
  editar: "Editou os dados", fechar: "Fechou o carrinho", reabrir: "Reabriu o carrinho",
  excluir: "Moveu para a lixeira", gerar_ppv: "Gerou PPV", gerar_orcamento: "Gerou orçamento",
};

function fmtData(iso?: string) {
  if (!iso) return "";
  try { return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return String(iso); }
}
function diasRestantes(expira?: string) {
  if (!expira) return null;
  const ms = new Date(expira).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

export default function CarrinhosPanel({ userName, onEditarPecas, onClose }: { userName?: string; onEditarPecas?: (c: Carrinho) => void; onClose: () => void }) {
  const [aba, setAba] = useState<"aberto" | "fechado" | "lixeira">("aberto");
  const [lista, setLista] = useState<Carrinho[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<{ carrinho: Carrinho; itens: Item[]; historico: Hist[] } | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [editForm, setEditForm] = useState<{ nome: string; cliente: string; modelo: string; servico: string } | null>(null);
  // Fase 2: gerar documentos + produto não cadastrado
  const [cliQ, setCliQ] = useState("");
  const [cliRes, setCliRes] = useState<{ nome: string; documento?: string; cidade?: string }[]>([]);
  const [cliSel, setCliSel] = useState<{ nome: string; documento?: string; endereco?: string; cidade?: string } | null>(null);
  const [gerando, setGerando] = useState(false);
  const [msg, setMsg] = useState("");
  const [criarProd, setCriarProd] = useState<Item | null>(null);
  const [prodPreco, setProdPreco] = useState("0.00");
  const [salvandoProd, setSalvandoProd] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [copiado, setCopiado] = useState(false);
  // Gerar novo vs incluir em existente
  const [docMode, setDocMode] = useState<"novo" | "incluir">("novo");
  const [tecnicos, setTecnicos] = useState<string[]>([]);
  const [tecnicoSel, setTecnicoSel] = useState("");
  const [incluirTipo, setIncluirTipo] = useState<"ppv" | "orcamento">("orcamento");
  const [docQ, setDocQ] = useState("");
  const [docRes, setDocRes] = useState<{ id: string; label: string; sub: string }[]>([]);
  const [incluindo, setIncluindo] = useState(false);

  const temNaoCadastrado = !!sel && sel.itens.some((i) => !i.cadastrado);

  useEffect(() => { fetch("/api/ppv/dados-iniciais").then((r) => r.json()).then((d) => setTecnicos(Array.isArray(d?.tecnicos) ? d.tecnicos : [])).catch(() => {}); }, []);
  // PPV não pode com peça não cadastrada → cai pra orçamento.
  useEffect(() => { if (temNaoCadastrado && incluirTipo === "ppv") setIncluirTipo("orcamento"); }, [temNaoCadastrado, incluirTipo]);

  // Lista docs existentes ao escolher "incluir" (PPV ou orçamento)
  useEffect(() => {
    if (docMode !== "incluir") return;
    const t = setTimeout(async () => {
      try {
        if (incluirTipo === "orcamento") {
          const r = await fetch(`/api/orcamentos?q=${encodeURIComponent(docQ)}`);
          const d = r.ok ? await r.json() : [];
          setDocRes((Array.isArray(d) ? d : []).filter((o: { status?: string }) => o.status !== "concluido").slice(0, 40).map((o: { id: string; numero?: string; cliente_nome?: string; total?: number }) => ({ id: String(o.id), label: o.numero || `#${o.id}`, sub: `${o.cliente_nome || "—"}` })));
        } else {
          const r = await fetch(`/api/ppv/pedidos`);
          const d = r.ok ? await r.json() : [];
          const q = docQ.trim().toLowerCase();
          setDocRes((Array.isArray(d) ? d : [])
            .filter((p: { status?: string }) => !/conclu|cancel/i.test(String(p.status || "")))
            .filter((p: { id?: string; cliente?: string }) => !q || String(p.id).toLowerCase().includes(q) || String(p.cliente || "").toLowerCase().includes(q))
            .slice(0, 40).map((p: { id: string; cliente?: string; tecnico?: string }) => ({ id: String(p.id), label: `PPV ${p.id}`, sub: `${p.cliente || "—"}${p.tecnico ? ` · ${p.tecnico}` : ""}` })));
        }
      } catch { setDocRes([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [docMode, incluirTipo, docQ]);

  const incluirEm = async (alvoId: string) => {
    if (!sel) return;
    setIncluindo(true); setMsg("");
    try {
      const items = sel.itens.map((i) => ({ codigo: i.codigo, descricao: i.descricao, quantidade: i.qtd }));
      const r = await fetch("/api/catalogo/criar-doc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: incluirTipo, items, alvoId, tecnico: tecnicoSel, userName: userName || "" }) });
      const j = await r.json();
      if (r.ok) {
        const lbl = incluirTipo === "ppv" ? `PPV ${j.id}` : `Orçamento ${j.numero || j.id}`;
        setMsg(`Peças incluídas em ${lbl}.${j.semPreco ? ` — ⚠️ ${j.semPreco} sem preço.` : ""}`);
        await fetch(`/api/carrinhos/${sel.carrinho.id}/historico`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: incluirTipo === "ppv" ? "gerar_ppv" : "gerar_orcamento", detalhe: `Incluído em ${lbl}`, quem: userName || "" }) });
        abrir(sel.carrinho.id);
      } else setMsg(j.error || "Erro ao incluir.");
    } catch { setMsg("Erro ao incluir."); }
    setIncluindo(false);
  };

  const carregarLista = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(`/api/carrinhos?status=${aba}`); setLista(r.ok ? await r.json() : []); } catch { setLista([]); }
    setLoading(false);
  }, [aba]);

  useEffect(() => { carregarLista(); }, [carregarLista]);

  const abrir = useCallback(async (id: string) => {
    setAbrindo(true);
    const r = await fetch(`/api/carrinhos/${id}`).finally(() => setAbrindo(false));
    if (r.ok) {
      const d = await r.json(); setSel(d);
      setEditForm({ nome: d.carrinho.nome || "", cliente: d.carrinho.cliente || "", modelo: d.carrinho.modelo || "", servico: d.carrinho.servico || "" });
      setCliSel(d.carrinho.cliente ? { nome: d.carrinho.cliente } : null); setCliQ(""); setMsg(""); setShareLink(""); setCopiado(false);
    }
  }, []);

  // Busca de cliente (pra gerar documento)
  useEffect(() => {
    const q = cliQ.trim();
    if (q.length < 2) { setCliRes([]); return; }
    const t = setTimeout(async () => { try { const r = await fetch(`/api/ppv/clientes?termo=${encodeURIComponent(q)}`); setCliRes(r.ok ? await r.json() : []); } catch { setCliRes([]); } }, 300);
    return () => clearTimeout(t);
  }, [cliQ]);

  const gerar = async (tipo: "ppv" | "orcamento" | "ambos") => {
    if (!sel) return;
    if (!cliSel?.nome) { setMsg("Escolha o cliente antes de gerar."); return; }
    setGerando(true); setMsg("");
    const items = sel.itens.map((i) => ({ codigo: i.codigo, descricao: i.descricao, quantidade: i.qtd }));
    const tipos: ("orcamento" | "ppv")[] = tipo === "ambos" ? ["orcamento", "ppv"] : [tipo];
    const partes: string[] = []; let semPrecoTotal = 0;
    try {
      for (const t of tipos) {
        const r = await fetch("/api/catalogo/criar-doc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: t, items, cliente: cliSel, tecnico: tecnicoSel, userName: userName || "" }) });
        const j = await r.json();
        if (r.ok) {
          partes.push(t === "ppv" ? `PPV ${j.id || ""}` : `Orçamento ${j.numero || ""}`);
          semPrecoTotal = Math.max(semPrecoTotal, j.semPreco || 0);
          await fetch(`/api/carrinhos/${sel.carrinho.id}/historico`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acao: t === "ppv" ? "gerar_ppv" : "gerar_orcamento", detalhe: t === "ppv" ? `PPV ${j.id || ""}` : `Orçamento ${j.numero || ""}`, quem: userName || "" }) });
        } else partes.push(`erro (${t})`);
      }
      setMsg(`Gerado: ${partes.join(" · ")}${semPrecoTotal ? ` — ⚠️ ${semPrecoTotal} peça(s) sem preço (não cadastradas no Omie).` : ""}`);
      abrir(sel.carrinho.id);
    } catch { setMsg("Erro ao gerar."); }
    setGerando(false);
  };

  const compartilhar = async () => {
    if (!sel) return;
    setShareLink(""); setCopiado(false);
    const r = await fetch(`/api/carrinhos/${sel.carrinho.id}/share`, { method: "POST" });
    const j = await r.json();
    // Link sempre no domínio de produção (pra poder enviar pra quem não tem acesso ao portal).
    const base = process.env.NEXT_PUBLIC_SITE_URL || "https://portal.novatratores.com";
    if (r.ok && j.token) setShareLink(`${base}/carrinho/${j.token}`);
  };
  const copiarLink = () => { navigator.clipboard?.writeText(shareLink).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); }).catch(() => {}); };

  const salvarProdutoManual = async () => {
    if (!criarProd) return;
    setSalvandoProd(true);
    try {
      const r = await fetch("/api/ppv/produtos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: criarProd.codigo, descricao: criarProd.descricao || criarProd.codigo, preco: parseFloat(prodPreco || "0") }) });
      if (r.ok) { setCriarProd(null); setProdPreco("0.00"); if (sel) abrir(sel.carrinho.id); }
      else { const j = await r.json().catch(() => ({})); setMsg(j.error || "Erro ao criar produto."); }
    } catch { setMsg("Erro de conexão."); }
    setSalvandoProd(false);
  };

  const salvarEdicao = async () => {
    if (!sel || !editForm) return;
    await fetch(`/api/carrinhos/${sel.carrinho.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...editForm, quem: userName || "" }) });
    await abrir(sel.carrinho.id); carregarLista();
  };
  const removerItem = async (item: Item) => {
    if (!sel) return;
    await fetch(`/api/carrinhos/${sel.carrinho.id}/itens?itemId=${item.id}&codigo=${encodeURIComponent(item.codigo)}&quem=${encodeURIComponent(userName || "")}`, { method: "DELETE" });
    await abrir(sel.carrinho.id); carregarLista();
  };
  const mudarStatus = async (status: "aberto" | "fechado") => {
    if (!sel) return;
    await fetch(`/api/carrinhos/${sel.carrinho.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, quem: userName || "" }) });
    setSel(null); carregarLista();
  };
  const excluir = async () => {
    if (!sel || !confirm("Mover este carrinho para a lixeira?")) return;
    await fetch(`/api/carrinhos/${sel.carrinho.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "lixeira", quem: userName || "" }) });
    setSel(null); carregarLista();
  };
  const excluirDefinitivo = async () => {
    if (!sel || !confirm("Excluir DEFINITIVAMENTE? Não dá pra desfazer.")) return;
    await fetch(`/api/carrinhos/${sel.carrinho.id}`, { method: "DELETE" });
    setSel(null); carregarLista();
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 6000, background: "#fff", display: "flex" }}>
      <div style={{ width: "100vw", height: "100vh", background: "#fff", display: "flex", overflow: "hidden" }}>
        {/* Lista */}
        <div style={{ width: 380, flexShrink: 0, borderRight: "1px solid #eef0f3", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "18px 20px", borderBottom: "1px solid #eef0f3" }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: 10 }}><i className="fas fa-cart-shopping" style={{ color: "#dc2626" }} /> Carrinhos</div>
            <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
              {(["aberto", "fechado", "lixeira"] as const).map((s) => (
                <button key={s} onClick={() => { setAba(s); setSel(null); }} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid", borderColor: aba === s ? "#dc2626" : "#e2e8f0", background: aba === s ? "#fef2f2" : "#fff", color: aba === s ? "#dc2626" : "#64748b", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
                  {s === "aberto" ? "Abertos" : s === "fechado" ? "Fechados" : "Lixeira"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 17 }}>Carregando...</div>
              : lista.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 17 }}>Nenhum carrinho {aba === "aberto" ? "aberto" : aba === "fechado" ? "fechado" : "na lixeira"}.</div>
              : lista.map((c) => {
                const dias = diasRestantes(c.expira_em);
                return (
                  <button key={c.id} onClick={() => abrir(c.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "15px 20px", border: "none", borderBottom: "1px solid #f3f5f8", background: sel?.carrinho.id === c.id ? "#fff7ed" : "transparent", cursor: "pointer" }}>
                    <div style={{ fontSize: 19, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.nome || "Carrinho"}</div>
                    <div style={{ fontSize: 16, color: "#64748b", marginTop: 3 }}>{c.cliente || "sem cliente"}{c.modelo ? ` · ${c.modelo}` : ""}</div>
                    <div style={{ fontSize: 15, color: "#94a3b8", marginTop: 4, display: "flex", gap: 8 }}>
                      <span>{c.total_itens || 0} peça(s)</span>
                      {aba === "aberto" && dias !== null && <span style={{ color: dias <= 2 ? "#dc2626" : "#94a3b8" }}>· {dias > 0 ? `${dias}d p/ fechar` : "expira hoje"}</span>}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Detalhe */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px", borderBottom: "1px solid #eef0f3" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{sel ? (sel.carrinho.nome || "Carrinho") : "Selecione um carrinho"}</div>
            <button onClick={onClose} style={{ width: 38, height: 38, borderRadius: 9, border: "none", background: "#f1f5f9", color: "#64748b", cursor: "pointer", fontSize: 18 }}><i className="fas fa-times" /></button>
          </div>

          {abrindo ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 18, gap: 10 }}><i className="fas fa-spinner fa-spin" /> Carregando…</div>
          ) : !sel ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: 18 }}>Escolha um carrinho à esquerda.</div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto", padding: 22 }}>
              {/* Metadados editáveis */}
              {editForm && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {([["nome", "Nome do carrinho"], ["cliente", "Cliente"], ["modelo", "Trator / modelo"], ["servico", "Serviço"]] as const).map(([k, lab]) => (
                    <label key={k} style={{ fontSize: 15, color: "#64748b" }}>
                      {lab}
                      <input value={editForm[k]} onChange={(e) => setEditForm({ ...editForm, [k]: e.target.value })}
                        style={{ width: "100%", marginTop: 5, padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 17, outline: "none", boxSizing: "border-box" }} />
                    </label>
                  ))}
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                    <button onClick={salvarEdicao} style={{ padding: "10px 18px", borderRadius: 9, border: "none", background: "#dc2626", color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>Salvar dados</button>
                    {onEditarPecas && sel.carrinho.status === "aberto" && (
                      <button onClick={() => onEditarPecas(sel.carrinho)} style={{ padding: "10px 18px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
                        <i className="fas fa-plus" /> Adicionar peças pelo catálogo
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Itens */}
              <div style={{ fontSize: 17, fontWeight: 700, color: "#dc2626", margin: "8px 0 10px" }}>Peças ({sel.itens.length})</div>
              <div style={{ border: "1px solid #eef0f3", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                {sel.itens.length === 0 ? <div style={{ padding: 18, textAlign: "center", color: "#94a3b8", fontSize: 17 }}>Sem peças ainda.</div>
                  : sel.itens.map((it) => (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid #f5f7fa" }}>
                      <code style={{ fontSize: 17, fontWeight: 700, color: "#dc2626", width: 150 }}>{it.codigo}</code>
                      <span style={{ flex: 1, fontSize: 17, color: "#0f172a", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.descricao}</span>
                      {!it.cadastrado && <span title="Não cadastrado no Omie" style={{ fontSize: 12, fontWeight: 700, color: "#b45309", background: "#fef3c7", padding: "2px 7px", borderRadius: 6 }}>não cadastrado</span>}
                      <span style={{ fontSize: 15, color: "#64748b", width: 34, textAlign: "center" }}>{it.qtd}x</span>
                      <button onClick={() => removerItem(it)} title="Remover" style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 15 }}><i className="fas fa-trash" /></button>
                    </div>
                  ))}
              </div>

              {/* Peças não cadastradas */}
              {sel.itens.some((i) => !i.cadastrado) && (
                <div style={{ marginBottom: 16, border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#92400e", marginBottom: 8 }}><i className="fas fa-triangle-exclamation" /> Peças ainda não cadastradas no Omie</div>
                  <div style={{ fontSize: 15, color: "#92400e", marginBottom: 10 }}>Entram sem preço no PPV/orçamento. Cadastre agora (produto manual, provisório):</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {sel.itens.filter((i) => !i.cadastrado).map((it) => (
                      <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15 }}>
                        <code style={{ fontWeight: 700, color: "#b45309", width: 130 }}>{it.codigo}</code>
                        <span style={{ flex: 1, color: "#78350f", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.descricao}</span>
                        <button onClick={() => { setCriarProd(it); setProdPreco("0.00"); }} style={{ border: "1px solid #f59e0b", background: "#fff", color: "#b45309", borderRadius: 8, padding: "5px 12px", fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>Criar produto</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gerar / incluir documento */}
              {sel.carrinho.status === "aberto" && (
                <div style={{ marginBottom: 18, border: "1px solid #eef0f3", borderRadius: 10, padding: "14px 16px" }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#334155", marginBottom: 12 }}>Orçamento / PPV</div>
                  {/* Modo: novo x incluir */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    {([["novo", "Gerar novo"], ["incluir", "Incluir em existente"]] as const).map(([m, lab]) => (
                      <button key={m} onClick={() => { setDocMode(m); setMsg(""); }} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "1px solid", borderColor: docMode === m ? "#dc2626" : "#e2e8f0", background: docMode === m ? "#fef2f2" : "#fff", color: docMode === m ? "#dc2626" : "#64748b", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>{lab}</button>
                    ))}
                  </div>

                  {docMode === "novo" ? (
                    <>
                      {/* Cliente */}
                      <div style={{ position: "relative", marginBottom: 10 }}>
                        {cliSel ? (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                            <i className="fas fa-user" style={{ color: "#dc2626" }} />
                            <span style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{cliSel.nome}</span>
                            <button onClick={() => { setCliSel(null); setCliQ(""); }} style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer" }}><i className="fas fa-times" /></button>
                          </div>
                        ) : (
                          <>
                            <input value={cliQ} onChange={(e) => setCliQ(e.target.value)} placeholder="Buscar cliente (nome ou CNPJ)…" style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 16, boxSizing: "border-box", outline: "none" }} />
                            {cliRes.length > 0 && (
                              <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 20, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 220, overflowY: "auto" }}>
                                {cliRes.slice(0, 30).map((c, i) => (
                                  <button key={i} onClick={() => { setCliSel(c); setCliRes([]); setCliQ(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 12px", border: "none", borderBottom: "1px solid #f5f7fa", background: "transparent", cursor: "pointer", fontSize: 15 }}>
                                    <div style={{ fontWeight: 600, color: "#0f172a" }}>{c.nome}</div>
                                    {(c.documento || c.cidade) && <div style={{ fontSize: 13, color: "#94a3b8" }}>{c.documento}{c.cidade ? ` · ${c.cidade}` : ""}</div>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                      {/* Técnico (obrigatório p/ PPV) */}
                      <select value={tecnicoSel} onChange={(e) => setTecnicoSel(e.target.value)} style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 16, marginBottom: 10, outline: "none", background: "#fff", cursor: "pointer" }}>
                        <option value="">Técnico (obrigatório para PPV)…</option>
                        {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button disabled={gerando || sel.itens.length === 0} onClick={() => gerar("orcamento")} style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1.5px solid #ea580c", background: "#fff", color: "#ea580c", fontWeight: 700, fontSize: 16, cursor: "pointer", opacity: gerando ? 0.5 : 1 }}>Orçamento</button>
                        <button disabled={gerando || sel.itens.length === 0 || temNaoCadastrado} title={temNaoCadastrado ? "Cadastre as peças antes de gerar PPV" : undefined} onClick={() => gerar("ppv")} style={{ flex: 1, padding: "11px", borderRadius: 9, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: 16, cursor: temNaoCadastrado ? "not-allowed" : "pointer", opacity: gerando || temNaoCadastrado ? 0.45 : 1 }}>PPV</button>
                        <button disabled={gerando || sel.itens.length === 0 || temNaoCadastrado} title={temNaoCadastrado ? "Cadastre as peças antes" : undefined} onClick={() => gerar("ambos")} style={{ flex: 1, padding: "11px", borderRadius: 9, border: "none", background: "#0f172a", color: "#fff", fontWeight: 700, fontSize: 16, cursor: temNaoCadastrado ? "not-allowed" : "pointer", opacity: gerando || temNaoCadastrado ? 0.45 : 1 }}>Ambos</button>
                      </div>
                      {temNaoCadastrado && <div style={{ marginTop: 8, fontSize: 14, color: "#b45309" }}>PPV e Ambos exigem todas as peças cadastradas no Omie (veja o bloco amarelo acima).</div>}
                    </>
                  ) : (
                    <>
                      {/* Tipo do documento existente */}
                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <button onClick={() => setIncluirTipo("orcamento")} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "1px solid", borderColor: incluirTipo === "orcamento" ? "#ea580c" : "#e2e8f0", background: incluirTipo === "orcamento" ? "#fff7ed" : "#fff", color: incluirTipo === "orcamento" ? "#ea580c" : "#64748b", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Orçamento</button>
                        <button onClick={() => { if (!temNaoCadastrado) setIncluirTipo("ppv"); }} disabled={temNaoCadastrado} title={temNaoCadastrado ? "Cadastre as peças antes de usar PPV" : undefined} style={{ flex: 1, padding: "9px 0", borderRadius: 9, border: "1px solid", borderColor: incluirTipo === "ppv" ? "#dc2626" : "#e2e8f0", background: incluirTipo === "ppv" ? "#fef2f2" : "#fff", color: temNaoCadastrado ? "#cbd5e1" : (incluirTipo === "ppv" ? "#dc2626" : "#64748b"), fontSize: 15, fontWeight: 600, cursor: temNaoCadastrado ? "not-allowed" : "pointer" }}>PPV</button>
                      </div>
                      <input value={docQ} onChange={(e) => setDocQ(e.target.value)} placeholder={incluirTipo === "ppv" ? "Buscar PPV (ID ou cliente)…" : "Buscar orçamento (nº ou cliente)…"} style={{ width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 16, marginBottom: 10, boxSizing: "border-box", outline: "none" }} />
                      <div style={{ border: "1px solid #eef0f3", borderRadius: 8, maxHeight: 240, overflowY: "auto" }}>
                        {docRes.length === 0 ? <div style={{ padding: 16, textAlign: "center", color: "#94a3b8", fontSize: 15 }}>Nenhum {incluirTipo === "ppv" ? "PPV" : "orçamento"} encontrado.</div>
                          : docRes.map((d) => (
                            <button key={d.id} onClick={() => incluirEm(d.id)} disabled={incluindo} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "11px 14px", border: "none", borderBottom: "1px solid #f5f7fa", background: "transparent", cursor: incluindo ? "wait" : "pointer" }}>
                              <span style={{ fontSize: 15, fontWeight: 700, color: "#dc2626", minWidth: 90 }}>{d.label}</span>
                              <span style={{ flex: 1, fontSize: 15, color: "#475569", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.sub}</span>
                              <i className="fas fa-plus" style={{ color: "#16a34a" }} />
                            </button>
                          ))}
                      </div>
                    </>
                  )}
                  {msg && <div style={{ marginTop: 12, fontSize: 15, color: msg.startsWith("Erro") ? "#dc2626" : "#166534", background: msg.startsWith("Erro") ? "#fef2f2" : "#f0fdf4", padding: "10px 12px", borderRadius: 8 }}>{msg}</div>}
                </div>
              )}

              {/* Ações do carrinho */}
              <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
                {sel.carrinho.status === "lixeira" ? (
                  <>
                    <button onClick={() => mudarStatus("aberto")} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #bbf7d0", background: "#f0fdf4", color: "#166534", fontSize: 16, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-rotate-left" /> Restaurar</button>
                    <button onClick={excluirDefinitivo} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 16, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-trash" /> Excluir definitivamente</button>
                  </>
                ) : (
                  <>
                    {sel.carrinho.status === "aberto"
                      ? <button onClick={() => mudarStatus("fechado")} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 16, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-box-archive" /> Fechar carrinho</button>
                      : <button onClick={() => mudarStatus("aberto")} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 16, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-box-open" /> Reabrir</button>}
                    {sel.carrinho.status === "aberto" && <button onClick={compartilhar} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#2563eb", fontSize: 16, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-share-nodes" /> Compartilhar link</button>}
                    <button onClick={excluir} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 16, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-trash" /> Excluir</button>
                  </>
                )}
              </div>
              {shareLink && (
                <div style={{ marginBottom: 18, border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 15, color: "#1e40af", marginBottom: 6 }}>Envie este link — a pessoa vê só este carrinho e o catálogo do modelo, e pode adicionar/remover peças (registrado no histórico):</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={shareLink} readOnly onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, padding: "8px 10px", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 15, background: "#fff", boxSizing: "border-box" }} />
                    <button onClick={copiarLink} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{copiado ? "Copiado!" : "Copiar"}</button>
                  </div>
                </div>
              )}

              {/* Histórico */}
              <div style={{ fontSize: 17, fontWeight: 700, color: "#dc2626", marginBottom: 10 }}>Histórico</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sel.historico.map((h) => (
                  <div key={h.id} style={{ display: "flex", gap: 10, fontSize: 16, lineHeight: 1.5 }}>
                    <span style={{ color: "#94a3b8", whiteSpace: "nowrap" }}>{fmtData(h.quando)}</span>
                    <span style={{ color: "#334155" }}><b>{ACAO_LABEL[h.acao] || h.acao}</b>{h.detalhe ? ` — ${h.detalhe}` : ""} <span style={{ color: "#94a3b8" }}>por {h.quem || "—"}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mini-modal: criar produto manual (provisório) */}
      {criarProd && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setCriarProd(null); }}
          style={{ position: "fixed", inset: 0, zIndex: 7000, background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
          <div style={{ width: 420, maxWidth: "94vw", background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Criar produto (provisório)</div>
            <div style={{ fontSize: 15, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px", margin: "8px 0 14px" }}>
              Peça não cadastrada no Omie — criando um <b>produto manual</b> provisório. Depois peça o cadastro oficial no Omie.
            </div>
            <label style={{ fontSize: 15, color: "#64748b" }}>Código
              <input value={criarProd.codigo} readOnly style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 15, background: "#f8fafc", boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 15, color: "#64748b", display: "block", marginTop: 10 }}>Descrição
              <input value={criarProd.descricao} onChange={(e) => setCriarProd({ ...criarProd, descricao: e.target.value })} style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 15, color: "#64748b", display: "block", marginTop: 10 }}>Preço de venda (R$)
              <input type="number" step="0.01" value={prodPreco} onChange={(e) => setProdPreco(e.target.value)} style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 15, boxSizing: "border-box" }} />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setCriarProd(null)} style={{ padding: "9px 16px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 16, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvarProdutoManual} disabled={salvandoProd} style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "#dc2626", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: salvandoProd ? 0.6 : 1 }}>{salvandoProd ? "Salvando..." : "Criar produto"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
