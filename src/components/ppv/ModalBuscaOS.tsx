"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { OSBusca } from "@/lib/ppv/types";
import { api } from "@/lib/ppv/api";

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string, cliente: string) => void;
}

export default function ModalBuscaOS({ open, onClose, onSelect }: Props) {
  const [termo, setTermo] = useState("");
  const [todasOS, setTodasOS] = useState<OSBusca[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Carrega todas as OS abertas quando o modal abre
  useEffect(() => {
    if (!open) return;
    setTermo("");
    setErro("");
    let cancelled = false;

    async function load() {
      setCarregando(true);
      try {
        const data = await api.listarOSAbertas();
        if (!cancelled) setTodasOS(data);
      } catch {
        if (!cancelled) setErro("Erro ao carregar ordens de serviço");
      }
      if (!cancelled) setCarregando(false);
    }

    load();
    setTimeout(() => inputRef.current?.focus(), 200);
    return () => { cancelled = true; };
  }, [open]);

  // Filtro local
  const filtradas = useMemo(() => {
    if (!termo.trim()) return todasOS;
    const terms = termo.toLowerCase().split(/\s+/).filter(Boolean);
    return todasOS.filter((os) => {
      const text = `${os.id} ${os.cliente} ${os.servSolicitado} ${os.status}`.toLowerCase();
      return terms.every((t) => text.includes(t));
    });
  }, [todasOS, termo]);

  function highlightMatch(text: string) {
    if (!termo.trim()) return text;
    const regex = new RegExp(`(${termo.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? <mark key={i} className="rounded bg-orange-200 px-0.5">{part}</mark> : part
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
                <i className="fas fa-clipboard-list" style={{ marginRight: 8, color: "var(--ppv-primary)" }} />
                Vincular Ordem de Serviço
              </span>
              {!carregando && (
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 6,
                  background: "var(--ppv-primary-light)", color: "var(--ppv-text-light)",
                }}>
                  {filtradas.length} de {todasOS.length} abertas
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
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Filtrar por ID, Cliente ou Serviço..."
                style={{ paddingLeft: 42, marginBottom: 0 }}
              />
              {termo && (
                <button
                  onClick={() => setTermo("")}
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
            {carregando ? (
              <div className="ppv-loading" style={{ padding: "40px 20px" }}>
                <div className="ppv-spinner" />
                <span>Carregando ordens de serviço abertas...</span>
              </div>
            ) : erro ? (
              <div style={{ textAlign: "center", padding: 40, color: "#EF4444", fontWeight: 600 }}>
                <i className="fas fa-exclamation-circle" style={{ marginRight: 8 }} />{erro}
              </div>
            ) : filtradas.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--ppv-text-light)" }}>
                <i className="fas fa-clipboard-list" style={{ fontSize: 32, marginBottom: 12, display: "block", color: "var(--ppv-border)" }} />
                {termo ? "Nenhuma OS encontrada para este filtro" : "Nenhuma OS aberta"}
              </div>
            ) : (
              <div style={{ borderRadius: 10, border: "1px solid var(--ppv-border-light)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--ppv-primary-light)" }}>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--ppv-text-light)", borderBottom: "1px solid var(--ppv-border-light)" }}>ID</th>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--ppv-text-light)", borderBottom: "1px solid var(--ppv-border-light)" }}>Cliente</th>
                      <th style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--ppv-text-light)", borderBottom: "1px solid var(--ppv-border-light)" }}>Serviço</th>
                      <th style={{ padding: "10px 16px", textAlign: "center", fontSize: 11, fontWeight: 800, textTransform: "uppercase", color: "var(--ppv-text-light)", borderBottom: "1px solid var(--ppv-border-light)" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody style={{ maxHeight: 400, overflowY: "auto" }}>
                    {filtradas.map((os) => (
                      <tr
                        key={os.id}
                        onClick={() => { onSelect(os.id, os.cliente); onClose(); }}
                        style={{ cursor: "pointer", borderBottom: "1px solid var(--ppv-primary-light)", transition: "background 0.12s" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ppv-primary-light)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      >
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "var(--ppv-primary)" }}>#{highlightMatch(os.id)}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 600, color: "var(--ppv-text)" }}>{highlightMatch(os.cliente)}</td>
                        <td style={{ padding: "12px 16px", maxWidth: 280 }}>
                          <div style={{ fontSize: 12, color: "var(--ppv-text-light)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={os.servSolicitado}>{highlightMatch(os.servSolicitado)}</div>
                        </td>
                        <td style={{ padding: "12px 16px", textAlign: "center" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: "var(--ppv-primary-light)", color: "var(--ppv-text-light)" }}>{os.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
