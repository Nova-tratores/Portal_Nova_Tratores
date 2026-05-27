"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { buscarClientesOmie } from "@/lib/feedbacks/api";
import type { ClienteOmie } from "@/lib/feedbacks/types";

interface Props {
  valor: string;
  onChange: (v: string) => void;
  onSelecionar: (c: ClienteOmie) => void;
  placeholder?: string;
}

export default function ClienteAutocomplete({ valor, onChange, onSelecionar, placeholder }: Props) {
  const [resultados, setResultados] = useState<ClienteOmie[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buscar = useCallback(async (q: string) => {
    if (!q || q.trim().length < 2) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    try {
      const data = await buscarClientesOmie(q);
      setResultados(data);
      setAberto(true);
    } catch {
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void buscar(valor), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [valor, buscar]);

  useEffect(() => {
    function clickFora(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", clickFora);
    return () => document.removeEventListener("mousedown", clickFora);
  }, []);

  return (
    <div ref={wrapperRef} style={{ position: "relative" }}>
      <input
        type="text"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => resultados.length > 0 && setAberto(true)}
        placeholder={placeholder ?? "Digite nome, razão social ou CNPJ para buscar no Omie..."}
        style={inputStyle}
      />
      {aberto && (resultados.length > 0 || buscando) && (
        <div style={dropdownStyle}>
          {buscando && (
            <div style={{ padding: 12, color: "var(--portal-text-muted)", fontSize: 12 }}>
              Buscando…
            </div>
          )}
          {!buscando && resultados.map((c) => (
            <button
              key={c.id_omie}
              type="button"
              onClick={() => {
                onSelecionar(c);
                setAberto(false);
              }}
              style={itemStyle}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#fef2f2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--portal-text)" }}>
                {c.razao_social || c.nome_fantasia || "(sem nome)"}
              </div>
              <div style={{ fontSize: 11, color: "var(--portal-text-secondary)", marginTop: 2 }}>
                {c.cnpj_cpf || "—"} · Omie #{c.id_omie}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 14px",
  border: "1.5px solid var(--portal-border)",
  borderRadius: 10,
  fontSize: 13,
  background: "var(--portal-bg-card)",
  color: "var(--portal-text)",
  fontFamily: "Inter, sans-serif",
  outline: "none",
};

const dropdownStyle: React.CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  right: 0,
  background: "#fff",
  border: "1px solid var(--portal-border)",
  borderRadius: 10,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
  zIndex: 1000,
  maxHeight: 280,
  overflowY: "auto",
};

const itemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "10px 14px",
  background: "transparent",
  border: "none",
  borderBottom: "1px solid #f5f5f5",
  cursor: "pointer",
  fontFamily: "Inter, sans-serif",
};
