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
}

const STATUS_ICON: Record<string, string> = {
  Aguardando: "fa-clock",
  "Em Andamento": "fa-play-circle",
  "Aguardando Para Faturar": "fa-file-invoice-dollar",
  Fechado: "fa-check-circle",
  Cancelado: "fa-times-circle",
};

export default function ModalDetalhes({
  open, ppvId, onClose, onBuscaProduto, onBuscaOS, onBuscaCliente,
  modalOSId, modalOSDisplay, modalProdDisplay,
  onModalProdDisplayChange, onSetModalOS,
  modalClienteNome,
}: Props) {
  const { tecnicos, productCache, showToast, setGlobalLoading } = usePPV();

  const [details, setDetails] = useState<PPVDetalhes | null>(null);
  const [tab, setTab] = useState<"dados" | "itens" | "historico">("dados");
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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [devolucaoOpen, setDevolucaoOpen] = useState(false);
  const [devolucaoProd, setDevolucaoProd] = useState<{ codigo: string; descricao: string; preco: number; max: number } | null>(null);
  const [confirmandoDev, setConfirmandoDev] = useState(false);
  const [visible, setVisible] = useState(false);

  // Buscar dados do cliente (documento, endereço, cidade) pela API
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
    setGlobalLoading(true);
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
      // Buscar dados do cliente
      carregarDadosCliente(d.cliente || "");
    } catch {
      showToast("error", "Erro ao carregar detalhes");
    }
    setGlobalLoading(false);
  }, [setGlobalLoading, showToast, onSetModalOS, carregarDadosCliente]);

  // Quando trocar cliente via modal de busca
  useEffect(() => {
    if (modalClienteNome && open) {
      setCliente(modalClienteNome);
      carregarDadosCliente(modalClienteNome);
    }
  }, [modalClienteNome, open, carregarDadosCliente]);

  useEffect(() => {
    if (open && ppvId) {
      setTab("dados");
      carregarDetalhes(ppvId);
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [open, ppvId, carregarDetalhes]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 200);
  }

  async function carregarHistorico() {
    if (!ppvId) return;
    setLogsLoading(true);
    try { setLogs(await api.buscarHistorico(ppvId)); } catch { setLogs([]); }
    setLogsLoading(false);
  }

  function switchTab(t: "dados" | "itens" | "historico") {
    setTab(t);
    if (t === "historico") carregarHistorico();
  }

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

    if (erros.length > 0) {
      showToast("error", `Campos obrigatórios: ${erros.join(", ")}`);
      return;
    }

    setSalvando(true);
    try {
      await api.editarPedido({
        id: ppvId!, status, observacao, tecnico, cliente,
        motivoCancelamento, pedidoOmie, osId: modalOSId, tipoPedido, motivoSaida,
      });
      showToast("success", "Atualizado com sucesso!");
      handleClose();
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erro");
    }
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
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erro");
    }
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
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Erro");
    }
    setConfirmandoDev(false);
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
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[90] bg-red-900/60 backdrop-blur-sm transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div className={`fixed inset-y-0 right-0 z-[91] flex w-full max-w-[780px] flex-col bg-[#FEF5EE] shadow-2xl transition-transform duration-300 ease-out ${visible ? "translate-x-0" : "translate-x-full"}`}>

        {/* ===== HEADER FIXO ===== */}
        <div className="shrink-0 bg-[#FFFAF5] px-8 pb-5 pt-6 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <button
              onClick={handleClose}
              className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-lg text-slate-500 transition hover:bg-orange-200 hover:text-red-700"
            >
              <i className="fas fa-arrow-left" />
            </button>
            <div className="flex items-center gap-3">
              <button
                onClick={gerarPDF}
                disabled={gerando}
                className="inline-flex items-center gap-2.5 rounded-xl border-2 border-orange-200/60 bg-[#FFFAF5] px-5 py-3 text-sm font-bold text-slate-600 transition hover:border-slate-400 hover:bg-orange-50/30 disabled:opacity-50"
              >
                <i className={`fas ${gerando ? "fa-spinner fa-spin" : "fa-print"} text-base`} />
                {gerando ? "Gerando..." : "Imprimir"}
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className={`inline-flex items-center gap-2.5 rounded-xl px-7 py-3 text-sm font-bold text-white transition active:scale-[0.97] ${salvando ? "bg-slate-400" : "bg-red-600 shadow-lg shadow-red-600/25 hover:bg-red-700"}`}
              >
                <i className={`fas ${salvando ? "fa-spinner fa-spin" : "fa-save"} text-base`} />
                {salvando ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-3xl font-extrabold text-slate-800">#{ppvId}</h2>
              <span
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold"
                style={{ color: statusColor.text, backgroundColor: statusColor.bg }}
              >
                <i className={`fas ${STATUS_ICON[statusNorm] || "fa-circle"}`} />
                {status}
              </span>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Total</div>
              <div className="text-2xl font-extrabold text-red-600">{formatarMoeda(totalFinal)}</div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-5 text-sm text-slate-500">
            <span><i className="fas fa-user mr-2 text-orange-400" />{cliente || "..."}</span>
            <span className="text-slate-300">|</span>
            <span><i className="fas fa-user-cog mr-2 text-orange-400" />{tecnico || "..."}</span>
            <span className="text-slate-300">|</span>
            <span><i className="far fa-calendar mr-2 text-orange-400" />{details ? formatarDataFrontend(details.data) : "..."}</span>
          </div>

          <div className="mt-5 flex gap-2">
            {([
              { key: "dados" as const, label: "Dados", icon: "fa-edit" },
              { key: "itens" as const, label: `Itens (${produtosComSaldo.length})`, icon: "fa-boxes" },
              { key: "historico" as const, label: "Histórico", icon: "fa-history" },
            ]).map((t) => (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                className={`
                  inline-flex items-center gap-2.5 rounded-xl px-6 py-3 text-sm font-bold transition-all
                  ${tab === t.key
                    ? "bg-red-600 text-white shadow-md shadow-red-600/20"
                    : "bg-orange-100 text-slate-400 hover:bg-orange-200 hover:text-red-600"
                  }
                `}
              >
                <i className={`fas ${t.icon} text-base`} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ===== BODY ===== */}
        <div className="flex-1 overflow-y-auto px-8 py-6">

          {/* TAB: DADOS */}
          {tab === "dados" && details && (
            <div className="space-y-6">

              {/* Situação */}
              <div className="rounded-2xl bg-[#FFFAF5] p-6 shadow-sm">
                <label className="mb-3 block text-sm font-bold uppercase tracking-wider text-slate-500">
                  Situação do Pedido <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-5 gap-3">
                  {STATUS_OPTIONS.map((s) => {
                    const sNorm = normalizarStatus(s.value) as StatusKey;
                    const c = STATUS_COLORS[sNorm] || { text: "#64748B", bg: "#F8FAFC" };
                    const active = status === s.value;
                    return (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => setStatus(s.value)}
                        className={`
                          flex flex-col items-center gap-2 rounded-xl border-2 px-3 py-4 text-center transition-all duration-200
                          ${active ? "shadow-lg scale-[1.03]" : "border-transparent bg-orange-50/30 hover:bg-orange-100 opacity-50 hover:opacity-100"}
                        `}
                        style={active ? { borderColor: c.text, backgroundColor: c.bg } : {}}
                      >
                        <i className={`fas ${STATUS_ICON[sNorm] || "fa-circle"} text-xl`} style={{ color: active ? c.text : "#94A3B8" }} />
                        <span className="text-xs font-bold" style={{ color: active ? c.text : "#94A3B8" }}>{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Campos condicionais */}
              {status === "Fechado" && (
                <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-6">
                  <label className="mb-2 flex items-center gap-2 text-sm font-bold text-emerald-700">
                    <i className="fas fa-file-invoice text-base" /> Pedido OMIE <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={pedidoOmie}
                    onChange={(e) => setPedidoOmie(e.target.value)}
                    placeholder="Código do pedido Omie..."
                    className="w-full rounded-xl border-2 border-emerald-300 bg-white px-4 py-3.5 text-base font-medium focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
              )}

              {status === "Cancelado" && (
                <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-6">
                  <label className="mb-2 flex items-center gap-2 text-sm font-bold text-red-700">
                    <i className="fas fa-exclamation-triangle text-base" /> Motivo do Cancelamento <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={motivoCancelamento}
                    onChange={(e) => setMotivoCancelamento(e.target.value)}
                    rows={3}
                    placeholder="Descreva o motivo..."
                    className="w-full resize-none rounded-xl border-2 border-red-300 bg-white px-4 py-3.5 text-base font-medium focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                  />
                </div>
              )}

              {/* Dados do Cliente - SOMENTE LEITURA */}
              <div className="rounded-2xl bg-[#FFFAF5] p-6 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <label className="text-sm font-bold uppercase tracking-wider text-slate-500">
                    <i className="fas fa-user mr-2 text-red-400" />
                    Dados do Cliente <span className="text-red-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={onBuscaCliente}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 active:scale-[0.97]"
                  >
                    <i className="fas fa-exchange-alt" /> Trocar Cliente
                  </button>
                </div>

                {/* Nome editável */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-sm font-semibold text-slate-600">
                    Nome <span className="text-red-400">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={cliente}
                      readOnly
                      className="w-full rounded-xl border-2 border-orange-200/60 bg-orange-50/30 px-4 py-3.5 text-base font-semibold text-slate-700"
                    />
                  </div>
                </div>

                {/* Info somente leitura */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">CPF / CNPJ</div>
                    <div className="mt-1 text-base font-semibold text-slate-700">{clienteDoc || "—"}</div>
                  </div>
                  <div className="rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Cidade</div>
                    <div className="mt-1 text-base font-semibold text-slate-700">{clienteCidade || "—"}</div>
                  </div>
                  <div className="col-span-2 rounded-xl border border-orange-100 bg-orange-50/30 px-4 py-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Endereço</div>
                    <div className="mt-1 text-base font-semibold text-slate-700">{clienteEndereco || "—"}</div>
                  </div>
                </div>
              </div>

              {/* Informações do Pedido */}
              <div className="rounded-2xl bg-[#FFFAF5] p-6 shadow-sm">
                <label className="mb-4 block text-sm font-bold uppercase tracking-wider text-slate-500">
                  Informações do Pedido
                </label>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-600">
                      <i className="fas fa-user-tie mr-2 text-orange-400" />Técnico <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={tecnico}
                      onChange={(e) => setTecnico(e.target.value)}
                      className="w-full rounded-xl border-2 border-orange-200/60 bg-[#FFFAF5] px-4 py-3.5 text-base font-medium text-slate-700 transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/20"
                    >
                      <option value="">Selecionar...</option>
                      {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-600">
                      <i className="fas fa-file-alt mr-2 text-orange-400" />Tipo do Pedido <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={tipoPedido}
                      onChange={(e) => setTipoPedido(e.target.value)}
                      className="w-full rounded-xl border-2 border-orange-200/60 bg-[#FFFAF5] px-4 py-3.5 text-base font-medium text-slate-700 transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/20"
                    >
                      {TIPOS_PEDIDO.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-600">
                      <i className="fas fa-tag mr-2 text-orange-400" />Motivo de Saída <span className="text-red-400">*</span>
                    </label>
                    <select
                      value={motivoSaida}
                      onChange={(e) => setMotivoSaida(e.target.value)}
                      className="w-full rounded-xl border-2 border-orange-200/60 bg-[#FFFAF5] px-4 py-3.5 text-base font-medium text-slate-700 transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/20"
                    >
                      {MOTIVOS_SAIDA.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-600">
                      <i className="fas fa-link mr-2 text-orange-400" />O.S. Vinculada
                    </label>
                    <button
                      type="button"
                      onClick={onBuscaOS}
                      className="flex w-full items-center justify-between rounded-xl border-2 border-dashed border-slate-300 bg-orange-50/30 px-4 py-3.5 text-left text-base font-medium text-slate-600 transition hover:border-red-400 hover:bg-red-50"
                    >
                      <span className="truncate">{modalOSDisplay || "Clique para vincular OS"}</span>
                      <i className="fas fa-search ml-2 text-orange-400" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Observações */}
              <div className="rounded-2xl bg-[#FFFAF5] p-6 shadow-sm">
                <label className="mb-2 block text-sm font-bold uppercase tracking-wider text-slate-500">
                  Observações
                </label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={3}
                  placeholder="Notas sobre o pedido..."
                  className="w-full resize-none rounded-xl border-2 border-orange-200/60 bg-[#FFFAF5] px-4 py-3.5 text-base font-medium transition focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-400/20"
                />
              </div>

              {/* Resumo de valores */}
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-2xl bg-[#FFFAF5] p-5 text-center shadow-sm">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Saídas</div>
                  <div className="mt-1 text-xl font-extrabold text-slate-700">{formatarMoeda(tOrig)}</div>
                </div>
                <div className="rounded-2xl bg-[#FFFAF5] p-5 text-center shadow-sm">
                  <div className="text-xs font-bold uppercase tracking-wider text-red-400">Devoluções</div>
                  <div className="mt-1 text-xl font-extrabold text-red-500">-{formatarMoeda(tDev)}</div>
                </div>
                <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 text-center shadow-sm">
                  <div className="text-xs font-bold uppercase tracking-wider text-red-600">Total Final</div>
                  <div className="mt-1 text-2xl font-extrabold text-red-600">{formatarMoeda(totalFinal)}</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: ITENS */}
          {tab === "itens" && details && (
            <div className="space-y-5">
              <div className="rounded-2xl bg-[#FFFAF5] p-6 shadow-sm">
                <div className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
                  <i className="fas fa-plus-circle mr-2 text-orange-400" /> Adicionar Item Extra
                </div>
                <div className="flex items-end gap-3">
                  <div className="min-w-0 flex-1">
                    <label className="mb-1.5 block text-sm font-semibold text-slate-600">Produto</label>
                    <button
                      type="button"
                      onClick={onBuscaProduto}
                      className={`
                        flex w-full items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3.5 text-left text-base transition-all
                        ${modalProdDisplay ? "border-blue-400 bg-blue-50 font-medium text-blue-700" : "border-slate-300 bg-orange-50/30 text-slate-400 hover:border-red-400 hover:bg-red-50"}
                      `}
                    >
                      <i className={`fas fa-cube text-lg ${modalProdDisplay ? "text-blue-500" : "text-slate-300"}`} />
                      <span className="truncate">{modalProdDisplay || "Clique para buscar produto..."}</span>
                    </button>
                  </div>
                  <div className="w-[100px]">
                    <label className="mb-1.5 block text-sm font-semibold text-slate-600">Qtd</label>
                    <input
                      type="number"
                      value={qtdExtra}
                      onChange={(e) => setQtdExtra(parseInt(e.target.value) || 1)}
                      min={1}
                      className="w-full rounded-xl border-2 border-orange-200/60 bg-[#FFFAF5] px-4 py-3.5 text-center text-base font-bold focus:border-red-400 focus:outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={addExtra}
                    disabled={addingExtra}
                    className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3.5 text-base font-bold text-white transition hover:bg-red-700 active:scale-[0.97] disabled:opacity-50"
                  >
                    {addingExtra ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-plus" /> Adicionar</>}
                  </button>
                </div>
              </div>

              {produtosComSaldo.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-[#FFFAF5] py-16 shadow-sm">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100">
                    <i className="fas fa-box-open text-2xl text-slate-300" />
                  </div>
                  <p className="text-base font-medium text-slate-400">Nenhum item neste pedido</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {produtosComSaldo.map((p) => {
                    const pctDev = p.quantidade > 0 ? (p.qtdDev / p.quantidade) * 100 : 0;
                    const isDevolvido = p.saldo === 0;
                    const isParcial = p.saldo > 0 && p.qtdDev > 0;
                    return (
                      <div
                        key={p.codigo}
                        className={`rounded-2xl border-2 p-5 transition-all ${isDevolvido ? "border-orange-200/60 bg-orange-100 opacity-50" : "border-orange-200/60 bg-[#FFFAF5] shadow-sm hover:border-slate-300"}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                              <span className="text-base font-bold text-slate-700">{p.codigo}</span>
                              {isDevolvido && <span className="rounded-lg bg-orange-200/60 px-3 py-1 text-xs font-bold text-slate-500">DEVOLVIDO</span>}
                              {isParcial && <span className="rounded-lg bg-amber-100 px-3 py-1 text-xs font-bold text-amber-600">PARCIAL</span>}
                              {!isDevolvido && !isParcial && <span className="rounded-lg bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-600">ATIVO</span>}
                            </div>
                            <div className="mt-1 text-sm text-slate-500">{p.descricao}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-slate-700">{formatarMoeda(p.saldo * p.preco)}</div>
                            <div className="text-sm text-slate-400">{formatarMoeda(p.preco)} / un.</div>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center gap-4">
                          <div className="flex-1">
                            <div className="h-3 overflow-hidden rounded-full bg-orange-100">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${100 - pctDev}%`, backgroundColor: isDevolvido ? "#CBD5E1" : isParcial ? "#F59E0B" : "#10B981" }}
                              />
                            </div>
                            <div className="mt-1.5 flex justify-between text-sm text-slate-500">
                              <span>Saldo: <strong>{p.saldo}</strong> de {p.quantidade}</span>
                              {p.qtdDev > 0 && <span className="font-semibold text-red-400">Devolvido: {p.qtdDev}</span>}
                            </div>
                          </div>
                          {p.saldo > 0 && (
                            <button
                              onClick={() => { setDevolucaoProd({ codigo: p.codigo, descricao: p.descricao, preco: p.preco, max: p.saldo }); setDevolucaoOpen(true); }}
                              className="inline-flex items-center gap-2 rounded-xl border-2 border-orange-200/60 bg-[#FFFAF5] px-5 py-2.5 text-sm font-bold text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-500"
                            >
                              <i className="fas fa-undo-alt" /> Devolver
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: HISTÓRICO */}
          {tab === "historico" && (
            <div>
              {logsLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-orange-200 border-t-red-600" />
                  <p className="text-base text-slate-400">Carregando histórico...</p>
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-[#FFFAF5] py-16 shadow-sm">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-100">
                    <i className="fas fa-history text-2xl text-slate-300" />
                  </div>
                  <p className="text-base font-medium text-slate-400">Nenhuma ação registrada</p>
                </div>
              ) : (
                <div className="relative ml-5 border-l-[3px] border-orange-200/60 pl-8">
                  {logs.map((l, idx) => (
                    <div key={idx} className="relative mb-6">
                      <div className="absolute -left-[41px] top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#FFFAF5]">
                        <div className={`h-3.5 w-3.5 rounded-full ${idx === 0 ? "bg-red-600" : "bg-orange-300"}`} />
                      </div>
                      <div className="rounded-2xl bg-[#FFFAF5] p-5 shadow-sm">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-500"><i className="far fa-clock mr-2" />{l.data_hora}</span>
                          <span className="text-sm font-semibold text-red-600"><i className="far fa-user mr-2" />{l.usuario_email}</span>
                        </div>
                        <div className="text-base text-slate-700">{l.acao}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ModalDevolucao open={devolucaoOpen} produto={devolucaoProd} onClose={() => setDevolucaoOpen(false)} onConfirm={confirmarDevolucao} confirmando={confirmandoDev} />
    </>
  );
}
