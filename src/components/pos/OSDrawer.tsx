"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { VALOR_HORA, VALOR_KM, TEXT_TEMPLATE, PHASES } from "@/lib/pos/constants";
import type { ClienteOption, ClienteDados, Produto } from "@/lib/pos/types";
import SearchModal from "./SearchModal";
import LogPanel from "./LogPanel";

interface OSDrawerProps {
  visible: boolean;
  mode: "create" | "edit";
  osId: string | null;
  clientes: ClienteOption[];
  tecnicos: string[];
  onClose: () => void;
  onSaved: () => void;
}

/* ── Inline style constants (avoid new refs each render) ── */
const S_FLEX1 = { flex: 1 } as const;
const S_FLEX2 = { flex: 2 } as const;
const S_MB0 = { marginBottom: 0 } as const;
const S_MT12 = { marginTop: 12 } as const;
const S_SEARCH_ICON = { position: "absolute" as const, left: 14, top: 13, color: "#7A6E5D" };
const S_SEARCH_INPUT = { paddingLeft: 40, marginBottom: 0 };
const S_SELECT_BOLD = { fontWeight: 600, marginBottom: 0 };
const S_POINTER_BOLD = { cursor: "pointer" as const, fontWeight: 600 };
const S_POINTER_BOLD_MB0 = { cursor: "pointer" as const, fontWeight: 600, marginBottom: 0 };
const S_MONO_MB0 = { fontFamily: "monospace", marginBottom: 0 };
const S_RELATIVE = { position: "relative" as const };
const S_EMPTY_RESULT = { padding: 16, textAlign: "center" as const, color: "#7A6E5D", fontSize: 13 };
const S_CLIENT_ITEM_WRAP = { flex: 1, minWidth: 0 };
const S_CLIENT_ITEM_NAME = { fontSize: 13, fontWeight: 600 };
const S_CLIENT_ITEM_SUB = { fontSize: 11, color: "#7A6E5D" };
const S_CLIENT_BADGE_CPF = { color: "#7A6E5D", marginLeft: 8 };
const S_REQ_MATERIAL = { color: "#7A6E5D", flex: 1, textAlign: "right" as const, fontSize: 12 };
const S_PRODUTO_VALOR = { fontWeight: 600 };
const S_SPINNER_LOADING = { width: 28, height: 28, borderColor: "#E0D6C8", borderTopColor: "#7A6E5D" };
const S_SPINNER_OMIE = { width: 14, height: 14, borderColor: "rgba(255,255,255,0.3)", borderTopColor: "#fff", display: "inline-block" as const, verticalAlign: "middle" as const, marginRight: 8 };
const S_MR6 = { marginRight: 6 };
const S_DISC_BADGE = { fontSize: 11, color: "#C41E2A", fontWeight: 700, marginLeft: "auto" };
const S_REQ_BOLD = { fontWeight: 600 };

const STATUS_BADGE_STYLE = (status: string) => ({
  fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.5px",
  padding: "4px 12px", borderRadius: 6,
  background: status.includes("Exec") ? "#FEF3C7" : status === "Concluída" ? "#D1FAE5" : status === "Cancelada" ? "#FEE2E2" : "#E8E0D0",
  color: status.includes("Exec") ? "#92400E" : status === "Concluída" ? "#065F46" : status === "Cancelada" ? "#991B1B" : "#1E3A5F",
});

const BOMBA_HORAS = ["600", "1200", "1800", "2400", "3000"];

export default function OSDrawer({ visible, mode, osId, clientes, tecnicos, onClose, onSaved }: OSDrawerProps) {
  const [clienteChave, setClienteChave] = useState("");
  const [clienteInfo, setClienteInfo] = useState<ClienteDados | null>(null);
  const [status, setStatus] = useState("Orçamento");
  const [tecnico1, setTecnico1] = useState("");
  const [tecnico2, setTecnico2] = useState("");
  const [tipoServico, setTipoServico] = useState("Manutenção");
  const [projeto, setProjeto] = useState("");
  const [revisao, setRevisao] = useState("");
  const [servSolicitado, setServSolicitado] = useState(TEXT_TEMPLATE);
  const [ppv, setPpv] = useState("");
  const [qtdHoras, setQtdHoras] = useState(0);
  const [qtdKm, setQtdKm] = useState(0);
  const [descPorc, setDescPorc] = useState(0);
  const [descValor, setDescValor] = useState(0);
  const [descHoraValor, setDescHoraValor] = useState(0);
  const [descKmValor, setDescKmValor] = useState(0);
  const [ordemOmie, setOrdemOmie] = useState("");
  const [motivoCancel, setMotivoCancel] = useState("");
  const [relatorioTecnico, setRelatorioTecnico] = useState("");
  const [previsaoExecucao, setPrevisaoExecucao] = useState("");
  const [previsaoFaturamento, setPrevisaoFaturamento] = useState("");
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [totalPecas, setTotalPecas] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [showProjModal, setShowProjModal] = useState(false);
  const [showRevModal, setShowRevModal] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [requisicoes, setRequisicoes] = useState<Array<{ id: string; atualizada: boolean; material: string }>>([]);
  const [clienteFilter, setClienteFilter] = useState("");
  const [gerarPPV, setGerarPPV] = useState(false);
  const [enviandoOmie, setEnviandoOmie] = useState(false);
  const [showDescontos, setShowDescontos] = useState(false);
  const [lembretes, setLembretes] = useState<Array<{ id: number; lembrete: string }>>([]);
  const [editingLembreteId, setEditingLembreteId] = useState<number | null>(null);
  const [editingLembreteText, setEditingLembreteText] = useState("");

  // ── Derived values (useMemo) ──
  const subtotalHoras = qtdHoras * VALOR_HORA;
  const subtotalKm = qtdKm * VALOR_KM;
  const subtotalBruto = subtotalHoras + subtotalKm + totalPecas;

  const total = useMemo(() => {
    const sub = (subtotalHoras - descHoraValor) + (subtotalKm - descKmValor) + totalPecas;
    return Math.max(0, sub - descValor);
  }, [subtotalHoras, subtotalKm, totalPecas, descValor, descHoraValor, descKmValor]);

  const bombaAlerta = useMemo(
    () => tipoServico === "Revisão" && !!revisao && BOMBA_HORAS.some((h) => revisao.includes(h)),
    [tipoServico, revisao]
  );

  const totalDescontos = descHoraValor + descKmValor + descValor;

  const filteredClientes = useMemo(() => {
    if (!clienteFilter) return [];
    const terms = clienteFilter.toLowerCase().split(/\s+/).filter(Boolean);
    return clientes.filter((c) => {
      const d = c.display.toLowerCase();
      return terms.every((t) => d.includes(t));
    }).slice(0, 30);
  }, [clienteFilter, clientes]);

  // ── Callbacks ──
  const loadPPV = useCallback(async (ppvId: string) => {
    if (!ppvId) { setProdutos([]); setTotalPecas(0); return; }
    try {
      const res = await fetch(`/api/pos/financeiro?ppv=${encodeURIComponent(ppvId)}`);
      if (!res.ok) return;
      const list: Produto[] = await res.json();
      setProdutos(list);
      setTotalPecas(list.reduce((s, p) => s + p.valor * p.qtde, 0));
    } catch {
      console.error("Erro ao carregar PPV");
    }
  }, []);

  const fetchLembretes = useCallback(async (chave: string) => {
    if (!chave) { setLembretes([]); return; }
    try {
      const res = await fetch(`/api/pos/lembretes?cliente=${encodeURIComponent(chave)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setLembretes(data);
    } catch {
      console.error("Erro ao buscar lembretes");
    }
  }, []);

  const salvarLembreteInline = useCallback(async (id: number, texto: string) => {
    try {
      await fetch(`/api/pos/lembretes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lembrete: texto }),
      });
      setLembretes((prev) => prev.map((l) => l.id === id ? { ...l, lembrete: texto } : l));
      setEditingLembreteId(null);
    } catch {
      alert("Erro ao salvar lembrete.");
    }
  }, []);

  const selectCliente = useCallback(async (chave: string) => {
    setClienteChave(chave);
    if (!chave) return;
    try {
      const res = await fetch(`/api/pos/clientes?id=${encodeURIComponent(chave)}`);
      if (!res.ok) return;
      const c: ClienteDados = await res.json();
      setClienteInfo(c);
    } catch {
      console.error("Erro ao buscar cliente");
    }
    fetchLembretes(chave);
  }, [fetchLembretes]);

  const syncDiscount = useCallback((type: "P" | "V", value: number) => {
    if (type === "P") {
      setDescPorc(value);
      setDescValor(subtotalBruto > 0 ? parseFloat(((value / 100) * subtotalBruto).toFixed(2)) : 0);
    } else {
      setDescValor(value);
      setDescPorc(subtotalBruto > 0 ? parseFloat(((value / subtotalBruto) * 100).toFixed(2)) : 0);
    }
  }, [subtotalBruto]);

  const enviarParaOmie = useCallback(async () => {
    if (!osId) return;
    if (!confirm("Deseja enviar esta OS para o Omie?")) return;
    setEnviandoOmie(true);
    try {
      const res = await fetch(`/api/pos/ordens/${osId}/omie`, { method: "POST" });
      const result = await res.json();
      if (result.sucesso) {
        let msg = `OS enviada para o Omie com sucesso!\nNº Omie: ${result.cNumOS}`;
        if (result.pedidoVenda) msg += `\nPedido de Venda nº ${result.pedidoVenda}`;
        if (result.pedidoVendaErro) msg += `\nErro no Pedido de Venda: ${result.pedidoVendaErro}`;
        alert(msg);
        setOrdemOmie(String(result.nCodOS));
        setStatus("Concluída");
        onSaved?.();
      } else {
        alert(`Erro ao enviar para o Omie:\n${result.erro}`);
      }
    } catch (err) {
      alert("Erro de conexão ao enviar para o Omie.");
      console.error(err);
    }
    setEnviandoOmie(false);
  }, [osId, onSaved]);

  const salvar = useCallback(async () => {
    if (mode === "create" && !clienteChave) { alert("Selecione o Cliente"); return; }
    setSaving(true);
    const dados = {
      id: osId, nomeCliente: clienteInfo?.nome, cpfCliente: clienteInfo?.cpf,
      enderecoCliente: clienteInfo?.endereco, tecnicoResponsavel: tecnico1, tecnico2,
      tipoServico, revisao, projeto, servicoSolicitado: servSolicitado,
      qtdHoras, qtdKm, ppv, status: mode === "create" ? "Orçamento" : status,
      ordemOmie, motivoCancelamento: motivoCancel, descontoValor: descValor, descontoHora: descHoraValor, descontoKm: descKmValor,
      relatorioTecnico, previsaoExecucao, previsaoFaturamento,
      gerarPPV: mode === "create" && tipoServico === "Revisão" && gerarPPV,
    };
    try {
      const url = mode === "create" ? "/api/pos/ordens" : `/api/pos/ordens/${osId}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
      const result = await res.json();
      if (!res.ok || result.erro) {
        alert(result.erro || "Erro ao salvar a OS.");
        setSaving(false);
        return;
      }
      setSaving(false);
      onClose();
      onSaved();
    } catch (err) {
      console.error("Erro ao salvar:", err);
      alert("Erro ao salvar a OS.");
      setSaving(false);
    }
  }, [mode, osId, clienteChave, clienteInfo, tecnico1, tecnico2, tipoServico, revisao, projeto,
      servSolicitado, qtdHoras, qtdKm, ppv, status, ordemOmie, motivoCancel, descValor,
      descHoraValor, descKmValor, relatorioTecnico, previsaoExecucao, previsaoFaturamento,
      gerarPPV, onClose, onSaved]);

  // ── Reset form to defaults ──
  const resetForm = useCallback(() => {
    setClienteChave(""); setClienteInfo(null); setStatus("Orçamento");
    setTecnico1(""); setTecnico2(""); setTipoServico("Manutenção");
    setProjeto(""); setRevisao(""); setServSolicitado(TEXT_TEMPLATE);
    setPpv(""); setQtdHoras(1); setQtdKm(0); setDescPorc(0); setDescValor(0); setDescHoraValor(0); setDescKmValor(0);
    setOrdemOmie(""); setMotivoCancel(""); setRelatorioTecnico("");
    setPrevisaoExecucao(""); setPrevisaoFaturamento("");
    setProdutos([]); setTotalPecas(0); setShowLogs(false); setRequisicoes([]);
    setGerarPPV(false); setShowDescontos(false); setLoadingData(false);
    setLembretes([]); setEditingLembreteId(null);
  }, []);

  // ── Effects ──
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!visible) return;

    // Abort previous fetch if re-opening quickly
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    if (mode === "create") {
      resetForm();
      return;
    }

    if (mode === "edit" && osId) {
      setLoadingData(true);
      fetch(`/api/pos/ordens/${osId}`, { signal: ac.signal })
        .then((r) => r.json())
        .then((d) => {
          if (!d || ac.signal.aborted) return;
          setClienteInfo({ nome: d.nomeCliente, cpf: d.cpfCliente || "", email: "", telefone: "", endereco: d.enderecoCliente || "" });
          setStatus(d.status || "Orçamento");
          setTecnico1(d.tecnicoResponsavel || ""); setTecnico2(d.tecnico2 || "");
          setTipoServico(d.tipoServico || "Manutenção"); setRevisao(d.revisao || "");
          setProjeto(d.projeto || "");
          setServSolicitado(d.servicoSolicitado || TEXT_TEMPLATE);
          setPpv(d.ppv || ""); setQtdHoras(d.qtdHoras || 0); setQtdKm(d.qtdKm || 0);
          const dv = parseFloat(d.descontoSalvo || 0);
          const dh = parseFloat(d.descontoHora || 0);
          const dk = parseFloat(d.descontoKm || 0);
          setDescValor(dv);
          setDescHoraValor(dh);
          setDescKmValor(dk);
          const sub = (d.qtdHoras || 0) * VALOR_HORA + (d.qtdKm || 0) * VALOR_KM;
          setDescPorc(sub > 0 ? parseFloat(((dv / sub) * 100).toFixed(2)) : 0);
          setOrdemOmie(d.ordemOmie || ""); setMotivoCancel(d.motivoCancelamento || "");
          setRelatorioTecnico(d.relatorioTecnico || "");
          setPrevisaoExecucao(d.previsaoExecucao || "");
          setPrevisaoFaturamento(d.previsaoFaturamento || "");
          setRequisicoes(d.infoRequisicoes || []);
          setShowDescontos(dv > 0 || dh > 0 || dk > 0);
          if (d.ppv) loadPPV(d.ppv);
          if (d.nomeCliente) {
            fetch(`/api/pos/lembretes?nome=${encodeURIComponent(d.nomeCliente)}`, { signal: ac.signal })
              .then((r) => r.json())
              .then((lbs) => { if (Array.isArray(lbs) && !ac.signal.aborted) setLembretes(lbs); })
              .catch(() => {});
          }
        })
        .catch((err) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          console.error("Erro ao carregar OS:", err);
          alert("Erro ao carregar dados da OS.");
        })
        .finally(() => { if (!ac.signal.aborted) setLoadingData(false); });
    }

    return () => ac.abort();
  }, [visible, mode, osId, loadPPV, resetForm]);

  // ── Early return ──
  if (!visible) return null;

  const statusBadgeStyle = mode === "edit" ? STATUS_BADGE_STYLE(status) : undefined;

  return (
    <>
      <div className="drawer-overlay active">
        <div className="modal-container">
          <div className="drawer os-drawer">
            {/* Header */}
            <div className="os-header">
              <div className="os-header-left">
                <span className="os-header-title">
                  {mode === "create" ? "Nova Ordem de Serviço" : `${osId}`}
                </span>
                {mode === "edit" && (
                  <span style={statusBadgeStyle}>{status}</span>
                )}
              </div>
              <div className="os-header-actions">
                {mode === "edit" && (
                  <>
                    <button className="os-btn-ghost" onClick={() => {
                      const w = window.open("", "_blank");
                      if (w) {
                        fetch(`/api/pos/ordens/${osId}/print`).then(r => r.text()).then(html => {
                          w.document.write(html);
                          w.document.close();
                        });
                      }
                    }}>
                      <i className="fas fa-print" /> Imprimir
                    </button>
                    <button className="os-btn-ghost" onClick={() => setShowLogs(!showLogs)}>
                      <i className="fas fa-history" /> Log
                    </button>
                  </>
                )}
                <button className="os-btn-close" onClick={onClose}>
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            {loadingData ? (
              <div className="os-loading">
                <div className="spinner-inner" style={S_SPINNER_LOADING} />
                <span>Carregando dados...</span>
              </div>
            ) : (
              <>
                <div className="os-body">

                  {/* ── Summary card (edit mode) ── */}
                  {mode === "edit" && clienteInfo && (
                    <div className="os-summary">
                      <div className="os-summary-main">
                        <div className="os-summary-client">
                          <i className="fas fa-user" />
                          <div>
                            <div className="os-summary-name">{clienteInfo.nome}</div>
                            {clienteInfo.cpf && <div className="os-summary-sub">{clienteInfo.cpf}</div>}
                          </div>
                        </div>
                        <div className="os-summary-total">
                          R$ {total.toFixed(2).replace(".", ",")}
                        </div>
                      </div>
                      <div className="os-summary-details">
                        {projeto && <span><i className="fas fa-cog" /> {projeto}</span>}
                        {tecnico1 && <span><i className="fas fa-user-cog" /> {tecnico1}</span>}
                        <span><i className="fas fa-tag" /> {tipoServico}</span>
                      </div>
                    </div>
                  )}

                  {/* ── Cliente (create) ── */}
                  {mode === "create" && (
                    <div className="os-card">
                      <div className="os-card-title"><i className="fas fa-user" /> Cliente</div>
                      <div style={S_RELATIVE}>
                        <i className="fas fa-search" style={S_SEARCH_ICON} />
                        <input type="text" placeholder="Buscar por nome, razão social ou CNPJ/CPF..." value={clienteFilter} onChange={(e) => setClienteFilter(e.target.value)} style={S_SEARCH_INPUT} />
                      </div>
                      {clienteFilter && (
                        <div className="client-search-results">
                          {filteredClientes.length === 0 ? (
                            <div style={S_EMPTY_RESULT}>Nenhum cliente encontrado</div>
                          ) : filteredClientes.map((c) => (
                            <div key={c.chave} className="client-search-item" onClick={() => { selectCliente(c.chave); setClienteFilter(""); }}>
                              <i className="fas fa-user-circle" style={S_SEARCH_ICON} />
                              <div style={S_CLIENT_ITEM_WRAP}>
                                <div style={S_CLIENT_ITEM_NAME}>{c.display.split("[")[0].trim()}</div>
                                <div style={S_CLIENT_ITEM_SUB}>{c.display.includes("[") ? c.display.substring(c.display.indexOf("[")) : ""}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {clienteInfo && (
                        <div className="os-client-badge">
                          <i className="fas fa-check-circle" /> {clienteInfo.nome}
                          {clienteInfo.cpf && <span style={S_CLIENT_BADGE_CPF}>({clienteInfo.cpf})</span>}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Lembretes do Cliente ── */}
                  {lembretes.length > 0 && lembretes.map((l) => (
                    <div key={l.id} className="os-lembrete-alert">
                      <div className="os-lembrete-alert-header">
                        <i className="fas fa-bell" /> Lembrete
                      </div>
                      {editingLembreteId === l.id ? (
                        <div>
                          <textarea
                            rows={3}
                            value={editingLembreteText}
                            onChange={(e) => setEditingLembreteText(e.target.value)}
                            style={{ marginBottom: 8 }}
                          />
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button className="os-lembrete-edit-btn" onClick={() => setEditingLembreteId(null)}>Cancelar</button>
                            <button className="os-lembrete-edit-btn" onClick={() => salvarLembreteInline(l.id, editingLembreteText)}>Salvar</button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="os-lembrete-alert-text">{l.lembrete}</div>
                          <button className="os-lembrete-edit-btn" onClick={() => { setEditingLembreteId(l.id); setEditingLembreteText(l.lembrete); }}>
                            <i className="fas fa-pen" style={{ marginRight: 4 }} /> Editar
                          </button>
                        </>
                      )}
                    </div>
                  ))}

                  {/* ── Status ── */}
                  {mode === "edit" && (
                    <div className="os-card">
                      <div className="os-card-title"><i className="fas fa-flag" /> Status</div>
                      <select value={status} onChange={(e) => setStatus(e.target.value)} style={S_SELECT_BOLD}>
                        {PHASES.map((p) => <option key={p}>{p}</option>)}
                      </select>
                      {status === "Concluída" && (
                        <div style={S_MT12}>
                          <label>N Ordem Omie</label>
                          <input type="text" value={ordemOmie} onChange={(e) => setOrdemOmie(e.target.value)} style={S_MB0} />
                        </div>
                      )}
                      {status === "Cancelada" && (
                        <div style={S_MT12}>
                          <label>Motivo do Cancelamento</label>
                          <textarea rows={2} value={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value)} style={S_MB0} />
                        </div>
                      )}
                      {!ordemOmie && (
                        <button className="os-btn-omie" onClick={enviarParaOmie} disabled={enviandoOmie}>
                          {enviandoOmie ? (
                            <><div className="spinner-inner" style={S_SPINNER_OMIE} /> Enviando...</>
                          ) : (
                            <><i className="fas fa-cloud-upload-alt" /> Enviar para Omie</>
                          )}
                        </button>
                      )}
                      {ordemOmie && (
                        <div className="os-omie-badge">
                          <i className="fas fa-check-circle" /> Enviado para Omie (ID: {ordemOmie})
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Equipe & Atendimento ── */}
                  <div className="os-card">
                    <div className="os-card-title"><i className="fas fa-users" /> Equipe &amp; Atendimento</div>
                    <div className="os-row">
                      <div style={S_FLEX1}>
                        <label>Técnico Responsável</label>
                        <select value={tecnico1} onChange={(e) => setTecnico1(e.target.value)}>
                          <option value="">Selecione...</option>
                          {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div style={S_FLEX1}>
                        <label>Segundo Técnico</label>
                        <select value={tecnico2} onChange={(e) => setTecnico2(e.target.value)}>
                          <option value="">Nenhum</option>
                          {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="os-row">
                      <div style={S_FLEX1}>
                        <label>Tipo de Atendimento</label>
                        <select value={tipoServico} onChange={(e) => setTipoServico(e.target.value)}>
                          <option value="Manutenção">Manutenção</option>
                          <option value="Revisão">Revisão</option>
                        </select>
                      </div>
                      <div style={S_FLEX2}>
                        <label>Projeto / Equipamento</label>
                        <input type="text" value={projeto} readOnly placeholder="Clique para pesquisar..." onClick={() => setShowProjModal(true)} style={S_POINTER_BOLD} />
                      </div>
                    </div>
                    {tipoServico === "Revisão" && (
                      <>
                        <div>
                          <label>Plano de Revisão</label>
                          <input type="text" value={revisao} readOnly placeholder="Clique para pesquisar revisão..." onClick={() => setShowRevModal(true)} style={S_POINTER_BOLD_MB0} />
                        </div>
                        {mode === "create" && (
                          <div className="os-ppv-toggle" onClick={() => setGerarPPV(!gerarPPV)}>
                            <div className={`os-toggle ${gerarPPV ? "active" : ""}`}>
                              <div className="os-toggle-knob" />
                            </div>
                            <div className="os-ppv-toggle-info">
                              <span className="os-ppv-toggle-label">
                                <i className="fas fa-boxes" /> Gerar PPV automaticamente
                              </span>
                              <span className="os-ppv-toggle-desc">
                                Cria um PPV vinculado à OS com mesmo técnico e cliente
                              </span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {bombaAlerta && (
                      <div className="os-alert">
                        <i className="fas fa-exclamation-triangle" /> Lembrete: Oferecer limpeza na bomba injetora.
                      </div>
                    )}
                  </div>

                  {/* ── Previsões ── */}
                  <div className="os-card">
                    <div className="os-card-title"><i className="fas fa-calendar-alt" /> Previsões</div>
                    <div className="os-row">
                      <div style={S_FLEX1}>
                        <label>Previsão de Execução</label>
                        <input type="date" value={previsaoExecucao} onChange={(e) => setPrevisaoExecucao(e.target.value)} style={S_MB0} />
                      </div>
                      <div style={S_FLEX1}>
                        <label>Previsão de Faturamento</label>
                        <input type="date" value={previsaoFaturamento} onChange={(e) => setPrevisaoFaturamento(e.target.value)} style={S_MB0} />
                      </div>
                    </div>
                  </div>

                  {/* ── Descrição ── */}
                  <div className="os-card">
                    <div className="os-card-title"><i className="fas fa-align-left" /> Descrição do Serviço</div>
                    <textarea rows={10} value={servSolicitado} onChange={(e) => setServSolicitado(e.target.value)} style={S_MONO_MB0} />
                  </div>

                  {/* ── PPV & Requisições (edit) ── */}
                  {mode === "edit" && (
                    <div className="os-card">
                      <div className="os-card-title"><i className="fas fa-boxes" /> Materiais &amp; Requisições</div>
                      <label>PPV (Separe por vírgula)</label>
                      <input type="text" value={ppv} onChange={(e) => setPpv(e.target.value)} onBlur={() => loadPPV(ppv)} />
                      {produtos.length > 0 && (
                        <div className="os-produtos-list">
                          {produtos.map((p, i) => (
                            <div key={i} className="os-produto-item">
                              <span>{p.descricao} <b>(x{p.qtde})</b></span>
                              <span style={S_PRODUTO_VALOR}>R$ {(p.valor * p.qtde).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {requisicoes.length > 0 && (
                        <div style={S_MT12}>
                          <label>Requisições Vinculadas</label>
                          <div className="os-req-list">
                            {requisicoes.map((r, i) => (
                              <div key={i} className="os-req-item">
                                <span style={S_REQ_BOLD}>{r.id}</span>
                                <span className={`os-req-badge ${r.atualizada ? "ok" : ""}`}>{r.atualizada ? "OK" : "Pendente"}</span>
                                <span style={S_REQ_MATERIAL}>{r.material}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Financeiro ── */}
                  <div className="os-card os-card-financial">
                    <div className="os-card-title"><i className="fas fa-calculator" /> Financeiro</div>

                    {/* Valores principais */}
                    <div className="os-financial-grid">
                      <div>
                        <label>Qtd. Horas</label>
                        <input type="number" value={qtdHoras} onChange={(e) => setQtdHoras(parseFloat(e.target.value || "0"))} style={S_MB0} />
                        <div className="os-field-hint">x R$ {VALOR_HORA.toFixed(2)} = R$ {subtotalHoras.toFixed(2)}</div>
                      </div>
                      <div>
                        <label>Qtd. KM</label>
                        <input type="number" value={qtdKm} onChange={(e) => setQtdKm(parseFloat(e.target.value || "0"))} style={S_MB0} />
                        <div className="os-field-hint">x R$ {VALOR_KM.toFixed(2)} = R$ {subtotalKm.toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Descontos (colapsável) */}
                    <div className="os-discount-section">
                      <div
                        className={`os-discount-toggle ${showDescontos ? "open" : ""}`}
                        onClick={() => setShowDescontos(!showDescontos)}
                      >
                        <i className="fas fa-chevron-right" />
                        <i className="fas fa-percentage" />
                        Aplicar Descontos
                        {totalDescontos > 0 && !showDescontos && (
                          <span style={S_DISC_BADGE}>
                            -R$ {totalDescontos.toFixed(2)}
                          </span>
                        )}
                      </div>

                      {showDescontos && (
                        <div className="os-discount-body">
                          {/* Desconto em Horas */}
                          <div className="os-discount-row">
                            <span className="os-discount-row-label">
                              <i className="fas fa-clock" style={S_MR6} />Horas
                            </span>
                            <input
                              type="number"
                              value={descHoraValor}
                              step={0.01}
                              placeholder="0,00"
                              onChange={(e) => setDescHoraValor(parseFloat(e.target.value || "0"))}
                            />
                            {descHoraValor > 0 && (
                              <span className="os-discount-row-result">
                                -R$ {descHoraValor.toFixed(2)} (de {subtotalHoras.toFixed(2)} p/ {(subtotalHoras - descHoraValor).toFixed(2)})
                              </span>
                            )}
                          </div>

                          {/* Desconto em KM */}
                          <div className="os-discount-row">
                            <span className="os-discount-row-label">
                              <i className="fas fa-road" style={S_MR6} />KM
                            </span>
                            <input
                              type="number"
                              value={descKmValor}
                              step={0.01}
                              placeholder="0,00"
                              onChange={(e) => setDescKmValor(parseFloat(e.target.value || "0"))}
                            />
                            {descKmValor > 0 && (
                              <span className="os-discount-row-result">
                                -R$ {descKmValor.toFixed(2)} (de {subtotalKm.toFixed(2)} p/ {(subtotalKm - descKmValor).toFixed(2)})
                              </span>
                            )}
                          </div>

                          {/* Desconto Geral */}
                          <div className="os-discount-row">
                            <span className="os-discount-row-label">
                              <i className="fas fa-tag" style={S_MR6} />Geral
                            </span>
                            <div className="os-discount-geral">
                              <input
                                type="number"
                                value={descPorc}
                                step={0.01}
                                placeholder="%"
                                onChange={(e) => syncDiscount("P", parseFloat(e.target.value || "0"))}
                              />
                              <span className="os-discount-geral-sep">ou</span>
                              <input
                                type="number"
                                value={descValor}
                                step={0.01}
                                placeholder="R$"
                                onChange={(e) => syncDiscount("V", parseFloat(e.target.value || "0"))}
                              />
                            </div>
                            {descValor > 0 && (
                              <span className="os-discount-row-result">
                                -R$ {descValor.toFixed(2)} ({descPorc.toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Total */}
                    <div className="os-total-bar">
                      <div className="os-total-breakdown">
                        <span>Horas: R$ {(subtotalHoras - descHoraValor).toFixed(2)}</span>
                        <span>KM: R$ {(subtotalKm - descKmValor).toFixed(2)}</span>
                        {totalPecas > 0 && <span>Pecas: R$ {totalPecas.toFixed(2)}</span>}
                        {descValor > 0 && <span>Desc: -R$ {descValor.toFixed(2)}</span>}
                      </div>
                      <div className="os-total-value">
                        R$ {total.toFixed(2).replace(".", ",")}
                      </div>
                    </div>
                  </div>

                </div>

                {/* Footer */}
                <div className="os-footer">
                  <button className="os-btn-cancel" onClick={onClose}>Cancelar</button>
                  <button className="os-btn-save" onClick={salvar} disabled={saving}>
                    {saving ? "Salvando..." : mode === "create" ? "Criar Ordem" : "Salvar Alterações"}
                  </button>
                </div>
              </>
            )}
          </div>

          {mode === "edit" && <LogPanel osId={osId} visible={showLogs} />}
        </div>
      </div>

      <SearchModal title="Pesquisar Equipamento / Chassis" placeholder="Digite chassis, modelo ou número..." apiUrl="/api/pos/buscas/projetos" paramName="termo" visible={showProjModal} onClose={() => setShowProjModal(false)}
        onSelect={(item) => {
          const nome = item.nome || "";
          setProjeto(nome);
          const partes = nome.trim().split(/\s+/);
          const modelo = partes[0] || "";
          const chassis = partes.slice(1).join(" ") || "";
          if (!servSolicitado || servSolicitado.trim() === "" || servSolicitado === TEXT_TEMPLATE) {
            setServSolicitado(`Modelo: ${modelo}\nChassis: ${chassis}\nHorimetro: \n\nSolicitação do cliente: \nServiço Realizado: `);
          } else {
            const lines = servSolicitado.split("\n");
            if (lines[0]?.trim() === "Modelo:") lines[0] = "Modelo: " + modelo;
            if (lines[1]?.trim() === "Chassis:") lines[1] = "Chassis: " + chassis;
            setServSolicitado(lines.join("\n"));
          }
        }}
        renderItem={(item) => item.nome || ""}
      />

      <SearchModal title="Pesquisar Revisão Pronta" placeholder="Digite termos da revisão..." apiUrl="/api/pos/buscas/revisoes" paramName="termo" visible={showRevModal} onClose={() => setShowRevModal(false)}
        onSelect={(item) => setRevisao(item.descricao || "")}
        renderItem={(item) => item.descricao || ""}
      />
    </>
  );
}
