"use client";
// Lista de "Produtos - Peças em estoque" (tabela produtos, estoque > 0).
// Busca por código/descrição; clicar num produto abre o Histórico dele (uso em PPVs).
import { useEffect, useState } from "react";
import { formatarMoeda } from "@/lib/ppv/utils";

interface ProdutoEstoque { codigo: string; descricao: string; estoque: number; valor: number; cmc: number; conta: string }

export default function ModalProdutosEstoque({
  open, onClose, onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (codigo: string, descricao: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [lista, setLista] = useState<ProdutoEstoque[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/ppv/produtos-estoque?termo=${encodeURIComponent(busca.trim())}`);
        const j = await r.json();
        if (!cancelado) setLista(Array.isArray(j.produtos) ? j.produtos : []);
      } catch { if (!cancelado) setLista([]); }
      if (!cancelado) setLoading(false);
    }, 280);
    return () => { cancelado = true; clearTimeout(t); };
  }, [open, busca]);

  useEffect(() => { if (open) setBusca(""); }, [open]);

  if (!open) return null;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 67000, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "5vh 16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 4, width: "100%", maxWidth: 780, maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #eef0f3" }}>
          <i className="fas fa-boxes-stacked" style={{ color: "#e8730c" }} />
          <div style={{ flex: 1, fontSize: 16, fontWeight: 800, color: "#1e293b" }}>Produtos — Peças em estoque</div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 4, width: 30, height: 30, cursor: "pointer", color: "#475569", fontSize: 17 }}>×</button>
        </div>

        <div style={{ padding: "12px 18px", borderBottom: "1px solid #eef0f3", position: "relative" }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 30, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 13 }} />
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por código ou descrição…"
            style={{ width: "100%", borderRadius: 4, border: "1px solid #d1d5db", padding: "9px 11px 9px 32px", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
        </div>

        {/* Cabeçalho da lista */}
        <div style={{ display: "grid", gridTemplateColumns: "150px 1fr 90px 120px 70px", gap: 10, padding: "8px 18px", background: "#edeae4", borderBottom: "1px solid #d8d2c6", fontSize: 11.5, fontWeight: 700, color: "#5f574c" }}>
          <span>Código</span><span>Descrição</span><span style={{ textAlign: "right" }}>Estoque</span><span style={{ textAlign: "right" }}>Valor venda</span><span style={{ textAlign: "center" }}>Conta</span>
        </div>

        <div style={{ overflowY: "auto", flex: 1 }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: "center", color: "#64748b" }}><i className="fas fa-spinner fa-spin" /> Carregando…</div>
          ) : lista.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Nenhuma peça em estoque encontrada.</div>
          ) : lista.map((p, i) => (
            <button key={`${p.conta}-${p.codigo}-${i}`} type="button" onClick={() => onSelect(p.codigo, p.descricao)}
              style={{ display: "grid", gridTemplateColumns: "150px 1fr 90px 120px 70px", gap: 10, alignItems: "center", width: "100%", textAlign: "left", padding: "9px 18px", border: "none", borderBottom: "1px solid #f1eee8", background: "transparent", cursor: "pointer", fontSize: 13 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#fff7ef")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
              <span style={{ fontWeight: 700, color: "#2563EB", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.codigo}</span>
              <span style={{ color: "#334155", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.descricao}</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: p.estoque > 0 ? "#16a34a" : "#94a3b8", fontWeight: 600 }}>{p.estoque}</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#334155" }}>{formatarMoeda(p.valor)}</span>
              <span style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: p.conta === "CASTRO" ? "#2563EB" : "#c2570a" }}>{p.conta}</span>
            </button>
          ))}
        </div>

        <div style={{ padding: "8px 18px", borderTop: "1px solid #eef0f3", fontSize: 11.5, color: "#94a3b8" }}>
          {lista.length} peça(s){lista.length >= 300 ? "+ (refine a busca)" : ""} · clique para ver o histórico
        </div>
      </div>
    </div>
  );
}
