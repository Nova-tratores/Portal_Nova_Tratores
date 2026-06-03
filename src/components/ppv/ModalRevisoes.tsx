"use client";

import { useState, useEffect, useCallback } from "react";

interface Produto { codigo: string; quantidade: number }
interface Revisao {
  id: number; Trator: string; Cod_Trator: string; Horas: string;
  tipo: string; produtos: Produto[];
}
interface Props { open: boolean; onClose: () => void; onSaved?: () => void }

export default function ModalRevisoes({ open, onClose, onSaved }: Props) {
  const [revisoes, setRevisoes] = useState<Revisao[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Revisao | null>(null);
  const [editProdutos, setEditProdutos] = useState<Produto[]>([]);
  const [editTrator, setEditTrator] = useState("");
  const [editCodTrator, setEditCodTrator] = useState("");
  const [editHoras, setEditHoras] = useState("");
  const [editTipo, setEditTipo] = useState("revisao");
  const [saving, setSaving] = useState(false);
  const [criando, setCriando] = useState(false);
  const [msg, setMsg] = useState("");
  const [expandedTrator, setExpandedTrator] = useState<string | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "revisao" | "manutencao">("todos");

  const carregar = useCallback(async () => {
    setLoading(true);
    try { const res = await fetch("/api/ppv/revisoes/gerenciar"); if (res.ok) setRevisoes(await res.json()); } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => { if (open) carregar(); }, [open, carregar]);

  const abrirEdicao = (rev: Revisao) => {
    setSelected(rev); setEditTrator(rev.Trator); setEditCodTrator(rev.Cod_Trator);
    setEditHoras(rev.Horas); setEditTipo(rev.tipo || "revisao");
    setEditProdutos([...rev.produtos]); setCriando(false); setMsg("");
    setExpandedTrator(rev.Trator);
  };
  const abrirNova = (tipo: string = "revisao") => {
    setSelected(null); setEditTrator(""); setEditCodTrator(""); setEditHoras("");
    setEditTipo(tipo); setEditProdutos([{ codigo: "", quantidade: 1 }]);
    setCriando(true); setMsg("");
  };
  const addProduto = () => setEditProdutos(p => [...p, { codigo: "", quantidade: 1 }]);
  const removeProduto = (i: number) => setEditProdutos(p => p.filter((_, idx) => idx !== i));
  const updateProduto = (i: number, field: keyof Produto, value: string | number) =>
    setEditProdutos(p => p.map((prod, idx) => idx === i ? { ...prod, [field]: value } : prod));

  const salvar = async () => {
    if (!editTrator.trim() || !editHoras.trim()) { setMsg("Modelo e Nome/Horas são obrigatórios"); return; }
    const produtosLimpos = editProdutos.filter(p => p.codigo.trim());
    if (produtosLimpos.length === 0) { setMsg("Adicione pelo menos um produto"); return; }
    setSaving(true); setMsg("");
    try {
      const body: any = { Trator: editTrator.trim(), Cod_Trator: editCodTrator.trim(), Horas: editHoras.trim(), tipo: editTipo, produtos: produtosLimpos };
      if (selected) body.id = selected.id;
      const res = await fetch("/api/ppv/revisoes/gerenciar", { method: selected ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) { setMsg(data.error || "Erro ao salvar"); }
      else { setMsg("Salvo!"); setSelected(null); setCriando(false); await carregar(); onSaved?.(); }
    } catch { setMsg("Erro ao salvar"); }
    setSaving(false);
  };

  const excluir = async (id: number) => {
    if (!confirm("Excluir este kit?")) return;
    try { await fetch("/api/ppv/revisoes/gerenciar", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      if (selected?.id === id) { setSelected(null); setCriando(false); } await carregar(); onSaved?.();
    } catch { /* */ }
  };

  if (!open) return null;

  const revsFiltradas = filtroTipo === "todos" ? revisoes : revisoes.filter(r => (r.tipo || "revisao") === filtroTipo);
  const tratores = [...new Set(revsFiltradas.map(r => r.Trator))].sort();
  const isEditing = selected || criando;
  const totalRevisoes = revisoes.filter(r => (r.tipo || "revisao") === "revisao").length;
  const totalManutencao = revisoes.filter(r => r.tipo === "manutencao").length;

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", zIndex: 60000, display: "flex", alignItems: "stretch", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 1200, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 25px 60px rgba(0,0,0,0.25)", margin: "auto 0" }}>

        {/* Header */}
        <div style={{ padding: "18px 28px", borderBottom: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 16, background: "#FAFBFC" }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "linear-gradient(135deg, #dc2626, #b91c1c)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>
            <i className="fas fa-tools" style={{ fontSize: 20 }} />
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: "#1E293B" }}>Kits de Revisão & Manutenção</h3>
            <p style={{ fontSize: 12, color: "#94A3B8", margin: 0 }}>{totalRevisoes} revisões · {totalManutencao} manutenções</p>
          </div>

          {/* Filtro tipo */}
          <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 8, padding: 3 }}>
            {([["todos", "Todos"], ["revisao", "Revisão"], ["manutencao", "Manutenção"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFiltroTipo(k)}
                style={{ padding: "6px 14px", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer",
                  background: filtroTipo === k ? (k === "manutencao" ? "#7C3AED" : k === "revisao" ? "#dc2626" : "#1E293B") : "transparent",
                  color: filtroTipo === k ? "#fff" : "#64748B", transition: "all .15s" }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => abrirNova("revisao")}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
              <i className="fas fa-plus" /> Revisão
            </button>
            <button onClick={() => abrirNova("manutencao")}
              style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "#7C3AED", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
              <i className="fas fa-plus" /> Manutenção
            </button>
            <button onClick={onClose}
              style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748B" }}>
              <i className="fas fa-times" />
            </button>
          </div>
        </div>

        <div style={{ display: "flex", flex: 1, overflow: "hidden", minHeight: 0 }}>
          {/* Sidebar com cascata */}
          <div style={{ width: 320, borderRight: "1px solid #E2E8F0", overflow: "auto", background: "#F8FAFC", flexShrink: 0 }}>
            {loading ? (
              <div style={{ padding: 60, textAlign: "center", color: "#94A3B8", fontSize: 13 }}>Carregando...</div>
            ) : tratores.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center", color: "#CBD5E1", fontSize: 13 }}>Nenhum kit encontrado</div>
            ) : (
              tratores.map(trator => {
                const isOpen = expandedTrator === trator;
                const revsDoTrator = revsFiltradas.filter(r => r.Trator === trator);
                const temRevisao = revsDoTrator.some(r => (r.tipo || "revisao") === "revisao");
                const temManut = revsDoTrator.some(r => r.tipo === "manutencao");
                return (
                  <div key={trator}>
                    <div onClick={() => setExpandedTrator(isOpen ? null : trator)}
                      style={{ padding: "14px 18px", fontSize: 14, fontWeight: 700, color: isOpen ? "#1E293B" : "#475569",
                        background: isOpen ? "#EFF6FF" : "transparent", cursor: "pointer", display: "flex", alignItems: "center",
                        gap: 10, transition: "all .15s", userSelect: "none", borderBottom: "1px solid #E2E8F0" }}>
                      <i className="fas fa-chevron-right"
                        style={{ fontSize: 10, transition: "transform .2s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)", color: isOpen ? "#3b82f6" : "#CBD5E1" }} />
                      <i className="fas fa-tractor" style={{ fontSize: 14, color: isOpen ? "#dc2626" : "#94A3B8" }} />
                      <span style={{ flex: 1 }}>{trator}</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        {temRevisao && <span style={{ fontSize: 9, fontWeight: 700, color: "#dc2626", background: "#FEF2F2", padding: "2px 6px", borderRadius: 4 }}>REV</span>}
                        {temManut && <span style={{ fontSize: 9, fontWeight: 700, color: "#7C3AED", background: "#F5F3FF", padding: "2px 6px", borderRadius: 4 }}>MAN</span>}
                      </div>
                    </div>
                    <div style={{ maxHeight: isOpen ? 1000 : 0, overflow: "hidden", transition: "max-height .3s ease-in-out" }}>
                      {revsDoTrator.map(rev => {
                        const isManut = rev.tipo === "manutencao";
                        const isActive = selected?.id === rev.id;
                        return (
                          <div key={rev.id} onClick={() => abrirEdicao(rev)}
                            style={{ padding: "11px 18px 11px 48px", cursor: "pointer", borderBottom: "1px solid #F1F5F9",
                              background: isActive ? "#DBEAFE" : "transparent",
                              borderLeft: isActive ? "3px solid #3b82f6" : "3px solid transparent",
                              display: "flex", alignItems: "center", justifyContent: "space-between", transition: "background .1s" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <i className={isManut ? "fas fa-wrench" : "fas fa-clock"} style={{ fontSize: 11, color: isManut ? "#7C3AED" : "#94A3B8" }} />
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? "#1D4ED8" : "#1E293B" }}>{rev.Horas}</div>
                                <div style={{ fontSize: 10, color: "#94A3B8" }}>{rev.produtos.length} produtos</div>
                              </div>
                            </div>
                            <button onClick={e => { e.stopPropagation(); excluir(rev.id); }}
                              style={{ width: 24, height: 24, borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", color: "#CBD5E1", display: "flex", alignItems: "center", justifyContent: "center" }}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = "#DC2626" }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = "#CBD5E1" }}>
                              <i className="fas fa-trash" style={{ fontSize: 10 }} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Painel de edição */}
          <div style={{ flex: 1, overflow: "auto", padding: 28 }}>
            {!isEditing ? (
              <div style={{ textAlign: "center", padding: 80, color: "#CBD5E1" }}>
                <i className="fas fa-tools" style={{ fontSize: 48, marginBottom: 16, display: "block", opacity: 0.2 }} />
                <p style={{ fontSize: 15, color: "#94A3B8" }}>Selecione um kit ou crie um novo</p>
                <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 20 }}>
                  <button onClick={() => abrirNova("revisao")}
                    style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#dc2626", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    <i className="fas fa-plus" /> Nova Revisão
                  </button>
                  <button onClick={() => abrirNova("manutencao")}
                    style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#7C3AED", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    <i className="fas fa-plus" /> Nova Manutenção
                  </button>
                </div>
              </div>
            ) : (
              <div>
                {/* Tipo badge */}
                <div style={{ marginBottom: 20, display: "flex", gap: 8 }}>
                  <button onClick={() => setEditTipo("revisao")}
                    style={{ padding: "8px 18px", borderRadius: 8, border: editTipo === "revisao" ? "2px solid #dc2626" : "2px solid #E2E8F0",
                      background: editTipo === "revisao" ? "#FEF2F2" : "#fff", color: editTipo === "revisao" ? "#dc2626" : "#64748B",
                      fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .15s" }}>
                    <i className="fas fa-clock" style={{ marginRight: 6 }} /> Revisão (por horas)
                  </button>
                  <button onClick={() => setEditTipo("manutencao")}
                    style={{ padding: "8px 18px", borderRadius: 8, border: editTipo === "manutencao" ? "2px solid #7C3AED" : "2px solid #E2E8F0",
                      background: editTipo === "manutencao" ? "#F5F3FF" : "#fff", color: editTipo === "manutencao" ? "#7C3AED" : "#64748B",
                      fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all .15s" }}>
                    <i className="fas fa-wrench" style={{ marginRight: 6 }} /> Manutenção (peça/serviço)
                  </button>
                </div>

                {/* Campos */}
                <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", display: "block", marginBottom: 4 }}>MODELO / TRATOR</label>
                    <input value={editTrator} onChange={e => setEditTrator(e.target.value)} placeholder="Ex: 6075/6065"
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                  <div style={{ width: 140 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", display: "block", marginBottom: 4 }}>CÓDIGO</label>
                    <input value={editCodTrator} onChange={e => setEditCodTrator(e.target.value)} placeholder="Ex: T6075"
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#64748B", display: "block", marginBottom: 4 }}>
                      {editTipo === "manutencao" ? "NOME (Ex: Embreagem, Tração...)" : "HORAS (Ex: 50H, 300H...)"}
                    </label>
                    <input value={editHoras} onChange={e => setEditHoras(e.target.value)}
                      placeholder={editTipo === "manutencao" ? "Ex: Embreagem" : "Ex: 300H"}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 14, boxSizing: "border-box" }} />
                  </div>
                </div>

                {/* Produtos */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: "#1E293B" }}>Produtos ({editProdutos.length})</label>
                  <button onClick={addProduto}
                    style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#3b82f6", display: "flex", alignItems: "center", gap: 5 }}>
                    <i className="fas fa-plus" /> Adicionar
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: "calc(100vh - 480px)", overflow: "auto", paddingRight: 4 }}>
                  {editProdutos.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8 }}>
                      <span style={{ fontSize: 12, color: "#CBD5E1", fontWeight: 800, width: 24, textAlign: "center" }}>{i + 1}</span>
                      <input value={p.codigo} onChange={e => updateProduto(i, "codigo", e.target.value)} placeholder="Código do produto"
                        style={{ flex: 1, padding: "9px 12px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 13, fontFamily: "monospace" }} />
                      <input type="number" value={p.quantidade} onChange={e => updateProduto(i, "quantidade", parseFloat(e.target.value) || 1)}
                        style={{ width: 70, padding: "9px 12px", borderRadius: 6, border: "1px solid #E2E8F0", fontSize: 13, textAlign: "center" }} />
                      <button onClick={() => removeProduto(i)}
                        style={{ width: 30, height: 30, borderRadius: 6, border: "none", background: "#FEF2F2", cursor: "pointer", color: "#DC2626", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <i className="fas fa-times" style={{ fontSize: 11 }} />
                      </button>
                    </div>
                  ))}
                </div>

                {msg && (
                  <div style={{ marginTop: 12, padding: "10px 16px", borderRadius: 8,
                    background: msg.includes("Salvo") ? "#F0FDF4" : "#FEF2F2",
                    color: msg.includes("Salvo") ? "#047857" : "#DC2626", fontSize: 13, fontWeight: 600 }}>
                    {msg}
                  </div>
                )}

                <button onClick={salvar} disabled={saving}
                  style={{ marginTop: 16, width: "100%", padding: 14, borderRadius: 10, border: "none",
                    background: saving ? "#94A3B8" : editTipo === "manutencao" ? "#7C3AED" : "#dc2626",
                    color: "#fff", fontSize: 15, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", transition: "background .15s" }}>
                  {saving ? "Salvando..." : selected ? "Salvar Alterações" : `Criar ${editTipo === "manutencao" ? "Manutenção" : "Revisão"}`}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
