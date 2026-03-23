"use client";

import { useState, useEffect, useCallback } from "react";
import type { PPVDetalhes, LogEntry } from "@/lib/ppv/types";
import { formatarDataFrontend, formatarMoeda } from "@/lib/ppv/utils";
import { normalizarStatus } from "@/lib/ppv/utils";
import { TIPOS_PEDIDO, MOTIVOS_SAIDA, STATUS_OPTIONS, STATUS_COLORS, type StatusKey } from "@/lib/ppv/constants";
import { api } from "@/lib/ppv/api";
import { usePPV } from "@/lib/ppv/PPVContext";
import ModalDevolucao from "./ModalDevolucao";

interface Props {
  open: boolean;
  ppvId: string | null;
  onClose: () => void;
  onBuscaProduto: () => void;
  onBuscaOS: () => void;
  onBuscaCliente: () => void;
  modalOSId: string;
  modalOSDisplay: string;
  modalProdDisplay: string;
  onModalProdDisplayChange: (v: string) => void;
  onSetModalOS: (id: string, display: string) => void;
  modalClienteNome: string;
  onDirty?: () => void;
}

export default function PPVDrawer({
  open, ppvId, onClose, onBuscaProduto, onBuscaOS, onBuscaCliente,
  modalOSId, modalOSDisplay, modalProdDisplay,
  onModalProdDisplayChange, onSetModalOS,
  modalClienteNome, onDirty,
}: Props) {
  const { tecnicos, productCache, showToast } = usePPV();

  const [details, setDetails] = useState<PPVDetalhes | null>(null);
  const [status, setStatus] = useState("Aguardando");
  const [tecnico, setTecnico] = useState("");
  const [cliente, setCliente] = useState("");
  const [clienteDoc, setClienteDoc] = useState("");
  const [clienteEndereco, setClienteEndereco] = useState("");
  const [clienteCidade, setClienteCidade] = useState("");
  const [tipoPedido, setTipoPedido] = useState("Pedido");
  const [motivoSaida, setMotivoSaida] = useState("Venda Balcão");
  const [observacao, setObservacao] = useState("");
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [pedidoOmie, setPedidoOmie] = useState("");
  const [qtdExtra, setQtdExtra] = useState(1);
  const [salvando, setSalvando] = useState(false);
  const [addingExtra, setAddingExtra] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [enviandoOmie, setEnviandoOmie] = useState(false);
  const [loadingData, setLoadingData] = useState(false);

  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [devolucaoOpen, setDevolucaoOpen] = useState(false);
  const [devolucaoProd, setDevolucaoProd] = useState<{ codigo: string; descricao: string; preco: number; max: number } | null>(null);
  const [confirmandoDev, setConfirmandoDev] = useState(false);

  const carregarDadosCliente = useCallback(async (nome: string) => {
    if (!nome) { setClienteDoc(""); setClienteEndereco(""); setClienteCidade(""); return; }
    try {
      const res = await api.buscarClientePorNome(nome);
      setClienteDoc(res.documento || "");
      setClienteEndereco(res.endereco || "");
      setClienteCidade(res.cidade || "");
    } catch {
      setClienteDoc(""); setClienteEndereco(""); setClienteCidade("");
    }
  }, []);

  const carregarDetalhes = useCallback(async (id: string) => {
    setLoadingData(true);
    try {
      const d = await api.buscarPedido(id);
      setDetails(d);
      setStatus(d.status || "Aguardando");
      setTecnico(d.tecnico || "");
      setCliente(d.cliente || "");
      setTipoPedido(d.tipoPedido || "Pedido");
      setMotivoSaida(d.motivoSaida || "Venda Balcão");
      setObservacao(d.observacao || "");
      setMotivoCancelamento(d.motivoCancelamento || "");
      setPedidoOmie(d.pedidoOmie || "");
      onSetModalOS(d.osId || "", d.osId ? `OS #${d.osId} (Vinculada)` : "");
      carregarDadosCliente(d.cliente || "");
    } catch {
      showToast("error", "Erro ao carregar detalhes");
    }
    setLoadingData(false);
  }, [showToast, onSetModalOS, carregarDadosCliente]);

  const carregarHistorico = useCallback(async () => {
    if (!ppvId) return;
    setLogsLoading(true);
    try { setLogs(await api.buscarHistorico(ppvId)); } catch { setLogs([]); }
    setLogsLoading(false);
  }, [ppvId]);

  useEffect(() => {
    if (modalClienteNome && open) {
      setCliente(modalClienteNome);
      carregarDadosCliente(modalClienteNome);
    }
  }, [modalClienteNome, open, carregarDadosCliente]);

  useEffect(() => {
    if (open && ppvId) {
      setShowLogs(false);
      carregarDetalhes(ppvId);
    }
  }, [open, ppvId, carregarDetalhes]);

  useEffect(() => {
    if (showLogs && ppvId) carregarHistorico();
  }, [showLogs, ppvId, carregarHistorico]);

  // Calcular totais
  let tOrig = 0, tDev = 0;
  const produtosComSaldo = (details?.produtos || []).map((p) => {
    const qtdDev = (details?.devolucoes || []).filter((x) => x.codigo === p.codigo).reduce((acc, cur) => acc + cur.quantidade, 0);
    const saldo = p.quantidade - qtdDev;
    tOrig += p.quantidade * p.preco;
    tDev += qtdDev * p.preco;
    return { ...p, saldo, qtdDev };
  });
  const totalFinal = tOrig - tDev;

  const statusNorm = normalizarStatus(status) as StatusKey;
  const statusColor = STATUS_COLORS[statusNorm] || { text: "#64748B", bg: "#FFFFFF" };

  async function salvar() {
    const erros: string[] = [];
    if (!cliente.trim()) erros.push("Cliente");
    if (!tecnico.trim()) erros.push("Técnico");
    if (status === "Cancelado" && !motivoCancelamento.trim()) erros.push("Motivo do Cancelamento");
    if (status === "Fechado" && !pedidoOmie.trim()) erros.push("Pedido OMIE");
    if (erros.length > 0) { showToast("error", `Campos obrigatórios: ${erros.join(", ")}`); return; }

    setSalvando(true);
    try {
      await api.editarPedido({ id: ppvId!, status, observacao, tecnico, cliente, motivoCancelamento, pedidoOmie, osId: modalOSId, tipoPedido, motivoSaida });
      showToast("success", "Atualizado com sucesso!");
      onDirty?.();
      onClose();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro"); }
    setSalvando(false);
  }

  async function addExtra() {
    const c = modalProdDisplay.split(" - ")[0].trim();
    if (!c || qtdExtra < 1) { showToast("error", "Dados inválidos"); return; }
    const cached = productCache[c] || { descricao: "ITEM MANUAL", preco: 0 };
    setAddingExtra(true);
    try {
      const d = await api.registrarMovimentacao({ id: ppvId!, codigo: c, descricao: cached.descricao, quantidade: qtdExtra, preco: cached.preco, tecnico: details?.tecnico || "", tipoMovimento: "Saída" });
      setDetails(d);
      showToast("success", "Item adicionado");
      onModalProdDisplayChange("");
      onDirty?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro"); }
    setAddingExtra(false);
  }

  async function confirmarDevolucao(quantidade: number) {
    if (!devolucaoProd || !ppvId) return;
    setConfirmandoDev(true);
    try {
      const d = await api.registrarMovimentacao({ id: ppvId, codigo: devolucaoProd.codigo, descricao: devolucaoProd.descricao, quantidade, preco: devolucaoProd.preco, tecnico: details?.tecnico || "", tipoMovimento: "Devolução" });
      setDetails(d);
      setDevolucaoOpen(false);
      showToast("success", "Devolução registrada!");
      onDirty?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro"); }
    setConfirmandoDev(false);
  }

  async function enviarOmie() {
    if (!ppvId) return;
    setEnviandoOmie(true);
    try {
      const res = await api.enviarParaOmie(ppvId);
      showToast("success", `Pedido Omie nº ${res.numeroPedido} criado! PPV fechado.`);
      onDirty?.();
      onClose();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erro ao enviar para Omie");
    }
    setEnviandoOmie(false);
  }

  async function gerarPDF() {
    if (!ppvId) return;
    setGerando(true);
    try {
      const data = await api.gerarPDF(ppvId);
      if (data.html) {
        const w = window.open("", "_blank", "width=900,height=800");
        if (w) { w.document.write(data.html); w.document.close(); setTimeout(() => { w.focus(); w.print(); }, 500); }
      }
    } catch { showToast("error", "Erro ao gerar PDF"); }
    setGerando(false);
  }

  if (!open) return null;

  return (
    <>
      <div className="ppv-drawer-overlay" onClick={onClose}>
        <div className={`ppv-modal-container ${showLogs ? "with-logs" : ""}`} onClick={(e) => e.stopPropagation()}>
          <div className="ppv-drawer">
            {/* ── Header ── */}
            <div className="ppv-drawer-header">
              <div className="ppv-drawer-header-left">
                <span className="ppv-drawer-header-title">#{ppvId}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
                  padding: "4px 12px", borderRadius: 6,
                  background: statusColor.bg, color: statusColor.text,
                }}>
                  {status}
                </span>
              </div>
              <div className="ppv-drawer-header-actions">
                <button className="ppv-btn-ghost" onClick={gerarPDF} disabled={gerando}>
                  <i className={`fas ${gerando ? "fa-spinner fa-spin" : "fa-print"}`} /> {gerando ? "Gerando..." : "Imprimir"}
                </button>
                <button className="ppv-btn-ghost" onClick={() => setShowLogs(!showLogs)}>
                  <i className="fas fa-history" /> Log
                </button>
                <button className="ppv-btn-close" onClick={onClose}>
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            {loadingData ? (
              <div className="ppv-loading">
                <div className="ppv-spinner" />
                <span>Carregando dados...</span>
              </div>
            ) : (
              <>
                <div className="ppv-drawer-body">

                  {/* ── Summary card ── */}
                  {details && (
                    <div className="ppv-summary">
                      <div className="ppv-summary-main">
                        <div className="ppv-summary-client">
                          <i className="fas fa-user" />
                          <div>
                            <div className="ppv-summary-name">{cliente || "..."}</div>
                            {clienteDoc && <div className="ppv-summary-sub">{clienteDoc}</div>}
                          </div>
                        </div>
                        <div className="ppv-summary-total">
                          {formatarMoeda(totalFinal)}
                        </div>
                      </div>
                      <div className="ppv-summary-details">
                        <span><i className="fas fa-user-cog" /> {tecnico || "..."}</span>
                        <span><i className="far fa-calendar" /> {formatarDataFrontend(details.data)}</span>
                        <span><i className="fas fa-tag" /> {tipoPedido}</span>
                        {modalOSDisplay && <span><i className="fas fa-link" /> {modalOSDisplay}</span>}
                      </div>
                    </div>
                  )}

                  {/* ── Status ── */}
                  <div className="ppv-card">
                    <div className="ppv-card-title"><i className="fas fa-flag" /> Status</div>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ fontWeight: 600, marginBottom: 0 }}>
                      {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    {status === "Fechado" && (
                      <div style={{ marginTop: 12 }}>
                        <label>Pedido OMIE *</label>
                        <input type="text" value={pedidoOmie} onChange={(e) => setPedidoOmie(e.target.value)} placeholder="Código do pedido Omie..." style={{ marginBottom: 0 }} />
                      </div>
                    )}
                    {status === "Cancelado" && (
                      <div style={{ marginTop: 12 }}>
                        <label>Motivo do Cancelamento *</label>
                        <textarea rows={2} value={motivoCancelamento} onChange={(e) => setMotivoCancelamento(e.target.value)} placeholder="Descreva o motivo..." style={{ marginBottom: 0 }} />
                      </div>
                    )}
                  </div>

                  {/* ── Cliente ── */}
                  <div className="ppv-card">
                    <div className="ppv-card-title" style={{ justifyContent: "space-between" }}>
                      <span><i className="fas fa-user" /> Cliente</span>
                      <button type="button" onClick={onBuscaCliente} className="ppv-card-title-action">
                        <i className="fas fa-exchange-alt" /> Trocar
                      </button>
                    </div>
                    <div className="ppv-client-name">{cliente || "—"}</div>
                    <div className="ppv-row" style={{ gap: 12 }}>
                      <div className="ppv-readonly-field" style={{ flex: 1 }}>
                        <div className="ppv-readonly-label">CPF / CNPJ</div>
                        <div className="ppv-readonly-value">{clienteDoc || "—"}</div>
                      </div>
                      <div className="ppv-readonly-field" style={{ flex: 1 }}>
                        <div className="ppv-readonly-label">Cidade</div>
                        <div className="ppv-readonly-value">{clienteCidade || "—"}</div>
                      </div>
                    </div>
                    <div className="ppv-readonly-field" style={{ marginTop: 10 }}>
                      <div className="ppv-readonly-label">Endereço</div>
                      <div className="ppv-readonly-value">{clienteEndereco || "—"}</div>
                    </div>
                  </div>

                  {/* ── Pedido ── */}
                  <div className="ppv-card">
                    <div className="ppv-card-title"><i className="fas fa-clipboard-list" /> Informações do Pedido</div>
                    <div className="ppv-row">
                      <div style={{ flex: 1 }}>
                        <label>Técnico *</label>
                        <select value={tecnico} onChange={(e) => setTecnico(e.target.value)}>
                          <option value="">Selecionar...</option>
                          {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label>Tipo do Pedido *</label>
                        <select value={tipoPedido} onChange={(e) => setTipoPedido(e.target.value)}>
                          {TIPOS_PEDIDO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="ppv-row">
                      <div style={{ flex: 1 }}>
                        <label>Motivo de Saída *</label>
                        <select value={motivoSaida} onChange={(e) => setMotivoSaida(e.target.value)}>
                          {MOTIVOS_SAIDA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <label>O.S. Vinculada</label>
                        <input type="text" value={modalOSDisplay} readOnly placeholder="Clique para vincular OS..." onClick={onBuscaOS} style={{ cursor: "pointer", fontWeight: 600, marginBottom: 0 }} />
                      </div>
                    </div>
                  </div>

                  {/* ── Observações ── */}
                  <div className="ppv-card">
                    <div className="ppv-card-title"><i className="fas fa-align-left" /> Observações</div>
                    <textarea rows={3} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Notas sobre o pedido..." style={{ marginBottom: 0 }} />
                  </div>

                  {/* ── Itens / Materiais ── */}
                  <div className="ppv-card">
                    <div className="ppv-card-title"><i className="fas fa-boxes" /> Itens &amp; Materiais</div>

                    {/* Adicionar item */}
                    <label>Adicionar Produto</label>
                    <div style={{ display: "flex", gap: 10, marginBottom: produtosComSaldo.length > 0 ? 16 : 0 }}>
                      <input type="text" value={modalProdDisplay} readOnly placeholder="Clique para buscar produto..." onClick={onBuscaProduto} style={{ cursor: "pointer", fontWeight: modalProdDisplay ? 600 : 400, flex: 1, marginBottom: 0 }} />
                      <input type="number" value={qtdExtra} onChange={(e) => setQtdExtra(parseInt(e.target.value) || 1)} min={1} style={{ width: 70, textAlign: "center", fontWeight: 700, marginBottom: 0 }} />
                      <button type="button" onClick={addExtra} disabled={addingExtra} className="ppv-btn-save" style={{ padding: "10px 18px", whiteSpace: "nowrap", fontSize: 13 }}>
                        {addingExtra ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-plus" /> Adicionar</>}
                      </button>
                    </div>

                    {/* Lista de produtos */}
                    {produtosComSaldo.length > 0 && (
                      <div className="ppv-produtos-list">
                        {produtosComSaldo.map((p) => {
                          const pctDev = p.quantidade > 0 ? (p.qtdDev / p.quantidade) * 100 : 0;
                          const isDevolvido = p.saldo === 0;
                          const isParcial = p.saldo > 0 && p.qtdDev > 0;
                          return (
                            <div key={p.codigo} className={`ppv-produto-item ${isDevolvido ? "devolvido" : ""}`}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <span style={{ fontWeight: 700 }}>{p.codigo}</span>
                                    {p.empresa && (() => {
                                      const isPrimario = p.empresa.toLowerCase().includes("primari");
                                      const label = isPrimario ? "CASTRO" : "NOVA";
                                      return (
                                        <span style={{
                                          fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
                                          background: isPrimario ? "#DBEAFE" : "#FEE2E2",
                                          color: isPrimario ? "#2563EB" : "#DC2626",
                                        }}>
                                          {label}
                                        </span>
                                      );
                                    })()}
                                    <span style={{ fontSize: 12, color: "var(--ppv-text-light)" }}>{p.descricao}</span>
                                  </div>
                                  <div style={{ fontSize: 12, color: "var(--ppv-text-light)", marginTop: 4, display: "flex", alignItems: "center", gap: 12 }}>
                                    <span>Qtd: <b>{p.quantidade}</b></span>
                                    <span>Saldo: <b>{p.saldo}</b></span>
                                    {p.qtdDev > 0 && <span style={{ color: "#EF4444" }}>Dev: <b>{p.qtdDev}</b></span>}
                                    {isDevolvido && <span className="ppv-badge gray">DEVOLVIDO</span>}
                                    {isParcial && <span className="ppv-badge yellow">PARCIAL</span>}
                                    {!isDevolvido && !isParcial && <span className="ppv-badge green">ATIVO</span>}
                                  </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                  <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{formatarMoeda(p.saldo * p.preco)}</span>
                                  {p.saldo > 0 && (
                                    <button
                                      onClick={() => { setDevolucaoProd({ codigo: p.codigo, descricao: p.descricao, preco: p.preco, max: p.saldo }); setDevolucaoOpen(true); }}
                                      className="ppv-btn-devolver"
                                    >
                                      <i className="fas fa-undo-alt" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {/* Progress bar */}
                              <div className="ppv-progress-bar" style={{ marginTop: 8 }}>
                                <div className="ppv-progress-fill" style={{ width: `${100 - pctDev}%`, backgroundColor: isDevolvido ? "#CBD5E1" : isParcial ? "#F59E0B" : "#10B981" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ── Total bar ── */}
                  <div className="ppv-total-bar">
                    <div className="ppv-total-breakdown">
                      <span>Saídas: {formatarMoeda(tOrig)}</span>
                      {tDev > 0 && <span>Devoluções: -{formatarMoeda(tDev)}</span>}
                    </div>
                    <div className="ppv-total-value">
                      {formatarMoeda(totalFinal)}
                    </div>
                  </div>

                </div>

                {/* ── Footer ── */}
                <div className="ppv-drawer-footer">
                  <button className="ppv-btn-cancel" onClick={onClose}>Cancelar</button>
                  {status === "Aguardando Para Faturar" && !pedidoOmie && (
                    <button
                      className="ppv-btn-omie"
                      onClick={enviarOmie}
                      disabled={enviandoOmie}
                    >
                      {enviandoOmie ? (
                        <><i className="fas fa-spinner fa-spin" /> Enviando...</>
                      ) : (
                        <><i className="fas fa-paper-plane" /> Enviar para Omie</>
                      )}
                    </button>
                  )}
                  <button className="ppv-btn-save" onClick={salvar} disabled={salvando}>
                    {salvando ? "Salvando..." : "Salvar Alterações"}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── Log Panel ── */}
          {showLogs && (
            <div className="ppv-log-panel">
              <div className="ppv-log-panel-header">
                <i className="fas fa-history" /> Histórico
              </div>
              <div className="ppv-log-panel-body">
                {logsLoading ? (
                  <div className="ppv-loading" style={{ padding: "40px 20px" }}>
                    <div className="ppv-spinner" />
                    <span>Carregando...</span>
                  </div>
                ) : logs.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--ppv-text-light)", fontSize: 13 }}>
                    Nenhuma ação registrada
                  </div>
                ) : (
                  logs.map((l, idx) => (
                    <div key={idx} className="ppv-log-item">
                      <div className="ppv-log-item-date"><i className="far fa-clock" style={{ marginRight: 4 }} />{l.data_hora}</div>
                      <div className="ppv-log-item-action">{l.acao}</div>
                      <div className="ppv-log-item-user"><i className="far fa-user" style={{ marginRight: 4 }} />{l.usuario_email}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ModalDevolucao open={devolucaoOpen} produto={devolucaoProd} onClose={() => setDevolucaoOpen(false)} onConfirm={confirmarDevolucao} confirmando={confirmandoDev} />
    </>
  );
}
