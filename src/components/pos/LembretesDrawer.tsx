"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ClienteOption } from "@/lib/pos/types";

interface Lembrete {
  id: number;
  cliente_chaves: string[];
  cliente_nomes: string;
  lembrete: string;
  ativo: boolean;
  created_at: string;
}

interface LembretesDrawerProps {
  visible: boolean;
  clientes: ClienteOption[];
  onClose: () => void;
}

export default function LembretesDrawer({ visible, clientes, onClose }: LembretesDrawerProps) {
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [loading, setLoading] = useState(false);
  const [clienteFilter, setClienteFilter] = useState("");
  const [selectedClientes, setSelectedClientes] = useState<ClienteOption[]>([]);
  const [textoLembrete, setTextoLembrete] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [saving, setSaving] = useState(false);
  const [showClienteList, setShowClienteList] = useState(false);

  const fetchLembretes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/pos/lembretes");
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
      const res = await fetch("/api/pos/lembretes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_chaves: selectedClientes.map((c) => c.chave),
          cliente_nomes: selectedClientes.map((c) => c.display.split("[")[0].trim()).join(", "),
          lembrete: textoLembrete,
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
    } catch {
      alert("Erro ao excluir.");
    }
  };

  const toggleAtivo = async (l: Lembrete) => {
    try {
      await fetch(`/api/pos/lembretes/${l.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo: !l.ativo }),
      });
      fetchLembretes();
    } catch {
      alert("Erro ao atualizar.");
    }
  };

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

              {/* Seleção de clientes */}
              <label>Clientes</label>

              {/* Botão para abrir/fechar a lista */}
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
                    <i className="fas fa-search" style={{ position: "absolute", left: 14, top: 13, color: "#7A6E5D" }} />
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
                      <div style={{ padding: 16, textAlign: "center", color: "#7A6E5D", fontSize: 13 }}>
                        Nenhum cliente encontrado
                      </div>
                    ) : !clienteFilter ? (
                      <div style={{ padding: 16, textAlign: "center", color: "#7A6E5D", fontSize: 13 }}>
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
                            <div style={{ fontSize: 11, color: "#7A6E5D" }}>
                              {c.display.includes("[") ? c.display.substring(c.display.indexOf("[")) : ""}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {/* Botão confirmar seleção */}
                  <button
                    className="lembretes-confirm-btn"
                    onClick={() => { setShowClienteList(false); setClienteFilter(""); }}
                  >
                    <i className="fas fa-check" />
                    Confirmar Seleção {selectedKeys.size > 0 && `(${selectedKeys.size})`}
                  </button>
                </>
              )}

              {/* Tags dos clientes selecionados (visível quando lista fechada) */}
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

              {/* Texto do lembrete */}
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

            {/* Lista de lembretes existentes */}
            <div className="os-card">
              <div className="os-card-title"><i className="fas fa-list" /> Lembretes Cadastrados</div>

              {loading ? (
                <div style={{ textAlign: "center", padding: 24, color: "#7A6E5D" }}>Carregando...</div>
              ) : lembretes.length === 0 ? (
                <div style={{ textAlign: "center", padding: 24, color: "#7A6E5D", fontSize: 14 }}>
                  Nenhum lembrete cadastrado.
                </div>
              ) : (
                <div className="lembretes-lista">
                  {lembretes.map((l) => (
                    <div key={l.id} className={`lembretes-item ${!l.ativo ? "inativo" : ""}`}>
                      <div className="lembretes-item-header">
                        <div className="lembretes-item-clientes">
                          <i className="fas fa-users" />
                          <span>{l.cliente_nomes}</span>
                        </div>
                        <div className="lembretes-item-actions">
                          <button
                            onClick={() => toggleAtivo(l)}
                            title={l.ativo ? "Desativar" : "Ativar"}
                            className={`lembretes-action-btn ${l.ativo ? "active" : ""}`}
                          >
                            <i className={`fas fa-${l.ativo ? "eye" : "eye-slash"}`} />
                          </button>
                          <button
                            onClick={() => { setEditingId(l.id); setEditingText(l.lembrete); }}
                            title="Editar"
                            className="lembretes-action-btn"
                          >
                            <i className="fas fa-pen" />
                          </button>
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
                        <div className="lembretes-edit-area">
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
                        <div className="lembretes-item-texto">{l.lembrete}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
