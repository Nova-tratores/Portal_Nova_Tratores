import { NextRequest, NextResponse } from "next/server";
import { supabaseFetch, getValorInsensivel, formatarDataBR } from "@/lib/ppv/supabase";
import { TBL_PEDIDOS, TBL_ITENS, TBL_LOGS } from "@/lib/ppv/constants";
import { buscarPPVPorId, atualizarValorTotal, registrarLog, vincularPPVnaOS, gerarProximoId, sincronizarStatusComOS } from "@/lib/ppv/queries";
import { criarPedidoSchema, editarPedidoSchema } from "@/lib/ppv/schemas";
import { logAndNotify } from "@/lib/server/audit-notify";

// GET - Listar kanban OU buscar por ID
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const detalhes = await buscarPPVPorId(id);
    if (!detalhes) return NextResponse.json(null, { status: 404 });
    return NextResponse.json(detalhes);
  }

  // Sincroniza status com OS em background (não bloqueia resposta)
  sincronizarStatusComOS().catch(() => {});

  const [dados, logsData] = await Promise.all([
    supabaseFetch<Record<string, unknown>[]>(
      `${TBL_PEDIDOS}?select=id_pedido,cliente,tecnico,Tipo_Pedido,status,valor_total,desconto_percentual,data,observacao&order=data.desc`
    ),
    supabaseFetch<Record<string, unknown>[]>(
      `${TBL_LOGS}?select=id_ppv,acao,usuario_email,data_hora&order=id.desc`
    ),
  ]);

  // Mapa: id_ppv → último log (primeiro encontrado pois ordenado desc)
  const mapaUltimoLog: Record<string, { acao: string; usuario: string; data: string }> = {};
  (logsData || []).forEach((l) => {
    const idPpv = String(l.id_ppv || "");
    if (idPpv && !mapaUltimoLog[idPpv]) {
      mapaUltimoLog[idPpv] = {
        acao: String(l.acao || ""),
        usuario: String(l.usuario_email || ""),
        data: String(l.data_hora || ""),
      };
    }
  });

  const lista = (dados || []).map((r) => {
    const id = String(getValorInsensivel(r, "id_pedido") || "");
    const ultimoLog = mapaUltimoLog[id];
    return {
      id,
      cliente: getValorInsensivel(r, "cliente"),
      tecnico: getValorInsensivel(r, "tecnico"),
      tipo: getValorInsensivel(r, "Tipo_Pedido"),
      status: getValorInsensivel(r, "status"),
      valor: getValorInsensivel(r, "valor_total"),
      desconto: parseFloat(String(getValorInsensivel(r, "desconto_percentual") || 0)),
      data: getValorInsensivel(r, "data"),
      observacao: getValorInsensivel(r, "observacao"),
      ultimaAcao: ultimoLog?.acao || "",
      ultimoUsuario: ultimoLog?.usuario || "",
      ultimaData: ultimoLog?.data || "",
    };
  });

  return NextResponse.json(lista);
}

// POST - Criar novo pedido
export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = criarPedidoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    const dadosPPV = parsed.data;

    const tipo = dadosPPV.tipoPedido;
    const dataFormatada = formatarDataBR(new Date().toISOString(), true);
    const prefixo = tipo === "Remessa" ? "REM" : "PPV";
    const finalId = dadosPPV.idExistente || (await gerarProximoId(prefixo));

    const novoDoc: Record<string, unknown> = {
      id_pedido: finalId,
      Tipo_Pedido: tipo,
      cliente: dadosPPV.cliente,
      tecnico: dadosPPV.tecnico,
      status: "Aguardando",
      valor_total: dadosPPV.valorTotal,
      observacao: dadosPPV.observacao,
      Motivo_Saida_Pedido: dadosPPV.motivoSaida,
      email_usuario: dadosPPV.userName || "Sistema",
      Id_Os: dadosPPV.osId,
    };
    if (!dadosPPV.idExistente) novoDoc.data = dataFormatada;

    const metodo = dadosPPV.idExistente ? "PATCH" : "POST";
    const endpoint = dadosPPV.idExistente
      ? `${TBL_PEDIDOS}?id_pedido=eq.${finalId}`
      : TBL_PEDIDOS;

    if (dadosPPV.idExistente) delete novoDoc.status;
    await supabaseFetch(endpoint, metodo, dadosPPV.idExistente ? novoDoc : [novoDoc]);
    await vincularPPVnaOS(dadosPPV.osId, finalId);
    await registrarLog(finalId, dadosPPV.idExistente ? "Editou cabeçalho" : "Criou lançamento", dadosPPV.userName || "Sistema");

    if (dadosPPV.produtosSelecionados.length > 0) {
      const movimentacoes = dadosPPV.produtosSelecionados.map((p) => ({
        Id: Math.floor(Math.random() * 9000000000) + 1000000000,
        Id_PPV: finalId,
        Data_Hora: dataFormatada,
        Tecnico: dadosPPV.tecnico,
        TipoMovimento: "Saída",
        CodProduto: p.codigo,
        Descricao: p.descricao,
        Qtde: String(p.quantidade),
        Preco: p.preco,
      }));
      await supabaseFetch(TBL_ITENS, "POST", movimentacoes);
      await atualizarValorTotal(finalId);
    }

    const userNameLog = dadosPPV.userName || "Sistema";
    const acaoPPV = dadosPPV.idExistente ? "editar" : "criar";
    await logAndNotify({
      userName: userNameLog, sistema: "ppv", acao: acaoPPV,
      entidade: "pedido", entidadeId: finalId, entidadeLabel: `PPV ${finalId} - ${dadosPPV.cliente}`,
      notifTitulo: dadosPPV.idExistente ? `PPV ${finalId} editada` : `Nova PPV criada: ${finalId}`,
      notifDescricao: `${userNameLog} ${dadosPPV.idExistente ? "editou" : "criou"} PPV ${finalId} para ${dadosPPV.cliente}`,
      notifLink: `/ppv?id=${finalId}`,
    });

    const detalhesCompletos = await buscarPPVPorId(finalId);
    return NextResponse.json({ id: finalId, detalhes: detalhesCompletos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH - Editar pedido existente
export async function PATCH(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = editarPedidoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    const dados = parsed.data;

    const payload: Record<string, unknown> = {
      status: dados.status,
      status_manual_override: true, // Protege contra auto-sync sobrescrever
    };
    // Só inclui campos que foram realmente enviados (evita sobrescrever com "")
    if (dados.observacao !== undefined) payload.observacao = dados.observacao;
    if (dados.tecnico) payload.tecnico = dados.tecnico;
    if (dados.cliente) payload.cliente = dados.cliente;
    if (dados.motivoCancelamento) payload.motivo_cancelamento = dados.motivoCancelamento;
    if (dados.pedidoOmie) payload.pedido_omie = dados.pedidoOmie;
    if (dados.osId !== undefined) payload.Id_Os = dados.osId;
    if (dados.tipoPedido) payload.Tipo_Pedido = dados.tipoPedido;
    if (dados.motivoSaida) payload.Motivo_Saida_Pedido = dados.motivoSaida;
    payload.substituto_tipo = dados.substitutoTipo || null;
    payload.substituto_id = dados.substitutoId || null;
    if (dados.desconto !== undefined) payload.desconto_percentual = dados.desconto;

    // Buscar estado atual para comparar mudanças
    const estadoAtual = await buscarPPVPorId(dados.id);
    const userName = dados.userName || "Sistema";

    await supabaseFetch(`${TBL_PEDIDOS}?id_pedido=eq.${dados.id}`, "PATCH", payload);
    if (dados.osId) await vincularPPVnaOS(dados.osId, dados.id);

    // Registrar logs detalhados de cada mudança
    if (!estadoAtual) {
      await registrarLog(dados.id, `Dados atualizados`, userName);
    } else {
      let temMudanca = false;
      if (estadoAtual.status !== dados.status) {
        await registrarLog(dados.id, `Status: ${estadoAtual.status} → ${dados.status}`, userName);
        temMudanca = true;
      }
      if (dados.tecnico && estadoAtual.tecnico !== dados.tecnico) {
        await registrarLog(dados.id, `Técnico alterado: ${estadoAtual.tecnico || "—"} → ${dados.tecnico}`, userName);
        temMudanca = true;
      }
      if (dados.cliente && estadoAtual.cliente !== dados.cliente) {
        await registrarLog(dados.id, `Cliente alterado: ${estadoAtual.cliente || "—"} → ${dados.cliente}`, userName);
        temMudanca = true;
      }
      if (dados.tipoPedido && estadoAtual.tipoPedido !== dados.tipoPedido) {
        await registrarLog(dados.id, `Tipo alterado: ${estadoAtual.tipoPedido || "—"} → ${dados.tipoPedido}`, userName);
        temMudanca = true;
      }
      if (dados.motivoSaida && estadoAtual.motivoSaida !== dados.motivoSaida) {
        await registrarLog(dados.id, `Motivo de saída alterado: ${estadoAtual.motivoSaida || "—"} → ${dados.motivoSaida}`, userName);
        temMudanca = true;
      }
      if (dados.observacao !== undefined && estadoAtual.observacao !== dados.observacao) {
        await registrarLog(dados.id, `Observação alterada`, userName);
        temMudanca = true;
      }
      if (dados.substitutoId && !estadoAtual.substitutoId) {
        await registrarLog(dados.id, `Substituto definido: ${dados.substitutoTipo} ${dados.substitutoId}`, userName);
        temMudanca = true;
      }
      if (dados.desconto !== undefined && (estadoAtual.desconto || 0) !== dados.desconto) {
        await registrarLog(dados.id, `Desconto alterado: ${estadoAtual.desconto || 0}% → ${dados.desconto}%`, userName);
        temMudanca = true;
      }
      if (!temMudanca) {
        await registrarLog(dados.id, `Dados atualizados`, userName);
      }
    }

    await logAndNotify({
      userName, sistema: "ppv", acao: "editar",
      entidade: "pedido", entidadeId: dados.id, entidadeLabel: `PPV ${dados.id}`,
      notifTitulo: `PPV ${dados.id} atualizada`,
      notifDescricao: `${userName} editou PPV ${dados.id}`,
      notifLink: `/ppv?id=${dados.id}`,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
