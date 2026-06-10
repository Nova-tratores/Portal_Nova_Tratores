"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ClienteOption } from "@/lib/pos/types";

interface Lembrete {
  id: number;
  cliente_chaves: string[];
  cliente_nomes: string;
  cliente_cnpj_cpf: string;
  lembrete: string;
  ativo: boolean;
  concluido: boolean;
  concluido_em: string | null;
  concluido_por: string | null;
  criado_por: string;
  created_at: string;
}

interface LembretesDrawerProps {
  visible: boolean;
  clientes: ClienteOption[];
  userName: string;
  onClose: () => void;
}

export default function LembretesDrawer({ visible, clientes, userName, onClose }: LembretesDrawerProps) {
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [loading, setLoading] = useState(false);
  const [clienteFilter, setClienteFilter] = useState("");
  const [selectedClientes, setSelectedClientes] = useState<ClienteOption[]>([]);
  const [textoLembrete, setTextoLembrete] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [saving, setSaving] = useState(false);
  const [showClienteList, setShowClienteList] = useState(false);
  const [detalheModal, setDetalheModal] = useState<Lembrete | null>(null);
  const [filtroView, setFiltroView] = useState<"ativos" | "concluidos">("ativos");

  const fetchLembretes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pos/lembretes?todos=1");
      const data = await res.json();
      if (Array.isArray(data)) setLembretes(data);
    } catch {
      console.error("Erro ao carregar lembretes");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) {
      fetchLembretes();
      setSelectedClientes([]);
      setTextoLembrete("");
      setClienteFilter("");
      setEditingId(null);
      setShowClienteList(false);
      setDetalheModal(null);
    }
  }, [visible, fetchLembretes]);

  const selectedKeys = useMemo(() => new Set(selectedClientes.map((c) => c.chave)), [selectedClientes]);

  const filteredClientes = useMemo(() => {
    if (!clienteFilter) return [];
    const terms = clienteFilter.toLowerCase().split(/\s+/).filter(Boolean);
    return clientes
      .filter((c) => {
        const d = c.display.toLowerCase();
        return terms.every((t) => d.includes(t));
      })
      .slice(0, 30);
  }, [clienteFilter, clientes]);

  const toggleCliente = (c: ClienteOption) => {
    setSelectedClientes((prev) =>
      prev.some((s) => s.chave === c.chave)
        ? prev.filter((s) => s.chave !== c.chave)
        : [...prev, c]
    );
  };

  const criarLembrete = async () => {
    if (!selectedClientes.length || !textoLembrete.trim()) {
      alert("Selecione ao menos um cliente e preencha o lembrete.");
      return;
    }
    setSaving(true);
    try {
      const cnpjs = selectedClientes
        .map((c) => { const m = c.display.match(/\[([^\]]+)\]/); return m ? m[1].replace(/\D/g, "") : ""; })
        .filter(Boolean)
        .join(",");

      const res = await fetch("/api/pos/lembretes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_chaves: selectedClientes.map((c) => c.chave),
          cliente_nomes: selectedClientes.map((c) => c.display.split("[")[0].trim()).join(", "),
          cliente_cnpj_cpf: cnpjs,
          lembrete: textoLembrete,
          criado_por: userName || "Sistema",
        }),
      });
      if (res.ok) {
        setSelectedClientes([]);
        setTextoLembrete("");
        fetchLembretes();
      } else {
        const err = await res.json();
        alert(err.erro || "Erro ao criar lembrete.");
      }
    } catch {
      alert("Erro ao criar lembrete.");
    }
    setSaving(false);
  };

  const salvarEdicao = async (id: number) => {
    if (!editingText.trim()) return;
    try {
      await fetch(`/api/pos/lembretes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lembrete: editingText }),
      });
      setEditingId(null);
      fetchLembretes();
    } catch {
      alert("Erro ao salvar.");
    }
  };

  const excluirLembrete = async (id: number) => {
    if (!confirm("Deseja excluir este lembrete?")) return;
    try {
      await fetch(`/api/pos/lembretes/${id}`, { method: "DELETE" });
      fetchLembretes();
      if (detalheModal?.id === id) setDetalheModal(null);
    } catch {
      alert("Erro ao excluir.");
    }
  };

  const concluirLembrete = async (l: Lembrete) => {
    try {
      await fetch(`/api/pos/lembretes/${l.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concluido: !l.concluido,
          concluido_por: userName || "Sistema",
        }),
      });
      fetchLembretes();
      if (detalheModal?.id === l.id) {
        setDetalheModal({ ...l, concluido: !l.concluido, concluido_em: !l.concluido ? new Date().toISOString() : null, concluido_por: !l.concluido ? userName : null });
      }
    } catch {
      alert("Erro ao atualizar.");
    }
  };

  const lembretesFiltrados = lembretes.filter((l) =>
    filtroView === "ativos" ? !l.concluido && l.ativo : l.concluido
  );

  if (!visible) return null;

  return (
    <div className="drawer-overlay active">
      <div className="modal-container">
        <div className="drawer os-drawer">
          {/* Header */}
          <div className="os-header">
            <div className="os-header-left">
              <span className="os-header-title">
                <i className="fas fa-bell" style={{ marginRight: 8, color: "#E65100" }} />
                Lembretes de Clientes
              </span>
            </div>
            <div className="os-header-actions">
              <button className="os-btn-close" onClick={onClose}>
                <i className="fas fa-times" />
              </button>
            </div>
          </div>

          <div className="os-body">
            {/* Criar novo lembrete */}
            <div className="os-card">
              <div className="os-card-title"><i className="fas fa-plus-circle" /> Novo Lembrete</div>

              <label>Clientes</label>

              {!showClienteList ? (
                <button
                  className="lembretes-select-btn"
                  onClick={() => setShowClienteList(true)}
                >
                  <i className="fas fa-users" />
                  {selectedKeys.size > 0
                    ? `${selectedKeys.size} cliente${selectedKeys.size > 1 ? "s" : ""} selecionado${selectedKeys.size > 1 ? "s" : ""}`
                    : "Selecionar Clientes"}
                  <i className="fas fa-chevron-down" style={{ marginLeft: "auto", fontSize: 11 }} />
                </button>
              ) : (
                <>
                  <div style={{ position: "relative" }}>
                    <i className="fas fa-search" style={{ position: "absolute", left: 14, top: 13, color: "var(--portal-text-secondary)" }} />
                    <input
                      type="text"
                      placeholder="Buscar por nome, razão social ou CNPJ/CPF..."
                      value={clienteFilter}
                      onChange={(e) => setClienteFilter(e.target.value)}
                      style={{ paddingLeft: 40, marginBottom: 0 }}
                      autoFocus
                    />
                  </div>

                  <div className="lembretes-checkbox-list">
                    {filteredClientes.length === 0 && clienteFilter ? (
                      <div style={{ padding: 16, textAlign: "center", color: "var(--portal-text-secondary)", fontSize: 13 }}>
                        Nenhum cliente encontrado
                      </div>
                    ) : !clienteFilter ? (
                      <div style={{ padding: 16, textAlign: "center", color: "var(--portal-text-secondary)", fontSize: 13 }}>
                        Digite para buscar clientes...
                      </div>
                    ) : filteredClientes.map((c) => {
                      const checked = selectedKeys.has(c.chave);
                      return (
                        <label key={c.chave} className={`lembretes-checkbox-item ${checked ? "checked" : ""}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCliente(c)}
                            className="lembretes-checkbox"
                          />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.display.split("[")[0].trim()}</div>
                            <div style={{ fontSize: 11, color: "var(--portal-text-secondary)" }}>
                              {c.display.includes("[") ? c.display.substring(c.display.indexOf("[")) : ""}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <button
                    className="lembretes-confirm-btn"
                    onClick={() => { setShowClienteList(false); setClienteFilter(""); }}
                  >
                    <i className="fas fa-check" />
                    Confirmar Seleção {selectedKeys.size > 0 && `(${selectedKeys.size})`}
                  </button>
                </>
              )}

              {selectedKeys.size > 0 && !showClienteList && (
                <div className="lembretes-selected-clientes">
                  {selectedClientes.map((c) => (
                    <div key={c.chave} className="lembretes-selected-tag">
                      <i className="fas fa-check" />
                      <span>{c.display.split("[")[0].trim()}</span>
                      <button onClick={() => toggleCliente(c)} title="Remover">
                        <i className="fas fa-times" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: 12 }}>
                <label>Lembrete</label>
                <textarea
                  rows={3}
                  value={textoLembrete}
                  onChange={(e) => setTextoLembrete(e.target.value)}
                  placeholder="Ex: Cliente pede desconto especial, verificar contrato..."
                  style={{ marginBottom: 0 }}
                />
              </div>

              <button
                className="os-btn-save"
                style={{ marginTop: 12, width: "100%" }}
                onClick={criarLembrete}
                disabled={saving || !selectedClientes.length || !textoLembrete.trim()}
              >
                {saving ? "Salvando..." : "Criar Lembrete"}
              </button>
            </div>

            {/* Filtros ativos / concluidos */}
            <div style={{ display: "flex", gap: 8, padding: "0 0 4px" }}>
              <button
                onClick={() => setFiltroView("ativos")}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 8, border: "2px solid",
                  borderColor: filtroView === "ativos" ? "#E65100" : "var(--portal-border)",
                  background: filtroView === "ativos" ? "#FFF3E0" : "transparent",
                  color: filtroView === "ativos" ? "#E65100" : "var(--portal-text-secondary)",
                  fontWeight: 700, fontSize: 12, cursor: "pointer",
                }}
              >
                <i className="fas fa-bell" style={{ marginRight: 6 }} />
                Ativos ({lembretes.filter((l) => !l.concluido && l.ativo).length})
              </button>
              <button
                onClick={() => setFiltroView("concluidos")}
                style={{
                  flex: 1, padding: "8px 12px", borderRadius: 8, border: "2px solid",
                  borderColor: filtroView === "concluidos" ? "#2E7D32" : "var(--portal-border)",
                  background: filtroView === "concluidos" ? "#E8F5E9" : "transparent",
                  color: filtroView === "concluidos" ? "#2E7D32" : "var(--portal-text-secondary)",
                  fontWeight: 700, fontSize: 12, cursor: "pointer",
                }}
              >
                <i className="fas fa-check-circle" style={{ marginRight: 6 }} />
                Concluídos ({lembretes.filter((l) => l.concluido).length})
              </button>
            </div>

            {/* Lista de lembretes */}
            <div className="os-card">
              <div className="os-card-title">
                <i className={`fas fa-${filtroView === "ativos" ? "list" : "check-double"}`} />
                {filtroView === "ativos" ? " Lembretes Ativos" : " Lembretes Concluídos"}
              </div>

              {loading ? (
                <div style={{ textAlign: "center", padding: 24, color: "var(--portal-text-secondary)" }}>Carregando...</div>
              ) : lembretesFiltrados.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: "var(--portal-text-secondary)", fontSize: 14 }}>
                  {filtroView === "ativos" ? "Nenhum lembrete ativo." : "Nenhum lembrete concluído."}
                </div>
              ) : (
                <div className="lembretes-lista">
                  {lembretesFiltrados.map((l) => (
                    <div
                      key={l.id}
                      className={`lembretes-item ${l.concluido ? "concluido" : ""}`}
                      style={{ cursor: "pointer", opacity: l.concluido ? 0.7 : 1 }}
                      onClick={() => setDetalheModal(l)}
                    >
                      <div className="lembretes-item-header">
                        <div className="lembretes-item-clientes">
                          <i className="fas fa-users" />
                          <span>{l.cliente_nomes}</span>
                        </div>
                        <div className="lembretes-item-actions" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => concluirLembrete(l)}
                            title={l.concluido ? "Reabrir" : "Concluir"}
                            className={`lembretes-action-btn ${l.concluido ? "concluido" : "concluir"}`}
                            style={{
                              color: l.concluido ? "#2E7D32" : "#E65100",
                              background: l.concluido ? "#E8F5E9" : "#FFF3E0",
                            }}
                          >
                            <i className={`fas fa-${l.concluido ? "undo" : "check"}`} />
                          </button>
                          {!l.concluido && (
                            <button
                              onClick={() => { setEditingId(l.id); setEditingText(l.lembrete); }}
                              title="Editar"
                              className="lembretes-action-btn"
                            >
                              <i className="fas fa-pen" />
                            </button>
                          )}
                          <button
                            onClick={() => excluirLembrete(l.id)}
                            title="Excluir"
                            className="lembretes-action-btn danger"
                          >
                            <i className="fas fa-trash" />
                          </button>
                        </div>
                      </div>

                      {editingId === l.id ? (
                        <div className="lembretes-edit-area" onClick={(e) => e.stopPropagation()}>
                          <textarea
                            rows={3}
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            style={{ marginBottom: 8 }}
                          />
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button className="os-btn-cancel" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => setEditingId(null)}>
                              Cancelar
                            </button>
                            <button className="os-btn-save" style={{ padding: "6px 14px", fontSize: 12 }} onClick={() => salvarEdicao(l.id)}>
                              Salvar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="lembretes-item-texto" style={{ textDecoration: l.concluido ? "line-through" : "none" }}>
                          {l.lembrete}
                        </div>
                      )}

                      <div style={{ fontSize: 10, color: "var(--portal-text-secondary)", marginTop: 4 }}>
                        {l.criado_por ? `Por ${l.criado_por}` : ""}
                        {l.criado_por && l.created_at ? " — " : ""}
                        {l.created_at ? new Date(l.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal de detalhes do lembrete */}
      {detalheModal && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 7000,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)",
          }}
          onClick={() => setDetalheModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 480, maxWidth: "92vw", borderRadius: 16,
              background: "var(--portal-bg-card, #fff)", padding: 0,
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden",
            }}
          >
            {/* Header modal */}
            <div style={{
              padding: "20px 24px", borderBottom: "1px solid var(--portal-border, #e5e5e5)",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: detalheModal.concluido ? "#E8F5E9" : "#FFF3E0",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <i className={`fas fa-${detalheModal.concluido ? "check-circle" : "bell"}`} style={{ fontSize: 20, color: detalheModal.concluido ? "#2E7D32" : "#E65100" }} />
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: "var(--portal-text, #1a1a1a)" }}>
                    Lembrete #{detalheModal.id}
                  </div>
                  <div style={{ fontSize: 11, color: detalheModal.concluido ? "#2E7D32" : "#E65100", fontWeight: 700 }}>
                    {detalheModal.concluido ? "Concluído" : "Ativo"}
                  </div>
                </div>
              </div>
              <button onClick={() => setDetalheModal(null)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "var(--portal-text-secondary, #888)" }}>&times;</button>
            </div>

            {/* Corpo */}
            <div style={{ padding: "20px 24px" }}>
              {/* Clientes */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--portal-text-secondary, #888)", letterSpacing: 0.5, marginBottom: 6 }}>
                  Clientes
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--portal-text, #1a1a1a)" }}>
                  {detalheModal.cliente_nomes}
                </div>
              </div>

              {/* Texto */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--portal-text-secondary, #888)", letterSpacing: 0.5, marginBottom: 6 }}>
                  Lembrete
                </div>
                <div style={{
                  fontSize: 14, color: "var(--portal-text, #1a1a1a)", lineHeight: 1.5,
                  padding: 14, borderRadius: 10, background: "var(--portal-bg-card-alt, #f5f5f5)",
                  textDecoration: detalheModal.concluido ? "line-through" : "none",
                }}>
                  {detalheModal.lembrete}
                </div>
              </div>

              {/* Info grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
                <div style={{ padding: 12, borderRadius: 10, background: "var(--portal-bg-card-alt, #f5f5f5)" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--portal-text-secondary, #888)", marginBottom: 4 }}>
                    <i className="fas fa-user" style={{ marginRight: 4 }} /> Criado por
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--portal-text, #1a1a1a)" }}>
                    {detalheModal.criado_por || "—"}
                  </div>
                </div>
                <div style={{ padding: 12, borderRadius: 10, background: "var(--portal-bg-card-alt, #f5f5f5)" }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "var(--portal-text-secondary, #888)", marginBottom: 4 }}>
                    <i className="fas fa-calendar" style={{ marginRight: 4 }} /> Criado em
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--portal-text, #1a1a1a)" }}>
                    {detalheModal.created_at
                      ? new Date(detalheModal.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </div>
                </div>
                {detalheModal.concluido && (
                  <>
                    <div style={{ padding: 12, borderRadius: 10, background: "#E8F5E9" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "#2E7D32", marginBottom: 4 }}>
                        <i className="fas fa-user-check" style={{ marginRight: 4 }} /> Concluído por
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1B5E20" }}>
                        {detalheModal.concluido_por || "—"}
                      </div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 10, background: "#E8F5E9" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", color: "#2E7D32", marginBottom: 4 }}>
                        <i className="fas fa-calendar-check" style={{ marginRight: 4 }} /> Concluído em
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1B5E20" }}>
                        {detalheModal.concluido_em
                          ? new Date(detalheModal.concluido_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "—"}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Ações */}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => concluirLembrete(detalheModal)}
                  style={{
                    flex: 1, padding: "12px", borderRadius: 10, border: "none",
                    background: detalheModal.concluido ? "#FFF3E0" : "#E8F5E9",
                    color: detalheModal.concluido ? "#E65100" : "#2E7D32",
                    fontWeight: 700, fontSize: 13, cursor: "pointer",
                  }}
                >
                  <i className={`fas fa-${detalheModal.concluido ? "undo" : "check-circle"}`} style={{ marginRight: 6 }} />
                  {detalheModal.concluido ? "Reabrir Lembrete" : "Concluir Lembrete"}
                </button>
                <button
                  onClick={() => { excluirLembrete(detalheModal.id); }}
                  style={{
                    padding: "12px 16px", borderRadius: 10, border: "1px solid #FFCDD2",
                    background: "#FFF", color: "#D32F2F",
                    fontWeight: 700, fontSize: 13, cursor: "pointer",
                  }}
                >
                  <i className="fas fa-trash" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
