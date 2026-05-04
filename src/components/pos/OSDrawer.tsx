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
  userName?: string;
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

function horaAtualBR() {
  const n = new Date();
  const brMs = n.getTime() + (n.getTimezoneOffset() * 60000) - (3 * 3600000);
  const br = new Date(brMs);
  return `${String(br.getHours()).padStart(2, '0')}:${String(br.getMinutes()).padStart(2, '0')}`;
}

export default function OSDrawer({ visible, mode, osId, clientes, tecnicos, userName, onClose, onSaved }: OSDrawerProps) {
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
  const [qtdHoras, setQtdHoras] = useState(1);
  const [qtdKm, setQtdKm] = useState(0);
  const [descPorc, setDescPorc] = useState(0);
  const [descValor, setDescValor] = useState(0);
  const [descHoraValor, setDescHoraValor] = useState(0);
  const [descKmValor, setDescKmValor] = useState(0);
  const [ordemOmie, setOrdemOmie] = useState("");
  const [motivoCancel, setMotivoCancel] = useState("");
  const [temSubstituto, setTemSubstituto] = useState(false);
  const [substitutoTipo, setSubstitutoTipo] = useState<"POS" | "PPV">("POS");
  const [substitutoId, setSubstitutoId] = useState("");
  const [listaOSAbertas, setListaOSAbertas] = useState<Array<{ id: string; cliente: string; status: string }>>([]);
  const [listaPPVAbertos, setListaPPVAbertos] = useState<Array<{ id: string; cliente: string; status: string }>>([]);
  const [relatorioTecnico, setRelatorioTecnico] = useState("");
  const [previsaoExecucao, setPrevisaoExecucao] = useState("");
  const [previsaoFaturamento, setPrevisaoFaturamento] = useState("");
  const [dataFimServico, setDataFimServico] = useState("");
  const [horaInicioServico, setHoraInicioServico] = useState("");
  const [diasExecucao, setDiasExecucao] = useState<string[]>([]);
  const [servicoNumero, setServicoNumero] = useState(0);
  const [horaInicioExec, setHoraInicioExec] = useState(() => {
    return horaAtualBR();
  });
  const [horaChegada, setHoraChegada] = useState("");
  const [horaFimExec, setHoraFimExec] = useState("");
  const [agendaTecnico, setAgendaTecnico] = useState<Array<{ id_ordem: string; cliente: string; hora_inicio: string; hora_fim: string; qtd_horas: number }>>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [totalPecas, setTotalPecas] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [showProjModal, setShowProjModal] = useState(false);
  const [showRevModal, setShowRevModal] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [requisicoes, setRequisicoes] = useState<Array<{ id: string; atualizada: boolean; valor: number; material: string; solicitante: string }>>([]);
  const [desvinculandoReq, setDesvinculandoReq] = useState<string | null>(null);
  const [justificativaDesvinc, setJustificativaDesvinc] = useState("");
  const [clienteFilter, setClienteFilter] = useState("");
  const [gerarPPV, setGerarPPV] = useState(false);
  const [servicoOficina, setServicoOficina] = useState(false);
  const [alimentacaoTecnico, setAlimentacaoTecnico] = useState(false);
  const [alimentacaoValor, setAlimentacaoValor] = useState(0);
  const [alimentacaoNoPdf, setAlimentacaoNoPdf] = useState(false);
  const [enviandoOmie, setEnviandoOmie] = useState(false);
  const [showDescontos, setShowDescontos] = useState(false);
  const [dadosTecnico, setDadosTecnico] = useState<any>(null);
  const [fotoExpandida, setFotoExpandida] = useState<string | null>(null);
  const [lembretes, setLembretes] = useState<Array<{ id: number; lembrete: string }>>([]);
  const [editingLembreteId, setEditingLembreteId] = useState<number | null>(null);
  const [editingLembreteText, setEditingLembreteText] = useState("");
  const [estimativa, setEstimativa] = useState<{
    ida: { distancia_km: number; tempo_min: number };
    volta: { distancia_km: number; tempo_min: number };
    servico: { horas: number; tempo_min: number };
    total: { tempo_min: number; tempo_horas: number; distancia_total_km: number };
    enderecoUsado: string;
    fonte?: string;
    enderecosDisponiveis?: { label: string; fonte: string; endereco: string }[];
  } | null>(null);
  const [loadingEstimativa, setLoadingEstimativa] = useState(false);
  const [erroEstimativa, setErroEstimativa] = useState("");
  const [enderecoEstimativa, setEnderecoEstimativa] = useState("");
  const [enderecosDisponiveis, setEnderecosDisponiveis] = useState<{ label: string; fonte: string; endereco: string }[]>([]);

  // Ref para evitar loop circular entre diasExecucao <-> qtdHoras

  // Auto-calcular hora chegada (início + tempo_ida) e hora fim (chegada + qtdHoras)
  useEffect(() => {
    if (!horaInicioExec) return;
    const [h, m] = horaInicioExec.split(':').map(Number);
    const inicioMin = h * 60 + m;
    const idaMin = estimativa?.ida?.tempo_min || 0;
    const chegadaMin = inicioMin + idaMin;
    const ch = Math.floor(chegadaMin / 60);
    const cm = Math.round(chegadaMin % 60);
    setHoraChegada(`${String(ch).padStart(2, '0')}:${String(cm).padStart(2, '0')}`);
    if (qtdHoras && qtdHoras > 0) {
      const fimMin = chegadaMin + qtdHoras * 60;
      const fh = Math.floor(fimMin / 60);
      const fm = Math.round(fimMin % 60);
      setHoraFimExec(`${String(fh).padStart(2, '0')}:${String(fm).padStart(2, '0')}`);
    }
  }, [horaInicioExec, qtdHoras, estimativa]);

  // diasExecucao agora só tem datas, sem horários

  // Sync: qtdHoras manual
  const handleQtdHorasChange = useCallback((novaQtd: number) => {
    setQtdHoras(novaQtd);
  }, []);

  // Buscar agenda do técnico quando muda técnico + data de execução
  useEffect(() => {
    if (!tecnico1 || !previsaoExecucao) { setAgendaTecnico([]); return; }
    fetch(`/api/pos/agenda-visao?data=${previsaoExecucao}&tecnico=${encodeURIComponent(tecnico1)}`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: any[]) => {
        const outros = rows
          .filter((r: any) => r.id_ordem && String(r.id_ordem) !== String(osId))
          .map((r: any) => ({ id_ordem: r.id_ordem, cliente: r.cliente || '', hora_inicio: r.hora_inicio || '', hora_fim: r.hora_fim || '', qtd_horas: r.qtd_horas || 0 }));
        setAgendaTecnico(outros);
      })
      .catch(() => setAgendaTecnico([]));
  }, [tecnico1, previsaoExecucao, osId]);

  // Verificar quantos serviços em execução o técnico tem
  useEffect(() => {
    if (!tecnico1) { setServicoNumero(0); return; }
    fetch(`/api/pos/tecnicos?contarServicos=${encodeURIComponent(tecnico1)}&osAtual=${osId || ''}`)
      .then(r => r.ok ? r.json() : { servicosEmExecucao: 0 })
      .then((data: any) => {
        setServicoNumero((data.servicosEmExecucao || 0) + 1);
      })
      .catch(() => setServicoNumero(0));
  }, [tecnico1, osId]);

  // Carregar listas para dropdown de substituto
  useEffect(() => {
    if (!temSubstituto) return;
    if (substitutoTipo === "POS" && listaOSAbertas.length === 0) {
      fetch("/api/pos/ordens").then(r => r.json()).then((data) => {
        if (Array.isArray(data)) setListaOSAbertas(data.filter((o: any) => o.Status !== "Cancelada" && o.Status !== "Concluída" && String(o.Id_Ordem) !== osId).map((o: any) => ({ id: String(o.Id_Ordem), cliente: o.Os_Cliente || "", status: o.Status || "" })));
      }).catch(() => {});
    }
    if (substitutoTipo === "PPV" && listaPPVAbertos.length === 0) {
      fetch("/api/ppv/pedidos").then(r => r.json()).then((data) => {
        if (Array.isArray(data)) setListaPPVAbertos(data.filter((p: any) => p.status !== "Cancelado" && p.status !== "Fechado").map((p: any) => ({ id: p.id, cliente: p.cliente || "", status: p.status || "" })));
      }).catch(() => {});
    }
  }, [temSubstituto, substitutoTipo]);

  // ── Derived values (useMemo) ──
  const subtotalHoras = qtdHoras * VALOR_HORA;
  const subtotalKm = qtdKm * VALOR_KM;
  const subtotalBruto = subtotalHoras + subtotalKm + totalPecas;

  const totalRequisicoes = useMemo(() => requisicoes.reduce((s, r) => s + (r.valor || 0), 0), [requisicoes]);

  const total = useMemo(() => {
    const sub = (subtotalHoras - descHoraValor) + (subtotalKm - descKmValor) + totalPecas + totalRequisicoes;
    return Math.max(0, sub - descValor);
  }, [subtotalHoras, subtotalKm, totalPecas, totalRequisicoes, descValor, descHoraValor, descKmValor]);

  const bombaAlerta = useMemo(
    () => tipoServico === "Revisão" && !!revisao && BOMBA_HORAS.some((h) => revisao.includes(h)),
    [tipoServico, revisao]
  );

  const totalDescontos = descHoraValor + descKmValor + descValor;

  // Auto-calcular estimativa quando clienteInfo e qtdHoras mudam
  const estimativaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    // Limpar timer anterior
    if (estimativaTimerRef.current) clearTimeout(estimativaTimerRef.current);

    if (!clienteInfo?.cpf && !clienteInfo?.endereco) {
      setEstimativa(null);
      return;
    }
    if (!qtdHoras || qtdHoras <= 0) {
      setEstimativa(null);
      return;
    }

    setLoadingEstimativa(true);
    // Debounce de 600ms para não fazer chamadas demais
    estimativaTimerRef.current = setTimeout(async () => {
      setErroEstimativa("");
      try {
        const res = await fetch("/api/pos/estimativa", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cnpj: clienteInfo?.cpf || "",
            endereco: clienteInfo?.endereco || "",
            cidade: (clienteInfo as unknown as Record<string, unknown>)?.cidade || "",
            qtdHoras,
          }),
        });
        const data = await res.json();
        if (data.enderecosDisponiveis) setEnderecosDisponiveis(data.enderecosDisponiveis);
        if (!res.ok || data.erro) {
          setErroEstimativa(data.erro || "Erro ao calcular estimativa");
          setEstimativa(null);
        } else {
          setEstimativa(data);
          setEnderecoEstimativa(data.enderecoUsado || "");
        }
      } catch {
        setErroEstimativa("Erro de conexão");
        setEstimativa(null);
      }
      setLoadingEstimativa(false);
    }, 600);

    return () => { if (estimativaTimerRef.current) clearTimeout(estimativaTimerRef.current); };
  }, [clienteInfo, qtdHoras]);

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
      const res = await fetch(`/api/pos/ordens/${osId}/omie`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userName }) });
      const result = await res.json();
      if (result.sucesso) {
        let msg = `OS enviada para o Omie com sucesso!\nNº Omie: ${result.cNumOS}`;
        if (result.pedidoVenda) msg += `\nPedido de Venda nº ${result.pedidoVenda}`;
        if (result.pedidoVendaErro) msg += `\nErro no Pedido de Venda: ${result.pedidoVendaErro}`;
        alert(msg);
        setOrdemOmie(String(result.nCodOS));
        setStatus("Concluída");
        setLogRefreshKey((k) => k + 1);
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
    if (status === "Cancelada" && !motivoCancel.trim()) { alert("Informe o motivo do cancelamento"); return; }
    if (status === "Cancelada" && temSubstituto && !substitutoId.trim()) { alert("Informe o ID do substituto"); return; }
    setSaving(true);
    const dados = {
      id: osId, nomeCliente: clienteInfo?.nome, cpfCliente: clienteInfo?.cpf,
      enderecoCliente: servicoOficina ? 'Nova Tratores - Av. São Sebastião, 1065 - Vila Campos, Piraju - SP' : clienteInfo?.endereco,
      cidadeCliente: servicoOficina ? 'Piraju' : (clienteInfo?.cidade || ''), tecnicoResponsavel: tecnico1, tecnico2,
      tipoServico, revisao, projeto, servicoSolicitado: servSolicitado,
      qtdHoras, qtdKm, ppv, status: mode === "create" ? "Orçamento" : status,
      ordemOmie, motivoCancelamento: motivoCancel,
      substitutoTipo: temSubstituto ? substitutoTipo : null,
      substitutoId: temSubstituto ? substitutoId : null,
      descontoValor: descValor, descontoHora: descHoraValor, descontoKm: descKmValor,
      relatorioTecnico,
      diasExecucao: diasExecucao.sort().join(','),
      previsaoExecucao,
      previsaoFaturamento,
      dataFimServico,
      horaInicioServico,
      servicoNumero,
      horaInicioExec,
      horaFimExec,
      horaChegada,
      gerarPPV: mode === "create" && tipoServico === "Revisão" && gerarPPV,
      servicoOficina,
      alimentacaoTecnico,
      alimentacaoValor: alimentacaoTecnico ? alimentacaoValor : 0,
      alimentacaoNoPdf: alimentacaoTecnico ? alimentacaoNoPdf : false,
      userName,
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
      setLogRefreshKey((k) => k + 1);
      onClose();
      onSaved();
    } catch (err) {
      console.error("Erro ao salvar:", err);
      alert("Erro ao salvar a OS.");
      setSaving(false);
    }
  }, [mode, osId, clienteChave, clienteInfo, tecnico1, tecnico2, tipoServico, revisao, projeto,
      servSolicitado, qtdHoras, qtdKm, ppv, status, ordemOmie, motivoCancel, descValor,
      descHoraValor, descKmValor, relatorioTecnico, previsaoExecucao, previsaoFaturamento, dataFimServico, servicoNumero,
      gerarPPV, servicoOficina, horaInicioExec, horaChegada, horaFimExec, onClose, onSaved]);

  // ── Reset form to defaults ──
  const resetForm = useCallback(() => {
    setClienteChave(""); setClienteInfo(null); setStatus("Orçamento");
    setTecnico1(""); setTecnico2(""); setTipoServico("Manutenção");
    setProjeto(""); setRevisao(""); setServSolicitado(TEXT_TEMPLATE);
    setPpv(""); setQtdHoras(1); setQtdKm(0); setDescPorc(0); setDescValor(0); setDescHoraValor(0); setDescKmValor(0);
    setOrdemOmie(""); setMotivoCancel(""); setTemSubstituto(false); setSubstitutoTipo("POS"); setSubstitutoId("");
    setRelatorioTecnico("");
    const agora = new Date()
    const hojeStr = agora.toISOString().slice(0, 10)
    const horaStr = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`
    setPrevisaoExecucao(hojeStr)
    setPrevisaoFaturamento(""); setDataFimServico(""); setDiasExecucao([]); setServicoNumero(0); setHoraInicioExec(horaStr); setHoraChegada(""); setHoraFimExec(""); setAgendaTecnico([]);
    setEstimativa(null); setErroEstimativa(""); setLoadingEstimativa(false); setEnderecoEstimativa(""); setEnderecosDisponiveis([]);
    setProdutos([]); setTotalPecas(0); setShowLogs(false); setRequisicoes([]);
    setGerarPPV(false); setShowDescontos(false); setLoadingData(false);
    setLembretes([]); setEditingLembreteId(null);
    setServicoOficina(false);
    setAlimentacaoTecnico(false); setAlimentacaoValor(0); setAlimentacaoNoPdf(false);
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
          setClienteInfo({ nome: d.nomeCliente, cpf: d.cpfCliente || "", email: "", telefone: "", endereco: d.enderecoCliente || "", cidade: d.cidadeCliente || "" });
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
          setTemSubstituto(!!(d.substitutoTipo && d.substitutoId));
          setSubstitutoTipo(d.substitutoTipo || "POS");
          setSubstitutoId(d.substitutoId || "");
          setRelatorioTecnico(d.relatorioTecnico || "");
          setPrevisaoExecucao(d.previsaoExecucao || "");
          setPrevisaoFaturamento(d.previsaoFaturamento || "");
          setDataFimServico(d.dataFimServico || "");
          setHoraInicioServico(d.horaInicioServico || "");
          setDiasExecucao(d.diasExecucao ? d.diasExecucao.split(',').filter(Boolean) : []);
          setHoraInicioExec(d.horaInicioExec || horaAtualBR());
          setHoraChegada(d.horaChegada || "");
          setHoraFimExec(d.horaFimExec || "");
          setRequisicoes(d.infoRequisicoes || []);
          setServicoOficina(!!d.servicoOficina);
          setAlimentacaoTecnico(!!d.alimentacaoTecnico);
          setAlimentacaoValor(parseFloat(d.alimentacaoValor || 0));
          setAlimentacaoNoPdf(!!d.alimentacaoNoPdf);
          setDadosTecnico(d.dadosTecnico || null);
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

                  {/* ── Cliente (create + edit) ── */}
                  <div className="os-card">
                    <div className="os-card-title"><i className="fas fa-user" /> {mode === "edit" ? "Alterar Cliente" : "Cliente"}</div>
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
                    {clienteInfo && !clienteFilter && (
                      <div className="os-client-badge">
                        <div><i className="fas fa-check-circle" /> {clienteInfo.nome}
                        {clienteInfo.cpf && <span style={S_CLIENT_BADGE_CPF}>({clienteInfo.cpf})</span>}</div>
                        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="fas fa-map-marker-alt" style={{ color: '#7A6E5D', fontSize: 12, flexShrink: 0 }} />
                            <input
                              type="text"
                              value={clienteInfo.endereco || ''}
                              onChange={(e) => setClienteInfo(prev => prev ? { ...prev, endereco: e.target.value } : prev)}
                              placeholder="Endereço do cliente..."
                              style={{ flex: 1, fontSize: 12, padding: '5px 8px', border: '1px solid #E0D6C8', borderRadius: 6, background: '#FAFAF5', color: '#333', outline: 'none' }}
                            />
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <i className="fas fa-city" style={{ color: '#7A6E5D', fontSize: 12, flexShrink: 0 }} />
                            <input
                              type="text"
                              value={clienteInfo.cidade || ''}
                              onChange={(e) => setClienteInfo(prev => prev ? { ...prev, cidade: e.target.value } : prev)}
                              placeholder="Cidade..."
                              style={{ flex: 1, fontSize: 12, padding: '5px 8px', border: '1px solid #E0D6C8', borderRadius: 6, background: '#FAFAF5', color: '#333', outline: 'none' }}
                            />
                          </div>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: servicoOficina ? '#065F46' : '#7A6E5D' }}>
                          <input
                            type="checkbox"
                            checked={servicoOficina}
                            onChange={(e) => setServicoOficina(e.target.checked)}
                            style={{ width: 16, height: 16, accentColor: '#065F46' }}
                          />
                          <i className="fas fa-warehouse" style={{ fontSize: 14 }} />
                          Serviço realizado na oficina
                        </label>
                        {servicoOficina && (
                          <div style={{ fontSize: 11, color: '#065F46', marginTop: 4, background: '#D1FAE5', padding: '4px 8px', borderRadius: 4 }}>
                            <i className="fas fa-map-marker-alt" style={{ marginRight: 4 }} />
                            Endereço será salvo como: Nova Tratores - Piraju (SP)
                          </div>
                        )}
                      </div>
                    )}
                  </div>

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
                          <label>Motivo do Cancelamento *</label>
                          <textarea rows={2} value={motivoCancel} onChange={(e) => setMotivoCancel(e.target.value)} placeholder="Descreva o motivo do cancelamento..." style={{ marginBottom: 12 }} />
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: temSubstituto ? 10 : 0 }}>
                            <input type="checkbox" id="temSubstituto" checked={temSubstituto} onChange={(e) => { setTemSubstituto(e.target.checked); if (!e.target.checked) { setSubstitutoId(""); } }} />
                            <label htmlFor="temSubstituto" style={{ margin: 0, fontWeight: 600, cursor: "pointer" }}>Tem substituto?</label>
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

                  {/* ── Relatório Técnico ── */}
                  {mode === "edit" && relatorioTecnico && (
                    <div className="os-card">
                      <div className="os-card-title"><i className="fas fa-file-pdf" /> Relatório Técnico</div>
                      <a
                        href={relatorioTecnico}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "12px 16px", borderRadius: 10,
                          background: "#D1FAE5", border: "1.5px solid #6EE7B7",
                          color: "#065F46", fontWeight: 600, fontSize: 13,
                          textDecoration: "none", cursor: "pointer",
                        }}
                      >
                        <i className="fas fa-check-circle" style={{ color: "#059669" }} />
                        <span style={{ flex: 1 }}>Relatório enviado pelo técnico</span>
                        <i className="fas fa-external-link-alt" style={{ fontSize: 11 }} />
                      </a>
                    </div>
                  )}

                  {/* ── Carta de Correção ── */}
                  {mode === "edit" && dadosTecnico?.cartaCorrecao && (
                    <div className="os-card">
                      <div className="os-card-title"><i className="fas fa-pen-to-square" /> Carta de Correção</div>
                      <div style={{
                        background: "#FFFBEB", borderRadius: 10, padding: "14px 16px",
                        border: "1.5px solid #FDE68A", fontSize: 13, color: "#92400E",
                        lineHeight: 1.7, whiteSpace: "pre-wrap",
                      }}>
                        {dadosTecnico.cartaCorrecao}
                      </div>
                      <div style={{ fontSize: 11, color: "#D97706", marginTop: 8, fontWeight: 600 }}>
                        <i className="fas fa-triangle-exclamation" style={{ marginRight: 4 }} />
                        Correção enviada pelo técnico
                      </div>
                    </div>
                  )}

                  {/* ── Dados do Técnico (fotos, diagnostico, etc) ── */}
                  {mode === "edit" && dadosTecnico && (
                    <div className="os-card">
                      <div className="os-card-title"><i className="fas fa-user-hard-hat" /> Dados do Técnico</div>

                      {/* Info resumida */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        {dadosTecnico.diagnostico && (
                          <div style={{ gridColumn: "1 / -1", background: "#F9FAFB", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Diagnóstico</div>
                            <div style={{ fontSize: 12, color: "#374151" }}>{dadosTecnico.diagnostico}</div>
                          </div>
                        )}
                        {dadosTecnico.servicoRealizado && (
                          <div style={{ gridColumn: "1 / -1", background: "#F9FAFB", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Serviço Realizado</div>
                            <div style={{ fontSize: 12, color: "#374151" }}>{dadosTecnico.servicoRealizado}</div>
                          </div>
                        )}
                        {dadosTecnico.chassis && (
                          <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Chassis</div>
                            <div style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{dadosTecnico.chassis}</div>
                          </div>
                        )}
                        {dadosTecnico.horimetro && (
                          <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Horímetro</div>
                            <div style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{dadosTecnico.horimetro}</div>
                          </div>
                        )}
                        {dadosTecnico.totalHora && (
                          <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Horas Técnico</div>
                            <div style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{dadosTecnico.totalHora}</div>
                          </div>
                        )}
                        {dadosTecnico.totalKm && (
                          <div style={{ background: "#F9FAFB", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>KM Técnico</div>
                            <div style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>{dadosTecnico.totalKm} km</div>
                          </div>
                        )}
                        {dadosTecnico.nomResponsavel && (
                          <div style={{ gridColumn: "1 / -1", background: "#F9FAFB", borderRadius: 8, padding: "8px 12px" }}>
                            <div style={{ fontSize: 10, color: "#9CA3AF", fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Responsável (cliente)</div>
                            <div style={{ fontSize: 12, color: "#374151" }}>{dadosTecnico.nomResponsavel}</div>
                          </div>
                        )}
                      </div>

                      {/* Peças extras */}
                      {dadosTecnico.pecasExtras?.length > 0 && (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#D97706", textTransform: "uppercase", marginBottom: 6 }}>
                            <i className="fas fa-exclamation-triangle" style={{ marginRight: 4 }} />
                            Peças/Serviços Extras ({dadosTecnico.pecasExtras.length})
                          </div>
                          {dadosTecnico.pecasExtras.map((p: any, i: number) => (
                            <div key={i} style={{
                              background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8,
                              padding: "6px 10px", marginBottom: 4, fontSize: 12, color: "#92400E",
                            }}>
                              {p.descricao || "Sem descrição"} — Qtd: {p.qtdUsada || 1}
                            </div>
                          ))}
                          {dadosTecnico.justificativaPecaExtra && (
                            <div style={{
                              background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8,
                              padding: "8px 10px", marginTop: 4, fontSize: 12, color: "#991B1B",
                            }}>
                              <strong>Justificativa:</strong> {dadosTecnico.justificativaPecaExtra}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Fotos organizadas por categoria */}
                      {(() => {
                        const fotos = dadosTecnico.fotos || {};
                        const categorias = [
                          { titulo: "Identificação", cor: "#1E3A5F", items: [
                            { label: "Horímetro", url: fotos.horimetro },
                            { label: "Chassis", url: fotos.chassis },
                          ]},
                          { titulo: "Equipamento", cor: "#1E3A5F", items: [
                            { label: "Frente", url: fotos.frente },
                            { label: "Direita", url: fotos.direita },
                            { label: "Esquerda", url: fotos.esquerda },
                            { label: "Traseira", url: fotos.traseira },
                            { label: "Volante", url: fotos.volante },
                          ]},
                          { titulo: "Falha / Defeito", cor: "#DC2626", items: [
                            { label: "Falha 1", url: fotos.falha1 },
                            { label: "Falha 2", url: fotos.falha2 },
                            { label: "Falha 3", url: fotos.falha3 },
                            { label: "Falha 4", url: fotos.falha4 },
                          ]},
                          { titulo: "Peças", cor: "#D97706", items: [
                            { label: "Peça Nova 1", url: fotos.pecaNova1 },
                            { label: "Peça Nova 2", url: fotos.pecaNova2 },
                            { label: "Instalada 1", url: fotos.pecaInstalada1 },
                            { label: "Instalada 2", url: fotos.pecaInstalada2 },
                          ]},
                        ];

                        return categorias.map((cat) => {
                          const comFoto = cat.items.filter(f => f.url);
                          if (comFoto.length === 0) return null;
                          return (
                            <div key={cat.titulo} style={{ marginBottom: 12 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: cat.cor, textTransform: "uppercase", marginBottom: 6 }}>
                                {cat.titulo} ({comFoto.length})
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 6 }}>
                                {comFoto.map((f) => (
                                  <div key={f.label} style={{ cursor: "pointer" }} onClick={() => setFotoExpandida(f.url)}>
                                    <img
                                      src={f.url}
                                      alt={f.label}
                                      style={{ width: "100%", height: 70, objectFit: "cover", borderRadius: 8, border: "1.5px solid #E5E7EB" }}
                                    />
                                    <div style={{ fontSize: 9, color: "#6B7280", textAlign: "center", marginTop: 2, fontWeight: 600 }}>{f.label}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        });
                      })()}

                      {/* Assinaturas */}
                      {(dadosTecnico.assinaturas?.cliente || dadosTecnico.assinaturas?.tecnico) && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#1E3A5F", textTransform: "uppercase", marginBottom: 6 }}>
                            Assinaturas
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                            {dadosTecnico.assinaturas.cliente && (
                              <div style={{ cursor: "pointer" }} onClick={() => setFotoExpandida(dadosTecnico.assinaturas.cliente)}>
                                <img src={dadosTecnico.assinaturas.cliente} alt="Assinatura Cliente"
                                  style={{ width: "100%", height: 60, objectFit: "contain", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff" }} />
                                <div style={{ fontSize: 9, color: "#6B7280", textAlign: "center", marginTop: 2, fontWeight: 600 }}>Cliente</div>
                              </div>
                            )}
                            {dadosTecnico.assinaturas.tecnico && (
                              <div style={{ cursor: "pointer" }} onClick={() => setFotoExpandida(dadosTecnico.assinaturas.tecnico)}>
                                <img src={dadosTecnico.assinaturas.tecnico} alt="Assinatura Técnico"
                                  style={{ width: "100%", height: 60, objectFit: "contain", borderRadius: 8, border: "1.5px solid #E5E7EB", background: "#fff" }} />
                                <div style={{ fontSize: 9, color: "#6B7280", textAlign: "center", marginTop: 2, fontWeight: 600 }}>Técnico</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Modal foto expandida ── */}
                  {fotoExpandida && (
                    <div
                      onClick={() => setFotoExpandida(null)}
                      style={{
                        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
                        zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "zoom-out",
                      }}
                    >
                      <img src={fotoExpandida} alt="Foto expandida"
                        style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8 }} />
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

                  {/* ── Datas do Serviço ── */}
                  <div className="os-card">
                    <div className="os-card-title"><i className="fas fa-calendar-alt" /> Datas do Serviço</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>Data Início Serviço</label>
                        <input type="date" value={previsaoExecucao} onChange={(e) => {
                          setPrevisaoExecucao(e.target.value)
                          if (!e.target.value || !dataFimServico) return
                          const start = new Date(e.target.value + 'T12:00:00')
                          const end = new Date(dataFimServico + 'T12:00:00')
                          if (start > end) return
                          const days: string[] = []
                          const cur = new Date(start)
                          while (cur <= end) { const d = cur.toISOString().slice(0, 10); if (cur.getDay() !== 0) days.push(d); cur.setDate(cur.getDate() + 1) }
                          setDiasExecucao(days)
                        }} style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>Data Fim Serviço</label>
                        <input type="date" value={dataFimServico} onChange={(e) => {
                          setDataFimServico(e.target.value)
                          if (!e.target.value || !previsaoExecucao) return
                          const start = new Date(previsaoExecucao + 'T12:00:00')
                          const end = new Date(e.target.value + 'T12:00:00')
                          if (start > end) return
                          const days: string[] = []
                          const cur = new Date(start)
                          while (cur <= end) { const d = cur.toISOString().slice(0, 10); if (cur.getDay() !== 0) days.push(d); cur.setDate(cur.getDate() + 1) }
                          setDiasExecucao(days)
                        }} style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, width: '100%' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                      <div>
                        <label style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>Hora Início Serviço</label>
                        <input type="time" value={horaInicioServico} onChange={(e) => setHoraInicioServico(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, width: '100%' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>Previsão de Faturamento</label>
                        <input type="date" value={previsaoFaturamento} onChange={(e) => setPrevisaoFaturamento(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, width: '100%' }} />
                      </div>
                    </div>
                    {/* Alimentação do Técnico */}
                    <div style={{ marginTop: 10, padding: '10px 12px', background: alimentacaoTecnico ? '#FFFBEB' : '#F9FAFB', border: `1px solid ${alimentacaoTecnico ? '#FCD34D' : '#E5E7EB'}`, borderRadius: 8 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1E3A5F' }}>
                        <input type="checkbox" checked={alimentacaoTecnico} onChange={(e) => setAlimentacaoTecnico(e.target.checked)} style={{ accentColor: '#D97706', width: 16, height: 16 }} />
                        <i className="fas fa-utensils" style={{ color: '#D97706', fontSize: 12 }} />
                        Alimentação do técnico
                      </label>
                      {alimentacaoTecnico && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <label style={{ fontSize: 11, color: '#6B7280', margin: 0 }}>Valor (R$)</label>
                            <input type="number" min={0} step={0.01} value={alimentacaoValor || ''} onChange={(e) => setAlimentacaoValor(parseFloat(e.target.value) || 0)} placeholder="0,00" style={{ padding: '6px 8px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, width: '100%' }} />
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: alimentacaoNoPdf ? '#DC2626' : '#6B7280', marginTop: 16 }}>
                            <input type="checkbox" checked={alimentacaoNoPdf} onChange={(e) => setAlimentacaoNoPdf(e.target.checked)} style={{ accentColor: '#DC2626', width: 14, height: 14 }} />
                            Mostrar no PDF
                          </label>
                        </div>
                      )}
                      {alimentacaoTecnico && !alimentacaoNoPdf && (
                        <div style={{ marginTop: 6, fontSize: 10, color: '#9CA3AF', fontStyle: 'italic' }}>
                          <i className="fas fa-eye-slash" style={{ marginRight: 4 }} />
                          Valor oculto no PDF do cliente
                        </div>
                      )}
                    </div>

                    {diasExecucao.length > 0 && (() => {
                      return (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 11, color: '#6B7280', fontWeight: 600, marginBottom: 2 }}>Confirme os dias:</div>
                        {diasExecucao.map((entry) => {
                          const dia = entry.split(' ')[0]
                          const diaDate = /^\d{4}-\d{2}-\d{2}$/.test(dia) ? new Date(dia + 'T12:00:00') : null
                          const diaLabel = diaDate && !isNaN(diaDate.getTime()) ? diaDate.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) : dia
                          return (
                            <div key={dia} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#F1F5F9', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 13 }}>
                              <input type="checkbox" checked style={{ accentColor: '#1E3A5F', width: 16, height: 16, cursor: 'pointer' }} onChange={(e) => {
                                if (!e.target.checked) setDiasExecucao(prev => prev.filter(d => !d.startsWith(dia)))
                              }} />
                              <span style={{ fontWeight: 600, color: '#1E3A5F' }}>{diaLabel}</span>
                            </div>
                          )
                        })}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, padding: '4px 10px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#15803D' }}>
                            <i className="fas fa-calendar-check" style={{ fontSize: 11, marginRight: 4 }} />
                            {diasExecucao.length} dia{diasExecucao.length > 1 ? 's' : ''} selecionado{diasExecucao.length > 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>)
                    })()}
                    {/* Deslocamento total */}
                    {estimativa && diasExecucao.length > 0 && (
                      <div style={{ marginTop: 8, padding: '8px 12px', background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8 }}>
                        <div style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase' as const, fontWeight: 600, letterSpacing: '0.5px', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <i className="fas fa-route" /> Deslocamento total ({diasExecucao.length} dia{diasExecucao.length > 1 ? 's' : ''})
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#6B7280' }}>Ida/dia</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#1E3A5F' }}>{estimativa.ida.tempo_min} min</div>
                            <div style={{ fontSize: 10, color: '#9CA3AF' }}>{estimativa.ida.distancia_km} km</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#6B7280' }}>Volta/dia</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#1E3A5F' }}>{estimativa.volta.tempo_min} min</div>
                            <div style={{ fontSize: 10, color: '#9CA3AF' }}>{estimativa.volta.distancia_km} km</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#6B7280' }}>KM Total</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#1E3A5F' }}>{(estimativa.total.distancia_total_km * diasExecucao.length).toFixed(0)} km</div>
                            <div style={{ fontSize: 10, color: '#9CA3AF' }}>{estimativa.total.distancia_total_km} km/dia</div>
                          </div>
                          <div style={{ textAlign: 'center', background: '#1E3A5F', borderRadius: 6, padding: '6px 4px', color: '#fff' }}>
                            <div style={{ fontSize: 10, opacity: 0.8 }}>Tempo Fora</div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>{(estimativa.total.tempo_horas * diasExecucao.length).toFixed(1)}h</div>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>{estimativa.total.tempo_horas}h/dia</div>
                          </div>
                        </div>
                      </div>
                    )}
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
                          <label>Requisições Vinculadas ({requisicoes.length})</label>
                          <div className="os-req-list">
                            {requisicoes.map((r, i) => (
                              <div key={i} className="os-req-item" style={{ flexWrap: "wrap", gap: 6 }}>
                                <span style={S_REQ_BOLD}>#{r.id}</span>
                                <span className={`os-req-badge ${r.atualizada ? "ok" : ""}`}>{r.atualizada ? "OK" : "Pendente"}</span>
                                <span style={S_REQ_MATERIAL}>{r.material}</span>
                                {r.valor > 0 && <span style={{ fontSize: 12, fontWeight: 700, color: "#059669" }}>R$ {r.valor.toFixed(2)}</span>}
                                {r.solicitante && r.solicitante !== "N/A" && <span style={{ fontSize: 11, color: "#9CA3AF" }}>({r.solicitante})</span>}
                                {/* Desvincular */}
                                {desvinculandoReq === r.id ? (
                                  <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                                    <input
                                      type="text"
                                      placeholder="Justificativa obrigatória..."
                                      value={justificativaDesvinc}
                                      onChange={(e) => setJustificativaDesvinc(e.target.value)}
                                      style={{ padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "1px solid #E5E7EB", width: "100%" }}
                                    />
                                    <div style={{ display: "flex", gap: 6 }}>
                                      <button
                                        onClick={async () => {
                                          if (!justificativaDesvinc.trim()) { alert("Preencha a justificativa."); return; }
                                          await fetch("/api/pos/requisicoes/desvincular", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ reqId: r.id, justificativa: justificativaDesvinc.trim(), usuario: userName || "Admin" }),
                                          });
                                          setRequisicoes(prev => prev.filter(x => x.id !== r.id));
                                          setDesvinculandoReq(null);
                                          setJustificativaDesvinc("");
                                        }}
                                        style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 6, border: "none", background: "#DC2626", color: "#fff", cursor: "pointer" }}
                                      >
                                        Confirmar
                                      </button>
                                      <button
                                        onClick={() => { setDesvinculandoReq(null); setJustificativaDesvinc(""); }}
                                        style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#fff", color: "#6B7280", cursor: "pointer" }}
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setDesvinculandoReq(r.id)}
                                    style={{ fontSize: 10, color: "#DC2626", background: "none", border: "none", cursor: "pointer", fontWeight: 600, marginLeft: "auto" }}
                                  >
                                    Desvincular
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                          {totalRequisicoes > 0 && (
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#059669", marginTop: 8, textAlign: "right" }}>
                              Total Requisições: R$ {totalRequisicoes.toFixed(2)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Financeiro ── */}
                  <div className="os-card os-card-financial">
                    <div className="os-card-title"><i className="fas fa-calculator" /> Financeiro</div>
                    <div className="os-financial-grid">
                      <div>
                        <label>Qtd. Horas</label>
                        <input type="number" value={qtdHoras} onChange={(e) => handleQtdHorasChange(parseFloat(e.target.value || "0"))} style={S_MB0} />
                        <div className="os-field-hint">x R$ {VALOR_HORA.toFixed(2)} = R$ {subtotalHoras.toFixed(2)}</div>
                      </div>
                      <div>
                        <label>Qtd. KM</label>
                        <input type="number" value={qtdKm} onChange={(e) => setQtdKm(parseFloat(e.target.value || "0"))} style={S_MB0} />
                        <div className="os-field-hint">x R$ {VALOR_KM.toFixed(2)} = R$ {subtotalKm.toFixed(2)}</div>
                      </div>
                    </div>

                    {/* Estimativa de tempo (automática) */}
                    {loadingEstimativa && (
                      <div style={{ fontSize: 12, color: '#6B7280', padding: '8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="fas fa-spinner fa-spin" style={{ fontSize: 11 }} /> Calculando estimativa...
                      </div>
                    )}
                    {(estimativa || erroEstimativa || enderecoEstimativa) && !loadingEstimativa && (
                      <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 8, padding: 12, marginTop: 8 }}>
                        <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 6, textTransform: 'uppercase' as const, fontWeight: 600, letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="fas fa-route" style={{ marginRight: 2 }} /> Estimativa de Tempo
                          {estimativa?.fonte && (
                            <span style={{
                              fontSize: 9, padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                              background: estimativa.fonte === 'Omie' ? '#DBEAFE' : estimativa.fonte === 'Manual' ? '#FEF3C7' : '#E5E7EB',
                              color: estimativa.fonte === 'Omie' ? '#1E40AF' : estimativa.fonte === 'Manual' ? '#92400E' : '#374151',
                            }}>
                              {estimativa.fonte === 'Omie' ? 'ENDEREÇO OMIE' : estimativa.fonte === 'Manual' ? 'CLIENTE MANUAL' : 'ENDEREÇO DA OS'}
                            </span>
                          )}
                        </div>
                        {/* Dropdown de endereços disponíveis */}
                        {enderecosDisponiveis.length > 1 && (
                          <div style={{ marginBottom: 6 }}>
                            <select
                              value={enderecoEstimativa}
                              onChange={(e) => {
                                setEnderecoEstimativa(e.target.value);
                                // Recalcular automaticamente ao trocar
                                setLoadingEstimativa(true); setErroEstimativa("");
                                fetch("/api/pos/estimativa", {
                                  method: "POST", headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ cnpj: clienteInfo?.cpf || "", endereco: clienteInfo?.endereco || "", cidade: (clienteInfo as unknown as Record<string, unknown>)?.cidade || "", qtdHoras, enderecoManual: e.target.value }),
                                }).then(r => r.json()).then(data => {
                                  if (data.enderecosDisponiveis) setEnderecosDisponiveis(data.enderecosDisponiveis);
                                  if (data.erro) { setErroEstimativa(data.erro); setEstimativa(null); }
                                  else { setEstimativa(data); setEnderecoEstimativa(data.enderecoUsado || e.target.value); }
                                  setLoadingEstimativa(false);
                                }).catch(() => { setErroEstimativa("Erro de conexão"); setLoadingEstimativa(false); });
                              }}
                              style={{ width: '100%', fontSize: 11, padding: '5px 8px', border: '1px solid #BAE6FD', borderRadius: 6, background: '#fff', marginBottom: 0, cursor: 'pointer' }}
                            >
                              {enderecosDisponiveis.map((e, i) => (
                                <option key={i} value={e.endereco}>
                                  [{e.label}] {e.endereco}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                        {/* Endereço editável */}
                        <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                          <i className="fas fa-map-marker-alt" style={{ color: '#6B7280', fontSize: 11, flexShrink: 0 }} />
                          <input
                            type="text"
                            value={enderecoEstimativa}
                            onChange={(e) => setEnderecoEstimativa(e.target.value)}
                            placeholder="Endereço para cálculo..."
                            style={{ flex: 1, fontSize: 11, padding: '5px 8px', border: '1px solid #BAE6FD', borderRadius: 6, background: '#fff', marginBottom: 0 }}
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              if (!enderecoEstimativa) return;
                              setLoadingEstimativa(true); setErroEstimativa("");
                              try {
                                const res = await fetch("/api/pos/estimativa", {
                                  method: "POST", headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ cnpj: clienteInfo?.cpf || "", endereco: clienteInfo?.endereco || "", cidade: (clienteInfo as unknown as Record<string, unknown>)?.cidade || "", qtdHoras, enderecoManual: enderecoEstimativa }),
                                });
                                const data = await res.json();
                                if (data.enderecosDisponiveis) setEnderecosDisponiveis(data.enderecosDisponiveis);
                                if (!res.ok || data.erro) { setErroEstimativa(data.erro || "Erro"); setEstimativa(null); }
                                else { setEstimativa(data); setEnderecoEstimativa(data.enderecoUsado || enderecoEstimativa); }
                              } catch { setErroEstimativa("Erro de conexão"); }
                              setLoadingEstimativa(false);
                            }}
                            style={{ fontSize: 10, padding: '5px 10px', background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}
                          >
                            <i className="fas fa-sync-alt" style={{ marginRight: 3 }} />Recalcular
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (!enderecoEstimativa) return;
                              setClienteInfo(prev => prev ? { ...prev, endereco: enderecoEstimativa } : prev);
                            }}
                            style={{ fontSize: 10, padding: '5px 10px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}
                          >
                            <i className="fas fa-thumbtack" style={{ marginRight: 3 }} />Fixar
                          </button>
                        </div>
                        {erroEstimativa && <div style={{ fontSize: 11, color: '#EF4444', marginBottom: 8 }}>{erroEstimativa}</div>}
                        {estimativa && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#6B7280' }}>Ida</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E3A5F' }}>{estimativa.ida.tempo_min} min</div>
                            <div style={{ fontSize: 10, color: '#9CA3AF' }}>{estimativa.ida.distancia_km} km</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#6B7280' }}>Serviço</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#F59E0B' }}>{estimativa.servico.horas}h</div>
                            <div style={{ fontSize: 10, color: '#9CA3AF' }}>{estimativa.servico.tempo_min} min</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 10, color: '#6B7280' }}>Volta</div>
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#1E3A5F' }}>{estimativa.volta.tempo_min} min</div>
                            <div style={{ fontSize: 10, color: '#9CA3AF' }}>{estimativa.volta.distancia_km} km</div>
                          </div>
                          <div style={{ textAlign: 'center', background: '#1E3A5F', borderRadius: 6, padding: '6px 4px', color: '#fff' }}>
                            <div style={{ fontSize: 10, opacity: 0.8 }}>Total Fora</div>
                            <div style={{ fontSize: 15, fontWeight: 700 }}>{estimativa.total.tempo_horas}h</div>
                            <div style={{ fontSize: 10, opacity: 0.7 }}>{estimativa.total.distancia_total_km} km</div>
                          </div>
                        </div>
                        )}
                      </div>
                    )}

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
                        {totalRequisicoes > 0 && <span>Req: R$ {totalRequisicoes.toFixed(2)}</span>}
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
                  <button className="os-btn-save" onClick={salvar} disabled={saving || (mode === "edit" && loadingData)}>
                    {saving ? "Salvando..." : (mode === "edit" && loadingData) ? "Carregando..." : mode === "create" ? "Criar Ordem" : "Salvar Alterações"}
                  </button>
                </div>
              </>
            )}
          </div>

          {mode === "edit" && <LogPanel osId={osId} visible={showLogs} refreshKey={logRefreshKey} />}
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
