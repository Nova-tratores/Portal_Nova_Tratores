import { NextRequest, NextResponse } from "next/server";
import { supabaseFetch, formatarDataBR } from "@/lib/ppv/supabase";
import { TBL_ITENS } from "@/lib/ppv/constants";
import { buscarPPVPorId, atualizarValorTotal, registrarLog, saldoItemPPV } from "@/lib/ppv/queries";
import { movimentacaoSchema, editarPrecoItemSchema } from "@/lib/ppv/schemas";
import { logAndNotify } from "@/lib/server/audit-notify";
import { autorDe } from "@/lib/ajustes/permissao-server";
import { protegerRotaOuInterna } from "@/lib/auth/chamada-interna";

// Itens do PPV são lançados pelo PPV, pelo drawer da OS (POS), pelo "Gerar OS" dos
// Orçamentos e pelo Catálogo (dentro do PPV); o Tratorilson e o catálogo chamam
// também pelo servidor (fetchInterno). Basta ter acesso a um desses módulos.
const ACESSO = [{ modulo: "ppv" }, { modulo: "pos" }, { modulo: "orcamentos" }];

// Autoria do login; na chamada de sistema vale o nome que o servidor repassou.
function autor(g: { user: Parameters<typeof autorDe>[0]; interno: boolean }, doCorpo: unknown): string {
  return g.interno ? String(doCorpo || "Sistema") : autorDe(g.user);
}

export async function POST(req: NextRequest) {
  const g = await protegerRotaOuInterna(req, ACESSO);
  if (g.resposta) return g.resposta;
  try {
    const raw = await req.json();

    // ── Modo LOTE (importar kit): grava todos os itens numa só chamada, marcados com o
    // mesmo Kit, com um log/notificação/recalculo só. Antes ia um a um (N chamadas).
    if (Array.isArray(raw?.itens)) {
      const id = String(raw.id || "");
      const tecnico = String(raw.tecnico || "");
      const userNameLog = autor(g, raw.userName);
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

    // devolução não pode deixar o item negativo
    if (dados.tipoMovimento === "Devolução") {
      const saldo = await saldoItemPPV(dados.id, dados.codigo);
      if (Number(dados.quantidade) > saldo) {
        return NextResponse.json({ error: saldo > 0 ? `Só dá pra devolver até ${saldo} un de ${dados.codigo} (é o que resta no pedido).` : `O item ${dados.codigo} já está todo devolvido neste pedido.` }, { status: 409 });
      }
    }

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
    const userNameLog = autor(g, dados.userName);
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
  const g = await protegerRotaOuInterna(req, ACESSO);
  if (g.resposta) return g.resposta;
  try {
    const { id, kit, userName } = await req.json();
    if (!id || !kit) return NextResponse.json({ error: "id e kit são obrigatórios" }, { status: 400 });

    const saidas = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_ITENS}?Id_PPV=eq.${encodeURIComponent(id)}&Kit=eq.${encodeURIComponent(kit)}&TipoMovimento=eq.Sa%C3%ADda&select=*`
    );
    if (!saidas || saidas.length === 0) return NextResponse.json({ error: "kit não encontrado" }, { status: 404 });

    const dataHora = formatarDataBR(new Date().toISOString(), true);
    // cada item volta no máximo o que ainda resta no pedido (pode já ter sido devolvido à mão)
    const resta: Record<string, number> = {};
    for (const cod of new Set(saidas.map((s) => String(s.CodProduto || "")))) resta[cod] = await saldoItemPPV(id, cod);
    const devolucoes = saidas.map((s) => {
      const cod = String(s.CodProduto || "");
      const q = Math.min(parseFloat(String(s.Qtde ?? 0).replace(",", ".")) || 0, Math.max(0, resta[cod] || 0));
      resta[cod] = (resta[cod] || 0) - q;
      return {
        Id: Math.floor(Math.random() * 9000000000) + 1000000000,
        Id_PPV: id, Data_Hora: dataHora, Tecnico: String(s.Tecnico || ""), TipoMovimento: "Devolução",
        CodProduto: cod, Descricao: String(s.Descricao || ""),
        Qtde: String(q), Preco: Number(s.Preco) || 0, Kit: String(kit),
      };
    }).filter((d) => Number(d.Qtde) > 0);
    if (devolucoes.length === 0) return NextResponse.json({ error: "Os itens deste kit já foram todos devolvidos." }, { status: 409 });
    try { await supabaseFetch(TBL_ITENS, "POST", devolucoes); }
    catch (e: any) {
      if (/kit/i.test(String(e?.message || ""))) await supabaseFetch(TBL_ITENS, "POST", devolucoes.map(({ Kit, ...r }: any) => r));
      else throw e;
    }

    const rotulo = String(kit).split("§")[0];
    await registrarLog(id, `Removeu o kit "${rotulo}" (${devolucoes.length} itens devolvidos)`, autor(g, userName));
    await atualizarValorTotal(id);
    return NextResponse.json(await buscarPPVPorId(id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro" }, { status: 500 });
  }
}

// Edita o preço de um item dentro de um PPV existente (atualiza todas as movimentações
// daquele CodProduto naquele Id_PPV — saídas e devoluções — e recalcula o total)
export async function PATCH(req: NextRequest) {
  const g = await protegerRotaOuInterna(req, ACESSO);
  if (g.resposta) return g.resposta;
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

    // O cadastro (Produtos_Completos) NÃO é tocado: o preço de venda da peça é de Peças,
    // na Omie, e chega pelo sync. Antes este PATCH gravava o preço do pedido no cadastro,
    // e um valor negociado (ou errado) virava o preço dos próximos pedidos.
    await atualizarValorTotal(id);
    await registrarLog(id, `Preço do item ${codigo} alterado para R$ ${preco.toFixed(2)}`, autor(g, userName));

    const detalhes = await buscarPPVPorId(id);
    return NextResponse.json(detalhes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
