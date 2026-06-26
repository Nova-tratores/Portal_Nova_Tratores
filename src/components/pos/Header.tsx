"use client";

import { useState, useRef, useEffect } from "react";

interface HeaderProps {
  searchTerm: string;
  onSearch: (term: string) => void;
  onNewOS: () => void;
  onGenerateReport: (filtros: { tecnico: string; tipo: string }) => void;
  onLembretes?: () => void;
  tecnicos?: string[];
  valorHora: number;
  valorKm: number;
  onConfigSaved?: (valorHora: number, valorKm: number) => void;
  podeCriar?: boolean;
}

export default function Header({ searchTerm, onSearch, onNewOS, onGenerateReport, onLembretes, tecnicos = [], valorHora, valorKm, onConfigSaved, podeCriar = true }: HeaderProps) {
  const [showFiltroRelatorio, setShowFiltroRelatorio] = useState(false);
  const [filtroTecnico, setFiltroTecnico] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todas");
  const [showConfig, setShowConfig] = useState(false);
  const [cfgHora, setCfgHora] = useState(valorHora);
  const [cfgKm, setCfgKm] = useState(valorKm);
  const [salvando, setSalvando] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const handleGerar = () => {
    setShowFiltroRelatorio(false);
    onGenerateReport({ tecnico: filtroTecnico, tipo: filtroTipo });
  };

  const handleOpenConfig = () => {
    setCfgHora(valorHora);
    setCfgKm(valorKm);
    setShowConfig(true);
  };

  const handleSalvarConfig = async () => {
    setSalvando(true);
    try {
      const res = await fetch("/api/pos/configuracoes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor_hora: cfgHora, valor_km: cfgKm }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.erro || "Erro ao salvar");
        return;
      }
      onConfigSaved?.(cfgHora, cfgKm);
      setShowConfig(false);
    } catch {
      alert("Erro ao salvar configurações");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <header>
        <div className="brand-area">
          <div className="brand-icon"><i className="fas fa-tractor" /></div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>NOVA TRATORES</div>
        </div>
        <div className="search-box" style={{ position: "relative" }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 15, top: "50%", transform: "translateY(-50%)", color: "#7A6E5D" }} />
          <input type="text" className="search-input" placeholder="Pesquisar cliente ou OS..." value={searchTerm} onChange={(e) => onSearch(e.target.value)} />
        </div>
        <div className="header-actions">
          {podeCriar && <button className="btn-top btn-new" onClick={onNewOS}><i className="fas fa-plus" /> NOVA ORDEM</button>}

          <div style={{ position: "relative" }} ref={menuRef}>
            <button className="btn-top btn-report" onClick={() => setMenuOpen((o) => !o)}>
              <i className="fas fa-bars" /> MENU
              <i className="fas fa-chevron-down" style={{ fontSize: 10, marginLeft: 6, transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>

            {menuOpen && (() => {
              const item = (icon: string, label: string, onClick: () => void) => (
                <button
                  onClick={() => { onClick(); setMenuOpen(false); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 11, padding: "10px 14px", width: "100%",
                    border: "none", borderRadius: 8, cursor: "pointer", background: "transparent",
                    color: "#3A3027", fontSize: 13.5, fontWeight: 600, textAlign: "left", transition: "background 0.12s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F3EDE3")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <i className={`fas ${icon}`} style={{ width: 16, textAlign: "center", color: "#9A6A3A" }} />
                  {label}
                </button>
              );
              return (
                <div style={{
                  position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 1000,
                  minWidth: 230, background: "#fff", borderRadius: 12,
                  border: "1px solid #E4D9C8", boxShadow: "0 12px 32px rgba(0,0,0,0.16)",
                  padding: 6, display: "flex", flexDirection: "column", gap: 2,
                }}>
                  {item("fa-bell", "Lembretes", () => onLembretes?.())}
                  {item("fa-file-invoice", "Gerar Relatório", () => setShowFiltroRelatorio(true))}
                  <div style={{ height: 1, background: "#EFE7DA", margin: "4px 8px" }} />
                  {item("fa-cog", "Configurações", handleOpenConfig)}
                </div>
              );
            })()}
          </div>
        </div>
      </header>

      {showFiltroRelatorio && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowFiltroRelatorio(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--portal-bg-card)", borderRadius: 16, padding: 32, width: 420, maxWidth: "90vw",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              color: "var(--portal-text)",
            }}
          >
            <h3 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 700, color: "var(--portal-text)" }}>
              <i className="fas fa-filter" style={{ marginRight: 8, color: "#6366F1" }} />
              Filtros do Relatório
            </h3>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase", marginBottom: 8 }}>
                Técnico
              </label>
              <select
                value={filtroTecnico}
                onChange={(e) => setFiltroTecnico(e.target.value)}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E2E8F0",
                  fontSize: 14, color: "#1E293B", background: "#F8FAFC", cursor: "pointer",
                }}
              >
                <option value="todos">Todos os técnicos</option>
                {tecnicos.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase", marginBottom: 8 }}>
                Tipo de ordens
              </label>
              <div style={{ display: "flex", gap: 10 }}>
                <button
                  onClick={() => setFiltroTipo("todas")}
                  style={{
                    flex: 1, padding: "12px 16px", borderRadius: 10, border: "2px solid",
                    borderColor: filtroTipo === "todas" ? "#6366F1" : "#E2E8F0",
                    background: filtroTipo === "todas" ? "#EEF2FF" : "#fff",
                    color: filtroTipo === "todas" ? "#4F46E5" : "#64748B",
                    fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <i className="fas fa-list" style={{ marginRight: 6 }} />
                  Todas
                </button>
                <button
                  onClick={() => setFiltroTipo("atrasadas")}
                  style={{
                    flex: 1, padding: "12px 16px", borderRadius: 10, border: "2px solid",
                    borderColor: filtroTipo === "atrasadas" ? "#EF4444" : "#E2E8F0",
                    background: filtroTipo === "atrasadas" ? "#FEF2F2" : "#fff",
                    color: filtroTipo === "atrasadas" ? "#DC2626" : "#64748B",
                    fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.15s",
                  }}
                >
                  <i className="fas fa-clock" style={{ marginRight: 6 }} />
                  Atrasadas
                </button>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowFiltroRelatorio(false)}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #E2E8F0",
                  background: "#fff", color: "#64748B", fontWeight: 600, fontSize: 14, cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleGerar}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10, border: "none",
                  background: "#1E293B", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
                }}
              >
                <i className="fas fa-file-invoice" style={{ marginRight: 6 }} />
                Gerar
              </button>
            </div>
          </div>
        </div>
      )}
      {showConfig && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowConfig(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--portal-bg-card)", borderRadius: 16, padding: 32, width: 420, maxWidth: "90vw",
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
              color: "var(--portal-text)",
            }}
          >
            <h3 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 700, color: "var(--portal-text)" }}>
              <i className="fas fa-cog" style={{ marginRight: 8, color: "#6366F1" }} />
              Configurações de Valores
            </h3>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase", marginBottom: 8 }}>
                Valor da Hora (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cfgHora}
                onChange={(e) => setCfgHora(parseFloat(e.target.value) || 0)}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E2E8F0",
                  fontSize: 14, color: "#1E293B", background: "#F8FAFC", boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#64748B", textTransform: "uppercase", marginBottom: 8 }}>
                Valor do KM (R$)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={cfgKm}
                onChange={(e) => setCfgKm(parseFloat(e.target.value) || 0)}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #E2E8F0",
                  fontSize: 14, color: "#1E293B", background: "#F8FAFC", boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setShowConfig(false)}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10, border: "1px solid #E2E8F0",
                  background: "#fff", color: "#64748B", fontWeight: 600, fontSize: 14, cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarConfig}
                disabled={salvando}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10, border: "none",
                  background: "#1E293B", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
                  opacity: salvando ? 0.6 : 1,
                }}
              >
                <i className="fas fa-save" style={{ marginRight: 6 }} />
                {salvando ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
