import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";
import { TBL_OS, TBL_LOGS_PPO, TBL_REQ_SOL, TBL_REQ_ATT, TBL_ITENS, VALOR_HORA, VALOR_KM } from "@/lib/pos/constants";
import { formatarDataBR, safeGet } from "@/lib/pos/utils";
import { sincronizarStatusPPV } from "@/lib/pos/sync-ppv";
import { logAndNotify } from "@/lib/server/audit-notify";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOs } = await params;
  const { data: res } = await supabase.from(TBL_OS).select("*").eq("Id_Ordem", idOs).limit(1);
  if (!res || !res.length) return NextResponse.json(null);

  const row = res[0];
  // Buscar requisições vinculadas (legado via Id_Req + novo via Requisicao.ordem_servico)
  const requisicoes: Array<{ id: string; atualizada: boolean; valor: number; linkNota: string; material: string; solicitante: string }> = [];
  const idsJaAdicionados = new Set<string>();

  // 1. Legado: Id_Req (comma-separated, tabelas Supa-Solicitacao_Req / Supa-AtualizarReq)
  const idReqStr = safeGet(row, "Id_Req") as string;
  if (idReqStr) {
    const cleanIds = idReqStr.split(",").map((s: string) => s.trim()).filter(Boolean);
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
      idsJaAdicionados.add(rid);
    });
  }

  // 2. Novo: Requisicao.ordem_servico = idOs (tabela principal)
  const { data: reqsVinculadas } = await supabase
    .from("Requisicao")
    .select("id, titulo, tipo, solicitante, status, valor_despeza, valor_cobrado_cliente, recibo_fornecedor, fornecedor")
    .eq("ordem_servico", idOs);
  if (reqsVinculadas) {
    for (const r of reqsVinculadas) {
      const rid = String(r.id);
      if (idsJaAdicionados.has(rid)) continue;
      const valor = r.valor_cobrado_cliente ? parseFloat(r.valor_cobrado_cliente) : 0;
      requisicoes.push({
        id: rid,
        atualizada: r.status !== "pedido" && !!r.recibo_fornecedor,
        valor,
        linkNota: r.recibo_fornecedor || "",
        material: r.titulo || "N/A",
        solicitante: r.solicitante || "N/A",
      });
    }
  }

  // Buscar dados do técnico (fotos, assinaturas, etc)
  const { data: tecData } = await supabase
    .from("Ordem_Servico_Tecnicos")
    .select("TipoServico, Motivo, ServicoRealizado, Chassis, Horimetro, Garantia, TotalHora, TotalKm, NomResp, FotoHorimetro, FotoChassis, FotoFrente, FotoDireita, FotoEsquerda, FotoTraseira, FotoVolante, FotoFalha1, FotoFalha2, FotoFalha3, FotoFalha4, FotoPecaNova1, FotoPecaNova2, FotoPecaInstalada1, FotoPecaInstalada2, AssCliente, AssTecnico, PecasInfo, JustificativaPecaExtra, CartaCorrecao")
    .eq("Ordem_Servico", idOs)
    .maybeSingle();

  return NextResponse.json({
    id: safeGet(row, "Id_Ordem"), nomeCliente: safeGet(row, "Os_Cliente"),
    cpfCliente: safeGet(row, "Cnpj_Cliente"), enderecoCliente: safeGet(row, "Endereco_Cliente"), cidadeCliente: safeGet(row, "Cidade_Cliente"),
    tecnicoResponsavel: safeGet(row, "Os_Tecnico"), tecnico2: safeGet(row, "Os_Tecnico2"),
    tipoServico: safeGet(row, "Tipo_Servico"), revisao: safeGet(row, "Revisao"),
    data: formatarDataBR(safeGet(row, "Data") as string),
    servicoSolicitado: safeGet(row, "Serv_Solicitado"),
    qtdHoras: safeGet(row, "Qtd_HR"), qtdKm: safeGet(row, "Qtd_KM"),
    status: safeGet(row, "Status"), ppv: safeGet(row, "ID_PPV"),
    projeto: safeGet(row, "Projeto"), ordemOmie: safeGet(row, "Ordem_Omie"),
    motivoCancelamento: safeGet(row, "Motivo_Cancelamento"),
    substitutoTipo: safeGet(row, "Substituto_Tipo") || null,
    substitutoId: safeGet(row, "Substituto_Id") || null,
    relatorioTecnico: safeGet(row, "ID_Relatorio_Final"),
    infoRelatorio: safeGet(row, "ID_Relatorio_Final") ? { status: "OK", link: safeGet(row, "ID_Relatorio_Final") } : null,
    infoRequisicoes: requisicoes,
    descontoSalvo: safeGet(row, "Desconto"),
    descontoHora: safeGet(row, "Desconto_Hora"),
    descontoKm: safeGet(row, "Desconto_KM"),
    previsaoExecucao: safeGet(row, "Previsao_Execucao") || "",
    previsaoFaturamento: safeGet(row, "Previsao_Faturamento") || "",
    diasExecucao: (safeGet(row, "Dias_Execucao") as string) || "",
    dataFimServico: (safeGet(row, "Data_Fim_Servico") as string) || "",
    horaInicioServico: (safeGet(row, "Hora_Inicio_Servico") as string) || "",
    servicoNumero: safeGet(row, "Servico_Numero") || 0,
    servicoOficina: !!safeGet(row, "Servico_Oficina"),
    alimentacaoTecnico: !!safeGet(row, "Alimentacao_Tecnico"),
    alimentacaoValor: parseFloat(String(safeGet(row, "Alimentacao_Valor") || 0)),
    alimentacaoNoPdf: !!safeGet(row, "Alimentacao_No_PDF"),
    horaInicioExec: safeGet(row, "Hora_Inicio_Exec") || "",
    horaChegada: safeGet(row, "Hora_Chegada") || "",
    horaFimExec: safeGet(row, "Hora_Fim_Exec") || "",
    dadosTecnico: tecData ? {
      tipoServico: tecData.TipoServico,
      diagnostico: tecData.Motivo,
      servicoRealizado: tecData.ServicoRealizado,
      chassis: tecData.Chassis,
      horimetro: tecData.Horimetro,
      garantia: tecData.Garantia,
      totalHora: tecData.TotalHora,
      totalKm: tecData.TotalKm,
      nomResponsavel: tecData.NomResp,
      justificativaPecaExtra: tecData.JustificativaPecaExtra,
      cartaCorrecao: tecData.CartaCorrecao || null,
      fotos: {
        horimetro: tecData.FotoHorimetro || null,
        chassis: tecData.FotoChassis || null,
        frente: tecData.FotoFrente || null,
        direita: tecData.FotoDireita || null,
        esquerda: tecData.FotoEsquerda || null,
        traseira: tecData.FotoTraseira || null,
        volante: tecData.FotoVolante || null,
        falha1: tecData.FotoFalha1 || null,
        falha2: tecData.FotoFalha2 || null,
        falha3: tecData.FotoFalha3 || null,
        falha4: tecData.FotoFalha4 || null,
        pecaNova1: tecData.FotoPecaNova1 || null,
        pecaNova2: tecData.FotoPecaNova2 || null,
        pecaInstalada1: tecData.FotoPecaInstalada1 || null,
        pecaInstalada2: tecData.FotoPecaInstalada2 || null,
      },
      assinaturas: {
        cliente: tecData.AssCliente || null,
        tecnico: tecData.AssTecnico || null,
      },
      pecasExtras: (() => {
        if (!tecData.PecasInfo) return [];
        try {
          const parsed = JSON.parse(tecData.PecasInfo);
          return parsed.filter((p: any) => p.origem === 'manual');
        } catch { return []; }
      })(),
    } : null,
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
    const logBase = { Id_ppo: idOs, Data_Acao: dataFmt, Hora_Acao: horaFmt, UsuEmail: dados.userName || "Sistema", Dias_Na_Fase: 0, Total_Dias_Aberto: 0 };

    if (stAt !== dados.status) {
      await supabase.from(TBL_LOGS_PPO).insert({ ...logBase, acao: `Mudança para ${dados.status}`, Status_Anterior: stAt, Status_Atual: dados.status });
    }
    const campos = [
      { d: "tecnicoResponsavel", db: "Os_Tecnico", lbl: "Técnico" },
      { d: "tecnico2", db: "Os_Tecnico2", lbl: "Técnico 2" },
      { d: "nomeCliente", db: "Os_Cliente", lbl: "Cliente" },
      { d: "projeto", db: "Projeto", lbl: "Projeto" },
      { d: "servicoSolicitado", db: "Serv_Solicitado", lbl: "Descrição Serviço" },
      { d: "qtdHoras", db: "Qtd_HR", lbl: "Horas" },
      { d: "qtdKm", db: "Qtd_KM", lbl: "KM" },
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

  // Somar valor das requisições vinculadas (tabela Requisicao.ordem_servico)
  let vReq = 0;
  const { data: reqsOS } = await supabase
    .from("Requisicao")
    .select("valor_cobrado_cliente")
    .eq("ordem_servico", idOs)
    .not("status", "in", '("lixeira","cancelada")');
  if (reqsOS) {
    for (const r of reqsOS) {
      if (r.valor_cobrado_cliente) vReq += parseFloat(r.valor_cobrado_cliente);
    }
  }
  // Legado: Supa-AtualizarReq via Id_Req
  const idReqStrPatch = String((await supabase.from(TBL_OS).select("Id_Req").eq("Id_Ordem", idOs).limit(1)).data?.[0]?.Id_Req || "");
  if (idReqStrPatch) {
    const legacyIds = idReqStrPatch.split(",").map((s: string) => s.trim()).filter(Boolean);
    for (const rid of legacyIds) {
      const { data } = await supabase.from(TBL_REQ_ATT).select("ReqValor").eq("ReqREF", rid);
      if (data && data.length > 0) vReq += parseFloat(data[0].ReqValor || 0);
    }
  }

  const vHoras = parseFloat(dados.qtdHoras || 0) * VALOR_HORA;
  const vKm = parseFloat(dados.qtdKm || 0) * VALOR_KM;
  const desc = parseFloat(dados.descontoValor || 0);
  const descHora = parseFloat(dados.descontoHora || 0);
  const descKm = parseFloat(dados.descontoKm || 0);
  const total = vHoras + vKm + vPecas + vReq - desc - descHora - descKm;

  const baseUpdate: Record<string, unknown> = {
    Os_Cliente: dados.nomeCliente, Cnpj_Cliente: dados.cpfCliente, Endereco_Cliente: dados.enderecoCliente,
    Cidade_Cliente: dados.cidadeCliente || '',
    Os_Tecnico: dados.tecnicoResponsavel, Os_Tecnico2: dados.tecnico2,
    Tipo_Servico: dados.tipoServico, Revisao: dados.revisao,
    Serv_Solicitado: dados.servicoSolicitado, Serv_Realizado: null,
    Qtd_HR: parseFloat(dados.qtdHoras || 0), Qtd_KM: parseFloat(dados.qtdKm || 0),
    Valor_Total: total, Status: dados.status, ID_PPV: dados.ppv,
    ID_Relatorio_Final: dados.relatorioTecnico, Projeto: dados.projeto,
    Ordem_Omie: dados.ordemOmie, Motivo_Cancelamento: dados.motivoCancelamento,
    Substituto_Tipo: dados.substitutoTipo || null, Substituto_Id: dados.substitutoId || null,
    Desconto: desc,
    Desconto_Hora: descHora,
    Desconto_KM: descKm,
    Previsao_Execucao: dados.previsaoExecucao || null,
    Previsao_Faturamento: dados.previsaoFaturamento || null,
    Servico_Oficina: !!dados.servicoOficina,
    Hora_Inicio_Exec: dados.horaInicioExec || '',
    Hora_Chegada: dados.horaChegada || '',
    Hora_Fim_Exec: dados.horaFimExec || '',
    Dias_Execucao: dados.diasExecucao || '',
    Data_Fim_Servico: dados.dataFimServico || null,
    Hora_Inicio_Servico: dados.horaInicioServico || '',
    Servico_Numero: dados.servicoNumero || null,
    Alimentacao_Tecnico: !!dados.alimentacaoTecnico,
    Alimentacao_Valor: parseFloat(dados.alimentacaoValor || 0),
    Alimentacao_No_PDF: !!dados.alimentacaoNoPdf,
  };

  const { error } = await supabase.from(TBL_OS).update(baseUpdate).eq("Id_Ordem", idOs);

  if (error) {
    console.error("Erro Supabase update:", error);
    return NextResponse.json({ success: false, erro: `Erro ao salvar: ${error.message}` }, { status: 500 });
  }

  // Sincroniza status do PPV vinculado
  await sincronizarStatusPPV(idOs, dados.status);

  // Sincronizar agenda_tecnico com período de execução (início → faturamento)
  const tecNome = dados.tecnicoResponsavel || "";
  await supabase.from('agenda_tecnico').delete().eq('id_ordem', idOs);

  if (tecNome) {
    const entries: string[] = dados.diasExecucao
      ? (dados.diasExecucao as string).split(',').filter(Boolean)
      : dados.previsaoExecucao ? [dados.previsaoExecucao] : [];
    if (entries.length > 0) {
      await supabase.from('agenda_tecnico').insert(
        entries.map((entry: string) => {
          const [dia, horas] = entry.split(' ')
          const [hInicio, hFim] = (horas || '').split('-')
          return {
            tecnico_nome: tecNome,
            id_ordem: idOs,
            data_agendada: dia,
            turno: 'integral',
            cliente: dados.nomeCliente || null,
            endereco: dados.enderecoCliente || null,
            status: 'agendado',
            hora_inicio: hInicio || dados.horaInicioExec || '08:00',
            hora_fim: hFim || dados.horaFimExec || '',
          }
        })
      );
    }
  }

  // Atualizar endereço + recalcular rotas na agenda_visao quando endereço muda
  const enderecoNovo = dados.enderecoCliente || "";
  const cidadeNova = dados.cidadeCliente || "";
  if (enderecoNovo) {
    const { data: agendaRows } = await supabase
      .from("agenda_visao")
      .select("id, endereco, cidade, cliente")
      .eq("id_ordem", idOs);

    if (agendaRows && agendaRows.length > 0) {
      for (const row of agendaRows) {
        // Atualizar endereço e cidade + disparar recálculo
        await supabase.from("agenda_visao").update({
          endereco: enderecoNovo,
          cidade: cidadeNova,
          cliente: dados.nomeCliente || row.cliente,
          hora_inicio: dados.horaInicioExec || "",
          hora_fim: dados.horaFimExec || "",
          updated_at: new Date().toISOString(),
        }).eq("id", row.id);

        // Recalcular rota (geocode + distância) em background
        try {
          const { geocodificar, rotaDaOficina } = await import("@/lib/pos/ors");
          const coords = await geocodificar(enderecoNovo + ", Brasil");
          if (coords) {
            const rota = await rotaDaOficina(coords.lat, coords.lng);
            await supabase.from("agenda_visao").update({
              coordenadas: coords,
              tempo_ida_min: rota?.tempo_min || 0,
              distancia_ida_km: rota?.distancia_km || 0,
              tempo_volta_min: rota?.tempo_min || 0,
              distancia_volta_km: rota?.distancia_km || 0,
            }).eq("id", row.id);
          }
        } catch { /* geocode falhou, segue sem rota */ }
      }
    }
  }

  // Audit log + notificação para admins
  const userNameLog = dados.userName || "Sistema";
  await logAndNotify({
    userName: userNameLog, sistema: "pos", acao: "editar",
    entidade: "ordem_servico", entidadeId: idOs, entidadeLabel: `OS ${idOs} - ${dados.nomeCliente || ""}`,
    notifTitulo: `OS ${idOs} atualizada`,
    notifDescricao: `${userNameLog} editou a OS ${idOs}`,
    notifLink: `/pos?id=${idOs}`,
  });

  return NextResponse.json({ success: true });
}
