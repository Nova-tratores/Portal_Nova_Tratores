"use client";
// Ícone de TRATOR discreto ao lado do cliente (drawers do POS e do PPV):
// hover ou clique mostra as máquinas do CPF/CNPJ (modelo + chassis) — os
// mesmos projetos da Pasta Clientes (faturados pro documento).
import { useEffect, useRef, useState } from "react";

interface Maquina { modelo: string; chassis: string; empresa: string; ultima_revisao?: { horas: string } | null }

const cache = new Map<string, Maquina[]>();

export default function MaquinasClienteIcone({ doc }: { doc?: string | null }) {
  const documento = String(doc || "").trim();
  const [aberto, setAberto] = useState(false);
  const [maquinas, setMaquinas] = useState<Maquina[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const carregar = async () => {
    if (!documento || maquinas) return;
    if (cache.has(documento)) { setMaquinas(cache.get(documento)!); return; }
    setCarregando(true);
    try {
      const r = await fetch(`/api/clientes/maquinas?doc=${encodeURIComponent(documento)}`);
      const j = await r.json();
      const lista: Maquina[] = Array.isArray(j.maquinas) ? j.maquinas : [];
      cache.set(documento, lista);
      setMaquinas(lista);
    } catch { setMaquinas([]); }
    setCarregando(false);
  };

  // troca de cliente → zera
  useEffect(() => { setMaquinas(null); setAberto(false); }, [documento]);

  useEffect(() => {
    if (!aberto) return;
    const fn = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setAberto(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [aberto]);

  if (!documento) return null;

  return (
    <div
      ref={boxRef}
      style={{ position: "relative", display: "inline-flex", alignSelf: "center" }}
      onMouseEnter={() => { carregar(); if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setAberto(true), 250); }}
      onMouseLeave={() => { if (hoverTimer.current) clearTimeout(hoverTimer.current); setAberto(false); }}
    >
      <button
        type="button"
        title="Máquinas deste cliente (modelo + chassis)"
        onClick={(e) => { e.stopPropagation(); carregar(); setAberto((o) => !o); }}
        style={{ width: 34, height: 34, borderRadius: 3, border: "1px solid var(--border, #E2E8F0)", background: "transparent", color: "#64748b", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
      >
        <i className="fas fa-tractor" />
      </button>
      {aberto && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 90, width: 320, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 6, boxShadow: "0 14px 34px rgba(0,0,0,0.18)", padding: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#94a3b8", marginBottom: 7 }}>
            <i className="fas fa-tractor" style={{ marginRight: 5 }} />Máquinas do cliente{maquinas ? ` (${maquinas.length})` : ""}
          </div>
          {carregando || maquinas === null ? (
            <div style={{ fontSize: 12.5, color: "#94a3b8", padding: "6px 0" }}><i className="fas fa-spinner fa-spin" style={{ marginRight: 5 }} />buscando…</div>
          ) : maquinas.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "#94a3b8", padding: "4px 0" }}>Nenhuma máquina faturada pra este documento.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 260, overflowY: "auto" }}>
              {maquinas.map((m, i) => (
                <div key={`${m.chassis || m.modelo}-${i}`} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 7px", borderRadius: 5, background: "#f8fafc", border: "1px solid #eef2f7" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", whiteSpace: "nowrap" }}>{m.modelo || "Máquina"}</span>
                  <span style={{ fontSize: 11.5, fontFamily: "monospace", color: "#64748b", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{m.chassis || "sem chassis"}</span>
                  {m.ultima_revisao?.horas && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#0891B2", whiteSpace: "nowrap" }}>rev. {m.ultima_revisao.horas}h</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
