"use client";
// Moldura da tela "Hoje": guias Chrome (Hoje · Clientes · Robô · Painel) e o topo comum
// (exemplo | reais, "Gravar de verdade" com confirmação vermelha, cota do dia, atualizar).
import { useState } from "react";
import Link from "next/link";
import type { Hoje } from "./useHoje";

export type Aba = "hoje" | "clientes" | "robo" | "painel";
export const ABAS: { k: Aba; rot: string; ico: string; gerente?: boolean }[] = [
  { k: "hoje", rot: "Hoje", ico: "fa-sun" },
  { k: "clientes", rot: "Clientes", ico: "fa-address-book" },
  { k: "robo", rot: "Robô de oportunidades", ico: "fa-robot", gerente: true },
  { k: "painel", rot: "Painel", ico: "fa-chart-simple", gerente: true },
];

export function FaixaAbas({ aba, setAba, gerente }: { aba: Aba; setAba: (a: Aba) => void; gerente: boolean }) {
  return (
    <nav className="fbh-faixa" role="tablist" aria-label="Telas do atendimento">
      {ABAS.filter((a) => !a.gerente || gerente).map((a) => (
        <button key={a.k} type="button" role="tab" aria-selected={aba === a.k} className={`fbh-guia ${aba === a.k ? "on" : ""}`} onClick={() => setAba(a.k)}>
          <i className={`fa-solid ${a.ico}`} /> {a.rot}{a.gerente && <span className="so">gerente</span>}
        </button>
      ))}
    </nav>
  );
}

export function Topo({ hoje, exemplo, setExemplo }: { hoje: Pick<Hoje, "gravar" | "setGravar" | "cota" | "setCota" | "recarregar" | "tabelaContato">; exemplo: boolean; setExemplo: (v: boolean) => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const { gravar, setGravar, cota, setCota } = hoje;
  return (
    <>
      <div className="fbf-topo">
        <div className="fbf-seg" aria-label="Quais dados">
          <button type="button" className={exemplo ? "on" : ""} style={{ ["--k" as string]: "#7c3aed" }} onClick={() => { setExemplo(true); setGravar(false); setConfirmando(false); }}><i className="fa-solid fa-flask" /> Dados de exemplo</button>
          <button type="button" className={!exemplo ? "on" : ""} style={{ ["--k" as string]: "#0f766e" }} onClick={() => setExemplo(false)}><i className="fa-solid fa-database" /> Dados reais</button>
        </div>
        {!exemplo && (
          <button type="button" className={`fbf-gravar ${gravar ? "on" : ""}`} aria-pressed={gravar}
            onClick={() => { if (gravar) { setGravar(false); setConfirmando(false); } else setConfirmando(true); }}>
            <span className="sw" /> {gravar ? "Gravando de verdade" : "Gravar de verdade: desligado"}
          </button>
        )}
        <span style={{ flex: 1 }} />
        <span className="fbh-cota" title="Quantos clientes entram em Hoje (o resto fica em Depois). Só nesta tela.">
          Cota do dia
          <button type="button" onClick={() => setCota(Math.max(5, cota - 5))} aria-label="Menos 5">−</button>
          <input type="number" min={1} max={200} value={cota} onChange={(e) => setCota(Math.min(200, Math.max(1, Number(e.target.value) || 1)))} aria-label="Cota do dia" />
          <button type="button" onClick={() => setCota(Math.min(200, cota + 5))} aria-label="Mais 5">+</button>
        </span>
        <button type="button" className="fbn-btn" onClick={() => void hoje.recarregar({ forcarRev: true })} title="Ler de novo do banco"><i className="fa-solid fa-rotate" /> Atualizar</button>
        <Link className="fbn-btn" href="/feedbacks/crm/teste"><i className="fa-solid fa-arrow-left" /> Página de teste do CRM</Link>
      </div>
      {confirmando && !gravar && (
        <div className="fbf-confirma">
          <i className="fa-solid fa-triangle-exclamation" style={{ color: "#dc2626" }} />
          <span style={{ flex: "1 1 260px" }}>Com isto ligado, o concluir <b>grava de verdade</b>: atendimentos do CRM/RFM, oportunidades marcadas como atendidas e o atendimento das revisões{hoje.tabelaContato ? "" : " (a tabela das revisões ainda não existe: essas só simulam)"}. Nota baixa avisa o gerente. Ligar?</span>
          <button type="button" className="fbn-acao cheio" style={{ ["--c" as string]: "#dc2626" }} onClick={() => { setGravar(true); setConfirmando(false); }}>Sim, gravar de verdade</button>
          <button type="button" className="fbn-acao" onClick={() => setConfirmando(false)}>Cancelar</button>
        </div>
      )}
    </>
  );
}

/** Topo das telas de verdade (Hoje e Painel): sem "Dados de exemplo" nem "Gravar de verdade" — grava sempre. */
export function TopoReal({ hoje, comCota = true, extra }: { hoje: Pick<Hoje, "cota" | "setCota" | "recarregar" | "geradoEm" | "carregando">; comCota?: boolean; extra?: React.ReactNode }) {
  const { cota, setCota } = hoje;
  const hora = new Date(hoje.geradoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="fbf-topo">
      {extra}
      <span style={{ flex: 1 }} />
      <span style={{ fontSize: 12.5, color: "var(--t2)" }}>{hoje.carregando ? "lendo…" : `atualizado às ${hora}`}</span>
      {comCota && (
        <span className="fbh-cota" title="Quantos clientes entram em Hoje (o resto fica em Depois). Vale só para você, nesta tela.">
          Cota do dia
          <button type="button" onClick={() => setCota(Math.max(5, cota - 5))} aria-label="Menos 5">−</button>
          <input type="number" min={1} max={200} value={cota} onChange={(e) => setCota(Math.min(200, Math.max(1, Number(e.target.value) || 1)))} aria-label="Cota do dia" />
          <button type="button" onClick={() => setCota(Math.min(200, cota + 5))} aria-label="Mais 5">+</button>
        </span>
      )}
      <button type="button" className="fbn-btn" onClick={() => void hoje.recarregar({ forcarRev: true })} title="Ler de novo do banco"><i className="fa-solid fa-rotate" /> Atualizar</button>
    </div>
  );
}
