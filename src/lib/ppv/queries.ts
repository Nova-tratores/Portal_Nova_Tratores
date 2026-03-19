// =============================================
// FUNÇÕES SERVER-SIDE COMPARTILHADAS
// Centraliza buscarPPVPorId, atualizarValorTotal,
// registrarLog, vincularPPVnaOS — sem duplicação.
// =============================================

import { supabaseFetch, getValorInsensivel, formatarDataBR } from "./supabase";
import { TBL_PEDIDOS, TBL_ITENS, TBL_LOGS, TBL_OS, TBL_CLIENTES, TBL_PRODUTOS } from "./constants";
import type { PPVDetalhes } from "./types";

// =============================================
// BUSCAR DETALHES COMPLETOS DE UM PPV
// =============================================
export async function buscarPPVPorId(id: string): Promise<PPVDetalhes | null> {
  const resHead = await supabaseFetch<Record<string, unknown>[]>(
    `${TBL_PEDIDOS}?id_pedido=eq.${id}`
  );
  if (!resHead || !resHead.length) return null;

  const d = resHead[0];
  const resItens = await supabaseFetch<Record<string, unknown>[]>(
    `${TBL_ITENS}?Id_PPV=eq.${id}`
  );

  const detalhes: PPVDetalhes = {
    id: String(getValorInsensivel(d, "id_pedido") || ""),
    cliente: String(getValorInsensivel(d, "cliente") || ""),
    tecnico: String(getValorInsensivel(d, "tecnico") || ""),
    status: String(getValorInsensivel(d, "status") || ""),
    data: String(getValorInsensivel(d, "data") || getValorInsensivel(d, "created_at") || ""),
    valor: parseFloat(String(getValorInsensivel(d, "valor_total") || 0)),
    observacao: String(getValorInsensivel(d, "observacao") || ""),
    motivoCancelamento: String(getValorInsensivel(d, "motivo_cancelamento") || ""),
    motivoSaida: String(getValorInsensivel(d, "Motivo_Saida_Pedido") || ""),
    pedidoOmie: String(getValorInsensivel(d, "pedido_omie") || ""),
    usuEmail: String(getValorInsensivel(d, "email_usuario") || ""),
    osId: String(getValorInsensivel(d, "Id_Os") || ""),
    tipoPedido: String(getValorInsensivel(d, "Tipo_Pedido") || "Pedido"),
    produtos: [],
    devolucoes: [],
  };

  if (resItens) {
    const itensMap: Record<string, { codigo: string; descricao: string; quantidade: number; preco: number }> = {};
    resItens.forEach((r) => {
      const tipo = String(getValorInsensivel(r, "TipoMovimento") || "").toLowerCase();
      const codigo = String(getValorInsensivel(r, "CodProduto") || "");
      const qtdVal = Math.abs(parseFloat(String(getValorInsensivel(r, "Qtde") || 0)));
      const precoVal = parseFloat(String(getValorInsensivel(r, "Preco") || 0));
      const desc = String(getValorInsensivel(r, "Descricao") || "");

      if (tipo.includes("saida") || tipo.includes("saída")) {
        if (itensMap[codigo]) itensMap[codigo].quantidade += qtdVal;
        else itensMap[codigo] = { codigo, descricao: desc, quantidade: qtdVal, preco: precoVal };
      } else if (tipo.includes("devolu")) {
        detalhes.devolucoes.push({ codigo, descricao: desc, quantidade: qtdVal, preco: precoVal });
      }
    });

    // Buscar empresa dos produtos (um produto pode existir em múltiplas empresas)
    const codigos = Object.keys(itensMap);
    const empresaMap: Record<string, string[]> = {};
    if (codigos.length > 0) {
      try {
        const filter = codigos.map((c) => `Codigo_Produto.eq.${encodeURIComponent(c)}`).join(",");
        const resProd = await supabaseFetch<Record<string, unknown>[]>(
          `${TBL_PRODUTOS}?or=(${filter})&select=Codigo_Produto,Empresa`
        );
        if (resProd) {
          resProd.forEach((p) => {
            const cod = String(p.Codigo_Produto || "").trim();
            const emp = String(p.Empresa || "").trim();
            if (cod && emp) {
              if (!empresaMap[cod]) empresaMap[cod] = [];
              if (!empresaMap[cod].includes(emp)) empresaMap[cod].push(emp);
            }
          });
        }
      } catch { /* empresa é informativo, não crítico */ }
    }

    // Cada produto recebe sua empresa real
    // Se existe em apenas 1 empresa → atribui diretamente
    // Se existe em múltiplas empresas → retorna todas (separadas por " / ")
    detalhes.produtos = Object.values(itensMap).map((p) => {
      const emps = empresaMap[p.codigo];
      let empresa: string | undefined;
      if (emps && emps.length === 1) {
        empresa = emps[0];
      } else if (emps && emps.length > 1) {
        empresa = emps.join(" / "); // ex: "Principal / Secundario"
      }
      return { ...p, empresa };
    });
  }

  return detalhes;
}

// =============================================
// ATUALIZAR VALOR TOTAL DO PEDIDO
// =============================================
export async function atualizarValorTotal(idPedido: string): Promise<void> {
  const detalhes = await buscarPPVPorId(idPedido);
  if (!detalhes) return;

  let totalReal = 0;
  detalhes.produtos.forEach((p) => {
    const qtdDev = detalhes.devolucoes
      .filter((x) => x.codigo === p.codigo)
      .reduce((acc, cur) => acc + cur.quantidade, 0);
    totalReal += (p.quantidade - qtdDev) * p.preco;
  });

  await supabaseFetch(
    `${TBL_PEDIDOS}?id_pedido=eq.${idPedido}`,
    "PATCH",
    { valor_total: totalReal }
  );
}

// =============================================
// REGISTRAR LOG DE AÇÃO
// =============================================
export async function registrarLog(
  idPPV: string,
  acao: string,
  email: string = "sistema@ppv.local"
): Promise<void> {
  const dataH = formatarDataBR(new Date().toISOString(), true);
  try {
    await supabaseFetch(TBL_LOGS, "POST", [
      { id_ppv: idPPV, data_hora: dataH, acao, usuario_email: email },
    ]);
  } catch (e) {
    console.error("Erro ao registrar log:", e);
  }
}

// =============================================
// VINCULAR PPV A UMA ORDEM DE SERVIÇO
// =============================================
export async function vincularPPVnaOS(idOrdem: string, idPPV: string): Promise<void> {
  if (!idPPV) return;
  try {
    // Remover vínculo de OS anteriores
    const osAnteriores = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_OS}?ID_PPV=ilike.*${idPPV}*&select=Id_Ordem,ID_PPV`
    );
    if (osAnteriores && osAnteriores.length > 0) {
      for (const os of osAnteriores) {
        if (idOrdem && String(os.Id_Ordem) === String(idOrdem)) continue;
        const novaLista = String(os.ID_PPV || "")
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== idPPV && s !== "")
          .join(", ");
        await supabaseFetch(
          `${TBL_OS}?Id_Ordem=eq.${os.Id_Ordem}`,
          "PATCH",
          { ID_PPV: novaLista || null }
        );
      }
    }
    // Adicionar vínculo na OS nova
    if (idOrdem && idOrdem !== "Nenhuma" && idOrdem !== "") {
      const res = await supabaseFetch<Record<string, unknown>[]>(
        `${TBL_OS}?Id_Ordem=eq.${idOrdem}&select=ID_PPV`
      );
      if (res && res.length > 0) {
        const v = String(res[0].ID_PPV || "");
        const listaIds = v.split(",").map((x) => x.trim()).filter((x) => x !== "");
        if (!listaIds.includes(idPPV)) {
          listaIds.push(idPPV);
          await supabaseFetch(
            `${TBL_OS}?Id_Ordem=eq.${idOrdem}`,
            "PATCH",
            { ID_PPV: listaIds.join(", ") }
          );
        }
      }
    }
  } catch (e) {
    console.error("Erro vínculo OS:", e);
  }
}

// =============================================
// GERAR PRÓXIMO ID SEQUENCIAL (PPV-0001, REM-0001)
// =============================================
export async function gerarProximoId(prefixo: string): Promise<string> {
  let ultimoNum = 0;
  try {
    const res = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_PEDIDOS}?select=id_pedido&order=id_pedido.desc&limit=50`
    );
    const idsValidos = res
      .map((r) => String(getValorInsensivel(r, "id_pedido") || ""))
      .filter((id) => id.startsWith(prefixo));
    if (idsValidos.length > 0) {
      const partes = idsValidos[0].split("-");
      if (partes.length === 2) ultimoNum = parseInt(partes[1], 10);
    }
  } catch (e) {
    console.error("Erro gerar ID:", e);
  }
  return `${prefixo}-${String(ultimoNum + 1).padStart(4, "0")}`;
}

// =============================================
// BUSCAR DADOS DO CLIENTE PELO NOME
// =============================================
export async function buscarDadosCliente(nomeCliente: string): Promise<{ documento: string; endereco: string; cidade: string }> {
  const resultado = { documento: "", endereco: "", cidade: "" };
  if (!nomeCliente) return resultado;

  const query = nomeCliente.trim().replace(/ /g, "%");

  try {
    // Primeiro tenta match exato por nome_fantasia
    let res = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_CLIENTES}?nome_fantasia=eq.${encodeURIComponent(nomeCliente.trim())}&select=*&limit=1`
    );
    // Se não encontrou, tenta por razao_social
    if (!res || res.length === 0) {
      res = await supabaseFetch<Record<string, unknown>[]>(
        `${TBL_CLIENTES}?razao_social=eq.${encodeURIComponent(nomeCliente.trim())}&select=*&limit=1`
      );
    }
    // Se ainda não encontrou, tenta busca parcial
    if (!res || res.length === 0) {
      res = await supabaseFetch<Record<string, unknown>[]>(
        `${TBL_CLIENTES}?or=(nome_fantasia.ilike.*${query}*,razao_social.ilike.*${query}*)&select=*&limit=1`
      );
    }
    if (res && res.length > 0) {
      const row = res[0];
      resultado.documento = String(row.cnpj_cpf || "").trim();
      const partes = [
        String(row.endereco || "").trim(),
        String(row.numero || "").trim(),
        String(row.bairro || "").trim(),
      ].filter(Boolean);
      resultado.endereco = partes.join(", ");
      resultado.cidade = [String(row.cidade || "").trim(), String(row.estado || "").trim()].filter(Boolean).join(" - ");
    }
  } catch (e) {
    console.error("Erro buscar dados cliente:", e);
  }

  return resultado;
}

// =============================================
// SINCRONIZAR STATUS DOS PPVs COM AS OS VINCULADAS
// =============================================

// Mapeamento: status da OS → status do PPV
function mapearStatusOS(statusOS: string): string | null {
  const s = (statusOS || "").trim().toLowerCase();

  // OS em execução → PPV "Em Andamento"
  if (s.startsWith("execu") && !s.startsWith("executada")) return "Em Andamento";
  // "Execução", "Execução Procurando peças", "Execução aguardando peças (em transporte)"

  // OS executada → PPV "Aguardando Para Faturar"
  if (s.startsWith("executada")) return "Aguardando Para Faturar";
  // "Executada", "Executada aguardando cliente", "Executada aguardando comercial"

  // OS em orçamento/aguardando → PPV fica "Aguardando"
  if (s.includes("orçamento") || s.includes("orcamento") || s.includes("aguardando ordem") || s.includes("aguardando outros")) return "Aguardando";

  return null; // sem mapeamento → não altera
}

export async function sincronizarStatusComOS(): Promise<void> {
  try {
    // Busca todos os PPVs que têm OS vinculada, NÃO estão em estado terminal e NÃO têm override manual
    const pedidos = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_PEDIDOS}?Id_Os=neq.&status=not.in.(Fechado,Cancelado)&status_manual_override=not.is.true&select=id_pedido,Id_Os,status`
    );

    if (!pedidos || pedidos.length === 0) return;

    // Coleta os IDs de OS únicos
    const osIds = [...new Set(
      pedidos
        .map((p) => String(getValorInsensivel(p, "Id_Os") || "").trim())
        .filter((id) => id && id !== "" && id !== "Nenhuma")
    )];

    if (osIds.length === 0) return;

    // Busca status de todas as OS vinculadas em uma chamada
    const osData = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_OS}?Id_Ordem=in.(${osIds.join(",")})&select=Id_Ordem,Status`
    );

    if (!osData || osData.length === 0) return;

    // Monta mapa: idOS → statusOS
    const osStatusMap = new Map<string, string>();
    for (const os of osData) {
      const idOrdem = String(os.Id_Ordem || "").trim();
      const status = String(os.Status || "").trim();
      if (idOrdem && status) osStatusMap.set(idOrdem, status);
    }

    // Para cada PPV, verifica se precisa atualizar
    for (const pedido of pedidos) {
      const idPedido = String(getValorInsensivel(pedido, "id_pedido") || "");
      const idOs = String(getValorInsensivel(pedido, "Id_Os") || "").trim();
      const statusAtual = String(getValorInsensivel(pedido, "status") || "");

      if (!idOs || !osStatusMap.has(idOs)) continue;

      const statusOS = osStatusMap.get(idOs)!;
      const novoStatus = mapearStatusOS(statusOS);

      if (novoStatus && novoStatus !== statusAtual) {
        await supabaseFetch(
          `${TBL_PEDIDOS}?id_pedido=eq.${idPedido}`,
          "PATCH",
          { status: novoStatus }
        );
        await registrarLog(idPedido, `Status auto-sync: ${statusAtual} → ${novoStatus} (OS ${idOs}: "${statusOS}")`);
      }
    }
  } catch (e) {
    console.error("[Sync OS→PPV] Erro:", e);
  }
}

// =============================================
// MONTAR DADOS PARA IMPRESSÃO / PDF
// =============================================
export function montarDadosParaImpressao(detalhes: PPVDetalhes) {
  const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  let totalDev = 0;
  let totalFinal = 0;

  const itensMap: Record<string, { codigo: string; descricao: string; saida: number; dev: number; preco: number }> = {};
  detalhes.produtos.forEach((p) => {
    itensMap[p.codigo] = { codigo: p.codigo, descricao: p.descricao, saida: p.quantidade, dev: 0, preco: p.preco };
  });
  detalhes.devolucoes.forEach((d) => {
    if (itensMap[d.codigo]) itensMap[d.codigo].dev += d.quantidade;
  });

  const itens = Object.values(itensMap).map((item) => {
    const ficou = item.saida - item.dev;
    const total = ficou * item.preco;
    totalDev += item.dev * item.preco;
    totalFinal += total;
    return {
      codigo: item.codigo,
      descricao: item.descricao,
      saida: item.saida,
      devStr: item.dev > 0 ? `(-${item.dev})` : "",
      ficou,
      unit: fmt(item.preco),
      total: fmt(total),
    };
  });

  return {
    id: detalhes.id,
    tipo: detalhes.tipoPedido,
    data: formatarDataBR(detalhes.data),
    cliente: detalhes.cliente,
    documentoCliente: "",
    enderecoCliente: "",
    cidadeCliente: "",
    tecnico: detalhes.tecnico,
    motivo: detalhes.motivoSaida,
    os: detalhes.osId || "-",
    pedidoOmie: detalhes.pedidoOmie || "-",
    obs: detalhes.observacao || "",
    itens,
    totalDev: fmt(totalDev),
    totalFinal: fmt(totalFinal),
  };
}
