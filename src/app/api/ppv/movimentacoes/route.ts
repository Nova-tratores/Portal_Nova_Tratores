import { NextRequest, NextResponse } from "next/server";
import { supabaseFetch, formatarDataBR } from "@/lib/ppv/supabase";
import { TBL_ITENS, TBL_PRODUTOS } from "@/lib/ppv/constants";
import { buscarPPVPorId, atualizarValorTotal, registrarLog } from "@/lib/ppv/queries";
import { movimentacaoSchema, editarPrecoItemSchema } from "@/lib/ppv/schemas";
import { logAndNotify } from "@/lib/server/audit-notify";

export async function POST(req: NextRequest) {
  try {
    const raw = await req.json();

    // ── Modo LOTE (importar kit): grava todos os itens numa só chamada, marcados com o
    // mesmo Kit, com um log/notificação/recalculo só. Antes ia um a um (N chamadas).
    if (Array.isArray(raw?.itens)) {
      const id = String(raw.id || "");
      const tecnico = String(raw.tecnico || "");
      const userNameLog = String(raw.userName || "Sistema");
      const rotulo = String(raw.kit || "Kit").trim();
      if (!id || raw.itens.length === 0) return NextResponse.json({ error: "id e itens são obrigatórios" }, { status: 400 });
      const kitTag = `${rotulo}§${Date.now().toString(36)}`; // distingue importações repetidas
      const dataHora = formatarDataBR(new Date().toISOString(), true);
      const linhas = raw.itens
        .filter((it: any) => it && it.codigo)
        .map((it: any) => ({
          Id: Math.floor(Math.random() * 9000000000) + 1000000000,
          Id_PPV: id, Data_Hora: dataHora, Tecnico: tecnico, TipoMovimento: "Saída",
          CodProduto: String(it.codigo), Descricao: String(it.descricao || ""),
          Qtde: String(it.quantidade ?? 1), Preco: Number(it.preco) || 0, Kit: kitTag,
        }));
      if (linhas.length === 0) return NextResponse.json({ error: "kit sem itens válidos" }, { status: 400 });

      // Se a coluna Kit ainda não existir, grava sem ela (o remover-kit só não agrupa).
      try { await supabaseFetch(TBL_ITENS, "POST", linhas); }
      catch (e: any) {
        if (/kit/i.test(String(e?.message || ""))) await supabaseFetch(TBL_ITENS, "POST", linhas.map(({ Kit, ...r }: any) => r));
        else throw e;
      }
      await registrarLog(id, `Importou kit "${rotulo}": ${linhas.length} itens`, userNameLog);
      await atualizarValorTotal(id);
      await logAndNotify({
        userName: userNameLog, sistema: "ppv", acao: "adicionar_item",
        entidade: "pedido", entidadeId: id, entidadeLabel: `PPV ${id}`,
        detalhes: { kit: rotulo, itens: linhas.length },
        notifTitulo: `PPV ${id}: kit importado`, notifDescricao: `${userNameLog} importou o kit "${rotulo}" (${linhas.length} itens)`,
        notifLink: `/ppv?id=${id}`,
      });
      return NextResponse.json(await buscarPPVPorId(id));
    }

    const parsed = movimentacaoSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    const dados = parsed.data;

    const mov = {
      Id: Math.floor(Math.random() * 9000000000) + 1000000000,
      Id_PPV: dados.id,
      Data_Hora: formatarDataBR(new Date().toISOString(), true),
      Tecnico: dados.tecnico,
      TipoMovimento: dados.tipoMovimento,
      CodProduto: dados.codigo,
      Descricao: dados.descricao,
      Qtde: String(dados.quantidade),
      Preco: dados.preco,
    };

    await supabaseFetch(TBL_ITENS, "POST", [mov]);

    const logMsg = dados.tipoMovimento === "Devolução"
      ? `Devolveu item: ${dados.quantidade} un de ${dados.codigo}`
      : `Adicionou item: ${dados.quantidade} un de ${dados.codigo}`;
    const userNameLog = dados.userName || "Sistema";
    await registrarLog(dados.id, logMsg, userNameLog);
    await atualizarValorTotal(dados.id);

    await logAndNotify({
      userName: userNameLog, sistema: "ppv", acao: dados.tipoMovimento === "Devolução" ? "devolver" : "adicionar_item",
      entidade: "pedido", entidadeId: dados.id, entidadeLabel: `PPV ${dados.id}`,
      detalhes: { codigo: dados.codigo, quantidade: dados.quantidade, tipo: dados.tipoMovimento },
      notifTitulo: `PPV ${dados.id}: ${dados.tipoMovimento}`,
      notifDescricao: `${userNameLog} ${dados.tipoMovimento === "Devolução" ? "devolveu" : "adicionou"} ${dados.quantidade}x ${dados.codigo}`,
      notifLink: `/ppv?id=${dados.id}`,
    });

    const detalhes = await buscarPPVPorId(dados.id);
    return NextResponse.json(detalhes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Remove um KIT inteiro do PPV: devolve (Devolução) todas as saídas marcadas com aquele
// Kit, de uma vez. (Remover item a item continua pelo fluxo de devolução normal.)
export async function DELETE(req: NextRequest) {
  try {
    const { id, kit, userName } = await req.json();
    if (!id || !kit) return NextResponse.json({ error: "id e kit são obrigatórios" }, { status: 400 });

    const saidas = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_ITENS}?Id_PPV=eq.${encodeURIComponent(id)}&Kit=eq.${encodeURIComponent(kit)}&TipoMovimento=eq.Sa%C3%ADda&select=*`
    );
    if (!saidas || saidas.length === 0) return NextResponse.json({ error: "kit não encontrado" }, { status: 404 });

    const dataHora = formatarDataBR(new Date().toISOString(), true);
    const devolucoes = saidas.map((s) => ({
      Id: Math.floor(Math.random() * 9000000000) + 1000000000,
      Id_PPV: id, Data_Hora: dataHora, Tecnico: String(s.Tecnico || ""), TipoMovimento: "Devolução",
      CodProduto: String(s.CodProduto || ""), Descricao: String(s.Descricao || ""),
      Qtde: String(s.Qtde || 0), Preco: Number(s.Preco) || 0, Kit: String(kit),
    }));
    try { await supabaseFetch(TBL_ITENS, "POST", devolucoes); }
    catch (e: any) {
      if (/kit/i.test(String(e?.message || ""))) await supabaseFetch(TBL_ITENS, "POST", devolucoes.map(({ Kit, ...r }: any) => r));
      else throw e;
    }

    const rotulo = String(kit).split("§")[0];
    await registrarLog(id, `Removeu o kit "${rotulo}" (${devolucoes.length} itens devolvidos)`, String(userName || "Sistema"));
    await atualizarValorTotal(id);
    return NextResponse.json(await buscarPPVPorId(id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// Edita o preço de um item dentro de um PPV existente (atualiza todas as movimentações
// daquele CodProduto naquele Id_PPV — saídas e devoluções — e recalcula o total)
export async function PATCH(req: NextRequest) {
  try {
    const raw = await req.json();
    const parsed = editarPrecoItemSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join(", ") }, { status: 400 });
    }
    const { id, codigo, preco, userName } = parsed.data;

    // 1. Atualiza o preço de todas as movimentações desse item neste PPV
    await supabaseFetch(
      `${TBL_ITENS}?Id_PPV=eq.${encodeURIComponent(id)}&CodProduto=eq.${encodeURIComponent(codigo)}`,
      "PATCH",
      { Preco: preco }
    );

    // 2. Atualiza também o cadastro (Produtos_Completos) — será sobrescrito no próximo sync com o Omie
    try {
      await supabaseFetch(
        `${TBL_PRODUTOS}?Codigo_Produto=eq.${encodeURIComponent(codigo)}`,
        "PATCH",
        { Preco_Venda: preco }
      );
    } catch (e) {
      console.error("Erro ao atualizar preço no cadastro:", e);
    }

    await atualizarValorTotal(id);
    await registrarLog(id, `Preço do item ${codigo} alterado para R$ ${preco.toFixed(2)} (cadastro atualizado)`, userName || "Sistema");

    const detalhes = await buscarPPVPorId(id);
    return NextResponse.json(detalhes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
