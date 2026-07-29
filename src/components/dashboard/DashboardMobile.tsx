"use client";
// Versão MOBILE do Dashboard (Opção A): um "lançador de apps" — busca + favoritos
// + os apps em grade de 2 colunas com toque grande. O desktop não usa isto.
import { useMemo } from "react";

export interface AppCard {
  id: string; name: string; icon: React.ReactNode; color: string; gradient: string; tag: string; group: string;
}

interface Props {
  systems: AppCard[];       // já filtrados por permissão
  favoritos: string[];
  onToggleFav: (id: string) => void;
  onOpen: (s: AppCard) => void;
  searchTerm: string;
  onSearch: (v: string) => void;
}

const GRUPOS: { key: string; label: string }[] = [
  { key: "servicos", label: "Serviços" },
  { key: "pecas", label: "Peças" },
  { key: "financeiro", label: "Financeiro" },
  { key: "comercial", label: "Comercial" },
  { key: "estoque", label: "Estoque" },
  { key: "frota", label: "Frota" },
  { key: "outros", label: "Outros" },
];

export default function DashboardMobile({ systems, favoritos, onToggleFav, onOpen, searchTerm, onSearch }: Props) {
  const q = searchTerm.trim().toLowerCase();
  const buscando = q.length > 0;

  const filtrados = useMemo(
    () => systems.filter((s) => !q || s.name.toLowerCase().includes(q) || s.tag.toLowerCase().includes(q)),
    [systems, q]
  );
  const favs = useMemo(() => systems.filter((s) => favoritos.includes(s.id)), [systems, favoritos]);

  const Card = ({ s }: { s: AppCard }) => {
    const fav = favoritos.includes(s.id);
    return (
      <div style={{ position: "relative" }}>
        <button onClick={() => onOpen(s)} style={{
          width: "100%", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10,
          padding: 14, borderRadius: 16, border: "1px solid #e7ebf0", background: "#fff", cursor: "pointer", textAlign: "left",
          boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
        }}>
          <span style={{ width: 46, height: 46, borderRadius: 13, background: s.gradient, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {s.icon}
          </span>
          <span style={{ fontSize: 14.5, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>{s.name}</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: s.color, textTransform: "uppercase", letterSpacing: 0.6 }}>{s.tag}</span>
        </button>
        {/* Estrela de favorito */}
        <button onClick={(e) => { e.stopPropagation(); onToggleFav(s.id); }} title={fav ? "Desfavoritar" : "Favoritar"}
          style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 9, border: "none", background: fav ? "#fff7ed" : "#f8fafc", color: fav ? "#f59e0b" : "#cbd5e1", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className={fav ? "fas fa-star" : "far fa-star"} />
        </button>
      </div>
    );
  };

  return (
    <div style={{ minHeight: "calc(100vh - 64px)", background: "#f1f5f9" }}>
      {/* Topo: título + busca */}
      <div style={{ position: "sticky", top: 0, zIndex: 5, background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "14px 14px 12px" }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", marginBottom: 10 }}>Portal Nova Tratores</div>
        <div style={{ position: "relative" }}>
          <i className="fas fa-search" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 15 }} />
          <input value={searchTerm} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar sistema…"
            style={{ width: "100%", padding: "12px 14px 12px 40px", borderRadius: 12, border: "1.5px solid #e2e8f0", fontSize: 16, outline: "none", boxSizing: "border-box", background: "#f8fafc" }} />
          {searchTerm && <button onClick={() => onSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 16 }}><i className="fas fa-times" /></button>}
        </div>
      </div>

      <div style={{ padding: "14px 14px 40px" }}>
        {buscando ? (
          filtrados.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Nenhum sistema para "{searchTerm}".</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {filtrados.map((s) => <Card key={s.id} s={s} />)}
            </div>
          )
        ) : (
          <>
            {favs.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10, color: "#64748b", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>
                  <i className="fas fa-star" style={{ color: "#f59e0b" }} /> Favoritos
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {favs.map((s) => <Card key={s.id} s={s} />)}
                </div>
              </div>
            )}
            {GRUPOS.map(({ key, label }) => {
              const doGrupo = systems.filter((s) => s.group === key);
              if (doGrupo.length === 0) return null;
              return (
                <div key={key} style={{ marginBottom: 22 }}>
                  <div style={{ marginBottom: 10, color: "#64748b", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {doGrupo.map((s) => <Card key={s.id} s={s} />)}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
