"use client";
// Peças pequenas da tela "Hoje": número que sobe contando, selo de motivo, linha do cliente na fila.
import { useEffect, useRef, useState } from "react";
import { GRUPOS, type ClienteHoje, type Grupo, type Motivo } from "@/lib/feedbacks/hoje";
import { COR_ACAO, ICO_ACAO, fmtTel } from "../fila/FichaCliente";
import { maquinasDosMotivos, nomeModelo } from "@/lib/feedbacks/maquina-modal";

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
  return <span className={`fbh-pts ${c.pontos >= 100 ? "alto" : ""}`} title={`Prioridade na fila: quanto mais pontos, mais na frente.${titulo ? `

${titulo}` : ""}`}>{c.pontos > 0 ? `${c.pontos} pts` : "espera"}</span>;
}

const ehRevisao = (m: Motivo) => m.fonte === "revisao" || m.regra === "R1_revisao";

/** Tipo do motivo (a "classe" em que o cliente caiu): Pós-serviço, Reativação, Peças, Cadastro, Garantia… */
export function tipoMotivo(m: Motivo): { rot: string; cor: string } {
  if (m.regra === "R7_garantia_risco") return { rot: "Risco de perder garantia", cor: "#0f766e" };
  if (ehRevisao(m)) return { rot: "Revisão", cor: GRUPO[m.grupo].cor };
  return { rot: GRUPO[m.grupo].rot, cor: GRUPO[m.grupo].cor };
}
/** O selo sem repetir o tipo: "Retorno combinado 28/10 · Reativação" → "Retorno combinado 28/10". */
function detalheMotivo(m: Motivo, tipo: string): string {
  const grupo = GRUPO[m.grupo].rot;
  let t = m.selo;
  for (const x of [tipo, grupo, "Garantia"]) t = t.replace(new RegExp(`\\s*·\\s*${x}$`, "i"), "").replace(new RegExp(`^${x}:\\s*`, "i"), "").trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.length > 70 ? `${t.slice(0, 68)}…` : t;
}

const ACAO_CURTA: Record<ClienteHoje["acao"], string> = { ligar: "Ligar", whatsapp: "WhatsApp", retentar: "Tentar de novo", aguardar: "Esperar", concluido: "Feito" };

/** Uma linha da fila (José, 28/10/2026: "esse tanto de etiqueta tá confundindo, tem que explicar
 *  melhor o que cada uma significa e organizar"): nome e contato; "Por que ligar" com UMA linha por
 *  motivo (tipo à esquerda, o detalhe ao lado; o 1º é o principal); à direita o que fazer e a
 *  prioridade em pontos. As revisões de vários tratores viram uma linha só. */
export function LinhaCliente({ c, pos, sel, onClick, atraso = 0, maxSelos = 3 }: { c: ClienteHoje; pos: number | null; sel?: boolean; onClick: () => void; atraso?: number; maxSelos?: number }) {
  const revisoes = c.motivos.filter(ehRevisao);
  const outros = c.motivos.filter((m) => !ehRevisao(m));
  const cabem = Math.max(1, maxSelos - (revisoes.length ? 1 : 0));
  const resto = outros.length - cabem;
  const m0 = c.motivos[0];
  const corCli = m0 ? tipoMotivo(m0).cor : "#64748b";
  const iniciais = (c.nome || "?").split(" ").filter((w) => !/^(d[aeo]s?|e)$/i.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  // "Ligar · <motivo principal>" repetia o 1º motivo: aqui fica só a ação; o resto do texto só quando diz algo novo
  const acaoLonga = c.acao === "ligar" && c.oQueFazer.startsWith("Ligar ·") ? null : c.oQueFazer;
  const linhaRev = revisoes.length > 0 && (() => {
    const refs = maquinasDosMotivos(revisoes);
    const n = new Set(refs.map((r, i) => (r?.chassi ? r.chassi.slice(-8) : r?.modelo ? `m:${r.modelo}` : `i:${i}`))).size;
    const forte = revisoes[0];
    const txt = n === 1 ? `${refs[0] && nomeModelo(refs[0]) ? `${nomeModelo(refs[0])} · ` : ""}${forte.selo}` : `${n} tratores com revisão`;
    const titulo = revisoes.map((m, i) => `${refs[i] ? `${nomeModelo(refs[i]!) || "Trator"}: ` : ""}${m.selo}`).join("\n");
    return { txt: txt.length > 70 ? `${txt.slice(0, 68)}…` : txt, titulo, cor: corMotivo(forte) };
  })();
  return (
    <button type="button" className={`fbh-cli ${sel ? "sel" : ""}`} onClick={onClick} style={{ animationDelay: `${Math.min(atraso, 14) * 30}ms`, ["--k" as string]: COR_ACAO[c.acao], ["--cc" as string]: corCli }} aria-pressed={sel}>
      <span className="ava" title={c.urgente ? "Urgente: ligar primeiro" : pos != null ? `${pos}º da fila` : undefined}>
        {iniciais}
        <span className={`pos ${c.urgente ? "urg" : ""}`}>{c.urgente ? <i className="fa-solid fa-bolt" /> : pos ?? "·"}</span>
      </span>
      <span style={{ minWidth: 0 }}>
        <span className="nm">{c.nome || "Cliente sem nome"}{c.urgente && <span className="fbh-urg"><i className="fa-solid fa-bolt" /> urgente</span>}</span>
        <span className="sub">
          {c.telefone ? <span><i className="fa-solid fa-phone" /> {fmtTel(c.telefone)}</span> : <span style={{ color: "#b91c1c" }}><i className="fa-solid fa-phone-slash" /> sem telefone</span>}
          {c.cidade && <span><i className="fa-solid fa-location-dot" /> {c.cidade}</span>}
          {c.emLigacaoCom && <span style={{ color: "#d97706" }}><i className="fa-solid fa-headset" /> em ligação com {c.emLigacaoCom}</span>}
        </span>
        {(outros.length > 0 || linhaRev) && (
          <span className="fbh-pq">
            <span className="cab">{c.motivos.length > 1 ? `Por que ligar · ${c.motivos.length} motivos` : "Por que ligar"}</span>
            {outros.slice(0, cabem).map((m, i) => {
              const t = tipoMotivo(m);
              return (
                <span key={m.id} className={`fbh-mt ${i === 0 ? "principal" : ""} ${m.pontos > 0 && m.pontos < 30 ? "fraco" : ""}`} style={{ ["--k" as string]: m.retorno ? GRUPO.retornos.cor : t.cor }} title={m.porque}>
                  <span className="tp"><i className={`fa-solid ${icoMotivo(m)}`} /> {t.rot}</span>
                  <span className="dt">{detalheMotivo(m, t.rot)}</span>
                </span>
              );
            })}
            {linhaRev && (
              <span className="fbh-mt" style={{ ["--k" as string]: linhaRev.cor }} title={linhaRev.titulo}>
                <span className="tp"><i className="fa-solid fa-tractor" /> Revisão</span>
                <span className="dt">{linhaRev.txt}</span>
              </span>
            )}
            {resto > 0 && <span className="fbh-mt-mais">e mais {resto} motivo{resto > 1 ? "s" : ""} — abra o cliente para ver</span>}
          </span>
        )}
      </span>
      <span className="fbh-dir">
        <span className="fbh-acao" title={c.oQueFazer}><i className={`fa-solid ${ICO_ACAO[c.acao]}`} /> {ACAO_CURTA[c.acao]}<i className="fa-solid fa-arrow-right seta" /></span>
        {acaoLonga && <small className="fbh-acao-tx">{acaoLonga}</small>}
        <Pontos c={c} />
      </span>
    </button>
  );
}
