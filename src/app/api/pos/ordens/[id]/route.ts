import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO, TBL_REQ_SOL, TBL_REQ_ATT, TBL_ITENS, VALOR_HORA, VALOR_KM } from "@/lib/pos/constants";
import { formatarDataBR, safeGet } from "@/lib/pos/utils";
import { sincronizarStatusPPV } from "@/lib/pos/sync-ppv";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOs } = await params;
  const { data: res } = await supabase.from(TBL_OS).select("*").eq("Id_Ordem", idOs).limit(1);
  if (!res || !res.length) return NextResponse.json(null);

  const row = res[0];
  const requisicoes: Array<{ id: string; atualizada: boolean; valor: number; linkNota: string; material: string; solicitante: string }> = [];
  const idReqStr = safeGet(row, "Id_Req") as string;
  if (idReqStr) {
    const cleanIds = idReqStr.split(",").map((s: string) => s.trim());
    const { data: sols } = await supabase.from(TBL_REQ_SOL).select("*").in("IdReq", cleanIds);
    const { data: atts } = await supabase.from(TBL_REQ_ATT).select("*").in("ReqREF", cleanIds);
    cleanIds.forEach((rid) => {
      const sol = (sols || []).find((s) => s.IdReq == rid);
      const att = (atts || []).find((a) => a.ReqREF == rid);
      requisicoes.push({
        id: rid, atualizada: !!att, valor: att ? parseFloat(att.ReqValor || 0) : 0,
        linkNota: "", material: sol ? sol.Material_Serv_Solicitado : "N/A",
        solicitante: sol ? sol.ReqEmail : "N/A",
      });
    });
  }

  return NextResponse.json({
    id: safeGet(row, "Id_Ordem"), nomeCliente: safeGet(row, "Os_Cliente"),
    cpfCliente: safeGet(row, "Cnpj_Cliente"), enderecoCliente: safeGet(row, "Endereco_Cliente"),
    tecnicoResponsavel: safeGet(row, "Os_Tecnico"), tecnico2: safeGet(row, "Os_Tecnico2"),
    tipoServico: safeGet(row, "Tipo_Servico"), revisao: safeGet(row, "Revisao"),
    data: formatarDataBR(safeGet(row, "Data") as string),
    servicoSolicitado: safeGet(row, "Serv_Solicitado"),
    qtdHoras: safeGet(row, "Qtd_HR"), qtdKm: safeGet(row, "Qtd_KM"),
    status: safeGet(row, "Status"), ppv: safeGet(row, "ID_PPV"),
    projeto: safeGet(row, "Projeto"), ordemOmie: safeGet(row, "Ordem_Omie"),
    motivoCancelamento: safeGet(row, "Motivo_Cancelamento"),
    relatorioTecnico: safeGet(row, "ID_Relatorio_Final"),
    infoRelatorio: safeGet(row, "ID_Relatorio_Final") ? { status: "OK", link: "" } : null,
    infoRequisicoes: requisicoes,
    descontoSalvo: safeGet(row, "Desconto"),
    descontoHora: safeGet(row, "Desconto_Hora"),
    descontoKm: safeGet(row, "Desconto_KM"),
    previsaoExecucao: safeGet(row, "Previsao_Execucao") || "",
    previsaoFaturamento: safeGet(row, "Previsao_Faturamento") || "",
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOs } = await params;
  const dados = await req.json();

  // Bloqueia mudança para Concluída se não foi enviada para Omie
  if (dados.status === "Concluída") {
    const { data: osCheck } = await supabase.from(TBL_OS).select("Ordem_Omie").eq("Id_Ordem", idOs).limit(1);
    if (!osCheck?.[0]?.Ordem_Omie) {
      return NextResponse.json({ success: false, erro: "A OS precisa ser enviada para o Omie antes de ser concluída." }, { status: 400 });
    }
  }

  // Log de mudanças
  const { data: resAtual } = await supabase.from(TBL_OS).select("*").eq("Id_Ordem", idOs);
  if (resAtual && resAtual.length > 0) {
    const atual = resAtual[0];
    const stAt = safeGet(atual, "Status") as string;
    const agora = new Date();
    const dataFmt = new Intl.DateTimeFormat("pt-BR").format(agora);
    const horaFmt = agora.toLocaleTimeString("pt-BR");
    const logBase = { Id_ppo: idOs, Data_Acao: dataFmt, Hora_Acao: horaFmt, UsuEmail: "admin.sistema@novatratores.com", Dias_Na_Fase: 0, Total_Dias_Aberto: 0 };

    if (stAt !== dados.status) {
      await supabase.from(TBL_LOGS_PPO).insert({ ...logBase, acao: `Mudança para ${dados.status}`, Status_Anterior: stAt, Status_Atual: dados.status });
    }
    const campos = [
      { d: "tecnicoResponsavel", db: "Os_Tecnico", lbl: "Técnico" },
      { d: "tecnico2", db: "Os_Tecnico2", lbl: "Técnico 2" },
      { d: "projeto", db: "Projeto", lbl: "Projeto" },
      { d: "servicoSolicitado", db: "Serv_Solicitado", lbl: "Descrição Serviço" },
    ];
    for (const c of campos) {
      const valDb = String(safeGet(atual, c.db) || "").trim();
      const valNovo = String(dados[c.d] || "").trim();
      if (valDb !== valNovo) {
        await supabase.from(TBL_LOGS_PPO).insert({ ...logBase, acao: `${c.lbl} alterado`, Status_Atual: dados.status });
      }
    }
  }

  // Calcular totais
  const listaIds = String(dados.ppv || "").split(",").map((s: string) => s.trim()).filter(Boolean);
  let vPecas = 0;
  if (listaIds.length) {
    const { data: items } = await supabase.from(TBL_ITENS).select("*").in("Id_PPV", listaIds);
    const resumo: Record<string, { qtde: number; totalFin: number }> = {};
    (items || []).forEach((item) => {
      const cod = item.CodProduto;
      const preco = parseFloat(item.Preco || 0);
      let qtd = Math.abs(parseFloat(item.Qtde || 0));
      if (String(item.TipoMovimento || "").toLowerCase().includes("devolu")) qtd = -qtd;
      if (!resumo[cod]) resumo[cod] = { qtde: 0, totalFin: 0 };
      resumo[cod].qtde += qtd;
      resumo[cod].totalFin += preco * qtd;
    });
    Object.values(resumo).forEach((p) => { if (p.qtde !== 0) vPecas += p.totalFin; });
  }

  let vReq = 0;
  for (const rid of listaIds) {
    const { data } = await supabase.from(TBL_REQ_ATT).select("ReqValor").eq("ReqREF", rid);
    if (data && data.length > 0) vReq += parseFloat(data[0].ReqValor || 0);
  }

  const vHoras = parseFloat(dados.qtdHoras || 0) * VALOR_HORA;
  const vKm = parseFloat(dados.qtdKm || 0) * VALOR_KM;
  const desc = parseFloat(dados.descontoValor || 0);
  const descHora = parseFloat(dados.descontoHora || 0);
  const descKm = parseFloat(dados.descontoKm || 0);
  const total = vHoras + vKm + vPecas + vReq - desc - descHora - descKm;

  const { error } = await supabase.from(TBL_OS).update({
    Os_Tecnico: dados.tecnicoResponsavel, Os_Tecnico2: dados.tecnico2,
    Tipo_Servico: dados.tipoServico, Revisao: dados.revisao,
    Serv_Solicitado: dados.servicoSolicitado, Serv_Realizado: null,
    Qtd_HR: parseFloat(dados.qtdHoras || 0), Qtd_KM: parseFloat(dados.qtdKm || 0),
    Valor_Total: total, Status: dados.status, ID_PPV: dados.ppv,
    ID_Relatorio_Final: dados.relatorioTecnico, Projeto: dados.projeto,
    Ordem_Omie: dados.ordemOmie, Motivo_Cancelamento: dados.motivoCancelamento,
    Desconto: desc,
    Desconto_Hora: descHora,
    Desconto_KM: descKm,
    Previsao_Execucao: dados.previsaoExecucao || null,
    Previsao_Faturamento: dados.previsaoFaturamento || null,
  }).eq("Id_Ordem", idOs);

  if (error) {
    console.error("Erro Supabase update:", error);
    return NextResponse.json({ success: false, erro: `Erro ao salvar: ${error.message}` }, { status: 500 });
  }

  // Sincroniza status do PPV vinculado
  await sincronizarStatusPPV(idOs, dados.status);

  return NextResponse.json({ success: true });
}
