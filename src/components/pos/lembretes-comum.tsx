"use client";
// Lembretes do POS — peças comuns ao drawer de Lembretes e ao sino da OS (José, 26/10/2026).
// Um cartão por lembrete com: cliente, OS (abre no POS), requisição, quem criou ("Robô de cobrança"),
// data de lembrar, responsável e as ações concluir (nota), adiar, editar, atribuir e apagar.
// Lembrete de cobrança de requisição oferece "Preencher valor cobrado" e "Não cobrar com motivo".

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { supabase } from "@/lib/supabase";
import { QuadroCobranca, btnContorno, btnCheio, brl, type ReqCobranca } from "./CobrancaRequisicao";

export interface Lembrete {
  id: number;
  cliente_chaves: string[];
  cliente_nomes: string;
  cliente_cnpj_cpf: string;
  lembrete: string;
  ativo: boolean;
  concluido: boolean;
  concluido_em: string | null;
  concluido_por: string | null;
  criado_por: string;
  created_at: string;
  // colunas novas (SQL da cobrança de requisições, 26/10/2026)
  id_ordem?: string | null;
  requisicao_id?: number | string | null;
  tipo?: "manual" | "cobranca_requisicao" | string | null;
  lembrar_em?: string | null;
  responsavel?: string | null;
  origem?: "usuario" | "robo" | string | null;
  concluido_em_ordem?: string | null;
  conclusao_nota?: string | null;
  // valor a cobrar / crédito do cliente: oferecido ao abrir a próxima OS (José, 27/10/2026)
  valor?: number | string | null;
  valor_tipo?: "cobrar" | "credito" | string | null;
}

const brlL = (n: number) => (Number(n) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Campos "valor" do lembrete: nada / cliente deve / cliente tem crédito + R$ */
export function CamposValorLembrete({ tipo, valor, onTipo, onValor }: {
  tipo: "" | "cobrar" | "credito"; valor: string;
  onTipo: (t: "" | "cobrar" | "credito") => void; onValor: (v: string) => void;
}) {
  const opcoes: { k: "" | "cobrar" | "credito"; t: string; cor: string }[] = [
    { k: "", t: "Sem valor", cor: "#64748b" },
    { k: "cobrar", t: "Cliente deve (cobrar)", cor: "#EA580C" },
    { k: "credito", t: "Cliente tem crédito", cor: "#0d9488" },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {opcoes.map((o) => {
        const ativo = tipo === o.k;
        return (
          <button key={o.k || "nada"} type="button" onClick={() => onTipo(o.k)}
            style={{ height: 32, padding: "0 12px", borderRadius: 10, fontSize: 13, fontFamily: "inherit", cursor: "pointer", fontWeight: 400,
              color: ativo ? "#fefefe" : o.cor, background: ativo ? o.cor : "var(--surface, #fefefe)",
              border: `1px solid ${ativo ? o.cor : `color-mix(in srgb, ${o.cor} 30%, transparent)`}` }}>{o.t}</button>
        );
      })}
      {tipo && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 32, padding: "0 10px", borderRadius: 10, border: "1px solid var(--border, #e2e8f0)", background: "var(--surface, #fefefe)" }}>
          <span style={{ fontSize: 12.5, color: "#64748b" }}>R$</span>
          <input type="number" min={0} step={0.01} value={valor} onChange={(e) => onValor(e.target.value)} placeholder="0,00"
            style={{ width: 110, border: "none", outline: "none", background: "transparent", margin: 0, padding: 0, height: 28, fontSize: 13.5 }} />
        </span>
      )}
    </div>
  );
}

export const COR_LEMBRETE = "#B45309";
export const COR_COBR = "#EA580C";

export const ehCobranca = (l: Lembrete) => l.tipo === "cobranca_requisicao";
export const ehRobo = (l: Lembrete) => l.origem === "robo";
export const podeApagar = (l: Lembrete) => !ehCobranca(l) && !ehRobo(l);

/** Hoje em YYYY-MM-DD no fuso local. */
export function hojeISO(base = new Date()): string {
  const d = new Date(base.getTime() - base.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}
export function somarDias(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return hojeISO(d);
}
const dataCurta = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

/** "para hoje" / "atrasado" / "futuro" / null (sem data) */
export function situacaoData(l: Lembrete, hoje = hojeISO()): "atrasado" | "hoje" | "futuro" | null {
  if (!l.lembrar_em) return null;
  const d = l.lembrar_em.slice(0, 10);
  return d < hoje ? "atrasado" : d === hoje ? "hoje" : "futuro";
}

/** PATCH no lembrete; devolve a linha nova ou lança Error com a mensagem do servidor. */
export async function patchLembrete(id: number, corpo: Record<string, unknown>): Promise<Lembrete | null> {
  const res = await fetch(`/api/pos/lembretes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(corpo),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(res.status === 503 ? "Falta rodar o SQL dos lembretes no banco. Avise o Dev." : j.erro || j.error || `Não consegui gravar (erro ${res.status}).`) as Error & { cobranca?: boolean };
    // 409 do robô: a requisição ainda está "a cobrar" — resolva a cobrança em vez de concluir
    if (res.status === 409 && j.cobranca) e.cobranca = true;
    throw e;
  }
  return j && typeof j === "object" && "id" in j ? (j as Lembrete) : null;
}

export async function apagarLembrete(id: number): Promise<void> {
  const res = await fetch(`/api/pos/lembretes/${id}`, { method: "DELETE", headers: await authHeaders() });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.erro || j.error || `Não consegui apagar (erro ${res.status}).`);
  }
}

// Usuários do portal para "responsável" — lidos uma vez por página
let cacheUsuarios: string[] | null = null;
export function useUsuariosPortal(): string[] {
  const [lista, setLista] = useState<string[]>(cacheUsuarios || []);
  useEffect(() => {
    if (cacheUsuarios) return;
    let vivo = true;
    supabase.from("financeiro_usu").select("nome, ativo").order("nome").then(({ data }) => {
      const nomes = ((data || []) as { nome?: string; ativo?: boolean | null }[])
        .filter((u) => u.nome && u.ativo !== false).map((u) => String(u.nome));
      cacheUsuarios = [...new Set(nomes)];
      if (vivo) setLista(cacheUsuarios);
    });
    return () => { vivo = false; };
  }, []);
  return lista;
}

const chip = (cor: string): React.CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 5, padding: "2px 9px", borderRadius: 999, fontSize: 12, fontWeight: 400,
  color: cor, background: `color-mix(in srgb, ${cor} 9%, var(--surface, #fefefe))`, border: `1px solid color-mix(in srgb, ${cor} 20%, transparent)`,
  textDecoration: "none", whiteSpace: "nowrap", cursor: "default",
});
const btnP: React.CSSProperties = { ...btnContorno, height: 30, fontSize: 12.5, padding: "0 10px" };

// "JOAO DA SILVA, JOAO DA SILVA, MARIA X" → "Joao da Silva" +1: sem repetidos e sem caixa alta
const MINUSC = new Set(["de", "da", "das", "do", "dos", "e"]);
const SIGLAS = new Set(["ltda", "me", "epp", "eireli", "sa", "s/a", "cia"]);
function capitalizar(t: string): string {
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().split(/\s+/).map((w, i) =>
    SIGLAS.has(w) ? w.toUpperCase() : i > 0 && MINUSC.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
export function nomesCliente(bruto?: string | null): { principal: string; outros: number; todos: string[] } {
  const vistos = new Set<string>();
  const todos: string[] = [];
  for (const n of String(bruto || "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const k = n.toLowerCase().replace(/\s+/g, " ");
    if (vistos.has(k)) continue;
    vistos.add(k); todos.push(capitalizar(n));
  }
  return { principal: todos[0] || "", outros: Math.max(0, todos.length - 1), todos };
}

type Painel = null | "concluir" | "adiar" | "editar" | "resp";

export function CartaoLembrete({ l, userName, usuarios, onAlterado, onAbrirOS, osAtual }: {
  l: Lembrete;
  userName: string;
  usuarios: string[];
  /** linha nova, ou null quando foi apagado */
  onAlterado: (novo: Lembrete | null) => void;
  onAbrirOS?: (id: string) => void;
  /** OS aberta agora (no sino da OS): "concluir" registra que foi resolvido nela */
  osAtual?: string | null;
}) {
  const [painel, setPainel] = useState<Painel>(null);
  const [nota, setNota] = useState("");
  const [texto, setTexto] = useState(l.lembrete);
  const [data, setData] = useState(l.lembrar_em?.slice(0, 10) || "");
  const [resp, setResp] = useState(l.responsavel || "");
  const [valTipo, setValTipo] = useState<"" | "cobrar" | "credito">(l.valor_tipo === "cobrar" || l.valor_tipo === "credito" ? l.valor_tipo : "");
  const [valNum, setValNum] = useState(Number(l.valor) > 0 ? String(l.valor) : "");
  const [naOS, setNaOS] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [quadro, setQuadro] = useState<null | "cobrada" | "nao_cobrada">(null);
  const [precisaCobrar, setPrecisaCobrar] = useState(false);

  const cobr = ehCobranca(l);
  const cor = cobr ? COR_COBR : COR_LEMBRETE;
  const sit = situacaoData(l);
  const os = l.id_ordem ? String(l.id_ordem) : "";

  const rodar = async (corpo: Record<string, unknown>, otimista: Partial<Lembrete>) => {
    setOcupado(true); setErro("");
    try {
      const novo = await patchLembrete(l.id, corpo);
      onAlterado(novo ? { ...l, ...otimista, ...novo } : { ...l, ...otimista });
      setPainel(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui gravar.");
      // requisição ainda a cobrar: deixa o painel de concluir aberto, com as ações de cobrança à vista
      if ((e as { cobranca?: boolean }).cobranca) { setPrecisaCobrar(true); setPainel("concluir"); }
    }
    setOcupado(false);
  };

  const concluir = (notaFinal = nota.trim()) => {
    const ordem = osAtual && naOS ? String(osAtual) : null;
    return rodar(
      { concluido: true, concluido_por: userName || "Sistema", conclusao_nota: notaFinal || null, concluido_em_ordem: ordem },
      { concluido: true, concluido_em: new Date().toISOString(), concluido_por: userName, conclusao_nota: notaFinal || null, concluido_em_ordem: ordem },
    );
  };
  const reabrir = () => rodar({ reabrir: true, concluido: false }, { concluido: false, concluido_em: null, concluido_por: null, conclusao_nota: null, concluido_em_ordem: null });
  const adiar = (iso: string | null) => rodar({ lembrar_em: iso }, { lembrar_em: iso });
  const apagar = async () => {
    if (!confirm("Apagar este lembrete? Não dá para desfazer.")) return;
    setOcupado(true); setErro("");
    try { await apagarLembrete(l.id); onAlterado(null); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não consegui apagar."); }
    setOcupado(false);
  };

  const reqCobr: ReqCobranca | null = l.requisicao_id ? { id: l.requisicao_id } : null;

  const nomes = nomesCliente(l.cliente_nomes);
  const btnIc = (c = "#475569"): React.CSSProperties => ({ ...btnP, width: 30, padding: 0, justifyContent: "center", color: c });
  const alternar = (p: Painel) => setPainel(painel === p ? null : p);

  return (
    <div style={{ background: "var(--surface, #fefefe)", border: "1px solid var(--border, #e2e8f0)", borderRadius: 14, padding: "11px 14px",
      display: "flex", flexDirection: "column", gap: 8, opacity: l.concluido ? 0.8 : 1, color: "#0f172a", fontWeight: 400 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, display: "grid", placeItems: "center", fontSize: 13, color: cor,
          background: `color-mix(in srgb, ${cor} 9%, var(--surface, #fefefe))`, border: `1px solid color-mix(in srgb, ${cor} 18%, transparent)` }}>
          <i className={`fa-solid ${cobr ? "fa-hand-holding-dollar" : l.concluido ? "fa-check" : "fa-bell"}`} />
        </span>

        {/* cliente + selos, texto e quem criou */}
        <div style={{ minWidth: 0, flex: "1 1 320px", display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", minWidth: 0 }}>
            <span style={{ fontSize: 14.5, fontWeight: 500, minWidth: 0, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              title={nomes.todos.join(", ")}>{nomes.principal || "Sem cliente"}</span>
            {nomes.outros > 0 && <span style={chip("#64748b")} title={nomes.todos.slice(1).join(", ")}>+{nomes.outros}</span>}
            {cobr && <span style={chip(COR_COBR)}>Cobrança</span>}
            {os && (os === String(osAtual || "")
              ? <span style={chip("#2563EB")}><i className="fa-solid fa-file-lines" /> Esta OS</span>
              : <a href={`/pos?id=${encodeURIComponent(os)}`} onClick={(e) => { if (onAbrirOS) { e.preventDefault(); onAbrirOS(os); } }}
                  style={{ ...chip("#2563EB"), cursor: "pointer" }} title="Abrir a OS no POS"><i className="fa-solid fa-file-lines" /> OS {os}</a>)}
            {l.requisicao_id && (
              <a href={`/requisicoes?req=${l.requisicao_id}`} target="_blank" rel="noreferrer" style={{ ...chip("#0F766E"), cursor: "pointer" }} title="Abrir a requisição">
                <i className="fa-solid fa-cart-shopping" /> Req #{l.requisicao_id}
              </a>
            )}
            {l.lembrar_em && !l.concluido && (
              <span style={chip(sit === "atrasado" ? "#DC2626" : sit === "hoje" ? "#D97706" : "#475569")} title="Lembrar em">
                <i className="fa-regular fa-calendar" /> {sit === "hoje" ? "Para hoje" : sit === "atrasado" ? `Atrasado · ${dataCurta(l.lembrar_em)}` : dataCurta(l.lembrar_em)}
              </span>
            )}
            {l.responsavel && <span style={chip("#7C3AED")} title="Responsável"><i className="fa-solid fa-user" /> {l.responsavel}</span>}
            {Number(l.valor) > 0 && (l.valor_tipo === "cobrar" || l.valor_tipo === "credito") && (
              <span style={chip(l.valor_tipo === "credito" ? "#0d9488" : "#EA580C")}
                title={l.valor_tipo === "credito" ? "Crédito do cliente: vira desconto na próxima OS" : "Valor a cobrar: entra como Diversos na próxima OS"}>
                <i className={`fa-solid ${l.valor_tipo === "credito" ? "fa-piggy-bank" : "fa-hand-holding-dollar"}`} />
                {l.valor_tipo === "credito" ? "Crédito" : "A cobrar"} {brlL(Number(l.valor))}
              </span>
            )}
          </div>

          {painel === "editar" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} style={{ width: "100%", marginBottom: 0, borderRadius: 10, fontSize: 13.5 }} />
              {!cobr && <CamposValorLembrete tipo={valTipo} valor={valNum} onTipo={setValTipo} onValor={setValNum} />}
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <button type="button" style={btnP} onClick={() => { setPainel(null); setTexto(l.lembrete); }}>Cancelar</button>
                <button type="button" style={{ ...btnCheio("#2563EB"), height: 30, fontSize: 12.5 }} disabled={ocupado || !texto.trim() || (!!valTipo && !(Number(valNum) > 0))}
                  onClick={() => {
                    const v = valTipo && Number(valNum) > 0 ? Math.round(Number(valNum) * 100) / 100 : 0;
                    const corpo = cobr ? { lembrete: texto.trim() } : { lembrete: texto.trim(), valor: v, valor_tipo: v > 0 ? valTipo : null };
                    rodar(corpo, { lembrete: texto.trim(), ...(cobr ? {} : { valor: v || null, valor_tipo: v > 0 ? valTipo : null }) });
                  }}>Salvar</button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13.5, lineHeight: 1.45, color: "#334155", whiteSpace: "pre-wrap", textDecoration: l.concluido ? "line-through" : "none" }}>{l.lembrete}</div>
          )}

          <div style={{ fontSize: 12, color: "#64748b" }}>
            {ehRobo(l) ? "Robô de cobrança" : l.criado_por ? `Por ${l.criado_por}` : ""}
            {l.created_at ? ` · ${dataCurta(l.created_at)}` : ""}
            {l.concluido && (
              <span style={{ color: "#15803d" }}>
                {" · "}Concluído{l.concluido_por ? ` por ${l.concluido_por}` : ""}{l.concluido_em ? ` em ${dataCurta(l.concluido_em)}` : ""}
                {l.concluido_em_ordem ? ` · na OS ${l.concluido_em_ordem}` : ""}
                {l.conclusao_nota ? ` · ${l.conclusao_nota}` : ""}
              </span>
            )}
          </div>
        </div>

        {/* ações: Concluir com nome, o resto só ícone */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: "auto", alignItems: "center" }}>
          {l.concluido ? (
            <button type="button" style={btnP} disabled={ocupado} onClick={reabrir}><i className="fa-solid fa-rotate-left" /> Reabrir</button>
          ) : (<>
            <button type="button" style={{ ...btnP, color: "#16A34A" }} onClick={() => alternar("concluir")}><i className="fa-solid fa-check" /> Concluir</button>
            <button type="button" style={btnIc()} onClick={() => alternar("adiar")} title="Adiar"><i className="fa-regular fa-clock" /></button>
            <button type="button" style={btnIc()} onClick={() => { setTexto(l.lembrete); alternar("editar"); }} title="Editar"><i className="fa-solid fa-pen" /></button>
            <button type="button" style={btnIc()} onClick={() => alternar("resp")} title="Responsável"><i className="fa-solid fa-user-tag" /></button>
          </>)}
          {podeApagar(l) && (
            <button type="button" style={btnIc("#DC2626")} disabled={ocupado} onClick={apagar} title="Apagar lembrete"><i className="fa-solid fa-trash" /></button>
          )}
        </div>
      </div>

      {/* painéis das ações */}
      {painel === "concluir" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 10, borderRadius: 12, background: "var(--portal-bg-secondary, #f6f8f9)" }}>
          {(cobr || precisaCobrar) && reqCobr && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" style={{ ...btnP, color: "#16A34A" }} onClick={() => setQuadro("cobrada")}><i className="fa-solid fa-hand-holding-dollar" /> Preencher valor cobrado</button>
              <button type="button" style={{ ...btnP, color: "#475569" }} onClick={() => setQuadro("nao_cobrada")}><i className="fa-solid fa-ban" /> Não cobrar com motivo</button>
            </div>
          )}
          <textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota de conclusão (opcional): o que foi feito"
            style={{ width: "100%", marginBottom: 0, borderRadius: 10, fontSize: 13 }} />
          {osAtual && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#475569", margin: 0 }}>
              <input type="checkbox" checked={naOS} onChange={(e) => setNaOS(e.target.checked)} style={{ width: "auto", margin: 0 }} /> Resolvido na OS {osAtual}
            </label>
          )}
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button type="button" style={btnP} onClick={() => setPainel(null)}>Cancelar</button>
            <button type="button" style={{ ...btnCheio("#16A34A"), height: 30, fontSize: 12.5 }} disabled={ocupado} onClick={() => concluir()}>
              {ocupado ? "Gravando…" : "Concluir"}
            </button>
          </div>
        </div>
      )}
      {painel === "adiar" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: 10, borderRadius: 12, background: "var(--portal-bg-secondary, #f6f8f9)" }}>
          <button type="button" style={btnP} disabled={ocupado} onClick={() => adiar(somarDias(hojeISO(), 1))}>Amanhã</button>
          <button type="button" style={btnP} disabled={ocupado} onClick={() => adiar(somarDias(hojeISO(), 7))}>Daqui a 1 semana</button>
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} style={{ width: "auto", height: 30, marginBottom: 0, borderRadius: 10, fontSize: 12.5 }} />
          <button type="button" style={{ ...btnCheio("#2563EB"), height: 30, fontSize: 12.5 }} disabled={ocupado || !data} onClick={() => adiar(data)}>Usar esta data</button>
          {l.lembrar_em && <button type="button" style={btnP} disabled={ocupado} onClick={() => adiar(null)}>Tirar a data</button>}
        </div>
      )}
      {painel === "resp" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", padding: 10, borderRadius: 12, background: "var(--portal-bg-secondary, #f6f8f9)" }}>
          <select value={resp} onChange={(e) => setResp(e.target.value)} style={{ width: "auto", minWidth: 180, height: 30, marginBottom: 0, borderRadius: 10, fontSize: 12.5 }}>
            <option value="">Sem responsável</option>
            {userName && !usuarios.includes(userName) && <option value={userName}>{userName}</option>}
            {usuarios.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
          <button type="button" style={{ ...btnCheio("#7C3AED"), height: 30, fontSize: 12.5 }} disabled={ocupado}
            onClick={() => rodar({ responsavel: resp || null }, { responsavel: resp || null })}>Atribuir</button>
        </div>
      )}

      {erro && <div style={{ padding: "7px 10px", borderRadius: 10, fontSize: 12.5, color: "#b91c1c", background: "color-mix(in srgb, #dc2626 8%, var(--surface, #fefefe))" }}>{erro}</div>}

      {quadro && reqCobr && (
        <QuadroCobranca req={reqCobr} modo={quadro} onFechar={() => setQuadro(null)}
          onFeito={(c) => {
            // cobrança resolvida → o lembrete de cobrança é concluído junto, com a nota do que foi feito
            const n = quadro === "cobrada"
              ? `Valor cobrado: ${brl(c.valor_cobrado_cliente)}`
              : `Não cobrada: ${c.cobranca_motivo || ""}`;
            // a rota de cobrança já conclui os lembretes da requisição; aqui só grava a nota (e a OS)
            const notaFinal = [n, nota.trim()].filter(Boolean).join(" · ");
            const ordem = osAtual && naOS ? String(osAtual) : null;
            patchLembrete(l.id, { concluido: true, concluido_por: userName || "Sistema", conclusao_nota: notaFinal, concluido_em_ordem: ordem })
              .then((novo) => onAlterado({ ...l, ...(novo || {}), concluido: true, conclusao_nota: novo?.conclusao_nota || notaFinal }))
              .catch(() => onAlterado({ ...l, concluido: true, concluido_em: new Date().toISOString(), concluido_por: userName, conclusao_nota: notaFinal }));
          }} />
      )}
    </div>
  );
}
