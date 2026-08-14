// Editor fiscal por item do Pedido de Venda (tela "Item de Orçamento").
//   GET   ?id=<idPPV>                 -> lê os itens + bloco fiscal (ConsultarPedido)
//   PATCH { id, codigoItemIntegracao, patch } -> altera o fiscal de 1 item (AlterarPedidoVenda)
// Exige login + módulo PPV. A escrita é ato fiscal (a UI faz confirmação dupla);
// só funciona antes de faturar (o lib bloqueia se etapa >= 50).
import { NextRequest, NextResponse } from "next/server";
import { consultarItensFiscaisPPV, alterarItemFiscalPPV, type PatchFiscalItem } from "@/lib/ppv/omie";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";
import { registrarAuditLog } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID do PPV obrigatório" }, { status: 400 });

  try {
    const res = await consultarItensFiscaisPPV(id);
    if (!res.ok) return NextResponse.json({ error: res.erro }, { status: 400 });
    return NextResponse.json(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error(`[API item-fiscal GET] ${id}: ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const body = await req.json();
    const id: string = body?.id;
    const codigoItemIntegracao: string = body?.codigoItemIntegracao;
    const patch: PatchFiscalItem = body?.patch || {};
    const userName: string = body?.userName || auth.email || "Sistema";
    if (!id || !codigoItemIntegracao) {
      return NextResponse.json({ error: "id e codigoItemIntegracao são obrigatórios" }, { status: 400 });
    }

    const res = await alterarItemFiscalPPV(id, codigoItemIntegracao, patch);
    if (!res.ok) return NextResponse.json({ error: res.erro }, { status: 400 });

    await registrarAuditLog({
      userName, sistema: "ppv", acao: "editar",
      entidade: "item-fiscal", entidadeId: id, entidadeLabel: `PPV ${id} / item ${codigoItemIntegracao}`,
      detalhes: { codigoItemIntegracao, patch, empresa: res.empresa },
    });

    return NextResponse.json({ success: true, empresa: res.empresa });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error(`[API item-fiscal PATCH] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
