"use client";
// Nome da fase no cabeçalho do POS e do PPV + lápis para o pós-vendas renomear (vale nos dois quadros).
import { useState } from "react";
import { ehFase, rotuloDaFase } from "@/lib/fases/fases";
import { renomearFase, useRotulosFases } from "@/hooks/useRotulosFases";

export default function RotuloFase({ fase, className }: { fase: string; className?: string }) {
  const { rotulos, podeEditar } = useRotulosFases();
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const nome = rotuloDaFase(fase, rotulos);

  const abrir = (e: React.MouseEvent) => { e.stopPropagation(); setTexto(nome); setEditando(true); };
  const salvar = async () => {
    if (salvando) return;
    if (texto.trim() === nome) { setEditando(false); return; }
    setSalvando(true);
    const erro = await renomearFase(fase, texto);
    setSalvando(false);
    if (erro) { alert(erro); return; }
    setEditando(false);
  };

  if (editando) {
    return (
      <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <input autoFocus value={texto} maxLength={60} disabled={salvando}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void salvar(); if (e.key === "Escape") setEditando(false); }}
          title={`Nome da fase "${fase}" no POS e no PPV. Vazio = volta ao nome original.`}
          style={{ fontSize: 14, padding: "3px 8px", borderRadius: 8, border: "1px solid var(--border, #cbd5e1)", background: "var(--surface, #fff)", color: "inherit", minWidth: 220, marginBottom: 0 }} />
        <button type="button" onClick={() => void salvar()} disabled={salvando} title="Salvar"
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "#047857", fontSize: 14, padding: 2 }}>
          <i className={salvando ? "fas fa-spinner fa-spin" : "fas fa-check"} />
        </button>
        <button type="button" onClick={() => setEditando(false)} disabled={salvando} title="Cancelar"
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", fontSize: 14, padding: 2 }}>
          <i className="fas fa-xmark" />
        </button>
      </span>
    );
  }
  return (
    <>
      <span className={className} title={nome !== fase ? `Fase "${fase}"` : undefined}>{nome}</span>
      {podeEditar && ehFase(fase) && (
        <button type="button" onClick={abrir} title="Renomear esta fase (muda no POS e no PPV)"
          style={{ border: "none", background: "transparent", cursor: "pointer", color: "#94a3b8", fontSize: 12, padding: "2px 4px", marginLeft: 2 }}>
          <i className="fas fa-pen" />
        </button>
      )}
    </>
  );
}
