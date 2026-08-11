"use client";
// Faturamento do PPV (NF-e). Passo 1: escolhe a categoria (regra fiscal) e
// confere o pedido (Simular — não emite nada). Passo 2: confirmação dupla e
// emissão real via TrocarEtapaPedido no Omie.
import { useCallback, useEffect, useState } from "react";
import { api, type CategoriaFat, type PrevisaoFat } from "@/lib/ppv/api";
import { formatarMoeda } from "@/lib/ppv/utils";
import GerenciarCategoriasModal from "./GerenciarCategoriasModal";

export default function FaturarModal({
  open, ppvId, userName, onClose, onDone, showToast,
}: {
  open: boolean;
  ppvId: string | null;
  userName?: string;
  onClose: () => void;
  onDone: () => void;
  showToast: (tipo: "success" | "error", msg: string) => void;
}) {
  const [prev, setPrev] = useState<PrevisaoFat | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const [categorias, setCategorias] = useState<CategoriaFat[]>([]);
  const [categoria, setCategoria] = useState("");
  const [confirmando, setConfirmando] = useState(false); // passo 2
  const [faturando, setFaturando] = useState(false);
  const [gerirOpen, setGerirOpen] = useState(false);

  const carregar = useCallback(async () => {
    if (!ppvId) return;
    setCarregando(true); setErro(""); setPrev(null); setConfirmando(false);
    try {
      const p = await api.simularFaturamento(ppvId);
      setPrev(p);
      if (p.empresa) {
        const r = await api.listarCategoriasFat(p.empresa);
        setCategorias(r.categorias);
        // default: categoria atual do pedido (se estiver na lista) senão a 1ª
        const atual = r.categorias.find((c) => c.codigo === p.categoriaAtual);
        setCategoria(atual?.codigo || r.categorias[0]?.codigo || p.categoriaAtual || "");
      }
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar."); }
    setCarregando(false);
  }, [ppvId]);

  useEffect(() => { if (open) carregar(); }, [open, carregar]);

  if (!open) return null;

  const recarregarCategorias = async () => {
    if (!prev?.empresa) return;
    try { const r = await api.listarCategoriasFat(prev.empresa); setCategorias(r.categorias); } catch { /* ignore */ }
  };

  const faturar = async () => {
    if (!ppvId || !categoria) return;
    setFaturando(true);
    try {
      const r = await api.faturar(ppvId, categoria, userName);
      showToast("success", `Faturado no Omie — pedido nº ${r.numeroPedido}. A NF-e é emitida pelo Omie.`);
      onDone();
      onClose();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro ao faturar."); }
    setFaturando(false);
  };

  const btn: React.CSSProperties = { padding: "10px 16px", borderRadius: 9, border: "none", fontSize: 13.5, fontWeight: 700, cursor: "pointer" };
  const catSel = categorias.find((c) => c.codigo === categoria);

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 68000, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px" }}>
        <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560, maxHeight: "86vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid #eef0f3" }}>
            <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Faturar pedido (NF-e)</div>
            <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "#475569", fontSize: 18 }}>×</button>
          </div>

          <div style={{ padding: "16px 20px", overflowY: "auto" }}>
            {carregando ? (
              <div style={{ padding: 30, textAlign: "center", color: "#64748b" }}>Consultando o pedido no Omie…</div>
            ) : erro ? (
              <div style={{ color: "#b91c1c", fontSize: 13.5 }}>{erro}</div>
            ) : !prev ? null : prev.jaFaturado ? (
              <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: "14px 16px", color: "#065f46", fontSize: 13.5 }}>
                Este pedido <strong>já foi faturado</strong> (etapa {prev.etapaAtual}). Nada a fazer.
              </div>
            ) : (
              <>
                {/* Resumo do pedido (Simular — não emite) */}
                <div style={{ border: "1px solid #eef0f3", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#64748b", marginBottom: 8 }}>
                    <span>Conta: <strong style={{ color: "#334155" }}>{prev.empresa}</strong></span>
                    <span>Etapa atual: {prev.etapaAtual || "—"}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
                    {(prev.itens || []).map((it, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5, color: "#334155" }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.quantidade}× {it.descricao}</span>
                        <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{formatarMoeda(it.valorTotal)}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderTop: "1px dashed #e2e8f0", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                    <span>Total</span><span>{formatarMoeda(prev.total || 0)}</span>
                  </div>
                </div>

                {/* Categoria (regra fiscal) */}
                <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>Categoria (regra fiscal)</label>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <select value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ flex: 1, padding: "10px 12px", borderRadius: 9, border: "1px solid #d1d5db", fontSize: 13.5, outline: "none" }}>
                    {categorias.length === 0 && <option value="">— nenhuma categoria cadastrada —</option>}
                    {categorias.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.descricao || ""}</option>)}
                  </select>
                  <button onClick={() => setGerirOpen(true)} style={{ ...btn, background: "#f1f5f9", color: "#334155", padding: "10px 12px" }}>Gerenciar</button>
                </div>
                {prev.categoriaAtual && catSel && catSel.codigo !== prev.categoriaAtual && (
                  <div style={{ fontSize: 12, color: "#b45309", marginBottom: 6 }}>A categoria do pedido no Omie será trocada de {prev.categoriaAtual} para {catSel.codigo}.</div>
                )}

                {/* Confirmação dupla */}
                {!confirmando ? (
                  <button
                    onClick={() => setConfirmando(true)}
                    disabled={!categoria}
                    style={{ ...btn, width: "100%", marginTop: 12, background: categoria ? "#dc2626" : "#fca5a5", color: "#fff", cursor: categoria ? "pointer" : "not-allowed" }}
                  >
                    Faturar (emitir NF-e)
                  </button>
                ) : (
                  <div style={{ marginTop: 12, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 13, color: "#7f1d1d", fontWeight: 700, marginBottom: 8 }}>
                      Isto emite uma NF-e real no Omie e não é facilmente desfeito. Confirmar?
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={faturar} disabled={faturando} style={{ ...btn, flex: 1, background: "#dc2626", color: "#fff" }}>
                        {faturando ? "Faturando…" : "Sim, faturar agora"}
                      </button>
                      <button onClick={() => setConfirmando(false)} disabled={faturando} style={{ ...btn, background: "#f1f5f9", color: "#334155" }}>Cancelar</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <GerenciarCategoriasModal open={gerirOpen} empresaInicial={prev?.empresa} onClose={() => setGerirOpen(false)} onChanged={recarregarCategorias} />
    </>
  );
}
