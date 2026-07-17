"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import CatalogoNovo from "@/components/ppv/CatalogoNovo";
import { supabase } from "@/lib/supabase";

interface Carrinho { id: string; nome: string; cliente: string; modelo: string; modelo_slug: string; servico: string; status: string; expira_em: string }
interface Item { id: string; codigo: string; descricao: string; qtd: number }

export default function CarrinhoPublicoPage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [carrinho, setCarrinho] = useState<Carrinho | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [quem, setQuem] = useState("");
  const [logado, setLogado] = useState(false); // usuário do portal logado (outra aba) → usa o perfil dele
  const [toast, setToast] = useState("");

  // Se a pessoa já está logada no portal (mesmo navegador), usa o nome do perfil dela.
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!ativo || !session?.user?.id) return;
        const { data: prof } = await supabase.from("financeiro_usu").select("nome").eq("id", session.user.id).single();
        if (ativo && prof?.nome) { setQuem(prof.nome); setLogado(true); }
      } catch { /* visitante sem login */ }
    })();
    return () => { ativo = false; };
  }, []);

  // Visitante sem login: lembra o nome digitado.
  useEffect(() => { if (logado) return; try { const q = localStorage.getItem("carrinho_quem"); if (q) setQuem(q); } catch { /* */ } }, [logado]);
  useEffect(() => { if (logado) return; try { localStorage.setItem("carrinho_quem", quem); } catch { /* */ } }, [quem, logado]);

  const carregar = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`/api/publico/carrinho/${token}`);
      const j = await r.json();
      if (!r.ok) { setErro(j.error || "Link inválido."); setCarrinho(null); }
      else { setCarrinho(j.carrinho); setItens(j.itens || []); setErro(""); }
    } catch { setErro("Erro de conexão."); }
    setCarregando(false);
  }, [token]);

  useEffect(() => { carregar(); }, [carregar]);

  const aberto = carrinho?.status === "aberto";

  const adicionar = useCallback(async (p: { code: string; name: string }) => {
    if (!aberto) return;
    try {
      await fetch(`/api/publico/carrinho/${token}/itens`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigo: p.code, descricao: p.name, qtd: 1, quem }) });
      setToast(`Adicionado: ${p.code}`); setTimeout(() => setToast(""), 1400);
      carregar();
    } catch { /* */ }
  }, [token, quem, aberto, carregar]);

  const remover = async (it: Item) => {
    if (!aberto) return;
    await fetch(`/api/publico/carrinho/${token}/itens?itemId=${it.id}&codigo=${encodeURIComponent(it.codigo)}&quem=${encodeURIComponent(quem)}`, { method: "DELETE" });
    carregar();
  };

  if (carregando) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontFamily: "Poppins, sans-serif" }}>Carregando…</div>;
  if (erro || !carrinho) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Poppins, sans-serif", padding: 20 }}>
      <div style={{ textAlign: "center", maxWidth: 380 }}>
        <div style={{ fontSize: 40, color: "#dc2626", marginBottom: 12 }}><i className="fas fa-link-slash" /></div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Link indisponível</div>
        <div style={{ fontSize: 14, color: "#64748b", marginTop: 6 }}>{erro || "Este carrinho não existe mais."}</div>
      </div>
    </div>
  );

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", fontFamily: "Poppins, sans-serif", background: "#f1f5f9" }}>
      {/* Cabeçalho */}
      <div style={{ background: "#7f1d1d", color: "#fff", padding: "12px 20px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}><i className="fas fa-cart-shopping" style={{ marginRight: 8 }} />{carrinho.nome || "Carrinho"}</div>
          <div style={{ fontSize: 12.5, opacity: 0.85 }}>{carrinho.cliente || "—"}{carrinho.modelo ? ` · ${carrinho.modelo}` : ""}{carrinho.servico ? ` · ${carrinho.servico}` : ""}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {logado ? (
            <span style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.14)", padding: "8px 14px", borderRadius: 9, fontSize: 13 }}>
              <i className="fas fa-circle-user" /> Logado como <b>{quem}</b>
            </span>
          ) : (
            <input value={quem} onChange={(e) => setQuem(e.target.value)} placeholder="Seu nome (aparece no histórico)"
              style={{ padding: "8px 12px", borderRadius: 9, border: "none", fontSize: 13, width: 240, maxWidth: "50vw", outline: "none" }} />
          )}
        </div>
      </div>

      {!aberto && (
        <div style={{ background: "#fef3c7", color: "#92400e", padding: "8px 20px", fontSize: 13, textAlign: "center" }}>
          Este carrinho está <b>fechado</b> — só leitura.
        </div>
      )}

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        {/* Catálogo travado no modelo */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", background: "#fff", margin: 12, borderRadius: 14, overflow: "hidden", border: "1px solid #e5e7eb" }}>
          <CatalogoNovo onSelecionarPeca={aberto ? adicionar : () => {}} modeloInicialSlug={carrinho.modelo_slug} travado userName={quem || "Link público"} />
        </div>

        {/* Carrinho */}
        <div style={{ width: 320, flexShrink: 0, background: "#fff", margin: "12px 12px 12px 0", borderRadius: 14, border: "1px solid #e5e7eb", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #eef0f3", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
            Peças ({itens.reduce((s, i) => s + i.qtd, 0)})
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {itens.length === 0 ? <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Clique nas peças do catálogo para adicionar.</div>
              : itens.map((it) => (
                <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid #f5f7fa" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <code style={{ fontSize: 12.5, fontWeight: 700, color: "#dc2626" }}>{it.codigo}</code>
                    <div style={{ fontSize: 12, color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.descricao}</div>
                  </div>
                  <span style={{ fontSize: 12.5, color: "#64748b", width: 28, textAlign: "center" }}>{it.qtd}x</span>
                  {aberto && <button onClick={() => remover(it)} title="Remover" style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer" }}><i className="fas fa-trash" /></button>}
                </div>
              ))}
          </div>
          <div style={{ padding: "10px 14px", borderTop: "1px solid #eef0f3", fontSize: 11.5, color: "#94a3b8", textAlign: "center" }}>Suas alterações ficam registradas no histórico do carrinho.</div>
        </div>
      </div>

      {toast && <div style={{ position: "fixed", bottom: 18, left: "50%", transform: "translateX(-50%)", background: "#0f172a", color: "#fff", padding: "10px 18px", borderRadius: 11, fontSize: 13, fontWeight: 600, zIndex: 50 }}><i className="fas fa-circle-check" style={{ color: "#4ade80", marginRight: 8 }} />{toast}</div>}
    </div>
  );
}
