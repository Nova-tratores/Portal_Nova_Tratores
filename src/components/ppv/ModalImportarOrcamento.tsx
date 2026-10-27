"use client";
// Importar um Orçamento (módulo /orcamentos) para dentro do PPV: as peças entram com o
// PREÇO DO ORÇAMENTO, agrupadas como "Orçamento <nº>" (dá pra remover o grupo inteiro).
// Substitui o caminho por Excel entre Peças e Pós-vendas (OS-0846, 22/10/2026): Peças
// monta o orçamento no portal e quem abre a OS só puxa.
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/ppv/utils";

interface ItemOrc { codigo?: string; descricao?: string; quantidade?: number; preco?: number }
interface OrcResumo {
  id: number; numero: string; cliente_nome: string | null; total: number | null;
  status: string | null; created_at: string | null; ordem_servico: string | null; itens: ItemOrc[] | null;
}

export interface ItemImportado { codigo: string; descricao: string; quantidade: number; preco: number }

export default function ModalImportarOrcamento({
  open, onClose, clienteSugerido, osId, onImportar,
}: {
  open: boolean;
  onClose: () => void;
  clienteSugerido?: string;
  osId?: string;
  onImportar: (itens: ItemImportado[], rotulo: string, orcamentoId: number) => Promise<boolean>;
}) {
  // o pai remonta o modal a cada abertura (key) — o estado nasce limpo, com o cliente do PPV na busca
  const [busca, setBusca] = useState(() => (clienteSugerido || "").split("(")[0].trim());
  const [lista, setLista] = useState<OrcResumo[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [sel, setSel] = useState<OrcResumo | null>(null);
  const [importando, setImportando] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    const t = setTimeout(async () => {
      setCarregando(true);
      let q = supabase.from("orcamentos")
        .select("id, numero, cliente_nome, total, status, created_at, ordem_servico, itens")
        .order("id", { ascending: false }).limit(30);
      const termo = busca.trim().replace(/[%,()]/g, " ");
      if (termo) q = q.or(`numero.ilike.%${termo}%,cliente_nome.ilike.%${termo}%`);
      const { data, error } = await q;
      if (error) console.error("[importar orçamento]", error.message);
      if (!cancel) {
        setLista(((data || []) as OrcResumo[]).filter((o) => (o.itens || []).some((i) => i?.codigo && i?.descricao)));
        setCarregando(false);
      }
    }, 350);
    return () => { cancel = true; clearTimeout(t); };
  }, [open, busca]);

  if (!open) return null;

  const itensSel = (sel?.itens || []).filter((i) => i?.codigo && i?.descricao);
  const outraOS = sel?.ordem_servico && osId && sel.ordem_servico !== osId ? sel.ordem_servico : "";

  const importar = async () => {
    if (!sel || itensSel.length === 0) return;
    if (outraOS && !confirm(`Este orçamento já está ligado à ${outraOS}. Importar mesmo assim?`)) return;
    setImportando(true);
    const ok = await onImportar(
      itensSel.map((i) => ({ codigo: String(i.codigo), descricao: String(i.descricao), quantidade: Number(i.quantidade) || 1, preco: Number(i.preco) || 0 })),
      `Orçamento ${sel.numero}`,
      sel.id,
    );
    setImportando(false);
    if (ok) onClose();
  };

  return (
    <div onClick={() => !importando && onClose()} style={{ position: "fixed", inset: 0, zIndex: 68000, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "8vh 16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 4, width: "100%", maxWidth: 640, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid #eef0f3" }}>
          <i className="fas fa-file-import" style={{ color: "#e8730c" }} />
          <div style={{ flex: 1, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Importar orçamento de peças</div>
          <button onClick={onClose} disabled={importando} style={{ background: "#f1f5f9", border: "none", borderRadius: 4, width: 30, height: 30, cursor: "pointer", color: "#475569", fontSize: 17 }}>×</button>
        </div>

        {!sel ? (
          <div style={{ padding: "14px 18px", overflowY: "auto" }}>
            <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nº do orçamento ou cliente"
              style={{ width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 4, fontSize: 14, marginBottom: 10, boxSizing: "border-box" }} />
            {carregando && <div style={{ fontSize: 13, color: "#94a3b8" }}>Buscando…</div>}
            {!carregando && lista.length === 0 && <div style={{ fontSize: 13, color: "#94a3b8" }}>Nenhum orçamento com peças encontrado.</div>}
            {lista.map((o) => (
              <button key={o.id} type="button" onClick={() => setSel(o)}
                style={{ width: "100%", textAlign: "left", display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", marginBottom: 6, border: "1px solid #e2e8f0", borderRadius: 4, background: "#fff", cursor: "pointer" }}>
                <span style={{ fontWeight: 700, color: "#c2570a", minWidth: 70 }}>{o.numero}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.cliente_nome || "—"}</span>
                <span style={{ fontSize: 12, color: "#64748b" }}>{(o.itens || []).length} itens</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", minWidth: 90, textAlign: "right" }}>{formatarMoeda(Number(o.total) || 0)}</span>
                {o.ordem_servico && <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 4, background: "#eff6ff", color: "#1d4ed8" }}>{o.ordem_servico}</span>}
              </button>
            ))}
          </div>
        ) : (
          <div style={{ padding: "14px 18px", overflowY: "auto" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>{sel.numero} · {sel.cliente_nome || "—"}</div>
            <div style={{ fontSize: 12.5, color: "#64748b", marginBottom: 10 }}>As peças entram com o preço do orçamento, agrupadas como &quot;Orçamento {sel.numero}&quot;.</div>
            {outraOS && <div style={{ marginBottom: 10, fontSize: 12.5, color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 4, padding: "8px 10px" }}>Este orçamento já está ligado à {outraOS}.</div>}
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 4 }}>
              {itensSel.map((i, k) => (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "150px 1fr 50px 100px", gap: 8, padding: "7px 10px", fontSize: 13, borderTop: k ? "1px solid #f1f5f9" : "none" }}>
                  <span style={{ fontWeight: 600 }}>{i.codigo}</span>
                  <span style={{ color: "#475569", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.descricao}</span>
                  <span style={{ textAlign: "center" }}>{Number(i.quantidade) || 1}</span>
                  <span style={{ textAlign: "right" }}>{formatarMoeda(Number(i.preco) || 0)}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button type="button" onClick={importar} disabled={importando}
                style={{ flex: 1, padding: "11px 16px", borderRadius: 4, border: "none", background: "#e8730c", color: "#fff", fontSize: 14, fontWeight: 700, cursor: importando ? "wait" : "pointer" }}>
                {importando ? "Importando…" : `Importar ${itensSel.length} ${itensSel.length === 1 ? "peça" : "peças"}`}
              </button>
              <button type="button" onClick={() => setSel(null)} disabled={importando}
                style={{ padding: "11px 16px", borderRadius: 4, border: "none", background: "#f1f5f9", color: "#334155", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Voltar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
