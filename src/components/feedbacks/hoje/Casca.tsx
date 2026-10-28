"use client";
// Casca comum das telas de verdade do Feedbacks (Hoje · Clientes · Painel · Robô — 23/10/2026):
// escopo de estilo .fbn/.fbh (estiloNovo + estiloFila + estiloHoje), tela cheia, e — quando recebe
// o `hoje` — o histórico do cliente e o aviso (toast) do concluir.
import type { ReactNode } from "react";
import ModalHistoricoCliente from "@/components/feedbacks/ModalHistoricoCliente";
import { ESTILO_FBN } from "@/components/feedbacks/estiloNovo";
import { ESTILO_FILA } from "@/components/feedbacks/fila/estiloFila";
import { ESTILO_US } from "@/components/feedbacks/fila/UltimoServico";
import { COR_CRM } from "@/lib/feedbacks/cores";
import { ESTILO_HOJE } from "./estiloHoje";
import type { Hoje } from "./useHoje";

/** Ajustes só das telas de verdade (a faixa de abas vem do layout do módulo). */
const ESTILO_CASCA = `
.fbh.fbr { padding-top: 16px }
.fbn a.fbn-acao, .fbn a.fbn-btn, .fbn a.fbh-item { text-decoration: none; color: var(--t) }
.fbr-omie { flex: 1 1 340px; max-width: 520px; min-width: 0 }
.fbr-omie input { box-sizing: border-box; max-width: 100% }
.fbr-seg { display: inline-flex; gap: 2px; padding: 3px; border: 1px solid var(--b); border-radius: 12px; background: var(--soft); flex-wrap: wrap }
.fbr-seg button { height: 34px; padding: 0 14px; border: 0; border-radius: 9px; background: transparent; color: var(--t2); font: inherit; font-size: 13.5px; cursor: pointer; display: inline-flex; gap: 7px; align-items: center }
.fbr-seg button.on { background: var(--s); color: var(--t); box-shadow: 0 1px 3px rgba(15,23,42,.12) }
.fbr-tab { width: 100%; border-collapse: collapse; font-size: 13.5px }
.fbr-tab th { text-align: left; font-weight: 500; font-size: 12.5px; color: var(--t2); padding: 8px 10px; border-bottom: 1px solid var(--b); white-space: nowrap }
.fbr-tab td { padding: 9px 10px; border-bottom: 1px solid var(--b); color: var(--t); vertical-align: top }
.fbr-tab tr.clica { cursor: pointer } .fbr-tab tr.clica:hover td { background: var(--soft) }
.fbr-tab td.n, .fbr-tab th.n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap }
.fbr-rola { overflow-x: auto; -webkit-overflow-scrolling: touch }
.fbr-pct { display: inline-block; font-size: 12px; padding: 1px 8px; border-radius: 999px; font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--k) 80%, #0f172a); background: color-mix(in srgb, var(--k) 11%, var(--s)); border: 1px solid color-mix(in srgb, var(--k) 22%, transparent) }
`;

export default function Casca({ hoje, children }: { hoje?: Hoje; children: ReactNode }) {
  return (
    <div className="fbn fbh fbr" style={{ ["--c" as string]: COR_CRM }}>
      <style>{ESTILO_FBN + ESTILO_FILA + ESTILO_US + ESTILO_HOJE + ESTILO_CASCA}</style>
      {children}
      {hoje && <ExtrasHoje hoje={hoje} />}
    </div>
  );
}

/** Histórico do cliente + aviso do concluir (para telas que montam o useHoje dentro da Casca). */
export function ExtrasHoje({ hoje }: { hoje: Hoje }) {
  return (
    <>
      <ModalHistoricoCliente aberto={!!hoje.historico} nome={hoje.historico?.nome || ""} codigoOmie={hoje.historico?.codigoOmie ?? null} onFechar={hoje.fecharHistorico} />
      {hoje.toast && (
        <div key={hoje.toast.id} className={`fbf-toast ${hoje.toast.tipo}`} role="status">
          <i className={`fa-solid ${hoje.toast.tipo === "erro" ? "fa-circle-exclamation" : hoje.toast.tipo === "sim" ? "fa-flask" : "fa-circle-check"}`} />
          <span>{hoje.toast.texto}</span>
          <button type="button" onClick={hoje.fecharToast} aria-label="Fechar"><i className="fa-solid fa-xmark" /></button>
        </div>
      )}
    </>
  );
}

/** Pílula de porcentagem verde/âmbar/vermelha (≥ 80 / ≥ 50 / abaixo). */
export function Pct({ v }: { v: number | null | undefined }) {
  if (v == null) return <>—</>;
  const k = v >= 80 ? "#16a34a" : v >= 50 ? "#d97706" : "#dc2626";
  return <span className="fbr-pct" style={{ ["--k" as string]: k }}>{v}%</span>;
}
