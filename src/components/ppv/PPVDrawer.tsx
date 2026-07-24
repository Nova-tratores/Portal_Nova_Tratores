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
import ModalProdutoEstoque from "./ModalProdutoEstoque";
import ModalImportarKit from "@/components/orcamentos/ModalImportarKit";
import OcorrenciaFormModal from "@/components/ocorrencias/OcorrenciaFormModal";
import { MSG_SEM_PERMISSAO } from "@/lib/permissoes/ui";

interface Props {
  open: boolean;
  ppvId: string | null;
  onClose: () => void;
  onBuscaProduto: () => void;
  onAbrirCatalogo: () => void;
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
  open, ppvId, onClose, onBuscaProduto, onAbrirCatalogo, onBuscaOS, onBuscaCliente,
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
  // Ocorrência rápida por PV (categoria PV pré-selecionada)
  const podeOcorrencia = pode('painel-mecanicos', 'criar_ocorrencia');
  const [showOcorrencia, setShowOcorrencia] = useState(false);

  const [details, setDetails] = useState<PPVDetalhes | null>(null);
  const [status, setStatus] = useState("Orçamento");
  const [tecnico, setTecnico] = useState("");
  const [cliente, setCliente] = useState("");
  const [clienteDoc, setClienteDoc] = useState("");
  const [clienteEndereco, setClienteEndereco] = useState("");
  const [clienteCidade, setClienteCidade] = useState("");
  const [tipoPedido, setTipoPedido] = useState("Pedido");
  const [projeto, setProjeto] = useState("");
  // Projetos do banco (cronograma) — pra escolher em vez de digitar / usar o da OS
  const [projetosDB, setProjetosDB] = useState<{ nome: string }[]>([]);
  const [projDropdown, setProjDropdown] = useState(false);
  const [projBusca, setProjBusca] = useState("");
  const [usarProjetoOS, setUsarProjetoOS] = useState(true); // puxar o projeto da OS quando vazio
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
  const [detalheProd, setDetalheProd] = useState<{ codigo: string; descricao: string } | null>(null);
  const [confirmandoDev, setConfirmandoDev] = useState(false);

  const [editandoPrecoCod, setEditandoPrecoCod] = useState<string | null>(null);
  const [editandoPrecoVal, setEditandoPrecoVal] = useState("");
  const [salvandoPreco, setSalvandoPreco] = useState(false);
  const [desconto, setDesconto] = useState(0); // sempre guardado em % (fonte de verdade)
  const [descontoModo, setDescontoModo] = useState<"pct" | "valor">("pct");

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
      // OS vinculada + projeto vazio ⇒ optaram por não puxar da OS (ou a OS não tem) —
      // deixa o "usar da OS" desligado pra não re-copiar ao salvar.
      setUsarProjetoOS(!((d.osId || "").trim() && !(d.projeto || "").trim()));
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
        id: ppvId!, status, observacao, tecnico, cliente, clienteDocumento, motivoCancelamento, pedidoOmie, osId: modalOSId, tipoPedido, projeto, usarProjetoOS, motivoSaida, userName: userProfile?.nome || "",
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
              </div>
              <div className="ppv-drawer-header-actions">
                {podeOcorrencia && (
                  <button
                    onClick={() => setShowOcorrencia(true)}
                    title="Registrar ocorrência ligada a este PV (falta de informação, extravio, peça danificada…)"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#DC2626", background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 6, padding: "6px 12px", cursor: "pointer", marginRight: 8 }}
                  >
                    ⚠ Ocorrência
                  </button>
                )}
                <button className="ppv-btn-close" onClick={onClose}>
                  <i className="fas fa-times" />
                </button>
              </div>
            </div>

            {/* Modal de ocorrência rápida (categoria PV) */}
            <OcorrenciaFormModal
              aberto={showOcorrencia}
              onFechar={() => setShowOcorrencia(false)}
              tecnicos={Array.from(new Set([tecnico, ...tecnicos].filter(Boolean)))}
              categoriaInicial="pv"
              tecnicoInicial={tecnico || ""}
              idOrdemInicial={ppvId || ""}
              criadoPor={userProfile?.nome || undefined}
            />

            {loadingData ? (
              <div className="ppv-loading">
                <div className="ppv-spinner" />
                <span>Carregando dados...</span>
              </div>
            ) : (
              <>
                <div className="ppv-drawer-body">

                  {/* ── Cabeçalho: Cliente + dados + totais (horizontal, estilo Omie) ── */}
                  {details && (
                    <div className="ppv-summary">
                      {/* Linha do cliente — estilo Omie (campo + lupa) */}
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                        <div style={{ width: 46, height: 46, borderRadius: 10, background: "#dc2626", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 600, flexShrink: 0 }}>
                          {(cliente || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <label style={{ textTransform: "none", letterSpacing: 0, fontWeight: 500, marginBottom: 5, color: "#64748b" }}>Cliente</label>
                          <div style={{ display: "flex", gap: 8 }}>
                            <input type="text" value={cliente || ""} readOnly onClick={() => setBuscaClienteOpen(true)} placeholder="Clique na lupa para escolher o cliente..."
                              style={{ marginBottom: 0, flex: 1, cursor: "pointer", fontWeight: 500 }} />
                            <button type="button" onClick={() => setBuscaClienteOpen(true)} title="Trocar cliente"
                              style={{ flexShrink: 0, width: 44, borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", color: "#334155", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
                              <i className="fas fa-search" />
                            </button>
                          </div>
                          <div className="ppv-summary-details" style={{ borderTop: "none", paddingTop: 8, gap: 14 }}>
                            <span><i className="fas fa-user-cog" /> {tecnico || "..."}</span>
                            <span><i className="far fa-calendar" /> {formatarDataFrontend(details.data)}</span>
                            <span><i className="fas fa-tag" /> {tipoPedido}</span>
                            {modalOSDisplay && <span><i className="fas fa-link" /> {modalOSDisplay}</span>}
                          </div>
                        </div>
                      </div>
                      {/* CPF/CNPJ · Cidade · Endereço em linha */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: 10, marginTop: 12 }}>
                        {[["CPF / CNPJ", clienteDoc], ["Cidade", clienteCidade], ["Endereço", clienteEndereco]].map(([rot, val]) => (
                          <div key={rot} className="ppv-readonly-field">
                            <div className="ppv-readonly-label">{rot}</div>
                            <div className="ppv-readonly-value">{val || "—"}</div>
                          </div>
                        ))}
                      </div>
                      {/* Totais em caixas */}
                      <div style={{ display: "grid", gridTemplateColumns: valorDesconto > 0 ? "1fr 1fr" : "1fr", gap: 10, marginTop: 10 }}>
                        {[
                          ...(valorDesconto > 0 ? [{ rot: `Desconto${desconto > 0 ? ` (${desconto.toFixed(1).replace(".", ",")}%)` : ""}`, val: "-" + formatarMoeda(valorDesconto), forte: false }] : []),
                          { rot: "Valor Total do Pedido", val: formatarMoeda(totalFinal), forte: true },
                        ].map((c, i) => (
                          <div key={i} style={{ background: c.forte ? "#FEF2F2" : "#F8FAFC", border: `1px solid ${c.forte ? "#FECACA" : "#E2E8F0"}`, borderRadius: 10, padding: "10px 14px" }}>
                            <div style={{ fontSize: 12, fontWeight: 500, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.4 }}>{c.rot}</div>
                            <div style={{ fontSize: c.forte ? 22 : 17, fontWeight: 500, marginTop: 3, color: c.forte ? "#dc2626" : "#0f172a" }}>{c.val}</div>
                          </div>
                        ))}
                      </div>
                      {/* Desconto (% ou R$) no topo */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                        <span style={{ fontSize: 14, color: "#64748b" }}>Desconto:</span>
                        <div style={{ display: "flex", background: "#F1F5F9", borderRadius: 8, padding: 3 }}>
                          {(["pct", "valor"] as const).map((m) => (
                            <button key={m} type="button" onClick={() => setDescontoModo(m)}
                              style={{ padding: "6px 13px", borderRadius: 6, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer",
                                background: descontoModo === m ? "#fff" : "transparent", color: descontoModo === m ? "#dc2626" : "#64748B",
                                boxShadow: descontoModo === m ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}>
                              {m === "pct" ? "%" : "R$"}
                            </button>
                          ))}
                        </div>
                        {descontoModo === "pct" ? (
                          <input type="number" value={desconto || ""} min={0} max={100} step={0.5} placeholder="0"
                            onChange={(e) => { const v = parseFloat(e.target.value); setDesconto(isNaN(v) ? 0 : Math.min(100, Math.max(0, v))); }}
                            style={{ width: 110, textAlign: "center", fontSize: 15, marginBottom: 0 }} />
                        ) : (
                          <input type="number" value={valorDesconto ? Number(valorDesconto.toFixed(2)) : ""} min={0} max={totalSemDesconto} step={1} placeholder="0,00"
                            onChange={(e) => { const v = parseFloat(e.target.value); const val = isNaN(v) ? 0 : Math.min(totalSemDesconto, Math.max(0, v)); setDesconto(totalSemDesconto > 0 ? (val / totalSemDesconto) * 100 : 0); }}
                            style={{ width: 130, textAlign: "center", fontSize: 15, marginBottom: 0 }} />
                        )}
                        {desconto > 0 && (
                          <span style={{ fontSize: 14, color: "#10B981", fontWeight: 600 }}>
                            {descontoModo === "pct" ? `-${formatarMoeda(valorDesconto)}` : `${desconto.toFixed(1).replace(".", ",")}%`}
                          </span>
                        )}
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


                  {/* ── Pedido ── */}
                  <div className="ppv-card">
                    <div className="ppv-card-title"><i className="fas fa-clipboard-list" /> Informações do Pedido</div>
                    {/* Campos em linha (horizontal, estilo Omie) */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 16 }}>
                      <div>
                        <label>Fase</label>
                        <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={!podeEditar} title="Alterar a fase do PPV"
                          style={{ marginBottom: 0, fontWeight: 700, color: statusColor.text, background: statusColor.bg }}>
                          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value} style={{ color: "#0f172a", background: "#fff" }}>{s.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label>Técnico *</label>
                        <select value={tecnico} onChange={(e) => setTecnico(e.target.value)} style={{ marginBottom: 0 }}>
                          <option value="">Selecionar...</option>
                          {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label>Tipo do Pedido *</label>
                        <select value={tipoPedido} onChange={(e) => setTipoPedido(e.target.value)} style={{ marginBottom: 0 }}>
                          {TIPOS_PEDIDO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label>Motivo de Saída *</label>
                        <select value={motivoSaida} onChange={(e) => setMotivoSaida(e.target.value)} style={{ marginBottom: 0 }}>
                          {MOTIVOS_SAIDA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label>O.S. Vinculada</label>
                        <input type="text" value={modalOSDisplay} readOnly placeholder="Clique para vincular OS..." onClick={onBuscaOS} style={{ cursor: "pointer", fontWeight: 600, marginBottom: 0 }} />
                      </div>
                    </div>
                    <div className="ppv-row" style={{ marginTop: 16 }}>
                      <div style={{ flex: 1, position: "relative" }}>
                        <label>Projeto</label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input type="text" value={usarProjetoOS && modalOSId && !projeto ? "" : projeto} onChange={(e) => setProjeto(e.target.value)}
                            disabled={usarProjetoOS && !!modalOSId && !projeto}
                            placeholder={usarProjetoOS && modalOSId ? "Usando o projeto da OS vinculada" : "Escolha do banco ou digite..."}
                            style={{ marginBottom: 0, fontWeight: 600, flex: 1, background: usarProjetoOS && modalOSId && !projeto ? "#f8fafc" : "#fff" }} />
                          <button type="button" title="Escolher um projeto do banco"
                            onClick={() => {
                              setProjDropdown((o) => !o); setProjBusca("");
                              if (projetosDB.length === 0) fetch("/api/pos/buscas/projetos").then((r) => r.json()).then((d) => setProjetosDB(Array.isArray(d) ? d : [])).catch(() => {});
                            }}
                            style={{ flexShrink: 0, padding: "0 14px", borderRadius: 10, border: "1px solid #E2E8F0", background: projDropdown ? "#EFF6FF" : "#fff", color: "#334155", fontSize: 12.5, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                            <i className="fas fa-database" style={{ fontSize: 12 }} /> Do banco
                          </button>
                        </div>
                        {/* Opção de puxar (ou não) o projeto da OS — só quando há OS vinculada */}
                        {modalOSId && (
                          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 0, fontSize: 12.5, color: "#64748b", cursor: "pointer", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                            <input type="checkbox" checked={usarProjetoOS} onChange={(e) => { setUsarProjetoOS(e.target.checked); if (e.target.checked) setProjeto(""); }} />
                            Usar o projeto da OS vinculada (desmarque para escolher outro ou nenhum)
                          </label>
                        )}
                        {projDropdown && (
                          <div style={{ position: "absolute", zIndex: 30, top: 62, left: 0, right: 0, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, boxShadow: "0 12px 30px rgba(0,0,0,0.14)", maxHeight: 280, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                            <div style={{ padding: 8, borderBottom: "1px solid #F1F5F9" }}>
                              <input autoFocus value={projBusca} onChange={(e) => setProjBusca(e.target.value)} placeholder="Buscar projeto..."
                                style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 13, boxSizing: "border-box", marginBottom: 0 }} />
                            </div>
                            <div style={{ overflow: "auto" }}>
                              {projetosDB.filter((p) => p.nome.toLowerCase().includes(projBusca.trim().toLowerCase())).slice(0, 60).map((p, i) => (
                                <button type="button" key={`${p.nome}-${i}`} onClick={() => { setUsarProjetoOS(false); setProjeto(p.nome); setProjDropdown(false); }}
                                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", padding: "9px 12px", border: "none", background: "transparent", cursor: "pointer", borderBottom: "1px solid #F5F5F5" }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFC")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                                  <i className="fas fa-cog" style={{ fontSize: 11, color: "#94a3b8", flexShrink: 0 }} />
                                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.nome}</span>
                                </button>
                              ))}
                              {projetosDB.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 12.5 }}>Carregando...</div>}
                              {projetosDB.length > 0 && projetosDB.filter((p) => p.nome.toLowerCase().includes(projBusca.trim().toLowerCase())).length === 0 && <div style={{ padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 12.5 }}>Nenhum projeto.</div>}
                            </div>
                          </div>
                        )}
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

                    {/* Ações de itens: Importar Kit + Catálogo (par) */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                      {/* Importar Kit de Revisão */}
                      <button type="button" onClick={() => setKitModalOpen(true)} disabled={importandoKit || !ppvId || !podeItem}
                        title={!podeItem ? MSG_SEM_PERMISSAO : undefined}
                        style={{
                          padding: "14px 16px", borderRadius: 14, border: "1px solid #99F6E4",
                          background: "linear-gradient(135deg, #F0FDFA, #ECFEFF)",
                          cursor: importandoKit || !ppvId || !podeItem ? "not-allowed" : "pointer", opacity: importandoKit || !ppvId || !podeItem ? 0.55 : 1,
                          display: "flex", alignItems: "center", gap: 12, textAlign: "left", transition: "all .15s",
                        }}
                        onMouseEnter={(e) => { if (!importandoKit && ppvId && podeItem) e.currentTarget.style.boxShadow = "0 6px 18px rgba(13,148,136,0.20)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}>
                        <span style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg, #14b8a6, #0f766e)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0, boxShadow: "0 3px 8px rgba(13,148,136,0.35)" }}>
                          {importandoKit ? <i className="fas fa-spinner fa-spin" style={{ fontSize: 16 }} /> : <i className="fas fa-tools" style={{ fontSize: 16 }} />}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "#0f766e" }}>
                            {importandoKit ? "Importando kit..." : "Importar Kit"}
                          </span>
                          <span style={{ display: "block", fontSize: 12, color: "#5EAaa8", marginTop: 1 }}>
                            Revisão por modelo e horas
                          </span>
                        </span>
                      </button>

                      {/* Catálogo de Peças */}
                      <button type="button" onClick={onAbrirCatalogo} disabled={!ppvId || !podeItem}
                        title={!podeItem ? MSG_SEM_PERMISSAO : undefined}
                        style={{
                          padding: "14px 16px", borderRadius: 14, border: "1px solid #FBCFE8",
                          background: "linear-gradient(135deg, #FFF1F2, #FDF2F8)",
                          cursor: !ppvId || !podeItem ? "not-allowed" : "pointer", opacity: !ppvId || !podeItem ? 0.55 : 1,
                          display: "flex", alignItems: "center", gap: 12, textAlign: "left", transition: "all .15s",
                        }}
                        onMouseEnter={(e) => { if (ppvId && podeItem) e.currentTarget.style.boxShadow = "0 6px 18px rgba(219,39,119,0.18)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "none"; }}>
                        <span style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg, #f43f5e, #be123c)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0, boxShadow: "0 3px 8px rgba(190,18,60,0.32)" }}>
                          <i className="fas fa-book-open" style={{ fontSize: 16 }} />
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 14.5, fontWeight: 600, color: "#be123c" }}>
                            Catálogo
                          </span>
                          <span style={{ display: "block", fontSize: 12, color: "#e07a97", marginTop: 1 }}>
                            Busque a peça pela figura
                          </span>
                        </span>
                      </button>
                    </div>

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
                    <label style={{ fontWeight: 500, textTransform: "none", letterSpacing: 0, fontSize: 13 }}>Adicionar Produto</label>
                    <div style={{ display: "flex", gap: 10, marginBottom: produtosComSaldo.length > 0 ? 16 : 0 }}>
                      <input type="text" value={modalProdDisplay} readOnly placeholder="Clique para buscar produto..." onClick={onBuscaProduto} style={{ cursor: "pointer", fontWeight: 500, flex: 1, marginBottom: 0, fontSize: 15 }} />
                      <input type="number" value={qtdExtra} onChange={(e) => setQtdExtra(parseInt(e.target.value) || 1)} min={1} style={{ width: 70, textAlign: "center", fontWeight: 500, marginBottom: 0, fontSize: 15 }} />
                      <button type="button" onClick={addExtra} disabled={addingExtra || !podeItem} title={!podeItem ? MSG_SEM_PERMISSAO : undefined} className="ppv-btn-save" style={{ padding: "10px 18px", whiteSpace: "nowrap", fontSize: 13 }}>
                        {addingExtra ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-plus" /> Adicionar</>}
                      </button>
                    </div>

                    {/* Lista de produtos — tabela estilo Omie */}
                    {produtosComSaldo.length > 0 && (
                      <div style={{ border: "1px solid var(--ppv-border, #E2E8F0)", borderRadius: 12, overflow: "hidden" }}>
                        {/* Cabeçalho */}
                        <div style={{ display: "grid", gridTemplateColumns: "168px 82px minmax(220px,1fr) 132px 132px 50px", gap: 10, alignItems: "center", padding: "11px 16px", background: "#F8FAFC", borderBottom: "1px solid var(--ppv-border, #E2E8F0)", fontSize: 12.5, fontWeight: 500, color: "#94A3B8", textTransform: "uppercase", letterSpacing: 0.3 }}>
                          <span>Produto</span><span style={{ textAlign: "center" }}>Qtd</span><span>Descrição</span><span style={{ textAlign: "right" }}>Preço un.</span><span style={{ textAlign: "right" }}>Total</span><span />
                        </div>
                        {produtosComSaldo.map((p, i) => {
                          const isDevolvido = p.saldo === 0;
                          const isParcial = p.saldo > 0 && p.qtdDev > 0;
                          const editando = editandoPrecoCod === p.codigo;
                          const isPrimario = (p.empresa || "").toLowerCase().includes("primari");
                          return (
                            <div key={p.codigo} style={{ display: "grid", gridTemplateColumns: "168px 82px minmax(220px,1fr) 132px 132px 50px", gap: 10, alignItems: "center", padding: "14px 16px", borderBottom: i < produtosComSaldo.length - 1 ? "1px solid #E2E8F0" : "none", background: isDevolvido ? "#FAFAFA" : "#fff", opacity: isDevolvido ? 0.7 : 1, fontSize: 15.5 }}>
                              {/* Produto */}
                              <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                                <button type="button" onClick={() => setDetalheProd({ codigo: p.codigo, descricao: p.descricao })}
                                  title="Ver informações do produto (estoque, CMC, valor...)"
                                  style={{ padding: 0, border: "none", background: "transparent", cursor: "pointer", fontWeight: 500, fontSize: "inherit", fontFamily: "inherit", color: "#2563EB", textDecoration: isDevolvido ? "line-through" : "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                                  {p.codigo}<i className="fas fa-circle-info" style={{ fontSize: 11, color: "#93C5FD" }} />
                                </button>
                                {p.empresa && <span style={{ fontSize: 11, fontWeight: 500, padding: "1px 7px", borderRadius: 6, background: isPrimario ? "#DBEAFE" : "#FEE2E2", color: isPrimario ? "#2563EB" : "#DC2626" }}>{isPrimario ? "CASTRO" : "NOVA"}</span>}
                              </div>
                              {/* Qtd / saldo + status */}
                              <div style={{ textAlign: "center", lineHeight: 1.3 }}>
                                <div style={{ fontWeight: 500 }}>{p.saldo}</div>
                                {p.qtdDev > 0
                                  ? <div style={{ fontSize: 11.5, color: "#EF4444" }}>de {p.quantidade} · dev {p.qtdDev}</div>
                                  : <div style={{ fontSize: 11, fontWeight: 500, color: isParcial ? "#B45309" : "#16A34A" }}>{isDevolvido ? "DEVOLVIDO" : isParcial ? "PARCIAL" : "ATIVO"}</div>}
                              </div>
                              {/* Descrição */}
                              <div style={{ minWidth: 0, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={p.descricao}>{p.descricao}</div>
                              {/* Preço un. (editável) */}
                              <div style={{ textAlign: "right" }}>
                                {editando ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                                    <input type="number" step="0.01" min="0" autoFocus value={editandoPrecoVal} onChange={(e) => setEditandoPrecoVal(e.target.value)}
                                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); salvarPrecoItem(p.codigo); } if (e.key === "Escape") { setEditandoPrecoCod(null); setEditandoPrecoVal(""); } }}
                                      disabled={salvandoPreco} style={{ width: 84, padding: "5px 7px", marginBottom: 0, fontSize: 14, fontWeight: 500, textAlign: "right" }} />
                                    <button type="button" onClick={() => salvarPrecoItem(p.codigo)} disabled={salvandoPreco} title="Salvar" style={{ background: "#10B981", color: "#fff", border: "none", borderRadius: 6, width: 26, height: 26, cursor: "pointer", fontSize: 11, flexShrink: 0 }}><i className={`fas ${salvandoPreco ? "fa-spinner fa-spin" : "fa-check"}`} /></button>
                                    <button type="button" onClick={() => { setEditandoPrecoCod(null); setEditandoPrecoVal(""); }} disabled={salvandoPreco} title="Cancelar" style={{ background: "#EF4444", color: "#fff", border: "none", borderRadius: 6, width: 26, height: 26, cursor: "pointer", fontSize: 11, flexShrink: 0 }}><i className="fas fa-times" /></button>
                                  </div>
                                ) : (
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                                    <span style={{ whiteSpace: "nowrap", color: "#475569" }}>{formatarMoeda(p.preco)}</span>
                                    <button type="button" onClick={() => { setEditandoPrecoCod(p.codigo); setEditandoPrecoVal(p.preco.toFixed(2)); }} title="Editar preço unitário" style={{ background: "transparent", border: "none", color: "#94A3B8", cursor: "pointer", padding: 2, fontSize: 12 }}><i className="fas fa-pen" /></button>
                                  </span>
                                )}
                              </div>
                              {/* Total */}
                              <div style={{ textAlign: "right", fontWeight: 500, color: "#0f172a", whiteSpace: "nowrap" }}>{formatarMoeda(p.saldo * p.preco)}</div>
                              {/* Ação: devolver */}
                              <div style={{ textAlign: "right" }}>
                                {p.saldo > 0 && !editando && (
                                  <button onClick={() => { setDevolucaoProd({ codigo: p.codigo, descricao: p.descricao, preco: p.preco, max: p.saldo }); setDevolucaoOpen(true); }} className="ppv-btn-devolver" title="Devolver / remover"><i className="fas fa-undo-alt" /></button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                </div>

                {/* ── Footer ── */}
              </>
            )}
          </div>

          {/* ── Coluna de ações (estilo Omie) ── */}
          {!loadingData && (
            <div className="ppv-action-rail">
              <button className="ppv-rail-btn primary" onClick={salvar} disabled={salvando || !podeEditar} title={!podeEditar ? MSG_SEM_PERMISSAO : undefined}>
                <i className={`fas ${salvando ? "fa-spinner fa-spin" : "fa-save"}`} /> {salvando ? "Salvando..." : "Salvar"}
              </button>
              <button className="ppv-rail-btn" onClick={gerarPDF} disabled={gerando}>
                <i className={`fas ${gerando ? "fa-spinner fa-spin" : "fa-print"}`} /> {gerando ? "Gerando..." : "Imprimir"}
              </button>
              <button className="ppv-rail-btn" onClick={() => setShowLogs(!showLogs)}>
                <i className="fas fa-history" /> Histórico
              </button>
              <div className="ppv-rail-sep" />
              {!pedidoOmie ? (
                <button className="ppv-rail-btn" onClick={enviarOmie} disabled={enviandoOmie || !podeOmie} title={!podeOmie ? MSG_SEM_PERMISSAO : undefined}>
                  <i className={`fas ${enviandoOmie ? "fa-spinner fa-spin" : "fa-cloud-upload-alt"}`} /> {enviandoOmie ? "Enviando..." : "Enviar Omie"}
                </button>
              ) : (
                <div className="ppv-rail-btn" style={{ color: "#047857", cursor: "default" }} title={`Pedido Omie: ${pedidoOmie}`}>
                  <i className="fas fa-check-circle" style={{ color: "#047857" }} /> Enviado Omie
                </div>
              )}
              <div className="ppv-rail-sep" />
              <button className="ppv-rail-btn ghost" onClick={onClose}>
                <i className="fas fa-times" /> Fechar
              </button>
            </div>
          )}

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
      <ModalProdutoEstoque open={!!detalheProd} codigo={detalheProd?.codigo || null} descricao={detalheProd?.descricao} onClose={() => setDetalheProd(null)} />
      <ModalImportarKit open={kitModalOpen} onClose={() => setKitModalOpen(false)} onImportar={(produtos) => importarKitItens(produtos)} />
      {/* Busca de cliente do PRÓPRIO drawer — escreve direto no estado daqui */}
      <ModalBuscaCliente open={buscaClienteOpen} onClose={() => setBuscaClienteOpen(false)} onSelect={aplicarCliente} />
    </>
  );
}
