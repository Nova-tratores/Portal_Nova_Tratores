"use client";

// Botão "mudar de empresa" de uma peça (Nova ⇄ Castro) — no drawer do PPV e na aba
// Produtos da OS. Preço diferente na outra empresa → pergunta antes. Peça que não
// existe lá → popup e a peça NÃO muda; fica a marca "não tem na X" na linha.

import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/ppv/api";
import type { PPVDetalhes } from "@/lib/ppv/types";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ehCastro = (s?: string | null) => /castro|primari/i.test(s || "");

interface Props {
  ppvId: string;
  codigo: string;
  descricao?: string;
  empresa?: string;
  empresaFixa?: boolean;
  semCadastroEm?: string | null;
  /** pedido enviado/faturado ou sem permissão: o selo aparece, mas não clica */
  desabilitado?: boolean;
  motivoDesabilitado?: string;
  onTrocado: (detalhes: PPVDetalhes | undefined, mensagem: string) => void;
  onErro?: (mensagem: string) => void;
}

type Popup =
  | { tipo: "preco"; atual: string; destino: string; precoAtual: number; precoDestino: number }
  | { tipo: "sem"; destino: string };

export default function TrocarEmpresaItem(p: Props) {
  const [busy, setBusy] = useState(false);
  const [popup, setPopup] = useState<Popup | null>(null);
  const castro = ehCastro(p.empresa);
  const rotulo = castro ? "CASTRO" : "NOVA";
  const outra = castro ? "NOVA" : "CASTRO";

  async function trocar(confirmar: boolean) {
    setBusy(true);
    try {
      const r = await api.trocarEmpresaItem(p.ppvId, p.codigo, confirmar);
      if (r.precisaConfirmar) {
        setPopup({ tipo: "preco", atual: r.atual || rotulo, destino: r.destino, precoAtual: r.precoAtual || 0, precoDestino: r.precoDestino || 0 });
      } else if (r.naoCadastrado) {
        setPopup({ tipo: "sem", destino: r.destino });
        p.onTrocado(r.detalhes, `${p.codigo} não está cadastrado na ${r.destino}.`);
      } else {
        setPopup(null);
        p.onTrocado(r.detalhes, `${p.codigo} agora é da ${r.destino}${r.mudouPreco ? " (preço atualizado)" : ""}.`);
      }
    } catch (e) {
      setPopup(null);
      const m = e instanceof Error ? e.message : "Erro ao mudar de empresa";
      if (p.onErro) p.onErro(m); else alert(m);
    }
    setBusy(false);
  }

  const cor = castro ? { bg: "#DBEAFE", fg: "#2563EB", bd: "#BFDBFE" } : { bg: "#fff3e6", fg: "#c2570a", bd: "#fed7aa" };

  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); trocar(false); }}
        disabled={busy || p.desabilitado}
        title={p.desabilitado ? (p.motivoDesabilitado || "Não dá pra mudar a empresa agora") : `Peça da ${rotulo}${p.empresaFixa ? " (escolhida à mão)" : ""}. Clique para mudar para ${outra}.`}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 7px", borderRadius: 6, border: `1px solid ${cor.bd}`, background: cor.bg, color: cor.fg, fontSize: 11, fontWeight: 600, cursor: p.desabilitado ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
        {rotulo}
        {!p.desabilitado && <i className={`fas ${busy ? "fa-spinner fa-spin" : "fa-right-left"}`} style={{ fontSize: 9, opacity: 0.8 }} />}
      </button>
      {p.semCadastroEm && (
        <span title={`Tentaram mudar para ${ehCastro(p.semCadastroEm) ? "CASTRO" : "NOVA"}, mas a peça não está cadastrada lá. Peça a Peças para cadastrar.`}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "1px 7px", borderRadius: 6, border: "1px solid #FECACA", background: "#FEF2F2", color: "#B91C1C", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
          <i className="fas fa-triangle-exclamation" style={{ fontSize: 9 }} />
          não tem na {ehCastro(p.semCadastroEm) ? "CASTRO" : "NOVA"}
        </span>
      )}

      {popup && typeof document !== "undefined" && createPortal(
        <div onClick={() => !busy && setPopup(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.45)", zIndex: 100300, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 400, padding: 20, boxShadow: "0 20px 50px rgba(0,0,0,.25)", fontFamily: "inherit", color: "#0f172a" }}>
            {popup.tipo === "sem" ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <i className="fas fa-triangle-exclamation" style={{ color: "#DC2626", fontSize: 20 }} />
                  <b style={{ fontSize: 16 }}>Produto não cadastrado na {popup.destino}</b>
                </div>
                <p style={{ margin: "0 0 6px", fontSize: 14, color: "#475569" }}><b>{p.codigo}</b>{p.descricao ? ` · ${p.descricao}` : ""}</p>
                <p style={{ margin: "0 0 16px", fontSize: 14, color: "#475569" }}>A peça continua na <b>{rotulo}</b>. Ela ficou marcada em vermelho na lista pra você não se perder.</p>
                <div style={{ textAlign: "right" }}>
                  <button type="button" onClick={() => setPopup(null)} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Entendi</button>
                </div>
              </>
            ) : (
              <>
                <b style={{ fontSize: 16, display: "block", marginBottom: 10 }}>Mudar {p.codigo} para {popup.destino}?</b>
                <p style={{ margin: "0 0 12px", fontSize: 14, color: "#475569" }}>O preço é diferente na outra empresa:</p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, fontSize: 15, marginBottom: 16, padding: "10px 0", background: "#F8FAFC", borderRadius: 8 }}>
                  <span><small style={{ color: "#64748B" }}>{popup.atual}</small><br /><b>{brl(popup.precoAtual)}</b></span>
                  <i className="fas fa-arrow-right" style={{ color: "#94A3B8" }} />
                  <span><small style={{ color: "#64748B" }}>{popup.destino}</small><br /><b style={{ color: popup.precoDestino > popup.precoAtual ? "#B45309" : "#047857" }}>{brl(popup.precoDestino)}</b></span>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" disabled={busy} onClick={() => setPopup(null)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
                  <button type="button" disabled={busy} onClick={() => trocar(true)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#2563EB", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
                    {busy ? <i className="fas fa-spinner fa-spin" /> : `Mudar e usar ${brl(popup.precoDestino)}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
