"use client";

import type { ReactNode } from "react";

interface HeaderProps {
  searchFilter: string;
  onSearchChange: (value: string) => void;
  tipoFilter: string;
  onTipoFilterChange: (value: string) => void;
  // Mantidos por compatibilidade (a busca já filtra por técnico/cliente); não têm mais UI própria.
  tecnicoFilter?: string;
  onTecnicoFilterChange?: (value: string) => void;
  tecnicos?: string[];
  clienteFilter?: string;
  onClienteFilterChange?: (value: string) => void;
  clientes?: string[];
  /** Ações à direita (Novo Lançamento + menu de produtos/kits/sync). */
  actions?: ReactNode;
  /** Abre o filtro "onde este produto foi usado" (lista os PPVs). */
  onFiltrarProduto?: () => void;
}

const TIPO_TABS = [
  { value: "TODOS", label: "Todos", icon: "fa-layer-group" },
  { value: "PEDIDO", label: "Pedido de Venda", icon: "fa-file-invoice-dollar" },
  { value: "REMESSA", label: "Remessa", icon: "fa-dolly" },
];

export default function Header({
  searchFilter, onSearchChange,
  tipoFilter, onTipoFilterChange,
  actions, onFiltrarProduto,
}: HeaderProps) {
  return (
    <header style={{
      padding: "10px 24px", background: "var(--ppv-surface)",
      borderBottom: "1px solid var(--ppv-border-light)",
      flexShrink: 0, display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Busca */}
        <div style={{ position: "relative", width: 300 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--ppv-accent)", fontSize: 15 }} />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar ID, Cliente, Técnico..."
            style={{
              width: "100%", padding: "10px 32px 10px 38px", border: "1.5px solid var(--ppv-border-light)",
              borderRadius: 10, background: "white", fontFamily: "'Poppins', sans-serif",
              fontSize: 15, outline: "none", transition: "border-color 0.15s",
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
                display: "flex", alignItems: "center", gap: 7, padding: "9px 18px", borderRadius: 8,
                border: active ? "1.5px solid var(--ppv-primary, #B91C1C)" : "1.5px solid transparent",
                background: active ? "#fff" : "transparent",
                color: active ? "#111827" : "var(--ppv-text-light)",
                fontWeight: 600, fontSize: 14, cursor: "pointer",
                boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
                fontFamily: "'Poppins', sans-serif", transition: "all 0.15s",
              }}>
                <i className={`fas ${t.icon}`} style={{ fontSize: 13 }} /> {t.label}
              </button>
            );
          })}
        </div>

        {/* Filtrar por produto: mostra em quais PPVs um produto foi/está sendo usado */}
        {onFiltrarProduto && (
          <button onClick={onFiltrarProduto} title="Histórico de um produto: em quais PPVs ele foi usado"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 10, border: "1.5px solid var(--ppv-border-light)", background: "#fff", color: "var(--ppv-text)", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Poppins', sans-serif", whiteSpace: "nowrap" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--ppv-primary)"; e.currentTarget.style.color = "var(--ppv-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--ppv-border-light)"; e.currentTarget.style.color = "var(--ppv-text)"; }}>
            <i className="fas fa-magnifying-glass-chart" /> Histórico Produto
          </button>
        )}

        <div style={{ flex: 1 }} />

        {/* Ações (Novo Lançamento + menu) */}
        {actions}
      </div>
    </header>
  );
}
