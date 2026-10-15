"use client";
// Enviar a OS para o financeiro (card no Chamado_NF) a partir da Pasta Clientes.
// Substitui o window.confirm: confirma → tela de carregamento (Omie) → resultado.
import { useState } from "react";
import { createPortal } from "react-dom";
import CronometroEstimado, { useSegundos, pctPeloTempo } from "@/components/comum/CronometroEstimado";

export interface EnvioFinanceiroOS {
  num_os: string;
  cliente_nome?: string;
  valor_total?: number;
  num_nf?: string;
  pv?: string | null;
}

type Fase = "confirmar" | "enviando" | "ok" | "erro";
const ESTIMATIVA = 25;
const brl = (v?: number) => (v || v === 0 ? v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");

const PASSOS = [
  { de: 0, txt: "Lendo a OS no Omie" },
  { de: 5, txt: "Buscando parcelas e pedido de venda" },
  { de: 11, txt: "Anexando as notas fiscais" },
  { de: 18, txt: "Criando o card no financeiro" },
];

function Carregando({ os }: { os: EnvioFinanceiroOS }) {
  const s = useSegundos();
  const pct = pctPeloTempo(s, ESTIMATIVA);
  const atual = PASSOS.filter((p) => s >= p.de).length - 1;
  return (
    <div style={{ padding: "26px 26px 22px", textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 14 }}>
        <img src="/marcas/omie.png" alt="Omie" style={{ height: 26, objectFit: "contain" }} />
        <span style={{ display: "flex", gap: 4 }}>
          {[0, 1, 2].map((i) => (
            <span key={i} style={{ width: 6, height: 6, borderRadius: 3, background: "#047857", opacity: (s + i) % 3 === 0 ? 1 : 0.3, transition: "opacity .3s" }} />
          ))}
        </span>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: "#ecfdf5", color: "#047857", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <i className="fas fa-money-check-dollar" />
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>Enviando a OS {os.num_os} ao financeiro</div>
      <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 3 }}>Não feche esta janela.</div>
      <div style={{ height: 6, borderRadius: 3, background: "#e2e8f0", margin: "16px 0 14px", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#10b981,#047857)", transition: "width 1s linear" }} />
      </div>
      <div style={{ display: "grid", gap: 7, textAlign: "left", margin: "0 auto 14px", maxWidth: 300 }}>
        {PASSOS.map((p, i) => (
          <div key={p.txt} style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: i < atual ? "#047857" : i === atual ? "#0f172a" : "#94a3b8", fontWeight: i === atual ? 700 : 500 }}>
            <i className={`fas ${i < atual ? "fa-circle-check" : i === atual ? "fa-spinner fa-spin" : "fa-circle"}`} style={{ width: 14, fontSize: i > atual ? 6 : 13 }} />
            {p.txt}
          </div>
        ))}
      </div>
      <CronometroEstimado segundos={s} estimativa={ESTIMATIVA} cor="#047857" />
    </div>
  );
}

export default function EnviarFinanceiroModal({ os, motivo, onFechar, onConcluido }: {
  os: EnvioFinanceiroOS;
  /** problemas encontrados (nota faltando etc.) — vazio = envio normal */
  motivo: string;
  onFechar: () => void;
  /** chamado depois de criar o card (a pasta recarrega) */
  onConcluido: (criou: boolean) => void;
}) {
  const [fase, setFase] = useState<Fase>("confirmar");
  const [msg, setMsg] = useState("");
  const forcado = !!motivo.trim();
  const problemas = motivo.split("\n").map((l) => l.trim()).filter(Boolean);

  const enviar = async () => {
    setFase("enviando");
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 120_000);
    try {
      const res = await fetch(`/api/financeiro/sync-os?os=${encodeURIComponent(os.num_os)}&manual=1`, { method: "POST", signal: ctrl.signal });
      const d = await res.json().catch(() => ({}));
      const r = String(d?.resultado || d?.error || "");
      const criou = /Card criado/i.test(r);
      setMsg(r || "Sem detalhe.");
      setFase(criou ? "ok" : "erro");
      onConcluido(criou);
    } catch (e) {
      setMsg(e instanceof DOMException && e.name === "AbortError" ? "O Omie não respondeu em 2 minutos. Confira no financeiro se o card apareceu antes de tentar de novo." : "Erro de conexão.");
      setFase("erro");
    } finally { clearTimeout(t); }
  };

  const ocupado = fase === "enviando";
  const cor = forcado ? "#B91C1C" : "#047857";
  if (typeof document === "undefined") return null;
  return createPortal(
    <div onClick={() => !ocupado && onFechar()} style={{ position: "fixed", inset: 0, zIndex: 100050, background: "rgba(15,23,42,.55)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 440, background: "#fefefe", borderRadius: 16, boxShadow: "0 24px 60px rgba(15,23,42,.35)", overflow: "hidden", color: "#0f172a" }}>
        {fase === "enviando" && <Carregando os={os} />}

        {fase === "confirmar" && (
          <>
            <div style={{ padding: "20px 22px 0", display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: forcado ? "#fef2f2" : "#ecfdf5", color: cor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
                <i className={`fas ${forcado ? "fa-triangle-exclamation" : "fa-paper-plane"}`} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{forcado ? "Criar o card à mão?" : "Enviar para o financeiro?"}</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                  {forcado ? "O automático não cria quando falta nota. Confira os dados no financeiro depois." : "Cria o card de cobrança desta OS no financeiro."}
                </div>
              </div>
            </div>
            <div style={{ margin: "16px 22px 0", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
              {[
                ["Ordem de serviço", os.num_os],
                ["Cliente", os.cliente_nome || "—"],
                ["Pedido de venda", os.pv || "—"],
                ["NFS-e", os.num_nf || "—"],
                ["Valor da OS", brl(os.valor_total)],
              ].map(([k, v], i) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 12px", fontSize: 13, background: i % 2 ? "#f8fafc" : "#fefefe" }}>
                  <span style={{ color: "#64748b" }}>{k}</span>
                  <b style={{ textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</b>
                </div>
              ))}
            </div>
            {forcado && (
              <div style={{ margin: "12px 22px 0", border: "1px solid #fecaca", background: "#fef2f2", borderRadius: 10, padding: "9px 11px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#991b1b", marginBottom: 4 }}>Problemas encontrados</div>
                {problemas.map((p) => <div key={p} style={{ fontSize: 12, color: "#7f1d1d", lineHeight: 1.45 }}>• {p}</div>)}
              </div>
            )}
            <div style={{ margin: "12px 22px 0", fontSize: 12, color: "#64748b", display: "flex", gap: 7 }}>
              <i className="fas fa-shield-halved" style={{ marginTop: 2, color: "#94a3b8" }} />
              Se já existir um card desta OS no financeiro, não cria outro.
            </div>
            <div style={{ display: "flex", gap: 10, padding: "18px 22px 20px" }}>
              <button type="button" onClick={onFechar} style={{ flex: 1, height: 42, borderRadius: 10, border: "1px solid #cbd5e1", background: "#fefefe", color: "#334155", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Cancelar</button>
              <button type="button" onClick={enviar} style={{ flex: 1.4, height: 42, borderRadius: 10, border: "none", background: cor, color: "#fefefe", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <i className="fas fa-paper-plane" /> {forcado ? "Criar card assim mesmo" : "Enviar agora"}
              </button>
            </div>
          </>
        )}

        {(fase === "ok" || fase === "erro") && (
          <div style={{ padding: "26px 24px 20px", textAlign: "center" }}>
            <span style={{ width: 52, height: 52, borderRadius: 26, margin: "0 auto 12px", background: fase === "ok" ? "#ecfdf5" : "#fffbeb", color: fase === "ok" ? "#047857" : "#b45309", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>
              <i className={`fas ${fase === "ok" ? "fa-check" : "fa-circle-info"}`} />
            </span>
            <div style={{ fontSize: 17, fontWeight: 800 }}>{fase === "ok" ? "Card criado no financeiro" : "O card não foi criado"}</div>
            <div style={{ fontSize: 13, color: "#475569", marginTop: 8, lineHeight: 1.5, textAlign: "left", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 12px", whiteSpace: "pre-wrap" }}>{msg}</div>
            <button type="button" onClick={onFechar} style={{ width: "100%", height: 42, marginTop: 16, borderRadius: 10, border: "none", background: "#0f172a", color: "#fefefe", fontWeight: 800, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>Fechar</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
