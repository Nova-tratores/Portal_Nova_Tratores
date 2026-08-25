import { NextRequest, NextResponse } from "next/server";
import { supabaseFetch, getValorInsensivel, formatarDataBR } from "@/lib/ppv/supabase";
import { TBL_PEDIDOS, TBL_ITENS, TBL_LOGS, TBL_OS } from "@/lib/ppv/constants";

// Sempre que houver OS vinculada com projeto, o PPV copia o projeto da OS.
async function projetoDaOS(osId: string): Promise<string> {
  if (!osId) return "";
  try {
    const os = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_OS}?Id_Ordem=eq.${encodeURIComponent(osId)}&select=Projeto&limit=1`
    );
    return os && os.length ? String(getValorInsensivel(os[0], "Projeto") || "") : "";
  } catch { return ""; }
}
import { buscarPPVPorId, atualizarValorTotal, registrarLog, vincularPPVnaOS, gerarProximoId, sincronizarStatusComOS } from "@/lib/ppv/queries";
import { criarPedidoSchema, editarPedidoSchema } from "@/lib/ppv/schemas";
import { logAndNotify } from "@/lib/server/audit-notify";
import { soltarUnidadesDoPPV } from "@/lib/pecas/ppv-vinculo";
import { exigirAcessoModulo } from "@/lib/ajustes/permissao-server";

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
      `${TBL_PEDIDOS}?select=id_pedido,cliente,tecnico,Tipo_Pedido,status,valor_total,desconto_percentual,data,observacao,email_usuario&order=data.desc`
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
      criadoPor: getValorInsensivel(r, "email_usuario") || "",
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

    // Projeto: o que o usuário informou manda; se vazio e tiver OS, copia da OS — a menos
    // que o usuário tenha desmarcado "usar o projeto da OS" (usarProjetoOS === false).
    const projetoInformado = (dadosPPV.projeto || "").trim();
    const projetoFinal = projetoInformado || (dadosPPV.usarProjetoOS === false ? "" : (await projetoDaOS(dadosPPV.osId))) || "";

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
      Projeto: projetoFinal,
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
    // Sem isto, um curl anônimo cancelava PPV e soltava as unidades rastreadas
    // (o hook de cancelamento mexe na máquina de estados do rastreio, cujo
    // contrato é escrita só autenticada). Módulo puro, granular ou admin.
    // As demais rotas legadas do ppv seguem sem auth — débito pré-existente.
    try {
      await exigirAcessoModulo(req, "ppv");
    } catch (e) {
      const st = (e as { http?: number })?.http || 401;
      return NextResponse.json({ error: e instanceof Error ? e.message : "não autenticado" }, { status: st });
    }
    const raw = await req.json();
    const parsed = editarPedidoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    const dados = parsed.data;

    // Blindagem: pedido JÁ FATURADO (faturado_omie_em setado) não pode voltar de
    // fase — força "Concluída" se tentarem gravar outra coisa (menos Cancelada).
    try {
      const atual = await supabaseFetch<Record<string, unknown>[]>(
        `${TBL_PEDIDOS}?id_pedido=eq.${encodeURIComponent(dados.id)}&select=faturado_omie_em&limit=1`,
      );
      if (atual?.[0]?.faturado_omie_em && !["Concluída", "Cancelada"].includes(dados.status)) {
        dados.status = "Concluída";
      }
    } catch { /* se falhar a checagem, segue com o status enviado */ }

    const payload: Record<string, unknown> = {
      status: dados.status,
      status_manual_override: true, // Protege contra auto-sync sobrescrever
    };
    // Só inclui campos que foram realmente enviados (evita sobrescrever com "")
    if (dados.observacao !== undefined) payload.observacao = dados.observacao;
    if (dados.tecnico) payload.tecnico = dados.tecnico;
    if (dados.cliente) payload.cliente = dados.cliente;
    // Documento é quem IDENTIFICA o cliente (o nome tem homônimos com CNPJs diferentes).
    // "" = limpar (volta pro comportamento antigo, por nome).
    if (dados.clienteDocumento !== undefined) payload.cliente_documento = dados.clienteDocumento || null;
    if (dados.motivoCancelamento) payload.motivo_cancelamento = dados.motivoCancelamento;
    if (dados.pedidoOmie) payload.pedido_omie = dados.pedidoOmie;
    if (dados.osId !== undefined) payload.Id_Os = dados.osId;
    // Projeto: o que veio do form manda; se vazio e tiver OS, copia da OS.
    if (dados.projeto !== undefined) {
      const projetoInformado = (dados.projeto || "").trim();
      payload.Projeto = projetoInformado || (dados.usarProjetoOS === false ? "" : (await projetoDaOS(dados.osId))) || "";
    }
    if (dados.tipoPedido) payload.Tipo_Pedido = dados.tipoPedido;
    if (dados.motivoSaida) payload.Motivo_Saida_Pedido = dados.motivoSaida;
    payload.substituto_tipo = dados.substitutoTipo || null;
    payload.substituto_id = dados.substitutoId || null;
    if (dados.desconto !== undefined) payload.desconto_percentual = dados.desconto;
    // Campos do espelho Omie (Informações Adicionais + distribuição por departamento)
    if (dados.categoriaPedido !== undefined) payload.categoria_pedido = dados.categoriaPedido || null;
    if (dados.contaCorrente !== undefined) payload.conta_corrente = dados.contaCorrente || null;
    if (dados.cenarioFiscal !== undefined) payload.cenario_fiscal = dados.cenarioFiscal || null;
    if (dados.previsaoFaturamento !== undefined) payload.previsao_faturamento = dados.previsaoFaturamento || null;
    if (dados.numParcelas !== undefined) payload.num_parcelas = dados.numParcelas || null;
    if (dados.numContrato !== undefined) payload.num_contrato = dados.numContrato || null;
    if (dados.contato !== undefined) payload.contato = dados.contato || null;
    if (dados.dadosNF !== undefined) payload.dados_nf = dados.dadosNF || null;
    if (dados.consumoFinal !== undefined) payload.consumo_final = dados.consumoFinal;
    if (dados.departamentos !== undefined) payload.departamentos = dados.departamentos;

    // Buscar estado atual para comparar mudanças
    const estadoAtual = await buscarPPVPorId(dados.id);
    const userName = dados.userName || "Sistema";

    await supabaseFetch(`${TBL_PEDIDOS}?id_pedido=eq.${dados.id}`, "PATCH", payload);
    if (dados.osId) await vincularPPVnaOS(dados.osId, dados.id);

    // PPV cancelado: solta as unidades rastreadas — reservas voltam ao
    // estoque; liberadas viram devolução pendente (conferência física)
    const virouCancelado = ["Cancelada", "Cancelado"].includes(String(dados.status || ""))
      && estadoAtual && !["Cancelada", "Cancelado"].includes(String(estadoAtual.status || ""));
    if (virouCancelado) {
      try { await soltarUnidadesDoPPV(dados.id, { id: null, nome: `${userName} (cancelamento do PPV)` }, "PPV cancelado"); } catch { /* best-effort */ }
    }

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
      // Homônimos: o nome pode ser IGUAL e o cliente ser outro (CNPJ diferente).
      // Por isso a troca de documento também vira log.
      if (dados.clienteDocumento && (estadoAtual.clienteDocumento || "") !== dados.clienteDocumento) {
        await registrarLog(dados.id, `Cliente (CNPJ/CPF) alterado: ${estadoAtual.clienteDocumento || "—"} → ${dados.clienteDocumento}`, userName);
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
      // ── Campos do espelho Omie (com nome legível resolvido das tabelas) ──
      const nomeDe = async (tabela: string, campoCod: string, codigo: string, campoNome: string): Promise<string> => {
        if (!codigo) return "—";
        try {
          const r = await supabaseFetch<Record<string, unknown>[]>(`${tabela}?${campoCod}=eq.${encodeURIComponent(codigo)}&select=${campoNome}&limit=1`);
          return String((r?.[0] as Record<string, unknown>)?.[campoNome] ?? codigo);
        } catch { return codigo; }
      };
      if (dados.categoriaPedido !== undefined && (estadoAtual.categoriaPedido || "") !== dados.categoriaPedido) {
        await registrarLog(dados.id, `Categoria: ${await nomeDe("categoria", "codigo", estadoAtual.categoriaPedido || "", "descricao")} → ${await nomeDe("categoria", "codigo", dados.categoriaPedido, "descricao")}`, userName); temMudanca = true;
      }
      if (dados.contaCorrente !== undefined && (estadoAtual.contaCorrente || "") !== dados.contaCorrente) {
        await registrarLog(dados.id, `Conta corrente: ${await nomeDe("conta_corrente", "codigo", estadoAtual.contaCorrente || "", "descricao")} → ${await nomeDe("conta_corrente", "codigo", dados.contaCorrente, "descricao")}`, userName); temMudanca = true;
      }
      if (dados.cenarioFiscal !== undefined && (estadoAtual.cenarioFiscal || "") !== dados.cenarioFiscal) {
        await registrarLog(dados.id, `Cenário fiscal: ${await nomeDe("cenario_fiscal", "codigo", estadoAtual.cenarioFiscal || "", "nome")} → ${await nomeDe("cenario_fiscal", "codigo", dados.cenarioFiscal, "nome")}`, userName); temMudanca = true;
      }
      if (dados.previsaoFaturamento !== undefined && String(estadoAtual.previsaoFaturamento || "").slice(0, 10) !== (dados.previsaoFaturamento || "").slice(0, 10)) {
        await registrarLog(dados.id, `Previsão de faturamento: ${String(estadoAtual.previsaoFaturamento || "—").slice(0, 10)} → ${dados.previsaoFaturamento || "—"}`, userName); temMudanca = true;
      }
      if (dados.numParcelas !== undefined && (estadoAtual.numParcelas || "") !== dados.numParcelas) {
        await registrarLog(dados.id, `Número de parcelas: ${estadoAtual.numParcelas || "—"} → ${dados.numParcelas}`, userName); temMudanca = true;
      }
      if (dados.contato !== undefined && (estadoAtual.contato || "") !== dados.contato) {
        await registrarLog(dados.id, `Contato: ${estadoAtual.contato || "—"} → ${dados.contato || "—"}`, userName); temMudanca = true;
      }
      if (dados.numContrato !== undefined && (estadoAtual.numContrato || "") !== dados.numContrato) {
        await registrarLog(dados.id, `Nº do contrato: ${estadoAtual.numContrato || "—"} → ${dados.numContrato || "—"}`, userName); temMudanca = true;
      }
      if (dados.dadosNF !== undefined && (estadoAtual.dadosNF || "") !== dados.dadosNF) {
        await registrarLog(dados.id, `Dados adicionais da NF alterados`, userName); temMudanca = true;
      }
      if (dados.consumoFinal !== undefined && !!estadoAtual.consumoFinal !== !!dados.consumoFinal) {
        await registrarLog(dados.id, `Nota p/ Consumo Final: ${dados.consumoFinal ? "Sim" : "Não"}`, userName); temMudanca = true;
      }
      if (dados.departamentos !== undefined) {
        const chave = (arr: { codigo: string; perc: number }[] | undefined) => JSON.stringify((arr || []).map((x) => [String(x.codigo), Number(x.perc)]).sort());
        if (chave(estadoAtual.departamentos) !== chave(dados.departamentos)) {
          const nomes = await Promise.all((dados.departamentos || []).map(async (x) => `${await nomeDe("departamento", "codigo", x.codigo, "descricao")} (${x.perc}%)`));
          await registrarLog(dados.id, `Departamentos: ${nomes.join(", ") || "nenhum"}`, userName); temMudanca = true;
        }
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
