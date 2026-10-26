"use client";
// Peças pequenas da tela "Hoje": número que sobe contando, selo de motivo, linha do cliente na fila.
import { useEffect, useRef, useState } from "react";
import { GRUPOS, type ClienteHoje, type Grupo, type Motivo } from "@/lib/feedbacks/hoje";
import { COR_ACAO, ICO_ACAO, fmtTel } from "../fila/FichaCliente";

export const GRUPO: Record<Grupo, (typeof GRUPOS)[number]> = Object.fromEntries(GRUPOS.map((g) => [g.k, g])) as Record<Grupo, (typeof GRUPOS)[number]>;

/** Ícone por motivo: o da fonte quando é registro/revisão, o do grupo nas oportunidades. */
export function icoMotivo(m: Motivo): string {
  if (m.retorno) return "fa-calendar-check";
  if (m.fonte === "revisao") return "fa-tractor";
  if (m.fonte === "registro") return m.registro?.tipo === "crm" ? "fa-screwdriver-wrench" : "fa-user-clock";
  if (m.regra === "R7_garantia_risco") return "fa-shield-halved";
  if (m.regra === "R1_revisao") return "fa-calendar-day";
  return GRUPO[m.grupo].ico;
}
export const corMotivo = (m: Motivo) => (m.retorno ? GRUPO.retornos.cor : GRUPO[m.grupo].cor);

const reduzMovimento = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Número que sobe (ou desce) contando até o valor — respeita "reduzir movimento". */
export function Contador({ valor, ms = 700 }: { valor: number; ms?: number }) {
  // no servidor (prévia/impressão) já sai o número; no navegador começa do zero e sobe contando
  const [mostra, setMostra] = useState(() => (typeof window === "undefined" ? valor : 0));
  const de = useRef(0);
  useEffect(() => {
    const inicio = de.current;
    if (reduzMovimento() || inicio === valor) { const id = requestAnimationFrame(() => { de.current = valor; setMostra(valor); }); return () => cancelAnimationFrame(id); }
    let raf = 0;
    const t0 = performance.now();
    const passo = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const v = Math.round(inicio + (valor - inicio) * (1 - Math.pow(1 - p, 3)));
      setMostra(v);
      if (p < 1) raf = requestAnimationFrame(passo); else de.current = valor;
    };
    raf = requestAnimationFrame(passo);
    return () => { cancelAnimationFrame(raf); de.current = valor; };
  }, [valor, ms]);
  return <>{mostra.toLocaleString("pt-BR")}</>;
}

export function Selo({ m, curto = false }: { m: Motivo; curto?: boolean }) {
  const txt = curto && m.selo.length > 42 ? `${m.selo.slice(0, 40)}…` : m.selo;
  return (
    <span className={`fbh-selo ${m.pontos > 0 && m.pontos < 30 ? "fraco" : ""}`} style={{ ["--k" as string]: corMotivo(m) }} title={`${m.selo} — ${m.porque}`}>
      <i className={`fa-solid ${icoMotivo(m)}`} /> {txt}
    </span>
  );
}

export function Pontos({ c }: { c: ClienteHoje }) {
  const titulo = c.explicacao.map((e) => `${e.pts > 0 ? "+" : ""}${e.pts}  ${e.rot}`).join("\n");
  return <span className={`fbh-pts ${c.pontos >= 100 ? "alto" : ""}`} title={titulo || "sem pontos hoje"}>{c.pontos > 0 ? `${c.pontos} pts` : "espera"}</span>;
}

/** Uma linha da fila (opções 1 e 2) ou um cartão (opção 3). */
export function LinhaCliente({ c, pos, sel, onClick, atraso = 0, maxSelos = 3 }: { c: ClienteHoje; pos: number | null; sel?: boolean; onClick: () => void; atraso?: number; maxSelos?: number }) {
  const resto = c.motivos.length - maxSelos;
  return (
    <button type="button" className={`fbh-cli ${sel ? "sel" : ""}`} onClick={onClick} style={{ animationDelay: `${Math.min(atraso, 14) * 30}ms`, ["--k" as string]: COR_ACAO[c.acao] }} aria-pressed={sel}>
      <span className={`pos ${c.urgente ? "urg" : ""}`} title={c.urgente ? "Urgente" : undefined}>{c.urgente ? <i className="fa-solid fa-bolt" /> : pos ?? "·"}</span>
      <span style={{ minWidth: 0 }}>
        <span className="nm">{c.nome || "Cliente sem nome"}</span>
        <span className="sub">
          {c.telefone ? <span><i className="fa-solid fa-phone" /> {fmtTel(c.telefone)}</span> : <span style={{ color: "#b91c1c" }}><i className="fa-solid fa-phone-slash" /> sem telefone</span>}
          {c.cidade && <span><i className="fa-solid fa-location-dot" /> {c.cidade}</span>}
          {c.emLigacaoCom && <span style={{ color: "#d97706" }}><i className="fa-solid fa-headset" /> em ligação com {c.emLigacaoCom}</span>}
        </span>
        <span className="fbh-selos">
          {c.motivos.slice(0, maxSelos).map((m) => <Selo key={m.id} m={m} curto />)}
          {resto > 0 && <span className="fbh-selo" style={{ ["--k" as string]: "#64748b" }}>+{resto}</span>}
        </span>
        <span className="faz"><i className={`fa-solid ${ICO_ACAO[c.acao]}`} /> {c.oQueFazer}</span>
      </span>
      <Pontos c={c} />
    </button>
  );
}
