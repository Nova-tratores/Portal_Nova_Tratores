"use client";
// Cronômetro com tempo estimado embaixo das telas de carregamento (José, 15/10/2026):
// as chamadas ao Omie/governo demoram e a pessoa precisa saber quanto falta.
import { useEffect, useState } from "react";

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.floor(s % 60))).padStart(2, "0")}`;

/** segundos desde que montou (para a barra e os passos acompanharem o tempo) */
export function useSegundos(): number {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setS((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return s;
}

export default function CronometroEstimado({ segundos, estimativa, cor = "#0369A1" }: { segundos: number; estimativa: number; cor?: string }) {
  const passou = segundos > estimativa;
  const restante = Math.max(0, estimativa - segundos);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, fontSize: 12.5, color: "#64748b", fontVariantNumeric: "tabular-nums" }}>
      <span><i className="fas fa-stopwatch" style={{ color: cor, marginRight: 5 }} />{mmss(segundos)}</span>
      <span style={{ width: 1, height: 14, background: "#e2e8f0" }} />
      <span>{passou ? "levando mais que o normal — o Omie está lento, aguarde" : <>estimado <b style={{ color: "#334155" }}>~{mmss(estimativa)}</b> · faltam ~{mmss(restante)}</>}</span>
    </div>
  );
}

/** % da barra pelo tempo (vai até 95% e espera a resposta) */
export const pctPeloTempo = (segundos: number, estimativa: number) => Math.min(95, Math.round((segundos / Math.max(1, estimativa)) * 92) + 3);
