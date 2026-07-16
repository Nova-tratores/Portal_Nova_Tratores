"use client";

import { useState, useEffect, useCallback } from "react";
import type { PPVDetalhes, LogEntry } from "@/lib/ppv/types";
import { formatarDataFrontend, formatarMoeda } from "@/lib/ppv/utils";
import { normalizarStatus } from "@/lib/ppv/utils";
import { TIPOS_PEDIDO, MOTIVOS_SAIDA, STATUS_OPTIONS, STATUS_COLORS, type StatusKey } from "@/lib/ppv/constants";
import { api } from "@/lib/ppv/api";
import { usePPV } from "@/lib/ppv/PPVContext";
import { useAuth } from "@/hooks/useAuth";
import ModalBuscaCliente from "./ModalBuscaCliente";
import { usePermissoes } from "@/hooks/usePermissoes";
import ModalDevolucao from "./ModalDevolucao";
import ModalImportarKit from "@/components/orcamentos/ModalImportarKit";
import { MSG_SEM_PERMISSAO } from "@/lib/permissoes/ui";

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
  modalProdCodigo?: string;
  onModalProdDisplayChange: (v: string) => void;
  onSetModalOS: (id: string, display: string) => void;
  modalClienteNome: string;
  onClienteConsumido?: () => void; // limpa o nome no pai depois de aplicado (ver useEffect)
  onDirty?: () => void;
}

export default function PPVDrawer({
  open, ppvId, onClose, onBuscaProduto, onBuscaOS, onBuscaCliente,
  modalOSId, modalOSDisplay, modalProdDisplay, modalProdCodigo,
  onModalProdDisplayChange, onSetModalOS,
  modalClienteNome, onClienteConsumido, onDirty,
}: Props) {
  const { tecnicos, productCache, showToast } = usePPV();
  const { userProfile } = useAuth();
  const { pode } = usePermissoes(userProfile?.id);
  const podeEditar = pode('ppv', 'editar');
  const podeItem = pode('ppv', 'adicionar_item');
  const podeOmie = pode('ppv', 'enviar_omie');

  const [details, setDetails] = useState<PPVDetalhes | null>(null);
  const [status, setStatus] = useState("Orçamento");
  const [tecnico, setTecnico] = useState("");
  const [cliente, setCliente] = useState("");
  const [clienteDoc, setClienteDoc] = useState("");
  const [clienteEndereco, setClienteEndereco] = useState("");
  const [clienteCidade, setClienteCidade] = useState("");
  const [tipoPedido, setTipoPedido] = useState("Pedido");
  const [projeto, setProjeto] = useState("");
  const [motivoSaida, setMotivoSaida] = useState("Venda Balcão");
  const [observacao, setObservacao] = useState("");
  const [motivoCancelamento, setMotivoCancelamento] = useState("");
  const [temSubstituto, setTemSubstituto] = useState(false);
  const [substitutoTipo, setSubstitutoTipo] = useState<"POS" | "PPV">("POS");
  const [substitutoId, setSubstitutoId] = useState("");
  const [listaOSAbertas, setListaOSAbertas] = useState<Array<{ id: string; cliente: string; status: string }>>([]);
  const [listaPPVAbertos, setListaPPVAbertos] = useState<Array<{ id: string; cliente: string; status: string }>>([]);
  const [pedidoOmie, setPedidoOmie] = useState("");
  const [qtdExtra, setQtdExtra] = useState(1);
  const [kitModalOpen, setKitModalOpen] = useState(false);
  const [importandoKit, setImportandoKit] = useState(false);
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

  const [editandoPrecoCod, setEditandoPrecoCod] = useState<string | null>(null);
  const [editandoPrecoVal, setEditandoPrecoVal] = useState("");
  const [salvandoPreco, setSalvandoPreco] = useState(false);
  const [desconto, setDesconto] = useState(0);

  // Carregar listas para dropdown de substituto
  useEffect(() => {
    if (!temSubstituto) return;
    if (substitutoTipo === "POS" && listaOSAbertas.length === 0) {
      fetch("/api/pos/ordens").then(r => r.json()).then((data) => {
        if (Array.isArray(data)) setListaOSAbertas(data.filter((o: any) => o.Status !== "Cancelada" && o.Status !== "Concluída").map((o: any) => ({ id: String(o.Id_Ordem), cliente: o.Os_Cliente || "", status: o.Status || "" })));
      }).catch(() => {});
    }
    if (substitutoTipo === "PPV" && listaPPVAbertos.length === 0) {
      fetch("/api/ppv/pedidos").then(r => r.json()).then((data) => {
        if (Array.isArray(data)) setListaPPVAbertos(data.filter((p: any) => p.status !== "Cancelada" && p.status !== "Concluída" && p.status !== "Cancelado" && p.status !== "Fechado" && p.id !== ppvId).map((p: any) => ({ id: p.id, cliente: p.cliente || "", status: p.status || "" })));
      }).catch(() => {});
    }
  }, [temSubstituto, substitutoTipo]);

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
      setProjeto(d.projeto || "");
      setMotivoSaida(d.motivoSaida || "Venda Balcão");
      setObservacao(d.observacao || "");
      setMotivoCancelamento(d.motivoCancelamento || "");
      setTemSubstituto(!!(d.substitutoTipo && d.substitutoId));
      setSubstitutoTipo((d.substitutoTipo === "POS" || d.substitutoTipo === "PPV") ? d.substitutoTipo : "POS");
      setSubstitutoId(d.substitutoId || "");
      setPedidoOmie(d.pedidoOmie || "");
      setDesconto(d.desconto || 0);
      onSetModalOS(d.osId || "", d.osId ? `OS #${d.osId} (Vinculada)` : "");
      // Cliente: se o pedido já guarda o DOCUMENTO, usa ele (sem ambiguidade de homônimo).
      // Senão cai na busca por nome (pedidos antigos).
      const doc = (d.clienteDocumento || "").trim();
      setClienteDocumento(doc);
      if (doc) {
        setClienteDoc(doc);
        api.buscarClientePorDocumento(doc)
          .then((res) => { setClienteEndereco(res.endereco || ""); setClienteCidade(res.cidade || ""); })
          .catch(() => { setClienteEndereco(""); setClienteCidade(""); });
      } else {
        carregarDadosCliente(d.cliente || "");
      }
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

  // Troca de cliente: o modal vive DENTRO do drawer e escreve direto no estado.
  // IMPORTANTE: guardamos o DOCUMENTO (CNPJ/CPF), não só o nome. Existem clientes
  // HOMÔNIMOS com CNPJs diferentes (um ativo, um inativo) — com só o nome, trocar de um
  // pro outro gravava o mesmo texto (nada mudava) e o CNPJ vinha sempre do 1º match.
  const [buscaClienteOpen, setBuscaClienteOpen] = useState(false);
  const [clienteDocumento, setClienteDocumento] = useState(""); // documento salvo no pedido
  const aplicarCliente = useCallback((nome: string, documento?: string) => {
    if (!nome) return;
    setCliente(nome);
    setBuscaClienteOpen(false);
    const doc = (documento || "").trim();
    setClienteDocumento(doc);
    if (doc) {
      // Com o documento em mãos, busca os dados DESSE cliente (sem ambiguidade de nome)
      setClienteDoc(doc);
      api.buscarClientePorDocumento(doc)
        .then((res) => { setClienteEndereco(res.endereco || ""); setClienteCidade(res.cidade || ""); })
        .catch(() => { setClienteEndereco(""); setClienteCidade(""); });
    } else {
      carregarDadosCliente(nome);
    }
  }, [carregarDadosCliente]);

  // Compat: se o pai ainda mandar um nome (fluxo antigo), aplica também.
  useEffect(() => {
    if (modalClienteNome && open) {
      setCliente(modalClienteNome);
      carregarDadosCliente(modalClienteNome);
      onClienteConsumido?.();
    }
  }, [modalClienteNome, open, carregarDadosCliente, onClienteConsumido]);

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
  const totalSemDesconto = tOrig - tDev;
  const valorDesconto = totalSemDesconto * (desconto / 100);
  const totalFinal = totalSemDesconto - valorDesconto;

  const statusNorm = normalizarStatus(status) as StatusKey;
  const statusColor = STATUS_COLORS[statusNorm] || { text: "var(--portal-text-secondary)", bg: "var(--portal-bg-card)" };

  async function salvar() {
    if (!podeEditar) { showToast("error", "Você não tem permissão para editar pedidos."); return; }
    const erros: string[] = [];
    if (!cliente.trim()) erros.push("Cliente");
    if (!tecnico.trim()) erros.push("Técnico");
    if (status === "Cancelada" && !motivoCancelamento.trim()) erros.push("Motivo do Cancelamento");
    if (status === "Cancelada" && temSubstituto && !substitutoId.trim()) erros.push("ID do Substituto");
    if (status === "Concluída" && !pedidoOmie.trim()) erros.push("Pedido OMIE");
    if (erros.length > 0) { showToast("error", `Campos obrigatórios: ${erros.join(", ")}`); return; }

    setSalvando(true);
    try {
      await api.editarPedido({
        id: ppvId!, status, observacao, tecnico, cliente, clienteDocumento, motivoCancelamento, pedidoOmie, osId: modalOSId, tipoPedido, projeto, motivoSaida, userName: userProfile?.nome || "",
        substitutoTipo: temSubstituto ? substitutoTipo : null,
        substitutoId: temSubstituto ? substitutoId : null,
        desconto,
      });
      showToast("success", "Atualizado com sucesso!");
      onDirty?.();
      onClose();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro"); }
    setSalvando(false);
  }

  async function addExtra() {
    if (!podeItem) { showToast("error", "Sem permissão para alterar itens."); return; }
    const c = modalProdDisplay.split(" - ")[0].trim();
    if (!c || qtdExtra < 1) { showToast("error", "Dados inválidos"); return; }
    const cached = productCache[c] || { descricao: "ITEM MANUAL", preco: 0 };
    setAddingExtra(true);
    try {
      const d = await api.registrarMovimentacao({ id: ppvId!, codigo: c, descricao: cached.descricao, quantidade: qtdExtra, preco: cached.preco, tecnico: details?.tecnico || "", tipoMovimento: "Saída", userName: userProfile?.nome || "" });
      setDetails(d);
      showToast("success", "Item adicionado");
      onModalProdDisplayChange("");
      onDirty?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro"); }
    setAddingExtra(false);
  }

  async function importarKitItens(produtos: { codigo: string; descricao: string; quantidade: number; preco: number }[], _horas?: number, rotulo?: string) {
    if (!podeItem) { showToast("error", "Sem permissão para alterar itens."); return; }
    if (!ppvId || produtos.length === 0) return;
    setImportandoKit(true);
    try {
      // Uma chamada só (antes ia item a item): grava o kit inteiro marcado com o rótulo.
      const d = await api.importarKitLote({ id: ppvId, kit: rotulo || "Kit", tecnico: details?.tecnico || "", userName: userProfile?.nome || "", itens: produtos });
      if (d) setDetails(d);
      showToast("success", `Kit importado: ${produtos.length} ${produtos.length === 1 ? "item" : "itens"}`);
      onDirty?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro ao importar kit"); }
    setImportandoKit(false);
  }

  const [removendoKit, setRemovendoKit] = useState<string | null>(null);
  async function removerKitInteiro(tag: string, rotulo: string) {
    if (!podeItem) { showToast("error", "Sem permissão para alterar itens."); return; }
    if (!ppvId || !confirm(`Remover o kit "${rotulo}" inteiro do PPV?`)) return;
    setRemovendoKit(tag);
    try {
      const d = await api.removerKit(ppvId, tag, userProfile?.nome || "");
      if (d) setDetails(d);
      showToast("success", "Kit removido.");
      onDirty?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro ao remover kit"); }
    setRemovendoKit(null);
  }

  async function salvarPrecoItem(codigo: string) {
    if (!podeItem) { showToast("error", "Sem permissão para alterar itens."); return; }
    if (!ppvId) return;
    const preco = parseFloat(editandoPrecoVal.replace(",", "."));
    if (isNaN(preco) || preco < 0) { showToast("error", "Preço inválido"); return; }
    setSalvandoPreco(true);
    try {
      const d = await api.editarPrecoItem(ppvId, codigo, preco, userProfile?.nome || "");
      setDetails(d);
      setEditandoPrecoCod(null);
      setEditandoPrecoVal("");
      showToast("success", "Preço atualizado");
      onDirty?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro"); }
    setSalvandoPreco(false);
  }

  async function confirmarDevolucao(quantidade: number) {
    if (!podeItem) { showToast("error", "Sem permissão para alterar itens."); return; }
    if (!devolucaoProd || !ppvId) return;
    setConfirmandoDev(true);
    try {
      const d = await api.registrarMovimentacao({ id: ppvId, codigo: devolucaoProd.codigo, descricao: devolucaoProd.descricao, quantidade, preco: devolucaoProd.preco, tecnico: details?.tecnico || "", tipoMovimento: "Devolução", userName: userProfile?.nome || "" });
      setDetails(d);
      setDevolucaoOpen(false);
      showToast("success", "Devolução registrada!");
      onDirty?.();
    } catch (e) { showToast("error", e instanceof Error ? e.message : "Erro"); }
    setConfirmandoDev(false);
  }

  async function enviarOmie() {
    if (!podeOmie) { showToast("error", "Sem permissão para enviar ao Omie."); return; }
    if (!ppvId) return;
    setEnviandoOmie(true);
    try {
      const res = await api.enviarParaOmie(ppvId, userProfile?.nome || "");
      showToast("success", `Pedido Omie nº ${res.numeroPedido} criado! PPV concluída.`);
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
                  fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px",
                  padding: "4px 12px", borderRadius: 6,
                  background: tipoPedido === "Remessa" ? "#E0E7FF" : "#FEF3C7",
                  color: tipoPedido === "Remessa" ? "#3730A3" : "#92400E",
                  border: `1px solid ${tipoPedido === "Remessa" ? "#C7D2FE" : "#FDE68A"}`,
                }}>
                  <i className={`fas ${tipoPedido === "Remessa" ? "fa-dolly" : "fa-file-invoice-dollar"}`} style={{ marginRight: 5 }} />
                  {tipoPedido === "Remessa" ? "Remessa" : "Pedido de Venda"}
                </span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={!podeEditar}
                  title="Alterar status do PPV"
                  style={{
                    fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
                    padding: "4px 12px", borderRadius: 6,
                    background: statusColor.bg, color: statusColor.text,
                    border: "none", outline: "none", cursor: podeEditar ? "pointer" : "not-allowed", maxWidth: 300,
                  }}
                >
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
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

                  {/* ── Detalhes do status — só quando Concluída/Cancelada (o select ficou no cabeçalho) ── */}
                  {(status === "Concluída" || status === "Cancelada") && (
                    <div className="ppv-card">
                      <div className="ppv-card-title"><i className="fas fa-flag" /> {status === "Cancelada" ? "Cancelamento" : "Conclusão"}</div>
                      {status === "Concluída" && (
                        <div>
                          <label>Pedido OMIE *</label>
                          <input type="text" value={pedidoOmie} onChange={(e) => setPedidoOmie(e.target.value)} placeholder="Código do pedido Omie..." style={{ marginBottom: 0 }} />
                        </div>
                      )}
                      {status === "Cancelada" && (
                        <div>
                          <label>Motivo do Cancelamento *</label>
                          <textarea rows={2} value={motivoCancelamento} onChange={(e) => setMotivoCancelamento(e.target.value)} placeholder="Descreva o motivo..." style={{ marginBottom: 12 }} />
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: temSubstituto ? 10 : 0 }}>
                            <input type="checkbox" id="ppvTemSubstituto" checked={temSubstituto} onChange={(e) => { setTemSubstituto(e.target.checked); if (!e.target.checked) { setSubstitutoId(""); } }} />
                            <label htmlFor="ppvTemSubstituto" style={{ margin: 0, fontWeight: 600, cursor: "pointer" }}>Tem substituto?</label>
                          </div>
                          {temSubstituto && (
                            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                              <select value={substitutoTipo} onChange={(e) => { setSubstitutoTipo(e.target.value as "POS" | "PPV"); setSubstitutoId(""); }} style={{ width: 100, fontWeight: 600 }}>
                                <option value="POS">POS</option>
                                <option value="PPV">PPV</option>
                              </select>
                              <select value={substitutoId} onChange={(e) => setSubstitutoId(e.target.value)} style={{ flex: 1, fontWeight: 600, marginBottom: 0 }}>
                                <option value="">Selecione...</option>
                                {(substitutoTipo === "POS" ? listaOSAbertas : listaPPVAbertos).map((item) => (
                                  <option key={item.id} value={item.id}>
                                    {substitutoTipo === "POS" ? `OS ${item.id}` : item.id} - {item.cliente} ({item.status})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Enviar ao Omie — última seção do modal (order alto) ── */}
                  <div className="ppv-card" style={{ order: 20 }}>
                    <div className="ppv-card-title"><i className="fas fa-cloud-upload-alt" /> Enviar para o Omie</div>
                    {!pedidoOmie ? (
                      <button
                        className="ppv-btn-omie"
                        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                        onClick={enviarOmie}
                        disabled={enviandoOmie || !podeOmie}
                        title={!podeOmie ? MSG_SEM_PERMISSAO : undefined}
                      >
                        {enviandoOmie ? (
                          <><i className="fas fa-spinner fa-spin" /> Enviando...</>
                        ) : (
                          <><i className="fas fa-cloud-upload-alt" /> Enviar para Omie</>
                        )}
                      </button>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#047857", fontWeight: 700, fontSize: 13 }}>
                        <i className="fas fa-check-circle" /> Enviado para Omie (Pedido: {pedidoOmie})
                      </div>
                    )}
                  </div>

                  {/* ── Cliente ── */}
                  <div className="ppv-card">
                    <div className="ppv-card-title" style={{ justifyContent: "space-between" }}>
                      <span><i className="fas fa-user" /> Cliente</span>
                      <button type="button" onClick={() => setBuscaClienteOpen(true)} className="ppv-card-title-action">
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
                    <div className="ppv-row">
                      <div style={{ flex: 1 }}>
                        <label>Projeto</label>
                        <input type="text" value={projeto} onChange={(e) => setProjeto(e.target.value)}
                          placeholder={modalOSId ? "Deixe vazio para usar o da OS" : "Nome do projeto..."}
                          style={{ marginBottom: 0, fontWeight: 600 }} />
                      </div>
                      <div style={{ flex: 1 }} />
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

                    {/* Importar Kit de Revisão */}
                    <button type="button" onClick={() => setKitModalOpen(true)} disabled={importandoKit || !ppvId || !podeItem}
                      title={!podeItem ? MSG_SEM_PERMISSAO : undefined}
                      style={{
                        width: "100%", marginBottom: 14, padding: "12px 16px", borderRadius: 12,
                        border: "1px solid #99F6E4", background: "linear-gradient(135deg, #F0FDFA, #ECFEFF)",
                        cursor: importandoKit || !ppvId || !podeItem ? "not-allowed" : "pointer", opacity: importandoKit || !ppvId || !podeItem ? 0.6 : 1,
                        display: "flex", alignItems: "center", gap: 12, textAlign: "left", transition: "all .15s",
                      }}
                      onMouseEnter={(e) => { if (!importandoKit && ppvId && podeItem) e.currentTarget.style.boxShadow = "0 4px 14px rgba(13,148,136,0.18)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}>
                      <span style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg, #0d9488, #0f766e)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0, boxShadow: "0 2px 6px rgba(13,148,136,0.35)" }}>
                        {importandoKit ? <i className="fas fa-spinner fa-spin" style={{ fontSize: 15 }} /> : <i className="fas fa-tools" style={{ fontSize: 15 }} />}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 700, color: "#0f766e" }}>
                          {importandoKit ? "Importando kit..." : "Importar Kit de Revisão"}
                        </span>
                        <span style={{ display: "block", fontSize: 11.5, color: "#5EAaa8" }}>
                          Revisão, manutenção ou quadriciclo — escolha o modelo
                        </span>
                      </span>
                      <i className="fas fa-chevron-right" style={{ fontSize: 13, color: "#0d9488", flexShrink: 0 }} />
                    </button>

                    {/* Kits importados — remover o kit inteiro de uma vez */}
                    {(details?.kits || []).length > 0 && (
                      <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                        {(details?.kits || []).map((k) => (
                          <div key={k.tag} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, border: "1px solid #99F6E4", background: "#F0FDFA" }}>
                            <i className="fas fa-tools" style={{ fontSize: 13, color: "#0d9488" }} />
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#0f766e", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.rotulo}</span>
                              <span style={{ display: "block", fontSize: 11, color: "#5EAaa8" }}>{k.itens.length} {k.itens.length === 1 ? "item" : "itens"} · {formatarMoeda(k.total)}</span>
                            </span>
                            <button type="button" onClick={() => removerKitInteiro(k.tag, k.rotulo)} disabled={!podeItem || removendoKit === k.tag}
                              title={!podeItem ? MSG_SEM_PERMISSAO : "Remover o kit inteiro"}
                              style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #FECACA", background: "#fff", color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: !podeItem ? "not-allowed" : "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                              {removendoKit === k.tag ? <i className="fas fa-spinner fa-spin" /> : <i className="fas fa-trash" />} Remover kit
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Adicionar item */}
                    <label>Adicionar Produto</label>
                    <div style={{ display: "flex", gap: 10, marginBottom: produtosComSaldo.length > 0 ? 16 : 0 }}>
                      <input type="text" value={modalProdDisplay} readOnly placeholder="Clique para buscar produto..." onClick={onBuscaProduto} style={{ cursor: "pointer", fontWeight: modalProdDisplay ? 600 : 400, flex: 1, marginBottom: 0 }} />
                      <input type="number" value={qtdExtra} onChange={(e) => setQtdExtra(parseInt(e.target.value) || 1)} min={1} style={{ width: 70, textAlign: "center", fontWeight: 700, marginBottom: 0 }} />
                      <button type="button" onClick={addExtra} disabled={addingExtra || !podeItem} title={!podeItem ? MSG_SEM_PERMISSAO : undefined} className="ppv-btn-save" style={{ padding: "10px 18px", whiteSpace: "nowrap", fontSize: 13 }}>
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
                                  {editandoPrecoCod === p.codigo ? (
                                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                      <span style={{ fontSize: 11, color: "var(--ppv-text-light)" }}>R$</span>
                                      <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        autoFocus
                                        value={editandoPrecoVal}
                                        onChange={(e) => setEditandoPrecoVal(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") { e.preventDefault(); salvarPrecoItem(p.codigo); }
                                          if (e.key === "Escape") { setEditandoPrecoCod(null); setEditandoPrecoVal(""); }
                                        }}
                                        disabled={salvandoPreco}
                                        style={{ width: 90, padding: "4px 8px", marginBottom: 0, fontSize: 13, fontWeight: 700 }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => salvarPrecoItem(p.codigo)}
                                        disabled={salvandoPreco}
                                        title="Salvar"
                                        style={{ background: "#10B981", color: "#fff", border: "none", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 12 }}
                                      >
                                        <i className={`fas ${salvandoPreco ? "fa-spinner fa-spin" : "fa-check"}`} />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => { setEditandoPrecoCod(null); setEditandoPrecoVal(""); }}
                                        disabled={salvandoPreco}
                                        title="Cancelar"
                                        style={{ background: "#EF4444", color: "#fff", border: "none", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 12 }}
                                      >
                                        <i className="fas fa-times" />
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.2 }}>
                                        <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{formatarMoeda(p.saldo * p.preco)}</span>
                                        <span style={{ fontSize: 11, color: "var(--ppv-text-light)", whiteSpace: "nowrap" }}>
                                          un. {formatarMoeda(p.preco)}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => { setEditandoPrecoCod(p.codigo); setEditandoPrecoVal(p.preco.toFixed(2)); }}
                                        title="Editar preço unitário"
                                        style={{ background: "transparent", border: "none", color: "var(--portal-text-secondary)", cursor: "pointer", padding: 4, fontSize: 13 }}
                                      >
                                        <i className="fas fa-pen" />
                                      </button>
                                    </>
                                  )}
                                  {p.saldo > 0 && editandoPrecoCod !== p.codigo && (
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

                  {/* ── Desconto ── */}
                  <div className="ppv-card">
                    <div className="ppv-card-title"><i className="fas fa-percent" /> Desconto</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input
                        type="number"
                        value={desconto || ""}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          setDesconto(isNaN(v) ? 0 : Math.min(100, Math.max(0, v)));
                        }}
                        min={0}
                        max={100}
                        step={0.5}
                        placeholder="0"
                        style={{ width: 90, textAlign: "center", fontWeight: 700, marginBottom: 0 }}
                      />
                      <span style={{ fontWeight: 700, color: "var(--ppv-text-light)" }}>%</span>
                      {desconto > 0 && (
                        <span style={{ fontSize: 13, color: "#10B981", fontWeight: 700 }}>
                          -{formatarMoeda(valorDesconto)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* ── Total bar ── */}
                  <div className="ppv-total-bar">
                    <div className="ppv-total-breakdown">
                      <span>Saídas: {formatarMoeda(tOrig)}</span>
                      {tDev > 0 && <span>Devoluções: -{formatarMoeda(tDev)}</span>}
                      {desconto > 0 && <span style={{ color: "#10B981" }}>Desconto ({desconto}%): -{formatarMoeda(valorDesconto)}</span>}
                    </div>
                    <div className="ppv-total-value">
                      {formatarMoeda(totalFinal)}
                    </div>
                  </div>

                </div>

                {/* ── Footer ── */}
                <div className="ppv-drawer-footer">
                  <button className="ppv-btn-cancel" onClick={onClose}>Cancelar</button>
                  <button className="ppv-btn-save" onClick={salvar} disabled={salvando || !podeEditar} title={!podeEditar ? MSG_SEM_PERMISSAO : undefined}>
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
      <ModalImportarKit open={kitModalOpen} onClose={() => setKitModalOpen(false)} onImportar={(produtos) => importarKitItens(produtos)} />
      {/* Busca de cliente do PRÓPRIO drawer — escreve direto no estado daqui */}
      <ModalBuscaCliente open={buscaClienteOpen} onClose={() => setBuscaClienteOpen(false)} onSelect={aplicarCliente} />
    </>
  );
}
