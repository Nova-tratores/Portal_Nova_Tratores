"use client";
// Colar um link do Google Maps (ou a coordenada) e virar ponto no mapa — usado no faturar do POS e na Pasta Clientes
// (José, 29/10/2026: "tem que conseguir colocar um link do Maps"). Link comum resolve aqui mesmo; o curto
// (maps.app.goo.gl) vai ao servidor, que segue o redirecionamento.
import { useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { coordenadaDoTexto, type Coordenada } from "@/lib/clientes/link-maps";

export default function CampoLinkMaps({ onCoordenada, compacto }: { onCoordenada: (c: Coordenada) => void; compacto?: boolean }) {
  const [texto, setTexto] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");

  const usar = async (valor = texto) => {
    const v = valor.trim();
    if (!v) return;
    setErro("");
    const c = coordenadaDoTexto(v);
    if (c) { onCoordenada(c); setTexto(""); return; }
    setBuscando(true);
    try {
      const r = await fetch("/api/clientes/localizacoes", { method: "POST", headers: { ...(await authHeaders()), "Content-Type": "application/json" }, body: JSON.stringify({ acao: "link", url: v }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErro(j.error || `Erro ${r.status}`);
      else { onCoordenada({ lat: j.lat, lng: j.lng }); setTexto(""); }
    } catch { setErro("Sem conexão — tente de novo."); }
    setBuscando(false);
  };

  return (
    <div className="clm">
      <style>{ESTILO}</style>
      <div className={`clm-linha ${compacto ? "comp" : ""}`}>
        <span className="clm-ic"><i className="fas fa-link" /></span>
        <input value={texto} placeholder="Colar link do Google Maps ou coordenada" onChange={(e) => setTexto(e.target.value)}
          onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t) { e.preventDefault(); setTexto(t); void usar(t); } }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void usar(); } }} />
        <button type="button" onClick={() => void usar()} disabled={buscando || !texto.trim()}>
          {buscando ? <i className="fas fa-circle-notch fa-spin" /> : "usar"}
        </button>
      </div>
      {erro && <div className="clm-erro"><i className="fas fa-circle-exclamation" /> {erro}</div>}
    </div>
  );
}

const ESTILO = `
.clm { display: grid; gap: 4px }
.clm-linha { display: flex; align-items: center; gap: 6px; border: 1px solid var(--border, #e2e8f0); border-radius: 10px; background: var(--surface, #fefefe); padding: 3px 4px 3px 10px }
.clm-linha:focus-within { border-color: #93c5fd; box-shadow: 0 0 0 3px color-mix(in srgb, #2563eb 12%, transparent) }
.clm-ic { color: #64748b; font-size: 12px }
.clm-linha input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit; font-size: 13px; color: inherit; padding: 6px 0 }
.clm-linha button { border: 0; border-radius: 8px; background: #2563eb; color: #fefefe; font: inherit; font-size: 12.5px; padding: 6px 12px; cursor: pointer }
.clm-linha button:disabled { background: #cbd5e1; cursor: default }
.clm-linha.comp input { padding: 4px 0 }
.clm-erro { font-size: 12px; color: #b91c1c; line-height: 1.4 }
`;
