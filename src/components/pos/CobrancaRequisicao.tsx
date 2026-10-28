"use client";
// Cobrança das requisições ao cliente (José, 26/10/2026): selo "A cobrar" / "Cobrada · R$ X" /
// "Não cobrada" com o motivo à vista, e as ações "Não cobrar" (motivo obrigatório), "Reabrir" e
// "Preencher valor cobrado". Usado na tela de Requisições, na aba Requisições da OS e nos
// Lembretes do POS. Grava SEMPRE pela rota POST /api/pos/requisicoes/cobranca (só Pós-Vendas/admin).

import { useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { parseValorMisto } from "@/lib/marketing/custos";
import { statusCobranca as regraStatus } from "@/lib/pos/cobranca-requisicoes-regras";

export type StatusCobranca = "a_cobrar" | "cobrada" | "nao_cobrada";

/** Campos da requisição que a cobrança usa (todos opcionais: vem de telas diferentes). */
export interface ReqCobranca {
  id: number | string;
  status?: string | null;
  tipo?: string | null;
  ReqTipo?: string | null;
  ordem_servico?: string | number | null;
  valor_cobrado_cliente?: string | number | null;
  cobranca_status?: string | null;
  cobranca_motivo?: string | null;
  cobranca_por?: string | null;
  cobranca_em?: string | null;
  setor?: string | null;
}

// Regra única nas regras puras do servidor (src/lib/pos/cobranca-requisicoes-regras.ts) (José, 26/10/2026)
const paraRegra = (req: ReqCobranca) => ({
  ...req,
  tipo: req.tipo ?? req.ReqTipo ?? null,
  ordem_servico: req.ordem_servico == null || req.ordem_servico === "" ? null : String(req.ordem_servico),
});

/** Situação da cobrança (cai em "a_cobrar" quando a requisição não se aplica — use temCobranca antes). */
export function statusCobranca(req: ReqCobranca): StatusCobranca {
  return regraStatus(paraRegra(req)) || "a_cobrar";
}

/** A requisição entra no controle de cobrança (cobrável, ou já cobrada / marcada "não cobrada")? */
export function temCobranca(req: ReqCobranca): boolean {
  return regraStatus(paraRegra(req)) !== null;
}

export const COR_COBRANCA: Record<StatusCobranca, string> = {
  a_cobrar: "#EA580C",
  cobrada: "#16A34A",
  nao_cobrada: "#64748B",
};

const valorNum = (v: unknown) => parseValorMisto(v) || 0;
export const brl = (v: unknown) => valorNum(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (s?: string | null) => {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
};

/** Chama a rota de cobrança; devolve null se deu certo ou a mensagem de erro. */
export async function gravarCobranca(
  requisicao_id: number | string,
  acao: "nao_cobrada" | "cobrada" | "reabrir",
  extra: { motivo?: string; valor?: number } = {},
): Promise<string | null> {
  try {
    const res = await fetch("/api/pos/requisicoes/cobranca", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ requisicao_id: Number(requisicao_id) || requisicao_id, acao, ...extra }),
    });
    if (res.ok) return null;
    const j = await res.json().catch(() => ({}));
    if (res.status === 503) return "Falta rodar o SQL da cobrança de requisições no banco. Avise o Dev.";
    return j.erro || j.error || `Não consegui gravar (erro ${res.status}).`;
  } catch {
    return "Sem conexão com o servidor. Tente de novo.";
  }
}

// ── Selo ─────────────────────────────────────────────────────────────

export function SeloCobranca({ req, compacto = false }: { req: ReqCobranca; compacto?: boolean }) {
  const st = statusCobranca(req);
  const cor = COR_COBRANCA[st];
  const texto = st === "cobrada"
    ? `Cobrada · ${brl(valorNum(req.valor_cobrado_cliente))}`
    : st === "nao_cobrada" ? "Não cobrada" : "A cobrar";
  const icone = st === "cobrada" ? "fa-circle-check" : st === "nao_cobrada" ? "fa-ban" : "fa-hand-holding-dollar";
  const motivo = st === "nao_cobrada" ? linhaMotivo(req) : "";
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <span title={motivo || (st === "a_cobrar" ? "Ainda sem valor cobrado do cliente" : undefined)}
        style={{ display: "inline-flex", alignItems: "center", gap: 6, alignSelf: "flex-start", padding: compacto ? "2px 8px" : "3px 10px",
          borderRadius: 999, fontSize: compacto ? 11.5 : 12.5, fontWeight: 500, whiteSpace: "nowrap", color: cor,
          background: `color-mix(in srgb, ${cor} 10%, var(--surface, #fefefe))`, border: `1px solid color-mix(in srgb, ${cor} 25%, transparent)` }}>
        <i className={`fa-solid ${icone}`} style={{ fontSize: compacto ? 10 : 11 }} /> {texto}
      </span>
      {motivo && !compacto && <span style={{ fontSize: 12, color: "#475569", lineHeight: 1.35 }}>{motivo}</span>}
    </span>
  );
}

export function linhaMotivo(req: ReqCobranca): string {
  const partes = [req.cobranca_por, dataBR(req.cobranca_em)].filter(Boolean).join(", ");
  return `Não cobrada: ${req.cobranca_motivo || "sem motivo"}${partes ? ` — ${partes}` : ""}`;
}

// ── Quadro (motivo / valor) ──────────────────────────────────────────

export function QuadroCobranca({ req, modo, onFechar, onFeito }: {
  req: ReqCobranca;
  modo: "nao_cobrada" | "cobrada";
  onFechar: () => void;
  /** chamado depois que gravou; recebe os campos novos para a tela atualizar na hora */
  onFeito: (campos: Partial<ReqCobranca>) => void;
}) {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const valor = valorNum(texto);
  const valido = modo === "nao_cobrada" ? texto.trim().length >= 5 : valor > 0;

  const salvar = async () => {
    if (!valido || salvando) return;
    setSalvando(true); setErro("");
    const e = modo === "nao_cobrada"
      ? await gravarCobranca(req.id, "nao_cobrada", { motivo: texto.trim() })
      : await gravarCobranca(req.id, "cobrada", { valor });
    setSalvando(false);
    if (e) { setErro(e); return; }
    onFeito(modo === "nao_cobrada"
      ? { cobranca_status: "nao_cobrada", cobranca_motivo: texto.trim(), cobranca_em: new Date().toISOString() }
      : { cobranca_status: "cobrada", valor_cobrado_cliente: String(valor) });
    onFechar();
  };

  const cor = modo === "nao_cobrada" ? COR_COBRANCA.nao_cobrada : COR_COBRANCA.cobrada;
  return (
    <div onClick={(e) => { e.stopPropagation(); onFechar(); }}
      style={{ position: "fixed", inset: 0, zIndex: 90000, background: "rgba(15,23,42,.5)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true"
        style={{ width: "min(440px, 100%)", background: "var(--surface, #fefefe)", border: "1px solid var(--border, #e2e8f0)", borderRadius: 16, padding: "18px 20px", boxShadow: "0 24px 60px -24px rgba(15,23,42,.6)", color: "#0f172a", fontWeight: 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, display: "grid", placeItems: "center", color: cor, background: `color-mix(in srgb, ${cor} 9%, var(--surface, #fefefe))`, border: `1px solid color-mix(in srgb, ${cor} 18%, transparent)` }}>
            <i className={`fa-solid ${modo === "nao_cobrada" ? "fa-ban" : "fa-hand-holding-dollar"}`} />
          </span>
          <div style={{ fontSize: 16, fontWeight: 500 }}>
            {modo === "nao_cobrada" ? `Não cobrar a requisição #${req.id}` : `Valor cobrado da requisição #${req.id}`}
          </div>
        </div>
        {modo === "nao_cobrada" ? (
          <>
            <label style={{ fontSize: 13, color: "#475569" }}>Por que não vai cobrar do cliente? (obrigatório)</label>
            <textarea autoFocus rows={3} value={texto} onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: cortesia combinada com o cliente, peça em garantia, erro nosso…"
              style={{ width: "100%", marginTop: 6, marginBottom: 0, borderRadius: 10, fontSize: 14 }} />
            {texto.trim().length > 0 && texto.trim().length < 5 && <div style={{ fontSize: 12, color: "#b45309", marginTop: 4 }}>Escreva pelo menos 5 letras.</div>}
          </>
        ) : (
          <>
            <label style={{ fontSize: 13, color: "#475569" }}>Quanto foi cobrado do cliente?</label>
            <input autoFocus inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") salvar(); }}
              placeholder="R$ 0,00" style={{ width: "100%", marginTop: 6, marginBottom: 0, borderRadius: 10, fontSize: 15 }} />
            {valor > 0 && <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>{brl(valor)}</div>}
          </>
        )}
        {erro && <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 10, fontSize: 13, color: "#b91c1c", background: "color-mix(in srgb, #dc2626 8%, var(--surface, #fefefe))" }}>{erro}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button type="button" onClick={onFechar} style={btnContorno}>Cancelar</button>
          <button type="button" onClick={salvar} disabled={!valido || salvando}
            style={{ ...btnCheio(cor), opacity: !valido || salvando ? 0.55 : 1 }}>
            {salvando ? "Gravando…" : modo === "nao_cobrada" ? "Não cobrar" : "Gravar valor"}
          </button>
        </div>
      </div>
    </div>
  );
}

export const btnContorno: React.CSSProperties = {
  height: 34, padding: "0 13px", borderRadius: 10, border: "1px solid var(--border, #e2e8f0)", background: "var(--surface, #fefefe)",
  color: "#0f172a", fontSize: 13, fontWeight: 400, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6,
};
export const btnCheio = (cor: string): React.CSSProperties => ({
  height: 34, padding: "0 14px", borderRadius: 10, border: "none", background: cor, color: "#fefefe",
  fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 6,
});

// ── Ações (Não cobrar / Reabrir / Preencher valor) ───────────────────

export function AcoesCobranca({ req, onMudou, comValor = false, pequeno = false }: {
  req: ReqCobranca;
  onMudou?: (campos: Partial<ReqCobranca>) => void;
  /** mostra "Preencher valor cobrado" (OS e lembretes; no cartão da requisição o campo já existe) */
  comValor?: boolean;
  pequeno?: boolean;
}) {
  const [quadro, setQuadro] = useState<null | "nao_cobrada" | "cobrada">(null);
  const [reabrindo, setReabrindo] = useState(false);
  const st = statusCobranca(req);
  const estilo: React.CSSProperties = pequeno ? { ...btnContorno, height: 28, fontSize: 12, padding: "0 10px" } : btnContorno;

  const reabrir = async () => {
    if (!confirm(`Reabrir a cobrança da requisição #${req.id}? Ela volta para "A cobrar".`)) return;
    setReabrindo(true);
    const e = await gravarCobranca(req.id, "reabrir");
    setReabrindo(false);
    if (e) { alert(e); return; }
    onMudou?.({ cobranca_status: "a_cobrar", cobranca_motivo: null, cobranca_por: null, cobranca_em: null });
  };

  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
      {st === "a_cobrar" && comValor && (
        <button type="button" style={{ ...estilo, color: COR_COBRANCA.cobrada }} onClick={() => setQuadro("cobrada")}>
          <i className="fa-solid fa-hand-holding-dollar" /> Preencher valor cobrado
        </button>
      )}
      {st === "a_cobrar" && (
        <button type="button" style={{ ...estilo, color: "#475569" }} onClick={() => setQuadro("nao_cobrada")}>
          <i className="fa-solid fa-ban" /> Não cobrar
        </button>
      )}
      {st === "nao_cobrada" && (
        <button type="button" style={{ ...estilo, color: COR_COBRANCA.a_cobrar }} onClick={reabrir} disabled={reabrindo}>
          <i className="fa-solid fa-rotate-left" /> {reabrindo ? "Reabrindo…" : "Reabrir"}
        </button>
      )}
      {quadro && <QuadroCobranca req={req} modo={quadro} onFechar={() => setQuadro(null)} onFeito={(c) => onMudou?.(c)} />}
    </span>
  );
}

/** Bloco completo: selo + motivo + ações. Só aparece se a requisição deve ser cobrada. */
export default function CobrancaRequisicao({ req, onMudou, comValor = false }: {
  req: ReqCobranca;
  onMudou?: (campos: Partial<ReqCobranca>) => void;
  comValor?: boolean;
}) {
  // guarda o que acabou de gravar até o realtime/recarga trazer a linha nova
  const [local, setLocal] = useState<Partial<ReqCobranca>>({});
  const atual = { ...req, ...local };
  if (!temCobranca(atual)) return null;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
      padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border, #e2e8f0)", background: "var(--surface, #fefefe)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: "#475569" }}>Cobrança do cliente</span>
        <SeloCobranca req={atual} />
      </div>
      <AcoesCobranca req={atual} comValor={comValor} onMudou={(c) => { setLocal((p) => ({ ...p, ...c })); onMudou?.(c); }} />
    </div>
  );
}

/** Aviso do topo da aba Requisições da OS: "2 requisições ainda sem valor cobrado". */
export function AvisoCobrancaOS({ qtd }: { qtd: number }) {
  if (qtd <= 0) return null;
  const cor = COR_COBRANCA.a_cobrar;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, marginBottom: 12,
      background: `color-mix(in srgb, ${cor} 8%, var(--surface, #fefefe))`, border: `1px solid color-mix(in srgb, ${cor} 22%, transparent)`, color: "#0f172a", fontSize: 13.5 }}>
      <i className="fa-solid fa-hand-holding-dollar" style={{ color: cor }} />
      <span>{qtd === 1 ? "1 requisição ainda sem valor cobrado do cliente." : `${qtd} requisições ainda sem valor cobrado do cliente.`} Preencha o valor ou marque &quot;Não cobrar&quot; com o motivo.</span>
    </div>
  );
}
