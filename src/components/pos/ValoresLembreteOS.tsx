"use client";
// Valor do lembrete na OS e motivo do desconto (José, 27/10/2026).
// - Lembrete com valor "cobrar": ao abrir a OS pergunta se inclui um serviço Diversos com o valor e o título.
// - Lembrete com valor "credito": pergunta se aplica como desconto; o título vira o motivo do desconto.
// - Todo desconto novo pede o motivo (janela); o motivo fica num ícone pulsando ao lado do desconto.

import { useState } from "react";

export type ValorTipo = "cobrar" | "credito";
export interface LembreteValor { id: number; lembrete: string; valor?: number | string | null; valor_tipo?: ValorTipo | string | null; concluido?: boolean; ativo?: boolean }

const brl = (n: number) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** primeira linha do lembrete, curta: vira a descrição do Diversos / o motivo do desconto */
export const tituloLembrete = (t: string) => String(t || "").split("\n").map((x) => x.trim()).find(Boolean)?.slice(0, 120) || "Lembrete";
export const valorDoLembrete = (l: LembreteValor) => Math.round((Number(l.valor) || 0) * 100) / 100;
export const temValorPendente = (l: LembreteValor) =>
  !l.concluido && l.ativo !== false && valorDoLembrete(l) > 0 && (l.valor_tipo === "cobrar" || l.valor_tipo === "credito");

const fundo: React.CSSProperties = { position: "fixed", inset: 0, zIndex: 100002, background: "rgba(15, 23, 42, 0.45)", display: "grid", placeItems: "center", padding: 16 };
const caixa: React.CSSProperties = { width: "min(460px, 100%)", background: "#fefefe", borderRadius: 16, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14,
  boxShadow: "0 20px 50px rgba(15, 23, 42, 0.25)", color: "#0f172a", fontWeight: 400 };
const botao = (cor?: string): React.CSSProperties => ({
  height: 38, padding: "0 16px", borderRadius: 10, fontSize: 14, fontFamily: "inherit", cursor: "pointer", fontWeight: 400,
  border: cor ? "none" : "1px solid #e2e8f0", background: cor || "#fefefe", color: cor ? "#fefefe" : "#334155",
});

/** Janela ao abrir a OS: cliente deve (inclui Diversos) ou tem crédito (vira desconto). */
export function ModalValorLembrete({ l, totalOS, ocupado, onAplicar, onDepois }: {
  l: LembreteValor;
  /** valor da OS hoje (já com descontos) — o crédito não passa disso */
  totalOS: number;
  ocupado?: boolean;
  onAplicar: () => void;
  onDepois: () => void;
}) {
  const valor = valorDoLembrete(l);
  const titulo = tituloLembrete(l.lembrete);
  const credito = l.valor_tipo === "credito";
  const cor = credito ? "#0d9488" : "#EA580C";
  const cabe = Math.max(0, Math.min(valor, Math.round(totalOS * 100) / 100));
  const sobra = Math.round((valor - cabe) * 100) / 100;

  return (
    <div style={fundo}>
      <div style={caixa} role="dialog" aria-modal="true">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", fontSize: 17, color: cor,
            background: `color-mix(in srgb, ${cor} 10%, #fefefe)` }}>
            <i className={`fa-solid ${credito ? "fa-piggy-bank" : "fa-hand-holding-dollar"}`} />
          </span>
          <div style={{ fontSize: 17, fontWeight: 500 }}>{credito ? "Cliente tem crédito com a loja" : "Cliente tem um valor em aberto"}</div>
        </div>

        <div style={{ fontSize: 14.5, lineHeight: 1.5, color: "#334155" }}>
          {credito ? <>O cliente tem <b style={{ fontWeight: 500, color: cor }}>{brl(valor)}</b> de crédito ({titulo}). Deseja aplicar como desconto nesta OS?</>
            : <>O cliente tem um valor em aberto ({titulo}) de <b style={{ fontWeight: 500, color: cor }}>{brl(valor)}</b>. Deseja incluir esse valor na ordem?</>}
        </div>

        <div style={{ fontSize: 13, color: "#64748b", padding: "10px 12px", borderRadius: 12, background: "#f6f8f9" }}>
          {credito
            ? (cabe <= 0 ? "A OS ainda está sem valor. Lance as horas ou serviços antes de aplicar o crédito."
              : sobra > 0 ? `A OS vale menos que o crédito: entram ${brl(cabe)} de desconto e o lembrete continua aberto com ${brl(sobra)}.`
              : `Entra ${brl(valor)} de desconto, com o motivo "${titulo}". A OS é salva e o lembrete é concluído.`)
            : `Entra o serviço Diversos de ${brl(valor)} com a descrição "${titulo}". A OS é salva e o lembrete é concluído.`}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" style={botao()} onClick={onDepois} disabled={ocupado}>Agora não</button>
          <button type="button" style={{ ...botao(cor), opacity: ocupado || (credito && cabe <= 0) ? 0.55 : 1 }} disabled={ocupado || (credito && cabe <= 0)} onClick={onAplicar}>
            {ocupado ? "Salvando…" : credito ? "Aplicar como desconto" : "Incluir na OS"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Janela do motivo do desconto: obrigatória ao incluir/mudar o desconto. */
export function ModalMotivoDesconto({ valor, motivoAtual, obrigatorio = true, onSalvar, onCancelar }: {
  valor: number;
  motivoAtual: string;
  /** false = só olhando/trocando o motivo de um desconto já explicado */
  obrigatorio?: boolean;
  onSalvar: (motivo: string) => void;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState(motivoAtual || "");
  const ok = texto.trim().length >= 5;
  return (
    <div style={fundo}>
      <div style={caixa} role="dialog" aria-modal="true">
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", fontSize: 17, color: "#0d9488", background: "color-mix(in srgb, #0d9488 10%, #fefefe)" }}>
            <i className="fa-solid fa-tag" />
          </span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 500 }}>Motivo do desconto</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>Desconto de {brl(valor)} nesta OS</div>
          </div>
        </div>
        <textarea rows={3} autoFocus value={texto} onChange={(e) => setTexto(e.target.value)}
          placeholder="Ex.: crédito da peça devolvida, combinado na venda do trator…"
          style={{ width: "100%", borderRadius: 10, fontSize: 14, marginBottom: 0 }} />
        {!ok && texto.trim().length > 0 && <div style={{ fontSize: 12.5, color: "#b45309" }}>Explique um pouco mais (mínimo 5 letras).</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" style={botao()} onClick={onCancelar}>{obrigatorio ? "Tirar o desconto" : "Fechar"}</button>
          <button type="button" style={{ ...botao("#0d9488"), opacity: ok ? 1 : 0.55 }} disabled={!ok} onClick={() => onSalvar(texto.trim())}>Salvar motivo</button>
        </div>
      </div>
    </div>
  );
}

/** Ícone pulsando ao lado do desconto: mostra o motivo e abre a janela para trocar. */
export function IconeMotivoDesconto({ motivo, por, onClick }: { motivo: string; por?: string; onClick: () => void }) {
  return (
    <>
      <style>{`@keyframes pos-pulso-motivo{0%{box-shadow:0 0 0 0 rgba(13,148,136,.45)}70%{box-shadow:0 0 0 7px rgba(13,148,136,0)}100%{box-shadow:0 0 0 0 rgba(13,148,136,0)}}`}</style>
      <button type="button" onClick={onClick} title={`Motivo do desconto: ${motivo}${por ? ` (${por})` : ""}`}
        style={{ width: 18, height: 18, borderRadius: 999, border: "none", padding: 0, marginLeft: 4, cursor: "pointer", verticalAlign: "middle",
          display: "inline-grid", placeItems: "center", fontSize: 9.5, color: "#fefefe", background: "#0d9488", animation: "pos-pulso-motivo 1.8s infinite" }}>
        <i className="fa-solid fa-comment-dots" />
      </button>
    </>
  );
}
