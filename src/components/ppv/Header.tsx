"use client";

import { useState, useRef, useEffect } from "react";

interface HeaderProps {
  searchFilter: string;
  onSearchChange: (value: string) => void;
  tipoFilter: string;
  onTipoFilterChange: (value: string) => void;
  tecnicoFilter: string;
  onTecnicoFilterChange: (value: string) => void;
  tecnicos: string[];
  clienteFilter: string;
  onClienteFilterChange: (value: string) => void;
  clientes: string[];
}

const TIPO_TABS = [
  { value: "TODOS", label: "Todos", icon: "fa-layer-group" },
  { value: "PEDIDO", label: "Pedido de Venda", icon: "fa-file-invoice-dollar" },
  { value: "REMESSA", label: "Remessa", icon: "fa-dolly" },
];

export default function Header({
  searchFilter, onSearchChange,
  tipoFilter, onTipoFilterChange,
  tecnicoFilter, onTecnicoFilterChange, tecnicos,
  clienteFilter, onClienteFilterChange, clientes,
}: HeaderProps) {
  const [clienteSearch, setClienteSearch] = useState("");
  const [clienteDropdownOpen, setClienteDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const clientesFiltrados = clienteSearch
    ? clientes.filter((c) => c.toLowerCase().includes(clienteSearch.toLowerCase()))
    : clientes;

  const hasActiveFilters = tecnicoFilter || clienteFilter || (tipoFilter && tipoFilter !== "TODOS");

  useEffect(() => {
    if (!clienteDropdownOpen) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setClienteDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [clienteDropdownOpen]);

  function clearAllFilters() {
    onSearchChange("");
    onTipoFilterChange("TODOS");
    onTecnicoFilterChange("");
    onClienteFilterChange("");
    setClienteSearch("");
  }

  return (
    <header style={{
      padding: "10px 24px", background: "var(--ppv-surface)",
      borderBottom: "1px solid var(--ppv-border-light)",
      flexShrink: 0, display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Busca */}
        <div style={{ position: "relative", width: 260 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ppv-accent)", fontSize: 13 }} />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar ID, Cliente, Técnico..."
            style={{
              width: "100%", padding: "8px 30px 8px 34px", border: "1.5px solid var(--ppv-border-light)",
              borderRadius: 10, background: "white", fontFamily: "'Poppins', sans-serif",
              fontSize: 13, outline: "none", transition: "border-color 0.15s",
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = "var(--ppv-primary)"}
            onBlur={(e) => e.currentTarget.style.borderColor = "var(--ppv-border-light)"}
          />
          {searchFilter && (
            <button onClick={() => onSearchChange("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", color: "var(--ppv-text-light)", fontSize: 11 }}>
              <i className="fas fa-times" />
            </button>
          )}
        </div>

        {/* Abas boxed: Pedido de Venda / Remessa */}
        <div style={{ display: "flex", gap: 4, background: "#f1f5f9", padding: 4, borderRadius: 10 }}>
          {TIPO_TABS.map((t) => {
            const active = (tipoFilter || "TODOS") === t.value;
            return (
              <button key={t.value} onClick={() => onTipoFilterChange(t.value)} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8,
                border: active ? "1.5px solid var(--ppv-primary, #B91C1C)" : "1.5px solid transparent",
                background: active ? "#fff" : "transparent",
                color: active ? "#111827" : "var(--ppv-text-light)",
                fontWeight: 700, fontSize: 12, cursor: "pointer",
                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                fontFamily: "'Poppins', sans-serif", transition: "all 0.15s",
              }}>
                <i className={`fas ${t.icon}`} style={{ fontSize: 11 }} /> {t.label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Filtro Técnico */}
        <div style={{ position: "relative" }}>
          <select value={tecnicoFilter} onChange={(e) => onTecnicoFilterChange(e.target.value)} style={{
            padding: "7px 28px 7px 30px", borderRadius: 10,
            border: tecnicoFilter ? "1.5px solid var(--ppv-primary)" : "1.5px solid var(--ppv-border-light)",
            background: tecnicoFilter ? "#FEF2F2" : "white",
            fontSize: 12, fontWeight: 600, cursor: "pointer",
            fontFamily: "'Poppins', sans-serif",
            color: tecnicoFilter ? "var(--ppv-primary)" : "var(--ppv-text-light)",
            appearance: "none", outline: "none", minWidth: 150,
          }}>
            <option value="">Técnico</option>
            {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <i className="fas fa-user-cog" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: tecnicoFilter ? "var(--ppv-primary)" : "var(--ppv-text-light)", pointerEvents: "none" }} />
          <i className="fas fa-chevron-down" style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 8, color: "var(--ppv-text-light)", pointerEvents: "none" }} />
        </div>

        {/* Filtro Cliente */}
        <div style={{ position: "relative" }} ref={dropdownRef}>
          <div style={{
            display: "flex", alignItems: "center",
            border: clienteFilter ? "1.5px solid var(--ppv-primary)" : "1.5px solid var(--ppv-border-light)",
            borderRadius: 10, background: clienteFilter ? "#FEF2F2" : "white", overflow: "hidden",
          }}>
            <i className="fas fa-user" style={{ paddingLeft: 10, fontSize: 11, color: clienteFilter ? "var(--ppv-primary)" : "var(--ppv-text-light)" }} />
            <input
              type="text"
              value={clienteFilter || clienteSearch}
              onChange={(e) => { if (clienteFilter) onClienteFilterChange(""); setClienteSearch(e.target.value); setClienteDropdownOpen(true); }}
              onFocus={() => setClienteDropdownOpen(true)}
              placeholder="Cliente..."
              style={{
                width: 140, border: "none", background: "transparent",
                padding: "7px 8px", fontSize: 12, fontWeight: 600,
                fontFamily: "'Poppins', sans-serif",
                color: clienteFilter ? "var(--ppv-primary)" : "var(--ppv-text)", outline: "none",
              }}
            />
            {(clienteFilter || clienteSearch) && (
              <button onClick={() => { onClienteFilterChange(""); setClienteSearch(""); setClienteDropdownOpen(false); }} style={{ paddingRight: 10, border: "none", background: "none", cursor: "pointer", color: "var(--ppv-text-light)", fontSize: 10 }}>
                <i className="fas fa-times" />
              </button>
            )}
          </div>
          {clienteDropdownOpen && clientesFiltrados.length > 0 && (
            <div style={{
              position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 50,
              maxHeight: 260, width: 300, overflowY: "auto",
              borderRadius: 10, border: "1px solid var(--ppv-border-light)",
              background: "white", boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
            }}>
              {clientesFiltrados.slice(0, 50).map((c) => (
                <button key={c} onClick={() => { onClienteFilterChange(c); setClienteSearch(""); setClienteDropdownOpen(false); }} style={{
                  display: "flex", alignItems: "center", width: "100%",
                  padding: "9px 14px", border: "none", background: "none",
                  textAlign: "left", fontSize: 12, fontWeight: 500,
                  color: "var(--ppv-text)", cursor: "pointer",
                  fontFamily: "'Poppins', sans-serif",
                  borderBottom: "1px solid var(--ppv-primary-light)", transition: "background 0.12s",
                }}
                  onMouseEnter={(e) => e.currentTarget.style.background = "var(--ppv-primary-light)"}
                  onMouseLeave={(e) => e.currentTarget.style.background = ""}
                >
                  <i className="fas fa-user" style={{ marginRight: 8, fontSize: 10, color: "var(--ppv-accent)" }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Limpar */}
        {hasActiveFilters && (
          <button onClick={clearAllFilters} style={{
            padding: "6px 12px", borderRadius: 20,
            border: "1.5px solid #FECACA", background: "#FEF2F2",
            fontSize: 11, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Poppins', sans-serif",
            color: "var(--ppv-primary)", display: "flex", alignItems: "center", gap: 5, transition: "all 0.15s",
          }}>
            <i className="fas fa-filter-circle-xmark" style={{ fontSize: 10 }} />
            Limpar
          </button>
        )}
      </div>
    </header>
  );
}
