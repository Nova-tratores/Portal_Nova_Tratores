"use client";

import { useState, useRef, useEffect } from "react";

interface HeaderProps {
  searchFilter: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  tecnicoFilter: string;
  onTecnicoFilterChange: (value: string) => void;
  tecnicos: string[];
  clienteFilter: string;
  onClienteFilterChange: (value: string) => void;
  clientes: string[];
}

const STATUS_PILLS = [
  { value: "ATIVOS", label: "Ativos", icon: "fa-circle-check", color: "#047857" },
  { value: "FECHADOS", label: "Fechados", icon: "fa-archive", color: "#64748B" },
  { value: "TODOS", label: "Todos", icon: "fa-layer-group", color: "#8B5CF6" },
];

export default function Header({
  searchFilter, onSearchChange,
  statusFilter, onStatusFilterChange,
  tecnicoFilter, onTecnicoFilterChange, tecnicos,
  clienteFilter, onClienteFilterChange, clientes,
}: HeaderProps) {
  const [clienteSearch, setClienteSearch] = useState("");
  const [clienteDropdownOpen, setClienteDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const clientesFiltrados = clienteSearch
    ? clientes.filter((c) => c.toLowerCase().includes(clienteSearch.toLowerCase()))
    : clientes;

  const hasActiveFilters = tecnicoFilter || clienteFilter || statusFilter !== "ATIVOS";

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
    onStatusFilterChange("ATIVOS");
    onTecnicoFilterChange("");
    onClienteFilterChange("");
    setClienteSearch("");
  }

  return (
    <header style={{
      display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
      padding: "12px 24px", background: "var(--ppv-surface)",
      borderBottom: "1px solid var(--ppv-border-light)",
    }}>
      {/* Busca geral */}
      <div style={{ position: "relative", width: 320 }}>
        <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--ppv-accent)", fontSize: 14 }} />
        <input
          type="text"
          value={searchFilter}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Pesquisar ID, Cliente, Técnico..."
          style={{
            width: "100%", padding: "10px 36px 10px 40px", border: "1.5px solid var(--ppv-border-light)",
            borderRadius: 10, background: "white", fontFamily: "'Poppins', sans-serif",
            fontSize: 14, outline: "none", transition: "border-color 0.15s",
          }}
          onFocus={(e) => e.currentTarget.style.borderColor = "var(--ppv-primary)"}
          onBlur={(e) => e.currentTarget.style.borderColor = "var(--ppv-border-light)"}
        />
        {searchFilter && (
          <button
            onClick={() => onSearchChange("")}
            style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              border: "none", background: "none", cursor: "pointer", color: "var(--ppv-text-light)", fontSize: 12,
            }}
          >
            <i className="fas fa-times" />
          </button>
        )}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 28, background: "var(--ppv-border-light)" }} />

      {/* Status pills */}
      <div style={{ display: "flex", gap: 4 }}>
        {STATUS_PILLS.map((s) => {
          const active = statusFilter === s.value;
          return (
            <button
              key={s.value}
              onClick={() => onStatusFilterChange(s.value)}
              style={{
                padding: "7px 14px", borderRadius: 20,
                border: active ? `1.5px solid ${s.color}` : "1.5px solid var(--ppv-border-light)",
                background: active ? s.color : "white",
                color: active ? "white" : "var(--ppv-text-light)",
                fontSize: 12, fontWeight: 700, cursor: "pointer",
                fontFamily: "'Poppins', sans-serif",
                display: "flex", alignItems: "center", gap: 6,
                transition: "all 0.15s",
              }}
            >
              <i className={`fas ${s.icon}`} style={{ fontSize: 11 }} />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 28, background: "var(--ppv-border-light)" }} />

      {/* Técnico filter */}
      <div style={{ position: "relative" }}>
        <select
          value={tecnicoFilter}
          onChange={(e) => onTecnicoFilterChange(e.target.value)}
          style={{
            padding: "8px 32px 8px 34px", borderRadius: 10,
            border: tecnicoFilter ? "1.5px solid var(--ppv-primary)" : "1.5px solid var(--ppv-border-light)",
            background: tecnicoFilter ? "#FEF2F2" : "white",
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            fontFamily: "'Poppins', sans-serif",
            color: tecnicoFilter ? "var(--ppv-primary)" : "var(--ppv-text-light)",
            appearance: "none", outline: "none",
            minWidth: 170,
          }}
        >
          <option value="">Todos Técnicos</option>
          {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <i className="fas fa-user-cog" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: tecnicoFilter ? "var(--ppv-primary)" : "var(--ppv-text-light)", pointerEvents: "none" }} />
        <i className="fas fa-chevron-down" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 9, color: "var(--ppv-text-light)", pointerEvents: "none" }} />
      </div>

      {/* Cliente filter */}
      <div style={{ position: "relative" }} ref={dropdownRef}>
        <div style={{
          display: "flex", alignItems: "center",
          border: clienteFilter ? "1.5px solid var(--ppv-primary)" : "1.5px solid var(--ppv-border-light)",
          borderRadius: 10, background: clienteFilter ? "#FEF2F2" : "white",
          overflow: "hidden",
        }}>
          <i className="fas fa-user" style={{ paddingLeft: 12, fontSize: 12, color: clienteFilter ? "var(--ppv-primary)" : "var(--ppv-text-light)" }} />
          <input
            type="text"
            value={clienteFilter || clienteSearch}
            onChange={(e) => {
              if (clienteFilter) onClienteFilterChange("");
              setClienteSearch(e.target.value);
              setClienteDropdownOpen(true);
            }}
            onFocus={() => setClienteDropdownOpen(true)}
            placeholder="Filtrar cliente..."
            style={{
              width: 160, border: "none", background: "transparent",
              padding: "8px 10px", fontSize: 13, fontWeight: 600,
              fontFamily: "'Poppins', sans-serif",
              color: clienteFilter ? "var(--ppv-primary)" : "var(--ppv-text)",
              outline: "none",
            }}
          />
          {(clienteFilter || clienteSearch) && (
            <button
              onClick={() => { onClienteFilterChange(""); setClienteSearch(""); setClienteDropdownOpen(false); }}
              style={{ paddingRight: 12, border: "none", background: "none", cursor: "pointer", color: "var(--ppv-text-light)", fontSize: 11 }}
            >
              <i className="fas fa-times" />
            </button>
          )}
        </div>
        {clienteDropdownOpen && clientesFiltrados.length > 0 && (
          <div style={{
            position: "absolute", left: 0, top: "calc(100% + 4px)", zIndex: 50,
            maxHeight: 280, width: 320, overflowY: "auto",
            borderRadius: 10, border: "1px solid var(--ppv-border-light)",
            background: "white", boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
          }}>
            {clientesFiltrados.slice(0, 50).map((c) => (
              <button
                key={c}
                onClick={() => { onClienteFilterChange(c); setClienteSearch(""); setClienteDropdownOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", width: "100%",
                  padding: "10px 16px", border: "none", background: "none",
                  textAlign: "left", fontSize: 13, fontWeight: 500,
                  color: "var(--ppv-text)", cursor: "pointer",
                  fontFamily: "'Poppins', sans-serif",
                  borderBottom: "1px solid var(--ppv-primary-light)",
                  transition: "background 0.12s",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--ppv-primary-light)"}
                onMouseLeave={(e) => e.currentTarget.style.background = ""}
              >
                <i className="fas fa-user" style={{ marginRight: 10, fontSize: 11, color: "var(--ppv-accent)" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Limpar filtros */}
      {hasActiveFilters && (
        <button
          onClick={clearAllFilters}
          style={{
            padding: "7px 14px", borderRadius: 20,
            border: "1.5px solid #FECACA", background: "#FEF2F2",
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: "'Poppins', sans-serif",
            color: "var(--ppv-primary)", display: "flex", alignItems: "center", gap: 6,
            transition: "all 0.15s",
          }}
        >
          <i className="fas fa-filter-circle-xmark" style={{ fontSize: 11 }} />
          Limpar
        </button>
      )}
    </header>
  );
}
