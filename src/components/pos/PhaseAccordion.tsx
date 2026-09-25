"use client";

import { useState, useMemo, memo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { PHASES } from "@/lib/pos/constants";
import { diasEntre } from "@/lib/pos/utils";
import type { KanbanCard } from "@/lib/pos/types";
import { STATUS_COR, STATUS_LABEL } from "@/lib/garantias/constants";
import { authHeaders } from "@/lib/auth/client";
import { normName } from "@/lib/tecnico-utils";
import type { GarantiaStatus } from "@/lib/garantias/types";

interface PhaseViewProps {
  orders: KanbanCard[];
  searchTerm: string;
  onCardClick: (order: KanbanCard) => void;
  onPhaseChange?: (orderId: string, newPhase: string) => void;
  /** Checkbox de reserva: agenda o serviço (move pra Orçamento Aprovado + Data Início). */
  onAgendar?: (orderId: string, dataISO: string) => void;
  // Envio ao Omie (manual): botão por card e "Enviar todas" no cabeçalho da fase.
  onEnviarOmie?: (orderId: string) => void;
  onEnviarOmieTodas?: () => void;
  enviandoOmie?: string | null; // id da OS em envio, ou "__todas__"
  /** Filtro por técnico — controlado pelo header (fila de perfis com foto). */
  tecnicoFiltro?: string;
}

const FASE_ENVIAR_OMIE = "Enviar Omie";

// Fases SEM cor própria (pedido 21/08): tudo preto no claro — o #111827 é
// remapado pra claro no modo escuro pelas regras do globals.
const PRETO_FASE = "#111827";
export const PHASE_COLORS: Record<string, string> = {
  "Orçamento": PRETO_FASE,
  "Orçamento enviado para o cliente e aguardando": PRETO_FASE,
  "Orçamento Aprovado": PRETO_FASE,
  "Aguardando ordem Técnico": PRETO_FASE,
  "Execução": PRETO_FASE,
  "Execução (Realizando Diagnóstico)": PRETO_FASE,
  "Execução aguardando peças (em transporte)": PRETO_FASE,
  "Relatório Atualizado": PRETO_FASE,
  "Aguardando outros": PRETO_FASE,
  "Executada": PRETO_FASE,
  "Relatório Concluído": PRETO_FASE,
  "Relatório Concluído - Garantia": PRETO_FASE,
  "Enviar Omie": PRETO_FASE,
  "Enviado Para Omie": PRETO_FASE,
  "Cobrando Cliente": PRETO_FASE,
  "Preenchido Garantia": PRETO_FASE,
  "Executada aguardando comercial": PRETO_FASE,
  "Concluída": PRETO_FASE,
  "Cancelada": PRETO_FASE,
};

// Seção virtual do quadro: as ordens na fase "Relatório Concluído" que têm
// garantia são separadas neste grupo próprio (não é um status real do banco).
const FASE_CONCLUIDO = "Relatório Concluído";
const FASE_CONCLUIDO_GAR = "Relatório Concluído - Garantia";

export const PHASE_SHORT: Record<string, string> = {
  "Orçamento": "Orçamento",
  "Orçamento enviado para o cliente e aguardando": "Orç. Enviado",
  "Orçamento Aprovado": "Orç. Aprovado",
  "Aguardando ordem Técnico": "Aguard. Técnico",
  "Execução": "Execução",
  "Execução (Realizando Diagnóstico)": "Diagnóstico",
  "Execução aguardando peças (em transporte)": "Aguard. Peças",
  "Relatório Atualizado": "Rel. Atualizado",
  "Aguardando outros": "Aguard. Outros",
  "Executada": "Executada",
  "Relatório Concluído": "Rel. Concluído",
  "Enviar Omie": "Enviar Omie",
  "Enviado Para Omie": "Enviado Omie",
  "Cobrando Cliente": "Cobrando Cliente",
  "Preenchido Garantia": "Preench. Garantia",
  "Executada aguardando comercial": "Aguard. Comercial",
  "Concluída": "Concluída",
  "Cancelada": "Cancelada",
};

// Ícones "acesos" da capa do card em PRETO (pedido 21/08; o #111827 vira
// claro no modo escuro pelas regras do globals)
const S_ICON_COLOR = { color: "#111827" } as const;

function formatDateBR(dateStr: string): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

const FASE_APROVADO = "Orçamento Aprovado";
const FASES_RESERVA = new Set(["Orçamento", "Orçamento enviado para o cliente e aguardando", FASE_APROVADO]);
const FASE_COBRANDO = "Cobrando Cliente";

// ── Painel de COBRANÇA do card (fase "Cobrando Cliente"): mostra pra quem vai
// (contatos do NovaZap vinculados ao CNPJ — escolhe se tiver mais de um), o
// valor OS+PV somado do Omie e a mensagem-modelo; o botão dispara o Tratorilson.
function PainelCobranca({ osId, onPhaseChange }: { osId: string; onPhaseChange?: (orderId: string, newPhase: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [dados, setDados] = useState<any>(null);
  const [erro, setErro] = useState("");
  const [contatoSel, setContatoSel] = useState<number>(0);
  const [enviando, setEnviando] = useState(false);
  const [enviada, setEnviada] = useState(false);

  // Depois de enviada, a capa fica em "Aguardando cliente responder" (o status
  // sai do log da OS — sobrevive a recarregar a página) + botão pra Concluída.
  const [statusEnvio, setStatusEnvio] = useState<{ enviada: boolean; quando?: string; para?: string | null; respostas?: { texto: string; quando: string }[] } | null>(null);
  const [confirmaConcluir, setConfirmaConcluir] = useState(false);
  const [atualizandoStatus, setAtualizandoStatus] = useState(false);
  const carregarStatus = useCallback(async () => {
    setAtualizandoStatus(true);
    try {
      const r = await fetch(`/api/pos/ordens/${osId}/cobrar?status=1`, { headers: await authHeaders(), cache: "no-store" });
      const j = await r.json();
      if (r.ok) setStatusEnvio(j);
    } catch { /* capa segue sem status */ }
    setAtualizandoStatus(false);
  }, [osId]);
  useEffect(() => { carregarStatus(); }, [carregarStatus]);
  const concluir = () => {
    if (!confirmaConcluir) {
      setConfirmaConcluir(true);
      setTimeout(() => setConfirmaConcluir(false), 4000);
      return;
    }
    onPhaseChange?.(osId, "Concluída");
  };

  const abrir = async () => {
    setAberto(true);
    if (dados || carregando) return;
    setCarregando(true); setErro("");
    try {
      const r = await fetch(`/api/pos/ordens/${osId}/cobrar`, { headers: await authHeaders(), cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setDados(j);
      setContatoSel(j.contatos?.[0]?.id || 0);
    } catch (e) { setErro(e instanceof Error ? e.message : "falha ao carregar"); }
    setCarregando(false);
  };

  const enviar = async () => {
    if (!contatoSel || enviando) return;
    setEnviando(true); setErro("");
    try {
      const r = await fetch(`/api/pos/ordens/${osId}/cobrar`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ contatoId: contatoSel, preferencia: prefFat.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setEnviada(true);
      const ag = new Date(Date.now() - 3 * 3600 * 1000);
      setStatusEnvio({ enviada: true, quando: `${ag.toISOString().slice(8, 10)}/${ag.toISOString().slice(5, 7)} ${ag.toISOString().slice(11, 16)}`, para: dados?.contatos?.find((c: any) => c.id === contatoSel)?.nome || null });
    } catch (e) { setErro(e instanceof Error ? e.message : "falha ao enviar"); }
    setEnviando(false);
  };

  const contato = dados?.contatos?.find((c: any) => c.id === contatoSel);
  const din = (n: number) => n?.toLocaleString("pt-BR", { minimumFractionDigits: 2 });

  // Preferência de faturamento (vem do chatwoot; preencher aqui SALVA lá).
  // Com ela preenchida, depois dos PDFs o Tratorilson pergunta
  // "Posso fechar para {preferência}?".
  const [prefFat, setPrefFat] = useState("");
  const [prefSalva, setPrefSalva] = useState(false);
  useEffect(() => {
    setPrefFat(String(contato?.preferenciaFaturamento || ""));
    setPrefSalva(false);
  }, [contatoSel, dados]); // eslint-disable-line react-hooks/exhaustive-deps
  const salvarPreferencia = async () => {
    const v = prefFat.trim();
    if (!contatoSel || v === String(contato?.preferenciaFaturamento || "")) return;
    try {
      const r = await fetch(`/api/pos/ordens/${osId}/cobrar`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ acao: "preferencia", contatoId: contatoSel, preferencia: v }),
      });
      if (r.ok) {
        setPrefSalva(true);
        setDados((prev: any) => prev && ({ ...prev, contatos: prev.contatos.map((c: any) => c.id === contatoSel ? { ...c, preferenciaFaturamento: v } : c) }));
        setTimeout(() => setPrefSalva(false), 2000);
      }
    } catch { /* silencioso */ }
  };

  // Busca LIVRE de contatos no NovaZap (como no chatwoot) + vincular ao CNPJ
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [buscaTexto, setBuscaTexto] = useState("");
  const [buscaResultados, setBuscaResultados] = useState<any[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [vinculando, setVinculando] = useState<number | null>(null);
  const debounceBusca = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buscarContatos = async (texto?: string) => {
    const q = (texto ?? buscaTexto).trim();
    if (q.length < 2) return;
    setBuscando(true);
    try {
      const r = await fetch(`/api/pos/ordens/${osId}/cobrar?buscar=${encodeURIComponent(q)}`, { headers: await authHeaders(), cache: "no-store" });
      const j = await r.json();
      setBuscaResultados(Array.isArray(j.busca) ? j.busca : []);
      if (j.aviso) setErro(j.aviso);
    } catch { setErro("falha na busca de contatos"); }
    setBuscando(false);
  };
  // busca AO DIGITAR (350ms depois de parar de teclar)
  const aoDigitarBusca = (v: string) => {
    setBuscaTexto(v);
    if (debounceBusca.current) clearTimeout(debounceBusca.current);
    if (v.trim().length < 2) { setBuscaResultados(null); return; }
    debounceBusca.current = setTimeout(() => buscarContatos(v), 350);
  };
  const usarEVincular = async (c: any) => {
    if (vinculando) return;
    setVinculando(c.id); setErro("");
    try {
      const r = await fetch(`/api/pos/ordens/${osId}/cobrar`, {
        method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ acao: "vincular", contatoId: c.id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      // entra na lista, vira o destino e a mensagem ganha o nome dele
      setDados((prev: any) => prev && ({
        ...prev,
        contatos: prev.contatos.some((x: any) => x.id === c.id) ? prev.contatos : [{ id: c.id, nome: c.nome, cargo: c.cargo, telefone: c.telefone }, ...prev.contatos],
        avisoContatos: null,
      }));
      setContatoSel(c.id);
      setBuscaAberta(false); setBuscaResultados(null); setBuscaTexto("");
    } catch (e) { setErro(e instanceof Error ? e.message : "falha ao vincular"); }
    setVinculando(null);
  };

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 8 }}>
      {!aberto ? (
        statusEnvio?.enviada ? (() => {
          // Cobrança JÁ enviada: a capa vira o acompanhamento — aguardando (âmbar)
          // ou, se o cliente já mandou mensagem, o que ele respondeu (verde, em
          // balões estilo WhatsApp) + botão pra concluir.
          const resp = statusEnvio.respostas?.length ? statusEnvio.respostas : null;
          const corTexto = resp ? "#166534" : "#92400E";
          return (
            <div style={{ border: `1.5px solid ${resp ? "#4ADE80" : "#FBBF24"}`, background: resp ? "rgba(74,222,128,0.12)" : "rgba(251,191,36,0.12)", borderRadius: 11, padding: "9px 11px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, fontWeight: 800, color: corTexto, fontSize: 12 }}>
                  <i className={resp ? "fas fa-comment-dots" : "fas fa-hourglass-half"} style={{ marginRight: 5 }} />
                  {resp ? "Cliente respondeu!" : "Aguardando cliente responder"}
                </span>
                <button onClick={carregarStatus} title="Conferir agora se o cliente respondeu"
                  style={{ border: "none", background: "transparent", color: corTexto, cursor: "pointer", fontSize: 11, padding: 2 }}>
                  <i className={atualizandoStatus ? "fas fa-spinner fa-spin" : "fas fa-sync-alt"} />
                </button>
              </div>
              <div style={{ fontSize: 10.5, color: corTexto, opacity: 0.75, marginTop: 2 }}>
                Enviada{statusEnvio.quando ? ` ${statusEnvio.quando}` : ""}{statusEnvio.para ? ` pra ${statusEnvio.para}` : ""}
              </div>
              {resp && (
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 7 }}>
                  {resp.map((m, i) => (
                    <div key={i} style={{ background: "var(--surface, #fefefe)", border: "1px solid rgba(22,101,52,0.25)", borderRadius: "10px 10px 10px 3px", padding: "6px 9px", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }}>
                      <div style={{ fontSize: 12, color: "var(--texto, #1F2937)", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 84, overflowY: "auto" }}>{m.texto}</div>
                      <div style={{ fontSize: 9.5, color: "#94A3B8", textAlign: "right", marginTop: 2 }}>{m.quando}</div>
                    </div>
                  ))}
                </div>
              )}
              <button onClick={concluir}
                style={{ width: "100%", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "8px 10px", borderRadius: 9, border: "none", background: confirmaConcluir ? "#B45309" : "linear-gradient(135deg, #16A34A, #15803D)", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", boxShadow: "0 2px 6px rgba(21,128,61,0.35)" }}>
                <i className={confirmaConcluir ? "fas fa-exclamation-circle" : "fas fa-flag-checkered"} />
                {confirmaConcluir ? "Clica de novo pra confirmar" : "Tudo certo — mover pra Concluída"}
              </button>
              <button onClick={abrir}
                style={{ width: "100%", marginTop: 4, border: "none", background: "transparent", color: corTexto, opacity: 0.8, fontSize: 11, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
                cobrar de novo
              </button>
            </div>
          );
        })() : (
        <button onClick={abrir}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 10px", borderRadius: 7, border: "none", background: "#A16207", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          <i className="fas fa-comment-dollar" /> Cobrar cliente (Tratorilson)
        </button>
        )
      ) : (
        <div style={{ border: "1px solid var(--border, #E2E8F0)", background: "var(--surface, #fff)", borderRadius: 10, padding: "9px 11px", fontSize: 12 }}>
          {carregando && <div style={{ color: "#64748B", fontWeight: 600 }}><i className="fas fa-spinner fa-spin" /> Buscando contatos e valores no Omie…</div>}
          {erro && <div style={{ color: "#B91C1C", fontWeight: 600, marginBottom: 6 }}>{erro}</div>}
          {dados && (
            <>
              {/* Serviço JÁ COBRADO: avisa aqui dentro também (não só na capa),
                  pra quem está escolhendo/vinculando contato saber que já foi */}
              {statusEnvio?.enviada && !enviada && (
                <div style={{ border: `1px solid ${statusEnvio.respostas?.length ? "#4ADE80" : "#FBBF24"}`, background: statusEnvio.respostas?.length ? "rgba(74,222,128,0.12)" : "rgba(251,191,36,0.12)", borderRadius: 8, padding: "6px 9px", marginBottom: 7 }}>
                  <div style={{ fontWeight: 800, fontSize: 11.5, color: statusEnvio.respostas?.length ? "#166534" : "#92400E" }}>
                    <i className={statusEnvio.respostas?.length ? "fas fa-comment-dots" : "fas fa-exclamation-triangle"} style={{ marginRight: 5 }} />
                    Este serviço JÁ FOI COBRADO{statusEnvio.quando ? ` ${statusEnvio.quando}` : ""}{statusEnvio.para ? ` pra ${statusEnvio.para}` : ""}
                  </div>
                  {statusEnvio.respostas?.length ? (
                    <div style={{ fontSize: 11, color: "#166534", marginTop: 2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      Ele respondeu: “{statusEnvio.respostas[statusEnvio.respostas.length - 1].texto.slice(0, 160)}”
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: "#A16207", marginTop: 2 }}>
                      Ainda sem resposta — enviar de novo manda OUTRA mensagem pro contato escolhido.
                    </div>
                  )}
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600, color: "#475569" }}>
                <span>OS R$ {din(dados.valores?.os)} + PV R$ {din(dados.valores?.pv)}</span>
                <b style={{ color: "#15803D" }}>= R$ {din(dados.valores?.total)}</b>
              </div>
              {dados.avisoContatos && <div style={{ color: "#B45309", marginTop: 5 }}>{dados.avisoContatos}</div>}
              {dados.contatos?.length > 0 && (
                <div style={{ marginTop: 7 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#94A3B8" }}>Vai pra quem (NovaZap):</div>
                  {dados.contatos.length > 1 ? (
                    <select value={contatoSel} onChange={(e) => setContatoSel(Number(e.target.value))}
                      style={{ width: "100%", marginTop: 3, fontSize: 12, padding: "4px 6px", border: "1px solid var(--border, #E2E8F0)", borderRadius: 6 }}>
                      {dados.contatos.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.nome || "Contato"}{c.cargo ? ` · ${c.cargo}` : ""}{c.telefone ? ` · ${c.telefone}` : ""}</option>
                      ))}
                    </select>
                  ) : (
                    <div style={{ fontWeight: 700, color: "#334155", marginTop: 2 }}>
                      {contato?.nome || "Contato"}{contato?.cargo ? ` · ${contato.cargo}` : ""}{contato?.telefone ? ` · ${contato.telefone}` : ""}
                    </div>
                  )}
                </div>
              )}
              <button onClick={() => setBuscaAberta(true)}
                style={{ marginTop: 6, border: "none", background: "transparent", color: "#0369A1", fontSize: 11.5, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                <i className="fas fa-search" style={{ marginRight: 4 }} />Buscar outro contato no NovaZap
              </button>
              {/* Preferência de faturamento: vem do chatwoot; preencher SALVA lá.
                  Preenchida, o Tratorilson pergunta "Posso fechar para X?" após os PDFs. */}
              {contatoSel > 0 && (
                <div style={{ marginTop: 7 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#94A3B8" }}>
                    Preferência de faturamento {prefSalva && <span style={{ color: "#15803D" }}>✔ salva no NovaZap</span>}
                  </div>
                  <input value={prefFat} onChange={(e) => setPrefFat(e.target.value)} onBlur={salvarPreferencia}
                    placeholder="ex.: 30 dias (vazio = não pergunta)"
                    style={{ width: "100%", boxSizing: "border-box", marginTop: 3, fontSize: 12, padding: "5px 8px", border: "1px solid var(--border, #E2E8F0)", borderRadius: 6 }} />
                  {prefFat.trim() && (
                    <div style={{ fontSize: 10.5, color: "#64748B", marginTop: 2 }}>
                      Depois dos PDFs ele pergunta: “Posso fechar para {prefFat.trim()}?”
                    </div>
                  )}
                </div>
              )}
              {dados.mensagem && (
                <div style={{ marginTop: 7, background: "var(--surface-2, #F8FAFC)", border: "1px solid var(--border, #E2E8F0)", borderRadius: 8, padding: "7px 9px", whiteSpace: "pre-wrap", color: "#475569", maxHeight: 110, overflowY: "auto" }}>
                  {dados.mensagem}
                </div>
              )}
              {enviada ? (
                <>
                  <div style={{ marginTop: 7, color: "#15803D", fontWeight: 800, textAlign: "center" }}><i className="fas fa-check-circle" /> Cobrança enviada (mensagem + PDFs)!</div>
                  <button onClick={concluir}
                    style={{ width: "100%", marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 10px", borderRadius: 7, border: "none", background: confirmaConcluir ? "#B45309" : "#15803D", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    <i className={confirmaConcluir ? "fas fa-exclamation-circle" : "fas fa-check-circle"} />
                    {confirmaConcluir ? "Clica de novo pra confirmar" : "Cliente respondeu — mover pra Concluída"}
                  </button>
                </>
              ) : (
                <button onClick={enviar} disabled={enviando || !contatoSel}
                  style={{ width: "100%", marginTop: 7, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "7px 10px", borderRadius: 7, border: "none", background: enviando ? "#94A3B8" : "#15803D", color: "#fff", fontSize: 12, fontWeight: 700, cursor: enviando ? "wait" : "pointer", opacity: contatoSel ? 1 : 0.5 }}>
                  <i className={enviando ? "fas fa-spinner fa-spin" : "fas fa-paper-plane"} />
                  {enviando ? "Enviando mensagem e PDFs…" : statusEnvio?.enviada ? "Enviar cobrança DE NOVO" : "Enviar cobrança agora"}
                </button>
              )}
            </>
          )}
          <button onClick={() => setAberto(false)} style={{ marginTop: 6, width: "100%", border: "none", background: "transparent", color: "#94A3B8", fontSize: 11, cursor: "pointer" }}>fechar</button>
        </div>
      )}

      {/* MODAL central: buscar contato no NovaZap e vincular ao CNPJ.
          PORTAL no body: dentro do card (que tem transform no hover) o
          position:fixed quebrava e a tela piscava. */}
      {buscaAberta && typeof document !== "undefined" && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 100003, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => { setBuscaAberta(false); setBuscaResultados(null); }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--surface, #fff)", border: "1px solid var(--border, #E2E8F0)", borderRadius: 16, width: 480, maxWidth: "94vw", maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 30px 80px rgba(0,0,0,0.45)" }}>
            <div style={{ padding: "13px 18px", borderBottom: "1px solid var(--border, #E2E8F0)", display: "flex", alignItems: "center", gap: 10 }}>
              <i className="fas fa-search" style={{ color: "#0369A1" }} />
              <b style={{ fontSize: 14.5, color: "var(--texto, #0f172a)", flex: 1 }}>Buscar contato no NovaZap</b>
              <button onClick={() => { setBuscaAberta(false); setBuscaResultados(null); }}
                style={{ border: "none", background: "transparent", color: "#94A3B8", cursor: "pointer", fontSize: 17 }}>×</button>
            </div>
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={buscaTexto} onChange={(e) => aoDigitarBusca(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") buscarContatos(); }}
                  placeholder="Nome, telefone ou CLIENTE (traz os contatos vinculados)…" autoFocus
                  style={{ flex: 1, minWidth: 0, fontSize: 13.5, padding: "9px 12px", border: "1px solid var(--border, #CBD5E1)", borderRadius: 9 }} />
                {buscando && <i className="fas fa-spinner fa-spin" style={{ alignSelf: "center", color: "#0369A1" }} />}
              </div>
              <div style={{ fontSize: 11.5, color: "#94A3B8" }}>
                Vai aparecendo conforme você digita. Pesquisar pelo NOME DO CLIENTE também traz os contatos já vinculados a ele. Escolher um contato SALVA o vínculo com o CNPJ — na próxima cobrança ele aparece direto.
              </div>
              {buscaResultados && (
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {buscaResultados.length === 0 && <div style={{ color: "#94A3B8", fontSize: 13, textAlign: "center", padding: 10 }}>Nenhum contato encontrado.</div>}
                  {buscaResultados.map((c: any) => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid var(--border, #E2E8F0)", borderRadius: 10, padding: "9px 12px" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "var(--texto, #1e293b)", fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.nome || "Sem nome"}
                        </div>
                        <div style={{ fontSize: 12, color: "#64748B" }}>
                          {[c.telefone, c.cargo].filter(Boolean).join(" · ") || "sem telefone"}
                        </div>
                        {c.clienteAtual && <div style={{ fontSize: 11, color: "#94A3B8" }}>vinculado a: {c.clienteAtual}</div>}
                      </div>
                      <button onClick={() => usarEVincular(c)} disabled={vinculando === c.id}
                        title="Usa este contato na cobrança e salva o vínculo com o CNPJ"
                        style={{ border: "none", background: "#15803D", color: "#fff", borderRadius: 8, padding: "7px 13px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {vinculando === c.id ? <i className="fas fa-spinner fa-spin" /> : "Usar e vincular"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const MiniCard = memo(function MiniCard({ order: o, color, onClick, onPhaseChange, onAgendar, garantiaStatus, onDescEnter, onDescLeave, onEnviarOmie, enviandoOmie }: { order: KanbanCard; color: string; onClick: () => void; onPhaseChange?: (orderId: string, newPhase: string) => void; onAgendar?: (orderId: string, dataISO: string) => void; garantiaStatus?: GarantiaStatus; onDescEnter?: (rect: DOMRect, texto: string) => void; onDescLeave?: () => void; onEnviarOmie?: (orderId: string) => void; enviandoOmie?: string | null }) {
  const diasFase = diasEntre(o.dataFase);
  // Checkbox "reservado/agendado": marcar pergunta o dia e move pra Orçamento Aprovado
  const [pedindoData, setPedindoData] = useState(false);
  const [dataAgendada, setDataAgendada] = useState(() => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10));
  const temReqInfo = o.reqInfo && o.reqInfo.length > 0;
  const numero = String(o.id || "").replace(/^#?OS-?/i, "");
  // No card só o que vem depois de "Solicitação do cliente:" (o blob todo
  // de Modelo/Chassis/Horímetro continua no tooltip do hover)
  const solicitacao = (() => {
    const m = String(o.servSolicitado || "").match(/Solicita[çc][ãa]o do cliente:\s*([^\n]*)/i);
    const so = (m?.[1] || "").trim();
    return so || String(o.servSolicitado || "").trim();
  })();

  return (
    <div className="mini-card" style={{ position: "relative", overflow: "visible" }} onClick={onClick}
      onMouseEnter={(e) => onDescEnter?.(e.currentTarget.getBoundingClientRect(), o.servSolicitado || "")}
      onMouseLeave={() => onDescLeave?.()}>
      {/* Título no padrão do PPV: número preto em destaque — cliente */}
      <div className="mini-card-titulo">
        <b className="pos-num-preto">{numero}</b>
        <span style={{ fontWeight: 400, color: "#334155" }}> — {o.cliente || "Sem Cliente"}</span>
      </div>
      {(o.servicoInterno || o.projetoCronograma) && (
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {o.servicoInterno && (
            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: "#7C3AED", background: "#F3E8FF", border: "1px solid #DDD6FE", borderRadius: 3, padding: "1px 6px", textTransform: "uppercase" }}>
              <i className="fas fa-tools" style={{ marginRight: 3 }} />Interna
            </span>
          )}
          {o.projetoCronograma && (
            <Link href={`/cronograma/${o.projetoCronograma.id}`} onClick={(e) => e.stopPropagation()}
              title={`Projeto ${o.projetoCronograma.nome}`}
              style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: "#0D9488", background: "#CCFBF1", border: "1px solid #99F6E4", borderRadius: 3, padding: "1px 6px", textTransform: "uppercase", textDecoration: "none" }}>
              <i className="fas fa-diagram-project" style={{ marginRight: 3 }} />Cronograma
            </Link>
          )}
        </div>
      )}
      {onPhaseChange && (
        <div className="mini-card-phase" onClick={(e) => e.stopPropagation()}>
          <select
            value={o.status}
            onChange={(e) => onPhaseChange(o.id, e.target.value)}
            className="mini-card-phase-select"
          >
            {PHASES.map((p) => (
              <option key={p} value={p}>{PHASE_SHORT[p] || p}</option>
            ))}
          </select>
        </div>
      )}
      {/* Cobrança via Tratorilson — só nos cards da fase "Cobrando Cliente" */}
      {o.status === FASE_COBRANDO && <PainelCobranca osId={o.id} onPhaseChange={onPhaseChange} />}
      {/* Reserva/agendamento: marcar → pergunta o dia → Orçamento Aprovado + Data Início */}
      {onAgendar && FASES_RESERVA.has(o.status) && (
        <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 7 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: o.status === FASE_APROVADO ? "#15803D" : "#94a3b8", cursor: "pointer", textTransform: "none", letterSpacing: 0, margin: 0, whiteSpace: "nowrap" }}>
            <input
              type="checkbox"
              checked={o.status === FASE_APROVADO}
              onChange={(e) => {
                if (e.target.checked) setPedindoData(true);
                else { setPedindoData(false); onPhaseChange?.(o.id, "Orçamento enviado para o cliente e aguardando"); }
              }}
              style={{ accentColor: "#15803D" }}
            />
            Reservado
          </label>
          {pedindoData && o.status !== FASE_APROVADO && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 7, padding: "6px 8px" }}>
              <span style={{ fontSize: 11.5, color: "#15803D", fontWeight: 700, whiteSpace: "nowrap" }}>Pra qual dia?</span>
              <input type="date" value={dataAgendada} onChange={(e) => setDataAgendada(e.target.value)}
                style={{ flex: 1, minWidth: 0, fontSize: 12, padding: "3px 6px", border: "1px solid #BBF7D0", borderRadius: 5 }} />
              <button type="button" onClick={() => { if (dataAgendada) { onAgendar(o.id, dataAgendada); setPedindoData(false); } }}
                style={{ border: "none", background: "#15803D", color: "#fff", borderRadius: 5, padding: "4px 10px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>OK</button>
              <button type="button" onClick={() => setPedindoData(false)} title="Cancelar"
                style={{ border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 13, padding: 0 }}>×</button>
            </div>
          )}
        </div>
      )}
      {/* Informações em LISTA (padrão PPV: rótulo à esquerda, valor à direita) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 9 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
          <span style={{ color: "#94a3b8" }}><span className="mini-card-tipo-selo" style={{ marginRight: 6 }}>OS</span>Valor</span>
          <b style={{ color: "#0f172a", whiteSpace: "nowrap", fontSize: 15 }}>R$ {o.valor}</b>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14 }}>
          <span style={{ color: "#94a3b8" }}><i className="fas fa-user-cog" style={{ marginRight: 5 }} />Técnico</span>
          <span style={{ color: "#334155", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.tecnico || "?"}</span>
        </div>
        {o.previsaoExecucao && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, alignItems: "center" }}>
            <span style={{ color: "#94a3b8" }}><i className="fas fa-wrench" style={{ marginRight: 5 }} />Execução</span>
            <span className="mini-card-date exec">{formatDateBR(o.previsaoExecucao)}</span>
          </div>
        )}
        {o.previsaoFaturamento && (
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, alignItems: "center" }}>
            <span style={{ color: "#94a3b8" }}><i className="fas fa-file-invoice-dollar" style={{ marginRight: 5 }} />Faturamento</span>
            <span className="mini-card-date fat">{formatDateBR(o.previsaoFaturamento)}</span>
          </div>
        )}
        {solicitacao && <div className="mini-card-servico" style={{ marginTop: 2, marginBottom: 0 }}>{solicitacao}</div>}
      </div>
      {/* Envio ao Omie: só nos cards da fila "Enviar Omie". Manual de propósito
          (cria ordem/pedido REAL no Omie). */}
      {onEnviarOmie && o.status === FASE_ENVIAR_OMIE && (
        <button
          onClick={(e) => { e.stopPropagation(); onEnviarOmie(o.id); }}
          disabled={!!enviandoOmie}
          title={`Enviar a ${o.id} ao Omie${o.temPPV ? " (com o PPV vinculado)" : ""}`}
          style={{
            width: "100%", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "7px 10px", borderRadius: 7, border: "none",
            background: enviandoOmie === o.id ? "#94A3B8" : "#0EA5E9", color: "#fff",
            fontSize: 12, fontWeight: 700, cursor: enviandoOmie ? "default" : "pointer",
            opacity: enviandoOmie && enviandoOmie !== o.id ? 0.5 : 1,
          }}>
          <i className={enviandoOmie === o.id ? "fas fa-spinner fa-spin" : "fas fa-paper-plane"} />
          {enviandoOmie === o.id ? "Enviando..." : "Enviar ao Omie"}
        </button>
      )}
      {o.diasAtraso > 0 &&!['execu', 'orçamento', 'orcamento', 'aguardando cliente'].some(s => (o.status || '').toLowerCase().includes(s)) && (
        <div className="mini-card-atraso">
          <i className="fas fa-exclamation-circle" /> {o.diasAtraso}d atrasado — cobrar {o.tecnico}
        </div>
      )}
      <div className="mini-card-bottom">
        <span className="mini-card-tecnico"><i className="fas fa-user-cog" /> {o.tecnico}</span>
        <span className="mini-card-dias">{diasFase}d</span>
        <span className="mini-card-icons">
          {o.temPPV && <i className="fas fa-box" style={S_ICON_COLOR} title="PPV vinculado" />}

          {/* Ícone REQ — tooltip no hover */}
          <span className="mc-icon-wrap" onClick={(e) => e.stopPropagation()}>
            <i className="fas fa-shopping-cart" title={o.temReq ? "Requisição vinculada" : "Sem requisição"} style={o.temReq ? S_ICON_COLOR : { color: "var(--border)" }} />
            {temReqInfo && (
              <div className="mc-tooltip">
                <div className="mc-tooltip-arrow" />
                <div style={{ fontSize: 9, fontWeight: 700, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                  Requisições ({o.reqInfo!.length})
                </div>
                {o.reqInfo!.map((r) => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <span style={{ fontWeight: 700, color: "#fbbf24" }}>#{r.id}</span>
                    <span style={{ fontWeight: 700, color: "#34d399" }}>
                      R$ {r.valor.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </span>

          {/* Ícone REL — tooltip no hover */}
          <span className="mc-icon-wrap" onClick={(e) => e.stopPropagation()}>
            <i className="fas fa-file-alt" title={o.temRel ? "Relatório técnico anexado" : "Sem relatório técnico"} style={o.temRel ? S_ICON_COLOR : { color: "var(--border)" }} />
            {o.temRel && (
              <div className="mc-tooltip">
                <div className="mc-tooltip-arrow" />
                <div style={{ fontSize: 9, fontWeight: 700, color: "#60a5fa", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                  Relatório Técnico
                </div>
                <div style={{ color: "#e2e8f0", fontSize: 12 }}>
                  {o.relTecnico ? (
                    <>Preenchido por <span style={{ fontWeight: 700, color: "#60a5fa" }}>{o.relTecnico}</span></>
                  ) : "Relatório anexado"}
                </div>
              </div>
            )}
          </span>

          {/* Ícone GARANTIA — tooltip no hover */}
          <span className="mc-icon-wrap" onClick={(e) => e.stopPropagation()}>
            <i className="fas fa-shield-halved" title={garantiaStatus ? `Garantia: ${STATUS_LABEL[garantiaStatus]}` : "Sem garantia"} style={{ color: garantiaStatus ? "#111827" : "var(--border)" }} />
            {garantiaStatus && (
              <div className="mc-tooltip">
                <div className="mc-tooltip-arrow" />
                <div style={{ fontSize: 9, fontWeight: 700, color: "#38bdf8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                  Garantia
                </div>
                <div style={{ color: "#e2e8f0", fontSize: 12 }}>{STATUS_LABEL[garantiaStatus]}</div>
              </div>
            )}
          </span>
        </span>
      </div>
    </div>
  );
});

// Fases abertas por padrão; só "Concluída" e "Cancelada" começam fechadas.
const COLLAPSED_DEFAULT = new Set(["Concluída", "Cancelada"]);
// Fases que aparecem no quadro mas SEM mostrar a contagem no cabeçalho.
const SEM_CONTAGEM = new Set(["Concluída", "Cancelada"]);

export default function PhaseView({ orders, searchTerm, onCardClick, onPhaseChange, onAgendar, onEnviarOmie, onEnviarOmieTodas, enviandoOmie, tecnicoFiltro = "" }: PhaseViewProps) {
  const [activePhase, setActivePhase] = useState<string>("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(COLLAPSED_DEFAULT));
  const [garantiaMap, setGarantiaMap] = useState<Record<string, GarantiaStatus>>({});
  // Tooltip com a Descrição do Serviço completa ao passar o mouse no card
  const [descTip, setDescTip] = useState<{ texto: string; top: number; left: number } | null>(null);

  // Internas e externas ficam JUNTAS no quadro (decisão 21/08): interna vai
  // normal pro Omie, só muda que as peças saem como remessa. O selo INTERNA
  // no card continua identificando.
  const escopoOrders = orders;

  // Carrega quais OS têm garantia (para o ícone de escudo no card)
  useEffect(() => {
    fetch("/api/garantias")
      .then((r) => r.json())
      .then((d) => {
        const m: Record<string, GarantiaStatus> = {};
        for (const g of d.garantias || []) {
          if (g.id_ordem && !m[g.id_ordem]) m[g.id_ordem] = g.status;
        }
        setGarantiaMap(m);
      })
      .catch(() => {});
  }, []);

  // Mostra o tooltip da descrição ao lado do card (posição fixa, fora do fluxo)
  const onDescEnter = useCallback((rect: DOMRect, texto: string) => {
    if (!texto || !texto.trim()) { setDescTip(null); return; }
    const TW = 320;
    const left = rect.right + 12 + TW <= window.innerWidth ? rect.right + 12 : Math.max(12, rect.left - TW - 12);
    const top = Math.max(12, Math.min(rect.top, window.innerHeight - 260));
    setDescTip({ texto, top, left });
  }, []);
  const onDescLeave = useCallback(() => setDescTip(null), []);

  const toggleCollapse = useCallback((phase: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      return next;
    });
  }, []);

  // ── Fases OCULTAS por usuário (olhinho no cabeçalho; escolha no navegador).
  // Fase oculta some do quadro, MAS volta a aparecer quando a busca encontra
  // uma ordem dentro dela (com o olhinho cortado, pra lembrar que está oculta).
  const [ocultas, setOcultas] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set<string>(JSON.parse(localStorage.getItem("pos-fases-ocultas") || "[]")); }
    catch { return new Set(); }
  });
  // "Cobrando Cliente" no TOPO do quadro (antes de Orçamento) — opção por
  // usuário, com o pino no cabeçalho da fase. Começa LIGADA (fase importante).
  const [cobrandoTopo, setCobrandoTopo] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try { return localStorage.getItem("pos-cobranca-topo") !== "0"; } catch { return true; }
  });
  const toggleCobrandoTopo = useCallback(() => {
    setCobrandoTopo((prev) => {
      const next = !prev;
      try { localStorage.setItem("pos-cobranca-topo", next ? "1" : "0"); } catch { /* sem storage */ }
      return next;
    });
  }, []);

  const toggleOculta = useCallback((phase: string) => {
    setOcultas((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) next.delete(phase);
      else next.add(phase);
      try { localStorage.setItem("pos-fases-ocultas", JSON.stringify([...next])); } catch { /* sem storage */ }
      return next;
    });
  }, []);

  // Pre-compute lowercase search term once
  const searchLower = useMemo(() => searchTerm.toLowerCase(), [searchTerm]);

  const filtered = useMemo(() => {
    return escopoOrders.filter(
      (o) =>
        (!searchLower ||
          o.cliente.toLowerCase().includes(searchLower) ||
          o.id.includes(searchLower) ||
          (o.ordemOmie || '').toLowerCase().includes(searchLower) || // nº que a OS virou no Omie
          o.servSolicitado.toLowerCase().includes(searchLower)) &&
        (!activePhase || o.status === activePhase) &&
        (!tecnicoFiltro || normName(o.tecnico || "") === normName(tecnicoFiltro))
    );
  }, [escopoOrders, searchLower, activePhase, tecnicoFiltro]);


  // Group by phase for "Todas" view
  const grouped = useMemo(() => {
    if (activePhase) return null;
    const map: Record<string, KanbanCard[]> = {};
    const phasesSet = new Set(PHASES);
    for (const phase of PHASES) {
      const items = filtered.filter((o) => o.status === phase);
      if (phase === FASE_CONCLUIDO) {
        // separa as concluídas: sem garantia ficam na fase; com garantia vão pro grupo próprio
        const semGar = items.filter((o) => !garantiaMap[o.id]);
        const comGar = items.filter((o) => garantiaMap[o.id]);
        if (semGar.length > 0) map[FASE_CONCLUIDO] = semGar;
        if (comGar.length > 0) map[FASE_CONCLUIDO_GAR] = comGar;
      } else if (items.length > 0) {
        // Fase vazia NÃO aparece (pedido 21/08 — antes Enviar/Enviado Omie e
        // Preenchido Garantia ficavam sempre visíveis, mesmo com 0).
        map[phase] = items;
      }
    }
    // Ordens com status desconhecido — não deixa sumir
    const orphans = filtered.filter((o) => !phasesSet.has(o.status));
    if (orphans.length > 0) map["Outros"] = orphans;
    return map;
  }, [filtered, activePhase, garantiaMap]);

  // Stable click handlers per card (avoid inline arrow in .map)
  const handleCardClick = useCallback((o: KanbanCard) => onCardClick(o), [onCardClick]);

  return (
    <>
      {/* Filtro por técnico agora vive no HEADER (fila de perfis com foto) */}

      {/* Cards */}
      <main className="cards-wrapper">
        {activePhase ? (
          /* Single phase grid */
          <div className="cards-grid">
            {filtered.map((o) => (
              <MiniCard
                key={o.id}
                order={o}
                color={PHASE_COLORS[o.status] || "#64748B"}
                onClick={() => handleCardClick(o)}
                onPhaseChange={onPhaseChange}
                onAgendar={onAgendar}
                garantiaStatus={garantiaMap[o.id]}
                onDescEnter={onDescEnter}
                onDescLeave={onDescLeave}
                onEnviarOmie={onEnviarOmie}
                enviandoOmie={enviandoOmie}
              />
            ))}
            {filtered.length === 0 && (
              <div className="cards-empty">Nenhuma ordem nesta fase</div>
            )}
          </div>
        ) : (
          /* Grouped view */
          grouped && (() => {
            let entradas = Object.entries(grouped).filter(([phase]) => (searchLower ? true : !ocultas.has(phase)));
            // Cobrando Cliente na frente de tudo (opção do pino no cabeçalho)
            if (cobrandoTopo) {
              const i = entradas.findIndex(([p]) => p === FASE_COBRANDO);
              if (i > 0) entradas = [entradas[i], ...entradas.slice(0, i), ...entradas.slice(i + 1)];
            }
            return entradas;
          })().map(([phase, items]) => (
            <div key={phase} className="phase-group"
              style={phase === FASE_COBRANDO ? {
                border: "2px solid #0EA5E9", borderRadius: 14,
                background: "rgba(56, 189, 248, 0.12)",
                padding: "12px 16px 6px", marginBottom: 18,
                boxShadow: "0 4px 16px rgba(14, 165, 233, 0.18)",
              } : undefined}>
              <div className="phase-group-header" onClick={() => toggleCollapse(phase)} style={{ cursor: "pointer" }}>
                <span className="phase-group-chevron" style={{ display: "inline-block", transition: "transform 0.2s", transform: collapsed.has(phase) ? "rotate(-90deg)" : "rotate(0deg)", marginRight: 6 }}>
                  <i className="fas fa-chevron-down" />
                </span>
                {/* Olhinho: oculta/mostra a fase SÓ pra este usuário */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleOculta(phase); }}
                  title={ocultas.has(phase) ? "Fase oculta (apareceu pela busca) — clique pra voltar a mostrar" : "Ocultar esta fase pra você (a busca ainda encontra as ordens dela)"}
                  style={{ border: "none", background: "transparent", cursor: "pointer", padding: "2px 4px", marginRight: 4, color: ocultas.has(phase) ? "#D97706" : "#94a3b8", fontSize: 13 }}>
                  <i className={ocultas.has(phase) ? "fas fa-eye-slash" : "fas fa-eye"} />
                </button>
                <span className="phase-group-dot" style={{ background: PHASE_COLORS[phase] }} />
                <span className="phase-group-name">{phase}</span>
                {!SEM_CONTAGEM.has(phase) && <span className="phase-group-count">{items.length}</span>}
                {/* Selo: esta fase é DIFERENTE — dinheiro na mesa */}
                {phase === FASE_COBRANDO && (
                  <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 800, letterSpacing: 0.8, color: "#92400E", background: "#FDE68A", borderRadius: 999, padding: "2px 10px", textTransform: "uppercase" }}>
                    <i className="fas fa-comment-dollar" style={{ marginRight: 4 }} />Cobrança
                  </span>
                )}
                {/* Pino: manter Cobrando Cliente no topo do quadro */}
                {phase === FASE_COBRANDO && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleCobrandoTopo(); }}
                    title={cobrandoTopo ? "Fase fixada no topo (antes de Orçamento) — clique pra voltar à ordem normal" : "Fixar esta fase no topo do quadro (antes de Orçamento)"}
                    style={{ border: "none", background: "transparent", cursor: "pointer", padding: "2px 5px", marginLeft: 6, color: cobrandoTopo ? "#A16207" : "#94a3b8", fontSize: 13 }}>
                    <i className="fas fa-thumbtack" style={{ transform: cobrandoTopo ? "none" : "rotate(45deg)" }} />
                  </button>
                )}
                {/* "Enviar todas" — só no cabeçalho da fase "Enviar Omie" e se houver fila */}
                {onEnviarOmieTodas && phase === FASE_ENVIAR_OMIE && items.length > 0 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEnviarOmieTodas(); }}
                    disabled={!!enviandoOmie}
                    title={`Enviar ao Omie as ${items.length} OS desta fase (uma a uma, com pausa entre elas)`}
                    style={{
                      marginLeft: 10, display: "inline-flex", alignItems: "center", gap: 6,
                      padding: "5px 12px", borderRadius: 7, border: "none",
                      background: enviandoOmie === "__todas__" ? "#94A3B8" : "#0EA5E9", color: "#fff",
                      fontSize: 12, fontWeight: 700, cursor: enviandoOmie ? "default" : "pointer",
                    }}>
                    <i className={enviandoOmie === "__todas__" ? "fas fa-spinner fa-spin" : "fas fa-paper-plane"} />
                    {enviandoOmie === "__todas__" ? "Enviando..." : `Enviar todas (${items.length})`}
                  </button>
                )}
                <div className="phase-group-line" />
              </div>
              {!collapsed.has(phase) && (
                <div className="cards-grid">
                  {items.map((o) => (
                    <MiniCard
                      key={o.id}
                      order={o}
                      color={PHASE_COLORS[phase] || "#64748B"}
                      onClick={() => handleCardClick(o)}
                      onPhaseChange={onPhaseChange}
                      onAgendar={onAgendar}
                      garantiaStatus={garantiaMap[o.id]}
                      onDescEnter={onDescEnter}
                      onDescLeave={onDescLeave}
                onEnviarOmie={onEnviarOmie}
                enviandoOmie={enviandoOmie}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {/* Fases ocultas: aqui é o lugar de VOLTAR a mostrar */}
        {!activePhase && ocultas.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "18px 0 8px", padding: "10px 14px", border: "1px dashed var(--border, #cbd5e1)", borderRadius: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
              <i className="fas fa-eye-slash" style={{ marginRight: 6 }} />Fases ocultas
            </span>
            {[...ocultas].map((f) => (
              <button key={f} onClick={() => toggleOculta(f)} title="Voltar a mostrar esta fase"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid var(--border, #cbd5e1)", background: "transparent", color: "#64748b", borderRadius: 20, padding: "4px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                <i className="fas fa-eye" style={{ fontSize: 11 }} />{PHASE_SHORT[f] || f}
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Tooltip: Descrição do Serviço completa ao passar o mouse no card */}
      {descTip && (
        <div style={{
          position: "fixed", top: descTip.top, left: descTip.left, width: 320, maxHeight: "50vh", overflowY: "auto",
          zIndex: 100000, pointerEvents: "none", background: "#0f172a", color: "#e2e8f0",
          border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.35)", padding: "12px 14px",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#fbbf24", marginBottom: 6 }}>Descrição do Serviço</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{descTip.texto}</div>
        </div>
      )}
    </>
  );
}
