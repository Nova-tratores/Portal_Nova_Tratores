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

export default function Header({
  searchFilter, onSearchChange,
  actions, onFiltrarProduto,
}: HeaderProps) {
  return (
    <header style={{
      padding: "10px 24px", background: "var(--ppv-surface)",
      borderBottom: "1px solid var(--ppv-border-light)",
      flexShrink: 0, display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        {/* Busca — ocupa a largura toda */}
        <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--ppv-accent)", fontSize: 15 }} />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar ID, Cliente, Técnico, nº do pedido no Omie..."
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

        {/* Filtrar por produto: mostra em quais PPVs um produto foi/está sendo usado */}
        {onFiltrarProduto && (
          <button onClick={onFiltrarProduto} title="Lista de peças em estoque; clique num produto pra ver o histórico dele"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", borderRadius: 10, border: "1.5px solid var(--ppv-border-light)", background: "#fff", color: "var(--ppv-text)", fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "'Poppins', sans-serif", whiteSpace: "nowrap" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--ppv-primary)"; e.currentTarget.style.color = "var(--ppv-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--ppv-border-light)"; e.currentTarget.style.color = "var(--ppv-text)"; }}>
            <i className="fas fa-boxes-stacked" /> Produtos - Peças em estoque
          </button>
        )}

        {/* Ações (Novo Lançamento + menu) */}
        {actions}
      </div>
    </header>
  );
}
