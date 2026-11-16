"use client";
// Sino de lembretes no topo da OS (José, 26/10/2026): junta os lembretes do CLIENTE (que o OSDrawer
// já carrega) com os ligados a ESTA OS (?id_ordem=), destaca os de cobrança de requisição e usa o
// mesmo cartão do drawer de Lembretes (concluir com nota, adiar, editar, responsável, cobrança).
// 16/11/2026 (José: "deixa uma opção para adicionar o lembrete ali na hora para o cliente"): o sino
// aparece mesmo sem lembrete e tem "Novo lembrete" — grava no cliente da OS, já ligado a esta OS.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { authHeaders } from "@/lib/auth/client";
import { CartaoLembrete, ehCobranca, situacaoData, useUsuariosPortal, type Lembrete } from "./lembretes-comum";

export interface ClienteDoLembrete { chave: string; nome: string; cnpj: string }

export default function LembretesDaOS({ osId, userName, lembretesCliente, onLembretesCliente, cliente }: {
  osId: string | null;
  userName: string;
  /** lembretes do cliente carregados pelo OSDrawer */
  lembretesCliente: Array<{ id: number; lembrete: string }>;
  onLembretesCliente: (lista: Array<{ id: number; lembrete: string }>) => void;
  /** cliente da OS — para criar lembrete novo */
  cliente?: ClienteDoLembrete;
}) {
  const [daOS, setDaOS] = useState<Lembrete[]>([]);
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState(false);
  const [texto, setTexto] = useState("");
  const [quando, setQuando] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const campo = useRef<HTMLTextAreaElement>(null);
  const usuarios = useUsuariosPortal();

  const carregarDaOS = useCallback(async () => {
    if (!osId) { setDaOS([]); return; }
    try {
      const res = await fetch(`/api/pos/lembretes?id_ordem=${encodeURIComponent(osId)}`, { headers: await authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setDaOS(data as Lembrete[]);
    } catch { /* sem rede: fica só com os do cliente */ }
  }, [osId]);
  useEffect(() => { carregarDaOS(); }, [carregarDaOS]);
  useEffect(() => { if (novo) campo.current?.focus(); }, [novo]);

  // Os dois juntos, sem repetir; só os abertos. Cobrança e atrasados primeiro.
  const lista = useMemo(() => {
    const mapa = new Map<number, Lembrete>();
    for (const l of [...(lembretesCliente as unknown as Lembrete[]), ...daOS]) mapa.set(l.id, { ...mapa.get(l.id), ...l });
    const peso = (l: Lembrete) => (ehCobranca(l) ? 0 : 2) + (situacaoData(l) === "atrasado" || situacaoData(l) === "hoje" ? 0 : 1);
    return [...mapa.values()].filter((l) => !l.concluido && l.ativo !== false).sort((a, b) => peso(a) - peso(b));
  }, [lembretesCliente, daOS]);

  const podeCriar = !!cliente?.nome;
  if (lista.length === 0 && !podeCriar) return null;
  const temCobranca = lista.some(ehCobranca);
  const vazio = lista.length === 0;
  const cor = vazio ? "#64748b" : temCobranca ? "#EA580C" : "#B45309";

  const alterado = (id: number, novoL: Lembrete | null) => {
    const sai = !novoL || novoL.concluido;
    const troca = <T extends { id: number }>(arr: T[]) => sai ? arr.filter((x) => x.id !== id) : arr.map((x) => x.id === id ? { ...x, ...novoL } : x);
    setDaOS((p) => troca(p));
    onLembretesCliente(troca(lembretesCliente as unknown as Lembrete[]) as unknown as Array<{ id: number; lembrete: string }>);
  };

  const fecharNovo = () => { setNovo(false); setTexto(""); setQuando(""); setErro(""); };
  const criar = async () => {
    if (!cliente || !texto.trim()) { setErro("Escreva o lembrete."); return; }
    setSalvando(true); setErro("");
    try {
      const res = await fetch("/api/pos/lembretes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          // sem a chave do cadastro (OS antiga), grava pelo nome: a OS busca os lembretes pelo nome do cliente
          cliente_chaves: [cliente.chave || `NOME:${cliente.nome}`],
          cliente_nomes: cliente.nome,
          cliente_cnpj_cpf: cliente.cnpj,
          lembrete: texto.trim(),
          criado_por: userName || "Sistema",
          tipo: "manual",
          ...(osId ? { id_ordem: osId } : {}),
          ...(quando ? { lembrar_em: quando } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.id) { setErro(data?.erro || "Não consegui salvar o lembrete."); return; }
      setDaOS((p) => [data as Lembrete, ...p]);
      fecharNovo();
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  };

  const hoje = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const atalhos: [string, number][] = [["Amanhã", 1], ["Em 7 dias", 7], ["Em 30 dias", 30]];

  return (
    <div style={{ position: "relative" }}>
      <button type="button" onClick={() => setAberto((o) => !o)}
        title={vazio ? "Lembretes do cliente — nenhum ainda. Clique para criar" : temCobranca ? "Lembretes do cliente e da OS (tem cobrança de requisição)" : "Lembretes do cliente e da OS"}
        style={{ position: "relative", width: 38, height: 38, borderRadius: 10, border: vazio ? "1px solid var(--border, #e2e8f0)" : `1px solid color-mix(in srgb, ${cor} 45%, transparent)`,
          background: vazio ? "var(--surface, #fefefe)" : `color-mix(in srgb, ${cor} 9%, var(--surface, #fefefe))`, color: cor, cursor: "pointer", fontSize: 15 }}>
        <i className={`fa-solid ${temCobranca ? "fa-hand-holding-dollar" : "fa-bell"}`} />
        {!vazio && (
          <span style={{ position: "absolute", top: -6, right: -6, minWidth: 17, height: 17, borderRadius: 9, background: cor, color: "#fefefe", fontSize: 10, fontWeight: 500,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{lista.length}</span>
        )}
      </button>
      {aberto && (
        <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 300, width: "min(480px, 88vw)", maxHeight: "min(560px, 75vh)", overflowY: "auto",
          background: "var(--portal-bg-secondary, #f6f8f9)", border: "1px solid var(--border)", borderRadius: 16, boxShadow: "0 16px 40px rgba(0,0,0,.22)", padding: 10,
          display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "2px 4px 4px", fontSize: 13, color: "#475569" }}>
            <span style={{ flex: 1 }}>Lembretes do cliente e desta OS</span>
            {podeCriar && !novo && (
              <button type="button" onClick={() => setNovo(true)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 30, padding: "0 12px", borderRadius: 8, border: "1px solid color-mix(in srgb, #0369A1 30%, transparent)",
                  background: "color-mix(in srgb, #0369A1 8%, var(--surface, #fefefe))", color: "#0369A1", fontSize: 12.5, fontFamily: "inherit", cursor: "pointer" }}>
                <i className="fa-solid fa-plus" style={{ fontSize: 11 }} /> Novo lembrete
              </button>
            )}
            <button type="button" onClick={() => { setAberto(false); fecharNovo(); }} title="Fechar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#64748b", fontSize: 14, padding: "4px 6px" }}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>

          {novo && cliente && (
            <div style={{ background: "var(--surface, #fefefe)", border: "1px solid color-mix(in srgb, #0369A1 30%, var(--border, #e2e8f0))", borderRadius: 14, padding: 12, display: "grid", gap: 10 }}>
              <div style={{ fontSize: 13, color: "var(--portal-text-secondary, #475569)" }}>
                Para <span style={{ color: "var(--portal-text, #0f172a)", fontWeight: 500 }}>{cliente.nome}</span>
                {osId && <span style={{ color: "var(--portal-text-muted, #94a3b8)" }}> · ligado à {osId}</span>}
              </div>
              <textarea ref={campo} value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder="Ex.: cobrar R$ 150 da requisição 5512 na próxima OS"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void criar(); } if (e.key === "Escape") fecharNovo(); }}
                style={{ width: "100%", resize: "vertical", minHeight: 70, padding: "9px 11px", borderRadius: 10, border: "1px solid var(--border, #e2e8f0)", fontFamily: "inherit", fontSize: 14,
                  color: "var(--portal-text, #0f172a)", background: "var(--surface, #fefefe)", boxSizing: "border-box", margin: 0 }} />
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12.5, color: "var(--portal-text-muted, #64748b)", marginRight: 2 }}>Lembrar em</span>
                {atalhos.map(([rot, dias]) => {
                  const d = new Date(hoje); d.setDate(d.getDate() + dias);
                  const v = iso(d); const on = quando === v;
                  return (
                    <button key={rot} type="button" onClick={() => setQuando(on ? "" : v)}
                      style={{ height: 28, padding: "0 10px", borderRadius: 999, fontSize: 12.5, fontFamily: "inherit", cursor: "pointer",
                        border: on ? "1px solid #0369A1" : "1px solid var(--border, #e2e8f0)", background: on ? "color-mix(in srgb, #0369A1 10%, var(--surface, #fefefe))" : "var(--surface, #fefefe)",
                        color: on ? "#0369A1" : "var(--portal-text-secondary, #475569)" }}>{rot}</button>
                  );
                })}
                <input type="date" value={quando} min={iso(hoje)} onChange={(e) => setQuando(e.target.value)} title="Escolher a data (opcional)"
                  style={{ height: 28, padding: "0 8px", borderRadius: 8, border: "1px solid var(--border, #e2e8f0)", fontFamily: "inherit", fontSize: 12.5, color: "var(--portal-text-secondary, #475569)", background: "var(--surface, #fefefe)", margin: 0, width: "auto" }} />
              </div>
              {erro && <div style={{ fontSize: 12.5, color: "#dc2626" }}>{erro}</div>}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button type="button" onClick={fecharNovo} disabled={salvando}
                  style={{ height: 34, padding: "0 14px", borderRadius: 9, border: "1px solid var(--border, #e2e8f0)", background: "var(--surface, #fefefe)", color: "var(--portal-text-secondary, #475569)", fontFamily: "inherit", fontSize: 13, cursor: "pointer" }}>
                  Cancelar
                </button>
                <button type="button" onClick={() => void criar()} disabled={salvando || !texto.trim()}
                  style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 16px", borderRadius: 9, border: "none",
                    background: texto.trim() ? "#0369A1" : "#94a3b8", color: "#fefefe", fontFamily: "inherit", fontSize: 13, cursor: salvando ? "wait" : texto.trim() ? "pointer" : "not-allowed" }}>
                  <i className={`fa-solid ${salvando ? "fa-spinner fa-spin" : "fa-check"}`} style={{ fontSize: 12 }} /> {salvando ? "Salvando…" : "Salvar lembrete"}
                </button>
              </div>
            </div>
          )}

          {lista.map((l) => (
            <CartaoLembrete key={l.id} l={l} userName={userName} usuarios={usuarios} osAtual={osId}
              onAlterado={(n) => alterado(l.id, n)} />
          ))}
          {vazio && !novo && (
            <div style={{ padding: "18px 10px", textAlign: "center", fontSize: 13, color: "var(--portal-text-muted, #94a3b8)" }}>
              Nenhum lembrete para este cliente.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
