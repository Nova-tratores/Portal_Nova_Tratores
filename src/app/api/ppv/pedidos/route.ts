import { NextRequest, NextResponse } from "next/server";
import { supabaseFetch, getValorInsensivel, formatarDataBR } from "@/lib/ppv/supabase";
import { TBL_PEDIDOS, TBL_ITENS } from "@/lib/ppv/constants";
import { buscarPPVPorId, atualizarValorTotal, registrarLog, vincularPPVnaOS, gerarProximoId, sincronizarStatusComOS } from "@/lib/ppv/queries";
import { criarPedidoSchema, editarPedidoSchema } from "@/lib/ppv/schemas";

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

  const dados = await supabaseFetch<Record<string, unknown>[]>(
    `${TBL_PEDIDOS}?select=id_pedido,cliente,tecnico,Tipo_Pedido,status,valor_total,data,observacao&order=data.desc`
  );
  const lista = (dados || []).map((r) => ({
    id: getValorInsensivel(r, "id_pedido"),
    cliente: getValorInsensivel(r, "cliente"),
    tecnico: getValorInsensivel(r, "tecnico"),
    tipo: getValorInsensivel(r, "Tipo_Pedido"),
    status: getValorInsensivel(r, "status"),
    valor: getValorInsensivel(r, "valor_total"),
    data: getValorInsensivel(r, "data"),
    observacao: getValorInsensivel(r, "observacao"),
  }));

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
      email_usuario: "sistema@ppv.local",
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
    await registrarLog(finalId, dadosPPV.idExistente ? "Editou cabeçalho" : "Criou lançamento");

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

    await supabaseFetch(`${TBL_PEDIDOS}?id_pedido=eq.${dados.id}`, "PATCH", payload);
    if (dados.osId) await vincularPPVnaOS(dados.osId, dados.id);
    await registrarLog(dados.id, `Status: ${dados.status}`);

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
