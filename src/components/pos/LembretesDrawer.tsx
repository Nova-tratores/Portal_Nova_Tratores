"use client";
// Lembretes do POS refeitos (José, 26/10/2026): abas Abertos · Cobrança · Para hoje/atrasados ·
// Concluídos, busca por cliente/OS/requisição, e cada lembrete com concluir (nota), adiar, editar,
// responsável e apagar (só manuais). Os de cobrança de requisição vêm do robô e resolvem a cobrança
// pela rota /api/pos/requisicoes/cobranca. Cartão comum em ./lembretes-comum.

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ClienteOption } from "@/lib/pos/types";
import { authHeaders } from "@/lib/auth/client";
import {
  CartaoLembrete, CamposValorLembrete, ehCobranca, hojeISO, situacaoData, useUsuariosPortal, type Lembrete,
} from "./lembretes-comum";
import { btnCheio, btnContorno } from "./CobrancaRequisicao";

interface LembretesDrawerProps {
  visible: boolean;
  clientes: ClienteOption[];
  userName: string;
  onClose: () => void;
  /** abre a OS no POS sem sair da tela (se não vier, o link abre /pos?id=) */
  onAbrirOS?: (id: string) => void;
}

type Aba = "abertos" | "cobranca" | "hoje" | "concluidos";
const ABAS: { k: Aba; t: string; ic: string; cor: string }[] = [
  { k: "abertos", t: "Abertos", ic: "fa-bell", cor: "#B45309" },
  { k: "cobranca", t: "Cobrança", ic: "fa-hand-holding-dollar", cor: "#EA580C" },
  { k: "hoje", t: "Para hoje e atrasados", ic: "fa-calendar-day", cor: "#DC2626" },
  { k: "concluidos", t: "Concluídos", ic: "fa-check", cor: "#16A34A" },
];

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function LembretesDrawer({ visible, clientes, userName, onClose, onAbrirOS }: LembretesDrawerProps) {
  const [lembretes, setLembretes] = useState<Lembrete[]>([]);
  const [loading, setLoading] = useState(false);
  const [erroLista, setErroLista] = useState("");
  const [aba, setAba] = useState<Aba>("abertos");
  const [busca, setBusca] = useState("");
  const [soMeus, setSoMeus] = useState(false);
  const [criando, setCriando] = useState(false);
  const usuarios = useUsuariosPortal();

  // formulário de novo lembrete
  const [clienteFilter, setClienteFilter] = useState("");
  const [selectedClientes, setSelectedClientes] = useState<ClienteOption[]>([]);
  const [textoLembrete, setTextoLembrete] = useState("");
  const [osNova, setOsNova] = useState("");
  const [dataNova, setDataNova] = useState("");
  const [respNovo, setRespNovo] = useState("");
  const [valTipoNovo, setValTipoNovo] = useState<"" | "cobrar" | "credito">("");
  const [valNovo, setValNovo] = useState("");
  const [saving, setSaving] = useState(false);
  const [erroNovo, setErroNovo] = useState("");

  const fetchLembretes = useCallback(async () => {
    setLoading(true); setErroLista("");
    try {
      const res = await fetch("/api/pos/lembretes?todos=1", { headers: await authHeaders() });
      const data = await res.json().catch(() => null);
      if (!res.ok) setErroLista((data && (data.erro || data.error)) || "Não consegui carregar os lembretes.");
      else if (Array.isArray(data)) setLembretes(data);
    } catch {
      setErroLista("Sem conexão com o servidor.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    fetchLembretes();
    setCriando(false); setBusca(""); setErroNovo("");
  }, [visible, fetchLembretes]);

  const hoje = hojeISO();
  const abertos = useMemo(() => lembretes.filter((l) => !l.concluido && l.ativo !== false), [lembretes]);
  const porAba = useMemo<Record<Aba, Lembrete[]>>(() => ({
    abertos,
    cobranca: abertos.filter(ehCobranca),
    hoje: abertos.filter((l) => { const s = situacaoData(l, hoje); return s === "hoje" || s === "atrasado"; }),
    concluidos: lembretes.filter((l) => l.concluido),
  }), [abertos, lembretes, hoje]);

  const lista = useMemo(() => {
    const termos = semAcento(busca).split(/\s+/).filter(Boolean);
    const filtrada = porAba[aba].filter((l) => {
      if (soMeus && l.responsavel !== userName) return false;
      if (!termos.length) return true;
      const alvo = semAcento([l.cliente_nomes, l.cliente_cnpj_cpf, l.id_ordem, l.requisicao_id ? `req ${l.requisicao_id} #${l.requisicao_id}` : "", l.lembrete, l.responsavel, l.criado_por].filter(Boolean).join(" "));
      return termos.every((t) => alvo.includes(t));
    });
    if (aba === "concluidos") return filtrada.sort((a, b) => String(b.concluido_em || "").localeCompare(String(a.concluido_em || "")));
    // abertos: data de lembrar mais cedo primeiro, sem data depois; empate = mais novo primeiro
    return filtrada.sort((a, b) => {
      const da = a.lembrar_em || "9999", db = b.lembrar_em || "9999";
      return da !== db ? da.localeCompare(db) : String(b.created_at).localeCompare(String(a.created_at));
    });
  }, [porAba, aba, busca, soMeus, userName]);

  const alterado = (id: number, novo: Lembrete | null) =>
    setLembretes((prev) => novo ? prev.map((l) => l.id === id ? novo : l) : prev.filter((l) => l.id !== id));

  // ── novo lembrete ──
  const selectedKeys = useMemo(() => new Set(selectedClientes.map((c) => c.chave)), [selectedClientes]);
  const filteredClientes = useMemo(() => {
    if (!clienteFilter) return [];
    const terms = semAcento(clienteFilter).split(/\s+/).filter(Boolean);
    return clientes.filter((c) => { const d = semAcento(c.display); return terms.every((t) => d.includes(t)); }).slice(0, 30);
  }, [clienteFilter, clientes]);
  const toggleCliente = (c: ClienteOption) =>
    setSelectedClientes((prev) => prev.some((s) => s.chave === c.chave) ? prev.filter((s) => s.chave !== c.chave) : [...prev, c]);

  const criarLembrete = async () => {
    if (!selectedClientes.length || !textoLembrete.trim()) { setErroNovo("Escolha ao menos um cliente e escreva o lembrete."); return; }
    setSaving(true); setErroNovo("");
    try {
      const cnpjs = selectedClientes
        .map((c) => { const m = c.display.match(/\[([^\]]+)\]/); return m ? m[1].replace(/\D/g, "") : ""; })
        .filter(Boolean).join(",");
      const res = await fetch("/api/pos/lembretes", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({
          cliente_chaves: selectedClientes.map((c) => c.chave),
          cliente_nomes: selectedClientes.map((c) => c.display.split("[")[0].trim()).join(", "),
          cliente_cnpj_cpf: cnpjs,
          lembrete: textoLembrete,
          criado_por: userName || "Sistema",
          tipo: "manual",
          origem: "usuario",
          id_ordem: osNova.trim() || null,
          lembrar_em: dataNova || null,
          responsavel: respNovo || null,
          ...(valTipoNovo && Number(valNovo) > 0 ? { valor: Number(valNovo), valor_tipo: valTipoNovo } : {}),
        }),
      });
      if (res.ok) {
        setSelectedClientes([]); setTextoLembrete(""); setOsNova(""); setDataNova(""); setRespNovo(""); setClienteFilter(""); setValTipoNovo(""); setValNovo("");
        setCriando(false);
        fetchLembretes();
      } else {
        const err = await res.json().catch(() => ({}));
        setErroNovo(err.erro || err.error || "Não consegui criar o lembrete.");
      }
    } catch {
      setErroNovo("Sem conexão com o servidor.");
    }
    setSaving(false);
  };

  if (!visible) return null;

  const rot: React.CSSProperties = { fontSize: 13, color: "#475569", fontWeight: 400, textTransform: "none", letterSpacing: 0 };
  const campo: React.CSSProperties = { marginBottom: 0, borderRadius: 10, fontSize: 13.5 };

  return (
    <div className="drawer-overlay active">
      <div className="modal-container">
        <div className="drawer os-drawer">
          <div className="os-header">
            <div className="os-header-left">
              <span className="os-header-title" style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>
                <i className="fa-solid fa-bell" style={{ marginRight: 8, color: "#B45309" }} />
                Lembretes de clientes
              </span>
            </div>
            <div className="os-header-actions">
              <button className="os-btn-close" onClick={onClose} title="Fechar"><i className="fa-solid fa-xmark" /></button>
            </div>
          </div>

          <div className="os-body" style={{ display: "flex", flexDirection: "column", gap: 12, color: "#0f172a", fontWeight: 400 }}>
            {/* busca + novo */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
                <i className="fa-solid fa-magnifying-glass" style={{ position: "absolute", left: 12, top: 11, color: "#94a3b8", fontSize: 13 }} />
                <input type="text" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por cliente, CNPJ, OS, requisição ou texto"
                  style={{ ...campo, paddingLeft: 34, height: 36, width: "100%" }} />
              </div>
              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "#475569", margin: 0, cursor: "pointer" }}>
                <input type="checkbox" checked={soMeus} onChange={(e) => setSoMeus(e.target.checked)} style={{ width: "auto", margin: 0 }} /> Só os meus
              </label>
              <button type="button" onClick={() => setCriando((v) => !v)} style={criando ? btnContorno : btnCheio("#B45309")}>
                <i className={`fa-solid ${criando ? "fa-xmark" : "fa-plus"}`} /> {criando ? "Fechar" : "Novo lembrete"}
              </button>
            </div>

            {/* novo lembrete */}
            {criando && (
              <div style={{ background: "var(--surface, #fefefe)", border: "1px solid var(--border, #e2e8f0)", borderRadius: 16, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 16, fontWeight: 500 }}>Novo lembrete</div>
                <div>
                  <label style={rot}>Clientes</label>
                  <input type="text" value={clienteFilter} onChange={(e) => setClienteFilter(e.target.value)} placeholder="Buscar por nome, razão social ou CNPJ/CPF"
                    style={{ ...campo, width: "100%", marginTop: 4 }} autoFocus />
                  {clienteFilter && (
                    <div style={{ marginTop: 6, maxHeight: 200, overflowY: "auto", border: "1px solid var(--border, #e2e8f0)", borderRadius: 12 }}>
                      {filteredClientes.length === 0 ? (
                        <div style={{ padding: 12, textAlign: "center", color: "#64748b", fontSize: 13 }}>Nenhum cliente encontrado</div>
                      ) : filteredClientes.map((c) => {
                        const marcado = selectedKeys.has(c.chave);
                        return (
                          <label key={c.chave} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", margin: 0, cursor: "pointer", borderTop: "1px solid var(--border, #e2e8f0)",
                            background: marcado ? "color-mix(in srgb, #B45309 7%, var(--surface, #fefefe))" : undefined }}>
                            <input type="checkbox" checked={marcado} onChange={() => toggleCliente(c)} style={{ width: "auto", margin: 0 }} />
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 13.5 }}>{c.display.split("[")[0].trim()}</span>
                              <span style={{ display: "block", fontSize: 11.5, color: "#64748b" }}>{c.display.includes("[") ? c.display.substring(c.display.indexOf("[")) : ""}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {selectedClientes.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {selectedClientes.map((c) => (
                        <span key={c.chave} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 10px", borderRadius: 999, fontSize: 12.5,
                          background: "color-mix(in srgb, #B45309 9%, var(--surface, #fefefe))", color: "#92400e" }}>
                          {c.display.split("[")[0].trim()}
                          <button type="button" onClick={() => toggleCliente(c)} title="Tirar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#92400e", padding: 2 }}>
                            <i className="fa-solid fa-xmark" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label style={rot}>Lembrete</label>
                  <textarea rows={3} value={textoLembrete} onChange={(e) => setTextoLembrete(e.target.value)}
                    placeholder="Ex.: cliente pediu desconto especial, conferir contrato…" style={{ ...campo, width: "100%", marginTop: 4 }} />
                </div>
                <div>
                  <label style={rot}>Valor (opcional)</label>
                  <div style={{ marginTop: 4 }}>
                    <CamposValorLembrete tipo={valTipoNovo} valor={valNovo} onTipo={setValTipoNovo} onValor={setValNovo} />
                  </div>
                  {valTipoNovo && (
                    <div style={{ fontSize: 12.5, color: "#64748b", marginTop: 6 }}>
                      {valTipoNovo === "cobrar"
                        ? "Na próxima OS do cliente, o Portal pergunta se inclui esse valor como serviço Diversos."
                        : "Na próxima OS do cliente, o Portal pergunta se aplica esse crédito como desconto."}
                    </div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(170px, 100%), 1fr))", gap: 10 }}>
                  <div>
                    <label style={rot}>OS (opcional)</label>
                    <input type="text" value={osNova} onChange={(e) => setOsNova(e.target.value)} placeholder="Nº da OS" style={{ ...campo, width: "100%", marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={rot}>Lembrar em (opcional)</label>
                    <input type="date" value={dataNova} onChange={(e) => setDataNova(e.target.value)} style={{ ...campo, width: "100%", marginTop: 4 }} />
                  </div>
                  <div>
                    <label style={rot}>Responsável (opcional)</label>
                    <select value={respNovo} onChange={(e) => setRespNovo(e.target.value)} style={{ ...campo, width: "100%", marginTop: 4 }}>
                      <option value="">Ninguém</option>
                      {usuarios.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                {erroNovo && <div style={{ padding: "7px 10px", borderRadius: 10, fontSize: 13, color: "#b91c1c", background: "color-mix(in srgb, #dc2626 8%, var(--surface, #fefefe))" }}>{erroNovo}</div>}
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" onClick={criarLembrete} disabled={saving || !selectedClientes.length || !textoLembrete.trim() || (!!valTipoNovo && !(Number(valNovo) > 0))}
                    style={{ ...btnCheio("#B45309"), opacity: saving || !selectedClientes.length || !textoLembrete.trim() ? 0.55 : 1 }}>
                    {saving ? "Salvando…" : "Criar lembrete"}
                  </button>
                </div>
              </div>
            )}

            {/* abas: cada uma com a sua cor, mesmo sem estar escolhida */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ABAS.map((a) => {
                const ativa = aba === a.k;
                const n = porAba[a.k].length;
                return (
                  <button key={a.k} type="button" onClick={() => setAba(a.k)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 38, padding: "0 12px", borderRadius: 11, cursor: "pointer", fontFamily: "inherit",
                      fontSize: 13.5, fontWeight: ativa ? 500 : 400, color: "#0f172a",
                      border: `1px solid ${ativa ? `color-mix(in srgb, ${a.cor} 40%, transparent)` : "var(--border, #e2e8f0)"}`,
                      background: ativa ? `color-mix(in srgb, ${a.cor} 9%, var(--surface, #fefefe))` : "var(--surface, #fefefe)" }}>
                    <span style={{ width: 24, height: 24, borderRadius: 7, display: "grid", placeItems: "center", fontSize: 11,
                      color: ativa ? "#fefefe" : a.cor, background: ativa ? a.cor : `color-mix(in srgb, ${a.cor} 11%, var(--surface, #fefefe))` }}>
                      <i className={`fa-solid ${a.ic}`} />
                    </span>
                    {a.t}
                    <span style={{ minWidth: 22, padding: "0 7px", borderRadius: 999, fontSize: 12, textAlign: "center",
                      color: ativa ? "#fefefe" : a.cor, background: ativa ? a.cor : `color-mix(in srgb, ${a.cor} 12%, var(--surface, #fefefe))` }}>{n}</span>
                  </button>
                );
              })}
            </div>

            {erroLista && <div style={{ padding: "8px 12px", borderRadius: 12, fontSize: 13, color: "#b91c1c", background: "color-mix(in srgb, #dc2626 8%, var(--surface, #fefefe))" }}>{erroLista}</div>}

            {/* lista */}
            {loading && lembretes.length === 0 ? (
              <div style={{ textAlign: "center", padding: 24, color: "#64748b" }}>Carregando…</div>
            ) : lista.length === 0 ? (
              <div style={{ textAlign: "center", padding: "26px 12px", border: "1px dashed var(--border, #e2e8f0)", borderRadius: 14, color: "#64748b", fontSize: 13.5 }}>
                {busca || soMeus ? "Nenhum lembrete com esse filtro."
                  : aba === "cobranca" ? "Nenhuma cobrança de requisição pendente."
                  : aba === "hoje" ? "Nada para hoje nem atrasado."
                  : aba === "concluidos" ? "Nenhum lembrete concluído." : "Nenhum lembrete aberto."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {lista.map((l) => (
                  <CartaoLembrete key={l.id} l={l} userName={userName} usuarios={usuarios}
                    onAlterado={(novo) => alterado(l.id, novo)}
                    onAbrirOS={onAbrirOS ? (id) => { onClose(); onAbrirOS(id); } : undefined} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
