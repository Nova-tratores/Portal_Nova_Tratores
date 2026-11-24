"use client";
// "Não gerar cobrança" de uma peça (PPV e OS): a janela do motivo (respostas prontas
// ou texto livre) e o aviso de faturamento (desmarcar / separar em remessa).
// Regras em src/lib/ppv/sem-cobranca-regras.ts; servidor em /api/ppv/sem-cobranca.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchAuth } from "@/lib/auth/client";
import { MOTIVOS_SEM_COBRANCA } from "@/lib/ppv/sem-cobranca-regras";
import type { PPVDetalhes } from "@/lib/ppv/types";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type RespostaSemCobranca = { ok: true; novoId?: string; aviso?: string; detalhes: PPVDetalhes | null };

/** Chama o servidor; lança Error com a mensagem dele se recusar. */
export async function acaoSemCobranca(body: { acao: "marcar" | "desmarcar" | "separar"; id: string; codigo?: string; motivo?: string }): Promise<RespostaSemCobranca> {
  const r = await fetchAuth("/api/ppv/sem-cobranca", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Não consegui salvar.");
  return j;
}

interface ModalProps {
  item: { codigo: string; descricao: string; valorTotal: number; motivoAtual?: string } | null;
  salvando?: boolean;
  onConfirmar: (motivo: string) => void;
  onDesmarcar?: () => void;
  onFechar: () => void;
}

export function ModalSemCobranca({ item, salvando, onConfirmar, onDesmarcar, onFechar }: ModalProps) {
  const [motivo, setMotivo] = useState("");
  useEffect(() => { setMotivo(item?.motivoAtual || ""); }, [item]);
  if (!item || typeof document === "undefined") return null;
  const jaMarcada = !!item.motivoAtual;

  return createPortal(
    <div onClick={onFechar} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 100000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, background: "var(--portal-bg-card, #fff)", color: "var(--portal-text, #0f172a)", borderRadius: 14, boxShadow: "0 20px 50px rgba(0,0,0,.25)", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: "#ECFDF5", color: "#047857", display: "flex", alignItems: "center", justifyContent: "center" }}><i className="fas fa-hand-holding-heart" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{jaMarcada ? "Peça sem cobrança" : "Não gerar cobrança desta peça"}</div>
            <div style={{ fontSize: 12.5, color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.codigo} · {item.descricao}</div>
          </div>
        </div>
        <div style={{ fontSize: 13, background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 9, padding: "8px 11px", color: "#475569" }}>
          {brl(item.valorTotal)} sai do total. No PDF o cliente vê a peça com o valor riscado e <b style={{ color: "#047857" }}>“não cobrado”</b>.
        </div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>Por que não vai cobrar?</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {MOTIVOS_SEM_COBRANCA.map((m) => (
            <button key={m} type="button" onClick={() => setMotivo(m)}
              style={{ padding: "6px 11px", borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                border: `1.5px solid ${motivo === m ? "#047857" : "#E2E8F0"}`, background: motivo === m ? "#ECFDF5" : "#fff", color: motivo === m ? "#047857" : "#334155" }}>
              {m}
            </button>
          ))}
        </div>
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} placeholder="Ou escreva o motivo..."
          style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 9, border: "1px solid #CBD5E1", fontSize: 13.5, fontFamily: "inherit", resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {jaMarcada && onDesmarcar && (
            <button type="button" onClick={onDesmarcar} disabled={salvando} style={{ marginRight: "auto", padding: "8px 12px", borderRadius: 9, border: "1px solid #FCA5A5", background: "#fff", color: "#B91C1C", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Voltar a cobrar
            </button>
          )}
          <button type="button" onClick={onFechar} disabled={salvando} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #E2E8F0", background: "#fff", color: "#334155", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
          <button type="button" onClick={() => onConfirmar(motivo.trim())} disabled={salvando || !motivo.trim()}
            style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: motivo.trim() ? "#047857" : "#94A3B8", color: "#fefefe", fontWeight: 800, fontSize: 13, cursor: motivo.trim() ? "pointer" : "not-allowed", fontFamily: "inherit" }}>
            {salvando ? "Salvando..." : jaMarcada ? "Salvar motivo" : "Não cobrar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Aviso no PPV antes de enviar/faturar: peça sem cobrança não fatura junto. */
export function AvisoFaturarSemCobranca({ itens, ocupado, onDesmarcar, onSeparar }: {
  itens: { codigo: string; descricao: string; motivo: string }[];
  ocupado?: boolean;
  onDesmarcar: (codigo: string) => void;
  onSeparar: () => void;
}) {
  if (!itens.length) return null;
  return (
    <div style={{ border: "1.5px solid #F59E0B", background: "#FFFBEB", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "#92400E", display: "flex", gap: 7, alignItems: "center" }}>
        <i className="fas fa-triangle-exclamation" /> {itens.length > 1 ? `${itens.length} peças não podem` : "Esta peça não pode"} ser faturada{itens.length > 1 ? "s" : ""} junto
      </div>
      <div style={{ fontSize: 12.5, color: "#78350F" }}>
        Peça marcada “não gerar cobrança” não vai no faturamento. Desmarque, ou separe numa <b>remessa</b> (sai com nota de remessa, sem cobrar).
      </div>
      {itens.map((i) => (
        <div key={i.codigo} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, background: "#fff", border: "1px solid #FDE68A", borderRadius: 8, padding: "6px 9px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{i.codigo}</b> <span style={{ color: "#64748b" }}>{i.descricao}</span>
            <div style={{ fontSize: 11.5, color: "#047857", fontWeight: 600 }}>{i.motivo}</div>
          </div>
          <button type="button" onClick={() => onDesmarcar(i.codigo)} disabled={ocupado}
            style={{ padding: "4px 9px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#fff", color: "#334155", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            Desmarcar
          </button>
        </div>
      ))}
      <button type="button" onClick={onSeparar} disabled={ocupado}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, minHeight: 34, borderRadius: 9, border: "none", background: "#B45309", color: "#fefefe", fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
        <i className={`fas ${ocupado ? "fa-spinner fa-spin" : "fa-truck-ramp-box"}`} /> Separar em remessa
      </button>
    </div>
  );
}
