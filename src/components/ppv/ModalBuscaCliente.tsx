"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { ClienteBusca } from "@/lib/ppv/types";
import { api } from "@/lib/ppv/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (nome: string) => void;
}

export default function ModalBuscaCliente({ open, onClose, onSelect }: Props) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ClienteBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [jaCarregou, setJaCarregou] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Busca clientes na API
  const buscar = useCallback(async (searchTermo: string) => {
    if (searchTermo.trim().length < 1) {
      if (!jaCarregou) {
        // Carrega os primeiros clientes ao abrir
        setBuscando(true);
        try {
          const data = await api.buscarClientes("a");
          setResultados(data);
          setJaCarregou(true);
        } catch { /* silencioso */ }
        setBuscando(false);
      }
      return;
    }
    setBuscando(true);
    try {
      const data = await api.buscarClientes(searchTermo.trim());
      setResultados(data);
    } catch {
      // mantém resultados anteriores
    }
    setBuscando(false);
  }, [jaCarregou]);

  // Reset ao abrir
  useEffect(() => {
    if (!open) return;
    setTermo("");
    setResultados([]);
    setJaCarregou(false);
    // Auto-load clientes ao abrir
    setBuscando(true);
    api.buscarClientes("a").then((data) => {
      setResultados(data);
      setJaCarregou(true);
    }).catch(() => {}).finally(() => setBuscando(false));
    setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  function handleChange(value: string) {
    setTermo(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscar(value), 300);
  }

  // Filtro local adicional sobre os resultados da API
  const filtrados = useMemo(() => {
    if (!termo.trim()) return resultados;
    const terms = termo.toLowerCase().split(/\s+/).filter(Boolean);
    return resultados.filter((c) => {
      const text = `${c.nome} ${c.documento} ${c.cidade}`.toLowerCase();
      return terms.every((t) => text.includes(t));
    });
  }, [resultados, termo]);

  function highlightMatch(text: string) {
    if (!termo.trim()) return text;
    const regex = new RegExp(`(${termo.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} style={{ background: "#FED7AA", borderRadius: 3, padding: "0 2px" }}>{part}</mark> : part
    );
  }

  if (!open) return null;

  return (
    <div className="ppv-drawer-overlay" style={{ zIndex: 1001 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ppv-modal-container" style={{ maxWidth: 860 }} onClick={(e) => e.stopPropagation()}>
        <div className="ppv-drawer" style={{ maxHeight: "80vh" }}>
          {/* Header */}
          <div className="ppv-drawer-header">
            <div className="ppv-drawer-header-left">
              <span className="ppv-drawer-header-title">
                <i className="fas fa-users" style={{ marginRight: 8, color: "var(--ppv-primary)" }} />
                Buscar Cliente
              </span>
              {!buscando && filtrados.length > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 6,
                  background: "var(--ppv-primary-light)", color: "var(--ppv-text-light)",
                }}>
                  {filtrados.length} encontrado{filtrados.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            <button className="ppv-btn-close" onClick={onClose}>
              <i className="fas fa-times" />
            </button>
          </div>

          {/* Search */}
          <div style={{ padding: "16px 28px 0", background: "var(--ppv-primary-light)" }}>
            <div style={{ position: "relative" }}>
              <i className="fas fa-search" style={{ position: "absolute", left: 14, top: 14, color: "var(--ppv-accent)" }} />
              <input
                ref={inputRef}
                type="text"
                value={termo}
                onChange={(e) => handleChange(e.target.value)}
                onKeyUp={(e) => e.key === "Enter" && buscar(termo)}
                placeholder="Nome, CNPJ ou Cidade do cliente..."
                style={{ paddingLeft: 42, marginBottom: 0 }}
              />
              {termo && (
                <button
                  onClick={() => { setTermo(""); buscar(""); }}
                  style={{
                    position: "absolute", right: 14, top: 14,
                    border: "none", background: "none", cursor: "pointer",
                    color: "var(--ppv-text-light)", fontSize: 14,
                  }}
                >
                  <i className="fas fa-times" />
                </button>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="ppv-drawer-body" style={{ padding: "12px 28px 28px" }}>
            {buscando ? (
              <div className="ppv-loading" style={{ padding: "40px 20px" }}>
                <div className="ppv-spinner" />
                <span>Buscando clientes...</span>
              </div>
            ) : filtrados.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--ppv-text-light)" }}>
                <i className="fas fa-users" style={{ fontSize: 32, marginBottom: 12, display: "block", color: "var(--ppv-border)" }} />
                {termo ? "Nenhum cliente encontrado para este filtro" : "Digite para pesquisar clientes..."}
              </div>
            ) : (
              <div style={{ borderRadius: 10, border: "1px solid var(--ppv-border-light)", overflow: "hidden" }}>
                {/* Header fixo */}
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--ppv-primary-light)" }}>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--ppv-text-light)", borderBottom: "1px solid var(--ppv-border-light)" }}>Cliente</th>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--ppv-text-light)", borderBottom: "1px solid var(--ppv-border-light)", width: 160 }}>CNPJ / CPF</th>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--ppv-text-light)", borderBottom: "1px solid var(--ppv-border-light)", width: 150 }}>Cidade</th>
                    </tr>
                  </thead>
                </table>
                {/* Body scrollável */}
                <div style={{ maxHeight: 400, overflowY: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <tbody>
                      {filtrados.map((c, idx) => (
                        <tr
                          key={idx}
                          onClick={() => { onSelect(c.nome); onClose(); }}
                          style={{ cursor: "pointer", borderBottom: "1px solid var(--ppv-primary-light)", transition: "background 0.12s" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ppv-primary-light)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                        >
                          <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "var(--ppv-text)" }}>
                            <i className="fas fa-user" style={{ marginRight: 8, fontSize: 11, color: "var(--ppv-accent)" }} />
                            {highlightMatch(c.nome)}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: 13, fontFamily: "monospace", color: "var(--ppv-text-light)", width: 160 }}>{highlightMatch(c.documento)}</td>
                          <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--ppv-text-light)", width: 150 }}>{c.cidade || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
