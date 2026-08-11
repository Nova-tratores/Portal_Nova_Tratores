"use client";
// Gerência das categorias de faturamento (NF-e) do PPV — espelha o Omie e é
// editável. Molde do ModalTags: lista + adicionar + editar + inativar + excluir,
// por empresa (conta Omie). Escrita via /api/ppv/faturamento-categorias.
import { useCallback, useEffect, useState } from "react";
import { api, type CategoriaFat } from "@/lib/ppv/api";

const EMPRESAS = ["Nova Tratores", "Castro Peças"];

export default function GerenciarCategoriasModal({
  open, onClose, empresaInicial, onChanged,
}: {
  open: boolean;
  onClose: () => void;
  empresaInicial?: string;
  onChanged?: () => void;
}) {
  const [empresa, setEmpresa] = useState(empresaInicial || EMPRESAS[0]);
  const [lista, setLista] = useState<CategoriaFat[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [novoCodigo, setNovoCodigo] = useState("");
  const [novaDescricao, setNovaDescricao] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true); setErro("");
    try {
      const r = await api.listarCategoriasFat(empresa, true); // all=1 (mostra inativas também)
      setLista(r.categorias);
    } catch (e) { setErro(e instanceof Error ? e.message : "Erro ao carregar."); }
    setLoading(false);
  }, [empresa]);

  useEffect(() => { if (open) carregar(); }, [open, carregar]);
  useEffect(() => { if (empresaInicial) setEmpresa(empresaInicial); }, [empresaInicial]);

  if (!open) return null;

  const salvar = async (c: { codigo: string; descricao?: string; ativo?: boolean; ordem?: number }) => {
    try { await api.salvarCategoriaFat({ ...c, empresa }); await carregar(); onChanged?.(); }
    catch (e) { alert(e instanceof Error ? e.message : "Erro ao salvar."); }
  };
  const adicionar = async () => {
    if (!novoCodigo.trim()) return;
    await salvar({ codigo: novoCodigo.trim(), descricao: novaDescricao.trim(), ativo: true, ordem: 0 });
    setNovoCodigo(""); setNovaDescricao("");
  };
  const excluir = async (codigo: string) => {
    if (!confirm(`Remover a categoria ${codigo}?`)) return;
    try { await api.excluirCategoriaFat(codigo, empresa); await carregar(); onChanged?.(); }
    catch (e) { alert(e instanceof Error ? e.message : "Erro ao excluir."); }
  };
  const sincronizar = async () => {
    setSincronizando(true);
    try { const r = await api.sincronizarCategoriasFat(empresa); await carregar(); onChanged?.(); alert(`${r.total} categorias sincronizadas do Omie.`); }
    catch (e) { alert(e instanceof Error ? e.message : "Erro ao sincronizar."); }
    setSincronizando(false);
  };

  const inp: React.CSSProperties = { padding: "8px 10px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: 13, outline: "none", boxSizing: "border-box" };
  const btn: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70000, background: "rgba(0,0,0,.5)", backdropFilter: "blur(4px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 640, maxHeight: "84vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 60px rgba(0,0,0,.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid #eef0f3" }}>
          <div style={{ flex: 1, fontSize: 17, fontWeight: 700, color: "#1e293b" }}>Categorias de faturamento (NF-e)</div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", color: "#475569", fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 20px", borderBottom: "1px solid #eef0f3", flexWrap: "wrap" }}>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} style={{ ...inp, fontWeight: 600 }}>
            {EMPRESAS.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <button onClick={sincronizar} disabled={sincronizando} style={{ ...btn, background: "#0ea5e9", color: "#fff" }}>
            {sincronizando ? "Sincronizando…" : "Sincronizar do Omie"}
          </button>
          <span style={{ fontSize: 12, color: "#64748b" }}>puxa as categorias de receita do Omie desta conta</span>
        </div>

        <div style={{ padding: "14px 20px", overflowY: "auto" }}>
          {/* Nova categoria manual */}
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input value={novoCodigo} onChange={(e) => setNovoCodigo(e.target.value)} placeholder="Código (ex.: 1.01.03)" style={{ ...inp, width: 160 }} />
            <input value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} placeholder="Descrição" style={{ ...inp, flex: 1 }} />
            <button onClick={adicionar} style={{ ...btn, background: "#16a34a", color: "#fff" }}>Adicionar</button>
          </div>

          {erro && <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10 }}>{erro}</div>}
          {loading ? (
            <div style={{ padding: 30, textAlign: "center", color: "#64748b" }}>Carregando…</div>
          ) : lista.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "#64748b", fontSize: 13 }}>Nenhuma categoria — clique em “Sincronizar do Omie” ou adicione manualmente.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {lista.map((c) => (
                <div key={c.codigo} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", border: "1px solid #eef0f3", borderRadius: 9, background: c.ativo ? "#fff" : "#f8fafc", opacity: c.ativo ? 1 : 0.6 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#0f172a", minWidth: 70 }}>{c.codigo}</span>
                  <span style={{ flex: 1, fontSize: 13, color: "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.descricao || "—"}</span>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#475569", cursor: "pointer" }}>
                    <input type="checkbox" checked={c.ativo} onChange={(e) => salvar({ codigo: c.codigo, descricao: c.descricao || "", ativo: e.target.checked, ordem: c.ordem })} /> ativa
                  </label>
                  <button onClick={() => excluir(c.codigo)} title="Excluir" style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>excluir</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
