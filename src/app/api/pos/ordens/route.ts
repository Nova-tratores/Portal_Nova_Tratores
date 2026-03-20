import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO, TBL_METRICAS, VALOR_HORA, VALOR_KM, TBL_ITENS, TBL_REQ_ATT, TBL_PEDIDOS, FASES_CONTADOR_PARADO } from "@/lib/pos/constants";
import { formatarDataBR, safeGet } from "@/lib/pos/utils";
import { sincronizarStatusPPV } from "@/lib/pos/sync-ppv";
import type { KanbanCard } from "@/lib/pos/types";

/* ── Auto-move: verifica datas de previsão e move ordens automaticamente ── */
async function autoMoveByDate() {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const hojeISO = hoje.toISOString().split("T")[0]; // YYYY-MM-DD
  const ontemISO = new Date(hoje.getTime() - 86400000).toISOString().split("T")[0];

  // 1. Buscar ordens que precisam ser movidas para Execução
  const { data: paraExecucao } = await supabase
    .from(TBL_OS)
    .select("Id_Ordem, Status, Previsao_Execucao")
    .not("Previsao_Execucao", "is", null)
    .lte("Previsao_Execucao", hojeISO)
    .in("Status", ["Orçamento", "Orçamento enviado para o cliente e aguardando"]);

  for (const os of paraExecucao || []) {
    await supabase.from(TBL_OS).update({ Status: "Execução" }).eq("Id_Ordem", os.Id_Ordem);
    await registrarLog(os.Id_Ordem, "Auto-move: Previsão de execução atingida", "Execução", os.Status);
    await sincronizarStatusPPV(os.Id_Ordem, "Execução");
  }

  // 2. Execução há +1 dia → Aguardando ordem Técnico (vacilo)
  const { data: execAtrasadas } = await supabase
    .from(TBL_OS)
    .select("Id_Ordem, Status, Previsao_Execucao, Os_Tecnico")
    .not("Previsao_Execucao", "is", null)
    .lte("Previsao_Execucao", ontemISO)
    .in("Status", ["Execução"]);

  for (const os of execAtrasadas || []) {
    await supabase.from(TBL_OS).update({ Status: "Aguardando ordem Técnico" }).eq("Id_Ordem", os.Id_Ordem);
    await registrarLog(os.Id_Ordem, "Auto-move: +1 dia em Execução sem conclusão", "Aguardando ordem Técnico", os.Status);

    // Registra métrica de atraso
    await supabase.from(TBL_METRICAS).insert({
      id_ordem: os.Id_Ordem,
      tecnico: os.Os_Tecnico || "N/A",
      tipo: "atraso_execucao",
      data_inicio: new Date().toISOString(),
    });
  }

  // 3. Buscar ordens que precisam ser movidas para Executada aguardando cliente
  const { data: paraFaturamento } = await supabase
    .from(TBL_OS)
    .select("Id_Ordem, Status, Previsao_Faturamento")
    .not("Previsao_Faturamento", "is", null)
    .lte("Previsao_Faturamento", hojeISO)
    .in("Status", ["Executada aguardando comercial"]);

  for (const os of paraFaturamento || []) {
    await supabase.from(TBL_OS).update({ Status: "Executada aguardando cliente" }).eq("Id_Ordem", os.Id_Ordem);
    await registrarLog(os.Id_Ordem, "Auto-move: Previsão de faturamento atingida", "Executada aguardando cliente", os.Status);
    await sincronizarStatusPPV(os.Id_Ordem, "Executada aguardando cliente");
  }

  // 4. Atualiza dias das métricas abertas e fecha as que chegaram em fases de parada
  await atualizarMetricasAbertas();
}

/* ── Atualiza contadores de métricas abertas ── */
async function atualizarMetricasAbertas() {
  const { data: abertas } = await supabase
    .from(TBL_METRICAS)
    .select("id, id_ordem, data_inicio")
    .is("data_fim", null);

  if (!abertas || abertas.length === 0) return;

  const ordemIds = [...new Set(abertas.map((m) => m.id_ordem))];
  const { data: ordens } = await supabase
    .from(TBL_OS)
    .select("Id_Ordem, Status")
    .in("Id_Ordem", ordemIds);

  const statusMap: Record<string, string> = {};
  (ordens || []).forEach((o) => { statusMap[o.Id_Ordem] = o.Status; });

  const agora = new Date();
  for (const m of abertas) {
    const statusAtual = statusMap[m.id_ordem] || "";
    const dias = Math.floor((agora.getTime() - new Date(m.data_inicio).getTime()) / 86400000);

    if (FASES_CONTADOR_PARADO.has(statusAtual)) {
      // Fecha a métrica
      await supabase.from(TBL_METRICAS).update({ data_fim: agora.toISOString(), dias }).eq("id", m.id);
    } else {
      // Atualiza dias
      await supabase.from(TBL_METRICAS).update({ dias }).eq("id", m.id);
    }
  }
}

async function getOrdensParaKanban(): Promise<KanbanCard[]> {
  // Todas as queries em paralelo
  const [{ data: ordens }, { data: logs }, { data: metricasAbertas }] = await Promise.all([
    supabase.from(TBL_OS).select("*").order("Id_Ordem", { ascending: false }),
    supabase.from(TBL_LOGS_PPO).select("Id_ppo,Data_Acao").order("id", { ascending: false }),
    supabase.from(TBL_METRICAS).select("id_ordem, dias").is("data_fim", null),
  ]);

  const mapaAtraso: Record<string, number> = {};
  (metricasAbertas || []).forEach((m) => {
    mapaAtraso[m.id_ordem] = Math.max(mapaAtraso[m.id_ordem] || 0, m.dias || 0);
  });

  const mapaDatasFase: Record<string, string> = {};
  (logs || []).forEach((l) => {
    if (!mapaDatasFase[l.Id_ppo]) mapaDatasFase[l.Id_ppo] = l.Data_Acao;
  });

  return (ordens || []).map((row) => {
    const osId = safeGet(row, "Id_Ordem") as string;
    return {
      id: osId,
      cliente: (safeGet(row, "Os_Cliente") as string) || "",
      tecnico: (safeGet(row, "Os_Tecnico") as string) || "",
      data: formatarDataBR(safeGet(row, "Data") as string),
      dataFase: mapaDatasFase[osId] || formatarDataBR(safeGet(row, "Data") as string),
      valor: parseFloat(String(safeGet(row, "Valor_Total") || 0)).toFixed(2).replace(".", ","),
      status: (safeGet(row, "Status") as string) || "Orçamento",
      temPPV: !!safeGet(row, "ID_PPV"),
      ppvId: String(safeGet(row, "ID_PPV") || ""),
      temReq: !!safeGet(row, "Id_Req"),
      temRel: !!safeGet(row, "ID_Relatorio_Final"),
      servSolicitado: (safeGet(row, "Serv_Solicitado") as string) || "-",
      previsaoExecucao: (safeGet(row, "Previsao_Execucao") as string) || "",
      previsaoFaturamento: (safeGet(row, "Previsao_Faturamento") as string) || "",
      diasAtraso: mapaAtraso[osId] || 0,
    };
  });
}

// Cache do auto-move — roda no máximo uma vez a cada 5 minutos
let lastAutoMove = 0;
const AUTO_MOVE_INTERVAL = 5 * 60 * 1000;

export async function GET() {
  const agora = Date.now();
  // Auto-move roda em background, não bloqueia a resposta
  if (agora - lastAutoMove > AUTO_MOVE_INTERVAL) {
    lastAutoMove = agora;
    autoMoveByDate().catch((e) => console.error("Erro auto-move:", e));
  }
  const ordens = await getOrdensParaKanban();
  return NextResponse.json(ordens);
}

async function buscarProdutosPorPPV(idPPVInput: string) {
  const listaIds = String(idPPVInput || "").split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (!listaIds.length) return [];
  const { data: items } = await supabase.from(TBL_ITENS).select("*").in("Id_PPV", listaIds);
  const resumo: Record<string, { descricao: string; qtde: number; totalFinanceiro: number }> = {};
  (items || []).forEach((item) => {
    const cod = safeGet(item, "CodProduto") as string;
    const desc = safeGet(item, "Descricao") as string;
    const tipo = String(safeGet(item, "TipoMovimento") || "").toLowerCase();
    const preco = parseFloat(String(safeGet(item, "Preco") || 0));
    let qtd = Math.abs(parseFloat(String(safeGet(item, "Qtde") || 0)));
    if (tipo.includes("devolu")) qtd = -qtd;
    if (!resumo[cod]) resumo[cod] = { descricao: desc, qtde: 0, totalFinanceiro: 0 };
    resumo[cod].qtde += qtd;
    resumo[cod].totalFinanceiro += preco * qtd;
  });
  return Object.values(resumo)
    .map((p) => ({ descricao: p.descricao, qtde: p.qtde, valor: p.qtde !== 0 ? p.totalFinanceiro / p.qtde : 0 }))
    .filter((p) => p.qtde !== 0);
}

async function calcularTotais(dados: { qtdHoras: number; qtdKm: number; ppv: string; descontoValor: number }) {
  const produtos = await buscarProdutosPorPPV(dados.ppv);
  let vPecas = 0;
  produtos.forEach((p) => { vPecas += p.valor * p.qtde; });
  const vHoras = (dados.qtdHoras || 0) * VALOR_HORA;
  const vKm = (dados.qtdKm || 0) * VALOR_KM;
  let vReq = 0;
  if (dados.ppv) {
    const ids = String(dados.ppv).split(",").map((s) => s.trim()).filter(Boolean);
    for (const id of ids) {
      const { data } = await supabase.from(TBL_REQ_ATT).select("ReqValor").eq("ReqREF", id);
      if (data && data.length > 0) vReq += parseFloat(String(data[0].ReqValor || 0));
    }
  }
  const subtotal = vHoras + vKm + vPecas + vReq;
  const desc = dados.descontoValor || 0;
  return { total: subtotal - desc, subtotal, vHoras, vKm, vPecas, vReq, vHorasRaw: vHoras, vKmRaw: vKm, vPecasRaw: vPecas };
}

async function registrarLog(osId: string, acao: string, statusPara: string | null, statusDe: string | null = null) {
  const agora = new Date();
  const dataFmt = new Intl.DateTimeFormat("pt-BR").format(agora);
  const horaFmt = agora.toLocaleTimeString("pt-BR");

  const { data: resOs } = await supabase.from(TBL_OS).select("Data").eq("Id_Ordem", osId);
  let totalDiasAberto = 0;
  if (resOs && resOs.length > 0 && resOs[0].Data) {
    const dataCriacao = new Date(resOs[0].Data.split("T")[0].replace(/-/g, "/"));
    totalDiasAberto = Math.floor((agora.getTime() - dataCriacao.getTime()) / 86400000);
  }

  const { data: resUltimo } = await supabase.from(TBL_LOGS_PPO).select("Data_Acao").eq("Id_ppo", osId).order("id", { ascending: false }).limit(1);
  let diasNaFase = 0;
  if (resUltimo && resUltimo.length > 0) {
    const p = resUltimo[0].Data_Acao.split("/");
    const dtFase = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
    diasNaFase = Math.floor((agora.getTime() - dtFase.getTime()) / 86400000);
  }

  await supabase.from(TBL_LOGS_PPO).insert({
    Id_ppo: osId, Data_Acao: dataFmt, Hora_Acao: horaFmt,
    UsuEmail: "admin.sistema@novatratores.com", acao,
    Status_Anterior: statusDe, Status_Atual: statusPara,
    Dias_Na_Fase: Math.max(0, diasNaFase), Total_Dias_Aberto: Math.max(0, totalDiasAberto),
  });
}

async function gerarPPVId(): Promise<string> {
  const { data } = await supabase.from(TBL_PEDIDOS).select("id_pedido").order("id_pedido", { ascending: false }).limit(50);
  let maxNum = 0;
  (data || []).forEach((row) => {
    const match = String(row.id_pedido || "").match(/^PPV-(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });
  return `PPV-${String(maxNum + 1).padStart(4, "0")}`;
}

export async function POST(req: NextRequest) {
  const dados = await req.json();

  const { data: resId } = await supabase.from(TBL_OS).select("Id_Ordem").order("Id_Ordem", { ascending: false }).limit(1);
  let ultimoNum = 0;
  if (resId && resId.length > 0) ultimoNum = parseInt(resId[0].Id_Ordem.split("-")[1], 10);
  const newId = `OS-${String(ultimoNum + 1).padStart(4, "0")}`;

  // Auto-gerar PPV se solicitado (revisão)
  let ppvFinal = dados.ppv || "";
  let ppvGerado = "";
  if (dados.gerarPPV) {
    ppvGerado = await gerarPPVId();
    ppvFinal = ppvFinal ? `${ppvFinal},${ppvGerado}` : ppvGerado;

    // Criar registro na tabela pedidos para o PPV existir de fato
    const dataHoje = new Date();
    const diaF = String(dataHoje.getDate()).padStart(2, "0");
    const mesF = String(dataHoje.getMonth() + 1).padStart(2, "0");
    const anoF = dataHoje.getFullYear();
    const horaF = String(dataHoje.getHours()).padStart(2, "0");
    const minF = String(dataHoje.getMinutes()).padStart(2, "0");
    const dataFormatada = `${diaF}/${mesF}/${anoF} ${horaF}:${minF}`;

    await supabase.from(TBL_PEDIDOS).insert({
      id_pedido: ppvGerado,
      Tipo_Pedido: "Pedido",
      cliente: dados.nomeCliente || "",
      tecnico: dados.tecnicoResponsavel || "",
      status: "Aguardando",
      valor_total: 0,
      observacao: `Gerado automaticamente pela OS ${newId} (${dados.revisao || "Revisão"})`,
      Motivo_Saida_Pedido: "Saida Tecnico (Com OS)",
      email_usuario: "sistema@ppv.local",
      Id_Os: newId,
      data: dataFormatada,
    });
  }

  const c = await calcularTotais({ qtdHoras: parseFloat(dados.qtdHoras || 0), qtdKm: parseFloat(dados.qtdKm || 0), ppv: ppvFinal, descontoValor: parseFloat(dados.descontoValor || 0) });

  const { error } = await supabase.from(TBL_OS).insert({
    Id_Ordem: newId, Status: "Orçamento", Data: new Date().toISOString().split("T")[0],
    Os_Cliente: dados.nomeCliente, Cnpj_Cliente: dados.cpfCliente, Endereco_Cliente: dados.enderecoCliente,
    Os_Tecnico: dados.tecnicoResponsavel, Os_Tecnico2: dados.tecnico2,
    Tipo_Servico: dados.tipoServico, Revisao: dados.revisao, Projeto: dados.projeto,
    Serv_Solicitado: dados.servicoSolicitado, Qtd_HR: parseFloat(dados.qtdHoras || 0),
    Valor_HR: VALOR_HORA, Qtd_KM: parseFloat(dados.qtdKm || 0), Valor_KM: VALOR_KM,
    Valor_Total: c.total, ID_PPV: ppvFinal, Desconto: parseFloat(dados.descontoValor || 0),
    Desconto_Hora: parseFloat(dados.descontoHora || 0),
    Desconto_KM: parseFloat(dados.descontoKm || 0),
    Previsao_Execucao: dados.previsaoExecucao || null,
    Previsao_Faturamento: dados.previsaoFaturamento || null,
  });

  if (error) {
    console.error("Erro Supabase insert:", error);
    return NextResponse.json({ success: false, erro: `Erro ao criar OS: ${error.message}` }, { status: 500 });
  }

  await registrarLog(newId, "Ordem Criada", "Orçamento", null);
  if (ppvGerado) {
    await registrarLog(newId, `PPV ${ppvGerado} gerado automaticamente`, "Orçamento", null);
  }

  const ordens = await getOrdensParaKanban();
  return NextResponse.json({ success: true, ordensAtualizadas: ordens, novaOsId: newId, ppvGerado });
}
