"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { buscarProjetosOmie } from "@/lib/feedbacks/api";
import type { ProjetoOmie } from "@/lib/feedbacks/types";

interface Props {
  valor: string;
  onChange: (v: string) => void;
  onSelecionar: (p: ProjetoOmie) => void;
}

export default function ProjetoAutocomplete({ valor, onChange, onSelecionar }: Props) {
  const [resultados, setResultados] = useState<ProjetoOmie[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Só busca/abre quando o usuário digita (não reabre com o campo pré-preenchido).
  const usuarioDigitou = useRef(false);

  const buscar = useCallback(async (q: string) => {
    if (!q || q.trim().length < 2) { setResultados([]); return; }
    setBuscando(true);
    try {
      const data = await buscarProjetosOmie(q);
      setResultados(data);
      setAberto(true);
    } catch {
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    if (!usuarioDigitou.current) return; // pré-preenchido — não abre sozinho
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void buscar(valor), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [valor, buscar]);

  useEffect(() => {
    function clickFora(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", clickFora);
    return () => document.removeEventListener("mousedown", clickFora);
  }, []);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={valor}
        onChange={(e) => { usuarioDigitou.current = true; onChange(e.target.value); }}
        onFocus={() => resultados.length > 0 && setAberto(true)}
        placeholder="Digite modelo ou chassi para buscar no Omie..."
        style={inputStyle}
      />
      {aberto && (resultados.length > 0 || buscando) && (
        <div style={dropdownStyle}>
          {buscando && (
            <div style={{ padding: 12, color: "var(--portal-text-muted)", fontSize: 12 }}>Buscando…</div>
          )}
          {!buscando && resultados.map((p) => (
            <button
              key={p.id_omie}
              type="button"
              onClick={() => { usuarioDigitou.current = false; onSelecionar(p); setAberto(false); }}
              style={itemStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#fef2f2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--portal-text)" }}>
                  {p.Nome_Projeto}
                </div>
                {p.fonte === "portal" && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#fef3c7", color: "#92400e", textTransform: "uppercase", letterSpacing: 0.3, whiteSpace: "nowrap" }}>
                    Portal
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: "var(--portal-text-secondary)", marginTop: 2 }}>
                {p.fonte === "portal"
                  ? (p.Nome_Cliente ? `Cliente: ${p.Nome_Cliente}` : "Trator interno")
                  : `Omie #${p.id_omie}`}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 14px",
  border: "1.5px solid var(--portal-border)", borderRadius: 10,
  fontSize: 13, background: "var(--portal-bg-card)", color: "var(--portal-text)",
  fontFamily: "Inter, sans-serif", outline: "none",
};
const dropdownStyle: React.CSSProperties = {
  position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
  background: "#fff", border: "1px solid var(--portal-border)", borderRadius: 10,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)", zIndex: 1000, maxHeight: 280, overflowY: "auto",
};
const itemStyle: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", padding: "10px 14px",
  background: "transparent", border: "none", borderBottom: "1px solid #f5f5f5",
  cursor: "pointer", fontFamily: "Inter, sans-serif",
};
