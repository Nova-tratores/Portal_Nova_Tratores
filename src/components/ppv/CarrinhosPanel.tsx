"use client";

import { useEffect, useState, useCallback } from "react";

interface Carrinho { id: string; nome: string; cliente: string; modelo: string; modelo_slug: string; servico: string; status: string; criado_por?: string; criado_em: string; atualizado_em: string; expira_em: string; total_itens?: number }
interface Item { id: string; codigo: string; descricao: string; qtd: number; cadastrado: boolean }
interface Hist { id: string; quem: string; acao: string; detalhe: string; quando: string }

const ACAO_LABEL: Record<string, string> = {
  criar: "Criou o carrinho", add_item: "Adicionou peça", rem_item: "Removeu peça",
  editar: "Editou os dados", fechar: "Fechou o carrinho", reabrir: "Reabriu o carrinho",
  gerar_ppv: "Gerou PPV", gerar_orcamento: "Gerou orçamento",
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
  const [aba, setAba] = useState<"aberto" | "fechado">("aberto");
  const [lista, setLista] = useState<Carrinho[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<{ carrinho: Carrinho; itens: Item[]; historico: Hist[] } | null>(null);
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

  const carregarLista = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch(`/api/carrinhos?status=${aba}`); setLista(r.ok ? await r.json() : []); } catch { setLista([]); }
    setLoading(false);
  }, [aba]);

  useEffect(() => { carregarLista(); }, [carregarLista]);

  const abrir = useCallback(async (id: string) => {
    const r = await fetch(`/api/carrinhos/${id}`);
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
        const r = await fetch("/api/catalogo/criar-doc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: t, items, cliente: cliSel, userName: userName || "" }) });
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
    if (!sel || !confirm("Excluir este carrinho? Não dá pra desfazer.")) return;
    await fetch(`/api/carrinhos/${sel.carrinho.id}`, { method: "DELETE" });
    setSel(null); carregarLista();
  };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 6000, background: "rgba(15,23,42,0.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div style={{ width: 860, maxWidth: "96vw", height: "86vh", background: "#fff", borderRadius: 16, boxShadow: "0 24px 60px rgba(0,0,0,0.3)", display: "flex", overflow: "hidden" }}>
        {/* Lista */}
        <div style={{ width: 320, borderRight: "1px solid #eef0f3", display: "flex", flexDirection: "column", minWidth: 0 }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid #eef0f3" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: 8 }}><i className="fas fa-cart-shopping" style={{ color: "#dc2626" }} /> Carrinhos</div>
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              {(["aberto", "fechado"] as const).map((s) => (
                <button key={s} onClick={() => { setAba(s); setSel(null); }} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid", borderColor: aba === s ? "#dc2626" : "#e2e8f0", background: aba === s ? "#fef2f2" : "#fff", color: aba === s ? "#dc2626" : "#64748b", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {s === "aberto" ? "Abertos" : "Fechados"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? <div style={{ padding: 24, textAlign: "center", color: "#94a3b8" }}>Carregando...</div>
              : lista.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Nenhum carrinho {aba === "aberto" ? "aberto" : "fechado"}.</div>
              : lista.map((c) => {
                const dias = diasRestantes(c.expira_em);
                return (
                  <button key={c.id} onClick={() => abrir(c.id)} style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 16px", border: "none", borderBottom: "1px solid #f3f5f8", background: sel?.carrinho.id === c.id ? "#fff7ed" : "transparent", cursor: "pointer" }}>
                    <div style={{ fontSize: 14.5, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.nome || "Carrinho"}</div>
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{c.cliente || "sem cliente"}{c.modelo ? ` · ${c.modelo}` : ""}</div>
                    <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 3, display: "flex", gap: 8 }}>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #eef0f3" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#334155" }}>{sel ? "Detalhes do carrinho" : "Selecione um carrinho"}</div>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, border: "none", background: "#f1f5f9", color: "#64748b", cursor: "pointer" }}><i className="fas fa-times" /></button>
          </div>

          {!sel ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#cbd5e1", fontSize: 14 }}>Escolha um carrinho à esquerda.</div>
          ) : (
            <div style={{ flex: 1, overflowY: "auto", padding: 18 }}>
              {/* Metadados editáveis */}
              {editForm && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {([["nome", "Nome do carrinho"], ["cliente", "Cliente"], ["modelo", "Trator / modelo"], ["servico", "Serviço"]] as const).map(([k, lab]) => (
                    <label key={k} style={{ fontSize: 12, color: "#64748b" }}>
                      {lab}
                      <input value={editForm[k]} onChange={(e) => setEditForm({ ...editForm, [k]: e.target.value })}
                        style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13.5, outline: "none", boxSizing: "border-box" }} />
                    </label>
                  ))}
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
                    <button onClick={salvarEdicao} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Salvar dados</button>
                    {onEditarPecas && sel.carrinho.status === "aberto" && (
                      <button onClick={() => onEditarPecas(sel.carrinho)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                        <i className="fas fa-plus" /> Adicionar peças pelo catálogo
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Itens */}
              <div style={{ fontSize: 13, fontWeight: 600, color: "#dc2626", margin: "6px 0 8px" }}>Peças ({sel.itens.length})</div>
              <div style={{ border: "1px solid #eef0f3", borderRadius: 10, overflow: "hidden", marginBottom: 16 }}>
                {sel.itens.length === 0 ? <div style={{ padding: 18, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Sem peças ainda.</div>
                  : sel.itens.map((it) => (
                    <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: "1px solid #f5f7fa" }}>
                      <code style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", width: 130 }}>{it.codigo}</code>
                      <span style={{ flex: 1, fontSize: 13, color: "#0f172a", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.descricao}</span>
                      {!it.cadastrado && <span title="Não cadastrado no Omie" style={{ fontSize: 10.5, fontWeight: 700, color: "#b45309", background: "#fef3c7", padding: "2px 7px", borderRadius: 6 }}>não cadastrado</span>}
                      <span style={{ fontSize: 13, color: "#64748b", width: 34, textAlign: "center" }}>{it.qtd}x</span>
                      <button onClick={() => removerItem(it)} title="Remover" style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}><i className="fas fa-trash" /></button>
                    </div>
                  ))}
              </div>

              {/* Peças não cadastradas */}
              {sel.itens.some((i) => !i.cadastrado) && (
                <div style={{ marginBottom: 16, border: "1px solid #fde68a", background: "#fffbeb", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#92400e", marginBottom: 6 }}><i className="fas fa-triangle-exclamation" /> Peças ainda não cadastradas no Omie</div>
                  <div style={{ fontSize: 12, color: "#92400e", marginBottom: 10 }}>Entram sem preço no PPV/orçamento. Cadastre agora (produto manual, provisório):</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {sel.itens.filter((i) => !i.cadastrado).map((it) => (
                      <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                        <code style={{ fontWeight: 700, color: "#b45309", width: 130 }}>{it.codigo}</code>
                        <span style={{ flex: 1, color: "#78350f", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.descricao}</span>
                        <button onClick={() => { setCriarProd(it); setProdPreco("0.00"); }} style={{ border: "1px solid #f59e0b", background: "#fff", color: "#b45309", borderRadius: 8, padding: "5px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>Criar produto</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gerar documento */}
              {sel.carrinho.status === "aberto" && (
                <div style={{ marginBottom: 18, border: "1px solid #eef0f3", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8 }}>Gerar documento</div>
                  <div style={{ position: "relative", marginBottom: 10 }}>
                    {cliSel ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8 }}>
                        <i className="fas fa-user" style={{ color: "#dc2626" }} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{cliSel.nome}</span>
                        <button onClick={() => { setCliSel(null); setCliQ(""); }} style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer" }}><i className="fas fa-times" /></button>
                      </div>
                    ) : (
                      <>
                        <input value={cliQ} onChange={(e) => setCliQ(e.target.value)} placeholder="Buscar cliente (nome ou CNPJ)…" style={{ width: "100%", padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, boxSizing: "border-box", outline: "none" }} />
                        {cliRes.length > 0 && (
                          <div style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 20, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 200, overflowY: "auto" }}>
                            {cliRes.slice(0, 30).map((c, i) => (
                              <button key={i} onClick={() => { setCliSel(c); setCliRes([]); setCliQ(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: "1px solid #f5f7fa", background: "transparent", cursor: "pointer", fontSize: 12.5 }}>
                                <div style={{ fontWeight: 600, color: "#0f172a" }}>{c.nome}</div>
                                {(c.documento || c.cidade) && <div style={{ fontSize: 11, color: "#94a3b8" }}>{c.documento}{c.cidade ? ` · ${c.cidade}` : ""}</div>}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button disabled={gerando || sel.itens.length === 0} onClick={() => gerar("orcamento")} style={{ flex: 1, padding: "10px", borderRadius: 9, border: "1.5px solid #ea580c", background: "#fff", color: "#ea580c", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: gerando ? 0.5 : 1 }}>Orçamento</button>
                    <button disabled={gerando || sel.itens.length === 0} onClick={() => gerar("ppv")} style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: "#dc2626", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: gerando ? 0.5 : 1 }}>PPV</button>
                    <button disabled={gerando || sel.itens.length === 0} onClick={() => gerar("ambos")} style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", background: "#0f172a", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: gerando ? 0.5 : 1 }}>Ambos</button>
                  </div>
                  {msg && <div style={{ marginTop: 10, fontSize: 12.5, color: msg.startsWith("Erro") ? "#dc2626" : "#166534", background: msg.startsWith("Erro") ? "#fef2f2" : "#f0fdf4", padding: "8px 10px", borderRadius: 8 }}>{msg}</div>}
                </div>
              )}

              {/* Ações do carrinho */}
              <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
                {sel.carrinho.status === "aberto"
                  ? <button onClick={() => mudarStatus("fechado")} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-box-archive" /> Fechar carrinho</button>
                  : <button onClick={() => mudarStatus("aberto")} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-box-open" /> Reabrir</button>}
                {sel.carrinho.status === "aberto" && <button onClick={compartilhar} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#2563eb", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-share-nodes" /> Compartilhar link</button>}
                <button onClick={excluir} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: "pointer" }}><i className="fas fa-trash" /> Excluir</button>
              </div>
              {shareLink && (
                <div style={{ marginBottom: 18, border: "1px solid #bfdbfe", background: "#eff6ff", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 12, color: "#1e40af", marginBottom: 6 }}>Envie este link — a pessoa vê só este carrinho e o catálogo do modelo, e pode adicionar/remover peças (registrado no histórico):</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={shareLink} readOnly onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, padding: "8px 10px", border: "1px solid #bfdbfe", borderRadius: 8, fontSize: 12.5, background: "#fff", boxSizing: "border-box" }} />
                    <button onClick={copiarLink} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{copiado ? "Copiado!" : "Copiar"}</button>
                  </div>
                </div>
              )}

              {/* Histórico */}
              <div style={{ fontSize: 13, fontWeight: 600, color: "#dc2626", marginBottom: 8 }}>Histórico</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sel.historico.map((h) => (
                  <div key={h.id} style={{ display: "flex", gap: 10, fontSize: 12.5 }}>
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
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0f172a", marginBottom: 4 }}>Criar produto (provisório)</div>
            <div style={{ fontSize: 12.5, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "8px 10px", margin: "8px 0 14px" }}>
              Peça não cadastrada no Omie — criando um <b>produto manual</b> provisório. Depois peça o cadastro oficial no Omie.
            </div>
            <label style={{ fontSize: 12, color: "#64748b" }}>Código
              <input value={criarProd.codigo} readOnly style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13.5, background: "#f8fafc", boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginTop: 10 }}>Descrição
              <input value={criarProd.descricao} onChange={(e) => setCriarProd({ ...criarProd, descricao: e.target.value })} style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13.5, boxSizing: "border-box" }} />
            </label>
            <label style={{ fontSize: 12, color: "#64748b", display: "block", marginTop: 10 }}>Preço de venda (R$)
              <input type="number" step="0.01" value={prodPreco} onChange={(e) => setProdPreco(e.target.value)} style={{ width: "100%", marginTop: 4, padding: "8px 10px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13.5, boxSizing: "border-box" }} />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button onClick={() => setCriarProd(null)} style={{ padding: "9px 16px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
              <button onClick={salvarProdutoManual} disabled={salvandoProd} style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: salvandoProd ? 0.6 : 1 }}>{salvandoProd ? "Salvando..." : "Criar produto"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
