"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { authHeaders } from "@/lib/auth/client";

export interface ItemOSEditavel {
  ppvId: string;
  codigo: string;
  descricao: string;
  qtde: number;   // saldo atual no PPV (saídas − devoluções)
  valor: number;  // preço unitário
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => parseFloat(String(s).replace(",", "."));

// Editar uma peça do PPV vinculado direto da OS: quantidade, preço unitário e
// devolução de parte (ou de tudo). Usa as MESMAS movimentações do PPV:
// aumentar = Saída da diferença, diminuir/remover = Devolução, preço = PATCH.
interface Props {
  item: ItemOSEditavel | null;
  tecnico: string;
  userName?: string;
  podeEditar: boolean;
  onClose: () => void;
  onSalvo: () => void | Promise<void>;
}

export default function ModalEditarItemOS(props: Props) {
  if (!props.item || typeof document === "undefined") return null;
  // key = formulário novo a cada item aberto
  return <Conteudo key={`${props.item.ppvId}|${props.item.codigo}|${props.item.qtde}|${props.item.valor}`} {...props} item={props.item} />;
}

function Conteudo({ item, tecnico, userName, podeEditar, onClose, onSalvo }: Props & { item: ItemOSEditavel }) {
  const [qtd, setQtd] = useState(String(item.qtde));
  const [preco, setPreco] = useState(item.valor.toFixed(2));
  const [qtdRemover, setQtdRemover] = useState("1");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function mover(tipoMovimento: "Saída" | "Devolução", quantidade: number, precoUn: number) {
    const res = await fetch("/api/ppv/movimentacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ id: item.ppvId, codigo: item.codigo, descricao: item.descricao, quantidade, preco: precoUn, tecnico, tipoMovimento, userName }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erro ao registrar ${tipoMovimento.toLowerCase()}`);
  }

  async function executar(fn: () => Promise<void>) {
    setSalvando(true);
    setErro("");
    try {
      await fn();
      await onSalvo();
      onClose();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar");
    }
    setSalvando(false);
  }

  const novaQtd = num(qtd);
  const novoPreco = num(preco);
  const remover = num(qtdRemover);
  const qtdValida = !isNaN(novaQtd) && novaQtd >= 0;
  const precoValido = !isNaN(novoPreco) && novoPreco >= 0;
  const mudouQtd = qtdValida && novaQtd !== item.qtde;
  const mudouPreco = precoValido && Math.abs(novoPreco - item.valor) >= 0.005;
  const removerValido = !isNaN(remover) && remover > 0 && remover <= item.qtde;

  const salvar = () => executar(async () => {
    if (!qtdValida) throw new Error("Quantidade inválida");
    if (!precoValido) throw new Error("Preço inválido");
    if (mudouPreco) {
      const res = await fetch("/api/ppv/movimentacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ id: item.ppvId, codigo: item.codigo, preco: novoPreco, userName }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erro ao alterar o preço");
    }
    if (mudouQtd) {
      const dif = +(novaQtd - item.qtde).toFixed(3);
      await mover(dif > 0 ? "Saída" : "Devolução", Math.abs(dif), novoPreco);
    }
  });

  const removerQtd = (q: number) => {
    const tudo = q >= item.qtde;
    if (!confirm(tudo ? `Remover ${item.descricao} inteiro do PPV ${item.ppvId}?` : `Remover ${q} un de ${item.descricao} do PPV ${item.ppvId}?`)) return;
    executar(() => mover("Devolução", q, item.valor));
  };

  const bloqueado = salvando || !podeEditar;
  const lbl: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--portal-text-secondary)", marginBottom: 4 };
  const inp: React.CSSProperties = { width: "100%", marginBottom: 0, fontSize: 15, fontWeight: 500 };
  const passo = (d: number) => { const n = (qtdValida ? novaQtd : item.qtde) + d; if (n >= 0) setQtd(String(n)); };
  const btnPasso: React.CSSProperties = { width: 36, flexShrink: 0, borderRadius: 8, border: "1px solid var(--portal-border)", background: "var(--portal-bg-secondary)", color: "var(--portal-text)", fontSize: 16, fontWeight: 600, cursor: bloqueado ? "not-allowed" : "pointer" };

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70000, background: "rgba(15,23,42,.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "var(--portal-bg-card, #fff)", color: "var(--portal-text)", borderRadius: 12, boxShadow: "0 20px 50px rgba(0,0,0,.3)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--portal-border)", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: "var(--portal-text-secondary)" }}>{item.codigo} · PPV {item.ppvId}</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{item.descricao}</div>
          </div>
          <button type="button" onClick={onClose} title="Fechar" style={{ border: "none", background: "transparent", color: "var(--portal-text-secondary)", fontSize: 18, cursor: "pointer" }}><i className="fas fa-times" /></button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Quantidade</label>
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" onClick={() => passo(-1)} disabled={bloqueado} style={btnPasso}>−</button>
                <input type="number" min="0" step="1" value={qtd} onChange={(e) => setQtd(e.target.value)} disabled={bloqueado} style={{ ...inp, textAlign: "center" }} />
                <button type="button" onClick={() => passo(1)} disabled={bloqueado} style={btnPasso}>+</button>
              </div>
            </div>
            <div>
              <label style={lbl}>Preço unitário (R$)</label>
              <input type="number" min="0" step="0.01" value={preco} onChange={(e) => setPreco(e.target.value)} disabled={bloqueado} style={{ ...inp, textAlign: "right" }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--portal-text-secondary)" }}>
            <span>Hoje: {item.qtde} × {fmt(item.valor)} = {fmt(item.qtde * item.valor)}</span>
            <b style={{ color: "var(--portal-text)" }}>{qtdValida && precoValido ? fmt(novaQtd * novoPreco) : "—"}</b>
          </div>
          {mudouPreco && <div style={{ fontSize: 11.5, color: "#B45309" }}>O preço novo vale para todas as unidades desta peça no PPV e atualiza o cadastro, igual ao PPV.</div>}

          <div style={{ borderTop: "1px dashed var(--portal-border)", paddingTop: 12 }}>
            <label style={lbl}>Remover do PPV</label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <input type="number" min="1" max={item.qtde} step="1" value={qtdRemover} onChange={(e) => setQtdRemover(e.target.value)} disabled={bloqueado} style={{ ...inp, width: 80, textAlign: "center" }} />
              <span style={{ fontSize: 12, color: "var(--portal-text-secondary)" }}>de {item.qtde}</span>
              <button type="button" onClick={() => removerQtd(remover)} disabled={bloqueado || !removerValido}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #dc2626", background: "transparent", color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: bloqueado || !removerValido ? "not-allowed" : "pointer", opacity: removerValido ? 1 : 0.5 }}>
                <i className="fas fa-minus-circle" /> Remover {removerValido ? remover : ""}
              </button>
              <button type="button" onClick={() => removerQtd(item.qtde)} disabled={bloqueado}
                style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: bloqueado ? "not-allowed" : "pointer" }}>
                <i className="fas fa-trash" /> Remover tudo
              </button>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--portal-text-secondary)", marginTop: 6 }}>Entra como devolução no PPV (fica no histórico).</div>
          </div>

          {erro && <div style={{ fontSize: 13, color: "#dc2626" }}>{erro}</div>}
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--portal-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} disabled={salvando} style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid var(--portal-border)", background: "transparent", color: "var(--portal-text)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
          <button type="button" onClick={salvar} disabled={bloqueado || (!mudouQtd && !mudouPreco)}
            style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: bloqueado || (!mudouQtd && !mudouPreco) ? "var(--portal-text-faint)" : "#0d9488", color: "#fff", fontSize: 13, fontWeight: 600, cursor: bloqueado || (!mudouQtd && !mudouPreco) ? "not-allowed" : "pointer" }}>
            {salvando ? <i className="fas fa-spinner fa-spin" /> : "Salvar"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
