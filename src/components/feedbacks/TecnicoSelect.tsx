"use client";
import { useEffect, useState } from "react";
import { listarTecnicos } from "@/lib/feedbacks/api";

interface Props {
  valor: string;
  onChange: (v: string) => void;
}

export default function TecnicoSelect({ valor, onChange }: Props) {
  const [tecnicos, setTecnicos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const lista = await listarTecnicos();
        if (!cancelado) setTecnicos(lista);
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelado = true; };
  }, []);

  return (
    <div>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%", padding: "10px 14px",
          border: "1.5px solid var(--portal-border)", borderRadius: 10,
          fontSize: 13, background: "var(--portal-bg-card)", color: "var(--portal-text)",
          fontFamily: "Inter, sans-serif", outline: "none", cursor: "pointer",
        }}
      >
        <option value="">— Selecione técnico —</option>
        {tecnicos.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>
      {erro && (
        <div style={{ marginTop: 4, fontSize: 11, color: "#b91c1c" }}>Erro ao carregar técnicos: {erro}</div>
      )}
    </div>
  );
}
