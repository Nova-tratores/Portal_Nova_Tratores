// POST /api/ppv/pedidos/faturar — fatura o Pedido de Venda no Omie (emite NF-e).
// EXIGE login + módulo PPV (ao contrário da rota /omie legada). Ato fiscal:
// a UI faz confirmação dupla; aqui garantimos permissão e anti-duplicidade.
import { NextRequest, NextResponse } from "next/server";
import { faturarPPVNoOmie } from "@/lib/ppv/omie";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";
import { logAndNotify } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const body = await req.json();
    const id = body?.id;
    const categoria = body?.categoria;
    const userName = body?.userName || auth.email || "Sistema";
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "ID do PPV obrigatório" }, { status: 400 });
    }

    const resultado = await faturarPPVNoOmie(id, { categoria });
    if (!resultado.sucesso) {
      // "pendente" (faturamento acionado, NF ainda não autorizada) NÃO é erro duro:
      // devolve 200 pra a UI mostrar "aguardando SEFAZ" em vez de erro vermelho.
      if (resultado.pendente) {
        return NextResponse.json({ success: false, pendente: true, error: resultado.erro, numeroPedido: resultado.numeroPedido, empresa: resultado.empresa });
      }
      return NextResponse.json({ error: resultado.erro, jaFaturado: resultado.jaFaturado }, { status: 400 });
    }

    await logAndNotify({
      userName, sistema: "ppv", acao: "faturar",
      entidade: "pedido", entidadeId: id, entidadeLabel: `PPV ${id}`,
      detalhes: { numeroPedido: resultado.numeroPedido, categoria, empresa: resultado.empresa, etapa: resultado.etapa },
      notifTitulo: `PPV ${id} faturada (NF-e)`,
      notifDescricao: `${userName} faturou a PPV ${id} no Omie (pedido nº ${resultado.numeroPedido}).`,
      notifLink: `/ppv?id=${id}`,
    });

    return NextResponse.json({
      success: true,
      aguardandoSefaz: resultado.aguardandoSefaz,
      numeroPedido: resultado.numeroPedido,
      nfNumero: resultado.nfNumero,
      etapa: resultado.etapa,
      empresa: resultado.empresa,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error("[API pedidos/faturar]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
