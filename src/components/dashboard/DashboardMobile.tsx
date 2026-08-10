"use client";
// Versão MOBILE do Dashboard — lançador de apps "Claro & respirado":
// cabeçalho grafite com saudação + avatar + busca, favoritos em atalhos redondos
// (rolagem horizontal) e apps em cartões suaves por categoria. O desktop não usa isto.
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
  userNome?: string;
}

const GRUPOS: { key: string; label: string; cor: string }[] = [
  { key: "servicos", label: "Serviços", cor: "#0EA5E9" },
  { key: "pecas", label: "Peças", cor: "#F97316" },
  { key: "financeiro", label: "Financeiro", cor: "#10B981" },
  { key: "comercial", label: "Comercial", cor: "#8B5CF6" },
  { key: "estoque", label: "Estoque", cor: "#DC2626" },
  { key: "frota", label: "Frota", cor: "#0D9488" },
  { key: "outros", label: "Outros", cor: "#6B7280" },
];

const IcoSearch = ({ c = "#94a3b8" }: { c?: string }) => (
  <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke={c} strokeWidth={2} strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
);
const IcoStar = ({ fill }: { fill: boolean }) => (
  <svg viewBox="0 0 24 24" width={14} height={14} fill={fill ? "#f59e0b" : "none"} stroke={fill ? "#f59e0b" : "#cbd5e1"} strokeWidth={2} strokeLinejoin="round"><path d="M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 17l-5.5 2.5 1-6.3L3 8.9 9 8z" /></svg>
);

export default function DashboardMobile({ systems, favoritos, onToggleFav, onOpen, searchTerm, onSearch, userNome }: Props) {
  const q = searchTerm.trim().toLowerCase();
  const buscando = q.length > 0;

  const filtrados = useMemo(
    () => systems.filter((s) => !q || s.name.toLowerCase().includes(q) || s.tag.toLowerCase().includes(q)),
    [systems, q]
  );
  const favs = useMemo(() => systems.filter((s) => favoritos.includes(s.id)), [systems, favoritos]);

  const saudacao = (() => { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; })();
  const iniciais = (userNome || "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "NT";

  const Card = ({ s }: { s: AppCard }) => {
    const fav = favoritos.includes(s.id);
    return (
      <div style={{ position: "relative" }}>
        <button onClick={() => onOpen(s)} style={{
          width: "100%", display: "flex", flexDirection: "column", gap: 9,
          padding: 14, borderRadius: 18, border: "1px solid #eceef2", background: "#fff", cursor: "pointer", textAlign: "left",
          boxShadow: "0 1px 2px rgba(16,24,40,0.04)",
        }}>
          <span style={{ width: 44, height: 44, borderRadius: 13, background: s.gradient, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {s.icon}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", lineHeight: 1.2 }}>{s.name}</span>
          <span style={{ fontSize: 9.5, fontWeight: 800, color: s.color, textTransform: "uppercase", letterSpacing: 0.6 }}>{s.tag}</span>
        </button>
        <button onClick={(e) => { e.stopPropagation(); onToggleFav(s.id); }} title={fav ? "Desfavoritar" : "Favoritar"}
          style={{ position: "absolute", top: 10, right: 10, width: 30, height: 30, borderRadius: 9, border: "none", background: fav ? "#fff7ed" : "#f8fafc", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <IcoStar fill={fav} />
        </button>
      </div>
    );
  };

  return (
    <div style={{ minHeight: "calc(100vh - 64px)", background: "#f4f6f9" }}>
      {/* Cabeçalho grafite */}
      <div style={{ background: "linear-gradient(150deg,#1b2230,#2c3648)", color: "#fff", padding: "20px 18px 22px", borderRadius: "0 0 26px 26px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 42, height: 42, borderRadius: 14, background: "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15 }}>{iniciais}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{saudacao},</div>
            <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{userNome || "Portal Nova Tratores"}</div>
          </div>
        </div>
        <div style={{ position: "relative", marginTop: 16 }}>
          <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", display: "flex" }}><IcoSearch /></span>
          <input value={searchTerm} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar sistema…"
            style={{ width: "100%", padding: "12px 40px 12px 38px", borderRadius: 14, border: "none", background: "#fff", fontSize: 16, outline: "none", boxSizing: "border-box", color: "#0f172a" }} />
          {searchTerm && (
            <button onClick={() => onSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
          )}
        </div>
      </div>

      <div style={{ padding: "18px 16px 40px" }}>
        {buscando ? (
          filtrados.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>Nenhum sistema para &quot;{searchTerm}&quot;.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
              {filtrados.map((s) => <Card key={s.id} s={s} />)}
            </div>
          )
        ) : (
          <>
            {favs.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "0 2px 11px", color: "#64748b", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  <IcoStar fill /> Favoritos
                </div>
                <div style={{ display: "flex", gap: 10, overflowX: "auto", padding: "0 2px 6px" }}>
                  {favs.map((s) => (
                    <button key={s.id} onClick={() => onOpen(s)} style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 72, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                      <span style={{ width: 56, height: 56, borderRadius: 18, background: s.gradient, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 6px 14px ${s.color}44` }}>{s.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#334155", textAlign: "center", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 72 }}>{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {GRUPOS.map(({ key, label, cor }) => {
              const doGrupo = systems.filter((s) => s.group === key);
              if (doGrupo.length === 0) return null;
              return (
                <div key={key} style={{ marginBottom: 22 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 2px 11px" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 2, background: cor }} />
                    <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: "#475569" }}>{label}</span>
                    <span style={{ fontSize: 11, color: "#94a3b8" }}>{doGrupo.length}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 11 }}>
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
